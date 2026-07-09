const CACHE_NAME = 'chater-static-v115-secure-delivery-ack-origin';
const CORE_ASSETS = [
  './index.html',
  './styles.css',
  './theme-bootstrap.js',
  './app.js',
  './api.js',
  './firebase.auth.js',
  './APPwebFRONTENDx/conexion/index.js',
  './APPwebFRONTENDx/BLOQUE/app.js',
  './APPwebFRONTENDx/BLOQUE/api.js',
  './APPwebFRONTENDx/BLOQUE/firebase.auth.js',
  './IMAGENwebpCOMPRESIONx/BLOQUE/compresor-webp-core.js',
  './IMAGENwebpCOMPRESIONx/conexion/imagen-webp-compresionx.js',
  './manifest.webmanifest'
];

const OPTIONAL_ASSETS = [
  './assets/icon-192.png',
  './assets/icon-512.png',
  './assets/icon-192.svg',
  './assets/icon-512.svg'
];

const NOTIFICATION_ICON_FALLBACK = './assets/icon-192.svg';
const NOTIFICATION_TITLE_MAX_LENGTH = 80;
const NOTIFICATION_BODY_MAX_LENGTH = 220;
const NOTIFICATION_TAG_MAX_LENGTH = 90;
const NOTIFICATION_DATA_MAX_LENGTH = 180;
const UNSAFE_UNICODE_DIRECTION_CONTROLS = /[\u061C\u200E\u200F\u202A-\u202E\u2066-\u2069]/g;

function stripUnsafeUnicodeControls(value = '') {
  return String(value || '').replace(UNSAFE_UNICODE_DIRECTION_CONTROLS, '');
}

