(function () {

  const pwaVolatileStorage = new Map();
  let pwaStorageWarningShown = false;

  function getPwaLocalStorage() {
    try {
      return window.localStorage || null;
    } catch (error) {
      return null;
    }
  }

  function warnPwaStorageFallback(error) {
    if (pwaStorageWarningShown) return;
    pwaStorageWarningShown = true;
    console.warn('ChatER PWA usa almacenamiento temporal para su versión porque el almacenamiento persistente no está disponible.', error);
  }

  function readPwaStorageItem(key, fallbackValue = '') {
    const storageKey = String(key || '');
    if (!storageKey) return fallbackValue;

    try {
      const storage = getPwaLocalStorage();
      if (storage) {
        const value = storage.getItem(storageKey);
        if (value !== null && value !== undefined) return value;
      }
    } catch (error) {
      warnPwaStorageFallback(error);
    }

    if (pwaVolatileStorage.has(storageKey)) return pwaVolatileStorage.get(storageKey);
    return fallbackValue;
  }

  function writePwaStorageItem(key, value) {
    const storageKey = String(key || '');
    if (!storageKey) return false;

    const serializedValue = String(value ?? '');
    pwaVolatileStorage.set(storageKey, serializedValue);

    try {
      const storage = getPwaLocalStorage();
      if (!storage) throw new Error('localStorage no está disponible.');
      storage.setItem(storageKey, serializedValue);
      return true;
    } catch (error) {
      warnPwaStorageFallback(error);
      return false;
    }
  }

  const APP_VERSION_URL = './app-version.json';
  const APP_VERSION_STORAGE_KEY = 'chater.pwa.publishedVersion';
  const VERSION_CHECK_INTERVAL_MS = 60 * 1000;
  const VERSION_CHECK_MIN_INTERVAL_MS = 30 * 1000;

  const state = {
    deferredInstallPrompt: null,
    registration: null,
    waitingWorker: null,
    refreshing: false,
    versionCheckInFlight: null,
    versionCheckTimer: null,
    versionWatchStarted: false,
    lastKnownVersion: readPwaStorageItem(APP_VERSION_STORAGE_KEY, ''),
    lastVersionCheckAt: 0,
    lastVersionCheckReason: '',
    pendingPublishedVersionPayload: null
  };

  const updateBanner = document.getElementById('pwaUpdateBanner');
  const updateButton = document.getElementById('pwaUpdateButton');
  const dismissButton = document.getElementById('pwaUpdateDismissButton');
  const installPrompt = document.getElementById('pwaInstallPrompt');
  const installButton = document.getElementById('pwaInstallButton');

  function showUpdateBanner(worker) {
    state.waitingWorker = worker || state.waitingWorker;
    if (!updateBanner || !state.waitingWorker) return;
    updateBanner.hidden = false;
  }

  function hideUpdateBanner() {
    if (updateBanner) updateBanner.hidden = true;
  }

  function isInstalledPwa() {
    return Boolean(
      window.matchMedia?.('(display-mode: standalone)')?.matches
      || window.matchMedia?.('(display-mode: fullscreen)')?.matches
      || navigator.standalone
    );
  }

  function showInstallPrompt() {
    if (!installPrompt || isInstalledPwa()) return false;
    installPrompt.hidden = false;
    return true;
  }

  function hideInstallPrompt() {
    if (installPrompt) installPrompt.hidden = true;
  }

  function refreshInstallPromptVisibility() {
    if (isInstalledPwa()) {
      hideInstallPrompt();
      return false;
    }
    return showInstallPrompt();
  }

  function rememberPublishedVersion(versionPayload = {}) {
    const version = getPublishedVersionFromPayload(versionPayload);
    if (!version) return false;
    state.lastKnownVersion = version;
    writePwaStorageItem(APP_VERSION_STORAGE_KEY, version);
    return true;
  }

  function queuePublishedVersionConfirmation(versionPayload = {}) {
    const version = getPublishedVersionFromPayload(versionPayload);
    if (!version) return false;
    state.pendingPublishedVersionPayload = { ...versionPayload, version };
    return true;
  }

  function confirmPendingPublishedVersion() {
    if (!state.pendingPublishedVersionPayload) return false;
    const remembered = rememberPublishedVersion(state.pendingPublishedVersionPayload);
    state.pendingPublishedVersionPayload = null;
    return remembered;
  }

  function normalizeRefreshResponse(payload = {}) {
    const result = payload.result || {};
    const failed = Number(result.failed || 0);

    if (payload.ok && failed > 0) {
      return {
        ...payload,
        ok: false,
        message: `No se pudieron refrescar ${failed} archivo(s) obligatorios del shell estático.`
      };
    }

    return payload;
  }

  function applyWaitingUpdate(versionPayload = null) {
    if (!state.waitingWorker) return false;
    if (versionPayload) queuePublishedVersionConfirmation(versionPayload);
    state.waitingWorker.postMessage({ type: 'SKIP_WAITING' });
    return true;
  }

  function requestAppShellRefresh(timeoutMs = 8000) {
    return new Promise((resolve) => {
      const worker = navigator.serviceWorker?.controller || state.registration?.active;
      if (!worker || typeof MessageChannel === 'undefined') {
        resolve({ ok: false, message: 'El service worker aún no controla esta ventana.' });
        return;
      }

      const channel = new MessageChannel();
      const timeout = window.setTimeout(() => {
        channel.port1.onmessage = null;
        resolve({ ok: false, message: 'La actualización de cache tardó demasiado.' });
      }, timeoutMs);

      channel.port1.onmessage = (event) => {
        window.clearTimeout(timeout);
        resolve(normalizeRefreshResponse(event.data || { ok: true }));
      };

      worker.postMessage({ type: 'REFRESH_APP_SHELL' }, [channel.port2]);
    });
  }

  function reloadAfterRefresh() {
    window.setTimeout(() => window.location.reload(), 650);
  }


  function getPublishedVersionFromPayload(payload = {}) {
    return String(payload.version || payload.build || payload.updatedAt || '').trim();
  }

  async function fetchPublishedVersion() {
    const response = await fetch(APP_VERSION_URL, {
      cache: 'no-store',
      headers: { Accept: 'application/json' }
    });

    if (!response.ok) {
      throw new Error(`No se pudo leer ${APP_VERSION_URL}`);
    }

    const payload = await response.json();
    const version = getPublishedVersionFromPayload(payload);
    if (!version) {
      throw new Error('El manifiesto de versión no contiene un identificador publicable.');
    }

    return { ...payload, version };
  }

  async function applyPublishedVersionChange(versionPayload) {
    await state.registration?.update?.();

    if (state.registration?.waiting) {
      state.waitingWorker = state.registration.waiting;
      if (applyWaitingUpdate(versionPayload)) {
        return { ok: true, changed: true, message: 'Actualización publicada detectada. ChatER se recargará automáticamente cuando el service worker confirme la activación.' };
      }

      return {
        ok: false,
        changed: false,
        message: 'La nueva versión fue detectada, pero todavía no se pudo activar el service worker. Se reintentará automáticamente.'
      };
    }

    const refreshed = await requestAppShellRefresh();
    if (!refreshed.ok) {
      return {
        ok: false,
        changed: false,
        version: state.lastKnownVersion,
        message: refreshed.message || 'Nueva versión detectada, pero el shell estático no se actualizó completamente. Se reintentará automáticamente.'
      };
    }

    rememberPublishedVersion(versionPayload);
    reloadAfterRefresh();
    return {
      ok: true,
      changed: true,
      message: 'Cache estática actualizada. ChatER se recargará con la versión publicada.'
    };
  }

  async function ensureFreshStaticVersion(options = {}) {
    const now = Date.now();
    const force = Boolean(options.force);
    const reason = options.reason || 'automatic';

    if (state.versionCheckInFlight) return state.versionCheckInFlight;
    if (!force && now - state.lastVersionCheckAt < VERSION_CHECK_MIN_INTERVAL_MS) {
      return { ok: true, skipped: true, message: 'Verificación reciente ya ejecutada.' };
    }

    state.lastVersionCheckAt = now;
    state.lastVersionCheckReason = reason;

    state.versionCheckInFlight = (async () => {
      try {
        const versionPayload = await fetchPublishedVersion();

        if (!state.lastKnownVersion) {
          rememberPublishedVersion(versionPayload);
          return { ok: true, changed: false, version: versionPayload.version };
        }

        if (versionPayload.version !== state.lastKnownVersion) {
          return applyPublishedVersionChange(versionPayload);
        }

        return { ok: true, changed: false, version: versionPayload.version };
      } catch (error) {
        return { ok: false, message: error?.message || 'No se pudo verificar la versión publicada.' };
      } finally {
        state.versionCheckInFlight = null;
      }
    })();

    return state.versionCheckInFlight;
  }

  function startVersionWatch(registration) {
    if (state.versionWatchStarted) return;
    state.versionWatchStarted = true;

    const checkVisibleVersion = (reason, force = false) => {
      if (document.visibilityState === 'hidden' && !force) return;
      registration.update();
      ensureFreshStaticVersion({ reason, force });
    };

    state.versionCheckTimer = window.setInterval(() => {
      checkVisibleVersion('interval');
    }, VERSION_CHECK_INTERVAL_MS);

    window.addEventListener('focus', () => checkVisibleVersion('focus', true));
    window.addEventListener('online', () => checkVisibleVersion('online', true));
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') checkVisibleVersion('visible', true);
    });

    ensureFreshStaticVersion({ reason: 'register', force: true });
  }

  async function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) {
      return { ok: false, message: 'Este navegador no permite instalación PWA con service worker.' };
    }

    try {
      const registration = await navigator.serviceWorker.register('./service-worker.js', { scope: './' });
      state.registration = registration;

      if (registration.waiting) {
        showUpdateBanner(registration.waiting);
      }

      registration.addEventListener('updatefound', () => {
        const nextWorker = registration.installing;
        if (!nextWorker) return;

        nextWorker.addEventListener('statechange', () => {
          if (nextWorker.state === 'installed' && navigator.serviceWorker.controller) {
            showUpdateBanner(nextWorker);
          }
        });
      });

      startVersionWatch(registration);
      return { ok: true, message: 'Modo instalable activo y vigilando actualizaciones publicadas.' };
    } catch (error) {
      return { ok: false, message: 'No se pudo registrar el modo instalable.' };
    }
  }

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    state.deferredInstallPrompt = event;
    showInstallPrompt();
  });

  window.addEventListener('appinstalled', () => {
    state.deferredInstallPrompt = null;
    hideInstallPrompt();
    hideUpdateBanner();
  });

  window.addEventListener('focus', refreshInstallPromptVisibility);
  document.addEventListener('visibilitychange', refreshInstallPromptVisibility);

  navigator.serviceWorker?.addEventListener('controllerchange', () => {
    if (state.refreshing) return;
    confirmPendingPublishedVersion();
    state.refreshing = true;
    window.location.reload();
  });

  updateButton?.addEventListener('click', async () => {
    if (state.waitingWorker) {
      try {
        queuePublishedVersionConfirmation(await fetchPublishedVersion());
      } catch (error) {
        // Si no se puede leer app-version.json, no se marca versión aplicada; el siguiente arranque reintentará.
      }

      if (applyWaitingUpdate()) {
        hideUpdateBanner();
        return;
      }
    }

    const refreshed = await requestAppShellRefresh();
    hideUpdateBanner();
    if (refreshed.ok) reloadAfterRefresh();
  });

  dismissButton?.addEventListener('click', hideUpdateBanner);

  async function installCurrentApp() {
    if (isInstalledPwa()) {
      hideInstallPrompt();
      return { ok: true, message: 'ChatER ya está instalado en este dispositivo.' };
    }

    if (!state.deferredInstallPrompt) {
      await state.registration?.update?.();
      showInstallPrompt();
      return { ok: false, message: 'La ventana de instalación seguirá visible y el navegador mostrará la instalación cuando cumpla sus condiciones.' };
    }

    state.deferredInstallPrompt.prompt();
    const choice = await state.deferredInstallPrompt.userChoice;
    state.deferredInstallPrompt = null;

    if (choice.outcome === 'accepted') hideInstallPrompt();
    else showInstallPrompt();

    return {
      ok: choice.outcome === 'accepted',
      message: choice.outcome === 'accepted' ? 'ChatER quedó listo para instalarse.' : 'La instalación fue cancelada.'
    };
  }

  installButton?.addEventListener('click', async () => {
    const result = await installCurrentApp();
    if (!result.ok) refreshInstallPromptVisibility();
  });

  refreshInstallPromptVisibility();

  window.ChatERPWA = {
    install: installCurrentApp,
    async checkForUpdates() {
      if (!state.registration) {
        const result = await registerServiceWorker();
        if (!result.ok) return result;
      }

      const versionResult = await ensureFreshStaticVersion({ force: true, reason: 'manual' });
      if (versionResult?.changed) return versionResult;

      await state.registration.update();
      if (state.registration.waiting) {
        showUpdateBanner(state.registration.waiting);
        return { ok: true, message: 'Hay una actualización lista para aplicar.' };
      }

      const refreshed = await requestAppShellRefresh();
      if (refreshed.ok) {
        reloadAfterRefresh();
        return { ok: true, message: 'Cache estática actualizada. ChatER se recargará con la versión más reciente.' };
      }

      return { ok: false, message: refreshed.message || 'No se pudo refrescar la cache estática todavía.' };
    },
    refreshNow() {
      if (applyWaitingUpdate()) return true;
      requestAppShellRefresh().then((result) => {
        if (result.ok) reloadAfterRefresh();
      });
      return true;
    },
    getStatus() {
      return {
        serviceWorker: Boolean(state.registration),
        installPromptAvailable: Boolean(state.deferredInstallPrompt),
        updateWaiting: Boolean(state.waitingWorker),
        lastKnownVersion: state.lastKnownVersion,
        lastVersionCheckAt: state.lastVersionCheckAt,
        lastVersionCheckReason: state.lastVersionCheckReason,
        versionCheckInFlight: Boolean(state.versionCheckInFlight)
      };
    }
  };

  registerServiceWorker();
}());
