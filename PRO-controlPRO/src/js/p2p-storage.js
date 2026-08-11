const P2P_APPLICATION_STORAGE_SCOPE = String(globalThis.APP_SEED_METADATA?.applicationStorageScope || 'root')
  .trim()
  .replace(/[^a-zA-Z0-9._~:-]/g, '_')
  .slice(0, 180) || 'root';
const DB_NAME_PREFIX = P2P_APPLICATION_STORAGE_SCOPE === 'root'
  ? 'semilla-p2p-local-first'
  : `semilla-p2p-local-first:${P2P_APPLICATION_STORAGE_SCOPE}`;
const DB_VERSION = 2;
const STATE_REVISION_META_PREFIX = 'stateRevision:';
const RECOVERY_REQUIREMENTS_META_KEY = 'snapshotRecoveryRequirements';
const PENDING_SPACE_CREATIONS_META_KEY = 'pendingSpaceCreations';
const MAX_PENDING_SPACE_CREATIONS = 12;
const DEFAULT_SNAPSHOT_MAX_BYTES = 1024 * 1024;
const DEFAULT_SNAPSHOT_MAX_CHUNKS = 500;
const DEFAULT_SNAPSHOT_SESSION_TTL_SECONDS = 12 * 60;
const MIN_SNAPSHOT_SESSION_TTL_SECONDS = 5 * 60;
const MAX_SNAPSHOT_SESSION_TTL_SECONDS = 2 * 60 * 60;
const STORES = Object.freeze({
  meta: 'meta',
  spaces: 'spaces',
  invitations: 'invitations',
  entities: 'entities',
  outbox: 'outbox',
  snapshots: 'snapshots'
});

let dbPromise = null;
let activeUserId = '';
let snapshotStorageMaxBytes = DEFAULT_SNAPSHOT_MAX_BYTES;
let snapshotStorageMaxChunks = DEFAULT_SNAPSHOT_MAX_CHUNKS;
let snapshotStorageSessionTtlMs = DEFAULT_SNAPSHOT_SESSION_TTL_SECONDS * 1000;

function jsonByteLength(value) {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}

export function configureP2PStorageLimits(options = {}) {
  const maxBytes = Number(options.snapshotMaxBytes || options.maxBytes || snapshotStorageMaxBytes);
  const maxChunks = Number(options.snapshotMaxChunks || options.maxChunks || snapshotStorageMaxChunks);
  const sessionTtlSeconds = Number(
    options.snapshotSessionTtlSeconds
    || options.sessionTtlSeconds
    || (snapshotStorageSessionTtlMs / 1000)
  );
  if (Number.isFinite(maxBytes) && maxBytes >= 8 * 1024) snapshotStorageMaxBytes = Math.floor(maxBytes);
  if (Number.isFinite(maxChunks) && maxChunks >= 1) snapshotStorageMaxChunks = Math.floor(maxChunks);
  if (Number.isFinite(sessionTtlSeconds)) {
    snapshotStorageSessionTtlMs = Math.min(
      MAX_SNAPSHOT_SESSION_TTL_SECONDS,
      Math.max(MIN_SNAPSHOT_SESSION_TTL_SECONDS, Math.floor(sessionTtlSeconds))
    ) * 1000;
  }
  return {
    snapshotMaxBytes: snapshotStorageMaxBytes,
    snapshotMaxChunks: snapshotStorageMaxChunks,
    snapshotSessionTtlSeconds: Math.floor(snapshotStorageSessionTtlMs / 1000)
  };
}

export function validateSnapshotBudgetMetadata(payload = {}, options = {}) {
  const maxBytes = Math.max(8 * 1024, Number(options.snapshotMaxBytes || snapshotStorageMaxBytes));
  const maxChunks = Math.max(1, Number(options.snapshotMaxChunks || snapshotStorageMaxChunks));
  const chunkCount = Number(payload.chunkCount);
  const snapshotByteCount = Number(payload.snapshotByteCount);
  const chunkByteCount = payload.chunkByteCount === undefined ? null : Number(payload.chunkByteCount);
  if (!Number.isInteger(chunkCount) || chunkCount < 1 || chunkCount > maxChunks) {
    return { valid: false, reason: 'snapshot_chunk_limit_exceeded' };
  }
  if (!Number.isInteger(snapshotByteCount) || snapshotByteCount < 2 || snapshotByteCount > maxBytes) {
    return { valid: false, reason: 'snapshot_byte_limit_exceeded' };
  }
  if (chunkByteCount !== null && (
    !Number.isInteger(chunkByteCount)
    || chunkByteCount < 2
    || chunkByteCount > snapshotByteCount
  )) {
    return { valid: false, reason: 'snapshot_chunk_byte_count_invalid' };
  }
  if (
    chunkByteCount !== null
    && Array.isArray(payload.entities)
    && chunkByteCount !== jsonByteLength(payload.entities)
  ) {
    return { valid: false, reason: 'snapshot_chunk_byte_count_mismatch' };
  }
  return { valid: true, chunkCount, snapshotByteCount, chunkByteCount };
}

function normalizeStorageUserId(value = '') {
  return String(value || '').trim().replace(/[^a-zA-Z0-9._:-]/g, '_').slice(0, 180);
}

export async function setP2PStorageUser(userId = '') {
  const nextUserId = normalizeStorageUserId(userId);
  if (nextUserId === activeUserId) return activeUserId;
  if (dbPromise) {
    try {
      const currentDb = await dbPromise;
      currentDb.close();
    } catch {}
  }
  dbPromise = null;
  activeUserId = nextUserId;
  return activeUserId;
}

function scopedDatabaseName() {
  if (!activeUserId) throw new Error('No hay una cuenta activa para abrir el almacenamiento local.');
  return `${DB_NAME_PREFIX}:${activeUserId}`;
}

function dispatchStorageRisk(reason = '', error = null) {
  try {
    if (typeof globalThis.window?.dispatchEvent !== 'function' || typeof globalThis.CustomEvent !== 'function') return;
    globalThis.window.dispatchEvent(new CustomEvent('p2p:storage-risk', {
      detail: {
        reason: String(reason || ''),
        name: String(error?.name || ''),
        message: String(error?.message || '')
      }
    }));
  } catch {}
}

function normalizeStorageError(error = null, fallback = 'No se pudo completar la operación local.') {
  const name = String(error?.name || '');
  const message = String(error?.message || '');
  const quotaExceeded = name === 'QuotaExceededError'
    || name === 'NS_ERROR_DOM_QUOTA_REACHED'
    || /quota|espacio|storage capacity/i.test(message);
  if (!quotaExceeded) return error || new Error(fallback);

  const normalized = new Error('El dispositivo no tiene espacio suficiente para guardar este cambio de forma segura.');
  normalized.name = 'P2PStorageQuotaError';
  normalized.code = 'P2P_STORAGE_QUOTA_EXCEEDED';
  normalized.status = 507;
  normalized.cause = error || null;
  dispatchStorageRisk('quota-exceeded', error);
  return normalized;
}

function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(normalizeStorageError(
      request.error,
      'No se pudo completar la operación local.'
    ));
  });
}

function transactionDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(normalizeStorageError(
      transaction.error,
      'La transacción local falló.'
    ));
    transaction.onabort = () => reject(normalizeStorageError(
      transaction.error,
      'La transacción local fue cancelada.'
    ));
  });
}

export function openP2PDatabase() {
  if (dbPromise) return dbPromise;

  let openingPromise;
  openingPromise = new Promise((resolve, reject) => {
    const databaseName = scopedDatabaseName();
    const request = indexedDB.open(databaseName, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORES.meta)) db.createObjectStore(STORES.meta, { keyPath: 'key' });
      if (!db.objectStoreNames.contains(STORES.spaces)) db.createObjectStore(STORES.spaces, { keyPath: 'spaceId' });
      if (!db.objectStoreNames.contains(STORES.invitations)) {
        const store = db.createObjectStore(STORES.invitations, { keyPath: 'invitationId' });
        store.createIndex('status', 'status', { unique: false });
      }
      if (!db.objectStoreNames.contains(STORES.entities)) {
        const store = db.createObjectStore(STORES.entities, { keyPath: 'key' });
        store.createIndex('spaceId', 'spaceId', { unique: false });
      }
      if (!db.objectStoreNames.contains(STORES.outbox)) {
        const store = db.createObjectStore(STORES.outbox, { keyPath: 'operationId' });
        store.createIndex('createdAt', 'createdAt', { unique: false });
      }
      if (!db.objectStoreNames.contains(STORES.snapshots)) {
        const store = db.createObjectStore(STORES.snapshots, { keyPath: 'key' });
        store.createIndex('snapshotKey', 'snapshotKey', { unique: false });
        store.createIndex('createdAtMs', 'createdAtMs', { unique: false });
      }
    };
    request.onblocked = () => dispatchStorageRisk('upgrade-blocked');
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => {
        db.close();
        if (dbPromise === openingPromise) dbPromise = null;
        dispatchStorageRisk('version-change');
      };
      if ('onclose' in db) {
        db.onclose = () => {
          if (dbPromise === openingPromise) dbPromise = null;
        };
      }
      resolve(db);
    };
    request.onerror = () => reject(normalizeStorageError(
      request.error,
      'No se pudo abrir el almacenamiento local.'
    ));
  });
  dbPromise = openingPromise;
  openingPromise.catch(() => {
    if (dbPromise === openingPromise) dbPromise = null;
  });
  return openingPromise;
}

async function completeTransaction(transaction, callback) {
  try {
    const result = await callback();
    await transactionDone(transaction);
    return result;
  } catch (error) {
    try {
      transaction.abort();
    } catch {}
    await transactionDone(transaction).catch(() => null);
    throw error;
  }
}

async function withStore(storeName, mode, callback) {
  const db = await openP2PDatabase();
  const transaction = db.transaction(storeName, mode);
  const store = transaction.objectStore(storeName);
  return completeTransaction(transaction, () => callback(store, transaction));
}

async function withStores(storeNames, mode, callback) {
  const db = await openP2PDatabase();
  const transaction = db.transaction(storeNames, mode);
  const stores = Object.fromEntries(storeNames.map((storeName) => [storeName, transaction.objectStore(storeName)]));
  return completeTransaction(transaction, () => callback(stores, transaction));
}

export async function getMeta(key, fallback = null) {
  return withStore(STORES.meta, 'readonly', async (store) => {
    const record = await requestToPromise(store.get(String(key)));
    return record ? record.value : fallback;
  });
}

export async function setMeta(key, value) {
  return withStore(STORES.meta, 'readwrite', (store) => requestToPromise(store.put({ key: String(key), value })));
}

export function normalizeRecoveryRequirements(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {};
  const normalized = {};
  for (const [rawSpaceId, rawRevision] of Object.entries(input)) {
    const spaceId = String(rawSpaceId || '').trim();
    const revision = normalizeSequence(rawRevision);
    if (!spaceId || !revision) continue;
    normalized[spaceId] = Math.max(normalized[spaceId] || 0, revision);
  }
  return normalized;
}

