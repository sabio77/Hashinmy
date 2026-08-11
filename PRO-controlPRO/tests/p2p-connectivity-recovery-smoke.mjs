import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const currentFile = fileURLToPath(import.meta.url);
const root = path.resolve(path.dirname(currentFile), '..');
const source = fs.readFileSync(path.join(root, 'src', 'js', 'p2p-client.js'), 'utf8');

const methodsStart = source.indexOf('  isKeyAuthorityRetryableError(');
const methodsEnd = source.indexOf('\n  isPermanentOutboxRejection(', methodsStart);
assert.ok(methodsStart >= 0 && methodsEnd > methodsStart, 'No se encontró el planificador de recuperación de conectividad.');
const methods = source.slice(methodsStart, methodsEnd);

const harness = `
const RETRY_BASE_MS = 1200;
const dispatched = [];
const timers = new Map();
let nextTimer = 1;
const window = {
  setTimeout(callback, delay) {
    const id = nextTimer++;
    timers.set(id, { callback, delay });
    return id;
  },
  clearTimeout(id) { timers.delete(id); }
};
const navigator = { onLine: true };
function getSessionToken() { return 'session_ok'; }
function retryAfterMilliseconds(error = null) {
  const seconds = Number(error?.retryAfterSeconds || 0);
  return seconds > 0 ? seconds * 1000 : 5000;
}
function dispatch(name, detail = {}) { dispatched.push({ name, detail }); }
class TestClient {
  constructor() {
    this.manualClose = false;
    this.started = true;
    this.realtimeLeader = true;
    this.retryCount = 0;
    this.serverRetryTimer = 0;
    this.serverRetryDueAt = 0;
    this.serverRetryStage = '';
    this.connectivityRetryTimer = 0;
    this.connectivityRetryDueAt = 0;
    this.connectivityRetryStage = '';
    this.recoverCalls = 0;
    this.deviceId = 'device_test';
  }
  captureSessionContext() { return { generation: 1, userId: 'user_test', deviceId: this.deviceId, sessionToken: 'session_ok' }; }
  isSessionContextCurrent(context = {}) { return Number(context.generation) === 1 && context.deviceId === this.deviceId; }
  isSessionContextChangedError() { return false; }
  recoverOnline() { this.recoverCalls += 1; return Promise.resolve(true); }
${methods}
}
export { TestClient, dispatched, timers, navigator };
`;

const module = await import(`data:text/javascript;base64,${Buffer.from(harness).toString('base64')}`);
const originalNow = Date.now;
Date.now = () => 10_000;
try {
  const rateLimited = new module.TestClient();
  rateLimited.serverRetryTimer = 99;
  rateLimited.serverRetryDueAt = 20_000;
  module.timers.set(99, { callback() {}, delay: 10_000 });
  assert.equal(
    rateLimited.scheduleServerRecovery({ status: 429, retryAfterSeconds: 2 }, 'rate-limit'),
    true,
    'Un 429 con Retry-After no conservó una recuperación segura.'
  );
  assert.equal(rateLimited.serverRetryTimer, 99, 'Un Retry-After posterior acortó una espera de servidor ya más conservadora.');
  assert.equal(rateLimited.serverRetryDueAt, 20_000, 'Se perdió la espera de servidor más restrictiva.');

  const transient = new module.TestClient();
  assert.equal(
    transient.scheduleConnectivityRecovery({ status: 503 }, 'bootstrap-start'),
    true,
    'Un 5xx transitorio previo al SSE quedó sin recuperación automática.'
  );
  assert.equal(transient.connectivityRetryDueAt, 11_200, 'El primer reintento transitorio no usa backoff corto y acotado.');
  assert.equal(transient.retryCount, 1, 'El backoff transitorio no avanzó su contador.');
  assert.equal(module.dispatched.at(-1)?.detail?.reason, 'transport-retry');
  const scheduled = module.timers.get(transient.connectivityRetryTimer);
  assert.ok(scheduled, 'No quedó un temporizador activo para recuperar la conectividad.');
  scheduled.callback();
  await Promise.resolve();
  assert.equal(transient.recoverCalls, 1, 'El temporizador no volvió a ejecutar recoverOnline con internet disponible.');

  const rateTakesPriority = new module.TestClient();
  assert.equal(rateTakesPriority.scheduleConnectivityRecovery({ status: 503 }, 'bootstrap-start'), true);
  const genericTimer = rateTakesPriority.connectivityRetryTimer;
  assert.ok(genericTimer, 'No se creó el reintento genérico previo.');
  assert.equal(
    rateTakesPriority.scheduleServerRecovery({ status: 429, retryAfterSeconds: 7 }, 'rate-limit'),
    true
  );
  assert.equal(rateTakesPriority.connectivityRetryTimer, 0, 'Un Retry-After explícito no canceló el reintento genérico más agresivo.');
  assert.equal(module.timers.has(genericTimer), false, 'El timer genérico siguió vivo pese al backoff indicado por servidor.');
  assert.equal(rateTakesPriority.serverRetryDueAt, 17_000, 'No se respetó el Retry-After del backend.');

  const permanent = new module.TestClient();
  assert.equal(
    permanent.scheduleConnectivityRecovery({ status: 403 }, 'bootstrap-start'),
    false,
    'Un error permanente 403 entró en un bucle de reconexión.'
  );
} finally {
  Date.now = originalNow;
}

const startStart = source.indexOf('  async start(user = {})');
const startEnd = source.indexOf('\n  async stop(options = {})', startStart);
const startSource = source.slice(startStart, startEnd);
assert.match(startSource, /scheduleConnectivityRecovery\(error, 'bootstrap-start'\)/, 'El bootstrap transitorio aún puede quedar desconectado sin temporizador.');
assert.match(startSource, /requestTabState\('startup-backend-unavailable'\)/, 'Una pestaña seguidora cuyo bootstrap falla no solicita el estado al líder activo.');

const recoverStart = source.indexOf('  async recoverOnline()');
const recoverEnd = source.indexOf('\n  abortRealtimeForReplay(', recoverStart);
const recoverSource = source.slice(recoverStart, recoverEnd);
assert.match(recoverSource, /scheduleConnectivityRecovery\(error, 'recover-online'\)/, 'Una recuperación fallida mientras sigue online aún puede quedar abandonada.');
assert.match(recoverSource, /clearConnectivityRecoveryTimer\(\)/, 'Una recuperación exitosa deja vivo un reintento de conectividad obsoleto.');
assert.ok(!source.includes('setInterval('), 'La robustez del stream introdujo polling periódico.');

console.log('OK: bootstrap y recuperación online reintentan fallos transitorios, respetan Retry-After y mantienen aislados los timers de capacidad y conectividad.');
