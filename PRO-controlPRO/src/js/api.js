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

async function request(path, options = {}) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const headers = new Headers(options.headers || {});
  headers.set('Accept', 'application/json');
  headers.set('X-P2P-Application', P2P_APPLICATION_ID);

  const requestSessionToken = getSessionToken();
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

    return data;
  } catch (error) {
    assertRequestSession(requestSessionToken);
    if (error?.name === 'AbortError') {
      throw new Error('El servicio tardó demasiado en responder.');
    }
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
}

export function apiGet(path) {
  return request(path, { method: 'GET' });
}

export function apiPost(path, body = {}) {
  return request(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {})
  });
}