export function mergeRecoveryRequirementMaps(current = {}, required = {}) {
  const merged = normalizeRecoveryRequirements(current);
  for (const [spaceId, revision] of Object.entries(normalizeRecoveryRequirements(required))) {
    merged[spaceId] = Math.max(merged[spaceId] || 0, revision);
  }
  return merged;
}

export function resolveRecoveryRequirementMap(current = {}, spaceId = '', sourceStateRevision = 0) {
  const resolved = normalizeRecoveryRequirements(current);
  const cleanSpaceId = String(spaceId || '').trim();
  const requiredRevision = normalizeSequence(resolved[cleanSpaceId]);
  const deliveredRevision = normalizeSequence(sourceStateRevision);
  if (cleanSpaceId && requiredRevision && deliveredRevision >= requiredRevision) delete resolved[cleanSpaceId];
  return resolved;
}

async function mutateRecoveryRequirements(mutator = (value) => value) {
  return withStore(STORES.meta, 'readwrite', async (store) => {
    const currentRecord = await requestToPromise(store.get(RECOVERY_REQUIREMENTS_META_KEY));
    const current = normalizeRecoveryRequirements(currentRecord?.value || {});
    const next = normalizeRecoveryRequirements(mutator({ ...current }) || {});
    await requestToPromise(store.put({ key: RECOVERY_REQUIREMENTS_META_KEY, value: next }));
    return next;
  });
}

export async function getRecoveryRequirements() {
  return normalizeRecoveryRequirements(await getMeta(RECOVERY_REQUIREMENTS_META_KEY, {}));
}

export function planRecoveryRequirementUpdate(current = {}, options = {}) {
  const required = normalizeRecoveryRequirements(options.required || {});
  const appliedStateRevisions = normalizeRecoveryRequirements(options.appliedStateRevisions || {});
  const retainSpaceIds = Array.isArray(options.retainSpaceIds)
    ? new Set(options.retainSpaceIds.map((value) => String(value || '').trim()).filter(Boolean))
    : null;
  let next = normalizeRecoveryRequirements(current);
  for (const [spaceId, requiredRevision] of Object.entries(next)) {
    if (Math.max(0, Number(appliedStateRevisions[spaceId] || 0)) >= requiredRevision) delete next[spaceId];
  }
  if (retainSpaceIds) {
    next = Object.fromEntries(Object.entries(next).filter(([spaceId]) => retainSpaceIds.has(spaceId)));
  }
  return mergeRecoveryRequirementMaps(next, required);
}

export async function updateRecoveryRequirements(options = {}) {
  return mutateRecoveryRequirements((current) => planRecoveryRequirementUpdate(current, options));
}

export async function resolveRecoveryRequirement(spaceId = '', sourceStateRevision = 0) {
  return mutateRecoveryRequirements((current) => resolveRecoveryRequirementMap(current, spaceId, sourceStateRevision));
}

function normalizePendingSpaceCreation(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const requestId = String(input.requestId || '').trim().slice(0, 180);
  const operationId = String(input.operationId || '').trim().slice(0, 180);
  const entityType = String(input.entityType || '').trim().slice(0, 160);
  const entityId = String(input.entityId || '').trim().slice(0, 180);
  if (!requestId || !operationId || !entityType || !entityId) return null;
  return {
    requestId,
    operationId,
    resourceType: String(input.resourceType || 'generic').trim().slice(0, 120),
    entityType,
    entityId,
    spaceId: String(input.spaceId || '').trim().slice(0, 180),
    value: input.value && typeof input.value === 'object' && !Array.isArray(input.value) ? input.value : {},
    createdAt: String(input.createdAt || new Date().toISOString()).trim().slice(0, 64),
    updatedAt: String(input.updatedAt || new Date().toISOString()).trim().slice(0, 64)
  };
}

export function normalizePendingSpaceCreations(input = []) {
  const unique = new Map();
  for (const candidate of Array.isArray(input) ? input : []) {
    const normalized = normalizePendingSpaceCreation(candidate);
    if (!normalized) continue;
    const current = unique.get(normalized.requestId);
    const currentUpdatedAt = Date.parse(current?.updatedAt || '') || 0;
    const nextUpdatedAt = Date.parse(normalized.updatedAt || '') || 0;
    if (!current || nextUpdatedAt >= currentUpdatedAt) unique.set(normalized.requestId, normalized);
  }
  return [...unique.values()]
    .sort((left, right) => (Date.parse(left.updatedAt || '') || 0) - (Date.parse(right.updatedAt || '') || 0))
    .slice(-MAX_PENDING_SPACE_CREATIONS);
}

async function mutatePendingSpaceCreations(mutator = (value) => value) {
  return withStore(STORES.meta, 'readwrite', async (store) => {
    const currentRecord = await requestToPromise(store.get(PENDING_SPACE_CREATIONS_META_KEY));
    const current = normalizePendingSpaceCreations(currentRecord?.value || []);
    const next = normalizePendingSpaceCreations(mutator([...current]) || []);
    await requestToPromise(store.put({ key: PENDING_SPACE_CREATIONS_META_KEY, value: next }));
    return next;
  });
}

export async function listPendingSpaceCreations() {
  return normalizePendingSpaceCreations(await getMeta(PENDING_SPACE_CREATIONS_META_KEY, []));
}

export async function savePendingSpaceCreation(input = {}) {
  const normalized = normalizePendingSpaceCreation(input);
  if (!normalized) throw new Error('La intención local de creación está incompleta.');
  const next = await mutatePendingSpaceCreations((current) => [
    ...current.filter((candidate) => candidate.requestId !== normalized.requestId),
    { ...normalized, updatedAt: new Date().toISOString() }
  ]);
  return next.find((candidate) => candidate.requestId === normalized.requestId) || normalized;
}

export async function removePendingSpaceCreation(requestId = '') {
  const cleanRequestId = String(requestId || '').trim();
  if (!cleanRequestId) return false;
  const current = await listPendingSpaceCreations();
  const existed = current.some((candidate) => candidate.requestId === cleanRequestId);
  if (!existed) return false;
  await mutatePendingSpaceCreations((records) => records.filter((candidate) => candidate.requestId !== cleanRequestId));
  return true;
}

export async function saveSpaces(spaces = []) {
  return withStore(STORES.spaces, 'readwrite', async (store) => {
    for (const space of spaces || []) {
      if (space?.spaceId) await requestToPromise(store.put(space));
    }
  });
}

function cleanSpaceId(value = '') {
  return String(value || '').trim();
}

function recordSpaceId(record = {}) {
  return cleanSpaceId(record?.spaceId || record?.request?.spaceId || '');
}

function snapshotRecordSpaceId(record = {}) {
  const snapshotKey = String(record?.snapshotKey || record?.key || '');
  const separatorIndex = snapshotKey.indexOf('|');
  return separatorIndex > 0 ? cleanSpaceId(snapshotKey.slice(0, separatorIndex)) : '';
}

function snapshotRecordBelongsToSpace(record = {}, spaceId = '') {
  const cleanId = cleanSpaceId(spaceId);
  return Boolean(cleanId) && snapshotRecordSpaceId(record) === cleanId;
}

function metadataSpaceIds(records = []) {
  const spaceIds = [];
  for (const record of Array.isArray(records) ? records : []) {
    const key = String(record?.key || '');
    if (key.startsWith(STATE_REVISION_META_PREFIX)) {
      spaceIds.push(cleanSpaceId(key.slice(STATE_REVISION_META_PREFIX.length)));
    }
    if (key === RECOVERY_REQUIREMENTS_META_KEY) {
      spaceIds.push(...Object.keys(normalizeRecoveryRequirements(record?.value || {})));
    }
  }
  return spaceIds.filter(Boolean);
}

export function findRemovedSpaceIds(existingSpaces = [], revokedSpaceIds = []) {
  const existingIds = new Set((Array.isArray(existingSpaces) ? existingSpaces : [])
    .map((space) => cleanSpaceId(space?.spaceId || space))
    .filter(Boolean));
  return Array.from(new Set((Array.isArray(revokedSpaceIds) ? revokedSpaceIds : [])
    .map((space) => cleanSpaceId(space?.spaceId || space))
    .filter((spaceId) => spaceId && existingIds.has(spaceId))));
}

export function planSpaceReconciliation(
  existingSpaces = [],
  authorizedSpaces = [],
  revokedSpaceIds = [],
  pendingReplicaSpaceIds = []
) {
  const normalizedExisting = (Array.isArray(existingSpaces) ? existingSpaces : [])
    .filter((space) => cleanSpaceId(space?.spaceId));
  const normalizedAuthorized = (Array.isArray(authorizedSpaces) ? authorizedSpaces : [])
    .filter((space) => cleanSpaceId(space?.spaceId));
  const existingBySpaceId = new Map(normalizedExisting.map((space) => [cleanSpaceId(space.spaceId), space]));
  const pendingReplicaSet = new Set((Array.isArray(pendingReplicaSpaceIds) ? pendingReplicaSpaceIds : [])
    .map(cleanSpaceId)
    .filter(Boolean));
  const removedSpaceIds = findRemovedSpaceIds(normalizedExisting, revokedSpaceIds);
  const removedSet = new Set(removedSpaceIds);
  const confirmedIds = new Set(normalizedAuthorized.map((space) => cleanSpaceId(space.spaceId)));
  const preservedSpaces = normalizedExisting
    .filter((space) => !removedSet.has(cleanSpaceId(space.spaceId)) && !confirmedIds.has(cleanSpaceId(space.spaceId)))
    .map((space) => ({
      ...space,
      authorizationState: 'unconfirmed',
      authorizationPendingReason: 'membership_unconfirmed',
      authorizationUnconfirmedAt: space.authorizationUnconfirmedAt || new Date().toISOString()
    }));
  const authorizedReconciledSpaces = normalizedAuthorized.map((space) => {
    const spaceId = cleanSpaceId(space.spaceId);
    const existing = existingBySpaceId.get(spaceId) || null;
    if (pendingReplicaSet.has(spaceId)) {
      return {
        ...space,
        authorizationState: 'unconfirmed',
        authorizationPendingReason: 'replica_recovery',
        authorizationUnconfirmedAt: existing?.authorizationUnconfirmedAt
          || space.authorizationUnconfirmedAt
          || new Date().toISOString()
      };
    }
    const confirmed = { ...space, authorizationState: 'confirmed' };
    delete confirmed.authorizationPendingReason;
    delete confirmed.authorizationUnconfirmedAt;
    return confirmed;
  });
  return {
    removedSpaceIds,
    preservedSpaceIds: preservedSpaces.map((space) => cleanSpaceId(space.spaceId)),
    pendingReplicaSpaceIds: authorizedReconciledSpaces
      .filter((space) => space.authorizationPendingReason === 'replica_recovery')
      .map((space) => cleanSpaceId(space.spaceId)),
    spaces: [...preservedSpaces, ...authorizedReconciledSpaces]
  };
}

