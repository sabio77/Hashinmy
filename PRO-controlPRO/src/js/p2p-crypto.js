const P2P_APPLICATION_STORAGE_SCOPE = String(globalThis.APP_SEED_METADATA?.applicationStorageScope || 'root')
  .trim()
  .replace(/[^a-zA-Z0-9._~:-]/g, '_')
  .slice(0, 180) || 'root';
const CRYPTO_DB_PREFIX = P2P_APPLICATION_STORAGE_SCOPE === 'root'
  ? 'semilla_p2p_crypto_v1'
  : `semilla_p2p_crypto_v1_${P2P_APPLICATION_STORAGE_SCOPE}`;
const CRYPTO_DB_VERSION = 1;
const RECORD_STORE = 'records';
const DEFERRED_STORE = 'deferredEvents';
const IDENTITY_RECORD_ID = 'deviceIdentity';
const SIGNING_IDENTITY_RECORD_ID = 'deviceSigningIdentity';
const STORAGE_WRAPPING_KEY_RECORD_ID = 'storageWrappingKey';
const ACTIVE_KEY_PREFIX = 'activeSpaceKey:';
const SPACE_KEY_PREFIX = 'spaceKey:';
const ENCRYPTION_VERSION = 1;
const SPACE_KEY_BYTES = 32;
const MAX_DEFERRED_EVENTS = 5000;

const state = {
  userId: '',
  deviceId: '',
  db: null,
  dbPromise: null
};

function cleanScope(value = '') {
  return String(value || '').trim().replace(/[^a-zA-Z0-9._:-]/g, '_').slice(0, 180);
}

function databaseName() {
  const user = cleanScope(state.userId);
  if (!user) throw new Error('No se configuró la cuenta para el almacén criptográfico P2P.');
  return `${CRYPTO_DB_PREFIX}_${user}`;
}

function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('No se pudo completar una operación criptográfica local.'));
  });
}

function transactionDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error('No se pudo confirmar una operación criptográfica local.'));
    transaction.onabort = () => reject(transaction.error || new Error('La operación criptográfica local fue cancelada.'));
  });
}

function openCryptoDatabase() {
  if (state.db) return Promise.resolve(state.db);
  if (state.dbPromise) return state.dbPromise;
  state.dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName(), CRYPTO_DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(RECORD_STORE)) db.createObjectStore(RECORD_STORE, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(DEFERRED_STORE)) {
        const store = db.createObjectStore(DEFERRED_STORE, { keyPath: 'eventKey' });
        store.createIndex('spaceId', 'spaceId', { unique: false });
      }
    };
    request.onsuccess = () => {
      state.db = request.result;
      state.db.onversionchange = () => {
        state.db?.close();
        state.db = null;
        state.dbPromise = null;
      };
      resolve(state.db);
    };
    request.onerror = () => reject(request.error || new Error('No se pudo abrir el almacén criptográfico P2P.'));
    request.onblocked = () => reject(new Error('El almacén criptográfico P2P está bloqueado por otra versión abierta.'));
  }).finally(() => {
    if (!state.db) state.dbPromise = null;
  });
  return state.dbPromise;
}

async function withStore(storeName, mode, callback) {
  const db = await openCryptoDatabase();
  const transaction = db.transaction(storeName, mode);
  const result = await callback(transaction.objectStore(storeName), transaction);
  await transactionDone(transaction);
  return result;
}

function bytesToBase64Url(bytes = new Uint8Array()) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlToBytes(value = '') {
  const clean = String(value || '').trim().replace(/-/g, '+').replace(/_/g, '/');
  const padded = clean + '='.repeat((4 - (clean.length % 4)) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function randomBytes(length = 16) {
  const bytes = new Uint8Array(length);
  globalThis.crypto.getRandomValues(bytes);
  return bytes;
}

export function canonicalizeP2PLocalValue(value) {
  if (value === null || typeof value !== 'object') {
    const encoded = JSON.stringify(value);
    if (encoded === undefined) throw new TypeError('La carga firmada contiene un valor no serializable.');
    return encoded;
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalizeP2PLocalValue(item === undefined ? null : item)).join(',')}]`;
  }
  const entries = Object.keys(value)
    .filter((key) => JSON.stringify(value[key]) !== undefined)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalizeP2PLocalValue(value[key])}`);
  return `{${entries.join(',')}}`;
}

async function sha256Bytes(value = '') {
  const source = typeof value === 'string' ? new TextEncoder().encode(value) : value;
  return new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', source));
}

function normalizePublicKeyJwk(value = {}) {
  if (!value || typeof value !== 'object') return null;
  const key = {
    kty: String(value.kty || '').trim(),
    crv: String(value.crv || '').trim(),
    x: String(value.x || '').trim(),
    y: String(value.y || '').trim(),
    ext: true,
    key_ops: []
  };
  if (key.kty !== 'EC' || key.crv !== 'P-256') return null;
  if (!/^[A-Za-z0-9_-]{40,90}$/.test(key.x) || !/^[A-Za-z0-9_-]{40,90}$/.test(key.y)) return null;
  return key;
}

function normalizePrivateKeyJwk(value = {}) {
  const publicPart = normalizePublicKeyJwk(value);
  const d = String(value?.d || '').trim();
  if (!publicPart || !/^[A-Za-z0-9_-]{40,90}$/.test(d)) return null;
  return { ...publicPart, d, key_ops: ['deriveBits'] };
}

function envelopeShape(value = {}) {
  const envelope = value && typeof value === 'object' ? value : {};
  const publicKey = normalizePublicKeyJwk(envelope.senderPublicKey || {});
  const normalized = {
    version: Number(envelope.version || 0),
    algorithm: String(envelope.algorithm || ''),
    keyId: String(envelope.keyId || '').trim().slice(0, 120),
    senderDeviceId: String(envelope.senderDeviceId || '').trim().slice(0, 180),
    recipientDeviceId: String(envelope.recipientDeviceId || '').trim().slice(0, 180),
    senderPublicKey: publicKey,
    salt: String(envelope.salt || '').trim(),
    iv: String(envelope.iv || '').trim(),
    ciphertext: String(envelope.ciphertext || '').trim(),
    createdAt: String(envelope.createdAt || '').trim().slice(0, 80)
  };
  if (normalized.version !== ENCRYPTION_VERSION || normalized.algorithm !== 'ECDH-P256+HKDF-SHA256+A256GCM') return null;
  if (!normalized.keyId || !normalized.senderDeviceId || !normalized.recipientDeviceId || !normalized.senderPublicKey) return null;
  if (!/^[A-Za-z0-9_-]{16,128}$/.test(normalized.salt)) return null;
  if (!/^[A-Za-z0-9_-]{12,64}$/.test(normalized.iv)) return null;
  if (!/^[A-Za-z0-9_-]{24,1000}$/.test(normalized.ciphertext)) return null;
  return normalized;
}

