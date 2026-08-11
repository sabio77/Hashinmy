import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const currentFile = fileURLToPath(import.meta.url);
const root = path.resolve(path.dirname(currentFile), '..');
const source = fs.readFileSync(path.join(root, 'src', 'js', 'p2p-client.js'), 'utf8');

const methodStart = source.indexOf('  abortRealtimeForReplay(');
const methodEnd = source.indexOf('\n  async openRealtime()', methodStart);
assert.ok(methodStart >= 0 && methodEnd > methodStart, 'No se encontró la recuperación tipada ante payload SSE inválido.');
const methodSource = source.slice(methodStart, methodEnd);

const harness = `
const dispatched = [];
function dispatch(name, detail = {}) { dispatched.push({ name, detail }); }
class TestClient {
  constructor() {
    this.atomicBatchAssemblyTimer = 77;
    this.pendingAtomicEventBatches = new Map([['space_1|batch_1', { events: [{}] }]]);
    this.eventPipelineBlocked = false;
    this.timerClears = 0;
    this.reconnects = 0;
  }
  clearAtomicTransportBatchTimer() {
    this.atomicBatchAssemblyTimer = 0;
    this.timerClears += 1;
  }
  scheduleReconnect() { this.reconnects += 1; }
${methodSource}
}
export { TestClient, dispatched };
`;
const module = await import(`data:text/javascript;base64,${Buffer.from(harness).toString('base64')}`);
const client = new module.TestClient();
const error = new Error('payload inválido');
error.code = 'P2P_REALTIME_EVENT_INVALID_JSON';
client.abortRealtimeForReplay(error, 'event-parse');

assert.equal(client.eventPipelineBlocked, true, 'El stream inválido no bloqueó el avance del cursor.');
assert.equal(client.pendingAtomicEventBatches.size, 0, 'La recuperación conservó un lote parcial incompatible con el replay.');
assert.equal(client.atomicBatchAssemblyTimer, 0, 'La recuperación dejó activo el vencimiento del lote anterior.');
assert.equal(client.timerClears, 1, 'La recuperación no limpió exactamente una vez el temporizador pendiente.');
assert.equal(client.reconnects, 1, 'La recuperación no cerró y reabrió el stream desde el cursor durable.');
assert.equal(module.dispatched.length, 1, 'La falla de protocolo no produjo una única señal observable.');
assert.equal(module.dispatched[0].detail.stage, 'event-parse');
assert.equal(module.dispatched[0].detail.error.code, 'P2P_REALTIME_EVENT_INVALID_JSON');

