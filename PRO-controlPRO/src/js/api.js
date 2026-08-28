import { P2P_APPLICATION_ID, scopedStorageKey } from './application-scope.js';
export const SESSION_STORAGE_KEY = scopedStorageKey('semilla_google_session_token');
export const SESSION_CHANGED_ERROR_CODE = 'APP_SESSION_CHANGED';
const REQUEST_TIMEOUT_MS = 15000;

export function parseRetryAfterSeconds(value = '', now = Date.now()) {
  const raw = String(value || '').trim();
  if (!raw) return 0;
  const numericSeconds = Number(raw);
  if (Number.isFinite(numericSeconds)) return Math.max(0, Math.ceil(numericSeconds));
  const retryAt = Date.parse(raw);
  if (!Number.isFinite(retryAt)) return 0;
  const referenceNow = Number(now);
  return Math.max(0, Math.ceil((retryAt - (Number.isFinite(referenceNow) ? referenceNow : Date.now())) / 1000));
}

function isP2PCapacityRetry(error = null) {
  const code = String(error?.code || '').trim().toUpperCase();
  return Number(error?.status || 0) === 429 && (
    Number(error?.retryAfterSeconds || 0) > 0
    || ['P2P_BOOTSTRAP_RATE_LIMITED', 'P2P_PUBLISH_RATE_LIMITED', 'P2P_CONTROL_RATE_LIMITED'].includes(code)
  );
}

function cleanUrl(value = '') {
  return String(value || '').trim().replace(/\/+$/, '');
}

function cleanToken(value = '') {
  return String(value || '').trim();
}

export function getBackendUrl() {
  const configured = cleanUrl(window.APP_SEED_CONFIG?.backendUrl || window.APP_RUNTIME_CONFIG?.backendUrl || '');
  if (configured) return configured;

  const host = String(window.location.hostname || '').toLowerCase();
  if (host === 'localhost' || host === '127.0.0.1') return 'http://localhost:10000';

  const error = new Error('BACKEND_NOT_CONFIGURED');
  error.code = 'BACKEND_NOT_CONFIGURED';
  throw error;
}

export function getSessionToken() {
  try {
    return cleanToken(window.localStorage.getItem(SESSION_STORAGE_KEY));
  } catch {
    return '';
  }
}

export function setSessionToken(token = '') {
  const cleanSessionToken = cleanToken(token);
  try {
    if (cleanSessionToken) window.localStorage.setItem(SESSION_STORAGE_KEY, cleanSessionToken);
    else window.localStorage.removeItem(SESSION_STORAGE_KEY);
  } catch {
    // La sesión seguirá siendo válida en Firebase, pero no persistirá si el navegador bloquea storage.
  }
  return cleanSessionToken;
}

export function clearSessionToken(expectedToken = null) {
  const expected = expectedToken === null ? null : cleanToken(expectedToken);
  if (expected !== null && getSessionToken() !== expected) return false;
  setSessionToken('');
  return getSessionToken() === '';
}

export function createSessionChangedError() {
  const error = new Error('La sesión cambió en otra ventana. La respuesta anterior fue descartada para proteger los datos de la cuenta activa.');
  error.code = SESSION_CHANGED_ERROR_CODE;
  error.sessionChanged = true;
  return error;
}

export function isSessionChangedError(error = null) {
  return Boolean(error?.sessionChanged || error?.code === SESSION_CHANGED_ERROR_CODE);
}

export function subscribeSessionTokenChanges(listener, options = {}) {
  const windowRef = options.windowRef || globalThis.window;
  if (!windowRef?.addEventListener || typeof listener !== 'function') return () => {};
  const handler = (event = {}) => {
    if (event.key !== SESSION_STORAGE_KEY) return;
    listener({
      previousToken: cleanToken(event.oldValue),
      token: cleanToken(event.newValue),
      event
    });
  };
  windowRef.addEventListener('storage', handler);
  return () => windowRef.removeEventListener?.('storage', handler);
}

function assertRequestSession(requestSessionToken = '') {
  if (requestSessionToken && getSessionToken() !== requestSessionToken) {
    throw createSessionChangedError();
  }
}

const REQUEST_MAX_ATTEMPTS = 3;
const REQUEST_RETRY_BASE_MS = 400;
const REQUEST_RETRY_MAX_MS = 5000;
const REQUEST_RETRYABLE_HTTP_STATUSES = new Set([408, 425, 500, 502, 503, 504]);