async function purgeSpaceRecords(stores = {}, spaceId = '') {
  const cleanId = cleanSpaceId(spaceId);
  if (!cleanId) return { entities: 0, outbox: 0, snapshots: 0, meta: 0 };

  let entities = 0;
  const entityRecords = await requestToPromise(stores[STORES.entities].index('spaceId').getAll(cleanId));
  for (const record of entityRecords || []) {
    if (!record?.key) continue;
    await requestToPromise(stores[STORES.entities].delete(record.key));
    entities += 1;
  }

  let outbox = 0;
  const outboxRecords = await requestToPromise(stores[STORES.outbox].getAll());
  for (const record of outboxRecords || []) {
    if (recordSpaceId(record) !== cleanId || !record?.operationId) continue;
    await requestToPromise(stores[STORES.outbox].delete(record.operationId));
    outbox += 1;
  }

  let snapshots = 0;
  const snapshotRecords = await requestToPromise(stores[STORES.snapshots].getAll());
  for (const record of snapshotRecords || []) {
    if (!snapshotRecordBelongsToSpace(record, cleanId) || !record?.key) continue;
    await requestToPromise(stores[STORES.snapshots].delete(record.key));
    snapshots += 1;
  }

  let meta = 0;
  const revisionKey = `${STATE_REVISION_META_PREFIX}${cleanId}`;
  const revisionRecord = await requestToPromise(stores[STORES.meta].get(revisionKey));
  if (revisionRecord) {
    await requestToPromise(stores[STORES.meta].delete(revisionKey));
    meta += 1;
  }
  const recoveryRecord = await requestToPromise(stores[STORES.meta].get(RECOVERY_REQUIREMENTS_META_KEY));
  const recoveryRequirements = normalizeRecoveryRequirements(recoveryRecord?.value || {});
  if (Object.prototype.hasOwnProperty.call(recoveryRequirements, cleanId)) {
    delete recoveryRequirements[cleanId];
    await requestToPromise(stores[STORES.meta].put({
      key: RECOVERY_REQUIREMENTS_META_KEY,
      value: recoveryRequirements
    }));
    meta += 1;
  }
  return { entities, outbox, snapshots, meta };
}

export async function purgeLocalSpace(spaceId = '') {
  const cleanId = cleanSpaceId(spaceId);
  if (!cleanId) return { spaceId: '', purged: false, entities: 0, outbox: 0, snapshots: 0, meta: 0 };
  return withStores(
    [STORES.spaces, STORES.entities, STORES.outbox, STORES.snapshots, STORES.meta],
    'readwrite',
    async (stores) => {
      const existed = Boolean(await requestToPromise(stores[STORES.spaces].get(cleanId)));
      await requestToPromise(stores[STORES.spaces].delete(cleanId));
      const counts = await purgeSpaceRecords(stores, cleanId);
      return { spaceId: cleanId, purged: existed || Object.values(counts).some(Boolean), ...counts };
    }
  );
}

async function replaceSpacesInStores(stores = {}, spaces = [], options = {}) {
  const normalizedSpaces = (Array.isArray(spaces) ? spaces : []).filter((space) => cleanSpaceId(space?.spaceId));
  const revokedSpaceIds = Array.isArray(options.revokedSpaceIds) ? options.revokedSpaceIds : [];
  const [existingSpaces, entityRecords, outboxRecords, snapshotRecords, metaRecords] = await Promise.all([
    requestToPromise(stores[STORES.spaces].getAll()),
    requestToPromise(stores[STORES.entities].getAll()),
    requestToPromise(stores[STORES.outbox].getAll()),
    requestToPromise(stores[STORES.snapshots].getAll()),
    requestToPromise(stores[STORES.meta].getAll())
  ]);
  const localSpaceIds = [
    ...(existingSpaces || []),
    ...(entityRecords || []).map(recordSpaceId),
    ...(outboxRecords || []).map(recordSpaceId),
    ...(snapshotRecords || []).map(snapshotRecordSpaceId),
    ...metadataSpaceIds(metaRecords)
  ];
  const reconciliation = planSpaceReconciliation(
    existingSpaces,
    normalizedSpaces,
    revokedSpaceIds,
    options.pendingReplicaSpaceIds
  );
  const removedSpaceIds = findRemovedSpaceIds(localSpaceIds, revokedSpaceIds);
  for (const space of reconciliation.spaces) {
    await requestToPromise(stores[STORES.spaces].put(space));
  }

  const purged = {};
  for (const spaceId of removedSpaceIds) {
    await requestToPromise(stores[STORES.spaces].delete(spaceId));
    purged[spaceId] = await purgeSpaceRecords(stores, spaceId);
  }
  const reconciledSpaces = await requestToPromise(stores[STORES.spaces].getAll());
  return {
    removedSpaceIds,
    preservedSpaceIds: reconciliation.preservedSpaceIds,
    purged,
    spaces: reconciledSpaces || []
  };
}

export async function replaceSpaces(spaces = [], options = {}) {
  return withStores(
    [STORES.spaces, STORES.entities, STORES.outbox, STORES.snapshots, STORES.meta],
    'readwrite',
    (stores) => replaceSpacesInStores(stores, spaces, options)
  );
}

export async function replaceBootstrapControlState(spaces = [], invitations = [], options = {}) {
  const normalizedInvitations = (Array.isArray(invitations) ? invitations : [])
    .filter((invitation) => String(invitation?.invitationId || '').trim());
  return withStores(
    [STORES.spaces, STORES.invitations, STORES.entities, STORES.outbox, STORES.snapshots, STORES.meta],
    'readwrite',
    async (stores) => {
      const spaceReplacement = await replaceSpacesInStores(stores, spaces, options);
      await requestToPromise(stores[STORES.invitations].clear());
      for (const invitation of normalizedInvitations) {
        await requestToPromise(stores[STORES.invitations].put(invitation));
      }
      return {
        ...spaceReplacement,
        invitations: normalizedInvitations
      };
    }
  );
}

export async function saveControlStateAtomically({ spaces = [], invitations = [] } = {}) {
  const normalizedSpaces = (Array.isArray(spaces) ? spaces : [])
    .filter((space) => cleanSpaceId(space?.spaceId));
  const normalizedInvitations = (Array.isArray(invitations) ? invitations : [])
    .filter((invitation) => String(invitation?.invitationId || '').trim());
  if (!normalizedSpaces.length && !normalizedInvitations.length) {
    return { spaces: [], invitations: [] };
  }
  return withStores(
    [STORES.spaces, STORES.invitations],
    'readwrite',
    async (stores) => {
      for (const space of normalizedSpaces) {
        await requestToPromise(stores[STORES.spaces].put(space));
      }
      for (const invitation of normalizedInvitations) {
        await requestToPromise(stores[STORES.invitations].put(invitation));
      }
      return {
        spaces: normalizedSpaces,
        invitations: normalizedInvitations
      };
    }
  );
}

export async function listSpaces() {
  return withStore(STORES.spaces, 'readonly', (store) => requestToPromise(store.getAll()));
}

export async function saveInvitations(invitations = []) {
  return withStore(STORES.invitations, 'readwrite', async (store) => {
    for (const invitation of invitations || []) {
      if (invitation?.invitationId) await requestToPromise(store.put(invitation));
    }
  });
}

export async function replaceInvitations(invitations = []) {
  return withStore(STORES.invitations, 'readwrite', async (store) => {
    await requestToPromise(store.clear());
    for (const invitation of invitations || []) {
      if (invitation?.invitationId) await requestToPromise(store.put(invitation));
    }
  });
}

export async function listInvitations() {
  return withStore(STORES.invitations, 'readonly', (store) => requestToPromise(store.getAll()));
}

function entityKey(spaceId = '', entityType = '', entityId = '') {
  return `${spaceId}|${entityType}|${entityId}`;
}

export async function getEntity(spaceId = '', entityType = '', entityId = '') {
  return withStore(STORES.entities, 'readonly', (store) => requestToPromise(store.get(entityKey(spaceId, entityType, entityId))));
}

export async function listEntities(spaceId = '') {
  return withStore(STORES.entities, 'readonly', async (store) => {
    if (!spaceId) return requestToPromise(store.getAll());
    return requestToPromise(store.index('spaceId').getAll(spaceId));
  });
}

function normalizeSequence(value = 0) {
  const sequence = Number(value || 0);
  return Number.isFinite(sequence) && sequence > 0 ? sequence : 0;
}

function operationIdOf(operation = {}) {
  return String(operation?.operationId || '').trim();
}

function isEntityOperation(operation = {}) {
  return ['entity.put', 'entity.patch', 'entity.trash', 'entity.restore', 'entity.purge', 'entity.delete', 'custom'].includes(String(operation?.type || ''));
}

function operationWithAuthoritativeLifecycleActor(operation = {}, actorUserId = '') {
  if (!['entity.trash', 'entity.restore'].includes(String(operation?.type || ''))) return operation;
  const authoritativeActorUserId = String(actorUserId || '').trim().slice(0, 140);
  return {
    ...operation,
    payload: {
      ...(operation.payload && typeof operation.payload === 'object' ? operation.payload : {}),
      actorUserId: authoritativeActorUserId
    }
  };
}

function comparableValuesEqual(left, right) {
  if (Object.is(left, right)) return true;
  if (left === null || right === null || typeof left !== 'object' || typeof right !== 'object') return false;
  if (Array.isArray(left) !== Array.isArray(right)) return false;
  if (Array.isArray(left)) {
    return left.length === right.length && left.every((value, index) => comparableValuesEqual(value, right[index]));
  }
  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();
  return leftKeys.length === rightKeys.length
    && leftKeys.every((key, index) => key === rightKeys[index] && comparableValuesEqual(left[key], right[key]));
}

function normalizeReferenceGuards(input = []) {
  const guards = [];
  for (const source of Array.isArray(input) ? input.slice(0, 8) : []) {
    const entityType = String(source?.entityType || '').trim().slice(0, 120);
    const field = String(source?.field || '').trim().slice(0, 120);
    if (!entityType || !field || !/^[a-zA-Z0-9_$.-]+$/.test(field)) continue;
    const equals = source?.equals;
    if (!['string', 'number', 'boolean'].includes(typeof equals) && equals !== null) continue;
    guards.push({ entityType, field, equals });
  }
  return guards;
}

