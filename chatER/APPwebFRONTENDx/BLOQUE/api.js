const sessionKey = 'chater_session_token';

export function getBackendUrl() {
  const explicit = String(window.chatER_BACKEND_URL || window.CHATER_BACKEND_URL || '').trim().replace(/\/$/, '');
  if (explicit) return explicit;
  const host = window.location.hostname;
  if (host === 'localhost' || host === '127.0.0.1') return 'http://localhost:10000';
  return 'https://mapsx.app';
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