function normalizeNotificationText(value = '', fallback = '', maxLength = 160) {
  const clean = stripUnsafeUnicodeControls(value)
    .replace(/[\x00-\x1F\x7F]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const safeFallback = String(fallback || '').trim();
  const text = clean || safeFallback;
  const limit = Math.max(1, Math.min(500, Number(maxLength || 160)));
  if (text.length <= limit) return text;
  return `${text.slice(0, Math.max(1, limit - 1)).trimEnd()}…`;
}

function normalizeNotificationToken(value = '', { fallback = '', maxLength = NOTIFICATION_DATA_MAX_LENGTH } = {}) {
  const clean = normalizeNotificationText(value, fallback, maxLength)
    .replace(/[^A-Za-z0-9._:-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, Math.max(1, Math.min(240, Number(maxLength || NOTIFICATION_DATA_MAX_LENGTH))));
  return clean || String(fallback || '').slice(0, Math.max(1, Number(maxLength || NOTIFICATION_DATA_MAX_LENGTH)));
}

function normalizeNotificationTag(value = '') {
  return normalizeNotificationToken(value, { fallback: 'chatER', maxLength: NOTIFICATION_TAG_MAX_LENGTH }) || 'chatER';
}

function normalizeNotificationType(value = '') {
  return normalizeNotificationToken(value, { fallback: 'chat.notification', maxLength: 80 }) || 'chat.notification';
}

const DELIVERY_ACK_DB_NAME = 'chater-delivery-acks-v1';
const DELIVERY_ACK_STORE_NAME = 'pendingAcks';
const DELIVERY_ACK_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const DELIVERY_ACK_MAX_BACKOFF_MS = 30 * 60 * 1000;
const DELIVERY_ACK_MAX_ATTEMPTS = 96;
const DELIVERY_ACK_SYNC_TAG = 'CHAT_ER_FLUSH_DELIVERY_ACKS';
const DELIVERY_ACK_TRUST_ORIGIN_TAG = 'CHAT_ER_TRUST_DELIVERY_ACK_ORIGIN';
const DELIVERY_ACK_ALLOWED_PATHNAME = '/api/chats/delivery/ack';
const DELIVERY_ACK_TOKEN_MAX_LENGTH = 220;
const DELIVERY_ACK_FETCH_TIMEOUT_MS = 9000;

function deliveryAckTimeoutMs(value = DELIVERY_ACK_FETCH_TIMEOUT_MS) {
  const number = Number(value || DELIVERY_ACK_FETCH_TIMEOUT_MS);
  if (!Number.isFinite(number) || number <= 0) return DELIVERY_ACK_FETCH_TIMEOUT_MS;
  return Math.min(30000, Math.max(3000, Math.trunc(number)));
}

async function fetchDeliveryAckWithTimeout(url = '', options = {}, timeoutMs = DELIVERY_ACK_FETCH_TIMEOUT_MS) {
  const safeTimeoutMs = deliveryAckTimeoutMs(timeoutMs);
  if (typeof AbortController === 'undefined') {
    return Promise.race([
      fetch(url, options),
      sleep(safeTimeoutMs).then(() => {
        const timeoutError = new Error('delivery_ack_timeout');
        timeoutError.code = 'delivery_ack_timeout';
        throw timeoutError;
      })
    ]);
  }
  const controller = new AbortController();
  let timeoutId = 0;
  try {
    timeoutId = setTimeout(() => controller.abort(), safeTimeoutMs);
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (error) {
    if (error?.name === 'AbortError') {
      const timeoutError = new Error('delivery_ack_timeout');
      timeoutError.code = 'delivery_ack_timeout';
      timeoutError.cause = error;
      throw timeoutError;
    }
    throw error;
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

function isLocalDevelopmentOrigin(origin = self.location.origin) {
  try {
    const url = new URL(String(origin || self.location.origin));
    return ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  } catch {
    return false;
  }
}

function initialTrustedDeliveryAckOrigins() {
  const origins = new Set([
    self.location.origin,
    'https://mapsx.app',
    'https://www.mapsx.app'
  ]);
  // Punto débil corregido: la PWA publicada no debe confiar en localhost por
  // defecto para ACK Push. Esos orígenes solo se habilitan si el propio service
  // worker está corriendo en desarrollo local, evitando que un payload malformado
  // intente usar el navegador como puente hacia servicios locales del usuario.
  if (isLocalDevelopmentOrigin()) {
    origins.add('http://localhost:10000');
    origins.add('http://127.0.0.1:10000');
  }
  return origins;
}

const trustedDeliveryAckOrigins = initialTrustedDeliveryAckOrigins();
let deliveryAckDbPromise = null;

function hasIndexedDbSupport() {
  return typeof indexedDB !== 'undefined';
}

function openDeliveryAckDb() {
  if (!hasIndexedDbSupport()) return Promise.resolve(null);
  if (deliveryAckDbPromise) return deliveryAckDbPromise;
  deliveryAckDbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DELIVERY_ACK_DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(DELIVERY_ACK_STORE_NAME)) {
        const store = db.createObjectStore(DELIVERY_ACK_STORE_NAME, { keyPath: 'key' });
        store.createIndex('nextAttemptAt', 'nextAttemptAt', { unique: false });
        store.createIndex('queuedAt', 'queuedAt', { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('delivery_ack_db_open_failed'));
  }).catch((error) => {
    deliveryAckDbPromise = null;
    throw error;
  });
  return deliveryAckDbPromise;
}

function idbRequest(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('delivery_ack_idb_failed'));
  });
}

async function deliveryAckStore(mode = 'readonly') {
  const db = await openDeliveryAckDb();
  if (!db) return null;
  const tx = db.transaction(DELIVERY_ACK_STORE_NAME, mode);
  return tx.objectStore(DELIVERY_ACK_STORE_NAME);
}

function normalizeDeliveryAckToken(value = '') {
  const token = String(value || '').trim();
  if (!token || token.length > DELIVERY_ACK_TOKEN_MAX_LENGTH) return '';
  if (!/^[A-Za-z0-9_-]+$/.test(token)) return '';
  return token;
}

function isSecureDeliveryAckOrigin(origin = '') {
  try {
    const url = new URL(String(origin || '').trim());
    if (url.protocol === 'https:') return true;
    // HTTP solo queda disponible para pruebas locales reales. En producción el
    // service worker no debe confiar dinámicamente en un backend público sin TLS,
    // aunque una configuración o payload legacy intente registrarlo por mensaje.
    if (url.protocol === 'http:' && isLocalDevelopmentOrigin(url.origin) && isLocalDevelopmentOrigin()) return true;
    return false;
  } catch {
    return false;
  }
}

function trustedDeliveryAckOriginFromUrl(value = '') {
  try {
    const url = new URL(String(value || '').trim(), self.location.href);
    if (!['http:', 'https:'].includes(url.protocol)) return '';
    if (!url.hostname || url.username || url.password) return '';
    return isSecureDeliveryAckOrigin(url.origin) ? url.origin : '';
  } catch {
    return '';
  }
}

function rememberTrustedDeliveryAckOrigin(value = '') {
  const origin = trustedDeliveryAckOriginFromUrl(value);
  if (!origin) return '';
  trustedDeliveryAckOrigins.add(origin);
  return origin;
}

function normalizeDeliveryAckUrl(value = '') {
  let url = null;
  try {
    url = new URL(String(value || '').trim());
  } catch {
    return '';
  }
  if (!isSecureDeliveryAckOrigin(url.origin)) return '';
  if (!trustedDeliveryAckOrigins.has(url.origin)) return '';
  if (url.username || url.password || url.search || url.hash) return '';
  const pathname = (url.pathname || '').replace(/\/+$/, '') || '/';
  if (pathname !== DELIVERY_ACK_ALLOWED_PATHNAME) return '';
  url.pathname = DELIVERY_ACK_ALLOWED_PATHNAME;
  return url.toString();
}

function normalizeDeliveryAckPayload(payload = {}) {
  const delivery = payload.delivery && typeof payload.delivery === 'object' ? payload.delivery : null;
  const token = normalizeDeliveryAckToken(delivery?.token || '');
  const ackUrl = normalizeDeliveryAckUrl(delivery?.ackUrl || '');
  if (!token || !ackUrl) return null;
  return { key: token, token, ackUrl };
}

function normalizeQueuedDeliveryAckItem(item = {}) {
  const originalKey = String(item?.key || item?.token || '').trim();
  const key = normalizeDeliveryAckToken(originalKey);
  const token = normalizeDeliveryAckToken(item?.token || key);
  const ackUrl = normalizeDeliveryAckUrl(item?.ackUrl || '');
  if (!key || !token || !ackUrl) return null;
  return { ...item, key, token, ackUrl };
}

async function getQueuedDeliveryAck(key = '') {
  const store = await deliveryAckStore('readonly');
  if (!store) return null;
  return idbRequest(store.get(key));
}

async function putQueuedDeliveryAck(item = {}) {
  const store = await deliveryAckStore('readwrite');
  if (!store) return false;
  await idbRequest(store.put(item));
  return true;
}

async function deleteQueuedDeliveryAck(key = '') {
  const store = await deliveryAckStore('readwrite');
  if (!store) return false;
  await idbRequest(store.delete(key));
  return true;
}

async function listQueuedDeliveryAcks() {
  const store = await deliveryAckStore('readonly');
  if (!store) return [];
  const list = await idbRequest(store.getAll());
  return Array.isArray(list) ? list : [];
}

function nextDeliveryAckBackoffMs(attempts = 0) {
  const safeAttempts = Math.max(0, Math.min(12, Number(attempts || 0)));
  return Math.min(DELIVERY_ACK_MAX_BACKOFF_MS, 1000 * (2 ** safeAttempts));
}

function isFinalDeliveryAckSkip(reason = '') {
  return ['delivery_token_expired', 'invalid_delivery_token', 'delivery_ack_final_unavailable', 'deleted_message'].includes(String(reason || '').trim());
}

async function sendDeliveryAckRequest(token = '', ackUrl = '') {
  // Punto débil corregido: la confirmación Push ya no depende de un fetch sin
  // límite. Si la red queda colgada, el ACK se reencola con backoff en vez de
  // mantener vivo indefinidamente el evento push/sync del service worker.
  const response = await fetchDeliveryAckWithTimeout(ackUrl, {
    method: 'POST',
    mode: 'cors',
    credentials: 'omit',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token })
  }, DELIVERY_ACK_FETCH_TIMEOUT_MS);
  if (!response || !response.ok) return false;
  const data = await response.clone().json().catch(() => null);
  if (!data || data.ok === false) return false;
  if (data.delivered === true || data.alreadyDelivered === true) return true;
  if (isFinalDeliveryAckSkip(data.skipped)) return true;
  return false;
}

