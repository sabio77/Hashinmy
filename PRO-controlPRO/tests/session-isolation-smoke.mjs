import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

class MemoryStorage {
  constructor() { this.values = new Map(); }
  getItem(key) { return this.values.has(key) ? this.values.get(key) : null; }
  setItem(key, value) { this.values.set(key, String(value)); }
  removeItem(key) { this.values.delete(key); }
}

class FakeWindow {
  constructor() {
    this.localStorage = new MemoryStorage();
    this.APP_SEED_CONFIG = { backendUrl: 'https://backend.example.test' };
    this.location = { hostname: 'app.example.test' };
    this.listeners = new Map();
  }
  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) || new Set();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }
  removeEventListener(type, listener) { this.listeners.get(type)?.delete(listener); }
  dispatchStorage(key, oldValue, newValue) {
    for (const listener of this.listeners.get('storage') || []) listener({ key, oldValue, newValue });
  }
  setTimeout(callback, delay) { return globalThis.setTimeout(callback, delay); }
  clearTimeout(timer) { globalThis.clearTimeout(timer); }
}

const windowRef = new FakeWindow();
globalThis.window = windowRef;

const api = await import(`../src/js/api.js?session-isolation=${Date.now()}`);
const {
  SESSION_CHANGED_ERROR_CODE,
  SESSION_STORAGE_KEY,
  apiPost,
  clearSessionToken,
  getSessionToken,
  setSessionToken,
  subscribeSessionTokenChanges
} = api;

const observedChanges = [];
const unsubscribe = subscribeSessionTokenChanges((change) => observedChanges.push(change), { windowRef });
windowRef.dispatchStorage(SESSION_STORAGE_KEY, 'token_anterior', 'token_nuevo');
windowRef.dispatchStorage('otra_clave', 'a', 'b');
unsubscribe();
if (observedChanges.length !== 1 || observedChanges[0].previousToken !== 'token_anterior' || observedChanges[0].token !== 'token_nuevo') {
  throw new Error('Los cambios de sesión entre ventanas no se detectaron de forma aislada.');
}

setSessionToken('token_cuenta_a');
let resolveAuthenticatedFetch;
let authenticatedHeaders;
globalThis.fetch = (_url, options = {}) => {
  authenticatedHeaders = options.headers;
  return new Promise((resolve) => { resolveAuthenticatedFetch = resolve; });
};
const staleRequest = apiPost('/api/p2p/bootstrap', { device: { deviceId: 'dev_a' } });
await new Promise((resolve) => setTimeout(resolve, 0));
setSessionToken('token_cuenta_b');
resolveAuthenticatedFetch(new Response(JSON.stringify({ ok: true, spaces: [{ spaceId: 'space_cuenta_a' }] }), {
  status: 200,
  headers: { 'Content-Type': 'application/json' }
}));
let staleError = null;
try {
  await staleRequest;
} catch (error) {
  staleError = error;
}
if (staleError?.code !== SESSION_CHANGED_ERROR_CODE || authenticatedHeaders?.get('X-Session-Token') !== 'token_cuenta_a') {
  throw new Error('Una respuesta autenticada de la cuenta anterior pudo continuar después del cambio de token.');
}

if (clearSessionToken('token_cuenta_a') !== false || getSessionToken() !== 'token_cuenta_b') {
  throw new Error('Un cierre tardío pudo borrar el token más reciente de otra ventana.');
}

setSessionToken('');
let resolvePublicFetch;
globalThis.fetch = () => new Promise((resolve) => { resolvePublicFetch = resolve; });
const publicRequest = apiPost('/api/config-probe', {});
await new Promise((resolve) => setTimeout(resolve, 0));
setSessionToken('token_posterior');
resolvePublicFetch(new Response(JSON.stringify({ ok: true, public: true }), {
  status: 200,
  headers: { 'Content-Type': 'application/json' }
}));
const publicResult = await publicRequest;
if (publicResult.public !== true) {
  throw new Error('Una solicitud pública quedó enlazada incorrectamente a una sesión inexistente.');
}

const pushBindingMessages = [];
const serviceWorkerController = {
  postMessage(message, ports = []) {
    pushBindingMessages.push(message);
    ports[0]?.postMessage({
      type: 'P2P_PUSH_ACCOUNT_BINDING_RESULT',
      requestId: message.requestId,
      ok: true,
      changed: true
    });
  }
};
Object.defineProperty(globalThis, 'navigator', {
  configurable: true,
  value: {
    onLine: true,
    platform: 'Prueba',
    serviceWorker: {
      controller: serviceWorkerController,
      ready: Promise.resolve({ active: serviceWorkerController }),
      getRegistration: async () => null
    }
  }
});
windowRef.dispatchEvent = () => true;
windowRef.matchMedia = () => ({ matches: false });

