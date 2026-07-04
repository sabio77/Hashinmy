const CHATER_SW_VERSION = '2026-07-03-memoriabackend-auth-only-91';
const CHATER_CACHE = `chater-static-${CHATER_SW_VERSION}`;
// APP_SHELL solo contiene archivos obligatorios que deben existir en el ZIP funcional.
// Las imágenes de proyecto son PNG opcionales cubiertos por prompts en assets.
// Si los iconos PWA aún no existen en Render, el service worker responde con un PNG geométrico cacheable.
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './app-version.json',
  './css/styles.css',
  './js/config.js',
  './auth-gate.js',
  './js/CONFIGmemoriaBACKEND.json',
  './js/app.js',
  './js/pwa.js'
];
const OPTIONAL_ASSET_FALLBACKS = [
  './assets/chater-icon-192.png',
  './assets/chater-icon-512.png',
  './assets/chater-maskable-512.png',
  './assets/chater-icon-fallback.png',
  './assets/chater-maskable-fallback.png'
];
const GEOMETRIC_PNG_PLACEHOLDERS = {
  192: 'iVBORw0KGgoAAAANSUhEUgAAAMAAAADACAYAAABS3GwHAAAEW0lEQVR42u3dPU4jQRRF4XbLyQhpUudOCFgHmwGWwRLAa2APrGOCSSZ3ioQImciJZWHoP1fV/U4+Y7r6nvdedbfbq+7l8bMDQuktAQgAEAAgAEAAgAAAAQACAAQACAAQACAAQACAAAABAAIABAAIABAAIABAAIAAAAEAAgAEAAgAEAAgAEAAgAAAAQACAAQA5mRd8x9/9bDbO4WX5/3pblPr376q7SeShJ4McQIIPRkiBRB8IsRugoW/HUo+l70FQ/I5LWoEEnwjUWwHEH7dIFYA4SdBrADCTwIjEJAogOqPS2egF34kS9ALP5IlsAeAPYDqj9QuoANABwAIYPxB4BikA0AHAFJZ7HHo5PHn398/v4f8u+31zVvqmi31yPRaDSgn8Of+n2QhCBAQeEIQQPAHfD4RCBAVfCIQQPCJQADBJwIBBJ8II3AjrNHwt3osBBAYx2QEEhIjkQ4g/I6VAALhmAkgCI6dAAJgDQjgxFsLAjjh1oQAAAFUOmvzNWsn+HtsXp9/1XSs+9v7j6FrlHSjbC38bQX/+O8eIkKSBB6FaCz4U4pgDxBa/VsJ/5hjStkPuAqEaJofgaaq/vvb+6GVt6gu8JNRKGEvYA9QIENlK1E6I5DZ315AB8itxqV+FhrvAO74Wsv4EQiIHIGWqFhpG81WrwjZA9SxcbUIRiCAAAABLj3/p9Li2uoA0AGAVFwFqoDv3CF2pUgHMP9bYyMQQACAAAABgC9xFagCXOHRAQACAAQACAAQABiNq0AD+e4bHKa4gvPTt0W4aqQDDA3ah2MkwCy8P91tLDdKy0pTHWCKtxYcV8jN6/NiI8XcnzVF9W/tzRBGIBiBjEHtz8m1HNPSGXEV6ExgDi+TXfLKypSfZdMbJsD2+uZtym8tHYuQXPG9GW6iFnf1sNsbIVDCiGwTDJvgBNOh+hfVAeY84KQfel5yb9ViQewTrYfK3/weQBewllUIoAuo/vEdYK6F0AXKXcNSCl+vGiD5XK+6l8fP0hZo6htl3hlaRvUvscj1KgSSz2mfsGD2Apdds5ILWtEPwx0WrsZnh1BHJy9yDzDX/sBeYP7qX9v4Wp0AY2UgwfThr3nPVrUAQ/Fo82lq+85D05tggAAqnTUhgBNuLQjgxFsDAgiAYyeAIDhmAgiEY50GL8Y6EYxW7xMIvg4QGxThJ0BsYITfCPRjrh52+22367qu3ueHBJ8Ak3B4QKwWEQSfAKOrf40iCD4BIjuC4BNg9upfogiCT4CiOsKBuYQQeAIUU/1Pcfhm1PEvvAy9sSbwBKiCc18JFORycSNsZPX3DiMdQNWHDpBU/YVfB1D1QYCU6i/4RiBVHzpAUvUXfAKo+DACJVV/4dcBVH3oAEnVX/h1AFUfsUS+Hh2I3wQDBAABLAEIABAAIABAAIAAAAEAAgAEAAgAEAAgAEAAgAAAAQACAAQACAAQACAAQACAAAABAAIABAAIABAAIABAAIAAAAGAZfgPDv8klWC5UQ0AAAAASUVORK5CYII=',
  512: 'iVBORw0KGgoAAAANSUhEUgAAAgAAAAIACAYAAAD0eNT6AAAMt0lEQVR42u3dPW4izRaA4WZEYlki7dyJA6+DzRgvgyUYr4E9sA4CEvJOLVmETDDyjOYHBjB0V53zPOmV7r1fT3Wdt6rt+UbNcr5vAIBUvnkEACAAAAABAAAIAABAAAAAAgAAEAAAgAAAAAQAACAAAAABAAAIAABAAAAAAgAAEAAAgAAAAAQAACAAAEAAAAACAAAQAACAAAAABAAAIAAAAAEAAAgAAEAAAAACAAAQAACAAAAABAAAIAAAAAEAAAgAAEAAAIAAAAAEAAAgAAAAAQAACAAAQAAAAAIAABAAAIAAAAAEAAAgAAAAAQAACAAAQAAAAAIAABAAAIAAAAABAAAIAABAAAAAAgAAEAAAgAAAAAQAACAAAAABAAAIAABAAAAAAgAAEAAAgAAAAAQAACAAAAABAAACAAAQAACAAAAABAAAIAAAAAEAAAgAAEAAAAACAAAQAACAAAAABAAAIAAAAAEAAAgAAEAAAAACAAAEgEcAAAIAABAAAIAAAAAEAABQp7FHwL/cv7x1ngLE8PH63HoK/GnULOd7j8GgB4QBAgADHxAECAAMfEAQIAAw+AEhgADA0AfEAAIAgx8QAggADH5ACCAAMPgBIYAAwOAHhAACAIMfEAL0xL8LwPAHsHe5AcDLA+A2wA0Ahj+APU0A4EUBsLfF4BOAlwOgVz4JuAHA8AfseQgALwKAvQ8B4AUAsAciACx8AHshAsCCB7AnIgAsdAB7IwLAAgewRyIALGwAeyUCwIIGsGcKAI/AQgawdwoALGAAe6gAwMIFsJcKAABAAKBYAeypAgALFcDeKgAsUADssQIAABAAyhQAe60AsCABsOcKAABAAChRAOy9AgAAEAAKFMAejAAAAASA8gSwFyMAAAABoDgB7MkCAAAQAChNAHuzAAAABAAAIAAycMUEYI8WAACAAFCWANirBQAAIAAAAAEAAAiA0vmmBGDPFgAAgAAAAOoz9ggglu1mPbnFf+/D49O7pwtxjJrlfO8xHOZbElkGvEAgmo/X59ZTcAMAhv0A/19FAQgAINjAv+SfRxCAAAACDnxBAAIAMPTPehZiAAQAGPpiQAzAjfktgCP8BgCG/vDEAF/hNwHcAICh72YAEABg8Nf8nIUACAAw+IUAIADA0M/6ZyEGQACAwe9WABAAYPALAeBP/nXAYPj7swM3AIDh4TYABAAY/AgBEABg8CMEIAY/A4ChYPj7Mwc3AGAI4DYA3ACA4Y+1AG4AwGaP2wBwAwCGP9YICACwsWOtQC18AsBmDgfWjU8CuAEAwx9rCAQA2LixlkAAgA0bawoq42cAsEnDGevLzwXgBgAMf6w1EABgQ8aaAwEANmKsPRAAYAPGGgQBADZerEUQAGDDxZoEAQA2WqxNEABgg8UaBQGAjRWsVRAA2FDBmgUBgI0UrF0QANhAwRoGAYCNE6xlEAAAIADAiQmsaQQA2CjB2kYAgA0SrHEEANgYwVpHAAAAAgCciMCaRwCAjRCsfQQA2ADBO8DQxh4BHNauFneeQr266WznKYAAwMnHwE8ecCUGwXaznjw8Pr3700IAYPgb/Nz4z7m0EBABCAAw+EkcAiAAcPo3+EkWAm4B6JvfAsCpH2vCmkAAQOzTv42ekteGXwtEAGD4G/6IABAAYPhjrYAAwOnfhk7oNeMWAAEAhj/WDggAnP5t4GRZQ24BEAAAwNX5i4Bw+j+gm85KO41aVAOtpaH+oiB/ORACAChOaYEkmuA8PgHg9A8Fryk/C4AAAAAEAE7/Tv+4BQABAAAIAJxUwLsFAgAA+I1fAyTMCeWSb7Q1/CrbkDyfv9fYUH8nwOc75u8FwA0AACAAyH36B+8aCAAAQAAAAAKAq3MlCd45BAAAIAAAgBL5ewD4kuxXkf51swz57vk7ARAAgEACzuITAAAIADidn0QG7yACAAAQAACAACAcV4/gXUQAAAACAAAQAACAAKB+vjmCdxIBAAAIAABAAAAAAoD6+dYI3k0EAAAgAAAAAQAAFGvsEQC30k1nvfzvtKuFhw1uAAAAAcDV+Clj8I4iAAAAAQAACAAAQAAAAAIAABAAAIAAAAAEAGXw+8XgXUUAAAACAAAQAACAAAAABAAAUICxRwDcSrtaeAjgBgAAEAAAgAAAAAQAACAAAAABAAAIAABAAAAAAgAAEAAAgAAAAAEAAAiA7D5en1tPAcAeLgCgYN10tvMUsMZAAHBFD49P754CeFcRAABAxcYeAVyum856+99qVwvPJ8EzAzcAcNnA8Y0WawsEwNf5KVIAe7cAACc1rCkQAACAAAAnNqwlEABx+Jb0g98vBu+oPVsAgJMb1hBUzN8DQPgNvF0t7g7958d+T3zo32EvQebnY/jjBgBs5FgzIACy8k3Jho61gr1aAICNHWsEBICyzKP2nzK2wRN1bfgNAHu0AAARgDUB/+W3AEi94R/7DQEMfnADwE+umOINAEPAnzv25oxGzXK+9xjOc//y1mV/BtvNehLxn8uNgBN/jXz/FwCX8AngwoUmAnIMCEFg4GP4CwAwQADC8DMAihPAXiwA4DS+OYJ3EQGgPAGwBwsAAEAAKNCwXD2Cd9DeKwAAAAGgRAGw5woACzIsnwHAu2evFQAAgABQpgDYYwWABRqWzwDgnbO3CgAsVAB7qgAAAASAYg3LZwDwrtlLBQAWLoA9VABYwE4mgHfM3ikARAAA9kwBYEE7oQDeLcNfAFjYAPZIBIAF7qQCZHinDH8BIAIA7IkIAAveiQWc/u2FCAALH8AeiADwAji5gNO/vQ8B4EUAsOdxolGznO89hnLcv7x10f6Ztpv1xJ8sOP0b/G4A8IIA9jYEANFfFD8LALnfGcO/TGOPoOwXJuInAcBhBjcAJHmB3AJArnfF8C+fHwKsSITbAD8QCLGHv8FfD58AKnyxfBYADH7cALgRcAsATv8GP24A3AgAGPy4AXAj4BYAnP4NfgSAGBABYPgb+jSNTwBh+TwAGPy4AaDYmwG3ADj9G/gIAJIGgQjA8DfwEQAkDQMRgOFv0NMvPwNAKRvGzlPH+wX98e8CoAjtanHnKWCtgwDAxgjWOAgAbJBgbYMAwEYJ1jQIAABAAODEBNYyCABsnGANgwDABgrWLggAbKRgzSIAwIYK1ioCAGysYI0iAMAGC9YmAgBstGBNIgDAhou1CAIAbLxYgyAAwAaMtQcCAGzEWHMgAMCGjLUGvRp7BETbmLvpbOdpYPCDGwBs1GBNgQDAhg3WEggAbNxgDZGQnwEgxQbu5wIw+MENADZ0sFYQAB4BNnawRsjHJwBSbvA+CWDw4wYAEnp4fHr3FDD8cQMAiSNgu1lPPA2DH9wAQHD3L2+d2wDD31PADQDgNsDgBwEAmU7/QsDgBwEACAGDH9LwMwA4/Z8QAhj+4AYA3AZg8IMAgKinfyFg8IMAAP4KATFg6IMAgOCnf7cCBj8IAEAIGPwgACDr6f9YCIgBQx8EACS/FRADhj4IAAh8+hcDhj4IAEAMGPogACDz6f+UGPh4fW6bpmm66Wxn4AMCAIL7HPyHBmTtQWDggwAAp/8jg/+cAVpqFBj2IACAKwz/SwftrQLBgAcBAE7/Awx+gxq4Jv86YAg0/AHcAOD0b/ADCAAw+AF+8QkAp3/DH3ADABj8gAAAp3+DHwjJJwAw/AE3AOD0b/ADbgAAwx9wAwCZT/8GPyAAwIkfoGo+AeD0b/gDbgAAgx8QAJDs9G/wA1n4BACGP+AGAPKd/g1+wA0AOPUDuAGAqKd/gx8QAODED5COTwCkOf0b/gBuAHDqBxAAEPH0b/ADHOYTAE79AG4AoO7Tv8EP4AYAp34A3AAQ9fRv8AMIAJz4ATiBTwBUefo3/AHcAODUD4AAIOLp3+AHuC6fAHDqB3ADAOWc/g1+ADcAOPUD4AaAqKd/gx+gH6NmOd97DACQi08AACAAAAABAAAIAABAAAAAAgAAEAAAgAAAAAQAACAAAAABAAAIAABAAAAAAgAAEAAAgAAAAAQAACAAAEAAAAACAAAQAACAAAAABAAAIAAAAAEAAAgAAEAAAAACAAAQAACAAAAABAAAIAAAAAEAAAgAAEAAAIAAAAAEAAAgAAAAAQAACAAAQAAAAAIAABAAAIAAAAAEAAAgAAAAAQAACAAAQAAAAAIAABAAAIAAAAABAAAIAABAAAAAAgAAEAAAgAAAAAQAACAAAAABAAAIAABAAAAAAgAAEAAAgAAAAAQAACAAAAABAAACAAAQAACAAAAABAAAIAAAAAEAAAgAAEAAAAACAAAQAACAAAAABAAAIAAAAAEAAAgAAEAAAAACAAAQAAAgAAAAAQAACAAAQAAAAJX6DjbuZ4ZzAAS2AAAAAElFTkSuQmCC'
};
const APP_SHELL_PATHS = new Set(APP_SHELL.map((path) => new URL(path, self.location.href).pathname));

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CHATER_CACHE)
      .then(async (cache) => {
        await cache.addAll(APP_SHELL);
        await cacheOptionalAssetFallbacks(cache);
      })
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys
        .filter((key) => key.startsWith('chater-static-') && key !== CHATER_CACHE)
        .map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
    return;
  }

  if (event.data?.type === 'REFRESH_APP_SHELL') {
    event.waitUntil(
      refreshAppShellCache()
        .then((result) => {
          const failed = Number(result?.failed || 0);
          event.ports?.[0]?.postMessage({
            ok: failed === 0,
            result,
            message: failed === 0
              ? 'Cache estática refrescada correctamente.'
              : `No se pudieron refrescar ${failed} archivo(s) obligatorios del shell estático.`
          });
        })
        .catch((error) => {
          event.ports?.[0]?.postMessage({ ok: false, message: error?.message || 'No se pudo refrescar la cache estática.' });
        })
    );
  }
});

