const RELEASE_VERSION = 'dev';
const CACHE_NAME = `chater-static-${RELEASE_VERSION}`;
const versionedAsset = (asset = '') => `${asset}?v=${encodeURIComponent(RELEASE_VERSION)}`;
// Esta lista la completa tools/generate-release.py durante el build. Si un PNG
// opcional no existe en assets, el SW puede servir el placeholder geométrico sin
// provocar primero un 404 garantizado. Cuando el PNG aparece en un release futuro,
// el build lo marca aquí y el request vuelve a ir a la red/CDN normalmente.
const BUNDLED_IMAGE_ASSETS = new Set([]);

function geometricIconDataUrl(size = 192) {
  const safeSize = Number(size) >= 512 ? 512 : 192;
  const scale = safeSize / 100;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${safeSize}" height="${safeSize}" viewBox="0 0 ${safeSize} ${safeSize}"><rect width="100%" height="100%" rx="20%" fill="#0aa884"/><rect x="20%" y="25%" width="60%" height="43%" rx="12%" fill="white"/><path d="M25 65 L20 82 L43 68 Z" fill="white" transform="scale(${scale})"/><circle cx="40%" cy="47%" r="3.5%" fill="#0aa884"/><circle cx="50%" cy="47%" r="3.5%" fill="#0aa884"/><circle cx="60%" cy="47%" r="3.5%" fill="#0aa884"/></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}#chater-fallback-${safeSize}`;
}

function bundledIconUrl(size = 192) {
  const safeSize = Number(size) >= 512 ? 512 : 192;
  const asset = `./assets/icon-${safeSize}.png`;
  return BUNDLED_IMAGE_ASSETS.has(asset) ? versionedAsset(asset) : geometricIconDataUrl(safeSize);
}
const CORE_ASSETS = [
  './index.html',
  ...[
    './styles.css',
    './theme-bootstrap.js',
    './runtime-config.js',
    './APPwebFRONTENDx/conexion/index.js',
    './APPwebFRONTENDx/BLOQUE/app.js',
    './APPwebFRONTENDx/BLOQUE/api.js',
    './APPwebFRONTENDx/BLOQUE/firebase.auth.js',
    './LINKminiaturasx/conexion/index.js',
    './LINKminiaturasx/BLOQUE/link-miniaturas.js',
    './LINKcontactosCHATERx/conexion/index.js',
    './LINKcontactosCHATERx/BLOQUE/link-contactos-chater.js',
    './manifest.webmanifest'
  ].map(versionedAsset)
];

const DELIVERY_ACK_DB_NAME = 'chater-delivery-acks-v1';
const DELIVERY_ACK_STORE_NAME = 'pendingAcks';
const DELIVERY_ACK_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const DELIVERY_ACK_MAX_BACKOFF_MS = 30 * 60 * 1000;
const DELIVERY_ACK_MAX_ATTEMPTS = 12;
const DELIVERY_ACK_BATCH_DELAY_MS = 160;
const DELIVERY_ACK_BATCH_MAX_ITEMS = 20;
const DELIVERY_ACK_SYNC_TAG = 'CHAT_ER_FLUSH_DELIVERY_ACKS';
let deliveryAckDbPromise = null;
let deliveryAckFlushPromise = null;

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
  const exponential = Math.min(DELIVERY_ACK_MAX_BACKOFF_MS, 1000 * (2 ** safeAttempts));
  const jittered = Math.round(exponential * (0.75 + Math.random() * 0.5));
  return Math.min(DELIVERY_ACK_MAX_BACKOFF_MS, Math.max(500, jittered));
}

function isFinalDeliveryAckSkip(reason = '') {
  return ['delivery_token_expired', 'invalid_delivery_token', 'delivery_ack_final_unavailable', 'deleted_message'].includes(String(reason || '').trim());
}

