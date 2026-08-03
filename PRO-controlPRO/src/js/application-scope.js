function clean(value = '') {
  return String(value || '').trim();
}

export function normalizeApplicationId(value = '') {
  const raw = clean(value);
  if (!raw || raw === '/' || raw === '.' || raw.toLowerCase() === 'root') return 'root';
  let decoded = raw;
  try {
    decoded = decodeURIComponent(raw);
  } catch {}
  const pathOnly = decoded.split(/[?#]/, 1)[0].replace(/^\/+|\/+$/g, '');
  if (!pathOnly) return 'root';
  if (pathOnly.length > 180) return '';
  const segments = pathOnly.split('/');
  if (segments.length > 8) return '';
  if (!segments.every((segment) => /^[a-z0-9](?:[a-z0-9._-]{0,62}[a-z0-9])?$/i.test(segment))) return '';
  return segments.join('/');
}

function inferApplicationId() {
  const rawMetadataId = clean(globalThis.APP_SEED_METADATA?.applicationId || '');
  if (rawMetadataId) {
    const metadataId = normalizeApplicationId(rawMetadataId);
    if (metadataId) return metadataId;
  }
  const basePath = clean(globalThis.document?.baseURI ? new URL('./', globalThis.document.baseURI).pathname : '');
  return normalizeApplicationId(basePath) || 'root';
}

function storageScope(applicationId = '') {
  return (normalizeApplicationId(applicationId) || 'root').replace(/\//g, '~');
}

export const P2P_APPLICATION_ID = inferApplicationId();
export const P2P_APPLICATION_STORAGE_SCOPE = storageScope(P2P_APPLICATION_ID);
export const P2P_APPLICATION_BASE_URL = clean(globalThis.APP_SEED_METADATA?.applicationBaseUrl || '');

export function scopedStorageKey(baseKey = '') {
  const base = clean(baseKey);
  if (!base) throw new Error('Falta la clave base para crear un almacenamiento aislado por aplicación.');
  return P2P_APPLICATION_ID === 'root' ? base : `${base}:${P2P_APPLICATION_STORAGE_SCOPE}`;
}

export function scopedChannelName(baseName = '') {
  const base = clean(baseName);
  if (!base) throw new Error('Falta el nombre base para crear un canal aislado por aplicación.');
  return P2P_APPLICATION_ID === 'root' ? base : `${base}:${P2P_APPLICATION_STORAGE_SCOPE}`;
}