self.addEventListener('push', (event) => {
  const payload = readPushPayload(event);
  const notificationTitle = sanitizeNotificationText(payload.title || payload.heading || 'Nuevo aviso en ChatER', 90);
  const notificationOptions = {
    body: sanitizeNotificationText(payload.body || payload.message || 'Tienes actividad nueva en ChatER.', 180),
    icon: normalizeNotificationAssetUrl(payload.icon, './assets/chater-icon-192.png'),
    badge: normalizeNotificationAssetUrl(payload.badge, './assets/chater-maskable-512.png'),
    tag: payload.tag || payload.chatId || payload.callId || 'chater-notification',
    renotify: Boolean(payload.renotify),
    data: {
      url: normalizeNotificationTargetUrl(payload.url || payload.deepLink || './index.html'),
      chatId: payload.chatId || '',
      callId: payload.callId || '',
      stateId: payload.stateId || '',
      type: payload.type || ''
    }
  };

  event.waitUntil(self.registration.showNotification(notificationTitle, notificationOptions));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = normalizeNotificationTargetUrl(event.notification?.data?.url || './index.html');

  event.waitUntil((async () => {
    const windowClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const matchingClient = windowClients.find((client) => {
      try {
        return new URL(client.url).origin === self.location.origin;
      } catch (error) {
        return false;
      }
    });

    if (matchingClient) {
      await matchingClient.focus();
      matchingClient.postMessage?.({ type: 'NOTIFICATION_CLICKED', url: targetUrl, data: event.notification?.data || {} });
      return;
    }

    if (self.clients.openWindow) {
      await self.clients.openWindow(targetUrl);
    }
  })());
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request, './index.html'));
    return;
  }

  if (isRuntimeBackendRequest(request, url)) {
    return;
  }

  if (isAppShellRequest(url)) {
    event.respondWith(networkFirst(request));
    return;
  }

  if (isOptionalAssetImageRequest(url)) {
    event.respondWith(assetImageWithGeometricFallback(request, url));
    return;
  }

  event.respondWith(staleWhileRevalidate(request));
});