async function sendDeliveryAckWithRetries(token = '', ackUrl = '', retries = 3) {
  const safeRetries = Math.max(1, Math.min(5, Number(retries || 3)));
  for (let attempt = 0; attempt < safeRetries; attempt += 1) {
    try {
      if (await sendDeliveryAckRequest(token, ackUrl)) return true;
    } catch {}
    if (attempt < safeRetries - 1) await sleep(600 * (attempt + 1));
  }
  return false;
}

async function registerDeliveryAckSync() {
  try {
    if (self.registration?.sync?.register) await self.registration.sync.register(DELIVERY_ACK_SYNC_TAG);
  } catch {}
}

async function queuePushDeliveryAck(payload = {}) {
  const normalized = normalizeDeliveryAckPayload(payload);
  if (!normalized) return false;
  const now = Date.now();
  try {
    const existing = await getQueuedDeliveryAck(normalized.key).catch(() => null);
    const queuedAt = Number(existing?.queuedAt || now);
    const item = {
      ...normalized,
      queuedAt,
      updatedAt: now,
      attempts: Math.max(0, Number(existing?.attempts || 0)),
      nextAttemptAt: Math.min(Number(existing?.nextAttemptAt || now), now),
      lastError: ''
    };
    await putQueuedDeliveryAck(item);
    await registerDeliveryAckSync();
    return true;
  } catch {
    return sendDeliveryAckWithRetries(normalized.token, normalized.ackUrl, 3);
  }
}

