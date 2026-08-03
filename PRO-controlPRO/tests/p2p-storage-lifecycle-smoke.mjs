import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const currentFile = fileURLToPath(import.meta.url);
const sourcePath = path.resolve(path.dirname(currentFile), '../src/js/p2p-storage.js');
const source = await fs.readFile(sourcePath, 'utf8');
const testSource = `${source}\nexport { normalizeStorageError };`;
const moduleUrl = `data:text/javascript;base64,${Buffer.from(testSource).toString('base64')}`;

const dispatched = [];
globalThis.window = { dispatchEvent: (event) => { dispatched.push(event); return true; } };
globalThis.CustomEvent = class CustomEvent {
  constructor(type, options = {}) {
    this.type = type;
    this.detail = options.detail;
  }
};

let openCalls = 0;
const openedDatabases = [];
globalThis.indexedDB = {
  open() {
    openCalls += 1;
    const request = {};
    queueMicrotask(() => {
      if (openCalls === 1) {
        request.error = { name: 'UnknownError', message: 'fallo temporal de apertura' };
        request.onerror?.();
        return;
      }
      const database = {
        closed: false,
        objectStoreNames: { contains: () => true },
        close() { this.closed = true; },
        onversionchange: null,
        onclose: null
      };
      openedDatabases.push(database);
      request.result = database;
      request.onsuccess?.();
    });
    return request;
  }
};

const {
  setP2PStorageUser,
  openP2PDatabase,
  normalizeStorageError
} = await import(moduleUrl);

await setP2PStorageUser('cuenta@example.com');
await openP2PDatabase().then(
  () => { throw new Error('La primera apertura simulada debía fallar.'); },
  () => null
);

const recovered = await openP2PDatabase();
if (!recovered || openCalls !== 2) {
  throw new Error('Una apertura fallida quedó cacheada e impidió el reintento de IndexedDB.');
}

recovered.onversionchange?.();
if (!recovered.closed) {
  throw new Error('La conexión local no se cerró ante un cambio de versión.');
}
const reopened = await openP2PDatabase();
if (!reopened || reopened === recovered || openCalls !== 3) {
  throw new Error('IndexedDB no volvió a abrir después de liberar una versión obsoleta.');
}

const quotaError = normalizeStorageError({
  name: 'QuotaExceededError',
  message: 'Quota exceeded'
});
if (quotaError.name !== 'P2PStorageQuotaError'
  || quotaError.code !== 'P2P_STORAGE_QUOTA_EXCEEDED'
  || quotaError.status !== 507) {
  throw new Error('El agotamiento de cuota no produjo un error local estable y procesable.');
}
if (!dispatched.some((event) => event.type === 'p2p:storage-risk' && event.detail?.reason === 'quota-exceeded')) {
  throw new Error('La interfaz no recibió la señal de riesgo al agotarse la cuota local.');
}

console.log('OK: reintento de IndexedDB, cambio de versión y señal de cuota validados.');