async function sendDeliveryAckRequest(token = '', ackUrl = '') {
  const response = await fetch(ackUrl, {
    method: 'POST',
    mode: 'cors',
    credentials: 'omit',
    headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
    body: JSON.stringify({ token })
  });
  if (!response) return false;
  if ([400, 401, 403, 404, 409, 410, 422].includes(response.status)) return true;
  if (!response.ok) return false;
  const data = await response.clone().json().catch(() => null);
  if (!data || data.ok === false) return false;
  if (data.delivered === true || data.alreadyDelivered === true) return true;
  if (isFinalDeliveryAckSkip(data.skipped)) return true;
  return false;
}

async function sendDeliveryAckWithRetries(token = '', ackUrl = '', retries = 3) {
  const safeRetries = Math.max(1, Math.min(3, Number(retries || 3)));
  for (let attempt = 0; attempt < safeRetries; attempt += 1) {
    try {
      if (await sendDeliveryAckRequest(token, ackUrl)) return true;
    } catch {}
    if (attempt < safeRetries - 1) await sleep(Math.round((500 * (2 ** attempt)) * (0.75 + Math.random() * 0.5)));
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
      // Un Push duplicado no debe reiniciar el backoff de un ACK ya fallido.
      nextAttemptAt: existing ? Math.max(now, Number(existing.nextAttemptAt || now)) : now,
      lastError: ''
    };
    await putQueuedDeliveryAck(item);
    await registerDeliveryAckSync();
    return true;
  } catch {
    // No hagas red aquí: acknowledgePushDelivery conserva un único bloque de
    // reintentos cuando IndexedDB no está disponible. De lo contrario, un fallo
    // de almacenamiento seguido de un fallo de red duplicaría hasta 3+3 HTTP
    // Responses para el mismo ACK de Push.
    return false;
  }
}

function deliveryAckBatchOutcome(result = {}) {
  const skipped = String(result?.skipped || '').trim();
  const confirmed = result?.confirmed === true || result?.delivered === true || result?.alreadyDelivered === true;
  const final = confirmed || result?.final === true || isFinalDeliveryAckSkip(skipped);
  return { confirmed, final, retryable: result?.retryable === true || !final, skipped };
}

async function sendDeliveryAckBatchRequest(items = [], ackUrl = '') {
  const tokens = Array.from(new Set((Array.isArray(items) ? items : [])
    .map((item) => String(item?.token || item?.key || '').trim())
    .filter(Boolean)))
    .slice(0, DELIVERY_ACK_BATCH_MAX_ITEMS);
  if (!tokens.length || !ackUrl) return new Map();
  const response = await fetch(ackUrl, {
    method: 'POST',
    mode: 'cors',
    credentials: 'omit',
    headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
    body: JSON.stringify({ tokens })
  });
  if (!response?.ok) throw new Error(`delivery_ack_batch_http_${Number(response?.status || 0)}`);
  const data = await response.clone().json().catch(() => null);
  if (!data || data.ok === false || !Array.isArray(data.results)) throw new Error('delivery_ack_batch_invalid_response');
  const outcomes = new Map();
  for (const result of data.results) {
    const token = String(result?.token || '').trim();
    if (!token || !tokens.includes(token)) continue;
    outcomes.set(token, deliveryAckBatchOutcome(result));
  }
  return outcomes;
}