const { SemillaP2PClient } = await import(`../src/js/p2p-client.js?push-detach=${Date.now()}`);
const pushClient = new SemillaP2PClient();
let unsubscribeCalls = 0;
let receivedUnsubscribeBody = null;
let activeSubscription = {
  endpoint: 'https://push.example.test/subscription-a',
  unsubscribe: async () => { unsubscribeCalls += 1; return true; }
};
globalThis.navigator.serviceWorker.getRegistration = async () => ({
  pushManager: { getSubscription: async () => activeSubscription }
});

pushClient.user = { userId: 'user_push_a' };
pushClient.deviceId = 'dev_push_a_0001';
setSessionToken('token_push_a');
globalThis.fetch = async (_url, options = {}) => {
  receivedUnsubscribeBody = JSON.parse(String(options.body || '{}'));
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
};
const detachedByBackend = await pushClient.detachPushSubscription({ browserFallback: true });
if (!detachedByBackend.backendReleased || detachedByBackend.browserUnsubscribed || unsubscribeCalls !== 0
  || receivedUnsubscribeBody?.endpoint !== activeSubscription.endpoint) {
  throw new Error('El cierre no liberó la asociación Push en el backend antes de conservar la suscripción reutilizable del navegador.');
}
if (!detachedByBackend.accountBindingCleared || pushBindingMessages.at(-1)?.action !== 'clear'
  || pushBindingMessages.at(-1)?.expectedUserId !== 'user_push_a'
  || pushBindingMessages.at(-1)?.expectedDeviceId !== 'dev_push_a_0001') {
  throw new Error('El cierre autenticado no retiró el vínculo Push de la cuenta que terminó sesión.');
}

pushClient.user = { userId: 'user_push_offline' };
pushClient.deviceId = 'dev_push_offline_0001';
setSessionToken('token_push_offline');
unsubscribeCalls = 0;
globalThis.fetch = async () => { throw new TypeError('Sin red'); };
const detachedLocally = await pushClient.detachPushSubscription({ browserFallback: true });
if (!detachedLocally.browserUnsubscribed || detachedLocally.backendReleased || unsubscribeCalls !== 1) {
  throw new Error('Un cierre sin conexión dejó activa la suscripción Push local de la cuenta anterior.');
}
if (!detachedLocally.accountBindingCleared || pushBindingMessages.at(-1)?.expectedUserId !== 'user_push_offline'
  || pushBindingMessages.at(-1)?.expectedDeviceId !== 'dev_push_offline_0001') {
  throw new Error('La baja Push sin conexión dejó el Service Worker vinculado a la cuenta anterior.');
}

pushClient.user = { userId: 'user_push_old' };
pushClient.deviceId = 'dev_push_old_0001';
setSessionToken('token_push_old');
unsubscribeCalls = 0;
globalThis.fetch = async () => {
  setSessionToken('token_push_new');
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
};
const changedDuringDetach = await pushClient.detachPushSubscription({ browserFallback: true });
if (!changedDuringDetach.sessionChanged || unsubscribeCalls !== 0 || getSessionToken() !== 'token_push_new') {
  throw new Error('Una baja Push tardía pudo desactivar la suscripción ya adoptada por una cuenta nueva.');
}
if (!changedDuringDetach.accountBindingCleared || pushBindingMessages.at(-1)?.expectedUserId !== 'user_push_old'
  || pushBindingMessages.at(-1)?.expectedDeviceId !== 'dev_push_old_0001') {
  throw new Error('La baja tardía no quedó cercada por la identidad de la cuenta que la inició.');
}

pushClient.user = { userId: 'user_push_residual' };
pushClient.deviceId = 'dev_push_residual_0001';
setSessionToken('');
unsubscribeCalls = 0;
globalThis.fetch = async () => { throw new Error('No debe consultar el backend sin sesión.'); };
const detachedWithoutSession = await pushClient.detachPushSubscription({ browserFallback: true });
if (!detachedWithoutSession.browserUnsubscribed || unsubscribeCalls !== 1) {
  throw new Error('Una sesión ya inválida no retiró localmente el endpoint Push residual.');
}
if (!detachedWithoutSession.accountBindingCleared || pushBindingMessages.at(-1)?.expectedUserId !== 'user_push_residual'
  || pushBindingMessages.at(-1)?.expectedDeviceId !== 'dev_push_residual_0001') {
  throw new Error('La limpieza local residual no retiró el vínculo Push de su cuenta original.');
}