async function flushQueuedDeliveryAckItem(item = {}, { force = false } = {}) {
  const originalKey = String(item?.key || item?.token || '').trim();
  const normalized = normalizeQueuedDeliveryAckItem(item);
  if (!normalized) {
    if (originalKey) await deleteQueuedDeliveryAck(originalKey).catch(() => null);
    return false;
  }
  const { key, token, ackUrl } = normalized;
  const now = Date.now();
  const queuedAt = Number(normalized.queuedAt || now);
  const expired = now - queuedAt > DELIVERY_ACK_MAX_AGE_MS;
  const attempts = Math.max(0, Number(normalized.attempts || 0));
  if (expired || attempts >= DELIVERY_ACK_MAX_ATTEMPTS) {
    await deleteQueuedDeliveryAck(key).catch(() => null);
    return false;
  }
  if (!force && Number(normalized.nextAttemptAt || 0) > now) return false;
  try {
    const sent = await sendDeliveryAckRequest(token, ackUrl);
    if (sent) {
      await deleteQueuedDeliveryAck(key).catch(() => null);
      return true;
    }
    throw new Error('delivery_ack_http_failed');
  } catch (error) {
    const nextAttempts = attempts + 1;
    await putQueuedDeliveryAck({
      ...normalized,
      key,
      token,
      ackUrl,
      attempts: nextAttempts,
      updatedAt: now,
      lastError: String(error?.message || 'delivery_ack_failed').slice(0, 120),
      nextAttemptAt: now + nextDeliveryAckBackoffMs(nextAttempts)
    }).catch(() => null);
    await registerDeliveryAckSync();
    return false;
  }
}

async function flushQueuedDeliveryAcks(options = {}) {
  let items = [];
  try {
    items = await listQueuedDeliveryAcks();
  } catch {
    return { attempted: 0, confirmed: 0 };
  }
  const now = Date.now();
  const due = items
    .filter((item) => options.force || Number(item.nextAttemptAt || 0) <= now || now - Number(item.queuedAt || now) > DELIVERY_ACK_MAX_AGE_MS)
    .slice(0, Math.max(1, Math.min(80, Number(options.limit || 40))));
  let confirmed = 0;
  for (const item of due) {
    if (await flushQueuedDeliveryAckItem(item, options)) confirmed += 1;
  }
  return { attempted: due.length, confirmed };
}

