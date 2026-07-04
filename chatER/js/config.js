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

  function loadMemoriaBackendRuntimeConfig() {
    try {
      var request = new XMLHttpRequest();
      request.open('GET', CONFIG_JSON_PATH + '?v=' + Date.now(), false);
      request.overrideMimeType && request.overrideMimeType('application/json');
      request.send(null);

      if (request.status >= 200 && request.status < 300 && request.responseText) {
        return JSON.parse(request.responseText);
      }

      console.error('No se pudo cargar CONFIGmemoriaBACKEND.json. Estado HTTP:', request.status);
    } catch (error) {
      console.error('No se pudo leer CONFIGmemoriaBACKEND.json.', error);
    }

    return {};
  }

  var jsonConfig = loadMemoriaBackendRuntimeConfig();
  var existingConfig = window.CHATER_CONFIG && typeof window.CHATER_CONFIG === 'object' ? window.CHATER_CONFIG : {};
  var projectOrigin = readFirst(jsonConfig, ['ORIGEN_PROYECTO', 'ORIGEN', 'PROJECT_ORIGIN', 'origin']);
  var backendUrl = readFirst(jsonConfig, ['MEMORIA_BACKEND_URL', 'DOMINIO_MEMORIABACKEND', 'DOMINIOmemoriaBACKEND', 'backendUrl']);
  var siteId = readFirst(jsonConfig, ['MEMORIA_SITE_ID', 'SITE_ID', 'siteId']);

  if (!projectOrigin || !backendUrl || !siteId) {
    console.error('CONFIGmemoriaBACKEND.json debe definir ORIGEN_PROYECTO, MEMORIA_BACKEND_URL y MEMORIA_SITE_ID.');
  }

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
    REQUIRE_GOOGLE_GMAIL_AUTH: existingConfig.REQUIRE_GOOGLE_GMAIL_AUTH !== false,
    REQUIRE_GMAIL_DOMAIN: existingConfig.REQUIRE_GMAIL_DOMAIN !== false,
    ENABLE_GOOGLE_LOGIN_SCRIPT: existingConfig.ENABLE_GOOGLE_LOGIN_SCRIPT !== false,
    AUTOLOAD_GOOGLE_LOGIN_SCRIPT: existingConfig.AUTOLOAD_GOOGLE_LOGIN_SCRIPT !== false,
    GOOGLE_LOGIN_SCRIPT_URL: '',
    GOOGLE_LOGIN_BRAND_NAME: existingConfig.GOOGLE_LOGIN_BRAND_NAME || 'ChatER',
    GOOGLE_LOGIN_THEME_COLOR: existingConfig.GOOGLE_LOGIN_THEME_COLOR || '#25d366',
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
