(function createPWAUpdateManager() {
  'use strict';

  var metadata = window.APP_SEED_METADATA || {};
  var userConfig = window.APP_SEED_CONFIG || {};
  var tabId = createTabId();
  var config = Object.freeze(Object.assign({
    appName: metadata.appName || 'App Web',
    versionEndpoint: './version.json',
    serviceWorkerPath: './sw.js',
    periodicUpdateChecksEnabled: false,
    updateCheckIntervalMs: 0,
    updateCheckOnFocus: true,
    updateCheckOnOnline: true,
    updateCheckOnPageShow: true,
    autoReloadWhenVersionChanges: true,
    autoReloadDelayMs: 700,
    minimumSecondsBetweenAutoReloads: 10,
    showUpdateStatus: true,
    multiTabCoordinationEnabled: true,
    leaderLockTtlMs: 45000,
    broadcastChannelName: 'semilla-appweb-pwa-updates',
    releaseManifestAssetsEnabled: true,
    prefetchReleaseAssetsOnCheck: true,
    prefetchReleaseAssetsMax: 120,
    directFingerprintFallbackEnabled: true,
    directFingerprintFallbackIntervalMs: 300000,
    directFingerprintCheckFiles: [],
    fingerprintCheckEnabled: true,
    fingerprintCheckFiles: []
  }, userConfig));

  var statusNode = document.getElementById('update-status');
  var storagePrefix = String(metadata.cacheNamespace || 'semilla-appweb-pwa');
  var storageKeys = {
    version: storagePrefix + ':last-version-key',
    releaseAssets: storagePrefix + ':last-release-assets-key',
    directFingerprints: storagePrefix + ':direct-asset-fingerprints',
    lastDirectFingerprintAt: storagePrefix + ':last-direct-fingerprint-at',
    lastPrefetchedReleaseAssets: storagePrefix + ':last-prefetched-release-assets-key',
    lastReloadAt: storagePrefix + ':last-reload-at',
    lastReloadKey: storagePrefix + ':last-reload-key',
    leaderLock: storagePrefix + ':update-leader-lock',
    installDismissed: storagePrefix + ':install-dismissed'
  };

  var channel = createBroadcastChannel();
  var state = {
    registration: null,
    currentVersionKey: normalizeVersion(metadata),
    checking: false,
    reloadArmed: false,
    started: false,
    lastServerPayload: null,
    ownsLeaderLock: false,
    installPrompt: null,
    installExperienceBound: false
  };

  function translate(key, fallback) {
    if (window.AppI18n && typeof window.AppI18n.t === 'function') {
      return window.AppI18n.t(key, fallback);
    }
    return fallback;
  }

  function showStatus(message, type) {
    if (!config.showUpdateStatus || !statusNode || !message) return;

    statusNode.textContent = message;
    statusNode.dataset.state = type || 'ok';
    statusNode.hidden = false;

    clearTimeout(showStatus.hideTimer);
    showStatus.hideTimer = setTimeout(function hideStatus() {
      statusNode.hidden = true;
    }, 4600);
  }

  function normalizeVersion(payload) {
    if (!payload || typeof payload !== 'object') return '';
    return [
      payload.version,
      payload.build,
      payload.releasedAt || payload.updatedAt,
      payload.channel || payload.updateChannel,
      payload.releaseId
    ].filter(Boolean).join('|');
  }

  function normalizeReleaseAssets(payload) {
    if (!payload || typeof payload !== 'object') return '';

    var assets = Array.isArray(payload.criticalAssets)
      ? payload.criticalAssets
      : Array.isArray(payload.assets)
        ? payload.assets
        : [];

    if (!assets.length) return '';

    return assets.map(function toAssetKey(asset) {
      if (!asset || typeof asset !== 'object') return '';
      return [asset.url || asset.path, asset.sha256 || asset.hash, asset.bytes || asset.size].filter(Boolean).join(':');
    }).filter(Boolean).sort().join('|');
  }

  function buildNoStoreUrl(path) {
    var url = new URL(path, window.location.href);
    url.searchParams.set('__pwa_update_check', Date.now().toString());
    url.searchParams.set('__tab', tabId);
    return url.toString();
  }

  async function fetchJsonNoStore(path) {
    var response = await fetch(buildNoStoreUrl(path), {
      cache: 'no-store',
      credentials: 'same-origin',
      headers: {
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
        'Accept': 'application/json,text/plain,*/*'
      }
    });

    if (!response.ok) {
      throw new Error('No se pudo leer ' + path);
    }

    return response.json();
  }

  async function fetchBytesNoStore(path) {
    var response = await fetch(buildNoStoreUrl(path), {
      cache: 'no-store',
      credentials: 'same-origin',
      headers: {
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
        'Accept': 'text/html,text/css,application/javascript,application/json,text/plain,image/*,*/*'
      }
    });

    if (response.status === 404 || response.status === 410) {
      return { missing: true, bytes: 0, buffer: null };
    }

    if (!response.ok) {
      throw new Error('No se pudo leer ' + path);
    }

    var buffer = await response.arrayBuffer();
    return { missing: false, bytes: buffer.byteLength, buffer: buffer };
  }

  async function hashBuffer(buffer) {
    var bytes = new Uint8Array(buffer || new ArrayBuffer(0));

    if (window.crypto && window.crypto.subtle) {
      var digest = await window.crypto.subtle.digest('SHA-256', bytes);
      return Array.prototype.map.call(new Uint8Array(digest), function toHex(byte) {
        return byte.toString(16).padStart(2, '0');
      }).join('');
    }

    var hash = 0;
    for (var index = 0; index < bytes.length; index += 1) {
      hash = ((hash << 5) - hash) + bytes[index];
      hash |= 0;
    }
    return String(bytes.length) + ':' + String(hash);
  }

  async function createDirectFingerprint(path) {
    var asset = await fetchBytesNoStore(path);
    var publicPath = new URL(path, window.location.href).pathname;

    if (asset.missing) {
      return {
        path: publicPath,
        hash: 'missing:0',
        missing: true,
        bytes: 0
      };
    }

    return {
      path: publicPath,
      hash: await hashBuffer(asset.buffer),
      missing: false,
      bytes: asset.bytes
    };
  }

  function readJsonStorage(key, fallback) {
    try {
      return JSON.parse(localStorage.getItem(key) || '');
    } catch (error) {
      return fallback;
    }
  }

  function writeJsonStorage(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  function shouldRunDirectFingerprintFallback() {
    if (!config.directFingerprintFallbackEnabled && !config.fingerprintCheckEnabled) return false;

    var files = getDirectFingerprintFiles();
    if (!files.length) return false;

    var lastRunAt = Number(localStorage.getItem(storageKeys.lastDirectFingerprintAt) || 0);
    var minMs = Number(config.directFingerprintFallbackIntervalMs || 300000);
    var now = Date.now();

    return now - lastRunAt >= minMs;
  }

  function getDirectFingerprintFiles() {
    if (Array.isArray(config.directFingerprintCheckFiles) && config.directFingerprintCheckFiles.length) {
      return config.directFingerprintCheckFiles;
    }
    if (Array.isArray(config.fingerprintCheckFiles) && config.fingerprintCheckFiles.length) {
      return config.fingerprintCheckFiles;
    }
    return [];
  }

  async function checkDirectFingerprints() {
    if (!shouldRunDirectFingerprintFallback()) return false;

    var stored = readJsonStorage(storageKeys.directFingerprints, {}) || {};
    var next = Object.assign({}, stored);
    var changed = false;
    var files = getDirectFingerprintFiles();

    for (var index = 0; index < files.length; index += 1) {
      var fingerprint = await createDirectFingerprint(files[index]);
      var previousHash = stored[fingerprint.path];

      next[fingerprint.path] = fingerprint.hash;

      if (previousHash && previousHash !== fingerprint.hash) {
        changed = true;
      }
    }

    writeJsonStorage(storageKeys.directFingerprints, next);
    localStorage.setItem(storageKeys.lastDirectFingerprintAt, Date.now().toString());
    return changed;
  }

  function normalizeReleaseAssetUrl(value) {
    if (!value) return '';

    try {
      var url = new URL(String(value), window.location.href);
      if (url.origin !== window.location.origin) return '';
      return url.pathname + url.search;
    } catch (error) {
      return '';
    }
  }

  function getReleaseAssetUrls(payload) {
    var assets = Array.isArray(payload && payload.criticalAssets)
      ? payload.criticalAssets
      : Array.isArray(payload && payload.assets)
        ? payload.assets
        : [];
    var seen = Object.create(null);
    var output = [];
    var max = Number(config.prefetchReleaseAssetsMax || 120);

    assets.forEach(function collectAsset(asset) {
      var raw = typeof asset === 'string' ? asset : asset && (asset.url || asset.path);
      var path = normalizeReleaseAssetUrl(raw);
      if (!path || seen[path]) return;
      seen[path] = true;
      output.push(path);
    });

    return output.slice(0, max);
  }

  async function prefetchReleaseAssets(payload, releaseAssetsKey) {
    if (!config.prefetchReleaseAssetsOnCheck) return false;
    if (!releaseAssetsKey) return false;
    if (localStorage.getItem(storageKeys.lastPrefetchedReleaseAssets) === releaseAssetsKey) return false;

    var urls = getReleaseAssetUrls(payload);
    if (!urls.length) return false;

    if (state.registration && state.registration.active) {
      state.registration.active.postMessage({
        type: 'PREFETCH_URLS',
        urls: urls
      });
      localStorage.setItem(storageKeys.lastPrefetchedReleaseAssets, releaseAssetsKey);
      broadcastUpdate({ type: 'RELEASE_ASSETS_PREFETCH_REQUESTED', count: urls.length });
      return true;
    }

    return false;
  }

  async function checkVersionEndpoint() {
    var payload = await fetchJsonNoStore(config.versionEndpoint || './version.json');
    state.lastServerPayload = payload;

    var serverVersionKey = normalizeVersion(payload);
    var storedVersionKey = localStorage.getItem(storageKeys.version) || '';
    var versionChanged = false;

    if (!storedVersionKey) {
      localStorage.setItem(storageKeys.version, serverVersionKey || state.currentVersionKey);
    } else if (serverVersionKey && serverVersionKey !== storedVersionKey) {
      localStorage.setItem(storageKeys.version, serverVersionKey);
      versionChanged = true;
    }

    var serverAssetsKey = config.releaseManifestAssetsEnabled ? normalizeReleaseAssets(payload) : '';
    var storedAssetsKey = localStorage.getItem(storageKeys.releaseAssets) || '';
    var firstAssetSnapshot = Boolean(serverAssetsKey && !storedAssetsKey);
    var releasePrefetchPending = Boolean(
      serverAssetsKey && localStorage.getItem(storageKeys.lastPrefetchedReleaseAssets) !== serverAssetsKey
    );
    var assetsChanged = false;

    if (serverAssetsKey) {
      if (!storedAssetsKey) {
        localStorage.setItem(storageKeys.releaseAssets, serverAssetsKey);
      } else if (serverAssetsKey !== storedAssetsKey) {
        localStorage.setItem(storageKeys.releaseAssets, serverAssetsKey);
        assetsChanged = true;
      }
    }

    if (serverAssetsKey && (firstAssetSnapshot || versionChanged || assetsChanged || releasePrefetchPending)) {
      prefetchReleaseAssets(payload, serverAssetsKey).catch(function prefetchFailed(error) {
        if (navigator.onLine) {
          console.warn('[PWAUpdateManager] No se pudieron precargar assets del release:', error);
        }
      });
    }

    return versionChanged || assetsChanged || Boolean(payload && payload.forceReload && versionChanged);
  }

  function canReloadNow(reasonKey) {
    var now = Date.now();
    var minMs = Number(config.minimumSecondsBetweenAutoReloads || 10) * 1000;
    var lastReloadAt = Number(sessionStorage.getItem(storageKeys.lastReloadAt) || 0);
    var lastReloadKey = sessionStorage.getItem(storageKeys.lastReloadKey) || '';

    if (lastReloadKey === reasonKey && now - lastReloadAt < minMs) {
      return false;
    }

    return true;
  }

  function scheduleReload(reason) {
    var reasonKey = reason || 'update';

    if (!config.autoReloadWhenVersionChanges || state.reloadArmed) return;
    if (!canReloadNow(reasonKey)) return;

    state.reloadArmed = true;
    showStatus(translate('pwa.updateFound', 'Actualización encontrada. La app se recargará para aplicar los cambios.'), 'ok');
    broadcastUpdate({ type: 'UPDATE_FOUND', reason: reasonKey });

    if (state.registration && state.registration.waiting) {
      state.registration.waiting.postMessage({ type: 'SKIP_WAITING' });
    }

    setTimeout(function reloadApp() {
      sessionStorage.setItem(storageKeys.lastReloadAt, Date.now().toString());
      sessionStorage.setItem(storageKeys.lastReloadKey, reasonKey);

      var url = new URL(window.location.href);
      url.searchParams.set('app_updated', Date.now().toString());
      window.location.replace(url.toString());
    }, Number(config.autoReloadDelayMs || 700));
  }

  async function askWaitingWorkerToActivate(registration) {
    if (!registration || !registration.waiting) return;
    registration.waiting.postMessage({ type: 'SKIP_WAITING' });
  }

  function watchRegistration(registration) {
    state.registration = registration;

    askWaitingWorkerToActivate(registration);

    registration.addEventListener('updatefound', function handleUpdateFound() {
      var installingWorker = registration.installing;
      if (!installingWorker) return;

      installingWorker.addEventListener('statechange', function handleStateChange() {
        if (installingWorker.state === 'installed' && navigator.serviceWorker.controller) {
          askWaitingWorkerToActivate(registration);
          scheduleReload('service-worker-installed');
        }
      });
    });
  }

  async function checkNow(reason, options) {
    var settings = options || {};

    if (state.checking) return false;
    if (!settings.force && !canThisTabCheck()) return false;

    state.checking = true;

    try {
      if (state.registration) {
        await state.registration.update();
      }

      var versionChanged = await checkVersionEndpoint().catch(function versionCheckFailed(error) {
        if (navigator.onLine) {
          console.warn('[PWAUpdateManager] No se pudo verificar version.json:', error);
        }
        return false;
      });

      var directFingerprintChanged = false;
      if (!versionChanged) {
        directFingerprintChanged = await checkDirectFingerprints().catch(function directFingerprintFailed(error) {
          if (navigator.onLine) {
            console.warn('[PWAUpdateManager] No se pudo verificar huellas directas:', error);
          }
          return false;
        });
      }

      if (versionChanged || directFingerprintChanged) {
        scheduleReload(versionChanged ? 'version-or-release-manifest-changed' : 'direct-fingerprint-changed');
        return true;
      }

      if (reason === 'manual') {
        showStatus(translate('pwa.alreadyUpdated', 'La app ya está actualizada.'), 'ok');
      }

      broadcastUpdate({ type: 'UPDATE_CHECK_OK', reason: reason || 'lifecycle' });
      return false;
    } finally {
      state.checking = false;
      if (state.ownsLeaderLock) {
        releaseLeaderLock();
      }
    }
  }

  function canThisTabCheck() {
    if (!config.multiTabCoordinationEnabled) return true;
    if (document.visibilityState === 'hidden') return false;
    return acquireLeaderLock();
  }

  function createTabId() {
    return String(Date.now()) + '-' + Math.random().toString(16).slice(2);
  }

  function readLeaderLock() {
    return readJsonStorage(storageKeys.leaderLock, null);
  }

  function writeLeaderLock() {
    var payload = {
      tabId: tabId,
      expiresAt: Date.now() + Number(config.leaderLockTtlMs || 45000),
      href: window.location.href
    };
    writeJsonStorage(storageKeys.leaderLock, payload);
    state.ownsLeaderLock = true;
    return payload;
  }

  function acquireLeaderLock() {
    var now = Date.now();
    var current = readLeaderLock();

    if (!current || !current.expiresAt || current.expiresAt < now || current.tabId === tabId) {
      writeLeaderLock();
      return true;
    }

    state.ownsLeaderLock = false;
    return false;
  }

  function releaseLeaderLock() {
    var current = readLeaderLock();
    if (current && current.tabId === tabId) {
      localStorage.removeItem(storageKeys.leaderLock);
    }
    state.ownsLeaderLock = false;
  }

  function createBroadcastChannel() {
    if (!('BroadcastChannel' in window)) return null;

    try {
      return new BroadcastChannel(config.broadcastChannelName || 'semilla-appweb-pwa-updates');
    } catch (error) {
      return null;
    }
  }

  function broadcastUpdate(payload) {
    if (!channel || !payload) return;
    channel.postMessage(Object.assign({ fromTabId: tabId, at: Date.now() }, payload));
  }

  function handleBroadcastMessage(event) {
    var message = event.data || {};
    if (message.fromTabId === tabId) return;

    if (message.type === 'UPDATE_FOUND') {
      scheduleReload(message.reason || 'broadcast-update-found');
    }
  }

  function bindLifecycleChecks() {
    if (config.updateCheckOnFocus) {
      window.addEventListener('focus', function checkOnFocus() {
        checkNow('focus');
      });
      document.addEventListener('visibilitychange', function checkOnVisibility() {
        if (document.visibilityState === 'visible') {
          checkNow('visible');
        } else {
          releaseLeaderLock();
        }
      });
    }

    if (config.updateCheckOnOnline) {
      window.addEventListener('online', function checkOnOnline() {
        checkNow('online', { force: true });
      });
    }

    if (config.updateCheckOnPageShow) {
      window.addEventListener('pageshow', function checkOnPageShow(event) {
        checkNow(event.persisted ? 'pageshow-bfcache' : 'pageshow', { force: true });
      });
    }

    window.addEventListener('beforeunload', function releaseLockBeforeUnload() {
      releaseLeaderLock();
    });

    if (channel) {
      channel.addEventListener('message', handleBroadcastMessage);
    }
  }

  async function clearCaches() {
    if (!navigator.serviceWorker || !state.registration || !state.registration.active) return;
    state.registration.active.postMessage({ type: 'CLEAR_APP_CACHES' });
    showStatus(translate('pwa.cacheCleared', 'Caché local limpiada. Se aplicará la próxima carga limpia.'), 'ok');
  }

  function isInstalledDisplayMode() {
    var standalone = false;
    try {
      standalone = Boolean(window.matchMedia && window.matchMedia('(display-mode: standalone)').matches);
    } catch (error) {}
    return standalone || Boolean(window.navigator && window.navigator.standalone === true);
  }

  function installWasDismissed() {
    try {
      return localStorage.getItem(storageKeys.installDismissed) === '1';
    } catch (error) {
      return false;
    }
  }

  function dismissInstallExperience() {
    try {
      localStorage.setItem(storageKeys.installDismissed, '1');
    } catch (error) {}
    refreshInstallExperience();
  }

  function refreshInstallExperience() {
    var banner = document.getElementById('pwa-install-banner');
    if (!banner) return;
    var shouldShow = Boolean(state.installPrompt) && !isInstalledDisplayMode() && !installWasDismissed();
    banner.classList.toggle('hidden', !shouldShow);
  }

  async function requestInstall() {
    var promptEvent = state.installPrompt;
    if (!promptEvent || typeof promptEvent.prompt !== 'function') {
      showStatus(translate('pwa.installFallback', 'La instalación como app independiente aún no está disponible en este navegador o dispositivo. No crees un acceso directo: inténtalo de nuevo cuando aparezca la instalación PWA.'), 'error');
      refreshInstallExperience();
      return false;
    }

    state.installPrompt = null;
    refreshInstallExperience();

    try {
      await promptEvent.prompt();
      var choice = promptEvent.userChoice ? await promptEvent.userChoice.catch(function ignoreInstallChoiceError() { return null; }) : null;
      if (choice && choice.outcome === 'accepted') {
        showStatus(translate('pwa.installAccepted', 'Instalación iniciada.'), 'ok');
        return true;
      }
      return false;
    } catch (error) {
      showStatus(translate('pwa.installFallback', 'La instalación como app independiente aún no está disponible en este navegador o dispositivo. No crees un acceso directo: inténtalo de nuevo cuando aparezca la instalación PWA.'), 'error');
      return false;
    }
  }

  function bindInstallExperience() {
    if (state.installExperienceBound) return;
    state.installExperienceBound = true;

    var installButton = document.getElementById('pwa-install-button');
    var laterButton = document.getElementById('pwa-install-later-button');

    if (installButton) {
      installButton.addEventListener('click', function installFromBanner() {
        requestInstall();
      });
    }
    if (laterButton) laterButton.addEventListener('click', dismissInstallExperience);

    window.addEventListener('beforeinstallprompt', function captureInstallPrompt(event) {
      if (isInstalledDisplayMode()) return;
      event.preventDefault();
      state.installPrompt = event;
      refreshInstallExperience();
    });

    window.addEventListener('appinstalled', function confirmInstalledApp() {
      state.installPrompt = null;
      try { localStorage.removeItem(storageKeys.installDismissed); } catch (error) {}
      refreshInstallExperience();
    });

    try {
      var displayModeQuery = window.matchMedia && window.matchMedia('(display-mode: standalone)');
      if (displayModeQuery && typeof displayModeQuery.addEventListener === 'function') {
        displayModeQuery.addEventListener('change', refreshInstallExperience);
      } else if (displayModeQuery && typeof displayModeQuery.addListener === 'function') {
        displayModeQuery.addListener(refreshInstallExperience);
      }
    } catch (error) {}

    refreshInstallExperience();
  }

  async function start() {
    if (state.started) return;
    state.started = true;

    bindLifecycleChecks();
    bindInstallExperience();

    if (!('serviceWorker' in navigator)) {
      showStatus(translate('pwa.unsupported', 'Este navegador no soporta instalación PWA completa.'), 'error');
      return;
    }

    try {
      var registration = await navigator.serviceWorker.register(config.serviceWorkerPath || './sw.js', {
        scope: './',
        updateViaCache: 'none'
      });
      watchRegistration(registration);

      navigator.serviceWorker.addEventListener('controllerchange', function handleControllerChange() {
        if (!state.reloadArmed) {
          scheduleReload('controllerchange');
        }
      });

      navigator.serviceWorker.addEventListener('message', function handleServiceWorkerMessage(event) {
        var message = event.data || {};
        if (message.type === 'APP_SW_ACTIVATED') {
          broadcastUpdate({ type: 'SW_ACTIVATED', version: message.version, build: message.build });
        }
      });

      await checkNow('startup', { force: true });
    } catch (error) {
      console.error('[PWAUpdateManager] Error registrando Service Worker:', error);
      showStatus(translate('pwa.swRegisterError', 'No se pudo activar instalación/offline.'), 'error');
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }

  window.PWAUpdateManager = Object.freeze({
    checkNow: function manualCheck() {
      return checkNow('manual', { force: true });
    },
    clearCaches: clearCaches,
    requestInstall: requestInstall,
    releaseLeaderLock: releaseLeaderLock,
    get registration() {
      return state.registration;
    },
    get currentVersion() {
      return metadata;
    },
    get lastServerPayload() {
      return state.lastServerPayload;
    }
  });
})();
