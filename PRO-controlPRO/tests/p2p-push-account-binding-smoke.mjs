import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');

function cacheKey(input) {
  return String(input?.url || input || '');
}

function createMemoryCaches() {
  const stores = new Map();
  return {
    stores,
    async keys() { return [...stores.keys()]; },
    async delete(name) { return stores.delete(name); },
    async match(request) {
      for (const store of stores.values()) {
        const response = store.get(cacheKey(request));
        if (response) return response.clone();
      }
      return null;
    },
    async open(name) {
      if (!stores.has(name)) stores.set(name, new Map());
      const store = stores.get(name);
      return {
        async keys() { return [...store.keys()].map((url) => new Request(url)); },
        async delete(request) { return store.delete(cacheKey(request)); },
        async put(request, response) { store.set(cacheKey(request), response.clone()); },
        async match(request) {
          const response = store.get(cacheKey(request));
          return response ? response.clone() : null;
        }
      };
    }
  };
}

function createWorker() {
  const listeners = new Map();
  const notifications = [];
  const posted = [];
  const focused = [];
  const navigated = [];
  const opened = [];
  const caches = createMemoryCaches();
  const scope = 'https://hashinmy.com/contabilidad/';
  const client = {
    url: scope,
    postMessage(payload) { posted.push(payload); },
    async focus() { focused.push(client.url); },
    async navigate(url) { navigated.push(url); }
  };
  const contextObject = {
    APP_SEED_METADATA: {
      applicationBaseUrl: scope,
      cacheNamespace: 'semilla-appweb-pwa:contabilidad',
      version: '1.9.59',
      build: 'push-account-binding-test',
      precacheUrls: ['./', './index.html', './offline.html', './manifest.webmanifest', './sw.js'],
      rootOwnedPathPrefixes: ['/assets/', '/src/', '/textX/', '/.well-known/'],
      rootNavigationPaths: ['/', '/index.html', '/offline.html']
    },
    URL,
    Request,
    Response,
    AbortController,
    Date,
    console,
    setTimeout,
    clearTimeout,
    importScripts() {},
    registration: {
      scope,
      navigationPreload: { async enable() {} },
      async showNotification(title, options) {
        notifications.push({
          title,
          options,
          closed: false,
          close() { this.closed = true; }
        });
      },
      async getNotifications() { return notifications.filter((notification) => !notification.closed); }
    },
    location: { href: `${scope}sw.js`, origin: 'https://hashinmy.com' },
    clients: {
      async claim() {},
      async matchAll() { return [client]; },
      async openWindow(url) { opened.push(url); return null; }
    },
    skipWaiting: async () => {},
    addEventListener(type, listener) { listeners.set(type, listener); },
    async fetch(request) { return new Response(`network:${request.url || request}`); },
    caches
  };
  contextObject.self = contextObject;
  const context = vm.createContext(contextObject);
  vm.runInContext(source, context, { filename: 'sw.js' });
  return { context, listeners, notifications, posted, focused, navigated, opened, caches, scope };
}

async function dispatchBinding(worker, data, sourceUrl = worker.scope) {
  let pending = Promise.resolve();
  let reply = null;
  const port = { postMessage(payload) { reply = payload; } };
  worker.listeners.get('message')({
    data: {
      type: 'P2P_PUSH_ACCOUNT_BINDING',
      requestId: `req-${Math.random()}`,
      ...data
    },
    source: { url: sourceUrl, postMessage(payload) { reply = payload; } },
    ports: [port],
    waitUntil(value) { pending = Promise.resolve(value); }
  });
  await pending;
  return reply;
}

async function dispatchPush(worker, payload, malformed = false) {
  let pending = Promise.resolve();
  worker.listeners.get('push')({
    data: malformed ? { json() { throw new Error('payload inválido'); } } : { json() { return payload; } },
    waitUntil(value) { pending = Promise.resolve(value); }
  });
  await pending;
}