function encryptedPayloadShape(payload = {}) {
  const encrypted = payload?.__p2pEncrypted;
  if (!encrypted || typeof encrypted !== 'object') return null;
  const normalized = {
    version: Number(encrypted.version || 0),
    algorithm: String(encrypted.algorithm || ''),
    keyId: String(encrypted.keyId || '').trim().slice(0, 120),
    iv: String(encrypted.iv || '').trim(),
    ciphertext: String(encrypted.ciphertext || '').trim()
  };
  if (normalized.version !== ENCRYPTION_VERSION || normalized.algorithm !== 'A256GCM') return null;
  if (!normalized.keyId || !/^[A-Za-z0-9_-]{12,64}$/.test(normalized.iv)) return null;
  if (!/^[A-Za-z0-9_-]{20,500000}$/.test(normalized.ciphertext)) return null;
  return normalized;
}

function createMissingKeyError(spaceId = '', keyId = '') {
  const error = new Error('Este dispositivo todavía no recibió la clave cifrada del espacio compartido.');
  error.code = 'P2P_SPACE_KEY_MISSING';
  error.spaceId = String(spaceId || '').trim();
  error.keyId = String(keyId || '').trim();
  error.retryable = true;
  return error;
}

function createRejectedKeyEnvelopeError(message = '', reason = 'invalid_envelope') {
  const error = new Error(message || 'El sobre cifrado de la clave compartida fue rechazado.');
  error.code = 'P2P_KEY_ENVELOPE_REJECTED';
  error.reason = String(reason || 'invalid_envelope').trim();
  error.remoteEnvelopeRejected = true;
  error.retryable = false;
  return error;
}

export function isRejectedKeyEnvelopeError(error = null) {
  return Boolean(
    error
    && error.code === 'P2P_KEY_ENVELOPE_REJECTED'
    && error.remoteEnvelopeRejected === true
    && error.retryable === false
  );
}

export function createRejectedEncryptedPayloadError(message = '', reason = 'invalid_payload') {
  const error = new Error(message || 'El contenido cifrado remoto fue rechazado porque no pudo autenticarse.');
  error.code = 'P2P_ENCRYPTED_PAYLOAD_REJECTED';
  error.reason = String(reason || 'invalid_payload').trim();
  error.remotePayloadRejected = true;
  error.retryable = false;
  return error;
}

export function isRejectedEncryptedPayloadError(error = null) {
  return Boolean(
    error
    && error.code === 'P2P_ENCRYPTED_PAYLOAD_REJECTED'
    && error.remotePayloadRejected === true
    && error.retryable === false
  );
}

function isPrivateIdentityKey(value = null) {
  return Boolean(
    value && typeof value === 'object'
    && value.type === 'private'
    && value.extractable === false
    && value.algorithm?.name === 'ECDH'
    && value.algorithm?.namedCurve === 'P-256'
    && Array.isArray(value.usages)
    && value.usages.includes('deriveBits')
  );
}

function isPrivateSigningKey(value = null) {
  return Boolean(
    value && typeof value === 'object'
    && value.type === 'private'
    && value.extractable === false
    && value.algorithm?.name === 'ECDSA'
    && value.algorithm?.namedCurve === 'P-256'
    && Array.isArray(value.usages)
    && value.usages.includes('sign')
  );
}

function isStorageWrappingKey(value = null) {
  return Boolean(
    value && typeof value === 'object'
    && value.type === 'secret'
    && value.extractable === false
    && value.algorithm?.name === 'AES-GCM'
    && Number(value.algorithm?.length || 0) === 256
    && Array.isArray(value.usages)
    && value.usages.includes('encrypt')
    && value.usages.includes('decrypt')
  );
}

async function importPrivateIdentity(jwk = {}) {
  const normalized = normalizePrivateKeyJwk(jwk);
  if (!normalized) throw new Error('La identidad criptográfica privada del dispositivo no es válida.');
  return globalThis.crypto.subtle.importKey(
    'jwk',
    normalized,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    ['deriveBits']
  );
}

async function resolvePrivateIdentity(value = null) {
  if (isPrivateIdentityKey(value)) return value;
  return importPrivateIdentity(value || {});
}

async function importPublicIdentity(jwk = {}) {
  const normalized = normalizePublicKeyJwk(jwk);
  if (!normalized) throw new Error('La identidad criptográfica pública del dispositivo no es válida.');
  return globalThis.crypto.subtle.importKey(
    'jwk',
    normalized,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    []
  );
}

async function deriveWrappingKey(privateIdentity = null, publicJwk = {}, saltBytes = new Uint8Array(), info = '') {
  const privateKey = await resolvePrivateIdentity(privateIdentity);
  const publicKey = await importPublicIdentity(publicJwk);
  const sharedBits = await globalThis.crypto.subtle.deriveBits({ name: 'ECDH', public: publicKey }, privateKey, 256);
  const hkdfMaterial = await globalThis.crypto.subtle.importKey('raw', sharedBits, 'HKDF', false, ['deriveKey']);
  return globalThis.crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: saltBytes,
      info: new TextEncoder().encode(info)
    },
    hkdfMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

async function loadRecord(id = '') {
  return withStore(RECORD_STORE, 'readonly', (store) => requestToPromise(store.get(id)));
}

async function saveRecord(record = {}) {
  return withStore(RECORD_STORE, 'readwrite', (store) => requestToPromise(store.put(record)));
}

function activeKeyRecordId(spaceId = '') {
  return `${ACTIVE_KEY_PREFIX}${String(spaceId || '').trim()}`;
}

