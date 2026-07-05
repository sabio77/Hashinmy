import { readFile } from 'node:fs/promises';
import path from 'node:path';

export const MEMORIA_BACKEND_CONFIG_RELATIVE_PATH = 'js/CONFIGmemoriaBACKEND.json';

function readRequiredString(config, key) {
  const value = String(config?.[key] || '').trim();
  if (!value) throw new Error(`El campo ${key} es obligatorio en ${MEMORIA_BACKEND_CONFIG_RELATIVE_PATH}.`);
  return value;
}

export function normalizeConfiguredPublicOrigin(value) {
  const url = new URL(String(value || '').trim());
  url.hash = '';
  url.search = '';
  url.pathname = '/';
  return url.toString();
}

export function normalizeConfiguredBackendUrl(value) {
  const url = new URL(String(value || '').trim());
  url.hash = '';
  url.search = '';
  url.pathname = url.pathname.replace(/\/+$/u, '') || '';
  return url.toString().replace(/\/+$/u, '');
}

export async function loadMemoriaBackendProjectConfig(root) {
  const configPath = path.join(root, MEMORIA_BACKEND_CONFIG_RELATIVE_PATH);
  const raw = await readFile(configPath, 'utf8');
  const config = JSON.parse(raw);
  const ORIGEN_PROYECTO = normalizeConfiguredPublicOrigin(readRequiredString(config, 'ORIGEN_PROYECTO'));
  const MEMORIA_BACKEND_URL = normalizeConfiguredBackendUrl(readRequiredString(config, 'MEMORIA_BACKEND_URL'));
  const MEMORIA_SITE_ID = readRequiredString(config, 'MEMORIA_SITE_ID');

  return Object.freeze({
    ORIGEN_PROYECTO,
    MEMORIA_BACKEND_URL,
    MEMORIA_SITE_ID
  });
}

export function getConfiguredPublicHost(config) {
  return new URL(config.ORIGEN_PROYECTO).hostname;
}
