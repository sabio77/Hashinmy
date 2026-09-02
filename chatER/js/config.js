(() => {
  'use strict';

  const CONFIG_FILE_URL = './js/CONFIGmemoriaBACKEND.json';
  const DEFAULT_MEMORIA_CONFIG = Object.freeze({
    ORIGEN_PROYECTO: 'https://hashinmy.com',
    MEMORIA_BACKEND_URL: 'https://mapsx.app',
    MEMORIA_SITE_ID: 'de966e921416'
  });
  const PLATFORM_AUTH_DEFAULTS = Object.freeze({
    brandName: 'ChatER',
    backendName: 'memoriaBACKEND',
    forceGoogleLogin: true,
    rememberSession: true,
    browserSessionTtlMs: 24 * 60 * 60 * 1000,
    appSessionTtlMs: 0,
    accentColor: '#25d366',
    fallbackDelayMs: 7000
  });

  function normalizeOrigin(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';

    try {
      return new URL(raw, window.location.href).origin;
    } catch (_) {
      return '';
    }
  }

  function cleanSiteId(value) {
    return String(value || '').trim();
  }

  function uniqueList(values = []) {
    const seen = new Set();
    const out = [];
    values.forEach((value) => {
      const item = String(value || '').trim();
      if (!item || seen.has(item)) return;
      seen.add(item);
      out.push(item);
    });
    return out;
  }

  function buildProjectAssetUrl(projectOrigin, assetPath) {
    if (!projectOrigin) return '';

    try {
      return new URL(assetPath, `${projectOrigin}/`).toString();
    } catch (_) {
      return '';
    }
  }

  function mergeMemoriaConfig(config = {}) {
    const source = config && typeof config === 'object' ? config : {};
    return {
      ...DEFAULT_MEMORIA_CONFIG,
      ...source,
      ORIGEN_PROYECTO: normalizeOrigin(source.ORIGEN_PROYECTO || source.MEMORIA_PROJECT_ORIGIN || source.PROJECT_ORIGIN || DEFAULT_MEMORIA_CONFIG.ORIGEN_PROYECTO),
      MEMORIA_BACKEND_URL: normalizeOrigin(source.MEMORIA_BACKEND_URL || source.backendBaseUrl || DEFAULT_MEMORIA_CONFIG.MEMORIA_BACKEND_URL),
      MEMORIA_SITE_ID: cleanSiteId(source.MEMORIA_SITE_ID || source.SITE_ID || source.siteId || DEFAULT_MEMORIA_CONFIG.MEMORIA_SITE_ID),
      REQUIRE_GOOGLE_GMAIL_AUTH: true,
      STREME_TRANSPORT: 'sse'
    };
  }

  function buildLoginScriptUrl(config) {
    const backendUrl = normalizeOrigin(config.MEMORIA_BACKEND_URL);
    const projectOrigin = normalizeOrigin(config.ORIGEN_PROYECTO);
    const siteId = cleanSiteId(config.MEMORIA_SITE_ID);
    if (!backendUrl || !siteId) return '';

    const loginUrl = new URL('/login.js', backendUrl);
    loginUrl.searchParams.set('s', siteId);
    loginUrl.searchParams.set('n', PLATFORM_AUTH_DEFAULTS.brandName);
    loginUrl.searchParams.set('c', PLATFORM_AUTH_DEFAULTS.accentColor);

    const iconUrl = buildProjectAssetUrl(projectOrigin, '/assets/chater-icon-192.png');
    const screenshotUrl = buildProjectAssetUrl(projectOrigin, '/assets/chater-maskable-512.png');
    if (iconUrl) loginUrl.searchParams.set('l', iconUrl);
    if (screenshotUrl) loginUrl.searchParams.set('bg', screenshotUrl);

    return loginUrl.toString();
  }

  function buildLoginScriptUrlCandidates(config) {
    const backendUrl = normalizeOrigin(config.MEMORIA_BACKEND_URL);
    const siteId = cleanSiteId(config.MEMORIA_SITE_ID);
    const primaryUrl = buildLoginScriptUrl(config);
    const candidates = [primaryUrl];

    if (backendUrl && siteId) {
      try {
        const sameOriginUrl = new URL('/login.js', window.location.origin);
        sameOriginUrl.searchParams.set('s', siteId);
        sameOriginUrl.searchParams.set('n', PLATFORM_AUTH_DEFAULTS.brandName);
        sameOriginUrl.searchParams.set('c', PLATFORM_AUTH_DEFAULTS.accentColor);
        sameOriginUrl.searchParams.set('backend', backendUrl);
        candidates.push(sameOriginUrl.toString());
      } catch (_) {}
    }

    return uniqueList(candidates);
  }

  function buildPlatformAuthConfig(config, loadError = null) {
    const backendBaseUrl = normalizeOrigin(config.MEMORIA_BACKEND_URL);
    const projectOrigin = normalizeOrigin(config.ORIGEN_PROYECTO);
    const siteId = cleanSiteId(config.MEMORIA_SITE_ID);
    const loginScriptUrlCandidates = buildLoginScriptUrlCandidates(config);

    return Object.freeze(Object.assign({}, PLATFORM_AUTH_DEFAULTS, window.PLATFORM_AUTH_CONFIG || {}, {
      backendBaseUrl,
      siteId,
      forceGoogleLogin: true,
      loginScriptUrl: loginScriptUrlCandidates[0] || '',
      loginScriptUrlCandidates,
      memoriaBackendConfig: Object.freeze({
        origenProyecto: projectOrigin,
        memoriaBackendUrl: backendBaseUrl,
        memoriaSiteId: siteId
      }),
      ...(loadError ? { configLoadError: loadError?.message || String(loadError || 'No se pudo cargar CONFIGmemoriaBACKEND.json') } : {})
    }));
  }

  function publishChatERConfig(config, loadError = null) {
    const existingConfig = window.CHATER_CONFIG || {};
    const memoriaConfig = Object.freeze(mergeMemoriaConfig(config));
    const loginScriptUrlCandidates = buildLoginScriptUrlCandidates(memoriaConfig);
    window.CONFIGmemoriaBACKEND = memoriaConfig;
    window.CHATER_CONFIG = Object.freeze(Object.assign({}, existingConfig, memoriaConfig, {
      REQUIRE_GOOGLE_GMAIL_AUTH: true,
      ENABLE_LOCAL_DEMO_SEED: existingConfig.ENABLE_LOCAL_DEMO_SEED === true,
      STREME_TRANSPORT: 'sse',
      loginScriptUrl: loginScriptUrlCandidates[0] || '',
      loginScriptUrlCandidates
    }));
    window.PLATFORM_AUTH_CONFIG = buildPlatformAuthConfig(memoriaConfig, loadError);
    return memoriaConfig;
  }

  async function readConfigFile() {
    const response = await fetch(CONFIG_FILE_URL, { cache: 'no-store', credentials: 'same-origin' });
    if (!response.ok) throw new Error(`No se pudo cargar ${CONFIG_FILE_URL}: HTTP ${response.status || 'sin respuesta'}`);
    return response.json();
  }

  function loadChatERRuntimeScripts() {
    return window.CHATER_CONFIG_READY;
  }

  window.loadChatERRuntimeScripts = loadChatERRuntimeScripts;
  publishChatERConfig(window.CONFIGmemoriaBACKEND || window.CHATER_CONFIG || DEFAULT_MEMORIA_CONFIG);

  window.CHATER_CONFIG_READY = (async () => {
    try {
      const memoriaConfig = await readConfigFile();
      return publishChatERConfig(memoriaConfig);
    } catch (error) {
      console.error('[CONFIGmemoriaBACKEND] No se pudo cargar la configuración centralizada:', error);
      return publishChatERConfig(window.CONFIGmemoriaBACKEND || DEFAULT_MEMORIA_CONFIG, error);
    }
  })();
})();