function spaceKeyRecordId(spaceId = '', keyId = '') {
  return `${SPACE_KEY_PREFIX}${String(spaceId || '').trim()}:${String(keyId || '').trim()}`;
}

async function generateDeviceIdentity() {
  const keyPair = await globalThis.crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    ['deriveBits']
  );
  const publicKey = await globalThis.crypto.subtle.exportKey('jwk', keyPair.publicKey);
  return {
    id: IDENTITY_RECORD_ID,
    version: ENCRYPTION_VERSION,
    deviceId: state.deviceId,
    publicKey: normalizePublicKeyJwk(publicKey),
    privateKey: keyPair.privateKey,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

async function generateDeviceSigningIdentity() {
  const keyPair = await globalThis.crypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign', 'verify']
  );
  const publicKey = await globalThis.crypto.subtle.exportKey('jwk', keyPair.publicKey);
  return {
    id: SIGNING_IDENTITY_RECORD_ID,
    version: 1,
    deviceId: state.deviceId,
    publicKey: { ...normalizePublicKeyJwk(publicKey), key_ops: ['verify'] },
    privateKey: keyPair.privateKey,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

export async function setP2PCryptoContext(userId = '', deviceId = '') {
  const nextUserId = cleanScope(userId);
  const nextDeviceId = cleanScope(deviceId);
  if (!nextUserId || !nextDeviceId) throw new Error('Falta la identidad de cuenta o dispositivo para activar el cifrado P2P.');
  if (state.userId === nextUserId && state.deviceId === nextDeviceId) return true;
  state.db?.close();
  state.db = null;
  state.dbPromise = null;
  state.userId = nextUserId;
  state.deviceId = nextDeviceId;
  await openCryptoDatabase();
  return true;
}

export function closeP2PCryptoContext() {
  state.db?.close();
  state.db = null;
  state.dbPromise = null;
  state.userId = '';
  state.deviceId = '';
}

async function loadOrCreateDeviceIdentity() {
  let identity = await loadRecord(IDENTITY_RECORD_ID);
  const publicKey = normalizePublicKeyJwk(identity?.publicKey || {});
  if (identity && identity.deviceId === state.deviceId && publicKey && isPrivateIdentityKey(identity.privateKey)) {
    return { ...identity, publicKey };
  }
  const legacyPrivateKey = normalizePrivateKeyJwk(identity?.privateKey || {});
  if (identity && identity.deviceId === state.deviceId && publicKey && legacyPrivateKey) {
    identity = {
      ...identity,
      publicKey,
      privateKey: await importPrivateIdentity(legacyPrivateKey),
      updatedAt: new Date().toISOString()
    };
    await saveRecord(identity);
    return identity;
  }
  identity = await generateDeviceIdentity();
  await saveRecord(identity);
  return identity;
}

async function loadOrCreateDeviceSigningIdentity() {
  let identity = await loadRecord(SIGNING_IDENTITY_RECORD_ID);
  const publicKey = normalizePublicKeyJwk(identity?.publicKey || {});
  if (identity && identity.deviceId === state.deviceId && publicKey && isPrivateSigningKey(identity.privateKey)) {
    return { ...identity, publicKey: { ...publicKey, key_ops: ['verify'] } };
  }
  identity = await generateDeviceSigningIdentity();
  await saveRecord(identity);
  return identity;
}

async function loadOrCreateStorageWrappingKey() {
  const record = await loadRecord(STORAGE_WRAPPING_KEY_RECORD_ID);
  if (isStorageWrappingKey(record?.key)) return record.key;
  const key = await globalThis.crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
  await saveRecord({
    id: STORAGE_WRAPPING_KEY_RECORD_ID,
    type: 'storageWrappingKey',
    key,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });
  return key;
}

export async function ensureDeviceEncryptionIdentity() {
  const identity = await loadOrCreateDeviceIdentity();
  return {
    version: identity.version,
    deviceId: identity.deviceId,
    publicKey: identity.publicKey,
    createdAt: identity.createdAt,
    updatedAt: identity.updatedAt
  };
}

export async function ensureDeviceSigningIdentity() {
  const identity = await loadOrCreateDeviceSigningIdentity();
  return {
    version: identity.version,
    deviceId: identity.deviceId,
    publicKey: identity.publicKey,
    createdAt: identity.createdAt,
    updatedAt: identity.updatedAt
  };
}

export async function signP2PLocalPayload(payload = {}) {
  const identity = await loadOrCreateDeviceSigningIdentity();
  const bytes = new TextEncoder().encode(canonicalizeP2PLocalValue(payload));
  const signature = await globalThis.crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    identity.privateKey,
    bytes
  );
  return bytesToBase64Url(new Uint8Array(signature));
}

export async function verifyP2PLocalSignature(publicJwk = {}, payload = {}, signature = '') {
  const publicKey = normalizePublicKeyJwk(publicJwk);
  const encodedSignature = String(signature || '').trim();
  if (!publicKey || !/^[A-Za-z0-9_-]{80,120}$/.test(encodedSignature)) return false;
  let key;
  let signatureBytes;
  try {
    key = await globalThis.crypto.subtle.importKey(
      'jwk',
      { ...publicKey, key_ops: ['verify'] },
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['verify']
    );
    signatureBytes = base64UrlToBytes(encodedSignature);
  } catch {
    return false;
  }
  if (signatureBytes.byteLength !== 64) return false;
  return globalThis.crypto.subtle.verify(
    { name: 'ECDSA', hash: 'SHA-256' },
    key,
    signatureBytes,
    new TextEncoder().encode(canonicalizeP2PLocalValue(payload))
  );
}

function normalizeLocalCapabilityMemberships(value = []) {
  const memberships = [];
  const seen = new Set();
  for (const membership of Array.isArray(value) ? value : []) {
    const spaceId = String(membership?.spaceId || '').trim().slice(0, 140);
    const role = membership?.role === 'owner' ? 'owner' : 'member';
    const permissions = Array.from(new Set((Array.isArray(membership?.permissions) ? membership.permissions : [])
      .map((permission) => String(permission || '').trim().toLowerCase())
      .filter((permission) => ['read', 'add', 'delete', 'projection', 'invite', 'write'].includes(permission))));
    if (!spaceId || seen.has(spaceId) || !permissions.includes('read')) continue;
    seen.add(spaceId);
    memberships.push({
      spaceId,
      role,
      permissions,
      resourceType: String(membership?.resourceType || '').trim().toLowerCase().slice(0, 80),
      permissionProfile: String(membership?.permissionProfile || '').trim().toLowerCase().slice(0, 80),
      encryptionKeyEpoch: Math.max(0, Number(membership?.encryptionKeyEpoch || 0))
    });
  }
  return memberships;
}

function normalizeLocalCapabilityAuthorityKeys(authority = {}) {
  const candidates = [
    { keyId: authority?.keyId, publicKey: authority?.publicKey },
    ...(Array.isArray(authority?.verificationKeys) ? authority.verificationKeys : [])
  ];
  const keys = [];
  const seen = new Set();
  for (const candidate of candidates) {
    const keyId = String(candidate?.keyId || '').trim().slice(0, 180);
    const publicKey = normalizePublicKeyJwk(candidate?.publicKey || {});
    if (!keyId || !publicKey || seen.has(keyId)) continue;
    seen.add(keyId);
    keys.push({ keyId, publicKey: { ...publicKey, key_ops: ['verify'] } });
    if (keys.length >= 9) break;
  }
  return keys;
}

export async function verifyP2PLocalCapability(authority = {}, capability = {}, expected = {}) {
  const authorityKeys = normalizeLocalCapabilityAuthorityKeys(authority);
  const payload = capability?.payload && typeof capability.payload === 'object' ? capability.payload : null;
  if (authority?.enabled !== true || Number(authority?.schemaVersion || 0) !== 1 || authority?.algorithm !== 'ES256' || !authorityKeys.length || !payload) {
    throw Object.assign(new Error('La autoridad offline de memoriaBACKEND no está disponible.'), { code: 'P2P_SIN_CAPABILITY_UNAVAILABLE' });
  }
  if (Number(capability.schemaVersion || 0) !== 1 || capability.algorithm !== 'ES256' || Number(payload.schemaVersion || 0) !== 1) {
    throw Object.assign(new Error('La capacidad offline usa un formato incompatible.'), { code: 'P2P_SIN_CAPABILITY_INVALID' });
  }
  const normalizeOrigin = (value = '') => {
    try { return new URL(String(value || '')).origin.toLowerCase(); } catch { return ''; }
  };
  const expectedOrigin = normalizeOrigin(expected.origin || globalThis.location?.origin || '');
  const payloadOrigin = normalizeOrigin(payload.origin || '');
  const applicationId = String(payload.applicationId || '').trim();
  const authorityKeyId = String(payload.authorityKeyId || '').trim();
  const verificationKey = authorityKeys.find((candidate) => candidate.keyId === authorityKeyId) || null;
  if (!expectedOrigin || payloadOrigin !== expectedOrigin || applicationId !== String(expected.applicationId || '').trim()) {
    throw Object.assign(new Error('La capacidad offline pertenece a otro dominio o aplicación.'), { code: 'P2P_SIN_CAPABILITY_SCOPE_MISMATCH' });
  }
  if (!authorityKeyId || !verificationKey) {
    throw Object.assign(new Error('La capacidad offline no fue emitida por una autoridad conocida.'), { code: 'P2P_SIN_CAPABILITY_AUTHORITY_MISMATCH' });
  }
  if (expected.userId && String(payload.userId || '').trim() !== String(expected.userId || '').trim()) {
    throw Object.assign(new Error('La capacidad offline pertenece a otra cuenta.'), { code: 'P2P_SIN_CAPABILITY_IDENTITY_MISMATCH' });
  }
  if (expected.deviceId && String(payload.deviceId || '').trim() !== String(expected.deviceId || '').trim()) {
    throw Object.assign(new Error('La capacidad offline pertenece a otro dispositivo.'), { code: 'P2P_SIN_CAPABILITY_IDENTITY_MISMATCH' });
  }
  const issuedAtMs = Date.parse(String(payload.issuedAt || ''));
  const expiresAtMs = Date.parse(String(payload.expiresAt || ''));
  const nowMs = Number(expected.nowMs || Date.now());
  if (!Number.isFinite(issuedAtMs) || !Number.isFinite(expiresAtMs) || issuedAtMs > nowMs + 5 * 60 * 1000 || expiresAtMs <= nowMs) {
    throw Object.assign(new Error('La capacidad offline venció o todavía no es válida. Conéctate una vez a memoriaBACKEND para renovarla.'), { code: 'P2P_SIN_CAPABILITY_EXPIRED' });
  }
  const signingPublicKey = normalizePublicKeyJwk(payload.signingPublicKey || {});
  if (payload.issuer !== 'memoriaBACKEND' || !String(payload.tenantId || '').trim() || !String(payload.userId || '').trim() || !String(payload.deviceId || '').trim() || !signingPublicKey) {
    throw Object.assign(new Error('La identidad certificada del dispositivo está incompleta.'), { code: 'P2P_SIN_CAPABILITY_INVALID' });
  }
  const verified = await verifyP2PLocalSignature(verificationKey.publicKey, payload, capability.signature || '');
  if (!verified) {
    throw Object.assign(new Error('La firma de memoriaBACKEND para la capacidad offline no es válida.'), { code: 'P2P_SIN_CAPABILITY_SIGNATURE_INVALID' });
  }
  return {
    ...payload,
    signingPublicKey: { ...signingPublicKey, key_ops: ['verify'] },
    memberships: normalizeLocalCapabilityMemberships(payload.memberships)
  };
}

async function computeSpaceKeyId(spaceId = '', rawBytes = new Uint8Array()) {
  const digest = await sha256Bytes(new Uint8Array([
    ...new TextEncoder().encode(String(spaceId || '').trim()),
    0,
    ...rawBytes
  ]));
  return `key_${bytesToBase64Url(digest).slice(0, 32)}`;
}

function storageKeyAad(spaceId = '', keyId = '') {
  return `semilla-p2p-storage-key-v1|${spaceId}|${keyId}`;
}

async function storeSpaceKey(spaceId = '', keyId = '', rawBytes = new Uint8Array(), options = {}) {
  const cleanSpaceId = String(spaceId || '').trim();
  const cleanKeyId = String(keyId || '').trim();
  if (!cleanSpaceId || !cleanKeyId || rawBytes.byteLength !== SPACE_KEY_BYTES) {
    throw new Error('La clave del espacio compartido no tiene un formato válido.');
  }
  const storageKey = await loadOrCreateStorageWrappingKey();
  const storageIv = randomBytes(12);
  const wrappedRaw = await globalThis.crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: storageIv,
      additionalData: new TextEncoder().encode(storageKeyAad(cleanSpaceId, cleanKeyId))
    },
    storageKey,
    rawBytes
  );
  const record = {
    id: spaceKeyRecordId(cleanSpaceId, cleanKeyId),
    type: 'spaceKey',
    spaceId: cleanSpaceId,
    keyId: cleanKeyId,
    storageVersion: ENCRYPTION_VERSION,
    storageIv: bytesToBase64Url(storageIv),
    wrappedRaw: bytesToBase64Url(new Uint8Array(wrappedRaw)),
    createdAt: options.createdAt || new Date().toISOString(),
    importedAt: new Date().toISOString()
  };
  await withStore(RECORD_STORE, 'readwrite', async (store) => {
    await requestToPromise(store.put(record));
    if (options.activate !== false) {
      await requestToPromise(store.put({
        id: activeKeyRecordId(cleanSpaceId),
        type: 'activeSpaceKey',
        spaceId: cleanSpaceId,
        keyId: cleanKeyId,
        keyEpoch: Math.max(0, Number(options.keyEpoch || 0)),
        updatedAt: new Date().toISOString()
      }));
    }
  });
  return record;
}

