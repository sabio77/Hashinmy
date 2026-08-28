import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = fs.readFileSync(path.join(root, 'src', 'js', 'p2p-client.js'), 'utf8');

const helperStart = source.indexOf('function urlBase64ToUint8Array');
const helperEnd = source.indexOf('function pushAccountBindingRequestId', helperStart);
const methodStart = source.indexOf('  async ensurePushSubscriptionForCurrentVapidKey');
const methodEnd = source.indexOf('  async enablePushNotifications()', methodStart);
assert.ok(helperStart >= 0 && helperEnd > helperStart, 'No se encontró el comparador binario de claves Push.');
assert.ok(methodStart >= 0 && methodEnd > methodStart, 'No se encontró la migración de suscripción al VAPID vigente.');

const isolatedModule = `
const PUSH_VAPID_BINDING_STORAGE_KEY = 'semilla_p2p_push_vapid_binding:test';
const localStorageState = new Map();
const window = {
  atob: globalThis.atob,
  localStorage: {
    getItem(key) { return localStorageState.has(key) ? localStorageState.get(key) : null; },
    setItem(key, value) { localStorageState.set(key, String(value)); },
    removeItem(key) { localStorageState.delete(key); }
  }
};
const apiCalls = [];
async function apiPost(path, body) { apiCalls.push({ path, body }); return { ok: true }; }
${source.slice(helperStart, helperEnd).replace('export function comparePushApplicationServerKeys', 'function comparePushApplicationServerKeys')}
class TestClient {
  captureSessionContext() { return Object.freeze({ generation: 1, userId: 'user_a', deviceId: 'dev_rotation_0001', sessionToken: 'session' }); }
  assertSessionContext(context) { if (!context || context.generation !== 1) throw new Error('contexto inválido'); }
${source.slice(methodStart, methodEnd)}
}
function resetState() { apiCalls.length = 0; localStorageState.clear(); }
export {
  TestClient,
  apiCalls,
  resetState,
  comparePushApplicationServerKeys,
  readStoredPushVapidBinding,
  writeStoredPushVapidBinding,
  markStoredPushBackendRegistration,
  storedPushBackendRegistrationIsFresh
};
`;
const moduleUrl = `data:text/javascript;base64,${Buffer.from(isolatedModule).toString('base64')}`;
const {
  TestClient,
  apiCalls,
  resetState,
  comparePushApplicationServerKeys,
  readStoredPushVapidBinding,
  writeStoredPushVapidBinding,
  markStoredPushBackendRegistration,
  storedPushBackendRegistrationIsFresh
} = await import(moduleUrl);

