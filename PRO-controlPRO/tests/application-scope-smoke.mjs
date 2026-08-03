import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const metadataSource = fs.readFileSync(path.join(root, 'src/js/app-metadata.js'), 'utf8');

function browserMetadata(scriptUrl) {
  const window = { location: { href: scriptUrl } };
  const context = vm.createContext({
    window,
    document: { currentScript: { src: scriptUrl }, baseURI: new URL('../../', scriptUrl).toString() },
    URL,
    self: undefined
  });
  vm.runInContext(metadataSource, context, { filename: 'app-metadata.js' });
  return window.APP_SEED_METADATA;
}

function workerMetadata(scope) {
  const self = { registration: { scope }, location: { href: `${scope}sw.js` } };
  const context = vm.createContext({ self, URL });
  vm.runInContext(metadataSource, context, { filename: 'app-metadata.js' });
  return self.APP_SEED_METADATA;
}

const accounting = browserMetadata('https://hashinmy.com/contabilidad/src/js/app-metadata.js');
const billing = browserMetadata('https://hashinmy.com/facturacion/src/js/app-metadata.js');
const rootApp = browserMetadata('https://hashinmy.com/src/js/app-metadata.js');
const nestedWorker = workerMetadata('https://hashinmy.com/suite/inventario/');

assert.equal(accounting.applicationId, 'contabilidad');
assert.equal(accounting.applicationBaseUrl, 'https://hashinmy.com/contabilidad/');
assert.equal(billing.applicationId, 'facturacion');
assert.equal(rootApp.applicationId, 'root');
assert.equal(rootApp.cacheNamespace, 'semilla-appweb-pwa');
assert.equal(nestedWorker.applicationId, 'suite/inventario');
assert.notEqual(accounting.cacheNamespace, billing.cacheNamespace);
assert.equal(nestedWorker.cacheNamespace.endsWith(':suite~inventario'), true);

globalThis.APP_SEED_METADATA = accounting;
const moduleUrl = pathToFileURL(path.join(root, 'src/js/application-scope.js')).href;
const accountingScope = await import(`${moduleUrl}?scope=accounting`);
assert.equal(accountingScope.P2P_APPLICATION_ID, 'contabilidad');
assert.equal(accountingScope.scopedStorageKey('session'), 'session:contabilidad');
assert.equal(accountingScope.scopedChannelName('updates'), 'updates:contabilidad');
assert.equal(accountingScope.normalizeApplicationId('/Suite/Inventario/'), 'Suite/Inventario');
assert.equal(accountingScope.normalizeApplicationId('../escape'), '');

globalThis.APP_SEED_METADATA = rootApp;
const rootScope = await import(`${moduleUrl}?scope=root`);
assert.equal(rootScope.scopedStorageKey('semilla_google_session_token'), 'semilla_google_session_token');
assert.equal(rootScope.scopedChannelName('semilla-appweb-pwa-updates'), 'semilla-appweb-pwa-updates');

globalThis.APP_SEED_METADATA = billing;
const billingScope = await import(`${moduleUrl}?scope=billing`);
assert.equal(billingScope.P2P_APPLICATION_ID, 'facturacion');
assert.notEqual(
  accountingScope.scopedStorageKey('semilla_google_session_token'),
  billingScope.scopedStorageKey('semilla_google_session_token')
);

const apiSource = fs.readFileSync(path.join(root, 'src/js/api.js'), 'utf8');
const clientSource = fs.readFileSync(path.join(root, 'src/js/p2p-client.js'), 'utf8');
const storageSource = fs.readFileSync(path.join(root, 'src/js/p2p-storage.js'), 'utf8');
const cryptoSource = fs.readFileSync(path.join(root, 'src/js/p2p-crypto.js'), 'utf8');
assert.match(apiSource, /X-P2P-Application/);
const appSource = fs.readFileSync(path.join(root, 'src/js/app.js'), 'utf8');
assert.match(appSource, /approvedApplication/);
assert.match(clientSource, /p2pApplication=/);
assert.match(storageSource, /P2P_APPLICATION_STORAGE_SCOPE/);
assert.match(cryptoSource, /P2P_APPLICATION_STORAGE_SCOPE/);

console.log('OK: la carpeta de cada app define un alcance automático y separa API, SSE, sesión, IndexedDB, cifrado, canales y cachés dentro del mismo dominio.');
