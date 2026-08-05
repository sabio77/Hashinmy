(function createPWAInstallPrompt(root) {
  'use strict';

  var dialog = document.getElementById('pwa-install-dialog');
  var closeButton = document.getElementById('pwa-install-close');
  var installButton = document.getElementById('pwa-install-button');
  var statusNode = document.getElementById('pwa-install-status');

  if (!dialog || !closeButton || !installButton || !statusNode) return;

  var displayModeQuery = typeof root.matchMedia === 'function'
    ? root.matchMedia('(display-mode: standalone)')
    : null;

  var state = {
    deferredPrompt: null,
    installed: isInstalled(),
    prompting: false,
    dismissedForSession: false,
    statusKey: '',
    statusFallback: ''
  };

  function translate(key, fallback) {
    if (root.AppI18n && typeof root.AppI18n.t === 'function') {
      return root.AppI18n.t(key, fallback);
    }
    return fallback;
  }

  function isInstalled() {
    var standaloneDisplay = false;
    try {
      standaloneDisplay = Boolean(displayModeQuery && displayModeQuery.matches);
    } catch (error) {}

    var iosStandalone = Boolean(root.navigator && root.navigator.standalone === true);
    var trustedWebActivity = typeof document.referrer === 'string'
      && document.referrer.indexOf('android-app://') === 0;

    return standaloneDisplay || iosStandalone || trustedWebActivity;
  }

  function setStatus(key, fallback, stateName) {
    state.statusKey = key || '';
    state.statusFallback = fallback || '';
    statusNode.textContent = key ? translate(key, fallback) : '';
    statusNode.dataset.state = stateName || '';
    statusNode.hidden = !statusNode.textContent;
  }

  function refreshStatusLanguage() {
    if (!state.statusKey) return;
    statusNode.textContent = translate(state.statusKey, state.statusFallback);
  }

  function openDialog() {
    state.installed = isInstalled();
    if (state.installed || dialog.open) return false;

    dialog.hidden = false;
    try {
      if (typeof dialog.showModal === 'function') dialog.showModal();
      else dialog.setAttribute('open', '');
    } catch (error) {
      dialog.setAttribute('open', '');
    }

    return true;
  }

  function openDialogAutomatically() {
    if (state.dismissedForSession) return false;
    return openDialog();
  }

  function closeDialog() {
    if (typeof dialog.close === 'function' && dialog.open) {
      dialog.close();
    } else {
      dialog.removeAttribute('open');
    }
  }

  function dismissDialog() {
    state.dismissedForSession = true;
    state.statusKey = '';
    state.statusFallback = '';
    closeDialog();
  }

  function manualInstallMessageKey() {
    var userAgent = String(root.navigator && root.navigator.userAgent || '');
    var isAppleMobile = /iphone|ipad|ipod/i.test(userAgent);
    var isSafari = /safari/i.test(userAgent) && !/crios|fxios|edgios|opios/i.test(userAgent);
    return isAppleMobile && isSafari
      ? {
          key: 'pwa.installManualIos',
          fallback: 'En Safari, abre Compartir y elige “Agregar a pantalla de inicio”.'
        }
      : {
          key: 'pwa.installManualGeneric',
          fallback: 'Abre el menú del navegador y selecciona “Instalar aplicación” o “Agregar a pantalla de inicio”.'
        };
  }

  async function requestInstallation() {
    if (state.prompting) return;

    state.installed = isInstalled();
    if (state.installed) {
      closeDialog();
      return;
    }

    var promptEvent = state.deferredPrompt;
    if (!promptEvent || typeof promptEvent.prompt !== 'function') {
      var manual = manualInstallMessageKey();
      setStatus(manual.key, manual.fallback, 'info');
      return;
    }

    state.prompting = true;
    installButton.disabled = true;
    setStatus('', '', '');

    try {
      await promptEvent.prompt();
      var choice = await promptEvent.userChoice;
      state.deferredPrompt = null;

      if (choice && choice.outcome === 'accepted') {
        state.installed = true;
        setStatus('pwa.installAccepted', 'Instalación iniciada correctamente.', 'success');
        closeDialog();
      } else {
        setStatus('pwa.installDismissed', 'La instalación se canceló. Puedes intentarlo nuevamente al volver a abrir la app.', 'info');
      }
    } catch (error) {
      state.deferredPrompt = null;
      setStatus('pwa.installError', 'No fue posible abrir el instalador. Usa la opción de instalación del menú del navegador.', 'error');
    } finally {
      state.prompting = false;
      installButton.disabled = false;
    }
  }

  function handleBeforeInstallPrompt(event) {
    if (isInstalled()) return;
    if (event && typeof event.preventDefault === 'function') event.preventDefault();
    state.deferredPrompt = event || null;
    installButton.disabled = false;
    setStatus('', '', '');
    openDialogAutomatically();
  }

  function handleInstalled() {
    state.deferredPrompt = null;
    state.installed = true;
    closeDialog();
  }

  function handleDisplayModeChange(event) {
    if (event && event.matches) handleInstalled();
  }

  closeButton.addEventListener('click', dismissDialog);
  installButton.addEventListener('click', requestInstallation);
  dialog.addEventListener('cancel', function allowExplicitDismissal(event) {
    if (event && typeof event.preventDefault === 'function') event.preventDefault();
    dismissDialog();
  });
  root.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
  root.addEventListener('appinstalled', handleInstalled);
  document.addEventListener('app-language-ready', function refreshPresentationLanguage() {
    // i18n.js ya aplicó los textos del documento antes de emitir este evento.
    // Aquí solo se retraduce el mensaje dinámico para evitar redisparar el ciclo global.
    refreshStatusLanguage();
  });

  if (displayModeQuery) {
    if (typeof displayModeQuery.addEventListener === 'function') {
      displayModeQuery.addEventListener('change', handleDisplayModeChange);
    } else if (typeof displayModeQuery.addListener === 'function') {
      displayModeQuery.addListener(handleDisplayModeChange);
    }
  }

  function start() {
    if (!state.installed) openDialogAutomatically();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }

  root.PWAInstallPrompt = Object.freeze({
    open: openDialog,
    close: closeDialog,
    requestInstallation: requestInstallation,
    get installed() {
      return state.installed || isInstalled();
    },
    get hasNativePrompt() {
      return Boolean(state.deferredPrompt);
    }
  });
})(window);
