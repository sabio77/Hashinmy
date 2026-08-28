(function exposeAppMetadata(root) {
  'use strict';

  function normalizeApplicationId(value) {
    var raw = String(value || '').trim();
    if (!raw || raw === '/' || raw === '.' || raw.toLowerCase() === 'root') return 'root';
    try { raw = decodeURIComponent(raw); } catch (error) {}
    var pathOnly = raw.split(/[?#]/, 1)[0].replace(/^\/+|\/+$/g, '');
    if (!pathOnly) return 'root';
    if (pathOnly.length > 180) return '';
    var segments = pathOnly.split('/');
    if (segments.length > 8) return '';
    for (var index = 0; index < segments.length; index += 1) {
      if (!/^[a-z0-9](?:[a-z0-9._-]{0,62}[a-z0-9])?$/i.test(segments[index])) return '';
    }
    return segments.join('/');
  }

  function resolveApplicationBaseUrl() {
    try {
      if (root.registration && root.registration.scope) return new URL(root.registration.scope).toString();
      if (typeof document !== 'undefined') {
        var scriptUrl = document.currentScript && document.currentScript.src;
        if (scriptUrl) return new URL('../../', scriptUrl).toString();
        if (document.baseURI) return new URL('./', document.baseURI).toString();
      }
      if (root.location && root.location.href) return new URL('./', root.location.href).toString();
    } catch (error) {}
    return '/';
  }

  var applicationBaseUrl = resolveApplicationBaseUrl();
  var applicationPath = '/';
  try { applicationPath = new URL(applicationBaseUrl, root.location && root.location.href || undefined).pathname; } catch (error) {}
  var applicationId = normalizeApplicationId(applicationPath) || 'root';
  var applicationStorageScope = applicationId.replace(/\//g, '~');

  var metadata = Object.freeze({
    appName: 'Semilla App Web',
    version: '1.9.110',
    build: '2026-08-28-181',
    releasedAt: '2026-08-28T18:10:00-05:00',
    applicationId: applicationId,
    applicationPath: applicationId === 'root' ? '/' : '/' + applicationId + '/',
    applicationBaseUrl: applicationBaseUrl,
    applicationStorageScope: applicationStorageScope,
    cacheNamespace: applicationId === 'root' ? 'semilla-appweb-pwa' : 'semilla-appweb-pwa:' + applicationStorageScope,
    updateChannel: 'stable',
    environment: 'production',

    // Lista mínima del shell instalable. Puedes agregar más archivos de tu app real.
    // Los íconos pueden no existir al crear la semilla; por eso se manejan como assets opcionales.
    precacheUrls: [
      './',
      './index.html',
      './offline.html',
      './manifest.webmanifest',
      './src/css/app.css',
      './src/js/app-metadata.js',
      './src/js/runtime-config.js',
      './src/js/config.js',
      './src/js/application-scope.js',
      './src/js/api.js',
      './src/js/firebase-auth.js',
      './src/js/p2p-storage.js',
      './src/js/p2p-durability.js',
      './src/js/p2p-crypto.js',
      './src/js/p2p-tab-coordinator.js',
      './src/js/p2p-client.js',
      './src/js/p2p-permissions.js',
      './src/js/p2p-space-creation-intent.js',
      './src/js/p2p-invitation-intent.js',
      './src/js/p2p-invitation-audit.js',
      './src/js/project-domain.js',
      './src/js/device-management.js',
      './src/js/skeleton-screen.js',
      './src/js/i18n.js',
      './src/js/asset-loader.js',
      './src/js/pwa-update-manager.js',
      './src/js/app.js',
      './textX/languages.json',
      './textX/app/es.json',
      './textX/seo/es.json',
      './textX/app/ar.json',
      './textX/seo/ar.json',
      './textX/app/en.json',
      './textX/seo/en.json',
      './P2P_sin_RED_LOCALx/P2P_sin_transport.js',
      './assets/ui/ui_logo_principal_96x96.png'
    ],

    // Rutas típicas de APIs reales: no se cachean para evitar datos obsoletos.
    networkOnlyPathPrefixes: [
      '/api/',
      '/auth/',
      '/admin/api/',
      '/graphql',
      '/webhooks/'
    ],

    // Una app ubicada en la raíz comparte el alcance técnico `/` con cualquier
    // app hermana instalada en carpetas. Estas listas declaran qué rutas puede
    // interceptar el worker raíz; los workers de carpeta se limitan por su scope.
    rootNavigationPaths: [
      '/',
      '/index.html',
      '/offline.html'
    ],
    rootOwnedPathPrefixes: [
      '/assets/',
      '/src/',
      '/textX/',
      '/.well-known/'
    ],

    runtimeCacheMaxEntries: 180,
    navigationNetworkTimeoutMs: 4500,
    resourceNetworkTimeoutMs: 7000
  });

  root.APP_SEED_METADATA = metadata;
})(typeof self !== 'undefined' ? self : window);
