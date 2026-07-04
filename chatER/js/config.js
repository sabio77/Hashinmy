// Configuración runtime de ChatER para despliegues static site.
// Los valores críticos de memoriaBACKEND se cargan exclusivamente desde
// js/CONFIGmemoriaBACKEND.json para poder cambiarlos sin modificar código.
(function () {
  var CONFIG_JSON_PATH = 'js/CONFIGmemoriaBACKEND.json';

  function normalizeText(value) {
    return String(value || '').trim();
  }

  function readFirst(rawConfig, keys) {
    if (!rawConfig || typeof rawConfig !== 'object') return '';
    for (var index = 0; index < keys.length; index += 1) {
      var value = normalizeText(rawConfig[keys[index]]);
      if (value) return value;
    }
    return '';
  }

  function normalizeOrigin(value) {
    var raw = normalizeText(value);
    if (!raw) return '';

    try {
      return new URL(raw, window.location.href).origin.replace(/\/+$/, '');
    } catch (error) {
      return '';
    }
  }

  function loadMemoriaBackendRuntimeConfig() {
    try {
      var request = new XMLHttpRequest();
      request.open('GET', CONFIG_JSON_PATH + '?v=' + Date.now(), false);
      request.overrideMimeType && request.overrideMimeType('application/json');
      request.send(null);

      var status = Number(request.status);
      var hasLocalFileResponse = status === 0 && normalizeText(request.responseText);

      if ((hasLocalFileResponse || (status >= 200 && status < 300)) && request.responseText) {
        return JSON.parse(request.responseText);
      }

      console.error('No se pudo cargar CONFIGmemoriaBACKEND.json. Estado HTTP:', request.status);
    } catch (error) {
      console.error('No se pudo leer CONFIGmemoriaBACKEND.json.', error);
    }

    return {};
  }

  function buildMemoriaLoginScriptUrl(options) {
    var backendUrl = normalizeOrigin(options.backendUrl);
    var siteId = normalizeText(options.siteId);
    if (!backendUrl || !siteId) return '';

    try {
      var loginUrl = new URL('/login.js', backendUrl);
      loginUrl.searchParams.set('s', siteId);
      loginUrl.searchParams.set('n', options.brandName || 'ChatER');
      loginUrl.searchParams.set('c', options.accentColor || '#25d366');
      return loginUrl.toString();
    } catch (error) {
      console.error('No se pudo construir login.js de memoriaBACKEND.', error);
      return '';
    }
  }

  var jsonConfig = loadMemoriaBackendRuntimeConfig();
  var existingConfig = window.CHATER_CONFIG && typeof window.CHATER_CONFIG === 'object' ? window.CHATER_CONFIG : {};
  var existingPlatformConfig = window.PLATFORM_AUTH_CONFIG && typeof window.PLATFORM_AUTH_CONFIG === 'object' ? window.PLATFORM_AUTH_CONFIG : {};
  var projectOrigin = normalizeOrigin(readFirst(jsonConfig, ['ORIGEN_PROYECTO', 'ORIGEN', 'PROJECT_ORIGIN', 'origin']));
  var backendUrl = normalizeOrigin(readFirst(jsonConfig, ['MEMORIA_BACKEND_URL', 'DOMINIO_MEMORIABACKEND', 'DOMINIOmemoriaBACKEND', 'backendUrl']));
  var siteId = readFirst(jsonConfig, ['MEMORIA_SITE_ID', 'SITE_ID', 'siteId']);
  var brandName = existingPlatformConfig.brandName || existingConfig.GOOGLE_LOGIN_BRAND_NAME || 'ChatER';
  var accentColor = existingPlatformConfig.accentColor || existingConfig.GOOGLE_LOGIN_THEME_COLOR || '#25d366';

  if (!projectOrigin || !backendUrl || !siteId) {
    console.error('CONFIGmemoriaBACKEND.json debe definir ORIGEN_PROYECTO, MEMORIA_BACKEND_URL y MEMORIA_SITE_ID.');
  }

  window.CONFIGmemoriaBACKEND = Object.freeze(Object.assign({}, jsonConfig));

  window.PLATFORM_AUTH_CONFIG = Object.freeze(Object.assign({
    brandName: brandName,
    backendName: 'memoriaBACKEND',
    forceGoogleLogin: true,
    rememberSession: true,
    browserSessionTtlMs: 24 * 60 * 60 * 1000,
    appSessionTtlMs: 0,
    accentColor: accentColor,
    fallbackDelayMs: 7000
  }, existingPlatformConfig, {
    brandName: brandName,
    accentColor: accentColor,
    backendBaseUrl: backendUrl,
    siteId: siteId,
    loginScriptUrl: buildMemoriaLoginScriptUrl({
      backendUrl: backendUrl,
      siteId: siteId,
      brandName: brandName,
      accentColor: accentColor
    }),
    memoriaBackendConfig: Object.freeze({
      origenProyecto: projectOrigin,
      memoriaBackendUrl: backendUrl,
      memoriaSiteId: siteId
    })
  }));

  window.CHATER_CONFIG = {
    // Valores críticos: única fuente autorizada = js/CONFIGmemoriaBACKEND.json.
    ORIGEN_PROYECTO: projectOrigin,
    MEMORIA_PROJECT_ORIGIN: projectOrigin,
    MEMORIA_BACKEND_URL: backendUrl,
    MEMORIA_SITE_ID: siteId,

    // Configuración operativa no sensible del static site.
    MEMORIA_API_PREFIX: existingConfig.MEMORIA_API_PREFIX || '/api/v1',
    STREME_REALTIME_URL: existingConfig.STREME_REALTIME_URL || '',
    STREME_TRANSPORT: existingConfig.STREME_TRANSPORT || 'auto',
    STREME_CHANNEL: existingConfig.STREME_CHANNEL || 'chater-general',
    ENABLE_STATIC_VISIT_TRACKING: existingConfig.ENABLE_STATIC_VISIT_TRACKING !== false,
    ENABLE_CLIENT_TELEMETRY: existingConfig.ENABLE_CLIENT_TELEMETRY !== false,
    REQUIRE_GOOGLE_GMAIL_AUTH: true,
    REQUIRE_GMAIL_DOMAIN: existingConfig.REQUIRE_GMAIL_DOMAIN !== false,
    ENABLE_GOOGLE_LOGIN_SCRIPT: existingConfig.ENABLE_GOOGLE_LOGIN_SCRIPT !== false,
    AUTOLOAD_GOOGLE_LOGIN_SCRIPT: existingConfig.AUTOLOAD_GOOGLE_LOGIN_SCRIPT !== false,
    GOOGLE_LOGIN_SCRIPT_URL: window.PLATFORM_AUTH_CONFIG.loginScriptUrl || '',
    GOOGLE_LOGIN_BRAND_NAME: brandName,
    GOOGLE_LOGIN_THEME_COLOR: accentColor,
    GOOGLE_LOGIN_LOGO_URL: existingConfig.GOOGLE_LOGIN_LOGO_URL || '',
    GOOGLE_LOGIN_BACKGROUND_URL: existingConfig.GOOGLE_LOGIN_BACKGROUND_URL || '',
    ENABLE_REMOTE_USER_PREFERENCES: existingConfig.ENABLE_REMOTE_USER_PREFERENCES !== false,
    API_TIMEOUT_MS: existingConfig.API_TIMEOUT_MS || 15000,
    MEDIA_UPLOAD_TIMEOUT_MS: existingConfig.MEDIA_UPLOAD_TIMEOUT_MS || 60000,
    ENABLE_R2X_IMAGE_UPLOADS: existingConfig.ENABLE_R2X_IMAGE_UPLOADS !== false,
    TEMP_IMAGE_R2X_MAX_BYTES: existingConfig.TEMP_IMAGE_R2X_MAX_BYTES || 256000,
    MESSAGE_MEDIA_PREVIEW_MAX_BYTES: existingConfig.MESSAGE_MEDIA_PREVIEW_MAX_BYTES || 1500000,
    PUSH_PUBLIC_KEY: existingConfig.PUSH_PUBLIC_KEY || ''
  };
}());
