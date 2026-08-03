'use strict';

try {
  importScripts('./src/js/app-metadata.js');
} catch (error) {
  // La app sigue funcionando aunque este archivo aún no exista en una migración parcial.
}

const APP_META = self.APP_SEED_METADATA || {};
const CACHE_NAMESPACE = String(APP_META.cacheNamespace || 'semilla-appweb-pwa');
const APP_VERSION_KEY = sanitizeCachePart([
  APP_META.version || '0.0.0',
  APP_META.build || 'desarrollo'
].join('-'));

const STATIC_CACHE_PREFIX = `${CACHE_NAMESPACE}-static-`;
const RUNTIME_CACHE_PREFIX = `${CACHE_NAMESPACE}-runtime-`;
const STATIC_CACHE = `${STATIC_CACHE_PREFIX}${APP_VERSION_KEY}`;
const RUNTIME_CACHE = `${RUNTIME_CACHE_PREFIX}${APP_VERSION_KEY}`;
const OFFLINE_URL = './offline.html';
const RUNTIME_CACHE_MAX_ENTRIES = Number(APP_META.runtimeCacheMaxEntries || 160);
const NAVIGATION_TIMEOUT_MS = Number(APP_META.navigationNetworkTimeoutMs || 4500);
const RESOURCE_TIMEOUT_MS = Number(APP_META.resourceNetworkTimeoutMs || 7000);
const APP_BASE_URL = resolveApplicationBaseUrl();
const APP_ORIGIN = APP_BASE_URL.origin;
const APP_BASE_PATH = normalizeDirectoryPath(APP_BASE_URL.pathname);
const IS_ROOT_APPLICATION = APP_BASE_PATH === '/';
const PUSH_ACCOUNT_BINDING_CACHE = `${CACHE_NAMESPACE}-push-account-binding`;
const PUSH_ACCOUNT_BINDING_URL = new URL('./.well-known/p2p-push-account-binding', APP_BASE_URL).toString();

const DEFAULT_APP_SHELL = [
  './',
  './index.html',
  './offline.html',
  './manifest.webmanifest',
  './textX/languages.json',
  './textX/app/es.json',
  './textX/app/en.json',
  './textX/app/ar.json',
  './textX/seo/es.json',
  './textX/seo/en.json',
  './textX/seo/ar.json',
  './src/css/app.css',
  './src/js/app-metadata.js',
  './src/js/runtime-config.js',
  './src/js/config.js',
  './src/js/application-scope.js',
  './src/js/api.js',
  './src/js/firebase-auth.js',
  './src/js/p2p-storage.js',
  './src/js/p2p-crypto.js',
  './src/js/p2p-tab-coordinator.js',
  './src/js/p2p-client.js',
  './src/js/p2p-space-creation-intent.js',
  './src/js/p2p-invitation-intent.js',
  './src/js/device-management.js',
  './src/js/skeleton-screen.js',
  './src/js/i18n.js',
  './src/js/asset-loader.js',
  './src/js/pwa-update-manager.js',
  './src/js/app.js',
  './P2P_sin_RED_LOCALx/P2P_sin_transport.js',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
  './assets/icons/maskable-192.png',
  './assets/icons/maskable-512.png'
];

const APP_SHELL = Array.isArray(APP_META.precacheUrls) && APP_META.precacheUrls.length
  ? APP_META.precacheUrls
  : DEFAULT_APP_SHELL;

const ROOT_OWNED_PATH_PREFIXES = normalizeRootPathPrefixes(
  Array.isArray(APP_META.rootOwnedPathPrefixes)
    ? APP_META.rootOwnedPathPrefixes
    : ['/assets/', '/src/', '/textX/', '/.well-known/']
);
const ROOT_NAVIGATION_PATHS = normalizeRootExactPaths(
  Array.isArray(APP_META.rootNavigationPaths)
    ? APP_META.rootNavigationPaths
    : ['/', '/index.html', '/offline.html']
);
const ROOT_OWNED_EXACT_PATHS = normalizeRootExactPaths([
  ...APP_SHELL,
  '/version.json',
  '/health.json',
  '/robots.txt',
  '/manifest.webmanifest',
  '/sw.js'
]);

const ALWAYS_FRESH_PATHS = [
  /\/sw\.js$/,
  /\/version\.json$/,
  /\/textX\/languages\.json$/,
  /\/src\/js\/app-metadata\.js$/
];

