window.APP_SEED_CONFIG = Object.freeze({
  appName: 'Semilla App Web',
  backendUrl: String(window.APP_RUNTIME_CONFIG?.backendUrl || '').trim(),
  versionEndpoint: './version.json',
  serviceWorkerPath: './sw.js',

  // Superpoder opcional. Si el bloque P2P_sin_ no existe, la carga dinámica falla
  // de forma controlada y toda la aplicación continúa usando memoriaBACKEND.
  sinBACKEND: window.APP_RUNTIME_CONFIG?.sinBACKEND === true,

  // Sin polling: las verificaciones ocurren por eventos reales de ciclo de vida
  // (inicio, foco, visibilidad, reconexión, pageshow, updatefound y controllerchange).
  periodicUpdateChecksEnabled: false,
  updateCheckIntervalMs: 0,
  updateCheckOnFocus: true,
  updateCheckOnOnline: true,
  updateCheckOnPageShow: true,

  // Evita que varias pestañas instaladas hagan la misma consulta al servidor.
  // No usa heartbeat por intervalo; el bloqueo es transitorio y se libera al terminar cada revisión.
  multiTabCoordinationEnabled: true,
  leaderLockTtlMs: 45000,
  broadcastChannelName: String(window.APP_SEED_METADATA?.cacheNamespace || 'semilla-appweb-pwa') + ':updates',

  // Modo recomendado para esta semilla: aplica cambios sin pedir interacción.
  autoReloadWhenVersionChanges: true,
  autoReloadDelayMs: 700,
  minimumSecondsBetweenAutoReloads: 10,
  showUpdateStatus: true,

  // Escala: el manifiesto público trae huellas ya calculadas. El cliente no descarga
  // todos los archivos críticos en cada revisión.
  releaseManifestAssetsEnabled: true,

  // Cuando version.json declara una lista nueva de criticalAssets, el cliente pide al
  // Service Worker que los precargue por evento real. Esto cubre idiomas nuevos, logo
  // nuevo e íconos nuevos sin polling y sin backend.
  prefetchReleaseAssetsOnCheck: true,
  prefetchReleaseAssetsMax: 120,

  // Respaldo opcional contra error humano. No ejecuta polling: solo puede correr
  // cuando ocurre una revisión por evento y respeta una ventana mínima entre corridas.
  directFingerprintFallbackEnabled: true,
  directFingerprintFallbackIntervalMs: 300000,
  directFingerprintCheckFiles: [
      './index.html',
      './manifest.webmanifest',
      './textX/languages.json',
      './textX/app/es.json',
      './textX/seo/es.json',
      './textX/app/ar.json',
      './textX/seo/ar.json',
      './textX/app/en.json',
      './textX/seo/en.json',
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
      './src/js/project-domain.js',
      './src/js/device-management.js',
      './src/js/i18n.js',
      './src/js/asset-loader.js',
      './src/js/pwa-update-manager.js',
      './src/js/app.js',
      './P2P_sin_RED_LOCALx/P2P_sin_transport.js',
      './assets/icons/logo.png',
      './assets/icons/icon-192.png',
      './assets/icons/icon-512.png',
      './assets/icons/maskable-192.png',
      './assets/icons/maskable-512.png',
      './assets/icons/logo.png.txt',
      './assets/icons/icon-192.png.txt',
      './assets/icons/icon-512.png.txt',
      './assets/icons/maskable-192.png.txt',
      './assets/icons/maskable-512.png.txt'
    ],

  // Compatibilidad con la versión anterior del manager.
  fingerprintCheckEnabled: true,
  fingerprintCheckFiles: [
      './index.html',
      './manifest.webmanifest',
      './textX/languages.json',
      './textX/app/es.json',
      './textX/seo/es.json',
      './textX/app/ar.json',
      './textX/seo/ar.json',
      './textX/app/en.json',
      './textX/seo/en.json',
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
      './src/js/project-domain.js',
      './src/js/device-management.js',
      './src/js/i18n.js',
      './src/js/asset-loader.js',
      './src/js/pwa-update-manager.js',
      './src/js/app.js',
      './P2P_sin_RED_LOCALx/P2P_sin_transport.js',
      './assets/icons/logo.png',
      './assets/icons/icon-192.png',
      './assets/icons/icon-512.png',
      './assets/icons/maskable-192.png',
      './assets/icons/maskable-512.png',
      './assets/icons/logo.png.txt',
      './assets/icons/icon-192.png.txt',
      './assets/icons/icon-512.png.txt',
      './assets/icons/maskable-192.png.txt',
      './assets/icons/maskable-512.png.txt'
    ],

  // Rutas que normalmente no deben cachearse cuando conectes APIs reales.
  networkOnlyPathPrefixes: (window.APP_SEED_METADATA && window.APP_SEED_METADATA.networkOnlyPathPrefixes) || [
    '/api/',
    '/auth/',
    '/admin/api/',
    '/graphql',
    '/webhooks/'
  ]
});
