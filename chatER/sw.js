const CACHE_NAME = 'chater-static-v61';
const CORE_ASSETS = [
  './index.html',
  './styles.css',
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
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || event.request.method !== 'GET') return;

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

self.addEventListener('push', (event) => {
  const payload = parsePushPayload(event);
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
      type: payload.type || 'chat.notification'
    }
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = new URL(event.notification?.data?.url || './index.html', self.location.href).toString();
  event.waitUntil((async () => {
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
  })());
});