const NETWORK_FIRST_FILE_TYPES = /\.(?:html|css|js|json|webmanifest|txt|xml)$/i;
const STATIC_FILE_TYPES = /\.(?:png|jpg|jpeg|webp|svg|gif|ico|woff2?|ttf|otf|mp3|mp4|webm|wasm)$/i;

// Parámetros internos usados solo para romper caché del navegador/CDN durante
// verificaciones por eventos. No deben convertirse en entradas distintas del
// Cache Storage porque terminarían desplazando el shell offline.
const INTERNAL_CACHE_BUST_PARAMS = [
  '__pwa_update_check',
  '__tab',
  '__i18n',
  '__asset'
];
const GENERATED_IMAGE_FALLBACKS = [
  { path: '/assets/icons/logo.png', width: 96, height: 96, label: 'Logo de la app' },
  { path: '/assets/icons/icon-192.png', width: 192, height: 192, label: 'Icono instalable 192' },
  { path: '/assets/icons/icon-512.png', width: 512, height: 512, label: 'Icono instalable 512' },
  { path: '/assets/icons/maskable-192.png', width: 192, height: 192, label: 'Icono adaptable 192' },
  { path: '/assets/icons/maskable-512.png', width: 512, height: 512, label: 'Icono adaptable 512' }
];
const NETWORK_ONLY_PATH_PREFIXES = Array.isArray(APP_META.networkOnlyPathPrefixes)
  ? APP_META.networkOnlyPathPrefixes
  : ['/api/', '/auth/', '/admin/api/', '/graphql', '/webhooks/'];

