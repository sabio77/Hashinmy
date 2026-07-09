const sessionKey = 'chater_session_token';
export const SESSION_STORAGE_KEY = sessionKey;
let volatileSessionToken = '';
const DEFAULT_API_TIMEOUT_MS = 25000;
const MIN_API_TIMEOUT_MS = 5000;
const MAX_API_TIMEOUT_MS = 120000;
const DEFAULT_UPLOAD_TIMEOUT_MS = 120000;
const MAX_UPLOAD_TIMEOUT_MS = 10 * 60 * 1000;

const REQUEST_ID_PREFIX = 'chater-web';
let requestRandomCounter = 0;

function fallbackEntropyHex(bytes = 8) {
  requestRandomCounter = (requestRandomCounter + 1) % 1000000;
  const requestedBytes = Math.max(1, Math.min(32, Number(bytes || 8)));
  const nowPart = Date.now().toString(16);
  const perfPart = String(Math.floor((globalThis?.performance?.now?.() || 0) * 1000)).replace(/[^0-9]/g, '').slice(-10);
  const counterPart = requestRandomCounter.toString(16).padStart(6, '0');
  return `${nowPart}${perfPart}${counterPart}`.slice(0, requestedBytes * 2).padEnd(requestedBytes * 2, '0');
}

function randomHex(bytes = 8) {
  try {
    if (window?.crypto?.getRandomValues) {
      const values = new Uint8Array(Math.max(1, Number(bytes || 8)));
      window.crypto.getRandomValues(values);
      return Array.from(values).map((value) => value.toString(16).padStart(2, '0')).join('');
    }
  } catch {}
  return fallbackEntropyHex(bytes);
}

function sanitizeRequestIdPart(value = '', maxLength = 48, fallback = 'api') {
  return String(value || '')
    .trim()
    .replace(/[^A-Za-z0-9._:-]/g, '-')
    .replace(/-+/g, '-')
    .slice(0, Math.max(1, Number(maxLength || 48))) || fallback;
}