async function readSpaceKeyBytes(record = {}) {
  if (record?.wrappedRaw && record?.storageIv) {
    const storageKey = await loadOrCreateStorageWrappingKey();
    let plaintext;
    try {
      plaintext = await globalThis.crypto.subtle.decrypt(
        {
          name: 'AES-GCM',
          iv: base64UrlToBytes(record.storageIv),
          additionalData: new TextEncoder().encode(storageKeyAad(record.spaceId, record.keyId))
        },
        storageKey,
        base64UrlToBytes(record.wrappedRaw)
      );
    } catch {
      throw new Error('La clave local del proyecto fue alterada o ya no pertenece a esta instalación.');
    }
    const rawBytes = new Uint8Array(plaintext);
    if (rawBytes.byteLength !== SPACE_KEY_BYTES) throw new Error('La clave local del proyecto tiene un tamaño inválido.');
    return rawBytes;
  }
  if (record?.raw) {
    const rawBytes = base64UrlToBytes(record.raw);
    if (rawBytes.byteLength !== SPACE_KEY_BYTES) throw new Error('La clave local heredada del proyecto tiene un tamaño inválido.');
    await storeSpaceKey(record.spaceId, record.keyId, rawBytes, { activate: false, createdAt: record.createdAt });
    return rawBytes;
  }
  return null;
}