// Solo estos POST tienen semántica de reintento verificada dentro del contrato actual.
// /api/bootstrap es una lectura de sesión; /api/p2p/bootstrap puede repetirse con el
// mismo dispositivo porque su registro, reconciliación y despachos usan claves
// deterministas/idempotentes en el backend. Cualquier otro POST requiere optar
// explícitamente con { idempotent: true } después de auditar su operación.
const REQUEST_RETRY_SAFE_POST_PATHS = new Set([
  '/api/bootstrap',
  '/api/p2p/bootstrap'
]);

function requestRetrySafe(path = '', method = 'GET', retryOptions = {}) {
  const normalizedMethod = String(method || 'GET').trim().toUpperCase();
  if (['GET', 'HEAD', 'OPTIONS'].includes(normalizedMethod)) return true;
  if (normalizedMethod !== 'POST') return retryOptions.idempotent === true;
  if (retryOptions.idempotent === true) return true;
  if (retryOptions.idempotent === false) return false;
  const normalizedPath = String(path || '').trim().split('?', 1)[0];
  return REQUEST_RETRY_SAFE_POST_PATHS.has(normalizedPath);
}

function requestRetryable(error = null) {
  if (isSessionChangedError(error)) return false;
  if (error?.retryable === false) return false;
  if (error?.retryable === true) return true;
  const status = Math.max(0, Number(error?.status || 0));
  // Un 429 ya consumió una HTTP Response y expresa una ventana/cuota autoritativa.
  // No se reintenta dentro de la misma llamada: el flujo P2P usa Retry-After para
  // agendar una recuperación única y los límites funcionales quedan terminales.
  if (status === 429) return false;
  // Solo se repiten estados que suelen representar fallos transitorios de transporte/gateway.
  // 501/505/506/507/508/510/511 requieren implementación, configuración, capacidad o acción
  // externa; repetirlos inmediatamente solo consume HTTP Responses sin aumentar la recuperación.
  if (REQUEST_RETRYABLE_HTTP_STATUSES.has(status)) return true;
  return status === 0 && (
    error?.name === 'TypeError'
    || error?.name === 'AbortError'
    || ['REQUEST_TIMEOUT', 'NETWORK_ERROR'].includes(String(error?.code || '').trim().toUpperCase())
  );
}

function requestRetryDelay(error = null, attempt = 1) {
  const retryAfterMs = Math.max(0, Number(error?.retryAfterSeconds || 0)) * 1000;
  if (retryAfterMs > 0) return Math.min(REQUEST_RETRY_MAX_MS, retryAfterMs);
  const exponent = Math.max(0, Math.floor(Number(attempt || 1)) - 1);
  return Math.min(REQUEST_RETRY_MAX_MS, REQUEST_RETRY_BASE_MS * (2 ** exponent));
}

function requestAudit(stage = '', context = {}) {
  const detail = {
    stage: String(stage || '').trim().slice(0, 100),
    requestId: String(context.requestId || '').trim(),
    method: String(context.method || 'GET').trim().toUpperCase().slice(0, 12),
    path: String(context.path || '').trim().slice(0, 240),
    attempt: Math.max(0, Number(context.attempt || 0)),
    maxAttempts: Math.max(1, Number(context.maxAttempts || REQUEST_MAX_ATTEMPTS)),
    retryable: context.retryable === true,
    terminal: context.terminal === true,
    previousStatePreserved: true,
    retryDelayMs: Math.max(0, Number(context.retryDelayMs || 0)),
    online: typeof navigator === 'undefined' ? true : navigator.onLine !== false,
    error: context.error ? {
      name: String(context.error?.name || 'Error'),
      code: String(context.error?.code || ''),
      status: Math.max(0, Number(context.error?.status || 0)),
      message: String(context.error?.message || 'No se pudo completar la solicitud.').slice(0, 800)
    } : null,
    at: new Date().toISOString()
  };
  const logger = detail.terminal ? console.error : console.warn;
  logger('[SemillaP2P][REQUEST_AUDIT]', detail);
  return detail;
}