self.addEventListener('install', function installServiceWorker(event) {
  event.waitUntil((async function installAppShell() {
    await precacheAppShell();
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', function activateServiceWorker(event) {
  event.waitUntil((async function activateNewWorker() {
    await enableNavigationPreload();
    await deleteOldAppCaches();
    await self.clients.claim();
    await broadcast({
      type: 'APP_SW_ACTIVATED',
      version: APP_META.version || '0.0.0',
      build: APP_META.build || 'desarrollo',
      cache: STATIC_CACHE
    });
  })());
});

self.addEventListener('message', function receiveMessage(event) {
  if (!isOwnedMessageSource(event)) return;
  const message = event.data || {};

  if (message.type === 'SKIP_WAITING') {
    event.waitUntil(self.skipWaiting());
    return;
  }

  if (message.type === 'CLEAR_APP_CACHES') {
    event.waitUntil((async function clearCachesAndReport() {
      await deleteAllAppCaches();
      await broadcast({ type: 'APP_CACHES_CLEARED' });
    })());
    return;
  }

  if (message.type === 'GET_APP_VERSION' && event.source) {
    event.source.postMessage({
      type: 'APP_VERSION',
      version: APP_META.version || '0.0.0',
      build: APP_META.build || 'desarrollo',
      cache: STATIC_CACHE
    });
    return;
  }

  if (message.type === 'P2P_PUSH_ACCOUNT_BINDING') {
    event.waitUntil((async function updateAccountBindingAndReply() {
      const result = await updatePushAccountBinding(message);
      replyToMessageEvent(event, {
        type: 'P2P_PUSH_ACCOUNT_BINDING_RESULT',
        requestId: String(message.requestId || ''),
        ...result
      });
    })());
    return;
  }

  if (message.type === 'PREFETCH_URLS' && Array.isArray(message.urls)) {
    event.waitUntil(prefetchUrls(message.urls));
  }
});

self.addEventListener('fetch', function routeFetch(event) {
  const request = event.request;

  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  const isNavigation = request.mode === 'navigate';

  // Un Service Worker instalado en la raíz tiene alcance técnico sobre todo el origen.
  // Esta barrera evita que trate una app hermana en /contabilidad o /facturacion como
  // parte de su propio shell mientras la app hija todavía instala su worker específico.
  if (!isApplicationOwnedUrl(url, { navigation: isNavigation })) return;

  if (isNetworkOnlyPath(url)) {
    event.respondWith(fetchFresh(request, { timeoutMs: RESOURCE_TIMEOUT_MS }));
    return;
  }

  if (isNavigation) {
    event.respondWith(handleNavigation(event));
    return;
  }

  if (mustAlwaysBeFresh(url)) {
    event.respondWith(networkFirst(request, {
      cacheName: RUNTIME_CACHE,
      forceReload: true,
      allowFallback: url.pathname.endsWith('/src/js/app-metadata.js')
    }));
    return;
  }

  if (NETWORK_FIRST_FILE_TYPES.test(url.pathname)) {
    event.respondWith(networkFirst(request, {
      cacheName: RUNTIME_CACHE,
      forceReload: false,
      allowFallback: true
    }));
    return;
  }

  const generatedImageFallback = getGeneratedImageFallbackSpec(url);
  if (generatedImageFallback) {
    event.respondWith(networkFirstWithGeneratedImageFallback(request, RUNTIME_CACHE, generatedImageFallback));
    return;
  }

  if (STATIC_FILE_TYPES.test(url.pathname)) {
    event.respondWith(staleWhileRevalidate(request, RUNTIME_CACHE));
    return;
  }

  event.respondWith(networkFirst(request, {
    cacheName: RUNTIME_CACHE,
    forceReload: false,
    allowFallback: true
  }));
});

async function enableNavigationPreload() {
  if (self.registration && self.registration.navigationPreload) {
    try {
      await self.registration.navigationPreload.enable();
    } catch (error) {
      // No todos los navegadores lo soportan. No es crítico.
    }
  }
}

async function precacheAppShell() {
  const cache = await caches.open(STATIC_CACHE);

  const results = await Promise.allSettled(APP_SHELL.map(async function cacheOneAsset(assetUrl) {
    const request = new Request(assetUrl, {
      cache: 'reload',
      credentials: 'same-origin'
    });
    const fallbackSpec = getGeneratedImageFallbackSpec(new URL(assetUrl, self.location.href));

    try {
      const response = await fetch(request);

      if (fallbackSpec) {
        if (isUsableImageResponse(response)) {
          await cache.put(assetUrl, response.clone());
        } else {
          await cache.put(assetUrl, createGeneratedImageFallbackResponse(fallbackSpec));
        }
        return assetUrl;
      }

      if (isCacheableResponse(response)) {
        await cache.put(assetUrl, response.clone());
        return assetUrl;
      }

      throw new Error(`No cacheable: ${assetUrl}`);
    } catch (error) {
      if (fallbackSpec) {
        await cache.put(assetUrl, createGeneratedImageFallbackResponse(fallbackSpec));
        return assetUrl;
      }
      throw error;
    }
  }));

  const failed = results.filter(function wasRejected(result) {
    return result.status === 'rejected';
  });

  if (failed.length) {
    console.warn('[ServiceWorker] Algunos archivos del shell no se pudieron precachear:', failed);
  }
}

async function handleNavigation(event) {
  const request = event.request;

  try {
    const preloadResponse = await event.preloadResponse;
    if (isCacheableResponse(preloadResponse)) {
      const cache = await caches.open(RUNTIME_CACHE);
      await cache.put('./index.html', preloadResponse.clone());
      return preloadResponse;
    }
  } catch (error) {
    // Se intenta red normal abajo.
  }

  try {
    const response = await fetchFresh(request, { timeoutMs: NAVIGATION_TIMEOUT_MS });
    if (isCacheableResponse(response)) {
      const cache = await caches.open(RUNTIME_CACHE);
      await cache.put('./index.html', response.clone());
      await trimCache(RUNTIME_CACHE, RUNTIME_CACHE_MAX_ENTRIES);
    }
    return response;
  } catch (error) {
    const cachedIndex = await caches.match('./index.html') || await caches.match('./');
    if (cachedIndex) return cachedIndex;
    return caches.match(OFFLINE_URL) || new Response('Sin conexión', {
      status: 503,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' }
    });
  }
}

async function networkFirst(request, options) {
  const cacheName = options.cacheName || RUNTIME_CACHE;
  const allowFallback = options.allowFallback !== false;
  const cache = await caches.open(cacheName);
  const cacheRequest = createRuntimeCacheRequest(request);

  try {
    const response = await fetchFresh(request, {
      forceReload: Boolean(options.forceReload),
      timeoutMs: RESOURCE_TIMEOUT_MS
    });

    if (isCacheableResponse(response)) {
      await cache.put(cacheRequest, response.clone());
      await trimCache(cacheName, RUNTIME_CACHE_MAX_ENTRIES);
    }

    return response;
  } catch (error) {
    if (!allowFallback) throw error;
    const cached = await cache.match(cacheRequest)
      || await cache.match(request, { ignoreSearch: hasOnlyInternalCacheBustParams(request) })
      || await caches.match(cacheRequest)
      || await caches.match(request, { ignoreSearch: hasOnlyInternalCacheBustParams(request) });
    if (cached) return cached;
    throw error;
  }
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cacheRequest = createRuntimeCacheRequest(request);
  const cached = await cache.match(cacheRequest)
    || await cache.match(request, { ignoreSearch: hasOnlyInternalCacheBustParams(request) });

  const revalidate = fetchFresh(request, { timeoutMs: RESOURCE_TIMEOUT_MS })
    .then(async function cacheFreshResponse(response) {
      if (isCacheableResponse(response)) {
        await cache.put(cacheRequest, response.clone());
        await trimCache(cacheName, RUNTIME_CACHE_MAX_ENTRIES);
      }
      return response;
    })
    .catch(function ignoreOfflineRevalidation() {
      return null;
    });

  if (cached) return cached;

  const fresh = await revalidate;
  if (fresh) return fresh;

  throw new Error('No hay respuesta en red ni caché para este recurso.');
}

async function networkFirstWithGeneratedImageFallback(request, cacheName, fallbackSpec) {
  const cache = await caches.open(cacheName);
  const canonicalRequest = createCanonicalOptionalAssetRequest(request);

  try {
    const response = await fetchFresh(request, {
      forceReload: false,
      timeoutMs: RESOURCE_TIMEOUT_MS
    });

    if (isUsableImageResponse(response)) {
      await cache.put(canonicalRequest, response.clone());
      await trimCache(cacheName, RUNTIME_CACHE_MAX_ENTRIES);
      return response;
    }

    throw new Error(buildOptionalImageFallbackReason(response));
  } catch (error) {
    const cached = await cache.match(canonicalRequest)
      || await cache.match(request, { ignoreSearch: true })
      || await caches.match(canonicalRequest)
      || await caches.match(request, { ignoreSearch: true });

    if (isUsableImageResponse(cached)) return cached;

    const generated = createGeneratedImageFallbackResponse(fallbackSpec);
    await cache.put(canonicalRequest, generated.clone());
    await trimCache(cacheName, RUNTIME_CACHE_MAX_ENTRIES);
    return generated;
  }
}

async function prefetchUrls(urls) {
  const cache = await caches.open(RUNTIME_CACHE);
  const ownedUrls = urls
    .map(function resolvePrefetchUrl(url) {
      try { return new URL(url, APP_BASE_URL); } catch { return null; }
    })
    .filter(function keepOwnedUrl(url) {
      return url && isApplicationOwnedUrl(url);
    });
  await Promise.allSettled(ownedUrls.map(async function prefetch(url) {
    const request = new Request(url.toString(), { credentials: 'same-origin' });
    const fallbackSpec = getGeneratedImageFallbackSpec(url);

    try {
      const response = await fetchFresh(request, {
        timeoutMs: RESOURCE_TIMEOUT_MS
      });

      if (fallbackSpec) {
        const canonicalRequest = createCanonicalOptionalAssetRequest(request);
        const responseToCache = isUsableImageResponse(response)
          ? response.clone()
          : createGeneratedImageFallbackResponse(fallbackSpec);
        await cache.put(canonicalRequest, responseToCache);
        return;
      }

      if (isCacheableResponse(response)) {
        await cache.put(url, response.clone());
      }
    } catch (error) {
      if (fallbackSpec) {
        await cache.put(createCanonicalOptionalAssetRequest(request), createGeneratedImageFallbackResponse(fallbackSpec));
      }
    }
  }));
  await trimCache(RUNTIME_CACHE, RUNTIME_CACHE_MAX_ENTRIES);
}

function resolveApplicationBaseUrl() {
  const fallback = APP_META.applicationBaseUrl || './';
  try {
    return new URL(self.registration?.scope || fallback, self.location.href);
  } catch {
    return new URL('./', self.location.href);
  }
}

function normalizeDirectoryPath(value = '/') {
  const pathname = String(value || '/').replace(/\/{2,}/g, '/');
  const withLeadingSlash = pathname.startsWith('/') ? pathname : `/${pathname}`;
  return withLeadingSlash.endsWith('/') ? withLeadingSlash : `${withLeadingSlash}/`;
}

function resolveAppRelativePath(value = '') {
  try {
    return new URL(String(value || ''), APP_BASE_URL).pathname;
  } catch {
    return '';
  }
}

function normalizeRootPathPrefixes(values = []) {
  return Array.from(new Set(values.map(function normalizePrefix(value) {
    const pathname = resolveAppRelativePath(value);
    if (!pathname || pathname === '/') return '';
    return normalizeDirectoryPath(pathname);
  }).filter(Boolean)));
}

function normalizeRootExactPaths(values = []) {
  return new Set(values.map(function normalizeExactPath(value) {
    return resolveAppRelativePath(value);
  }).filter(Boolean));
}

function isRootOwnedPath(pathname = '', options = {}) {
  const cleanPath = String(pathname || '/');
  if (options.navigation) return ROOT_NAVIGATION_PATHS.has(cleanPath);
  if (ROOT_OWNED_EXACT_PATHS.has(cleanPath)) return true;
  return ROOT_OWNED_PATH_PREFIXES.some(function ownsPrefix(prefix) {
    return cleanPath.startsWith(prefix);
  });
}

function isApplicationOwnedUrl(input = '', options = {}) {
  let url;
  try {
    url = input instanceof URL ? input : new URL(input, APP_BASE_URL);
  } catch {
    return false;
  }
  if (url.origin !== APP_ORIGIN) return false;
  if (IS_ROOT_APPLICATION) return isRootOwnedPath(url.pathname, options);
  const baseWithoutSlash = APP_BASE_PATH.slice(0, -1);
  return url.pathname === baseWithoutSlash || url.pathname.startsWith(APP_BASE_PATH);
}

function isApplicationClientUrl(input = '') {
  return isApplicationOwnedUrl(input, { navigation: true });
}

function isOwnedMessageSource(event = {}) {
  const sourceUrl = event.source && typeof event.source.url === 'string' ? event.source.url : '';
  return Boolean(sourceUrl && isApplicationClientUrl(sourceUrl));
}

function normalizePushAccountUserId(value = '') {
  const userId = String(value || '').trim();
  if (!userId || userId.length > 160 || /[\u0000-\u001f\u007f]/.test(userId)) return '';
  return userId;
}

function normalizePushDeviceId(value = '') {
  const deviceId = String(value || '').trim();
  if (!deviceId || deviceId.length < 12 || deviceId.length > 160 || /[^a-zA-Z0-9._:-]/.test(deviceId)) return '';
  return deviceId;
}

function pushAccountBindingRequest() {
  return new Request(PUSH_ACCOUNT_BINDING_URL, { method: 'GET', credentials: 'same-origin' });
}

async function readPushAccountBinding() {
  try {
    const cache = await caches.open(PUSH_ACCOUNT_BINDING_CACHE);
    const response = await cache.match(pushAccountBindingRequest());
    if (!response) return null;
    const document = await response.json();
    const userId = normalizePushAccountUserId(document && document.userId);
    const deviceId = normalizePushDeviceId(document && document.deviceId);
    return userId && deviceId
      ? { userId, deviceId, updatedAt: String(document.updatedAt || '') }
      : null;
  } catch {
    return null;
  }
}

async function closeApplicationPushNotifications() {
  if (typeof self.registration.getNotifications !== 'function') return 0;
  try {
    const notifications = await self.registration.getNotifications();
    for (const notification of notifications) notification.close?.();
    return notifications.length;
  } catch {
    return 0;
  }
}

async function writePushAccountBinding(userId = '', deviceId = '') {
  const normalizedUserId = normalizePushAccountUserId(userId);
  const normalizedDeviceId = normalizePushDeviceId(deviceId);
  if (!normalizedUserId) return { ok: false, changed: false, reason: 'invalid_user' };
  if (!normalizedDeviceId) return { ok: false, changed: false, reason: 'invalid_device' };
  const current = await readPushAccountBinding();
  if (current && (current.userId !== normalizedUserId || current.deviceId !== normalizedDeviceId)) {
    await closeApplicationPushNotifications();
  }
  const cache = await caches.open(PUSH_ACCOUNT_BINDING_CACHE);
  await cache.put(pushAccountBindingRequest(), new Response(JSON.stringify({
    userId: normalizedUserId,
    deviceId: normalizedDeviceId,
    updatedAt: new Date().toISOString()
  }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store'
    }
  }));
  return { ok: true, changed: true, userId: normalizedUserId, deviceId: normalizedDeviceId };
}

async function clearPushAccountBinding(expectedUserId = '', expectedDeviceId = '') {
  const expectedUser = normalizePushAccountUserId(expectedUserId);
  const expectedDevice = normalizePushDeviceId(expectedDeviceId);
  if (!expectedUser) return { ok: false, changed: false, reason: 'invalid_user' };
  if (!expectedDevice) return { ok: false, changed: false, reason: 'invalid_device' };
  const current = await readPushAccountBinding();
  if (current && current.userId !== expectedUser) {
    return {
      ok: true,
      changed: false,
      userId: current.userId,
      deviceId: current.deviceId,
      reason: 'account_changed'
    };
  }
  if (current && current.deviceId !== expectedDevice) {
    return {
      ok: true,
      changed: false,
      userId: current.userId,
      deviceId: current.deviceId,
      reason: 'device_changed'
    };
  }
  const cache = await caches.open(PUSH_ACCOUNT_BINDING_CACHE);
  const changed = await cache.delete(pushAccountBindingRequest());
  if (changed) await closeApplicationPushNotifications();
  return { ok: true, changed: Boolean(changed), userId: '', deviceId: '' };
}

async function updatePushAccountBinding(message = {}) {
  const action = String(message.action || '').trim().toLowerCase();
  if (action === 'set') return writePushAccountBinding(message.userId || '', message.deviceId || '');
  if (action === 'clear') {
    return clearPushAccountBinding(
      message.expectedUserId || message.userId || '',
      message.expectedDeviceId || message.deviceId || ''
    );
  }
  return { ok: false, changed: false, reason: 'invalid_action' };
}

function replyToMessageEvent(event = {}, payload = {}) {
  const replyPort = event.ports && event.ports[0];
  if (replyPort && typeof replyPort.postMessage === 'function') {
    replyPort.postMessage(payload);
    return true;
  }
  if (event.source && typeof event.source.postMessage === 'function') {
    event.source.postMessage(payload);
    return true;
  }
  return false;
}

function fetchFresh(request, options) {
  const settings = options || {};
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timeoutMs = Number(settings.timeoutMs || 0);
  let timeoutId = null;

  if (controller && timeoutMs > 0) {
    timeoutId = setTimeout(function abortSlowRequest() {
      controller.abort();
    }, timeoutMs);
  }

  const freshRequest = new Request(request, {
    cache: settings.forceReload ? 'reload' : 'no-cache',
    credentials: request.credentials || 'same-origin',
    redirect: request.redirect || 'follow',
    signal: controller ? controller.signal : undefined
  });

  return fetch(freshRequest).finally(function clearTimer() {
    if (timeoutId) clearTimeout(timeoutId);
  });
}

function createRuntimeCacheRequest(request) {
  const url = new URL(request.url);

  if (url.origin !== new URL(self.location.href).origin) {
    return request;
  }

  INTERNAL_CACHE_BUST_PARAMS.forEach(function removeInternalParam(param) {
    url.searchParams.delete(param);
  });

  url.hash = '';

  return new Request(url.toString(), {
    credentials: 'same-origin',
    mode: 'same-origin',
    redirect: 'follow'
  });
}

function hasOnlyInternalCacheBustParams(request) {
  const url = new URL(request.url);
  if (!url.search) return false;

  const params = Array.from(url.searchParams.keys());
  return params.length > 0 && params.every(function isInternalParam(param) {
    return INTERNAL_CACHE_BUST_PARAMS.includes(param);
  });
}

function createCanonicalOptionalAssetRequest(request) {
  const url = new URL(request.url);
  url.search = '';
  url.hash = '';

  return new Request(url.toString(), {
    credentials: 'same-origin',
    mode: 'same-origin',
    redirect: 'follow'
  });
}

function isOwnedAppCacheName(name) {
  const cacheName = String(name || '');
  return cacheName.startsWith(STATIC_CACHE_PREFIX)
    || cacheName.startsWith(RUNTIME_CACHE_PREFIX);
}

async function deleteOldAppCaches() {
  const allowed = new Set([STATIC_CACHE, RUNTIME_CACHE]);
  const names = await caches.keys();
  await Promise.all(names.map(function deleteIfOld(name) {
    if (isOwnedAppCacheName(name) && !allowed.has(name)) {
      return caches.delete(name);
    }
    return Promise.resolve(false);
  }));
}

async function deleteAllAppCaches() {
  const names = await caches.keys();
  await Promise.all(names.map(function deleteIfAppCache(name) {
    if (isOwnedAppCacheName(name)) {
      return caches.delete(name);
    }
    return Promise.resolve(false);
  }));
}

async function trimCache(cacheName, maxEntries) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();

  if (keys.length <= maxEntries) return;

  await Promise.all(keys.slice(0, keys.length - maxEntries).map(function deleteOldEntry(key) {
    return cache.delete(key);
  }));
}

function getGeneratedImageFallbackSpec(url) {
  return GENERATED_IMAGE_FALLBACKS.find(function matchesFallback(spec) {
    return url.pathname.endsWith(spec.path);
  }) || null;
}

function isUsableImageResponse(response) {
  if (!isCacheableResponse(response)) return false;

  const contentType = String(response.headers.get('Content-Type') || '')
    .toLowerCase()
    .split(';')[0]
    .trim();

  // Render y otros hostings SPA pueden devolver index.html con estado 200 cuando
  // un PNG opcional no existe. Ese HTML nunca debe quedar cacheado como logo/ícono.
  if (contentType === 'text/html' || contentType === 'application/xhtml+xml') return false;

  return !contentType
    || contentType.startsWith('image/')
    || contentType === 'application/octet-stream'
    || contentType === 'binary/octet-stream';
}

function buildOptionalImageFallbackReason(response) {
  if (!response) return 'Imagen opcional no disponible. Se usa fallback geométrico.';

  const contentType = response.headers ? response.headers.get('Content-Type') : '';
  return [
    'Imagen opcional no usable. Se usa fallback geométrico.',
    `status=${response.status || 'sin-status'}`,
    `content-type=${contentType || 'sin-content-type'}`
  ].join(' ');
}

function createGeneratedImageFallbackResponse(spec) {
  const width = Number(spec.width || 96);
  const height = Number(spec.height || width);
  const radius = Math.max(18, Math.round(Math.min(width, height) * 0.22));
  const label = escapeSvg(spec.label || 'Logo de la app');
  const innerSize = Math.round(Math.min(width, height) * 0.46);
  const innerX = Math.round((width - innerSize) / 2);
  const innerY = Math.round((height - innerSize) / 2);

  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${label}">`,
    '<defs>',
    '<linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#128c7e"/><stop offset="1" stop-color="#075e54"/></linearGradient>',
    '<radialGradient id="h" cx="34%" cy="28%" r="44%"><stop offset="0" stop-color="#ffffff" stop-opacity="0.72"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/></radialGradient>',
    '</defs>',
    `<rect width="${width}" height="${height}" rx="${radius}" fill="url(#g)"/>`,
    `<rect width="${width}" height="${height}" rx="${radius}" fill="url(#h)"/>`,
    `<path d="M ${innerX} ${innerY + Math.round(innerSize * 0.52)} C ${innerX} ${innerY + Math.round(innerSize * 0.18)}, ${innerX + Math.round(innerSize * 0.32)} ${innerY}, ${innerX + Math.round(innerSize * 0.56)} ${innerY} C ${innerX + Math.round(innerSize * 0.86)} ${innerY}, ${innerX + innerSize} ${innerY + Math.round(innerSize * 0.3)}, ${innerX + innerSize} ${innerY + Math.round(innerSize * 0.56)} C ${innerX + innerSize} ${innerY + Math.round(innerSize * 0.86)}, ${innerX + Math.round(innerSize * 0.7)} ${innerY + innerSize}, ${innerX + Math.round(innerSize * 0.44)} ${innerY + innerSize} C ${innerX + Math.round(innerSize * 0.16)} ${innerY + innerSize}, ${innerX} ${innerY + Math.round(innerSize * 0.78)}, ${innerX} ${innerY + Math.round(innerSize * 0.52)} Z" fill="#ffffff" fill-opacity="0.88"/>`,
    '</svg>'
  ].join('');

  return new Response(svg, {
    status: 200,
    headers: {
      'Content-Type': 'image/svg+xml; charset=utf-8',
      'Cache-Control': 'no-cache, max-age=0, must-revalidate',
      'X-Generated-Asset-Fallback': 'true'
    }
  });
}

