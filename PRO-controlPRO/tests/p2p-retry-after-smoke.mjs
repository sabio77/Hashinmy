import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

class MemoryStorage {
  constructor() { this.values = new Map(); }
  getItem(key) { return this.values.has(key) ? this.values.get(key) : null; }
  setItem(key, value) { this.values.set(key, String(value)); }
  removeItem(key) { this.values.delete(key); }
}

const dispatched = [];
const windowRef = {
  APP_SEED_CONFIG: { backendUrl: 'https://backend.example.test' },
  location: { hostname: 'app.example.test', pathname: '/control-proyectos/' },
  localStorage: new MemoryStorage(),
  setTimeout: (callback, delay) => globalThis.setTimeout(callback, delay),
  clearTimeout: (timer) => globalThis.clearTimeout(timer),
  dispatchEvent: (event) => { dispatched.push(event); return true; },
  addEventListener: () => {},
  removeEventListener: () => {}
};
globalThis.window = windowRef;
globalThis.CustomEvent = class CustomEvent {
  constructor(type, options = {}) { this.type = type; this.detail = options.detail; }
};

const api = await import(`../src/js/api.js?retry-after=${Date.now()}`);
assert.equal(api.parseRetryAfterSeconds('7', 0), 7, 'No se interpretó Retry-After en segundos.');
assert.equal(api.parseRetryAfterSeconds('1.2', 0), 2, 'Retry-After decimal no fue redondeado de forma segura.');
const now = Date.parse('2026-07-31T20:00:00Z');
assert.equal(
  api.parseRetryAfterSeconds('Fri, 31 Jul 2026 20:00:09 GMT', now),
  9,
  'No se interpretó Retry-After con fecha HTTP.'
);
assert.equal(api.parseRetryAfterSeconds('no-valido', now), 0, 'Un Retry-After inválido produjo una espera falsa.');

api.setSessionToken('token_prueba');
globalThis.fetch = async () => new Response(JSON.stringify({
  ok: false,
  code: 'P2P_BOOTSTRAP_RATE_LIMITED',
  message: 'Capacidad temporal agotada.'
}), {
  status: 429,
  headers: { 'Content-Type': 'application/json', 'Retry-After': '7' }
});

let limitedError = null;
try {
  await api.apiPost('/api/p2p/bootstrap', { device: { deviceId: 'dev_test' } });
} catch (error) {
  limitedError = error;
}
assert.equal(limitedError?.status, 429, 'La API perdió el estado HTTP 429.');
assert.equal(limitedError?.retryAfterSeconds, 7, 'La API no adjuntó Retry-After al error P2P.');
assert.ok(Number(limitedError?.retryAt) > Date.now(), 'La API no calculó el instante seguro de reintento.');
assert.equal(dispatched.length, 1, 'La API no emitió una única señal de capacidad P2P.');
assert.equal(dispatched[0]?.type, 'p2p:rate-limited');
assert.equal(dispatched[0]?.detail?.path, '/api/p2p/bootstrap');
assert.equal(dispatched[0]?.detail?.retryAfterSeconds, 7);

globalThis.fetch = async () => new Response(JSON.stringify({
  ok: false,
  message: 'Se alcanzó el máximo histórico de invitaciones.'
}), {
  status: 429,
  headers: { 'Content-Type': 'application/json' }
});
try {
  await api.apiPost('/api/p2p/invitations/create', { email: 'persona@example.test' });
} catch {}
assert.equal(dispatched.length, 1, 'Un límite funcional sin Retry-After activó una reconexión P2P improcedente.');

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const clientSource = fs.readFileSync(path.join(root, 'src', 'js', 'p2p-client.js'), 'utf8');
const helperStart = clientSource.indexOf('export function retryAfterMilliseconds');
const helperEnd = clientSource.indexOf('function createId', helperStart);
assert.ok(helperStart >= 0 && helperEnd > helperStart, 'No se encontró el cálculo acotado de recuperación.');
const helperModule = `const SERVER_RETRY_FALLBACK_MS = 5000;\nconst SERVER_RETRY_MAX_MS = 60 * 60 * 1000;\n${clientSource.slice(helperStart, helperEnd)}`
  .replace('export function retryAfterMilliseconds', 'function retryAfterMilliseconds')
  .replace('export function serverRecoveryDelayMilliseconds', 'function serverRecoveryDelayMilliseconds');
const helperUrl = `data:text/javascript;base64,${Buffer.from(`${helperModule}\nexport { retryAfterMilliseconds, serverRecoveryDelayMilliseconds };`).toString('base64')}`;
const { retryAfterMilliseconds, serverRecoveryDelayMilliseconds } = await import(helperUrl);
assert.equal(retryAfterMilliseconds({ retryAfterSeconds: 7 }), 7000);
assert.equal(retryAfterMilliseconds({ retryAfterSeconds: 0 }), 5000);
assert.equal(retryAfterMilliseconds({ retryAfterSeconds: 3600 }), 60 * 60 * 1000);
assert.equal(serverRecoveryDelayMilliseconds({ status: 503 }, 0), 5000, 'La recuperación por 5xx no usa el primer backoff.');
assert.equal(serverRecoveryDelayMilliseconds({ status: 503 }, 1), 10000, 'La recuperación por 5xx no incrementa el backoff.');
assert.equal(serverRecoveryDelayMilliseconds({ status: 503 }, 4), 30000, 'La recuperación genérica no queda acotada a 30 s.');
assert.equal(
  serverRecoveryDelayMilliseconds({ status: 429, code: 'P2P_BOOTSTRAP_RATE_LIMITED', retryAfterSeconds: 7 }, 4),
  7000,
  'Retry-After dejó de tener prioridad frente al backoff genérico.'
);

for (const expected of [
  'this.serverRetryTimer = 0;',
  'this.serverRetryAttempt = 0;',
  'serverRecoveryDelayMilliseconds(error = null',
  'scheduleServerRecovery(error = null',
  'this.isRetryableTransportError(error)',
  'this.serverRetryDueAt <= dueAt',
  "reason: rateLimited ? 'rate-limit' : 'transport-retry'",
  "window.addEventListener('p2p:rate-limited', this.boundRateLimited);",
  "window.removeEventListener('p2p:rate-limited', this.boundRateLimited);",
  "this.scheduleServerRecovery(error, 'bootstrap-start');",
  "this.scheduleServerRecovery(error, 'recover-online')",
  'P2P_BOOTSTRAP_RATE_LIMITED',
  'P2P_PUBLISH_RATE_LIMITED',
  'P2P_CONTROL_RATE_LIMITED',
  'this.clearServerRecoveryTimer();'
]) {
  assert.ok(clientSource.includes(expected), `Falta la protección de recuperación: ${expected}`);
}
const stopStart = clientSource.indexOf('  async stop(options = {})');
const stopEnd = clientSource.indexOf('  async refreshBootstrap', stopStart);
assert.ok(
  stopStart >= 0 && stopEnd > stopStart && clientSource.slice(stopStart, stopEnd).includes('this.clearServerRecoveryTimer();'),
  'Detener o cambiar de sesión no cancela la recuperación pendiente.'
);
assert.ok(!clientSource.includes('setInterval('), 'La recuperación agregó polling periódico.');

console.log('OK: Retry-After y fallos transitorios 5xx/red agendan recuperación P2P acotada, priorizan el intento más temprano y evitan quedar desconectados sin polling.');
