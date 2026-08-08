import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../src/js/pwa-update-manager.js', import.meta.url), 'utf8');

function createStorage(seed = {}) {
  const values = new Map(Object.entries(seed));
  return {
    getItem(key) {
      return values.has(String(key)) ? values.get(String(key)) : null;
    },
    setItem(key, value) {
      values.set(String(key), String(value));
    },
    removeItem(key) {
      values.delete(String(key));
    }
  };
}

function versionKey(payload) {
  return [payload.version, payload.build, payload.releasedAt, payload.channel, payload.releaseId]
    .filter(Boolean)
    .join('|');
}

function createManager({ runtime, server, storedVersionKey }) {
  const replacements = [];
  const localStorage = createStorage({
    'semilla-appweb-pwa:last-version-key': storedVersionKey
  });
  const sessionStorage = createStorage();
  const documentListeners = new Map();

  const document = {
    readyState: 'loading',
    visibilityState: 'visible',
    getElementById() { return null; },
    querySelector() { return null; },
    dispatchEvent() {},
    addEventListener(type, handler) {
      documentListeners.set(type, handler);
    }
  };

  const window = {
    APP_SEED_METADATA: runtime,
    APP_SEED_CONFIG: {
      showUpdateStatus: false,
      multiTabCoordinationEnabled: false,
      directFingerprintFallbackEnabled: false,
      fingerprintCheckEnabled: false,
      releaseManifestAssetsEnabled: false,
      prefetchReleaseAssetsOnCheck: false,
      autoReloadDelayMs: 1,
      minimumSecondsBetweenAutoReloads: 1
    },
    location: {
      href: 'https://example.test/control-proyectos/',
      origin: 'https://example.test',
      replace(value) { replacements.push(String(value)); }
    },
    addEventListener() {}
  };

  const context = vm.createContext({
    window,
    document,
    navigator: { onLine: true },
    localStorage,
    sessionStorage,
    fetch: async () => ({
      ok: true,
      status: 200,
      async json() { return server; }
    }),
    URL,
    Date,
    Math,
    Object,
    Array,
    String,
    Number,
    Boolean,
    JSON,
    Promise,
    setTimeout,
    clearTimeout,
    console,
    CustomEvent: class CustomEvent {
      constructor(type, init = {}) {
        this.type = type;
        this.detail = init.detail;
      }
    }
  });

  vm.runInContext(source, context, { filename: 'pwa-update-manager.js' });
  return { manager: window.PWAUpdateManager, replacements, localStorage };
}

const oldRuntime = {
  version: '1.10.17',
  build: '2026-08-08-185',
  releasedAt: '2026-08-08T02:36:00-05:00',
  channel: 'stable',
  releaseId: 'semilla-appweb-pwa@1.10.17+2026-08-08-185',
  cacheNamespace: 'semilla-appweb-pwa'
};
const newServer = {
  version: '1.10.18',
  build: '2026-08-08-186',
  releasedAt: '2026-08-08T03:08:59-05:00',
  channel: 'stable',
  releaseId: 'semilla-appweb-pwa@1.10.18+2026-08-08-186'
};

// Simula la carrera real: otra pestaña ya escribió el release nuevo en localStorage,
// mientras esta pestaña sigue ejecutando el bundle anterior.
const stale = createManager({
  runtime: oldRuntime,
  server: newServer,
  storedVersionKey: versionKey(newServer)
});
assert.equal(await stale.manager.checkNow(), true, 'el runtime obsoleto debe detectar el release del servidor aunque localStorage ya esté actualizado');
await new Promise((resolve) => setTimeout(resolve, 10));
assert.equal(stale.replacements.length, 1, 'el runtime obsoleto debe programar una recarga limpia');
assert.match(stale.replacements[0], /app_updated=/, 'la recarga debe llevar el cache-buster existente');

const current = createManager({
  runtime: newServer,
  server: newServer,
  storedVersionKey: versionKey(newServer)
});
assert.equal(await current.manager.checkNow(), false, 'un runtime que ya ejecuta el release actual no debe recargarse');
await new Promise((resolve) => setTimeout(resolve, 10));
assert.equal(current.replacements.length, 0, 'el release vigente no debe entrar en un bucle de recarga');

console.log('OK: una pestaña PWA obsoleta se recupera aunque otra pestaña haya adelantado localStorage, sin recargar el runtime vigente.');