async function requestAttempt(path, options = {}, requestSessionToken = '') {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const headers = new Headers(options.headers || {});
  headers.set('Accept', 'application/json');
  headers.set('X-P2P-Application', P2P_APPLICATION_ID);
  if (requestSessionToken) headers.set('X-Session-Token', requestSessionToken);

  try {
    const response = await fetch(`${getBackendUrl()}${path}`, {
      ...options,
      headers,
      signal: controller.signal,
      credentials: 'omit',
      cache: 'no-store'
    });

    assertRequestSession(requestSessionToken);
    const data = await response.json().catch(() => ({
      ok: false,
      message: 'El servicio devolvió una respuesta no válida.'
    }));
    assertRequestSession(requestSessionToken);

    if (!response.ok || data?.ok === false) {
      const error = new Error(data?.message || 'No se pudo completar la solicitud.');
      error.status = response.status;
      error.data = data;
      error.retryAfterSeconds = parseRetryAfterSeconds(response.headers.get('Retry-After'))
        || parseRetryAfterSeconds(data?.retryAfterSeconds);
      if (error.retryAfterSeconds > 0) error.retryAt = Date.now() + (error.retryAfterSeconds * 1000);
      const responseCode = String(data?.code || '').trim().toUpperCase();
      if (/^[A-Z0-9_]{3,80}$/.test(responseCode)) error.code = responseCode;
      throw error;
    }

    return data;
  } catch (error) {
    assertRequestSession(requestSessionToken);
    if (error?.name === 'AbortError') {
      const timeoutError = new Error('El servicio tardó demasiado en responder.');
      timeoutError.name = 'TimeoutError';
      timeoutError.code = 'REQUEST_TIMEOUT';
      timeoutError.retryable = true;
      throw timeoutError;
    }
    if (error?.name === 'TypeError' && !error?.status) {
      error.code = String(error?.code || 'NETWORK_ERROR');
      error.retryable = true;
    }
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
}

async function request(path, options = {}, retryOptions = {}) {
  const requestSessionToken = getSessionToken();
  const method = String(options.method || 'GET').trim().toUpperCase();
  const retrySafe = requestRetrySafe(path, method, retryOptions);
  const requestedMaxAttempts = Math.min(3, Math.max(1, Math.floor(Number(retryOptions.maxAttempts || REQUEST_MAX_ATTEMPTS))));
  // Un POST no auditado como idempotente ejecuta una sola vez la operación. Así una
  // respuesta perdida no dispara una segunda mutación ni consume respuestas HTTP
  // adicionales. Los flujos especializados (outbox/watchdogs) conservan sus propios
  // reintentos con identificadores idempotentes.
  const maxAttempts = retrySafe ? requestedMaxAttempts : 1;
  const audit = retryOptions.audit !== false;
  const requestId = `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  let lastError = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    assertRequestSession(requestSessionToken);
    try {
      return await requestAttempt(path, options, requestSessionToken);
    } catch (error) {
      if (isSessionChangedError(error)) throw error;
      lastError = error;
      const retryable = requestRetryable(error);
      const terminal = !retryable || attempt >= maxAttempts;
      const retryDelayMs = terminal ? 0 : requestRetryDelay(error, attempt);
      if (audit) requestAudit(terminal ? 'request-failed' : 'request-retry', {
        requestId,
        method,
        path,
        attempt,
        maxAttempts,
        retryable,
        terminal,
        retryDelayMs,
        error
      });
      if (terminal) {
        if (error && typeof error === 'object') {
          error.requestAttempts = attempt;
          error.requestMaxAttempts = maxAttempts;
          error.requestRetryExhausted = retryable && attempt >= maxAttempts;
          error.requestRetrySafetyLimited = retryable && !retrySafe;
          error.previousStatePreserved = true;
        }
        if (isP2PCapacityRetry(error) && String(path || '').startsWith('/api/p2p/')) {
          window.dispatchEvent(new CustomEvent('p2p:rate-limited', {
            detail: {
              path: String(path || ''),
              error,
              retryAfterSeconds: error.retryAfterSeconds,
              retryAt: error.retryAt || 0
            }
          }));
        }
        throw error;
      }
      await new Promise((resolve) => window.setTimeout(resolve, retryDelayMs));
    }
  }
  throw lastError || new Error('No se pudo completar la solicitud.');
}

export function apiGet(path, retryOptions = {}) {
  return request(path, { method: 'GET' }, retryOptions);
}

export function apiPost(path, body = {}, retryOptions = {}) {
  return request(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {})
  }, retryOptions);
}
