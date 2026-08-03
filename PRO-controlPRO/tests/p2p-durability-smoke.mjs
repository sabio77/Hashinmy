import {
  calculateStorageDurability,
  inspectStorageDurability,
  requestPersistentStorage,
  formatStorageBytes
} from '../src/js/p2p-durability.js';

const persistent = calculateStorageDurability({
  supported: true,
  persistSupported: true,
  estimateSupported: true,
  persisted: true,
  quota: 1024 * 1024 * 1024,
  usage: 64 * 1024 * 1024
});
if (persistent.status !== 'persistent' || persistent.lowSpace || !persistent.persisted) {
  throw new Error('Un almacenamiento persistente y saludable fue clasificado como riesgoso.');
}

const lowSpace = calculateStorageDurability({
  supported: true,
  persistSupported: true,
  estimateSupported: true,
  persisted: true,
  quota: 100 * 1024 * 1024,
  usage: 96 * 1024 * 1024
});
if (lowSpace.status !== 'low-space' || !lowSpace.lowSpace || lowSpace.remainingBytes !== 4 * 1024 * 1024) {
  throw new Error('La cuota crítica no activó la alerta de espacio local.');
}

let persistCalls = 0;
const grantedManager = {
  persist: async () => { persistCalls += 1; return true; },
  persisted: async () => true,
  estimate: async () => ({ quota: 512 * 1024 * 1024, usage: 32 * 1024 * 1024 })
};
const granted = await requestPersistentStorage(grantedManager);
if (!granted.persisted || !granted.requestGranted || !granted.requestAttempted || persistCalls !== 1) {
  throw new Error('La solicitud de almacenamiento persistente no conservó su resultado.');
}

const deniedManager = {
  persist: async () => false,
  persisted: async () => false,
  estimate: async () => ({ quota: 512 * 1024 * 1024, usage: 16 * 1024 * 1024 })
};
const denied = await requestPersistentStorage(deniedManager);
if (denied.status !== 'best-effort' || denied.persisted || denied.requestGranted) {
  throw new Error('La denegación de persistencia no quedó visible como almacenamiento best-effort.');
}

const unsupported = await inspectStorageDurability({});
if (unsupported.status !== 'unsupported' || unsupported.persistSupported) {
  throw new Error('Un navegador sin StorageManager fue clasificado como protegido.');
}

const formatted = formatStorageBytes(1536 * 1024, 'en-US');
if (!/1\.5 MB/.test(formatted)) {
  throw new Error('La capacidad local no se presentó en una unidad legible.');
}

console.log('OK: persistencia local, cuota, denegación y navegadores sin StorageManager validados.');