async function dispatchNotificationClick(worker, notification) {
  let pending = Promise.resolve();
  worker.listeners.get('notificationclick')({
    notification: {
      data: notification.options.data,
      close() { notification.closed = true; }
    },
    waitUntil(value) { pending = Promise.resolve(value); }
  });
  await pending;
}

const worker = createWorker();
const deviceA = 'dev_account_a_0001';
const deviceAReplacement = 'dev_account_a_0002';
const deviceB = 'dev_account_b_0001';

const setResult = await dispatchBinding(worker, { action: 'set', userId: 'user_a', deviceId: deviceA });
assert.equal(setResult?.ok, true);
assert.equal(setResult?.userId, 'user_a');
assert.equal(setResult?.deviceId, deviceA);

const foreignClear = await dispatchBinding(worker, {
  action: 'clear',
  expectedUserId: 'user_b',
  expectedDeviceId: deviceB
});
assert.equal(foreignClear?.ok, true);
assert.equal(foreignClear?.changed, false);
assert.equal(foreignClear?.reason, 'account_changed');

worker.posted.length = 0;
await dispatchPush(worker, {
  recipientUserId: 'user_a',
  recipientDeviceId: deviceA,
  title: 'Invitación',
  body: 'Proyecto compartido',
  invitationId: 'inv_1'
});
assert.equal(worker.notifications.length, 1);
assert.equal(worker.notifications[0].title, 'Invitación');
assert.equal(worker.notifications[0].options.data.recipientUserId, 'user_a');
assert.equal(worker.notifications[0].options.data.recipientDeviceId, deviceA);
assert.equal(worker.posted.at(-1)?.type, 'P2P_PUSH_RECEIVED');
assert.equal(worker.posted.at(-1)?.payload?.recipientUserId, 'user_a');
assert.equal(worker.posted.at(-1)?.payload?.recipientDeviceId, deviceA);

worker.posted.length = 0;
await dispatchPush(worker, {
  recipientUserId: 'user_a',
  recipientDeviceId: deviceAReplacement,
  title: 'No debe verse',
  body: 'Instalación distinta',
  invitationId: 'inv_otro_dispositivo'
});
assert.equal(worker.notifications.length, 1);
assert.equal(JSON.stringify(worker.posted), JSON.stringify([{ type: 'P2P_PUSH_SUPPRESSED', reason: 'device_mismatch' }]));
assert.equal(JSON.stringify(worker.posted).includes('inv_otro_dispositivo'), false);

worker.posted.length = 0;
await dispatchPush(worker, {
  recipientUserId: 'user_b',
  recipientDeviceId: deviceB,
  title: 'No debe verse',
  body: 'Cuenta distinta',
  invitationId: 'inv_privada'
});
assert.equal(worker.notifications.length, 1);
assert.equal(JSON.stringify(worker.posted), JSON.stringify([{ type: 'P2P_PUSH_SUPPRESSED', reason: 'account_mismatch' }]));
assert.equal(JSON.stringify(worker.posted).includes('inv_privada'), false);

worker.posted.length = 0;
await dispatchPush(worker, { recipientUserId: 'user_a', title: 'Sin instalación', body: 'No debe verse' });
assert.equal(worker.notifications.length, 1);
assert.equal(JSON.stringify(worker.posted), JSON.stringify([{ type: 'P2P_PUSH_SUPPRESSED', reason: 'recipient_missing' }]));

worker.posted.length = 0;
await dispatchPush(worker, {}, true);
assert.equal(worker.notifications.length, 1);
assert.equal(JSON.stringify(worker.posted), JSON.stringify([{ type: 'P2P_PUSH_SUPPRESSED', reason: 'recipient_missing' }]));

worker.posted.length = 0;
await dispatchNotificationClick(worker, worker.notifications[0]);
assert.equal(worker.focused.length, 1);
assert.equal(worker.navigated.length, 1);
assert.equal(worker.opened.length, 0);

const unownedResult = await dispatchBinding(
  worker,
  { action: 'set', userId: 'user_b', deviceId: deviceB },
  'https://hashinmy.com/facturacion/'
);
assert.equal(unownedResult, null);

