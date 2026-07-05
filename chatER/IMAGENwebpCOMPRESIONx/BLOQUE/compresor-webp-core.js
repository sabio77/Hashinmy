// BLOQUE principal de IMAGENwebpCOMPRESIONx: compresión progresiva de imágenes a WebP para adjuntos ChatER.
// Contrato interno del bloque: window.IMAGENwebpCOMPRESIONxBloque.compress(file, options)
// La conexión pública con la app se realiza solo desde IMAGENwebpCOMPRESIONx/conexion.
(function () {
  'use strict';

  var HARD_MAX_BYTES = 200 * 1024;
  var DEFAULT_MAX_DIMENSION = 1600;
  var MAX_DIMENSION_LIMIT = 4096;
  var MIN_DIMENSION = 64;
  var EMERGENCY_MIN_DIMENSION = 32;
  var MIN_QUALITY = 0.42;
  var EMERGENCY_MIN_QUALITY = 0.32;
  var MAX_QUALITY = 0.92;
  var TARGET_HEADROOM_BYTES = 1024;
  var TARGET_HEADROOM_VISUAL_EQUIVALENCE_RATIO = 0.055;
  var QUALITY_NOTICEABLE_FLOOR = 0.74;
  var QUALITY_SAFE_FLOOR = 0.66;
  var QUALITY_EMERGENCY_FLOOR = 0.52;
  var PERCEPTUAL_QUALITY_EXPONENT = 2.45;
  var PERCEPTUAL_PIXEL_EXPONENT = 0.82;
  var GUARANTEE_SCHEMA_VERSION = 'webp-200kb-v22';
  var ACCEPTED_CANDIDATE_LOOKAHEAD_MAX = 5;
  var ACCEPTED_CANDIDATE_LOOKAHEAD_FAST = 1;
  var ACCEPTED_CANDIDATE_HIGH_CONFIDENCE_QUALITY = 0.88;
  var DIMENSION_ATTEMPT_STRONG_OVERSIZE_RATIO = 1.35;
  var DIMENSION_ATTEMPT_HUGE_OVERSIZE_RATIO = 1.95;
  var DIMENSION_ATTEMPT_MIN_QUALITY_SPAN = 0.04;
  var FINAL_VISUAL_QUALITY_FLOOR = QUALITY_SAFE_FLOOR;
  var FINAL_MIN_LONG_SIDE_ABSOLUTE = 480;
  var FINAL_MIN_LONG_SIDE_RATIO = 0.18;
  var PROGRESS_START = 2;
  var PROGRESS_DONE = 100;
  var PROGRESSIVE_DOWNSCALE_RATIO = 0.5;
  var PROGRESSIVE_DOWNSCALE_TRIGGER_RATIO = 1.85;
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

  function clampMaxDimension(value) {
    return Math.max(MIN_DIMENSION, Math.min(MAX_DIMENSION_LIMIT, toPositiveNumber(value, DEFAULT_MAX_DIMENSION)));
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
      var settled = false;
      var timeout = setTimeout(function () {
        if (settled) return;
        settled = true;
        reject(createCompressionError('El navegador no completó la codificación WebP a tiempo; no se enviará una imagen sin garantía.', ERROR_CODES.OUTPUT_INVALID));
      }, 12000);

      function finish(callback, value) {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        callback(value);
      }

      try {
        canvas.toBlob(async function (blob) {
          if (!blob) {
            finish(reject, createCompressionError('No se pudo comprimir la imagen a WebP.', ERROR_CODES.OUTPUT_INVALID));
            return;
          }
          try {
            await assertVerifiedWebpBlob(blob);
            finish(resolve, blob);
          } catch (error) {
            finish(reject, error);
          }
        }, 'image/webp', quality);
      } catch (error) {
        finish(reject, createCompressionError('El navegador bloqueó la codificación WebP segura. La imagen no se enviará sin cumplir la garantía de 200 KB.', ERROR_CODES.OUTPUT_INVALID, {
          cause: error && error.message ? error.message : String(error || '')
        }));
      }
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

  async function assertReadyForUpload(blob, maxBytes) {
    var effectiveMaxBytes = clampMaxBytes(maxBytes);
    assertFinalWebpUnderLimit(blob, effectiveMaxBytes);
    await assertVerifiedWebpBlob(blob);
    return {
      ok: true,
      mimeType: 'image/webp',
      maxBytes: effectiveMaxBytes,
      sizeBytes: blob.size,
      guaranteedMaxBytes: true,
      headroomBytes: Math.max(0, effectiveMaxBytes - blob.size),
      weakPointResolved: 'validación final centralizada en el bloque LEGO antes de crear intenciones R2 o usar respaldos'
    };
  }

  function normalizeGuaranteeNumber(value) {
    var parsed = Number(value);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
  }

  function buildCompressionAuditId(blob, maxBytes, metadata) {
    var parts = [
      GUARANTEE_SCHEMA_VERSION,
      maxBytes,
      blob && typeof blob.size === 'number' ? blob.size : 0,
      metadata && metadata.width ? metadata.width : 0,
      metadata && metadata.height ? metadata.height : 0,
      metadata && metadata.quality ? metadata.quality : 0,
      metadata && metadata.compressionMode ? metadata.compressionMode : ''
    ];
    var raw = parts.join('|');
    var hash = 0;
    for (var i = 0; i < raw.length; i += 1) {
      hash = ((hash << 5) - hash + raw.charCodeAt(i)) | 0;
    }
    return 'webp200-' + Math.abs(hash).toString(36);
  }

  async function createCompressionGuarantee(blob, maxBytes, metadata) {
    var gate = await assertReadyForUpload(blob, maxBytes);
    metadata = metadata && typeof metadata === 'object' ? metadata : {};
    var targetBytes = normalizeGuaranteeNumber(metadata.targetBytes || Math.max(1, gate.maxBytes - Math.min(TARGET_HEADROOM_BYTES, Math.floor(gate.maxBytes * 0.04))));
    var width = normalizeGuaranteeNumber(metadata.width);
    var height = normalizeGuaranteeNumber(metadata.height);
    var quality = normalizeGuaranteeNumber(metadata.quality);
    return {
      ok: true,
      schemaVersion: GUARANTEE_SCHEMA_VERSION,
      guaranteedMaxBytes: true,
      validator: 'IMAGENwebpCOMPRESIONx',
      validatorVersion: window.IMAGENwebpCOMPRESIONxBloque && window.IMAGENwebpCOMPRESIONxBloque.version ? window.IMAGENwebpCOMPRESIONxBloque.version : '1.21.0',
      mimeType: gate.mimeType,
      formatVerified: 'RIFF_WEBP',
      maxBytes: gate.maxBytes,
      hardMaxBytes: HARD_MAX_BYTES,
      targetBytes: targetBytes,
      sizeBytes: gate.sizeBytes,
      headroomBytes: gate.headroomBytes,
      width: width,
      height: height,
      megapixels: width && height ? Math.round((width * height / 1000000) * 1000) / 1000 : 0,
      originalWidth: normalizeGuaranteeNumber(metadata.originalWidth),
      originalHeight: normalizeGuaranteeNumber(metadata.originalHeight),
      quality: quality,
      qualityBand: metadata.qualityBand || getQualityBand(quality),
      perceptualScore: normalizeGuaranteeNumber(metadata.perceptualScore),
      compressionMode: metadata.compressionMode || '',
      attempts: normalizeGuaranteeNumber(metadata.attempts),
      acceptedReason: metadata.acceptedReason || '',
      acceptedLimit: metadata.acceptedLimit || (gate.sizeBytes <= targetBytes ? 'target-headroom' : 'hard-max-200kb'),
      auditId: buildCompressionAuditId(blob, gate.maxBytes, metadata),
      assertedAt: new Date().toISOString(),
      targetHeadroomMet: gate.sizeBytes <= targetBytes,
      weakPointResolved: 'garantía auditable centralizada: WebP real RIFF/WEBP, bytes finales <= política efectiva, margen de bytes, trazabilidad de calidad/dimensión, compuerta visual mínima, redimensionado multipaso, lookahead, desempate con política efectiva y preferencia por menor peso cuando no hay mejora perceptual antes de cualquier upload'
    };
  }


  function readSourceCompressionNumber(source, guarantee, key) {
    var sourceValue = source && source[key];
    var guaranteeValue = guarantee && guarantee[key];
    var parsedSource = Number(sourceValue);
    if (Number.isFinite(parsedSource) && parsedSource >= 0) return parsedSource;
    var parsedGuarantee = Number(guaranteeValue);
    if (Number.isFinite(parsedGuarantee) && parsedGuarantee >= 0) return parsedGuarantee;
    return 0;
  }

  async function reusePreparedWebp(file, sourceCompression, options) {
    options = options || {};
    assertNotAborted(options);
    if (!file || !/^image\/webp$/i.test(file.type || '')) {
      throw createCompressionError('Solo se puede reutilizar una imagen WebP ya preparada.', ERROR_CODES.INVALID_INPUT);
    }

    var maxBytes = clampMaxBytes(options.maxBytes);
    assertFinalWebpUnderLimit(file, maxBytes);
    await assertVerifiedWebpBlob(file);

    var source = sourceCompression && typeof sourceCompression === 'object' ? sourceCompression : {};
    var guaranteeSource = source.guarantee && typeof source.guarantee === 'object' ? source.guarantee : {};
    var diagnosticsSource = source.diagnostics && typeof source.diagnostics === 'object' ? source.diagnostics : {};
    var width = readSourceCompressionNumber(source, guaranteeSource, 'width') || readSourceCompressionNumber(diagnosticsSource, null, 'finalWidth');
    var height = readSourceCompressionNumber(source, guaranteeSource, 'height') || readSourceCompressionNumber(diagnosticsSource, null, 'finalHeight');
    var originalWidth = readSourceCompressionNumber(source, guaranteeSource, 'originalWidth');
    var originalHeight = readSourceCompressionNumber(source, guaranteeSource, 'originalHeight');
    var quality = readSourceCompressionNumber(source, guaranteeSource, 'quality') || readSourceCompressionNumber(diagnosticsSource, null, 'finalQuality');
    var compressionMode = source.compressionMode || guaranteeSource.compressionMode || 'precompressed-webp-reused';
    var targetBytes = normalizeGuaranteeNumber(options.targetBytes || guaranteeSource.targetBytes || diagnosticsSource.targetBytes || Math.max(1, maxBytes - Math.min(TARGET_HEADROOM_BYTES, Math.floor(maxBytes * 0.04))));
    var guarantee = await createCompressionGuarantee(file, maxBytes, {
      width: width,
      height: height,
      originalWidth: originalWidth,
      originalHeight: originalHeight,
      quality: quality,
      qualityBand: source.qualityBand || guaranteeSource.qualityBand || getQualityBand(quality),
      perceptualScore: source.perceptualScore || guaranteeSource.perceptualScore || diagnosticsSource.finalPerceptualScore || 0,
      compressionMode: compressionMode,
      targetBytes: targetBytes,
      attempts: 0,
      acceptedReason: 'reused-already-validated-webp-for-effective-policy',
      acceptedLimit: file.size <= targetBytes ? 'target-headroom' : 'hard-max-200kb'
    });

    return {
      file: file,
      width: width,
      height: height,
      originalWidth: originalWidth,
      originalHeight: originalHeight,
      quality: quality,
      maxBytes: maxBytes,
      sizeBytes: file.size,
      sha256: source.sha256 || await sha256(file),
      originalFileName: source.originalFileName || source.originalFilename || '',
      originalMimeType: source.originalMimeType || '',
      compressionMode: compressionMode,
      qualityBand: source.qualityBand || guarantee.qualityBand || getQualityBand(quality),
      perceptualScore: source.perceptualScore || guarantee.perceptualScore || 0,
      acceptedLimit: guarantee.acceptedLimit,
      targetHeadroomMet: Boolean(guarantee.targetHeadroomMet),
      guarantee: {
        ...guarantee,
        reusedPreparedWebp: true,
        weakPointResolved: 'reutilización local de WebP ya validado: evita segunda compresión, mantiene RIFF/WEBP real y recalcula garantía <= política efectiva antes del upload'
      },
      diagnostics: {
        attempts: 0,
        reusedPreparedWebp: true,
        previousAttempts: normalizeGuaranteeNumber(diagnosticsSource.attempts || guaranteeSource.attempts),
        targetBytes: targetBytes,
        hardMaxBytes: maxBytes,
        finalWidth: width,
        finalHeight: height,
        finalQuality: quality,
        finalQualityBand: source.qualityBand || guarantee.qualityBand || getQualityBand(quality),
        finalPerceptualScore: source.perceptualScore || guarantee.perceptualScore || 0,
        finalHeadroomBytes: Math.max(0, maxBytes - file.size),
        acceptedReason: 'reused-already-validated-webp-for-effective-policy',
        acceptedLimit: guarantee.acceptedLimit,
        targetHeadroomMet: Boolean(guarantee.targetHeadroomMet),
        guaranteedMaxBytes: true,
        guarantee: guarantee,
        weakPointResolved: 'la ruta de subida reutiliza el WebP ya comprimido y solo revalida la política efectiva, sin gastar otro ciclo de canvas ni degradar calidad'
      }
    };
  }

  function normalizeQuality(value, fallback) {
    var parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.max(EMERGENCY_MIN_QUALITY, Math.min(MAX_QUALITY, parsed));
  }

  function getQualityBand(quality) {
    var normalizedQuality = Number(quality || 0);
    if (normalizedQuality >= QUALITY_NOTICEABLE_FLOOR) return 'quality-preserved';
    if (normalizedQuality >= QUALITY_SAFE_FLOOR) return 'acceptable';
    if (normalizedQuality >= QUALITY_EMERGENCY_FLOOR) return 'emergency-visible-loss';
    return 'rejectable-visible-loss';
  }

  function getPerceptualCandidateScore(candidate) {
    if (!candidate) return 0;
    var width = Number(candidate.width || 0);
    var height = Number(candidate.height || 0);
    var pixels = Number(candidate.pixels || (width * height) || 0);
    var quality = Math.max(0.01, Math.min(MAX_QUALITY, Number(candidate.quality || 0)));
    var qualityPenalty = quality < QUALITY_SAFE_FLOOR ? 0.58 : quality < QUALITY_NOTICEABLE_FLOOR ? 0.82 : 1;
    var emergencyPenalty = quality < QUALITY_EMERGENCY_FLOOR ? 0.35 : 1;
    return Math.pow(Math.max(1, pixels), PERCEPTUAL_PIXEL_EXPONENT) * Math.pow(quality, PERCEPTUAL_QUALITY_EXPONENT) * qualityPenalty * emergencyPenalty;
  }

  function attachEffectiveCompressionPolicyToPlan(plan, maxBytes, targetBytes) {
    var effectiveMaxBytes = clampMaxBytes(maxBytes);
    var effectiveTargetBytes = Math.max(1, Math.min(effectiveMaxBytes, toPositiveNumber(targetBytes, effectiveMaxBytes)));
    return (Array.isArray(plan) ? plan : []).map(function (item) {
      return Object.assign({}, item, {
        maxBytes: effectiveMaxBytes,
        targetBytes: effectiveTargetBytes
      });
    });
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

  function resolveImageSourceSize(source, fallbackWidth, fallbackHeight) {
    return {
      width: Math.max(1, Math.round(Number(source && (source.width || source.naturalWidth) || fallbackWidth || 1))),
      height: Math.max(1, Math.round(Number(source && (source.height || source.naturalHeight) || fallbackHeight || 1)))
    };
  }

  function createScratchCanvas(width, height) {
    var scratch = document.createElement('canvas');
    scratch.width = Math.max(1, Math.round(width));
    scratch.height = Math.max(1, Math.round(height));
    var scratchContext = scratch.getContext('2d', { alpha: true, desynchronized: true }) || scratch.getContext('2d', { alpha: true });
    if (!scratchContext) throw new Error('El navegador no pudo preparar una etapa intermedia de compresión.');
    scratchContext.imageSmoothingEnabled = true;
    scratchContext.imageSmoothingQuality = 'high';
    return { canvas: scratch, context: scratchContext };
  }

  function releaseScratchCanvas(canvas) {
    try {
      if (canvas && canvas.getContext) {
        canvas.width = 1;
        canvas.height = 1;
      }
    } catch (error) {
      // Liberación defensiva sin romper la compresión.
    }
  }

  function drawSourceWithProgressiveDownscale(targetContext, source, targetWidth, targetHeight, sourceWidth, sourceHeight) {
    var currentSource = source;
    var currentWidth = Math.max(1, Math.round(sourceWidth || targetWidth));
    var currentHeight = Math.max(1, Math.round(sourceHeight || targetHeight));
    var scratchCanvases = [];

    targetContext.imageSmoothingEnabled = true;
    targetContext.imageSmoothingQuality = 'high';

    try {
      while (currentWidth / targetWidth > PROGRESSIVE_DOWNSCALE_TRIGGER_RATIO
        || currentHeight / targetHeight > PROGRESSIVE_DOWNSCALE_TRIGGER_RATIO) {
        var nextWidth = Math.max(targetWidth, Math.round(currentWidth * PROGRESSIVE_DOWNSCALE_RATIO));
        var nextHeight = Math.max(targetHeight, Math.round(currentHeight * PROGRESSIVE_DOWNSCALE_RATIO));

        if (nextWidth === currentWidth && nextHeight === currentHeight) break;

        var scratch = createScratchCanvas(nextWidth, nextHeight);
        scratch.context.drawImage(currentSource, 0, 0, currentWidth, currentHeight, 0, 0, nextWidth, nextHeight);
        scratchCanvases.push(scratch.canvas);
        currentSource = scratch.canvas;
        currentWidth = nextWidth;
        currentHeight = nextHeight;
      }

      targetContext.drawImage(currentSource, 0, 0, currentWidth, currentHeight, 0, 0, targetWidth, targetHeight);
    } finally {
      scratchCanvases.forEach(releaseScratchCanvas);
    }
  }

  async function encodeAt(canvas, source, width, height, quality, originalWidth, originalHeight) {
    var context = canvas.getContext('2d', { alpha: true, desynchronized: true }) || canvas.getContext('2d', { alpha: true });
    if (!context) throw new Error('El navegador no pudo preparar la compresión de imagen.');
    canvas.width = width;
    canvas.height = height;
    context.clearRect(0, 0, width, height);
    var sourceSize = resolveImageSourceSize(source, originalWidth, originalHeight);
    drawSourceWithProgressiveDownscale(context, source, width, height, sourceSize.width, sourceSize.height);
    return canvasToWebpBlob(canvas, quality);
  }

  function shouldStopOversizedDimensionSearch(blob, hardMaxBytes, quality, qualityFloor, attempt, bestSafeBlob) {
    if (bestSafeBlob || !blob || typeof blob.size !== 'number') return false;
    var parsedHardMaxBytes = Number(hardMaxBytes || HARD_MAX_BYTES);
    var safeHardMaxBytes = Number.isFinite(parsedHardMaxBytes) && parsedHardMaxBytes > 0 ? parsedHardMaxBytes : HARD_MAX_BYTES;
    var oversizeRatio = blob.size / Math.max(1, safeHardMaxBytes);
    var qualityNearFloor = quality <= qualityFloor + DIMENSION_ATTEMPT_MIN_QUALITY_SPAN;

    // Punto débil corregido v14: en imágenes enormes o muy ruidosas, seguir
    // probando muchas calidades dentro de una dimensión que ni siquiera entra
    // cerca del piso útil solo bloquea la interfaz. Se corta esa dimensión y se
    // pasa a una reducción de tamaño, que suele conservar mejor nitidez dentro
    // del mismo límite de 200 KB. No se acepta ningún archivo fuera del límite.
    if (attempt >= 2 && qualityNearFloor && oversizeRatio >= DIMENSION_ATTEMPT_HUGE_OVERSIZE_RATIO) return true;
    if (attempt >= 4 && qualityNearFloor && oversizeRatio >= DIMENSION_ATTEMPT_STRONG_OVERSIZE_RATIO) return true;
    return false;
  }

  async function findBestBlobForDimension(canvas, source, width, height, targetBytes, hardMaxBytes, qualityFloor, diagnostics, options, planIndex, planLength, originalWidth, originalHeight) {
    var low = qualityFloor;
    var high = MAX_QUALITY;
    var bestTargetBlob = null;
    var bestTargetQuality = qualityFloor;
    var bestSafeBlob = null;
    var bestSafeQuality = qualityFloor;

    for (var attempt = 0; attempt < 10; attempt += 1) {
      assertNotAborted(options);
      var quality = Math.round(((low + high) / 2) * 100) / 100;
      var blob = await encodeAt(canvas, source, width, height, quality, originalWidth, originalHeight);
      diagnostics.attempts += 1;
      diagnostics.lastSize = blob.size;
      diagnostics.lastWidth = width;
      diagnostics.lastHeight = height;
      diagnostics.lastQuality = quality;
      var planBase = planLength ? (planIndex / planLength) * 84 : 0;
      var attemptWeight = planLength ? (1 / planLength) * 84 : 0;
      reportProgress(options, PROGRESS_START + planBase + ((attempt + 1) / 10) * attemptWeight, 'compressing', diagnostics);

      if (blob.size <= hardMaxBytes && (!bestSafeBlob || quality > bestSafeQuality || (quality === bestSafeQuality && blob.size < bestSafeBlob.size))) {
        bestSafeBlob = blob;
        bestSafeQuality = quality;
        diagnostics.bestSafeSize = blob.size;
        diagnostics.bestSafeQuality = quality;
        diagnostics.bestSafeWidth = width;
        diagnostics.bestSafeHeight = height;
      }

      if (blob.size <= targetBytes) {
        bestTargetBlob = blob;
        bestTargetQuality = quality;
        low = Math.min(MAX_QUALITY, quality + 0.01);
      } else {
        high = Math.max(qualityFloor, quality - 0.01);
      }

      if (shouldStopOversizedDimensionSearch(blob, hardMaxBytes, quality, qualityFloor, attempt, bestSafeBlob)) {
        diagnostics.dimensionSearchSkippedOversizedCount = Number(diagnostics.dimensionSearchSkippedOversizedCount || 0) + 1;
        diagnostics.dimensionSearchSkippedOversizedAt = planIndex;
        diagnostics.dimensionSearchSkippedOversizedWidth = width;
        diagnostics.dimensionSearchSkippedOversizedHeight = height;
        var diagnosticHardMaxBytes = Number(hardMaxBytes || HARD_MAX_BYTES);
        var diagnosticSafeMaxBytes = Number.isFinite(diagnosticHardMaxBytes) && diagnosticHardMaxBytes > 0 ? diagnosticHardMaxBytes : HARD_MAX_BYTES;
        diagnostics.dimensionSearchSkippedOversizedQuality = quality;
        diagnostics.dimensionSearchSkippedOversizedSize = blob.size;
        diagnostics.dimensionSearchSkippedOversizedRatio = Math.round((blob.size / Math.max(1, diagnosticSafeMaxBytes)) * 100) / 100;
        diagnostics.dimensionSearchSkippedOversizedReason = 'quality-floor-still-too-large-for-effective-policy';
        break;
      }
    }

    if (bestSafeBlob) {
      // Punto débil corregido: el margen blando interno no puede descartar
      // una variante visualmente superior que sigue estando dentro del límite
      // duro real de 200 KB o de la política efectiva recibida. Antes se
      // devolvía siempre bestTargetBlob si existía, aunque una calidad mayor
      // quedara apenas por encima del margen de seguridad pero por debajo del
      // máximo permitido.
      var safeCandidate = {
        blob: bestSafeBlob,
        quality: bestSafeQuality,
        width: width,
        height: height,
        pixels: width * height,
        targetSatisfied: Boolean(bestTargetBlob && bestSafeBlob === bestTargetBlob),
        acceptedLimit: bestTargetBlob && bestSafeBlob === bestTargetBlob ? 'target-headroom' : 'hard-max-200kb'
      };

      if (bestTargetBlob && bestSafeBlob !== bestTargetBlob) {
        diagnostics.bestTargetSize = bestTargetBlob.size;
        diagnostics.bestTargetQuality = bestTargetQuality;
        diagnostics.bestHardLimitSize = bestSafeBlob.size;
        diagnostics.bestHardLimitQuality = bestSafeQuality;
        diagnostics.dimensionSelectionPolicy = 'prefer-best-visual-under-hard-max-over-soft-headroom';
      } else if (bestTargetBlob) {
        diagnostics.dimensionSelectionPolicy = 'target-headroom-candidate-is-best-safe-candidate';
      } else {
        diagnostics.dimensionSelectionPolicy = 'hard-max-candidate-without-soft-headroom';
      }

      return safeCandidate;
    }

    return null;
  }

  function getMinimumAcceptableLongSide(originalWidth, originalHeight, maxVisualLongSide) {
    var originalLongSide = Math.max(Number(originalWidth || 0), Number(originalHeight || 0));
    var policyLongSideCap = clampMaxDimension(maxVisualLongSide || DEFAULT_MAX_DIMENSION);
    if (!originalLongSide) return Math.min(FINAL_MIN_LONG_SIDE_ABSOLUTE, policyLongSideCap);
    if (originalLongSide <= FINAL_MIN_LONG_SIDE_ABSOLUTE) return Math.max(1, Math.round(originalLongSide));
    return Math.min(
      Math.round(originalLongSide),
      policyLongSideCap,
      Math.max(FINAL_MIN_LONG_SIDE_ABSOLUTE, Math.round(originalLongSide * FINAL_MIN_LONG_SIDE_RATIO))
    );
  }

  function evaluateVisualCandidate(candidate, originalWidth, originalHeight, maxVisualLongSide) {
    var originalLongSide = Math.max(Number(originalWidth || 0), Number(originalHeight || 0));
    var finalLongSide = Math.max(Number(candidate && candidate.width || 0), Number(candidate && candidate.height || 0));
    var quality = Number(candidate && candidate.quality || 0);
    var policyLongSideCap = clampMaxDimension(maxVisualLongSide || DEFAULT_MAX_DIMENSION);
    var minLongSide = getMinimumAcceptableLongSide(originalWidth, originalHeight, policyLongSideCap);
    var qualityOk = quality >= FINAL_VISUAL_QUALITY_FLOOR;
    var dimensionOk = !originalLongSide || originalLongSide <= FINAL_MIN_LONG_SIDE_ABSOLUTE || finalLongSide >= minLongSide;

    return {
      ok: Boolean(candidate && candidate.blob && qualityOk && dimensionOk),
      qualityOk: qualityOk,
      dimensionOk: dimensionOk,
      minQuality: FINAL_VISUAL_QUALITY_FLOOR,
      minLongSide: minLongSide,
      finalLongSide: finalLongSide,
      originalLongSide: originalLongSide,
      policyLongSideCap: policyLongSideCap,
      qualityBand: getQualityBand(quality),
      reason: !qualityOk
        ? 'quality-below-visual-floor'
        : (!dimensionOk ? 'dimension-below-policy-capped-visual-floor' : 'visual-floor-ok')
    };
  }

  function isBetterCandidate(candidate, best, planItem) {
    if (!candidate) return false;
    if (!best) return true;

    var candidateScore = getPerceptualCandidateScore(candidate);
    var bestScore = getPerceptualCandidateScore({
      width: best.width,
      height: best.height,
      pixels: best.width * best.height,
      quality: best.quality
    });
    var candidateBand = getQualityBand(candidate.quality);
    var bestBand = getQualityBand(best.quality);
    var bandRank = {
      'quality-preserved': 4,
      acceptable: 3,
      'emergency-visible-loss': 2,
      'rejectable-visible-loss': 1
    };
    var scoreDifference = Math.abs(candidateScore - bestScore);
    var scoreEquivalenceThreshold = Math.max(1, bestScore) * TARGET_HEADROOM_VISUAL_EQUIVALENCE_RATIO;
    var visuallyEquivalent = scoreDifference <= scoreEquivalenceThreshold;
    var effectiveMaxBytes = planItem && planItem.maxBytes ? clampMaxBytes(planItem.maxBytes) : HARD_MAX_BYTES;
    var candidateHeadroom = Math.max(0, effectiveMaxBytes - Number(candidate.blob && candidate.blob.size || 0));
    var bestHeadroom = Math.max(0, effectiveMaxBytes - Number(best.blob && best.blob.size || 0));

    if (planItem.mode !== 'hard-limit' && best.mode === 'hard-limit') return true;
    if ((bandRank[candidateBand] || 0) > (bandRank[bestBand] || 0) && candidateScore >= bestScore * 0.78) return true;
    if ((bandRank[candidateBand] || 0) < (bandRank[bestBand] || 0) && candidateScore <= bestScore * 1.18) return false;

    // Punto débil corregido v15: si dos candidatos son visualmente equivalentes,
    // se comparan con el límite efectivo inyectado en el item del plan, no con
    // los 200 KB globales. Así una política menor de memoriaBACKEND no queda
    // falseada al elegir margen, calidad y holgura antes del upload.
    // Refuerzo v18: si ya no hay mejora perceptual, el desempate final prefiere
    // el WebP más liviano en vez del más pesado. Esto conserva calidad aparente
    // y deja holgura real bajo 200 KB o bajo la política efectiva.
    if (visuallyEquivalent && candidate.targetSatisfied !== best.targetSatisfied) return Boolean(candidate.targetSatisfied);
    if (visuallyEquivalent && candidate.targetSatisfied === best.targetSatisfied
      && Math.abs(candidateHeadroom - bestHeadroom) > TARGET_HEADROOM_BYTES
      && candidateScore >= bestScore * 0.985) {
      return candidateHeadroom > bestHeadroom;
    }

    if (scoreDifference > Math.max(1, bestScore) * 0.035) return candidateScore > bestScore;
    if (candidate.targetSatisfied && !best.targetSatisfied) return true;
    if (candidate.quality !== best.quality) return candidate.quality > best.quality;
    return Number(candidate.blob && candidate.blob.size || 0) < Number(best.blob && best.blob.size || Number.MAX_SAFE_INTEGER);
  }

  function shouldAcceptCandidate(candidate, maxBytes, planItem) {
    if (!candidate || candidate.blob.size > maxBytes) return false;

    // Punto débil corregido: el corte temprano no se decide solo por bytes.
    // Para evitar pérdida visual notable, una salida en dimensión alta pero con
    // calidad baja no puede cerrar el ciclo antes de probar reducciones de
    // dimensión que suelen conservar más nitidez dentro de los mismos 200 KB.
    if (planItem.mode === 'hard-limit') {
      return candidate.quality >= QUALITY_SAFE_FLOOR || (candidate.quality >= QUALITY_EMERGENCY_FLOOR && candidate.blob.size <= maxBytes * 0.86);
    }
    if (planItem.mode === 'tiny-source') return true;
    if (!candidate.targetSatisfied) return candidate.quality >= 0.88 && candidate.blob.size <= maxBytes;
    return candidate.quality >= QUALITY_NOTICEABLE_FLOOR && candidate.blob.size <= maxBytes * 0.99;
  }


  function getAcceptedCandidateLookaheadCount(candidate, planItem, index, planLength, maxBytes) {
    var effectiveMaxBytes = clampMaxBytes(maxBytes);
    if (!candidate || !candidate.blob || candidate.blob.size > effectiveMaxBytes) return 0;

    var remaining = Math.max(0, Number(planLength || 0) - Number(index || 0) - 1);
    if (!remaining) return 0;

    // El punto débil real no era solo el límite de 200 KB, sino cortar demasiado pronto
    // usando el máximo global aunque la política efectiva del backend sea menor.
    // La ventana de comparación se decide con el límite efectivo recibido.
    if (planItem.mode === 'quality-preserving'
      && candidate.targetSatisfied
      && candidate.quality >= ACCEPTED_CANDIDATE_HIGH_CONFIDENCE_QUALITY) {
      return Math.min(ACCEPTED_CANDIDATE_LOOKAHEAD_FAST, remaining);
    }

    if (planItem.mode === 'quality-preserving'
      && candidate.targetSatisfied
      && candidate.quality >= QUALITY_NOTICEABLE_FLOOR) {
      return Math.min(3, remaining);
    }

    return Math.min(ACCEPTED_CANDIDATE_LOOKAHEAD_MAX, remaining);
  }

  function shouldStopAfterAcceptedLookahead(checkpoint, index) {
    if (!checkpoint) return false;
    return Number(index || 0) >= checkpoint.index + checkpoint.lookaheadCount;
  }

  function materializeCandidate(candidate, planItem) {
    if (!candidate || !candidate.blob) return null;
    return {
      blob: candidate.blob,
      width: planItem.width,
      height: planItem.height,
      quality: candidate.quality,
      mode: planItem.mode,
      targetSatisfied: Boolean(candidate.targetSatisfied),
      acceptedLimit: candidate.acceptedLimit || 'hard-max-200kb'
    };
  }

  async function compress(file, options) {
    options = options || {};
    assertNotAborted(options);
    if (!file || !/^image\//i.test(file.type || '')) {
      throw createCompressionError('El compresor WebP solo acepta imágenes.', ERROR_CODES.INVALID_INPUT);
    }

    var maxBytes = clampMaxBytes(options.maxBytes);
    var targetBytes = Math.max(1, maxBytes - Math.min(TARGET_HEADROOM_BYTES, Math.floor(maxBytes * 0.04)));
    var requestedMaxDimension = toPositiveNumber(options.maxDimension, DEFAULT_MAX_DIMENSION);
    var maxDimension = clampMaxDimension(options.maxDimension);
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
      var preservedGuarantee = await createCompressionGuarantee(preservedFile, maxBytes, {
        width: originalWidth,
        height: originalHeight,
        originalWidth: originalWidth,
        originalHeight: originalHeight,
        quality: 1,
        compressionMode: 'original-webp-within-limit',
        targetBytes: targetBytes,
        attempts: 0
      });
      return {
        file: preservedFile,
        width: originalWidth,
        height: originalHeight,
        originalWidth: originalWidth,
        originalHeight: originalHeight,
        quality: 1,
        maxBytes: maxBytes,
        sizeBytes: preservedFile.size,
        sha256: await sha256(preservedFile),
        originalFileName: file.name || '',
        originalMimeType: file.type || '',
        compressionMode: 'original-webp-within-limit',
        qualityBand: getQualityBand(1),
        perceptualScore: getPerceptualCandidateScore({ width: originalWidth, height: originalHeight, pixels: originalWidth * originalHeight, quality: 1 }),
        guarantee: preservedGuarantee,
        diagnostics: {
          attempts: 0,
          lastSize: preservedFile.size,
          targetBytes: targetBytes,
          hardMaxBytes: maxBytes,
          maxDimension: maxDimension,
          maxDimensionLimit: MAX_DIMENSION_LIMIT,
          requestedMaxDimension: requestedMaxDimension,
          weakPointResolved: 'WebP ya compatible preservado sin recomprimir y con verificación estricta <= 200 KB',
          guaranteedMaxBytes: true,
          guarantee: preservedGuarantee
        }
      };
    }

    var canvas = document.createElement('canvas');
    var plan = attachEffectiveCompressionPolicyToPlan(buildDimensionPlan(originalWidth, originalHeight, maxDimension), maxBytes, targetBytes);
    var best = null;
    var bestRejectedByVisualGate = null;
    var diagnostics = {
      attempts: 0,
      lastSize: 0,
      targetBytes: targetBytes,
      hardMaxBytes: maxBytes,
      maxDimension: maxDimension,
      maxDimensionLimit: MAX_DIMENSION_LIMIT,
      requestedMaxDimension: requestedMaxDimension,
      dimensionPlanLength: plan.length,
      visualQualityFloor: FINAL_VISUAL_QUALITY_FLOOR,
      visualMinLongSide: getMinimumAcceptableLongSide(originalWidth, originalHeight, maxDimension),
      visualLongSidePolicyCap: maxDimension,
      weakPointResolved: 'búsqueda progresiva por dimensión/calidad con redimensionado multipaso, conserva el mejor candidato visual bajo el límite efectivo, corta dimensiones inviables, respeta el maxDimension efectivo al evaluar la compuerta visual, desempata candidatos con maxBytes real del plan, prefiere menor peso en empates visuales y valida WebP real <= política efectiva',
      dimensionSearchSkippedOversizedCount: 0,
      guaranteedMaxBytes: true
    };

    var acceptedCheckpoint = null;

    try {
      for (var index = 0; index < plan.length; index += 1) {
        var item = plan[index];
        var qualityFloor = item.mode === 'hard-limit' ? EMERGENCY_MIN_QUALITY : requestedQualityFloor;
        assertNotAborted(options);
        var candidate = await findBestBlobForDimension(canvas, imageSource, item.width, item.height, targetBytes, maxBytes, qualityFloor, diagnostics, options, index, plan.length, originalWidth, originalHeight);

        var materializedCandidate = materializeCandidate(candidate, item);
        var candidateVisualGate = evaluateVisualCandidate(materializedCandidate, originalWidth, originalHeight, maxDimension);
        if (materializedCandidate) materializedCandidate.visualGate = candidateVisualGate;
        diagnostics.lastVisualGate = candidateVisualGate;

        var candidateImprovesBest = false;
        if (candidateVisualGate.ok) {
          candidateImprovesBest = isBetterCandidate(materializedCandidate, best, item);
          if (candidateImprovesBest) {
            best = materializedCandidate;
            diagnostics.bestCandidateUpdatedAt = index;
            diagnostics.bestCandidateQuality = best.quality;
            diagnostics.bestCandidateWidth = best.width;
            diagnostics.bestCandidateHeight = best.height;
            diagnostics.bestCandidateSize = best.blob.size;
            diagnostics.bestCandidateQualityBand = getQualityBand(best.quality);
            diagnostics.bestCandidatePerceptualScore = getPerceptualCandidateScore(best);
            diagnostics.bestCandidateVisualGate = candidateVisualGate;
          }
        } else if (materializedCandidate && isBetterCandidate(materializedCandidate, bestRejectedByVisualGate, item)) {
          bestRejectedByVisualGate = materializedCandidate;
          diagnostics.bestRejectedVisualGate = candidateVisualGate;
          diagnostics.bestRejectedCandidateQuality = materializedCandidate.quality;
          diagnostics.bestRejectedCandidateWidth = materializedCandidate.width;
          diagnostics.bestRejectedCandidateHeight = materializedCandidate.height;
          diagnostics.bestRejectedCandidateSize = materializedCandidate.blob.size;
        }

        if (candidateVisualGate.ok && shouldAcceptCandidate(candidate, maxBytes, item)) {
          if (!best) best = materializedCandidate;

          if (!acceptedCheckpoint) {
            var lookaheadCount = getAcceptedCandidateLookaheadCount(candidate, item, index, plan.length, maxBytes);
            acceptedCheckpoint = {
              index: index,
              lookaheadCount: lookaheadCount,
              size: candidate.blob.size,
              quality: candidate.quality,
              width: item.width,
              height: item.height,
              acceptedLimit: candidate.acceptedLimit || 'hard-max-200kb'
            };
            diagnostics.acceptedEarly = lookaheadCount === 0;
            diagnostics.acceptedLookahead = lookaheadCount > 0;
            diagnostics.acceptedLookaheadCount = lookaheadCount;
            diagnostics.acceptedReason = lookaheadCount > 0
              ? 'accepted-candidate-kept-as-checkpoint-with-bounded-lookahead'
              : (candidateImprovesBest ? 'accepted-candidate-is-best-so-far' : 'accepted-candidate-valid-but-previous-best-preserved');
            diagnostics.acceptedCandidateSize = candidate.blob.size;
            diagnostics.acceptedCandidateQuality = candidate.quality;
            diagnostics.acceptedCandidateWidth = item.width;
            diagnostics.acceptedCandidateHeight = item.height;
            diagnostics.acceptedCandidateLimit = candidate.acceptedLimit || 'hard-max-200kb';
            diagnostics.acceptedCandidateQualityBand = getQualityBand(candidate.quality);
            diagnostics.acceptedCandidatePerceptualScore = getPerceptualCandidateScore(candidate);
            diagnostics.targetHeadroomMet = Boolean(candidate.targetSatisfied);
            diagnostics.selectionPolicy = 'bounded-lookahead-best-perceptual-candidate-under-effective-policy';
            diagnostics.effectiveMaxBytes = maxBytes;
            reportProgress(options, lookaheadCount > 0 ? 92 : 96, lookaheadCount > 0 ? 'candidate-checkpoint' : 'candidate-accepted', diagnostics);
          }

          if (shouldStopAfterAcceptedLookahead(acceptedCheckpoint, index)) {
            diagnostics.acceptedEarly = true;
            diagnostics.acceptedLookaheadCompleted = true;
            diagnostics.acceptedLookaheadCompletedAt = index;
            diagnostics.finalSelectionReason = 'best-candidate-after-bounded-lookahead';
            reportProgress(options, 96, 'candidate-accepted', diagnostics);
            break;
          }
        } else if (acceptedCheckpoint && shouldStopAfterAcceptedLookahead(acceptedCheckpoint, index)) {
          diagnostics.acceptedEarly = true;
          diagnostics.acceptedLookaheadCompleted = true;
          diagnostics.acceptedLookaheadCompletedAt = index;
          diagnostics.finalSelectionReason = 'best-candidate-after-bounded-lookahead';
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
      if (bestRejectedByVisualGate) {
        diagnostics.bestRejectedFinalSize = bestRejectedByVisualGate.blob.size;
        diagnostics.bestRejectedFinalQuality = bestRejectedByVisualGate.quality;
        diagnostics.bestRejectedFinalWidth = bestRejectedByVisualGate.width;
        diagnostics.bestRejectedFinalHeight = bestRejectedByVisualGate.height;
        diagnostics.finalRejectionReason = bestRejectedByVisualGate.visualGate?.reason || 'visual-floor-not-met';
      }
      throw createCompressionError('La imagen no pudo comprimirse por debajo de 200 KB sin una reducción visual aceptable. No se enviará una versión con pérdida notable.', ERROR_CODES.LIMIT_UNMET, diagnostics);
    }

    var finalVisualGate = evaluateVisualCandidate(best, originalWidth, originalHeight, maxDimension);
    diagnostics.finalVisualGate = finalVisualGate;
    if (!finalVisualGate.ok) {
      throw createCompressionError('La imagen comprimida cumpliría el peso, pero tendría pérdida visual notable. No se enviará automáticamente.', ERROR_CODES.LIMIT_UNMET, diagnostics);
    }

    assertFinalWebpUnderLimit(best.blob, maxBytes);
    await assertVerifiedWebpBlob(best.blob);

    var fileName = buildWebpFilename(file.name);
    var finalFile = makeFile(best.blob, fileName);
    var guarantee = await createCompressionGuarantee(finalFile, maxBytes, {
      width: best.width,
      height: best.height,
      originalWidth: originalWidth,
      originalHeight: originalHeight,
      quality: best.quality,
      compressionMode: best.mode,
      qualityBand: getQualityBand(best.quality),
      perceptualScore: getPerceptualCandidateScore(best),
      targetBytes: targetBytes,
      attempts: diagnostics.attempts,
      acceptedReason: diagnostics.acceptedReason || '',
      acceptedLimit: best.acceptedLimit || '',
      targetHeadroomMet: Boolean(best.targetSatisfied)
    });
    diagnostics.finalSize = finalFile.size;
    diagnostics.finalWidth = best.width;
    diagnostics.finalHeight = best.height;
    diagnostics.finalQuality = best.quality;
    diagnostics.finalMode = best.mode;
    diagnostics.finalQualityBand = getQualityBand(best.quality);
    diagnostics.finalPerceptualScore = getPerceptualCandidateScore(best);
    diagnostics.finalHeadroomBytes = Math.max(0, maxBytes - finalFile.size);
    diagnostics.finalAcceptedLimit = best.acceptedLimit || 'hard-max-200kb';
    diagnostics.targetHeadroomMet = Boolean(best.targetSatisfied);
    diagnostics.guarantee = guarantee;
    reportProgress(options, PROGRESS_DONE, 'compressed', diagnostics);
    return {
      file: finalFile,
      width: best.width,
      height: best.height,
      originalWidth: originalWidth,
      originalHeight: originalHeight,
      quality: best.quality,
      maxBytes: maxBytes,
      sizeBytes: finalFile.size,
      sha256: await sha256(finalFile),
      originalFileName: file.name || '',
      originalMimeType: file.type || '',
      compressionMode: best.mode,
      qualityBand: getQualityBand(best.quality),
      perceptualScore: getPerceptualCandidateScore(best),
      acceptedLimit: best.acceptedLimit || 'hard-max-200kb',
      targetHeadroomMet: Boolean(best.targetSatisfied),
      guarantee: guarantee,
      diagnostics: diagnostics
    };
  }

  window.IMAGENwebpCOMPRESIONxBloque = {
    version: '1.26.0',
    hardMaxBytes: HARD_MAX_BYTES,
    errorCodes: ERROR_CODES,
    compress: compress,
    isVerifiedWebpBlob: isVerifiedWebpBlob,
    assertReadyForUpload: assertReadyForUpload,
    createCompressionGuarantee: createCompressionGuarantee,
    reusePreparedWebp: reusePreparedWebp,
    clampMaxBytes: clampMaxBytes,
    clampMaxDimension: clampMaxDimension,
    buildWebpFilename: buildWebpFilename
  };
}());
