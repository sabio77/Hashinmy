import fs from 'node:fs';
import vm from 'node:vm';

const managerSource = fs.readFileSync(new URL('../src/js/pwa-update-manager.js', import.meta.url), 'utf8');

class MemoryStorage {
  constructor() { this.values = new Map(); }
  getItem(key) { return this.values.has(String(key)) ? this.values.get(String(key)) : null; }
  setItem(key, value) { this.values.set(String(key), String(value)); }
  removeItem(key) { this.values.delete(String(key)); }
}

class FakeEventTarget {
  constructor() { this.listeners = new Map(); }
  addEventListener(type, listener) {
    const key = String(type);
    if (!this.listeners.has(key)) this.listeners.set(key, new Set());
    this.listeners.get(key).add(listener);
  }
  dispatch(type, event = {}) {
    for (const listener of this.listeners.get(String(type)) || []) listener(event);
  }
}

class FakeWorker extends FakeEventTarget {
  constructor(scriptURL) {
    super();
    this.scriptURL = scriptURL;
    this.state = 'activated';
    this.messages = [];
  }
  postMessage(message) { this.messages.push(message); }
}

class FakeBroadcastChannel extends FakeEventTarget {
  static instances = [];

  constructor(name) {
    super();
    this.name = String(name);
    this.messages = [];
    FakeBroadcastChannel.instances.push(this);
  }

  postMessage(message) {
    this.messages.push(message);
  }
}

const wait = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));
const appUrl = 'https://app.example.test/control-proyectos/';
const activeWorker = new FakeWorker(`${appUrl}sw.js`);
const serviceWorker = new FakeEventTarget();
serviceWorker.controller = activeWorker;

const registration = new FakeEventTarget();
registration.active = activeWorker;
registration.waiting = null;
registration.installing = null;
let registrationUpdateCalls = 0;
registration.update = async () => {
  registrationUpdateCalls += 1;
  return registration;
};
serviceWorker.register = async () => registration;

let serverRelease = {
  releaseId: 'semilla-appweb-pwa@1.0.0+build-1',
  version: '1.0.0',
  build: 'build-1',
  releasedAt: '2026-08-17T19:00:00-05:00',
  channel: 'stable',
  criticalAssets: []
};

const replacements = [];
let versionFetchCalls = 0;
const windowTarget = new FakeEventTarget();
const documentTarget = new FakeEventTarget();
const localStorage = new MemoryStorage();
const sessionStorage = new MemoryStorage();

const location = {
  href: appUrl,
  origin: 'https://app.example.test',
  pathname: '/control-proyectos/',
  search: '',
  hash: '',
  replace(value) {
    replacements.push(String(value));
    this.href = String(value);
  }
};

const windowObject = Object.assign(windowTarget, {
  APP_SEED_METADATA: {
    appName: 'Semilla App Web',
    version: '1.0.0',
    build: 'build-1',
    releasedAt: '2026-08-17T19:00:00-05:00',
    updateChannel: 'stable',
    cacheNamespace: 'pwa-deploy-only-test'
  },
  APP_SEED_CONFIG: {
    versionEndpoint: './version.json',
    serviceWorkerPath: './sw.js',
    periodicUpdateChecksEnabled: false,
    updateCheckIntervalMs: 0,
    updateCheckOnFocus: true,
    updateCheckOnOnline: true,
    updateCheckOnPageShow: true,
    autoReloadWhenVersionChanges: true,
    autoReloadDelayMs: 1,
    minimumSecondsBetweenAutoReloads: 0,
    showUpdateStatus: false,
    multiTabCoordinationEnabled: false,
    releaseManifestAssetsEnabled: true,
    prefetchReleaseAssetsOnCheck: false,
    directFingerprintFallbackEnabled: false,
    fingerprintCheckEnabled: false
  },
  location,
  navigator: null,
  BroadcastChannel: FakeBroadcastChannel,
  matchMedia: () => ({ matches: false, addEventListener() {}, addListener() {} })
});

const documentObject = Object.assign(documentTarget, {
  readyState: 'complete',
  visibilityState: 'visible',
  getElementById: () => null
});

const navigatorObject = {
  onLine: true,
  serviceWorker,
  standalone: false
};
windowObject.navigator = navigatorObject;

