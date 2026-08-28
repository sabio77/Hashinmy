const sessionKey = 'chater_session_token';
const trafficClientIdKey = 'chater_client_id';
let volatileTrafficClientId = '';

function normalizeTrafficClientId(value = '') {
  return String(value || '').replace(/[^a-z0-9_-]/gi, '').slice(0, 120);
}

export function getTrafficClientId() {
  try {
    const stored = normalizeTrafficClientId(localStorage.getItem(trafficClientIdKey) || '');
    if (stored) return stored;
    const generated = normalizeTrafficClientId(window.crypto?.randomUUID?.() || `client_${Date.now()}_${Math.random().toString(16).slice(2)}`)
      || `client_${Date.now()}`;
    localStorage.setItem(trafficClientIdKey, generated);
    return generated;
  } catch {
    if (volatileTrafficClientId) return volatileTrafficClientId;
    volatileTrafficClientId = normalizeTrafficClientId(window.crypto?.randomUUID?.() || `client_${Date.now()}_${Math.random().toString(16).slice(2)}`)
      || `client_${Date.now()}`;
    return volatileTrafficClientId;
  }
}

export function withTrafficClientId(url = '') {
  const cleanUrl = String(url || '').trim();
  if (!cleanUrl) return cleanUrl;
  const clientId = getTrafficClientId();
  if (!clientId) return cleanUrl;
  try {
    const parsed = new URL(cleanUrl, window.location.href);
    parsed.searchParams.set('clientId', clientId);
    return parsed.toString();
  } catch {
    return cleanUrl;
  }
}

export function getBackendUrl() {
  const runtimeBackendUrl = String(window.APP_RUNTIME_CONFIG?.backendUrl || '').trim().replace(/\/$/, '');
  const legacyExplicitUrl = String(window.chatER_BACKEND_URL || window.CHATER_BACKEND_URL || '').trim().replace(/\/$/, '');
  const backendUrl = runtimeBackendUrl || legacyExplicitUrl;
  if (backendUrl) return backendUrl;
  throw new Error('APP_BACKEND_URL no está configurada para esta instalación de chatER.');
}

export function getSessionToken() {
  return localStorage.getItem(sessionKey) || '';
}

export function setSessionToken(token) {
  if (!token) localStorage.removeItem(sessionKey);
  else localStorage.setItem(sessionKey, token);
}

export async function apiGet(path) {
  const response = await fetch(`${getBackendUrl()}${path}`, { method: 'GET' });
  const data = await response.json().catch(() => ({ ok: false, message: 'Respuesta inválida' }));
  if (!response.ok || data.ok === false) throw new Error(data.message || 'Error en la solicitud');
  return data;
}

function retryAfterMs(response) {
  const raw = String(response?.headers?.get?.('Retry-After') || '').trim();
  if (!raw) return 0;
  const seconds = Number(raw);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(2 * 60 * 60 * 1000, Math.ceil(seconds * 1000));
  const retryAt = Date.parse(raw);
  if (!Number.isFinite(retryAt)) return 0;
  return Math.min(2 * 60 * 60 * 1000, Math.max(0, retryAt - Date.now()));
}

export async function post(path, body = {}, options = {}) {
  const payload = body && typeof body === 'object' && !Array.isArray(body) ? { ...body } : {};
  const token = getSessionToken();
  if (token && !payload.sessionToken) payload.sessionToken = token;
  // text/plain es CORS-safelisted. Al llevar la sesión dentro del JSON serializado
  // evitamos el preflight OPTIONS que application/json + X-Session-Token provocaba
  // para cada endpoint, sin usar cookies ni exponer el token en la URL.
  const response = await fetch(withTrafficClientId(`${getBackendUrl()}${path}`), {
    method: 'POST',
    mode: 'cors',
    credentials: 'omit',
    headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
    body: JSON.stringify(payload),
    signal: options?.signal
  });
  const data = await response.json().catch(() => ({ ok: false, message: 'Respuesta inválida' }));
  if (!response.ok || data.ok === false) {
    const error = new Error(data.message || 'Error en la solicitud');
    error.status = response.status;
    error.data = data;
    error.retryAfterMs = retryAfterMs(response);
    throw error;
  }
  return data;
}


export async function uploadToSignedUrl(url, file, headers = {}, options = {}) {
  const cleanUrl = String(url || '').trim();
  if (!cleanUrl) throw new Error('No se recibió URL firmada para subir el adjunto.');

  const onProgress = typeof options?.onProgress === 'function' ? options.onProgress : null;
  if (onProgress && typeof XMLHttpRequest !== 'undefined') {
    return new Promise((resolve, reject) => {
      const request = new XMLHttpRequest();
      request.open('PUT', cleanUrl, true);
      for (const [name, value] of Object.entries(headers || {})) {
        if (value === undefined || value === null) continue;
        request.setRequestHeader(name, String(value));
      }

      const report = (loaded = 0, total = 0) => {
        if (!total) return;
        const percent = Math.max(0, Math.min(100, Math.round((Number(loaded || 0) / Number(total || 1)) * 100)));
        try { onProgress(percent); } catch {}
      };

      request.upload.addEventListener('loadstart', () => {
        try { onProgress(0); } catch {}
      });
      request.upload.addEventListener('progress', (event) => {
        if (event.lengthComputable) report(event.loaded, event.total);
      });
      request.upload.addEventListener('load', () => {
        try { onProgress(100); } catch {}
      });
      request.addEventListener('load', () => {
        if (request.status >= 200 && request.status < 300) {
          resolve({ ok: true, status: request.status });
          return;
        }
        reject(new Error('Cloudflare R2 no aceptó la subida del adjunto.'));
      });
      request.addEventListener('error', () => reject(new Error('No se pudo completar la subida del adjunto a Cloudflare R2.')));
      request.addEventListener('abort', () => reject(new Error('La subida del adjunto fue cancelada.')));
      request.addEventListener('timeout', () => reject(new Error('La subida del adjunto agotó el tiempo de espera.')));
      request.send(file);
    });
  }

  const response = await fetch(cleanUrl, {
    method: 'PUT',
    headers: headers || {},
    body: file
  });
  if (!response.ok) {
    throw new Error('Cloudflare R2 no aceptó la subida del adjunto.');
  }
  if (onProgress) {
    try { onProgress(100); } catch {}
  }
  return { ok: true, status: response.status };
}
