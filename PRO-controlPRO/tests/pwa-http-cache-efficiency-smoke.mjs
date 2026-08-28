import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relative) => fs.readFileSync(path.join(ROOT, relative), 'utf8');
const fail = (message) => { throw new Error(message); };

const sw = read('sw.js');
const i18n = read('src/js/i18n.js');
const assetLoader = read('src/js/asset-loader.js');
const headers = read('_headers');
const render = read('render.yaml');
const vercel = read('vercel.json');
const nginx = read('deploy/docker/nginx.conf');
const apache = read('deploy/apache.htaccess.sample');
const updateManager = read('src/js/pwa-update-manager.js');
const appConfig = read('src/js/config.js');


for (const required of [
  'passiveUpdateCheckMinIntervalMs',
  'startupUpdateCheckDedupMs',
  'last-update-check-at',
  'markUpdateCheckAttempt',
  'refreshServiceWorker === true'
]) {
  if (!updateManager.includes(required) && !appConfig.includes(required)) {
    fail(`Falta deduplicación de comprobaciones PWA para reducir HTTP Responses: ${required}`);
  }
}
for (const forbidden of [
  "checkNow('startup', { force: true })",
  "checkNow('online', { force: true })",
  "checkNow(event.persisted ? 'pageshow-bfcache' : 'pageshow', { force: true })"
]) {
  if (updateManager.includes(forbidden)) {
    fail(`Una señal normal del ciclo de vida está saltando la coordinación/cooldown: ${forbidden}`);
  }
}
if (!updateManager.includes("if (state.registration && settings.refreshServiceWorker === true)") ||
    !updateManager.includes('if (deployment.deploymentChanged)')) {
  fail('registration.update() debe evitarse en comprobaciones pasivas sin deploy y conservarse para revisión manual o deploy confirmado.');
}
if (!updateManager.includes('!state.registration.waiting && !state.registration.installing')) {
  fail('Un deploy confirmado no debe volver a pedir sw.js si el worker nuevo ya está instalándose o esperando activación.');
}
if (!appConfig.includes('passiveUpdateCheckMinIntervalMs: 300000') || !appConfig.includes('startupUpdateCheckDedupMs: 15000')) {
  fail('config.js debe publicar los límites de deduplicación de comprobaciones de release.');
}

for (const required of ['disableNavigationPreload', 'cacheFirstReleaseAsset', 'RELEASE_CACHE_FIRST_FILE_TYPES']) {
  if (!sw.includes(required)) fail(`Falta estrategia HTTP cache-first del release: ${required}`);
}
if (sw.includes('await enableNavigationPreload();')) {
  fail('navigation preload no debe activarse: abriría una solicitud paralela aun con navegación cacheada.');
}

for (const required of [
  'loadReleaseAssetHashes',
  'findReusablePrecacheResponse',
  'responseMatchesSha256',
  'groupPrecacheAliases'
]) {
  if (!sw.includes(required)) {
    fail(`El precache debe reutilizar assets verificables del release anterior: ${required}`);
  }
}
const precacheStart = sw.indexOf('async function precacheAppShell');
const precacheEnd = sw.indexOf('async function handleNavigation', precacheStart);
const precache = sw.slice(precacheStart, precacheEnd);
if (precache.includes("cache: 'reload',\n      credentials: 'same-origin'")) {
  fail('El precache no debe forzar reload para cada asset del shell.');
}
if (!precache.includes("cache: verifiable ? 'default' : 'reload'")) {
  fail('El precache debe aprovechar la caché HTTP cuando existe una huella verificable y reservar reload para el fallback seguro.');
}
if (!precache.includes('canVerifyResponseSha256')) {
  fail('Si Web Crypto no está disponible, el precache debe degradar a reload seguro en lugar de activar un shell no verificable.');
}
if (!precache.includes("response = await fetch(new Request(request, { cache: 'reload' }))")) {
  fail('Una copia HTTP obsoleta debe forzar reload únicamente después de fallar la validación SHA-256.');
}
if (!appConfig.includes('prefetchReleaseAssetsOnCheck: false')
    || !updateManager.includes('prefetchReleaseAssetsOnCheck: false')) {
  fail('La precarga de criticalAssets no debe duplicar las descargas que realizará el Service Worker nuevo.');
}

const navStart = sw.indexOf('async function handleNavigation');
const navEnd = sw.indexOf('async function cacheFirstReleaseAsset', navStart);
const nav = sw.slice(navStart, navEnd);
const cacheLookup = nav.indexOf("staticCache.match('./index.html')");
const networkFetch = nav.indexOf('fetchFresh(request');
if (navStart < 0 || cacheLookup < 0 || networkFetch < 0 || cacheLookup > networkFetch) {
  fail('La navegación debe resolver primero el shell cacheado y usar red únicamente en cache miss.');
}

if (/__i18n|cache\s*:\s*['"]no-store['"]/.test(i18n)) {
  fail('i18n no debe forzar cache-busting/no-store en cada apertura.');
}
if (/__asset|Date\.now\(\)/.test(assetLoader)) {
  fail('asset-loader no debe cambiar la URL del logo en cada hidratación.');
}

const requiredPolicies = [
  ['_headers', headers, '/src/*', 'max-age=86400'],
  ['_headers', headers, '/assets/*', 'max-age=604800'],
  ['render.yaml', render, '/src/*', 'max-age=86400'],
  ['render.yaml', render, '/assets/*', 'max-age=604800'],
  ['vercel.json', vercel, '/src/(.*)', 'max-age=86400'],
  ['vercel.json', vercel, '/assets/(.*)', 'max-age=604800'],
  ['nginx.conf', nginx, 'location ^~ /src/', 'max-age=86400'],
  ['apache.htaccess.sample', apache, 'stale-while-revalidate=604800', 'no-store, max-age=0, must-revalidate']
];
for (const [name, text, first, second] of requiredPolicies) {
  if (!text.includes(first) || !text.includes(second)) {
    fail(`${name} no conserva la política de caché esperada: ${first} / ${second}`);
  }
}

for (const critical of ['/sw.js', '/version.json', '/index.html']) {
  const index = headers.indexOf(`\n${critical}\n`);
  if (index < 0 || !headers.slice(index, index + 180).includes('no-store')) {
    fail(`${critical} debe conservar no-store como señal fresca de release.`);
  }
}

console.log('OK: navegación, i18n, assets y comprobaciones PWA evitan respuestas HTTP repetidas; las señales de release permanecen frescas.');
