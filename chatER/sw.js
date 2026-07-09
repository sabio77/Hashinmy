const CACHE_NAME = 'chater-static-v82-professional-icons-ui';
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
  './manifest.webmanifest'
];

const OPTIONAL_ASSETS = [
  './assets/icon-192.png',
  './assets/icon-512.png',
  './assets/icon-192.svg',
  './assets/icon-512.svg'
];

const DELIVERY_ACK_DB_NAME = 'chater-delivery-acks-v1';
const DELIVERY_ACK_STORE_NAME = 'pendingAcks';
const DELIVERY_ACK_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const DELIVERY_ACK_MAX_BACKOFF_MS = 30 * 60 * 1000;
const DELIVERY_ACK_MAX_ATTEMPTS = 96;
const DELIVERY_ACK_SYNC_TAG = 'CHAT_ER_FLUSH_DELIVERY_ACKS';
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

function normalizeDeliveryAckPayload(payload = {}) {
  const delivery = payload.delivery && typeof payload.delivery === 'object' ? payload.delivery : null;
  const token = String(delivery?.token || '').trim();
  const ackUrl = String(delivery?.ackUrl || '').trim();
  if (!token || !ackUrl) return null;
  return { key: token, token, ackUrl };
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
  const response = await fetch(ackUrl, {
    method: 'POST',
    mode: 'cors',
    credentials: 'omit',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token })
  });
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
  const key = String(item.key || item.token || '').trim();
  const token = String(item.token || key).trim();
  const ackUrl = String(item.ackUrl || '').trim();
  if (!key || !token || !ackUrl) return false;
  const now = Date.now();
  const queuedAt = Number(item.queuedAt || now);
  const expired = now - queuedAt > DELIVERY_ACK_MAX_AGE_MS;
  const attempts = Math.max(0, Number(item.attempts || 0));
  if (expired || attempts >= DELIVERY_ACK_MAX_ATTEMPTS) {
    await deleteQueuedDeliveryAck(key).catch(() => null);
    return false;
  }
  if (!force && Number(item.nextAttemptAt || 0) > now) return false;
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
      ...item,
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

async function safeCacheRequest(cache, asset) {
  try {
    const request = new Request(asset, { cache: 'reload' });
    const response = await fetch(request);
    if (response && response.ok) await cache.put(request, response.clone());
    return true;
  } catch {
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
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy)).catch(() => null);
          return response;
        }
      } catch {}
    }

    const cached = await caches.match(event.request);
    if (cached) return cached;

    try {
      const response = await fetch(event.request);
      if (iconFallback && (!response || response.status === 404)) return iconFallback;
      if (response && response.ok) {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy)).catch(() => null);
      }
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


self.addEventListener('push', (event) => {
  const payload = parsePushPayload(event);
  if (payload.suppressNotification) {
    event.waitUntil(acknowledgePushDelivery(payload));
    return;
  }
  const title = payload.title || 'chatER';
  const options = {
    body: payload.body || 'Tienes un mensaje nuevo.',
    tag: payload.tag || 'chatER',
    renotify: true,
    badge: './assets/icon-192.svg',
    icon: payload.sender?.photoUrl || './assets/icon-192.svg',
    data: {
      url: payload.url || './index.html',
      chatId: payload.chatId || '',
      messageId: payload.messageId || '',
      type: payload.type || 'chat.notification',
      delivery: payload.delivery || null
    }
  };
  event.waitUntil(Promise.allSettled([
    acknowledgePushDelivery(payload, { retries: 5 }),
    self.registration.showNotification(title, options)
  ]));
});


self.addEventListener('message', (event) => {
  const type = String(event.data?.type || '').trim();
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
  const targetUrl = new URL(event.notification?.data?.url || './index.html', self.location.href).toString();
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
