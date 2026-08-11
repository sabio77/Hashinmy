import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const serviceWorkerSource = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');

function createWorker(cacheNamespace, cacheNames = []) {
  const deleted = [];
  const listeners = new Map();
  const contextObject = {
    APP_SEED_METADATA: undefined,
    URL,
    Request,
    Response,
    AbortController,
    console,
    setTimeout,
    clearTimeout,
    importScripts() {},
    registration: {
      scope: cacheNamespace === 'semilla-appweb-pwa'
        ? 'https://hashinmy.com/'
        : `https://hashinmy.com/${cacheNamespace.split(':').slice(1).join(':').replace(/~/g, '/')}/`,
      navigationPreload: { async enable() {} }
    },
    location: { href: 'https://hashinmy.com/sw.js' },
    clients: {
      async claim() {},
      async matchAll() { return []; },
      async openWindow() { return null; }
    },
    skipWaiting: async () => {},
    addEventListener(type, listener) { listeners.set(type, listener); },
    caches: {
      async keys() { return cacheNames.slice(); },
      async delete(name) { deleted.push(name); return true; },
      async open() {
        return {
          async keys() { return []; },
          async delete() { return true; },
          async put() {},
          async match() { return null; }
        };
      },
      async match() { return null; }
    }
  };
  contextObject.self = contextObject;
  contextObject.APP_SEED_METADATA = {
    cacheNamespace,
    version: '1.9.50',
    build: 'cache-isolation-test',
    precacheUrls: []
  };

  const context = vm.createContext(contextObject);
  vm.runInContext(serviceWorkerSource, context, { filename: 'sw.js' });
  return { context, deleted, listeners };
}

async function assertOldCacheCleanup(cacheNamespace, names, expectedDeleted) {
  const worker = createWorker(cacheNamespace, names);
  assert.equal(typeof worker.context.deleteOldAppCaches, 'function');
  await worker.context.deleteOldAppCaches();
  assert.deepEqual(worker.deleted.sort(), expectedDeleted.slice().sort());
}

async function assertFullCacheCleanup(cacheNamespace, names, expectedDeleted) {
  const worker = createWorker(cacheNamespace, names);
  assert.equal(typeof worker.context.deleteAllAppCaches, 'function');
  await worker.context.deleteAllAppCaches();
  assert.deepEqual(worker.deleted.sort(), expectedDeleted.slice().sort());
}

await assertOldCacheCleanup('semilla-appweb-pwa', [
  'semilla-appweb-pwa-static-1.9.50-cache-isolation-test',
  'semilla-appweb-pwa-runtime-1.9.50-cache-isolation-test',
  'semilla-appweb-pwa-static-1.9.49-old',
  'semilla-appweb-pwa-runtime-1.9.49-old',
  'semilla-appweb-pwa:contabilidad-static-1.9.49-old',
  'semilla-appweb-pwa:contabilidad-runtime-1.9.49-old',
  'cache-de-otro-producto'
], [
  'semilla-appweb-pwa-static-1.9.49-old',
  'semilla-appweb-pwa-runtime-1.9.49-old'
]);

await assertFullCacheCleanup('semilla-appweb-pwa', [
  'semilla-appweb-pwa-static-1.9.50-cache-isolation-test',
  'semilla-appweb-pwa-runtime-1.9.50-cache-isolation-test',
  'semilla-appweb-pwa:contabilidad-static-1.9.50-cache-isolation-test',
  'semilla-appweb-pwa:contabilidad-runtime-1.9.50-cache-isolation-test'
], [
  'semilla-appweb-pwa-static-1.9.50-cache-isolation-test',
  'semilla-appweb-pwa-runtime-1.9.50-cache-isolation-test'
]);

await assertOldCacheCleanup('semilla-appweb-pwa:contabilidad', [
  'semilla-appweb-pwa:contabilidad-static-1.9.50-cache-isolation-test',
  'semilla-appweb-pwa:contabilidad-runtime-1.9.50-cache-isolation-test',
  'semilla-appweb-pwa:contabilidad-static-1.9.49-old',
  'semilla-appweb-pwa:contabilidad-runtime-1.9.49-old',
  'semilla-appweb-pwa:contabilidad-pro-static-1.9.49-old',
  'semilla-appweb-pwa:contabilidad-pro-runtime-1.9.49-old',
  'semilla-appweb-pwa-static-1.9.49-old'
], [
  'semilla-appweb-pwa:contabilidad-static-1.9.49-old',
  'semilla-appweb-pwa:contabilidad-runtime-1.9.49-old'
]);

console.log('OK: cada Service Worker elimina únicamente cachés static/runtime de su aplicación exacta, sin afectar la raíz ni carpetas con nombres prefijados.');
