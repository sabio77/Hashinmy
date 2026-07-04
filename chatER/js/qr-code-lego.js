// Bloque tipo lego: generación y lectura de códigos QR de perfil para ChatER.
// Contrato público del bloque: window.ChatERQRCodeLego
(function () {
  'use strict';

  var VERSION = 5;
  var SIZE = 17 + VERSION * 4;
  var DATA_CODEWORDS = 108;
  var ECC_CODEWORDS = 26;
  var MASK = 0;
  var MAX_PAYLOAD_BYTES = 106;
  var EXP = new Array(512);
  var LOG = new Array(256);

  (function initGaloisTables() {
    var value = 1;
    for (var i = 0; i < 255; i += 1) {
      EXP[i] = value;
      LOG[value] = i;
      value <<= 1;
      if (value & 0x100) value ^= 0x11D;
    }
    for (var j = 255; j < 512; j += 1) EXP[j] = EXP[j - 255];
  }());

  function gfMultiply(left, right) {
    if (!left || !right) return 0;
    return EXP[LOG[left] + LOG[right]];
  }

  function computeDivisor(degree) {
    var result = [1];
    for (var i = 0; i < degree; i += 1) {
      var next = new Array(result.length + 1).fill(0);
      for (var j = 0; j < result.length; j += 1) {
        next[j] ^= result[j];
        next[j + 1] ^= gfMultiply(result[j], EXP[i]);
      }
      result = next;
    }
    return result.slice(1);
  }

  function computeRemainder(data, degree) {
    var divisor = computeDivisor(degree);
    var result = new Array(degree).fill(0);
    data.forEach(function (byte) {
      var factor = byte ^ result.shift();
      result.push(0);
      for (var i = 0; i < degree; i += 1) {
        result[i] ^= gfMultiply(divisor[i], factor);
      }
    });
    return result;
  }

  function utf8Bytes(text) {
    if (window.TextEncoder) return Array.from(new TextEncoder().encode(String(text || '')));
    return unescape(encodeURIComponent(String(text || ''))).split('').map(function (char) { return char.charCodeAt(0); });
  }

  function bytesToBitBuffer(payloadBytes) {
    var bits = [];
    function append(value, length) {
      for (var i = length - 1; i >= 0; i -= 1) bits.push(((value >>> i) & 1) === 1);
    }

    append(0x4, 4);
    append(payloadBytes.length, 8);
    payloadBytes.forEach(function (byte) { append(byte, 8); });

    var maxBits = DATA_CODEWORDS * 8;
    var terminator = Math.min(4, maxBits - bits.length);
    append(0, terminator);
    while (bits.length % 8) bits.push(false);

    var bytes = [];
    for (var index = 0; index < bits.length; index += 8) {
      var value = 0;
      for (var offset = 0; offset < 8; offset += 1) value = (value << 1) | (bits[index + offset] ? 1 : 0);
      bytes.push(value);
    }
    for (var pad = 0; bytes.length < DATA_CODEWORDS; pad += 1) bytes.push(pad % 2 ? 0x11 : 0xEC);
    return bytes;
  }

  function makeMatrix() {
    var matrix = [];
    var isFunction = [];
    for (var y = 0; y < SIZE; y += 1) {
      matrix.push(new Array(SIZE).fill(false));
      isFunction.push(new Array(SIZE).fill(false));
    }
    return { matrix: matrix, isFunction: isFunction };
  }

  function setFunction(moduleSet, x, y, value) {
    if (x < 0 || y < 0 || x >= SIZE || y >= SIZE) return;
    moduleSet.matrix[y][x] = Boolean(value);
    moduleSet.isFunction[y][x] = true;
  }

  function drawFinder(moduleSet, x, y) {
    for (var dy = -1; dy <= 7; dy += 1) {
      for (var dx = -1; dx <= 7; dx += 1) {
        var xx = x + dx;
        var yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= SIZE || yy >= SIZE) continue;
        var isBlack = dx >= 0 && dx <= 6 && dy >= 0 && dy <= 6 && (dx === 0 || dx === 6 || dy === 0 || dy === 6 || (dx >= 2 && dx <= 4 && dy >= 2 && dy <= 4));
        setFunction(moduleSet, xx, yy, isBlack);
      }
    }
  }

  function drawAlignment(moduleSet, centerX, centerY) {
    for (var dy = -2; dy <= 2; dy += 1) {
      for (var dx = -2; dx <= 2; dx += 1) {
        var distance = Math.max(Math.abs(dx), Math.abs(dy));
        setFunction(moduleSet, centerX + dx, centerY + dy, distance !== 1);
      }
    }
  }

  function getFormatBits(mask) {
    var data = (1 << 3) | mask; // Nivel L = 01, máscara 0.
    var bits = data << 10;
    var generator = 0x537;
    for (var i = 14; i >= 10; i -= 1) {
      if (((bits >>> i) & 1) !== 0) bits ^= generator << (i - 10);
    }
    return ((data << 10) | bits) ^ 0x5412;
  }

  function drawFormatBits(moduleSet, mask) {
    var bits = getFormatBits(mask);
    var i;
    for (i = 0; i <= 5; i += 1) setFunction(moduleSet, 8, i, ((bits >>> i) & 1) !== 0);
    setFunction(moduleSet, 8, 7, ((bits >>> 6) & 1) !== 0);
    setFunction(moduleSet, 8, 8, ((bits >>> 7) & 1) !== 0);
    setFunction(moduleSet, 7, 8, ((bits >>> 8) & 1) !== 0);
    for (i = 9; i < 15; i += 1) setFunction(moduleSet, 14 - i, 8, ((bits >>> i) & 1) !== 0);
    for (i = 0; i < 8; i += 1) setFunction(moduleSet, SIZE - 1 - i, 8, ((bits >>> i) & 1) !== 0);
    for (i = 8; i < 15; i += 1) setFunction(moduleSet, 8, SIZE - 15 + i, ((bits >>> i) & 1) !== 0);
    setFunction(moduleSet, 8, SIZE - 8, true);
  }

  function drawFunctionPatterns(moduleSet) {
    drawFinder(moduleSet, 0, 0);
    drawFinder(moduleSet, SIZE - 7, 0);
    drawFinder(moduleSet, 0, SIZE - 7);
    for (var i = 8; i < SIZE - 8; i += 1) {
      setFunction(moduleSet, 6, i, i % 2 === 0);
      setFunction(moduleSet, i, 6, i % 2 === 0);
    }
    drawAlignment(moduleSet, 30, 30);
    drawFormatBits(moduleSet, MASK);
  }

  function buildCodewords(payload) {
    var bytes = utf8Bytes(payload);
    if (bytes.length > MAX_PAYLOAD_BYTES) throw new Error('El contenido del QR de perfil excede la capacidad segura.');
    var data = bytesToBitBuffer(bytes);
    return data.concat(computeRemainder(data, ECC_CODEWORDS));
  }

  function drawData(moduleSet, codewords) {
    var bits = [];
    codewords.forEach(function (byte) {
      for (var i = 7; i >= 0; i -= 1) bits.push(((byte >>> i) & 1) !== 0);
    });

    var bitIndex = 0;
    var upward = true;
    for (var right = SIZE - 1; right >= 1; right -= 2) {
      if (right === 6) right -= 1;
      for (var vert = 0; vert < SIZE; vert += 1) {
        var y = upward ? SIZE - 1 - vert : vert;
        for (var col = 0; col < 2; col += 1) {
          var x = right - col;
          if (moduleSet.isFunction[y][x]) continue;
          var bit = bitIndex < bits.length ? bits[bitIndex] : false;
          bitIndex += 1;
          if ((x + y) % 2 === 0) bit = !bit;
          moduleSet.matrix[y][x] = bit;
        }
      }
      upward = !upward;
    }
  }

  function generateMatrix(payload) {
    var moduleSet = makeMatrix();
    drawFunctionPatterns(moduleSet);
    drawData(moduleSet, buildCodewords(payload));
    drawFormatBits(moduleSet, MASK);
    return moduleSet.matrix;
  }

  function escapeAttribute(value) {
    return String(value || '').replace(/[&<>"]/g, function (char) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[char];
    });
  }

  function matrixToSvg(matrix, options) {
    options = options || {};
    var quiet = 4;
    var modules = matrix.length + quiet * 2;
    var size = Number(options.size || 232);
    var foreground = options.foreground || '#111b21';
    var background = options.background || '#ffffff';
    var rects = [];
    for (var y = 0; y < matrix.length; y += 1) {
      for (var x = 0; x < matrix.length; x += 1) {
        if (matrix[y][x]) rects.push('<rect x="' + (x + quiet) + '" y="' + (y + quiet) + '" width="1" height="1"/>');
      }
    }
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + modules + ' ' + modules + '" width="' + size + '" height="' + size + '" role="img" aria-label="Código QR del perfil ChatER" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="' + escapeAttribute(background) + '"/><g fill="' + escapeAttribute(foreground) + '">' + rects.join('') + '</g></svg>';
  }

  function normalizeEmail(email) {
    return String(email || '').trim().toLowerCase();
  }

  function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(email));
  }

  function buildProfilePayload(profile) {
    profile = profile || {};
    var email = normalizeEmail(profile.email || profile.userEmail || '');
    if (!isValidEmail(email)) throw new Error('El perfil no tiene un correo válido para compartir.');
    var name = String(profile.name || profile.displayName || email.split('@')[0] || 'Contacto').trim().slice(0, 42);
    var userId = String(profile.userId || profile.id || '').trim().slice(0, 24);
    var payload = 'chater:e=' + encodeURIComponent(email) + '&n=' + encodeURIComponent(name) + (userId ? '&u=' + encodeURIComponent(userId) : '');
    if (utf8Bytes(payload).length > MAX_PAYLOAD_BYTES) payload = 'chater:e=' + encodeURIComponent(email) + '&n=' + encodeURIComponent(name.slice(0, 18));
    if (utf8Bytes(payload).length > MAX_PAYLOAD_BYTES) payload = 'chater:e=' + encodeURIComponent(email);
    return payload;
  }

  function parsePayload(raw) {
    var text = String(raw || '').trim();
    if (!text) return null;

    try {
      if (/^\{/.test(text)) {
        var json = JSON.parse(text);
        return normalizeContactPayload(json);
      }
    } catch (error) {
      return null;
    }

    var query = '';
    if (text.indexOf('chater:') === 0) {
      query = text.slice('chater:'.length);
    } else {
      try {
        var url = new URL(text, window.location.href);
        query = url.search ? url.search.slice(1) : '';
      } catch (error) {
        query = text;
      }
    }

    if (query.indexOf('?') >= 0) query = query.split('?').pop();
    var params = new URLSearchParams(query);
    return normalizeContactPayload({
      email: params.get('e') || params.get('email') || params.get('correo') || '',
      name: params.get('n') || params.get('name') || params.get('displayName') || '',
      userId: params.get('u') || params.get('userId') || params.get('id') || ''
    });
  }

  function normalizeContactPayload(payload) {
    var email = normalizeEmail(payload && (payload.email || payload.e || payload.contactEmail || payload.correo));
    if (!isValidEmail(email)) return null;
    var name = String(payload.name || payload.n || payload.displayName || payload.alias || email.split('@')[0]).trim();
    return {
      email: email,
      name: name || email.split('@')[0],
      userId: String(payload.userId || payload.u || payload.id || '').trim(),
      source: 'profile-qr'
    };
  }

  function renderProfileQr(container, profile, options) {
    if (!container) return null;
    var payload = buildProfilePayload(profile || {});
    var matrix = generateMatrix(payload);
    container.innerHTML = matrixToSvg(matrix, options || {});
    container.dataset.qrPayload = payload;
    return { payload: payload, matrix: matrix };
  }

  async function scanFromVideo(video, onDetected, options) {
    options = options || {};
    if (!('BarcodeDetector' in window)) throw new Error('Este navegador no tiene lector QR nativo.');
    var detector = new BarcodeDetector({ formats: ['qr_code'] });
    var stopped = false;
    var detecting = false;
    var lastScanAt = 0;
    var intervalMs = Math.max(180, Math.min(1500, Number(options.intervalMs || 650)));

    async function tick(now) {
      if (stopped) return;
      var timestamp = Number(now || performance.now?.() || Date.now());
      if (detecting || timestamp - lastScanAt < intervalMs) {
        requestAnimationFrame(tick);
        return;
      }

      detecting = true;
      lastScanAt = timestamp;
      try {
        var codes = await detector.detect(video);
        var rawValue = codes && codes[0] && codes[0].rawValue;
        if (rawValue) {
          var contact = parsePayload(rawValue);
          if (contact) {
            onDetected(contact, rawValue);
            stopped = true;
            return;
          }
        }
      } catch (error) {
        if (options.onError) options.onError(error);
      } finally {
        detecting = false;
      }
      if (!stopped) requestAnimationFrame(tick);
    }

    requestAnimationFrame(tick);
    return function stop() { stopped = true; };
  }

  window.ChatERQRCodeLego = {
    version: '1.1.0',
    maxPayloadBytes: MAX_PAYLOAD_BYTES,
    buildProfilePayload: buildProfilePayload,
    parsePayload: parsePayload,
    generateMatrix: generateMatrix,
    matrixToSvg: matrixToSvg,
    renderProfileQr: renderProfileQr,
    scanFromVideo: scanFromVideo
  };
}());