function createRequestId(method = 'GET', path = '') {
  const methodPart = sanitizeRequestIdPart(method || 'GET', 8).toLowerCase();
  const pathPart = sanitizeRequestIdPart(String(path || '').replace(/^\/api\//, '').replace(/\//g, '-'), 36).toLowerCase();
  return `${REQUEST_ID_PREFIX}-${methodPart}-${pathPart}-${Date.now().toString(36)}-${randomHex(6)}`.slice(0, 80);
}

function responseRequestId(response = null, fallback = '') {
  try {
    const raw = response?.headers?.get?.('X-Request-Id') || fallback || '';
    return raw ? sanitizeRequestIdPart(raw, 80, '') : '';
  } catch {
    return fallback ? sanitizeRequestIdPart(fallback, 80, '') : '';
  }
}

function annotateTransportError(error = null, { requestId = '', path = '' } = {}) {
  if (!error || typeof error !== 'object') return error;
  const trackingId = sanitizeRequestIdPart(requestId || '', 80, '');
  if (trackingId) {
    error.requestId = error.requestId || trackingId;
    if (typeof error.message === 'string' && !/Código de seguimiento:/i.test(error.message)) {
      error.message = `${error.message} Código de seguimiento: ${trackingId}.`;
    }
  }
  if (path) error.path = error.path || String(path || '');
  return error;
}

function buildApiError(message = 'Error en la solicitud', { response = null, data = null, requestId = '', path = '' } = {}) {
  const trackingId = responseRequestId(response, requestId);
  const cleanMessage = String(message || 'Error en la solicitud').trim() || 'Error en la solicitud';
  const error = new Error(trackingId ? `${cleanMessage} Código de seguimiento: ${trackingId}.` : cleanMessage);
  error.status = Number(response?.status || 0) || undefined;
  error.data = data || undefined;
  error.requestId = trackingId || undefined;
  error.path = String(path || '') || undefined;
  return error;
}

function toPositiveNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function clampTimeoutMs(value, fallback, min, max) {
  const resolved = toPositiveNumber(value, fallback);
  return Math.min(max, Math.max(min, resolved));
}

function getWindowNumber(name = '', fallback = 0) {
  try {
    return toPositiveNumber(window?.[name], fallback);
  } catch {
    return fallback;
  }
}

function apiTimeoutMs(overrideMs = 0) {
  return clampTimeoutMs(
    overrideMs || getWindowNumber('chatER_API_TIMEOUT_MS', 0) || getWindowNumber('CHATER_API_TIMEOUT_MS', 0),
    DEFAULT_API_TIMEOUT_MS,
    MIN_API_TIMEOUT_MS,
    MAX_API_TIMEOUT_MS
  );
}

function uploadTimeoutMs(file = null, overrideMs = 0) {
  const size = Number(file?.size || 0);
  const adaptiveMs = DEFAULT_UPLOAD_TIMEOUT_MS + Math.ceil(size / (1024 * 1024)) * 30000;
  return clampTimeoutMs(
    overrideMs || getWindowNumber('chatER_UPLOAD_TIMEOUT_MS', 0) || getWindowNumber('CHATER_UPLOAD_TIMEOUT_MS', 0),
    adaptiveMs,
    DEFAULT_UPLOAD_TIMEOUT_MS,
    MAX_UPLOAD_TIMEOUT_MS
  );
}

async function fetchWithTimeout(url, options = {}, timeoutMs = DEFAULT_API_TIMEOUT_MS) {
  if (typeof AbortController === 'undefined') return fetch(url, options);
  const controller = new AbortController();
  const externalSignal = options?.signal;
  let timedOut = false;
  let timeoutId = 0;
  const abortFromExternalSignal = () => controller.abort(externalSignal?.reason);
  if (externalSignal) {
    if (externalSignal.aborted) abortFromExternalSignal();
    else externalSignal.addEventListener('abort', abortFromExternalSignal, { once: true });
  }
  try {
    timeoutId = window.setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, Math.max(1, Number(timeoutMs || DEFAULT_API_TIMEOUT_MS)));
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (error) {
    if (timedOut || error?.name === 'AbortError') {
      const timeoutError = new Error('La conexión tardó demasiado. Verifica tu internet e inténtalo nuevamente.');
      timeoutError.code = 'request_timeout';
      timeoutError.cause = error;
      throw timeoutError;
    }
    throw error;
  } finally {
    if (timeoutId) window.clearTimeout(timeoutId);
    if (externalSignal && !externalSignal.aborted) {
      try { externalSignal.removeEventListener('abort', abortFromExternalSignal); } catch {}
    }
  }
}

async function readJsonResponse(response) {
  return response.json().catch(() => ({ ok: false, message: 'Respuesta inválida' }));
}

function isLocalBackendHost(hostname = '') {
  return ['localhost', '127.0.0.1', '[::1]'].includes(String(hostname || '').trim().toLowerCase());
}

function normalizeBackendBaseUrl(value = '') {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    const url = new URL(raw, window.location.href);
    if (!['http:', 'https:'].includes(url.protocol)) return '';
    if (!url.hostname || url.username || url.password) return '';

    // Punto débil corregido: la URL pública del backend debe actuar como origen
    // base de API, no como ruta arbitraria. Se descartan path/query/hash para
    // evitar solicitudes rotas al concatenar paths de app con rutas API y se permite HTTP
    // solo en localhost, preservando Render/producción sobre HTTPS.
    if (url.protocol === 'http:' && !isLocalBackendHost(url.hostname)) return '';
    return `${url.protocol}//${url.host}`;
  } catch {
    return '';
  }
}

export function getBackendUrl() {
  const explicit = normalizeBackendBaseUrl(window.chatER_BACKEND_URL || window.CHATER_BACKEND_URL || '');
  if (explicit) return explicit;
  const host = window.location.hostname;
  if (host === 'localhost' || host === '127.0.0.1') return 'http://localhost:10000';
  return 'https://mapsx.app';
}

function readLocalSessionToken() {
  try {
    if (typeof localStorage === 'undefined') return '';
    return localStorage.getItem(sessionKey) || '';
  } catch {
    return '';
  }
}

function writeLocalSessionToken(token = '') {
  try {
    if (typeof localStorage === 'undefined') return false;
    if (!token) localStorage.removeItem(sessionKey);
    else localStorage.setItem(sessionKey, token);
    return true;
  } catch {
    return false;
  }
}

export function getSessionToken() {
  const storedToken = readLocalSessionToken();
  if (storedToken) {
    volatileSessionToken = storedToken;
    return storedToken;
  }
  return volatileSessionToken;
}

export function setSessionToken(token) {
  const cleanToken = String(token || '').trim();
  volatileSessionToken = cleanToken;
  writeLocalSessionToken(cleanToken);
}

export async function apiGet(path, options = {}) {
  const requestId = sanitizeRequestIdPart(options.requestId || createRequestId('GET', path), 80);
  let response;
  try {
    response = await fetchWithTimeout(`${getBackendUrl()}${path}`, {
      method: 'GET',
      headers: { 'X-Request-Id': requestId }
    }, apiTimeoutMs(options.timeoutMs));
  } catch (error) {
    throw annotateTransportError(error, { requestId, path });
  }
  const data = await readJsonResponse(response);
  if (!response.ok || data.ok === false) {
    throw buildApiError(data.message || 'Error en la solicitud', { response, data, requestId, path });
  }
  return data;
}

export async function post(path, body = {}, options = {}) {
  const requestId = sanitizeRequestIdPart(options.requestId || createRequestId('POST', path), 80);
  const headers = { 'Content-Type': 'application/json', 'X-Request-Id': requestId };
  const token = getSessionToken();
  if (token) headers['X-Session-Token'] = token;
  let response;
  try {
    response = await fetchWithTimeout(`${getBackendUrl()}${path}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body || {})
    }, apiTimeoutMs(options.timeoutMs));
  } catch (error) {
    throw annotateTransportError(error, { requestId, path });
  }
  const data = await readJsonResponse(response);
  if (!response.ok || data.ok === false) {
    throw buildApiError(data.message || 'Error en la solicitud', { response, data, requestId, path });
  }
  return data;
}


export async function uploadToSignedUrl(url, file, headers = {}, options = {}) {
  const cleanUrl = String(url || '').trim();
  if (!cleanUrl) throw new Error('No se recibió URL firmada para subir el adjunto.');
  const response = await fetchWithTimeout(cleanUrl, {
    method: 'PUT',
    headers: headers || {},
    body: file
  }, uploadTimeoutMs(file, options.timeoutMs));
  if (!response.ok) {
    throw new Error('Cloudflare R2 no aceptó la subida del adjunto.');
  }
  return { ok: true, status: response.status };
}