function escapeSvg(value) {
  return String(value || '').replace(/[&<>"']/g, function replaceChar(character) {
    return {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&apos;'
    }[character];
  });
}

function isNetworkOnlyPath(url) {
  return NETWORK_ONLY_PATH_PREFIXES.some(function hasPrefix(prefix) {
    return url.pathname.startsWith(prefix);
  });
}

function mustAlwaysBeFresh(url) {
  return ALWAYS_FRESH_PATHS.some(function matches(pattern) {
    return pattern.test(url.pathname);
  });
}

function isCacheableResponse(response) {
  return response && response.ok && (response.type === 'basic' || response.type === 'default');
}

async function broadcast(payload) {
  const clients = await self.clients.matchAll({ includeUncontrolled: true, type: 'window' });
  clients.forEach(function sendMessage(client) {
    if (isApplicationClientUrl(client.url || '')) client.postMessage(payload);
  });
}

function sanitizeCachePart(value) {
  return String(value).replace(/[^a-zA-Z0-9._-]/g, '-');
}

function parseP2PPushPayload(event) {
  try {
    return event.data ? event.data.json() : {};
  } catch {
    return { title: 'Semilla P2P', body: 'Tienes una nueva actualización compartida.' };
  }
}

self.addEventListener('push', function receiveP2PPush(event) {
  const payload = parseP2PPushPayload(event);
  event.waitUntil((async function showPushForCurrentInstallationOnly() {
    const recipientUserId = normalizePushAccountUserId(payload.recipientUserId || '');
    const recipientDeviceId = normalizePushDeviceId(payload.recipientDeviceId || '');
    const binding = await readPushAccountBinding();
    const reason = !recipientUserId || !recipientDeviceId
      ? 'recipient_missing'
      : !binding || binding.userId !== recipientUserId
        ? 'account_mismatch'
        : binding.deviceId !== recipientDeviceId
          ? 'device_mismatch'
          : '';
    if (reason) {
      await broadcast({ type: 'P2P_PUSH_SUPPRESSED', reason });
      return;
    }

    const title = payload.title || 'Semilla P2P';
    const options = {
      body: payload.body || 'Tienes una nueva actualización compartida.',
      tag: payload.tag || 'semilla-p2p',
      renotify: true,
      badge: './assets/icons/icon-192.png',
      icon: './assets/icons/icon-192.png',
      data: {
        url: payload.url || './index.html',
        type: payload.type || 'p2p.notification',
        invitationId: payload.invitationId || '',
        spaceId: payload.spaceId || '',
        recipientUserId,
        recipientDeviceId
      }
    };
    await Promise.allSettled([
      self.registration.showNotification(title, options),
      broadcast({ type: 'P2P_PUSH_RECEIVED', payload })
    ]);
  })());
});

