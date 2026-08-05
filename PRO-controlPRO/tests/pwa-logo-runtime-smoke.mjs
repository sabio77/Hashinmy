import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = fs.readFileSync(path.join(ROOT, 'src/js/pwa-update-manager.js'), 'utf8');

function createStorage() {
  const values = new Map();
  return {
    getItem(key) {
      return values.has(String(key)) ? values.get(String(key)) : null;
    },
    setItem(key, value) {
      values.set(String(key), String(value));
    },
    removeItem(key) {
      values.delete(String(key));
    },
  };
}

function createRuntime() {
  const links = {
    favicon: { href: 'https://example.test/contabilidad/assets/logoAPP_32x32.png?v=old' },
    'apple-touch-icon': { href: 'https://example.test/contabilidad/assets/logoAPP_180x180.png?v=old' },
  };
  const identityEvents = [];
  const refreshedLogos = [];
  const reloads = [];
  const fetches = [];
  const windowListeners = new Map();
  const documentListeners = new Map();
  const serviceWorkerListeners = new Map();
  const registrationListeners = new Map();
  const localStorage = createStorage();
  const sessionStorage = createStorage();

  let payload = {
    version: '1.9.98',
    build: '2026-08-04-159',
    releasedAt: '2026-08-04T20:47:00-05:00',
    appIdentity: {
      iconVersion: 'logo-v1',
      interfaceLogo: './assets/logoAPP_192x192.png?v=logo-v1',
      favicon: './assets/logoAPP_32x32.png?v=logo-v1',
      appleTouchIcon: './assets/logoAPP_180x180.png?v=logo-v1',
      notificationIcon: './assets/logoAPP_192x192.png?v=logo-v1',
    },
    criticalAssets: [],
  };

  const registration = {
    active: null,
    waiting: null,
    installing: null,
    async update() {},
    addEventListener(type, handler) {
      registrationListeners.set(type, handler);
    },
  };

  const navigator = {
    onLine: true,
    serviceWorker: {
      controller: null,
      async register() {
        return registration;
      },
      addEventListener(type, handler) {
        serviceWorkerListeners.set(type, handler);
      },
    },
  };

  const document = {
    readyState: 'complete',
    visibilityState: 'visible',
    getElementById() {
      return null;
    },
    querySelector(selector) {
      const match = selector.match(/data-app-icon-role="([^"]+)"/);
      return match ? links[match[1]] || null : null;
    },
    addEventListener(type, handler) {
      documentListeners.set(type, handler);
    },
    dispatchEvent(event) {
      identityEvents.push(event);
      return true;
    },
  };

  const location = {
    href: 'https://example.test/contabilidad/index.html',
    origin: 'https://example.test',
    replace(value) {
      reloads.push(String(value));
    },
  };

  const window = {
    document,
    navigator,
    location,
    crypto: webcrypto,
    APP_SEED_METADATA: {
      appName: 'Control de proyectos',
      cacheNamespace: 'semilla-appweb-pwa:contabilidad',
      version: payload.version,
      build: payload.build,
      releasedAt: payload.releasedAt,
    },
    APP_SEED_CONFIG: {
      showUpdateStatus: false,
      multiTabCoordinationEnabled: false,
      updateCheckOnFocus: false,
      updateCheckOnOnline: false,
      updateCheckOnPageShow: false,
      directFingerprintFallbackEnabled: false,
      fingerprintCheckEnabled: false,
      autoReloadWhenVersionChanges: true,
      autoReloadDelayMs: 0,
    },
    AppAssetLoader: {
      refreshAppIdentity(url) {
        refreshedLogos.push(String(url));
      },
    },
    addEventListener(type, handler) {
      windowListeners.set(type, handler);
    },
  };

  class CustomEvent {
    constructor(type, options = {}) {
      this.type = type;
      this.detail = options.detail;
    }
  }

  async function fetch(url, options) {
    fetches.push({ url: String(url), options });
    return {
      ok: true,
      status: 200,
      async json() {
        return JSON.parse(JSON.stringify(payload));
      },
    };
  }

  const context = vm.createContext({
    window,
    document,
    navigator,
    location,
    localStorage,
    sessionStorage,
    fetch,
    CustomEvent,
    URL,
    Uint8Array,
    ArrayBuffer,
    Promise,
    Object,
    String,
    Number,
    Boolean,
    Array,
    Date,
    Math,
    JSON,
    Map,
    Set,
    console,
    setTimeout,
    clearTimeout,
  });

  vm.runInContext(SOURCE, context, { filename: 'pwa-update-manager.js' });

  return {
    window,
    links,
    identityEvents,
    refreshedLogos,
    reloads,
    fetches,
    localStorage,
    setPayload(nextPayload) {
      payload = nextPayload;
    },
  };
}