export async function getSpaceKey(spaceId = '', keyId = '') {
  const cleanSpaceId = String(spaceId || '').trim();
  const cleanKeyId = String(keyId || '').trim();
  if (!cleanSpaceId || !cleanKeyId) return null;
  const key = await loadRecord(spaceKeyRecordId(cleanSpaceId, cleanKeyId));
  return (key?.wrappedRaw || key?.raw) ? key : null;
}

export async function getActiveSpaceKey(spaceId = '') {
  const cleanSpaceId = String(spaceId || '').trim();
  if (!cleanSpaceId) return null;
  const active = await loadRecord(activeKeyRecordId(cleanSpaceId));
  if (!active?.keyId) return null;
  const key = await loadRecord(spaceKeyRecordId(cleanSpaceId, active.keyId));
  return (key?.wrappedRaw || key?.raw)
    ? { ...key, keyEpoch: Math.max(0, Number(active.keyEpoch || 0)) }
    : null;
}

export async function hasSpaceKey(spaceId = '', keyId = '') {
  const cleanSpaceId = String(spaceId || '').trim();
  const cleanKeyId = String(keyId || '').trim();
  if (!cleanSpaceId) return false;
  if (cleanKeyId) return Boolean(await getSpaceKey(cleanSpaceId, cleanKeyId));
  return Boolean(await getActiveSpaceKey(cleanSpaceId));
}

export async function ensureSpaceKey(spaceId = '', options = {}) {
  const cleanSpaceId = String(spaceId || '').trim();
  if (!cleanSpaceId) throw new Error('Falta el espacio para generar su clave de cifrado.');
  const existing = await getActiveSpaceKey(cleanSpaceId);
  if (existing && options.rotate !== true) return existing;
  const rawBytes = randomBytes(SPACE_KEY_BYTES);
  const keyId = await computeSpaceKeyId(cleanSpaceId, rawBytes);
  return storeSpaceKey(cleanSpaceId, keyId, rawBytes, { activate: options.activate !== false });
}

export async function activateSpaceKey(spaceId = '', keyId = '', options = {}) {
  const cleanSpaceId = String(spaceId || '').trim();
  const cleanKeyId = String(keyId || '').trim();
  const key = await getSpaceKey(cleanSpaceId, cleanKeyId);
  if (!key) throw createMissingKeyError(cleanSpaceId, cleanKeyId);
  const current = await loadRecord(activeKeyRecordId(cleanSpaceId));
  const currentEpoch = Math.max(0, Number(current?.keyEpoch || 0));
  const hasRequestedEpoch = Object.prototype.hasOwnProperty.call(options, 'keyEpoch');
  const requestedEpoch = Math.max(0, Number(options.keyEpoch || 0));
  if (hasRequestedEpoch && currentEpoch > requestedEpoch) {
    const error = new Error('Se rechazó una clave antigua porque el proyecto ya usa una rotación posterior.');
    error.code = 'P2P_KEY_EPOCH_STALE';
    throw error;
  }
  if (hasRequestedEpoch && currentEpoch === requestedEpoch && current?.keyId && current.keyId !== cleanKeyId) {
    const error = new Error('Dos claves distintas intentaron ocupar la misma versión de cifrado.');
    error.code = 'P2P_KEY_EPOCH_CONFLICT';
    throw error;
  }
  const keyEpoch = hasRequestedEpoch
    ? requestedEpoch
    : (current?.keyId === cleanKeyId ? currentEpoch : currentEpoch + 1);
  await saveRecord({
    id: activeKeyRecordId(cleanSpaceId),
    type: 'activeSpaceKey',
    spaceId: cleanSpaceId,
    keyId: cleanKeyId,
    keyEpoch,
    updatedAt: new Date().toISOString()
  });
  return { ...key, keyEpoch };
}