function normalizeReferenceRequirements(input = []) {
  const requirements = [];
  const seen = new Set();
  for (const source of Array.isArray(input) ? input.slice(0, 8) : []) {
    const entityType = String(source?.entityType || '').trim().slice(0, 120);
    const entityId = String(source?.entityId || '').trim().slice(0, 180);
    if (!entityType || !entityId) continue;
    const key = `${entityType}|${entityId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    requirements.push({ entityType, entityId });
  }
  return requirements;
}

function normalizeDependentDeletes(input = [], sourceOperation = {}) {
  const sourceType = String(sourceOperation?.entityType || '').trim().toLowerCase();
  const sourceId = String(sourceOperation?.entityId || '').trim().slice(0, 180);
  const deletes = [];
  const seen = new Set();
  for (const candidate of Array.isArray(input) ? input.slice(0, 4) : []) {
    const entityType = String(candidate?.entityType || '').trim().toLowerCase().slice(0, 80);
    const entityId = String(candidate?.entityId || '').trim().slice(0, 180);
    const relation = String(candidate?.relation || '').trim().toLowerCase().slice(0, 80);
    const supported = ['entity.delete', 'entity.purge'].includes(String(sourceOperation?.type || ''))
      && sourceType === 'admin.purchase'
      && entityType === 'admin.projection-link'
      && entityId === sourceId
      && relation === 'admin.purchase-projection-link-v1';
    if (!supported) continue;
    const key = `${entityType}|${entityId}|${relation}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deletes.push({ entityType, entityId, relation });
  }
  return deletes;
}

function objectPathValue(value = null, path = '') {
  let current = value;
  for (const part of String(path || '').split('.')) {
    if (!part || current === null || typeof current !== 'object' || !Object.prototype.hasOwnProperty.call(current, part)) {
      return { found: false, value: undefined };
    }
    current = current[part];
  }
  return { found: true, value: current };
}

function referenceCandidateState(record = {}, optimistic = false) {
  if (optimistic) {
    return {
      active: Boolean(record && !record.deleted && record.value && typeof record.value === 'object'),
      value: record?.value || null
    };
  }
  if (record && Object.prototype.hasOwnProperty.call(record, 'confirmedExists')) {
    return {
      active: Boolean(record.confirmedExists && !record.confirmedDeleted && record.confirmedValue && typeof record.confirmedValue === 'object'),
      value: record.confirmedValue || null
    };
  }
  return {
    active: Boolean(record && !record.optimistic && !record.deleted && record.value && typeof record.value === 'object'),
    value: record?.value || null
  };
}

function findReferenceGuardConflictsFromRecords(records = [], event = {}) {
  const operation = event.operation || {};
  if (!['entity.delete', 'entity.purge'].includes(operation.type)) return [];
  const guards = normalizeReferenceGuards(operation.payload?.referenceGuards);
  if (!guards.length) return [];
  const targetKey = entityKey(event.spaceId, operation.entityType, operation.entityId);
  const conflicts = [];
  for (const guard of guards) {
    const reference = (Array.isArray(records) ? records : []).find((record) => {
      if (!record || record.key === targetKey || record.entityType !== guard.entityType) return false;
      const candidate = referenceCandidateState(record, Boolean(event.optimistic));
      if (!candidate.active) return false;
      const current = objectPathValue(candidate.value, guard.field);
      return current.found && comparableValuesEqual(current.value, guard.equals);
    });
    if (!reference) continue;
    conflicts.push({
      field: '__reference__',
      referenceEntityType: guard.entityType,
      referenceEntityId: reference.entityId || '',
      referenceField: guard.field,
      referenceValue: guard.equals
    });
  }
  return conflicts;
}

function findReferenceRequirementConflictsFromRecords(records = [], event = {}) {
  const operation = event.operation || {};
  const requirements = normalizeReferenceRequirements(operation.payload?.referenceRequirements);
  if (!requirements.length) return [];
  const targetKey = entityKey(event.spaceId, operation.entityType, operation.entityId);
  const conflicts = [];
  for (const requirement of requirements) {
    const requiredKey = entityKey(event.spaceId, requirement.entityType, requirement.entityId);
    const reference = (Array.isArray(records) ? records : []).find((record) => record?.key === requiredKey);
    const candidate = referenceCandidateState(reference, Boolean(event.optimistic));
    if (requiredKey !== targetKey && candidate.active) continue;
    conflicts.push({
      field: '__reference_required__',
      referenceEntityType: requirement.entityType,
      referenceEntityId: requirement.entityId,
      reason: requiredKey === targetKey ? 'self_reference' : 'missing_or_deleted'
    });
  }
  return conflicts;
}

function applyOperationToState(input = {}, operation = {}) {
  const state = {
    exists: Boolean(input.exists),
    value: Object.prototype.hasOwnProperty.call(input, 'value') ? input.value : null,
    deleted: Boolean(input.deleted)
  };
  const referenceConflicts = Array.isArray(operation.referenceConflicts) ? operation.referenceConflicts : [];
  if (referenceConflicts.length) {
    return {
      supported: true,
      conflicts: referenceConflicts,
      partial: true,
      skipped: true,
      ...state
    };
  }
  if (operation.type === 'entity.put') {
    state.exists = true;
    state.value = Object.prototype.hasOwnProperty.call(operation.payload || {}, 'value')
      ? operation.payload.value
      : operation.payload;
    state.deleted = false;
    return { supported: true, ...state };
  }
  if (operation.type === 'entity.patch') {
    const patch = operation.payload?.patch && typeof operation.payload.patch === 'object'
      ? operation.payload.patch
      : operation.payload;
    const expected = operation.payload?.expected && typeof operation.payload.expected === 'object'
      && !Array.isArray(operation.payload.expected)
      ? operation.payload.expected
      : null;
    const preserveRemote = operation.payload?.conflictPolicy === 'preserve-remote' && expected;
    const current = state.exists && state.value && typeof state.value === 'object' && !Array.isArray(state.value)
      ? state.value
      : {};
    const acceptedPatch = {};
    const conflicts = [];
    for (const [field, value] of Object.entries(patch || {})) {
      if (preserveRemote
        && Object.prototype.hasOwnProperty.call(expected, field)
        && !comparableValuesEqual(current[field], expected[field])) {
        conflicts.push({ field, expected: expected[field], actual: current[field] });
        continue;
      }
      acceptedPatch[field] = value;
    }
    state.exists = true;
    state.value = { ...current, ...acceptedPatch };
    state.deleted = false;
    return { supported: true, conflicts, partial: conflicts.length > 0, ...state };
  }
  if (operation.type === 'entity.trash' || operation.type === 'entity.restore') {
    const payload = operation.payload && typeof operation.payload === 'object' ? operation.payload : {};
    const expected = payload.expected && typeof payload.expected === 'object' && !Array.isArray(payload.expected)
      ? payload.expected
      : null;
    const storedCurrent = state.exists && !state.deleted && state.value && typeof state.value === 'object' && !Array.isArray(state.value)
      ? state.value
      : null;
    const recoverableProjectRoot = operation.type === 'entity.trash'
      && !storedCurrent
      && expected
      && String(operation.entityType || '') === 'admin.project'
      && String(operation.entityId || '') === 'project';
    const current = storedCurrent || (recoverableProjectRoot ? expected : null);
    if (!current || (storedCurrent && expected && !comparableValuesEqual(storedCurrent, expected))) {
      return {
        supported: true,
        conflicts: [{ field: '__entity__', expected, actual: current }],
        partial: true,
        skipped: true,
        ...state
      };
    }
    const at = String(payload.at || '').trim().slice(0, 60) || new Date().toISOString();
    const actorUserId = String(payload.actorUserId || '').trim().slice(0, 140);
    const next = { ...current, updatedAt: at };
    if (operation.type === 'entity.trash') {
      next.trashedAt = at;
      next.trashedBy = actorUserId;
      delete next.restoredAt;
      delete next.restoredBy;
    } else {
      next.trashedAt = '';
      next.trashedBy = '';
      next.restoredAt = at;
      next.restoredBy = actorUserId;
    }
    state.exists = true;
    state.value = next;
    state.deleted = false;
    return { supported: true, conflicts: [], partial: false, skipped: false, ...state };
  }
  if (operation.type === 'entity.delete' || operation.type === 'entity.purge') {
    const expected = operation.payload?.expected && typeof operation.payload.expected === 'object'
      && !Array.isArray(operation.payload.expected)
      ? operation.payload.expected
      : null;
    const preserveRemote = operation.payload?.conflictPolicy === 'preserve-remote' && expected;
    const current = state.exists && !state.deleted ? state.value : null;
    if (preserveRemote && !comparableValuesEqual(current, expected)) {
      return {
        supported: true,
        conflicts: [{ field: '__entity__', expected, actual: current }],
        partial: true,
        skipped: true,
        ...state
      };
    }
    state.exists = true;
    state.value = null;
    state.deleted = true;
    return { supported: true, conflicts: [], partial: false, skipped: false, ...state };
  }
  if (operation.type === 'custom') {
    state.exists = true;
    state.value = operation.payload && typeof operation.payload === 'object'
      ? operation.payload
      : {};
    state.deleted = false;
    return { supported: true, ...state };
  }
  return { supported: false, ...state };
}

function normalizePendingOperation(event = {}) {
  const operation = event.operation || {};
  const operationId = operationIdOf(operation);
  if (!operationId || !isEntityOperation(operation)) return null;
  return {
    operation: {
      operationId,
      type: operation.type,
      entityType: operation.entityType,
      entityId: operation.entityId,
      baseVersion: Math.max(0, Number(operation.baseVersion || 0)),
      payload: operation.payload && typeof operation.payload === 'object' ? operation.payload : {},
      referenceConflicts: Array.isArray(operation.referenceConflicts) ? operation.referenceConflicts : [],
      clientCreatedAt: operation.clientCreatedAt || ''
    },
    actorUserId: event.actorUserId || '',
    sourceDeviceId: event.sourceDeviceId || '',
    createdAt: event.createdAt || new Date().toISOString()
  };
}

function normalizePendingOperations(existing = {}) {
  const pending = Array.isArray(existing?.pendingOperations) ? existing.pendingOperations : [];
  const unique = [];
  const seen = new Set();
  for (const entry of pending) {
    const operation = entry?.operation || entry || {};
    const operationId = operationIdOf(operation);
    if (!operationId || seen.has(operationId) || !isEntityOperation(operation)) continue;
    seen.add(operationId);
    unique.push({
      operation: {
        operationId,
        type: operation.type,
        entityType: operation.entityType,
        entityId: operation.entityId,
        baseVersion: Math.max(0, Number(operation.baseVersion || 0)),
        payload: operation.payload && typeof operation.payload === 'object' ? operation.payload : {},
        referenceConflicts: Array.isArray(operation.referenceConflicts) ? operation.referenceConflicts : [],
        clientCreatedAt: operation.clientCreatedAt || ''
      },
      actorUserId: entry?.actorUserId || '',
      sourceDeviceId: entry?.sourceDeviceId || '',
      createdAt: entry?.createdAt || new Date().toISOString()
    });
  }
  return unique;
}

