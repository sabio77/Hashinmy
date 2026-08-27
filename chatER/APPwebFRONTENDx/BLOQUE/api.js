const sessionKey = 'chater_session_token';

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

export async function post(path, body = {}) {
  const headers = { 'Content-Type': 'application/json' };
  const token = getSessionToken();
  if (token) headers['X-Session-Token'] = token;
  const response = await fetch(`${getBackendUrl()}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body || {})
  });
  const data = await response.json().catch(() => ({ ok: false, message: 'Respuesta inválida' }));
  if (!response.ok || data.ok === false) {
    const error = new Error(data.message || 'Error en la solicitud');
    error.status = response.status;
    error.data = data;
    throw error;
  }
  return data;
}


export async function uploadToSignedUrl(url, file, headers = {}) {
  const cleanUrl = String(url || '').trim();
  if (!cleanUrl) throw new Error('No se recibió URL firmada para subir el adjunto.');
  const response = await fetch(cleanUrl, {
    method: 'PUT',
    headers: headers || {},
    body: file
  });
  if (!response.ok) {
    throw new Error('Cloudflare R2 no aceptó la subida del adjunto.');
  }
  return { ok: true, status: response.status };
}
