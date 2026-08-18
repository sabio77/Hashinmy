import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');

function createWorker(applicationPath = '/') {
  const listeners = new Map();
  const posted = [];
  const focused = [];
  const navigated = [];
  const opened = [];
  const appPath = applicationPath === '/' ? '/' : `/${applicationPath.replace(/^\/+|\/+$/g, '')}/`;
  const scope = new URL(appPath, 'https://hashinmy.com/').toString();
  const clients = [
    {
      url: 'https://hashinmy.com/?tab=root',
      postMessage(payload) { posted.push({ client: 'root', payload }); },
      async focus() { focused.push('root'); },
      async navigate(url) { navigated.push({ client: 'root', url }); }
    },
    {
      url: 'https://hashinmy.com/contabilidad/?tab=accounting',
      postMessage(payload) { posted.push({ client: 'contabilidad', payload }); },
      async focus() { focused.push('contabilidad'); },
      async navigate(url) { navigated.push({ client: 'contabilidad', url }); }
    },
    {
      url: 'https://hashinmy.com/facturacion/?tab=billing',
      postMessage(payload) { posted.push({ client: 'facturacion', payload }); },
      async focus() { focused.push('facturacion'); },
      async navigate(url) { navigated.push({ client: 'facturacion', url }); }
    }
  ];
  const contextObject = {
    APP_SEED_METADATA: {
      applicationBaseUrl: scope,
      cacheNamespace: appPath === '/' ? 'semilla-appweb-pwa' : `semilla-appweb-pwa:${applicationPath}`,
      version: '1.9.51',
      build: 'request-isolation-test',
      precacheUrls: [
        './', './index.html', './offline.html', './manifest.webmanifest', './sw.js',
        './src/js/app.js', './assets/pwa/pwa_launcher_any_192x192.png'
      ],
      rootOwnedPathPrefixes: ['/assets/', '/src/', '/textX/', '/.well-known/'],
      rootNavigationPaths: ['/', '/index.html', '/offline.html']
    },
    URL,
    Request,
    Response,
    AbortController,
    console,
    setTimeout,
    clearTimeout,
    importScripts() {},
    registration: {
      scope,
      navigationPreload: { async enable() {} },
      async showNotification() {}
    },
    location: { href: new URL('sw.js', scope).toString(), origin: 'https://hashinmy.com' },
    clients: {
      async claim() {},
      async matchAll() { return clients; },
      async openWindow(url) { opened.push(url); return null; }
    },
    skipWaiting: async () => {},
    addEventListener(type, listener) { listeners.set(type, listener); },
    async fetch(request) {
      return new Response(`network:${request.url || request}`, {
        status: 200,
        headers: { 'Content-Type': 'text/html; charset=utf-8' }
      });
    },
    caches: {
      async keys() { return []; },
      async delete() { return true; },
      async open() {
        return {
          async keys() { return []; },
          async delete() { return true; },
          async put() {},
          async match() { return null; }
        };
      },
      async match() { return null; }
    }
  };
  contextObject.self = contextObject;
  const context = vm.createContext(contextObject);
  vm.runInContext(source, context, { filename: 'sw.js' });
  return { context, listeners, posted, focused, navigated, opened };
}

function dispatchFetch(worker, url, mode = 'cors') {
  let responsePromise = null;
  worker.listeners.get('fetch')({
    request: { method: 'GET', url, mode, credentials: 'same-origin', redirect: 'follow' },
    preloadResponse: Promise.resolve(null),
    respondWith(value) { responsePromise = Promise.resolve(value).catch(() => null); }
  });
  return responsePromise;
}

function dispatchMessage(worker, sourceUrl, type = 'GET_APP_VERSION') {
  const messages = [];
  worker.listeners.get('message')({
    data: { type },
    source: {
      url: sourceUrl,
      postMessage(payload) { messages.push(payload); }
    },
    waitUntil() {}
  });
  return messages;
}

async function dispatchNotificationClick(worker, targetUrl, recipientUserId, recipientDeviceId) {
  let pending = Promise.resolve();
  worker.listeners.get('notificationclick')({
    notification: {
      data: { url: targetUrl, recipientUserId, recipientDeviceId },
      close() {}
    },
    waitUntil(value) { pending = Promise.resolve(value); }
  });
  await pending;
}