async function importAesKey(record = {}, usages = ['encrypt', 'decrypt']) {
  const rawBytes = await readSpaceKeyBytes(record);
  if (!rawBytes) return null;
  return globalThis.crypto.subtle.importKey(
    'raw',
    rawBytes,
    { name: 'AES-GCM' },
    false,
    usages
  );
}

function wrappingInfo(spaceId = '', senderDeviceId = '', recipientDeviceId = '') {
  return `semilla-p2p-space-key-v1|${spaceId}|${senderDeviceId}|${recipientDeviceId}`;
}

export async function createSpaceKeyEnvelope(spaceId = '', recipientDevice = {}, options = {}) {
  const cleanSpaceId = String(spaceId || '').trim();
  const recipientDeviceId = String(recipientDevice.deviceId || '').trim();
  const recipientPublicKey = normalizePublicKeyJwk(recipientDevice.encryptionPublicKey || recipientDevice.publicKey || {});
  if (!cleanSpaceId || !recipientDeviceId || !recipientPublicKey) {
    throw new Error('El dispositivo receptor no tiene una clave pública válida para compartir el espacio.');
  }
  const requestedKeyId = String(options.keyId || '').trim();
  const [identity, keyRecord] = await Promise.all([
    loadOrCreateDeviceIdentity(),
    requestedKeyId ? getSpaceKey(cleanSpaceId, requestedKeyId) : getActiveSpaceKey(cleanSpaceId)
  ]);
  if (!keyRecord) throw createMissingKeyError(cleanSpaceId, '');
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const wrappingKey = await deriveWrappingKey(
    identity.privateKey,
    recipientPublicKey,
    salt,
    wrappingInfo(cleanSpaceId, state.deviceId, recipientDeviceId)
  );
  const ciphertext = await globalThis.crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv,
      additionalData: new TextEncoder().encode(`${cleanSpaceId}|${keyRecord.keyId}`)
    },
    wrappingKey,
    await readSpaceKeyBytes(keyRecord)
  );
  return {
    version: ENCRYPTION_VERSION,
    algorithm: 'ECDH-P256+HKDF-SHA256+A256GCM',
    keyId: keyRecord.keyId,
    senderDeviceId: state.deviceId,
    recipientDeviceId,
    senderPublicKey: identity.publicKey,
    salt: bytesToBase64Url(salt),
    iv: bytesToBase64Url(iv),
    ciphertext: bytesToBase64Url(new Uint8Array(ciphertext)),
    createdAt: new Date().toISOString()
  };
}

export async function createSpaceKeyEnvelopes(spaceId = '', devices = [], options = {}) {
  const result = [];
  const seen = new Set();
  for (const device of Array.isArray(devices) ? devices : []) {
    const deviceId = String(device?.deviceId || '').trim();
    if (!deviceId || seen.has(deviceId) || !normalizePublicKeyJwk(device?.encryptionPublicKey || {})) continue;
    seen.add(deviceId);
    result.push(await createSpaceKeyEnvelope(spaceId, device, options));
  }
  return result;
}

export async function importSpaceKeyEnvelope(spaceId = '', envelopeInput = {}, options = {}) {
  const cleanSpaceId = String(spaceId || '').trim();
  const envelope = envelopeShape(envelopeInput);
  if (!cleanSpaceId || !envelope) {
    throw createRejectedKeyEnvelopeError(
      'El sobre cifrado de la clave compartida no es válido.',
      'invalid_envelope'
    );
  }
  if (envelope.recipientDeviceId !== state.deviceId) return { imported: false, reason: 'other_device' };
  const keyEpoch = Math.max(0, Number(options.keyEpoch || 0));
  if (await hasSpaceKey(cleanSpaceId, envelope.keyId)) {
    const activated = await activateSpaceKey(cleanSpaceId, envelope.keyId, { keyEpoch });
    return { imported: true, reused: true, keyId: envelope.keyId, keyEpoch: activated.keyEpoch };
  }
  const identity = await loadOrCreateDeviceIdentity();
  let raw;
  try {
    const wrappingKey = await deriveWrappingKey(
      identity.privateKey,
      envelope.senderPublicKey,
      base64UrlToBytes(envelope.salt),
      wrappingInfo(cleanSpaceId, envelope.senderDeviceId, envelope.recipientDeviceId)
    );
    raw = await globalThis.crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: base64UrlToBytes(envelope.iv),
        additionalData: new TextEncoder().encode(`${cleanSpaceId}|${envelope.keyId}`)
      },
      wrappingKey,
      base64UrlToBytes(envelope.ciphertext)
    );
  } catch {
    throw createRejectedKeyEnvelopeError(
      'No se pudo autenticar la clave cifrada del espacio compartido.',
      'authentication_failed'
    );
  }
  const rawBytes = new Uint8Array(raw);
  if (rawBytes.byteLength !== SPACE_KEY_BYTES) {
    throw createRejectedKeyEnvelopeError(
      'La clave descifrada del espacio no tiene el tamaño esperado.',
      'invalid_key_length'
    );
  }
  const computedKeyId = await computeSpaceKeyId(cleanSpaceId, rawBytes);
  if (computedKeyId !== envelope.keyId) {
    throw createRejectedKeyEnvelopeError(
      'La identidad de la clave descifrada no coincide con el sobre recibido.',
      'key_identity_mismatch'
    );
  }
  await storeSpaceKey(cleanSpaceId, envelope.keyId, rawBytes, { activate: false, createdAt: envelope.createdAt });
  const activated = await activateSpaceKey(cleanSpaceId, envelope.keyId, { keyEpoch });
  return { imported: true, reused: false, keyId: envelope.keyId, keyEpoch: activated.keyEpoch };
}