async function waitFor(predicate, message) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  assert.fail(message);
}

const runtime = createRuntime();
await waitFor(
  () => Boolean(runtime.window.PWAUpdateManager?.lastServerPayload),
  'El gestor PWA debe completar la verificación inicial de version.json.',
);

assert.match(runtime.fetches[0].url, /version\.json\?/, 'La identidad debe consultarse con una petición no-store versionada.');
assert.equal(
  runtime.links.favicon.href,
  'https://example.test/contabilidad/assets/logoAPP_32x32.png?v=logo-v1',
  'El favicon debe actualizarse inmediatamente con la URL versionada publicada.',
);
assert.equal(
  runtime.links['apple-touch-icon'].href,
  'https://example.test/contabilidad/assets/logoAPP_180x180.png?v=logo-v1',
  'El Apple Touch icon debe actualizarse inmediatamente con la URL versionada publicada.',
);
assert.deepEqual(
  runtime.refreshedLogos,
  ['https://example.test/contabilidad/assets/logoAPP_192x192.png?v=logo-v1'],
  'El logo visible debe refrescarse mediante el cargador de assets.',
);
assert.equal(runtime.identityEvents.length, 1, 'Debe emitirse un evento cuando cambia la identidad visual.');
assert.equal(runtime.identityEvents[0].type, 'app-identity-updated');
assert.equal(runtime.reloads.length, 0, 'La primera captura de identidad no debe forzar una recarga.');

await runtime.window.PWAUpdateManager.checkNow();
assert.equal(runtime.refreshedLogos.length, 1, 'Una identidad idéntica no debe rehidratar el logo repetidamente.');
assert.equal(runtime.identityEvents.length, 1, 'Una identidad idéntica no debe duplicar eventos.');

runtime.setPayload({
  version: '1.9.98',
  build: '2026-08-04-159',
  releasedAt: '2026-08-04T20:47:00-05:00',
  appIdentity: {
    iconVersion: 'logo-v2',
    interfaceLogo: './assets/logoAPP_192x192.png?v=logo-v2',
    favicon: './assets/logoAPP_32x32.png?v=logo-v2',
    appleTouchIcon: './assets/logoAPP_180x180.png?v=logo-v2',
    notificationIcon: './assets/logoAPP_192x192.png?v=logo-v2',
  },
  criticalAssets: [],
});

const semanticVersionChanged = await runtime.window.PWAUpdateManager.checkNow();
assert.equal(semanticVersionChanged, false, 'Cambiar únicamente el logo no debe simular una versión semántica distinta.');
assert.equal(
  runtime.links.favicon.href,
  'https://example.test/contabilidad/assets/logoAPP_32x32.png?v=logo-v2',
  'El favicon debe adoptar la nueva huella aun sin cambiar la versión de la app.',
);
assert.equal(
  runtime.links['apple-touch-icon'].href,
  'https://example.test/contabilidad/assets/logoAPP_180x180.png?v=logo-v2',
  'El Apple Touch icon debe adoptar la nueva huella aun sin cambiar la versión de la app.',
);
assert.equal(
  runtime.refreshedLogos.at(-1),
  'https://example.test/contabilidad/assets/logoAPP_192x192.png?v=logo-v2',
  'El logo visible debe adoptar la nueva huella aun sin cambiar la versión de la app.',
);
assert.equal(runtime.identityEvents.length, 2, 'El cambio real de identidad debe emitir un nuevo evento.');
assert.equal(runtime.reloads.length, 0, 'La sincronización visual no debe depender de una recarga destructiva.');

console.log('OK: actualización dinámica de favicon, Apple Touch icon y logo visible validada sin cambiar la versión semántica.');