function readPushPayload(event) {
  if (!event.data) return {};

  try {
    return event.data.json() || {};
  } catch (error) {
    try {
      return { body: event.data.text() };
    } catch (innerError) {
      return {};
    }
  }
}

function sanitizeNotificationText(value = '', maxLength = 180) {
  const normalized = String(value || '').replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, Math.max(0, maxLength - 1)).trim()}…`;
}

function normalizeNotificationTargetUrl(value = './index.html') {
  try {
    const url = new URL(value || './index.html', self.location.href);
    if (url.origin !== self.location.origin) return './index.html';
    return `${url.pathname}${url.search}${url.hash}` || './index.html';
  } catch (error) {
    return './index.html';
  }
}

function normalizeNotificationAssetUrl(value = '', fallback = './assets/chater-icon-192.png') {
  try {
    const url = new URL(value || fallback, self.location.href);
    if (url.origin !== self.location.origin || !url.pathname.includes('/assets/') || !url.pathname.endsWith('.png')) return fallback;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch (error) {
    return fallback;
  }
}

async function networkFirst(request, fallbackUrl = '') {
  const cache = await caches.open(CHATER_CACHE);
  try {
    const fetchRequest = request.mode === 'navigate' ? request : new Request(request, { cache: 'reload' });
    const fresh = await fetch(fetchRequest);
    if (fresh && fresh.ok) cache.put(request, fresh.clone());
    return fresh;
  } catch (error) {
    const cached = await cache.match(request);
    if (cached) return cached;
    if (fallbackUrl) {
      const fallback = await cache.match(fallbackUrl);
      if (fallback) return fallback;
    }
    return Response.error();
  }
}

async function refreshAppShellCache() {
  const cache = await caches.open(CHATER_CACHE);
  const settledResults = await Promise.allSettled(APP_SHELL.map(async (assetPath) => {
    const assetUrl = new URL(assetPath, self.location.href).toString();
    const request = new Request(assetUrl, { cache: 'reload' });
    const response = await fetch(request);
    if (!response || !response.ok) {
      throw new Error(`No se pudo refrescar ${assetPath}`);
    }
    await cache.put(request, response.clone());
    return assetPath;
  }));

  const optionalFallbacks = await cacheOptionalAssetFallbacks(cache);
  const refreshed = settledResults.filter((result) => result.status === 'fulfilled').length;
  const failed = settledResults.length - refreshed;
  return { refreshed, failed, optionalFallbacks, cacheName: CHATER_CACHE };
}

async function cacheOptionalAssetFallbacks(cache) {
  const settledResults = await Promise.allSettled(OPTIONAL_ASSET_FALLBACKS.map(async (assetPath) => {
    const assetUrl = new URL(assetPath, self.location.href);
    const request = new Request(assetUrl.toString());

    try {
      const fresh = await fetch(new Request(assetUrl.toString(), { cache: 'reload' }));
      if (fresh && fresh.ok) {
        await cache.put(request, fresh.clone());
        return { assetPath, source: 'network' };
      }
    } catch (error) {
      // Si el asset opcional todavía no existe en Render, se conserva el fallback geométrico.
    }

    const fallback = createGeometricAssetPlaceholderResponse(assetUrl.pathname);
    await cache.put(request, fallback.clone());
    return { assetPath, source: 'geometric-fallback' };
  }));

  return settledResults.filter((result) => result.status === 'fulfilled').length;
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CHATER_CACHE);
  const cached = await cache.match(request);
  const freshPromise = fetch(request)
    .then((response) => {
      if (response && response.ok) cache.put(request, response.clone());
      return response;
    });

  if (cached) {
    freshPromise.catch(() => null);
    return cached;
  }

  try {
    return await freshPromise;
  } catch (error) {
    return createStaticResourceMissResponse(request);
  }
}

function isAppShellRequest(url) {
  if (url.origin !== self.location.origin) return false;
  return APP_SHELL_PATHS.has(url.pathname);
}

function isRuntimeBackendRequest(request, url) {
  const acceptHeader = request.headers.get('accept') || '';
  const pathname = url.pathname.replace(/\/+$/, '') || '/';

  if (acceptHeader.includes('text/event-stream')) return true;

  // Solo se omiten de cache los montajes canónicos publicados por memoriaBACKEND.
  // No se mantienen prefijos heredados como /chats, /messages, /devices,
  // /notifications, /search, /reports o /privacy para que la PWA no trate
  // contratos antiguos como APIs vigentes del proyecto estático.
  const backendPrefixes = [
    '/api/v1',
    '/auth',
    '/login.js',
    '/sdk'
  ];

  return backendPrefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

function isOptionalAssetImageRequest(url) {
  return url.pathname.includes('/assets/') && /\.png$/i.test(url.pathname);
}

function createStaticResourceMissResponse(request) {
  const acceptHeader = request.headers.get('accept') || '';
  const wantsJson = acceptHeader.includes('application/json');
  const requestUrl = new URL(request.url);
  const message = 'Recurso estático no disponible offline y sin copia cacheada.';

  if (wantsJson || requestUrl.pathname.endsWith('.json')) {
    return new Response(JSON.stringify({ ok: false, error: 'static_resource_unavailable', message }), {
      status: 504,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store'
      }
    });
  }

  return new Response(message, {
    status: 504,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store'
    }
  });
}

async function assetImageWithGeometricFallback(request, url) {
  const cache = await caches.open(CHATER_CACHE);

  try {
    const fresh = await fetch(request);
    if (fresh && fresh.ok) {
      cache.put(request, fresh.clone());
      return fresh;
    }
  } catch (error) {
    // Si la imagen opcional no existe todavía, se intenta usar cache o fallback geométrico.
  }

  const cached = await cache.match(request);
  if (cached) return cached;

  const fallback = createGeometricAssetPlaceholderResponse(url.pathname);
  cache.put(request, fallback.clone());
  return fallback;
}

function createGeometricAssetPlaceholderResponse(pathname) {
  if (!shouldServePwaIconFallback(pathname)) {
    return createMissingOptionalAssetImageResponse();
  }

  const filename = pathname.split('/').pop() || 'asset.png';
  const size = filename.includes('192') ? 192 : 512;
  const base64 = GEOMETRIC_PNG_PLACEHOLDERS[size] || GEOMETRIC_PNG_PLACEHOLDERS[512];
  return new Response(base64ToUint8Array(base64), {
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=3600'
    }
  });
}

function shouldServePwaIconFallback(pathname = '') {
  return /\/assets\/(chater-icon-(192|512|fallback)|chater-maskable-(512|fallback))\.png$/i.test(pathname);
}

function createMissingOptionalAssetImageResponse() {
  return new Response('', {
    status: 404,
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'no-store'
    }
  });
}

function base64ToUint8Array(base64 = '') {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}