function operationAad(spaceId = '', operation = {}, keyId = '') {
  const parts = [
    'semilla-p2p-operation-v1',
    spaceId,
    keyId,
    operation.operationId || '',
    operation.type || '',
    operation.entityType || '',
    operation.entityId || ''
  ];
  const dependentDeletes = Array.isArray(operation.dependentDeletes)
    ? operation.dependentDeletes.map((item) => ({
        entityType: String(item?.entityType || '').trim().toLowerCase(),
        entityId: String(item?.entityId || '').trim(),
        relation: String(item?.relation || '').trim().toLowerCase()
      })).filter((item) => item.entityType && item.entityId && item.relation)
    : [];
  if (dependentDeletes.length) parts.push(JSON.stringify(dependentDeletes));
  const authorship = {
    ownerUserId: String(operation?.authorship?.ownerUserId || operation?.authorship?.createdByUserId || '').trim(),
    createdAt: String(operation?.authorship?.createdAt || '').trim()
  };
  if (authorship.ownerUserId || authorship.createdAt) parts.push(JSON.stringify(authorship));
  return parts.join('|');
}

async function encryptJson(spaceId = '', keyRecord = {}, value = {}, aad = '') {
  const key = await importAesKey(keyRecord, ['encrypt']);
  const iv = randomBytes(12);
  const ciphertext = await globalThis.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: new TextEncoder().encode(aad) },
    key,
    new TextEncoder().encode(JSON.stringify(value ?? {}))
  );
  return {
    __p2pEncrypted: {
      version: ENCRYPTION_VERSION,
      algorithm: 'A256GCM',
      keyId: keyRecord.keyId,
      iv: bytesToBase64Url(iv),
      ciphertext: bytesToBase64Url(new Uint8Array(ciphertext))
    }
  };
}

async function decryptJson(spaceId = '', encryptedPayload = {}, aadFactory = (keyId) => '') {
  const encrypted = encryptedPayloadShape(encryptedPayload);
  if (!encrypted) {
    throw createRejectedEncryptedPayloadError(
      'El contenido cifrado P2P tiene un formato inválido.',
      'invalid_format'
    );
  }
  const record = await loadRecord(spaceKeyRecordId(spaceId, encrypted.keyId));
  if (!record) throw createMissingKeyError(spaceId, encrypted.keyId);
  const key = await importAesKey(record, ['decrypt']);
  let plaintext;
  try {
    plaintext = await globalThis.crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: base64UrlToBytes(encrypted.iv),
        additionalData: new TextEncoder().encode(aadFactory(encrypted.keyId))
      },
      key,
      base64UrlToBytes(encrypted.ciphertext)
    );
  } catch {
    throw createRejectedEncryptedPayloadError(
      'El contenido P2P cifrado fue alterado o pertenece a otra clave del espacio.',
      'authentication_failed'
    );
  }
  try {
    return JSON.parse(new TextDecoder().decode(plaintext));
  } catch {
    throw createRejectedEncryptedPayloadError(
      'El contenido P2P descifrado no contiene un documento JSON válido.',
      'invalid_plaintext'
    );
  }
}

export function isEncryptedOperation(operation = {}) {
  if (['entity.delete', 'entity.purge'].includes(operation.type)) return Number(operation.encryptionVersion || 0) === ENCRYPTION_VERSION;
  return Boolean(encryptedPayloadShape(operation.payload || {}));
}

export async function encryptOperationForTransport(spaceId = '', operation = {}) {
  const type = String(operation.type || '');
  if (!['entity.put', 'entity.patch', 'entity.trash', 'entity.restore', 'entity.purge', 'entity.delete', 'custom'].includes(type)) return { ...operation };
  const keyRecord = await getActiveSpaceKey(spaceId);
  if (!keyRecord) throw createMissingKeyError(spaceId, '');
  const hasDependentDeletes = Array.isArray(operation.dependentDeletes) && operation.dependentDeletes.length > 0;
  if (['entity.delete', 'entity.purge'].includes(type) && !Object.keys(operation.payload || {}).length && !hasDependentDeletes) {
    return { ...operation, payload: {}, encrypted: true, encryptionVersion: ENCRYPTION_VERSION, keyId: keyRecord.keyId };
  }
  const payload = await encryptJson(
    spaceId,
    keyRecord,
    operation.payload && typeof operation.payload === 'object' ? operation.payload : {},
    operationAad(spaceId, operation, keyRecord.keyId)
  );
  return { ...operation, payload, encrypted: true, encryptionVersion: ENCRYPTION_VERSION, keyId: keyRecord.keyId };
}

export async function decryptOperationEvent(event = {}) {
  if (event.eventType !== 'p2p.operation') return event;
  const operation = event.operation || {};
  if (operation.type === 'snapshot.chunk') {
    const entities = [];
    const requiresEncryption = operation.encrypted === true || Number(operation.encryptionVersion || 0) === ENCRYPTION_VERSION;
    for (const source of Array.isArray(operation.payload?.entities) ? operation.payload.entities : []) {
      const encryptedValue = encryptedPayloadShape(source?.value || {});
      if (source.deleted) {
        entities.push({ ...source, value: null });
        continue;
      }
      if (!encryptedValue) {
        if (requiresEncryption) {
          throw createRejectedEncryptedPayloadError(
            'El snapshot cifrado contiene una entidad sin payload autenticado.',
            'snapshot_entity_unprotected'
          );
        }
        entities.push(source);
        continue;
      }
      const value = await decryptJson(event.spaceId, source.value, (keyId) => [
        'semilla-p2p-snapshot-v1',
        event.spaceId,
        keyId,
        source.entityType || '',
        source.entityId || '',
        Number(source.stateRevision || source.spaceSequence || 0),
        source.operationType || ''
      ].join('|'));
      entities.push({ ...source, value });
    }
    return {
      ...event,
      operation: {
        ...operation,
        payload: { ...(operation.payload || {}), entities }
      }
    };
  }
  if (!['entity.put', 'entity.patch', 'entity.trash', 'entity.restore', 'entity.purge', 'entity.delete', 'custom'].includes(String(operation.type || ''))) return event;
  if (['entity.delete', 'entity.purge'].includes(operation.type) && !encryptedPayloadShape(operation.payload || {})) {
    if (Number(operation.encryptionVersion || 0) !== ENCRYPTION_VERSION) return event;
    if (!(await hasSpaceKey(event.spaceId, operation.keyId || ''))) throw createMissingKeyError(event.spaceId, operation.keyId || '');
    return event;
  }
  if (!encryptedPayloadShape(operation.payload || {})) return event;
  let payload;
  let authenticatedOperation = operation;
  try {
    payload = await decryptJson(
      event.spaceId,
      operation.payload,
      (keyId) => operationAad(event.spaceId, operation, keyId)
    );
  } catch (error) {
    const recoverableDependentDelete = ['entity.delete', 'entity.purge'].includes(operation.type)
      && String(operation.entityType || '').trim().toLowerCase() === 'admin.purchase'
      && (!Array.isArray(operation.dependentDeletes) || operation.dependentDeletes.length === 0);
    if (!recoverableDependentDelete) throw error;
    authenticatedOperation = {
      ...operation,
      dependentDeletes: [{
        entityType: 'admin.projection-link',
        entityId: String(operation.entityId || '').trim(),
        relation: 'admin.purchase-projection-link-v1'
      }]
    };
    payload = await decryptJson(
      event.spaceId,
      operation.payload,
      (keyId) => operationAad(event.spaceId, authenticatedOperation, keyId)
    );
  }
  return { ...event, operation: { ...authenticatedOperation, payload } };
}