function normalizeEntityState(existing = null, identity = {}) {
  const hasConfirmedSchema = Boolean(existing && Object.prototype.hasOwnProperty.call(existing, 'confirmedExists'));
  const legacyOptimistic = Boolean(existing?.optimistic) && !hasConfirmedSchema;
  return {
    key: identity.key || existing?.key || '',
    spaceId: identity.spaceId || existing?.spaceId || '',
    entityType: identity.entityType || existing?.entityType || '',
    entityId: identity.entityId || existing?.entityId || '',
    confirmedExists: hasConfirmedSchema ? Boolean(existing.confirmedExists) : Boolean(existing && !legacyOptimistic),
    confirmedValue: hasConfirmedSchema ? existing.confirmedValue : (legacyOptimistic ? null : existing?.value ?? null),
    confirmedDeleted: hasConfirmedSchema ? Boolean(existing.confirmedDeleted) : Boolean(existing?.deleted && !legacyOptimistic),
    confirmedOperationId: hasConfirmedSchema ? existing.confirmedOperationId || '' : (legacyOptimistic ? '' : existing?.operationId || ''),
    confirmedOperationType: hasConfirmedSchema ? existing.confirmedOperationType || '' : (legacyOptimistic ? '' : existing?.operationType || ''),
    confirmedActorUserId: hasConfirmedSchema ? existing.confirmedActorUserId || '' : (legacyOptimistic ? '' : existing?.actorUserId || ''),
    confirmedSourceDeviceId: hasConfirmedSchema ? existing.confirmedSourceDeviceId || '' : (legacyOptimistic ? '' : existing?.sourceDeviceId || ''),
    confirmedSpaceSequence: hasConfirmedSchema
      ? normalizeSequence(existing.confirmedSpaceSequence)
      : normalizeSequence(legacyOptimistic ? 0 : existing?.spaceSequence),
    confirmedStateRevision: hasConfirmedSchema
      ? normalizeSequence(existing.confirmedStateRevision)
      : normalizeSequence(legacyOptimistic ? 0 : existing?.stateRevision || existing?.spaceSequence),
    confirmedUpdatedAt: hasConfirmedSchema ? existing.confirmedUpdatedAt || '' : (legacyOptimistic ? '' : existing?.updatedAt || ''),
    pendingOperations: normalizePendingOperations(existing || {}),
    unresolvedOptimistic: hasConfirmedSchema
      ? Boolean(existing.unresolvedOptimistic)
      : legacyOptimistic,
    unresolvedValue: hasConfirmedSchema ? existing.unresolvedValue : (legacyOptimistic ? existing?.value ?? null : null),
    unresolvedDeleted: hasConfirmedSchema ? Boolean(existing.unresolvedDeleted) : Boolean(legacyOptimistic && existing?.deleted),
    unresolvedOperationId: hasConfirmedSchema ? existing.unresolvedOperationId || '' : (legacyOptimistic ? existing?.operationId || '' : ''),
    unresolvedOperationType: hasConfirmedSchema ? existing.unresolvedOperationType || '' : (legacyOptimistic ? existing?.operationType || '' : ''),
    unresolvedActorUserId: hasConfirmedSchema ? existing.unresolvedActorUserId || '' : (legacyOptimistic ? existing?.actorUserId || '' : ''),
    unresolvedSourceDeviceId: hasConfirmedSchema ? existing.unresolvedSourceDeviceId || '' : (legacyOptimistic ? existing?.sourceDeviceId || '' : ''),
    unresolvedUpdatedAt: hasConfirmedSchema ? existing.unresolvedUpdatedAt || '' : (legacyOptimistic ? existing?.updatedAt || '' : '')
  };
}

function materializeEntityState(state = {}) {
  let visible = state.unresolvedOptimistic
    ? { exists: true, value: state.unresolvedValue, deleted: Boolean(state.unresolvedDeleted) }
    : {
        exists: Boolean(state.confirmedExists),
        value: state.confirmedValue,
        deleted: Boolean(state.confirmedDeleted)
      };
  for (const entry of state.pendingOperations || []) {
    const pendingOperation = operationWithAuthoritativeLifecycleActor(entry.operation || {}, entry.actorUserId || '');
    const next = applyOperationToState(visible, pendingOperation);
    if (next.supported) visible = next;
  }

  const latestPending = (state.pendingOperations || []).at(-1) || null;
  if (!visible.exists && !state.unresolvedOptimistic && !(state.pendingOperations || []).length) return null;
  return {
    key: state.key,
    spaceId: state.spaceId,
    entityType: state.entityType,
    entityId: state.entityId,
    value: visible.value,
    deleted: Boolean(visible.deleted),
    operationId: latestPending?.operation?.operationId
      || (state.unresolvedOptimistic ? state.unresolvedOperationId : state.confirmedOperationId),
    operationType: latestPending?.operation?.type
      || (state.unresolvedOptimistic ? state.unresolvedOperationType : state.confirmedOperationType)
      || (visible.deleted ? 'entity.delete' : 'entity.put'),
    actorUserId: latestPending?.actorUserId
      || (state.unresolvedOptimistic ? state.unresolvedActorUserId : state.confirmedActorUserId),
    sourceDeviceId: latestPending?.sourceDeviceId
      || (state.unresolvedOptimistic ? state.unresolvedSourceDeviceId : state.confirmedSourceDeviceId),
    spaceSequence: normalizeSequence(state.confirmedSpaceSequence),
    stateRevision: normalizeSequence(state.confirmedStateRevision),
    optimistic: Boolean(state.unresolvedOptimistic || (state.pendingOperations || []).length),
    updatedAt: latestPending?.createdAt
      || (state.unresolvedOptimistic ? state.unresolvedUpdatedAt : state.confirmedUpdatedAt)
      || new Date().toISOString(),
    confirmedExists: Boolean(state.confirmedExists),
    confirmedValue: state.confirmedValue,
    confirmedDeleted: Boolean(state.confirmedDeleted),
    confirmedOperationId: state.confirmedOperationId || '',
    confirmedOperationType: state.confirmedOperationType || '',
    confirmedActorUserId: state.confirmedActorUserId || '',
    confirmedSourceDeviceId: state.confirmedSourceDeviceId || '',
    confirmedSpaceSequence: normalizeSequence(state.confirmedSpaceSequence),
    confirmedStateRevision: normalizeSequence(state.confirmedStateRevision),
    confirmedUpdatedAt: state.confirmedUpdatedAt || '',
    pendingOperations: state.pendingOperations || [],
    unresolvedOptimistic: Boolean(state.unresolvedOptimistic),
    unresolvedValue: state.unresolvedValue,
    unresolvedDeleted: Boolean(state.unresolvedDeleted),
    unresolvedOperationId: state.unresolvedOperationId || '',
    unresolvedOperationType: state.unresolvedOperationType || '',
    unresolvedActorUserId: state.unresolvedActorUserId || '',
    unresolvedSourceDeviceId: state.unresolvedSourceDeviceId || '',
    unresolvedUpdatedAt: state.unresolvedUpdatedAt || ''
  };
}

function reduceEntityRecord(existing = null, event = {}) {
  const operation = event.operation || {};
  if (!isEntityOperation(operation)) {
    return {
      applied: false,
      entity: existing || null,
      reason: 'unsupported',
      maxStateRevision: normalizeSequence(existing?.confirmedStateRevision || existing?.stateRevision || existing?.spaceSequence)
    };
  }

  const key = entityKey(event.spaceId, operation.entityType, operation.entityId);
  const state = normalizeEntityState(existing, {
    key,
    spaceId: event.spaceId,
    entityType: operation.entityType,
    entityId: operation.entityId
  });
  const incomingSequence = normalizeSequence(event.spaceSequence);
  const incomingStateRevision = normalizeSequence(event.stateRevision);
  const incomingCanonicalRevision = incomingStateRevision || incomingSequence;
  const optimistic = Boolean(event.optimistic) || !incomingCanonicalRevision;
  const operationId = operationIdOf(operation);

  if (optimistic) {
    const pending = normalizePendingOperation(event);
    if (!pending) return { applied: false, entity: existing || null, reason: 'invalid_optimistic_operation', maxStateRevision: state.confirmedStateRevision };
    state.pendingOperations = state.pendingOperations.filter((entry) => operationIdOf(entry.operation) !== operationId);
    state.pendingOperations.push(pending);
    return {
      applied: true,
      entity: materializeEntityState(state),
      optimistic: true,
      maxStateRevision: state.confirmedStateRevision
    };
  }

  const pendingBefore = state.pendingOperations.length;
  state.pendingOperations = state.pendingOperations.filter((entry) => operationIdOf(entry.operation) !== operationId);
  const removedPending = state.pendingOperations.length !== pendingBefore;
  const existingCanonicalRevision = normalizeSequence(state.confirmedStateRevision || state.confirmedSpaceSequence);
  if (existingCanonicalRevision >= incomingCanonicalRevision) {
    return {
      applied: removedPending,
      entity: materializeEntityState(state),
      reason: 'stale',
      maxStateRevision: state.confirmedStateRevision
    };
  }

  const canonicalBase = state.confirmedExists
    ? { exists: true, value: state.confirmedValue, deleted: state.confirmedDeleted }
    : state.unresolvedOptimistic
      ? { exists: true, value: state.unresolvedValue, deleted: state.unresolvedDeleted }
      : { exists: false, value: null, deleted: false };
  const canonicalOperation = operationWithAuthoritativeLifecycleActor(operation, event.actorUserId || '');
  const canonical = applyOperationToState(canonicalBase, canonicalOperation);
  if (!canonical.supported) {
    return { applied: false, entity: existing || null, reason: 'unsupported', maxStateRevision: state.confirmedStateRevision };
  }

  state.confirmedExists = canonical.exists;
  state.confirmedValue = canonical.value;
  state.confirmedDeleted = canonical.deleted;
  state.confirmedOperationId = operationId;
  state.confirmedOperationType = operation.type;
  state.confirmedActorUserId = event.actorUserId || '';
  state.confirmedSourceDeviceId = event.sourceDeviceId || '';
  state.confirmedSpaceSequence = incomingSequence;
  state.confirmedStateRevision = incomingStateRevision || incomingSequence;
  state.confirmedUpdatedAt = event.createdAt || new Date().toISOString();
  if (operation.type === 'entity.put' || ['entity.delete', 'entity.purge'].includes(operation.type) || operation.type === 'custom' || state.unresolvedOperationId === operationId) {
    state.unresolvedOptimistic = false;
    state.unresolvedValue = null;
    state.unresolvedDeleted = false;
    state.unresolvedOperationId = '';
    state.unresolvedOperationType = '';
    state.unresolvedActorUserId = '';
    state.unresolvedSourceDeviceId = '';
    state.unresolvedUpdatedAt = '';
  }

  return {
    applied: true,
    entity: materializeEntityState(state),
    conflicts: Array.isArray(canonical.conflicts) ? canonical.conflicts : [],
    partial: Boolean(canonical.partial),
    skipped: Boolean(canonical.skipped),
    maxStateRevision: state.confirmedStateRevision
  };
}

function discardPendingOperationRecord(existing = null, operation = {}) {
  if (!existing) return { reverted: false, entity: null, reason: 'entity_not_found' };
  const operationId = operationIdOf(operation);
  if (!operationId) return { reverted: false, entity: existing, reason: 'missing_operation_id' };
  const state = normalizeEntityState(existing, {
    key: existing.key,
    spaceId: existing.spaceId,
    entityType: existing.entityType,
    entityId: existing.entityId
  });
  const pendingBefore = state.pendingOperations.length;
  state.pendingOperations = state.pendingOperations.filter((entry) => operationIdOf(entry.operation) !== operationId);
  if (state.pendingOperations.length === pendingBefore) {
    return { reverted: false, entity: existing, reason: 'operation_not_pending' };
  }
  return { reverted: true, entity: materializeEntityState(state), reason: 'rejected_by_backend' };
}

