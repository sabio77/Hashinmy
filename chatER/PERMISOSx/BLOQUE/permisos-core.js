// BLOQUE principal de PERMISOSx: activación guiada de permisos del navegador para ChatER.
// Contrato interno del bloque: window.PERMISOSxBloque.requestCapability(options)
// La conexión pública con la app se realiza solo desde PERMISOSx/conexion.
(function () {
  'use strict';

  var CAPABILITY_COPY = {
    camera: {
      permissionName: 'camera',
      icon: '📷',
      title: 'Activar cámara',
      description: 'ChatER necesita permiso de cámara para escanear QR, tomar fotos o iniciar videollamadas.',
      actionLabel: 'Activar cámara',
      denied: 'La cámara está bloqueada. Actívala manualmente desde la configuración de permisos del navegador.'
    },
    microphone: {
      permissionName: 'microphone',
      icon: '🎤',
      title: 'Activar micrófono',
      description: 'ChatER necesita permiso de micrófono para notas de voz y llamadas.',
      actionLabel: 'Activar micrófono',
      denied: 'El micrófono está bloqueado. Actívalo manualmente desde la configuración de permisos del navegador.'
    },
    'camera-microphone': {
      permissionName: ['camera', 'microphone'],
      icon: '🎥',
      title: 'Activar cámara y micrófono',
      description: 'ChatER necesita cámara y micrófono para iniciar la videollamada.',
      actionLabel: 'Activar cámara y micrófono',
      denied: 'La cámara o el micrófono están bloqueados. Actívalos manualmente desde la configuración del navegador.'
    },
    notifications: {
      permissionName: 'notifications',
      icon: '🔔',
      title: 'Activar notificaciones',
      description: 'ChatER necesita permiso para avisarte cuando recibas mensajes, llamadas o estados importantes.',
      actionLabel: 'Activar notificaciones',
      denied: 'Las notificaciones están bloqueadas. Actívalas manualmente desde la configuración del navegador.'
    },
    files: {
      permissionName: '',
      icon: '📁',
      title: 'Permiso de archivos',
      description: 'ChatER abrirá el selector del dispositivo para elegir el archivo que quieres compartir.',
      actionLabel: 'Seleccionar archivo',
      denied: 'El selector de archivos no se pudo abrir. Revisa los permisos del navegador o del sistema.'
    }
  };

  var activeOverlay = null;

  function normalizeCapability(capability) {
    var key = String(capability || '').trim().toLowerCase();
    return CAPABILITY_COPY[key] ? key : 'files';
  }

  function closeOverlay() {
    if (activeOverlay && activeOverlay.parentNode) activeOverlay.parentNode.removeChild(activeOverlay);
    activeOverlay = null;
  }

  function escapeHTML(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function getPermissionNames(copy) {
    if (!copy || !copy.permissionName) return [];
    return Array.isArray(copy.permissionName)
      ? copy.permissionName.filter(Boolean)
      : [copy.permissionName].filter(Boolean);
  }

  function mergePermissionStates(details) {
    if (!details || !details.length) return 'unknown';
    var states = details.map(function (item) { return item && item.state ? item.state : 'unknown'; });
    if (states.indexOf('denied') >= 0) return 'denied';
    if (states.every(function (state) { return state === 'granted'; })) return 'granted';
    if (states.indexOf('prompt') >= 0) return 'prompt';
    return 'unknown';
  }

  async function queryCapability(capability) {
    var key = normalizeCapability(capability);
    var copy = CAPABILITY_COPY[key];

    if (key === 'files') return { capability: key, state: 'prompt', supported: true };
    if (key === 'notifications' && typeof Notification !== 'undefined') {
      return { capability: key, state: Notification.permission || 'prompt', supported: true };
    }

    var permissionNames = getPermissionNames(copy);
    if (!navigator.permissions || !permissionNames.length) {
      return { capability: key, state: 'unknown', supported: true, details: permissionNames.map(function (name) { return { name: name, state: 'unknown' }; }) };
    }

    try {
      var details = [];
      for (var index = 0; index < permissionNames.length; index += 1) {
        var permissionName = permissionNames[index];
        try {
          var status = await navigator.permissions.query({ name: permissionName });
          details.push({ name: permissionName, state: status.state || 'unknown' });
        } catch (innerError) {
          details.push({ name: permissionName, state: 'unknown', error: innerError && innerError.message ? innerError.message : '' });
        }
      }
      return { capability: key, state: mergePermissionStates(details), supported: true, details: details };
    } catch (error) {
      return { capability: key, state: 'unknown', supported: true, error: error && error.message ? error.message : '' };
    }
  }

  async function defaultRequest(key) {
    if (key === 'notifications') {
      if (typeof Notification === 'undefined' || typeof Notification.requestPermission !== 'function') {
        throw new Error('Este navegador no permite solicitar notificaciones.');
      }
      return Notification.requestPermission();
    }

    if (key === 'files') return true;

    if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function') {
      throw new Error('Este navegador no permite solicitar permisos multimedia.');
    }

    var constraints = key === 'camera'
      ? { video: true, audio: false }
      : key === 'microphone'
        ? { audio: true }
        : { video: true, audio: true };
    var stream = await navigator.mediaDevices.getUserMedia(constraints);
    stream.getTracks().forEach(function (track) { track.stop(); });
    return true;
  }

  function openSettingsGuide(copy, status) {
    var message = (copy.denied || 'Activa el permiso desde la configuración del navegador.')
      + ' En Android o escritorio toca el candado del sitio, abre Permisos y cambia el permiso a Permitir. Luego vuelve a intentar la acción.';
    if (activeOverlay) {
      var statusNode = activeOverlay.querySelector('[data-permission-status]');
      if (statusNode) statusNode.textContent = message;
    }
    return { ok: false, state: status && status.state ? status.state : 'denied', message: message };
  }

  function requestCapability(options) {
    var opts = options || {};
    var key = normalizeCapability(opts.capability || opts.name || opts.type);
    var copy = Object.assign({}, CAPABILITY_COPY[key], opts);
    var requestFn = typeof opts.request === 'function' ? opts.request : function () { return defaultRequest(key); };

    return new Promise(function (resolve, reject) {
      closeOverlay();

      var overlay = document.createElement('div');
      overlay.className = 'permission-lego-overlay';
      overlay.setAttribute('role', 'dialog');
      overlay.setAttribute('aria-modal', 'true');
      overlay.setAttribute('aria-label', copy.title || 'Permiso requerido');
      overlay.innerHTML = '' +
        '<section class="permission-lego-card">' +
          '<div class="permission-lego-icon" aria-hidden="true">' + escapeHTML(copy.icon || '✓') + '</div>' +
          '<div class="permission-lego-content">' +
            '<h2>' + escapeHTML(copy.title || 'Permiso requerido') + '</h2>' +
            '<p>' + escapeHTML(copy.description || 'Autoriza el permiso para continuar con esta acción.') + '</p>' +
            '<p class="permission-lego-status" data-permission-status role="status" aria-live="polite">Preparando solicitud segura de permiso...</p>' +
            '<div class="permission-lego-actions">' +
              '<button class="primary-button" type="button" data-permission-action="allow">' + escapeHTML(copy.actionLabel || 'Permitir ahora') + '</button>' +
              '<button class="secondary-button" type="button" data-permission-action="settings">Ver instrucciones</button>' +
              '<button class="ghost-button" type="button" data-permission-action="cancel">Cancelar</button>' +
            '</div>' +
          '</div>' +
        '</section>';

      var statusNode = overlay.querySelector('[data-permission-status]');
      var allowButton = overlay.querySelector('[data-permission-action="allow"]');
      var settingsButton = overlay.querySelector('[data-permission-action="settings"]');
      var cancelButton = overlay.querySelector('[data-permission-action="cancel"]');

      document.body.appendChild(overlay);
      activeOverlay = overlay;

      queryCapability(key).then(function (status) {
        if (!activeOverlay || activeOverlay !== overlay) return;
        allowButton.dataset.permissionState = status.state || 'unknown';
        allowButton.textContent = copy.actionLabel || 'Permitir ahora';
        if (status.state === 'denied') {
          statusNode.textContent = copy.denied || 'Este permiso está bloqueado. Actívalo manualmente desde la configuración del navegador.';
          allowButton.textContent = 'Ver instrucciones para activar';
          allowButton.dataset.permissionDenied = 'true';
        } else if (status.state === 'granted') {
          delete allowButton.dataset.permissionDenied;
          statusNode.textContent = 'El permiso está activo. Confirma para continuar con esta acción.';
        } else {
          delete allowButton.dataset.permissionDenied;
          statusNode.textContent = 'Confirma para mostrar la solicitud del navegador o abrir el selector asociado.';
        }
      });

      allowButton.addEventListener('click', async function () {
        if (allowButton.dataset.permissionDenied === 'true') {
          var deniedResult = openSettingsGuide(copy, { state: 'denied' });
          statusNode.textContent = deniedResult.message + ' Cuando lo actives, vuelve y pulsa Continuar para comprobarlo.';
          allowButton.disabled = false;
          allowButton.textContent = 'Continuar después de activar';
          delete allowButton.dataset.permissionDenied;
          allowButton.dataset.permissionManualRecovery = 'true';
          return;
        }

        allowButton.disabled = true;
        if (allowButton.dataset.permissionManualRecovery === 'true') {
          statusNode.textContent = 'Comprobando permiso activado...';
        } else {
          statusNode.textContent = 'Solicitando permiso...';
        }
        try {
          var result = await requestFn();
          closeOverlay();
          resolve(result);
        } catch (error) {
          allowButton.disabled = false;
          var message = error && error.message ? error.message : (copy.denied || 'No se pudo activar el permiso.');
          statusNode.textContent = message;
          if (/denied|bloque|block|notallowed/i.test(message)) {
            allowButton.dataset.permissionDenied = 'true';
            delete allowButton.dataset.permissionManualRecovery;
            allowButton.textContent = 'Ver instrucciones para activar';
            openSettingsGuide(copy, { state: 'denied' });
            return;
          }
          reject(error || new Error(message));
        }
      }, { once: false });

      settingsButton.addEventListener('click', function () {
        openSettingsGuide(copy, { state: 'denied' });
      });

      cancelButton.addEventListener('click', function () {
        closeOverlay();
        reject(new Error('Permiso cancelado por el usuario.'));
      }, { once: true });
    });
  }

  window.PERMISOSxBloque = {
    version: '1.3.0',
    requestCapability: requestCapability,
    queryCapability: queryCapability,
    openSettingsGuide: openSettingsGuide
  };
}());