const missingFence = await dispatchBinding(worker, { action: 'clear' });
assert.equal(missingFence?.ok, false);
assert.equal(missingFence?.reason, 'invalid_user');

const missingDevice = await dispatchBinding(worker, { action: 'set', userId: 'user_a' });
assert.equal(missingDevice?.ok, false);
assert.equal(missingDevice?.reason, 'invalid_device');

const rotated = await dispatchBinding(worker, {
  action: 'set',
  userId: 'user_a',
  deviceId: deviceAReplacement
});
assert.equal(rotated?.ok, true);
assert.equal(rotated?.deviceId, deviceAReplacement);
assert.equal(worker.notifications[0].closed, true);

const staleDeviceClear = await dispatchBinding(worker, {
  action: 'clear',
  expectedUserId: 'user_a',
  expectedDeviceId: deviceA
});
assert.equal(staleDeviceClear?.ok, true);
assert.equal(staleDeviceClear?.changed, false);
assert.equal(staleDeviceClear?.reason, 'device_changed');
assert.equal(staleDeviceClear?.deviceId, deviceAReplacement);

worker.posted.length = 0;
await dispatchNotificationClick(worker, worker.notifications[0]);
assert.equal(worker.focused.length, 1);
assert.equal(worker.navigated.length, 1);
assert.equal(worker.opened.length, 0);
assert.equal(worker.posted.at(-1)?.reason, 'click_device_mismatch');

worker.posted.length = 0;
await dispatchPush(worker, {
  recipientUserId: 'user_a',
  recipientDeviceId: deviceA,
  title: 'Instalación retirada'
});
assert.equal(worker.notifications.length, 1);
assert.equal(JSON.stringify(worker.posted), JSON.stringify([{ type: 'P2P_PUSH_SUPPRESSED', reason: 'device_mismatch' }]));

worker.posted.length = 0;
await dispatchPush(worker, {
  recipientUserId: 'user_a',
  recipientDeviceId: deviceAReplacement,
  title: 'Instalación actual'
});
assert.equal(worker.notifications.length, 2);
assert.equal(worker.notifications[1].closed, false);

const switched = await dispatchBinding(worker, { action: 'set', userId: 'user_b', deviceId: deviceB });
assert.equal(switched?.ok, true);
assert.equal(worker.notifications[1].closed, true);

const staleAccountClear = await dispatchBinding(worker, {
  action: 'clear',
  expectedUserId: 'user_a',
  expectedDeviceId: deviceAReplacement
});
assert.equal(staleAccountClear?.ok, true);
assert.equal(staleAccountClear?.changed, false);
assert.equal(staleAccountClear?.reason, 'account_changed');

worker.posted.length = 0;
await dispatchPush(worker, {
  recipientUserId: 'user_a',
  recipientDeviceId: deviceAReplacement,
  title: 'Cuenta anterior'
});
assert.equal(worker.notifications.length, 2);
assert.equal(JSON.stringify(worker.posted), JSON.stringify([{ type: 'P2P_PUSH_SUPPRESSED', reason: 'account_mismatch' }]));

worker.posted.length = 0;
await dispatchPush(worker, { recipientUserId: 'user_b', recipientDeviceId: deviceB, title: 'Cuenta actual' });
assert.equal(worker.notifications.length, 3);
assert.equal(worker.notifications[2].closed, false);

const cleared = await dispatchBinding(worker, {
  action: 'clear',
  expectedUserId: 'user_b',
  expectedDeviceId: deviceB
});
assert.equal(cleared?.ok, true);
assert.equal(cleared?.changed, true);
assert.equal(worker.notifications[2].closed, true);

worker.posted.length = 0;
await dispatchNotificationClick(worker, worker.notifications[2]);
assert.equal(worker.focused.length, 1);
assert.equal(worker.navigated.length, 1);
assert.equal(worker.opened.length, 0);
assert.equal(worker.posted.at(-1)?.reason, 'click_account_mismatch');

console.log('OK: Web Push solo se muestra y abre para la cuenta y la instalación activas; cambios de deviceId cercan avisos en tránsito y limpiezas tardías.');