function reconcileEntityMissingFromSnapshot(existing = null, sourceStateRevision = 0) {
  if (!existing) return { changed: false, entity: null, reason: 'entity_not_found', maxStateRevision: 0 };
  const state = normalizeEntityState(existing, {
    key: existing.key,
    spaceId: existing.spaceId,
    entityType: existing.entityType,
    entityId: existing.entityId
  });
  const confirmedRevision = normalizeSequence(state.confirmedStateRevision || state.confirmedSpaceSequence);
  const authoritativeRevision = normalizeSequence(sourceStateRevision);
  if (confirmedRevision > authoritativeRevision) {
    return {
      changed: false,
      entity: existing,
      reason: 'local_canonical_is_newer',
      maxStateRevision: confirmedRevision
    };
  }

  state.confirmedExists = false;
  state.confirmedValue = null;
  state.confirmedDeleted = false;
  state.confirmedOperationId = '';
  state.confirmedOperationType = '';
  state.confirmedActorUserId = '';
  state.confirmedSourceDeviceId = '';
  state.confirmedSpaceSequence = 0;
  state.confirmedStateRevision = 0;
  state.confirmedUpdatedAt = '';
  return {
    changed: true,
    entity: materializeEntityState(state),
    reason: 'missing_from_authoritative_snapshot',
    maxStateRevision: 0
  };
}

async function applyEntityOperation(store, event = {}) {
  const operation = event.operation || {};
  const key = entityKey(event.spaceId, operation.entityType, operation.entityId);
  const existing = await requestToPromise(store.get(key));
  const sourceWasActive = referenceCandidateState(existing, Boolean(event.optimistic)).active;
  let guardedEvent = event;
  const hasDeleteGuards = ['entity.delete', 'entity.purge'].includes(operation.type)
    && normalizeReferenceGuards(operation.payload?.referenceGuards).length > 0;
  const hasReferenceRequirements = normalizeReferenceRequirements(operation.payload?.referenceRequirements).length > 0;
  if (hasDeleteGuards || hasReferenceRequirements) {
    const records = await requestToPromise(store.index('spaceId').getAll(event.spaceId));
    const referenceConflicts = [
      ...(hasDeleteGuards ? findReferenceGuardConflictsFromRecords(records, event) : []),
      ...(hasReferenceRequirements ? findReferenceRequirementConflictsFromRecords(records, event) : [])
    ];
    guardedEvent = {
      ...event,
      operation: { ...operation, referenceConflicts }
    };
  }
  const result = reduceEntityRecord(existing, guardedEvent);
  if (result.entity) await requestToPromise(store.put(result.entity));
  else if (result.applied) await requestToPromise(store.delete(key));
  const dependent = await applyDependentDeletes(store, guardedEvent, result, sourceWasActive);
  return {
    ...result,
    dependentDeletesApplied: dependent.applied,
    dependentDeletesReverted: dependent.reverted
  };
}

async function applyDependentDeletes(store, event = {}, sourceResult = {}, sourceWasActive = false) {
  const sourceOperation = event.operation || {};
  const dependentDeletes = normalizeDependentDeletes(sourceOperation.dependentDeletes, sourceOperation);
  if (!dependentDeletes.length) return { applied: 0, reverted: 0 };

  const sourceDeleteApplied = Boolean(
    sourceWasActive
    && !sourceResult.skipped
    && sourceResult.entity
    && sourceResult.entity.deleted
  );
  let applied = 0;
  let reverted = 0;
  for (const dependent of dependentDeletes) {
    const dependentKey = entityKey(event.spaceId, dependent.entityType, dependent.entityId);
    const existing = await requestToPromise(store.get(dependentKey));
    if (!existing) continue;

    const candidate = referenceCandidateState(existing, Boolean(event.optimistic));
    const purchaseId = objectPathValue(candidate.value, 'purchaseId');
    const relationMatches = dependent.relation === 'admin.purchase-projection-link-v1'
      && candidate.active
      && purchaseId.found
      && comparableValuesEqual(purchaseId.value, sourceOperation.entityId);

    if (!sourceDeleteApplied || !relationMatches) {
      if (!event.optimistic) {
        const rollback = discardPendingOperationRecord(existing, sourceOperation);
        if (rollback.reverted) {
          if (rollback.entity) await requestToPromise(store.put(rollback.entity));
          else await requestToPromise(store.delete(dependentKey));
          reverted += 1;
        }
      }
      continue;
    }

    const dependentEvent = {
      ...event,
      operation: {
        operationId: operationIdOf(sourceOperation),
        type: 'entity.delete',
        entityType: dependent.entityType,
        entityId: dependent.entityId,
        baseVersion: Math.max(0, Number(sourceOperation.baseVersion || 0)),
        payload: {}
      }
    };
    const dependentResult = reduceEntityRecord(existing, dependentEvent);
    if (dependentResult.entity) await requestToPromise(store.put(dependentResult.entity));
    else if (dependentResult.applied) await requestToPromise(store.delete(dependentKey));
    if (dependentResult.applied) applied += 1;
  }
  return { applied, reverted };
}

async function confirmOutboxOperation(store, event = {}) {
  const operationId = operationIdOf(event.operation || {});
  if (!operationId || event.optimistic) return false;
  const item = await requestToPromise(store.get(operationId));
  if (!item) return false;
  const queuedDeviceId = String(item?.request?.deviceId || '').trim();
  const sourceDeviceId = String(event.sourceDeviceId || '').trim();
  if (queuedDeviceId && sourceDeviceId && queuedDeviceId !== sourceDeviceId) return false;
  await requestToPromise(store.delete(operationId));
  return true;
}

function snapshotSessionKey(event = {}, payload = {}) {
  const requestId = String(payload.requestId || '').trim();
  const sourceDeviceId = String(event.sourceDeviceId || '').trim();
  return requestId && sourceDeviceId ? `${event.spaceId}|${requestId}|${sourceDeviceId}` : '';
}

function sortSnapshotEntities(entities = []) {
  return [...(entities || [])].sort((left, right) => {
    const leftKey = `${left?.entityType || ''}|${left?.entityId || ''}`;
    const rightKey = `${right?.entityType || ''}|${right?.entityId || ''}`;
    return leftKey.localeCompare(rightKey);
  });
}

