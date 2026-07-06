(() => {
  'use strict';

  const CONFIG_FILE_URL = './js/CONFIGmemoriaBACKEND.json';
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

  function readConfigFile() {
    const request = new XMLHttpRequest();
    request.open('GET', CONFIG_FILE_URL, false);
    request.overrideMimeType?.('application/json');
    request.send(null);

    const status = Number(request.status);
    const hasLocalFileResponse = status === 0 && String(request.responseText || '').trim();
    if (!hasLocalFileResponse && (status < 200 || status >= 300)) {
      throw new Error(`No se pudo cargar ${CONFIG_FILE_URL}: HTTP ${status || 'sin respuesta'}`);
    }

    return JSON.parse(request.responseText || '{}');
  }

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

  function buildProjectAssetUrl(projectOrigin, assetPath) {
    if (!projectOrigin) return '';

    try {
      return new URL(assetPath, `${projectOrigin}/`).toString();
    } catch (_) {
      return '';
    }
  }

  function buildLoginScriptUrl(config) {
    const backendBaseUrl = normalizeOrigin(config.MEMORIA_BACKEND_URL);
    const projectOrigin = normalizeOrigin(config.ORIGEN_PROYECTO);
    const siteId = cleanSiteId(config.MEMORIA_SITE_ID);
    if (!backendBaseUrl || !siteId) return '';

    const url = new URL('/login.js', backendBaseUrl);
    url.searchParams.set('s', siteId);
    url.searchParams.set('n', PLATFORM_AUTH_DEFAULTS.brandName);
    url.searchParams.set('c', PLATFORM_AUTH_DEFAULTS.accentColor);

    const iconUrl = buildProjectAssetUrl(projectOrigin, '/assets/chater-icon-192.png');
    const screenshotUrl = buildProjectAssetUrl(projectOrigin, '/assets/chater-maskable-512.png');
    if (iconUrl) url.searchParams.set('l', iconUrl);
    if (screenshotUrl) url.searchParams.set('bg', screenshotUrl);

    return url.toString();
  }

  function buildPlatformAuthConfig(config) {
    const backendBaseUrl = normalizeOrigin(config.MEMORIA_BACKEND_URL);
    const projectOrigin = normalizeOrigin(config.ORIGEN_PROYECTO);
    const siteId = cleanSiteId(config.MEMORIA_SITE_ID);

    return Object.assign({}, PLATFORM_AUTH_DEFAULTS, window.PLATFORM_AUTH_CONFIG || {}, {
      backendBaseUrl,
      siteId,
      loginScriptUrl: buildLoginScriptUrl(config),
      memoriaBackendConfig: Object.freeze({
        origenProyecto: projectOrigin,
        memoriaBackendUrl: backendBaseUrl,
        memoriaSiteId: siteId
      })
    });
  }

  try {
    const memoriaConfig = readConfigFile();
    window.CONFIGmemoriaBACKEND = Object.freeze(Object.assign({}, memoriaConfig));
    window.PLATFORM_AUTH_CONFIG = Object.freeze(buildPlatformAuthConfig(memoriaConfig));
  } catch (error) {
    console.error('[CONFIGmemoriaBACKEND] No se pudo cargar la configuración centralizada:', error);
    window.CONFIGmemoriaBACKEND = Object.freeze({});
    window.PLATFORM_AUTH_CONFIG = Object.freeze(Object.assign({}, PLATFORM_AUTH_DEFAULTS, window.PLATFORM_AUTH_CONFIG || {}, {
      backendBaseUrl: '',
      siteId: '',
      loginScriptUrl: '',
      configLoadError: error?.message || 'No se pudo cargar CONFIGmemoriaBACKEND.json'
    }));
  }
})();