export async function encryptSnapshotEntities(spaceId = '', entities = []) {
  const keyRecord = await getActiveSpaceKey(spaceId);
  if (!keyRecord) throw createMissingKeyError(spaceId, '');
  const encrypted = [];
  for (const source of Array.isArray(entities) ? entities : []) {
    if (source?.deleted) {
      encrypted.push({ ...source, value: null, encrypted: true, encryptionVersion: ENCRYPTION_VERSION, keyId: keyRecord.keyId });
      continue;
    }
    const aad = [
      'semilla-p2p-snapshot-v1',
      spaceId,
      keyRecord.keyId,
      source.entityType || '',
      source.entityId || '',
      Number(source.stateRevision || source.spaceSequence || 0),
      source.operationType || ''
    ].join('|');
    encrypted.push({
      ...source,
      value: await encryptJson(spaceId, keyRecord, source.value, aad),
      encrypted: true,
      encryptionVersion: ENCRYPTION_VERSION,
      keyId: keyRecord.keyId
    });
  }
  return encrypted;
}

function deferredEventKey(event = {}) {
  const sequence = Number(event.deviceSequence || event.deliverySequence || 0);
  const identity = sequence > 0 ? String(sequence).padStart(20, '0') : String(event.eventId || Date.now());
  return `${String(event.spaceId || '').trim()}|${identity}`;
}

export async function deferEncryptedEvent(event = {}, error = null) {
  const spaceId = String(event.spaceId || '').trim();
  if (!spaceId) throw new Error('No se puede diferir un evento cifrado sin espacio.');
  const record = {
    eventKey: deferredEventKey(event),
    spaceId,
    deviceSequence: Number(event.deviceSequence || event.deliverySequence || 0),
    spaceSequence: Number(event.spaceSequence || 0),
    keyId: String(error?.keyId || event.operation?.keyId || event.operation?.payload?.__p2pEncrypted?.keyId || '').trim(),
    event,
    createdAtMs: Date.now()
  };
  await withStore(DEFERRED_STORE, 'readwrite', async (store) => {
    const existing = await requestToPromise(store.get(record.eventKey));
    if (!existing) {
      const total = await requestToPromise(store.count());
      if (Number(total || 0) >= MAX_DEFERRED_EVENTS) {
        const error = new Error('El dispositivo agotó el límite local de eventos cifrados pendientes de clave.');
        error.code = 'P2P_DEFERRED_EVENT_LIMIT';
        throw error;
      }
    }
    await requestToPromise(store.put(record));
  });
  return record;
}

export async function listDeferredEncryptedEvents(spaceId = '') {
  const cleanSpaceId = String(spaceId || '').trim();
  const records = await withStore(DEFERRED_STORE, 'readonly', (store) => (
    cleanSpaceId
      ? requestToPromise(store.index('spaceId').getAll(cleanSpaceId))
      : requestToPromise(store.getAll())
  ));
  return [...(records || [])].sort((left, right) => (
    Number(left.deviceSequence || 0) - Number(right.deviceSequence || 0)
    || Number(left.spaceSequence || 0) - Number(right.spaceSequence || 0)
    || String(left.eventKey || '').localeCompare(String(right.eventKey || ''))
  ));
}

export async function removeDeferredEncryptedEvent(eventKey = '') {
  if (!eventKey) return false;
  await withStore(DEFERRED_STORE, 'readwrite', (store) => requestToPromise(store.delete(eventKey)));
  return true;
}

export async function purgeSpaceCrypto(spaceId = '') {
  const cleanSpaceId = String(spaceId || '').trim();
  if (!cleanSpaceId) return { keys: 0, deferred: 0 };
  const db = await openCryptoDatabase();
  const transaction = db.transaction([RECORD_STORE, DEFERRED_STORE], 'readwrite');
  const records = transaction.objectStore(RECORD_STORE);
  const deferred = transaction.objectStore(DEFERRED_STORE);
  const [allRecords, deferredRecords] = await Promise.all([
    requestToPromise(records.getAll()),
    requestToPromise(deferred.index('spaceId').getAll(cleanSpaceId))
  ]);
  let keys = 0;
  for (const record of allRecords || []) {
    if (record?.spaceId !== cleanSpaceId) continue;
    await requestToPromise(records.delete(record.id));
    keys += 1;
  }
  for (const record of deferredRecords || []) await requestToPromise(deferred.delete(record.eventKey));
  await transactionDone(transaction);
  return { keys, deferred: (deferredRecords || []).length };
}

export {
  ENCRYPTION_VERSION,
  normalizePublicKeyJwk,
  envelopeShape,
  encryptedPayloadShape,
  bytesToBase64Url,
  base64UrlToBytes
};
