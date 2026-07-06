// Configuración runtime de ChatER para despliegues static site.
// Los valores críticos de memoriaBACKEND se cargan exclusivamente desde
// js/CONFIGmemoriaBACKEND.json para poder cambiarlos sin modificar código.
(function () {
  'use strict';

  var CONFIG_JSON_PATH = 'js/CONFIGmemoriaBACKEND.json';
  var CONFIG_FETCH_TIMEOUT_MS = 8000;
  var RUNTIME_SCRIPTS = [
    'auth-gate.js',
    'IMAGENwebpCOMPRESIONx/BLOQUE/compresor-webp-core.js',
    'IMAGENwebpCOMPRESIONx/conexion/imagen-webp-compresionx.js',
    'QRcodigosX/BLOQUE/qr-core.js',
    'QRcodigosX/conexion/qr-codigosx.js',
    'PERMISOSx/BLOQUE/permisos-core.js',
    'PERMISOSx/conexion/permisosx.js',
    'js/app.js',
    'js/pwa.js'
  ];

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

  function setText(node, value) {
    if (node) node.textContent = String(value || '');
  }

  function showBootstrapError(message) {
    var safeMessage = String(message || 'No se pudo preparar ChatER.').slice(0, 400);
    window.CHATER_BOOTSTRAP_ERROR = Object.freeze({
      ok: 0,
      err: 'CHATER_CONFIG_BOOTSTRAP_ERROR',
      message: safeMessage,
      createdAt: new Date().toISOString()
    });

    var render = function () {
      var shell = document.querySelector('.app-shell') || document.body;
      if (!shell) return;
      var card = document.createElement('section');
      card.setAttribute('role', 'alert');
      card.setAttribute('aria-live', 'assertive');
      card.style.cssText = 'max-width:680px;margin:48px auto;padding:24px;border-radius:24px;background:#ffffff;color:#111827;border:1px solid #d1d5db;box-shadow:0 24px 70px rgba(15,23,42,.16);font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;line-height:1.5;';

      var title = document.createElement('h1');
      title.style.cssText = 'margin:0 0 10px;font-size:24px;';
      setText(title, 'ChatER no pudo iniciar');

      var copy = document.createElement('p');
      copy.style.cssText = 'margin:0;color:#4b5563;';
      setText(copy, safeMessage);

      card.appendChild(title);
      card.appendChild(copy);
      shell.innerHTML = '';
      shell.appendChild(card);
    };

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', render, { once: true });
    } else {
      render();
    }
  }

  async function loadMemoriaBackendRuntimeConfig() {
    if (typeof window.fetch !== 'function') {
      throw new Error('El navegador no permite cargar la configuración runtime con fetch.');
    }

    var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timeoutId = controller ? window.setTimeout(function () {
      controller.abort();
    }, CONFIG_FETCH_TIMEOUT_MS) : 0;

    try {
      var response = await window.fetch(CONFIG_JSON_PATH + '?v=' + encodeURIComponent(Date.now()), {
        cache: 'no-store',
        credentials: 'same-origin',
        headers: { Accept: 'application/json' },
        signal: controller ? controller.signal : undefined
      });

      if (!response || !response.ok) {
        throw new Error('CONFIGmemoriaBACKEND.json respondió con estado HTTP ' + (response ? response.status : 'desconocido') + '.');
      }

      var parsed = await response.json();
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('CONFIGmemoriaBACKEND.json no contiene un objeto JSON válido.');
      }
      return parsed;
    } finally {
      if (timeoutId) window.clearTimeout(timeoutId);
    }
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
      return '';
    }
  }

  function publishRuntimeConfig(jsonConfig) {
    var existingConfig = window.CHATER_CONFIG && typeof window.CHATER_CONFIG === 'object' ? window.CHATER_CONFIG : {};
    var existingPlatformConfig = window.PLATFORM_AUTH_CONFIG && typeof window.PLATFORM_AUTH_CONFIG === 'object' ? window.PLATFORM_AUTH_CONFIG : {};
    var projectOrigin = normalizeOrigin(readFirst(jsonConfig, ['ORIGEN_PROYECTO', 'ORIGEN', 'PROJECT_ORIGIN', 'origin']));
    var backendUrl = normalizeOrigin(readFirst(jsonConfig, ['MEMORIA_BACKEND_URL', 'DOMINIO_MEMORIABACKEND', 'DOMINIOmemoriaBACKEND', 'backendUrl']));
    var siteId = readFirst(jsonConfig, ['MEMORIA_SITE_ID', 'SITE_ID', 'siteId']);
    var brandName = existingPlatformConfig.brandName || existingConfig.GOOGLE_LOGIN_BRAND_NAME || 'ChatER';
    var accentColor = existingPlatformConfig.accentColor || existingConfig.GOOGLE_LOGIN_THEME_COLOR || '#25d366';
    var loginScriptUrl = buildMemoriaLoginScriptUrl({
      backendUrl: backendUrl,
      siteId: siteId,
      brandName: brandName,
      accentColor: accentColor
    });

    if (!projectOrigin || !backendUrl || !siteId || !loginScriptUrl) {
      throw new Error('CONFIGmemoriaBACKEND.json debe definir ORIGEN_PROYECTO, MEMORIA_BACKEND_URL y MEMORIA_SITE_ID válidos.');
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
      loginScriptUrl: loginScriptUrl,
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
      GOOGLE_LOGIN_SCRIPT_URL: loginScriptUrl,
      GOOGLE_LOGIN_BRAND_NAME: brandName,
      GOOGLE_LOGIN_THEME_COLOR: accentColor,
      GOOGLE_LOGIN_LOGO_URL: existingConfig.GOOGLE_LOGIN_LOGO_URL || '',
      GOOGLE_LOGIN_BACKGROUND_URL: existingConfig.GOOGLE_LOGIN_BACKGROUND_URL || '',
      ENABLE_REMOTE_USER_PREFERENCES: existingConfig.ENABLE_REMOTE_USER_PREFERENCES !== false,
      ENABLE_LOCAL_DEMO_SEED: existingConfig.ENABLE_LOCAL_DEMO_SEED === true,
      API_TIMEOUT_MS: existingConfig.API_TIMEOUT_MS || 15000,
      MEDIA_UPLOAD_TIMEOUT_MS: existingConfig.MEDIA_UPLOAD_TIMEOUT_MS || 60000,
      ENABLE_R2X_IMAGE_UPLOADS: existingConfig.ENABLE_R2X_IMAGE_UPLOADS !== false,
      TEMP_IMAGE_R2X_MAX_BYTES: existingConfig.TEMP_IMAGE_R2X_MAX_BYTES || 204800,
      MESSAGE_MEDIA_PREVIEW_MAX_BYTES: existingConfig.MESSAGE_MEDIA_PREVIEW_MAX_BYTES || 1500000,
      PUSH_PUBLIC_KEY: existingConfig.PUSH_PUBLIC_KEY || ''
    };

    return window.CHATER_CONFIG;
  }

  function loadRuntimeScript(src) {
    return new Promise(function (resolve, reject) {
      var normalizedSrc = String(src || '').trim();
      if (!normalizedSrc) return resolve();
      var existing = document.querySelector('script[data-chater-runtime-src="' + normalizedSrc + '"],script[src="' + normalizedSrc + '"]');
      if (existing && existing.dataset.chaterRuntimeLoaded === '1') return resolve();
      if (existing && existing !== document.currentScript) {
        existing.addEventListener('load', resolve, { once: true });
        existing.addEventListener('error', function () { reject(new Error('No se pudo cargar ' + normalizedSrc + '.')); }, { once: true });
        return;
      }

      var script = document.createElement('script');
      script.src = normalizedSrc;
      script.async = false;
      script.defer = false;
      script.dataset.chaterRuntimeSrc = normalizedSrc;
      script.onload = function () {
        script.dataset.chaterRuntimeLoaded = '1';
        resolve();
      };
      script.onerror = function () {
        reject(new Error('No se pudo cargar ' + normalizedSrc + '.'));
      };
      (document.body || document.head || document.documentElement).appendChild(script);
    });
  }

  async function loadChatERRuntimeScripts() {
    for (var index = 0; index < RUNTIME_SCRIPTS.length; index += 1) {
      await loadRuntimeScript(RUNTIME_SCRIPTS[index]);
    }
  }

  window.CHATER_CONFIG_READY = (async function bootstrapChatERConfig() {
    try {
      var jsonConfig = await loadMemoriaBackendRuntimeConfig();
      var runtimeConfig = publishRuntimeConfig(jsonConfig);
      await loadChatERRuntimeScripts();
      return runtimeConfig;
    } catch (error) {
      showBootstrapError(error && error.message ? error.message : 'No se pudo cargar la configuración de memoriaBACKEND.');
      return window.CHATER_BOOTSTRAP_ERROR || { ok: 0, err: 'CHATER_CONFIG_BOOTSTRAP_ERROR' };
    }
  }());
}());