let recreatedSubscribeCalls = 0;
let registeredRecreatedSubscription = null;
const recreatedSubscription = {
  endpoint: 'https://push.example.test/subscription-recreated',
  toJSON: () => ({
    endpoint: 'https://push.example.test/subscription-recreated',
    keys: { p256dh: 'p256dh', auth: 'auth' }
  })
};
const pushManager = {
  getSubscription: async () => null,
  subscribe: async (options = {}) => {
    if (options.userVisibleOnly !== true || !(options.applicationServerKey instanceof Uint8Array)) {
      throw new Error('La recreación Push no usó la clave pública del backend.');
    }
    recreatedSubscribeCalls += 1;
    return recreatedSubscription;
  }
};
globalThis.Notification = { permission: 'granted' };
windowRef.Notification = globalThis.Notification;
windowRef.atob = globalThis.atob;
globalThis.navigator.serviceWorker.ready = Promise.resolve({ pushManager, active: serviceWorkerController });
pushClient.started = true;
pushClient.user = { userId: 'user_push_recreated' };
pushClient.deviceId = 'dev_push_recreated';
pushClient.sessionGeneration = 1;
setSessionToken('token_push_recreated');
globalThis.fetch = async (url, options = {}) => {
  if (String(url).endsWith('/api/push/public-key')) {
    return new Response(JSON.stringify({ ok: true, enabled: true, publicKey: 'AQID' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  if (String(url).endsWith('/api/push/subscribe')) {
    registeredRecreatedSubscription = JSON.parse(String(options.body || '{}')).subscription || null;
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  throw new Error(`Ruta Push inesperada: ${url}`);
};
const pushRestored = await pushClient.registerExistingPushSubscription();
if (!pushRestored || recreatedSubscribeCalls !== 1 || registeredRecreatedSubscription?.endpoint !== recreatedSubscription.endpoint) {
  throw new Error('La baja local de seguridad dejó las notificaciones desactivadas después del siguiente acceso autorizado.');
}
const recreatedBindingMessage = pushBindingMessages.findLast((message) => message.action === 'set');
if (recreatedBindingMessage?.userId !== 'user_push_recreated'
  || recreatedBindingMessage?.deviceId !== 'dev_push_recreated') {
  throw new Error('La suscripción recreada se registró sin vincular primero la cuenta activa en el Service Worker.');
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [clientSource, appSource] = await Promise.all([
  fs.readFile(path.join(root, 'src/js/p2p-client.js'), 'utf8'),
  fs.readFile(path.join(root, 'src/js/app.js'), 'utf8')
]);
for (const required of [
  'sessionToken: getSessionToken()',
  "String(context.sessionToken || '') === getSessionToken()",
  'isSessionChangedError(error)',
  "type: 'P2P_PUSH_ACCOUNT_BINDING'",
  'requireServiceWorkerPushAccountBinding(sessionContext.userId, sessionContext.deviceId)'
]) {
  if (!clientSource.includes(required)) throw new Error(`Falta el límite de sesión P2P: ${required}`);
}
for (const required of [
  'subscribeSessionTokenChanges',
  'synchronizeExternalSession',
  'await semillaP2P.detachPushSubscription({ browserFallback: true })',
  'await semillaP2P.stop()',
  'resetUserScopedInterface()',
  'clearSessionToken(logoutToken)'
]) {
  if (!appSource.includes(required)) throw new Error(`Falta la transición segura de cuenta en la interfaz: ${required}`);
}

const logoutSource = appSource.slice(appSource.indexOf('async function logout()'), appSource.indexOf('function openProjectForm'));
if (logoutSource.indexOf('detachPushSubscription') < 0 || logoutSource.indexOf('detachPushSubscription') > logoutSource.indexOf('semillaP2P.stop')) {
  throw new Error('El logout detiene la sesión antes de poder liberar su asociación Push autenticada.');
}
if (!logoutSource.includes('if (logoutToken && getSessionToken() === logoutToken)')) {
  throw new Error('El logout puede enviar la baja del backend usando el token de una cuenta nueva.');
}
if (!appSource.includes('if (!clearSessionToken(expiredToken)) throw createSessionChangedError()')) {
  throw new Error('Una sesión vencida puede borrar un token nuevo mientras libera la asociación Push anterior.');
}
if (!appSource.includes('if (transitionSequence !== state.sessionTransitionSequence || getSessionToken() !== token) return false;')) {
  throw new Error('La sincronización externa no vuelve a cercar la sesión después de esperar la baja Push.');
}

console.log('OK: aislamiento por token, vínculo Push por cuenta e instalación, baja y restauración seguras, descarte de respuestas tardías y cambio entre ventanas validados.');
