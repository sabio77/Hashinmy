// Conexión mínima de IMAGENwebpCOMPRESIONx con ChatER.
// Este archivo es el único puente entre la app y el BLOQUE pesado.
(function () {
  'use strict';

  var block = window.IMAGENwebpCOMPRESIONxBloque;
  if (!block || typeof block.compress !== 'function') {
    console.warn('IMAGENwebpCOMPRESIONx no se pudo conectar porque falta el BLOQUE de compresión.');
    return;
  }

  window.ChatERImageWebpCompressorLego = {
    version: String(block.version || '1.26.0') + '-root-lego',
    legoName: 'IMAGENwebpCOMPRESIONx',
    hardMaxBytes: block.hardMaxBytes,
    errorCodes: block.errorCodes,
    compress: function compress(file, options) {
      return block.compress(file, options);
    },
    isVerifiedWebpBlob: function isVerifiedWebpBlob(blob) {
      return block.isVerifiedWebpBlob(blob);
    },
    assertReadyForUpload: function assertReadyForUpload(blob, maxBytes) {
      return block.assertReadyForUpload(blob, maxBytes);
    },
    createCompressionGuarantee: function createCompressionGuarantee(blob, maxBytes, metadata) {
      return typeof block.createCompressionGuarantee === 'function'
        ? block.createCompressionGuarantee(blob, maxBytes, metadata)
        : block.assertReadyForUpload(blob, maxBytes);
    },
    reusePreparedWebp: function reusePreparedWebp(file, sourceCompression, options) {
      return typeof block.reusePreparedWebp === 'function'
        ? block.reusePreparedWebp(file, sourceCompression, options)
        : block.compress(file, options);
    },
    clampMaxBytes: function clampMaxBytes(value) {
      return block.clampMaxBytes(value);
    },
    clampMaxDimension: function clampMaxDimension(value) {
      return typeof block.clampMaxDimension === 'function'
        ? block.clampMaxDimension(value)
        : Math.max(64, Math.min(4096, Math.round(Number(value) || 1600)));
    },
    buildWebpFilename: function buildWebpFilename(filename) {
      return block.buildWebpFilename(filename);
    }
  };
}());