async function sha256Hex(value = '') {
  const bytes = new TextEncoder().encode(String(value));
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function planSnapshotSessionCleanup(records = [], options = {}) {
  const currentSnapshotKey = String(options.currentSnapshotKey || '').trim();
  const spaceId = String(options.spaceId || '').trim();
  const removeCurrent = options.removeCurrent === true;
  const removeOtherSessions = options.removeOtherSessions === true;
  const requestedNowMs = Number(options.nowMs || Date.now());
  const nowMs = Number.isFinite(requestedNowMs) ? Math.max(0, requestedNowMs) : Date.now();
  const requestedMaxAgeMs = Number(options.maxAgeMs || snapshotStorageSessionTtlMs);
  const maxAgeMs = Math.max(
    MIN_SNAPSHOT_SESSION_TTL_SECONDS * 1000,
    Number.isFinite(requestedMaxAgeMs) ? requestedMaxAgeMs : snapshotStorageSessionTtlMs
  );
  const cutoff = nowMs - maxAgeMs;
  return (Array.isArray(records) ? records : [])
    .filter((record) => {
      const key = String(record?.key || '').trim();
      const recordSnapshotKey = String(record?.snapshotKey || '').trim();
      if (!key || !recordSnapshotKey) return Boolean(key);
      const createdAtMs = Number(record?.createdAtMs || 0);
      const expired = !Number.isFinite(createdAtMs) || createdAtMs <= 0 || createdAtMs < cutoff;
      const isCurrent = Boolean(currentSnapshotKey) && recordSnapshotKey === currentSnapshotKey;
      const sameSpace = Boolean(spaceId) && snapshotRecordSpaceId(record) === spaceId;
      return expired
        || (removeCurrent && isCurrent)
        || (removeOtherSessions && sameSpace && !isCurrent);
    })
    .map((record) => String(record.key || '').trim())
    .filter(Boolean);
}

let lastSnapshotCleanupAt = 0;

async function cleanupSnapshotSessions(options = {}) {
  const requestedNowMs = Number(options.nowMs || Date.now());
  const nowMs = Number.isFinite(requestedNowMs) ? Math.max(0, requestedNowMs) : Date.now();
  const forceSweep = options.forceSweep === true
    || options.removeCurrent === true
    || options.removeOtherSessions === true;
  const sweepIntervalMs = Math.min(5 * 60 * 1000, Math.max(30 * 1000, Math.floor(snapshotStorageSessionTtlMs / 4)));
  if (!forceSweep && nowMs - lastSnapshotCleanupAt < sweepIntervalMs) return 0;
  lastSnapshotCleanupAt = nowMs;
  return withStore(STORES.snapshots, 'readwrite', async (store) => {
    const records = await requestToPromise(store.getAll());
    const keys = planSnapshotSessionCleanup(records, {
      ...options,
      nowMs,
      maxAgeMs: snapshotStorageSessionTtlMs
    });
    for (const key of keys) await requestToPromise(store.delete(key));
    return keys.length;
  });
}

async function stageSnapshotChunk(event = {}) {
  const payload = event.operation?.payload || {};
  const snapshotKey = snapshotSessionKey(event, payload);
  const chunkIndex = Number(payload.chunkIndex);
  const chunkCount = Number(payload.chunkCount);
  const entityCount = Number(payload.entityCount);
  const sourceStateRevision = Number(payload.sourceStateRevision);
  const entities = Array.isArray(payload.entities) ? payload.entities : [];
  const budget = validateSnapshotBudgetMetadata(payload);
  if (
    !snapshotKey
    || !budget.valid
    || !Number.isInteger(chunkIndex)
    || !Number.isInteger(chunkCount)
    || chunkCount < 1
    || chunkIndex < 0
    || chunkIndex >= chunkCount
    || !Number.isInteger(entityCount)
    || entityCount < 0
    || !Number.isInteger(sourceStateRevision)
    || sourceStateRevision < 0
    || !String(payload.snapshotDigest || '').trim()
  ) {
    if (snapshotKey) {
      await cleanupSnapshotSessions({ currentSnapshotKey: snapshotKey, removeCurrent: true, forceSweep: true }).catch(() => 0);
    }
    return { applied: false, snapshot: true, snapshotIncomplete: true, reason: 'invalid_snapshot_chunk' };
  }
  await cleanupSnapshotSessions({
    currentSnapshotKey: snapshotKey,
    spaceId: String(event.spaceId || '').trim(),
    removeOtherSessions: chunkIndex === 0,
    forceSweep: chunkIndex === 0
  }).catch(() => 0);
  const key = `${snapshotKey}|${String(chunkIndex).padStart(8, '0')}`;
  await withStore(STORES.snapshots, 'readwrite', (store) => requestToPromise(store.put({
    key,
    snapshotKey,
    chunkIndex,
    chunkCount,
    entityCount,
    snapshotByteCount: budget.snapshotByteCount,
    chunkByteCount: budget.chunkByteCount,
    sourceStateRevision,
    spaceId: String(event.spaceId || '').trim(),
    requestId: String(payload.requestId || '').trim(),
    sourceDeviceId: String(event.sourceDeviceId || '').trim(),
    snapshotDigest: String(payload.snapshotDigest || ''),
    entities,
    createdAtMs: Date.now()
  })));
  return { applied: false, snapshot: true, staged: true, chunkIndex, chunkCount };
}

async function finalizeSnapshot(event = {}) {
  const payload = event.operation?.payload || {};
  const snapshotKey = snapshotSessionKey(event, payload);
  const chunkCount = Number(payload.chunkCount);
  const entityCount = Number(payload.entityCount);
  const sourceStateRevision = Number(payload.sourceStateRevision);
  const snapshotDigest = String(payload.snapshotDigest || '').trim();
  const budget = validateSnapshotBudgetMetadata(payload);
  if (
    !snapshotKey
    || !budget.valid
    || !Number.isInteger(chunkCount)
    || chunkCount < 1
    || !Number.isInteger(entityCount)
    || entityCount < 0
    || !Number.isInteger(sourceStateRevision)
    || sourceStateRevision < 0
    || !snapshotDigest
  ) {
    if (snapshotKey) {
      await cleanupSnapshotSessions({ currentSnapshotKey: snapshotKey, removeCurrent: true, forceSweep: true }).catch(() => 0);
    }
    return { applied: false, snapshot: true, snapshotIncomplete: true, reason: 'invalid_snapshot_complete' };
  }

  const records = await withStore(STORES.snapshots, 'readonly', (store) => requestToPromise(store.index('snapshotKey').getAll(snapshotKey)));
  const ordered = [...(records || [])].sort((left, right) => Number(left.chunkIndex) - Number(right.chunkIndex));
  const complete = ordered.length === chunkCount
    && ordered.every((record, index) => Number(record.chunkIndex) === index
      && Number(record.chunkCount) === chunkCount
      && Number(record.entityCount) === entityCount
      && Number(record.snapshotByteCount) === budget.snapshotByteCount
      && Number(record.chunkByteCount) >= 2
      && Number(record.sourceStateRevision) === sourceStateRevision
      && String(record.snapshotDigest || '') === snapshotDigest)
    && ordered.reduce((total, record) => total + Number(record.chunkByteCount || 0), 0) === budget.snapshotByteCount;
  if (!complete) {
    await cleanupSnapshotSessions({ currentSnapshotKey: snapshotKey, removeCurrent: true, forceSweep: true }).catch(() => 0);
    return {
      applied: false,
      snapshot: true,
      snapshotIncomplete: true,
      reason: 'missing_snapshot_chunks',
      receivedChunks: ordered.length,
      expectedChunks: chunkCount
    };
  }

  const entities = sortSnapshotEntities(ordered.flatMap((record) => Array.isArray(record.entities) ? record.entities : []));
  const incomingKeys = new Set();
  let invalidEntityIdentity = false;
  for (const source of entities) {
    const entityType = String(source?.entityType || '').trim();
    const entityId = String(source?.entityId || '').trim();
    if (!entityType || !entityId) {
      invalidEntityIdentity = true;
      break;
    }
    const key = entityKey(event.spaceId, entityType, entityId);
    if (incomingKeys.has(key)) {
      invalidEntityIdentity = true;
      break;
    }
    incomingKeys.add(key);
  }
  const highestEntityRevision = entities.reduce((maximum, entity) => Math.max(
    maximum,
    normalizeSequence(entity?.stateRevision || entity?.spaceSequence)
  ), 0);
  const calculatedSnapshotDigest = await sha256Hex(JSON.stringify(entities));
  if (
    entities.length !== entityCount
    || invalidEntityIdentity
    || highestEntityRevision > sourceStateRevision
    || calculatedSnapshotDigest !== snapshotDigest
  ) {
    await withStore(STORES.snapshots, 'readwrite', async (store) => {
      for (const record of ordered) await requestToPromise(store.delete(record.key));
    });
    return { applied: false, snapshot: true, snapshotIncomplete: true, reason: 'snapshot_integrity_mismatch' };
  }

  const result = await withStores([STORES.entities, STORES.snapshots], 'readwrite', async (stores) => {
    let applied = 0;
    let removed = 0;
    let preservedNewer = 0;
    let maxStateRevision = sourceStateRevision;
    const existingRecords = await requestToPromise(stores[STORES.entities].index('spaceId').getAll(event.spaceId));
    for (const source of entities) {
      if (!source?.entityId || !source?.entityType) continue;
      const sourceOperationType = source.deleted
        ? 'entity.delete'
        : source.operationType === 'custom'
          ? 'custom'
          : 'entity.put';
      const snapshotEvent = {
        ...event,
        spaceSequence: Number(source.spaceSequence || 0),
        stateRevision: Number(source.stateRevision || source.spaceSequence || 0),
        optimistic: false,
        operation: {
          operationId: source.operationId || `${event.operation.operationId}:${source.entityType}:${source.entityId}`,
          type: sourceOperationType,
          entityType: source.entityType,
          entityId: source.entityId,
          payload: sourceOperationType === 'custom'
            ? (source.value && typeof source.value === 'object' ? source.value : {})
            : { value: source.value }
        }
      };
      const itemResult = await applyEntityOperation(stores[STORES.entities], snapshotEvent);
      maxStateRevision = Math.max(maxStateRevision, Number(itemResult.maxStateRevision || 0));
      if (itemResult.applied) applied += 1;
    }
    for (const existing of existingRecords || []) {
      if (!existing?.key || incomingKeys.has(existing.key)) continue;
      const reconciliation = reconcileEntityMissingFromSnapshot(existing, sourceStateRevision);
      maxStateRevision = Math.max(maxStateRevision, Number(reconciliation.maxStateRevision || 0));
      if (!reconciliation.changed) {
        if (reconciliation.reason === 'local_canonical_is_newer') preservedNewer += 1;
        continue;
      }
      if (reconciliation.entity) await requestToPromise(stores[STORES.entities].put(reconciliation.entity));
      else await requestToPromise(stores[STORES.entities].delete(existing.key));
      removed += 1;
    }
    for (const record of ordered) await requestToPromise(stores[STORES.snapshots].delete(record.key));
    return {
      applied: applied > 0 || removed > 0 || entityCount === 0,
      count: applied,
      removed,
      preservedNewer,
      snapshot: true,
      authoritativeStateRevision: true,
      sourceStateRevision,
      maxStateRevision
    };
  });
  return result;
}

function atomicBatchDescriptor(event = {}) {
  const hasBatchMetadata = ['batchId', 'batchIndex', 'batchSize'].some((field) => (
    Object.prototype.hasOwnProperty.call(event || {}, field)
  ));
  if (!hasBatchMetadata) return null;

  const batchId = String(event.batchId || '').trim();
  const batchIndex = Number(event.batchIndex);
  const batchSize = Number(event.batchSize);
  const spaceId = String(event.spaceId || '').trim();
  const operationId = operationIdOf(event.operation || {});
  if (
    event.eventType !== 'p2p.operation'
    || !isEntityOperation(event.operation || {})
    || !spaceId
    || !batchId
    || !operationId
    || !Number.isInteger(batchIndex)
    || !Number.isInteger(batchSize)
    || batchSize < 2
    || batchSize > 8
    || batchIndex < 0
    || batchIndex >= batchSize
  ) {
    const error = new Error('El evento declara un lote atómico incompleto o inválido.');
    error.code = 'P2P_ATOMIC_BATCH_INVALID';
    throw error;
  }
  return { batchId, batchIndex, batchSize, spaceId, operationId };
}

function normalizeAtomicBatchEvents(events = []) {
  const normalized = Array.isArray(events) ? events.filter(Boolean) : [];
  if (normalized.length < 2 || normalized.length > 8) {
    const error = new Error('El lote remoto debe contener entre dos y ocho operaciones.');
    error.code = 'P2P_ATOMIC_BATCH_INCOMPLETE';
    throw error;
  }

  const described = normalized.map((event) => ({ event, descriptor: atomicBatchDescriptor(event) }));
  const first = described[0].descriptor;
  if (!first || first.batchSize !== described.length) {
    const error = new Error('El lote remoto no contiene todas sus operaciones.');
    error.code = 'P2P_ATOMIC_BATCH_INCOMPLETE';
    throw error;
  }
  described.sort((left, right) => left.descriptor.batchIndex - right.descriptor.batchIndex);

  const operationIds = new Set();
  for (let index = 0; index < described.length; index += 1) {
    const current = described[index];
    if (
      current.descriptor.batchId !== first.batchId
      || current.descriptor.batchSize !== first.batchSize
      || current.descriptor.spaceId !== first.spaceId
      || current.descriptor.batchIndex !== index
      || operationIds.has(current.descriptor.operationId)
    ) {
      const error = new Error('El lote remoto perdió su identidad, orden o unicidad.');
      error.code = 'P2P_ATOMIC_BATCH_CONFLICT';
      throw error;
    }
    operationIds.add(current.descriptor.operationId);
  }

  const ordered = described.map((entry) => entry.event);
  for (let index = 1; index < ordered.length; index += 1) {
    const previous = ordered[index - 1];
    const current = ordered[index];
    const previousSpaceSequence = normalizeSequence(previous.spaceSequence);
    const currentSpaceSequence = normalizeSequence(current.spaceSequence);
    const previousStateRevision = normalizeSequence(previous.stateRevision);
    const currentStateRevision = normalizeSequence(current.stateRevision);
    if (
      (previousSpaceSequence && currentSpaceSequence !== previousSpaceSequence + 1)
      || (previousStateRevision && currentStateRevision !== previousStateRevision + 1)
    ) {
      const error = new Error('Las operaciones del lote remoto no tienen revisiones canónicas contiguas.');
      error.code = 'P2P_ATOMIC_BATCH_SEQUENCE_GAP';
      throw error;
    }
  }
  return ordered;
}

export async function applyP2PEventBatch(events = []) {
  const ordered = normalizeAtomicBatchEvents(events);
  const spaceId = String(ordered[0].spaceId || '').trim();
  return withStores([STORES.entities, STORES.outbox, STORES.meta], 'readwrite', async (stores) => {
    const results = [];
    let maxStateRevision = 0;
    for (const event of ordered) {
      const applied = await applyEntityOperation(stores[STORES.entities], event);
      const outboxConfirmed = await confirmOutboxOperation(stores[STORES.outbox], event);
      const result = { ...applied, outboxConfirmed };
      results.push(result);
      maxStateRevision = Math.max(maxStateRevision, Math.max(0, Number(result?.maxStateRevision || 0)));
    }

    if (spaceId && maxStateRevision > 0) {
      const metaKey = `${STATE_REVISION_META_PREFIX}${spaceId}`;
      const currentRecord = await requestToPromise(stores[STORES.meta].get(metaKey));
      const currentRevision = Math.max(0, Number(currentRecord?.value || 0));
      if (maxStateRevision > currentRevision) {
        await requestToPromise(stores[STORES.meta].put({ key: metaKey, value: maxStateRevision }));
      }
    }

    return {
      applied: results.some((result) => result?.applied),
      atomic: true,
      batchId: String(ordered[0].batchId || '').trim(),
      count: ordered.length,
      maxStateRevision,
      results
    };
  });
}

export async function applyP2PEvent(event = {}) {
  if (event.eventType !== 'p2p.operation') return { applied: false, reason: 'not_operation' };
  const operation = event.operation || {};
  let result;
  if (operation.type === 'snapshot.chunk') {
    result = await stageSnapshotChunk(event);
  } else if (operation.type === 'snapshot.complete') {
    result = await finalizeSnapshot(event);
  } else if (isEntityOperation(operation) && !event.optimistic) {
    result = await withStores([STORES.entities, STORES.outbox], 'readwrite', async (stores) => {
      const applied = await applyEntityOperation(stores[STORES.entities], event);
      const outboxConfirmed = await confirmOutboxOperation(stores[STORES.outbox], event);
      return { ...applied, outboxConfirmed };
    });
  } else {
    result = await withStore(STORES.entities, 'readwrite', (store) => applyEntityOperation(store, event));
  }
  const maxStateRevision = Math.max(0, Number(result?.maxStateRevision || 0));
  if (event.spaceId && result?.authoritativeStateRevision) {
    await setMeta(`${STATE_REVISION_META_PREFIX}${event.spaceId}`, maxStateRevision);
  } else if (event.spaceId && maxStateRevision > 0) {
    const current = Math.max(0, Number(await getMeta(`${STATE_REVISION_META_PREFIX}${event.spaceId}`, 0) || 0));
    if (maxStateRevision > current) await setMeta(`${STATE_REVISION_META_PREFIX}${event.spaceId}`, maxStateRevision);
  }
  return result;
}

export async function listStateRevisions(spaceIds = []) {
  const result = {};
  for (const rawSpaceId of Array.from(new Set(spaceIds || []))) {
    const spaceId = String(rawSpaceId || '').trim();
    if (!spaceId) continue;
    let revision = Math.max(0, Number(await getMeta(`${STATE_REVISION_META_PREFIX}${spaceId}`, 0) || 0));
    if (!revision) {
      const entities = await listEntities(spaceId);
      revision = entities.reduce((maximum, entity) => Math.max(
        maximum,
        normalizeSequence(entity?.stateRevision || entity?.spaceSequence)
      ), 0);
      if (revision) await setMeta(`${STATE_REVISION_META_PREFIX}${spaceId}`, revision);
    }
    result[spaceId] = revision;
  }
  return result;
}

export async function enqueueOutbox(item = {}) {
  return withStore(STORES.outbox, 'readwrite', (store) => requestToPromise(store.put(item)));
}

export async function enqueueOutboxBatch(items = []) {
  const normalized = Array.isArray(items) ? items.filter(Boolean) : [];
  if (!normalized.length) return { count: 0, operationIds: [] };
  const operationIds = normalized.map((item) => String(item?.operationId || '').trim());
  if (operationIds.some((operationId) => !operationId) || new Set(operationIds).size !== operationIds.length) {
    throw new Error('El lote de outbox necesita identificadores de operación únicos.');
  }
  return withStore(STORES.outbox, 'readwrite', async (store) => {
    for (const item of normalized) await requestToPromise(store.put(item));
    return { count: normalized.length, operationIds };
  });
}

export async function enqueueOptimisticOperation(item = {}, event = {}) {
  return withStores([STORES.entities, STORES.outbox], 'readwrite', async (stores) => {
    const result = await applyEntityOperation(stores[STORES.entities], event);
    await requestToPromise(stores[STORES.outbox].put(item));
    return result;
  });
}

export async function enqueueOptimisticOperationBatch(entries = []) {
  const normalized = Array.isArray(entries) ? entries.filter(Boolean) : [];
  if (!normalized.length) throw new Error('El lote local necesita al menos una operación.');

  const seenOperationIds = new Set();
  for (const entry of normalized) {
    const itemOperationId = String(entry?.item?.operationId || '').trim();
    const eventOperationId = String(entry?.event?.operation?.operationId || '').trim();
    if (!itemOperationId || !eventOperationId) throw new Error('Cada operación del lote necesita un identificador estable en el evento y el outbox.');
    if (itemOperationId !== eventOperationId) throw new Error('El evento y el outbox del lote deben compartir el mismo identificador de operación.');
    if (seenOperationIds.has(itemOperationId)) throw new Error('El lote local contiene identificadores de operación repetidos.');
    seenOperationIds.add(itemOperationId);
  }

  return withStores([STORES.entities, STORES.outbox], 'readwrite', async (stores) => {
    const results = [];
    for (const entry of normalized) {
      const result = await applyEntityOperation(stores[STORES.entities], entry.event || {});
      await requestToPromise(stores[STORES.outbox].put(entry.item || {}));
      results.push(result);
    }
    return { count: results.length, results };
  });
}

export async function listOutbox() {
  return withStore(STORES.outbox, 'readonly', (store) => requestToPromise(store.index('createdAt').getAll()));
}

export async function rebindLocalDeviceId(previousDeviceId = '', nextDeviceId = '') {
  const previous = String(previousDeviceId || '').trim();
  const next = String(nextDeviceId || '').trim();
  if (!previous || !next || previous === next) return { outbox: 0, entities: 0 };

  return withStores([STORES.outbox, STORES.entities], 'readwrite', async (stores) => {
    let outbox = 0;
    const outboxItems = await requestToPromise(stores[STORES.outbox].getAll());
    for (const item of outboxItems || []) {
      if (String(item?.request?.deviceId || '').trim() !== previous) continue;
      await requestToPromise(stores[STORES.outbox].put({
        ...item,
        request: { ...(item.request || {}), deviceId: next },
        deviceReboundAt: new Date().toISOString()
      }));
      outbox += 1;
    }

    let entities = 0;
    const entityRecords = await requestToPromise(stores[STORES.entities].getAll());
    for (const record of entityRecords || []) {
      let changed = false;
      const pendingOperations = (Array.isArray(record?.pendingOperations) ? record.pendingOperations : []).map((entry) => {
        if (String(entry?.sourceDeviceId || '').trim() !== previous) return entry;
        changed = true;
        return { ...entry, sourceDeviceId: next };
      });
      const unresolvedSourceDeviceId = String(record?.unresolvedSourceDeviceId || '').trim() === previous
        ? next
        : record?.unresolvedSourceDeviceId || '';
      if (unresolvedSourceDeviceId !== (record?.unresolvedSourceDeviceId || '')) changed = true;
      if (!changed) continue;
      await requestToPromise(stores[STORES.entities].put({
        ...record,
        pendingOperations,
        unresolvedSourceDeviceId
      }));
      entities += 1;
    }

    return { outbox, entities };
  });
}

export async function removeOutbox(operationId = '') {
  return withStore(STORES.outbox, 'readwrite', (store) => requestToPromise(store.delete(operationId)));
}

async function rejectOutboxOperationInStores(stores = {}, item = {}, error = null) {
  const operation = item?.request?.operation || {};
  const spaceId = String(item?.spaceId || item?.request?.spaceId || '').trim();
  let rollback = { reverted: false, entity: null, reason: 'not_entity_operation' };
  let dependentReverted = 0;
  if (spaceId && operation.entityType && operation.entityId && isEntityOperation(operation)) {
    const key = entityKey(spaceId, operation.entityType, operation.entityId);
    const existing = await requestToPromise(stores[STORES.entities].get(key));
    rollback = discardPendingOperationRecord(existing, operation);
    if (rollback.reverted) {
      if (rollback.entity) await requestToPromise(stores[STORES.entities].put(rollback.entity));
      else await requestToPromise(stores[STORES.entities].delete(key));
    }
    for (const dependent of normalizeDependentDeletes(operation.dependentDeletes, operation)) {
      const dependentKey = entityKey(spaceId, dependent.entityType, dependent.entityId);
      const dependentExisting = await requestToPromise(stores[STORES.entities].get(dependentKey));
      const dependentRollback = discardPendingOperationRecord(dependentExisting, operation);
      if (!dependentRollback.reverted) continue;
      if (dependentRollback.entity) await requestToPromise(stores[STORES.entities].put(dependentRollback.entity));
      else await requestToPromise(stores[STORES.entities].delete(dependentKey));
      dependentReverted += 1;
    }
  }
  const operationId = String(item?.operationId || operationIdOf(operation) || '').trim();
  await requestToPromise(stores[STORES.outbox].delete(operationId));
  return {
    ...rollback,
    dependentReverted,
    operationId,
    status: Number(error?.status || 0),
    message: String(error?.message || '')
  };
}

export async function rejectOutboxOperation(item = {}, error = null) {
  return withStores([STORES.entities, STORES.outbox], 'readwrite', (stores) => (
    rejectOutboxOperationInStores(stores, item, error)
  ));
}

export async function rejectOutboxOperationBatch(items = [], error = null) {
  const normalized = Array.isArray(items) ? items.filter(Boolean) : [];
  if (!normalized.length) return { count: 0, rollbacks: [] };
  const operationIds = normalized.map((item) => String(item?.operationId || item?.request?.operation?.operationId || '').trim());
  if (operationIds.some((operationId) => !operationId) || new Set(operationIds).size !== operationIds.length) {
    throw new Error('El lote rechazado necesita identificadores de operación únicos.');
  }

  const rollbackOrder = normalized
    .map((item, originalIndex) => ({ item, originalIndex }))
    .sort((left, right) => (
      Math.max(0, Number(right.item?.batchIndex || 0)) - Math.max(0, Number(left.item?.batchIndex || 0))
    ));

  return withStores([STORES.entities, STORES.outbox], 'readwrite', async (stores) => {
    const orderedResults = [];
    for (const entry of rollbackOrder) {
      orderedResults.push({
        originalIndex: entry.originalIndex,
        rollback: await rejectOutboxOperationInStores(stores, entry.item, error)
      });
    }
    orderedResults.sort((left, right) => left.originalIndex - right.originalIndex);
    return {
      count: orderedResults.length,
      rollbacks: orderedResults.map((entry) => entry.rollback)
    };
  });
}

export async function clearP2PLocalData() {
  const db = await openP2PDatabase();
  const transaction = db.transaction(Object.values(STORES), 'readwrite');
  for (const storeName of Object.values(STORES)) transaction.objectStore(storeName).clear();
  await transactionDone(transaction);
}
