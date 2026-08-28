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