async function acknowledgePushDelivery(payload = {}, options = {}) {
  const normalized = normalizeDeliveryAckPayload(payload);
  if (!normalized) return false;
  const queued = await queuePushDeliveryAck(payload);
  if (!queued || !hasIndexedDbSupport()) {
    return sendDeliveryAckWithRetries(normalized.token, normalized.ackUrl, options.retries || 3);
  }
  const result = await flushQueuedDeliveryAcks({ force: Boolean(options.force), limit: 40 });
  return Number(result.confirmed || 0) > 0;
}

function buildFallbackIconSvg(size = 192) {
  const safeSize = Math.max(64, Math.min(512, Number(size || 192)));
  const radius = Math.round(safeSize * 0.23);
  const bubbleX = Math.round(safeSize * 0.24);
  const bubbleY = Math.round(safeSize * 0.18);
  const bubbleW = Math.round(safeSize * 0.56);
  const bubbleH = Math.round(safeSize * 0.46);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${safeSize}" height="${safeSize}" viewBox="0 0 ${safeSize} ${safeSize}"><rect width="${safeSize}" height="${safeSize}" rx="${radius}" fill="#0aa884"/><path d="M${bubbleX} ${bubbleY + bubbleH * 0.38}c0-${bubbleH * 0.42} ${bubbleW * 0.31}-${bubbleH * 0.76} ${bubbleW * 0.69}-${bubbleH * 0.76}h${bubbleW * 0.06}c${bubbleW * 0.38} 0 ${bubbleW * 0.69} ${bubbleH * 0.34} ${bubbleW * 0.69} ${bubbleH * 0.76}v${bubbleH * 0.16}c0 ${bubbleH * 0.42}-${bubbleW * 0.31} ${bubbleH * 0.76}-${bubbleW * 0.69} ${bubbleH * 0.76}h-${bubbleW * 0.2}l-${bubbleW * 0.22} ${bubbleH * 0.2}c-${bubbleW * 0.07} ${bubbleH * 0.06}-${bubbleW * 0.17}-.01-${bubbleW * 0.15}-${bubbleH * 0.1}l${bubbleW * 0.04}-${bubbleH * 0.19}a${bubbleW * 0.68} ${bubbleH * 0.68} 0 0 1-${bubbleW * 0.06}-${bubbleH * 0.27}v-${bubbleH * 0.16}Z" fill="#fff"/><circle cx="${safeSize * 0.42}" cy="${safeSize * 0.43}" r="${safeSize * 0.042}" fill="#0aa884"/><circle cx="${safeSize * 0.5}" cy="${safeSize * 0.43}" r="${safeSize * 0.042}" fill="#0aa884"/><circle cx="${safeSize * 0.58}" cy="${safeSize * 0.43}" r="${safeSize * 0.042}" fill="#0aa884"/></svg>`;
}

function fallbackIconResponse(pathname = '') {
  if (!/\/assets\/icon-(192|512)\.(png|svg)$/i.test(pathname)) return null;
  const size = pathname.includes('512') ? 512 : 192;
  return new Response(buildFallbackIconSvg(size), {
    status: 200,
    headers: {
      'Content-Type': 'image/svg+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=604800'
    }
  });
}

function normalizedAssetPath(asset = '') {
  try {
    return new URL(asset, self.location.href).pathname;
  } catch {
    return '';
  }
}

const STATIC_CACHEABLE_PATHS = new Set([...CORE_ASSETS, ...OPTIONAL_ASSETS]
  .map(normalizedAssetPath)
  .filter(Boolean));

function isStaticCacheableRequest(request, url) {
  if (!request || request.method !== 'GET' || !url || url.origin !== self.location.origin) return false;
  if (url.pathname.startsWith('/api/')) return false;
  if (request.mode === 'navigate' || request.destination === 'document') return true;
  return STATIC_CACHEABLE_PATHS.has(url.pathname);
}