self.addEventListener('notificationclick', function openP2PNotification(event) {
  event.notification.close();
  event.waitUntil((async function focusOrOpenForCurrentInstallationOnly() {
    const recipientUserId = normalizePushAccountUserId(event.notification?.data?.recipientUserId || '');
    const recipientDeviceId = normalizePushDeviceId(event.notification?.data?.recipientDeviceId || '');
    const binding = await readPushAccountBinding();
    const reason = !recipientUserId || !recipientDeviceId
      ? 'click_recipient_missing'
      : !binding || binding.userId !== recipientUserId
        ? 'click_account_mismatch'
        : binding.deviceId !== recipientDeviceId
          ? 'click_device_mismatch'
          : '';
    if (reason) {
      await broadcast({ type: 'P2P_PUSH_SUPPRESSED', reason });
      return;
    }

    let targetUrl = new URL(event.notification?.data?.url || './index.html', APP_BASE_URL);
    if (!isApplicationOwnedUrl(targetUrl, { navigation: true })) {
      targetUrl = new URL('./index.html', APP_BASE_URL);
    }
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of windows) {
      if (isApplicationClientUrl(client.url || '')) {
        await client.focus();
        if ('navigate' in client) await client.navigate(targetUrl.href);
        return;
      }
    }
    await self.clients.openWindow(targetUrl.href);
  })());
});
