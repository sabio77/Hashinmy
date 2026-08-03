import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';

const transportUrl = new URL('../P2P_sin_RED_LOCALx/P2P_sin_transport.js', import.meta.url);
const config = await readFile(new URL('../src/js/config.js', import.meta.url), 'utf8');
const client = await readFile(new URL('../src/js/p2p-client.js', import.meta.url), 'utf8');

assert.match(config, /sinBACKEND:\s*window\.APP_RUNTIME_CONFIG\?\.sinBACKEND === true/, 'La semilla debe exponer el bool sinBACKEND con un valor seguro por defecto.');
assert.match(client, /import\('\.\.\/\.\.\/P2P_sin_RED_LOCALx\/P2P_sin_transport\.js'\)/, 'El bloque opcional debe cargarse dinámicamente.');
assert.match(client, /optionalBlockMissing/, 'La ausencia física de P2P_sin_ debe quedar controlada.');

try {
  await access(transportUrl);
} catch {
  console.log('OK: P2P_sin_RED_LOCALx está ausente de forma opcional; la validación y el flujo con memoriaBACKEND continúan disponibles.');
  process.exit(0);
}

const {
  P2PSinBackendTransport,
  decodeP2PSinSignal,
  encodeP2PSinSignal,
  validateP2PSinScope,
  validateP2PSinSignalFreshness
} = await import(transportUrl.href);

const signal = {
  version: 1,
  type: 'offer',
  sessionId: 'lan_test',
  pairNonce: 'nonce_test',
  origin: 'https://hashinmy.com',
  applicationId: 'contabilidad',
  identity: { userId: 'user_a', deviceId: 'dev_a' },
  description: { type: 'offer', sdp: 'v=0\r\n' },
  createdAt: new Date('2026-08-01T20:00:00.000Z').toISOString()
};
const encoded = encodeP2PSinSignal(signal);
assert.ok(encoded.startsWith('P2PSIN1.'), 'El código debe ser identificable sin depender de una URL o servidor.');
assert.deepEqual(decodeP2PSinSignal(encoded), signal, 'El código local debe conservar oferta, alcance e identidad.');
assert.equal(validateP2PSinScope(signal, { origin: signal.origin, applicationId: signal.applicationId }), true);
assert.equal(validateP2PSinSignalFreshness(signal, { nowMs: Date.parse('2026-08-01T20:05:00.000Z') }), true);
assert.throws(
  () => validateP2PSinSignalFreshness(signal, { nowMs: Date.parse('2026-08-01T20:30:00.000Z') }),
  (error) => error?.code === 'P2P_SIN_SIGNAL_EXPIRED',
  'Una oferta antigua no debe poder reutilizarse indefinidamente.'
);
assert.throws(
  () => validateP2PSinScope(signal, { origin: signal.origin, applicationId: 'inventario' }),
  (error) => error?.code === 'P2P_SIN_SCOPE_MISMATCH',
  'Una app hermana del mismo dominio no puede aceptar el emparejamiento.'
);

const unsupported = new P2PSinBackendTransport({
  origin: signal.origin,
  applicationId: signal.applicationId,
  RTCPeerConnectionRef: null
});
unsupported.start({ userId: 'user_a', deviceId: 'dev_a' });
assert.equal(unsupported.status().supported, false, 'La ausencia de WebRTC debe degradarse sin afectar el backend.');
await assert.rejects(() => unsupported.createOffer(), /WebRTC/);
await unsupported.stop();

function DummyPeerConnection() {}
const targeted = new P2PSinBackendTransport({
  origin: signal.origin,
  applicationId: signal.applicationId,
  RTCPeerConnectionRef: DummyPeerConnection
});
targeted.start({ userId: 'user_a', deviceId: 'dev_a' });
const sentA = [];
const sentB = [];
targeted.channels.set('session_a', {
  sessionId: 'session_a',
  peer: { userId: 'user_b', deviceId: 'dev_b' },
  connectedAt: new Date().toISOString(),
  channel: { readyState: 'open', bufferedAmount: 0, send: (frame) => sentA.push(frame) }
});
targeted.channels.set('session_b', {
  sessionId: 'session_b',
  peer: { userId: 'user_c', deviceId: 'dev_c' },
  connectedAt: new Date().toISOString(),
  channel: { readyState: 'open', bufferedAmount: 0, send: (frame) => sentB.push(frame) }
});
const targetedResult = await targeted.sendTo('session_a', { type: 'snapshot.request', requestId: 'request_1' });
assert.equal(targetedResult.delivered, 1, 'El transporte debe entregar una recuperación solo al par solicitado.');
assert.ok(sentA.length > 0, 'El canal objetivo no recibió los fragmentos.');
assert.equal(sentB.length, 0, 'Una recuperación dirigida se filtró a otro par conectado.');
await targeted.stop();

