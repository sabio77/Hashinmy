// Conexión mínima de QRcodigosX con ChatER.
// Este archivo es el único puente entre la app y el BLOQUE pesado.
(function () {
  'use strict';

  var block = window.QRcodigosXBloque;
  if (!block || typeof block.renderProfileQr !== 'function') {
    console.warn('QRcodigosX no se pudo conectar porque falta el BLOQUE de QR.');
    return;
  }

  window.ChatERQRCodeLego = {
    version: String(block.version || '1.1.0') + '-root-lego',
    legoName: 'QRcodigosX',
    maxPayloadBytes: block.maxPayloadBytes,
    buildProfilePayload: function buildProfilePayload(profile) {
      return block.buildProfilePayload(profile);
    },
    parsePayload: function parsePayload(rawPayload) {
      return block.parsePayload(rawPayload);
    },
    generateMatrix: function generateMatrix(payload) {
      return block.generateMatrix(payload);
    },
    matrixToSvg: function matrixToSvg(matrix, options) {
      return block.matrixToSvg(matrix, options);
    },
    renderProfileQr: function renderProfileQr(container, profile, options) {
      return block.renderProfileQr(container, profile, options);
    },
    scanFromImage: function scanFromImage(imageSource, options) {
      return block.scanFromImage(imageSource, options);
    },
    scanFromVideo: function scanFromVideo(video, onDetected, options) {
      return block.scanFromVideo(video, onDetected, options);
    }
  };
}());