const eventListenerStart = source.indexOf("source.addEventListener('p2p_event'");
const eventListenerEnd = source.indexOf('      source.onerror', eventListenerStart);
assert.ok(eventListenerStart >= 0 && eventListenerEnd > eventListenerStart, 'No se encontró el listener de eventos SSE.');
const eventListener = source.slice(eventListenerStart, eventListenerEnd);
assert.match(eventListener, /P2P_REALTIME_EVENT_INVALID_JSON/);
assert.match(eventListener, /this\.abortRealtimeForReplay\(/);
assert.match(eventListener, /'event-parse'/);
assert.match(eventListener, /'event-envelope'/);
assert.doesNotMatch(
  eventListener,
  /dispatch\('p2p:error', \{ error, stage: 'event-parse' \}\)/,
  'El JSON inválido volvió a quedar reducido a logging sin bloquear la tubería.'
);

const gapListenerStart = source.indexOf("source.addEventListener('p2p_gap'");
const gapListenerEnd = source.indexOf("source.addEventListener('p2p_event'", gapListenerStart);
assert.ok(gapListenerStart >= 0 && gapListenerEnd > gapListenerStart, 'No se encontró el listener de brechas SSE.');
const gapListener = source.slice(gapListenerStart, gapListenerEnd);
assert.match(gapListener, /P2P_REALTIME_GAP_INVALID_JSON/);
assert.match(gapListener, /this\.abortRealtimeForReplay\(/);
assert.match(gapListener, /'delivery-gap-parse'/);
assert.match(gapListener, /'delivery-gap-envelope'/);

console.log('OK: un payload SSE inválido bloquea la tubería, limpia lotes parciales y fuerza replay desde el último cursor durable sin confirmar el evento omitido.');

const livenessStart = source.indexOf('  clearRealtimeConnectTimeout()');
const livenessEnd = source.indexOf('\n  async openRealtime()', livenessStart);
assert.ok(livenessStart >= 0 && livenessEnd > livenessStart, 'No se encontró el watchdog de liveness realtime.');
const livenessMethods = source.slice(livenessStart, livenessEnd);
const livenessHarness = `
const REALTIME_HEARTBEAT_DEFAULT_MS = 25000;
const REALTIME_CONNECT_TIMEOUT_MS = 20000;
const REALTIME_WATCHDOG_MIN_MS = 45000;
const REALTIME_WATCHDOG_FACTOR = 3.2;
const dispatched = [];
const navigator = { onLine: true };
function getSessionToken() { return 'session_ok'; }
function dispatch(name, detail = {}) { dispatched.push({ name, detail }); }
let nextTimerId = 1;
const timers = new Map();
const window = {
  setTimeout(callback, delay) {
    const id = nextTimerId++;
    timers.set(id, { callback, delay });
    return id;
  },
  clearTimeout(id) { timers.delete(id); }
};
class LivenessClient {
  constructor() {
    this.eventSource = { close() {} };
    this.realtimeLeader = true;
    this.started = true;
    this.tabCoordinationReady = true;
    this.manualClose = false;
    this.realtimeConnectTimer = 0;
    this.realtimeConnectStartedAt = 0;
    this.realtimeWatchdogTimer = 0;
    this.realtimeLastActivityAt = 0;
    this.realtimeHeartbeatIntervalMs = REALTIME_HEARTBEAT_DEFAULT_MS;
    this.reconnects = 0;
  }
  captureSessionContext() { return { generation: 1 }; }
  isSessionContextCurrent(context) { return Number(context?.generation) === 1; }
  isSessionContextChangedError() { return false; }
  scheduleConnectivityRecovery() { return false; }
  openRealtime() { this.openCalls = (this.openCalls || 0) + 1; return Promise.resolve(this.eventSource); }
  scheduleReconnect(reason) { this.reconnects += 1; this.reconnectReason = reason; }
${livenessMethods}
}
export { LivenessClient, dispatched, timers };
`;
const livenessModule = await import(`data:text/javascript;base64,${Buffer.from(livenessHarness).toString('base64')}`);
const livenessClient = new livenessModule.LivenessClient();
const originalNow = Date.now;
let fakeNow = 1_000;
Date.now = () => fakeNow;
try {
  assert.equal(livenessClient.armRealtimeConnectTimeout(livenessClient.eventSource, { generation: 1 }), true);
  assert.equal(livenessModule.timers.size, 1, 'La apertura SSE no quedó cercada por un timeout de confirmación.');
  const connectTimer = [...livenessModule.timers.values()][0];
  assert.equal(connectTimer.delay, 20000, 'La espera inicial del stream no usa el límite seguro esperado.');
  connectTimer.callback();
  assert.equal(livenessClient.reconnects, 1, 'Un stream que nunca confirma p2p_ready puede quedar bloqueado indefinidamente.');
  assert.equal(livenessClient.reconnectReason, 'realtime-connect-timeout');
  assert.equal(livenessModule.dispatched.at(-1)?.detail?.error?.code, 'P2P_REALTIME_CONNECT_TIMEOUT');

  livenessClient.reconnects = 0;
  livenessClient.reconnectReason = '';
  livenessModule.timers.clear();
  assert.equal(livenessClient.armRealtimeConnectTimeout(livenessClient.eventSource, { generation: 1 }), true);
  assert.equal(livenessClient.touchRealtimeActivity(livenessClient.eventSource, { generation: 1 }, 25000), true);
  assert.equal(livenessClient.realtimeConnectTimer, 0, 'La confirmación de actividad no canceló el timeout de apertura.');
  assert.equal(livenessModule.timers.size, 1, 'El ready SSE no sustituyó el timeout de apertura por exactamente un watchdog.');
  fakeNow = 50_000;
  livenessClient.touchRealtimeActivity(livenessClient.eventSource, { generation: 1 }, 25000);
  assert.equal(livenessModule.timers.size, 1, 'Un heartbeat no sustituyó el watchdog anterior.');
  fakeNow = 130_001;
  const [{ callback }] = [...livenessModule.timers.values()];
  callback();
  assert.equal(livenessClient.reconnects, 1, 'Un stream silencioso no forzó una reconexión nueva.');
  assert.equal(livenessClient.reconnectReason, 'realtime-stale');
  assert.equal(livenessModule.dispatched.at(-1)?.detail?.error?.code, 'P2P_REALTIME_STALE');

  livenessClient.reconnects = 0;
  livenessClient.reconnectReason = '';
  livenessModule.timers.clear();
  livenessClient.eventSource = { readyState: 1, close() {} };
  livenessClient.realtimeLastActivityAt = 50_000;
  livenessClient.realtimeConnectStartedAt = 0;
  fakeNow = 130_001;
  assert.equal(livenessClient.revalidateRealtimeOnResume('visibilitychange'), true);
  assert.equal(livenessClient.reconnects, 1, 'Al volver a primer plano no se recicló un SSE OPEN que ya llevaba demasiado tiempo sin actividad.');
  assert.equal(livenessClient.reconnectReason, 'realtime-visibilitychange-stale');

  livenessClient.reconnects = 0;
  livenessClient.reconnectReason = '';
  livenessClient.eventSource = { readyState: 0, close() {} };
  livenessClient.realtimeLastActivityAt = 0;
  livenessClient.realtimeConnectStartedAt = 100_000;
  fakeNow = 120_001;
  assert.equal(livenessClient.revalidateRealtimeOnResume('pageshow'), true);
  assert.equal(livenessClient.reconnects, 1, 'Al reanudar no se recicló un EventSource que quedó atascado en CONNECTING durante la suspensión.');
  assert.equal(livenessClient.reconnectReason, 'realtime-pageshow-stale');
} finally {
  Date.now = originalNow;
}

const openRealtimeStart = source.indexOf('  async openRealtime()');
const openRealtimeEnd = source.indexOf('\n  scheduleReconnect(', openRealtimeStart);
const openRealtimeSource = source.slice(openRealtimeStart, openRealtimeEnd);
assert.match(openRealtimeSource, /armRealtimeConnectTimeout\(source, sessionContext\)/, 'La apertura SSE todavía puede quedar eternamente en CONNECTING sin p2p_ready.');
assert.match(openRealtimeSource, /source\.onopen = \(\) =>/, 'La apertura física del EventSource no queda observada antes del handshake P2P.');
assert.match(openRealtimeSource, /source\.onopen = \(\) => \{[\s\S]*touchRealtimeActivity\(source, sessionContext\)/, 'El transporte HTTP abierto no cancela el timeout de CONNECTING ni activa el watchdog de liveness.');
assert.match(openRealtimeSource, /realtimeSourceRequiresRecycle\(this\.eventSource\)/, 'openRealtime reutiliza un EventSource zombie sin comprobar su liveness al recuperar conectividad.');
assert.match(openRealtimeSource, /source\.addEventListener\('p2p_heartbeat'/, 'El cliente no observa el heartbeat SSE del backend.');
assert.match(openRealtimeSource, /scheduleServerRecovery\(error, 'realtime-open'\)/, 'Una credencial realtime limitada no respeta la recuperación dirigida por servidor.');
assert.match(openRealtimeSource, /scheduleReconnect\('realtime-open'\)/, 'Un fallo transitorio al abrir el stream puede quedar sin reintento.');

const appSource = fs.readFileSync(path.join(root, 'src', 'js', 'app.js'), 'utf8');
assert.doesNotMatch(appSource, /window\.addEventListener\('p2p:error', \(\) => setConnectionState\('error'\)\)/, 'La UI sigue confundiendo cualquier error P2P con una caída del stream.');
assert.match(appSource, /const recoverableStreamFailure =/, 'La UI no distingue una recuperación de protocolo de una caída fatal del stream.');
assert.match(appSource, /const fatalStreamFailure =/, 'La UI perdió la clasificación de fallos de apertura realmente fatales.');
assert.match(appSource, /stage === 'realtime-connect-timeout'/, 'La UI no clasifica el timeout inicial SSE como recuperación automática.');
assert.match(appSource, /if \(recoverableStreamFailure\) \{[\s\S]*setConnectionState\('connecting'\)/, 'Una recuperación automática todavía queda presentada como “Sin conexión al stream”.');
const startSection = source.slice(source.indexOf('  async start(user = {})'), source.indexOf('  async stop(options = {})'));
const stopSection = source.slice(source.indexOf('  async stop(options = {})'), source.indexOf('  async refreshBootstrap(', source.indexOf('  async stop(options = {})')));
assert.match(startSection, /addEventListener\('pageshow', this\.boundRealtimeResume\)/, 'La PWA no revalida el stream al volver de una suspensión de página.');
assert.match(startSection, /addEventListener\?\.\('visibilitychange', this\.boundRealtimeResume\)/, 'La PWA no revalida el stream al regresar a primer plano.');
assert.match(stopSection, /removeEventListener\('pageshow', this\.boundRealtimeResume\)/, 'El cierre deja conectado el observador pageshow del stream.');
assert.match(stopSection, /removeEventListener\?\.\('visibilitychange', this\.boundRealtimeResume\)/, 'El cierre deja conectado el observador de visibilidad del stream.');

console.log('OK: el stream tiene heartbeat observable, reconoce la apertura HTTP real, revalida conexiones zombie al reanudar y la UI distingue recuperación automática de una caída fatal SSE.');

const reconnectStart = source.indexOf('  scheduleReconnect(');
const reconnectEnd = source.indexOf('\n  clearAtomicTransportBatchTimer()', reconnectStart);
assert.ok(reconnectStart >= 0 && reconnectEnd > reconnectStart, 'No se encontró el cercado de reconexión SSE.');
const reconnectSource = source.slice(reconnectStart, reconnectEnd);
const reconnectHarness = `
const RETRY_BASE_MS = 1200;
const navigator = { onLine: true };
const dispatched = [];
function dispatch(name, detail = {}) { dispatched.push({ name, detail }); }
const window = {
  setTimeout() { throw new Error('No debe crear otro timer cuando ya existe un backoff pendiente.'); },
  clearTimeout() {}
};
class ReconnectClient {
  constructor() {
    this.manualClose = false;
    this.started = true;
    this.realtimeLeader = true;
    this.retryTimer = 77;
    this.retryCount = 2;
    this.deviceId = 'device_reconnect';
    this.closedSources = 0;
    this.eventSource = { close: () => { this.closedSources += 1; } };
  }
  captureSessionContext() { return { generation: 1, deviceId: this.deviceId }; }
  isSessionContextCurrent(context = {}) { return Number(context.generation) === 1 && context.deviceId === this.deviceId; }
  isSessionContextChangedError() { return false; }
  clearRealtimeConnectTimeout() {}
  clearRealtimeWatchdog() {}
  openRealtime() { return Promise.resolve(null); }
${reconnectSource}
}
export { ReconnectClient, dispatched };
`;
const reconnectModule = await import(`data:text/javascript;base64,${Buffer.from(reconnectHarness).toString('base64')}`);
const reconnectClient = new reconnectModule.ReconnectClient();
reconnectClient.scheduleReconnect('realtime-connect-timeout');
assert.equal(reconnectClient.closedSources, 1, 'Un backoff previo impidió cerrar el EventSource nuevo que quedó atascado en CONNECTING.');
assert.equal(reconnectClient.eventSource, null, 'El EventSource atascado siguió marcado como conexión vigente.');
assert.equal(reconnectClient.retryTimer, 77, 'La recuperación sustituyó innecesariamente el backoff que ya estaba programado.');

console.log('OK: un backoff SSE ya pendiente no puede conservar un EventSource posterior atascado en CONNECTING.');
