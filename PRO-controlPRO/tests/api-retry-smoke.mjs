import assert from 'node:assert/strict';

const auditEvents = [];
const originalWarn = console.warn;
const originalError = console.error;
console.warn = (...args) => { if (args[0] === '[SemillaP2P][REQUEST_AUDIT]') auditEvents.push(args[1]); };
console.error = (...args) => { if (args[0] === '[SemillaP2P][REQUEST_AUDIT]') auditEvents.push(args[1]); };
const storage = new Map();
const nativeSetTimeout = globalThis.setTimeout.bind(globalThis);
const nativeClearTimeout = globalThis.clearTimeout.bind(globalThis);

globalThis.window = {
  APP_SEED_CONFIG: { backendUrl: 'https://backend.example.test' },
  APP_RUNTIME_CONFIG: {},
  location: { hostname: 'app.example.test' },
  localStorage: {
    getItem(key) { return storage.get(String(key)) || null; },
    setItem(key, value) { storage.set(String(key), String(value)); },
    removeItem(key) { storage.delete(String(key)); }
  },
  setTimeout(callback, delay) {
    return nativeSetTimeout(callback, Number(delay) >= 10_000 ? Number(delay) : 0);
  },
  clearTimeout(handle) { nativeClearTimeout(handle); },
  dispatchEvent() { return true; }
};
Object.defineProperty(globalThis, 'navigator', { value: { onLine: true }, configurable: true });
if (typeof globalThis.CustomEvent !== 'function') {
  globalThis.CustomEvent = class CustomEvent {
    constructor(type, init = {}) { this.type = type; this.detail = init.detail; }
  };
}

globalThis.APP_SEED_METADATA = { applicationId: 'control-proyectos' };

const { apiGet, apiPost } = await import('../src/js/api.js');

function jsonResponse(status, body, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers }
  });
}

let attempts = 0;
globalThis.fetch = async () => {
  attempts += 1;
  if (attempts < 3) return jsonResponse(503, { ok: false, code: 'TEMPORARY_FAILURE', message: 'Temporal' });
  return jsonResponse(200, { ok: true, value: 'recovered' });
};
const recovered = await apiGet('/api/retry-success');
assert.equal(recovered.value, 'recovered');
assert.equal(attempts, 3, 'Una solicitud recuperable debe detenerse al tercer intento exitoso.');
assert.equal(auditEvents.filter((item) => item.path === '/api/retry-success' && item.stage === 'request-retry').length, 2);

attempts = 0;
globalThis.fetch = async () => {
  attempts += 1;
  return jsonResponse(503, { ok: false, code: 'TEMPORARY_FAILURE', message: 'Sigue fallando' });
};
let exhausted = null;
try {
  await apiPost('/api/retry-exhausted', { operationId: 'op_test' }, { idempotent: true });
} catch (error) {
  exhausted = error;
}
assert.ok(exhausted, 'La solicitud debe fallar al agotar los intentos.');
assert.equal(attempts, 3);
assert.equal(exhausted.requestAttempts, 3);
assert.equal(exhausted.requestMaxAttempts, 3);
assert.equal(exhausted.requestRetryExhausted, true);
assert.equal(exhausted.previousStatePreserved, true);
const terminalAudit = auditEvents.find((item) => item.path === '/api/retry-exhausted' && item.stage === 'request-failed');
assert.ok(terminalAudit, 'Debe existir una auditoría terminal de la solicitud agotada.');
assert.equal(terminalAudit.attempt, 3);
assert.equal(terminalAudit.maxAttempts, 3);
assert.equal(terminalAudit.previousStatePreserved, true);
assert.equal(terminalAudit.error.code, 'TEMPORARY_FAILURE');
assert.equal(terminalAudit.error.status, 503);


attempts = 0;
globalThis.fetch = async () => {
  attempts += 1;
  return jsonResponse(503, { ok: false, code: 'TEMPORARY_FAILURE', message: 'Temporal' });
};
let unsafePost = null;
try {
  await apiPost('/api/auth/google-login', { idToken: 'firebase-token-test' }, { maxAttempts: 3 });
} catch (error) {
  unsafePost = error;
}
assert.ok(unsafePost, 'El POST no idempotente debe propagar el fallo de su único intento.');
assert.equal(attempts, 1, 'Un POST no auditado como idempotente no debe duplicar mutaciones ni HTTP Responses.');
assert.equal(unsafePost.requestAttempts, 1);
assert.equal(unsafePost.requestMaxAttempts, 1);
assert.equal(unsafePost.requestRetrySafetyLimited, true, 'Debe quedar trazable que el reintento fue bloqueado por seguridad/idempotencia.');

attempts = 0;
globalThis.fetch = async () => {
  attempts += 1;
  if (attempts < 3) return jsonResponse(503, { ok: false, code: 'TEMPORARY_FAILURE', message: 'Temporal' });
  return jsonResponse(200, { ok: true, device: { deviceId: 'dev_test' } });
};
const safeBootstrap = await apiPost('/api/p2p/bootstrap', { device: { deviceId: 'dev_test' } });
assert.equal(safeBootstrap.device.deviceId, 'dev_test');
assert.equal(attempts, 3, 'El bootstrap P2P auditado como idempotente debe conservar su recuperación acotada.');

attempts = 0;
globalThis.fetch = async () => {
  attempts += 1;
  return jsonResponse(400, { ok: false, code: 'INVALID_REQUEST', message: 'Solicitud inválida' });
};
let invalid = null;
try {
  await apiPost('/api/non-retryable', {});
} catch (error) {
  invalid = error;
}
assert.ok(invalid);
assert.equal(attempts, 1, 'Un 4xx no recuperable no debe repetirse.');
assert.equal(invalid.requestRetryExhausted, false);

attempts = 0;
globalThis.fetch = async () => {
  attempts += 1;
  return jsonResponse(501, { ok: false, code: 'NOT_IMPLEMENTED', message: 'Operación no implementada' });
};
let definitiveServerError = null;
try {
  await apiGet('/api/not-implemented');
} catch (error) {
  definitiveServerError = error;
}
assert.ok(definitiveServerError, 'Un 5xx definitivo debe propagarse sin ocultar el fallo.');
assert.equal(attempts, 1, 'Un 501 definitivo no debe consumir respuestas HTTP adicionales mediante reintentos.');
assert.equal(definitiveServerError.requestRetryExhausted, false);
assert.equal(definitiveServerError.requestAttempts, 1);
assert.equal(definitiveServerError.status, 501);

const auditCountBeforeSingleAttempt = auditEvents.length;
attempts = 0;
globalThis.fetch = async () => {
  attempts += 1;
  return jsonResponse(503, { ok: false, code: 'TEMPORARY_FAILURE', message: 'Temporal' });
};
try {
  await apiPost('/api/lifecycle-specialized', {}, { maxAttempts: 1, audit: false });
} catch {}
assert.equal(attempts, 1, 'Las rutinas con reintento especializado deben poder evitar multiplicar 3x3 los intentos.');
assert.equal(auditEvents.length, auditCountBeforeSingleAttempt, 'La auditoría especializada puede desactivar la duplicación del log genérico.');

console.warn = originalWarn;
console.error = originalError;
console.log('OK: GET/POST idempotentes conservan reintentos solo ante fallos transitorios; POST no idempotentes y 5xx definitivos quedan en un intento, con auditoría estructurada.');