const rootWorker = createWorker('/');
assert.equal(rootWorker.context.isApplicationOwnedUrl('https://hashinmy.com/', { navigation: true }), true);
assert.equal(rootWorker.context.isApplicationOwnedUrl('https://hashinmy.com/src/js/app.js'), true);
assert.equal(rootWorker.context.isApplicationOwnedUrl('https://hashinmy.com/contabilidad/', { navigation: true }), false);
assert.equal(rootWorker.context.isApplicationOwnedUrl('https://hashinmy.com/contabilidad/src/js/app.js'), false);
assert.ok(dispatchFetch(rootWorker, 'https://hashinmy.com/', 'navigate'));
assert.equal(dispatchFetch(rootWorker, 'https://hashinmy.com/contabilidad/', 'navigate'), null);
assert.ok(dispatchFetch(rootWorker, 'https://hashinmy.com/src/js/app.js'));
assert.equal(dispatchFetch(rootWorker, 'https://hashinmy.com/facturacion/src/js/app.js'), null);
assert.equal(dispatchMessage(rootWorker, 'https://hashinmy.com/').length, 1);
assert.equal(dispatchMessage(rootWorker, 'https://hashinmy.com/contabilidad/').length, 0);
await rootWorker.context.broadcast({ type: 'APP_SW_ACTIVATED' });
assert.deepEqual(rootWorker.posted.map((item) => item.client), ['root']);
rootWorker.context.readPushAccountBinding = async () => ({ userId: 'user_root', deviceId: 'device_root_0001' });
await dispatchNotificationClick(rootWorker, 'https://hashinmy.com/contabilidad/?p2pInvitation=inv_1', 'user_root', 'device_root_0001');
assert.deepEqual(rootWorker.focused, ['root']);
assert.equal(rootWorker.navigated.length, 0);
assert.equal(rootWorker.posted.at(-1).payload?.payload?.recipientUserId, 'user_root');
assert.equal(rootWorker.posted.at(-1).payload?.source, 'notification-click');

const childWorker = createWorker('contabilidad');
assert.equal(childWorker.context.isApplicationOwnedUrl('https://hashinmy.com/contabilidad/', { navigation: true }), true);
assert.equal(childWorker.context.isApplicationOwnedUrl('https://hashinmy.com/contabilidad/src/js/app.js'), true);
assert.equal(childWorker.context.isApplicationOwnedUrl('https://hashinmy.com/', { navigation: true }), false);
assert.equal(childWorker.context.isApplicationOwnedUrl('https://hashinmy.com/facturacion/', { navigation: true }), false);
assert.ok(dispatchFetch(childWorker, 'https://hashinmy.com/contabilidad/', 'navigate'));
assert.equal(dispatchFetch(childWorker, 'https://hashinmy.com/facturacion/', 'navigate'), null);
assert.equal(dispatchMessage(childWorker, 'https://hashinmy.com/contabilidad/').length, 1);
assert.equal(dispatchMessage(childWorker, 'https://hashinmy.com/').length, 0);
await childWorker.context.broadcast({ type: 'P2P_PUSH_RECEIVED' });
assert.deepEqual(childWorker.posted.map((item) => item.client), ['contabilidad']);
childWorker.context.readPushAccountBinding = async () => ({ userId: 'user_contabilidad', deviceId: 'device_contabilidad_0001' });
await dispatchNotificationClick(childWorker, 'https://hashinmy.com/facturacion/?p2pInvitation=inv_2', 'user_contabilidad', 'device_contabilidad_0001');
assert.deepEqual(childWorker.focused, ['contabilidad']);
assert.equal(childWorker.navigated.length, 0);
assert.equal(childWorker.posted.at(-1).payload?.payload?.recipientUserId, 'user_contabilidad');
assert.equal(childWorker.posted.at(-1).payload?.source, 'notification-click');

console.log('OK: el Service Worker raíz no intercepta apps hermanas y una notificación P2P enfoca la app abierta sin navegar ni recargarla.');