async function deferQueuedDeliveryAck(item = {}, error = null) {
  const key = String(item.key || item.token || '').trim();
  const token = String(item.token || key).trim();
  const ackUrl = String(item.ackUrl || '').trim();
  if (!key || !token || !ackUrl) return false;
  const now = Date.now();
  const nextAttempts = Math.max(0, Number(item.attempts || 0)) + 1;
  if (nextAttempts >= DELIVERY_ACK_MAX_ATTEMPTS || now - Number(item.queuedAt || now) > DELIVERY_ACK_MAX_AGE_MS) {
    await deleteQueuedDeliveryAck(key).catch(() => null);
    return false;
  }
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

async function performQueuedDeliveryAckFlush(options = {}) {
  // Una ventana mínima agrupa Push casi simultáneos antes de comprometer una HTTP Response.
  if (!options.force) await sleep(DELIVERY_ACK_BATCH_DELAY_MS);
  let items = [];
  try {
    items = await listQueuedDeliveryAcks();
  } catch {
    return { attempted: 0, confirmed: 0 };
  }
  const now = Date.now();
  const due = items
    .filter((item) => options.force || Number(item.nextAttemptAt || 0) <= now || now - Number(item.queuedAt || now) > DELIVERY_ACK_MAX_AGE_MS)
    .slice(0, Math.max(1, Math.min(DELIVERY_ACK_BATCH_MAX_ITEMS, Number(options.limit || DELIVERY_ACK_BATCH_MAX_ITEMS))));
  if (!due.length) return { attempted: 0, confirmed: 0 };

  const groups = new Map();
  for (const item of due) {
    const key = String(item.key || item.token || '').trim();
    const token = String(item.token || key).trim();
    const ackUrl = String(item.ackUrl || '').trim();
    const expired = now - Number(item.queuedAt || now) > DELIVERY_ACK_MAX_AGE_MS;
    if (!key || !token || !ackUrl || expired || Number(item.attempts || 0) >= DELIVERY_ACK_MAX_ATTEMPTS) {
      if (key) await deleteQueuedDeliveryAck(key).catch(() => null);
      continue;
    }
    if (!groups.has(ackUrl)) groups.set(ackUrl, []);
    groups.get(ackUrl).push({ ...item, key, token, ackUrl });
  }

  let confirmed = 0;
  for (const [ackUrl, group] of groups.entries()) {
    let outcomes = new Map();
    let requestError = null;
    try {
      outcomes = await sendDeliveryAckBatchRequest(group, ackUrl);
    } catch (error) {
      requestError = error;
    }
    for (const item of group) {
      const outcome = outcomes.get(item.token);
      if (outcome?.final === true) {
        await deleteQueuedDeliveryAck(item.key).catch(() => null);
        confirmed += 1;
        continue;
      }
      await deferQueuedDeliveryAck(item, requestError || new Error('delivery_ack_batch_token_unconfirmed'));
    }
  }
  return { attempted: due.length, confirmed };
}

async function flushQueuedDeliveryAcks(options = {}) {
  // push/sync/message/fetch pueden dispararse casi a la vez en el mismo worker.
  // Compartir el trabajo evita que dos vaciados lean la misma cola y dupliquen Responses.
  if (deliveryAckFlushPromise) return deliveryAckFlushPromise;
  deliveryAckFlushPromise = (async () => {
    try {
      return await performQueuedDeliveryAckFlush(options);
    } finally {
      deliveryAckFlushPromise = null;
    }
  })();
  return deliveryAckFlushPromise;
}

async function acknowledgePushDelivery(payload = {}, options = {}) {
  const normalized = normalizeDeliveryAckPayload(payload);
  if (!normalized) return false;
  const queued = await queuePushDeliveryAck(payload);
  if (!queued || !hasIndexedDbSupport()) {
    return sendDeliveryAckWithRetries(normalized.token, normalized.ackUrl, options.retries || 3);
  }
  const result = await flushQueuedDeliveryAcks({ force: Boolean(options.force), limit: 20 });
  return Number(result.confirmed || 0) > 0;
}

function crc32(bytes = new Uint8Array()) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function adler32(bytes = new Uint8Array()) {
  let a = 1;
  let b = 0;
  for (const byte of bytes) {
    a = (a + byte) % 65521;
    b = (b + a) % 65521;
  }
  return ((b << 16) | a) >>> 0;
}

function uint32be(value = 0) {
  return new Uint8Array([(value >>> 24) & 255, (value >>> 16) & 255, (value >>> 8) & 255, value & 255]);
}

function concatBytes(parts = []) {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const output = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
}

function pngChunk(type = '', data = new Uint8Array()) {
  const typeBytes = new TextEncoder().encode(type);
  const body = concatBytes([typeBytes, data]);
  return concatBytes([uint32be(data.length), body, uint32be(crc32(body))]);
}

function zlibStore(bytes = new Uint8Array()) {
  const chunks = [new Uint8Array([0x78, 0x01])];
  let offset = 0;
  while (offset < bytes.length) {
    const length = Math.min(65535, bytes.length - offset);
    const finalBlock = offset + length >= bytes.length ? 1 : 0;
    const nlen = (~length) & 0xffff;
    chunks.push(new Uint8Array([finalBlock, length & 255, (length >>> 8) & 255, nlen & 255, (nlen >>> 8) & 255]));
    chunks.push(bytes.slice(offset, offset + length));
    offset += length;
  }
  chunks.push(uint32be(adler32(bytes)));
  return concatBytes(chunks);
}

function buildFallbackIconPng(size = 192) {
  const safeSize = Math.max(64, Math.min(512, Number(size || 192)));
  const stride = 1 + safeSize * 4;
  const raw = new Uint8Array(stride * safeSize);
  const margin = Math.round(safeSize * 0.2);
  const bubbleTop = Math.round(safeSize * 0.25);
  const bubbleBottom = Math.round(safeSize * 0.68);
  const bubbleLeft = Math.round(safeSize * 0.2);
  const bubbleRight = Math.round(safeSize * 0.8);
  for (let y = 0; y < safeSize; y += 1) {
    const row = y * stride;
    raw[row] = 0;
    for (let x = 0; x < safeSize; x += 1) {
      const pixel = row + 1 + x * 4;
      let r = 10, g = 168, b = 132;
      const inBubble = x >= bubbleLeft && x <= bubbleRight && y >= bubbleTop && y <= bubbleBottom;
      const inTail = y > bubbleBottom && y <= bubbleBottom + Math.round(safeSize * 0.12) && x >= margin && x <= Math.round(safeSize * 0.43) && (x + y) >= Math.round(safeSize * 0.93);
      if (inBubble || inTail) r = g = b = 255;
      const dotY = Math.round(safeSize * 0.46);
      const dotRadius = Math.max(2, Math.round(safeSize * 0.035));
      const dotCenters = [0.4, 0.5, 0.6].map((ratio) => Math.round(safeSize * ratio));
      if ((inBubble || inTail) && dotCenters.some((cx) => ((x - cx) ** 2 + (y - dotY) ** 2) <= dotRadius ** 2)) {
        r = 10; g = 168; b = 132;
      }
      raw[pixel] = r; raw[pixel + 1] = g; raw[pixel + 2] = b; raw[pixel + 3] = 255;
    }
  }
  const signature = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = new Uint8Array(13);
  ihdr.set(uint32be(safeSize), 0);
  ihdr.set(uint32be(safeSize), 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return concatBytes([signature, pngChunk('IHDR', ihdr), pngChunk('IDAT', zlibStore(raw)), pngChunk('IEND', new Uint8Array())]);
}

function fallbackIconAssetPath(pathname = '') {
  const match = String(pathname || '').match(/\/assets\/(icon-(192|512)\.png)$/i);
  return match ? `./assets/${match[1].toLowerCase()}` : '';
}

function fallbackIconResponse(pathname = '') {
  const assetPath = fallbackIconAssetPath(pathname);
  if (!assetPath) return null;
  const size = assetPath.includes('512') ? 512 : 192;
  return new Response(buildFallbackIconPng(size), {
    status: 200,
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=604800'
    }
  });
}

async function safeCacheRequest(cache, asset) {
  try {
    const request = new Request(asset);
    const response = await fetch(request);
    if (response && response.ok) await cache.put(request, response.clone());
    return true;
  } catch {
    return false;
  }
}

async function cacheAssets() {
  const cache = await caches.open(CACHE_NAME);
  // Los PNG de assets son opcionales por diseño: no se consultan durante install para
  // evitar respuestas 404 garantizadas cuando todavía solo existe su prompt .txt.
  await Promise.allSettled(CORE_ASSETS.map((asset) => safeCacheRequest(cache, asset)));
}

self.addEventListener('install', (event) => {
  event.waitUntil(cacheAssets().then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
      .then(() => flushQueuedDeliveryAcks().catch(() => null))
  );
});

async function cacheSuccessfulResponse(request, response) {
  if (!response || !response.ok) return;
  try {
    const cache = await caches.open(CACHE_NAME);
    await cache.put(request, response.clone());
  } catch {}
}

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || event.request.method !== 'GET') return;

  const iconAssetPath = fallbackIconAssetPath(url.pathname);
  const iconFallback = fallbackIconResponse(url.pathname);
  const isNavigation = event.request.mode === 'navigate' || event.request.destination === 'document';

  event.respondWith((async () => {
    if (isNavigation) {
      // Todas las navegaciones dentro del scope consumen el mismo app-shell. Una URL
      // con ?chat=, ?message= u otros parámetros no debe crear otra entrada de caché
      // ni otra HTTP Response del Static Site si index.html ya quedó precargado.
      const shell = await caches.match('./index.html');
      if (shell) return shell;
    }
    const cached = await caches.match(event.request);
    if (cached) return cached; // cache-first: una visita repetida no genera HTTP Responses para este recurso.
    if (iconFallback && iconAssetPath && !BUNDLED_IMAGE_ASSETS.has(iconAssetPath)) {
      // El build sabe que este archivo no existe. Servimos y cacheamos el PNG
      // geométrico directamente, evitando una respuesta HTTP 404 inútil por cada
      // release nuevo que todavía no tenga los assets gráficos definitivos.
      await cacheSuccessfulResponse(event.request, iconFallback);
      return iconFallback;
    }
    try {
      const response = await fetch(event.request);
      if (iconFallback && (!response || response.status === 404)) {
        await cacheSuccessfulResponse(event.request, iconFallback);
        return iconFallback;
      }
      if (response?.ok) await cacheSuccessfulResponse(event.request, response);
      return response;
    } catch (error) {
      if (iconFallback) {
        await cacheSuccessfulResponse(event.request, iconFallback);
        return iconFallback;
      }
      if (isNavigation) {
        const shell = await caches.match('./index.html');
        if (shell) return shell;
      }
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
    badge: bundledIconUrl(192),
    icon: payload.sender?.photoUrl || bundledIconUrl(192),
    data: {
      url: payload.url || './index.html',
      chatId: payload.chatId || '',
      messageId: payload.messageId || '',
      type: payload.type || 'chat.notification',
      delivery: payload.delivery || null
    }
  };
  event.waitUntil(Promise.allSettled([
    acknowledgePushDelivery(payload, { retries: 3 }),
    self.registration.showNotification(title, options)
  ]));
});


self.addEventListener('message', (event) => {
  const type = String(event.data?.type || '').trim();
  if (type !== DELIVERY_ACK_SYNC_TAG) return;
  const work = flushQueuedDeliveryAcks().catch(() => null);
  if (typeof event.waitUntil === 'function') event.waitUntil(work);
});

self.addEventListener('sync', (event) => {
  if (event.tag !== DELIVERY_ACK_SYNC_TAG) return;
  event.waitUntil(flushQueuedDeliveryAcks({ limit: 20 }).catch(() => null));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = new URL(event.notification?.data?.url || './index.html', self.location.href).toString();
  event.waitUntil(Promise.allSettled([
    // El evento push ya encoló el token antes de intentar confirmarlo. Al hacer click
    // solo drenamos ACKs que sigan pendientes y cuyo backoff haya vencido: volver a
    // encolar el token de la notificación recreaba una HTTP Response incluso cuando
    // la confirmación original ya había sido aceptada y eliminada de IndexedDB.
    flushQueuedDeliveryAcks({ limit: 20 }).catch(() => null),
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
