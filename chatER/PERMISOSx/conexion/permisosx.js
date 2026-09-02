// Conexión mínima de PERMISOSx con ChatER.
// Este archivo es el único puente entre la app y el BLOQUE pesado.
(function () {
  'use strict';

  var block = window.PERMISOSxBloque;
  if (!block || typeof block.requestCapability !== 'function') {
    console.warn('PERMISOSx no se pudo conectar porque falta el BLOQUE de permisos.');
    return;
  }

  window.ChatERPermisosLego = {
    version: String(block.version || '1.0.0') + '-root-lego',
    legoName: 'PERMISOSx',
    requestCapability: function requestCapability(options) {
      return block.requestCapability(options);
    },
    queryCapability: function queryCapability(capability) {
      return block.queryCapability(capability);
    },
    openSettingsGuide: function openSettingsGuide(copy, status) {
      return block.openSettingsGuide(copy, status);
    }
  };
}());