async function cacheStaticResponse(request, response) {
  if (!response || !response.ok) return false;
  const url = new URL(request.url);
  if (!isStaticCacheableRequest(request, url)) return false;
  const copy = response.clone();
  caches.open(CACHE_NAME).then((cache) => cache.put(request, copy)).catch(() => null);
  return true;
}

async function safeCacheRequest(cache, asset) {
  const request = new Request(asset, { cache: 'reload' });
  const pathname = normalizedAssetPath(asset);
  const iconFallback = fallbackIconResponse(pathname);
  try {
    const response = await fetch(request);
    if (response && response.ok) {
      await cache.put(request, response.clone());
      return true;
    }
    if (iconFallback && response && response.status === 404) {
      // Punto débil corregido: los íconos reales pueden no existir porque el
      // proyecto solo trae prompts .txt en assets. En vez de dejar 404 repetidos
      // o una PWA sin ícono offline, se precachea la figura geométrica fallback
      // bajo la misma ruta para que al reemplazar el asset real se reconozca
      // automáticamente en la siguiente versión de cache.
      await cache.put(request, iconFallback.clone());
      return true;
    }
    return false;
  } catch {
    if (iconFallback) {
      await cache.put(request, iconFallback.clone()).catch(() => null);
      return true;
    }
    return false;
  }
}

async function cacheAssets() {
  const cache = await caches.open(CACHE_NAME);
  await Promise.allSettled(CORE_ASSETS.map((asset) => safeCacheRequest(cache, asset)));
  await Promise.allSettled(OPTIONAL_ASSETS.map((asset) => safeCacheRequest(cache, asset)));
}

self.addEventListener('install', (event) => {
  event.waitUntil(cacheAssets().then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
      .then(() => flushQueuedDeliveryAcks({ force: true }).catch(() => null))
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || event.request.method !== 'GET') return;
  event.waitUntil(flushQueuedDeliveryAcks().catch(() => null));

  const iconFallback = fallbackIconResponse(url.pathname);
  const isNavigation = event.request.mode === 'navigate' || event.request.destination === 'document';

  event.respondWith((async () => {
    const isCoreAsset = CORE_ASSETS.some((asset) => new URL(asset, self.location.href).pathname === url.pathname);

    if (isCoreAsset || isNavigation) {
      try {
        const response = await fetch(event.request, { cache: 'reload' });
        if (response && response.ok) {
          await cacheStaticResponse(event.request, response);
          return response;
        }
      } catch {}
    }

    const cached = isStaticCacheableRequest(event.request, url) ? await caches.match(event.request) : null;
    if (cached) return cached;

    try {
      const response = await fetch(event.request);
      if (iconFallback && (!response || response.status === 404)) return iconFallback;
      await cacheStaticResponse(event.request, response);
      return response;
    } catch (error) {
      if (iconFallback) return iconFallback;
      if (isNavigation) return caches.match('./index.html');
      throw error;
    }
  })());
});

function parsePushPayload(event) {
  try {
    return event.data ? event.data.json() : {};
  } catch {
    return { title: 'chatER', body: 'Tienes una nueva actualización.' };
  }
}

function sleep(ms = 0) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(ms || 0))));
}

function getServiceWorkerScopePathname() {
  try {
    const scopeUrl = new URL(self.registration?.scope || './', self.location.href);
    if (scopeUrl.pathname.endsWith('/')) return scopeUrl.pathname;
    return scopeUrl.pathname.replace(/[^/]*$/, '');
  } catch {
    return new URL('./', self.location.href).pathname;
  }
}

function resolveSafeClientUrl(value = '') {
  const fallback = new URL('./index.html', self.location.href);
  let target = null;
  try {
    target = new URL(String(value || './index.html'), self.location.href);
  } catch {
    return fallback.toString();
  }
  if (!/^https?:$/i.test(target.protocol)) return fallback.toString();
  if (target.origin !== self.location.origin) return fallback.toString();

  const scopePathname = getServiceWorkerScopePathname();
  const insideScope = target.pathname === scopePathname || target.pathname.startsWith(scopePathname);
  if (!insideScope) return fallback.toString();

  return target.toString();
}

