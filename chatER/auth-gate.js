// Puerta de autenticación Google/Gmail manejada por memoriaBACKEND.
// Adaptado del proyecto de referencia que autentica correctamente con login.js.
(() => {
  'use strict';

  const CONFIG = Object.assign({
    brandName: 'ChatER',
    backendName: 'memoriaBACKEND',
    backendBaseUrl: '',
    siteId: '',
    loginScriptUrl: '',
    forceGoogleLogin: true,
    accentColor: '#25d366',
    fallbackDelayMs: 7000,
    rememberSession: true,
    browserSessionTtlMs: 24 * 60 * 60 * 1000,
    appSessionTtlMs: 0,
    sessionCheckTimeoutMs: 4500,
    redirectLoginTrustWindowMs: 15 * 60 * 1000,
    loginInteractionTrustWindowMs: 10 * 60 * 1000
  }, window.PLATFORM_AUTH_CONFIG || {});

  const STATE = {
    ready: false,
    resolved: false,
    backendScriptLoaded: false,
    backendScriptRequested: false,
    backendBootPromise: null,
    fallbackTimer: 0,
    observer: null,
    resolveReady: null,
    forcedFetchGuardInstalled: false,
    forcedFetchGuardReleased: false,
    forcedAuthCheckBlocked: false,
    sessionAuthCheckBlocked: false,
    backendLoginWindowSeen: false,
    originalFetch: null,
    backendApiGateInstalled: false,
    backendApiValue: undefined,
    blockedImplicitBackendApi: undefined,
    backendLoginUiShown: false,
    redirectReturnPending: false,
    sessionRestoreAllowed: false,
    sessionRestoredFromStorage: false,
    allowBackendScriptSessionRestore: false,
    storedSessionExpired: false,
    loginInteractionObserved: false,
    loginInteractionStartedAt: 0,
    implicitUnlockRestarts: 0,
    implicitUnlockTimer: 0,
    loginScriptUrlCandidates: [],
    loginScriptCandidateIndex: 0,
    loginScriptAttemptedUrls: []
  };

  const readyPromise = new Promise((resolve) => {
    STATE.resolveReady = resolve;
  });

  function cleanText(value, fallback = '') {
    return String(value || fallback).replace(/[<>&]/g, '').slice(0, 120);
  }

  function normalizeBaseUrl(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    try {
      const url = new URL(raw, window.location.href);
      return url.origin;
    } catch (_) {
      return '';
    }
  }

  function uniqueUrls(urls = []) {
    const seen = new Set();
    return urls.map((url) => String(url || '').trim()).filter((url) => {
      if (!url || seen.has(url)) return false;
      seen.add(url);
      return true;
    });
  }

  function decorateLoginScriptUrl(rawUrl) {
    const url = new URL(rawUrl, window.location.href);
    const siteId = getSiteId();
    if (siteId && !url.searchParams.has('s')) url.searchParams.set('s', siteId);
    if (!url.searchParams.has('n')) url.searchParams.set('n', CONFIG.brandName || 'ChatER');
    if (!url.searchParams.has('c')) url.searchParams.set('c', CONFIG.accentColor || '#25d366');
    return url.toString();
  }

  function getLoginScriptUrlCandidates() {
    if (STATE.loginScriptUrlCandidates.length) return STATE.loginScriptUrlCandidates;

    const candidates = [];
    if (Array.isArray(CONFIG.loginScriptUrlCandidates)) candidates.push(...CONFIG.loginScriptUrlCandidates);
    if (CONFIG.loginScriptUrl) candidates.push(CONFIG.loginScriptUrl);

    const backendBaseUrl = getBackendBaseUrl();
    const siteId = getSiteId();
    if (backendBaseUrl && siteId) {
      try {
        const url = new URL('/login.js', backendBaseUrl);
        url.searchParams.set('s', siteId);
        url.searchParams.set('n', CONFIG.brandName || 'ChatER');
        url.searchParams.set('c', CONFIG.accentColor || '#25d366');
        candidates.push(url.toString());
      } catch (_) {}
    }

    STATE.loginScriptUrlCandidates = uniqueUrls(candidates.map((url) => {
      try { return decorateLoginScriptUrl(url); } catch (_) { return ''; }
    }));
    return STATE.loginScriptUrlCandidates;
  }

  function getLoginScriptUrl() {
    return getLoginScriptUrlCandidates()[STATE.loginScriptCandidateIndex] || '';
  }

  function getRuntimeLoginScriptUrl(loginScriptUrl = getLoginScriptUrl()) {
    if (!loginScriptUrl) return '';

    try {
      const url = new URL(loginScriptUrl, window.location.href);
      url.searchParams.set('_platformAuthGate', String(Date.now()));
      return url.toString();
    } catch (_) {
      const separator = loginScriptUrl.includes('?') ? '&' : '?';
      return `${loginScriptUrl}${separator}_platformAuthGate=${Date.now()}`;
    }
  }

  function getBackendBaseUrl() {
    const configured = normalizeBaseUrl(CONFIG.backendBaseUrl);
    if (configured) return configured;

    try {
      const loginUrl = new URL(String(CONFIG.loginScriptUrl || ''), window.location.href);
      return loginUrl.origin;
    } catch (_) {
      return '';
    }
  }

  function getSiteId() {
    const configured = String(CONFIG.siteId || '').trim();
    if (configured) return configured;

    try {
      const loginUrl = new URL(String(CONFIG.loginScriptUrl || ''), window.location.href);
      return String(loginUrl.searchParams.get('s') || '').trim();
    } catch (_) {
      return '';
    }
  }

  function getSessionStorageKey(suffix) {
    const siteId = getSiteId();
    return siteId ? `${CONFIG.backendName}:${siteId}:${suffix}` : '';
  }

  function getLocalStorageKey(suffix) {
    const siteId = getSiteId();
    return siteId ? `${CONFIG.backendName}:${siteId}:${suffix}` : '';
  }

  function hasInstalledAppUrlHint() {
    try {
      const params = new URLSearchParams(window.location.search || '');
      const source = String(params.get('source') || params.get('utm_source') || '').toLowerCase();
      return source === 'pwa' || source === 'app' || source === 'installed';
    } catch (_) {
      return false;
    }
  }

  function isInstalledAppRuntime() {
    return !!(
      window.navigator?.standalone === true
      || window.matchMedia?.('(display-mode: standalone)').matches
      || window.matchMedia?.('(display-mode: fullscreen)').matches
      || window.matchMedia?.('(display-mode: minimal-ui)').matches
      || hasInstalledAppUrlHint()
    );
  }

  function getBrowserSessionTtlMs() {
    const configured = Number(CONFIG.browserSessionTtlMs);
    return Number.isFinite(configured) && configured > 0 ? configured : 24 * 60 * 60 * 1000;
  }

  function getAppSessionTtlMs() {
    const configured = Number(CONFIG.appSessionTtlMs);
    return Number.isFinite(configured) && configured > 0 ? configured : 0;
  }

  function getSessionMaxAgeMsForCurrentRuntime() {
    return isInstalledAppRuntime() ? getAppSessionTtlMs() : getBrowserSessionTtlMs();
  }

  function getSessionMaxAgeMsForStoredRecord(record) {
    // La sesión sin expiración solo aplica cuando fue creada desde la app instalada
    // y se está abriendo nuevamente desde la app. En navegador siempre se respeta
    // el límite de 24 horas configurado para evitar sesiones web indefinidas.
    if (isInstalledAppRuntime() && record?.app === true) return getAppSessionTtlMs();
    return getBrowserSessionTtlMs();
  }

  function getLegacyLocalTokenFirstSeenKey() {
    return getLocalStorageKey('legacy-token-first-seen');
  }

  function readOrCreateLegacyLocalTokenFirstSeenAt() {
    const key = getLegacyLocalTokenFirstSeenKey();
    if (!key) return Date.now();

    try {
      const saved = Number(window.localStorage?.getItem(key) || 0);
      if (Number.isFinite(saved) && saved > 0) return saved;

      const now = Date.now();
      window.localStorage?.setItem(key, String(now));
      return now;
    } catch (_) {
      return Date.now();
    }
  }

  function readSessionStorageTokenOnly() {
    const tokenKey = getSessionStorageKey('tk');
    if (!tokenKey) return '';
    try {
      return String(window.sessionStorage?.getItem(tokenKey) || '').trim();
    } catch (_) {
      return '';
    }
  }

  function getPersistentAuthRecordKey() {
    return getLocalStorageKey('auth');
  }

  function clearPersistentAuthRecord() {
    const recordKey = getPersistentAuthRecordKey();
    const tokenKey = getLocalStorageKey('tk');
    const legacyFirstSeenKey = getLegacyLocalTokenFirstSeenKey();
    try {
      if (recordKey) window.localStorage?.removeItem(recordKey);
      if (tokenKey) window.localStorage?.removeItem(tokenKey);
      if (legacyFirstSeenKey) window.localStorage?.removeItem(legacyFirstSeenKey);
    } catch (_) {}
  }

  function normalizeStoredAuthRecord(value) {
    if (!value || typeof value !== 'object') return null;
    const savedAt = Number(value.at || value.savedAt || 0);
    if (!Number.isFinite(savedAt) || savedAt <= 0) return null;
    return {
      tk: String(value.tk || '').trim(),
      u: value.u && typeof value.u === 'object' ? value.u : null,
      at: savedAt,
      app: value.app === true
    };
  }

  function isStoredAuthRecordFresh(record) {
    if (!record) return false;
    const maxAge = getSessionMaxAgeMsForStoredRecord(record);
    if (!maxAge) return true;
    const age = Date.now() - Number(record.at || 0);
    return age >= 0 && age <= maxAge;
  }

  function readPersistentAuthRecord() {
    if (CONFIG.rememberSession === false) return null;
    const recordKey = getPersistentAuthRecordKey();
    if (!recordKey) return null;

    try {
      const raw = window.localStorage?.getItem(recordKey) || '';
      const fallbackToken = String(window.localStorage?.getItem(getLocalStorageKey('tk')) || '').trim();
      const record = raw
        ? normalizeStoredAuthRecord(JSON.parse(raw))
        : (fallbackToken
          ? { tk: fallbackToken, u: null, at: readOrCreateLegacyLocalTokenFirstSeenAt(), app: isInstalledAppRuntime() }
          : null);
      if (!record) return null;
      if (!isStoredAuthRecordFresh(record)) {
        STATE.storedSessionExpired = true;
        clearPersistentAuthRecord();
        return null;
      }
      return record;
    } catch (_) {
      return null;
    }
  }

  function writeStoredSessionToken(token, user = null) {
    const normalizedToken = String(token || '').trim();
    const sessionTokenKey = getSessionStorageKey('tk');
    const localTokenKey = getLocalStorageKey('tk');
    const recordKey = getPersistentAuthRecordKey();
    const installedAppRuntime = isInstalledAppRuntime();
    const record = {
      tk: normalizedToken,
      u: user && typeof user === 'object' ? user : null,
      at: Date.now(),
      app: installedAppRuntime,
      rt: installedAppRuntime ? 'app' : 'browser'
    };

    try {
      if (sessionTokenKey) {
        if (normalizedToken) window.sessionStorage?.setItem(sessionTokenKey, normalizedToken);
        else window.sessionStorage?.removeItem(sessionTokenKey);
      }
    } catch (_) {}

    if (CONFIG.rememberSession === false) return;

    try {
      if (localTokenKey) {
        if (normalizedToken) window.localStorage?.setItem(localTokenKey, normalizedToken);
        else window.localStorage?.removeItem(localTokenKey);
      }
      const legacyFirstSeenKey = getLegacyLocalTokenFirstSeenKey();
      if (legacyFirstSeenKey) window.localStorage?.removeItem(legacyFirstSeenKey);
      if (recordKey) window.localStorage?.setItem(recordKey, JSON.stringify(record));
    } catch (_) {}
  }

  function readStoredSessionToken() {
    const record = readPersistentAuthRecord();
    if (record?.tk) {
      const sessionTokenKey = getSessionStorageKey('tk');
      try {
        if (sessionTokenKey) window.sessionStorage?.setItem(sessionTokenKey, record.tk);
      } catch (_) {}
      return record.tk;
    }
    return readSessionStorageTokenOnly();
  }

  function getTrustedLoginFlowKey() {
    return getSessionStorageKey('google-flow-started-at');
  }

  function readTrustedLoginFlowStartedAt() {
    const flowKey = getTrustedLoginFlowKey();
    if (!flowKey) return 0;
    try {
      const value = Number(window.sessionStorage?.getItem(flowKey) || 0);
      return Number.isFinite(value) ? value : 0;
    } catch (_) {
      return 0;
    }
  }

  function rememberTrustedLoginFlow() {
    STATE.loginInteractionObserved = true;
    STATE.loginInteractionStartedAt = Date.now();
    const flowKey = getTrustedLoginFlowKey();
    if (!flowKey) return;
    try {
      window.sessionStorage?.setItem(flowKey, String(Date.now()));
    } catch (_) {}
  }

  function clearTrustedLoginFlow() {
    const flowKey = getTrustedLoginFlowKey();
    if (!flowKey) return;
    try {
      window.sessionStorage?.removeItem(flowKey);
    } catch (_) {}
  }

  function hasFreshLoginInteraction() {
    if (!STATE.loginInteractionObserved || !STATE.loginInteractionStartedAt) return false;
    const maxAge = Math.max(30 * 1000, Number(CONFIG.loginInteractionTrustWindowMs) || 10 * 60 * 1000);
    const age = Date.now() - STATE.loginInteractionStartedAt;
    return age >= 0 && age <= maxAge;
  }

  function hasTrustedRedirectLogin() {
    if (!hasPendingRedirectLogin()) return false;

    const startedAt = readTrustedLoginFlowStartedAt();
    const maxAge = Math.max(60 * 1000, Number(CONFIG.redirectLoginTrustWindowMs) || 15 * 60 * 1000);
    return !!startedAt && Date.now() - startedAt >= 0 && Date.now() - startedAt <= maxAge;
  }

  function hasExplicitGoogleUnlockPermission() {
    if (CONFIG.forceGoogleLogin === false) return true;
    if (STATE.ready || STATE.resolved) return true;
    if (STATE.sessionRestoreAllowed) return true;
    if (STATE.allowBackendScriptSessionRestore) return true;
    if (STATE.redirectReturnPending) return true;
    syncBackendLoginUiState();
    return STATE.backendLoginWindowSeen && STATE.backendLoginUiShown && hasFreshLoginInteraction();
  }

  function clearImplicitUnlockTimer() {
    if (!STATE.implicitUnlockTimer) return;
    clearTimeout(STATE.implicitUnlockTimer);
    STATE.implicitUnlockTimer = 0;
  }

  function scheduleImplicitAuthenticatedOpenPrevention() {
    if (CONFIG.forceGoogleLogin === false || STATE.resolved || STATE.implicitUnlockTimer) return;

    STATE.implicitUnlockTimer = window.setTimeout(() => {
      STATE.implicitUnlockTimer = 0;
      if (STATE.resolved || hasExplicitGoogleUnlockPermission()) return;
      if (!STATE.blockedImplicitBackendApi && !isAuthenticated()) return;
      preventImplicitAuthenticatedOpen();
    }, 0);
  }

  function isMemoriaBackendApi(value) {
    return !!(value && typeof value === 'object' && value.ok === 1);
  }

  function getBackendApiSessionToken(value = {}) {
    return String(value?.tk || value?.token || value?.accessToken || '').trim();
  }

  function canTrustBackendApiFromStoredSession(value) {
    if (!STATE.allowBackendScriptSessionRestore || !isMemoriaBackendApi(value)) return false;

    const apiToken = getBackendApiSessionToken(value);
    const storedToken = readStoredSessionToken();
    if (apiToken && storedToken && apiToken !== storedToken) return false;

    // Este permiso solo se activa después de detectar una sesión previa real.
    // Si login.js logra reconstruir window.memoriaBACKEND desde esa sesión,
    // no debe quedar atrapado por el guard de apertura implícita al refrescar.
    return Boolean(apiToken || storedToken || value.u || value.user);
  }

  function acceptBackendApiFromStoredSession(value) {
    if (!canTrustBackendApiFromStoredSession(value)) return false;

    STATE.sessionRestoreAllowed = true;
    STATE.sessionRestoredFromStorage = true;
    STATE.backendApiValue = value;
    STATE.blockedImplicitBackendApi = undefined;
    STATE.allowBackendScriptSessionRestore = false;

    const apiToken = getBackendApiSessionToken(value);
    if (apiToken || value.u || value.user) writeStoredSessionToken(apiToken || readStoredSessionToken(), value.u || value.user || null);
    return true;
  }

  function installBackendApiExposureGate() {
    if (STATE.backendApiGateInstalled || CONFIG.forceGoogleLogin === false) return;

    let initialValue;
    try {
      initialValue = window.memoriaBACKEND;
    } catch (_) {
      initialValue = undefined;
    }

    STATE.backendApiValue = hasExplicitGoogleUnlockPermission() ? initialValue : undefined;
    STATE.blockedImplicitBackendApi = hasExplicitGoogleUnlockPermission() ? undefined : initialValue;

    try {
      Object.defineProperty(window, 'memoriaBACKEND', {
        configurable: true,
        enumerable: true,
        get() {
          return hasExplicitGoogleUnlockPermission() ? STATE.backendApiValue : undefined;
        },
        set(value) {
          if (isMemoriaBackendApi(value) && !hasExplicitGoogleUnlockPermission()) {
            if (acceptBackendApiFromStoredSession(value)) {
              clearImplicitUnlockTimer();
              return;
            }
            STATE.blockedImplicitBackendApi = value;
            STATE.forcedAuthCheckBlocked = true;
            scheduleImplicitAuthenticatedOpenPrevention();
            return;
          }
          clearImplicitUnlockTimer();
          STATE.backendApiValue = value;
          STATE.blockedImplicitBackendApi = undefined;
        }
      });
      STATE.backendApiGateInstalled = true;
    } catch (_) {
      STATE.backendApiGateInstalled = false;
    }
  }

  function hasPendingRedirectLogin() {
    const redirectKey = getSessionStorageKey('redirect');
    if (!redirectKey) return false;
    try {
      return String(window.sessionStorage?.getItem(redirectKey) || '') === '1';
    } catch (_) {
      return false;
    }
  }

  function clearKnownStoredAuth(options = {}) {
    const siteId = getSiteId();
    const preserveRedirect = !!options.preserveRedirect;
    const preserveLoginFlow = !!options.preserveLoginFlow;
    const preserveAuthRecord = !!options.preserveAuthRecord;
    try {
      if (window.sessionStorage && siteId) {
        if (!preserveAuthRecord) sessionStorage.removeItem(`${CONFIG.backendName}:${siteId}:tk`);
        if (!preserveRedirect) sessionStorage.removeItem(`${CONFIG.backendName}:${siteId}:redirect`);
        if (!preserveLoginFlow) sessionStorage.removeItem(`${CONFIG.backendName}:${siteId}:google-flow-started-at`);
      }
      if (!preserveAuthRecord && !preserveRedirect && !preserveLoginFlow) clearPersistentAuthRecord();
    } catch (_) {}
  }

  function getFetchForAuthCheck() {
    return STATE.originalFetch || (window.fetch ? window.fetch.bind(window) : null);
  }

  async function fetchJsonWithTimeout(url, init = {}, timeoutMs = CONFIG.sessionCheckTimeoutMs) {
    const fetcher = getFetchForAuthCheck();
    if (!fetcher) throw new Error('fetch_no_disponible');

    let timeout = 0;
    const controller = window.AbortController ? new AbortController() : null;
    const ms = Math.max(1500, Number(timeoutMs) || 4500);
    try {
      timeout = controller ? window.setTimeout(() => controller.abort(), ms) : 0;
      const response = await fetcher(url, Object.assign({}, init, { signal: controller?.signal }));
      const data = await response.clone().json().catch(() => null);
      return { response, data };
    } finally {
      if (timeout) window.clearTimeout(timeout);
    }
  }

  function buildSessionHeaders(token = '', includeJson = false) {
    const siteId = getSiteId();
    const headers = { 'X-MB-Site': siteId };
    if (includeJson) headers['Content-Type'] = 'application/json';
    if (token) headers.Authorization = `Bearer ${token}`;
    return headers;
  }

  function createMemoriaBackendApi(session = {}) {
    const backendBaseUrl = getBackendBaseUrl();
    const siteId = getSiteId();
    const token = String(session.tk || '').trim();
    const user = session.u && typeof session.u === 'object' ? session.u : null;

    function buildUrl(path, params = null) {
      const url = new URL(path, backendBaseUrl);
      if (params && typeof params === 'object') {
        Object.entries(params).forEach(([key, value]) => {
          if (value === undefined || value === null || value === '') return;
          url.searchParams.set(key, String(value));
        });
      }
      return url.toString();
    }

    async function requestJson(path, options = {}) {
      const method = String(options.method || 'GET').toUpperCase();
      const hasBody = method !== 'GET' && options.body && typeof options.body === 'object';
      const url = buildUrl(path, method === 'GET' ? options.query : null);
      const response = await fetch(url, {
        method,
        credentials: 'include',
        cache: 'no-store',
        headers: buildSessionHeaders(token, hasBody),
        body: hasBody ? JSON.stringify(options.body) : undefined
      });
      const data = await response.clone().json().catch(() => null);
      if (!response.ok || !data || data.ok === 0) {
        const error = new Error(data?.err || `memoriaBACKEND_${response.status}`);
        error.response = data;
        throw error;
      }
      return data;
    }

    return {
      ok: 1,
      tk: token,
      u: user,
      guardarObjeto(k, v, options = {}) {
        const body = { s: siteId, k: String(k || ''), v, sc: options.sc || 'u' };
        if (options.t !== undefined) body.t = options.t;
        return requestJson('/api/v1/object', { method: 'POST', body });
      },
      leerObjeto(k, options = {}) {
        return requestJson('/api/v1/object', { query: { s: siteId, k: String(k || ''), sc: options.sc || 'u' } });
      },
      eliminarObjeto(k, options = {}) {
        return requestJson('/api/v1/object', { method: 'DELETE', body: { s: siteId, k: String(k || ''), sc: options.sc || 'u' } });
      },
      incrementarNumero(k, by = 1, options = {}) {
        const amount = Number(by);
        const body = { s: siteId, k: String(k || ''), by: Number.isFinite(amount) ? amount : 1, sc: options.sc || 's' };
        if (options.t !== undefined) body.t = options.t;
        if (options.f === true || !Number.isInteger(body.by)) body.f = true;
        return requestJson('/api/v1/number/increment', { method: 'POST', body });
      },
      leerNumero(k, options = {}) {
        return requestJson('/api/v1/number', { query: { s: siteId, k: String(k || ''), sc: options.sc || 's' } });
      },
      vista(k = 'v') {
        return requestJson('/api/v1/view', { method: 'POST', body: { s: siteId, k: String(k || 'v') } });
      },
      async cerrarSesion() {
        try {
          return await requestJson('/auth/logout', { method: 'POST', body: { s: siteId } });
        } finally {
          clearKnownStoredAuth();
        }
      }
    };
  }

  function exposeRestoredBackendSession(session, options = {}) {
    STATE.sessionRestoreAllowed = true;
    STATE.sessionRestoredFromStorage = !!options.keepStoredSessionAge;
    STATE.allowBackendScriptSessionRestore = false;
    const api = createMemoriaBackendApi(session);
    STATE.backendApiValue = api;
    STATE.blockedImplicitBackendApi = undefined;
    try {
      window.memoriaBACKEND = api;
    } catch (_) {
      STATE.backendApiValue = api;
    }
    if (!options.keepStoredSessionAge) writeStoredSessionToken(session.tk || '', session.u || null);
    markAuthenticated();
    try {
      window.dispatchEvent(new CustomEvent('memoriaBACKEND:login', { detail: { ok: 1, u: session.u || null, restored: true } }));
    } catch (_) {}
  }

  async function tryRestoreExistingBackendSession() {
    if (CONFIG.rememberSession === false) return false;

    const backendBaseUrl = getBackendBaseUrl();
    const siteId = getSiteId();
    if (!backendBaseUrl || !siteId || !window.fetch) return false;

    const persistentRecord = readPersistentAuthRecord();
    const sessionToken = readSessionStorageTokenOnly();
    const token = persistentRecord?.tk || sessionToken || '';
    STATE.allowBackendScriptSessionRestore = false;

    if (!persistentRecord && !sessionToken && STATE.storedSessionExpired) return false;

    const url = new URL('/auth/check', backendBaseUrl);
    url.searchParams.set('s', siteId);

    try {
      updateMessage(
        'Verificando sesión guardada...',
        isInstalledAppRuntime()
          ? 'Si tu cuenta ya fue validada en la app, ChatER se abrirá automáticamente.'
          : 'Si tu cuenta fue validada recientemente, ChatER se abrirá sin pedir Google otra vez.'
      );
      const { response, data } = await fetchJsonWithTimeout(url.toString(), {
        method: 'GET',
        credentials: 'include',
        cache: 'no-store',
        headers: buildSessionHeaders(token, false)
      });

      if (response.ok && data?.ok === 1) {
        exposeRestoredBackendSession(
          { tk: token, u: data.u || persistentRecord?.u || null },
          { keepStoredSessionAge: !!persistentRecord }
        );
        return true;
      }

      if (response.status === 401 || data?.ok === 0) {
        STATE.allowBackendScriptSessionRestore = false;
        clearKnownStoredAuth();
      } else if (token) {
        STATE.allowBackendScriptSessionRestore = true;
      }
    } catch (error) {
      if (token) STATE.allowBackendScriptSessionRestore = true;
      console.warn(`[${cleanText(CONFIG.brandName, 'ChatER')}] No se pudo verificar la sesión guardada:`, error);
    }

    return false;
  }

  async function resetExistingBackendSessionBeforeLogin() {
    if (CONFIG.forceGoogleLogin === false) return;

    STATE.redirectReturnPending = hasTrustedRedirectLogin();
    STATE.sessionRestoreAllowed = false;
    STATE.sessionRestoredFromStorage = false;

    const backendBaseUrl = getBackendBaseUrl();
    const siteId = getSiteId();
    const storedToken = readStoredSessionToken();
    const preserveStoredSessionForLoginScript = Boolean(STATE.allowBackendScriptSessionRestore && storedToken);
    clearKnownStoredAuth({
      preserveRedirect: STATE.redirectReturnPending || preserveStoredSessionForLoginScript,
      preserveLoginFlow: STATE.redirectReturnPending || preserveStoredSessionForLoginScript,
      preserveAuthRecord: preserveStoredSessionForLoginScript
    });
    clearInjectedBackendApi();

    if (preserveStoredSessionForLoginScript) return;
    if (!backendBaseUrl || !siteId || !window.fetch) return;

    const headers = { 'Content-Type': 'application/json', 'X-MB-Site': siteId };
    if (storedToken) headers.Authorization = `Bearer ${storedToken}`;

    let timeout = 0;
    try {
      const controller = window.AbortController ? new AbortController() : null;
      timeout = controller ? window.setTimeout(() => controller.abort(), 4500) : 0;
      await fetch(`${backendBaseUrl}/auth/logout`, {
        method: 'POST',
        credentials: 'include',
        cache: 'no-store',
        headers,
        body: JSON.stringify({ s: siteId }),
        signal: controller?.signal
      });
    } catch (_) {
      // Si el navegador bloquea el cierre por CORS/red, el guard de fetch evita que /auth/check abra la plataforma sin mostrar login.
    } finally {
      if (timeout) window.clearTimeout(timeout);
    }
  }

  function isBackendAuthCheckUrl(value) {
    const backendBaseUrl = getBackendBaseUrl();
    const siteId = getSiteId();
    if (!backendBaseUrl || !siteId) return false;

    try {
      const url = new URL(value, window.location.href);
      return url.origin === backendBaseUrl && url.pathname === '/auth/check';
    } catch (_) {
      return false;
    }
  }

  function isBackendFirebaseSessionUrl(value) {
    const backendBaseUrl = getBackendBaseUrl();
    if (!backendBaseUrl) return false;

    try {
      const url = new URL(value, window.location.href);
      return url.origin === backendBaseUrl && url.pathname === '/auth/firebase/session';
    } catch (_) {
      return false;
    }
  }

  function getHeaderValue(headers, name) {
    if (!headers || !name) return '';
    const normalizedName = String(name).toLowerCase();

    try {
      if (typeof headers.get === 'function') return String(headers.get(name) || '').trim();
    } catch (_) {}

    if (Array.isArray(headers)) {
      const entry = headers.find((item) => Array.isArray(item) && String(item[0] || '').toLowerCase() === normalizedName);
      return String(entry?.[1] || '').trim();
    }

    if (typeof headers === 'object') {
      const key = Object.keys(headers).find((item) => String(item || '').toLowerCase() === normalizedName);
      return key ? String(headers[key] || '').trim() : '';
    }

    return '';
  }

  function requestHasAuthorizationHeader(init = {}) {
    const value = getHeaderValue(init?.headers, 'Authorization');
    return /^Bearer\s+\S+/i.test(value);
  }

  function shouldAllowBackendScriptSessionCheck(init = {}) {
    return Boolean(STATE.allowBackendScriptSessionRestore && requestHasAuthorizationHeader(init));
  }

  function shouldBlockImplicitBackendSessionRequest(value, init = {}) {
    if (CONFIG.forceGoogleLogin === false || STATE.resolved) return false;
    if (isBackendAuthCheckUrl(value)) return !shouldAllowBackendScriptSessionCheck(init);
    return isBackendFirebaseSessionUrl(value) && !hasExplicitGoogleUnlockPermission();
  }

  function blockedLoginRequiredResponse() {
    return Promise.resolve(new Response(JSON.stringify({ ok: 0, err: 'login_requerido' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    }));
  }

  function restoreForcedLoginFetchGuard() {
    if (!STATE.forcedFetchGuardInstalled || STATE.forcedFetchGuardReleased) return;
    if (STATE.originalFetch) window.fetch = STATE.originalFetch;
    STATE.forcedFetchGuardInstalled = false;
    STATE.forcedFetchGuardReleased = true;
    STATE.originalFetch = null;
  }

  function installForcedLoginFetchGuard() {
    if (CONFIG.forceGoogleLogin === false || !window.fetch || !window.Response) return;
    if (STATE.forcedFetchGuardInstalled && !STATE.forcedFetchGuardReleased) return;

    STATE.originalFetch = window.fetch.bind(window);
    STATE.forcedFetchGuardInstalled = true;
    STATE.forcedFetchGuardReleased = false;

    window.fetch = (input, init) => {
      const url = typeof input === 'string' ? input : String(input?.url || '');
      if (shouldBlockImplicitBackendSessionRequest(url, init)) {
        STATE.forcedAuthCheckBlocked = true;
        STATE.sessionAuthCheckBlocked = true;
        return blockedLoginRequiredResponse();
      }

      return STATE.originalFetch(input, init).then((response) => {
        if (isBackendFirebaseSessionUrl(url)) captureBackendSessionResponse(response.clone());
        return response;
      });
    };
  }

  function captureBackendSessionResponse(response) {
    if (!response || typeof response.json !== 'function') return;
    response.json()
      .then((data) => {
        if (!data || data.ok !== 1) return;
        writeStoredSessionToken(data.tk || '', data.u || null);
      })
      .catch(() => {});
  }

  function rememberBackendLoginFromEvent(event) {
    const detail = event?.detail && typeof event.detail === 'object' ? event.detail : null;
    const eventToken = String(detail?.tk || window.memoriaBACKEND?.tk || '').trim();
    const storedToken = eventToken ? '' : readStoredSessionToken();
    const token = eventToken || storedToken;
    const user = detail?.u || window.memoriaBACKEND?.u || readPersistentAuthRecord()?.u || null;
    if (token || user) writeStoredSessionToken(token, user);
  }

  function installStyle() {
    if (document.getElementById('platform-auth-gate-style')) return;

    const style = document.createElement('style');
    style.id = 'platform-auth-gate-style';
    style.textContent = `
      html.platform-auth-pending,
      html.platform-auth-required {
        overflow: hidden !important;
        background: #050509;
      }

      html.platform-auth-pending body > *:not(#platform-auth-gate):not(#mb-login-root),
      html.platform-auth-required body > *:not(#platform-auth-gate):not(#mb-login-root) {
        visibility: hidden !important;
        pointer-events: none !important;
        user-select: none !important;
      }

      #platform-auth-gate {
        position: fixed;
        inset: 0;
        z-index: 2147483600;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 24px;
        background:
          radial-gradient(circle at top left, rgba(37, 211, 102, .24), transparent 34%),
          linear-gradient(135deg, rgba(5, 5, 9, .98), rgba(13, 13, 23, .98));
        color: #fff;
        font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }

      #platform-auth-gate-card {
        width: min(92vw, 430px);
        border: 1px solid rgba(255, 255, 255, .18);
        border-radius: 26px;
        padding: 30px;
        background: rgba(15, 15, 24, .88);
        box-shadow: 0 28px 90px rgba(0, 0, 0, .55);
        text-align: center;
        backdrop-filter: blur(18px);
      }

      #platform-auth-gate-mark {
        width: 68px;
        height: 68px;
        margin: 0 auto 16px;
        border-radius: 18px;
        display: grid;
        place-items: center;
        background: ${CONFIG.accentColor};
        color: #fff;
        font-size: 24px;
        font-weight: 900;
        letter-spacing: -.08em;
      }

      #platform-auth-gate-title {
        margin: 0 0 8px;
        font-size: clamp(22px, 4vw, 28px);
        line-height: 1.1;
      }

      #platform-auth-gate-message {
        margin: 0;
        color: #d6d6e5;
        font-size: 15px;
        line-height: 1.45;
      }

      #platform-auth-gate-detail {
        margin: 14px 0 0;
        color: #a9a9bb;
        font-size: 12px;
        line-height: 1.4;
      }

      #platform-auth-gate.platform-auth-gate-error #platform-auth-gate-card {
        border-color: rgba(250, 204, 21, .45);
      }

      #platform-auth-gate.platform-auth-gate-error #platform-auth-gate-detail {
        color: #fde68a;
      }
    `;
    (document.head || document.documentElement).appendChild(style);
  }

  function ensureRoot() {
    installStyle();
    document.documentElement.classList.add('platform-auth-pending', 'platform-auth-required');

    if (!document.body) return null;

    let root = document.getElementById('platform-auth-gate');
    if (!root) {
      root = document.createElement('div');
      root.id = 'platform-auth-gate';
      root.setAttribute('role', 'status');
      root.setAttribute('aria-live', 'polite');
      root.innerHTML = `
        <section id="platform-auth-gate-card" aria-label="Inicio de sesión requerido">
          <div id="platform-auth-gate-mark" aria-hidden="true">CE</div>
          <h1 id="platform-auth-gate-title">${cleanText(CONFIG.brandName, 'ChatER')}</h1>
          <p id="platform-auth-gate-message">Preparando inicio de sesión seguro...</p>
          <p id="platform-auth-gate-detail">La plataforma se abrirá después de validar tu cuenta de Google.</p>
        </section>
      `;
      document.body.appendChild(root);
    }

    return root;
  }

  function updateMessage(message, detail, isError = false) {
    const root = ensureRoot();
    if (!root) return;

    const messageNode = document.getElementById('platform-auth-gate-message');
    const detailNode = document.getElementById('platform-auth-gate-detail');
    if (messageNode) messageNode.textContent = cleanText(message, 'Preparando inicio de sesión seguro...');
    if (detailNode) detailNode.textContent = cleanText(detail, 'La plataforma se abrirá después de validar tu cuenta de Google.');
    root.classList.toggle('platform-auth-gate-error', !!isError);
  }

  function isAuthenticated() {
    return isMemoriaBackendApi(window.memoriaBACKEND);
  }

  function getBackendLoginRoot() {
    const root = document.getElementById('mb-login-root');
    if (!root) return null;
    const loginButton = root.querySelector('#mb-login-btn, button, [role="button"]');
    return loginButton ? root : null;
  }

  function syncBackendLoginUiState() {
    if (getBackendLoginRoot()) {
      STATE.backendLoginUiShown = true;
      STATE.backendLoginWindowSeen = true;
    }
  }

  function isBackendLoginAction(event) {
    const target = event?.target;
    if (!target || typeof target.closest !== 'function') return false;
    const button = target.closest('#mb-login-btn');
    return !!button;
  }

  function trackBackendLoginAction(event) {
    if (event?.isTrusted === false) return;
    if (!isBackendLoginAction(event)) return;
    if (event.type === 'keydown') {
      const key = String(event.key || '');
      if (key !== 'Enter' && key !== ' ') return;
    }
    STATE.backendLoginUiShown = true;
    STATE.backendLoginWindowSeen = true;
    rememberTrustedLoginFlow();
  }

  function installLoginInteractionTracker() {
    document.addEventListener('pointerdown', trackBackendLoginAction, true);
    document.addEventListener('click', trackBackendLoginAction, true);
    document.addEventListener('keydown', trackBackendLoginAction, true);
  }

  function clearInjectedBackendApi() {
    STATE.backendApiValue = undefined;
    STATE.blockedImplicitBackendApi = undefined;
    if (STATE.backendApiGateInstalled) return;

    try {
      delete window.memoriaBACKEND;
    } catch (_) {
      try { window.memoriaBACKEND = undefined; } catch (__) {}
    }
  }

  function restartLoginAfterImplicitUnlock() {
    if (STATE.implicitUnlockRestarts >= 2) {
      showError('Se detectó una sesión previa, pero no se pudo forzar la ventana de Google. Cierra sesión en memoriaBACKEND o revisa la configuración del site.');
      return;
    }

    STATE.implicitUnlockRestarts += 1;
    STATE.backendScriptLoaded = false;
    STATE.backendScriptRequested = false;
    STATE.backendBootPromise = null;
    STATE.forcedAuthCheckBlocked = false;
    STATE.sessionAuthCheckBlocked = false;
    STATE.backendLoginUiShown = false;
    STATE.backendLoginWindowSeen = false;
    STATE.loginInteractionObserved = false;
    STATE.loginInteractionStartedAt = 0;
    STATE.sessionRestoreAllowed = false;
    STATE.sessionRestoredFromStorage = false;
    STATE.allowBackendScriptSessionRestore = false;
    clearTrustedLoginFlow();

    const existingScript = document.getElementById('memoriaBackendLoginScript');
    if (existingScript) existingScript.remove();

    window.setTimeout(() => {
      installForcedLoginFetchGuard();
      loadBackendLoginScript();
    }, 0);
  }

  function preventImplicitAuthenticatedOpen() {
    clearImplicitUnlockTimer();
    clearKnownStoredAuth();
    clearTrustedLoginFlow();
    STATE.sessionRestoreAllowed = false;
    STATE.sessionRestoredFromStorage = false;
    STATE.allowBackendScriptSessionRestore = false;
    clearInjectedBackendApi();
    updateMessage(
      'Inicio de sesión con Google requerido.',
      'Se detectó una sesión previa. Para abrir la plataforma debes iniciar sesión desde la ventana de Google.',
      false
    );
    restartLoginAfterImplicitUnlock();
  }

  function releaseBackendApiExposureGate() {
    if (!STATE.backendApiGateInstalled) return;
    const value = STATE.backendApiValue;
    try {
      delete window.memoriaBACKEND;
      if (value !== undefined) window.memoriaBACKEND = value;
      STATE.backendApiGateInstalled = false;
    } catch (_) {
      try { window.memoriaBACKEND = value; } catch (__) {}
    }
  }

  function markAuthenticated() {
    syncBackendLoginUiState();
    if (STATE.resolved || !isAuthenticated()) return;

    if (CONFIG.forceGoogleLogin !== false) {
      if (!hasExplicitGoogleUnlockPermission()) {
        preventImplicitAuthenticatedOpen();
        return;
      }
    }

    if (!STATE.sessionRestoredFromStorage && (window.memoriaBACKEND?.u || window.memoriaBACKEND?.tk)) {
      writeStoredSessionToken(window.memoriaBACKEND?.tk || readStoredSessionToken(), window.memoriaBACKEND?.u || null);
    }

    clearImplicitUnlockTimer();
    STATE.allowBackendScriptSessionRestore = false;
    STATE.resolved = true;
    STATE.ready = true;
    releaseBackendApiExposureGate();
    STATE.redirectReturnPending = false;
    clearTrustedLoginFlow();
    try {
      const redirectKey = getSessionStorageKey('redirect');
      if (redirectKey) window.sessionStorage?.removeItem(redirectKey);
    } catch (_) {}
    clearTimeout(STATE.fallbackTimer);
    restoreForcedLoginFetchGuard();
    if (STATE.observer) STATE.observer.disconnect();
    STATE.observer = null;
    document.documentElement.classList.remove('platform-auth-pending', 'platform-auth-required');
    const root = document.getElementById('platform-auth-gate');
    if (root) root.remove();
    if (STATE.resolveReady) STATE.resolveReady(window.memoriaBACKEND || null);
  }

  function handleBackendLoginEvent(event) {
    const detail = event?.detail && typeof event.detail === 'object' ? event.detail : null;
    const eventApi = isMemoriaBackendApi(detail) ? detail : window.memoriaBACKEND;
    if (acceptBackendApiFromStoredSession(eventApi)) {
      // La API fue reconstruida por login.js a partir de una sesión guardada;
      // se marca como restauración válida antes de evaluar el guard anti-apertura.
    }
    if (!STATE.sessionRestoreAllowed) STATE.sessionRestoredFromStorage = false;
    rememberBackendLoginFromEvent(event);
    if (CONFIG.forceGoogleLogin !== false && !hasExplicitGoogleUnlockPermission()) {
      if (event && typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation();
      preventImplicitAuthenticatedOpen();
      return;
    }
    markAuthenticated();
  }

  function showWaiting() {
    syncBackendLoginUiState();
    if (isAuthenticated() && CONFIG.forceGoogleLogin === false) {
      markAuthenticated();
      return;
    }

    updateMessage(
      'Preparando inicio de sesión seguro...',
      'La plataforma se abrirá después de validar tu cuenta de Google.'
    );
  }

  function showError(message) {
    if (isAuthenticated()) {
      markAuthenticated();
      return;
    }

    if (CONFIG.forceGoogleLogin === false) {
      restoreForcedLoginFetchGuard();
    } else {
      installForcedLoginFetchGuard();
    }

    updateMessage(
      'No se pudo abrir el inicio de sesión con Google.',
      message || `Revisa que ${cleanText(CONFIG.backendName, 'memoriaBACKEND')} esté activo y que este dominio esté autorizado para el site configurado.`,
      true
    );
  }

  function watchBackendLoginUi() {
    syncBackendLoginUiState();
    if (STATE.observer || !window.MutationObserver || !document.documentElement) return;

    STATE.observer = new MutationObserver(() => {
      syncBackendLoginUiState();
      if (isAuthenticated()) markAuthenticated();
    });
    STATE.observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true });
  }

  function scheduleBackendFallback() {
    clearTimeout(STATE.fallbackTimer);
    STATE.fallbackTimer = window.setTimeout(() => {
      syncBackendLoginUiState();
      if (CONFIG.forceGoogleLogin !== false && STATE.blockedImplicitBackendApi && !hasExplicitGoogleUnlockPermission()) {
        preventImplicitAuthenticatedOpen();
        return;
      }
      if (isAuthenticated()) {
        acceptBackendApiFromStoredSession(window.memoriaBACKEND);
        markAuthenticated();
        if (STATE.resolved) return;
      }
      if (document.getElementById('mb-login-root')) {
        syncBackendLoginUiState();
        return;
      }
      if (tryNextLoginScriptCandidate('La ruta anterior de login.js cargó, pero no mostró la ventana segura de Google.')) return;
      showError(`El script de autenticación no mostró la ventana de Google. Verifica en ${cleanText(CONFIG.backendName, 'memoriaBACKEND')} que el dominio actual esté dentro de origins para el site usado por esta plataforma y que la política CSP permita login.js.`);
    }, Math.max(2500, Number(CONFIG.fallbackDelayMs) || 7000));
  }

  function markBackendScriptLoaded() {
    STATE.backendScriptLoaded = true;
    scheduleBackendFallback();
  }

  function tryNextLoginScriptCandidate(reason = '') {
    const candidates = getLoginScriptUrlCandidates();
    const nextIndex = STATE.loginScriptCandidateIndex + 1;
    if (nextIndex >= candidates.length) return false;

    STATE.loginScriptCandidateIndex = nextIndex;
    STATE.backendScriptLoaded = false;
    STATE.backendScriptRequested = false;
    clearTimeout(STATE.fallbackTimer);

    const existingScript = document.getElementById('memoriaBackendLoginScript');
    if (existingScript) existingScript.remove();

    updateMessage(
      'Probando ruta alternativa de inicio de sesión...',
      reason || 'El primer cargador de Google no quedó disponible; ChatER intentará una ruta autorizada de memoriaBACKEND.'
    );
    window.setTimeout(loadBackendLoginScript, 0);
    return true;
  }

  async function bootBackendLoginScript() {
    if (STATE.backendBootPromise) return STATE.backendBootPromise;

    STATE.backendBootPromise = (async () => {
      const restored = await tryRestoreExistingBackendSession();
      if (restored || STATE.resolved) return;
      await resetExistingBackendSessionBeforeLogin();
      installForcedLoginFetchGuard();
      loadBackendLoginScript();
    })().catch((error) => {
      showError(error?.message || 'No se pudo preparar la autenticación con Google.');
    });

    return STATE.backendBootPromise;
  }

  function loadBackendLoginScript() {
    if (STATE.backendScriptRequested) return;
    if (isAuthenticated() && CONFIG.forceGoogleLogin === false) return;
    if (CONFIG.forceGoogleLogin !== false) clearInjectedBackendApi();

    const loginScriptUrl = getRuntimeLoginScriptUrl();
    if (!loginScriptUrl) {
      showError('Falta configurar loginScriptUrl, backendBaseUrl o siteId para cargar memoriaBACKEND.');
      return;
    }

    STATE.backendScriptRequested = true;
    STATE.loginScriptAttemptedUrls.push(loginScriptUrl);
    const script = document.createElement('script');
    script.id = 'memoriaBackendLoginScript';
    script.src = loginScriptUrl;
    script.async = false;
    script.defer = false;
    script.onload = markBackendScriptLoaded;
    script.onerror = () => {
      if (tryNextLoginScriptCandidate('El navegador no pudo cargar la primera ruta de login.js.')) return;
      showError('No se pudo cargar login.js desde memoriaBACKEND. Revisa que el backend esté publicado, accesible y permitido por la política CSP del dominio.');
    };
    (document.head || document.documentElement).appendChild(script);
  }

  function start() {
    STATE.redirectReturnPending = hasTrustedRedirectLogin();

    if (isAuthenticated() && CONFIG.forceGoogleLogin === false) {
      markAuthenticated();
      return;
    }

    showWaiting();
    watchBackendLoginUi();
    scheduleBackendFallback();
    bootBackendLoginScript();
  }

  window.platformAuthGate = Object.freeze({
    whenReady: () => readyPromise,
    markAuthenticated,
    showWaiting,
    showError,
    markBackendScriptLoaded
  });

  installStyle();
  installBackendApiExposureGate();
  installForcedLoginFetchGuard();
  installLoginInteractionTracker();
  document.documentElement.classList.add('platform-auth-pending', 'platform-auth-required');
  window.addEventListener('memoriaBACKEND:login', handleBackendLoginEvent, true);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