function base64Url(bytes) {
  return Buffer.from(bytes).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function subscriptionFor(keyBytes, endpoint = 'https://push.example/subscription-old') {
  return {
    endpoint,
    options: { applicationServerKey: Uint8Array.from(keyBytes).buffer },
    unsubscribeCalls: 0,
    async unsubscribe() { this.unsubscribeCalls += 1; return true; }
  };
}

function hiddenKeySubscription(endpoint = 'https://push.example/subscription-hidden') {
  return {
    endpoint,
    options: { applicationServerKey: null },
    unsubscribeCalls: 0,
    async unsubscribe() { this.unsubscribeCalls += 1; return true; }
  };
}

const keyA = Uint8Array.from([4, 10, 20, 30, 40, 50, 60]);
const keyB = Uint8Array.from([4, 10, 20, 30, 40, 50, 61]);
assert.equal(comparePushApplicationServerKeys(keyA, keyA.slice().buffer), true);
assert.equal(comparePushApplicationServerKeys(keyA, keyB), false);
assert.equal(comparePushApplicationServerKeys(null, keyB), null);

resetState();
const durableSubscription = hiddenKeySubscription('https://push.example/durable-binding');
const durableContext = Object.freeze({ generation: 1, userId: 'user_a', deviceId: 'dev_rotation_0001', sessionToken: 'session' });
writeStoredPushVapidBinding(durableSubscription, base64Url(keyA));
assert.equal(
  storedPushBackendRegistrationIsFresh(durableSubscription, { publicKey: base64Url(keyA), subscriptionTtlSeconds: 86400 }, durableContext),
  false,
  'Una vinculación VAPID local todavía no debe fingir que Redis ya fue registrado.'
);
assert.equal(markStoredPushBackendRegistration(durableSubscription, base64Url(keyA), durableContext), true);
assert.equal(
  storedPushBackendRegistrationIsFresh(durableSubscription, { publicKey: base64Url(keyA), subscriptionTtlSeconds: 86400 }, durableContext),
  true,
  'Una suscripción recién confirmada en backend debería evitar otro POST en el siguiente arranque.'
);
assert.equal(
  storedPushBackendRegistrationIsFresh(durableSubscription, { publicKey: base64Url(keyA), subscriptionTtlSeconds: 86400 }, { ...durableContext, userId: 'user_b' }),
  false,
  'La marca durable Push no puede reutilizarse entre cuentas.'
);
assert.equal(
  storedPushBackendRegistrationIsFresh(durableSubscription, { publicKey: base64Url(keyA), subscriptionTtlSeconds: 86400 }, { ...durableContext, deviceId: 'dev_other' }),
  false,
  'La marca durable Push no puede reutilizarse entre dispositivos.'
);

const client = new TestClient();
const context = client.captureSessionContext();

resetState();
const current = subscriptionFor(keyA);
let subscribeCalls = 0;
let getCalls = 0;
const sameManager = {
  async getSubscription() { getCalls += 1; return current; },
  async subscribe() { subscribeCalls += 1; throw new Error('no debe renovar una clave vigente'); }
};
const sameResult = await client.ensurePushSubscriptionForCurrentVapidKey(
  { pushManager: sameManager },
  { enabled: true, publicKey: base64Url(keyA) },
  context
);
assert.equal(sameResult, current);
assert.equal(getCalls, 1);
assert.equal(subscribeCalls, 0);
assert.equal(apiCalls.length, 0);
assert.equal(current.unsubscribeCalls, 0);
assert.deepEqual(readStoredPushVapidBinding(), {
  endpoint: current.endpoint,
  publicKey: base64Url(keyA)
});

resetState();
const hiddenCurrent = hiddenKeySubscription('https://push.example/hidden-current');
writeStoredPushVapidBinding(hiddenCurrent, base64Url(keyA));
subscribeCalls = 0;
const hiddenCurrentManager = {
  async getSubscription() { return hiddenCurrent; },
  async subscribe() { subscribeCalls += 1; throw new Error('la vinculación local vigente debe evitar una rotación innecesaria'); }
};
const hiddenCurrentResult = await client.ensurePushSubscriptionForCurrentVapidKey(
  { pushManager: hiddenCurrentManager },
  { enabled: true, publicKey: base64Url(keyA) },
  context
);
assert.equal(hiddenCurrentResult, hiddenCurrent);
assert.equal(hiddenCurrent.unsubscribeCalls, 0);
assert.equal(subscribeCalls, 0);
assert.equal(apiCalls.length, 0);

resetState();
const hiddenLegacy = hiddenKeySubscription('https://push.example/hidden-legacy');
const hiddenRenewed = subscriptionFor(keyB, 'https://push.example/hidden-renewed');
let hiddenActive = hiddenLegacy;
subscribeCalls = 0;
hiddenLegacy.unsubscribe = async function unsubscribe() {
  this.unsubscribeCalls += 1;
  hiddenActive = null;
  return true;
};
const hiddenLegacyManager = {
  async getSubscription() { return hiddenActive; },
  async subscribe(options) {
    subscribeCalls += 1;
    assert.equal(comparePushApplicationServerKeys(options.applicationServerKey, keyB), true);
    hiddenActive = hiddenRenewed;
    return hiddenRenewed;
  }
};
const hiddenLegacyResult = await client.ensurePushSubscriptionForCurrentVapidKey(
  { pushManager: hiddenLegacyManager },
  { enabled: true, publicKey: base64Url(keyB) },
  context
);
assert.equal(hiddenLegacyResult, hiddenRenewed);
assert.equal(hiddenLegacy.unsubscribeCalls, 1);
assert.equal(subscribeCalls, 1);
assert.deepEqual(apiCalls, [{
  path: '/api/push/unsubscribe',
  body: { endpoint: hiddenLegacy.endpoint }
}]);
assert.deepEqual(readStoredPushVapidBinding(), {
  endpoint: hiddenRenewed.endpoint,
  publicKey: base64Url(keyB)
});

resetState();
const stale = subscriptionFor(keyA);
const renewed = subscriptionFor(keyB, 'https://push.example/subscription-new');
let active = stale;
subscribeCalls = 0;
const rotatingManager = {
  async getSubscription() { return active; },
  async subscribe(options) {
    subscribeCalls += 1;
    assert.equal(comparePushApplicationServerKeys(options.applicationServerKey, keyB), true);
    active = renewed;
    return renewed;
  }
};
stale.unsubscribe = async function unsubscribe() {
  this.unsubscribeCalls += 1;
  active = null;
  return true;
};
const rotated = await client.ensurePushSubscriptionForCurrentVapidKey(
  { pushManager: rotatingManager },
  { enabled: true, publicKey: base64Url(keyB) },
  context
);
assert.equal(rotated, renewed);
assert.equal(stale.unsubscribeCalls, 1);
assert.equal(subscribeCalls, 1);
assert.deepEqual(apiCalls, [{
  path: '/api/push/unsubscribe',
  body: { endpoint: stale.endpoint }
}]);

resetState();
const concurrentStale = subscriptionFor(keyA, 'https://push.example/concurrent-old');
const concurrentCurrent = subscriptionFor(keyB, 'https://push.example/concurrent-new');
active = concurrentStale;
subscribeCalls = 0;
concurrentStale.unsubscribe = async function unsubscribe() {
  this.unsubscribeCalls += 1;
  active = concurrentCurrent;
  return false;
};
const concurrentManager = {
  async getSubscription() { return active; },
  async subscribe() { subscribeCalls += 1; throw new Error('otra pestaña ya renovó la suscripción'); }
};
const concurrentResult = await client.ensurePushSubscriptionForCurrentVapidKey(
  { pushManager: concurrentManager },
  { enabled: true, publicKey: base64Url(keyB) },
  context
);
assert.equal(concurrentResult, concurrentCurrent);
assert.equal(subscribeCalls, 0);
assert.equal(apiCalls.length, 1);

resetState();
const stuck = subscriptionFor(keyA, 'https://push.example/stuck-old');
const stuckManager = {
  async getSubscription() { return stuck; },
  async subscribe() { throw new Error('no debe crear otra mientras la anterior siga activa'); }
};
let stuckError = null;
try {
  await client.ensurePushSubscriptionForCurrentVapidKey(
    { pushManager: stuckManager },
    { enabled: true, publicKey: base64Url(keyB) },
    context
  );
} catch (error) {
  stuckError = error;
}
assert.equal(stuckError?.code, 'P2P_PUSH_VAPID_ROTATION_FAILED');
assert.equal(apiCalls.length, 1);

const resolveBegin = source.indexOf('  async resolvePushConfiguration(');
const resolveEnd = source.indexOf('  async ensurePushSubscriptionForCurrentVapidKey', resolveBegin);
const resolveBlock = source.slice(resolveBegin, resolveEnd);
assert.ok(resolveBlock.includes('if (this.pushConfigurationLoaded)'), 'El cliente no reutiliza la configuración Push ya incluida en bootstrap.');
assert.ok(resolveBlock.indexOf('if (this.pushConfigurationLoaded)') < resolveBlock.indexOf("await apiGet('/api/push/public-key')"), 'El GET de clave Push se ejecuta antes de intentar reutilizar bootstrap.');

const restoreBegin = source.indexOf('  async registerExistingPushSubscription()');
const restoreEnd = source.indexOf('  async detachPushSubscription(', restoreBegin);
const restoreBlock = source.slice(restoreBegin, restoreEnd);
assert.ok(restoreBlock.includes('const backendRegistrationFresh = storedPushBackendRegistrationIsFresh(subscription, keyData, sessionContext);'), 'El arranque no comprueba si la suscripción ya sigue vigente en backend.');
assert.ok(restoreBlock.includes('if (!backendRegistrationFresh) {'), 'El POST Push de arranque continúa siendo incondicional.');
assert.ok(restoreBlock.includes('markStoredPushBackendRegistration(subscription, keyData.publicKey, sessionContext);'), 'Un POST Push exitoso no deja una marca durable para evitar la siguiente respuesta HTTP.');

for (const required of [
  "await apiPost('/api/push/unsubscribe', { endpoint: staleEndpoint });",
  'comparePushApplicationServerKeys(',
  "error.code = 'P2P_PUSH_VAPID_ROTATION_FAILED';",
  'compareSubscriptionWithExpectedVapidKey(',
  'writeStoredPushVapidBinding(subscription, publicKey);',
  'const keyData = await apiGet(\'/api/push/public-key\');',
  'this.ensurePushSubscriptionForCurrentVapidKey(registration, keyData, sessionContext)'
]) {
  assert.ok(source.includes(required), `Falta la barrera de rotación Push: ${required}`);
}

console.log('OK: rotación VAPID segura y registro Push durable evitan GET/POST redundantes sin perder renovación por TTL.');