function resolveSafeNotificationIconUrl(value = '') {
  const fallback = new URL(NOTIFICATION_ICON_FALLBACK, self.location.href);
  let target = null;
  try {
    target = new URL(String(value || NOTIFICATION_ICON_FALLBACK), self.location.href);
  } catch {
    return fallback.toString();
  }
  if (!/^https?:$/i.test(target.protocol)) return fallback.toString();
  if (target.username || target.password) return fallback.toString();
  if (target.origin !== self.location.origin) return fallback.toString();

  const scopePathname = getServiceWorkerScopePathname();
  const insideScope = target.pathname === scopePathname || target.pathname.startsWith(scopePathname);
  if (!insideScope) return fallback.toString();

  return target.toString();
}


self.addEventListener('push', (event) => {
  const payload = parsePushPayload(event);
  if (payload.suppressNotification) {
    event.waitUntil(acknowledgePushDelivery(payload));
    return;
  }
  const title = normalizeNotificationText(payload.title, 'chatER', NOTIFICATION_TITLE_MAX_LENGTH);
  // Las notificaciones no deben cargar íconos desde URLs externas del payload: eso
  // puede filtrar IP/actividad del destinatario a terceros. El avatar visual del
  // chat sigue funcionando dentro de la app; Push usa solo assets del propio scope.
  // Punto débil corregido: title/body/tag/data también se normalizan antes de
  // entregarlos a showNotification para que un payload corrupto o excesivo no
  // rompa la notificación ni deje el ACK pendiente por una excepción del navegador.
  const safeNotificationIcon = resolveSafeNotificationIconUrl(payload.sender?.photoUrl || payload.icon || '');
  const safeDeliveryAck = normalizeDeliveryAckPayload(payload);
  const options = {
    body: normalizeNotificationText(payload.body, 'Tienes un mensaje nuevo.', NOTIFICATION_BODY_MAX_LENGTH),
    tag: normalizeNotificationTag(payload.tag || payload.chatId || 'chatER'),
    renotify: true,
    badge: safeNotificationIcon,
    icon: safeNotificationIcon,
    data: {
      url: resolveSafeClientUrl(payload.url || './index.html'),
      chatId: normalizeNotificationToken(payload.chatId || '', { fallback: '', maxLength: 140 }),
      messageId: normalizeNotificationToken(payload.messageId || '', { fallback: '', maxLength: 160 }),
      type: normalizeNotificationType(payload.type || 'chat.notification'),
      delivery: safeDeliveryAck ? { token: safeDeliveryAck.token, ackUrl: safeDeliveryAck.ackUrl } : null
    }
  };
  event.waitUntil(Promise.allSettled([
    acknowledgePushDelivery(payload, { retries: 5 }),
    self.registration.showNotification(title, options)
  ]));
});


self.addEventListener('message', (event) => {
  const type = String(event.data?.type || '').trim();
  if (type === DELIVERY_ACK_TRUST_ORIGIN_TAG) {
    rememberTrustedDeliveryAckOrigin(event.data?.backendPublicUrl || event.data?.backendUrl || event.data?.origin || '');
    return;
  }
  if (type !== DELIVERY_ACK_SYNC_TAG) return;
  const work = flushQueuedDeliveryAcks({ force: true }).catch(() => null);
  if (typeof event.waitUntil === 'function') event.waitUntil(work);
});

self.addEventListener('sync', (event) => {
  if (event.tag !== DELIVERY_ACK_SYNC_TAG) return;
  event.waitUntil(flushQueuedDeliveryAcks({ force: true, limit: 80 }).catch(() => null));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = resolveSafeClientUrl(event.notification?.data?.url || './index.html');
  event.waitUntil(Promise.allSettled([
    acknowledgePushDelivery({ delivery: event.notification?.data?.delivery || null }, { retries: 3, force: true }),
    (async () => {
      const clientList = await clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of clientList) {
        const clientUrl = new URL(client.url);
        const target = new URL(targetUrl);
        if (clientUrl.origin === target.origin && clientUrl.pathname === target.pathname) {
          await client.focus();
          client.navigate(targetUrl);
          return;
        }
      }
      await clients.openWindow(targetUrl);
    })()
  ]));
});
