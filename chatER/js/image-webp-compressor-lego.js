// Bloque tipo lego: compresión progresiva de imágenes a WebP para adjuntos ChatER.
// Contrato público del bloque: window.ChatERImageWebpCompressorLego.compress(file, options)
(function () {
  'use strict';

  var HARD_MAX_BYTES = 200 * 1024;
  var DEFAULT_MAX_DIMENSION = 1600;
  var MIN_DIMENSION = 64;
  var EMERGENCY_MIN_DIMENSION = 32;
  var MIN_QUALITY = 0.42;
  var EMERGENCY_MIN_QUALITY = 0.32;
  var MAX_QUALITY = 0.92;
  var TARGET_HEADROOM_BYTES = 1024;
  var PROGRESS_START = 2;
  var PROGRESS_DONE = 100;
  var ERROR_CODES = {
    ABORTED: 'IMAGE_COMPRESSION_ABORTED',
    INVALID_INPUT: 'IMAGE_COMPRESSION_INVALID_INPUT',
    SOURCE_UNREADABLE: 'IMAGE_COMPRESSION_SOURCE_UNREADABLE',
    OUTPUT_INVALID: 'IMAGE_COMPRESSION_OUTPUT_INVALID',
    LIMIT_UNMET: 'IMAGE_COMPRESSION_LIMIT_UNMET'
  };

  function createCompressionError(message, code, diagnostics) {
    var error = new Error(message);
    error.code = code || ERROR_CODES.OUTPUT_INVALID;
    if (diagnostics) error.diagnostics = diagnostics;
    return error;
  }

  function reportProgress(options, progress, stage, diagnostics) {
    if (!options || typeof options.onProgress !== 'function') return;
    try {
      var normalized = Math.max(0, Math.min(PROGRESS_DONE, Math.round(Number(progress || 0))));
      options.onProgress(normalized, stage || 'compressing', diagnostics || null);
    } catch (error) {
      // El bloque no debe fallar la compresión si el consumidor de progreso tiene un error visual.
    }
  }

  function assertNotAborted(options) {
    if (options && options.signal && options.signal.aborted) {
      throw createCompressionError('La compresión de imagen fue cancelada.', ERROR_CODES.ABORTED);
    }
  }

  function yieldToBrowser() {
    return new Promise(function (resolve) {
      if (typeof requestIdleCallback === 'function') {
        requestIdleCallback(function () { resolve(); }, { timeout: 60 });
        return;
      }
      setTimeout(resolve, 0);
    });
  }

  function toPositiveNumber(value, fallback) {
    var parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : fallback;
  }

  function clampMaxBytes(value) {
    return Math.max(1, Math.min(HARD_MAX_BYTES, toPositiveNumber(value, HARD_MAX_BYTES)));
  }

  function buildWebpFilename(fileName) {
    var cleanName = String(fileName || 'imagen')
      .split(/[\\/]/).pop()
      .replace(/\.[^.]+$/, '')
      .replace(/[^a-z0-9._-]+/gi, '-')
      .replace(/^-+|-+$/g, '');
    return (cleanName || 'imagen') + '.webp';
  }

  function readBlobHeaderBytes(blob, length) {
    return new Promise(function (resolve, reject) {
      var slice = blob && blob.slice ? blob.slice(0, length) : null;
      if (!slice) {
        reject(createCompressionError('No se pudo verificar la firma binaria WebP.', ERROR_CODES.OUTPUT_INVALID));
        return;
      }

      if (slice.arrayBuffer) {
        slice.arrayBuffer()
          .then(function (buffer) { resolve(new Uint8Array(buffer)); })
          .catch(reject);
        return;
      }

      if (typeof FileReader === 'function') {
        var reader = new FileReader();
        reader.onload = function () { resolve(new Uint8Array(reader.result)); };
        reader.onerror = function () { reject(reader.error || createCompressionError('No se pudo leer la firma binaria WebP.', ERROR_CODES.OUTPUT_INVALID)); };
        reader.readAsArrayBuffer(slice);
        return;
      }

      reject(createCompressionError('Este navegador no permite verificar la firma binaria WebP.', ERROR_CODES.OUTPUT_INVALID));
    });
  }

  async function isVerifiedWebpBlob(blob) {
    if (!blob || typeof blob.size !== 'number' || blob.size < 12) return false;
    var bytes = await readBlobHeaderBytes(blob, 12);
    function textAt(start, end) {
      var value = '';
      for (var i = start; i < end; i += 1) value += String.fromCharCode(bytes[i] || 0);
      return value;
    }
    return textAt(0, 4) === 'RIFF' && textAt(8, 12) === 'WEBP';
  }

  async function assertVerifiedWebpBlob(blob) {
    if (blob.type && !/^image\/webp$/i.test(blob.type)) {
      throw createCompressionError('El navegador no entregó una salida WebP válida.', ERROR_CODES.OUTPUT_INVALID);
    }
    if (!(await isVerifiedWebpBlob(blob))) {
      throw createCompressionError('La salida no tiene firma binaria WebP real; no se enviará una imagen mal etiquetada.', ERROR_CODES.OUTPUT_INVALID);
    }
  }

  function canvasToWebpBlob(canvas, quality) {
    return new Promise(function (resolve, reject) {
      canvas.toBlob(async function (blob) {
        if (!blob) {
          reject(createCompressionError('No se pudo comprimir la imagen a WebP.', ERROR_CODES.OUTPUT_INVALID));
          return;
        }
        try {
          await assertVerifiedWebpBlob(blob);
          resolve(blob);
        } catch (error) {
          reject(error);
        }
      }, 'image/webp', quality);
    });
  }

  function loadImageElementFallback(file) {
    var objectUrl = URL.createObjectURL(file);
    return new Promise(function (resolve, reject) {
      var image = new Image();
      image.onload = function () {
        URL.revokeObjectURL(objectUrl);
        resolve(image);
      };
      image.onerror = function () {
        URL.revokeObjectURL(objectUrl);
        reject(createCompressionError('El navegador no pudo leer la imagen seleccionada.', ERROR_CODES.SOURCE_UNREADABLE));
      };
      image.src = objectUrl;
    });
  }

  async function loadImageSource(file) {
    if (typeof createImageBitmap === 'function') {
      try {
        return await createImageBitmap(file, { imageOrientation: 'from-image' });
      } catch (errorWithOrientation) {
        try {
          return await createImageBitmap(file);
        } catch (errorWithoutOrientation) {
          console.warn('createImageBitmap no pudo leer la imagen; se usa Image como respaldo compatible antes de comprimir.', errorWithoutOrientation || errorWithOrientation);
        }
      }
    }

    return loadImageElementFallback(file);
  }

  async function sha256(blob) {
    try {
      if (!window.crypto || !window.crypto.subtle || !blob || !blob.arrayBuffer) return '';
      var buffer = await blob.arrayBuffer();
      var digest = await window.crypto.subtle.digest('SHA-256', buffer);
      return Array.prototype.map.call(new Uint8Array(digest), function (byte) {
        return byte.toString(16).padStart(2, '0');
      }).join('');
    } catch (error) {
      return '';
    }
  }

  function makeFile(blob, name) {
    if (typeof File === 'function') {
      return new File([blob], name, { type: 'image/webp', lastModified: Date.now() });
    }
    blob.name = name;
    blob.lastModified = Date.now();
    return blob;
  }

  function assertFinalWebpUnderLimit(blob, maxBytes) {
    if (!blob || typeof blob.size !== 'number') {
      throw createCompressionError('La compresión no produjo un archivo WebP verificable.', ERROR_CODES.OUTPUT_INVALID);
    }
    if (blob.size > maxBytes) {
      throw createCompressionError('La imagen comprimida supera el límite de 200 KB y no se enviará.', ERROR_CODES.LIMIT_UNMET);
    }
    if (blob.type && !/^image\/webp$/i.test(blob.type)) {
      throw createCompressionError('La imagen comprimida no salió en WebP real; no se enviará un formato incorrecto.', ERROR_CODES.OUTPUT_INVALID);
    }
  }

  function normalizeQuality(value, fallback) {
    var parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.max(EMERGENCY_MIN_QUALITY, Math.min(MAX_QUALITY, parsed));
  }

  function buildDimensionPlan(originalWidth, originalHeight, maxDimension) {
    var scale = Math.min(1, maxDimension / Math.max(originalWidth, originalHeight));
    var width = Math.max(1, Math.round(originalWidth * scale));
    var height = Math.max(1, Math.round(originalHeight * scale));
    var plan = [];
    var seen = new Set();

    while (width >= MIN_DIMENSION && height >= MIN_DIMENSION) {
      var key = width + 'x' + height;
      if (!seen.has(key)) {
        plan.push({ width: width, height: height, mode: 'quality-preserving' });
        seen.add(key);
      }
      width = Math.max(1, Math.round(width * 0.88));
      height = Math.max(1, Math.round(height * 0.88));
    }

    var longSide = Math.max(width, height);
    while (longSide >= EMERGENCY_MIN_DIMENSION) {
      var emergencyKey = width + 'x' + height;
      if (!seen.has(emergencyKey)) {
        plan.push({ width: width, height: height, mode: 'hard-limit' });
        seen.add(emergencyKey);
      }
      width = Math.max(1, Math.round(width * 0.78));
      height = Math.max(1, Math.round(height * 0.78));
      longSide = Math.max(width, height);
    }

    if (!plan.length) {
      plan.push({
        width: Math.max(1, Math.round(originalWidth * scale)),
        height: Math.max(1, Math.round(originalHeight * scale)),
        mode: 'tiny-source'
      });
    }

    return plan;
  }

  async function encodeAt(canvas, source, width, height, quality) {
    var context = canvas.getContext('2d', { alpha: true, desynchronized: true });
    if (!context) throw new Error('El navegador no pudo preparar la compresión de imagen.');
    canvas.width = width;
    canvas.height = height;
    context.clearRect(0, 0, width, height);
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.drawImage(source, 0, 0, width, height);
    return canvasToWebpBlob(canvas, quality);
  }

  async function findBestBlobForDimension(canvas, source, width, height, targetBytes, qualityFloor, diagnostics, options, planIndex, planLength) {
    var low = qualityFloor;
    var high = MAX_QUALITY;
    var bestBlob = null;
    var bestQuality = qualityFloor;

    for (var attempt = 0; attempt < 10; attempt += 1) {
      assertNotAborted(options);
      var quality = Math.round(((low + high) / 2) * 100) / 100;
      var blob = await encodeAt(canvas, source, width, height, quality);
      diagnostics.attempts += 1;
      diagnostics.lastSize = blob.size;
      diagnostics.lastWidth = width;
      diagnostics.lastHeight = height;
      diagnostics.lastQuality = quality;
      var planBase = planLength ? (planIndex / planLength) * 84 : 0;
      var attemptWeight = planLength ? (1 / planLength) * 84 : 0;
      reportProgress(options, PROGRESS_START + planBase + ((attempt + 1) / 10) * attemptWeight, 'compressing', diagnostics);

      if (blob.size <= targetBytes) {
        bestBlob = blob;
        bestQuality = quality;
        low = Math.min(MAX_QUALITY, quality + 0.01);
      } else {
        high = Math.max(qualityFloor, quality - 0.01);
      }
    }

    return bestBlob ? { blob: bestBlob, quality: bestQuality, width: width, height: height, pixels: width * height } : null;
  }

  function isBetterCandidate(candidate, best, planItem) {
    if (!candidate) return false;
    if (!best) return true;
    var candidateVisualScore = candidate.pixels * Math.max(0.1, candidate.quality);
    var bestVisualScore = best.width * best.height * Math.max(0.1, best.quality);
    if (planItem.mode !== 'hard-limit' && best.mode === 'hard-limit') return true;
    if (candidate.quality >= 0.7 && best.quality < 0.7) return true;
    if (Math.abs(candidateVisualScore - bestVisualScore) > bestVisualScore * 0.04) return candidateVisualScore > bestVisualScore;
    return candidate.blob.size > best.blob.size;
  }

  function shouldAcceptCandidate(candidate, maxBytes, planItem) {
    if (!candidate || candidate.blob.size > maxBytes) return false;

    // Punto débil corregido: antes se aceptaba demasiado pronto una salida que
    // cabía en 200 KB aunque todavía pudiera existir una combinación con mejor
    // equilibrio visual. Ahora solo se corta temprano cuando la calidad ya es
    // alta o cuando se llegó al tramo de emergencia necesario para garantizar el límite.
    if (planItem.mode === 'hard-limit') return candidate.quality >= 0.52 || candidate.blob.size <= maxBytes * 0.9;
    if (planItem.mode === 'tiny-source') return true;
    return candidate.quality >= 0.84 && candidate.blob.size <= maxBytes * 0.99;
  }

  async function compress(file, options) {
    options = options || {};
    assertNotAborted(options);
    if (!file || !/^image\//i.test(file.type || '')) {
      throw createCompressionError('El compresor WebP solo acepta imágenes.', ERROR_CODES.INVALID_INPUT);
    }

    var maxBytes = clampMaxBytes(options.maxBytes);
    var targetBytes = Math.max(1, maxBytes - Math.min(TARGET_HEADROOM_BYTES, Math.floor(maxBytes * 0.04)));
    var maxDimension = Math.max(MIN_DIMENSION, toPositiveNumber(options.maxDimension, DEFAULT_MAX_DIMENSION));
    var requestedQualityFloor = normalizeQuality(options.minQuality, MIN_QUALITY);
    reportProgress(options, PROGRESS_START, 'reading-source', null);
    var imageSource = await loadImageSource(file);
    var originalWidth = Number(imageSource.width || imageSource.naturalWidth || 0);
    var originalHeight = Number(imageSource.height || imageSource.naturalHeight || 0);
    if (!originalWidth || !originalHeight) {
      if (imageSource.close) imageSource.close();
      throw createCompressionError('La imagen seleccionada no tiene dimensiones válidas.', ERROR_CODES.SOURCE_UNREADABLE);
    }

    if (/^image\/webp$/i.test(file.type || '') && Number(file.size || 0) <= maxBytes && Math.max(originalWidth, originalHeight) <= maxDimension) {
      if (imageSource.close) imageSource.close();
      assertFinalWebpUnderLimit(file, maxBytes);
      await assertVerifiedWebpBlob(file);
      var preservedFile = makeFile(file, buildWebpFilename(file.name));
      assertFinalWebpUnderLimit(preservedFile, maxBytes);
      await assertVerifiedWebpBlob(preservedFile);
      return {
        file: preservedFile,
        width: originalWidth,
        height: originalHeight,
        originalWidth: originalWidth,
        originalHeight: originalHeight,
        quality: 1,
        maxBytes: maxBytes,
        sizeBytes: file.size,
        sha256: await sha256(file),
        originalFileName: file.name || '',
        originalMimeType: file.type || '',
        compressionMode: 'original-webp-within-limit',
        diagnostics: {
          attempts: 0,
          lastSize: file.size,
          targetBytes: targetBytes,
          hardMaxBytes: maxBytes,
          weakPointResolved: 'WebP ya compatible preservado sin recomprimir y con verificación estricta <= 200 KB',
          guaranteedMaxBytes: true
        }
      };
    }

    var canvas = document.createElement('canvas');
    var plan = buildDimensionPlan(originalWidth, originalHeight, maxDimension);
    var best = null;
    var diagnostics = {
      attempts: 0,
      lastSize: 0,
      targetBytes: targetBytes,
      hardMaxBytes: maxBytes,
      dimensionPlanLength: plan.length,
      weakPointResolved: 'búsqueda progresiva por dimensión/calidad sin aceptación prematura, con salida WebP validada y verificación final estricta <= 200 KB',
      guaranteedMaxBytes: true
    };

    try {
      for (var index = 0; index < plan.length; index += 1) {
        var item = plan[index];
        var qualityFloor = item.mode === 'hard-limit' ? EMERGENCY_MIN_QUALITY : requestedQualityFloor;
        assertNotAborted(options);
        var candidate = await findBestBlobForDimension(canvas, imageSource, item.width, item.height, targetBytes, qualityFloor, diagnostics, options, index, plan.length);

        if (isBetterCandidate(candidate, best, item)) {
          best = {
            blob: candidate.blob,
            width: item.width,
            height: item.height,
            quality: candidate.quality,
            mode: item.mode
          };
        }

        if (shouldAcceptCandidate(candidate, maxBytes, item)) {
          best = {
            blob: candidate.blob,
            width: item.width,
            height: item.height,
            quality: candidate.quality,
            mode: item.mode
          };
          reportProgress(options, 96, 'candidate-accepted', diagnostics);
          break;
        }

        if (index % 2 === 1) await yieldToBrowser();
      }
    } finally {
      if (imageSource.close) imageSource.close();
    }

    assertNotAborted(options);
    if (!best || !best.blob || best.blob.size > maxBytes) {
      throw createCompressionError('La imagen no pudo comprimirse por debajo de 200 KB sin una reducción visual excesiva. No se enviará un archivo que supere el límite.', ERROR_CODES.LIMIT_UNMET, diagnostics);
    }

    assertFinalWebpUnderLimit(best.blob, maxBytes);
    await assertVerifiedWebpBlob(best.blob);

    var fileName = buildWebpFilename(file.name);
    var finalFile = makeFile(best.blob, fileName);
    assertFinalWebpUnderLimit(finalFile, maxBytes);
    await assertVerifiedWebpBlob(finalFile);
    reportProgress(options, PROGRESS_DONE, 'compressed', diagnostics);
    return {
      file: finalFile,
      width: best.width,
      height: best.height,
      originalWidth: originalWidth,
      originalHeight: originalHeight,
      quality: best.quality,
      maxBytes: maxBytes,
      sizeBytes: best.blob.size,
      sha256: await sha256(best.blob),
      originalFileName: file.name || '',
      originalMimeType: file.type || '',
      compressionMode: best.mode,
      diagnostics: diagnostics
    };
  }

  window.ChatERImageWebpCompressorLego = {
    version: '1.8.0',
    hardMaxBytes: HARD_MAX_BYTES,
    errorCodes: ERROR_CODES,
    compress: compress,
    isVerifiedWebpBlob: isVerifiedWebpBlob,
    clampMaxBytes: clampMaxBytes,
    buildWebpFilename: buildWebpFilename
  };
}());