class RecoverablePeerConnection {
  constructor() {
    this.connectionState = 'new';
    this.iceConnectionState = 'new';
    this.listeners = new Map();
    this.closed = false;
  }
  addEventListener(type, listener) { this.listeners.set(type, listener); }
  emit(type) { this.listeners.get(type)?.(); }
  close() { this.closed = true; this.connectionState = 'closed'; }
}
const recoveryStates = [];
const recoveryTransport = new P2PSinBackendTransport({
  origin: signal.origin,
  applicationId: signal.applicationId,
  RTCPeerConnectionRef: RecoverablePeerConnection,
  disconnectGraceMs: 1000,
  onState: (detail) => recoveryStates.push(detail)
});
recoveryTransport.start({ userId: 'user_a', deviceId: 'dev_a' });
const recoveryEntry = recoveryTransport.createConnection('session_recovery', 'offerer', 'nonce_recovery');
recoveryEntry.peer = { userId: 'user_b', deviceId: 'dev_b' };
recoveryEntry.helloReceived = true;
recoveryEntry.connectedAt = new Date().toISOString();
recoveryEntry.channel = { readyState: 'open', close() {} };
recoveryTransport.channels.set(recoveryEntry.sessionId, recoveryEntry);
recoveryEntry.connection.connectionState = 'disconnected';
recoveryEntry.connection.emit('connectionstatechange');
assert.equal(recoveryTransport.status().connected, false, 'Una caída transitoria no debe seguir anunciándose como canal local activo.');
assert.equal(recoveryStates.at(-1)?.state, 'reconnecting', 'La caída transitoria debe anunciar recuperación, no cierre definitivo inmediato.');
recoveryEntry.connection.connectionState = 'connected';
recoveryEntry.connection.emit('connectionstatechange');
assert.equal(recoveryTransport.status().connected, true, 'El canal WebRTC recuperado debe volver automáticamente al mapa de envío.');
assert.equal(recoveryStates.at(-1)?.state, 'connected', 'La recuperación debe volver a disparar el flujo de sincronización y vaciado del outbox.');
assert.equal(recoveryStates.at(-1)?.reconnected, true, 'La aplicación debe distinguir una reconexión de la apertura inicial.');
await recoveryTransport.stop();

let graceCallback = null;
const expiredStates = [];
const expiringTransport = new P2PSinBackendTransport({
  origin: signal.origin,
  applicationId: signal.applicationId,
  RTCPeerConnectionRef: RecoverablePeerConnection,
  disconnectGraceMs: 1000,
  setTimeoutRef: (callback) => { graceCallback = callback; return 1; },
  clearTimeoutRef: () => { graceCallback = null; },
  onState: (detail) => expiredStates.push(detail)
});
expiringTransport.start({ userId: 'user_a', deviceId: 'dev_a' });
const expiringEntry = expiringTransport.createConnection('session_expired', 'offerer', 'nonce_expired');
expiringEntry.peer = { userId: 'user_b', deviceId: 'dev_b' };
expiringEntry.helloReceived = true;
expiringEntry.connectedAt = new Date().toISOString();
expiringEntry.channel = { readyState: 'open', close() { this.readyState = 'closed'; } };
expiringTransport.channels.set(expiringEntry.sessionId, expiringEntry);
expiringEntry.connection.connectionState = 'disconnected';
expiringEntry.connection.emit('connectionstatechange');
assert.equal(typeof graceCallback, 'function', 'Una caída permanente debe quedar cercada por una gracia acotada.');
graceCallback();
assert.equal(expiringTransport.connections.has(expiringEntry.sessionId), false, 'Una sesión que no se recupera debe liberar el cupo de conexiones.');
assert.equal(expiringEntry.connection.closed, true, 'La sesión vencida debe cerrar el RTCPeerConnection.');
assert.equal(expiredStates.at(-1)?.state, 'disconnected', 'Al vencer la gracia debe publicarse el cierre definitivo, no un estado conectado obsoleto.');
await expiringTransport.stop();

assert.match(client, /\['reconnecting', 'disconnected', 'failed', 'closed', 'error'\]/, 'El indicador principal debe abandonar el estado Wi-Fi cuando el último canal local cae.');
assert.match(client, /broadcastPreparedOperationToLocalNetwork/, 'Las operaciones offline deben poder usar el canal directo ya emparejado.');
assert.match(client, /localOperationAuthorized/, 'Los cambios directos deben validar permisos locales confirmados.');
assert.match(client, /state\.advertisement/, 'La red local debe comparar revisiones aun cuando el outbox ya esté vacío.');
assert.match(client, /p2p\.sin\.signed-snapshot/, 'La red local debe reconstruir de forma firmada un dispositivo que estuvo desconectado.');
assert.match(client, /canonicalLocalSnapshotEntities/, 'La recuperación local debe excluir cambios optimistas todavía no confirmados.');
assert.match(await readFile(new URL('../P2P_sin_RED_LOCALx/P2P_sin_transport.js', import.meta.url), 'utf8'), /P2P_SIN_CONNECTION_LIMIT/, 'El bloque debe limitar conexiones simultáneas.');

console.log('OK: P2P_sin_ es opcional, aislado por origen+aplicación, recupera canales Wi-Fi transitorios, soporta envío dirigido y recuperación local firmada sin romper memoriaBACKEND al faltar.');