const context = vm.createContext({
  window: windowObject,
  document: documentObject,
  navigator: navigatorObject,
  localStorage,
  sessionStorage,
  URL,
  Date,
  Math,
  JSON,
  Object,
  Array,
  String,
  Number,
  Boolean,
  Promise,
  console,
  BroadcastChannel: FakeBroadcastChannel,
  setTimeout,
  clearTimeout,
  fetch: async () => {
    versionFetchCalls += 1;
    return {
    ok: true,
    status: 200,
    json: async () => JSON.parse(JSON.stringify(serverRelease))
    };
  }
});

vm.runInContext(managerSource, context, { filename: 'pwa-update-manager.js' });
await wait(10);

if (replacements.length !== 0) {
  throw new Error('La carga inicial no puede recargar la interfaz sin un deploy nuevo.');
}
if (versionFetchCalls !== 1) {
  throw new Error(`El arranque debe consultar version.json una sola vez; recibidas: ${versionFetchCalls}.`);
}
if (registrationUpdateCalls !== 0) {
  throw new Error(`El arranque no debe duplicar la comprobación con registration.update(); recibidas: ${registrationUpdateCalls}.`);
}

for (let index = 0; index < 40; index += 1) {
  windowTarget.dispatch('focus');
  documentTarget.dispatch('visibilitychange');
  windowTarget.dispatch('pageshow', { persisted: false });
}
await wait(10);
if (versionFetchCalls !== 1) {
  throw new Error(`focus/visibility/pageshow repetidos deben quedar agrupados por cooldown; consultas: ${versionFetchCalls}.`);
}
if (registrationUpdateCalls !== 0) {
  throw new Error('Las señales pasivas no deben ejecutar registration.update().');
}

await windowObject.PWAUpdateManager.checkNow();
await wait(5);
if (versionFetchCalls !== 2 || registrationUpdateCalls !== 1) {
  throw new Error(`La comprobación manual debe forzar exactamente version.json + registration.update(); fetch=${versionFetchCalls}, update=${registrationUpdateCalls}.`);
}

serviceWorker.dispatch('controllerchange');
await wait(10);
if (replacements.length !== 0) {
  throw new Error('controllerchange recargó la interfaz sin cambio de version.json.');
}

const installingWorker = new FakeWorker(`${appUrl}sw.js`);
installingWorker.state = 'installing';
registration.installing = installingWorker;
registration.dispatch('updatefound');
installingWorker.state = 'installed';
installingWorker.dispatch('statechange');
await wait(10);
if (replacements.length !== 0) {
  throw new Error('updatefound/installed recargó la interfaz sin deploy confirmado.');
}
registration.installing = null;

const updateChannel = FakeBroadcastChannel.instances[0];
if (!updateChannel) {
  throw new Error('La prueba esperaba coordinación BroadcastChannel activa.');
}
updateChannel.dispatch('message', {
  data: {
    type: 'UPDATE_FOUND',
    fromTabId: 'otra-pestana',
    deploymentKey: 'release-falso-sin-deploy',
    reason: 'mensaje-no-confiable'
  }
});
await wait(10);
if (replacements.length !== 0) {
  throw new Error('Un mensaje UPDATE_FOUND de otra pestaña no puede recargar sin confirmar version.json.');
}

serverRelease = {
  ...serverRelease,
  releaseId: 'semilla-appweb-pwa@1.0.0+build-2',
  build: 'build-2',
  releasedAt: '2026-08-17T19:05:00-05:00'
};
updateChannel.dispatch('message', {
  data: {
    type: 'UPDATE_FOUND',
    fromTabId: 'otra-pestana',
    deploymentKey: 'solo-es-una-pista',
    reason: 'deploy-detectado-en-otra-pestana'
  }
});
await wait(20);

if (replacements.length !== 1) {
  throw new Error(`Un deploy nuevo debía producir exactamente una recarga; recibidas: ${replacements.length}.`);
}
if (!new URL(replacements[0]).searchParams.has('app_updated')) {
  throw new Error('La recarga confirmada por deploy perdió el cache-buster app_updated.');
}
if (registrationUpdateCalls !== 2) {
  throw new Error(`Un deploy confirmado sin worker nuevo debe actualizar sw.js exactamente una vez antes de recargar; update=${registrationUpdateCalls}.`);
}

console.log('OK: señales PWA repetidas se agrupan sin HTTP redundante; revisión manual y deploy conservan frescura del Service Worker sin duplicar comprobaciones pasivas.');
