import { P2P_APPLICATION_ID, scopedStorageKey } from './application-scope.js';
import { lifecycleReplicationPairAuthorized, memberAllowsDurableOperation } from './p2p-permissions.js';
import { apiGet, apiPost, getBackendUrl, getSessionToken, isSessionChangedError } from './api.js';
import { P2PTabCoordinator, classifyTabStateRelay } from './p2p-tab-coordinator.js';
import {
  getMeta,
  setMeta,
  setP2PStorageUser,
  configureP2PStorageLimits,
  saveSpaces,
  replaceBootstrapControlState,
  saveControlStateAtomically,
  purgeLocalSpace,
  listSpaces,
  listKnownSpaceIds,
  listInvitations,
  getEntity,
  listEntities,
  applyP2PEvent,
  applyP2PEventBatch,
  listStateRevisions,
  enqueueOutbox,
  enqueueOutboxBatch,
  enqueueOptimisticOperation,
  enqueueOptimisticOperationBatch,
  listOutbox,
  rebindLocalDeviceId,
  removeOutbox,
  rejectOutboxOperation,
  rejectOutboxOperationBatch,
  getRecoveryRequirements,
  updateRecoveryRequirements,
  resolveRecoveryRequirement
} from './p2p-storage.js';
import { resolveCanonicalInvitationDecision } from './p2p-invitation-intent.js';
import {
  createInvitationAuditTraceId,
  invitationAuditEntitySummary,
  invitationAuditEntityComparison,
  invitationAuditEscrowSummary,
  invitationAuditError,
  invitationAuditLog,
  maskInvitationAuditEmail,
  XXXsenXXX
} from './p2p-invitation-audit.js';
import {
  setP2PCryptoContext,
  closeP2PCryptoContext,
  ensureDeviceEncryptionIdentity,
  ensureDeviceSigningIdentity,
  signP2PLocalPayload,
  verifyP2PLocalSignature,
  verifyP2PLocalCapability,
  getActiveSpaceKey,
  hasSpaceKey,
  ensureSpaceKey,
  activateSpaceKey,
  createSpaceKeyEnvelope,
  createSpaceKeyEnvelopes,
  importSpaceKeyEnvelope,
  isRejectedKeyEnvelopeError,
  isRejectedEncryptedPayloadError,
  encryptOperationForTransport,
  decryptOperationEvent,
  createRejectedEncryptedPayloadError,
  encryptSnapshotEntities,
  deferEncryptedEvent,
  listDeferredEncryptedEvents,
  removeDeferredEncryptedEvent,
  purgeSpaceCrypto
} from './p2p-crypto.js';

const DEVICE_STORAGE_KEY_PREFIX = scopedStorageKey('semilla_p2p_device_id');
const DEVICE_NAME_STORAGE_KEY = scopedStorageKey('semilla_p2p_device_name');
const PUSH_VAPID_BINDING_STORAGE_KEY = scopedStorageKey('semilla_p2p_push_vapid_binding');
const CURSOR_META_PREFIX = 'deliveryCursor:';
const LOCAL_CAPABILITY_AUTHORITY_META_KEY = 'p2pSinCapabilityAuthority';
const LOCAL_CAPABILITY_META_PREFIX = 'p2pSinCapability:';
const SNAPSHOT_CHUNK_MAX_ITEMS = 40;
const DEFAULT_EVENT_MAX_BYTES = 192 * 1024;
const DEFAULT_ENTITY_MAX_BYTES = 168 * 1024;
const DEFAULT_SNAPSHOT_MAX_BYTES = 1024 * 1024;
const DEFAULT_SNAPSHOT_TRANSFER_MAX_BYTES = 1536 * 1024;
const DEFAULT_SNAPSHOT_MAX_CHUNKS = 500;
const SNAPSHOT_EVENT_SAFETY_BYTES = 12 * 1024;
const SNAPSHOT_TRANSFER_EVENT_OVERHEAD_BYTES = 2 * 1024;
const RETRY_BASE_MS = 1200;
const REALTIME_READY_TIMEOUT_MS = 15 * 1000;
const SERVER_RETRY_FALLBACK_MS = 5000;
const SERVER_RETRY_MAX_MS = 60 * 60 * 1000;
const ACK_BATCH_DELAY_MS = 250;
const ACK_RETRY_BASE_MS = 1000;
const ACK_RETRY_MAX_MS = 30000;
const REPLICA_HEALTH_FAST_RETRY_BASE_MS = 1500;
const REPLICA_HEALTH_FAST_RETRY_MAX_MS = 30000;
const REPLICA_HEALTH_BACKGROUND_RETRY_MS = 45 * 1000;
const REPLICA_HEALTH_RETRY_ATTEMPT_CAP = 6;
const REPLICA_HEALTH_SELF_RECOVERY_ATTEMPTS = 3;
const REPLICA_HEALTH_SELF_RECOVERY_COOLDOWN_MS = 60 * 1000;
const SNAPSHOT_RECOVERY_FALLBACK_MS = 60 * 1000;
const SNAPSHOT_RECOVERY_MARGIN_MS = 5 * 1000;
const ATOMIC_BATCH_ASSEMBLY_TIMEOUT_MS = 15 * 1000;
const TAB_STATE_REQUEST_RETRY_BASE_MS = 1500;
const TAB_STATE_REQUEST_RETRY_MAX_MS = 12000;
const TAB_STATE_REQUEST_TARGETED_RETRY_LIMIT = 3;
const TAB_STATE_REQUEST_RECOVERY_ATTEMPTS = 4;
const KEY_ENVELOPE_REJECTION_TTL_MS = 5 * 60 * 1000;
const MISSING_SPACE_KEY_RECOVERY_WAIT_MS = 2400;
const INVITATION_ESCROW_RECOVERY_RETRY_MS = 60 * 1000;
const INCOMPLETE_INVITATION_RECOVERY_MAX_ATTEMPTS = 3;
const INCOMPLETE_INVITATION_RECOVERY_RETRY_BASE_MS = 700;
const INVITATION_SOURCE_SYNC_WAIT_MS = 8 * 1000;
const INVITATION_SOURCE_CREATE_MAX_ATTEMPTS = 3;
const PANEL_INVITATION_RESPONSE_MAX_ATTEMPTS = 3;
const KEY_ENVELOPE_REJECTION_MAX_SOURCES = 32;
const SNAPSHOT_SOURCE_REJECTION_TTL_MS = 5 * 60 * 1000;
const SNAPSHOT_SOURCE_REJECTION_MAX_SOURCES = 32;
const SNAPSHOT_REJECTION_RETRY_MS = 5 * 1000;
const LOCAL_CONTROL_MAX_AGE_MS = 10 * 60 * 1000;
const LOCAL_SNAPSHOT_REQUEST_TTL_MS = 2 * 60 * 1000;
const LOCAL_SNAPSHOT_REQUEST_MAX = 64;
const LOCAL_SNAPSHOT_EVENT_MAX_BYTES = 64 * 1024;
const LOCAL_CAPABILITY_REFRESH_MIN_LEAD_MS = 5 * 60 * 1000;
const LOCAL_CAPABILITY_REFRESH_MAX_LEAD_MS = 6 * 60 * 60 * 1000;
const LOCAL_CAPABILITY_REFRESH_RETRY_BASE_MS = 60 * 1000;
const LOCAL_CAPABILITY_REFRESH_RETRY_MAX_MS = 30 * 60 * 1000;
const LOCAL_LIFECYCLE_TOMBSTONE_META_KEY = 'p2pSinLifecycleTombstones';
const LOCAL_LIFECYCLE_TOMBSTONE_TTL_MS = 14 * 24 * 60 * 60 * 1000;
const LOCAL_LIFECYCLE_TOMBSTONE_MAX = 128;
const LIFECYCLE_RECEIPT_META_KEY = 'p2pLifecycleReceipts';
const LIFECYCLE_RECEIPT_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const LIFECYCLE_RECEIPT_MAX = 256;
const LIFECYCLE_FINALIZATION_OBSERVER_BASE_MS = 1500;
const LIFECYCLE_FINALIZATION_OBSERVER_MAX_MS = 30000;
const LIFECYCLE_FINALIZATION_MAX_ATTEMPTS = 3;
const LIFECYCLE_REQUEST_MAX_ATTEMPTS = 3;
const LIFECYCLE_REQUEST_RETRY_BASE_MS = 700;
const LIFECYCLE_REQUEST_RETRY_MAX_MS = 4000;

export function normalizeLifecycleTransactionProgress(transaction = {}) {
  const normalized = transaction && typeof transaction === 'object' && !Array.isArray(transaction)
    ? { ...transaction }
    : {};
  const status = String(normalized.status || '').trim();
  const hasRemaining = normalized.remaining !== undefined && normalized.remaining !== null;
  const hasTotal = normalized.total !== undefined && normalized.total !== null;
  const hasCompleted = normalized.completed !== undefined && normalized.completed !== null;
  const total = Math.max(0, Number(normalized.total || 0));
  const completed = Math.max(0, Number(normalized.completed || 0));
  const remaining = Math.max(0, Number(normalized.remaining || 0));
  if (hasTotal) normalized.total = total;
  if (hasCompleted) normalized.completed = completed;
  if (hasRemaining) normalized.remaining = remaining;
  if (
    status === 'waiting'
    && ((hasRemaining && remaining === 0) || (hasTotal && hasCompleted && total > 0 && completed >= total))
  ) normalized.status = 'ready';
  return normalized;
}

export function recoverableSourceLifecycleTransactions(transactions = []) {
  const recoverable = new Map();
  for (const transaction of Array.isArray(transactions) ? transactions : []) {
    const normalized = normalizeLifecycleTransactionProgress(transaction);
    const transactionId = String(normalized?.transactionId || '').trim();
    const spaceId = String(normalized?.spaceId || '').trim();
    if (
      !transactionId
      || !spaceId
      || String(normalized?.role || '').trim() !== 'source'
      || !['waiting', 'ready'].includes(String(normalized?.status || '').trim())
    ) continue;
    recoverable.set(transactionId, { ...normalized, transactionId, spaceId });
  }
  return [...recoverable.values()];
}

export function readySourceLifecycleTransactions(transactions = []) {
  return recoverableSourceLifecycleTransactions(transactions)
    .filter((transaction) => String(transaction?.status || '').trim() === 'ready');
}

export function lifecycleFinalizationObserverDelay(attempt = 0) {
  const normalizedAttempt = Math.min(8, Math.max(0, Math.floor(Number(attempt || 0))));
  return Math.min(
    LIFECYCLE_FINALIZATION_OBSERVER_MAX_MS,
    LIFECYCLE_FINALIZATION_OBSERVER_BASE_MS * (2 ** normalizedAttempt)
  );
}

export function lifecycleRequestRetryDelay(attempt = 0) {
  const normalizedAttempt = Math.min(6, Math.max(0, Math.floor(Number(attempt || 0))));
  return Math.min(
    LIFECYCLE_REQUEST_RETRY_MAX_MS,
    LIFECYCLE_REQUEST_RETRY_BASE_MS * (2 ** normalizedAttempt)
  );
}

export function retryAfterMilliseconds(error = null, options = {}) {
  const fallbackMs = Math.max(1000, Number(options.fallbackMs || SERVER_RETRY_FALLBACK_MS));
  const maximumMs = Math.max(fallbackMs, Number(options.maximumMs || SERVER_RETRY_MAX_MS));
  const retryAfterSeconds = Number(error?.retryAfterSeconds || 0);
  if (!Number.isFinite(retryAfterSeconds) || retryAfterSeconds <= 0) return Math.min(maximumMs, fallbackMs);
  return Math.min(maximumMs, Math.max(1000, Math.ceil(retryAfterSeconds * 1000)));
}

export function serverRecoveryDelayMilliseconds(error = null, attempt = 0) {
  const rateLimitCode = String(error?.code || '').trim().toUpperCase();
  const serverDirected = Number(error?.retryAfterSeconds || 0) > 0
    || ['P2P_BOOTSTRAP_RATE_LIMITED', 'P2P_PUBLISH_RATE_LIMITED', 'P2P_CONTROL_RATE_LIMITED'].includes(rateLimitCode);
  if (Number(error?.status || 0) === 429 && serverDirected) return retryAfterMilliseconds(error);
  const normalizedAttempt = Math.min(6, Math.max(0, Math.floor(Number(attempt || 0))));
  return Math.min(30000, SERVER_RETRY_FALLBACK_MS * (2 ** normalizedAttempt));
}

export function planLocalCapabilityRefresh(capability = {}, options = {}) {
  const payload = capability?.payload && typeof capability.payload === 'object' ? capability.payload : {};
  const issuedAtMs = Date.parse(String(payload.issuedAt || ''));
  const expiresAtMs = Date.parse(String(payload.expiresAt || ''));
  const nowMs = Number(options.nowMs ?? Date.now());
  if (
    !Number.isFinite(nowMs)
    || !Number.isFinite(issuedAtMs)
    || !Number.isFinite(expiresAtMs)
    || expiresAtMs <= issuedAtMs
    || expiresAtMs <= nowMs
  ) {
    return { valid: false, issuedAtMs, expiresAtMs, refreshAtMs: 0, delayMs: 0 };
  }

  const lifetimeMs = expiresAtMs - issuedAtMs;
  const leadMs = Math.min(
    LOCAL_CAPABILITY_REFRESH_MAX_LEAD_MS,
    Math.max(LOCAL_CAPABILITY_REFRESH_MIN_LEAD_MS, Math.floor(lifetimeMs * 0.2))
  );
  const earliestRefreshAtMs = issuedAtMs + Math.min(
    LOCAL_CAPABILITY_REFRESH_MIN_LEAD_MS,
    Math.max(1000, Math.floor(lifetimeMs * 0.1))
  );
  const refreshAtMs = Math.max(earliestRefreshAtMs, expiresAtMs - leadMs);
  return {
    valid: true,
    issuedAtMs,
    expiresAtMs,
    refreshAtMs,
    delayMs: Math.max(1000, refreshAtMs - nowMs)
  };
}

export function normalizeSnapshotSpaceIds(values = [], maximum = 1000) {
  const limit = Math.min(1000, Math.max(1, Math.floor(Number(maximum || 1000))));
  return Array.from(new Set((Array.isArray(values) ? values : [])
    .map((value) => String(value || '').trim().slice(0, 140))
    .filter(Boolean)))
    .slice(0, limit);
}

function normalizedPanelInvitationPermissions(values = []) {
  return Array.from(new Set((Array.isArray(values) ? values : [])
    .map((value) => String(value || '').trim().toLowerCase())
    .filter(Boolean)))
    .sort();
}

export function panelInvitationManifestFingerprint(spaceIds = []) {
  const canonical = normalizeSnapshotSpaceIds(spaceIds, 300).sort().join('|');
  if (!canonical) return '';
  let left = 0x811c9dc5;
  let right = 0x9e3779b9;
  for (let index = 0; index < canonical.length; index += 1) {
    const code = canonical.charCodeAt(index);
    left = Math.imul(left ^ code, 0x01000193) >>> 0;
    right = Math.imul((right + code + index) >>> 0, 0x85ebca6b) >>> 0;
    right ^= right >>> 13;
  }
  return `${left.toString(16).padStart(8, '0')}${(right >>> 0).toString(16).padStart(8, '0')}`;
}

function panelInvitationGroupFingerprint(groupId = '') {
  const match = /^panel_invite_([0-9a-f]{16})_/i.exec(String(groupId || '').trim());
  return match ? match[1].toLowerCase() : '';
}

export function resumablePanelInvitationGroup(sentInvitations = [], options = {}) {
  const recipientEmail = String(options.recipientEmail || options.email || '').trim().toLowerCase();
  const requestedSpaceIds = normalizeSnapshotSpaceIds(options.spaceIds, 300);
  const explicitGroupId = String(options.invitationGroupId || '').trim();
  if (!recipientEmail || !requestedSpaceIds.length) return null;

  const requestedSpaceSet = new Set(requestedSpaceIds);
  const expectedCount = requestedSpaceIds.length;
  const expectedManifestFingerprint = panelInvitationManifestFingerprint(requestedSpaceIds);
  const requestedPermissions = normalizedPanelInvitationPermissions(options.permissions || ['read', 'write']);
  const groups = new Map();
  for (const invitation of Array.isArray(sentInvitations) ? sentInvitations : []) {
    if (String(invitation?.invitationScope || '').trim().toLowerCase() !== 'panel') continue;
    if (String(invitation?.recipientEmail || '').trim().toLowerCase() !== recipientEmail) continue;
    const groupId = String(invitation?.invitationGroupId || '').trim();
    if (!groupId || (explicitGroupId && groupId !== explicitGroupId)) continue;
    if (!explicitGroupId && panelInvitationGroupFingerprint(groupId) !== expectedManifestFingerprint) continue;
    if (!groups.has(groupId)) groups.set(groupId, []);
    groups.get(groupId).push(invitation);
  }

  const now = Date.now();
  const candidates = [];
  for (const [groupId, invitations] of groups) {
    const bySpaceId = new Map();
    let compatible = invitations.length > 0;
    let newestAt = 0;
    for (const invitation of invitations) {
      const spaceId = String(invitation?.spaceId || '').trim();
      const expiresAt = Date.parse(String(invitation?.expiresAt || ''));
      const status = String(invitation?.status || '').trim().toLowerCase();
      const declaredExpectedCount = Math.max(0, Math.floor(Number(invitation?.invitationGroupExpectedCount || 0)));
      const permissions = normalizedPanelInvitationPermissions(invitation?.permissions || []);
      if (
        status !== 'pending'
        || (Number.isFinite(expiresAt) && expiresAt <= now)
        || declaredExpectedCount !== expectedCount
        || !spaceId
        || !requestedSpaceSet.has(spaceId)
        || bySpaceId.has(spaceId)
        || JSON.stringify(permissions) !== JSON.stringify(requestedPermissions)
      ) {
        compatible = false;
        break;
      }
      bySpaceId.set(spaceId, invitation);
      newestAt = Math.max(
        newestAt,
        Date.parse(String(invitation?.updatedAt || invitation?.createdAt || '')) || 0
      );
    }
    if (!compatible || bySpaceId.size > expectedCount) continue;
    candidates.push({ groupId, bySpaceId, newestAt });
  }

  if (!candidates.length) return null;
  candidates.sort((left, right) => (right.bySpaceId.size - left.bySpaceId.size) || (right.newestAt - left.newestAt));
  const selected = candidates[0];
  return {
    invitationGroupId: selected.groupId,
    invitations: requestedSpaceIds.map((spaceId) => selected.bySpaceId.get(spaceId)).filter(Boolean),
    existingSpaceIds: requestedSpaceIds.filter((spaceId) => selected.bySpaceId.has(spaceId)),
    missingSpaceIds: requestedSpaceIds.filter((spaceId) => !selected.bySpaceId.has(spaceId)),
    expectedCount
  };
}

export function panelInvitationResponseRetryDelay(error = null, attempt = 0) {
  const code = String(error?.code || '').trim().toUpperCase();
  if (error?.sessionChanged === true || code === 'APP_SESSION_CHANGED') return 0;

  const status = Number(error?.status || 0);
  const retryableGroupCodes = new Set([
    'P2P_INVITATION_GROUP_RESPONSE_IN_PROGRESS',
    'P2P_INVITATION_RESPONSE_IN_PROGRESS',
    'P2P_INVITATION_GROUP_LOCK_LOST',
    'P2P_INVITATION_GROUP_INCOMPLETE'
  ]);
  const transportRetryable = !status || status >= 500 || [408, 425].includes(status);
  const retryAfterSeconds = Number(error?.retryAfterSeconds || 0);
  const shortRateLimit = status === 429
    && (!Number.isFinite(retryAfterSeconds) || retryAfterSeconds <= 0 || retryAfterSeconds <= 8);
  if (!retryableGroupCodes.has(code) && !transportRetryable && !shortRateLimit) return 0;

  if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0) {
    return Math.min(8000, Math.max(1000, Math.ceil(retryAfterSeconds * 1000)));
  }
  const normalizedAttempt = Math.min(3, Math.max(0, Math.floor(Number(attempt || 0))));
  return Math.min(2800, 350 * (2 ** normalizedAttempt));
}

function createId(prefix = 'id') {
  const random = window.crypto?.randomUUID?.().replace(/-/g, '') || `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
  return `${prefix}_${random}`;
}

function deviceStorageKey(userId = '') {
  const scope = String(userId || '').trim().replace(/[^a-zA-Z0-9._:-]/g, '_').slice(0, 180);
  if (!scope) throw new Error('No se pudo identificar la cuenta para registrar este dispositivo.');
  return `${DEVICE_STORAGE_KEY_PREFIX}:${scope}`;
}

function getOrCreateDeviceId(userId = '') {
  const key = deviceStorageKey(userId);
  try {
    const existing = String(window.localStorage.getItem(key) || '').trim();
    if (existing) return existing;
    const created = createId('dev');
    window.localStorage.setItem(key, created);
    return created;
  } catch {
    return createId('dev');
  }
}

function rotateStoredDeviceId(userId = '', expectedDeviceId = '') {
  const key = deviceStorageKey(userId);
  const expected = String(expectedDeviceId || '').trim();
  try {
    const current = String(window.localStorage.getItem(key) || '').trim();
    if (current && expected && current !== expected) return current;
    const created = createId('dev');
    window.localStorage.setItem(key, created);
    return created;
  } catch {
    return createId('dev');
  }
}

function isDeviceIdentityConflict(error = null) {
  return String(error?.code || '').trim().toUpperCase() === 'P2P_DEVICE_IDENTITY_CONFLICT';
}

function getDeviceName() {
  try {
    const custom = String(window.localStorage.getItem(DEVICE_NAME_STORAGE_KEY) || '').trim();
    if (custom) return custom;
  } catch {}
  const platform = navigator.userAgentData?.platform || navigator.platform || 'Dispositivo';
  return `${platform} · ${window.matchMedia?.('(display-mode: standalone)')?.matches ? 'App instalada' : 'Navegador'}`;
}

function getAppMode() {
  return window.matchMedia?.('(display-mode: standalone)')?.matches || navigator.standalone
    ? 'standalone'
    : 'browser';
}

function dispatch(name, detail = {}) {
  window.dispatchEvent(new CustomEvent(name, { detail }));
}

function normalizeReplicaHealthMap(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {};
  const nonnegativeInteger = (value = 0) => {
    const parsed = Number(value || 0);
    return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 0;
  };
  const normalized = {};
  for (const [rawSpaceId, rawHealth] of Object.entries(input).slice(0, 500)) {
    const spaceId = String(rawSpaceId || rawHealth?.spaceId || '').trim().slice(0, 140);
    if (!spaceId || !rawHealth || typeof rawHealth !== 'object' || Array.isArray(rawHealth)) continue;
    const state = ['healthy', 'degraded', 'single', 'unavailable', 'unknown'].includes(String(rawHealth.state || ''))
      ? String(rawHealth.state)
      : 'unknown';
    normalized[spaceId] = {
      spaceId,
      state,
      currentStateRevision: nonnegativeInteger(rawHealth.currentStateRevision),
      memberAccounts: nonnegativeInteger(rawHealth.memberAccounts),
      registeredAccounts: nonnegativeInteger(rawHealth.registeredAccounts),
      accountsWithoutDevice: nonnegativeInteger(rawHealth.accountsWithoutDevice),
      registeredReplicas: nonnegativeInteger(rawHealth.registeredReplicas),
      confirmedReplicas: nonnegativeInteger(rawHealth.confirmedReplicas),
      pendingReplicas: nonnegativeInteger(rawHealth.pendingReplicas),
      confirmedAccounts: nonnegativeInteger(rawHealth.confirmedAccounts),
      availableReplicas: nonnegativeInteger(rawHealth.availableReplicas),
      availableAccounts: nonnegativeInteger(rawHealth.availableAccounts),
      pendingAvailableReplicas: nonnegativeInteger(rawHealth.pendingAvailableReplicas),
      presentReplicas: nonnegativeInteger(rawHealth.presentReplicas),
      presentAccounts: nonnegativeInteger(rawHealth.presentAccounts),
      missingReplicas: nonnegativeInteger(rawHealth.missingReplicas),
      onlineReplicas: nonnegativeInteger(rawHealth.onlineReplicas),
      currentDeviceRegistered: rawHealth.currentDeviceRegistered === true,
      currentDeviceConfirmed: typeof rawHealth.currentDeviceConfirmed === 'boolean' ? rawHealth.currentDeviceConfirmed : null,
      currentDeviceAvailable: typeof rawHealth.currentDeviceAvailable === 'boolean' ? rawHealth.currentDeviceAvailable : null,
      currentDevicePresent: typeof rawHealth.currentDevicePresent === 'boolean' ? rawHealth.currentDevicePresent : null,
      currentDeviceOnline: rawHealth.currentDeviceOnline === true,
      displayState: ['healthy', 'degraded', 'single', 'unavailable', 'unknown'].includes(String(rawHealth.displayState || ''))
        ? String(rawHealth.displayState)
        : state,
      lastConfirmedAt: String(rawHealth.lastConfirmedAt || '').slice(0, 60),
      truncated: rawHealth.truncated === true
    };
  }
  return normalized;
}

function jsonByteLength(value) {
  return new TextEncoder().encode(JSON.stringify(value ?? null)).byteLength;
}

function isEntityOperationType(type = '') {
  return ['entity.put', 'entity.patch', 'entity.trash', 'entity.restore', 'entity.purge', 'entity.delete', 'custom'].includes(String(type || ''));
}

export function normalizePublishDeliveryIntent(type = '', options = {}) {
  const targetDeviceIds = Array.from(new Set((Array.isArray(options.targetDeviceIds) ? options.targetDeviceIds : [])
    .map((value) => String(value || '').trim())
    .filter(Boolean)));
  const durableStateOperation = isEntityOperationType(type);
  const deferSourceUntilReplicas = options.deferSourceUntilReplicas === true;
  if (durableStateOperation && targetDeviceIds.length) {
    const error = new Error('Las operaciones durables deben sincronizarse con todas las réplicas autorizadas y no admiten destinos parciales.');
    error.status = 400;
    error.code = 'P2P_PARTIAL_STATE_DELIVERY_FORBIDDEN';
    throw error;
  }
  if (deferSourceUntilReplicas && !['entity.trash', 'entity.restore'].includes(String(type || ''))) {
    const error = new Error('Solo una operación crítica de papelera o restauración puede diferirse hasta confirmar las demás réplicas.');
    error.status = 400;
    error.code = 'P2P_LIFECYCLE_OPERATION_INVALID';
    throw error;
  }
  return {
    targetDeviceIds,
    includeSourceDevice: durableStateOperation ? !deferSourceUntilReplicas : Boolean(options.includeSourceDevice),
    durableStateOperation,
    ...(deferSourceUntilReplicas ? { deferSourceUntilReplicas: true } : {})
  };
}

function normalizeDeleteReferenceGuards(input = []) {
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

function normalizeDependentDeletes(input = [], source = {}) {
  const sourceType = String(source?.entityType || '').trim().toLowerCase();
  const sourceId = String(source?.entityId || '').trim().slice(0, 180);
  const deletes = [];
  const seen = new Set();
  for (const candidate of Array.isArray(input) ? input.slice(0, 4) : []) {
    const entityType = String(candidate?.entityType || '').trim().toLowerCase().slice(0, 80);
    const entityId = String(candidate?.entityId || '').trim().slice(0, 180);
    const relation = String(candidate?.relation || '').trim().toLowerCase().slice(0, 80);
    const supported = sourceType === 'admin.purchase'
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

function eventCursorSequence(event = {}) {
  const sequence = Number(event.deviceSequence || event.deliverySequence || 0);
  return Number.isSafeInteger(sequence) && sequence > 0 ? sequence : 0;
}

function realtimeProtocolError(message = '', code = 'P2P_REALTIME_EVENT_INVALID_ENVELOPE', detail = {}) {
  const error = new Error(message || 'El stream entregó un evento con un sobre inválido.');
  error.code = code;
  Object.assign(error, detail && typeof detail === 'object' ? detail : {});
  return error;
}

const CANONICAL_STATE_OPERATION_TYPES = new Set(['entity.put', 'entity.patch', 'entity.trash', 'entity.restore', 'entity.purge', 'entity.delete', 'custom']);
const CANONICAL_SNAPSHOT_OPERATION_TYPES = new Set(['snapshot.chunk', 'snapshot.complete']);
const CANONICAL_CONTROL_EVENT_TYPES = new Set([
  'p2p.key.request',
  'p2p.key.envelope',
  'p2p.snapshot.request',
  'p2p.replica.topology.changed',
  'p2p.space.deleted',
  'p2p.membership.revoked',
  'p2p.membership.changed',
  'p2p.invitation.created',
  'p2p.invitation.accepted',
  'p2p.invitation.rejected',
  'p2p.lifecycle.progress',
  'p2p.lifecycle.finalize',
  'p2p.lifecycle.remote-purge'
]);

function isRecord(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function isSafeRevision(value, options = {}) {
  const minimum = options.positive === true ? 1 : 0;
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= minimum;
}

const CANONICAL_MEMBER_ROLES = new Set(['owner', 'member']);
const CANONICAL_MEMBER_PERMISSIONS = new Set(['read', 'add', 'delete', 'projection', 'invite', 'write']);

function canonicalPermissionList(value = [], invalid = () => {}) {
  if (!Array.isArray(value) || !value.length) invalid();
  const normalized = value.map((permission) => String(permission || '').trim().toLowerCase());
  if (
    normalized.some((permission) => !CANONICAL_MEMBER_PERMISSIONS.has(permission))
    || new Set(normalized).size !== normalized.length
  ) invalid();
  return normalized;
}

function samePermissionSet(left = [], right = []) {
  if (left.length !== right.length) return false;
  const expected = new Set(left);
  return right.every((permission) => expected.has(permission));
}

function canonicalSpaceMemberGraph(space = {}, expectedSpaceId = '', invalid = () => {}) {
  if (
    !isRecord(space)
    || String(space.spaceId || '').trim() !== expectedSpaceId
    || !String(space.ownerUserId || '').trim()
    || !Array.isArray(space.members)
    || !space.members.length
  ) invalid();

  const ownerUserId = String(space.ownerUserId || '').trim();
  const members = new Map();
  let ownerCount = 0;
  for (const candidate of space.members) {
    if (!isRecord(candidate)) invalid();
    const userId = String(candidate.userId || '').trim();
    const role = String(candidate.role || '').trim().toLowerCase();
    if (!userId || !CANONICAL_MEMBER_ROLES.has(role) || members.has(userId)) invalid();
    const permissions = canonicalPermissionList(candidate.permissions, invalid);
    if (role === 'owner') ownerCount += 1;
    members.set(userId, { userId, role, permissions });
  }

  const owner = members.get(ownerUserId);
  if (ownerCount !== 1 || owner?.role !== 'owner' || !owner.permissions.includes('read')) invalid();
  for (const member of members.values()) {
    if (member.userId !== ownerUserId && member.role === 'owner') invalid();
  }
  return { ownerUserId, members };
}

export function assertCanonicalControlEnvelope(event = {}) {
  const eventId = String(event.eventId || '').trim();
  const eventType = String(event.eventType || '').trim();
  if (!CANONICAL_CONTROL_EVENT_TYPES.has(eventType)) return event;

  const spaceId = String(event.spaceId || '').trim();
  const actorUserId = String(event.actorUserId || '').trim();
  const sourceDeviceId = String(event.sourceDeviceId || '').trim();
  const data = event.data;
  const invalid = (reason = '') => {
    throw realtimeProtocolError(
      'El transporte entregó un evento de control P2P semánticamente incompleto.',
      'P2P_CANONICAL_CONTROL_INVALID_ENVELOPE',
      { reason, eventId, eventType, spaceId }
    );
  };

  if (!eventId || !spaceId || !actorUserId || !isRecord(data)) invalid('control-identity');

  if (eventType === 'p2p.key.request') {
    const requestDevice = data.requestDevice;
    const keyId = String(data.keyId || '').trim();
    if (
      !sourceDeviceId
      || !isRecord(requestDevice)
      || String(requestDevice.deviceId || '').trim() !== sourceDeviceId
      || String(requestDevice.userId || '').trim() !== actorUserId
      || !isRecord(requestDevice.encryptionPublicKey)
      || !keyId
      || !isSafeRevision(data.keyEpoch, { positive: true })
    ) invalid('key-request');
    return event;
  }

  if (eventType === 'p2p.key.envelope') {
    const envelope = data.envelope;
    if (
      !sourceDeviceId
      || !isRecord(envelope)
      || String(envelope.senderDeviceId || '').trim() !== sourceDeviceId
      || !String(envelope.recipientDeviceId || '').trim()
      || !String(envelope.keyId || '').trim()
      || !isRecord(envelope.senderPublicKey)
      || !isSafeRevision(data.keyEpoch, { positive: true })
    ) invalid('key-envelope');
    return event;
  }

  if (eventType === 'p2p.replica.topology.changed') {
    const affectedUserId = String(data.affectedUserId || '').trim();
    const affectedDeviceId = String(data.affectedDeviceId || '').trim();
    const change = String(data.change || '').trim().toLowerCase();
    if (
      !sourceDeviceId
      || String(data.spaceId || '').trim() !== spaceId
      || affectedUserId !== actorUserId
      || !affectedDeviceId
      || !['registered', 'retired', 'removed'].includes(change)
      || (change === 'registered' && affectedDeviceId !== sourceDeviceId)
    ) invalid('replica-topology-changed');
    return event;
  }

  if (eventType === 'p2p.snapshot.request') {
    const requestId = String(data.requestId || '').trim();
    const requestDeviceId = String(data.requestDeviceId || '').trim();
    const requestUserId = String(data.requestUserId || '').trim();
    const dataSpaceId = String(data.spaceId || '').trim();
    const localStateRevision = data.localStateRevision;
    const currentStateRevision = data.currentStateRevision;
    const reason = String(data.reason || '').trim().toLowerCase();
    const forcedEqualRevision = reason === 'forced' && currentStateRevision === localStateRevision;
    if (
      !sourceDeviceId
      || !requestId
      || requestDeviceId !== sourceDeviceId
      || requestUserId !== actorUserId
      || dataSpaceId !== spaceId
      || !isSafeRevision(localStateRevision)
      || !isSafeRevision(currentStateRevision)
      || currentStateRevision < localStateRevision
      || (currentStateRevision === localStateRevision && !forcedEqualRevision)
    ) invalid('snapshot-request');
    return event;
  }

  if (eventType === 'p2p.space.deleted') {
    const deletedByUserId = String(data.deletedByUserId || '').trim();
    if (String(data.spaceId || '').trim() !== spaceId || deletedByUserId !== actorUserId) {
      invalid('space-deleted');
    }
    return event;
  }

  if (eventType === 'p2p.membership.revoked') {
    const revokedUserId = String(data.revokedUserId || '').trim();
    const hasSelfRemoval = Object.prototype.hasOwnProperty.call(data, 'selfRemoval');
    if (
      String(data.spaceId || '').trim() !== spaceId
      || !revokedUserId
      || (hasSelfRemoval && typeof data.selfRemoval !== 'boolean')
      || (data.selfRemoval === true && actorUserId !== revokedUserId)
      || (data.selfRemoval === false && actorUserId === revokedUserId)
    ) invalid('membership-revoked');
    return event;
  }

  if (eventType.startsWith('p2p.lifecycle.')) {
    const transactionId = String(data.transactionId || '').trim();
    const action = String(data.action || '').trim().toLowerCase();
    const status = String(data.status || '').trim().toLowerCase();
    const completed = Number(data.completed);
    const total = Number(data.total);
    const remaining = Number(data.remaining);
    if (
      !sourceDeviceId
      || !transactionId
      || !['trash', 'restore', 'purge'].includes(action)
      || String(data.spaceId || '').trim() !== spaceId
      || !Number.isSafeInteger(completed)
      || completed < 0
      || !Number.isSafeInteger(total)
      || total < 0
      || !Number.isSafeInteger(remaining)
      || remaining < 0
      || completed + remaining !== total
    ) invalid('lifecycle');
    if (eventType === 'p2p.lifecycle.remote-purge') {
      if (action !== 'purge' || !['waiting', 'ready'].includes(status)) invalid('lifecycle-remote-purge');
      return event;
    }
    if (!['waiting', 'ready', 'completed'].includes(status)) invalid('lifecycle-status');
    if (eventType === 'p2p.lifecycle.finalize') {
      const nested = data.event;
      if (
        !['trash', 'restore'].includes(action)
        || status !== 'ready'
        || !isRecord(nested)
        || String(nested.operation?.type || '').trim() !== (action === 'restore' ? 'entity.restore' : 'entity.trash')
        || String(nested.eventType || '').trim() !== 'p2p.operation'
        || String(nested.spaceId || '').trim() !== spaceId
        || String(nested.actorUserId || '').trim() !== actorUserId
        || String(nested.sourceDeviceId || '').trim() !== sourceDeviceId
      ) invalid('lifecycle-finalize');
    }
    return event;
  }

  if (eventType === 'p2p.membership.changed') {
    const graph = canonicalSpaceMemberGraph(data.space, spaceId, () => invalid('membership-changed'));
    const revokedUserId = String(data.revokedUserId || '').trim();
    const previousOwnerUserId = String(data.previousOwnerUserId || '').trim();
    const nextOwnerUserId = String(data.ownerUserId || '').trim();
    const targetUserId = String(data.targetUserId || '').trim();
    const hasPermissionUpdate = Object.prototype.hasOwnProperty.call(data, 'permissions') || Boolean(targetUserId);
    const hasOwnershipTransfer = Boolean(previousOwnerUserId || nextOwnerUserId);
    const declaredTransitionCount = [Boolean(revokedUserId), hasOwnershipTransfer, hasPermissionUpdate]
      .filter(Boolean).length;

    // Un cambio de membresía debe declarar exactamente una transición canónica. Sin esta
    // barrera, un sobre con solo `data.space` podía reemplazar todo el grafo local y avanzar
    // el ACK sin demostrar si ocurrió una revocación, una transferencia o un cambio de permisos.
    if (declaredTransitionCount !== 1) invalid('membership-changed');

    if (revokedUserId && (graph.members.has(revokedUserId) || (!graph.members.has(actorUserId) && actorUserId !== revokedUserId))) {
      invalid('membership-changed');
    }
    if (hasOwnershipTransfer) {
      const previousOwner = graph.members.get(previousOwnerUserId);
      const nextOwner = graph.members.get(nextOwnerUserId);
      if (
        !previousOwnerUserId
        || !nextOwnerUserId
        || previousOwnerUserId === nextOwnerUserId
        || actorUserId !== previousOwnerUserId
        || graph.ownerUserId !== nextOwnerUserId
        || previousOwner?.role !== 'member'
        || nextOwner?.role !== 'owner'
      ) invalid('membership-changed');
    }
    if (hasPermissionUpdate) {
      const target = graph.members.get(targetUserId);
      const permissions = canonicalPermissionList(data.permissions, () => invalid('membership-changed'));
      if (
        actorUserId !== graph.ownerUserId
        || !target
        || target.role !== 'member'
        || !samePermissionSet(target.permissions, permissions)
      ) invalid('membership-changed');
    }
    return event;
  }

  const invitation = data.invitation;
  const invitationEventAction = eventType.slice('p2p.invitation.'.length);
  const expectedStatus = invitationEventAction === 'created' ? 'pending' : invitationEventAction;
  const invitationId = String(invitation?.invitationId || '').trim();
  const invitationSpaceId = String(invitation?.spaceId || '').trim();
  const inviterUserId = String(invitation?.inviterUserId || '').trim();
  const recipientUserId = String(invitation?.recipientUserId || '').trim();
  if (
    !isRecord(invitation)
    || !invitationId
    || invitationSpaceId !== spaceId
    || String(invitation.status || '').trim().toLowerCase() !== expectedStatus
    || !inviterUserId
    || !recipientUserId
  ) invalid('invitation');
  if (invitationEventAction === 'created' && actorUserId !== inviterUserId) invalid('invitation-actor');
  if (invitationEventAction !== 'created' && actorUserId !== recipientUserId) invalid('invitation-actor');
  if (invitationEventAction === 'accepted') {
    const graph = canonicalSpaceMemberGraph(data.space, spaceId, () => invalid('invitation-accepted-space'));
    const recipient = graph.members.get(recipientUserId);
    const invitationPermissions = canonicalPermissionList(
      invitation.permissions,
      () => invalid('invitation-accepted-space')
    );
    if (
      !recipient
      || recipient.role !== 'member'
      || !samePermissionSet(recipient.permissions, invitationPermissions)
    ) invalid('invitation-accepted-space');
  } else if (invitationEventAction === 'rejected' && data.space !== null && data.space !== undefined) {
    invalid('invitation-rejected-space');
  }
  return event;
}

function assertCanonicalOperationEnvelope(event = {}) {
  const eventId = String(event.eventId || '').trim();
  const eventType = String(event.eventType || '').trim();
  const deviceSequence = event.deviceSequence;
  const deliverySequence = event.deliverySequence;
  const operation = event.operation;
  const operationId = String(operation?.operationId || '').trim();
  const operationType = String(operation?.type || '').trim().toLowerCase();
  const spaceId = String(event.spaceId || '').trim();
  const actorUserId = String(event.actorUserId || '').trim();
  const sourceDeviceId = String(event.sourceDeviceId || '').trim();
  const spaceSequence = event.spaceSequence;
  const stateRevision = event.stateRevision;
  const durableStateOperation = CANONICAL_STATE_OPERATION_TYPES.has(operationType);
  const snapshotOperation = CANONICAL_SNAPSHOT_OPERATION_TYPES.has(operationType);
  const entityType = String(operation?.entityType || '').trim();
  const entityId = String(operation?.entityId || '').trim();
  const payload = operation?.payload;

  const invalid = (reason = '') => {
    throw realtimeProtocolError(
      'El transporte entregó una operación P2P semánticamente incompleta.',
      'P2P_CANONICAL_OPERATION_INVALID_ENVELOPE',
      {
        reason,
        eventId,
        operationId,
        operationType,
        spaceId,
        spaceSequence,
        stateRevision
      }
    );
  };

  if (!eventId || eventType !== 'p2p.operation') invalid('event-identity');
  const validDeviceSequence = typeof deviceSequence === 'number'
    && Number.isSafeInteger(deviceSequence)
    && deviceSequence > 0;
  const validDeliverySequence = typeof deliverySequence === 'number'
    && Number.isSafeInteger(deliverySequence)
    && deliverySequence > 0;
  if (!validDeviceSequence && !validDeliverySequence) invalid('transport-sequence');
  if (Object.prototype.hasOwnProperty.call(event, 'deviceSequence') && !validDeviceSequence) {
    invalid('device-sequence');
  }
  if (Object.prototype.hasOwnProperty.call(event, 'deliverySequence') && !validDeliverySequence) {
    invalid('delivery-sequence');
  }
  if (!operation || typeof operation !== 'object' || Array.isArray(operation)) invalid('operation');
  if (!spaceId || !actorUserId || !sourceDeviceId || !operationId) invalid('identity');
  if (!durableStateOperation && !snapshotOperation) invalid('operation-type');
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) invalid('payload');
  if (typeof spaceSequence !== 'number' || !Number.isSafeInteger(spaceSequence) || spaceSequence <= 0) {
    invalid('space-sequence');
  }
  if (typeof stateRevision !== 'number' || !Number.isSafeInteger(stateRevision) || stateRevision < 0) {
    invalid('state-revision');
  }
  if (stateRevision > spaceSequence) invalid('revision-order');
  if (durableStateOperation && stateRevision <= 0) invalid('durable-state-revision');
  if (snapshotOperation && stateRevision !== 0) invalid('snapshot-state-revision');
  if (durableStateOperation && (!entityType || !entityId)) invalid('entity-identity');
  return event;
}

export function assertRealtimeEventEnvelope(event = {}, options = {}) {
  if (!event || typeof event !== 'object' || Array.isArray(event)) {
    throw realtimeProtocolError('El stream entregó un evento que no es un objeto JSON.', 'P2P_REALTIME_EVENT_INVALID_ENVELOPE');
  }

  const eventId = String(event.eventId || '').trim();
  const eventType = String(event.eventType || '').trim();
  if (!eventId || !eventType) {
    throw realtimeProtocolError(
      'El stream entregó un evento sin identidad o tipo de protocolo.',
      'P2P_REALTIME_EVENT_INVALID_ENVELOPE',
      { eventId, eventType }
    );
  }

  const gap = options.gap === true || eventType === 'p2p.delivery.gap';
  if (gap) {
    const currentSequence = Number(event.currentSequence);
    const reason = String(event.reason || '').trim();
    const cursorResetRequired = event.cursorResetRequired === true;
    const resetToSequence = Number(event.resetToSequence || 0);
    const invalidCursorReset = reason === 'cursor_ahead_of_server'
      ? !cursorResetRequired || resetToSequence !== currentSequence
      : cursorResetRequired;
    if (eventType !== 'p2p.delivery.gap'
      || !Number.isSafeInteger(currentSequence)
      || currentSequence < 0
      || invalidCursorReset) {
      throw realtimeProtocolError(
        'El stream entregó un aviso de recuperación semánticamente inválido.',
        'P2P_REALTIME_GAP_INVALID_ENVELOPE',
        { currentSequence, reason, cursorResetRequired, resetToSequence }
      );
    }
    return event;
  }

  const deviceSequence = Number(event.deviceSequence);
  const deliverySequence = Number(event.deliverySequence);
  if (!Number.isSafeInteger(deviceSequence) || deviceSequence <= 0) {
    throw realtimeProtocolError(
      'El stream entregó un evento sin una secuencia privada válida para este dispositivo.',
      'P2P_REALTIME_EVENT_INVALID_ENVELOPE',
      { deviceSequence }
    );
  }
  if (Object.prototype.hasOwnProperty.call(event, 'deliverySequence')
    && (!Number.isSafeInteger(deliverySequence) || deliverySequence <= 0)) {
    throw realtimeProtocolError(
      'El stream entregó una secuencia global inválida.',
      'P2P_REALTIME_EVENT_INVALID_ENVELOPE',
      { deliverySequence }
    );
  }
  if (eventType === 'p2p.operation') assertCanonicalOperationEnvelope(event);
  else assertCanonicalControlEnvelope(event);
  return event;
}

export function assertRealtimeSequenceContinuity(events = [], lastProcessedSequence = 0) {
  const ordered = Array.isArray(events) ? events : [];
  const lastSequence = Number(lastProcessedSequence || 0);
  if (!Number.isSafeInteger(lastSequence) || lastSequence < 0) {
    throw realtimeProtocolError(
      'El cursor local de sincronización no es válido.',
      'P2P_REALTIME_CURSOR_INVALID',
      { lastProcessedSequence }
    );
  }

  let expectedSequence = lastSequence + 1;
  for (const event of ordered) {
    assertRealtimeEventEnvelope(event);
    const receivedSequence = eventCursorSequence(event);
    if (receivedSequence !== expectedSequence) {
      const replayed = receivedSequence <= lastSequence;
      throw realtimeProtocolError(
        replayed
          ? 'El stream intentó reproducir un evento anterior al cursor durable.'
          : 'El stream omitió una secuencia antes de entregar el siguiente evento.',
        replayed ? 'P2P_REALTIME_SEQUENCE_REPLAY' : 'P2P_REALTIME_SEQUENCE_GAP',
        { expectedSequence, receivedSequence, lastProcessedSequence: lastSequence }
      );
    }
    expectedSequence += 1;
  }
  return expectedSequence - 1;
}

export function describeAtomicTransportBatchEvent(event = {}) {
  const hasBatchMetadata = ['batchId', 'batchIndex', 'batchSize'].some((field) => (
    Object.prototype.hasOwnProperty.call(event || {}, field)
  ));
  if (!hasBatchMetadata) return null;

  const batchId = String(event.batchId || '').trim();
  const batchIndex = Number(event.batchIndex);
  const batchSize = Number(event.batchSize);
  const spaceId = String(event.spaceId || '').trim();
  const operationId = String(event.operation?.operationId || '').trim();
  if (
    event.eventType !== 'p2p.operation'
    || !isEntityOperationType(event.operation?.type)
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
    const error = new Error('El relay entregó metadatos inválidos para un lote atómico.');
    error.code = 'P2P_ATOMIC_BATCH_INVALID';
    throw error;
  }
  return {
    key: `${spaceId}|${batchId}`,
    batchId,
    batchIndex,
    batchSize,
    spaceId,
    operationId,
    actorUserId: String(event.actorUserId || '').trim(),
    sourceDeviceId: String(event.sourceDeviceId || '').trim()
  };
}

export function normalizeAtomicTransportBatchEvents(events = []) {
  const normalized = Array.isArray(events) ? events.filter(Boolean) : [];
  if (normalized.length < 2 || normalized.length > 8) {
    const error = new Error('El lote atómico llegó incompleto.');
    error.code = 'P2P_ATOMIC_BATCH_INCOMPLETE';
    throw error;
  }

  const described = normalized.map((event) => ({ event, descriptor: describeAtomicTransportBatchEvent(event) }));
  const first = described[0].descriptor;
  if (!first || first.batchSize !== described.length) {
    const error = new Error('El lote atómico no contiene todas sus operaciones.');
    error.code = 'P2P_ATOMIC_BATCH_INCOMPLETE';
    throw error;
  }
  described.sort((left, right) => left.descriptor.batchIndex - right.descriptor.batchIndex);

  const operationIds = new Set();
  for (let index = 0; index < described.length; index += 1) {
    const current = described[index];
    if (
      current.descriptor.key !== first.key
      || current.descriptor.batchSize !== first.batchSize
      || current.descriptor.batchIndex !== index
      || current.descriptor.actorUserId !== first.actorUserId
      || current.descriptor.sourceDeviceId !== first.sourceDeviceId
      || operationIds.has(current.descriptor.operationId)
    ) {
      const error = new Error('El lote atómico perdió su identidad, orden o unicidad.');
      error.code = 'P2P_ATOMIC_BATCH_CONFLICT';
      throw error;
    }
    operationIds.add(current.descriptor.operationId);
  }

  const ordered = described.map((entry) => entry.event);
  for (let index = 1; index < ordered.length; index += 1) {
    const previous = ordered[index - 1];
    const current = ordered[index];
    const previousCursor = eventCursorSequence(previous);
    const currentCursor = eventCursorSequence(current);
    const previousSpaceSequence = Math.max(0, Number(previous.spaceSequence || 0));
    const currentSpaceSequence = Math.max(0, Number(current.spaceSequence || 0));
    const previousStateRevision = Math.max(0, Number(previous.stateRevision || 0));
    const currentStateRevision = Math.max(0, Number(current.stateRevision || 0));
    if (
      (previousCursor && currentCursor !== previousCursor + 1)
      || (previousSpaceSequence && currentSpaceSequence !== previousSpaceSequence + 1)
      || (previousStateRevision && currentStateRevision !== previousStateRevision + 1)
    ) {
      const error = new Error('El lote atómico contiene una interrupción en sus secuencias canónicas.');
      error.code = 'P2P_ATOMIC_BATCH_SEQUENCE_GAP';
      throw error;
    }
  }
  return ordered;
}

function sortSnapshotEntities(entities = []) {
  return [...(entities || [])].sort((left, right) => {
    const leftKey = `${left?.entityType || ''}|${left?.entityId || ''}`;
    const rightKey = `${right?.entityType || ''}|${right?.entityId || ''}`;
    return leftKey.localeCompare(rightKey);
  });
}

export function canonicalLocalSnapshotEntities(records = []) {
  const entities = [];
  for (const record of Array.isArray(records) ? records : []) {
    const entityType = String(record?.entityType || '').trim();
    const entityId = String(record?.entityId || '').trim();
    if (!entityType || !entityId) continue;
    const hasConfirmedSchema = Object.prototype.hasOwnProperty.call(record || {}, 'confirmedExists');
    if (hasConfirmedSchema) {
      const confirmedExists = record.confirmedExists === true;
      const confirmedDeleted = record.confirmedDeleted === true;
      if (!confirmedExists && !confirmedDeleted) continue;
      entities.push({
        entityType,
        entityId,
        value: confirmedDeleted ? null : record.confirmedValue,
        deleted: confirmedDeleted,
        operationId: String(record.confirmedOperationId || '').trim(),
        operationType: String(record.confirmedOperationType || (confirmedDeleted ? 'entity.delete' : 'entity.put')).trim(),
        spaceSequence: Math.max(0, Number(record.confirmedSpaceSequence || 0)),
        stateRevision: Math.max(0, Number(record.confirmedStateRevision || record.confirmedSpaceSequence || 0)),
        updatedAt: String(record.confirmedUpdatedAt || '').trim()
      });
      continue;
    }
    if (record?.optimistic === true) continue;
    entities.push({
      entityType,
      entityId,
      value: record?.deleted ? null : record?.value,
      deleted: Boolean(record?.deleted),
      operationId: String(record?.operationId || '').trim(),
      operationType: String(record?.operationType || (record?.deleted ? 'entity.delete' : 'entity.put')).trim(),
      spaceSequence: Math.max(0, Number(record?.spaceSequence || 0)),
      stateRevision: Math.max(0, Number(record?.stateRevision || record?.spaceSequence || 0)),
      updatedAt: String(record?.updatedAt || '').trim()
    });
  }
  return sortSnapshotEntities(entities);
}

export function localSnapshotSourceAllowed(space = {}, sourceUserId = '', requesterUserId = '') {
  const source = String(sourceUserId || '').trim();
  const requester = String(requesterUserId || '').trim();
  if (!source || !requester) return false;
  return source === requester || String(space?.ownerUserId || '').trim() === source;
}

export function planLocalSnapshotRequests(localStateRevisions = {}, remoteStateRevisions = {}) {
  const requests = [];
  for (const [rawSpaceId, rawRemoteRevision] of Object.entries(remoteStateRevisions || {}).slice(0, 500)) {
    const spaceId = String(rawSpaceId || '').trim().slice(0, 140);
    const remoteStateRevision = Math.max(0, Math.floor(Number(rawRemoteRevision || 0)));
    const localStateRevision = Math.max(0, Math.floor(Number(localStateRevisions?.[spaceId] || 0)));
    if (!spaceId || remoteStateRevision <= localStateRevision) continue;
    requests.push({ spaceId, localStateRevision, remoteStateRevision });
  }
  return requests.sort((left, right) => left.spaceId.localeCompare(right.spaceId));
}

async function sha256Hex(value = '') {
  const bytes = new TextEncoder().encode(String(value));
  const digest = await window.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function snapshotChunksByBytes(entities = [], maxEventBytes = DEFAULT_EVENT_MAX_BYTES) {
  const budget = Math.max(8 * 1024, Number(maxEventBytes || DEFAULT_EVENT_MAX_BYTES) - SNAPSHOT_EVENT_SAFETY_BYTES);
  const chunks = [];
  let current = [];
  for (const entity of entities || []) {
    const candidate = [...current, entity];
    const estimatedOperation = {
      operationId: 'snapshot_request:chunk:999999',
      type: 'snapshot.chunk',
      entityType: '__snapshot__',
      entityId: 'snapshot_request:999999',
      payload: { requestId: 'snapshot_request', chunkIndex: 999999, chunkCount: 999999, entities: candidate }
    };
    if (candidate.length <= SNAPSHOT_CHUNK_MAX_ITEMS && jsonByteLength(estimatedOperation) <= budget) {
      current = candidate;
      continue;
    }
    if (!current.length) {
      throw new Error('Una entidad local supera el tamaño seguro para reconstruirla mediante snapshot.');
    }
    chunks.push(current);
    current = [entity];
    const singleOperation = { ...estimatedOperation, payload: { ...estimatedOperation.payload, entities: current } };
    if (jsonByteLength(singleOperation) > budget) {
      throw new Error('Una entidad local supera el tamaño seguro para reconstruirla mediante snapshot.');
    }
  }
  if (current.length) chunks.push(current);
  if (!chunks.length) chunks.push([]);
  return chunks;
}

function normalizeInvitationCollection(input = {}) {
  return {
    received: Array.isArray(input.received) ? input.received : [],
    sent: Array.isArray(input.sent) ? input.sent : []
  };
}

export function mergeCommittedInvitationState(input = {}, invitations = [], user = {}) {
  const userId = String(user?.userId || '').trim();
  const email = String(user?.email || '').trim().toLowerCase();
  let received = Array.isArray(input?.received) ? [...input.received] : [];
  let sent = Array.isArray(input?.sent) ? [...input.sent] : [];

  const upsert = (records = [], invitation = {}) => {
    const invitationId = String(invitation?.invitationId || '').trim();
    if (!invitationId) return records;
    const index = records.findIndex((candidate) => String(candidate?.invitationId || '').trim() === invitationId);
    if (index < 0) return [...records, invitation];
    const next = [...records];
    next[index] = invitation;
    return next;
  };

  for (const invitation of Array.isArray(invitations) ? invitations : []) {
    const invitationId = String(invitation?.invitationId || '').trim();
    if (!invitationId) continue;
    received = received.filter((candidate) => String(candidate?.invitationId || '').trim() !== invitationId);
    sent = sent.filter((candidate) => String(candidate?.invitationId || '').trim() !== invitationId);

    const recipientUserId = String(invitation?.recipientUserId || '').trim();
    const recipientEmail = String(invitation?.recipientEmail || '').trim().toLowerCase();
    const inviterUserId = String(invitation?.inviterUserId || '').trim();
    const belongsToRecipient = Boolean(userId && recipientUserId === userId)
      || Boolean(!recipientUserId && email && recipientEmail === email);
    const belongsToInviter = Boolean(userId && inviterUserId === userId);

    if (belongsToRecipient) received = upsert(received, invitation);
    if (belongsToInviter) sent = upsert(sent, invitation);
  }

  return { received, sent };
}

export function prepareCommittedControlState({ spaces = [], invitations = [] } = {}, options = {}) {
  const desiredAuthorizationState = options.authorizationState === 'unconfirmed'
    ? 'unconfirmed'
    : 'confirmed';
  const currentSpaces = Array.isArray(options.currentSpaces) ? options.currentSpaces : [];
  const currentBySpaceId = new Map(currentSpaces
    .filter((space) => String(space?.spaceId || '').trim())
    .map((space) => [String(space.spaceId).trim(), space]));
  const unconfirmedAt = String(options.unconfirmedAt || new Date().toISOString()).trim();

  const preparedSpaces = (Array.isArray(spaces) ? spaces : [])
    .filter((space) => String(space?.spaceId || '').trim())
    .map((space) => {
      const spaceId = String(space.spaceId).trim();
      const current = currentBySpaceId.get(spaceId) || null;
      const preserveConfirmed = desiredAuthorizationState === 'unconfirmed'
        && current?.authorizationState === 'confirmed';
      const authorizationState = preserveConfirmed ? 'confirmed' : desiredAuthorizationState;
      // Una aceptación repetida es solo una señal de recuperación. Si esta réplica
      // ya fue confirmada, el grafo vigente debe conservarse hasta que el bootstrap
      // autoritativo aplique cualquier cambio de miembros o permisos.
      const prepared = preserveConfirmed
        ? { ...current, authorizationState: 'confirmed' }
        : current
          ? { ...current, ...space, authorizationState }
          : { ...space, authorizationState };
      if (authorizationState === 'unconfirmed') {
        prepared.authorizationPendingReason = String(
          space.authorizationPendingReason
          || current?.authorizationPendingReason
          || 'replica_recovery'
        ).trim();
        prepared.authorizationUnconfirmedAt = String(
          space.authorizationUnconfirmedAt || current?.authorizationUnconfirmedAt || unconfirmedAt
        ).trim();
      } else {
        delete prepared.authorizationPendingReason;
        delete prepared.authorizationUnconfirmedAt;
      }
      return prepared;
    });

  return {
    spaces: preparedSpaces,
    invitations: (Array.isArray(invitations) ? invitations : [])
      .filter((invitation) => String(invitation?.invitationId || '').trim())
  };
}

export function assertAcceptedInvitationReplicaState(state = {}, spaceId = '', options = {}) {
  const cleanSpaceId = String(spaceId || '').trim();
  const errorCode = String(options.code || 'P2P_INVITATION_REPLICA_UNCONFIRMED').trim();
  const message = String(
    options.message
      || 'El estado autoritativo no confirmó la réplica necesaria después de aceptar la invitación.'
  ).trim();
  const canonicalSpace = cleanSpaceId
    ? (Array.isArray(state?.spaces) ? state.spaces : [])
      .find((candidate) => String(candidate?.spaceId || '').trim() === cleanSpaceId) || null
    : null;
  const explicitlyRevoked = Boolean(cleanSpaceId)
    && (Array.isArray(state?.revokedSpaceIds) ? state.revokedSpaceIds : [])
      .some((candidate) => String(candidate || '').trim() === cleanSpaceId);
  const backendStateRevision = Math.max(0, Number(
    options.backendStateRevision
    || state?.stateRevisions?.[cleanSpaceId]
    || canonicalSpace?.stateRevision
    || 0
  ));
  const localStateRevision = Math.max(0, Number(options.localStateRevision || 0));
  const recoveryRequirement = Math.max(0, Number(
    options.recoveryRequirements?.[cleanSpaceId]
    || options.recoveryRequirement
    || 0
  ));
  const authorizationPendingReason = String(
    canonicalSpace?.authorizationPendingReason || ''
  ).trim();
  const membershipUnconfirmed = Boolean(canonicalSpace)
    && canonicalSpace.authorizationState === 'unconfirmed'
    && authorizationPendingReason !== 'replica_recovery';
  const replicaPending = Boolean(canonicalSpace)
    && !membershipUnconfirmed
    && (
      authorizationPendingReason === 'replica_recovery'
      || recoveryRequirement > localStateRevision
      || backendStateRevision > localStateRevision
    );

  if (!cleanSpaceId || (!explicitlyRevoked && (!canonicalSpace || membershipUnconfirmed))) {
    throw realtimeProtocolError(message, errorCode, {
      invitationId: String(options.invitationId || '').trim(),
      eventId: String(options.eventId || '').trim(),
      spaceId: cleanSpaceId
    });
  }
  if (!explicitlyRevoked && replicaPending && options.allowReplicaPending !== true) {
    throw realtimeProtocolError(message, errorCode, {
      invitationId: String(options.invitationId || '').trim(),
      eventId: String(options.eventId || '').trim(),
      spaceId: cleanSpaceId,
      localStateRevision,
      backendStateRevision,
      recoveryRequirement,
      authorizationPendingReason
    });
  }

  return {
    spaceId: cleanSpaceId,
    space: canonicalSpace,
    explicitlyRevoked,
    replicaPending: !explicitlyRevoked && replicaPending,
    localStateRevision,
    backendStateRevision,
    recoveryRequirement,
    authorizationPendingReason
  };
}

function urlBase64ToUint8Array(base64String = '') {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = `${base64String}${padding}`.replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((character) => character.charCodeAt(0)));
}

function applicationServerKeyBytes(value = null) {
  if (!value) return null;
  try {
    if (ArrayBuffer.isView(value)) {
      return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
    }
    if (typeof value.byteLength === 'number') return new Uint8Array(value);
  } catch {}
  return null;
}

export function comparePushApplicationServerKeys(actualKey = null, expectedKey = null) {
  const actual = applicationServerKeyBytes(actualKey);
  const expected = applicationServerKeyBytes(expectedKey);
  if (!actual?.length || !expected?.length) return null;
  if (actual.length !== expected.length) return false;
  let difference = 0;
  for (let index = 0; index < actual.length; index += 1) difference |= actual[index] ^ expected[index];
  return difference === 0;
}

function normalizePushPublicKey(value = '') {
  return String(value || '')
    .trim()
    .replace(/\s+/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function readStoredPushVapidBinding() {
  try {
    const document = JSON.parse(window.localStorage.getItem(PUSH_VAPID_BINDING_STORAGE_KEY) || 'null');
    const endpoint = String(document?.endpoint || '').trim();
    const publicKey = normalizePushPublicKey(document?.publicKey || '');
    if (!endpoint || !publicKey) return null;
    return { endpoint, publicKey };
  } catch {
    return null;
  }
}

function writeStoredPushVapidBinding(subscription = null, publicKey = '') {
  const endpoint = String(subscription?.endpoint || '').trim();
  const normalizedPublicKey = normalizePushPublicKey(publicKey);
  if (!endpoint || !normalizedPublicKey) return false;
  try {
    window.localStorage.setItem(PUSH_VAPID_BINDING_STORAGE_KEY, JSON.stringify({
      endpoint,
      publicKey: normalizedPublicKey
    }));
    return true;
  } catch {
    return false;
  }
}

function clearStoredPushVapidBinding(expectedEndpoint = '') {
  const expected = String(expectedEndpoint || '').trim();
  try {
    if (expected) {
      const current = readStoredPushVapidBinding();
      if (current?.endpoint && current.endpoint !== expected) return false;
    }
    window.localStorage.removeItem(PUSH_VAPID_BINDING_STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}

function compareSubscriptionWithExpectedVapidKey(subscription = null, expectedKey = null, expectedPublicKey = '') {
  const directComparison = comparePushApplicationServerKeys(
    subscription?.options?.applicationServerKey || null,
    expectedKey
  );
  if (directComparison !== null) return directComparison;

  // Algunos navegadores conservan la suscripción, pero no exponen la clave con la
  // que fue creada. En ese caso se usa una vinculación local endpoint + clave pública.
  // Si no existe (instalación heredada) se rota una sola vez para establecerla, en
  // lugar de reutilizar indefinidamente una suscripción VAPID posiblemente obsoleta.
  const endpoint = String(subscription?.endpoint || '').trim();
  const stored = readStoredPushVapidBinding();
  return Boolean(
    endpoint
    && stored?.endpoint === endpoint
    && stored.publicKey === normalizePushPublicKey(expectedPublicKey)
  );
}

function pushAccountBindingRequestId() {
  if (globalThis.crypto?.randomUUID) return `push-binding:${globalThis.crypto.randomUUID()}`;
  return `push-binding:${Date.now()}:${Math.random().toString(36).slice(2)}`;
}

async function updateServiceWorkerPushAccountBinding(input = {}) {
  if (!('serviceWorker' in navigator)) return { ok: false, reason: 'unsupported' };
  let registration = null;
  try {
    registration = await navigator.serviceWorker.ready;
  } catch {
    return { ok: false, reason: 'service_worker_unavailable' };
  }
  const worker = registration?.active
    || navigator.serviceWorker.controller
    || registration?.waiting
    || registration?.installing;
  if (!worker || typeof worker.postMessage !== 'function') {
    return { ok: false, reason: 'service_worker_unavailable' };
  }

  const message = {
    type: 'P2P_PUSH_ACCOUNT_BINDING',
    requestId: pushAccountBindingRequestId(),
    action: String(input.action || '').trim().toLowerCase(),
    userId: String(input.userId || '').trim(),
    deviceId: String(input.deviceId || '').trim(),
    expectedUserId: String(input.expectedUserId || '').trim(),
    expectedDeviceId: String(input.expectedDeviceId || '').trim()
  };
  if (typeof MessageChannel !== 'function') {
    return { ok: false, changed: false, reason: 'message_channel_unavailable' };
  }

  return new Promise((resolve) => {
    const channel = new MessageChannel();
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      channel.port1.onmessage = null;
      channel.port1.close?.();
      resolve(result);
    };
    const timer = window.setTimeout(() => finish({ ok: false, reason: 'service_worker_timeout' }), 2500);
    channel.port1.onmessage = (event) => {
      const result = event?.data || {};
      if (String(result.requestId || '') !== message.requestId) return;
      finish(result);
    };
    try {
      worker.postMessage(message, [channel.port2]);
    } catch {
      finish({ ok: false, reason: 'service_worker_message_failed' });
    }
  });
}

async function requireServiceWorkerPushAccountBinding(userId = '', deviceId = '') {
  const result = await updateServiceWorkerPushAccountBinding({ action: 'set', userId, deviceId });
  if (!result?.ok) {
    const error = new Error('No se pudo vincular de forma segura esta cuenta y esta instalación con las notificaciones del dispositivo.');
    error.code = 'P2P_PUSH_ACCOUNT_BINDING_FAILED';
    throw error;
  }
  return result;
}

export class SemillaP2PClient {
  constructor() {
    this.deviceId = '';
    this.deviceEncryptionPublicKey = null;
    this.keyRequestTimes = new Map();
    this.missingSpaceKeyRecoveryPromises = new Map();
    this.invitationEscrowRecoveryAttempts = new Map();
    this.rejectedKeyEnvelopeSources = new Map();
    this.rejectedKeyEnvelopeRetryTimers = new Map();
    this.rejectedSnapshotSources = new Map();
    this.user = null;
    this.eventSource = null;
    this.openPromise = null;
    this.manualClose = false;
    this.retryCount = 0;
    this.retryTimer = 0;
    this.serverRetryTimer = 0;
    this.serverRetryDueAt = 0;
    this.serverRetryStage = '';
    this.serverRetryAttempt = 0;
    this.ackTimer = 0;
    this.ackPromise = null;
    this.ackGeneration = 0;
    this.ackRetryCount = 0;
    this.replicaHealthTimer = 0;
    this.replicaHealthConvergenceAttempts = new Map();
    this.replicaHealthRecoveryCooldownUntil = new Map();
    this.replicaHealthRecoveryPromise = null;
    this.pendingReplicaHealthSpaceIds = new Set();
    this.pendingAckReplicaSpaceIds = new Set();
    this.snapshotRecoveryTimer = 0;
    this.snapshotRecoveryDueAt = 0;
    this.snapshotRecoveryRequired = false;
    this.recoveryRequirements = {};
    this.highestPendingAck = 0;
    this.eventPipeline = Promise.resolve();
    this.eventPipelineBlocked = false;
    this.pendingAtomicEventBatches = new Map();
    this.atomicBatchAssemblyTimer = 0;
    this.pipelineGeneration = 0;
    this.sessionGeneration = 0;
    this.bootstrapRequestSequence = 0;
    this.bootstrapAppliedSequence = 0;
    this.bootstrapMinimumApplicableSequence = 0;
    this.bootstrapApplyQueue = Promise.resolve();
    this.nextBootstrapSnapshotSpaceIds = [];
    this.stopPromise = null;
    this.identityRecoveryPromise = null;
    this.identityRecoveryGeneration = 0;
    this.identityRecoveryRestarting = false;
    this.lastProcessedSequence = 0;
    this.lastAcceptedStreamSequence = 0;
    this.started = false;
    this.eventMaxBytes = DEFAULT_EVENT_MAX_BYTES;
    this.entityMaxBytes = DEFAULT_ENTITY_MAX_BYTES;
    this.snapshotMaxBytes = DEFAULT_SNAPSHOT_MAX_BYTES;
    this.snapshotTransferMaxBytes = DEFAULT_SNAPSHOT_TRANSFER_MAX_BYTES;
    this.snapshotMaxChunks = DEFAULT_SNAPSHOT_MAX_CHUNKS;
    this.snapshotGrantTtlSeconds = 600;
    configureP2PStorageLimits({
      snapshotMaxBytes: this.snapshotMaxBytes,
      snapshotMaxChunks: this.snapshotMaxChunks,
      snapshotSessionTtlSeconds: this.snapshotGrantTtlSeconds + 120
    });
    this.bootstrapState = { spaces: [], invitations: { received: [], sent: [] }, replicaHealth: {}, lifecycleTransactions: [] };
    this.tabCoordinator = new P2PTabCoordinator();
    this.tabCoordinationReady = false;
    this.realtimeLeader = true;
    this.activeLeaderTabId = '';
    this.activeLeaderToken = '';
    this.activeLeaderMessageAt = 0;
    this.pendingTabStateRequestId = '';
    this.pendingTabStateLeaderTabId = '';
    this.pendingTabStateLeaderToken = '';
    this.pendingTabStateRequestReason = '';
    this.pendingTabStateRequestAttempt = 0;
    this.tabStateRequestTimer = 0;
    this.tabRelayHandlers = [];
    this.tabStateReconcileRequested = false;
    this.tabStateReconcileForceSnapshots = false;
    this.tabStateReconcileRunning = false;
    this.tabStateReconcileTask = Promise.resolve();
    this.leadershipTask = Promise.resolve();
    this.foregroundRecoveryPromise = null;
    this.boundOnline = () => {
      this.recoverOnline().catch((error) => dispatch('p2p:error', { error, stage: 'recover' }));
    };
    this.boundForegroundRecovery = () => {
      if ((typeof document !== 'undefined' && document.visibilityState === 'hidden') || navigator.onLine === false) return;
      this.recoverForeground().catch((error) => dispatch('p2p:error', { error, stage: 'foreground-recover' }));
    };
    this.boundRateLimited = (event = {}) => {
      const detail = event?.detail || {};
      this.scheduleServerRecovery(detail.error, detail.path || 'rate-limit');
    };
    this.localTransport = null;
    this.localTransportLoadPromise = null;
    this.localTransportSession = null;
    this.localCapabilityAuthority = null;
    this.localCapability = null;
    this.invitationEscrowAuthority = null;
    this.invitationEscrowMaxBytes = 0;
    this.localCapabilityRefreshTimer = 0;
    this.localCapabilityRefreshDueAt = 0;
    this.localCapabilityRefreshAttempt = 0;
    this.localCapabilityRefreshPromise = null;
    this.pendingLocalSnapshotRequests = new Map();
    this.servedLocalSnapshotRequests = new Map();
    this.pendingLocalLifecycleTransactions = new Map();
    this.lifecycleFinalizationObserverTimer = 0;
    this.lifecycleFinalizationObserverPromise = null;
    this.lifecycleFinalizationObserverAttempt = 0;
    this.lifecycleFinalizationFailures = new Map();
    this.deviceSigningPublicKey = null;
  }

  get device() {
    return {
      deviceId: this.deviceId,
      name: getDeviceName(),
      platform: navigator.userAgentData?.platform || navigator.platform || '',
      appMode: getAppMode(),
      language: navigator.language || 'es-CO',
      encryptionPublicKey: this.deviceEncryptionPublicKey,
      signingPublicKey: this.deviceSigningPublicKey
    };
  }

  sinBackendEnabled() {
    return window.APP_SEED_CONFIG?.sinBACKEND === true;
  }

  getLocalNetworkStatus() {
    if (!this.sinBackendEnabled()) return { enabled: false, supported: false, started: false, connected: false, peers: [] };
    const status = this.localTransport?.status?.() || { supported: 'RTCPeerConnection' in window, started: false, connected: false, peers: [] };
    return { enabled: true, ...status };
  }

  async ensureLocalTransport(sessionContext = this.captureSessionContext()) {
    if (!this.sinBackendEnabled() || !this.realtimeLeader) return null;
    this.assertSessionContext(sessionContext);
    if (this.localTransport) {
      if (!this.localTransport.status?.().started) {
        this.localTransport.start({
          userId: sessionContext.userId,
          email: this.user?.email || '',
          displayName: this.user?.displayName || '',
          deviceId: sessionContext.deviceId,
          deviceName: this.device.name
        });
      }
      return this.localTransport;
    }
    if (this.localTransportLoadPromise) return this.localTransportLoadPromise;
    this.localTransportLoadPromise = (async () => {
      try {
        const module = await import('../../P2P_sin_RED_LOCALx/P2P_sin_transport.js');
        this.assertSessionContext(sessionContext);
        const Transport = module?.P2PSinBackendTransport;
        if (typeof Transport !== 'function') throw new Error('El bloque opcional P2P_sin_ no expone el transporte esperado.');
        const transport = new Transport({
          origin: window.location.origin,
          applicationId: P2P_APPLICATION_ID,
          onPayload: (message) => this.handleLocalTransportPayload(message, sessionContext),
          onState: (detail) => {
            if (!this.isSessionContextCurrent(sessionContext)) return;
            this.localTransportSession = detail;
            dispatch('p2p:local-network', detail);
            const backendConnected = Boolean(globalThis.EventSource && this.eventSource?.readyState === globalThis.EventSource.OPEN);
            const localConnected = detail?.status?.connected === true;
            const peers = detail?.status?.peers || [];
            if (detail?.state === 'connected' && localConnected) {
              dispatch('p2p:connection', {
                state: backendConnected ? 'connected' : 'local-connected',
                localOnly: !backendConnected,
                peers
              });
              this.handleLocalTransportConnected(detail, sessionContext).catch((error) => {
                dispatch('p2p:error', { error, stage: 'local-recovery' });
              });
              return;
            }
            if (['reconnecting', 'disconnected', 'failed', 'closed', 'error'].includes(detail?.state)) {
              dispatch('p2p:connection', {
                state: backendConnected ? 'connected' : localConnected ? 'local-connected' : detail.state === 'reconnecting' ? 'connecting' : 'disconnected',
                localOnly: !backendConnected && localConnected,
                peers
              });
            }
          }
        });
        transport.start({
          userId: sessionContext.userId,
          email: this.user?.email || '',
          displayName: this.user?.displayName || '',
          deviceId: sessionContext.deviceId,
          deviceName: this.device.name
        });
        this.localTransport = transport;
        dispatch('p2p:local-network', { state: 'ready', status: transport.status() });
        return transport;
      } catch (error) {
        this.localTransport = null;
        dispatch('p2p:local-network', {
          state: 'unavailable',
          optionalBlockMissing: Number(error?.status || 0) === 404 || /Failed to fetch dynamically imported module|Importing a module script failed/i.test(String(error?.message || '')),
          error,
          status: { enabled: true, supported: false, started: false, connected: false, peers: [] }
        });
        return null;
      } finally {
        this.localTransportLoadPromise = null;
      }
    })();
    return this.localTransportLoadPromise;
  }

  async stopLocalTransport() {
    const transport = this.localTransport;
    this.localTransport = null;
    this.localTransportLoadPromise = null;
    this.localTransportSession = null;
    this.pendingLocalSnapshotRequests.clear();
    this.servedLocalSnapshotRequests.clear();
    this.pendingLocalLifecycleTransactions.clear();
    if (transport?.stop) await transport.stop().catch(() => null);
  }

  async createLocalNetworkOffer() {
    const sessionContext = this.captureSessionContext();
    this.assertSessionContext(sessionContext);
    const transport = await this.ensureLocalTransport(sessionContext);
    if (!transport) throw new Error('El bloque opcional P2P_sin_ no está disponible; la sincronización con memoriaBACKEND continúa funcionando normalmente.');
    return transport.createOffer();
  }

  async acceptLocalNetworkOffer(code = '') {
    const sessionContext = this.captureSessionContext();
    this.assertSessionContext(sessionContext);
    const transport = await this.ensureLocalTransport(sessionContext);
    if (!transport) throw new Error('El bloque opcional P2P_sin_ no está disponible; la sincronización con memoriaBACKEND continúa funcionando normalmente.');
    return transport.acceptOffer(code);
  }

  async completeLocalNetworkAnswer(code = '') {
    const sessionContext = this.captureSessionContext();
    this.assertSessionContext(sessionContext);
    const transport = await this.ensureLocalTransport(sessionContext);
    if (!transport) throw new Error('El bloque opcional P2P_sin_ no está disponible; la sincronización con memoriaBACKEND continúa funcionando normalmente.');
    return transport.completeAnswer(code);
  }

  localCapabilityMetaKey(deviceId = this.deviceId) {
    return `${LOCAL_CAPABILITY_META_PREFIX}${String(deviceId || '').trim()}`;
  }

  clearLocalCapabilityRefreshTimer() {
    if (this.localCapabilityRefreshTimer) window.clearTimeout(this.localCapabilityRefreshTimer);
    this.localCapabilityRefreshTimer = 0;
    this.localCapabilityRefreshDueAt = 0;
  }

  scheduleLocalCapabilityRefresh(options = {}, sessionContext = this.captureSessionContext()) {
    this.clearLocalCapabilityRefreshTimer();
    if (
      !this.sinBackendEnabled()
      || !this.started
      || this.manualClose
      || !this.tabCoordinationReady
      || !this.realtimeLeader
      || !getSessionToken()
      || !this.localCapability
      || !this.localCapabilityAuthority
      || !this.isSessionContextCurrent(sessionContext)
    ) return false;

    const plan = planLocalCapabilityRefresh(this.localCapability);
    if (!plan.valid) return false;
    const requestedDelayMs = Number(options.delayMs || 0);
    const latestSafeDelayMs = Math.max(1000, plan.expiresAtMs - Date.now() - 1000);
    const delayMs = Math.min(
      latestSafeDelayMs,
      requestedDelayMs > 0 ? Math.max(1000, requestedDelayMs) : plan.delayMs
    );
    this.localCapabilityRefreshDueAt = Date.now() + delayMs;
    this.localCapabilityRefreshTimer = window.setTimeout(() => {
      this.localCapabilityRefreshTimer = 0;
      this.localCapabilityRefreshDueAt = 0;
      this.refreshLocalCapability(sessionContext).catch((error) => {
        if (!this.isSessionContextChangedError(error)) {
          dispatch('p2p:error', { error, stage: 'local-capability-refresh' });
        }
      });
    }, delayMs);
    return true;
  }

  async refreshLocalCapability(sessionContext = this.captureSessionContext()) {
    if (this.localCapabilityRefreshPromise) return this.localCapabilityRefreshPromise;
    if (
      !this.isSessionContextCurrent(sessionContext)
      || !this.tabCoordinationReady
      || !this.realtimeLeader
      || !this.sinBackendEnabled()
      || !getSessionToken()
    ) return false;
    if (!navigator.onLine) {
      dispatch('p2p:local-capability', { state: 'waiting-for-network' });
      return false;
    }

    const refreshing = (async () => {
      try {
        await this.refreshBootstrap({ requestSnapshots: false });
        this.assertSessionContext(sessionContext);
        this.localCapabilityRefreshAttempt = 0;
        dispatch('p2p:local-capability', {
          state: 'renewed',
          expiresAt: String(this.localCapability?.payload?.expiresAt || '')
        });
        return true;
      } catch (error) {
        if (this.isSessionContextChangedError(error) || !this.isSessionContextCurrent(sessionContext)) return false;
        const plan = planLocalCapabilityRefresh(this.localCapability);
        if (plan.valid) {
          this.localCapabilityRefreshAttempt += 1;
          const retryDelayMs = Math.min(
            LOCAL_CAPABILITY_REFRESH_RETRY_MAX_MS,
            LOCAL_CAPABILITY_REFRESH_RETRY_BASE_MS * (2 ** Math.min(5, this.localCapabilityRefreshAttempt - 1))
          );
          if (!this.scheduleServerRecovery(error, 'local-capability-refresh')) {
            this.scheduleLocalCapabilityRefresh({ delayMs: retryDelayMs }, sessionContext);
          }
          dispatch('p2p:local-capability', {
            state: 'retry-scheduled',
            retryAt: this.localCapabilityRefreshDueAt || 0,
            expiresAt: String(this.localCapability?.payload?.expiresAt || ''),
            error
          });
          return false;
        }
        this.clearLocalCapabilityRefreshTimer();
        dispatch('p2p:local-capability', {
          state: 'expired',
          expiresAt: String(this.localCapability?.payload?.expiresAt || ''),
          error
        });
        return false;
      } finally {
        if (this.localCapabilityRefreshPromise === refreshing) this.localCapabilityRefreshPromise = null;
      }
    })();
    this.localCapabilityRefreshPromise = refreshing;
    return refreshing;
  }

  async persistLocalCapabilityState(authority = null, capability = null, sessionContext = this.captureSessionContext()) {
    this.assertSessionContext(sessionContext);
    if (authority?.enabled === true && capability) {
      await verifyP2PLocalCapability(authority, capability, {
        origin: window.location.origin,
        applicationId: P2P_APPLICATION_ID,
        userId: sessionContext.userId,
        deviceId: sessionContext.deviceId
      });
      this.assertSessionContext(sessionContext);
      await setMeta(LOCAL_CAPABILITY_AUTHORITY_META_KEY, authority);
      await setMeta(this.localCapabilityMetaKey(sessionContext.deviceId), capability);
      this.localCapabilityAuthority = authority;
      this.localCapability = capability;
      this.localCapabilityRefreshAttempt = 0;
      this.scheduleLocalCapabilityRefresh({ reason: 'capability-updated' }, sessionContext);
      return true;
    }
    await setMeta(LOCAL_CAPABILITY_AUTHORITY_META_KEY, null);
    await setMeta(this.localCapabilityMetaKey(sessionContext.deviceId), null);
    this.localCapabilityAuthority = null;
    this.localCapability = null;
    this.localCapabilityRefreshAttempt = 0;
    this.clearLocalCapabilityRefreshTimer();
    return false;
  }

  async loadLocalCapabilityState(sessionContext = this.captureSessionContext()) {
    this.assertSessionContext(sessionContext);
    const [authority, capability] = await Promise.all([
      getMeta(LOCAL_CAPABILITY_AUTHORITY_META_KEY, null),
      getMeta(this.localCapabilityMetaKey(sessionContext.deviceId), null)
    ]);
    this.assertSessionContext(sessionContext);
    if (!authority || !capability) {
      this.localCapabilityAuthority = null;
      this.localCapability = null;
      return false;
    }
    try {
      await verifyP2PLocalCapability(authority, capability, {
        origin: window.location.origin,
        applicationId: P2P_APPLICATION_ID,
        userId: sessionContext.userId,
        deviceId: sessionContext.deviceId
      });
      this.localCapabilityAuthority = authority;
      this.localCapability = capability;
      this.scheduleLocalCapabilityRefresh({ reason: 'capability-restored' }, sessionContext);
      return true;
    } catch {
      this.localCapabilityAuthority = null;
      this.localCapability = null;
      this.clearLocalCapabilityRefreshTimer();
      return false;
    }
  }

  cleanupLocalSnapshotRequests(now = Date.now()) {
    for (const [requestId, request] of this.pendingLocalSnapshotRequests.entries()) {
      if (Number(request?.expiresAtMs || 0) <= now) this.pendingLocalSnapshotRequests.delete(requestId);
    }
    for (const [requestId, expiresAtMs] of this.servedLocalSnapshotRequests.entries()) {
      if (Number(expiresAtMs || 0) <= now) this.servedLocalSnapshotRequests.delete(requestId);
    }
    while (this.pendingLocalSnapshotRequests.size > LOCAL_SNAPSHOT_REQUEST_MAX) {
      this.pendingLocalSnapshotRequests.delete(this.pendingLocalSnapshotRequests.keys().next().value);
    }
    while (this.servedLocalSnapshotRequests.size > LOCAL_SNAPSHOT_REQUEST_MAX) {
      this.servedLocalSnapshotRequests.delete(this.servedLocalSnapshotRequests.keys().next().value);
    }
  }

  async verifySignedLocalEnvelope(message = {}, expectedType = '', sessionContext = this.captureSessionContext()) {
    this.assertSessionContext(sessionContext);
    const body = message?.body || {};
    const capabilityPayload = await verifyP2PLocalCapability(this.localCapabilityAuthority, body.capability, {
      origin: window.location.origin,
      applicationId: P2P_APPLICATION_ID
    });
    this.assertSessionContext(sessionContext);
    const signedPayload = body.signedPayload || {};
    const signatureValid = await verifyP2PLocalSignature(
      capabilityPayload.signingPublicKey,
      signedPayload,
      body.signature || ''
    );
    this.assertSessionContext(sessionContext);
    if (!signatureValid) {
      throw Object.assign(new Error('El mensaje de red local no tiene una firma de dispositivo válida.'), { code: 'P2P_SIN_DEVICE_SIGNATURE_INVALID' });
    }
    const createdAtMs = Date.parse(String(signedPayload.createdAt || ''));
    if (
      String(signedPayload.type || '').trim() !== String(expectedType || '').trim()
      || String(signedPayload.userId || '').trim() !== String(capabilityPayload.userId || '').trim()
      || String(signedPayload.deviceId || '').trim() !== String(capabilityPayload.deviceId || '').trim()
      || String(signedPayload.origin || '').trim().toLowerCase() !== window.location.origin.toLowerCase()
      || String(signedPayload.applicationId || '').trim() !== P2P_APPLICATION_ID
      || String(message.peer?.userId || '').trim() !== String(capabilityPayload.userId || '').trim()
      || String(message.peer?.deviceId || '').trim() !== String(capabilityPayload.deviceId || '').trim()
      || !Number.isFinite(createdAtMs)
      || createdAtMs > Date.now() + 60_000
      || Date.now() - createdAtMs > LOCAL_CONTROL_MAX_AGE_MS
    ) {
      throw Object.assign(new Error('La identidad, el alcance o la vigencia del mensaje local no coincide con la capacidad certificada.'), { code: 'P2P_SIN_IDENTITY_MISMATCH' });
    }
    return { body, capabilityPayload, signedPayload };
  }

  async createSignedLocalControlBody(action = '', payload = {}, sessionContext = this.captureSessionContext()) {
    this.assertSessionContext(sessionContext);
    await verifyP2PLocalCapability(this.localCapabilityAuthority, this.localCapability, {
      origin: window.location.origin,
      applicationId: P2P_APPLICATION_ID,
      userId: sessionContext.userId,
      deviceId: sessionContext.deviceId
    });
    const signedPayload = {
      schemaVersion: 1,
      type: 'p2p.sin.control',
      action: String(action || '').trim(),
      origin: window.location.origin,
      applicationId: P2P_APPLICATION_ID,
      userId: sessionContext.userId,
      deviceId: sessionContext.deviceId,
      payload: payload && typeof payload === 'object' ? payload : {},
      createdAt: new Date().toISOString(),
      nonce: createId('lanctl')
    };
    if (!signedPayload.action) throw new Error('El mensaje de control local no tiene una acción válida.');
    const signature = await signP2PLocalPayload(signedPayload);
    this.assertSessionContext(sessionContext);
    return { type: 'p2p.sin.signed-control', capability: this.localCapability, signedPayload, signature };
  }

  async createSignedLocalSnapshotBody(spaceId = '', requestId = '', sourceStateRevision = 0, operation = {}, sessionContext = this.captureSessionContext()) {
    this.assertSessionContext(sessionContext);
    const capabilityPayload = await verifyP2PLocalCapability(this.localCapabilityAuthority, this.localCapability, {
      origin: window.location.origin,
      applicationId: P2P_APPLICATION_ID,
      userId: sessionContext.userId,
      deviceId: sessionContext.deviceId
    });
    const membership = (capabilityPayload.memberships || []).find((candidate) => candidate?.spaceId === String(spaceId || '').trim());
    if (!membership?.permissions?.includes('read')) {
      const error = new Error('La capacidad offline del dispositivo no permite reconstruir este proyecto.');
      error.code = 'P2P_SIN_CAPABILITY_SPACE_MISSING';
      throw error;
    }
    const signedPayload = {
      schemaVersion: 1,
      type: 'p2p.sin.snapshot',
      origin: window.location.origin,
      applicationId: P2P_APPLICATION_ID,
      userId: sessionContext.userId,
      deviceId: sessionContext.deviceId,
      spaceId: String(spaceId || '').trim(),
      requestId: String(requestId || '').trim(),
      sourceStateRevision: Math.max(0, Number(sourceStateRevision || 0)),
      operationId: String(operation?.operationId || '').trim(),
      operation,
      createdAt: new Date().toISOString(),
      nonce: createId('lansnapshot')
    };
    if (!signedPayload.spaceId || !signedPayload.requestId || !signedPayload.operationId) {
      throw new Error('El snapshot local no tiene una identidad durable completa.');
    }
    const signature = await signP2PLocalPayload(signedPayload);
    this.assertSessionContext(sessionContext);
    return { type: 'p2p.sin.signed-snapshot', capability: this.localCapability, signedPayload, signature };
  }

  normalizeLocalLifecycleTombstones(records = [], nowMs = Date.now()) {
    return (Array.isArray(records) ? records : [])
      .map((record) => {
        const status = String(record?.status || '').trim().toLowerCase() === 'prepared' ? 'prepared' : 'completed';
        const expiresAtMs = Math.max(0, Number(record?.expiresAtMs || 0));
        const legacyCompletedAt = new Date(Math.max(0, Math.min(nowMs, expiresAtMs || nowMs))).toISOString();
        const preparedAt = String(record?.preparedAt || record?.completedAt || legacyCompletedAt).trim().slice(0, 80);
        const completedAt = status === 'completed'
          ? String(record?.completedAt || record?.preparedAt || legacyCompletedAt).trim().slice(0, 80)
          : '';
        return {
          transactionId: String(record?.transactionId || '').trim(),
          action: String(record?.action || '').trim().toLowerCase(),
          spaceId: String(record?.spaceId || '').trim(),
          operationId: String(record?.operationId || '').trim(),
          sourceUserId: String(record?.sourceUserId || '').trim(),
          sourceDeviceId: String(record?.sourceDeviceId || '').trim(),
          targetUserId: String(record?.targetUserId || '').trim(),
          status,
          preparedAt,
          completedAt,
          expiresAtMs
        };
      })
      .filter((record) => (
        record.transactionId
        && ['trash', 'restore', 'purge'].includes(record.action)
        && record.spaceId
        && record.operationId
        && record.sourceUserId
        && record.sourceDeviceId
        && record.targetUserId
        && record.preparedAt
        && (record.status !== 'completed' || record.completedAt)
        && record.expiresAtMs > nowMs
      ))
      .slice(0, LOCAL_LIFECYCLE_TOMBSTONE_MAX);
  }

  async localLifecycleTombstones() {
    const stored = await getMeta(LOCAL_LIFECYCLE_TOMBSTONE_META_KEY, []);
    const normalized = this.normalizeLocalLifecycleTombstones(stored);
    if (!Array.isArray(stored) || normalized.length !== stored.length) {
      await setMeta(LOCAL_LIFECYCLE_TOMBSTONE_META_KEY, normalized);
    }
    return normalized;
  }

  async rememberLocalLifecycleTombstone(input = {}, sessionContext = this.captureSessionContext()) {
    this.assertSessionContext(sessionContext);
    const records = await this.localLifecycleTombstones();
    this.assertSessionContext(sessionContext);
    const transactionId = String(input.transactionId || '').trim();
    const existing = records.find((candidate) => candidate.transactionId === transactionId) || null;
    const requestedStatus = String(input.status || '').trim().toLowerCase() === 'prepared' ? 'prepared' : 'completed';
    const status = existing?.status === 'completed' ? 'completed' : requestedStatus;
    const timestamp = new Date().toISOString();
    const record = this.normalizeLocalLifecycleTombstones([{
      transactionId,
      action: input.action,
      spaceId: input.spaceId,
      operationId: input.operationId,
      sourceUserId: input.sourceUserId,
      sourceDeviceId: input.sourceDeviceId,
      targetUserId: sessionContext.userId,
      status,
      preparedAt: String(input.preparedAt || existing?.preparedAt || '').trim() || timestamp,
      completedAt: status === 'completed'
        ? (String(input.completedAt || existing?.completedAt || '').trim() || timestamp)
        : '',
      expiresAtMs: Date.now() + LOCAL_LIFECYCLE_TOMBSTONE_TTL_MS
    }])[0] || null;
    if (!record) throw new Error('No se pudo conservar el comprobante local de la acción crítica remota.');
    const next = [record, ...records.filter((candidate) => candidate.transactionId !== record.transactionId)]
      .slice(0, LOCAL_LIFECYCLE_TOMBSTONE_MAX);
    await setMeta(LOCAL_LIFECYCLE_TOMBSTONE_META_KEY, next);
    this.assertSessionContext(sessionContext);
    return record;
  }

  async matchingLocalLifecycleTombstone(payload = {}, capabilityPayload = {}, sessionContext = this.captureSessionContext()) {
    this.assertSessionContext(sessionContext);
    const records = await this.localLifecycleTombstones();
    this.assertSessionContext(sessionContext);
    return records.find((record) => (
      record.transactionId === String(payload.transactionId || '').trim()
      && record.action === String(payload.action || '').trim()
      && record.spaceId === String(payload.spaceId || '').trim()
      && record.operationId === String(payload.operationId || '').trim()
      && record.sourceUserId === String(capabilityPayload.userId || '').trim()
      && record.sourceDeviceId === String(capabilityPayload.deviceId || '').trim()
      && record.targetUserId === sessionContext.userId
      && String(payload.sourceDeviceId || '').trim() === record.sourceDeviceId
    )) || null;
  }

  async completedPurgeProofForSpace(spaceId = '', sessionContext = this.captureSessionContext()) {
    this.assertSessionContext(sessionContext);
    const cleanSpaceId = String(spaceId || '').trim();
    if (!cleanSpaceId) return null;
    const localTombstones = await this.localLifecycleTombstones();
    this.assertSessionContext(sessionContext);
    const localProof = localTombstones.find((record) => (
      record.spaceId === cleanSpaceId
      && record.action === 'purge'
      && record.status === 'completed'
    )) || null;
    if (localProof) return { source: 'local-network', record: localProof };
    const receipts = await this.lifecycleReceipts();
    this.assertSessionContext(sessionContext);
    const backendProof = receipts.find((record) => (
      record.spaceId === cleanSpaceId
      && record.action === 'purge'
      && record.status === 'completed'
    )) || null;
    return backendProof ? { source: 'memoriaBACKEND', record: backendProof } : null;
  }

  async localLifecycleCapabilityAuthorization(spaceId = '', sourceCapabilityPayload = {}, action = '', sessionContext = this.captureSessionContext()) {
    this.assertSessionContext(sessionContext);
    const cleanSpaceId = String(spaceId || '').trim();
    if (!cleanSpaceId || !this.localCapability || !this.localCapabilityAuthority) return { authorized: false, sourceMembership: null, targetMembership: null };
    const targetCapabilityPayload = await verifyP2PLocalCapability(this.localCapabilityAuthority, this.localCapability, {
      origin: window.location.origin,
      applicationId: P2P_APPLICATION_ID,
      userId: sessionContext.userId,
      deviceId: sessionContext.deviceId
    });
    this.assertSessionContext(sessionContext);
    const sourceMembership = (Array.isArray(sourceCapabilityPayload?.memberships) ? sourceCapabilityPayload.memberships : [])
      .find((candidate) => String(candidate?.spaceId || '').trim() === cleanSpaceId) || null;
    const targetMembership = (Array.isArray(targetCapabilityPayload?.memberships) ? targetCapabilityPayload.memberships : [])
      .find((candidate) => String(candidate?.spaceId || '').trim() === cleanSpaceId) || null;
    return {
      authorized: lifecycleReplicationPairAuthorized(sourceMembership || {}, targetMembership || {}, action),
      sourceMembership,
      targetMembership
    };
  }

  normalizeLifecycleReceipts(records = [], nowMs = Date.now()) {
    return (Array.isArray(records) ? records : [])
      .map((record) => ({
        transactionId: String(record?.transactionId || '').trim().slice(0, 180),
        action: String(record?.action || '').trim().toLowerCase(),
        spaceId: String(record?.spaceId || '').trim().slice(0, 140),
        operationId: String(record?.operationId || '').trim().slice(0, 180),
        sourceDeviceId: String(record?.sourceDeviceId || '').trim().slice(0, 180),
        remoteEventId: String(record?.remoteEventId || record?.eventId || '').trim().slice(0, 180),
        appliedStateRevision: Math.max(0, Number(record?.appliedStateRevision || 0)),
        status: String(record?.status || '').trim().toLowerCase() === 'prepared' ? 'prepared' : 'completed',
        preparedAt: String(record?.preparedAt || record?.completedAt || '').trim().slice(0, 80),
        completedAt: String(record?.completedAt || '').trim().slice(0, 80),
        expiresAtMs: Math.max(0, Number(record?.expiresAtMs || 0))
      }))
      .filter((record) => (
        record.transactionId
        && ['trash', 'restore', 'purge'].includes(record.action)
        && record.spaceId
        && record.operationId
        && record.sourceDeviceId
        && record.remoteEventId
        && record.preparedAt
        && (record.status !== 'completed' || record.completedAt)
        && record.expiresAtMs > nowMs
        && (!['trash', 'restore'].includes(record.action) || Number.isSafeInteger(record.appliedStateRevision))
      ))
      .slice(0, LIFECYCLE_RECEIPT_MAX);
  }

  async lifecycleReceipts() {
    const stored = await getMeta(LIFECYCLE_RECEIPT_META_KEY, []);
    const normalized = this.normalizeLifecycleReceipts(stored);
    if (!Array.isArray(stored) || normalized.length !== stored.length) {
      await setMeta(LIFECYCLE_RECEIPT_META_KEY, normalized);
    }
    return normalized;
  }

  async completedLifecycleReceipts(localSpaceIds = null, sessionContext = this.captureSessionContext()) {
    this.assertSessionContext(sessionContext);
    const records = await this.lifecycleReceipts();
    this.assertSessionContext(sessionContext);
    if (!Array.isArray(localSpaceIds)) return records.filter((record) => record.status === 'completed');

    const localSpaces = new Set(localSpaceIds.map((spaceId) => String(spaceId || '').trim()).filter(Boolean));
    const completedAt = new Date().toISOString();
    let promoted = false;
    const reconciled = records.map((record) => {
      if (record.status !== 'prepared' || record.action !== 'purge' || localSpaces.has(record.spaceId)) return record;
      promoted = true;
      return { ...record, status: 'completed', completedAt };
    });
    if (promoted) {
      await setMeta(LIFECYCLE_RECEIPT_META_KEY, reconciled);
      this.assertSessionContext(sessionContext);
    }
    return reconciled.filter((record) => record.status === 'completed');
  }

  async rememberLifecycleReceipt(input = {}, sessionContext = this.captureSessionContext()) {
    this.assertSessionContext(sessionContext);
    const status = String(input.status || '').trim().toLowerCase() === 'prepared' ? 'prepared' : 'completed';
    const timestamp = new Date().toISOString();
    const receipt = this.normalizeLifecycleReceipts([{
      ...input,
      status,
      preparedAt: String(input.preparedAt || '').trim() || timestamp,
      completedAt: status === 'completed' ? (String(input.completedAt || '').trim() || timestamp) : '',
      expiresAtMs: Date.now() + LIFECYCLE_RECEIPT_TTL_MS
    }])[0] || null;
    if (!receipt) throw new Error('No se pudo conservar la confirmación durable de la acción crítica.');
    const records = await this.lifecycleReceipts();
    this.assertSessionContext(sessionContext);
    const next = [receipt, ...records.filter((candidate) => candidate.transactionId !== receipt.transactionId)]
      .slice(0, LIFECYCLE_RECEIPT_MAX);
    await setMeta(LIFECYCLE_RECEIPT_META_KEY, next);
    this.assertSessionContext(sessionContext);
    return receipt;
  }

  async rememberProjectLifecycleReceipt(event = {}, sessionContext = this.captureSessionContext()) {
    const operation = event?.operation || {};
    const operationId = String(operation.operationId || '').trim();
    const operationType = String(operation.type || '').trim();
    const action = operationType === 'entity.restore' ? 'restore' : operationType === 'entity.trash' ? 'trash' : '';
    if (
      !action
      || String(operation.entityType || '').trim() !== 'admin.project'
      || String(operation.entityId || '').trim() !== 'project'
      || !operationId
      || String(event.sourceDeviceId || '').trim() === sessionContext.deviceId
    ) return null;
    return this.rememberLifecycleReceipt({
      transactionId: `lifecycle_${operationId}`,
      action,
      spaceId: event.spaceId,
      operationId,
      sourceDeviceId: event.sourceDeviceId,
      remoteEventId: event.eventId,
      appliedStateRevision: Math.max(0, Number(event.stateRevision || event.spaceSequence || 0)),
      status: 'completed'
    }, sessionContext);
  }

  async rememberTrashLifecycleReceipt(event = {}, sessionContext = this.captureSessionContext()) {
    return this.rememberProjectLifecycleReceipt(event, sessionContext);
  }

  localLifecyclePublicState(entry = {}, status = '') {
    const targets = Array.isArray(entry.targets) ? entry.targets : [];
    const completedDeviceIds = new Set(Array.isArray(entry.completedDeviceIds) ? entry.completedDeviceIds : []);
    const completed = targets.filter((target) => completedDeviceIds.has(String(target.deviceId || '').trim())).length;
    const total = targets.length;
    return {
      schemaVersion: 1,
      transactionId: String(entry.transactionId || '').trim(),
      action: String(entry.action || '').trim(),
      status: status || (total > 0 && completed >= total ? 'ready' : 'waiting'),
      role: 'source',
      spaceId: String(entry.spaceId || '').trim(),
      sourceDeviceId: this.deviceId,
      operationId: String(entry.operationId || '').trim(),
      completed,
      total,
      remaining: Math.max(0, total - completed),
      updatedAt: new Date().toISOString(),
      localNetwork: true
    };
  }

  eligibleLocalLifecyclePeers(spaceId = '') {
    const cleanSpaceId = String(spaceId || '').trim();
    const space = (this.bootstrapState.spaces || []).find((candidate) => candidate?.spaceId === cleanSpaceId) || null;
    if (!space || space.authorizationState === 'unconfirmed') return [];
    const members = new Map((space.members || []).map((member) => [String(member.userId || '').trim(), member]));
    const seen = new Set();
    const peers = [];
    for (const peer of this.localTransport?.status?.().peers || []) {
      const userId = String(peer?.userId || '').trim();
      const deviceId = String(peer?.deviceId || '').trim();
      const sessionId = String(peer?.sessionId || '').trim();
      const member = members.get(userId);
      if (!userId || !deviceId || !sessionId || deviceId === this.deviceId || !member?.permissions?.includes('read') || seen.has(deviceId)) continue;
      seen.add(deviceId);
      peers.push({ userId, deviceId, sessionId });
    }
    return peers;
  }

  async persistLocalLifecycleEntry(entry = {}, outboxItem = null) {
    const transactionId = String(entry.transactionId || '').trim();
    if (!transactionId) return null;
    const normalized = {
      ...entry,
      targets: Array.isArray(entry.targets) ? entry.targets.map((target) => ({
        userId: String(target.userId || '').trim(),
        deviceId: String(target.deviceId || '').trim(),
        sessionId: String(target.sessionId || '').trim()
      })).filter((target) => target.userId && target.deviceId) : [],
      completedDeviceIds: Array.from(new Set((Array.isArray(entry.completedDeviceIds) ? entry.completedDeviceIds : []).map((deviceId) => String(deviceId || '').trim()).filter(Boolean)))
    };
    this.pendingLocalLifecycleTransactions.set(transactionId, normalized);
    if (outboxItem?.operationId) {
      await enqueueOutbox({
        ...outboxItem,
        localLifecycle: {
          transactionId: normalized.transactionId,
          action: normalized.action,
          spaceId: normalized.spaceId,
          operationId: normalized.operationId,
          targets: normalized.targets.map(({ userId, deviceId }) => ({ userId, deviceId })),
          completedDeviceIds: normalized.completedDeviceIds,
          updatedAt: new Date().toISOString()
        }
      });
    }
    const transaction = this.localLifecyclePublicState(normalized);
    this.rememberLifecycleTransaction(transaction);
    dispatch('p2p:lifecycle-progress', { transaction, source: 'local-network' });
    return normalized;
  }

  async startLocalProjectLifecycle(outboxItem = {}, sessionContext = this.captureSessionContext()) {
    this.assertSessionContext(sessionContext);
    if (!this.sinBackendEnabled() || outboxItem?.localLifecycleCompleted === true) return { delivered: 0, transaction: null };
    const transport = await this.ensureLocalTransport(sessionContext);
    if (!transport?.status?.().connected) return { delivered: 0, transaction: null };
    const action = String(outboxItem.lifecycleAction || outboxItem.localLifecycle?.action || '').trim().toLowerCase();
    const spaceId = String(outboxItem.spaceId || outboxItem.request?.spaceId || outboxItem.localLifecycle?.spaceId || '').trim();
    const operationId = String(outboxItem.operationId || outboxItem.localLifecycle?.operationId || '').trim();
    if (!['trash', 'restore', 'purge'].includes(action) || !spaceId || !operationId) return { delivered: 0, transaction: null };
    const space = (this.bootstrapState.spaces || []).find((candidate) => candidate?.spaceId === spaceId) || null;
    if (!space || space.ownerUserId !== sessionContext.userId || space.authorizationState === 'unconfirmed') return { delivered: 0, transaction: null };

    const transactionId = String(outboxItem.localLifecycle?.transactionId || `local_lifecycle_${operationId}`).trim();
    const previousCompleted = Array.isArray(outboxItem.localLifecycle?.completedDeviceIds) ? outboxItem.localLifecycle.completedDeviceIds : [];
    const candidates = this.eligibleLocalLifecyclePeers(spaceId);
    if (!candidates.length) return { delivered: 0, transaction: null };
    let entry = {
      transactionId,
      action,
      spaceId,
      operationId,
      targets: candidates,
      completedDeviceIds: previousCompleted,
      outboxItem
    };
    await this.persistLocalLifecycleEntry(entry, outboxItem);

    const deliveredTargets = [];
    for (const target of candidates) {
      let body;
      if (action === 'trash' || action === 'restore') {
        if (!outboxItem.request?.operation) continue;
        body = await this.createSignedLocalOperationBody({
          ...outboxItem.request,
          localLifecycle: { transactionId, action, spaceId, operationId, sourceDeviceId: this.deviceId }
        }, outboxItem.createdAt || new Date().toISOString(), sessionContext);
      } else {
        body = await this.createSignedLocalControlBody('lifecycle.purge.request', {
          transactionId, action, spaceId, operationId, sourceDeviceId: this.deviceId
        }, sessionContext);
      }
      const result = await transport.sendTo(target.sessionId, body);
      if (Number(result?.delivered || 0) > 0) deliveredTargets.push(target);
    }
    this.assertSessionContext(sessionContext);
    if (!deliveredTargets.length) {
      this.pendingLocalLifecycleTransactions.delete(transactionId);
      this.rememberLifecycleTransaction({ transactionId, status: 'completed' }, { remove: true });
      return { delivered: 0, transaction: null };
    }
    const activeEntry = this.pendingLocalLifecycleTransactions.get(transactionId);
    if (!activeEntry) return { delivered: deliveredTargets.length, transaction: null, completed: true };
    entry = { ...activeEntry, targets: deliveredTargets, completedDeviceIds: activeEntry.completedDeviceIds || [] };
    await this.persistLocalLifecycleEntry(entry, outboxItem);
    return { delivered: deliveredTargets.length, transaction: this.localLifecyclePublicState(entry) };
  }

  async localLifecycleEntry(transactionId = '') {
    const cleanTransactionId = String(transactionId || '').trim();
    if (!cleanTransactionId) return null;
    const active = this.pendingLocalLifecycleTransactions.get(cleanTransactionId);
    if (active) return active;
    const item = (await listOutbox()).find((candidate) => String(candidate?.localLifecycle?.transactionId || '').trim() === cleanTransactionId) || null;
    if (!item?.localLifecycle) return null;
    const entry = {
      ...item.localLifecycle,
      targets: Array.isArray(item.localLifecycle.targets) ? item.localLifecycle.targets : [],
      completedDeviceIds: Array.isArray(item.localLifecycle.completedDeviceIds) ? item.localLifecycle.completedDeviceIds : [],
      outboxItem: item
    };
    this.pendingLocalLifecycleTransactions.set(cleanTransactionId, entry);
    return entry;
  }

  async finalizeLocalProjectLifecycle(entry = {}, sessionContext = this.captureSessionContext()) {
    this.assertSessionContext(sessionContext);
    const action = String(entry.action || '').trim();
    const spaceId = String(entry.spaceId || '').trim();
    if (action === 'trash' || action === 'restore') {
      const transportOperation = entry.outboxItem?.request?.operation || {};
      const event = {
        eventId: `lan_lifecycle_source_${String(entry.transactionId || entry.operationId).replace(/[^a-zA-Z0-9._:-]/g, '_')}`,
        eventType: 'p2p.operation',
        deliverySequence: 0,
        spaceSequence: 0,
        spaceId,
        actorUserId: sessionContext.userId,
        sourceDeviceId: sessionContext.deviceId,
        operation: transportOperation,
        createdAt: entry.outboxItem?.createdAt || new Date().toISOString(),
        localTransport: true
      };
      this.assertEncryptedTransportEvent(event);
      const decryptedEvent = await decryptOperationEvent(event);
      this.assertSessionContext(sessionContext);
      const result = await applyP2PEvent({ ...decryptedEvent, optimistic: true, localTransport: true });
      dispatch('p2p:operation', { event: decryptedEvent, result, localTransport: true, lifecycleFinalized: true });
    } else if (action === 'purge') {
      await this.fenceBootstrapResponses(sessionContext);
      const purge = await purgeLocalSpace(spaceId);
      await purgeSpaceCrypto(spaceId).catch(() => null);
      this.assertSessionContext(sessionContext);
      this.removeSpaceFromBootstrapState(spaceId);
      dispatch('p2p:space-deleted', { spaceId, source: 'lifecycle-local-network', purge, pendingAuthoritativeDeletion: true });
    }
    const completedTransaction = this.localLifecyclePublicState(entry, 'completed');
    const updatedOutbox = entry.outboxItem?.operationId ? {
      ...entry.outboxItem,
      localLifecycle: {
        transactionId: String(entry.transactionId || '').trim(),
        action: String(entry.action || '').trim(),
        spaceId: String(entry.spaceId || '').trim(),
        operationId: String(entry.operationId || '').trim(),
        targets: (entry.targets || []).map(({ userId, deviceId }) => ({ userId, deviceId })),
        completedDeviceIds: entry.completedDeviceIds,
        completedAt: new Date().toISOString()
      },
      localLifecycleCompleted: true
    } : null;
    if (updatedOutbox) await enqueueOutbox(updatedOutbox);
    this.pendingLocalLifecycleTransactions.delete(entry.transactionId);
    this.rememberLifecycleTransaction(completedTransaction, { remove: true });
    dispatch('p2p:lifecycle-completed', { transaction: completedTransaction, source: 'local-network' });
    return completedTransaction;
  }

  async acknowledgeLocalProjectLifecycle(payload = {}, capabilityPayload = {}, sessionContext = this.captureSessionContext()) {
    this.assertSessionContext(sessionContext);
    const transactionId = String(payload.transactionId || '').trim();
    const entry = await this.localLifecycleEntry(transactionId);
    this.assertSessionContext(sessionContext);
    if (!entry) return false;
    const deviceId = String(capabilityPayload.deviceId || '').trim();
    const userId = String(capabilityPayload.userId || '').trim();
    const target = (entry.targets || []).find((candidate) => String(candidate.deviceId || '').trim() === deviceId && String(candidate.userId || '').trim() === userId);
    const { space, member, permissions } = this.memberPermissionsForUser(entry.spaceId, userId);
    if (
      !target || !space || !member || space.authorizationState === 'unconfirmed' || !permissions.includes('read')
      || String(payload.action || '').trim() !== String(entry.action || '').trim()
      || String(payload.spaceId || '').trim() !== String(entry.spaceId || '').trim()
      || String(payload.operationId || '').trim() !== String(entry.operationId || '').trim()
      || String(payload.sourceDeviceId || '').trim() !== sessionContext.deviceId
    ) return false;
    entry.completedDeviceIds = Array.from(new Set([...(entry.completedDeviceIds || []), deviceId]));
    await this.persistLocalLifecycleEntry(entry, entry.outboxItem);
    const transaction = this.localLifecyclePublicState(entry);
    if (transaction.total > 0 && transaction.remaining === 0) await this.finalizeLocalProjectLifecycle(entry, sessionContext);
    return true;
  }

  async handleLocalTransportConnected(detail = {}, sessionContext = this.captureSessionContext()) {
    this.assertSessionContext(sessionContext);
    const sessionId = String(detail?.sessionId || '').trim();
    const tasks = [this.flushOutboxToLocalNetwork()];
    if (sessionId) tasks.push(this.sendLocalStateAdvertisement(sessionId, sessionContext));
    const results = await Promise.allSettled(tasks);
    const failure = results.find((result) => result.status === 'rejected');
    if (failure) throw failure.reason;
    return true;
  }

  async sendLocalStateAdvertisement(sessionId = '', sessionContext = this.captureSessionContext()) {
    this.assertSessionContext(sessionContext);
    const transport = this.localTransport;
    if (!transport?.status?.().connected || !this.localCapability || !this.localCapabilityAuthority) return false;
    const capabilityPayload = await verifyP2PLocalCapability(this.localCapabilityAuthority, this.localCapability, {
      origin: window.location.origin,
      applicationId: P2P_APPLICATION_ID,
      userId: sessionContext.userId,
      deviceId: sessionContext.deviceId
    });
    const readableSpaceIds = (capabilityPayload.memberships || [])
      .filter((membership) => membership?.permissions?.includes('read'))
      .map((membership) => String(membership.spaceId || '').trim())
      .filter((spaceId) => {
        const { space, member, permissions } = this.memberPermissionsForUser(spaceId, sessionContext.userId);
        return Boolean(space && member && space.authorizationState !== 'unconfirmed' && permissions.includes('read'));
      });
    const stateRevisions = await listStateRevisions(readableSpaceIds);
    this.assertSessionContext(sessionContext);
    const body = await this.createSignedLocalControlBody('state.advertisement', { stateRevisions }, sessionContext);
    const result = await transport.sendTo(sessionId, body);
    return Number(result?.delivered || 0) > 0;
  }

  async handleLocalControlPayload(message = {}, sessionContext = this.captureSessionContext()) {
    this.assertSessionContext(sessionContext);
    let verified;
    try {
      verified = await this.verifySignedLocalEnvelope(message, 'p2p.sin.control', sessionContext);
    } catch (error) {
      dispatch('p2p:local-network', { state: 'rejected', error, peer: message.peer || null });
      return false;
    }
    const { capabilityPayload, signedPayload } = verified;
    const action = String(signedPayload.action || '').trim();
    const payload = signedPayload.payload || {};
    const sessionId = String(message.sessionId || '').trim();
    this.cleanupLocalSnapshotRequests();

    if (action === 'state.advertisement') {
      const allowedRemoteRevisions = {};
      for (const membership of capabilityPayload.memberships || []) {
        const spaceId = String(membership?.spaceId || '').trim();
        if (!spaceId || !membership?.permissions?.includes('read')) continue;
        const revision = Math.max(0, Math.floor(Number(payload?.stateRevisions?.[spaceId] || 0)));
        if (revision > 0) allowedRemoteRevisions[spaceId] = revision;
      }
      const localStateRevisions = await listStateRevisions(Object.keys(allowedRemoteRevisions));
      this.assertSessionContext(sessionContext);
      for (const plan of planLocalSnapshotRequests(localStateRevisions, allowedRemoteRevisions)) {
        const { space, member, permissions } = this.memberPermissionsForUser(plan.spaceId, sessionContext.userId);
        if (
          !space
          || !member
          || space.authorizationState === 'unconfirmed'
          || !permissions.includes('read')
          || !localSnapshotSourceAllowed(space, capabilityPayload.userId, sessionContext.userId)
        ) continue;
        const duplicate = Array.from(this.pendingLocalSnapshotRequests.values()).some((request) => (
          request.spaceId === plan.spaceId
          && request.sourceUserId === capabilityPayload.userId
          && request.sourceDeviceId === capabilityPayload.deviceId
          && Number(request.expiresAtMs || 0) > Date.now()
        ));
        if (duplicate) continue;
        const requestId = createId('lansnapshotrequest');
        const expiresAtMs = Date.now() + LOCAL_SNAPSHOT_REQUEST_TTL_MS;
        this.pendingLocalSnapshotRequests.set(requestId, {
          requestId,
          sessionId,
          spaceId: plan.spaceId,
          sourceUserId: capabilityPayload.userId,
          sourceDeviceId: capabilityPayload.deviceId,
          requesterStateRevision: plan.localStateRevision,
          requestedStateRevision: plan.remoteStateRevision,
          expiresAtMs
        });
        this.cleanupLocalSnapshotRequests();
        const body = await this.createSignedLocalControlBody('snapshot.request', {
          requestId,
          spaceId: plan.spaceId,
          requesterStateRevision: plan.localStateRevision,
          requestedStateRevision: plan.remoteStateRevision,
          expiresAt: new Date(expiresAtMs).toISOString()
        }, sessionContext);
        const result = await this.localTransport?.sendTo?.(sessionId, body);
        if (!Number(result?.delivered || 0)) this.pendingLocalSnapshotRequests.delete(requestId);
      }
      return true;
    }

    if (action === 'snapshot.request') {
      const requestId = String(payload.requestId || '').trim();
      const spaceId = String(payload.spaceId || '').trim();
      const requesterStateRevision = Math.max(0, Math.floor(Number(payload.requesterStateRevision || 0)));
      const requestedStateRevision = Math.max(0, Math.floor(Number(payload.requestedStateRevision || 0)));
      const expiresAtMs = Date.parse(String(payload.expiresAt || ''));
      const capabilityMembership = (capabilityPayload.memberships || []).find((candidate) => candidate?.spaceId === spaceId);
      const { space, member, permissions } = this.memberPermissionsForUser(spaceId, capabilityPayload.userId);
      if (
        !requestId
        || !spaceId
        || !sessionId
        || !Number.isFinite(expiresAtMs)
        || expiresAtMs <= Date.now()
        || expiresAtMs > Date.now() + LOCAL_SNAPSHOT_REQUEST_TTL_MS + 60_000
        || !capabilityMembership?.permissions?.includes('read')
        || !space
        || !member
        || space.authorizationState === 'unconfirmed'
        || !permissions.includes('read')
        || !localSnapshotSourceAllowed(space, sessionContext.userId, capabilityPayload.userId)
      ) {
        const error = new Error('Se rechazó una solicitud de reconstrucción local sin permisos confirmados.');
        error.code = 'P2P_SIN_SNAPSHOT_REQUEST_UNAUTHORIZED';
        dispatch('p2p:local-network', { state: 'rejected', error, peer: message.peer || null });
        return false;
      }
      if (this.servedLocalSnapshotRequests.has(requestId)) return true;
      this.servedLocalSnapshotRequests.set(requestId, expiresAtMs);
      this.cleanupLocalSnapshotRequests();
      try {
        return await this.sendLocalSnapshot(sessionId, {
          requestId,
          spaceId,
          requesterStateRevision,
          requestedStateRevision
        }, sessionContext);
      } catch (error) {
        this.servedLocalSnapshotRequests.delete(requestId);
        dispatch('p2p:local-network', { state: 'snapshot-error', error, peer: message.peer || null, spaceId });
        return false;
      }
    }

    if (action === 'lifecycle.purge.request') {
      const transactionId = String(payload.transactionId || '').trim();
      const spaceId = String(payload.spaceId || '').trim();
      const operationId = String(payload.operationId || '').trim();
      const sourceDeviceId = String(payload.sourceDeviceId || '').trim();
      const acknowledgePurge = async () => {
        const ack = await this.createSignedLocalControlBody('lifecycle.ack', {
          transactionId, action: 'purge', spaceId, operationId, sourceDeviceId
        }, sessionContext);
        await this.localTransport?.sendTo?.(sessionId, ack);
      };
      const tombstone = await this.matchingLocalLifecycleTombstone({
        transactionId, action: 'purge', spaceId, operationId, sourceDeviceId
      }, capabilityPayload, sessionContext);
      if (tombstone?.status === 'completed') {
        await acknowledgePurge();
        return true;
      }
      const { space, member, permissions } = this.memberPermissionsForUser(spaceId, sessionContext.userId);
      const sourceMember = (space?.members || []).find((candidate) => candidate?.userId === capabilityPayload.userId) || null;
      const localStateAuthorized = Boolean(
        space
        && space.authorizationState !== 'unconfirmed'
        && space.ownerUserId === capabilityPayload.userId
        && sourceMember?.role === 'owner'
        && member
        && permissions.includes('read')
      );
      const capabilityAuthorization = tombstone
        ? { authorized: true }
        : await this.localLifecycleCapabilityAuthorization(spaceId, capabilityPayload, 'purge', sessionContext)
          .catch(() => ({ authorized: false }));
      if (
        !transactionId || !spaceId || !operationId || !sessionId
        || sourceDeviceId !== capabilityPayload.deviceId
        || (!localStateAuthorized && capabilityAuthorization.authorized !== true)
      ) {
        const error = new Error('Se rechazó una eliminación local sin autoridad confirmada del propietario.');
        error.code = 'P2P_SIN_LIFECYCLE_UNAUTHORIZED';
        dispatch('p2p:local-network', { state: 'rejected', error, peer: message.peer || null, spaceId });
        return false;
      }
      if (!tombstone) {
        await this.rememberLocalLifecycleTombstone({
          transactionId,
          action: 'purge',
          spaceId,
          operationId,
          sourceUserId: capabilityPayload.userId,
          sourceDeviceId,
          status: 'prepared'
        }, sessionContext);
      }
      await this.fenceBootstrapResponses(sessionContext);
      const purge = await purgeLocalSpace(spaceId);
      await purgeSpaceCrypto(spaceId).catch(() => null);
      this.assertSessionContext(sessionContext);
      this.removeSpaceFromBootstrapState(spaceId);
      await this.rememberLocalLifecycleTombstone({
        transactionId,
        action: 'purge',
        spaceId,
        operationId,
        sourceUserId: capabilityPayload.userId,
        sourceDeviceId,
        status: 'completed'
      }, sessionContext);
      this.assertSessionContext(sessionContext);
      dispatch('p2p:space-deleted', { spaceId, source: 'lifecycle-local-network-remote', purge, pendingAuthoritativeDeletion: true });
      await acknowledgePurge();
      return true;
    }

    if (action === 'lifecycle.ack') {
      return this.acknowledgeLocalProjectLifecycle(payload, capabilityPayload, sessionContext);
    }
    return false;
  }

  async sendLocalSnapshot(sessionId = '', request = {}, sessionContext = this.captureSessionContext()) {
    this.assertSessionContext(sessionContext);
    const spaceId = String(request.spaceId || '').trim();
    const requestId = String(request.requestId || '').trim();
    const stateRevisions = await listStateRevisions([spaceId]);
    this.assertSessionContext(sessionContext);
    const localStateRevision = Math.max(0, Number(stateRevisions?.[spaceId] || 0));
    if (localStateRevision <= Number(request.requesterStateRevision || 0) || localStateRevision < Number(request.requestedStateRevision || 0)) {
      return false;
    }
    const localEntities = await listEntities(spaceId);
    this.assertSessionContext(sessionContext);
    const entities = canonicalLocalSnapshotEntities(localEntities);
    const entityStateRevision = entities.reduce((maximum, entity) => Math.max(
      maximum,
      Number(entity.stateRevision || entity.spaceSequence || 0)
    ), 0);
    const sourceStateRevision = Math.max(localStateRevision, entityStateRevision);
    const snapshotDigest = await sha256Hex(JSON.stringify(entities));
    let transportEntities = entities;
    let encryptionMetadata = {};
    if (this.spaceRequiresEncryption(spaceId)) {
      const activeKey = await getActiveSpaceKey(spaceId);
      if (!activeKey) {
        const error = new Error('Este dispositivo no tiene la clave activa para reconstruir el proyecto por red local.');
        error.code = 'P2P_SPACE_KEY_MISSING';
        throw error;
      }
      transportEntities = await encryptSnapshotEntities(spaceId, entities);
      encryptionMetadata = { encrypted: true, encryptionVersion: 1, keyId: activeKey.keyId };
    }
    this.assertSessionContext(sessionContext);
    const chunks = snapshotChunksByBytes(transportEntities, Math.min(this.eventMaxBytes, LOCAL_SNAPSHOT_EVENT_MAX_BYTES));
    if (chunks.length > this.snapshotMaxChunks) throw Object.assign(new Error('La reconstrucción local necesita demasiados fragmentos.'), { code: 'P2P_SNAPSHOT_TOO_LARGE' });
    const chunkByteCounts = chunks.map((chunk) => jsonByteLength(chunk));
    const snapshotByteCount = chunkByteCounts.reduce((total, bytes) => total + bytes, 0);
    if (snapshotByteCount > this.snapshotMaxBytes) throw Object.assign(new Error('La reconstrucción local supera el tamaño seguro.'), { code: 'P2P_SNAPSHOT_TOO_LARGE' });
    const operations = chunks.map((chunk, index) => ({
      operationId: `${requestId}:chunk:${index}`,
      type: 'snapshot.chunk',
      entityType: '__snapshot__',
      entityId: `${requestId}:${index}`,
      ...encryptionMetadata,
      payload: {
        requestId,
        chunkIndex: index,
        chunkCount: chunks.length,
        entityCount: entities.length,
        snapshotByteCount,
        chunkByteCount: chunkByteCounts[index],
        sourceStateRevision,
        snapshotDigest,
        entities: chunk
      }
    }));
    operations.push({
      operationId: `${requestId}:complete`,
      type: 'snapshot.complete',
      entityType: '__snapshot__',
      entityId: requestId,
      ...encryptionMetadata,
      payload: {
        requestId,
        chunkCount: chunks.length,
        entityCount: entities.length,
        snapshotByteCount,
        sourceStateRevision,
        snapshotDigest
      }
    });
    const estimatedTransferBytes = operations.reduce((total, operation) => total + jsonByteLength(operation) + SNAPSHOT_TRANSFER_EVENT_OVERHEAD_BYTES, 0);
    if (estimatedTransferBytes > this.snapshotTransferMaxBytes) throw Object.assign(new Error('La reconstrucción local completa supera el límite de transferencia.'), { code: 'P2P_SNAPSHOT_TOO_LARGE' });
    for (const operation of operations) {
      const body = await this.createSignedLocalSnapshotBody(spaceId, requestId, sourceStateRevision, operation, sessionContext);
      const result = await this.localTransport?.sendTo?.(sessionId, body);
      if (!Number(result?.delivered || 0)) {
        const error = new Error('La conexión local se cerró antes de completar la reconstrucción.');
        error.code = 'P2P_SIN_SNAPSHOT_DISCONNECTED';
        throw error;
      }
    }
    return true;
  }

  async handleLocalSnapshotPayload(message = {}, sessionContext = this.captureSessionContext()) {
    this.assertSessionContext(sessionContext);
    let verified;
    try {
      verified = await this.verifySignedLocalEnvelope(message, 'p2p.sin.snapshot', sessionContext);
    } catch (error) {
      dispatch('p2p:local-network', { state: 'rejected', error, peer: message.peer || null });
      return false;
    }
    const { capabilityPayload, signedPayload } = verified;
    this.cleanupLocalSnapshotRequests();
    const requestId = String(signedPayload.requestId || '').trim();
    const spaceId = String(signedPayload.spaceId || '').trim();
    const sourceStateRevision = Math.max(0, Number(signedPayload.sourceStateRevision || 0));
    const operation = signedPayload.operation || {};
    const pending = this.pendingLocalSnapshotRequests.get(requestId) || null;
    const capabilityMembership = (capabilityPayload.memberships || []).find((candidate) => candidate?.spaceId === spaceId);
    const { space, member, permissions } = this.memberPermissionsForUser(spaceId, capabilityPayload.userId);
    if (
      !pending
      || pending.expiresAtMs <= Date.now()
      || pending.sessionId !== String(message.sessionId || '').trim()
      || pending.spaceId !== spaceId
      || pending.sourceUserId !== capabilityPayload.userId
      || pending.sourceDeviceId !== capabilityPayload.deviceId
      || sourceStateRevision < pending.requestedStateRevision
      || String(operation.operationId || '').trim() !== String(signedPayload.operationId || '').trim()
      || !['snapshot.chunk', 'snapshot.complete'].includes(String(operation.type || '').trim())
      || String(operation?.payload?.requestId || '').trim() !== requestId
      || Number(operation?.payload?.sourceStateRevision || 0) !== sourceStateRevision
      || !capabilityMembership?.permissions?.includes('read')
      || !space
      || !member
      || space.authorizationState === 'unconfirmed'
      || !permissions.includes('read')
      || !localSnapshotSourceAllowed(space, capabilityPayload.userId, sessionContext.userId)
    ) {
      const error = new Error('Se rechazó un fragmento de reconstrucción local no solicitado o fuera de alcance.');
      error.code = 'P2P_SIN_SNAPSHOT_UNAUTHORIZED';
      dispatch('p2p:local-network', { state: 'rejected', error, peer: message.peer || null, spaceId });
      return false;
    }
    const event = {
      eventId: `lan_snapshot_${String(message.messageId || operation.operationId).replace(/[^a-zA-Z0-9._:-]/g, '_')}`,
      eventType: 'p2p.operation',
      deliverySequence: 1,
      spaceSequence: Math.max(1, sourceStateRevision),
      stateRevision: 0,
      spaceId,
      actorUserId: String(capabilityPayload.userId || '').trim(),
      sourceDeviceId: String(capabilityPayload.deviceId || '').trim(),
      operation,
      createdAt: String(signedPayload.createdAt || message.sentAt || new Date().toISOString()),
      localTransport: true
    };
    try {
      this.assertEncryptedTransportEvent(event);
      const decryptedEvent = await decryptOperationEvent(event);
      this.assertSessionContext(sessionContext);
      const result = await applyP2PEvent(decryptedEvent);
      this.assertSessionContext(sessionContext);
      dispatch('p2p:operation', { event: decryptedEvent, result, localTransport: true, snapshot: true });
      if (result?.snapshotIncomplete) {
        this.pendingLocalSnapshotRequests.delete(requestId);
        const error = new Error('La reconstrucción local llegó incompleta o no superó sus validaciones y fue descartada.');
        error.code = 'P2P_SIN_SNAPSHOT_INCOMPLETE';
        dispatch('p2p:local-network', { state: 'snapshot-error', error, peer: message.peer || null, spaceId });
        return false;
      }
      if (operation.type === 'snapshot.complete') {
        this.pendingLocalSnapshotRequests.delete(requestId);
        await resolveRecoveryRequirement(spaceId, sourceStateRevision);
        this.recoveryRequirements = await getRecoveryRequirements();
        dispatch('p2p:snapshot-complete', { event: decryptedEvent, result, localTransport: true });
        dispatch('p2p:local-network', { state: 'synchronized', spaceId, sourceStateRevision, peer: message.peer || null });
        dispatch('p2p:state', { state: this.bootstrapState, source: 'local-network-snapshot' });
      }
      return true;
    } catch (error) {
      if (operation.type === 'snapshot.complete') this.pendingLocalSnapshotRequests.delete(requestId);
      dispatch('p2p:local-network', { state: 'snapshot-error', error, peer: message.peer || null, spaceId });
      return false;
    }
  }

  async createSignedLocalOperationBody(request = {}, createdAt = new Date().toISOString(), sessionContext = this.captureSessionContext(), batch = null) {
    this.assertSessionContext(sessionContext);
    if (!isEntityOperationType(request?.operation?.type)) {
      const error = new Error('Este sobre local solo admite cambios durables de datos; la comparación de revisiones y los snapshots usan mensajes firmados separados.');
      error.code = 'P2P_SIN_OPERATION_UNSUPPORTED';
      throw error;
    }
    const capabilityPayload = await verifyP2PLocalCapability(this.localCapabilityAuthority, this.localCapability, {
      origin: window.location.origin,
      applicationId: P2P_APPLICATION_ID,
      userId: sessionContext.userId,
      deviceId: sessionContext.deviceId
    });
    this.assertSessionContext(sessionContext);
    const signedPayload = {
      schemaVersion: 1,
      type: 'p2p.sin.operation',
      origin: window.location.origin,
      applicationId: P2P_APPLICATION_ID,
      userId: sessionContext.userId,
      deviceId: sessionContext.deviceId,
      spaceId: String(request?.spaceId || '').trim(),
      operationId: String(request?.operation?.operationId || '').trim(),
      request,
      createdAt: String(createdAt || new Date().toISOString()),
      nonce: createId('lanop')
    };
    if (batch && typeof batch === 'object') {
      const batchId = String(batch.batchId || '').trim();
      const batchIndex = Number(batch.batchIndex);
      const batchSize = Number(batch.batchSize);
      if (
        !batchId
        || !Number.isInteger(batchIndex)
        || !Number.isInteger(batchSize)
        || batchSize < 2
        || batchSize > 8
        || batchIndex < 0
        || batchIndex >= batchSize
      ) {
        const error = new Error('El lote de red local contiene metadatos inválidos.');
        error.code = 'P2P_SIN_BATCH_INVALID';
        throw error;
      }
      signedPayload.batchId = batchId;
      signedPayload.batchIndex = batchIndex;
      signedPayload.batchSize = batchSize;
    }
    if (!signedPayload.spaceId || !signedPayload.operationId) throw new Error('La operación local no tiene una identidad durable válida.');
    const membership = (capabilityPayload.memberships || []).find((candidate) => candidate.spaceId === signedPayload.spaceId);
    if (!membership) {
      const error = new Error('La capacidad offline de este dispositivo no incluye el proyecto. Conéctate a memoriaBACKEND para renovarla.');
      error.code = 'P2P_SIN_CAPABILITY_SPACE_MISSING';
      throw error;
    }
    const signature = await signP2PLocalPayload(signedPayload);
    this.assertSessionContext(sessionContext);
    return {
      type: 'p2p.sin.signed-operation',
      capability: this.localCapability,
      signedPayload,
      signature
    };
  }

  async createSignedLocalOperationBatchBody(preparedEntries = [], batchId = '', sessionContext = this.captureSessionContext()) {
    this.assertSessionContext(sessionContext);
    const entries = Array.isArray(preparedEntries) ? preparedEntries.filter(Boolean) : [];
    const cleanBatchId = String(batchId || '').trim();
    if (!cleanBatchId || entries.length < 2 || entries.length > 8) {
      const error = new Error('El lote de red local debe contener entre dos y ocho operaciones y un batchId estable.');
      error.code = 'P2P_SIN_BATCH_INVALID';
      throw error;
    }
    const spaceId = String(entries[0]?.request?.spaceId || entries[0]?.outboxItem?.spaceId || '').trim();
    if (!spaceId || entries.some((entry) => String(entry?.request?.spaceId || entry?.outboxItem?.spaceId || '').trim() !== spaceId)) {
      const error = new Error('Todas las operaciones del lote de red local deben pertenecer al mismo proyecto.');
      error.code = 'P2P_SIN_BATCH_SCOPE_MISMATCH';
      throw error;
    }

    const signedEntries = [];
    for (let index = 0; index < entries.length; index += 1) {
      const entry = entries[index];
      const signed = await this.createSignedLocalOperationBody(
        entry.request,
        entry.outboxItem?.createdAt || entry.createdAt || new Date().toISOString(),
        sessionContext,
        { batchId: cleanBatchId, batchIndex: index, batchSize: entries.length }
      );
      this.assertSessionContext(sessionContext);
      signedEntries.push({ signedPayload: signed.signedPayload, signature: signed.signature });
    }

    return {
      schemaVersion: 1,
      type: 'p2p.sin.signed-batch',
      batchId: cleanBatchId,
      spaceId,
      batchSize: signedEntries.length,
      capability: this.localCapability,
      entries: signedEntries
    };
  }

  capabilityOperationAuthorized(capabilityPayload = {}, spaceId = '', operation = {}) {
    const membership = (Array.isArray(capabilityPayload?.memberships) ? capabilityPayload.memberships : [])
      .find((candidate) => candidate?.spaceId === String(spaceId || '').trim());
    return memberAllowsDurableOperation(membership || {}, membership || {}, operation);
  }

  memberPermissionsForUser(spaceId = '', userId = '') {
    const space = (this.bootstrapState.spaces || []).find((candidate) => candidate?.spaceId === String(spaceId || '').trim()) || null;
    const member = (space?.members || []).find((candidate) => candidate?.userId === String(userId || '').trim()) || null;
    return { space, member, permissions: Array.isArray(member?.permissions) ? member.permissions : [] };
  }

  localOperationAuthorized(spaceId = '', operation = {}, peer = {}) {
    const { space, member } = this.memberPermissionsForUser(spaceId, peer?.userId);
    if (!space || !member || space.authorizationState === 'unconfirmed') return false;
    return memberAllowsDurableOperation(space, member, operation);
  }

  async handleLocalTransportPayload(message = {}, sessionContext = this.captureSessionContext()) {
    this.assertSessionContext(sessionContext);
    const body = message?.body || {};
    if (body?.type === 'p2p.sin.signed-control') {
      return this.handleLocalControlPayload(message, sessionContext);
    }
    if (body?.type === 'p2p.sin.signed-snapshot') {
      return this.handleLocalSnapshotPayload(message, sessionContext);
    }
    if (body?.type === 'p2p.sin.signed-batch') {
      return this.handleLocalTransportBatchPayload(message, sessionContext);
    }
    if (body?.type !== 'p2p.sin.signed-operation') return false;
    let capabilityPayload;
    try {
      capabilityPayload = await verifyP2PLocalCapability(this.localCapabilityAuthority, body.capability, {
        origin: window.location.origin,
        applicationId: P2P_APPLICATION_ID
      });
      this.assertSessionContext(sessionContext);
      const signedPayload = body.signedPayload || {};
      const signatureValid = await verifyP2PLocalSignature(
        capabilityPayload.signingPublicKey,
        signedPayload,
        body.signature || ''
      );
      this.assertSessionContext(sessionContext);
      if (!signatureValid) throw Object.assign(new Error('La operación local no tiene una firma de dispositivo válida.'), { code: 'P2P_SIN_DEVICE_SIGNATURE_INVALID' });
      if (
        String(signedPayload.userId || '').trim() !== String(capabilityPayload.userId || '').trim()
        || String(signedPayload.deviceId || '').trim() !== String(capabilityPayload.deviceId || '').trim()
        || String(signedPayload.origin || '').trim().toLowerCase() !== window.location.origin.toLowerCase()
        || String(signedPayload.applicationId || '').trim() !== P2P_APPLICATION_ID
        || String(message.peer?.userId || '').trim() !== String(capabilityPayload.userId || '').trim()
        || String(message.peer?.deviceId || '').trim() !== String(capabilityPayload.deviceId || '').trim()
      ) {
        throw Object.assign(new Error('La identidad del canal local no coincide con la identidad certificada.'), { code: 'P2P_SIN_IDENTITY_MISMATCH' });
      }
    } catch (error) {
      dispatch('p2p:local-network', { state: 'rejected', error, peer: message.peer || null });
      return false;
    }
    const signedPayload = body.signedPayload || {};
    const request = signedPayload.request || {};
    const spaceId = String(request.spaceId || '').trim();
    const transportOperation = request.operation || {};
    const operationIdentityValid = spaceId
      && transportOperation?.operationId
      && String(signedPayload.spaceId || '').trim() === spaceId
      && String(signedPayload.operationId || '').trim() === String(transportOperation.operationId || '').trim()
      && (!request.deviceId || String(request.deviceId || '').trim() === String(capabilityPayload.deviceId || '').trim());
    const certifiedPeer = { userId: capabilityPayload.userId, deviceId: capabilityPayload.deviceId };
    const localLifecycle = request.localLifecycle && typeof request.localLifecycle === 'object' ? request.localLifecycle : null;
    const lifecycleAction = String(localLifecycle?.action || '').trim().toLowerCase();
    const lifecycleOperationType = lifecycleAction === 'restore'
      ? 'entity.restore'
      : lifecycleAction === 'trash'
        ? 'entity.trash'
        : '';
    const lifecycleIdentityValid = !localLifecycle || (
      Boolean(lifecycleOperationType)
      && String(localLifecycle.spaceId || '').trim() === spaceId
      && String(localLifecycle.operationId || '').trim() === String(transportOperation.operationId || '').trim()
      && String(localLifecycle.sourceDeviceId || '').trim() === String(capabilityPayload.deviceId || '').trim()
      && String(transportOperation.type || '').trim() === lifecycleOperationType
      && String(transportOperation.entityType || '').trim() === 'admin.project'
      && String(transportOperation.entityId || '').trim() === 'project'
    );
    const lifecycleTombstone = localLifecycle && lifecycleIdentityValid
      ? await this.matchingLocalLifecycleTombstone({
          transactionId: localLifecycle.transactionId,
          action: lifecycleAction,
          spaceId,
          operationId: transportOperation.operationId,
          sourceDeviceId: localLifecycle.sourceDeviceId
        }, capabilityPayload, sessionContext)
      : null;
    const acknowledgeLifecycle = async () => {
      const ack = await this.createSignedLocalControlBody('lifecycle.ack', {
        transactionId: String(localLifecycle?.transactionId || '').trim(),
        action: lifecycleAction,
        spaceId,
        operationId: String(transportOperation.operationId || '').trim(),
        sourceDeviceId: String(localLifecycle?.sourceDeviceId || '').trim()
      }, sessionContext);
      await this.localTransport?.sendTo?.(String(message.sessionId || '').trim(), ack);
    };
    const supersedingPurgeProof = localLifecycle && lifecycleIdentityValid && lifecycleAction === 'trash'
      ? await this.completedPurgeProofForSpace(spaceId, sessionContext)
      : null;
    const supersededTrashAuthorized = Boolean(
      supersedingPurgeProof
      && this.capabilityOperationAuthorized(capabilityPayload, spaceId, transportOperation)
    );
    if (operationIdentityValid && lifecycleIdentityValid
      && (lifecycleTombstone?.status === 'completed' || supersededTrashAuthorized)) {
      await acknowledgeLifecycle();
      return true;
    }
    const lifecycleSpace = (this.bootstrapState.spaces || []).find((candidate) => candidate?.spaceId === spaceId) || null;
    const localStateLifecycleAuthorized = Boolean(
      localLifecycle
      && lifecycleIdentityValid
      && lifecycleSpace?.ownerUserId === String(capabilityPayload.userId || '').trim()
    );
    const lifecycleCapabilityAuthorization = localLifecycle && lifecycleIdentityValid
      ? await this.localLifecycleCapabilityAuthorization(spaceId, capabilityPayload, lifecycleAction, sessionContext)
        .catch(() => ({ authorized: false }))
      : { authorized: false };
    const lifecycleAuthorized = !localLifecycle
      || localStateLifecycleAuthorized
      || lifecycleCapabilityAuthorization.authorized === true
      || Boolean(lifecycleTombstone);
    const localOperationAuthorized = this.localOperationAuthorized(spaceId, transportOperation, certifiedPeer)
      || (Boolean(localLifecycle) && lifecycleCapabilityAuthorization.authorized === true)
      || Boolean(lifecycleTombstone);
    if (
      !operationIdentityValid
      || !lifecycleIdentityValid
      || !lifecycleAuthorized
      || !this.capabilityOperationAuthorized(capabilityPayload, spaceId, transportOperation)
      || !localOperationAuthorized
    ) {
      const error = new Error('Se rechazó un cambio de red local porque el emisor no tiene permisos certificados y confirmados para ese proyecto.');
      error.code = 'P2P_SIN_UNAUTHORIZED_OPERATION';
      dispatch('p2p:local-network', { state: 'rejected', error, peer: message.peer || null });
      return false;
    }
    const event = {
      eventId: `lan_${String(message.messageId || transportOperation.operationId).replace(/[^a-zA-Z0-9._:-]/g, '_')}`,
      eventType: 'p2p.operation',
      deliverySequence: 0,
      spaceSequence: 0,
      spaceId,
      actorUserId: String(capabilityPayload.userId || '').trim(),
      sourceDeviceId: String(capabilityPayload.deviceId || '').trim(),
      operation: transportOperation,
      createdAt: String(signedPayload.createdAt || message.sentAt || new Date().toISOString()),
      localTransport: true
    };
    this.assertEncryptedTransportEvent(event);
    const decryptedEvent = await decryptOperationEvent(event);
    this.assertSessionContext(sessionContext);
    const relayedOperation = decryptedEvent.operation || {};
    if (!isEntityOperationType(relayedOperation.type)) {
      const error = new Error('La operación recibida por red local no es un cambio durable compatible.');
      error.code = 'P2P_SIN_OPERATION_UNSUPPORTED';
      dispatch('p2p:local-network', { state: 'rejected', error, peer: message.peer || null });
      return false;
    }
    const refreshedTransportOperation = this.spaceRequiresEncryption(spaceId)
      ? await encryptOperationForTransport(spaceId, relayedOperation)
      : relayedOperation;
    const relayedOutboxItem = {
      operationId: relayedOperation.operationId,
      spaceId,
      request: {
        deviceId: sessionContext.deviceId,
        spaceId,
        operation: refreshedTransportOperation,
        targetDeviceIds: [],
        includeSourceDevice: true
      },
      plainOperation: relayedOperation,
      createdAt: event.createdAt,
      attempts: 0,
      relayedFromLocalNetwork: true,
      originalSourceDeviceId: event.sourceDeviceId,
      originalActorUserId: event.actorUserId,
      localRelayEnvelope: {
        capability: body.capability,
        signedPayload: body.signedPayload,
        signature: body.signature
      }
    };
    const optimisticEvent = { ...decryptedEvent, optimistic: true, localTransport: true };
    if (localLifecycle && !lifecycleTombstone) {
      await this.rememberLocalLifecycleTombstone({
        transactionId: String(localLifecycle.transactionId || '').trim(),
        action: lifecycleAction,
        spaceId,
        operationId: relayedOperation.operationId,
        sourceUserId: capabilityPayload.userId,
        sourceDeviceId: String(localLifecycle.sourceDeviceId || '').trim(),
        status: 'prepared'
      }, sessionContext);
      this.assertSessionContext(sessionContext);
    }
    const result = localLifecycle
      ? await applyP2PEvent(optimisticEvent)
      : await enqueueOptimisticOperation(relayedOutboxItem, optimisticEvent);
    this.assertSessionContext(sessionContext);
    dispatch('p2p:operation', { event: optimisticEvent, result, localTransport: true, optimistic: true, lifecycleRemote: Boolean(localLifecycle) });
    dispatch('p2p:local-operation', { event: decryptedEvent, result, peer: message.peer || null, lifecycleRemote: Boolean(localLifecycle) });
    if (localLifecycle) {
      const rootAfter = await getEntity(spaceId, 'admin.project', 'project');
      this.assertSessionContext(sessionContext);
      const lifecycleStateApplied = lifecycleAction === 'restore'
        ? Boolean(rootAfter && !rootAfter.deleted && !String(rootAfter.value?.trashedAt || '').trim())
        : (!rootAfter || rootAfter.deleted || Boolean(String(rootAfter.value?.trashedAt || '').trim()));
      if (!lifecycleStateApplied) {
        const error = new Error(lifecycleAction === 'restore'
          ? 'La réplica local no pudo restaurar el proyecto de forma segura.'
          : 'La réplica local no pudo ubicar el proyecto en la papelera de forma segura.');
        error.code = 'P2P_SIN_LIFECYCLE_STATE_CONFLICT';
        dispatch('p2p:local-network', { state: 'rejected', error, peer: message.peer || null, spaceId });
        return false;
      }
      await this.rememberLocalLifecycleTombstone({
        transactionId: String(localLifecycle.transactionId || '').trim(),
        action: lifecycleAction,
        spaceId,
        operationId: relayedOperation.operationId,
        sourceUserId: capabilityPayload.userId,
        sourceDeviceId: String(localLifecycle.sourceDeviceId || '').trim(),
        status: 'completed'
      }, sessionContext);
      this.assertSessionContext(sessionContext);
      await acknowledgeLifecycle();
    } else {
      dispatch('p2p:outbox', { queued: true, operationId: relayedOperation.operationId, localNetworkRelay: true });
    }
    return true;
  }

  async handleLocalTransportBatchPayload(message = {}, sessionContext = this.captureSessionContext()) {
    this.assertSessionContext(sessionContext);
    const body = message?.body || {};
    const batchId = String(body.batchId || '').trim();
    const spaceId = String(body.spaceId || '').trim();
    const entries = Array.isArray(body.entries) ? body.entries.filter(Boolean) : [];
    const batchSize = Number(body.batchSize);
    if (
      body?.type !== 'p2p.sin.signed-batch'
      || Number(body.schemaVersion || 0) !== 1
      || !batchId
      || !spaceId
      || !Number.isInteger(batchSize)
      || batchSize < 2
      || batchSize > 8
      || entries.length !== batchSize
    ) {
      const error = new Error('Se rechazó un lote de red local incompleto o incompatible.');
      error.code = 'P2P_SIN_BATCH_INVALID';
      dispatch('p2p:local-network', { state: 'rejected', error, peer: message.peer || null });
      return false;
    }

    let capabilityPayload;
    try {
      capabilityPayload = await verifyP2PLocalCapability(this.localCapabilityAuthority, body.capability, {
        origin: window.location.origin,
        applicationId: P2P_APPLICATION_ID
      });
      this.assertSessionContext(sessionContext);
    } catch (error) {
      dispatch('p2p:local-network', { state: 'rejected', error, peer: message.peer || null });
      return false;
    }

    const preparedEntries = [];
    const operationIds = new Set();
    try {
      for (let index = 0; index < entries.length; index += 1) {
        const signedEntry = entries[index] || {};
        const signedPayload = signedEntry.signedPayload || {};
        const request = signedPayload.request || {};
        const transportOperation = request.operation || {};
        const operationId = String(transportOperation.operationId || '').trim();
        const signatureValid = await verifyP2PLocalSignature(
          capabilityPayload.signingPublicKey,
          signedPayload,
          signedEntry.signature || ''
        );
        this.assertSessionContext(sessionContext);
        if (!signatureValid) {
          throw Object.assign(new Error('Una operación del lote local no tiene una firma de dispositivo válida.'), { code: 'P2P_SIN_DEVICE_SIGNATURE_INVALID' });
        }
        if (
          String(signedPayload.userId || '').trim() !== String(capabilityPayload.userId || '').trim()
          || String(signedPayload.deviceId || '').trim() !== String(capabilityPayload.deviceId || '').trim()
          || String(signedPayload.origin || '').trim().toLowerCase() !== window.location.origin.toLowerCase()
          || String(signedPayload.applicationId || '').trim() !== P2P_APPLICATION_ID
          || String(message.peer?.userId || '').trim() !== String(capabilityPayload.userId || '').trim()
          || String(message.peer?.deviceId || '').trim() !== String(capabilityPayload.deviceId || '').trim()
          || String(request.spaceId || '').trim() !== spaceId
          || String(signedPayload.spaceId || '').trim() !== spaceId
          || String(signedPayload.operationId || '').trim() !== operationId
          || String(signedPayload.batchId || '').trim() !== batchId
          || Number(signedPayload.batchIndex) !== index
          || Number(signedPayload.batchSize) !== batchSize
          || (request.deviceId && String(request.deviceId || '').trim() !== String(capabilityPayload.deviceId || '').trim())
          || !operationId
          || operationIds.has(operationId)
        ) {
          throw Object.assign(new Error('La identidad, alcance u orden de una operación no coincide con el lote local certificado.'), { code: 'P2P_SIN_BATCH_MISMATCH' });
        }
        operationIds.add(operationId);
        const certifiedPeer = { userId: capabilityPayload.userId, deviceId: capabilityPayload.deviceId };
        if (
          !this.capabilityOperationAuthorized(capabilityPayload, spaceId, transportOperation)
          || !this.localOperationAuthorized(spaceId, transportOperation, certifiedPeer)
        ) {
          throw Object.assign(new Error('Se rechazó el lote local porque una de sus operaciones excede los permisos certificados o confirmados.'), { code: 'P2P_SIN_UNAUTHORIZED_OPERATION' });
        }

        const transportEvent = {
          eventId: `lan_${String(message.messageId || batchId).replace(/[^a-zA-Z0-9._:-]/g, '_')}_${index}`,
          eventType: 'p2p.operation',
          deliverySequence: 0,
          spaceSequence: 0,
          spaceId,
          batchId,
          batchIndex: index,
          batchSize,
          actorUserId: String(capabilityPayload.userId || '').trim(),
          sourceDeviceId: String(capabilityPayload.deviceId || '').trim(),
          operation: transportOperation,
          createdAt: String(signedPayload.createdAt || message.sentAt || new Date().toISOString()),
          localTransport: true
        };
        this.assertEncryptedTransportEvent(transportEvent);
        const decryptedEvent = await decryptOperationEvent(transportEvent);
        this.assertSessionContext(sessionContext);
        const relayedOperation = decryptedEvent.operation || {};
        if (!isEntityOperationType(relayedOperation.type)) {
          throw Object.assign(new Error('El lote recibido por red local contiene una operación durable incompatible.'), { code: 'P2P_SIN_OPERATION_UNSUPPORTED' });
        }
        const refreshedTransportOperation = this.spaceRequiresEncryption(spaceId)
          ? await encryptOperationForTransport(spaceId, relayedOperation)
          : relayedOperation;
        this.assertSessionContext(sessionContext);
        const optimisticEvent = {
          ...decryptedEvent,
          batchId,
          batchIndex: index,
          batchSize,
          optimistic: true,
          localTransport: true
        };
        const relayedOutboxItem = {
          operationId: relayedOperation.operationId,
          spaceId,
          batchId,
          batchIndex: index,
          batchSize,
          abortBatchOnFailure: true,
          request: {
            deviceId: sessionContext.deviceId,
            spaceId,
            operation: refreshedTransportOperation,
            targetDeviceIds: [],
            includeSourceDevice: true
          },
          plainOperation: relayedOperation,
          createdAt: transportEvent.createdAt,
          attempts: 0,
          relayedFromLocalNetwork: true,
          originalSourceDeviceId: transportEvent.sourceDeviceId,
          originalActorUserId: transportEvent.actorUserId,
          localRelayEnvelope: {
            capability: body.capability,
            signedPayload,
            signature: signedEntry.signature
          }
        };
        preparedEntries.push({ item: relayedOutboxItem, event: optimisticEvent, decryptedEvent });
      }

      const applied = await enqueueOptimisticOperationBatch(preparedEntries.map((entry) => ({
        item: entry.item,
        event: entry.event
      })));
      this.assertSessionContext(sessionContext);
      const results = Array.isArray(applied?.results) ? applied.results : [];
      preparedEntries.forEach((entry, index) => {
        dispatch('p2p:operation', {
          event: entry.event,
          result: results[index] || null,
          localTransport: true,
          optimistic: true,
          batchAtomic: true,
          batchId,
          batchIndex: index,
          batchSize
        });
        dispatch('p2p:local-operation', {
          event: entry.decryptedEvent,
          result: results[index] || null,
          peer: message.peer || null,
          batchAtomic: true,
          batchId,
          batchIndex: index,
          batchSize
        });
      });
      dispatch('p2p:operation-batch', {
        events: preparedEntries.map((entry) => entry.event),
        result: applied,
        batchId,
        batchSize,
        localTransport: true,
        optimistic: true
      });
      dispatch('p2p:outbox', {
        queued: true,
        batchId,
        operationIds: preparedEntries.map((entry) => entry.item.operationId),
        localNetworkRelay: true,
        batchAtomic: true
      });
      return true;
    } catch (error) {
      dispatch('p2p:local-network', { state: 'rejected', error, peer: message.peer || null, batchId });
      return false;
    }
  }

  async broadcastPreparedOperationToLocalNetwork(prepared = {}) {
    if (!this.sinBackendEnabled()) return { delivered: 0, peers: [] };
    const sessionContext = this.captureSessionContext();
    this.assertSessionContext(sessionContext);
    const transport = await this.ensureLocalTransport(sessionContext);
    if (!transport?.status?.().connected) return { delivered: 0, peers: transport?.status?.().peers || [] };
    const body = await this.createSignedLocalOperationBody(
      prepared.request,
      prepared.outboxItem?.createdAt || new Date().toISOString(),
      sessionContext
    );
    return transport.broadcast(body);
  }

  async broadcastPreparedOperationBatchToLocalNetwork(preparedEntries = [], batchId = '') {
    if (!this.sinBackendEnabled()) return { delivered: 0, peers: [] };
    const sessionContext = this.captureSessionContext();
    this.assertSessionContext(sessionContext);
    const transport = await this.ensureLocalTransport(sessionContext);
    if (!transport?.status?.().connected) return { delivered: 0, peers: transport?.status?.().peers || [] };
    const body = await this.createSignedLocalOperationBatchBody(preparedEntries, batchId, sessionContext);
    this.assertSessionContext(sessionContext);
    return transport.broadcast(body);
  }

  async flushOutboxToLocalNetwork() {
    if (!this.sinBackendEnabled() || !this.localTransport?.status?.().connected) return { delivered: 0, pending: 0 };
    const pending = await listOutbox();
    let delivered = 0;
    const processedOperationIds = new Set();
    const individualBatchFallbackIds = new Set();
    for (const item of pending) {
      if (item?.relayedFromLocalNetwork === true) continue;
      const operationId = String(item?.operationId || '').trim();
      if (!operationId || processedOperationIds.has(operationId)) continue;
      if (item?.lifecycleAction) {
        if (item.localLifecycleCompleted !== true) {
          const result = await this.startLocalProjectLifecycle(item, this.captureSessionContext());
          delivered += Number(result?.delivered || 0);
        }
        processedOperationIds.add(operationId);
        continue;
      }
      const atomicBatch = this.completeAtomicOutboxBatch(pending, item, individualBatchFallbackIds);
      if (atomicBatch.length) {
        const preparedEntries = atomicBatch.map((candidate) => ({
          request: candidate.request,
          outboxItem: candidate
        }));
        const result = await this.broadcastPreparedOperationBatchToLocalNetwork(preparedEntries, item.batchId);
        delivered += Number(result?.delivered || 0);
        atomicBatch.forEach((candidate) => processedOperationIds.add(String(candidate?.operationId || '').trim()));
        continue;
      }
      if (!item?.request?.spaceId || !item?.request?.operation) continue;
      const body = await this.createSignedLocalOperationBody(
        item.request,
        item.createdAt || new Date().toISOString(),
        this.captureSessionContext()
      );
      const result = await this.localTransport.broadcast(body);
      delivered += Number(result?.delivered || 0);
      processedOperationIds.add(operationId);
    }
    return { delivered, pending: pending.length };
  }

  async activateDeviceCryptoIdentity(userId = '', deviceId = this.deviceId) {
    const cleanUserId = String(userId || '').trim();
    const cleanDeviceId = String(deviceId || '').trim();
    if (!cleanUserId || !cleanDeviceId) throw new Error('No se pudo preparar la identidad criptográfica del dispositivo.');
    this.deviceId = cleanDeviceId;
    await setP2PCryptoContext(cleanUserId, cleanDeviceId);
    const [identity, signingIdentity] = await Promise.all([
      ensureDeviceEncryptionIdentity(),
      ensureDeviceSigningIdentity()
    ]);
    this.deviceEncryptionPublicKey = identity.publicKey;
    this.deviceSigningPublicKey = signingIdentity.publicKey;
    return { ...identity, signingPublicKey: signingIdentity.publicKey };
  }

  async restartWithFreshDeviceIdentity(error = null, options = {}) {
    if (!isDeviceIdentityConflict(error)) return false;
    if (!this.started || this.manualClose || this.stopPromise) return false;
    if (this.identityRecoveryPromise) {
      return this.identityRecoveryRestarting ? false : this.identityRecoveryPromise;
    }
    const currentUser = this.user ? { ...this.user } : null;
    const previousDeviceId = String(this.deviceId || '').trim();
    const userId = String(currentUser?.userId || '').trim();
    const recoverySessionToken = getSessionToken();
    if (!currentUser || !userId || !previousDeviceId || !recoverySessionToken) return false;
    const recoveryGeneration = ++this.identityRecoveryGeneration;

    const recovery = (async () => {
      const nextDeviceId = rotateStoredDeviceId(userId, previousDeviceId);
      if (!nextDeviceId || nextDeviceId === previousDeviceId) return false;
      await rebindLocalDeviceId(previousDeviceId, nextDeviceId);
      await updateServiceWorkerPushAccountBinding({
        action: 'set',
        userId,
        deviceId: nextDeviceId
      }).catch(() => ({ ok: false, changed: false }));
      dispatch('p2p:device-identity-rotated', {
        previousDeviceId,
        deviceId: nextDeviceId,
        reason: 'identity-conflict'
      });
      await this.stop({
        skipLeadershipWait: Boolean(options.skipLeadershipWait),
        preserveIdentityRecovery: true
      });
      if (recoveryGeneration !== this.identityRecoveryGeneration
        || getSessionToken() !== recoverySessionToken) return false;
      this.identityRecoveryRestarting = true;
      try {
        await this.start(currentUser);
      } finally {
        this.identityRecoveryRestarting = false;
      }
      return recoveryGeneration === this.identityRecoveryGeneration
        && getSessionToken() === recoverySessionToken;
    })();
    this.identityRecoveryPromise = recovery;
    try {
      return await recovery;
    } finally {
      if (this.identityRecoveryPromise === recovery) this.identityRecoveryPromise = null;
    }
  }

  tabStateRequiresSnapshotRecovery(state = this.bootstrapState) {
    return (Array.isArray(state?.spaces) ? state.spaces : []).some((space) => (
      space?.authorizationState === 'unconfirmed'
      && space?.authorizationPendingReason === 'replica_recovery'
    ));
  }

  broadcastTabState(state = this.bootstrapState, options = {}) {
    return this.tabCoordinator.broadcast('state', {
      state,
      replicaHealthOnly: options.replicaHealthOnly === true,
      authoritative: this.realtimeLeader === true && this.tabCoordinator.isLeader(),
      leaderToken: String(this.tabCoordinator.leadershipToken || '').trim(),
      responseToRequestId: String(options.responseToRequestId || '').trim().slice(0, 220),
      requiresSnapshotRecovery: this.tabStateRequiresSnapshotRecovery(state)
        || this.snapshotRecoveryRequired === true
    });
  }

  clearTabStateRequestTimer() {
    if (this.tabStateRequestTimer) window.clearTimeout(this.tabStateRequestTimer);
    this.tabStateRequestTimer = 0;
  }

  clearPendingTabStateRequest(requestId = '') {
    const cleanRequestId = String(requestId || '').trim();
    if (cleanRequestId && cleanRequestId !== this.pendingTabStateRequestId) return false;
    this.clearTabStateRequestTimer();
    this.pendingTabStateRequestId = '';
    this.pendingTabStateLeaderTabId = '';
    this.pendingTabStateLeaderToken = '';
    this.pendingTabStateRequestReason = '';
    this.pendingTabStateRequestAttempt = 0;
    return true;
  }

  pendingTabStateRequestDelay() {
    const exponent = Math.max(0, Math.min(4, this.pendingTabStateRequestAttempt - 1));
    return Math.min(TAB_STATE_REQUEST_RETRY_MAX_MS, TAB_STATE_REQUEST_RETRY_BASE_MS * (2 ** exponent));
  }

  sendPendingTabStateRequest(requestId = this.pendingTabStateRequestId) {
    const cleanRequestId = String(requestId || '').trim();
    if (!cleanRequestId || cleanRequestId !== this.pendingTabStateRequestId) return false;
    if (!this.started || this.manualClose || this.realtimeLeader || this.tabCoordinator.isLeader()) {
      this.clearPendingTabStateRequest(cleanRequestId);
      return false;
    }

    // Después de superar el TTL normal del lease local, se retira el destino
    // anterior para poder descubrir al líder vigente si también se perdió su
    // anuncio. Antes de ese umbral se conserva el cerco por término y pestaña.
    if (this.pendingTabStateRequestAttempt >= TAB_STATE_REQUEST_TARGETED_RETRY_LIMIT) {
      this.pendingTabStateLeaderTabId = '';
      this.pendingTabStateLeaderToken = '';
    }

    const sent = this.tabCoordinator.broadcast('state-request', {
      requestId: cleanRequestId,
      reason: String(this.pendingTabStateRequestReason || 'state-retry').trim().slice(0, 80),
      targetLeaderTabId: this.pendingTabStateLeaderTabId,
      targetLeaderToken: this.pendingTabStateLeaderToken,
      attempt: this.pendingTabStateRequestAttempt + 1
    });
    if (!sent) {
      this.clearPendingTabStateRequest(cleanRequestId);
      return false;
    }
    this.pendingTabStateRequestAttempt += 1;
    this.schedulePendingTabStateRequestRetry(cleanRequestId);
    return true;
  }

  schedulePendingTabStateRequestRetry(requestId = this.pendingTabStateRequestId) {
    const cleanRequestId = String(requestId || '').trim();
    this.clearTabStateRequestTimer();
    if (!cleanRequestId || cleanRequestId !== this.pendingTabStateRequestId) return false;
    const sessionContext = this.captureSessionContext();
    const delayMs = this.pendingTabStateRequestDelay();
    this.tabStateRequestTimer = window.setTimeout(() => {
      this.tabStateRequestTimer = 0;
      if (!this.isSessionContextCurrent(sessionContext)
        || cleanRequestId !== this.pendingTabStateRequestId) return;
      if (this.pendingTabStateRequestAttempt === TAB_STATE_REQUEST_RECOVERY_ATTEMPTS) {
        dispatch('p2p:connection', {
          state: 'disconnected',
          deviceId: sessionContext.deviceId,
          sharedTab: true
        });
        this.tabCoordinator.requestLeadership().catch(() => false);
      }
      this.sendPendingTabStateRequest(cleanRequestId);
    }, delayMs);
    return true;
  }

  requestTabState(reason = '', options = {}) {
    this.clearPendingTabStateRequest();
    const requestId = createId('tab_state_request');
    this.pendingTabStateRequestId = requestId;
    this.pendingTabStateLeaderTabId = String(options.expectedLeaderTabId || '').trim().slice(0, 180);
    this.pendingTabStateLeaderToken = String(options.expectedLeaderToken || '').trim().slice(0, 220);
    this.pendingTabStateRequestReason = String(reason || '').trim().slice(0, 80);
    this.pendingTabStateRequestAttempt = 0;
    return this.sendPendingTabStateRequest(requestId) ? requestId : '';
  }

  scheduleTabStateReconciliation(payload = {}, sessionContext = this.captureSessionContext()) {
    if (!this.isSessionContextCurrent(sessionContext) || !this.realtimeLeader || !this.tabCoordinator.isLeader()) return this.tabStateReconcileTask;
    this.tabStateReconcileRequested = true;
    this.tabStateReconcileForceSnapshots = this.tabStateReconcileForceSnapshots
      || payload.requiresSnapshotRecovery === true;
    if (this.tabStateReconcileRunning) return this.tabStateReconcileTask;

    this.tabStateReconcileRunning = true;
    const task = (async () => {
      while (this.tabStateReconcileRequested
        && this.isSessionContextCurrent(sessionContext)
        && this.realtimeLeader
        && this.tabCoordinator.isLeader()) {
        const requestSnapshots = this.tabStateReconcileForceSnapshots ? 'force' : false;
        this.tabStateReconcileRequested = false;
        this.tabStateReconcileForceSnapshots = false;
        try {
          await this.refreshBootstrap({ requestSnapshots });
          this.assertSessionContext(sessionContext);
        } catch (error) {
          if (this.isSessionContextChangedError(error) || !this.isSessionContextCurrent(sessionContext)) break;
          dispatch('p2p:bootstrap-deferred', {
            error,
            stage: 'tab-state-reconciliation'
          });
          break;
        }
      }
      return true;
    })().finally(() => {
      if (this.tabStateReconcileTask === task) {
        this.tabStateReconcileRunning = false;
        if (this.tabStateReconcileRequested
          && this.isSessionContextCurrent(sessionContext)
          && this.realtimeLeader
          && this.tabCoordinator.isLeader()) {
          this.scheduleTabStateReconciliation({}, sessionContext);
        }
      }
    });
    this.tabStateReconcileTask = task;
    return task;
  }

  bindTabRelays(sessionContext = this.captureSessionContext()) {
    this.unbindTabRelays();
    const addRelay = (eventName, handler) => {
      const listener = (event) => {
        if (!this.isSessionContextCurrent(sessionContext) || event.detail?.__p2pTabRelay === true) return;
        handler(event.detail || {});
      };
      window.addEventListener(eventName, listener);
      this.tabRelayHandlers.push([eventName, listener]);
    };

    addRelay('p2p:state', ({ state, replicaHealthOnly }) => {
      this.broadcastTabState(state, { replicaHealthOnly: replicaHealthOnly === true });
    });
    addRelay('p2p:space-deleted', ({ spaceId, source }) => {
      const cleanSpaceId = String(spaceId || '').trim();
      if (!cleanSpaceId) return;
      this.broadcastTabState(this.bootstrapState);
      this.tabCoordinator.broadcast('space-deleted', {
        spaceId: cleanSpaceId,
        source: String(source || 'shared-tab').trim().slice(0, 80)
      });
    });
    addRelay('p2p:access-revoked', ({ spaceIds, source }) => {
      const cleanSpaceIds = Array.from(new Set((Array.isArray(spaceIds) ? spaceIds : [])
        .map((spaceId) => String(spaceId || '').trim())
        .filter(Boolean)))
        .slice(0, 100);
      if (!cleanSpaceIds.length) return;
      this.broadcastTabState(this.bootstrapState);
      this.tabCoordinator.broadcast('access-revoked', {
        spaceIds: cleanSpaceIds,
        source: String(source || 'shared-tab').trim().slice(0, 80)
      });
    });
    addRelay('p2p:operation', ({ event, result, optimistic }) => {
      this.tabCoordinator.broadcast('operation', {
        event: this.relayableOperationEvent(event),
        result: {
          applied: result?.applied !== false,
          conflicts: Array.isArray(result?.conflicts) ? result.conflicts : []
        },
        optimistic: optimistic === true
      });
    });
    addRelay('p2p:outbox', () => {
      this.tabCoordinator.broadcast('outbox-ready', {});
    });
    addRelay('p2p:connection', ({ state, localOnly }) => {
      if (!this.realtimeLeader) return;
      this.tabCoordinator.broadcast('connection', { state, localOnly: localOnly === true });
    });
  }

  unbindTabRelays() {
    for (const [eventName, listener] of this.tabRelayHandlers) {
      window.removeEventListener(eventName, listener);
    }
    this.tabRelayHandlers = [];
  }

  relayableOperationEvent(event = {}) {
    return {
      eventId: String(event?.eventId || ''),
      eventType: String(event?.eventType || 'p2p.operation'),
      spaceId: String(event?.spaceId || ''),
      actorUserId: String(event?.actorUserId || ''),
      sourceDeviceId: String(event?.sourceDeviceId || ''),
      optimistic: event?.optimistic === true,
      operation: {
        operationId: String(event?.operation?.operationId || ''),
        type: String(event?.operation?.type || ''),
        entityType: String(event?.operation?.entityType || ''),
        entityId: String(event?.operation?.entityId || '')
      }
    };
  }

  removeSpaceFromBootstrapState(spaceId = '') {
    const cleanSpaceId = String(spaceId || '').trim();
    if (!cleanSpaceId) return false;
    const invitations = normalizeInvitationCollection(this.bootstrapState?.invitations || {});
    this.bootstrapState = {
      ...(this.bootstrapState || {}),
      spaces: (this.bootstrapState?.spaces || [])
        .filter((space) => space?.spaceId !== cleanSpaceId),
      invitations: {
        received: invitations.received.filter((invitation) => invitation?.spaceId !== cleanSpaceId),
        sent: invitations.sent.filter((invitation) => invitation?.spaceId !== cleanSpaceId)
      },
      replicaHealth: Object.fromEntries(Object.entries(this.bootstrapState?.replicaHealth || {})
        .filter(([spaceId]) => spaceId !== cleanSpaceId)),
      lifecycleTransactions: (Array.isArray(this.bootstrapState?.lifecycleTransactions)
        ? this.bootstrapState.lifecycleTransactions
        : []).filter((transaction) => String(transaction?.spaceId || '').trim() !== cleanSpaceId)
    };
    this.scheduleLifecycleFinalizationObserver();
    if (this.recoveryRequirements && typeof this.recoveryRequirements === 'object') {
      const nextRequirements = { ...this.recoveryRequirements };
      delete nextRequirements[cleanSpaceId];
      this.recoveryRequirements = nextRequirements;
      this.snapshotRecoveryRequired = Object.keys(nextRequirements).length > 0;
    }
    return true;
  }

  applyCommittedControlState({ spaces = [], invitations = [] } = {}, options = {}) {
    const committedSpaces = (Array.isArray(spaces) ? spaces : []).filter((space) => String(space?.spaceId || '').trim());
    const committedInvitations = (Array.isArray(invitations) ? invitations : [])
      .filter((invitation) => String(invitation?.invitationId || '').trim());

    for (const space of committedSpaces) {
      const authorizationState = space.authorizationState === 'unconfirmed' ? 'unconfirmed' : 'confirmed';
      const committedSpace = { ...space, authorizationState };
      if (authorizationState === 'confirmed') {
        delete committedSpace.authorizationPendingReason;
        delete committedSpace.authorizationUnconfirmedAt;
      } else {
        committedSpace.authorizationPendingReason = String(
          committedSpace.authorizationPendingReason || 'replica_recovery'
        ).trim();
        committedSpace.authorizationUnconfirmedAt = String(
          committedSpace.authorizationUnconfirmedAt || new Date().toISOString()
        ).trim();
      }
      this.rememberAuthoritativeSpace(committedSpace);
    }

    this.bootstrapState = {
      ...(this.bootstrapState || {}),
      invitations: mergeCommittedInvitationState(
        this.bootstrapState?.invitations || {},
        committedInvitations,
        this.user || {}
      )
    };

    if (options.dispatch !== false) {
      dispatch('p2p:state', {
        state: this.bootstrapState,
        source: String(options.source || 'control-commit').trim().slice(0, 80)
      });
    }
    return this.bootstrapState;
  }

  lifecycleAudit(stage = '', transaction = {}, error = null, options = {}) {
    const detail = {
      stage: String(stage || '').trim().slice(0, 100),
      transactionId: String(transaction?.transactionId || '').trim(),
      action: String(transaction?.action || '').trim(),
      spaceId: String(transaction?.spaceId || '').trim(),
      operationId: String(transaction?.operationId || '').trim(),
      status: String(transaction?.status || '').trim(),
      completed: Math.max(0, Number(transaction?.completed || 0)),
      confirmed: Math.max(0, Number(transaction?.confirmed || 0)),
      released: Math.max(0, Number(transaction?.released || 0)),
      total: Math.max(0, Number(transaction?.total || 0)),
      remaining: Math.max(0, Number(transaction?.remaining || 0)),
      backendRetryExhausted: transaction?.retryExhausted === true,
      attempt: Math.max(0, Number(options.attempt || 0)),
      maxAttempts: Math.max(1, Number(options.maxAttempts || LIFECYCLE_FINALIZATION_MAX_ATTEMPTS)),
      retryable: options.retryable === true,
      source: String(options.source || '').trim().slice(0, 80),
      deviceId: String(this.deviceId || '').trim(),
      online: typeof navigator === 'undefined' ? true : navigator.onLine !== false,
      error: error ? {
        name: String(error?.name || 'Error'),
        code: String(error?.code || ''),
        status: Math.max(0, Number(error?.status || 0)),
        message: String(error?.message || 'No se pudo completar la acción crítica.').slice(0, 800)
      } : null,
      at: new Date().toISOString(),
      terminal: options.terminal === true,
      previousStatePreserved: options.previousStatePreserved === true,
      localCommitApplied: options.localCommitApplied === true
    };
    const logger = detail.terminal ? console.error : console.warn;
    logger('[SemillaP2P][LIFECYCLE_AUDIT]', detail);
    dispatch('p2p:lifecycle-audit', detail);
    return detail;
  }

  async finalizeLifecycleFromEvent(transaction = {}, nestedEvent = {}, sessionContext = this.captureSessionContext(), source = 'realtime') {
    let localCommitApplied = false;
    try {
      this.assertSessionContext(sessionContext);
      this.assertEncryptedTransportEvent(nestedEvent);
      const decryptedEvent = await decryptOperationEvent(nestedEvent);
      this.assertSessionContext(sessionContext);
      await this.applyDecryptedOperationEvent(decryptedEvent, sessionContext);
      localCommitApplied = true;
      this.assertSessionContext(sessionContext);
      const operationId = String(decryptedEvent.operation?.operationId || transaction.operationId || '').trim();
      const completion = await apiPost('/api/p2p/lifecycle/complete', {
        transactionId: transaction.transactionId,
        deviceId: sessionContext.deviceId
      }, { maxAttempts: 1, audit: false });
      this.assertSessionContext(sessionContext);
      if (operationId) await removeOutbox(operationId).catch(() => null);
      this.assertSessionContext(sessionContext);
      const completedTransaction = completion?.transaction
        ? { ...completion.transaction, role: 'source', status: 'completed' }
        : { ...transaction, status: 'completed' };
      this.lifecycleFinalizationFailures.delete(String(transaction?.transactionId || '').trim());
      this.rememberLifecycleTransaction(completedTransaction, { remove: true, observe: false });
      dispatch('p2p:lifecycle-completed', {
        transaction: completedTransaction,
        operationEvent: decryptedEvent,
        source
      });
      return { completed: true, transaction: completedTransaction, operationEvent: decryptedEvent };
    } catch (error) {
      if (localCommitApplied && error && typeof error === 'object') error.p2pLocalCommitApplied = true;
      throw error;
    }
  }

  lifecycleFinalizeEventMissingError(transaction = {}, source = '') {
    const error = new Error('La coordinación llegó a lista, pero el backend no devolvió el evento autoritativo necesario para aplicar la acción en este dispositivo.');
    error.code = 'P2P_LIFECYCLE_FINALIZE_EVENT_MISSING';
    error.status = 503;
    error.retryable = true;
    error.transactionId = String(transaction?.transactionId || '').trim();
    error.operationId = String(transaction?.operationId || '').trim();
    error.spaceId = String(transaction?.spaceId || '').trim();
    error.lifecycleSource = String(source || '').trim().slice(0, 80);
    return error;
  }

  rememberLifecycleTerminalState(transaction = {}, error = null, options = {}) {
    const localCommitApplied = options.localCommitApplied === true || transaction?.localCommitApplied === true;
    const terminalStatus = localCommitApplied ? 'completion-pending' : 'failed';
    const failedTransaction = {
      ...transaction,
      status: terminalStatus,
      retryExhausted: true,
      attempts: Math.max(1, Number(options.attempt || transaction?.attempts || LIFECYCLE_FINALIZATION_MAX_ATTEMPTS)),
      failedAt: new Date().toISOString(),
      lastErrorCode: String(error?.code || ''),
      lastErrorStatus: Math.max(0, Number(error?.status || 0)),
      localCommitApplied
    };
    this.rememberLifecycleTransaction(failedTransaction, { observe: false });
    return failedTransaction;
  }

  rememberLifecycleTransaction(transaction = {}, options = {}) {
    const normalizedTransaction = normalizeLifecycleTransactionProgress(transaction);
    const transactionId = String(normalizedTransaction?.transactionId || '').trim();
    if (!transactionId) return null;
    const current = Array.isArray(this.bootstrapState?.lifecycleTransactions)
      ? this.bootstrapState.lifecycleTransactions
      : [];
    const previous = current.find((item) => String(item?.transactionId || '').trim() === transactionId) || null;
    let rememberedTransaction = normalizedTransaction;
    const previousStatus = String(previous?.status || '').trim();
    const incomingStatus = String(normalizedTransaction?.status || '').trim();
    if (
      previous
      && (
        (previousStatus === 'ready' && incomingStatus === 'waiting')
        || (['failed', 'completion-pending'].includes(previousStatus) && ['waiting', 'ready'].includes(incomingStatus))
      )
    ) {
      rememberedTransaction = { ...normalizedTransaction, ...previous, transactionId };
    }
    const next = current.filter((item) => String(item?.transactionId || '').trim() !== transactionId);
    if (options.remove === true || rememberedTransaction.status === 'completed') this.lifecycleFinalizationFailures.delete(transactionId);
    if (options.remove !== true && rememberedTransaction.status !== 'completed') next.push({ ...rememberedTransaction });
    this.bootstrapState = { ...(this.bootstrapState || {}), lifecycleTransactions: next };
    dispatch('p2p:state', { state: this.bootstrapState, lifecycleOnly: true });
    if (options.observe !== false) {
      const isRecoverable = String(rememberedTransaction?.role || '').trim() === 'source'
        && ['waiting', 'ready'].includes(String(rememberedTransaction?.status || '').trim());
      const wasRecoverable = String(previous?.role || '').trim() === 'source'
        && ['waiting', 'ready'].includes(String(previous?.status || '').trim());
      const becameRecoverable = isRecoverable && !wasRecoverable;
      const becameReady = String(rememberedTransaction?.status || '').trim() === 'ready' && previousStatus !== 'ready';
      if (becameRecoverable || becameReady) this.lifecycleFinalizationObserverAttempt = 0;
      this.scheduleLifecycleFinalizationObserver({ immediate: becameRecoverable || becameReady });
    }
    return rememberedTransaction;
  }

  recoverableLifecycleFinalizations() {
    const activeSpaceIds = new Set((Array.isArray(this.bootstrapState?.spaces) ? this.bootstrapState.spaces : [])
      .map((space) => String(space?.spaceId || '').trim())
      .filter(Boolean));
    return recoverableSourceLifecycleTransactions(this.bootstrapState?.lifecycleTransactions || [])
      .filter((transaction) => activeSpaceIds.has(transaction.spaceId))
      .filter((transaction) => Math.max(0, Number(this.lifecycleFinalizationFailures.get(transaction.transactionId) || 0)) < LIFECYCLE_FINALIZATION_MAX_ATTEMPTS);
  }

  readyLifecycleFinalizations() {
    return this.recoverableLifecycleFinalizations()
      .filter((transaction) => String(transaction?.status || '').trim() === 'ready');
  }

  clearLifecycleFinalizationObserver(options = {}) {
    if (this.lifecycleFinalizationObserverTimer) window.clearTimeout(this.lifecycleFinalizationObserverTimer);
    this.lifecycleFinalizationObserverTimer = 0;
    if (options.resetAttempt !== false) this.lifecycleFinalizationObserverAttempt = 0;
  }

  scheduleLifecycleFinalizationObserver(options = {}, sessionContext = this.captureSessionContext()) {
    const recoverableTransactions = this.recoverableLifecycleFinalizations();
    if (
      !recoverableTransactions.length
      || !this.started
      || this.manualClose
      || !this.realtimeLeader
      || !this.isSessionContextCurrent(sessionContext)
    ) {
      this.clearLifecycleFinalizationObserver();
      return false;
    }
    if (this.lifecycleFinalizationObserverPromise) return true;
    const immediate = options.immediate === true;
    if (this.lifecycleFinalizationObserverTimer) {
      if (!immediate) return true;
      window.clearTimeout(this.lifecycleFinalizationObserverTimer);
      this.lifecycleFinalizationObserverTimer = 0;
    }
    const delay = immediate ? 0 : lifecycleFinalizationObserverDelay(this.lifecycleFinalizationObserverAttempt);
    this.lifecycleFinalizationObserverTimer = window.setTimeout(() => {
      this.lifecycleFinalizationObserverTimer = 0;
      this.runLifecycleFinalizationObserver(sessionContext).catch((error) => {
        if (!this.isSessionContextChangedError(error)) {
          dispatch('p2p:error', { error, stage: 'lifecycle-finalization-observer' });
        }
      });
    }, delay);
    return true;
  }

  async runLifecycleFinalizationObserver(sessionContext = this.captureSessionContext()) {
    if (this.lifecycleFinalizationObserverPromise) return this.lifecycleFinalizationObserverPromise;
    this.clearLifecycleFinalizationObserver({ resetAttempt: false });
    const recoverableTransactions = this.recoverableLifecycleFinalizations();
    if (
      !recoverableTransactions.length
      || !this.realtimeLeader
      || !this.isSessionContextCurrent(sessionContext)
    ) {
      this.clearLifecycleFinalizationObserver();
      return false;
    }
    const observerTask = (async () => {
      for (const transaction of recoverableTransactions) {
        this.assertSessionContext(sessionContext);
        if (!this.realtimeLeader) break;
        try {
          const response = await apiPost('/api/p2p/lifecycle/resume', {
            transactionId: transaction.transactionId,
            deviceId: sessionContext.deviceId
          }, { maxAttempts: 1, audit: false });
          this.assertSessionContext(sessionContext);
          const resumedTransaction = normalizeLifecycleTransactionProgress(response?.lifecycle || transaction);
          if (resumedTransaction?.status === 'completed') {
            this.lifecycleFinalizationFailures.delete(transaction.transactionId);
            this.rememberLifecycleTransaction(resumedTransaction, { remove: true, observe: false });
          } else if (response?.lifecycleFinalizeEvent && ['trash', 'restore'].includes(String(resumedTransaction?.action || transaction.action || '').trim())) {
            await this.finalizeLifecycleFromEvent(resumedTransaction, response.lifecycleFinalizeEvent, sessionContext, 'observer-resume');
          } else if (
            String(resumedTransaction?.status || '').trim() === 'ready'
            && ['trash', 'restore'].includes(String(resumedTransaction?.action || transaction.action || '').trim())
          ) {
            throw this.lifecycleFinalizeEventMissingError(resumedTransaction, 'observer-resume');
          } else {
            this.lifecycleFinalizationFailures.delete(transaction.transactionId);
            const remembered = this.rememberLifecycleTransaction(resumedTransaction, { observe: false });
            dispatch('p2p:lifecycle-progress', { transaction: remembered, source: 'observer-resume' });
            if (remembered?.retryExhausted === true) {
              this.lifecycleAudit('replica-confirmation-retry-exhausted', remembered, null, {
                attempt: Math.max(0, Number(remembered.attempts || 0)),
                maxAttempts: Math.max(1, Number(remembered.maxAttempts || LIFECYCLE_FINALIZATION_MAX_ATTEMPTS)),
                retryable: false,
                terminal: false,
                source: 'observer',
                previousStatePreserved: false,
                localCommitApplied: false
              });
            }
          }
        } catch (error) {
          if (this.isSessionContextChangedError(error)) throw error;
          const retryable = this.isRetryableTransportError(error);
          const transactionId = String(transaction?.transactionId || '').trim();
          const attempt = Math.max(0, Number(this.lifecycleFinalizationFailures.get(transactionId) || 0)) + 1;
          this.lifecycleFinalizationFailures.set(transactionId, attempt);
          const terminal = !retryable || attempt >= LIFECYCLE_FINALIZATION_MAX_ATTEMPTS;
          const localCommitApplied = error?.p2pLocalCommitApplied === true || transaction?.localCommitApplied === true;
          this.lifecycleAudit('finalization-resume-failed', transaction, error, {
            attempt,
            maxAttempts: LIFECYCLE_FINALIZATION_MAX_ATTEMPTS,
            retryable,
            terminal,
            source: 'observer',
            previousStatePreserved: !localCommitApplied,
            localCommitApplied
          });
          dispatch('p2p:lifecycle-resume-deferred', {
            transaction,
            error,
            observer: true,
            retryable,
            attempt,
            maxAttempts: LIFECYCLE_FINALIZATION_MAX_ATTEMPTS,
            terminal
          });
          if (terminal) {
            const failedTransaction = this.rememberLifecycleTerminalState(transaction, error, {
              attempt,
              localCommitApplied
            });
            dispatch('p2p:lifecycle-retry-exhausted', {
              transaction: failedTransaction,
              error,
              attempt,
              maxAttempts: LIFECYCLE_FINALIZATION_MAX_ATTEMPTS,
              previousStatePreserved: !localCommitApplied,
              localCommitApplied
            });
          }
        }
      }
      return true;
    })();

    this.lifecycleFinalizationObserverPromise = observerTask;
    try {
      return await observerTask;
    } finally {
      this.lifecycleFinalizationObserverPromise = null;
      const observerCanContinue = this.isSessionContextCurrent(sessionContext) && this.realtimeLeader;
      const remaining = observerCanContinue ? this.recoverableLifecycleFinalizations() : [];
      if (!remaining.length) {
        this.clearLifecycleFinalizationObserver();
      } else {
        this.lifecycleFinalizationObserverAttempt = Math.min(8, this.lifecycleFinalizationObserverAttempt + 1);
        this.scheduleLifecycleFinalizationObserver({}, sessionContext);
      }
    }
  }

  lifecycleTransactionFromControl(event = {}) {
    const data = event.data || {};
    return {
      schemaVersion: 1,
      transactionId: String(data.transactionId || '').trim(),
      action: String(data.action || '').trim(),
      status: String(data.status || '').trim(),
      role: String(data.sourceDeviceId || event.sourceDeviceId || '').trim() === this.deviceId ? 'source' : 'target',
      spaceId: String(data.spaceId || event.spaceId || '').trim(),
      sourceDeviceId: String(data.sourceDeviceId || event.sourceDeviceId || '').trim(),
      operationId: String(data.operationId || '').trim(),
      completed: Math.max(0, Number(data.completed || 0)),
      confirmed: Math.max(0, Number(data.confirmed || 0)),
      released: Math.max(0, Number(data.released || 0)),
      total: Math.max(0, Number(data.total || 0)),
      remaining: Math.max(0, Number(data.remaining || 0)),
      attempts: Math.max(0, Number(data.attempts || 0)),
      maxAttempts: Math.max(1, Number(data.maxAttempts || LIFECYCLE_FINALIZATION_MAX_ATTEMPTS)),
      retryExhausted: data.retryExhausted === true,
      updatedAt: String(data.updatedAt || event.createdAt || new Date().toISOString())
    };
  }

  handleTabMessage(message = {}, sessionContext = this.captureSessionContext()) {
    if (!this.isSessionContextCurrent(sessionContext)) return;
    const type = String(message.type || '');
    const payload = message.payload || {};
    if (type === 'state-request') {
      if (!this.realtimeLeader || !this.tabCoordinator.isLeader()) return;
      const targetLeaderTabId = String(payload.targetLeaderTabId || '').trim();
      const targetLeaderToken = String(payload.targetLeaderToken || '').trim();
      const currentLeaderTabId = String(this.tabCoordinator.tabId || '').trim();
      const currentLeaderToken = String(this.tabCoordinator.leadershipToken || '').trim();
      if ((targetLeaderTabId && targetLeaderTabId !== currentLeaderTabId)
        || (targetLeaderToken && targetLeaderToken !== currentLeaderToken)) return;
      this.broadcastTabState(this.bootstrapState, {
        responseToRequestId: String(payload.requestId || '').trim().slice(0, 220)
      });
      this.tabCoordinator.broadcast('connection', {
        state: this.eventSource?.readyState === EventSource.OPEN ? 'connected' : 'connecting'
      });
      return;
    }
    if (type === 'leader-active') {
      const announcedLeaderTabId = String(payload.tabId || message.senderTabId || '').trim();
      const announcedLeaderToken = String(message.leaderToken || payload.leadershipToken || '').trim();
      const recipientIsLeader = this.realtimeLeader && this.tabCoordinator.isLeader();
      // El anuncio solo dispara una lectura correlacionada y dirigida al término
      // anunciado: nunca reemplaza por sí mismo la autoridad activa.
      if (!recipientIsLeader && announcedLeaderTabId) {
        this.requestTabState('leader-announced', {
          expectedLeaderTabId: announcedLeaderTabId,
          expectedLeaderToken: announcedLeaderToken
        });
      }
      return;
    }
    if (type === 'state') {
      const decision = classifyTabStateRelay(message, {
        recipientIsLeader: this.realtimeLeader && this.tabCoordinator.isLeader(),
        activeLeaderTabId: this.activeLeaderTabId,
        activeLeaderToken: this.activeLeaderToken,
        activeLeaderMessageAt: this.activeLeaderMessageAt,
        pendingStateRequestId: this.pendingTabStateRequestId,
        pendingExpectedLeaderTabId: this.pendingTabStateLeaderTabId,
        pendingExpectedLeaderToken: this.pendingTabStateLeaderToken
      });
      if (decision.action === 'reconcile') {
        this.scheduleTabStateReconciliation(payload, sessionContext);
        return;
      }
      if (decision.action === 'request') {
        this.requestTabState('leader-term-mismatch', {
          expectedLeaderTabId: decision.expectedLeaderTabId || '',
          expectedLeaderToken: decision.expectedLeaderToken || ''
        });
        return;
      }
      if (decision.action !== 'apply') return;
      this.activeLeaderTabId = decision.leaderTabId;
      this.activeLeaderToken = decision.leaderToken || '';
      this.activeLeaderMessageAt = decision.leaderMessageAt;
      if (decision.responseToRequestId
        && decision.responseToRequestId === this.pendingTabStateRequestId) {
        this.clearPendingTabStateRequest(decision.responseToRequestId);
      }
      this.bootstrapState = payload.state;
      dispatch('p2p:state', { state: this.bootstrapState, replicaHealthOnly: payload.replicaHealthOnly === true, __p2pTabRelay: true });
      return;
    }
    if (type === 'space-deleted') {
      const cleanSpaceId = String(payload.spaceId || '').trim();
      if (!cleanSpaceId) return;
      this.removeSpaceFromBootstrapState(cleanSpaceId);
      dispatch('p2p:space-deleted', {
        spaceId: cleanSpaceId,
        source: String(payload.source || 'shared-tab').trim().slice(0, 80),
        sharedTab: true,
        __p2pTabRelay: true
      });
      return;
    }
    if (type === 'access-revoked') {
      const cleanSpaceIds = Array.from(new Set((Array.isArray(payload.spaceIds) ? payload.spaceIds : [])
        .map((spaceId) => String(spaceId || '').trim())
        .filter(Boolean)))
        .slice(0, 100);
      if (!cleanSpaceIds.length) return;
      for (const spaceId of cleanSpaceIds) this.removeSpaceFromBootstrapState(spaceId);
      dispatch('p2p:access-revoked', {
        spaceIds: cleanSpaceIds,
        source: String(payload.source || 'shared-tab').trim().slice(0, 80),
        sharedTab: true,
        __p2pTabRelay: true
      });
      return;
    }
    if (type === 'operation' && payload.event?.spaceId) {
      dispatch('p2p:operation', {
        event: payload.event,
        result: payload.result || {},
        optimistic: payload.optimistic === true,
        __p2pTabRelay: true
      });
      return;
    }
    if (type === 'connection' && !this.realtimeLeader) {
      dispatch('p2p:connection', {
        state: payload.state || 'connecting',
        deviceId: sessionContext.deviceId,
        sharedTab: true,
        __p2pTabRelay: true
      });
      return;
    }
    if (type === 'outbox-ready' && this.realtimeLeader) {
      this.flushOutbox().catch((error) => {
        if (!this.isSessionContextChangedError(error)) dispatch('p2p:error', { error, stage: 'outbox-tab-relay' });
      });
    }
  }

  closeRealtimeForFollower(sessionContext = this.captureSessionContext()) {
    if (!this.isSessionContextCurrent(sessionContext)) return;
    this.clearLocalCapabilityRefreshTimer();
    this.clearLifecycleFinalizationObserver();
    if (this.retryTimer) window.clearTimeout(this.retryTimer);
    this.clearServerRecoveryTimer();
    if (this.ackTimer) window.clearTimeout(this.ackTimer);
    if (this.replicaHealthTimer) window.clearTimeout(this.replicaHealthTimer);
    if (this.snapshotRecoveryTimer) window.clearTimeout(this.snapshotRecoveryTimer);
    this.retryTimer = 0;
    this.ackTimer = 0;
    this.replicaHealthTimer = 0;
    this.pendingReplicaHealthSpaceIds.clear();
    this.replicaHealthConvergenceAttempts.clear();
    this.replicaHealthRecoveryCooldownUntil.clear();
    this.replicaHealthRecoveryPromise = null;
    this.pendingAckReplicaSpaceIds.clear();
    this.highestPendingAck = 0;
    this.ackGeneration += 1;
    this.ackPromise = null;
    this.snapshotRecoveryTimer = 0;
    this.snapshotRecoveryDueAt = 0;
    this.openPromise = null;
    if (this.eventSource) this.eventSource.close();
    this.eventSource = null;
    dispatch('p2p:connection', {
      state: 'connecting',
      deviceId: sessionContext.deviceId,
      sharedTab: true
    });
    this.requestTabState('became-follower');
  }

  queueLeadershipChange(isLeader, sessionContext = this.captureSessionContext()) {
    this.realtimeLeader = Boolean(isLeader);
    if (this.realtimeLeader) {
      this.activeLeaderTabId = String(this.tabCoordinator.tabId || '').trim();
      this.activeLeaderToken = String(this.tabCoordinator.leadershipToken || '').trim();
      this.activeLeaderMessageAt = Date.now();
      this.clearPendingTabStateRequest();
    } else if (this.activeLeaderTabId === String(this.tabCoordinator.tabId || '').trim()) {
      this.activeLeaderTabId = '';
      this.activeLeaderToken = '';
      this.activeLeaderMessageAt = 0;
    }
    if (!this.tabCoordinationReady || !this.isSessionContextCurrent(sessionContext)) return;
    this.leadershipTask = this.leadershipTask.then(async () => {
      if (!this.isSessionContextCurrent(sessionContext)) return;
      if (!this.realtimeLeader) {
        this.closeRealtimeForFollower(sessionContext);
        await this.stopLocalTransport();
        return;
      }
      try {
        await this.ensureLocalTransport(sessionContext);
        this.assertSessionContext(sessionContext);
        await this.refreshBootstrap({ requestSnapshots: 'new-device' });
        this.assertSessionContext(sessionContext);
        if (!this.realtimeLeader) return;
        await this.flushOutbox();
        this.assertSessionContext(sessionContext);
        if (!this.realtimeLeader) return;
        await this.openRealtime();
        this.assertSessionContext(sessionContext);
        this.scheduleReplicaHealthRefresh(this.readableSpaceIds());
        await this.registerExistingPushSubscription().catch((error) => {
          if (this.isSessionContextChangedError(error)) throw error;
          return false;
        });
      } catch (error) {
        if (isDeviceIdentityConflict(error)) {
          const recovered = await this.restartWithFreshDeviceIdentity(error, { skipLeadershipWait: true }).catch(() => false);
          if (recovered) return;
        }
        if (!this.isSessionContextChangedError(error) && this.isSessionContextCurrent(sessionContext)) {
          dispatch('p2p:error', { error, stage: 'tab-leadership' });
        }
      }
    });
  }

  captureSessionContext() {
    return Object.freeze({
      generation: this.sessionGeneration,
      userId: String(this.user?.userId || '').trim(),
      deviceId: String(this.deviceId || '').trim(),
      sessionToken: getSessionToken()
    });
  }

  isSessionContextCurrent(context = {}) {
    return Boolean(
      this.started
      && Number(context.generation) === this.sessionGeneration
      && String(context.userId || '').trim() === String(this.user?.userId || '').trim()
      && String(context.deviceId || '').trim() === String(this.deviceId || '').trim()
      && String(context.sessionToken || '') === getSessionToken()
    );
  }

  createSessionContextChangedError() {
    const error = new Error('La operación pertenece a una sesión anterior y fue descartada para proteger los datos de la cuenta actual.');
    error.code = 'P2P_SESSION_CONTEXT_CHANGED';
    error.sessionContextChanged = true;
    return error;
  }

  isSessionContextChangedError(error = null) {
    return Boolean(error?.sessionContextChanged || error?.code === 'P2P_SESSION_CONTEXT_CHANGED' || isSessionChangedError(error));
  }

  assertSessionContext(context = {}) {
    if (!this.isSessionContextCurrent(context)) throw this.createSessionContextChangedError();
    return context;
  }

  isKeyAuthorityRetryableError(error = null) {
    return ['P2P_KEY_STALE', 'P2P_KEY_AUTHORITY_PENDING', 'P2P_KEY_ROTATION_REQUIRED', 'P2P_BATCH_KEY_MISMATCH'].includes(String(error?.code || '').trim().toUpperCase());
  }

  isSpaceLocalOutboxBlocker(error = null) {
    return [
      'P2P_AUTHORIZATION_UNCONFIRMED',
      'P2P_KEY_STALE',
      'P2P_KEY_AUTHORITY_PENDING',
      'P2P_KEY_ROTATION_REQUIRED',
      'P2P_KEY_AUTHORITY_STALE_RESPONSE',
      'P2P_KEY_AUTHORITY_CONFLICT',
      'P2P_SPACE_KEY_MISSING',
      'P2P_OUTBOX_PLAINTEXT_MISSING',
      'P2P_KEY_EPOCH_STALE',
      'P2P_KEY_EPOCH_CONFLICT'
    ].includes(String(error?.code || '').trim().toUpperCase());
  }

  clearServerRecoveryTimer(options = {}) {
    if (this.serverRetryTimer) window.clearTimeout(this.serverRetryTimer);
    this.serverRetryTimer = 0;
    this.serverRetryDueAt = 0;
    this.serverRetryStage = '';
    if (options.resetAttempt !== false) this.serverRetryAttempt = 0;
  }

  scheduleServerRecovery(error = null, stage = 'transport-retry') {
    const rateLimitCode = String(error?.code || '').trim().toUpperCase();
    const serverDirected = Number(error?.retryAfterSeconds || 0) > 0
      || ['P2P_BOOTSTRAP_RATE_LIMITED', 'P2P_PUBLISH_RATE_LIMITED', 'P2P_CONTROL_RATE_LIMITED'].includes(rateLimitCode);
    const rateLimited = Number(error?.status || 0) === 429 && serverDirected;
    if (
      !this.isRetryableTransportError(error)
      || this.manualClose
      || !this.started
      || !getSessionToken()
    ) return false;
    const sessionContext = this.captureSessionContext();
    if (!this.isSessionContextCurrent(sessionContext)) return false;

    const attempt = Math.min(6, Math.max(0, Number(this.serverRetryAttempt || 0)));
    const delay = serverRecoveryDelayMilliseconds(error, attempt);
    const dueAt = Date.now() + delay;

    if (this.serverRetryTimer) {
      // Conserva siempre el intento ya programado que ocurrirá antes. Antes se hacía
      // la comparación al revés y un error posterior podía retrasar una recuperación
      // que ya estaba agendada.
      if (this.serverRetryDueAt > 0 && this.serverRetryDueAt <= dueAt) return true;
      window.clearTimeout(this.serverRetryTimer);
    }

    this.serverRetryDueAt = dueAt;
    this.serverRetryStage = String(stage || (rateLimited ? 'rate-limit' : 'transport-retry')).slice(0, 180);
    if (!rateLimited) this.serverRetryAttempt = Math.min(7, attempt + 1);
    dispatch('p2p:connection', {
      // Tras tres fallos transitorios consecutivos seguimos reintentando, pero ya no
      // presentamos un "Conectando…" indefinido. `disconnected` conserva el ciclo
      // automático y permite a la UI mostrar un estado degradado/reintentando.
      state: !rateLimited && attempt >= 3 ? 'disconnected' : 'connecting',
      reason: rateLimited ? 'rate-limit' : 'transport-retry',
      deviceId: sessionContext.deviceId,
      retryAfterSeconds: Math.ceil(delay / 1000),
      retryAt: dueAt,
      stage: this.serverRetryStage
    });

    this.serverRetryTimer = window.setTimeout(() => {
      this.serverRetryTimer = 0;
      this.serverRetryDueAt = 0;
      this.serverRetryStage = '';
      if (!this.isSessionContextCurrent(sessionContext)) return;
      // Si el navegador está realmente offline, el evento `online` reanudará el ciclo.
      // No quemamos batería con temporizadores mientras no existe conectividad.
      if (navigator.onLine === false) return;
      this.recoverOnline().catch((recoveryError) => {
        if (this.isSessionContextChangedError(recoveryError)) return;
        if (!this.scheduleServerRecovery(recoveryError, 'transport-retry')) {
          dispatch('p2p:error', { error: recoveryError, stage: 'transport-retry' });
        }
      });
    }, delay);
    return true;
  }

  isRetryableTransportError(error = null) {
    const status = Number(error?.status || 0);
    return this.isKeyAuthorityRetryableError(error)
      || !status
      || status >= 500
      || [401, 408, 425, 429].includes(status);
  }

  isPermanentOutboxRejection(error = null) {
    if (this.isKeyAuthorityRetryableError(error)) return false;
    const status = Number(error?.status || 0);
    return status >= 400 && status < 500 && ![401, 408, 425, 429].includes(status);
  }

  async recoverPlainOutboxOperation(item = {}, sessionContext = this.captureSessionContext()) {
    this.assertSessionContext(sessionContext);
    const operationId = String(item?.operationId || item?.request?.operation?.operationId || '').trim();
    const storedPlain = item?.plainOperation;
    if (storedPlain && String(storedPlain.operationId || '').trim() === operationId) {
      return {
        ...storedPlain,
        encrypted: false,
        encryptionVersion: 0,
        keyId: ''
      };
    }
    const transportOperation = item?.request?.operation || {};
    const spaceId = String(item?.spaceId || item?.request?.spaceId || '').trim();
    if (!operationId
      || !spaceId
      || !isEntityOperationType(transportOperation.type)
      || !transportOperation.entityType
      || !transportOperation.entityId) return null;
    const entity = await getEntity(spaceId, transportOperation.entityType, transportOperation.entityId);
    this.assertSessionContext(sessionContext);
    const pending = (Array.isArray(entity?.pendingOperations) ? entity.pendingOperations : [])
      .find((entry) => String(entry?.operation?.operationId || entry?.operationId || '').trim() === operationId);
    const operation = pending?.operation || pending || null;
    if (!operation) return null;
    return {
      ...operation,
      encrypted: false,
      encryptionVersion: 0,
      keyId: ''
    };
  }

  async refreshOutboxEncryption(item = {}, sessionContext = this.captureSessionContext()) {
    this.assertSessionContext(sessionContext);
    const spaceId = String(item?.spaceId || item?.request?.spaceId || '').trim();
    if (!spaceId || !this.spaceRequiresEncryption(spaceId)) return null;
    await this.refreshBootstrap({ requestSnapshots: false });
    this.assertSessionContext(sessionContext);
    const activeKey = await this.ensureCurrentSpaceKey(spaceId, { requestIfMissing: true });
    this.assertSessionContext(sessionContext);
    const plainOperation = await this.recoverPlainOutboxOperation(item, sessionContext);
    if (!plainOperation) {
      const error = new Error('No se pudo recuperar la edición local necesaria para volver a cifrar la operación pendiente.');
      error.code = 'P2P_OUTBOX_PLAINTEXT_MISSING';
      error.status = 409;
      error.spaceId = spaceId;
      throw error;
    }
    const transportOperation = await encryptOperationForTransport(spaceId, plainOperation);
    this.assertSessionContext(sessionContext);
    const refreshedItem = {
      ...item,
      spaceId,
      plainOperation,
      request: {
        ...(item.request || {}),
        deviceId: sessionContext.deviceId,
        spaceId,
        operation: transportOperation
      },
      attempts: Math.max(0, Number(item.attempts || 0)) + 1,
      keyRefreshAt: new Date().toISOString(),
      keyId: String(activeKey?.keyId || transportOperation.keyId || '').trim(),
      keyEpoch: Math.max(0, Number(activeKey?.keyEpoch || 0))
    };
    await enqueueOutbox(refreshedItem);
    this.assertSessionContext(sessionContext);
    dispatch('p2p:outbox-key-refreshed', {
      operationId: refreshedItem.operationId,
      spaceId,
      keyId: refreshedItem.keyId,
      keyEpoch: refreshedItem.keyEpoch
    });
    return refreshedItem;
  }

  canReadSpace(spaceId = '') {
    const cleanSpaceId = String(spaceId || '').trim();
    const userId = String(this.user?.userId || '').trim();
    const space = (this.bootstrapState.spaces || []).find((candidate) => candidate?.spaceId === cleanSpaceId);
    const member = (space?.members || []).find((candidate) => candidate?.userId === userId);
    return Boolean(space && member && Array.isArray(member.permissions) && member.permissions.includes('read'));
  }

  isSpaceAuthorizationUnconfirmed(spaceId = '') {
    const cleanSpaceId = String(spaceId || '').trim();
    const space = (this.bootstrapState.spaces || []).find((candidate) => candidate?.spaceId === cleanSpaceId);
    return Boolean(space && space.authorizationState === 'unconfirmed');
  }

  isSpaceReplicaRecoveryPending(spaceId = '') {
    const cleanSpaceId = String(spaceId || '').trim();
    const space = (this.bootstrapState.spaces || []).find((candidate) => candidate?.spaceId === cleanSpaceId);
    return Boolean(
      space
      && space.authorizationState === 'unconfirmed'
      && space.authorizationPendingReason === 'replica_recovery'
    );
  }

  isSpaceAuthorizationConfirmed(spaceId = '') {
    const cleanSpaceId = String(spaceId || '').trim();
    const space = (this.bootstrapState.spaces || []).find((candidate) => candidate?.spaceId === cleanSpaceId);
    return Boolean(space && !this.isSpaceAuthorizationUnconfirmed(cleanSpaceId));
  }

  assertSpaceAuthorizationConfirmed(spaceId = '') {
    const cleanSpaceId = String(spaceId || '').trim();
    if (this.isSpaceAuthorizationConfirmed(cleanSpaceId)) return true;
    const error = new Error('La copia local se conservó, pero el backend todavía no puede confirmar la membresía. El proyecto permanece en modo de recuperación y no enviará cambios hasta restablecer su autorización.');
    error.code = 'P2P_AUTHORIZATION_UNCONFIRMED';
    error.status = 409;
    error.spaceId = cleanSpaceId;
    throw error;
  }

  spaceRequiresEncryption(spaceId = '') {
    const cleanSpaceId = String(spaceId || '').trim();
    const space = (this.bootstrapState.spaces || []).find((candidate) => candidate?.spaceId === cleanSpaceId);
    return Math.max(0, Number(space?.encryptionVersion || 0)) >= 1;
  }

  spaceEncryptionAuthority(spaceId = '') {
    const cleanSpaceId = String(spaceId || '').trim();
    const space = (this.bootstrapState.spaces || []).find((candidate) => candidate?.spaceId === cleanSpaceId) || null;
    return {
      space,
      keyId: String(space?.activeEncryptionKeyId || '').trim(),
      keyEpoch: Math.max(0, Number(space?.encryptionKeyEpoch || 0)),
      rotationRequired: space?.encryptionRotationRequired === true
    };
  }

  rememberAuthoritativeSpace(space = null) {
    if (!space?.spaceId) return null;
    const spaces = Array.isArray(this.bootstrapState.spaces) ? this.bootstrapState.spaces : [];
    const current = spaces.find((candidate) => candidate?.spaceId === space.spaceId) || null;
    const incomingEpoch = Math.max(0, Number(space.encryptionKeyEpoch || 0));
    const currentEpoch = Math.max(0, Number(current?.encryptionKeyEpoch || 0));
    const incomingKeyId = String(space.activeEncryptionKeyId || '').trim();
    const currentKeyId = String(current?.activeEncryptionKeyId || '').trim();
    if (incomingEpoch > 0 && !incomingKeyId) return current;
    if (current && (currentEpoch > incomingEpoch
      || (currentEpoch === incomingEpoch && currentKeyId && incomingKeyId && currentKeyId !== incomingKeyId))) {
      return current;
    }
    let remembered = space;
    if (current) {
      const currentUpdatedAt = Date.parse(current.updatedAt || '') || 0;
      const incomingUpdatedAt = Date.parse(space.updatedAt || '') || 0;
      remembered = incomingUpdatedAt >= currentUpdatedAt
        ? { ...current, ...space }
        : { ...space, ...current };
      remembered.encryptionAuthorityVersion = Math.max(
        0,
        Number(current.encryptionAuthorityVersion || 0),
        Number(space.encryptionAuthorityVersion || 0)
      );
      remembered.activeEncryptionKeyId = incomingKeyId || currentKeyId;
      remembered.encryptionKeyEpoch = incomingEpoch;
      remembered.encryptionRotationRequired = Boolean(remembered.encryptionRotationRequired);
      remembered.encryptionRotationRequiredAt = String(remembered.encryptionRotationRequiredAt || '').trim();
    }
    if (remembered.authorizationState === 'unconfirmed') {
      remembered.authorizationPendingReason = String(
        remembered.authorizationPendingReason || 'membership_unconfirmed'
      ).trim();
      remembered.authorizationUnconfirmedAt = String(
        remembered.authorizationUnconfirmedAt || new Date().toISOString()
      ).trim();
    } else {
      delete remembered.authorizationPendingReason;
      delete remembered.authorizationUnconfirmedAt;
    }
    const others = spaces.filter((candidate) => candidate?.spaceId !== space.spaceId);
    this.bootstrapState.spaces = [...others, remembered];
    return remembered;
  }


  completeAtomicOutboxBatch(pending = [], queuedItem = {}, individualBatchFallbackIds = new Set()) {
    const batchId = String(queuedItem?.batchId || '').trim();
    const batchSize = Math.max(0, Number(queuedItem?.batchSize || 0));
    if (!batchId
      || individualBatchFallbackIds.has(batchId)
      || !Number.isInteger(batchSize)
      || batchSize < 2
      || batchSize > 8
      || queuedItem?.abortBatchOnFailure === false) return [];

    const spaceId = String(queuedItem?.spaceId || queuedItem?.request?.spaceId || '').trim();
    const candidates = (Array.isArray(pending) ? pending : [])
      .filter((candidate) => String(candidate?.batchId || '').trim() === batchId)
      .sort((left, right) => Math.max(0, Number(left?.batchIndex || 0)) - Math.max(0, Number(right?.batchIndex || 0)));
    if (candidates.length !== batchSize) return [];

    const valid = candidates.every((candidate, index) => {
      const operation = candidate?.request?.operation || {};
      const candidateSpaceId = String(candidate?.spaceId || candidate?.request?.spaceId || '').trim();
      return candidateSpaceId === spaceId
        && Math.max(0, Number(candidate?.batchIndex || 0)) === index
        && Math.max(0, Number(candidate?.batchSize || 0)) === batchSize
        && candidate?.abortBatchOnFailure !== false
        && candidate?.request?.includeSourceDevice === true
        && !(candidate?.request?.targetDeviceIds || []).length
        && isEntityOperationType(operation.type);
    });
    return valid ? candidates : [];
  }

  async refreshOutboxBatchEncryption(items = [], sessionContext = this.captureSessionContext()) {
    this.assertSessionContext(sessionContext);
    const normalized = Array.isArray(items) ? items.filter(Boolean) : [];
    if (normalized.length < 2) return [];
    const spaceId = String(normalized[0]?.spaceId || normalized[0]?.request?.spaceId || '').trim();
    if (!spaceId || normalized.some((item) => String(item?.spaceId || item?.request?.spaceId || '').trim() !== spaceId)) {
      throw new Error('El lote pendiente contiene espacios incompatibles.');
    }
    if (!this.spaceRequiresEncryption(spaceId)) return normalized;

    await this.refreshBootstrap({ requestSnapshots: false });
    this.assertSessionContext(sessionContext);
    const activeKey = await this.ensureCurrentSpaceKey(spaceId, { requestIfMissing: true });
    this.assertSessionContext(sessionContext);
    const refreshedItems = [];
    for (const item of normalized) {
      const plainOperation = await this.recoverPlainOutboxOperation(item, sessionContext);
      if (!plainOperation) {
        const error = new Error('No se pudo recuperar una edición local necesaria para volver a cifrar el lote pendiente.');
        error.code = 'P2P_OUTBOX_PLAINTEXT_MISSING';
        error.status = 409;
        error.spaceId = spaceId;
        throw error;
      }
      const transportOperation = await encryptOperationForTransport(spaceId, plainOperation);
      this.assertSessionContext(sessionContext);
      refreshedItems.push({
        ...item,
        spaceId,
        plainOperation,
        request: {
          ...(item.request || {}),
          deviceId: sessionContext.deviceId,
          spaceId,
          operation: transportOperation
        },
        attempts: Math.max(0, Number(item.attempts || 0)) + 1,
        keyRefreshAt: new Date().toISOString(),
        keyId: String(activeKey?.keyId || transportOperation.keyId || '').trim(),
        keyEpoch: Math.max(0, Number(activeKey?.keyEpoch || 0))
      });
    }
    await enqueueOutboxBatch(refreshedItems);
    this.assertSessionContext(sessionContext);
    for (const item of refreshedItems) {
      dispatch('p2p:outbox-key-refreshed', {
        operationId: item.operationId,
        batchId: String(item.batchId || '').trim(),
        spaceId,
        keyId: item.keyId,
        keyEpoch: item.keyEpoch
      });
    }
    return refreshedItems;
  }

  async advanceSpaceKeyAuthority(spaceId = '', keyId = '', keyEpoch = 0) {
    const authority = this.spaceEncryptionAuthority(spaceId);
    if (!authority.space) return null;
    const cleanKeyId = String(keyId || '').trim();
    const cleanEpoch = Math.max(0, Number(keyEpoch || 0));
    if (!cleanKeyId || cleanEpoch < 1) return authority.space;
    const remembered = this.rememberAuthoritativeSpace({
      ...authority.space,
      encryptionAuthorityVersion: Math.max(1, Number(authority.space.encryptionAuthorityVersion || 0)),
      activeEncryptionKeyId: cleanKeyId,
      encryptionKeyEpoch: cleanEpoch
    });
    if (remembered?.activeEncryptionKeyId === cleanKeyId
      && Math.max(0, Number(remembered.encryptionKeyEpoch || 0)) === cleanEpoch) {
      await saveSpaces([remembered]);
    }
    return remembered;
  }

  async activateAuthoritativeSpaceKey(spaceId = '', keyId = '', expectedKeyId = '') {
    const sessionContext = this.captureSessionContext();
    this.assertSessionContext(sessionContext);
    const data = await apiPost('/api/p2p/crypto/key-activate', {
      deviceId: sessionContext.deviceId,
      spaceId,
      keyId,
      expectedKeyId
    });
    this.assertSessionContext(sessionContext);
    await this.fenceBootstrapResponses(sessionContext);
    const responseEpoch = Math.max(0, Number(data.space?.encryptionKeyEpoch || 0));
    const remembered = data.space ? this.rememberAuthoritativeSpace(data.space) : null;
    if (!remembered
      || String(remembered.activeEncryptionKeyId || '').trim() !== String(keyId || '').trim()
      || Math.max(0, Number(remembered.encryptionKeyEpoch || 0)) !== responseEpoch) {
      const error = new Error('La respuesta de activación quedó obsoleta frente a una rotación más reciente del proyecto.');
      error.code = 'P2P_KEY_AUTHORITY_STALE_RESPONSE';
      error.status = 409;
      error.spaceId = String(spaceId || '').trim();
      throw error;
    }
    this.assertSessionContext(sessionContext);
    await saveSpaces([remembered]);
    this.assertSessionContext(sessionContext);
    await activateSpaceKey(spaceId, keyId, { keyEpoch: responseEpoch });
    this.assertSessionContext(sessionContext);
    return { ...data, space: remembered };
  }

  async requestSpaceKeyAndWait(spaceId = '', keyId = '', options = {}) {
    const cleanSpaceId = String(spaceId || '').trim();
    const cleanKeyId = String(keyId || '').trim();
    if (!cleanSpaceId || !cleanKeyId) return { recovered: false, requested: false };
    if (await hasSpaceKey(cleanSpaceId, cleanKeyId)) return { recovered: true, requested: false };

    const sessionContext = options.sessionContext || this.captureSessionContext();
    this.assertSessionContext(sessionContext);
    const waitMs = Math.max(250, Number(options.waitMs || MISSING_SPACE_KEY_RECOVERY_WAIT_MS));

    return new Promise((resolve, reject) => {
      let settled = false;
      let timer = 0;
      let requested = false;

      const cleanup = () => {
        window.removeEventListener('p2p:key-received', onKeyReceived);
        if (timer) window.clearTimeout(timer);
      };
      const finish = (result, error = null) => {
        if (settled) return;
        settled = true;
        cleanup();
        if (error) reject(error);
        else resolve(result);
      };
      const verifyRecovered = async () => {
        try {
          this.assertSessionContext(sessionContext);
          const recovered = await hasSpaceKey(cleanSpaceId, cleanKeyId);
          this.assertSessionContext(sessionContext);
          if (recovered) finish({ recovered: true, requested });
          return recovered;
        } catch (error) {
          finish(null, error);
          return false;
        }
      };
      const onKeyReceived = (event) => {
        if (String(event?.detail?.spaceId || '').trim() !== cleanSpaceId) return;
        if (String(event?.detail?.keyId || '').trim() !== cleanKeyId) return;
        verifyRecovered();
      };

      window.addEventListener('p2p:key-received', onKeyReceived);
      timer = window.setTimeout(() => finish({ recovered: false, requested, timedOut: requested }), waitMs);

      (async () => {
        try {
          requested = await this.requestSpaceKey(cleanSpaceId, cleanKeyId, { force: true });
          this.assertSessionContext(sessionContext);
          if (await verifyRecovered()) return;
          if (!requested) finish({ recovered: false, requested: false });
        } catch (error) {
          if (this.isSessionContextChangedError?.(error)) {
            finish(null, error);
            return;
          }
          finish({ recovered: false, requested, requestError: error });
        }
      })();
    });
  }

  async recoverMissingSpaceKey(spaceId = '', keyId = '', options = {}) {
    const cleanSpaceId = String(spaceId || '').trim();
    const cleanKeyId = String(keyId || '').trim();
    if (!cleanSpaceId || !cleanKeyId) return null;
    const recoveryScope = `${cleanSpaceId}|${cleanKeyId}`;
    const existingRecovery = this.missingSpaceKeyRecoveryPromises.get(recoveryScope);
    if (existingRecovery) return existingRecovery;

    const recovery = (async () => {
      const sessionContext = this.captureSessionContext();
      this.assertSessionContext(sessionContext);
      const attempts = [];

      const attemptRequest = async (candidateKeyId) => {
        const result = await this.requestSpaceKeyAndWait(cleanSpaceId, candidateKeyId, { sessionContext });
        attempts.push({
          keyId: candidateKeyId,
          requested: result?.requested === true,
          recovered: result?.recovered === true,
          timedOut: result?.timedOut === true,
          requestError: result?.requestError || null
        });
        if (!result?.recovered) return null;
        const authority = this.spaceEncryptionAuthority(cleanSpaceId);
        return activateSpaceKey(cleanSpaceId, candidateKeyId, { keyEpoch: authority.keyEpoch });
      };

      let recovered = await attemptRequest(cleanKeyId);
      if (recovered) {
        dispatch('p2p:key-self-healed', { spaceId: cleanSpaceId, keyId: cleanKeyId, strategy: 'authorized-replica' });
        return recovered;
      }

      if (navigator.onLine && getSessionToken()) {
        try {
          await this.refreshBootstrap({ requestSnapshots: false });
          this.assertSessionContext(sessionContext);
        } catch (error) {
          if (this.isSessionContextChangedError(error)) throw error;
          attempts.push({ stage: 'refresh-authority', requestError: error });
        }
      }

      const refreshedAuthority = this.spaceEncryptionAuthority(cleanSpaceId);
      const refreshedKeyId = String(refreshedAuthority.keyId || '').trim();
      if (refreshedKeyId && await hasSpaceKey(cleanSpaceId, refreshedKeyId)) {
        recovered = await activateSpaceKey(cleanSpaceId, refreshedKeyId, { keyEpoch: refreshedAuthority.keyEpoch });
        dispatch('p2p:key-self-healed', { spaceId: cleanSpaceId, keyId: refreshedKeyId, strategy: 'refreshed-authority' });
        return recovered;
      }
      if (refreshedKeyId) {
        recovered = await attemptRequest(refreshedKeyId);
        if (recovered) {
          dispatch('p2p:key-self-healed', { spaceId: cleanSpaceId, keyId: refreshedKeyId, strategy: 'refreshed-authorized-replica' });
          return recovered;
        }
      }

      const currentUserId = String(this.user?.userId || '').trim();
      const canRotateForInvitation = options.allowOwnerRecoveryRotation === true
        && refreshedAuthority.space?.ownerUserId === currentUserId
        && Boolean(refreshedKeyId)
        && refreshedAuthority.rotationRequired !== true;
      if (canRotateForInvitation) {
        const rotated = await ensureSpaceKey(cleanSpaceId, { rotate: true, activate: false });
        if (rotated?.keyId && rotated.keyId !== refreshedKeyId) {
          const activation = await this.activateAuthoritativeSpaceKey(cleanSpaceId, rotated.keyId, refreshedKeyId);
          this.assertSessionContext(sessionContext);
          let distribution = null;
          try {
            distribution = await this.distributeSpaceKey(cleanSpaceId, rotated.keyId);
          } catch (error) {
            dispatch('p2p:key-distribution-pending', {
              spaceId: cleanSpaceId,
              keyId: rotated.keyId,
              stage: 'invitation-key-self-heal',
              error
            });
          }
          const active = await getActiveSpaceKey(cleanSpaceId) || {
            ...rotated,
            keyEpoch: Math.max(0, Number(activation.space?.encryptionKeyEpoch || 0))
          };
          dispatch('p2p:key-self-healed', {
            spaceId: cleanSpaceId,
            keyId: active.keyId,
            strategy: 'owner-rotation',
            distributionComplete: distribution?.complete === true
          });
          return { ...active, distribution };
        }
      }

      dispatch('p2p:key-self-heal-failed', {
        spaceId: cleanSpaceId,
        keyId: refreshedKeyId || cleanKeyId,
        attempts: attempts.map((attempt) => ({
          keyId: String(attempt?.keyId || '').trim(),
          stage: String(attempt?.stage || '').trim(),
          requested: attempt?.requested === true,
          recovered: attempt?.recovered === true,
          timedOut: attempt?.timedOut === true,
          errorCode: String(attempt?.requestError?.code || '').trim(),
          status: Number(attempt?.requestError?.status || attempt?.requestError?.statusCode || 0) || 0
        }))
      });
      return null;
    })();

    this.missingSpaceKeyRecoveryPromises.set(recoveryScope, recovery);
    try {
      return await recovery;
    } finally {
      if (this.missingSpaceKeyRecoveryPromises.get(recoveryScope) === recovery) {
        this.missingSpaceKeyRecoveryPromises.delete(recoveryScope);
      }
    }
  }

  async ensureCurrentSpaceKey(spaceId = '', options = {}) {
    const cleanSpaceId = String(spaceId || '').trim();
    const authority = this.spaceEncryptionAuthority(cleanSpaceId);
    if (!authority.space || Math.max(0, Number(authority.space.encryptionVersion || 0)) < 1) return null;
    if (authority.rotationRequired) {
      const currentUserId = String(this.user?.userId || '').trim();
      if (authority.space.ownerUserId !== currentUserId || options.rotateRequired === false) {
        const error = new Error('El propietario debe activar una clave nueva antes de continuar la sincronización de este proyecto.');
        error.code = 'P2P_KEY_ROTATION_REQUIRED';
        error.status = 409;
        error.retryable = true;
        error.spaceId = cleanSpaceId;
        throw error;
      }
      const rotated = await ensureSpaceKey(cleanSpaceId, { rotate: true, activate: false });
      if (!rotated?.keyId || rotated.keyId === authority.keyId) {
        const error = new Error('No se pudo generar una clave distinta para cerrar la revocación de forma segura.');
        error.code = 'P2P_KEY_ROTATION_REQUIRED';
        error.status = 409;
        error.retryable = true;
        error.spaceId = cleanSpaceId;
        throw error;
      }
      const activation = await this.activateAuthoritativeSpaceKey(cleanSpaceId, rotated.keyId, authority.keyId);
      let distribution = null;
      try {
        distribution = await this.distributeSpaceKey(cleanSpaceId, rotated.keyId);
      } catch (error) {
        dispatch('p2p:key-distribution-pending', { spaceId: cleanSpaceId, keyId: rotated.keyId, error });
      }
      const active = await getActiveSpaceKey(cleanSpaceId) || {
        ...rotated,
        keyEpoch: Math.max(0, Number(activation.space?.encryptionKeyEpoch || 0))
      };
      return { ...active, distribution };
    }
    if (!authority.keyId) {
      const currentUserId = String(this.user?.userId || '').trim();
      if (options.initializeOwner !== false && authority.space.ownerUserId === currentUserId) {
        const local = await getActiveSpaceKey(cleanSpaceId) || await ensureSpaceKey(cleanSpaceId, { activate: false });
        const activation = await this.activateAuthoritativeSpaceKey(cleanSpaceId, local.keyId, '');
        return await getActiveSpaceKey(cleanSpaceId) || { ...local, keyEpoch: activation.space?.encryptionKeyEpoch || 0 };
      }
      if (options.requireAuthority === true) {
        const error = new Error('El propietario debe abrir primero este proyecto heredado para activar su clave compartida antes de invitar participantes.');
        error.code = 'P2P_KEY_AUTHORITY_PENDING';
        error.status = 409;
        error.spaceId = cleanSpaceId;
        throw error;
      }
      return getActiveSpaceKey(cleanSpaceId);
    }
    if (await hasSpaceKey(cleanSpaceId, authority.keyId)) {
      return activateSpaceKey(cleanSpaceId, authority.keyId, { keyEpoch: authority.keyEpoch });
    }
    if (options.requestIfMissing !== false) {
      const recovered = await this.recoverMissingSpaceKey(cleanSpaceId, authority.keyId, {
        allowOwnerRecoveryRotation: options.allowOwnerRecoveryRotation === true
      });
      if (recovered) return recovered;
    }
    const latestAuthority = this.spaceEncryptionAuthority(cleanSpaceId);
    const error = new Error('Este dispositivo todavía no tiene la clave activa del proyecto.');
    error.code = 'P2P_SPACE_KEY_MISSING';
    error.retryable = true;
    error.recoveryAttempted = options.requestIfMissing !== false;
    error.spaceId = cleanSpaceId;
    error.keyId = String(latestAuthority.keyId || authority.keyId || '').trim();
    throw error;
  }

  assertEncryptedTransportEvent(event = {}) {
    if (!this.spaceRequiresEncryption(event.spaceId)) return true;
    const operation = event.operation || {};
    const type = String(operation.type || '').trim();
    const hasEncryptionMetadata = operation.encrypted === true
      && Number(operation.encryptionVersion || 0) === 1
      && Boolean(String(operation.keyId || '').trim());
    const statePayloadProtected = ['entity.delete', 'entity.purge'].includes(type)
      || !['entity.put', 'entity.patch', 'entity.trash', 'entity.restore', 'custom'].includes(type)
      || Boolean(operation.payload?.__p2pEncrypted);
    if (!hasEncryptionMetadata || !statePayloadProtected) {
      const reason = !hasEncryptionMetadata
        ? 'transport_encryption_metadata_missing'
        : 'transport_payload_unprotected';
      const error = createRejectedEncryptedPayloadError(
        'El transporte intentó entregar datos sin cifrar para un proyecto protegido.',
        reason
      );
      error.status = 409;
      error.spaceId = String(event.spaceId || '').trim();
      throw error;
    }
    return true;
  }

  keyEnvelopeRejectionScope(spaceId = '', keyId = '', keyEpoch = 0) {
    const cleanSpaceId = String(spaceId || '').trim();
    const cleanKeyId = String(keyId || '').trim();
    const cleanKeyEpoch = Math.max(0, Number(keyEpoch || 0));
    return cleanSpaceId && cleanKeyId ? `${cleanSpaceId}|${cleanKeyId}|${cleanKeyEpoch}` : '';
  }

  rejectedKeyEnvelopeDeviceIds(spaceId = '', keyId = '', keyEpoch = 0, now = Date.now()) {
    const scope = this.keyEnvelopeRejectionScope(spaceId, keyId, keyEpoch);
    const sources = scope ? this.rejectedKeyEnvelopeSources.get(scope) : null;
    if (!sources) return [];
    for (const [deviceId, rejectedAt] of sources) {
      if (now - Number(rejectedAt || 0) >= KEY_ENVELOPE_REJECTION_TTL_MS) sources.delete(deviceId);
    }
    if (!sources.size) {
      this.rejectedKeyEnvelopeSources.delete(scope);
      return [];
    }
    return [...sources.keys()].slice(0, KEY_ENVELOPE_REJECTION_MAX_SOURCES);
  }

  rememberRejectedKeyEnvelopeSource(spaceId = '', keyId = '', keyEpoch = 0, deviceId = '') {
    const scope = this.keyEnvelopeRejectionScope(spaceId, keyId, keyEpoch);
    const cleanDeviceId = String(deviceId || '').trim().slice(0, 180);
    if (!scope || !cleanDeviceId) return [];
    const sources = this.rejectedKeyEnvelopeSources.get(scope) || new Map();
    sources.delete(cleanDeviceId);
    sources.set(cleanDeviceId, Date.now());
    while (sources.size > KEY_ENVELOPE_REJECTION_MAX_SOURCES) {
      sources.delete(sources.keys().next().value);
    }
    this.rejectedKeyEnvelopeSources.set(scope, sources);
    return this.rejectedKeyEnvelopeDeviceIds(spaceId, keyId, keyEpoch);
  }

  clearRejectedKeyEnvelopeSources(spaceId = '', keyId = '', keyEpoch = 0) {
    const scope = this.keyEnvelopeRejectionScope(spaceId, keyId, keyEpoch);
    if (!scope) return;
    this.rejectedKeyEnvelopeSources.delete(scope);
    const retryTimer = this.rejectedKeyEnvelopeRetryTimers.get(scope);
    if (retryTimer) window.clearTimeout(retryTimer);
    this.rejectedKeyEnvelopeRetryTimers.delete(scope);
  }

  clearRejectedKeyEnvelopeRetryTimers() {
    for (const retryTimer of this.rejectedKeyEnvelopeRetryTimers.values()) {
      window.clearTimeout(retryTimer);
    }
    this.rejectedKeyEnvelopeRetryTimers.clear();
  }

  scheduleRejectedKeyEnvelopeRetry(spaceId = '', keyId = '', keyEpoch = 0) {
    const scope = this.keyEnvelopeRejectionScope(spaceId, keyId, keyEpoch);
    if (!scope || this.rejectedKeyEnvelopeRetryTimers.has(scope)) return false;
    const sessionContext = this.captureSessionContext();
    const retryTimer = window.setTimeout(() => {
      this.rejectedKeyEnvelopeRetryTimers.delete(scope);
      if (!this.isSessionContextCurrent(sessionContext)) return;
      this.requestSpaceKey(spaceId, keyId, { force: true }).catch((error) => {
        if (this.isSessionContextChangedError(error)) return;
        dispatch('p2p:key-request-retry-deferred', { spaceId, keyId, keyEpoch, error });
      });
    }, KEY_ENVELOPE_REJECTION_TTL_MS + 250);
    this.rejectedKeyEnvelopeRetryTimers.set(scope, retryTimer);
    return true;
  }

  snapshotSourceRejectionScope(spaceId = '') {
    return String(spaceId || '').trim();
  }

  rejectedSnapshotSourceDeviceIds(spaceId = '', now = Date.now()) {
    const scope = this.snapshotSourceRejectionScope(spaceId);
    const sources = scope ? this.rejectedSnapshotSources.get(scope) : null;
    if (!sources) return [];
    for (const [deviceId, rejectedAt] of sources) {
      if (now - Number(rejectedAt || 0) >= SNAPSHOT_SOURCE_REJECTION_TTL_MS) sources.delete(deviceId);
    }
    if (!sources.size) {
      this.rejectedSnapshotSources.delete(scope);
      return [];
    }
    return [...sources.keys()].slice(0, SNAPSHOT_SOURCE_REJECTION_MAX_SOURCES);
  }

  rememberRejectedSnapshotSource(spaceId = '', deviceId = '') {
    const scope = this.snapshotSourceRejectionScope(spaceId);
    const cleanDeviceId = String(deviceId || '').trim().slice(0, 180);
    if (!scope || !cleanDeviceId) return [];
    const sources = this.rejectedSnapshotSources.get(scope) || new Map();
    sources.delete(cleanDeviceId);
    sources.set(cleanDeviceId, Date.now());
    while (sources.size > SNAPSHOT_SOURCE_REJECTION_MAX_SOURCES) {
      sources.delete(sources.keys().next().value);
    }
    this.rejectedSnapshotSources.set(scope, sources);
    return this.rejectedSnapshotSourceDeviceIds(scope);
  }

  forgetRejectedSnapshotSource(spaceId = '', deviceId = '') {
    const scope = this.snapshotSourceRejectionScope(spaceId);
    const cleanDeviceId = String(deviceId || '').trim().slice(0, 180);
    const sources = scope ? this.rejectedSnapshotSources.get(scope) : null;
    if (!sources || !cleanDeviceId) return false;
    const removed = sources.delete(cleanDeviceId);
    if (!sources.size) this.rejectedSnapshotSources.delete(scope);
    return removed;
  }

  snapshotSourceExclusionsBySpace() {
    const result = {};
    const spaceIds = new Set([
      ...this.rejectedSnapshotSources.keys(),
      ...this.recoveryEligibleSpaceIds()
    ]);
    for (const spaceId of spaceIds) {
      const excluded = this.rejectedSnapshotSourceDeviceIds(spaceId);
      if (excluded.length) result[spaceId] = excluded;
    }
    return result;
  }

  rejectEncryptedTransportEvents(events = [], error = null) {
    const rejectedEvents = Array.isArray(events) ? events.filter(Boolean) : [];
    const exclusionsBySpace = {};
    for (const event of rejectedEvents) {
      const spaceId = String(event?.spaceId || '').trim();
      const sourceDeviceId = String(event?.sourceDeviceId || '').trim();
      if (!spaceId || !sourceDeviceId) continue;
      exclusionsBySpace[spaceId] = this.rememberRejectedSnapshotSource(spaceId, sourceDeviceId);
    }
    this.snapshotRecoveryRequired = true;
    this.scheduleSnapshotRecovery(SNAPSHOT_REJECTION_RETRY_MS, { replace: true });
    dispatch('p2p:encrypted-payload-rejected', {
      events: rejectedEvents,
      error,
      reason: String(error?.reason || 'invalid_payload').trim(),
      exclusionsBySpace
    });
    return exclusionsBySpace;
  }

  async requestSpaceKey(spaceId = '', keyId = '', options = {}) {
    const cleanSpaceId = String(spaceId || '').trim();
    if (!cleanSpaceId || !this.started || !getSessionToken() || !this.canReadSpace(cleanSpaceId)) return false;
    if (!this.isSpaceAuthorizationConfirmed(cleanSpaceId)
      && !this.isSpaceReplicaRecoveryPending(cleanSpaceId)) return false;
    const authority = this.spaceEncryptionAuthority(cleanSpaceId);
    const requestedKeyId = String(keyId || authority.keyId || '').trim();
    if (requestedKeyId && await hasSpaceKey(cleanSpaceId, requestedKeyId)) return true;
    const now = Date.now();
    const previous = Number(this.keyRequestTimes.get(cleanSpaceId) || 0);
    if (options.force !== true && now - previous < 10000) return false;
    this.keyRequestTimes.set(cleanSpaceId, now);
    const requestedKeyEpoch = authority.keyId === requestedKeyId ? authority.keyEpoch : 0;
    const suppliedExclusions = Array.isArray(options.excludeDeviceIds) ? options.excludeDeviceIds : [];
    const excludeDeviceIds = [...new Set([
      ...this.rejectedKeyEnvelopeDeviceIds(cleanSpaceId, requestedKeyId, requestedKeyEpoch),
      ...suppliedExclusions
        .map((deviceId) => String(deviceId || '').trim().slice(0, 180))
        .filter(Boolean)
    ])].slice(0, KEY_ENVELOPE_REJECTION_MAX_SOURCES);
    const result = await apiPost('/api/p2p/crypto/key-request', {
      deviceId: this.deviceId,
      spaceId: cleanSpaceId,
      keyId: requestedKeyId,
      excludeDeviceIds
    });
    dispatch('p2p:key-requested', {
      spaceId: cleanSpaceId,
      keyId: requestedKeyId,
      requested: Number(result.requested || 0),
      excludedDeviceIds: excludeDeviceIds
    });
    return Number(result.requested || 0) > 0;
  }

  async sendSpaceKeyEnvelope(spaceId = '', recipientDevice = {}, keyId = '') {
    const envelope = await createSpaceKeyEnvelope(spaceId, recipientDevice, { keyId });
    return apiPost('/api/p2p/crypto/key-envelope', {
      deviceId: this.deviceId,
      spaceId,
      targetDeviceId: recipientDevice.deviceId,
      envelope
    });
  }

  async distributeSpaceKey(spaceId = '', keyId = '') {
    this.assertSpaceAuthorizationConfirmed(spaceId);
    const data = await apiPost('/api/p2p/crypto/space-devices', { spaceId });
    const activeKeyId = String(data.space?.activeEncryptionKeyId || '').trim();
    if (!activeKeyId || activeKeyId !== String(keyId || '').trim()) {
      const error = new Error('La clave que intentas distribuir ya no es la clave activa del proyecto.');
      error.code = 'P2P_KEY_AUTHORITY_CONFLICT';
      throw error;
    }
    const recipients = (data.devices || []).filter((device) => device?.deviceId && device.deviceId !== this.deviceId);
    const envelopes = await createSpaceKeyEnvelopes(spaceId, recipients, { keyId });
    const deliveryResults = await Promise.allSettled(envelopes.map(async (envelope) => {
      const result = await apiPost('/api/p2p/crypto/key-envelope', {
        deviceId: this.deviceId,
        spaceId,
        targetDeviceId: envelope.recipientDeviceId,
        envelope
      });
      const delivered = Math.max(0, Number(result.deliveredToDevices || 0));
      if (delivered < 1) {
        const error = new Error('El backend no confirmó la entrega de la clave al dispositivo autorizado.');
        error.code = 'P2P_KEY_ENVELOPE_NOT_DELIVERED';
        error.status = 503;
        throw error;
      }
      return {
        recipientDeviceId: String(envelope.recipientDeviceId || '').trim(),
        delivered
      };
    }));
    const deliveredDeviceIds = new Set();
    let delivered = 0;
    const failures = [];
    deliveryResults.forEach((result, index) => {
      const recipientDeviceId = String(envelopes[index]?.recipientDeviceId || '').trim();
      if (result.status === 'fulfilled') {
        delivered += Math.max(0, Number(result.value?.delivered || 0));
        if (recipientDeviceId) deliveredDeviceIds.add(recipientDeviceId);
        return;
      }
      failures.push({
        recipientDeviceId,
        code: String(result.reason?.code || 'P2P_KEY_ENVELOPE_DELIVERY_FAILED').trim(),
        status: Math.max(0, Number(result.reason?.status || result.reason?.statusCode || 0))
      });
    });
    const failedDeviceIds = recipients
      .map((device) => String(device?.deviceId || '').trim())
      .filter((deviceId) => deviceId && !deliveredDeviceIds.has(deviceId));
    const complete = failedDeviceIds.length === 0 && envelopes.length === recipients.length;
    return {
      recipients: recipients.length,
      envelopes: envelopes.length,
      delivered,
      failed: failedDeviceIds.length,
      failedDeviceIds,
      failures,
      complete
    };
  }

  async replayDeferredEncryptedEvents(spaceId = '', sessionContext = this.captureSessionContext()) {
    this.assertSessionContext(sessionContext);
    const records = await listDeferredEncryptedEvents(spaceId);
    const processedKeys = new Set();
    let applied = 0;

    for (const record of records) {
      if (processedKeys.has(record.eventKey)) continue;
      this.assertSessionContext(sessionContext);
      try {
        const descriptor = describeAtomicTransportBatchEvent(record.event);
        if (descriptor) {
          const batchRecords = records.filter((candidate) => {
            try {
              return describeAtomicTransportBatchEvent(candidate.event)?.key === descriptor.key;
            } catch {
              return false;
            }
          });
          if (batchRecords.length !== descriptor.batchSize) continue;
          const orderedEvents = normalizeAtomicTransportBatchEvents(batchRecords.map((candidate) => candidate.event));
          const recordsByOperationId = new Map(batchRecords.map((candidate) => [
            String(candidate.event?.operation?.operationId || '').trim(),
            candidate
          ]));
          const decryptedEvents = [];
          for (const event of orderedEvents) {
            this.assertEncryptedTransportEvent(event);
            decryptedEvents.push(await decryptOperationEvent(event));
            this.assertSessionContext(sessionContext);
          }
          await this.applyDecryptedOperationEventBatch(decryptedEvents, sessionContext, { deferredReplay: true });
          for (const event of orderedEvents) {
            const candidate = recordsByOperationId.get(String(event.operation?.operationId || '').trim());
            if (!candidate) continue;
            await removeDeferredEncryptedEvent(candidate.eventKey);
            processedKeys.add(candidate.eventKey);
          }
          applied += orderedEvents.length;
          continue;
        }

        this.assertEncryptedTransportEvent(record.event);
        const decrypted = await decryptOperationEvent(record.event);
        this.assertSessionContext(sessionContext);
        await this.applyDecryptedOperationEvent(decrypted, sessionContext, { deferredReplay: true });
        await removeDeferredEncryptedEvent(record.eventKey);
        processedKeys.add(record.eventKey);
        applied += 1;
      } catch (error) {
        if (error?.code === 'P2P_SPACE_KEY_MISSING') continue;
        dispatch('p2p:error', { error, stage: 'encrypted-replay', event: record.event });
      }
    }
    return applied;
  }

  readableSpaceIds(spaces = this.bootstrapState.spaces || []) {
    const userId = String(this.user?.userId || '').trim();
    if (!userId) return [];
    return (Array.isArray(spaces) ? spaces : []).filter((space) => {
      if (space?.authorizationState === 'unconfirmed') return false;
      const member = (space?.members || []).find((candidate) => candidate?.userId === userId);
      return Boolean(member && Array.isArray(member.permissions) && member.permissions.includes('read'));
    }).map((space) => String(space.spaceId || '').trim()).filter(Boolean);
  }

  recoveryEligibleSpaceIds(spaces = this.bootstrapState.spaces || []) {
    const userId = String(this.user?.userId || '').trim();
    if (!userId) return [];
    return (Array.isArray(spaces) ? spaces : []).filter((space) => {
      if (space?.authorizationState === 'unconfirmed'
        && space?.authorizationPendingReason !== 'replica_recovery') return false;
      const member = (space?.members || []).find((candidate) => candidate?.userId === userId);
      return Boolean(member && Array.isArray(member.permissions) && member.permissions.includes('read'));
    }).map((space) => String(space.spaceId || '').trim()).filter(Boolean);
  }

  revisionGapRequirements(localStateRevisions = {}, backendStateRevisions = {}, allowedSpaceIds = []) {
    const allowed = new Set(allowedSpaceIds || []);
    const required = {};
    for (const [spaceId, revision] of Object.entries(backendStateRevisions || {})) {
      if (!allowed.has(spaceId)) continue;
      const backendRevision = Math.max(0, Number(revision || 0));
      const localRevision = Math.max(0, Number(localStateRevisions?.[spaceId] || 0));
      if (backendRevision > localRevision) required[spaceId] = backendRevision;
    }
    return required;
  }

  async syncRecoveryRequirements(
    { localStateRevisions = {} } = {},
    sessionContext = this.captureSessionContext()
  ) {
    this.assertSessionContext(sessionContext);
    const recoveryEligibleSpaceIds = this.recoveryEligibleSpaceIds();
    const required = this.revisionGapRequirements(
      localStateRevisions,
      this.bootstrapState.stateRevisions || {},
      recoveryEligibleSpaceIds
    );
    const recoveryRequirements = await updateRecoveryRequirements({
      retainSpaceIds: recoveryEligibleSpaceIds,
      appliedStateRevisions: localStateRevisions,
      required
    });
    this.assertSessionContext(sessionContext);
    this.recoveryRequirements = recoveryRequirements;
    this.snapshotRecoveryRequired = Object.keys(this.recoveryRequirements).length > 0;
    return this.recoveryRequirements;
  }

  async confirmRecoveredReplicaAuthorization(
    spaceId = '',
    sessionContext = this.captureSessionContext()
  ) {
    this.assertSessionContext(sessionContext);
    const cleanSpaceId = String(spaceId || '').trim();
    if (!cleanSpaceId || !this.isSpaceReplicaRecoveryPending(cleanSpaceId)) return false;
    const localStateRevisions = await listStateRevisions([cleanSpaceId]);
    this.assertSessionContext(sessionContext);
    const localStateRevision = Math.max(0, Number(localStateRevisions?.[cleanSpaceId] || 0));
    const backendStateRevision = Math.max(0, Number(
      this.bootstrapState?.stateRevisions?.[cleanSpaceId]
      || 0
    ));
    this.recoveryRequirements = await getRecoveryRequirements();
    this.assertSessionContext(sessionContext);
    const recoveryRequirement = Math.max(0, Number(this.recoveryRequirements?.[cleanSpaceId] || 0));
    if (recoveryRequirement > 0 || localStateRevision < backendStateRevision) return false;

    const current = (this.bootstrapState.spaces || [])
      .find((space) => String(space?.spaceId || '').trim() === cleanSpaceId) || null;
    if (!current || current.authorizationPendingReason !== 'replica_recovery') return false;
    const confirmed = { ...current, authorizationState: 'confirmed' };
    delete confirmed.authorizationPendingReason;
    delete confirmed.authorizationUnconfirmedAt;
    await saveSpaces([confirmed]);
    this.assertSessionContext(sessionContext);
    this.rememberAuthoritativeSpace(confirmed);
    dispatch('p2p:state', { state: this.bootstrapState, source: 'replica-recovery-confirmed' });
    dispatch('p2p:replica-recovery-confirmed', {
      spaceId: cleanSpaceId,
      localStateRevision,
      backendStateRevision
    });
    return true;
  }

  async revertRejectedOutbox(item = {}, error = null, sessionContext = this.captureSessionContext()) {
    this.assertSessionContext(sessionContext);
    const rollback = await rejectOutboxOperation(item, error);
    this.assertSessionContext(sessionContext);
    dispatch('p2p:outbox-rejected', { item, error, rollback });
    if (rollback.reverted) {
      dispatch('p2p:operation-reverted', {
        operationId: item.operationId,
        spaceId: item.spaceId,
        entity: rollback.entity,
        status: rollback.status,
        message: rollback.message
      });
    }
    return rollback;
  }


  async revertRejectedOutboxBatch(items = [], error = null, sessionContext = this.captureSessionContext()) {
    this.assertSessionContext(sessionContext);
    const normalized = Array.isArray(items) ? items.filter(Boolean) : [];
    const result = await rejectOutboxOperationBatch(normalized, error);
    this.assertSessionContext(sessionContext);
    normalized.forEach((item, index) => {
      const rollback = result.rollbacks?.[index] || null;
      dispatch('p2p:outbox-rejected', { item, error, rollback, batchAtomic: true });
      if (rollback?.reverted) {
        dispatch('p2p:operation-reverted', {
          operationId: item.operationId,
          batchId: String(item.batchId || '').trim(),
          spaceId: item.spaceId,
          entity: rollback.entity,
          status: rollback.status,
          message: rollback.message,
          batchAtomic: true
        });
      }
    });
    return result;
  }

  snapshotRecoveryDelay(snapshotRequests = []) {
    const now = Date.now();
    const expirations = (snapshotRequests || [])
      .map((request) => Date.parse(request?.expiresAt || ''))
      .filter((expiresAt) => Number.isFinite(expiresAt) && expiresAt > now);
    if (expirations.length) {
      return Math.max(5000, Math.min(...expirations) - now + SNAPSHOT_RECOVERY_MARGIN_MS);
    }
    if ((snapshotRequests || []).length) {
      return Math.max(
        SNAPSHOT_RECOVERY_FALLBACK_MS,
        Number(this.snapshotGrantTtlSeconds || 0) * 1000 + SNAPSHOT_RECOVERY_MARGIN_MS
      );
    }
    return SNAPSHOT_RECOVERY_FALLBACK_MS;
  }

  async resetDeliveryCursor(currentSequence = 0, sessionContext = this.captureSessionContext()) {
    this.assertSessionContext(sessionContext);
    const resetSequence = Number(currentSequence || 0);
    if (!Number.isSafeInteger(resetSequence) || resetSequence < 0) {
      throw realtimeProtocolError(
        'El servidor solicitó restablecer el cursor a una secuencia inválida.',
        'P2P_REALTIME_CURSOR_RESET_INVALID',
        { currentSequence }
      );
    }
    if (this.ackTimer) window.clearTimeout(this.ackTimer);
    this.ackTimer = 0;
    this.ackGeneration += 1;
    this.ackPromise = null;
    this.ackRetryCount = 0;
    this.highestPendingAck = 0;
    this.pendingAckReplicaSpaceIds.clear();
    await setMeta(`${CURSOR_META_PREFIX}${sessionContext.deviceId}`, resetSequence);
    this.assertSessionContext(sessionContext);
    this.lastProcessedSequence = resetSequence;
    this.lastAcceptedStreamSequence = resetSequence;
    return resetSequence;
  }

  clearSnapshotRecovery() {
    if (this.snapshotRecoveryTimer) window.clearTimeout(this.snapshotRecoveryTimer);
    this.snapshotRecoveryTimer = 0;
    this.snapshotRecoveryDueAt = 0;
    this.snapshotRecoveryRequired = false;
  }

  scheduleSnapshotRecovery(delayMs = SNAPSHOT_RECOVERY_FALLBACK_MS, options = {}) {
    if (!this.snapshotRecoveryRequired || this.manualClose || !this.started || !this.realtimeLeader) return;
    const sessionContext = this.captureSessionContext();
    if (!this.isSessionContextCurrent(sessionContext)) return;
    const safeDelay = Math.max(5000, Number(delayMs || SNAPSHOT_RECOVERY_FALLBACK_MS));
    const dueAt = Date.now() + safeDelay;
    if (this.snapshotRecoveryTimer) {
      if (!options.replace || this.snapshotRecoveryDueAt <= dueAt) return;
      window.clearTimeout(this.snapshotRecoveryTimer);
    }
    this.snapshotRecoveryDueAt = dueAt;
    this.snapshotRecoveryTimer = window.setTimeout(async () => {
      this.snapshotRecoveryTimer = 0;
      this.snapshotRecoveryDueAt = 0;
      if (!this.isSessionContextCurrent(sessionContext)) return;
      if (!this.realtimeLeader) return;
      if (!this.snapshotRecoveryRequired || !navigator.onLine) {
        if (this.isSessionContextCurrent(sessionContext) && this.snapshotRecoveryRequired) {
          this.scheduleSnapshotRecovery(SNAPSHOT_RECOVERY_FALLBACK_MS);
        }
        return;
      }
      try {
        await this.refreshBootstrap({ requestSnapshots: 'force' });
        this.assertSessionContext(sessionContext);
      } catch (error) {
        if (this.isSessionContextChangedError(error)) return;
        if (isDeviceIdentityConflict(error)) {
          const recovered = await this.restartWithFreshDeviceIdentity(error).catch(() => false);
          if (recovered) return;
        }
        dispatch('p2p:error', { error, stage: 'snapshot-recovery' });
        if (this.isSessionContextCurrent(sessionContext)) {
          this.scheduleSnapshotRecovery(SNAPSHOT_RECOVERY_FALLBACK_MS);
        }
      }
    }, safeDelay);
  }

  async reconcileSnapshotRecovery(sessionContext = this.captureSessionContext()) {
    this.assertSessionContext(sessionContext);
    const spaceIds = this.recoveryEligibleSpaceIds();
    const localStateRevisions = await listStateRevisions(spaceIds);
    this.assertSessionContext(sessionContext);
    await this.syncRecoveryRequirements({ localStateRevisions }, sessionContext);
    this.assertSessionContext(sessionContext);
    if (this.snapshotRecoveryRequired) this.scheduleSnapshotRecovery(SNAPSHOT_RECOVERY_FALLBACK_MS);
    else this.clearSnapshotRecovery();
    return this.snapshotRecoveryRequired;
  }

  async loadLocalBootstrap(user = {}, sessionContext = this.captureSessionContext()) {
    this.assertSessionContext(sessionContext);
    const [spaces, allInvitations] = await Promise.all([listSpaces(), listInvitations()]);
    this.assertSessionContext(sessionContext);
    await this.loadLocalCapabilityState(sessionContext);
    this.assertSessionContext(sessionContext);
    const userId = String(user.userId || '').trim();
    const email = String(user.email || '').trim().toLowerCase();
    const invitations = { received: [], sent: [] };
    for (const invitation of allInvitations || []) {
      const recipientEmail = String(invitation.recipientEmail || '').trim().toLowerCase();
      if (invitation.recipientUserId === userId || (!invitation.recipientUserId && recipientEmail === email)) {
        invitations.received.push(invitation);
      }
      if (invitation.inviterUserId === userId) invitations.sent.push(invitation);
    }
    return { spaces: spaces || [], invitations, devices: [], snapshotRequests: [], replicaHealth: {}, lifecycleTransactions: [], localOnly: true };
  }

  async applyBootstrapData(data = {}, context = {}) {
    const sessionContext = context.sessionContext || this.captureSessionContext();
    let controlStateCommitted = false;
    try {
      this.assertSessionContext(sessionContext);
      const invitations = normalizeInvitationCollection(data.invitations || {});
      const hasDeliveryState = data.deliveryState && Number.isFinite(Number(data.deliveryState.sequence));
      const backendDeviceSequence = hasDeliveryState ? Math.max(0, Number(data.deliveryState.sequence)) : 0;
      const cursorKey = `${CURSOR_META_PREFIX}${sessionContext.deviceId}`;
      const localCursor = Math.max(0, Number(await getMeta(cursorKey, 0) || 0));
      this.assertSessionContext(sessionContext);
      if (hasDeliveryState && backendDeviceSequence < localCursor) {
        await setMeta(cursorKey, 0);
        this.assertSessionContext(sessionContext);
        this.lastProcessedSequence = 0;
        this.lastAcceptedStreamSequence = 0;
        this.highestPendingAck = 0;
      }
      const backendStateRevisions = data.stateRevisions && typeof data.stateRevisions === 'object'
        ? data.stateRevisions
        : {};
      const localStateRevisions = context.localStateRevisions && typeof context.localStateRevisions === 'object'
        ? context.localStateRevisions
        : {};
      const provisionalReplicaSpaceIds = new Set((this.bootstrapState?.spaces || [])
        .filter((space) => space?.authorizationState === 'unconfirmed'
          && space?.authorizationPendingReason === 'replica_recovery')
        .map((space) => String(space?.spaceId || '').trim())
        .filter(Boolean));
      const pendingReplicaSpaceIds = (Array.isArray(data.spaces) ? data.spaces : [])
        .map((space) => String(space?.spaceId || '').trim())
        .filter((spaceId) => {
          if (!spaceId || !provisionalReplicaSpaceIds.has(spaceId)) return false;
          const backendStateRevision = Math.max(0, Number(backendStateRevisions?.[spaceId] || 0));
          const localStateRevision = Math.max(0, Number(localStateRevisions?.[spaceId] || 0));
          const recoveryRequirement = Math.max(0, Number(this.recoveryRequirements?.[spaceId] || 0));
          return backendStateRevision > localStateRevision || recoveryRequirement > localStateRevision;
        });
      if (Object.prototype.hasOwnProperty.call(data, 'localCapabilityAuthority')) {
        await this.persistLocalCapabilityState(data.localCapabilityAuthority, data.localCapability, sessionContext);
        this.assertSessionContext(sessionContext);
      }
      if (Object.prototype.hasOwnProperty.call(data, 'invitationEscrowAuthority')) {
        const authority = data.invitationEscrowAuthority && typeof data.invitationEscrowAuthority === 'object'
          ? data.invitationEscrowAuthority
          : null;
        this.invitationEscrowAuthority = authority?.enabled === true
          && Number(authority?.schemaVersion || 0) === 1
          && authority?.algorithm === 'ECDH-P256+HKDF-SHA256+A256GCM'
          && String(authority?.deviceId || '').trim()
          && authority?.publicKey
          ? authority
          : null;
        this.invitationEscrowMaxBytes = Math.max(0, Number(authority?.maxBytes || 0));
      }
      const previousLifecycleTransactions = new Map((Array.isArray(this.bootstrapState?.lifecycleTransactions)
        ? this.bootstrapState.lifecycleTransactions
        : [])
        .filter((transaction) => transaction && typeof transaction === 'object')
        .map((transaction) => [String(transaction.transactionId || '').trim(), transaction])
        .filter(([transactionId]) => transactionId));
      const lifecycleTransactions = Array.isArray(data.lifecycleTransactions)
        ? data.lifecycleTransactions
          .filter((transaction) => transaction && typeof transaction === 'object')
          .map((transaction) => normalizeLifecycleTransactionProgress(transaction))
          .map((transaction) => {
            const transactionId = String(transaction?.transactionId || '').trim();
            const previous = previousLifecycleTransactions.get(transactionId);
            if (
              previous
              && ['failed', 'completion-pending'].includes(String(previous?.status || '').trim())
              && ['waiting', 'ready'].includes(String(transaction?.status || '').trim())
            ) return { ...transaction, ...previous, transactionId };
            return transaction;
          })
        : [];
      const lifecyclePurgeSpaceIds = new Set(lifecycleTransactions
        .filter((transaction) => transaction.role === 'target'
          && transaction.action === 'purge'
          && ['waiting', 'ready'].includes(transaction.status))
        .map((transaction) => String(transaction.spaceId || '').trim())
        .filter(Boolean));
      const nextBootstrapState = {
        spaces: (Array.isArray(data.spaces) ? data.spaces : [])
          .filter((space) => !lifecyclePurgeSpaceIds.has(String(space?.spaceId || '').trim())),
        revokedSpaceIds: Array.from(new Set([
          ...(Array.isArray(data.revokedSpaceIds) ? data.revokedSpaceIds : []),
          ...lifecyclePurgeSpaceIds
        ])),
        invitations,
        devices: Array.isArray(data.devices) ? data.devices : [],
        stateRevisions: backendStateRevisions,
        deliveryState: data.deliveryState && typeof data.deliveryState === 'object' ? data.deliveryState : { sequence: 0 },
        snapshotRequests: Array.isArray(data.snapshotRequests) ? data.snapshotRequests : [],
        replicaHealth: normalizeReplicaHealthMap(data.replicaHealth || {}),
        lifecycleTransactions,
        localOnly: false
      };
      const spaceReplacement = await replaceBootstrapControlState(
        nextBootstrapState.spaces,
        [...invitations.received, ...invitations.sent],
        {
          revokedSpaceIds: nextBootstrapState.revokedSpaceIds,
          pendingReplicaSpaceIds
        }
      );
      this.assertSessionContext(sessionContext);
      nextBootstrapState.spaces = Array.isArray(spaceReplacement?.spaces)
        ? spaceReplacement.spaces
        : nextBootstrapState.spaces;
      this.bootstrapState = nextBootstrapState;
      controlStateCommitted = true;
      this.eventMaxBytes = Math.max(16 * 1024, Number(data.limits?.eventMaxBytes || this.eventMaxBytes));
      this.entityMaxBytes = Math.max(8 * 1024, Number(data.limits?.entityMaxBytes || this.entityMaxBytes));
      this.snapshotMaxBytes = Math.max(8 * 1024, Number(data.limits?.snapshotMaxBytes || this.snapshotMaxBytes));
      this.snapshotTransferMaxBytes = Math.max(
        this.eventMaxBytes,
        Number(data.limits?.snapshotTransferMaxBytes || this.snapshotTransferMaxBytes)
      );
      this.snapshotMaxChunks = Math.max(1, Number(data.limits?.snapshotMaxChunks || this.snapshotMaxChunks));
      this.snapshotGrantTtlSeconds = Math.max(30, Number(data.limits?.snapshotGrantTtlSeconds || this.snapshotGrantTtlSeconds));
      configureP2PStorageLimits({
        snapshotMaxBytes: this.snapshotMaxBytes,
        snapshotMaxChunks: this.snapshotMaxChunks,
        snapshotSessionTtlSeconds: this.snapshotGrantTtlSeconds + 120
      });

      if (spaceReplacement?.removedSpaceIds?.length) {
        for (const removedSpaceId of spaceReplacement.removedSpaceIds) {
          await purgeSpaceCrypto(removedSpaceId).catch(() => null);
        }
        this.assertSessionContext(sessionContext);
        dispatch('p2p:access-revoked', {
          spaceIds: spaceReplacement.removedSpaceIds,
          source: 'bootstrap',
          purged: spaceReplacement.purged || {}
        });
      }
      if (spaceReplacement?.preservedSpaceIds?.length) {
        dispatch('p2p:authorization-unconfirmed', {
          spaceIds: spaceReplacement.preservedSpaceIds,
          source: 'bootstrap',
          reason: 'missing_without_explicit_revocation'
        });
      }
      if (spaceReplacement?.pendingReplicaSpaceIds?.length) {
        dispatch('p2p:replica-recovery-pending', {
          spaceIds: spaceReplacement.pendingReplicaSpaceIds,
          source: 'bootstrap',
          reason: 'accepted_replica_behind'
        });
      }
      const escrowRecoveredSpaceIds = new Set();
      for (const space of this.bootstrapState.spaces) {
        const encrypted = Math.max(0, Number(space?.encryptionVersion || 0)) >= 1;
        const replicaRecoveryPending = space?.authorizationState === 'unconfirmed'
          && space?.authorizationPendingReason === 'replica_recovery';
        if (replicaRecoveryPending && encrypted) {
          const recovered = await this.recoverAcceptedInvitationBootstrap(
            space,
            invitations.received,
            sessionContext,
            {
              forceSnapshot: true,
              deferKeyWait: true,
              auditTraceId: String(context.auditTraceId || '').trim()
            }
          ).catch((error) => {
            if (this.isSessionContextChangedError(error)) throw error;
            dispatch('p2p:invitation-bootstrap-recovery-deferred', {
              spaceId: space.spaceId,
              error
            });
            return { recovered: false, reason: 'request-failed' };
          });
          this.assertSessionContext(sessionContext);
          if (recovered?.recovered === true) escrowRecoveredSpaceIds.add(String(space.spaceId || '').trim());
          continue;
        }
        if (space?.authorizationState === 'unconfirmed' || !encrypted) continue;
        const activeKeyId = String(space?.activeEncryptionKeyId || '').trim();
        const localKeyAvailable = await hasSpaceKey(space.spaceId, activeKeyId);
        this.assertSessionContext(sessionContext);
        if (!localKeyAvailable) {
          await this.recoverAcceptedInvitationBootstrap(
            space,
            invitations.received,
            sessionContext,
            {
              deferKeyWait: true,
              auditTraceId: String(context.auditTraceId || '').trim()
            }
          ).catch((error) => {
            if (this.isSessionContextChangedError(error)) throw error;
            dispatch('p2p:invitation-bootstrap-recovery-deferred', {
              spaceId: space.spaceId,
              error
            });
            return { recovered: false, reason: 'request-failed' };
          });
          this.assertSessionContext(sessionContext);
        }
        // Mantiene el orden contractual de recuperación previo a `await this.ensureCurrentSpaceKey(space.spaceId)`,
        // pero desactiva aquí cualquier recuperación recursiva que pueda reentrar al bootstrap.
        // No se inicia una recuperación que vuelva a ejecutar refreshBootstrap() desde
        // dentro de applyBootstrapData(): ese refresh quedaría esperando esta misma cola
        // de bootstrap y podría mantener el inicio en "Conectando…" indefinidamente.
        // La solicitud de clave ya se dejó encolada arriba; el stream la completará al abrir.
        await this.ensureCurrentSpaceKey(space.spaceId, { requestIfMissing: false }).catch((error) => {
          dispatch('p2p:crypto-locked', { spaceId: space.spaceId, error });
          return false;
        });
        this.assertSessionContext(sessionContext);
      }
      const recoveryLocalStateRevisions = escrowRecoveredSpaceIds.size
        ? await listStateRevisions(this.recoveryEligibleSpaceIds())
        : (context.localStateRevisions || {});
      this.assertSessionContext(sessionContext);
      await this.syncRecoveryRequirements({
        localStateRevisions: recoveryLocalStateRevisions
      }, sessionContext);
      this.assertSessionContext(sessionContext);
      for (const spaceId of escrowRecoveredSpaceIds) {
        await this.confirmRecoveredReplicaAuthorization(spaceId, sessionContext);
        this.assertSessionContext(sessionContext);
      }
      if (this.snapshotRecoveryRequired) {
        this.scheduleSnapshotRecovery(
          this.snapshotRecoveryDelay(this.bootstrapState.snapshotRequests),
          { replace: this.bootstrapState.snapshotRequests.length > 0 }
        );
      } else {
        this.clearSnapshotRecovery();
      }
      this.scheduleLifecycleFinalizationObserver({ immediate: true }, sessionContext);
      return this.bootstrapState;
    } catch (error) {
      if (controlStateCommitted && error && typeof error === 'object') {
        error.p2pBootstrapControlStateCommitted = true;
      }
      throw error;
    }
  }

  mergeReplicaHealth(replicaHealth = {}, options = {}) {
    const normalized = normalizeReplicaHealthMap(replicaHealth);
    if (!Object.keys(normalized).length && options.replace !== true) return this.bootstrapState.replicaHealth || {};
    this.bootstrapState = {
      ...(this.bootstrapState || {}),
      replicaHealth: options.replace === true
        ? normalized
        : { ...(this.bootstrapState?.replicaHealth || {}), ...normalized }
    };
    if (options.dispatch !== false) dispatch('p2p:state', { state: this.bootstrapState, replicaHealthOnly: true });
    return this.bootstrapState.replicaHealth;
  }

  async refreshReplicaHealth(spaceIds = []) {
    const sessionContext = this.captureSessionContext();
    this.assertSessionContext(sessionContext);
    const cleanSpaceIds = Array.from(new Set((Array.isArray(spaceIds) ? spaceIds : [])
      .map((spaceId) => String(spaceId || '').trim())
      .filter(Boolean)))
      .slice(0, 100);
    const targetSpaceIds = cleanSpaceIds.length ? cleanSpaceIds : this.readableSpaceIds();
    const [localStateRevisions, localDeliverySequence, localSpaces] = await Promise.all([
      listStateRevisions(targetSpaceIds),
      getMeta(`${CURSOR_META_PREFIX}${sessionContext.deviceId}`, 0),
      listSpaces()
    ]);
    this.assertSessionContext(sessionContext);
    const data = await apiPost('/api/p2p/replicas/health', {
      deviceId: sessionContext.deviceId,
      spaceIds: cleanSpaceIds,
      replicaSpaceIds: localSpaces.map((space) => String(space?.spaceId || '').trim()).filter(Boolean),
      stateRevisions: localStateRevisions,
      deliverySequence: Math.max(0, Number(localDeliverySequence || 0))
    });
    this.assertSessionContext(sessionContext);
    if (data.stateRevisions && typeof data.stateRevisions === 'object') {
      this.bootstrapState.stateRevisions = {
        ...(this.bootstrapState.stateRevisions || {}),
        ...data.stateRevisions
      };
    }
    return this.mergeReplicaHealth(data.replicaHealth || {});
  }

  async recoverReplicaHealthConvergence(spaceIds = [], sessionContext = this.captureSessionContext()) {
    this.assertSessionContext(sessionContext);
    if (this.replicaHealthRecoveryPromise) return this.replicaHealthRecoveryPromise;
    if (!this.started || this.manualClose || !this.realtimeLeader || !getSessionToken() || !navigator.onLine) return false;

    const now = Date.now();
    const readable = new Set(this.readableSpaceIds());
    const targets = Array.from(new Set((Array.isArray(spaceIds) ? spaceIds : [])
      .map((spaceId) => String(spaceId || '').trim())
      .filter((spaceId) => spaceId && readable.has(spaceId))))
      .filter((spaceId) => Number(this.replicaHealthRecoveryCooldownUntil.get(spaceId) || 0) <= now)
      .slice(0, 25);
    if (!targets.length) return false;

    for (const spaceId of targets) {
      this.replicaHealthRecoveryCooldownUntil.set(spaceId, now + REPLICA_HEALTH_SELF_RECOVERY_COOLDOWN_MS);
    }

    const recovering = (async () => {
      dispatch('p2p:replica-health-recovery', { state: 'started', spaceIds: targets, deviceId: sessionContext.deviceId });
      try {
        await this.refreshBootstrap({
          requestSnapshots: 'force',
          snapshotSpaceIds: targets,
          auditSource: 'replica-health-self-recovery'
        });
        this.assertSessionContext(sessionContext);
        this.scheduleAck(Math.max(this.highestPendingAck, this.lastProcessedSequence), { immediate: true });
        this.scheduleReplicaHealthRefresh(targets, { delayMs: 750 });
        dispatch('p2p:replica-health-recovery', { state: 'requested', spaceIds: targets, deviceId: sessionContext.deviceId });
        return true;
      } catch (error) {
        if (!this.isSessionContextChangedError(error) && this.isSessionContextCurrent(sessionContext)) {
          dispatch('p2p:replica-health-recovery', { state: 'deferred', error, spaceIds: targets, deviceId: sessionContext.deviceId });
          if (this.isRetryableTransportError(error)) this.scheduleServerRecovery(error, 'replica-health-self-recovery');
        }
        return false;
      } finally {
        if (this.replicaHealthRecoveryPromise === recovering) this.replicaHealthRecoveryPromise = null;
      }
    })();

    this.replicaHealthRecoveryPromise = recovering;
    return recovering;
  }

  scheduleReplicaHealthRefresh(spaceIds = [], options = {}) {
    for (const spaceId of Array.isArray(spaceIds) ? spaceIds : []) {
      const cleanSpaceId = String(spaceId || '').trim();
      if (cleanSpaceId) this.pendingReplicaHealthSpaceIds.add(cleanSpaceId);
    }
    if (!this.pendingReplicaHealthSpaceIds.size
      || this.replicaHealthTimer
      || !this.started
      || this.manualClose
      || !this.realtimeLeader
      || !getSessionToken()
      || !navigator.onLine) return;
    const sessionContext = this.captureSessionContext();
    const delayMs = Math.max(250, Number(options.delayMs || 1250));
    this.replicaHealthTimer = window.setTimeout(async () => {
      this.replicaHealthTimer = 0;
      if (!this.isSessionContextCurrent(sessionContext) || !this.realtimeLeader || !navigator.onLine) return;
      const requested = [...this.pendingReplicaHealthSpaceIds];
      this.pendingReplicaHealthSpaceIds.clear();
      try {
        const health = await this.refreshReplicaHealth(requested);
        this.assertSessionContext(sessionContext);
        const retrySpaceIds = [];
        const selfRecoverySpaceIds = [];
        let nextRetryDelayMs = 0;
        for (const spaceId of requested) {
          const entry = health?.[spaceId];
          const pendingReplicas = Number(entry?.pendingReplicas || 0);
          if (!(pendingReplicas > 0)) {
            this.replicaHealthConvergenceAttempts.delete(spaceId);
            continue;
          }

          const currentReplicaNeedsRecovery = entry?.currentDeviceRegistered === true
            && entry?.currentDeviceConfirmed === false;
          const waitingOnlineReplica = currentReplicaNeedsRecovery
            || Number(entry?.onlineReplicas || 0) > Number(entry?.confirmedReplicas || 0);
          if (waitingOnlineReplica) {
            const attempt = Math.min(
              REPLICA_HEALTH_RETRY_ATTEMPT_CAP,
              Number(this.replicaHealthConvergenceAttempts.get(spaceId) || 0) + 1
            );
            this.replicaHealthConvergenceAttempts.set(spaceId, attempt);
            if (
              attempt >= REPLICA_HEALTH_SELF_RECOVERY_ATTEMPTS
              && currentReplicaNeedsRecovery
            ) {
              selfRecoverySpaceIds.push(spaceId);
            }
            const fastDelayMs = Math.min(
              REPLICA_HEALTH_FAST_RETRY_MAX_MS,
              REPLICA_HEALTH_FAST_RETRY_BASE_MS * (2 ** Math.max(0, attempt - 1))
            );
            nextRetryDelayMs = nextRetryDelayMs ? Math.min(nextRetryDelayMs, fastDelayMs) : fastDelayMs;
          } else {
            // Si otra instalación registrada todavía no está online, mantener una
            // reconciliación liviana evita que la card conserve para siempre el valor
            // observado durante el bootstrap. No se releen datos funcionales: solo
            // metadatos de cobertura y revisión.
            this.replicaHealthConvergenceAttempts.set(spaceId, 0);
            nextRetryDelayMs = nextRetryDelayMs
              ? Math.min(nextRetryDelayMs, REPLICA_HEALTH_BACKGROUND_RETRY_MS)
              : REPLICA_HEALTH_BACKGROUND_RETRY_MS;
          }
          retrySpaceIds.push(spaceId);
        }
        if (selfRecoverySpaceIds.length) {
          await this.recoverReplicaHealthConvergence(selfRecoverySpaceIds, sessionContext);
          this.assertSessionContext(sessionContext);
        }
        if (retrySpaceIds.length) {
          this.scheduleReplicaHealthRefresh(retrySpaceIds, {
            delayMs: nextRetryDelayMs || REPLICA_HEALTH_BACKGROUND_RETRY_MS
          });
        }
      } catch (error) {
        if (!this.isSessionContextChangedError(error) && this.isRetryableTransportError(error)) {
          const retrySpaceIds = [];
          let maxAttempt = 0;
          for (const spaceId of requested) {
            const attempt = Math.min(
              REPLICA_HEALTH_RETRY_ATTEMPT_CAP,
              Number(this.replicaHealthConvergenceAttempts.get(spaceId) || 0) + 1
            );
            this.replicaHealthConvergenceAttempts.set(spaceId, attempt);
            retrySpaceIds.push(spaceId);
            maxAttempt = Math.max(maxAttempt, attempt);
          }
          for (const spaceId of retrySpaceIds) this.pendingReplicaHealthSpaceIds.add(spaceId);
          if (retrySpaceIds.length) {
            this.scheduleReplicaHealthRefresh([], {
              delayMs: Math.max(
                retryAfterMilliseconds(error, { fallbackMs: 5000, maximumMs: 60000 }),
                Math.min(
                  REPLICA_HEALTH_FAST_RETRY_MAX_MS,
                  REPLICA_HEALTH_FAST_RETRY_BASE_MS * (2 ** Math.max(0, maxAttempt - 1))
                )
              )
            });
          }
        } else if (!this.isSessionContextChangedError(error)) {
          for (const spaceId of requested) this.replicaHealthConvergenceAttempts.delete(spaceId);
          dispatch('p2p:replica-health-error', { error, spaceIds: requested });
        }
      }
    }, delayMs);
  }

  async fenceBootstrapResponses(sessionContext = this.captureSessionContext()) {
    this.assertSessionContext(sessionContext);
    // Toda respuesta iniciada antes de una mutación autoritativa debe quedar
    // descartada aunque la lectura posterior falle. Primero cercamos solicitudes
    // todavía en red y después esperamos cualquier aplicación que ya hubiera
    // cruzado la barrera, para que la mutación local ocurra siempre al final.
    this.bootstrapMinimumApplicableSequence = Math.max(
      this.bootstrapMinimumApplicableSequence,
      this.bootstrapRequestSequence + 1
    );
    const pendingApply = this.bootstrapApplyQueue;
    await pendingApply;
    this.assertSessionContext(sessionContext);
    return this.bootstrapMinimumApplicableSequence;
  }

  async fetchBootstrap(requestSnapshots = false, auditContext = {}) {
    const sessionContext = this.captureSessionContext();
    this.assertSessionContext(sessionContext);
    const requestSequence = ++this.bootstrapRequestSequence;
    const snapshotSpaceIds = Array.from(new Set(
      (Array.isArray(this.nextBootstrapSnapshotSpaceIds) ? this.nextBootstrapSnapshotSpaceIds : [])
        .map((value) => String(value || '').trim())
        .filter(Boolean)
    )).slice(0, 1_000);
    // Consumir antes del primer await evita que dos bootstrap concurrentes
    // compartan accidentalmente los objetivos de recuperación.
    this.nextBootstrapSnapshotSpaceIds = [];
    const [localSpaces, durableKnownSpaceIds] = await Promise.all([
      listSpaces(),
      listKnownSpaceIds()
    ]);
    this.assertSessionContext(sessionContext);
    const localSpaceIds = localSpaces
      .map((space) => String(space?.spaceId || '').trim())
      .filter(Boolean);
    const revisionSpaceIds = Array.from(new Set([
      ...durableKnownSpaceIds,
      ...localSpaceIds,
      ...Object.keys(this.recoveryRequirements || {}),
      ...snapshotSpaceIds
    ].filter(Boolean))).slice(0, 1_000);
    const [stateRevisions, localDeliverySequence] = await Promise.all([
      listStateRevisions(revisionSpaceIds),
      getMeta(`${CURSOR_META_PREFIX}${sessionContext.deviceId}`, 0)
    ]);
    this.assertSessionContext(sessionContext);
    const lifecycleReceipts = await this.completedLifecycleReceipts(
      localSpaceIds,
      sessionContext
    );
    this.assertSessionContext(sessionContext);
    const auditTraceId = String(auditContext?.auditTraceId || '').trim();
    const auditSource = String(auditContext?.auditSource || auditContext?.source || '').trim();
    // Los flujos que ya poseen su propio watchdog pueden limitar el reintento HTTP
    // interno para evitar multiplicar intentos (p. ej. 3 ciclos externos x 3 HTTP).
    // El bootstrap ordinario conserva por defecto los 3 intentos de api.js.
    const requestMaxAttempts = Math.min(3, Math.max(1, Math.floor(Number(auditContext?.requestMaxAttempts || 3))));
    const knownSpaceIds = revisionSpaceIds;
    const bootstrapRequest = {
      device: this.device,
      requestSnapshots,
      snapshotSpaceIds,
      knownSpaceIds,
      replicaSpaceIds: localSpaceIds,
      stateRevisions,
      deliverySequence: Math.max(0, Number(localDeliverySequence || 0)),
      lifecycleReceipts,
      excludedSnapshotSourceDeviceIdsBySpace: requestSnapshots === false
        ? {}
        : this.snapshotSourceExclusionsBySpace(),
      ...(auditTraceId ? { auditTraceId } : {})
    };
    if (auditTraceId) {
      invitationAuditLog('frontend.bootstrap.request', {
        auditTraceId,
        auditSource,
        requestSequence,
        requestSnapshots,
        requestedSnapshotSpaceCount: snapshotSpaceIds.length,
        localSpaceCount: localSpaces.length,
        stateRevisionCount: Object.keys(stateRevisions || {}).length,
        deviceId: sessionContext.deviceId,
        ...XXXsenXXX({
          bootstrapRequest,
          localSpaces,
          stateRevisions,
          lifecycleReceipts
        })
      });
    }
    let data = null;
    try {
      data = await apiPost('/api/p2p/bootstrap', bootstrapRequest, { maxAttempts: requestMaxAttempts });
    } catch (error) {
      if (auditTraceId) {
        invitationAuditLog('frontend.bootstrap.backend-error', {
          auditTraceId,
          auditSource,
          requestSequence,
          deviceId: sessionContext.deviceId,
          error: invitationAuditError(error),
          ...XXXsenXXX({ bootstrapRequest, error })
        });
      }
      throw error;
    }
    this.assertSessionContext(sessionContext);
    if (auditTraceId) {
      invitationAuditLog('frontend.bootstrap.backend-response', {
        auditTraceId,
        auditSource,
        requestSequence,
        deviceId: sessionContext.deviceId,
        spaceCount: Array.isArray(data?.spaces) ? data.spaces.length : 0,
        receivedInvitationCount: Array.isArray(data?.invitations?.received) ? data.invitations.received.length : 0,
        sentInvitationCount: Array.isArray(data?.invitations?.sent) ? data.invitations.sent.length : 0,
        snapshotRequestCount: Array.isArray(data?.snapshotRequests) ? data.snapshotRequests.length : 0,
        revokedSpaceCount: Array.isArray(data?.revokedSpaceIds) ? data.revokedSpaceIds.length : 0,
        ...XXXsenXXX({ bootstrapRequest, backendBootstrapResponse: data })
      });
    }

    const applyTask = this.bootstrapApplyQueue.then(async () => {
      this.assertSessionContext(sessionContext);
      // Una lectura posterior ordinaria solo vuelve obsoleta a la anterior cuando
      // consigue aplicarse. Las mutaciones autoritativas usan además un cerco
      // explícito para impedir que respuestas previas resuciten permisos o datos.
      if (requestSequence < this.bootstrapMinimumApplicableSequence) return this.bootstrapState;
      if (requestSequence < this.bootstrapAppliedSequence) return this.bootstrapState;
      try {
        const state = await this.applyBootstrapData(data, {
          sessionContext,
          localStateRevisions: stateRevisions,
          auditTraceId,
          auditSource
        });
        this.assertSessionContext(sessionContext);
        this.bootstrapAppliedSequence = requestSequence;
        if (auditTraceId) {
          invitationAuditLog('frontend.bootstrap.applied', {
            auditTraceId,
            auditSource,
            requestSequence,
            deviceId: sessionContext.deviceId,
            spaceCount: Array.isArray(state?.spaces) ? state.spaces.length : 0,
            recoveryRequirementCount: Object.keys(this.recoveryRequirements || {}).length,
            ...XXXsenXXX({ backendBootstrapResponse: data, appliedBootstrapState: state })
          });
        }
        return state;
      } catch (error) {
        if (error?.p2pBootstrapControlStateCommitted === true) {
          this.bootstrapAppliedSequence = Math.max(this.bootstrapAppliedSequence, requestSequence);
        }
        if (auditTraceId) {
          invitationAuditLog('frontend.bootstrap.apply-error', {
            auditTraceId,
            auditSource,
            requestSequence,
            deviceId: sessionContext.deviceId,
            controlStateCommitted: error?.p2pBootstrapControlStateCommitted === true,
            error: invitationAuditError(error),
            ...XXXsenXXX({ backendBootstrapResponse: data, bootstrapState: this.bootstrapState, error })
          });
        }
        throw error;
      }
    });
    this.bootstrapApplyQueue = applyTask.catch(() => null);
    return applyTask;
  }

  async start(user = {}) {
    const userId = String(user.userId || '').trim();
    if (!userId) throw new Error('No se pudo identificar la cuenta para iniciar la sincronización.');
    if (this.started || this.stopPromise) await this.stop();

    this.user = user;
    this.deviceId = getOrCreateDeviceId(userId);
    this.manualClose = false;
    this.started = true;
    this.sessionGeneration += 1;
    this.bootstrapRequestSequence = 0;
    this.bootstrapAppliedSequence = 0;
    this.bootstrapMinimumApplicableSequence = 0;
    this.bootstrapApplyQueue = Promise.resolve();
    this.pipelineGeneration += 1;
    this.eventPipeline = Promise.resolve();
    this.eventPipelineBlocked = false;
    this.clearAtomicTransportBatchTimer();
    this.pendingAtomicEventBatches.clear();
    this.lastProcessedSequence = 0;
    this.lastAcceptedStreamSequence = 0;
    this.highestPendingAck = 0;
    this.ackGeneration += 1;
    this.ackPromise = null;
    this.ackRetryCount = 0;
    this.pendingReplicaHealthSpaceIds.clear();
    this.replicaHealthConvergenceAttempts.clear();
    this.invitationEscrowRecoveryAttempts.clear();
    this.rejectedKeyEnvelopeSources.clear();
    this.clearRejectedKeyEnvelopeRetryTimers();
    this.rejectedSnapshotSources.clear();
    const sessionContext = this.captureSessionContext();

    try {
      await setP2PStorageUser(userId);
      this.assertSessionContext(sessionContext);
      await this.activateDeviceCryptoIdentity(userId, this.deviceId);
      this.assertSessionContext(sessionContext);
      this.recoveryRequirements = await getRecoveryRequirements();
      this.assertSessionContext(sessionContext);
      this.snapshotRecoveryRequired = Object.keys(this.recoveryRequirements).length > 0;
      this.bootstrapState = await this.loadLocalBootstrap(user, sessionContext);
      this.assertSessionContext(sessionContext);
      if (this.snapshotRecoveryRequired) this.scheduleSnapshotRecovery(SNAPSHOT_RECOVERY_FALLBACK_MS);
      window.removeEventListener('online', this.boundOnline);
      window.removeEventListener('pageshow', this.boundForegroundRecovery);
      if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', this.boundForegroundRecovery);
      window.removeEventListener('p2p:rate-limited', this.boundRateLimited);
      window.addEventListener('online', this.boundOnline);
      window.addEventListener('pageshow', this.boundForegroundRecovery);
      if (typeof document !== 'undefined') document.addEventListener('visibilitychange', this.boundForegroundRecovery);
      window.addEventListener('p2p:rate-limited', this.boundRateLimited);
      this.tabCoordinationReady = false;
      this.realtimeLeader = await this.tabCoordinator.start({
        userId: sessionContext.userId,
        deviceId: sessionContext.deviceId,
        applicationId: P2P_APPLICATION_ID,
        onMessage: (message) => this.handleTabMessage(message, sessionContext),
        onLeadershipChange: (isLeader) => this.queueLeadershipChange(isLeader, sessionContext)
      });
      this.assertSessionContext(sessionContext);
      this.activeLeaderTabId = this.realtimeLeader ? String(this.tabCoordinator.tabId || '').trim() : '';
      this.activeLeaderToken = this.realtimeLeader ? String(this.tabCoordinator.leadershipToken || '').trim() : '';
      this.activeLeaderMessageAt = this.realtimeLeader ? Date.now() : 0;
      this.clearPendingTabStateRequest();
      this.bindTabRelays(sessionContext);
      if (this.realtimeLeader) {
        await this.ensureLocalTransport(sessionContext);
        this.assertSessionContext(sessionContext);
      }
      if (!this.realtimeLeader && this.snapshotRecoveryTimer) {
        window.clearTimeout(this.snapshotRecoveryTimer);
        this.snapshotRecoveryTimer = 0;
        this.snapshotRecoveryDueAt = 0;
      }

      let backendReady = false;
      try {
        await this.fetchBootstrap(this.realtimeLeader ? 'new-device' : false);
        this.assertSessionContext(sessionContext);
        backendReady = true;
      } catch (error) {
        if (this.isSessionContextChangedError(error)) throw error;
        if (isDeviceIdentityConflict(error)) {
          const recovered = await this.restartWithFreshDeviceIdentity(error);
          if (recovered) return this.bootstrapState;
        }
        if (!this.isRetryableTransportError(error)) {
          if (this.isSessionContextCurrent(sessionContext)) await this.stop();
          throw error;
        }
        this.scheduleServerRecovery(error, 'bootstrap-start');
      }

      this.assertSessionContext(sessionContext);
      if (backendReady && this.realtimeLeader) {
        await this.flushOutbox().catch((error) => {
          if (this.isSessionContextChangedError(error)) throw error;
          dispatch('p2p:error', { error, stage: 'outbox-start' });
          return null;
        });
        this.assertSessionContext(sessionContext);
        if (this.realtimeLeader) {
          await this.openRealtime().catch((error) => {
            if (this.isSessionContextChangedError(error)) throw error;
            dispatch('p2p:error', { error, stage: 'realtime' });
            return null;
          });
          this.assertSessionContext(sessionContext);
        }
        if (this.realtimeLeader) {
          await this.registerExistingPushSubscription().catch((error) => {
            if (this.isSessionContextChangedError(error)) throw error;
            return false;
          });
          this.assertSessionContext(sessionContext);
        }
      } else if (!backendReady) {
        dispatch('p2p:connection', { state: 'disconnected', deviceId: sessionContext.deviceId, localOnly: true });
      } else {
        dispatch('p2p:connection', { state: 'connecting', deviceId: sessionContext.deviceId, sharedTab: true });
        this.requestTabState('startup-follower');
      }
      this.tabCoordinationReady = true;
      this.assertSessionContext(sessionContext);
      if (this.realtimeLeader) this.scheduleLocalCapabilityRefresh({ reason: 'startup' }, sessionContext);
      if (this.realtimeLeader) {
        if (backendReady) this.scheduleReplicaHealthRefresh(this.readableSpaceIds(), { delayMs: 500 });
      }
      dispatch('p2p:ready', { client: this, state: this.bootstrapState, localOnly: !backendReady, sharedTab: !this.realtimeLeader });
      return this.bootstrapState;
    } catch (error) {
      if (this.isSessionContextChangedError(error)) {
        await this.stop().catch(() => null);
        throw error;
      }
      if (this.isSessionContextCurrent(sessionContext)) await this.stop();
      throw error;
    }
  }

  async stop(options = {}) {
    if (!options.preserveIdentityRecovery) {
      this.identityRecoveryGeneration += 1;
      this.identityRecoveryPromise = null;
      this.identityRecoveryRestarting = false;
    }
    if (this.stopPromise) return this.stopPromise;

    const pendingBootstrap = this.bootstrapApplyQueue;
    const pendingTabStateReconcile = this.tabStateReconcileTask;
    const pendingLocalCapabilityRefresh = this.localCapabilityRefreshPromise;
    const pendingLifecycleFinalizationObserver = this.lifecycleFinalizationObserverPromise;
    this.localCapabilityRefreshPromise = null;
    this.lifecycleFinalizationObserverPromise = null;
    this.sessionGeneration += 1;
    this.bootstrapRequestSequence += 1;
    this.bootstrapAppliedSequence = 0;
    this.bootstrapMinimumApplicableSequence = this.bootstrapRequestSequence;
    this.bootstrapApplyQueue = Promise.resolve();
    this.manualClose = true;
    this.started = false;
    this.tabCoordinationReady = false;
    this.realtimeLeader = false;
    this.activeLeaderTabId = '';
    this.activeLeaderToken = '';
    this.activeLeaderMessageAt = 0;
    this.clearPendingTabStateRequest();
    this.clearLocalCapabilityRefreshTimer();
    this.clearLifecycleFinalizationObserver();
    this.lifecycleFinalizationFailures.clear();
    this.localCapabilityRefreshAttempt = 0;
    this.tabStateReconcileRequested = false;
    this.tabStateReconcileForceSnapshots = false;
    this.tabStateReconcileRunning = false;
    this.tabStateReconcileTask = Promise.resolve();
    this.pipelineGeneration += 1;
    this.clearAtomicTransportBatchTimer();
    this.pendingAtomicEventBatches.clear();
    window.removeEventListener('online', this.boundOnline);
    window.removeEventListener('pageshow', this.boundForegroundRecovery);
    if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', this.boundForegroundRecovery);
    window.removeEventListener('p2p:rate-limited', this.boundRateLimited);
    this.unbindTabRelays();
    const pendingTabCoordinator = this.tabCoordinator.stop().catch(() => null);
    const pendingLocalTransport = this.stopLocalTransport();
    const pendingLeadership = options.skipLeadershipWait ? Promise.resolve() : this.leadershipTask;
    this.leadershipTask = Promise.resolve();
    if (this.retryTimer) window.clearTimeout(this.retryTimer);
    this.clearServerRecoveryTimer();
    if (this.ackTimer) window.clearTimeout(this.ackTimer);
    if (this.replicaHealthTimer) window.clearTimeout(this.replicaHealthTimer);
    if (this.snapshotRecoveryTimer) window.clearTimeout(this.snapshotRecoveryTimer);
    this.retryTimer = 0;
    this.ackTimer = 0;
    this.replicaHealthTimer = 0;
    this.pendingReplicaHealthSpaceIds.clear();
    this.replicaHealthConvergenceAttempts.clear();
    this.replicaHealthRecoveryCooldownUntil.clear();
    this.replicaHealthRecoveryPromise = null;
    this.pendingAckReplicaSpaceIds.clear();
    this.ackGeneration += 1;
    this.ackPromise = null;
    this.ackRetryCount = 0;
    this.snapshotRecoveryTimer = 0;
    this.snapshotRecoveryDueAt = 0;
    this.snapshotRecoveryRequired = false;
    this.recoveryRequirements = {};
    this.highestPendingAck = 0;
    this.openPromise = null;
    this.foregroundRecoveryPromise = null;
    if (this.eventSource) this.eventSource.close();
    this.eventSource = null;

    const stopping = (async () => {
      const pendingPipeline = this.eventPipeline;
      await Promise.all([
        pendingPipeline.catch(() => null),
        pendingBootstrap.catch(() => null),
        pendingTabStateReconcile.catch(() => null),
        pendingLocalCapabilityRefresh?.catch(() => null),
        pendingLifecycleFinalizationObserver?.catch(() => null),
        pendingLeadership.catch(() => null),
        pendingTabCoordinator,
        pendingLocalTransport.catch(() => null)
      ]);
      this.eventPipeline = Promise.resolve();
      this.eventPipelineBlocked = false;
      this.lastProcessedSequence = 0;
      this.lastAcceptedStreamSequence = 0;
      closeP2PCryptoContext();
      this.deviceEncryptionPublicKey = null;
      this.deviceSigningPublicKey = null;
      this.localCapabilityAuthority = null;
      this.localCapability = null;
      this.invitationEscrowAuthority = null;
      this.invitationEscrowMaxBytes = 0;
      this.keyRequestTimes.clear();
      this.missingSpaceKeyRecoveryPromises.clear();
      this.invitationEscrowRecoveryAttempts.clear();
      this.rejectedKeyEnvelopeSources.clear();
      this.clearRejectedKeyEnvelopeRetryTimers();
      this.rejectedSnapshotSources.clear();
      this.user = null;
      this.deviceId = '';
      await setP2PStorageUser('');
    })();

    this.stopPromise = stopping;
    try {
      return await stopping;
    } finally {
      if (this.stopPromise === stopping) this.stopPromise = null;
    }
  }

  async refreshBootstrap({ requestSnapshots = false, snapshotSpaceIds = [], auditTraceId = '', auditSource = '', requestMaxAttempts = 3 } = {}) {
    const sessionContext = this.captureSessionContext();
    this.assertSessionContext(sessionContext);
    const snapshotMode = requestSnapshots === true ? 'force' : requestSnapshots;
    this.nextBootstrapSnapshotSpaceIds = normalizeSnapshotSpaceIds(snapshotSpaceIds);
    const state = await this.fetchBootstrap(snapshotMode, { auditTraceId, auditSource, requestMaxAttempts });
    this.assertSessionContext(sessionContext);
    dispatch('p2p:state', { state });
    return state;
  }

  async recoverMissingProjectRoots(spaceIds = [], auditContext = {}) {
    const normalizedSpaceIds = normalizeSnapshotSpaceIds(spaceIds);
    if (!normalizedSpaceIds.length) return this.bootstrapState;
    const sessionContext = this.captureSessionContext();
    this.assertSessionContext(sessionContext);
    const auditTraceId = String(auditContext?.auditTraceId || '').trim() || createInvitationAuditTraceId('incomplete_invitation');
    const auditSource = String(auditContext?.source || auditContext?.auditSource || 'missing-project-root-recovery').trim();
    const projectRootLoaded = (entities = []) => (Array.isArray(entities) ? entities : []).some((entity) => (
      String(entity?.entityType || '').trim() === 'admin.project'
      && String(entity?.entityId || '').trim() === 'project'
      && entity?.deleted !== true
      && entity?.confirmedDeleted !== true
      && entity?.value
      && typeof entity.value === 'object'
      && !Array.isArray(entity.value)
    ));
    const acceptedInvitationForSpace = (spaceId = '') => (this.bootstrapState.invitations?.received || [])
      .filter((invitation) => String(invitation?.spaceId || '').trim() === spaceId
        && String(invitation?.status || '').trim().toLowerCase() === 'accepted')
      .sort((left, right) => (Date.parse(right?.respondedAt || right?.updatedAt || right?.createdAt || '') || 0)
        - (Date.parse(left?.respondedAt || left?.updatedAt || left?.createdAt || '') || 0))[0] || null;

    let unresolvedSpaceIds = [...normalizedSpaceIds];
    let latestState = this.bootstrapState;
    const attemptsAudit = [];

    for (let attempt = 1; attempt <= INCOMPLETE_INVITATION_RECOVERY_MAX_ATTEMPTS && unresolvedSpaceIds.length; attempt += 1) {
      this.assertSessionContext(sessionContext);
      const currentTargets = [...unresolvedSpaceIds];
      invitationAuditLog('frontend.incomplete-recovery.attempt.begin', {
        auditTraceId,
        auditSource,
        attempt,
        maxAttempts: INCOMPLETE_INVITATION_RECOVERY_MAX_ATTEMPTS,
        spaceIds: currentTargets,
        deviceId: sessionContext.deviceId
      });

      let bootstrapError = null;
      try {
        latestState = await this.refreshBootstrap({
          requestSnapshots: 'force',
          snapshotSpaceIds: currentTargets,
          auditTraceId,
          auditSource: `${auditSource}:attempt-${attempt}`,
          // Este watchdog ya ejecuta exactamente tres ciclos. Cada ciclo hace una
          // sola solicitud para que un 5xx persistente no se convierta en 9 requests.
          requestMaxAttempts: 1
        });
      } catch (error) {
        if (this.isSessionContextChangedError(error)) throw error;
        bootstrapError = error;
        invitationAuditLog('frontend.incomplete-recovery.attempt.bootstrap-error', {
          auditTraceId,
          auditSource,
          attempt,
          maxAttempts: INCOMPLETE_INVITATION_RECOVERY_MAX_ATTEMPTS,
          spaceIds: currentTargets,
          deviceId: sessionContext.deviceId,
          error: invitationAuditError(error),
          ...XXXsenXXX({ error, bootstrapState: this.bootstrapState })
        });
      }
      this.assertSessionContext(sessionContext);

      const attemptSpaces = [];
      const nextUnresolved = [];
      for (const spaceId of currentTargets) {
        this.assertSessionContext(sessionContext);
        const space = (this.bootstrapState.spaces || []).find((candidate) => String(candidate?.spaceId || '').trim() === spaceId) || null;
        const invitation = acceptedInvitationForSpace(spaceId);
        let directRecovery = null;
        let directRecoveryError = null;
        if (space && invitation && Math.max(0, Number(space?.encryptionVersion || 0)) >= 1) {
          try {
            directRecovery = await this.recoverAcceptedInvitationBootstrap(
              space,
              this.bootstrapState.invitations?.received || [],
              sessionContext,
              {
                forceSnapshot: true,
                deferKeyWait: false,
                ignoreCooldown: true,
                auditTraceId
              }
            );
          } catch (error) {
            if (this.isSessionContextChangedError(error)) throw error;
            directRecoveryError = error;
          }
        }
        const entities = await listEntities(spaceId).catch(() => []);
        this.assertSessionContext(sessionContext);
        const loaded = projectRootLoaded(entities);
        if (!loaded) nextUnresolved.push(spaceId);
        const reason = loaded
          ? 'project_root_loaded'
          : directRecoveryError?.code || directRecoveryError?.message
            || directRecovery?.reason
            || bootstrapError?.code || bootstrapError?.message
            || (!space ? 'space_missing_from_bootstrap' : !invitation ? 'accepted_invitation_missing' : 'project_root_missing');
        attemptSpaces.push({
          spaceId,
          loaded,
          invitationId: String(invitation?.invitationId || '').trim(),
          invitationGroupId: String(invitation?.invitationGroupId || '').trim(),
          invitationScope: String(invitation?.invitationScope || '').trim(),
          authorizationState: String(space?.authorizationState || '').trim(),
          authorizationPendingReason: String(space?.authorizationPendingReason || '').trim(),
          directRecovery: directRecovery ? {
            recovered: directRecovery.recovered === true,
            reason: String(directRecovery.reason || '').trim()
          } : null,
          directRecoveryError: invitationAuditError(directRecoveryError),
          reason,
          entities: invitationAuditEntitySummary(entities),
          rawAudit: { invitation, space, directRecovery, directRecoveryError, entities }
        });
      }
      unresolvedSpaceIds = nextUnresolved;
      attemptsAudit.push({ attempt, spaces: attemptSpaces.map(({ rawAudit, ...summary }) => summary) });
      invitationAuditLog('frontend.incomplete-recovery.attempt.result', {
        auditTraceId,
        auditSource,
        attempt,
        maxAttempts: INCOMPLETE_INVITATION_RECOVERY_MAX_ATTEMPTS,
        unresolvedSpaceIds,
        spaces: attemptSpaces.map(({ rawAudit, ...summary }) => summary),
        deviceId: sessionContext.deviceId,
        ...XXXsenXXX({ spaces: attemptSpaces.map((item) => item.rawAudit), bootstrapState: this.bootstrapState })
      });
      if (!unresolvedSpaceIds.length) {
        invitationAuditLog('frontend.incomplete-recovery.complete', {
          auditTraceId,
          auditSource,
          attemptsUsed: attempt,
          recoveredSpaceIds: normalizedSpaceIds,
          deviceId: sessionContext.deviceId
        });
        return {
          ...latestState,
          invitationRecovery: {
            completed: true,
            discarded: false,
            attemptsUsed: attempt,
            recoveredSpaceIds: normalizedSpaceIds,
            unresolvedSpaceIds: [],
            attempts: attemptsAudit
          }
        };
      }
      if (attempt < INCOMPLETE_INVITATION_RECOVERY_MAX_ATTEMPTS) {
        await new Promise((resolve) => window.setTimeout(resolve, INCOMPLETE_INVITATION_RECOVERY_RETRY_BASE_MS * attempt));
      }
    }

    this.assertSessionContext(sessionContext);
    const receivedAccepted = (this.bootstrapState.invitations?.received || [])
      .filter((invitation) => String(invitation?.status || '').trim().toLowerCase() === 'accepted');
    const failedInvitations = unresolvedSpaceIds.map((spaceId) => acceptedInvitationForSpace(spaceId)).filter(Boolean);
    const failedGroupIds = new Set(failedInvitations
      .filter((invitation) => String(invitation?.invitationScope || '').trim().toLowerCase() === 'panel')
      .map((invitation) => String(invitation?.invitationGroupId || '').trim())
      .filter(Boolean));
    const cleanupInvitations = receivedAccepted.filter((invitation) => {
      const invitationId = String(invitation?.invitationId || '').trim();
      const spaceId = String(invitation?.spaceId || '').trim();
      const groupId = String(invitation?.invitationGroupId || '').trim();
      return failedInvitations.some((failed) => String(failed?.invitationId || '').trim() === invitationId)
        || (groupId && failedGroupIds.has(groupId))
        || (unresolvedSpaceIds.includes(spaceId) && invitationId);
    });
    const cleanupInvitationIds = Array.from(new Set(cleanupInvitations.map((invitation) => String(invitation?.invitationId || '').trim()).filter(Boolean)));
    const terminalAudit = [];
    for (const spaceId of unresolvedSpaceIds) {
      const entities = await listEntities(spaceId).catch(() => []);
      const space = (this.bootstrapState.spaces || []).find((candidate) => String(candidate?.spaceId || '').trim() === spaceId) || null;
      const invitation = acceptedInvitationForSpace(spaceId);
      terminalAudit.push({
        spaceId,
        invitationId: String(invitation?.invitationId || '').trim(),
        invitationGroupId: String(invitation?.invitationGroupId || '').trim(),
        authorizationState: String(space?.authorizationState || '').trim(),
        authorizationPendingReason: String(space?.authorizationPendingReason || '').trim(),
        entities: invitationAuditEntitySummary(entities),
        rawAudit: { invitation, space, entities }
      });
    }
    const currentUserId = String(this.user?.userId || '').trim();
    const protectedOwnedSpaceIds = terminalAudit
      .filter((item) => currentUserId && String(item?.rawAudit?.space?.ownerUserId || '').trim() === currentUserId)
      .map((item) => item.spaceId);
    const cleanupSpaceIds = unresolvedSpaceIds.filter((spaceId) => !protectedOwnedSpaceIds.includes(spaceId));

    invitationAuditLog('frontend.incomplete-recovery.exhausted', {
      auditTraceId,
      auditSource,
      attempts: INCOMPLETE_INVITATION_RECOVERY_MAX_ATTEMPTS,
      unresolvedSpaceIds,
      cleanupSpaceIds,
      protectedOwnedSpaceIds,
      cleanupInvitationIds,
      spaces: terminalAudit.map(({ rawAudit, ...summary }) => summary),
      deviceId: sessionContext.deviceId,
      ...XXXsenXXX({ bootstrapState: this.bootstrapState, spaces: terminalAudit.map((item) => item.rawAudit), attemptsAudit })
    });

    if (!cleanupInvitationIds.length && !cleanupSpaceIds.length) {
      invitationAuditLog('frontend.incomplete-recovery.cleanup-skipped-owner', {
        auditTraceId,
        auditSource,
        attempts: INCOMPLETE_INVITATION_RECOVERY_MAX_ATTEMPTS,
        unresolvedSpaceIds,
        protectedOwnedSpaceIds,
        deviceId: sessionContext.deviceId
      });
      return {
        ...latestState,
        invitationRecovery: {
          completed: false,
          discarded: false,
          cleanupPending: false,
          cleanupSkipped: true,
          attemptsUsed: INCOMPLETE_INVITATION_RECOVERY_MAX_ATTEMPTS,
          recoveredSpaceIds: normalizedSpaceIds.filter((spaceId) => !unresolvedSpaceIds.includes(spaceId)),
          unresolvedSpaceIds,
          cleanupInvitationIds: [],
          protectedSpaceIds: protectedOwnedSpaceIds,
          attempts: attemptsAudit
        }
      };
    }

    let cleanup = null;
    try {
      cleanup = await apiPost('/api/p2p/invitations/recovery-cleanup', {
        invitationIds: cleanupInvitationIds,
        spaceIds: cleanupSpaceIds,
        deviceId: sessionContext.deviceId,
        auditTraceId,
        attempts: INCOMPLETE_INVITATION_RECOVERY_MAX_ATTEMPTS,
        reason: 'project_root_missing_after_retries',
        diagnostic: {
          unresolvedSpaceIds,
          cleanupSpaceIds,
          protectedOwnedSpaceIds,
          reasons: terminalAudit.map((item) => item.authorizationPendingReason || 'project_root_missing')
        }
      });
    } catch (error) {
      if (this.isSessionContextChangedError(error)) throw error;
      invitationAuditLog('frontend.incomplete-recovery.cleanup-error', {
        auditTraceId,
        auditSource,
        attempts: INCOMPLETE_INVITATION_RECOVERY_MAX_ATTEMPTS,
        unresolvedSpaceIds,
        cleanupInvitationIds,
        deviceId: sessionContext.deviceId,
        error: invitationAuditError(error),
        ...XXXsenXXX({ error, bootstrapState: this.bootstrapState, spaces: terminalAudit.map((item) => item.rawAudit) })
      });
      return {
        ...latestState,
        invitationRecovery: {
          completed: false,
          discarded: false,
          cleanupPending: true,
          attemptsUsed: INCOMPLETE_INVITATION_RECOVERY_MAX_ATTEMPTS,
          recoveredSpaceIds: normalizedSpaceIds.filter((spaceId) => !unresolvedSpaceIds.includes(spaceId)),
          unresolvedSpaceIds,
          cleanupInvitationIds,
          attempts: attemptsAudit,
          cleanupError: invitationAuditError(error)
        }
      };
    }

    this.assertSessionContext(sessionContext);
    const removedSpaceIds = normalizeSnapshotSpaceIds(cleanup?.removedSpaceIds || []);
    const protectedSpaceIds = normalizeSnapshotSpaceIds([
      ...protectedOwnedSpaceIds,
      ...(Array.isArray(cleanup?.protectedSpaceIds) ? cleanup.protectedSpaceIds : [])
    ]);
    for (const spaceId of removedSpaceIds) {
      await purgeLocalSpace(spaceId).catch(() => null);
      await purgeSpaceCrypto(spaceId).catch(() => null);
      this.removeSpaceFromBootstrapState(spaceId);
    }
    this.recoveryRequirements = await getRecoveryRequirements();
    this.snapshotRecoveryRequired = Object.keys(this.recoveryRequirements).length > 0;
    latestState = await this.refreshBootstrap({
      requestSnapshots: false,
      auditTraceId,
      auditSource: `${auditSource}:post-cleanup`
    }).catch((error) => {
      if (this.isSessionContextChangedError(error)) throw error;
      return this.bootstrapState;
    });
    this.assertSessionContext(sessionContext);
    invitationAuditLog('frontend.incomplete-recovery.cleanup-complete', {
      auditTraceId,
      auditSource,
      attempts: INCOMPLETE_INVITATION_RECOVERY_MAX_ATTEMPTS,
      cleanupInvitationIds,
      cleanedInvitationIds: Array.isArray(cleanup?.cleanedInvitationIds) ? cleanup.cleanedInvitationIds : [],
      removedSpaceIds,
      protectedSpaceIds,
      deviceId: sessionContext.deviceId,
      ...XXXsenXXX({ cleanupResponse: cleanup, bootstrapState: this.bootstrapState, terminalAudit: terminalAudit.map((item) => item.rawAudit) })
    });
    if (removedSpaceIds.length) {
      dispatch('p2p:invitation-recovery-discarded', {
        invitationIds: cleanupInvitationIds,
        spaceIds: removedSpaceIds,
        attempts: INCOMPLETE_INVITATION_RECOVERY_MAX_ATTEMPTS,
        auditTraceId
      });
    }
    return {
      ...latestState,
      invitationRecovery: {
        completed: false,
        discarded: removedSpaceIds.length > 0,
        cleanupPending: false,
        attemptsUsed: INCOMPLETE_INVITATION_RECOVERY_MAX_ATTEMPTS,
        recoveredSpaceIds: normalizedSpaceIds.filter((spaceId) => !removedSpaceIds.includes(spaceId) && !unresolvedSpaceIds.includes(spaceId)),
        unresolvedSpaceIds: unresolvedSpaceIds.filter((spaceId) => !removedSpaceIds.includes(spaceId)),
        cleanupInvitationIds,
        cleanedInvitationIds: Array.isArray(cleanup?.cleanedInvitationIds) ? cleanup.cleanedInvitationIds : [],
        removedSpaceIds,
        protectedSpaceIds,
        attempts: attemptsAudit
      }
    };
  }

  async recoverForeground() {
    if (!this.started || this.manualClose || !getSessionToken() || navigator.onLine === false) return false;
    if (!this.realtimeLeader) {
      this.requestTabState('foreground-resume');
      return false;
    }
    if (this.foregroundRecoveryPromise) return this.foregroundRecoveryPromise;
    const recovery = this.recoverOnline();
    this.foregroundRecoveryPromise = recovery;
    try {
      return await recovery;
    } finally {
      if (this.foregroundRecoveryPromise === recovery) this.foregroundRecoveryPromise = null;
    }
  }

  async recoverOnline() {
    if (!this.started || this.manualClose || !getSessionToken()) return false;
    const sessionContext = this.captureSessionContext();
    if (!this.realtimeLeader) {
      const acquired = await this.tabCoordinator.requestLeadership();
      this.assertSessionContext(sessionContext);
      if (!acquired) this.requestTabState('online-follower');
      return acquired;
    }
    try {
      this.lifecycleFinalizationFailures.clear();
      await this.refreshBootstrap({ requestSnapshots: 'new-device' });
      this.assertSessionContext(sessionContext);
      await this.flushOutbox();
      this.assertSessionContext(sessionContext);
      await this.openRealtime();
      this.assertSessionContext(sessionContext);
      this.scheduleAck(Math.max(this.highestPendingAck, this.lastProcessedSequence), { immediate: true });
      this.scheduleReplicaHealthRefresh(this.readableSpaceIds());
      await this.registerExistingPushSubscription().catch((error) => {
        if (this.isSessionContextChangedError(error)) throw error;
        return false;
      });
      this.assertSessionContext(sessionContext);
      this.clearServerRecoveryTimer();
      return true;
    } catch (error) {
      if (isDeviceIdentityConflict(error)) {
        return this.restartWithFreshDeviceIdentity(error);
      }
      if (this.isSessionContextChangedError(error)) return false;
      if (this.scheduleServerRecovery(error, 'recover-online')) return false;
      throw error;
    }
  }

  abortRealtimeForReplay(error, stage = 'event-parse') {
    this.clearAtomicTransportBatchTimer();
    this.pendingAtomicEventBatches.clear();
    this.eventPipelineBlocked = true;
    dispatch('p2p:error', { error, stage });
    this.scheduleReconnect();
  }

  async openRealtime() {
    if (!this.started || this.manualClose || !getSessionToken() || !this.realtimeLeader) return null;
    const sessionContext = this.captureSessionContext();
    this.assertSessionContext(sessionContext);
    if (this.openPromise) return this.openPromise;
    if (this.eventSource && this.eventSource.readyState !== EventSource.CLOSED) return this.eventSource;

    const opening = (async () => {
      if (this.eventPipelineBlocked) {
        this.pipelineGeneration += 1;
        await this.eventPipeline.catch(() => null);
        this.assertSessionContext(sessionContext);
        this.eventPipeline = Promise.resolve();
        this.eventPipelineBlocked = false;
        this.clearAtomicTransportBatchTimer();
        this.pendingAtomicEventBatches.clear();
      }
      const cursor = Number(await getMeta(`${CURSOR_META_PREFIX}${sessionContext.deviceId}`, 0) || 0);
      this.assertSessionContext(sessionContext);
      this.lastProcessedSequence = Math.max(this.lastProcessedSequence, cursor);
      this.lastAcceptedStreamSequence = cursor;
      const tokenData = await apiPost('/api/p2p/realtime/token', { deviceId: sessionContext.deviceId });
      this.assertSessionContext(sessionContext);
      if (this.manualClose || !getSessionToken() || !this.realtimeLeader) return null;
      const token = encodeURIComponent(tokenData.realtimeToken || '');
      if (!token) throw new Error('No se pudo preparar la sincronización en tiempo real.');
      const source = new EventSource(`${getBackendUrl()}/api/p2p/realtime/stream?realtimeToken=${token}&cursor=${encodeURIComponent(cursor)}&p2pApplication=${encodeURIComponent(P2P_APPLICATION_ID)}`);
      const isCurrentSource = () => this.realtimeLeader
        && this.eventSource === source
        && this.isSessionContextCurrent(sessionContext);
      let readyReceived = false;
      let readyTimer = window.setTimeout(() => {
        readyTimer = 0;
        if (readyReceived || !isCurrentSource()) return;
        const error = new Error('El canal en tiempo real no confirmó su estado listo dentro del tiempo permitido.');
        error.code = 'P2P_REALTIME_READY_TIMEOUT';
        error.retryable = true;
        dispatch('p2p:error', { error, stage: 'realtime-ready-timeout' });
        dispatch('p2p:connection', { state: 'disconnected', deviceId: sessionContext.deviceId });
        if (this.eventSource === source) this.eventSource = null;
        source.close();
        this.scheduleReconnect();
      }, REALTIME_READY_TIMEOUT_MS);
      const clearReadyTimer = () => {
        if (!readyTimer) return;
        window.clearTimeout(readyTimer);
        readyTimer = 0;
      };
      source.addEventListener('p2p_ready', () => {
        if (!isCurrentSource()) {
          source.close();
          return;
        }
        readyReceived = true;
        clearReadyTimer();
        this.retryCount = 0;
        this.scheduleAck(this.lastProcessedSequence, { immediate: true });
        dispatch('p2p:connection', { state: 'connected', deviceId: sessionContext.deviceId });
      });
      source.addEventListener('p2p_gap', (event) => {
        if (!isCurrentSource()) {
          source.close();
          return;
        }
        try {
          const payload = JSON.parse(event.data || '{}');
          const gapEvent = {
            ...payload,
            eventId: payload.eventId || createId('gap'),
            eventType: 'p2p.delivery.gap'
          };
          assertRealtimeEventEnvelope(gapEvent, { gap: true });
          this.enqueueEvent(gapEvent).catch(() => null);
        } catch (error) {
          console.error('[SemillaP2P] No se pudo interpretar el aviso de recuperación:', error);
          const protocolError = String(error?.code || '').startsWith('P2P_REALTIME_')
            ? error
            : realtimeProtocolError(
              'El stream entregó un aviso de recuperación con JSON inválido.',
              'P2P_REALTIME_GAP_INVALID_JSON',
              { cause: error }
            );
          this.abortRealtimeForReplay(
            protocolError,
            protocolError.code === 'P2P_REALTIME_GAP_INVALID_JSON' ? 'delivery-gap-parse' : 'delivery-gap-envelope'
          );
        }
      });
      source.addEventListener('p2p_event', (event) => {
        if (!isCurrentSource()) {
          source.close();
          return;
        }
        try {
          const payload = JSON.parse(event.data || '{}');
          assertRealtimeEventEnvelope(payload);
          this.enqueueEvent(payload).catch(() => null);
        } catch (error) {
          console.error('[SemillaP2P] No se pudo interpretar el evento:', error);
          const protocolError = String(error?.code || '').startsWith('P2P_REALTIME_')
            ? error
            : realtimeProtocolError(
              'El stream entregó un evento con JSON inválido y debe reproducirse desde el último cursor confirmado.',
              'P2P_REALTIME_EVENT_INVALID_JSON',
              { cause: error }
            );
          this.abortRealtimeForReplay(
            protocolError,
            protocolError.code === 'P2P_REALTIME_EVENT_INVALID_JSON' ? 'event-parse' : 'event-envelope'
          );
        }
      });
      source.onerror = () => {
        clearReadyTimer();
        if (!isCurrentSource()) {
          source.close();
          return;
        }
        dispatch('p2p:connection', { state: 'disconnected', deviceId: sessionContext.deviceId });
        if (this.manualClose || !getSessionToken()) {
          source.close();
          return;
        }
        this.scheduleReconnect();
      };
      try {
        this.assertSessionContext(sessionContext);
        if (!this.realtimeLeader) {
          clearReadyTimer();
          source.close();
          return null;
        }
      } catch (error) {
        clearReadyTimer();
        source.close();
        throw error;
      }
      this.eventSource = source;
      return source;
    })();

    this.openPromise = opening;
    try {
      return await opening;
    } catch (error) {
      if (this.isSessionContextCurrent(sessionContext)
        && !this.manualClose
        && this.started
        && this.realtimeLeader
        && getSessionToken()) {
        dispatch('p2p:connection', { state: 'disconnected', deviceId: sessionContext.deviceId });
        if (this.isRetryableTransportError(error)) this.scheduleReconnect();
      }
      throw error;
    } finally {
      if (this.openPromise === opening) this.openPromise = null;
    }
  }

  scheduleReconnect() {
    if (this.retryTimer || this.manualClose || !this.started || !this.realtimeLeader) return;
    const sessionContext = this.captureSessionContext();
    if (!this.isSessionContextCurrent(sessionContext)) return;
    if (this.eventSource) this.eventSource.close();
    this.eventSource = null;
    const delay = Math.min(30000, RETRY_BASE_MS * (2 ** Math.min(this.retryCount, 5)));
    this.retryCount += 1;
    this.retryTimer = window.setTimeout(() => {
      this.retryTimer = 0;
      if (!this.isSessionContextCurrent(sessionContext)) return;
      this.openRealtime().catch((error) => {
        if (this.isSessionContextChangedError(error)) return;
        this.scheduleReconnect();
      });
    }, delay);
  }

  clearAtomicTransportBatchTimer() {
    if (this.atomicBatchAssemblyTimer) window.clearTimeout(this.atomicBatchAssemblyTimer);
    this.atomicBatchAssemblyTimer = 0;
  }

  armAtomicTransportBatchTimer(descriptor = {}) {
    this.clearAtomicTransportBatchTimer();
    const pendingKey = String(descriptor.key || '').trim();
    const generation = this.pipelineGeneration;
    const sessionContext = this.captureSessionContext();
    this.atomicBatchAssemblyTimer = window.setTimeout(() => {
      this.atomicBatchAssemblyTimer = 0;
      if (
        generation !== this.pipelineGeneration
        || !this.isSessionContextCurrent(sessionContext)
        || !pendingKey
        || !this.pendingAtomicEventBatches.has(pendingKey)
      ) return;

      const error = new Error('El stream dejó incompleto un lote atómico durante demasiado tiempo.');
      error.code = 'P2P_ATOMIC_BATCH_TIMEOUT';
      this.eventPipelineBlocked = true;
      this.pendingAtomicEventBatches.clear();
      dispatch('p2p:error', { error, stage: 'event-batch-timeout' });
      this.scheduleReconnect();
    }, ATOMIC_BATCH_ASSEMBLY_TIMEOUT_MS);
  }

  collectAtomicTransportBatch(event = {}) {
    const descriptor = describeAtomicTransportBatchEvent(event);
    if (!descriptor) {
      if (this.pendingAtomicEventBatches.size > 0) {
        this.clearAtomicTransportBatchTimer();
        const error = new Error('El stream interrumpió un lote atómico antes de entregar todas sus operaciones.');
        error.code = 'P2P_ATOMIC_BATCH_INCOMPLETE';
        throw error;
      }
      return { events: [event], buffered: false };
    }

    for (const [pendingKey] of this.pendingAtomicEventBatches) {
      if (pendingKey === descriptor.key) continue;
      this.clearAtomicTransportBatchTimer();
      const error = new Error('El stream intercaló otro evento dentro de un lote atómico.');
      error.code = 'P2P_ATOMIC_BATCH_INTERLEAVED';
      throw error;
    }

    let pending = this.pendingAtomicEventBatches.get(descriptor.key);
    if (!pending) {
      pending = {
        descriptor,
        events: new Array(descriptor.batchSize).fill(null)
      };
      this.pendingAtomicEventBatches.set(descriptor.key, pending);
      this.armAtomicTransportBatchTimer(descriptor);
    }
    if (pending.descriptor.batchSize !== descriptor.batchSize) {
      this.clearAtomicTransportBatchTimer();
      const error = new Error('El relay cambió el tamaño declarado del mismo lote atómico.');
      error.code = 'P2P_ATOMIC_BATCH_CONFLICT';
      throw error;
    }

    const existing = pending.events[descriptor.batchIndex];
    if (existing) {
      const sameEvent = String(existing.eventId || '').trim() === String(event.eventId || '').trim()
        && String(existing.operation?.operationId || '').trim() === descriptor.operationId
        && eventCursorSequence(existing) === eventCursorSequence(event);
      if (!sameEvent) {
        this.clearAtomicTransportBatchTimer();
        const error = new Error('El mismo índice del lote atómico llegó con contenido diferente.');
        error.code = 'P2P_ATOMIC_BATCH_CONFLICT';
        throw error;
      }
    } else {
      pending.events[descriptor.batchIndex] = event;
    }

    if (pending.events.some((candidate) => !candidate)) {
      return {
        buffered: true,
        batchId: descriptor.batchId,
        received: pending.events.filter(Boolean).length,
        expected: descriptor.batchSize
      };
    }

    this.clearAtomicTransportBatchTimer();
    const ordered = normalizeAtomicTransportBatchEvents(pending.events);
    this.pendingAtomicEventBatches.delete(descriptor.key);
    return { events: ordered, buffered: false, atomic: true };
  }

  enqueueEvent(event = {}) {
    let collection;
    try {
      collection = this.collectAtomicTransportBatch(event);
    } catch (error) {
      this.clearAtomicTransportBatchTimer();
      this.pendingAtomicEventBatches.clear();
      this.eventPipelineBlocked = true;
      dispatch('p2p:error', { error, stage: 'event-batch-assembly' });
      this.scheduleReconnect();
      return Promise.reject(error);
    }
    if (collection.buffered) return Promise.resolve(collection);

    const events = collection.events || [event];
    const generation = this.pipelineGeneration;
    const sessionContext = this.captureSessionContext();
    const task = this.eventPipeline.then(async () => {
      if (
        generation !== this.pipelineGeneration
        || !this.isSessionContextCurrent(sessionContext)
        || this.eventPipelineBlocked
      ) {
        return { skipped: true, reason: 'inactive_pipeline' };
      }
      return events.length > 1
        ? this.handleEventBatch(events, sessionContext)
        : this.handleEvent(events[0], sessionContext);
    });
    this.eventPipeline = task.catch((error) => {
      if (this.isSessionContextChangedError(error) || !this.isSessionContextCurrent(sessionContext)) {
        return { skipped: true, reason: 'session_changed' };
      }
      this.eventPipelineBlocked = true;
      console.error('[SemillaP2P] No se pudo aplicar el evento:', error);
      dispatch('p2p:error', { error, stage: events.length > 1 ? 'event-batch' : 'event' });
      this.scheduleReconnect();
      return null;
    });
    return task;
  }

  async applyDecryptedOperationEvent(event = {}, sessionContext = this.captureSessionContext(), options = {}) {
    this.assertSessionContext(sessionContext);
    assertCanonicalOperationEnvelope(event);
    const applyResult = await applyP2PEvent(event);
    this.assertSessionContext(sessionContext);
    await this.rememberProjectLifecycleReceipt(event, sessionContext);
    this.assertSessionContext(sessionContext);
    if (event.operation?.type === 'snapshot.complete') {
      if (applyResult?.snapshotIncomplete) {
        const deterministicRejection = ['invalid_snapshot_complete', 'snapshot_integrity_mismatch']
          .includes(String(applyResult.reason || '').trim());
        const excludedDeviceIds = deterministicRejection
          ? this.rememberRejectedSnapshotSource(event.spaceId, event.sourceDeviceId)
          : this.rejectedSnapshotSourceDeviceIds(event.spaceId);
        dispatch('p2p:snapshot-incomplete', {
          event,
          result: applyResult,
          sourceRejected: deterministicRejection,
          excludedDeviceIds
        });
        this.snapshotRecoveryRequired = true;
        this.scheduleSnapshotRecovery(
          deterministicRejection ? SNAPSHOT_REJECTION_RETRY_MS : SNAPSHOT_RECOVERY_FALLBACK_MS,
          { replace: true }
        );
      } else {
        this.forgetRejectedSnapshotSource(event.spaceId, event.sourceDeviceId);
        const sourceStateRevision = Math.max(0, Number(
          applyResult?.sourceStateRevision
          || event.operation?.payload?.sourceStateRevision
          || 0
        ));
        this.recoveryRequirements = await resolveRecoveryRequirement(event.spaceId, sourceStateRevision);
        this.assertSessionContext(sessionContext);
        dispatch('p2p:snapshot-complete', {
          event,
          result: applyResult,
          deferredReplay: options.deferredReplay === true,
          recoveryRequirements: this.recoveryRequirements
        });
        await this.reconcileSnapshotRecovery(sessionContext);
        this.assertSessionContext(sessionContext);
        await this.confirmRecoveredReplicaAuthorization(event.spaceId, sessionContext);
        this.assertSessionContext(sessionContext);
      }
    } else {
      if (event.operation?.type === 'snapshot.chunk'
        && applyResult?.snapshotIncomplete
        && String(applyResult.reason || '').trim() === 'invalid_snapshot_chunk') {
        const excludedDeviceIds = this.rememberRejectedSnapshotSource(event.spaceId, event.sourceDeviceId);
        this.snapshotRecoveryRequired = true;
        this.scheduleSnapshotRecovery(SNAPSHOT_REJECTION_RETRY_MS, { replace: true });
        dispatch('p2p:snapshot-source-rejected', {
          event,
          result: applyResult,
          excludedDeviceIds
        });
      }
      dispatch('p2p:operation', { event, result: applyResult, deferredReplay: options.deferredReplay === true });
      if (this.isSpaceReplicaRecoveryPending(event.spaceId)) {
        await this.reconcileSnapshotRecovery(sessionContext);
        this.assertSessionContext(sessionContext);
        await this.confirmRecoveredReplicaAuthorization(event.spaceId, sessionContext);
        this.assertSessionContext(sessionContext);
      }
    }
    return applyResult;
  }

  async applyDecryptedOperationEventBatch(events = [], sessionContext = this.captureSessionContext(), options = {}) {
    this.assertSessionContext(sessionContext);
    const ordered = normalizeAtomicTransportBatchEvents(events);
    ordered.forEach((event) => assertCanonicalOperationEnvelope(event));
    const applyResult = await applyP2PEventBatch(ordered);
    this.assertSessionContext(sessionContext);
    const results = Array.isArray(applyResult?.results) ? applyResult.results : [];
    ordered.forEach((event, index) => {
      dispatch('p2p:operation', {
        event,
        result: results[index] || null,
        deferredReplay: options.deferredReplay === true,
        batchAtomic: true,
        batchId: String(event.batchId || '').trim(),
        batchIndex: Number(event.batchIndex || 0),
        batchSize: Number(event.batchSize || ordered.length)
      });
      if (options.outboxConfirmed === true) {
        dispatch('p2p:operation-outbox-confirmed', {
          event,
          replayedFromOutbox: true,
          orderedSourceFallback: options.orderedSourceFallback === true,
          batchId: String(event.batchId || '').trim(),
          batchAtomic: true
        });
      }
    });
    dispatch('p2p:operation-batch', {
      events: ordered,
      result: applyResult,
      batchId: String(ordered[0]?.batchId || '').trim(),
      batchSize: ordered.length,
      deferredReplay: options.deferredReplay === true,
      outboxConfirmed: options.outboxConfirmed === true
    });
    const pendingRecoverySpaceIds = Array.from(new Set(ordered
      .map((event) => String(event?.spaceId || '').trim())
      .filter((spaceId) => spaceId && this.isSpaceReplicaRecoveryPending(spaceId))));
    if (pendingRecoverySpaceIds.length) {
      await this.reconcileSnapshotRecovery(sessionContext);
      this.assertSessionContext(sessionContext);
      for (const spaceId of pendingRecoverySpaceIds) {
        await this.confirmRecoveredReplicaAuthorization(spaceId, sessionContext);
        this.assertSessionContext(sessionContext);
      }
    }
    return applyResult;
  }

  async handleEventBatch(events = [], sessionContext = this.captureSessionContext()) {
    this.assertSessionContext(sessionContext);
    const ordered = normalizeAtomicTransportBatchEvents(events);
    assertRealtimeSequenceContinuity(ordered, this.lastAcceptedStreamSequence);
    const decryptedEvents = [];
    let deferred = false;
    let rejected = false;
    try {
      for (const event of ordered) {
        this.assertEncryptedTransportEvent(event);
        decryptedEvents.push(await decryptOperationEvent(event));
        this.assertSessionContext(sessionContext);
      }
      await this.applyDecryptedOperationEventBatch(decryptedEvents, sessionContext);
    } catch (error) {
      if (isRejectedEncryptedPayloadError(error)) {
        rejected = true;
        this.rejectEncryptedTransportEvents(ordered, error);
        this.assertSessionContext(sessionContext);
      } else {
        if (error?.code !== 'P2P_SPACE_KEY_MISSING') throw error;
        deferred = true;
        for (const event of ordered) {
          await deferEncryptedEvent(event, error);
          this.assertSessionContext(sessionContext);
        }
        await this.requestSpaceKey(ordered[0].spaceId, error.keyId).catch(() => false);
        this.assertSessionContext(sessionContext);
        dispatch('p2p:crypto-locked', {
          spaceId: ordered[0].spaceId,
          keyId: error.keyId,
          events: ordered,
          batchId: String(ordered[0].batchId || '').trim(),
          batchAtomic: true
        });
      }
    }

    const spaceId = String(ordered[0].spaceId || '').trim();
    if (spaceId) this.pendingAckReplicaSpaceIds.add(spaceId);
    const nextCursor = ordered.reduce((maximum, event) => Math.max(maximum, eventCursorSequence(event)), this.lastProcessedSequence);
    if (nextCursor > this.lastProcessedSequence) {
      await setMeta(`${CURSOR_META_PREFIX}${sessionContext.deviceId}`, nextCursor);
      this.assertSessionContext(sessionContext);
      this.lastProcessedSequence = nextCursor;
    }
    this.lastAcceptedStreamSequence = nextCursor;
    this.scheduleAck(nextCursor);
    return {
      applied: !deferred && !rejected,
      deferred,
      rejected,
      atomic: true,
      batchId: String(ordered[0].batchId || '').trim(),
      count: ordered.length,
      cursor: nextCursor
    };
  }

  async handleKeyRequestEvent(event = {}, sessionContext = this.captureSessionContext()) {
    this.assertSessionContext(sessionContext);
    const requestDevice = event.data?.requestDevice || {};
    if (!event.spaceId || !requestDevice.deviceId || requestDevice.deviceId === this.deviceId) return false;
    if (String(event.sourceDeviceId || '').trim() !== String(requestDevice.deviceId || '').trim()) {
      throw new Error('La solicitud de clave no coincide con el dispositivo emisor del evento.');
    }
    const requestedKeyId = String(event.data?.keyId || '').trim();
    const keyEpoch = Math.max(0, Number(event.data?.keyEpoch || 0));
    const authority = this.spaceEncryptionAuthority(event.spaceId);
    const obsoleteAuthority = authority.keyEpoch > keyEpoch
      || (authority.keyEpoch === keyEpoch && authority.keyId && authority.keyId !== requestedKeyId);
    if (obsoleteAuthority) {
      dispatch('p2p:key-request-obsolete', { spaceId: event.spaceId, keyId: requestedKeyId, keyEpoch });
      return false;
    }
    if (!requestedKeyId || !(await hasSpaceKey(event.spaceId, requestedKeyId))) return false;
    try {
      await this.sendSpaceKeyEnvelope(event.spaceId, requestDevice, requestedKeyId);
      await activateSpaceKey(event.spaceId, requestedKeyId, { keyEpoch });
      await this.advanceSpaceKeyAuthority(event.spaceId, requestedKeyId, keyEpoch);
    } catch (error) {
      if (error?.code === 'P2P_KEY_EPOCH_STALE' || Number(error?.status || error?.statusCode || 0) === 409) {
        dispatch('p2p:key-request-obsolete', { spaceId: event.spaceId, keyId: requestedKeyId, keyEpoch });
        return false;
      }
      throw error;
    }
    this.assertSessionContext(sessionContext);
    dispatch('p2p:key-shared', { spaceId: event.spaceId, targetDeviceId: requestDevice.deviceId });
    return true;
  }

  async handleKeyEnvelopeEvent(event = {}, sessionContext = this.captureSessionContext()) {
    this.assertSessionContext(sessionContext);
    const envelope = event.data?.envelope || {};
    if (String(event.sourceDeviceId || '').trim() !== String(envelope.senderDeviceId || '').trim()) {
      throw new Error('El sobre cifrado no coincide con el dispositivo emisor del evento.');
    }
    if (String(envelope.recipientDeviceId || '').trim() !== this.deviceId) {
      throw new Error('El sobre cifrado no está dirigido a este dispositivo.');
    }
    const keyEpoch = Math.max(0, Number(event.data?.keyEpoch || 0));
    const authority = this.spaceEncryptionAuthority(event.spaceId);
    const obsoleteAuthority = authority.keyEpoch > keyEpoch
      || (authority.keyEpoch === keyEpoch && authority.keyId && authority.keyId !== String(envelope.keyId || '').trim());
    if (obsoleteAuthority) {
      dispatch('p2p:key-envelope-obsolete', { spaceId: event.spaceId, keyId: envelope.keyId, keyEpoch });
      return { imported: false, reason: 'stale_authority', keyId: envelope.keyId, keyEpoch };
    }
    let result;
    try {
      result = await importSpaceKeyEnvelope(event.spaceId, envelope, { keyEpoch });
    } catch (error) {
      if (error?.code === 'P2P_KEY_EPOCH_STALE') {
        dispatch('p2p:key-envelope-obsolete', { spaceId: event.spaceId, keyId: envelope.keyId, keyEpoch });
        return { imported: false, reason: 'stale_epoch', keyId: envelope.keyId, keyEpoch };
      }
      if (!isRejectedKeyEnvelopeError(error)) throw error;
      this.assertSessionContext(sessionContext);
      const rejectedSourceDeviceId = String(event.sourceDeviceId || envelope.senderDeviceId || '').trim();
      const excludedDeviceIds = this.rememberRejectedKeyEnvelopeSource(
        event.spaceId,
        envelope.keyId,
        keyEpoch,
        rejectedSourceDeviceId
      );
      let requested = false;
      let requestError = null;
      try {
        requested = await this.requestSpaceKey(event.spaceId, envelope.keyId, {
          force: true,
          excludeDeviceIds
        });
      } catch (retryError) {
        if (this.isSessionContextChangedError(retryError)) throw retryError;
        requestError = retryError;
      }
      this.assertSessionContext(sessionContext);
      const retryScheduled = this.scheduleRejectedKeyEnvelopeRetry(event.spaceId, envelope.keyId, keyEpoch);
      dispatch('p2p:key-envelope-rejected', {
        spaceId: event.spaceId,
        keyId: envelope.keyId,
        keyEpoch,
        sourceDeviceId: rejectedSourceDeviceId,
        reason: error.reason || 'invalid_envelope',
        requested,
        retryScheduled,
        excludedDeviceIds,
        requestError
      });
      return {
        imported: false,
        reason: 'rejected_envelope',
        keyId: envelope.keyId,
        keyEpoch,
        requested,
        retryScheduled,
        excludedDeviceIds
      };
    }
    this.assertSessionContext(sessionContext);
    if (!result.imported) return result;
    this.clearRejectedKeyEnvelopeSources(event.spaceId, result.keyId, keyEpoch);
    await this.advanceSpaceKeyAuthority(event.spaceId, result.keyId, keyEpoch);
    this.assertSessionContext(sessionContext);
    const replayed = await this.replayDeferredEncryptedEvents(event.spaceId, sessionContext);
    this.assertSessionContext(sessionContext);
    if (replayed > 0) this.scheduleReplicaHealthRefresh([event.spaceId]);
    dispatch('p2p:key-received', { spaceId: event.spaceId, keyId: result.keyId, replayed });
    return { ...result, replayed };
  }

  async handleEvent(event = {}, sessionContext = this.captureSessionContext()) {
    this.assertSessionContext(sessionContext);
    assertRealtimeEventEnvelope(event, { gap: event?.eventType === 'p2p.delivery.gap' });
    if (event.eventType !== 'p2p.delivery.gap') {
      assertRealtimeSequenceContinuity([event], this.lastAcceptedStreamSequence);
    }
    if (event.eventType === 'p2p.delivery.gap') {
      await this.fenceBootstrapResponses(sessionContext);
      const currentSequence = Math.max(0, Number(event.currentSequence || 0));
      const cursorResetRequired = event.cursorResetRequired === true
        && event.reason === 'cursor_ahead_of_server';
      if (cursorResetRequired) {
        await this.resetDeliveryCursor(currentSequence, sessionContext);
      } else {
        this.lastAcceptedStreamSequence = currentSequence;
      }
      this.snapshotRecoveryRequired = true;
      dispatch('p2p:delivery-gap', { event, gap: event });
      const state = await this.refreshBootstrap({ requestSnapshots: 'force' });
      this.assertSessionContext(sessionContext);
      if (!this.snapshotRecoveryRequired) {
        const nextCursor = cursorResetRequired
          ? currentSequence
          : Math.max(this.lastProcessedSequence, currentSequence);
        if (nextCursor !== this.lastProcessedSequence) {
          await setMeta(`${CURSOR_META_PREFIX}${sessionContext.deviceId}`, nextCursor);
          this.assertSessionContext(sessionContext);
          this.lastProcessedSequence = nextCursor;
        }
        this.scheduleAck(nextCursor);
      } else if (!(state.snapshotRequests || []).length) {
        this.scheduleSnapshotRecovery(SNAPSHOT_RECOVERY_FALLBACK_MS, { replace: true });
      }
      dispatch('p2p:delivery-recovery', {
        event,
        state,
        snapshotRequired: this.snapshotRecoveryRequired
      });
    } else if (event.eventType === 'p2p.operation') {
      try {
        this.assertEncryptedTransportEvent(event);
        const decryptedEvent = await decryptOperationEvent(event);
        this.assertSessionContext(sessionContext);
        await this.applyDecryptedOperationEvent(decryptedEvent, sessionContext);
      } catch (error) {
        if (isRejectedEncryptedPayloadError(error)) {
          this.rejectEncryptedTransportEvents([event], error);
          this.assertSessionContext(sessionContext);
        } else {
          if (error?.code !== 'P2P_SPACE_KEY_MISSING') throw error;
          await deferEncryptedEvent(event, error);
          this.assertSessionContext(sessionContext);
          await this.requestSpaceKey(event.spaceId, error.keyId).catch(() => false);
          this.assertSessionContext(sessionContext);
          dispatch('p2p:crypto-locked', { spaceId: event.spaceId, keyId: error.keyId, event });
        }
      }
    } else if (event.eventType === 'p2p.key.request') {
      await this.handleKeyRequestEvent(event, sessionContext);
    } else if (event.eventType === 'p2p.key.envelope') {
      await this.handleKeyEnvelopeEvent(event, sessionContext);
    } else if (event.eventType === 'p2p.replica.topology.changed') {
      if (event.spaceId) this.scheduleReplicaHealthRefresh([event.spaceId], { delayMs: 350 });
      dispatch('p2p:replica-topology', { event });
    } else if (event.eventType === 'p2p.snapshot.request') {
      try {
        const sent = await this.sendSnapshot(event);
        this.assertSessionContext(sessionContext);
        if (sent && event.spaceId) this.scheduleReplicaHealthRefresh([event.spaceId], { delayMs: 750 });
        dispatch('p2p:snapshot-source', { event, sent });
      } catch (error) {
        if (this.isSessionContextChangedError(error)) throw error;
        dispatch('p2p:snapshot-source-error', {
          event,
          error,
          retryable: this.isRetryableTransportError(error)
        });
      }
    } else if (event.eventType === 'p2p.lifecycle.progress') {
      const transaction = this.lifecycleTransactionFromControl(event);
      this.rememberLifecycleTransaction(transaction);
      dispatch('p2p:lifecycle-progress', { transaction, event });
    } else if (event.eventType === 'p2p.lifecycle.finalize') {
      const transaction = this.lifecycleTransactionFromControl(event);
      const nestedEvent = event.data?.event || {};
      await this.finalizeLifecycleFromEvent(transaction, nestedEvent, sessionContext, 'realtime');
    } else if (event.eventType === 'p2p.lifecycle.remote-purge') {
      await this.fenceBootstrapResponses(sessionContext);
      const transaction = this.lifecycleTransactionFromControl(event);
      const cleanSpaceId = String(transaction.spaceId || '').trim();
      if (cleanSpaceId) {
        await this.rememberLifecycleReceipt({
          transactionId: transaction.transactionId,
          action: 'purge',
          spaceId: cleanSpaceId,
          operationId: transaction.operationId,
          sourceDeviceId: transaction.sourceDeviceId,
          remoteEventId: event.eventId,
          appliedStateRevision: 0,
          status: 'prepared'
        }, sessionContext);
        this.assertSessionContext(sessionContext);
        const purge = await purgeLocalSpace(cleanSpaceId);
        await purgeSpaceCrypto(cleanSpaceId).catch(() => null);
        this.assertSessionContext(sessionContext);
        await this.rememberLifecycleReceipt({
          transactionId: transaction.transactionId,
          action: 'purge',
          spaceId: cleanSpaceId,
          operationId: transaction.operationId,
          sourceDeviceId: transaction.sourceDeviceId,
          remoteEventId: event.eventId,
          appliedStateRevision: 0,
          status: 'completed'
        }, sessionContext);
        this.assertSessionContext(sessionContext);
        this.removeSpaceFromBootstrapState(cleanSpaceId);
        dispatch('p2p:space-deleted', {
          spaceId: cleanSpaceId,
          source: 'lifecycle-remote-purge',
          purge,
          event,
          pendingAuthoritativeDeletion: true
        });
      }
    } else if (event.eventType === 'p2p.space.deleted') {
      await this.fenceBootstrapResponses(sessionContext);
      const cleanSpaceId = String(event.spaceId || event.data?.spaceId || '').trim();
      if (cleanSpaceId) {
        const purge = await purgeLocalSpace(cleanSpaceId);
        await purgeSpaceCrypto(cleanSpaceId).catch(() => null);
        this.assertSessionContext(sessionContext);
        this.removeSpaceFromBootstrapState(cleanSpaceId);
        this.recoveryRequirements = await updateRecoveryRequirements({
          retainSpaceIds: this.readableSpaceIds()
        });
        this.assertSessionContext(sessionContext);
        this.snapshotRecoveryRequired = Object.keys(this.recoveryRequirements).length > 0;
        dispatch('p2p:space-deleted', {
          spaceId: cleanSpaceId,
          source: 'realtime',
          purge,
          event
        });
      }
      await this.refreshBootstrap({ requestSnapshots: false }).catch((error) => {
        if (this.isSessionContextChangedError(error)) throw error;
        return null;
      });
      this.assertSessionContext(sessionContext);
    } else if (event.eventType === 'p2p.membership.revoked') {
      await this.fenceBootstrapResponses(sessionContext);
      const revokedUserId = String(event.data?.revokedUserId || '').trim();
      const currentUserId = String(this.user?.userId || '').trim();
      if (revokedUserId && revokedUserId === currentUserId && event.spaceId) {
        const purge = await purgeLocalSpace(event.spaceId);
        await purgeSpaceCrypto(event.spaceId).catch(() => null);
        this.assertSessionContext(sessionContext);
        this.removeSpaceFromBootstrapState(event.spaceId);
        this.recoveryRequirements = await updateRecoveryRequirements({
          retainSpaceIds: this.readableSpaceIds()
        });
        this.assertSessionContext(sessionContext);
        this.snapshotRecoveryRequired = Object.keys(this.recoveryRequirements).length > 0;
        dispatch('p2p:access-revoked', {
          spaceIds: [event.spaceId],
          source: 'realtime',
          purge,
          event
        });
      }
      await this.refreshBootstrap({ requestSnapshots: false }).catch((error) => {
        if (this.isSessionContextChangedError(error)) throw error;
        return null;
      });
      this.assertSessionContext(sessionContext);
    } else if (event.eventType === 'p2p.membership.changed') {
      await this.fenceBootstrapResponses(sessionContext);
      // El evento contiene un grafo canónico, pero la autorización vigente se toma
      // siempre del bootstrap autoritativo. A diferencia de una revocación dirigida
      // (que purga antes) o una invitación (que persiste su documento antes), aquí no
      // existe un cambio local seguro que permita confirmar la cola si esa lectura
      // falla. Propagar el error conserva el cursor durable, fuerza replay y evita
      // retirar de Redis el único aviso de permisos/propiedad todavía no aplicado.
      const state = await this.refreshBootstrap({ requestSnapshots: false });
      this.assertSessionContext(sessionContext);
      const canonicalSpace = (state?.spaces || []).find((space) => space?.spaceId === event.spaceId) || null;
      if (!canonicalSpace) {
        throw realtimeProtocolError(
          'El bootstrap autoritativo no confirmó el proyecto afectado por el cambio de membresía.',
          'P2P_REALTIME_MEMBERSHIP_STATE_MISSING',
          { eventId: event.eventId, spaceId: event.spaceId }
        );
      }
      dispatch('p2p:membership', { event, space: canonicalSpace });
    } else if (event.eventType?.startsWith('p2p.invitation.')) {
      await this.fenceBootstrapResponses(sessionContext);
      const invitation = event.data?.invitation;
      const space = event.data?.space;
      const requiresSnapshotRecovery = event.eventType === 'p2p.invitation.accepted';
      const committedControlState = prepareCommittedControlState({
        spaces: space ? [space] : [],
        invitations: invitation ? [invitation] : []
      }, {
        authorizationState: requiresSnapshotRecovery ? 'unconfirmed' : 'confirmed',
        currentSpaces: this.bootstrapState.spaces || []
      });
      await saveControlStateAtomically(committedControlState);
      this.assertSessionContext(sessionContext);
      this.applyCommittedControlState(committedControlState, { source: 'realtime-invitation' });
      this.assertSessionContext(sessionContext);

      if (requiresSnapshotRecovery) {
        const state = await this.refreshBootstrap({ requestSnapshots: 'force' });
        this.assertSessionContext(sessionContext);
        const cleanSpaceId = String(space?.spaceId || event.spaceId || '').trim();
        const localStateRevisions = await listStateRevisions([cleanSpaceId]);
        this.assertSessionContext(sessionContext);
        const replicaState = assertAcceptedInvitationReplicaState(state, cleanSpaceId, {
          code: 'P2P_REALTIME_INVITATION_REPLICA_UNCONFIRMED',
          message: 'El bootstrap autoritativo no confirmó la membresía necesaria después de aceptar la invitación.',
          invitationId: invitation?.invitationId,
          eventId: event.eventId,
          localStateRevision: localStateRevisions?.[cleanSpaceId],
          recoveryRequirements: this.recoveryRequirements,
          allowReplicaPending: true
        });
        if (replicaState.replicaPending) {
          dispatch('p2p:replica-recovery-pending', {
            spaceIds: [cleanSpaceId],
            invitationId: invitation?.invitationId,
            source: 'realtime-invitation'
          });
        }
      } else {
        await this.refreshBootstrap({ requestSnapshots: false }).catch((error) => {
          if (this.isSessionContextChangedError(error)) throw error;
          dispatch('p2p:bootstrap-deferred', {
            error,
            stage: 'realtime-invitation',
            invitationId: String(invitation?.invitationId || '').trim()
          });
          return this.bootstrapState;
        });
        this.assertSessionContext(sessionContext);
      }
      dispatch('p2p:invitation', {
        event,
        invitation,
        space,
        replicaPending: requiresSnapshotRecovery
          ? this.isSpaceReplicaRecoveryPending(String(space?.spaceId || event.spaceId || '').trim())
          : false
      });
    } else {
      dispatch('p2p:event', { event });
    }

    this.assertSessionContext(sessionContext);
    const operationType = String(event.operation?.type || '').trim();
    if (
      event.eventType === 'p2p.operation'
      && event.spaceId
      && (isEntityOperationType(operationType) || operationType === 'snapshot.chunk' || operationType === 'snapshot.complete')
    ) {
      this.pendingAckReplicaSpaceIds.add(String(event.spaceId).trim());
    }
    const sequence = eventCursorSequence(event);
    if (sequence > 0) {
      const nextCursor = Math.max(this.lastProcessedSequence, sequence);
      if (nextCursor > this.lastProcessedSequence) {
        await setMeta(`${CURSOR_META_PREFIX}${sessionContext.deviceId}`, nextCursor);
        this.assertSessionContext(sessionContext);
        this.lastProcessedSequence = nextCursor;
      }
      this.lastAcceptedStreamSequence = nextCursor;
      this.scheduleAck(nextCursor);
    }
  }

  ackRetryDelay() {
    const exponent = Math.min(5, Math.max(0, this.ackRetryCount - 1));
    return Math.min(ACK_RETRY_MAX_MS, ACK_RETRY_BASE_MS * (2 ** exponent));
  }

  scheduleAck(sequence = 0, options = {}) {
    const sessionContext = this.captureSessionContext();
    const ackGeneration = this.ackGeneration;
    if (!this.isSessionContextCurrent(sessionContext)) return;
    this.highestPendingAck = Math.max(this.highestPendingAck, Number(sequence || 0));
    if (
      !this.highestPendingAck
      || this.ackTimer
      || this.ackPromise
      || this.manualClose
      || !this.started
      || !this.realtimeLeader
      || !getSessionToken()
      || !navigator.onLine
    ) return;

    const delay = options.immediate === true
      ? 0
      : options.retry === true
        ? this.ackRetryDelay()
        : ACK_BATCH_DELAY_MS;

    this.ackTimer = window.setTimeout(() => {
      this.ackTimer = 0;
      if (
        ackGeneration !== this.ackGeneration
        || !this.isSessionContextCurrent(sessionContext)
        || this.manualClose
        || !this.started
        || !this.realtimeLeader
        || !getSessionToken()
        || !navigator.onLine
        || this.ackPromise
      ) return;

      const deliverySequence = this.highestPendingAck;
      if (!deliverySequence) return;
      const replicaSpaceIds = [...this.pendingAckReplicaSpaceIds];
      this.pendingAckReplicaSpaceIds.clear();
      this.highestPendingAck = 0;
      let retryRequired = false;

      const ackTask = (async () => {
        let appliedStateRevisions = {};
        let localReplicaReadDeferred = false;
        try {
          if (replicaSpaceIds.length) {
            try {
              appliedStateRevisions = await listStateRevisions(replicaSpaceIds);
              this.assertSessionContext(sessionContext);
            } catch (error) {
              if (this.isSessionContextChangedError(error)) throw error;
              localReplicaReadDeferred = true;
              dispatch('p2p:replica-report-deferred', {
                error,
                deviceId: sessionContext.deviceId,
                spaceIds: replicaSpaceIds,
                stage: 'local-state-read'
              });
            }
          }
          const lifecycleReceipts = await this.completedLifecycleReceipts(null, sessionContext);
          this.assertSessionContext(sessionContext);
          const ackResult = await apiPost('/api/p2p/events/ack', {
            deviceId: sessionContext.deviceId,
            deviceSequence: deliverySequence,
            deliverySequence,
            appliedStateRevisions,
            lifecycleReceipts
          });
          this.assertSessionContext(sessionContext);
          if (ackGeneration !== this.ackGeneration) return;
          const replicaRevisionHints = ackResult.replicaRevisionHints || ackResult.replicaRevisions || {};
          const refreshSpaceIds = Array.from(new Set([
            ...replicaSpaceIds,
            ...Object.keys(replicaRevisionHints)
          ]));
          if (refreshSpaceIds.length && (localReplicaReadDeferred || ackResult.replicaReportDeferred === true)) {
            for (const spaceId of refreshSpaceIds) this.pendingReplicaHealthSpaceIds.add(spaceId);
          }
          this.scheduleReplicaHealthRefresh(refreshSpaceIds.length ? refreshSpaceIds : this.readableSpaceIds());
          if (ackResult.lifecycleReconciliationDeferred === true && this.realtimeLeader) {
            this.refreshBootstrap({ requestSnapshots: false }).catch((error) => {
              if (!this.isSessionContextChangedError(error)) {
                dispatch('p2p:lifecycle-reconciliation-deferred', { error, source: 'ack' });
              }
            });
          }
          if (this.isSessionContextCurrent(sessionContext) && this.realtimeLeader) {
            this.ackRetryCount = 0;
          }
        } catch (error) {
          if (ackGeneration !== this.ackGeneration
            || !this.isSessionContextCurrent(sessionContext)
            || !this.realtimeLeader) return;
          if (error?.code === 'P2P_ACK_SEQUENCE_AHEAD') {
            this.highestPendingAck = 0;
            this.pendingAckReplicaSpaceIds.clear();
            this.ackRetryCount = 0;
            dispatch('p2p:ack-reset-required', {
              error,
              deviceId: sessionContext.deviceId,
              requestedSequence: deliverySequence,
              currentSequence: Number(error.currentSequence || 0)
            });
            this.scheduleReconnect();
            return;
          }
          this.highestPendingAck = Math.max(this.highestPendingAck, deliverySequence);
          for (const spaceId of replicaSpaceIds) this.pendingAckReplicaSpaceIds.add(spaceId);
          this.ackRetryCount = Math.min(30, this.ackRetryCount + 1);
          retryRequired = true;
          dispatch('p2p:ack-deferred', {
            error,
            deviceId: sessionContext.deviceId,
            deviceSequence: this.highestPendingAck,
            retryDelayMs: this.ackRetryDelay(),
            offline: !navigator.onLine
          });
        } finally {
          if (this.ackPromise === ackTask) this.ackPromise = null;
          if (
            ackGeneration !== this.ackGeneration
            || !this.isSessionContextCurrent(sessionContext)
            || this.manualClose
            || !this.started
            || !this.realtimeLeader
            || !this.highestPendingAck
            || !navigator.onLine
          ) return;
          this.scheduleAck(this.highestPendingAck, { retry: retryRequired });
        }
      })();

      this.ackPromise = ackTask;
    }, delay);
  }

  async waitForInvitationSourceRevision(
    spaceId = '',
    targetRevision = 0,
    sessionContext = this.captureSessionContext(),
    timeoutMs = INVITATION_SOURCE_SYNC_WAIT_MS
  ) {
    this.assertSessionContext(sessionContext);
    const cleanSpaceId = String(spaceId || '').trim();
    const requiredRevision = Math.max(0, Number(targetRevision || 0));
    if (!cleanSpaceId || requiredRevision <= 0) return true;

    const localIsCurrent = async () => {
      const revisions = await listStateRevisions([cleanSpaceId]);
      this.assertSessionContext(sessionContext);
      return Math.max(0, Number(revisions?.[cleanSpaceId] || 0)) >= requiredRevision;
    };
    if (await localIsCurrent()) return true;

    const safeTimeoutMs = Math.max(1000, Number(timeoutMs || INVITATION_SOURCE_SYNC_WAIT_MS));
    return new Promise((resolve, reject) => {
      let settled = false;
      let checking = false;
      let timer = 0;
      const eventNames = ['p2p:snapshot-complete', 'p2p:operation', 'p2p:state'];
      const cleanup = () => {
        if (timer) window.clearTimeout(timer);
        for (const eventName of eventNames) window.removeEventListener(eventName, onSignal);
      };
      const finish = (value, error = null) => {
        if (settled) return;
        settled = true;
        cleanup();
        if (error) reject(error);
        else resolve(value);
      };
      const onSignal = (event) => {
        if (settled || checking) return;
        const eventSpaceId = String(
          event?.detail?.event?.spaceId
          || event?.detail?.spaceId
          || ''
        ).trim();
        if (eventSpaceId && eventSpaceId !== cleanSpaceId) return;
        checking = true;
        localIsCurrent().then((current) => {
          if (current) finish(true);
        }).catch((error) => {
          if (this.isSessionContextChangedError(error)) finish(false, error);
        }).finally(() => {
          checking = false;
        });
      };
      for (const eventName of eventNames) window.addEventListener(eventName, onSignal);
      timer = window.setTimeout(() => finish(false), safeTimeoutMs);
      onSignal({ detail: {} });
    });
  }

  async ensureInvitationSourceCurrent(spaceId = '', sessionContext = this.captureSessionContext()) {
    this.assertSessionContext(sessionContext);
    const cleanSpaceId = String(spaceId || '').trim();
    if (!cleanSpaceId) return { current: true, localStateRevision: 0, backendStateRevision: 0 };

    await this.refreshBootstrap({
      requestSnapshots: 'force',
      snapshotSpaceIds: [cleanSpaceId]
    });
    this.assertSessionContext(sessionContext);

    const revisions = await listStateRevisions([cleanSpaceId]);
    this.assertSessionContext(sessionContext);
    let localStateRevision = Math.max(0, Number(revisions?.[cleanSpaceId] || 0));
    const backendStateRevision = Math.max(0, Number(this.bootstrapState?.stateRevisions?.[cleanSpaceId] || 0));
    if (localStateRevision >= backendStateRevision) {
      return { current: true, localStateRevision, backendStateRevision };
    }

    const synchronized = await this.waitForInvitationSourceRevision(
      cleanSpaceId,
      backendStateRevision,
      sessionContext
    );
    this.assertSessionContext(sessionContext);
    if (synchronized) {
      const refreshed = await listStateRevisions([cleanSpaceId]);
      this.assertSessionContext(sessionContext);
      localStateRevision = Math.max(0, Number(refreshed?.[cleanSpaceId] || 0));
      if (localStateRevision >= backendStateRevision) {
        return { current: true, localStateRevision, backendStateRevision };
      }
    }

    const error = new Error('Este dispositivo todavía está recuperando la versión más reciente del proyecto. La invitación no se enviará con una copia desactualizada.');
    error.code = 'P2P_INVITATION_SOURCE_SYNC_PENDING';
    error.status = 409;
    error.spaceId = cleanSpaceId;
    error.localStateRevision = localStateRevision;
    error.backendStateRevision = backendStateRevision;
    throw error;
  }

  async buildInvitationBootstrapEscrow(spaceId = '', sessionContext = this.captureSessionContext(), auditContext = {}) {
    this.assertSessionContext(sessionContext);
    const cleanSpaceId = String(spaceId || '').trim();
    if (!cleanSpaceId || !this.spaceRequiresEncryption(cleanSpaceId)) return null;
    const authority = this.invitationEscrowAuthority;
    if (!authority?.publicKey || !String(authority?.deviceId || '').trim()) {
      const error = new Error('memoriaBACKEND no tiene configurada la entrega cifrada inmediata para invitaciones.');
      error.code = 'P2P_INVITATION_ESCROW_UNAVAILABLE';
      error.status = 503;
      error.spaceId = cleanSpaceId;
      throw error;
    }

    const activeKey = await this.ensureCurrentSpaceKey(cleanSpaceId, { requireAuthority: true, allowOwnerRecoveryRotation: true });
    this.assertSessionContext(sessionContext);
    if (navigator.onLine && getSessionToken()) {
      await this.flushOutbox();
      this.assertSessionContext(sessionContext);
    }
    const [pending, localEntities, stateRevisions] = await Promise.all([
      listOutbox(),
      listEntities(cleanSpaceId),
      listStateRevisions([cleanSpaceId])
    ]);
    this.assertSessionContext(sessionContext);
    const pendingForSpace = (pending || []).filter((item) => String(item?.spaceId || item?.request?.spaceId || '').trim() === cleanSpaceId);
    const optimisticCount = (localEntities || []).filter((entity) => entity?.optimistic === true).length;
    if (pendingForSpace.length || optimisticCount) {
      const error = new Error('Hay cambios locales pendientes de confirmar. Sincronízalos antes de crear una invitación para que la copia inicial sea consistente.');
      error.code = 'P2P_INVITATION_ESCROW_PENDING';
      error.status = 409;
      error.spaceId = cleanSpaceId;
      error.pendingOperations = pendingForSpace.length;
      error.optimisticEntities = optimisticCount;
      throw error;
    }

    const entities = canonicalLocalSnapshotEntities(localEntities).map((entity, index) => ({
      ...entity,
      operationId: String(entity.operationId || '').trim()
        || `invitation-seed:${index}:${entity.entityType}:${entity.entityId}:${Math.max(0, Number(entity.stateRevision || 0))}`
    }));
    const entityStateRevision = entities.reduce((maximum, entity) => Math.max(
      maximum,
      Math.max(0, Number(entity.stateRevision || entity.spaceSequence || 0))
    ), 0);
    const sourceStateRevision = Math.max(entityStateRevision, Math.max(0, Number(stateRevisions?.[cleanSpaceId] || 0)));
    const snapshotDigest = await sha256Hex(JSON.stringify(entities));
    this.assertSessionContext(sessionContext);
    const transportEntities = await encryptSnapshotEntities(cleanSpaceId, entities);
    this.assertSessionContext(sessionContext);
    const keyEnvelope = await createSpaceKeyEnvelope(cleanSpaceId, {
      deviceId: String(authority.deviceId || '').trim(),
      encryptionPublicKey: authority.publicKey
    }, { keyId: activeKey.keyId });
    this.assertSessionContext(sessionContext);
    const escrow = {
      schemaVersion: 1,
      spaceId: cleanSpaceId,
      sourceDeviceId: sessionContext.deviceId,
      keyId: activeKey.keyId,
      keyEpoch: Math.max(0, Number(activeKey.keyEpoch || this.spaceEncryptionAuthority(cleanSpaceId).keyEpoch || 0)),
      sourceStateRevision,
      snapshotDigest,
      entityCount: entities.length,
      entities: transportEntities,
      keyEnvelope,
      createdAt: new Date().toISOString()
    };
    const maximumBytes = Math.max(0, Number(this.invitationEscrowMaxBytes || authority.maxBytes || 0));
    if (!maximumBytes || jsonByteLength(escrow) > maximumBytes) {
      const error = new Error('La copia cifrada inicial del proyecto supera el tamaño permitido para una invitación inmediata.');
      error.code = 'P2P_INVITATION_ESCROW_TOO_LARGE';
      error.status = 413;
      error.spaceId = cleanSpaceId;
      invitationAuditLog('frontend.escrow.rejected', {
        auditTraceId: String(auditContext.auditTraceId || '').trim(),
        spaceId: cleanSpaceId,
        deviceId: sessionContext.deviceId,
        maximumBytes,
        actualBytes: jsonByteLength(escrow),
        entities: invitationAuditEntitySummary(entities),
        escrow: invitationAuditEscrowSummary(escrow),
        error: invitationAuditError(error),
        ...XXXsenXXX({ canonicalPlaintextEntities: entities, encryptedBootstrapEscrow: escrow })
      });
      throw error;
    }
    invitationAuditLog('frontend.escrow.built', {
      auditTraceId: String(auditContext.auditTraceId || '').trim(),
      invitationScope: String(auditContext.invitationScope || '').trim(),
      invitationGroupId: String(auditContext.invitationGroupId || '').trim(),
      spaceId: cleanSpaceId,
      deviceId: sessionContext.deviceId,
      bytes: jsonByteLength(escrow),
      entities: invitationAuditEntitySummary(entities),
      escrow: invitationAuditEscrowSummary(escrow),
      ...XXXsenXXX({
        canonicalPlaintextEntities: entities,
        encryptedBootstrapEscrow: escrow
      })
    });
    return escrow;
  }

  async applyInvitationBootstrapEscrow(escrow = null, space = null, invitation = null, sessionContext = this.captureSessionContext(), auditContext = {}) {
    this.assertSessionContext(sessionContext);
    if (!escrow || typeof escrow !== 'object') return { applied: false, reason: 'missing' };
    const spaceId = String(space?.spaceId || invitation?.spaceId || '').trim();
    const auditTraceId = String(auditContext.auditTraceId || '').trim();
    if (!spaceId || String(escrow.spaceId || '').trim() !== spaceId) {
      const error = new Error('La copia inicial de la invitación pertenece a otro proyecto.');
      error.code = 'P2P_INVITATION_ESCROW_SCOPE_MISMATCH';
      error.status = 409;
      invitationAuditLog('frontend.escrow.scope-mismatch', {
        auditTraceId,
        invitationId: String(invitation?.invitationId || '').trim(),
        expectedSpaceId: spaceId,
        escrowSpaceId: String(escrow?.spaceId || '').trim(),
        deviceId: sessionContext.deviceId,
        escrow: invitationAuditEscrowSummary(escrow),
        error: invitationAuditError(error),
        ...XXXsenXXX({ invitation, space, encryptedBootstrapEscrow: escrow })
      });
      throw error;
    }
    if (Number(escrow.schemaVersion || 0) !== 1 || !Array.isArray(escrow.entities) || !escrow.keyEnvelope) {
      const error = new Error('La copia cifrada inicial de la invitación está incompleta.');
      error.code = 'P2P_INVITATION_ESCROW_INVALID';
      error.status = 409;
      invitationAuditLog('frontend.escrow.invalid', {
        auditTraceId,
        invitationId: String(invitation?.invitationId || '').trim(),
        spaceId,
        deviceId: sessionContext.deviceId,
        escrow: invitationAuditEscrowSummary(escrow),
        error: invitationAuditError(error),
        ...XXXsenXXX({ invitation, space, encryptedBootstrapEscrow: escrow })
      });
      throw error;
    }

    invitationAuditLog('frontend.escrow.apply.begin', {
      auditTraceId,
      invitationId: String(invitation?.invitationId || '').trim(),
      invitationGroupId: String(invitation?.invitationGroupId || '').trim(),
      spaceId,
      deviceId: sessionContext.deviceId,
      escrow: invitationAuditEscrowSummary(escrow),
      ...XXXsenXXX({ invitation, space, encryptedBootstrapEscrow: escrow })
    });

    const imported = await importSpaceKeyEnvelope(spaceId, escrow.keyEnvelope, {
      keyEpoch: Math.max(0, Number(escrow.keyEpoch || space?.encryptionKeyEpoch || 0))
    });
    this.assertSessionContext(sessionContext);
    if (imported?.imported !== true) {
      const error = new Error('La clave cifrada de la invitación no pudo vincularse con este dispositivo.');
      error.code = 'P2P_INVITATION_ESCROW_KEY_NOT_IMPORTED';
      error.status = 409;
      invitationAuditLog('frontend.escrow.key-import-failed', {
        auditTraceId,
        invitationId: String(invitation?.invitationId || '').trim(),
        spaceId,
        deviceId: sessionContext.deviceId,
        imported,
        escrow: invitationAuditEscrowSummary(escrow),
        error: invitationAuditError(error),
        ...XXXsenXXX({ imported, keyEnvelope: escrow?.keyEnvelope, encryptedBootstrapEscrow: escrow })
      });
      throw error;
    }

    const transportChunks = snapshotChunksByBytes(escrow.entities, this.eventMaxBytes);
    if (transportChunks.length > this.snapshotMaxChunks) {
      const error = new Error('La copia inicial de la invitación necesita demasiados fragmentos para reconstruirse de forma segura.');
      error.code = 'P2P_INVITATION_ESCROW_TOO_LARGE';
      error.status = 413;
      invitationAuditLog('frontend.escrow.chunk-limit', {
        auditTraceId,
        invitationId: String(invitation?.invitationId || '').trim(),
        spaceId,
        deviceId: sessionContext.deviceId,
        chunkCount: transportChunks.length,
        maximumChunks: this.snapshotMaxChunks,
        error: invitationAuditError(error)
      });
      throw error;
    }
    const requestId = `invitation_escrow_${String(invitation?.invitationId || '').replace(/[^a-zA-Z0-9._:-]/g, '_').slice(0, 140) || Date.now()}`;
    const sourceDeviceId = String(escrow.sourceDeviceId || 'invitation_escrow').trim();
    const sourceStateRevision = Math.max(0, Number(escrow.sourceStateRevision || 0));
    const entityCount = Math.max(0, Number(escrow.entityCount || 0));
    const snapshotDigest = String(escrow.snapshotDigest || '').trim();
    const decryptedChunkEvents = [];
    for (let index = 0; index < transportChunks.length; index += 1) {
      const encryptedEvent = {
        eventType: 'p2p.operation',
        spaceId,
        sourceDeviceId,
        actorUserId: String(invitation?.inviterUserId || space?.ownerUserId || '').trim(),
        spaceSequence: sourceStateRevision,
        stateRevision: sourceStateRevision,
        optimistic: false,
        operation: {
          operationId: `${requestId}:chunk:${index}`,
          type: 'snapshot.chunk',
          entityType: '__snapshot__',
          entityId: `${requestId}:${index}`,
          encrypted: true,
          encryptionVersion: 1,
          keyId: String(escrow.keyId || '').trim(),
          payload: {
            requestId,
            chunkIndex: index,
            chunkCount: transportChunks.length,
            entityCount,
            snapshotByteCount: 2,
            chunkByteCount: 2,
            sourceStateRevision,
            snapshotDigest,
            entities: transportChunks[index]
          }
        }
      };
      decryptedChunkEvents.push(await decryptOperationEvent(encryptedEvent));
      this.assertSessionContext(sessionContext);
    }
    const decryptedEntities = decryptedChunkEvents.flatMap((event) => Array.isArray(event.operation?.payload?.entities) ? event.operation.payload.entities : []);
    invitationAuditLog('frontend.escrow.decrypted', {
      auditTraceId,
      invitationId: String(invitation?.invitationId || '').trim(),
      invitationGroupId: String(invitation?.invitationGroupId || '').trim(),
      spaceId,
      deviceId: sessionContext.deviceId,
      entities: invitationAuditEntitySummary(decryptedEntities),
      expectedEntityCount: entityCount,
      snapshotDigest,
      sourceStateRevision,
      ...XXXsenXXX({ decryptedChunkEvents, decryptedEntities })
    });
    const chunkByteCounts = decryptedChunkEvents.map((event) => jsonByteLength(event.operation?.payload?.entities || []));
    const snapshotByteCount = chunkByteCounts.reduce((total, bytes) => total + bytes, 0);
    if (snapshotByteCount > this.snapshotMaxBytes) {
      const error = new Error('La copia inicial descifrada supera el tamaño seguro de almacenamiento local.');
      error.code = 'P2P_INVITATION_ESCROW_TOO_LARGE';
      error.status = 413;
      invitationAuditLog('frontend.escrow.byte-limit', {
        auditTraceId,
        invitationId: String(invitation?.invitationId || '').trim(),
        spaceId,
        deviceId: sessionContext.deviceId,
        snapshotByteCount,
        maximumBytes: this.snapshotMaxBytes,
        error: invitationAuditError(error)
      });
      throw error;
    }
    for (let index = 0; index < decryptedChunkEvents.length; index += 1) {
      const event = decryptedChunkEvents[index];
      event.operation.payload.snapshotByteCount = snapshotByteCount;
      event.operation.payload.chunkByteCount = chunkByteCounts[index];
      const staged = await applyP2PEvent(event);
      this.assertSessionContext(sessionContext);
      if (staged?.snapshotIncomplete) {
        const error = new Error('No se pudo preparar la copia inicial cifrada de la invitación.');
        error.code = 'P2P_INVITATION_ESCROW_INCOMPLETE';
        error.status = 409;
        invitationAuditLog('frontend.escrow.chunk-incomplete', {
          auditTraceId,
          invitationId: String(invitation?.invitationId || '').trim(),
          spaceId,
          deviceId: sessionContext.deviceId,
          chunkIndex: index,
          chunkCount: decryptedChunkEvents.length,
          staged,
          error: invitationAuditError(error),
          ...XXXsenXXX({ decryptedChunkEvent: event, staged, encryptedBootstrapEscrow: escrow })
        });
        throw error;
      }
    }
    const completed = await applyP2PEvent({
      eventType: 'p2p.operation',
      spaceId,
      sourceDeviceId,
      actorUserId: String(invitation?.inviterUserId || space?.ownerUserId || '').trim(),
      spaceSequence: sourceStateRevision,
      stateRevision: sourceStateRevision,
      optimistic: false,
      operation: {
        operationId: `${requestId}:complete`,
        type: 'snapshot.complete',
        entityType: '__snapshot__',
        entityId: requestId,
        encrypted: true,
        encryptionVersion: 1,
        keyId: String(escrow.keyId || '').trim(),
        payload: {
          requestId,
          chunkCount: decryptedChunkEvents.length,
          entityCount,
          snapshotByteCount,
          sourceStateRevision,
          snapshotDigest
        }
      }
    });
    this.assertSessionContext(sessionContext);
    if (completed?.snapshotIncomplete) {
      const error = new Error('La copia inicial cifrada de la invitación no superó la validación de integridad.');
      error.code = 'P2P_INVITATION_ESCROW_INCOMPLETE';
      error.status = 409;
      error.reason = completed.reason || '';
      invitationAuditLog('frontend.escrow.complete-incomplete', {
        auditTraceId,
        invitationId: String(invitation?.invitationId || '').trim(),
        spaceId,
        deviceId: sessionContext.deviceId,
        completed,
        error: invitationAuditError(error),
        ...XXXsenXXX({ decryptedChunkEvents, decryptedEntities, encryptedBootstrapEscrow: escrow, completed })
      });
      throw error;
    }

    const persistedEntities = await listEntities(spaceId);
    this.assertSessionContext(sessionContext);
    const persistenceComparison = invitationAuditEntityComparison(decryptedEntities, persistedEntities);
    invitationAuditLog('frontend.escrow.persisted', {
      auditTraceId,
      invitationId: String(invitation?.invitationId || '').trim(),
      invitationGroupId: String(invitation?.invitationGroupId || '').trim(),
      spaceId,
      deviceId: sessionContext.deviceId,
      expected: invitationAuditEntitySummary(decryptedEntities),
      persisted: invitationAuditEntitySummary(persistedEntities),
      comparison: persistenceComparison,
      storageResult: completed,
      ...XXXsenXXX({
        expectedDecryptedEntities: decryptedEntities,
        persistedIndexedDbEntities: persistedEntities,
        storageResult: completed
      })
    });
    if (!persistenceComparison.complete || persistenceComparison.projectRoot.complete !== true) {
      const error = new Error('La copia inicial fue descifrada, pero no quedó persistida de forma completa en el dispositivo invitado.');
      error.code = 'P2P_INVITATION_ESCROW_PERSISTENCE_MISMATCH';
      error.status = 409;
      error.reason = persistenceComparison.projectRoot.complete !== true ? 'project_root_missing_after_persist' : 'entity_persistence_mismatch';
      invitationAuditLog('frontend.escrow.persistence-mismatch', {
        auditTraceId,
        invitationId: String(invitation?.invitationId || '').trim(),
        invitationGroupId: String(invitation?.invitationGroupId || '').trim(),
        spaceId,
        deviceId: sessionContext.deviceId,
        comparison: persistenceComparison,
        error: invitationAuditError(error),
        ...XXXsenXXX({
          expectedDecryptedEntities: decryptedEntities,
          persistedIndexedDbEntities: persistedEntities,
          storageResult: completed
        })
      });
      throw error;
    }
    await resolveRecoveryRequirement(spaceId, sourceStateRevision).catch(() => false);
    this.assertSessionContext(sessionContext);
    dispatch('p2p:invitation-bootstrap-applied', {
      invitationId: String(invitation?.invitationId || '').trim(),
      spaceId,
      sourceStateRevision,
      entityCount
    });
    invitationAuditLog('frontend.escrow.apply.complete', {
      auditTraceId,
      invitationId: String(invitation?.invitationId || '').trim(),
      invitationGroupId: String(invitation?.invitationGroupId || '').trim(),
      spaceId,
      deviceId: sessionContext.deviceId,
      sourceStateRevision,
      entityCount,
      completed,
      ...XXXsenXXX({
        invitation,
        space,
        encryptedBootstrapEscrow: escrow,
        decryptedEntities,
        persistedIndexedDbEntities: persistedEntities
      })
    });
    return { applied: true, sourceStateRevision, entityCount, result: completed };
  }

  async recoverAcceptedInvitationBootstrap(space = null, receivedInvitations = [], sessionContext = this.captureSessionContext(), options = {}) {
    this.assertSessionContext(sessionContext);
    const spaceId = String(space?.spaceId || '').trim();
    const auditTraceId = String(options.auditTraceId || '').trim() || createInvitationAuditTraceId('invitation_recovery');
    if (!spaceId || Math.max(0, Number(space?.encryptionVersion || 0)) < 1) {
      invitationAuditLog('frontend.recovery.skipped', {
        auditTraceId,
        spaceId,
        deviceId: sessionContext.deviceId,
        reason: 'not-encrypted'
      });
      return { recovered: false, reason: 'not-encrypted' };
    }
    const activeKeyId = String(space?.activeEncryptionKeyId || '').trim();
    const localKeyAvailable = await hasSpaceKey(spaceId, activeKeyId);
    this.assertSessionContext(sessionContext);
    // Una aceptación puede interrumpirse después de importar la clave pero antes de
    // materializar el snapshot cifrado. En recuperación de réplica debemos reusar el
    // escrow aunque la clave ya exista; de lo contrario el panel vuelve a depender de
    // otra réplica conectada justo cuando Redis todavía conserva la copia inicial.
    if (localKeyAvailable && options.forceSnapshot !== true) {
      invitationAuditLog('frontend.recovery.skipped', {
        auditTraceId,
        spaceId,
        deviceId: sessionContext.deviceId,
        activeKeyId,
        localKeyAvailable,
        reason: 'key-present'
      });
      return { recovered: false, reason: 'key-present' };
    }

    const invitation = (Array.isArray(receivedInvitations) ? receivedInvitations : [])
      .filter((candidate) => String(candidate?.spaceId || '').trim() === spaceId
        && String(candidate?.status || '').trim().toLowerCase() === 'accepted')
      .sort((left, right) => (Date.parse(right?.respondedAt || right?.updatedAt || right?.createdAt || '') || 0)
        - (Date.parse(left?.respondedAt || left?.updatedAt || left?.createdAt || '') || 0))[0];
    if (!invitation?.invitationId) {
      let keyRecovery = null;
      if (!localKeyAvailable && activeKeyId) {
        if (options.deferKeyWait === true) {
          // Durante applyBootstrapData() el SSE todavía no se abre. Esperar aquí una
          // respuesta de clave bloquea innecesariamente cada espacio y, si luego se llama
          // a ensureCurrentSpaceKey(), puede producir una espera circular con la cola de
          // bootstrap. En ese contexto solo dejamos la solicitud durable en el backend.
          keyRecovery = await this.requestSpaceKey(spaceId, activeKeyId, { force: true })
            .then((requested) => ({ recovered: false, requested: requested === true, deferred: requested === true }))
            .catch((error) => {
              if (this.isSessionContextChangedError(error)) throw error;
              return { recovered: false, requested: false, deferred: false, requestError: error };
            });
        } else {
          keyRecovery = await this.requestSpaceKeyAndWait(spaceId, activeKeyId, { sessionContext }).catch((error) => {
            if (this.isSessionContextChangedError(error)) throw error;
            return { recovered: false, requested: false, requestError: error };
          });
        }
        this.assertSessionContext(sessionContext);
      }
      const keyRecovered = keyRecovery?.recovered === true;
      const keyRequested = keyRecovery?.requested === true;
      const reason = keyRecovered
        ? 'accepted-invitation-missing-key-recovered'
        : keyRequested && options.deferKeyWait === true
          ? 'accepted-invitation-missing-key-requested'
          : 'accepted-invitation-missing';
      invitationAuditLog(keyRecovered
        ? 'frontend.recovery.key-fallback'
        : keyRequested && options.deferKeyWait === true
          ? 'frontend.recovery.key-requested'
          : 'frontend.recovery.skipped', {
        auditTraceId,
        spaceId,
        deviceId: sessionContext.deviceId,
        activeKeyId,
        localKeyAvailable,
        keyRecovered,
        keyRequested,
        keyWaitDeferred: keyRecovery?.deferred === true,
        receivedInvitationCount: Array.isArray(receivedInvitations) ? receivedInvitations.length : 0,
        reason
      });
      return {
        recovered: false,
        keyRecovered,
        keyRequested,
        reason: keyRecovered ? 'accepted-invitation-missing-key-recovered'
          : keyRequested && options.deferKeyWait === true
            ? 'accepted-invitation-missing-key-requested'
            : 'accepted-invitation-missing'
      };
    }
    const invitationId = String(invitation.invitationId || '').trim();
    const lastAttemptAt = Math.max(0, Number(this.invitationEscrowRecoveryAttempts.get(invitationId) || 0));
    if (options.ignoreCooldown !== true && lastAttemptAt && Date.now() - lastAttemptAt < INVITATION_ESCROW_RECOVERY_RETRY_MS) {
      invitationAuditLog('frontend.recovery.cooldown', {
        auditTraceId,
        invitationId,
        spaceId,
        deviceId: sessionContext.deviceId,
        lastAttemptAt,
        retryAfterMs: Math.max(0, INVITATION_ESCROW_RECOVERY_RETRY_MS - (Date.now() - lastAttemptAt))
      });
      return { recovered: false, reason: 'cooldown', invitationId, spaceId };
    }
    this.invitationEscrowRecoveryAttempts.set(invitationId, Date.now());

    invitationAuditLog('frontend.recovery.begin', {
      auditTraceId,
      invitationId,
      invitationGroupId: String(invitation?.invitationGroupId || '').trim(),
      spaceId,
      deviceId: sessionContext.deviceId,
      activeKeyId,
      localKeyAvailable,
      forceSnapshot: options.forceSnapshot === true
    });

    let data = null;
    try {
      data = await apiPost('/api/p2p/invitations/respond', {
        invitationId,
        decision: 'accept',
        deviceId: sessionContext.deviceId,
        auditTraceId
      });
    } catch (error) {
      invitationAuditLog('frontend.recovery.error', {
        auditTraceId,
        invitationId,
        spaceId,
        deviceId: sessionContext.deviceId,
        stage: 'backend-response',
        error: invitationAuditError(error),
        ...XXXsenXXX({ invitation, space, error })
      });
      throw error;
    }
    this.assertSessionContext(sessionContext);
    invitationAuditLog('frontend.recovery.backend-response', {
      auditTraceId,
      invitationId: String(data?.invitation?.invitationId || invitationId).trim(),
      spaceId: String(data?.space?.spaceId || data?.invitation?.spaceId || spaceId).trim(),
      status: String(data?.invitation?.status || '').trim(),
      backendSpacePresent: Boolean(data?.space),
      escrow: invitationAuditEscrowSummary(data?.bootstrapEscrow),
      deviceId: sessionContext.deviceId,
      ...XXXsenXXX({ backendResponse: data, acceptedInvitation: invitation, currentSpace: space })
    });
    if (!data?.bootstrapEscrow) {
      invitationAuditLog('frontend.recovery.escrow-missing', {
        auditTraceId,
        invitationId,
        spaceId,
        deviceId: sessionContext.deviceId,
        reason: 'escrow-expired'
      });
      return { recovered: false, reason: 'escrow-expired' };
    }
    try {
      await this.applyInvitationBootstrapEscrow(
        data.bootstrapEscrow,
        data.space || space,
        data.invitation || invitation,
        sessionContext,
        { auditTraceId }
      );
    } catch (error) {
      invitationAuditLog('frontend.recovery.error', {
        auditTraceId,
        invitationId,
        spaceId,
        deviceId: sessionContext.deviceId,
        stage: 'apply-escrow',
        escrow: invitationAuditEscrowSummary(data?.bootstrapEscrow),
        error: invitationAuditError(error),
        ...XXXsenXXX({ backendResponse: data, invitation, space, error })
      });
      throw error;
    }
    this.assertSessionContext(sessionContext);
    dispatch('p2p:invitation-bootstrap-recovered', {
      invitationId,
      spaceId,
      deviceId: sessionContext.deviceId
    });
    invitationAuditLog('frontend.recovery.complete', {
      auditTraceId,
      invitationId,
      spaceId,
      deviceId: sessionContext.deviceId
    });
    return { recovered: true, invitationId, spaceId };
  }

  async createSpace(options = {}) {
    const sessionContext = this.captureSessionContext();
    this.assertSessionContext(sessionContext);
    const data = await apiPost('/api/p2p/spaces/create', {
      resourceType: options.resourceType || 'generic',
      permissionProfile: String(options.permissionProfile || '').trim().toLowerCase(),
      requestId: String(options.requestId || options.clientRequestId || createId('space_request')).trim()
    });
    this.assertSessionContext(sessionContext);
    await this.fenceBootstrapResponses(sessionContext);
    if (data.space) {
      await saveSpaces([data.space]);
      this.rememberAuthoritativeSpace(data.space);
      if (Math.max(0, Number(data.space.encryptionVersion || 0)) >= 1) {
        const key = await ensureSpaceKey(data.space.spaceId, { activate: false });
        const activation = await this.activateAuthoritativeSpaceKey(
          data.space.spaceId,
          key.keyId,
          data.space.activeEncryptionKeyId || ''
        );
        data.space = activation.space || data.space;
        this.assertSessionContext(sessionContext);
        try {
          data.keyDistribution = await this.distributeSpaceKey(data.space.spaceId, key.keyId);
        } catch (error) {
          dispatch('p2p:key-distribution-pending', {
            spaceId: data.space.spaceId,
            keyId: key.keyId,
            stage: 'space-create',
            error
          });
          throw error;
        }
        this.assertSessionContext(sessionContext);
        if (data.keyDistribution?.complete !== true) {
          const error = new Error('El proyecto quedó creado, pero su clave todavía no llegó a todos los dispositivos autorizados. La creación se reintentará antes de publicar información compartida.');
          error.code = 'P2P_INITIAL_KEY_DISTRIBUTION_PENDING';
          error.status = 503;
          error.retryable = true;
          error.spaceId = data.space.spaceId;
          error.keyId = key.keyId;
          error.distribution = data.keyDistribution;
          dispatch('p2p:key-distribution-pending', {
            spaceId: data.space.spaceId,
            keyId: key.keyId,
            stage: 'space-create',
            distribution: data.keyDistribution,
            error
          });
          throw error;
        }
      }
    }
    this.assertSessionContext(sessionContext);
    await this.refreshBootstrap({ requestSnapshots: false });
    this.assertSessionContext(sessionContext);
    return data;
  }

  async invite(email = '', options = {}) {
    const sessionContext = this.captureSessionContext();
    this.assertSessionContext(sessionContext);
    const auditTraceId = String(options.auditTraceId || '').trim() || createInvitationAuditTraceId('invite');
    const requestedSpaceId = String(options.spaceId || '').trim();
    invitationAuditLog('frontend.invite.begin', {
      auditTraceId,
      recipientEmail: maskInvitationAuditEmail(email),
      spaceId: requestedSpaceId,
      invitationScope: String(options.invitationScope || 'project').trim().toLowerCase(),
      invitationGroupId: String(options.invitationGroupId || '').trim(),
      invitationGroupExpectedCount: Math.max(0, Math.floor(Number(options.invitationGroupExpectedCount || 0))),
      permissions: Array.isArray(options.permissions) ? options.permissions : ['read', 'write'],
      deviceId: sessionContext.deviceId,
      ...XXXsenXXX({ recipientEmail: String(email || ''), inviteOptions: options })
    });
    if (requestedSpaceId) this.assertSpaceAuthorizationConfirmed(requestedSpaceId);
    const existingSpace = (this.bootstrapState.spaces || []).find((space) => space?.spaceId === requestedSpaceId);
    const encryptedExistingSpace = requestedSpaceId && Math.max(0, Number(existingSpace?.encryptionVersion || 0)) >= 1;
    let bootstrapEscrow = null;
    if (encryptedExistingSpace) {
      await this.ensureInvitationSourceCurrent(requestedSpaceId, sessionContext);
      this.assertSessionContext(sessionContext);
      await this.ensureCurrentSpaceKey(requestedSpaceId, { requireAuthority: true, allowOwnerRecoveryRotation: true });
      this.assertSessionContext(sessionContext);
      bootstrapEscrow = await this.buildInvitationBootstrapEscrow(requestedSpaceId, sessionContext, { auditTraceId, invitationScope: options.invitationScope || 'project', invitationGroupId: options.invitationGroupId || '' });
      this.assertSessionContext(sessionContext);
    }
    let data = null;
    for (let attempt = 0; attempt < INVITATION_SOURCE_CREATE_MAX_ATTEMPTS; attempt += 1) {
      try {
        data = await apiPost('/api/p2p/invitations/create', {
          email,
          auditTraceId,
          spaceId: options.spaceId || '',
          resourceType: options.resourceType || 'generic',
          permissions: options.permissions || ['read', 'write'],
          requestId: String(options.requestId || options.clientRequestId || '').trim(),
          invitationScope: String(options.invitationScope || 'project').trim().toLowerCase(),
          invitationGroupId: String(options.invitationGroupId || '').trim(),
          invitationGroupExpectedCount: Math.max(0, Math.floor(Number(options.invitationGroupExpectedCount || 0))),
          bootstrapEscrow
        });
        break;
      } catch (error) {
        this.assertSessionContext(sessionContext);
        invitationAuditLog('frontend.invite.backend-error', {
          auditTraceId,
          attempt: attempt + 1,
          spaceId: requestedSpaceId,
          recipientEmail: maskInvitationAuditEmail(email),
          error: invitationAuditError(error),
          ...XXXsenXXX({ recipientEmail: String(email || ''), inviteOptions: options, sourceBootstrapEscrow: bootstrapEscrow, error })
        });
        const staleSnapshot = error?.code === 'P2P_INVITATION_ESCROW_STALE_STATE';
        if (!encryptedExistingSpace || !staleSnapshot || attempt >= INVITATION_SOURCE_CREATE_MAX_ATTEMPTS - 1) throw error;
        await this.ensureInvitationSourceCurrent(requestedSpaceId, sessionContext);
        this.assertSessionContext(sessionContext);
        bootstrapEscrow = await this.buildInvitationBootstrapEscrow(requestedSpaceId, sessionContext, { auditTraceId, invitationScope: options.invitationScope || 'project', invitationGroupId: options.invitationGroupId || '' });
        this.assertSessionContext(sessionContext);
      }
    }
    if (!data) {
      const error = new Error('No se pudo crear la invitación con una copia inicial vigente.');
      error.code = 'P2P_INVITATION_SOURCE_SYNC_PENDING';
      error.status = 409;
      throw error;
    }
    this.assertSessionContext(sessionContext);
    invitationAuditLog('frontend.invite.backend-response', {
      auditTraceId,
      invitationId: String(data?.invitation?.invitationId || '').trim(),
      invitationGroupId: String(data?.invitation?.invitationGroupId || options.invitationGroupId || '').trim(),
      spaceId: String(data?.space?.spaceId || data?.invitation?.spaceId || requestedSpaceId).trim(),
      reused: data?.reused === true,
      backendSpacePresent: Boolean(data?.space),
      backendInvitationStatus: String(data?.invitation?.status || '').trim(),
      deviceId: sessionContext.deviceId,
      ...XXXsenXXX({ backendResponse: data, sourceBootstrapEscrow: bootstrapEscrow })
    });
    await this.fenceBootstrapResponses(sessionContext);
    const invitationSpace = data.space
      || (this.bootstrapState.spaces || []).find((space) => space?.spaceId === (options.spaceId || data.invitation?.spaceId));
    if (Math.max(0, Number(invitationSpace?.encryptionVersion || 0)) >= 1 && !requestedSpaceId) {
      this.rememberAuthoritativeSpace(invitationSpace);
      const key = await ensureSpaceKey(invitationSpace.spaceId, { activate: false });
      const activation = await this.activateAuthoritativeSpaceKey(
        invitationSpace.spaceId,
        key.keyId,
        invitationSpace.activeEncryptionKeyId || ''
      );
      data.space = activation.space || invitationSpace;
      this.assertSessionContext(sessionContext);
    }
    const committedControlState = prepareCommittedControlState({
      spaces: data.space ? [data.space] : [],
      invitations: data.invitation ? [data.invitation] : []
    }, {
      authorizationState: 'confirmed',
      currentSpaces: this.bootstrapState.spaces || []
    });
    await saveControlStateAtomically(committedControlState);
    this.assertSessionContext(sessionContext);
    this.applyCommittedControlState(committedControlState, { source: 'local-invite' });
    this.assertSessionContext(sessionContext);
    await this.refreshBootstrap({ requestSnapshots: false }).catch((error) => {
      if (this.isSessionContextChangedError(error)) throw error;
      dispatch('p2p:bootstrap-deferred', {
        error,
        stage: 'local-invite',
        invitationId: String(data.invitation?.invitationId || '').trim()
      });
      return this.bootstrapState;
    });
    this.assertSessionContext(sessionContext);
    invitationAuditLog('frontend.invite.complete', {
      auditTraceId,
      invitationId: String(data?.invitation?.invitationId || '').trim(),
      invitationGroupId: String(data?.invitation?.invitationGroupId || options.invitationGroupId || '').trim(),
      spaceId: String(data?.space?.spaceId || data?.invitation?.spaceId || requestedSpaceId).trim(),
      reused: data?.reused === true,
      deviceId: sessionContext.deviceId
    });
    return data;
  }

  async invitePanel(email = '', options = {}) {
    const sessionContext = this.captureSessionContext();
    this.assertSessionContext(sessionContext);
    const auditTraceId = String(options.auditTraceId || '').trim() || createInvitationAuditTraceId('panel_invite');
    const requestedIds = Array.from(new Set((Array.isArray(options.spaceIds) ? options.spaceIds : [])
      .map((spaceId) => String(spaceId || '').trim())
      .filter(Boolean)));
    if (!requestedIds.length) throw new Error('El panel no tiene proyectos para compartir.');
    const ownedSpaces = requestedIds.map((spaceId) => {
      const space = (this.bootstrapState.spaces || []).find((candidate) => String(candidate?.spaceId || '').trim() === spaceId) || null;
      if (!space) throw new Error('Uno de los proyectos del panel ya no está disponible.');
      if (String(space.ownerUserId || '').trim() !== String(this.user?.userId || '').trim()) {
        const error = new Error('Solo el propietario puede compartir el panel completo.');
        error.code = 'P2P_PANEL_INVITE_OWNER_REQUIRED';
        error.status = 403;
        throw error;
      }
      this.assertSpaceAuthorizationConfirmed(spaceId);
      return space;
    });
    const requestedPermissions = options.permissions || ['read', 'write'];
    const resumePlan = resumablePanelInvitationGroup(
      this.bootstrapState.invitations?.sent || [],
      {
        recipientEmail: email,
        spaceIds: ownedSpaces.map((space) => space.spaceId),
        permissions: requestedPermissions,
        invitationGroupId: options.invitationGroupId || ''
      }
    );
    const invitationGroupId = String(
      options.invitationGroupId
      || resumePlan?.invitationGroupId
      || createId(`panel_invite_${panelInvitationManifestFingerprint(ownedSpaces.map((space) => space.spaceId))}`)
    ).trim();
    invitationAuditLog('frontend.panel-invite.begin', {
      auditTraceId,
      invitationGroupId,
      recipientEmail: maskInvitationAuditEmail(email),
      expectedCount: ownedSpaces.length,
      spaceIds: ownedSpaces.map((space) => space.spaceId),
      permissions: requestedPermissions,
      deviceId: sessionContext.deviceId,
      resumed: Boolean(resumePlan?.invitationGroupId),
      ...XXXsenXXX({ recipientEmail: String(email || ''), ownedSpaces, inviteOptions: options, resumePlan })
    });
    const resumedBySpaceId = new Map((resumePlan?.invitationGroupId === invitationGroupId
      ? resumePlan.invitations
      : [])
      .map((invitation) => [String(invitation?.spaceId || '').trim(), invitation])
      .filter(([spaceId]) => Boolean(spaceId)));
    const results = [];
    for (let index = 0; index < ownedSpaces.length; index += 1) {
      const space = ownedSpaces[index];
      const resumedInvitation = resumedBySpaceId.get(space.spaceId) || null;
      if (resumedInvitation) {
        results.push({ invitation: resumedInvitation, space, reused: true, resumed: true });
        continue;
      }
      try {
        const result = await this.invite(email, {
          spaceId: space.spaceId,
          resourceType: space.resourceType || 'admin.project',
          permissions: requestedPermissions,
          requestId: `${invitationGroupId}:${space.spaceId}`,
          invitationScope: 'panel',
          invitationGroupId,
          invitationGroupExpectedCount: ownedSpaces.length,
          auditTraceId
        });
        this.assertSessionContext(sessionContext);
        results.push(result);
      } catch (error) {
        error.panelInvitationGroupId = invitationGroupId;
        error.completedPanelInvitations = results.map((result) => result?.invitation).filter(Boolean);
        error.remainingPanelSpaceIds = ownedSpaces.slice(index).map((candidate) => candidate.spaceId);
        throw error;
      }
    }
    invitationAuditLog('frontend.panel-invite.complete', {
      auditTraceId,
      invitationGroupId,
      expectedCount: ownedSpaces.length,
      invitationIds: results.map((result) => String(result?.invitation?.invitationId || '').trim()).filter(Boolean),
      spaceIds: ownedSpaces.map((space) => space.spaceId),
      reusedCount: results.filter((result) => result?.reused === true).length,
      deviceId: sessionContext.deviceId,
      ...XXXsenXXX({ recipientEmail: String(email || ''), ownedSpaces, results })
    });
    return {
      invitationScope: 'panel',
      invitationGroupId,
      invitations: results.map((result) => result?.invitation).filter(Boolean),
      reused: results.length > 0 && results.every((result) => result?.reused === true),
      resumed: resumedBySpaceId.size > 0,
      spaceIds: ownedSpaces.map((space) => space.spaceId)
    };
  }

  async respondToInvitationGroup(invitationIds = [], decision = 'accept', options = {}) {
    const sessionContext = this.captureSessionContext();
    this.assertSessionContext(sessionContext);
    const auditTraceId = String(options.auditTraceId || '').trim() || createInvitationAuditTraceId('panel_response');
    const ids = Array.from(new Set((Array.isArray(invitationIds) ? invitationIds : [])
      .map((invitationId) => String(invitationId || '').trim())
      .filter(Boolean)));
    if (!ids.length) throw new Error('No hay invitaciones de panel pendientes para responder.');

    const responseRequest = {
      invitationIds: ids,
      decision,
      deviceId: sessionContext.deviceId,
      auditTraceId
    };
    invitationAuditLog('frontend.panel-response.begin', {
      auditTraceId,
      invitationIds: ids,
      decision,
      deviceId: sessionContext.deviceId
    });
    let data = null;
    for (let attempt = 0; attempt < PANEL_INVITATION_RESPONSE_MAX_ATTEMPTS; attempt += 1) {
      try {
        data = await apiPost('/api/p2p/invitations/respond-group', responseRequest);
        break;
      } catch (error) {
        this.assertSessionContext(sessionContext);
        const retryDelayMs = panelInvitationResponseRetryDelay(error, attempt);
        invitationAuditLog('frontend.panel-response.backend-error', {
          auditTraceId,
          invitationIds: ids,
          decision,
          attempt: attempt + 1,
          retryDelayMs,
          error: invitationAuditError(error),
          ...XXXsenXXX({ responseRequest, error })
        });
        if (!retryDelayMs || attempt >= PANEL_INVITATION_RESPONSE_MAX_ATTEMPTS - 1) throw error;
        dispatch('p2p:invitation-group-resume', {
          invitationIds: ids,
          decision,
          attempt: attempt + 1,
          retryDelayMs,
          reason: String(error?.code || error?.message || 'transport').slice(0, 180)
        });
        await new Promise((resolve) => window.setTimeout(resolve, retryDelayMs));
        this.assertSessionContext(sessionContext);
      }
    }
    if (!data) {
      const error = new Error('No se pudo reanudar de forma segura la respuesta agrupada del panel.');
      error.code = 'P2P_INVITATION_GROUP_RESUME_FAILED';
      error.status = 503;
      throw error;
    }
    this.assertSessionContext(sessionContext);
    invitationAuditLog('frontend.panel-response.backend-response', {
      auditTraceId,
      invitationGroupId: String(data?.invitationGroupId || '').trim(),
      resultCount: Array.isArray(data?.results) ? data.results.length : 0,
      spaces: (Array.isArray(data?.results) ? data.results : []).map((result) => ({
        invitationId: String(result?.invitation?.invitationId || '').trim(),
        spaceId: String(result?.space?.spaceId || result?.invitation?.spaceId || '').trim(),
        status: String(result?.invitation?.status || '').trim(),
        escrow: invitationAuditEscrowSummary(result?.bootstrapEscrow)
      })),
      deviceId: sessionContext.deviceId,
      ...XXXsenXXX({ backendResponse: data })
    });
    await this.fenceBootstrapResponses(sessionContext);

    const results = Array.isArray(data?.results) ? data.results : [];
    if (!results.length) throw new Error('El backend no devolvió las invitaciones del panel respondido.');
    const invitations = results.map((result) => result?.invitation).filter(Boolean);
    const spaces = results.map((result) => result?.space).filter(Boolean);
    if (invitations.length !== results.length) {
      const error = new Error('El backend devolvió una respuesta de panel incompleta.');
      error.code = 'P2P_INVITATION_GROUP_INCOMPLETE';
      error.status = 502;
      throw error;
    }
    const canonicalDecisions = invitations.map((invitation) => resolveCanonicalInvitationDecision(invitation, decision));
    const accepting = canonicalDecisions.every((value) => value === 'accept');
    const rejecting = canonicalDecisions.every((value) => value === 'reject');
    if (!accepting && !rejecting) {
      const error = new Error('El panel quedó con decisiones incompatibles entre dispositivos.');
      error.code = 'P2P_INVITATION_GROUP_DECISION_CONFLICT';
      error.status = 409;
      throw error;
    }

    const committedControlState = prepareCommittedControlState({ spaces, invitations }, {
      authorizationState: accepting ? 'unconfirmed' : 'confirmed',
      currentSpaces: this.bootstrapState.spaces || []
    });
    await saveControlStateAtomically(committedControlState);
    this.assertSessionContext(sessionContext);
    this.applyCommittedControlState(committedControlState, { source: 'local-invitation-group-response' });
    this.assertSessionContext(sessionContext);

    let accessRevoked = false;
    let replicaPending = false;
    if (accepting) {
      // Primero materializa todas las semillas cifradas del panel. Solo después se ejecuta
      // un bootstrap autoritativo, evitando que cada proyecto exponga un panel intermedio.
      for (const result of results) {
        if (result?.bootstrapEscrow && result?.space) {
          await this.applyInvitationBootstrapEscrow(
            result.bootstrapEscrow,
            result.space,
            result.invitation,
            sessionContext,
            { auditTraceId }
          );
          this.assertSessionContext(sessionContext);
        }
      }

      const state = await this.refreshBootstrap({ requestSnapshots: 'force', auditTraceId, auditSource: 'panel-invitation-response' });
      this.assertSessionContext(sessionContext);
      const acceptedSpaceIds = Array.from(new Set(results
        .map((result) => String(result?.space?.spaceId || result?.invitation?.spaceId || '').trim())
        .filter(Boolean)));
      const localStateRevisions = await listStateRevisions(acceptedSpaceIds);
      this.assertSessionContext(sessionContext);

      for (const result of results) {
        const acceptedSpaceId = String(result?.space?.spaceId || result?.invitation?.spaceId || '').trim();
        if (!acceptedSpaceId) continue;
        const replicaState = assertAcceptedInvitationReplicaState(
          state,
          acceptedSpaceId,
          {
            code: 'P2P_LOCAL_INVITATION_REPLICA_UNCONFIRMED',
            message: 'El panel fue aceptado, pero el backend todavía no confirmó todas sus réplicas en este dispositivo.',
            invitationId: result?.invitation?.invitationId,
            localStateRevision: localStateRevisions?.[acceptedSpaceId],
            recoveryRequirements: this.recoveryRequirements,
            allowReplicaPending: true
          }
        );
        result.space = replicaState.space || null;
        result.accessRevoked = replicaState.explicitlyRevoked;
        result.replicaPending = replicaState.replicaPending;
        accessRevoked = accessRevoked || replicaState.explicitlyRevoked;
        replicaPending = replicaPending || replicaState.replicaPending;
      }

      for (const result of results) {
        if (result?.space && Math.max(0, Number(result.space.encryptionVersion || 0)) >= 1) {
          await this.requestSpaceKey(result.space.spaceId, '', { force: true }).catch(() => false);
          this.assertSessionContext(sessionContext);
        }
      }
      const localStateAudit = [];
      for (const result of results) {
        const spaceId = String(result?.space?.spaceId || result?.invitation?.spaceId || '').trim();
        if (!spaceId) continue;
        const entities = await listEntities(spaceId).catch(() => []);
        this.assertSessionContext(sessionContext);
        localStateAudit.push({
          invitationId: String(result?.invitation?.invitationId || '').trim(),
          spaceId,
          authorizationState: String(result?.space?.authorizationState || '').trim(),
          authorizationPendingReason: String(result?.space?.authorizationPendingReason || '').trim(),
          replicaPending: result?.replicaPending === true,
          entities: invitationAuditEntitySummary(entities),
          rawAudit: { invitation: result?.invitation, space: result?.space, entities }
        });
      }
      invitationAuditLog('frontend.panel-response.local-state', {
        auditTraceId,
        invitationGroupId: String(data?.invitationGroupId || '').trim(),
        deviceId: sessionContext.deviceId,
        spaces: localStateAudit.map(({ rawAudit, ...summary }) => summary),
        ...XXXsenXXX({ spaces: localStateAudit.map((item) => item.rawAudit) })
      });
    } else {
      await this.refreshBootstrap({ requestSnapshots: false, auditTraceId, auditSource: 'panel-invitation-response' }).catch((error) => {
        if (this.isSessionContextChangedError(error)) throw error;
        dispatch('p2p:bootstrap-deferred', {
          error,
          stage: 'local-invitation-group-response',
          invitationGroupId: String(data?.invitationGroupId || '').trim()
        });
        return this.bootstrapState;
      });
    }

    invitationAuditLog('frontend.panel-response.complete', {
      auditTraceId,
      invitationGroupId: String(data?.invitationGroupId || '').trim(),
      decision,
      accessRevoked,
      replicaPending,
      spaces: results.map((result) => ({
        invitationId: String(result?.invitation?.invitationId || '').trim(),
        spaceId: String(result?.space?.spaceId || result?.invitation?.spaceId || '').trim(),
        status: String(result?.invitation?.status || '').trim(),
        replicaPending: result?.replicaPending === true,
        accessRevoked: result?.accessRevoked === true
      })),
      deviceId: sessionContext.deviceId
    });
    return {
      ...data,
      results,
      invitations: results.map((result) => result?.invitation).filter(Boolean),
      accessRevoked,
      replicaPending
    };
  }

  async respondToInvitation(invitationId = '', decision = 'accept', options = {}) {
    const sessionContext = this.captureSessionContext();
    this.assertSessionContext(sessionContext);
    const auditTraceId = String(options.auditTraceId || '').trim() || createInvitationAuditTraceId('invitation_response');
    invitationAuditLog('frontend.response.begin', {
      auditTraceId,
      invitationId: String(invitationId || '').trim(),
      decision,
      deviceId: sessionContext.deviceId
    });
    let data = null;
    const responseRequest = {
      invitationId,
      decision,
      deviceId: sessionContext.deviceId,
      auditTraceId
    };
    try {
      data = await apiPost('/api/p2p/invitations/respond', responseRequest);
    } catch (error) {
      invitationAuditLog('frontend.response.backend-error', {
        auditTraceId,
        invitationId: String(invitationId || '').trim(),
        decision,
        deviceId: sessionContext.deviceId,
        error: invitationAuditError(error),
        ...XXXsenXXX({ responseRequest, error })
      });
      throw error;
    }
    this.assertSessionContext(sessionContext);
    invitationAuditLog('frontend.response.backend-response', {
      auditTraceId,
      invitationId: String(data?.invitation?.invitationId || invitationId || '').trim(),
      invitationGroupId: String(data?.invitation?.invitationGroupId || '').trim(),
      spaceId: String(data?.space?.spaceId || data?.invitation?.spaceId || '').trim(),
      status: String(data?.invitation?.status || '').trim(),
      reused: data?.reused === true,
      escrow: invitationAuditEscrowSummary(data?.bootstrapEscrow),
      backendSpacePresent: Boolean(data?.space),
      deviceId: sessionContext.deviceId,
      ...XXXsenXXX({ backendResponse: data })
    });
    await this.fenceBootstrapResponses(sessionContext);
    const canonicalDecision = resolveCanonicalInvitationDecision(data.invitation, decision);
    const committedControlState = prepareCommittedControlState({
      spaces: data.space ? [data.space] : [],
      invitations: data.invitation ? [data.invitation] : []
    }, {
      authorizationState: canonicalDecision === 'accept' ? 'unconfirmed' : 'confirmed',
      currentSpaces: this.bootstrapState.spaces || []
    });
    await saveControlStateAtomically(committedControlState);
    this.assertSessionContext(sessionContext);
    this.applyCommittedControlState(committedControlState, { source: 'local-invitation-response' });
    this.assertSessionContext(sessionContext);
    if (canonicalDecision === 'accept') {
      if (data.bootstrapEscrow && data.space) {
        await this.applyInvitationBootstrapEscrow(
          data.bootstrapEscrow,
          data.space,
          data.invitation,
          sessionContext,
          { auditTraceId }
        );
        this.assertSessionContext(sessionContext);
      }
      const state = await this.refreshBootstrap({ requestSnapshots: 'force', auditTraceId, auditSource: 'invitation-response' });
      this.assertSessionContext(sessionContext);
      const acceptedSpaceId = String(data.space?.spaceId || data.invitation?.spaceId || '').trim();
      const localStateRevisions = await listStateRevisions([acceptedSpaceId]);
      this.assertSessionContext(sessionContext);
      const replicaState = assertAcceptedInvitationReplicaState(
        state,
        acceptedSpaceId,
        {
          code: 'P2P_LOCAL_INVITATION_REPLICA_UNCONFIRMED',
          message: 'La invitación fue aceptada, pero el backend todavía no confirmó la membresía de este dispositivo.',
          invitationId: data.invitation?.invitationId,
          localStateRevision: localStateRevisions?.[acceptedSpaceId],
          recoveryRequirements: this.recoveryRequirements,
          allowReplicaPending: true
        }
      );
      data.space = replicaState.space || null;
      data.accessRevoked = replicaState.explicitlyRevoked;
      data.replicaPending = replicaState.replicaPending;
    } else {
      await this.refreshBootstrap({ requestSnapshots: false, auditTraceId, auditSource: 'invitation-response' }).catch((error) => {
        if (this.isSessionContextChangedError(error)) throw error;
        dispatch('p2p:bootstrap-deferred', {
          error,
          stage: 'local-invitation-response',
          invitationId: String(data.invitation?.invitationId || '').trim()
        });
        return this.bootstrapState;
      });
    }
    this.assertSessionContext(sessionContext);
    if (canonicalDecision === 'accept' && data.space && Math.max(0, Number(data.space.encryptionVersion || 0)) >= 1) {
      await this.requestSpaceKey(data.space.spaceId, '', { force: true }).catch(() => false);
      this.assertSessionContext(sessionContext);
    }
    if (canonicalDecision === 'accept' && data.space) {
      const acceptedSpaceId = String(data.space.spaceId || data.invitation?.spaceId || '').trim();
      const persistedEntities = acceptedSpaceId ? await listEntities(acceptedSpaceId).catch(() => []) : [];
      this.assertSessionContext(sessionContext);
      invitationAuditLog('frontend.response.local-state', {
        auditTraceId,
        invitationId: String(data?.invitation?.invitationId || invitationId || '').trim(),
        spaceId: acceptedSpaceId,
        deviceId: sessionContext.deviceId,
        authorizationState: String(data?.space?.authorizationState || '').trim(),
        authorizationPendingReason: String(data?.space?.authorizationPendingReason || '').trim(),
        replicaPending: data?.replicaPending === true,
        entities: invitationAuditEntitySummary(persistedEntities),
        ...XXXsenXXX({ invitation: data?.invitation, space: data?.space, persistedIndexedDbEntities: persistedEntities })
      });
    }
    invitationAuditLog('frontend.response.complete', {
      auditTraceId,
      invitationId: String(data?.invitation?.invitationId || invitationId || '').trim(),
      spaceId: String(data?.space?.spaceId || data?.invitation?.spaceId || '').trim(),
      canonicalDecision,
      accessRevoked: data?.accessRevoked === true,
      replicaPending: data?.replicaPending === true,
      authorizationState: String(data?.space?.authorizationState || '').trim(),
      authorizationPendingReason: String(data?.space?.authorizationPendingReason || '').trim(),
      deviceId: sessionContext.deviceId
    });
    return data;
  }

  async leave(spaceId = '') {
    const sessionContext = this.captureSessionContext();
    this.assertSessionContext(sessionContext);
    const cleanSpaceId = String(spaceId || '').trim();
    if (!cleanSpaceId) throw new Error('Falta el espacio que deseas abandonar.');
    this.assertSpaceAuthorizationConfirmed(cleanSpaceId);
    const data = await apiPost('/api/p2p/access/leave', { spaceId: cleanSpaceId });
    this.assertSessionContext(sessionContext);
    await this.fenceBootstrapResponses(sessionContext);
    const purge = await purgeLocalSpace(cleanSpaceId);
    await purgeSpaceCrypto(cleanSpaceId).catch(() => null);
    this.assertSessionContext(sessionContext);
    this.removeSpaceFromBootstrapState(cleanSpaceId);
    this.recoveryRequirements = await getRecoveryRequirements();
    this.assertSessionContext(sessionContext);
    this.snapshotRecoveryRequired = Object.keys(this.recoveryRequirements).length > 0;
    await this.refreshBootstrap({ requestSnapshots: false }).catch((error) => {
      if (this.isSessionContextChangedError(error)) throw error;
      return null;
    });
    this.assertSessionContext(sessionContext);
    dispatch('p2p:access-revoked', { spaceIds: [cleanSpaceId], source: 'local-leave', purge });
    return data;
  }

  async startProjectLifecycle(action = '', spaceId = '', options = {}) {
    const sessionContext = this.captureSessionContext();
    this.assertSessionContext(sessionContext);
    const cleanAction = String(action || '').trim().toLowerCase();
    const cleanSpaceId = String(spaceId || '').trim();
    if (!['trash', 'restore', 'purge'].includes(cleanAction) || !cleanSpaceId) throw new Error('La acción crítica del proyecto no es válida.');
    this.assertSpaceAuthorizationConfirmed(cleanSpaceId);

    let outboxItem;
    if (cleanAction === 'trash' || cleanAction === 'restore') {
      const operationId = String(options.operationId || '').trim() || createId('op');
      const prepared = await this.preparePublishEnvelope(cleanSpaceId, {
        operationId,
        type: cleanAction === 'restore' ? 'entity.restore' : 'entity.trash',
        entityType: 'admin.project',
        entityId: 'project',
        payload: {
          ...(options.expected && typeof options.expected === 'object' ? { expected: options.expected } : {}),
          at: String(options.at || '').trim() || new Date().toISOString(),
          actorUserId: String(this.user?.userId || '').trim()
        }
      }, { applyLocally: false, deferSourceUntilReplicas: true }, sessionContext);
      outboxItem = {
        ...prepared.outboxItem,
        endpoint: '/api/p2p/lifecycle/start',
        lifecycleAction: cleanAction,
        request: {
          action: cleanAction,
          deviceId: sessionContext.deviceId,
          spaceId: cleanSpaceId,
          operation: prepared.request.operation
        }
      };
    } else {
      const operationId = String(options.operationId || '').trim() || createId('op');
      outboxItem = {
        operationId,
        spaceId: cleanSpaceId,
        endpoint: '/api/p2p/lifecycle/start',
        lifecycleAction: cleanAction,
        request: {
          action: cleanAction,
          operationId,
          deviceId: sessionContext.deviceId,
          spaceId: cleanSpaceId
        },
        plainOperation: null,
        createdAt: new Date().toISOString(),
        attempts: 0
      };
    }

    await enqueueOutbox(outboxItem);
    this.assertSessionContext(sessionContext);
    let lastError = null;
    let data = null;
    let acceptedAttempt = 0;
    for (let attempt = 1; attempt <= LIFECYCLE_REQUEST_MAX_ATTEMPTS; attempt += 1) {
      try {
        data = await apiPost(outboxItem.endpoint, outboxItem.request, { maxAttempts: 1, audit: false });
        acceptedAttempt = attempt;
        this.assertSessionContext(sessionContext);
        break;
      } catch (error) {
        if (this.isSessionContextChangedError(error) || !this.isSessionContextCurrent(sessionContext)) throw this.createSessionContextChangedError();
        lastError = error;
        const retryable = this.isRetryableTransportError(error);
        const terminal = !retryable || attempt >= LIFECYCLE_REQUEST_MAX_ATTEMPTS;
        this.lifecycleAudit('lifecycle-start-request-failed', {
          action: cleanAction,
          spaceId: cleanSpaceId,
          operationId: outboxItem.operationId,
          status: 'starting'
        }, error, {
          attempt,
          maxAttempts: LIFECYCLE_REQUEST_MAX_ATTEMPTS,
          retryable,
          terminal,
          source: 'interactive-request',
          previousStatePreserved: true
        });
        if (!terminal) {
          await enqueueOutbox({
            ...outboxItem,
            attempts: attempt,
            lastAttemptAt: new Date().toISOString(),
            lastErrorCode: String(error?.code || ''),
            lastErrorStatus: Math.max(0, Number(error?.status || 0))
          });
          await new Promise((resolve) => window.setTimeout(resolve, lifecycleRequestRetryDelay(attempt - 1)));
          continue;
        }
        if (retryable && options.queueWhenOffline !== false) {
          const localDelivery = await this.startLocalProjectLifecycle(outboxItem, sessionContext).catch(() => ({ delivered: 0, transaction: null }));
          this.assertSessionContext(sessionContext);
          if (Number(localDelivery?.delivered || 0) > 0) {
            error.p2pQueued = true;
            error.p2pLocalDelivered = Number(localDelivery.delivered || 0);
            dispatch('p2p:outbox', {
              queued: true,
              operationId: outboxItem.operationId,
              lifecycleAction: cleanAction,
              localDelivered: error.p2pLocalDelivered,
              backendRetryExhausted: true
            });
            throw error;
          }
        }
        await removeOutbox(outboxItem.operationId).catch(() => null);
        error.p2pRetryExhausted = retryable && attempt >= LIFECYCLE_REQUEST_MAX_ATTEMPTS;
        dispatch('p2p:lifecycle-retry-exhausted', {
          transaction: {
            action: cleanAction,
            spaceId: cleanSpaceId,
            operationId: outboxItem.operationId,
            status: 'failed',
            attempts: attempt
          },
          error,
          attempt,
          maxAttempts: LIFECYCLE_REQUEST_MAX_ATTEMPTS,
          previousStatePreserved: true,
          localCommitApplied: false
        });
        throw error;
      }
    }
    if (!data) throw lastError || new Error('No se pudo completar la acción crítica del proyecto.');

    const transaction = data.lifecycle || null;
    await enqueueOutbox({
      ...outboxItem,
      attempts: acceptedAttempt,
      backendLifecycle: transaction ? { ...transaction } : outboxItem.backendLifecycle || null,
      backendAcceptedAt: new Date().toISOString()
    });
    this.assertSessionContext(sessionContext);
    if (!transaction) return data;

    this.rememberLifecycleTransaction(transaction);
    dispatch('p2p:lifecycle-progress', { transaction, source: 'local-start' });
    if (['trash', 'restore'].includes(cleanAction) && transaction.status === 'ready') {
      try {
        if (!data?.lifecycleFinalizeEvent) throw this.lifecycleFinalizeEventMissingError(transaction, 'start-response');
        await this.finalizeLifecycleFromEvent(transaction, data.lifecycleFinalizeEvent, sessionContext, 'start-response');
      } catch (error) {
        if (this.isSessionContextChangedError(error) || !this.isSessionContextCurrent(sessionContext)) throw this.createSessionContextChangedError();
        const retryable = this.isRetryableTransportError(error);
        const transactionId = String(transaction.transactionId || '').trim();
        const attempt = Math.max(0, Number(this.lifecycleFinalizationFailures.get(transactionId) || 0)) + 1;
        const terminal = !retryable || attempt >= LIFECYCLE_FINALIZATION_MAX_ATTEMPTS;
        const localCommitApplied = error?.p2pLocalCommitApplied === true || transaction?.localCommitApplied === true;
        this.lifecycleFinalizationFailures.set(transactionId, attempt);
        this.lifecycleAudit('finalization-start-response-failed', transaction, error, {
          attempt,
          maxAttempts: LIFECYCLE_FINALIZATION_MAX_ATTEMPTS,
          retryable,
          terminal,
          source: 'start-response',
          previousStatePreserved: !localCommitApplied,
          localCommitApplied
        });
        dispatch('p2p:lifecycle-resume-deferred', {
          transaction,
          error,
          observer: false,
          retryable,
          attempt,
          maxAttempts: LIFECYCLE_FINALIZATION_MAX_ATTEMPTS,
          terminal
        });
        if (terminal) {
          const failedTransaction = this.rememberLifecycleTerminalState(transaction, error, {
            attempt,
            localCommitApplied
          });
          dispatch('p2p:lifecycle-retry-exhausted', {
            transaction: failedTransaction,
            error,
            attempt,
            maxAttempts: LIFECYCLE_FINALIZATION_MAX_ATTEMPTS,
            previousStatePreserved: !localCommitApplied,
            localCommitApplied
          });
        } else {
          if (localCommitApplied) {
            this.rememberLifecycleTransaction({ ...transaction, localCommitApplied: true }, { observe: false });
          }
          this.scheduleLifecycleFinalizationObserver({ immediate: true }, sessionContext);
        }
      }
    }
    return data;
  }

  trashProjectAfterReplicas(spaceId = '', options = {}) {
    return this.startProjectLifecycle('trash', spaceId, options);
  }

  restoreProjectAfterReplicas(spaceId = '', options = {}) {
    return this.startProjectLifecycle('restore', spaceId, options);
  }

  deleteProjectAfterReplicas(spaceId = '', options = {}) {
    return this.startProjectLifecycle('purge', spaceId, options);
  }

  async deleteSpace(spaceId = '') {
    const sessionContext = this.captureSessionContext();
    this.assertSessionContext(sessionContext);
    const cleanSpaceId = String(spaceId || '').trim();
    if (!cleanSpaceId) throw new Error('Falta el proyecto que deseas eliminar.');
    this.assertSpaceAuthorizationConfirmed(cleanSpaceId);
    const data = await apiPost('/api/p2p/access/delete', { spaceId: cleanSpaceId });
    this.assertSessionContext(sessionContext);
    await this.fenceBootstrapResponses(sessionContext);
    const purge = await purgeLocalSpace(cleanSpaceId);
    await purgeSpaceCrypto(cleanSpaceId).catch(() => null);
    this.assertSessionContext(sessionContext);
    this.removeSpaceFromBootstrapState(cleanSpaceId);
    this.recoveryRequirements = await updateRecoveryRequirements({
      retainSpaceIds: this.readableSpaceIds()
    });
    this.assertSessionContext(sessionContext);
    this.snapshotRecoveryRequired = Object.keys(this.recoveryRequirements).length > 0;
    await this.refreshBootstrap({ requestSnapshots: false }).catch((error) => {
      if (this.isSessionContextChangedError(error)) throw error;
      return null;
    });
    this.assertSessionContext(sessionContext);
    dispatch('p2p:space-deleted', {
      spaceId: cleanSpaceId,
      source: 'local-owner-delete',
      purge,
      result: data
    });
    return data;
  }

  async revoke(spaceId = '', userId = '') {
    const sessionContext = this.captureSessionContext();
    this.assertSessionContext(sessionContext);
    const cleanSpaceId = String(spaceId || '').trim();
    const cleanUserId = String(userId || '').trim();
    if (!cleanSpaceId || !cleanUserId) throw new Error('Falta el espacio o el participante cuyo acceso deseas revocar.');
    this.assertSpaceAuthorizationConfirmed(cleanSpaceId);
    const data = await apiPost('/api/p2p/access/revoke', { spaceId: cleanSpaceId, userId: cleanUserId });
    this.assertSessionContext(sessionContext);
    await this.fenceBootstrapResponses(sessionContext);
    await this.refreshBootstrap({ requestSnapshots: false });
    this.assertSessionContext(sessionContext);
    if (this.spaceRequiresEncryption(cleanSpaceId)) {
      try {
        const activeKey = await this.ensureCurrentSpaceKey(cleanSpaceId, { requireAuthority: true });
        data.keyRotation = {
          completed: true,
          keyId: String(activeKey?.keyId || '').trim(),
          keyEpoch: Math.max(0, Number(activeKey?.keyEpoch || 0)),
          distributionPending: activeKey?.distribution === null,
          ...(activeKey?.distribution || {})
        };
      } catch (error) {
        data.keyRotation = { completed: false, message: String(error?.message || error) };
        dispatch('p2p:key-rotation-pending', { spaceId: cleanSpaceId, error });
      }
      this.assertSessionContext(sessionContext);
    }
    return data;
  }

  async updatePermissions(spaceId = '', userId = '', permissions = []) {
    const sessionContext = this.captureSessionContext();
    this.assertSessionContext(sessionContext);
    const cleanSpaceId = String(spaceId || '').trim();
    const cleanUserId = String(userId || '').trim();
    const normalizedPermissions = Array.from(new Set(
      (Array.isArray(permissions) ? permissions : [])
        .map((permission) => String(permission || '').trim().toLowerCase())
        .filter(Boolean)
    ));
    if (!cleanSpaceId || !cleanUserId) throw new Error('Falta el espacio o el participante cuyos permisos deseas modificar.');
    this.assertSpaceAuthorizationConfirmed(cleanSpaceId);
    if (!normalizedPermissions.includes('read')) throw new Error('El permiso de lectura es obligatorio mientras el participante conserve acceso.');
    const data = await apiPost('/api/p2p/access/permissions', {
      spaceId: cleanSpaceId,
      userId: cleanUserId,
      permissions: normalizedPermissions
    });
    this.assertSessionContext(sessionContext);
    await this.fenceBootstrapResponses(sessionContext);
    await this.refreshBootstrap({ requestSnapshots: false });
    this.assertSessionContext(sessionContext);
    return data;
  }

  async transfer(spaceId = '', userId = '') {
    const sessionContext = this.captureSessionContext();
    this.assertSessionContext(sessionContext);
    const cleanSpaceId = String(spaceId || '').trim();
    const cleanUserId = String(userId || '').trim();
    if (!cleanSpaceId || !cleanUserId) throw new Error('Falta el espacio o el participante que recibirá la propiedad.');
    this.assertSpaceAuthorizationConfirmed(cleanSpaceId);
    const data = await apiPost('/api/p2p/access/transfer', { spaceId: cleanSpaceId, userId: cleanUserId });
    this.assertSessionContext(sessionContext);
    await this.fenceBootstrapResponses(sessionContext);
    await this.refreshBootstrap({ requestSnapshots: false });
    this.assertSessionContext(sessionContext);
    return data;
  }

  async preparePublishEnvelope(spaceId = '', operation = {}, options = {}, sessionContext = this.captureSessionContext(), createdAt = new Date().toISOString()) {
    this.assertSessionContext(sessionContext);
    this.assertSpaceAuthorizationConfirmed(spaceId);
    const normalizedOperationId = operation.operationId || createId('op');
    const normalizedType = operation.type || 'custom';
    const normalized = {
      operationId: normalizedOperationId,
      type: normalizedType,
      entityType: operation.entityType || (normalizedType === 'custom' ? 'custom' : 'generic'),
      entityId: operation.entityId || (normalizedType === 'custom' ? normalizedOperationId : ''),
      baseVersion: Number(operation.baseVersion || 0),
      payload: operation.payload && typeof operation.payload === 'object' ? operation.payload : {},
      dependentDeletes: normalizeDependentDeletes(operation.dependentDeletes, operation),
      encrypted: Boolean(operation.encrypted),
      encryptionVersion: Math.max(0, Number(operation.encryptionVersion || 0)),
      keyId: String(operation.keyId || '').trim(),
      clientCreatedAt: operation.clientCreatedAt || createdAt
    };
    if (isEntityOperationType(normalized.type) && jsonByteLength(normalized) > this.entityMaxBytes) {
      const error = new Error('La entidad supera el tamaño seguro para sincronizarse y reconstruirse entre dispositivos.');
      error.status = 413;
      throw error;
    }
    if (this.spaceRequiresEncryption(spaceId)) await this.ensureCurrentSpaceKey(spaceId);
    const transportOperation = this.spaceRequiresEncryption(spaceId)
      ? await encryptOperationForTransport(spaceId, normalized)
      : normalized;
    if (isEntityOperationType(transportOperation.type) && jsonByteLength(transportOperation) > this.entityMaxBytes) {
      const error = new Error('La entidad cifrada supera el tamaño seguro para sincronizarse entre dispositivos.');
      error.status = 413;
      throw error;
    }
    const deliveryIntent = normalizePublishDeliveryIntent(normalized.type, options);
    const targetDeviceIds = deliveryIntent.targetDeviceIds;
    const orderedSourceConfirmation = deliveryIntent.durableStateOperation
      && options.applyLocally !== false
      && this.canReadSpace(spaceId);
    const request = {
      deviceId: sessionContext.deviceId,
      spaceId,
      operation: transportOperation,
      targetDeviceIds,
      includeSourceDevice: deliveryIntent.includeSourceDevice
    };
    const localEvent = {
      eventId: `local_${normalized.operationId}`,
      eventType: 'p2p.operation',
      deliverySequence: 0,
      spaceSequence: 0,
      spaceId,
      actorUserId: sessionContext.userId,
      sourceDeviceId: sessionContext.deviceId,
      operation: normalized,
      createdAt,
      optimistic: true
    };
    const outboxItem = {
      operationId: normalized.operationId,
      spaceId,
      request,
      plainOperation: normalized,
      createdAt,
      attempts: Number(options.attempts || 0)
    };
    return { normalized, request, localEvent, outboxItem, deliveryIntent, orderedSourceConfirmation };
  }

  async publish(spaceId = '', operation = {}, options = {}) {
    const sessionContext = this.captureSessionContext();
    const prepared = await this.preparePublishEnvelope(spaceId, operation, options, sessionContext);
    const { normalized, request, localEvent, outboxItem, orderedSourceConfirmation } = prepared;
    if (orderedSourceConfirmation) {
      this.assertSessionContext(sessionContext);
      const applyResult = await enqueueOptimisticOperation(outboxItem, localEvent);
      this.assertSessionContext(sessionContext);
      dispatch('p2p:operation', { event: localEvent, optimistic: true, result: applyResult });
    }
    try {
      const data = await apiPost('/api/p2p/events/publish', request);
      this.assertSessionContext(sessionContext);
      const sourceWasNotQueued = orderedSourceConfirmation && (
        data?.sourceDeviceQueued === false
        || (data?.sourceDeviceQueued === undefined
          && Number.isFinite(Number(data?.deliveredToDevices))
          && Number(data.deliveredToDevices) === 0)
      );
      if (data.event && options.applyLocally !== false && (!orderedSourceConfirmation || sourceWasNotQueued)) {
        this.assertEncryptedTransportEvent(data.event);
        const localPublishedEvent = await decryptOperationEvent(data.event);
        await this.applyDecryptedOperationEvent(localPublishedEvent, sessionContext);
        this.assertSessionContext(sessionContext);
        dispatch('p2p:operation-local-publish', {
          event: localPublishedEvent,
          localPublish: true,
          orderedSourceFallback: sourceWasNotQueued
        });
      }
      if (!orderedSourceConfirmation || sourceWasNotQueued) {
        await removeOutbox(normalized.operationId).catch(() => null);
        this.assertSessionContext(sessionContext);
      }
      this.assertSessionContext(sessionContext);
      dispatch('p2p:operation-published', { event: data.event, request });
      if (isEntityOperationType(normalized.type) && typeof this.scheduleReplicaHealthRefresh === 'function') {
        this.scheduleReplicaHealthRefresh([spaceId]);
      }
      return data;
    } catch (error) {
      if (this.isSessionContextChangedError(error) || !this.isSessionContextCurrent(sessionContext)) {
        throw this.createSessionContextChangedError();
      }
      const retryable = this.isRetryableTransportError(error);
      if (orderedSourceConfirmation) {
        const stillPending = (await listOutbox()).some((item) => item?.operationId === normalized.operationId);
        this.assertSessionContext(sessionContext);
        if (!stillPending) {
          dispatch('p2p:operation-published', {
            event: null,
            request,
            confirmedByStream: true,
            responseError: error
          });
          return { event: null, request, confirmedByStream: true, responseError: error };
        }
        if (!retryable || options.queueWhenOffline === false) {
          await this.revertRejectedOutbox(outboxItem, error, sessionContext);
          this.assertSessionContext(sessionContext);
        }
        else { error.p2pQueued = true; dispatch('p2p:outbox', { queued: true, operationId: normalized.operationId }); }
      } else if (retryable && options.queueWhenOffline !== false) {
        if (options.applyLocally !== false) {
          const applyResult = await enqueueOptimisticOperation(outboxItem, localEvent);
          this.assertSessionContext(sessionContext);
          dispatch('p2p:operation', { event: localEvent, optimistic: true, result: applyResult });
        } else {
          await enqueueOutbox(outboxItem);
          this.assertSessionContext(sessionContext);
        }
        error.p2pQueued = true;
        dispatch('p2p:outbox', { queued: true, operationId: normalized.operationId });
      }
      if (retryable && error.p2pQueued === true) {
        const localDelivery = await this.broadcastPreparedOperationToLocalNetwork(prepared).catch(() => ({ delivered: 0, peers: [] }));
        if (Number(localDelivery?.delivered || 0) > 0) {
          error.p2pLocalDelivered = Number(localDelivery.delivered || 0);
          dispatch('p2p:operation-local-network-published', {
            operationId: normalized.operationId,
            delivered: error.p2pLocalDelivered,
            peers: localDelivery.peers || []
          });
        }
      }
      throw error;
    }
  }

  async publishBatch(spaceId = '', entries = [], options = {}) {
    const sessionContext = this.captureSessionContext();
    this.assertSessionContext(sessionContext);
    const sources = Array.isArray(entries) ? entries.filter(Boolean) : [];
    if (sources.length < 2) throw new Error('Un lote recuperable necesita al menos dos operaciones relacionadas.');
    if (sources.length > 8) throw new Error('El lote recuperable supera el máximo de ocho operaciones.');

    const batchId = String(options.batchId || '').trim() || createId('batch');
    const baseCreatedAtMs = Date.now();
    const preparedEntries = [];
    for (let index = 0; index < sources.length; index += 1) {
      const source = sources[index] || {};
      const operation = source.operation && typeof source.operation === 'object' ? source.operation : source;
      const entryOptions = {
        ...options,
        ...(source.options && typeof source.options === 'object' ? source.options : {}),
        applyLocally: true
      };
      delete entryOptions.batchId;
      const createdAt = new Date(baseCreatedAtMs + index).toISOString();
      const prepared = await this.preparePublishEnvelope(spaceId, operation, entryOptions, sessionContext, createdAt);
      if (!prepared.deliveryIntent.durableStateOperation || !prepared.orderedSourceConfirmation) {
        throw new Error('Los lotes recuperables solo admiten operaciones durables aplicables localmente.');
      }
      prepared.outboxItem = {
        ...prepared.outboxItem,
        batchId,
        batchIndex: index,
        batchSize: sources.length,
        abortBatchOnFailure: true
      };
      preparedEntries.push(prepared);
    }

    this.assertSessionContext(sessionContext);
    const localBatch = await enqueueOptimisticOperationBatch(preparedEntries.map((prepared) => ({
      item: prepared.outboxItem,
      event: prepared.localEvent
    })));
    this.assertSessionContext(sessionContext);
    preparedEntries.forEach((prepared, index) => {
      dispatch('p2p:operation', {
        event: prepared.localEvent,
        optimistic: true,
        batchId,
        batchIndex: index,
        result: localBatch.results[index]
      });
    });
    dispatch('p2p:outbox', {
      queued: true,
      batchId,
      operationIds: preparedEntries.map((prepared) => prepared.normalized.operationId)
    });

    if (!navigator.onLine || !getSessionToken()) {
      const localDelivery = await this.broadcastPreparedOperationBatchToLocalNetwork(preparedEntries, batchId)
        .catch(() => ({ delivered: 0, peers: [] }));
      return {
        batchId,
        operationIds: preparedEntries.map((prepared) => prepared.normalized.operationId),
        queued: true,
        sent: 0,
        rejected: 0,
        pending: preparedEntries.length,
        localDelivered: Math.max(0, Number(localDelivery?.delivered || 0)),
        localPeers: localDelivery?.peers || []
      };
    }

    const flushResult = await this.flushOutbox();
    this.assertSessionContext(sessionContext);
    const operationIds = preparedEntries.map((prepared) => prepared.normalized.operationId);
    const rejectedOperations = (flushResult.rejectedOperations || []).filter((entry) => entry.batchId === batchId);
    if (rejectedOperations.length) {
      const error = new Error('El lote se guardó de forma recuperable, pero una de sus operaciones fue rechazada.');
      error.code = 'P2P_BATCH_PARTIAL_REJECTION';
      error.status = Number(rejectedOperations[0]?.status || 409);
      error.p2pBatchPartial = true;
      error.batchId = batchId;
      error.operationIds = operationIds;
      error.rejectedOperations = rejectedOperations;
      throw error;
    }

    const sentOperationIds = new Set((flushResult.sentOperations || [])
      .filter((entry) => entry.batchId === batchId)
      .map((entry) => String(entry.operationId || '').trim()));
    const currentOutboxOperationIds = new Set((await listOutbox())
      .map((entry) => String(entry?.operationId || '').trim())
      .filter(Boolean));
    this.assertSessionContext(sessionContext);
    const pending = operationIds.filter((operationId) => !sentOperationIds.has(operationId)
      && currentOutboxOperationIds.has(operationId)).length;
    const confirmed = operationIds.filter((operationId) => sentOperationIds.has(operationId)
      || !currentOutboxOperationIds.has(operationId)).length;
    const localDelivery = pending > 0
      ? await this.broadcastPreparedOperationBatchToLocalNetwork(preparedEntries, batchId)
        .catch(() => ({ delivered: 0, peers: [] }))
      : { delivered: 0, peers: [] };
    return {
      batchId,
      operationIds,
      queued: pending > 0,
      sent: confirmed,
      rejected: 0,
      pending,
      delegated: Boolean(flushResult.delegated),
      localDelivered: Math.max(0, Number(localDelivery?.delivered || 0)),
      localPeers: localDelivery?.peers || []
    };
  }

  put(spaceId, entityType, entityId, value, options = {}) {
    const { operationId, referenceRequirements, ...publishOptions } = options || {};
    const normalizedReferenceRequirements = normalizeReferenceRequirements(referenceRequirements);
    return this.publish(spaceId, {
      operationId: String(operationId || '').trim() || undefined,
      type: 'entity.put',
      entityType,
      entityId,
      payload: {
        value,
        ...(normalizedReferenceRequirements.length ? { referenceRequirements: normalizedReferenceRequirements } : {})
      }
    }, publishOptions);
  }

  patch(spaceId, entityType, entityId, patch, options = {}) {
    const { operationId, expected, conflictPolicy, ...publishOptions } = options || {};
    const hasExpected = expected && typeof expected === 'object' && !Array.isArray(expected);
    return this.publish(spaceId, {
      operationId: String(operationId || '').trim() || undefined,
      type: 'entity.patch',
      entityType,
      entityId,
      payload: {
        patch,
        ...(hasExpected ? {
          expected,
          conflictPolicy: conflictPolicy || 'preserve-remote'
        } : {})
      }
    }, publishOptions);
  }

  lifecycleOperation(type, spaceId, entityType, entityId, options = {}) {
    const { operationId, expected, at, actorUserId, ...publishOptions } = options || {};
    const hasExpected = expected && typeof expected === 'object' && !Array.isArray(expected);
    return this.publish(spaceId, {
      operationId: String(operationId || '').trim() || undefined,
      type,
      entityType,
      entityId,
      payload: {
        ...(hasExpected ? { expected } : {}),
        at: String(at || '').trim() || new Date().toISOString(),
        actorUserId: String(actorUserId || this.user?.userId || '').trim()
      }
    }, publishOptions);
  }

  trash(spaceId, entityType, entityId, options = {}) {
    return this.lifecycleOperation('entity.trash', spaceId, entityType, entityId, options);
  }

  restore(spaceId, entityType, entityId, options = {}) {
    return this.lifecycleOperation('entity.restore', spaceId, entityType, entityId, options);
  }

  purge(spaceId, entityType, entityId, options = {}) {
    return this.delete(spaceId, entityType, entityId, { ...options, operationType: 'entity.purge' });
  }

  delete(spaceId, entityType, entityId, options = {}) {
    const { operationId, operationType = 'entity.delete', expected, conflictPolicy, referenceGuards, dependentDeletes, ...publishOptions } = options || {};
    const hasExpected = expected && typeof expected === 'object' && !Array.isArray(expected);
    const normalizedReferenceGuards = normalizeDeleteReferenceGuards(referenceGuards);
    const normalizedDependentDeletes = normalizeDependentDeletes(dependentDeletes, { entityType, entityId });
    return this.publish(spaceId, {
      operationId: String(operationId || '').trim() || undefined,
      type: operationType === 'entity.purge' ? 'entity.purge' : 'entity.delete',
      entityType,
      entityId,
      ...(normalizedDependentDeletes.length ? { dependentDeletes: normalizedDependentDeletes } : {}),
      payload: {
        ...(hasExpected ? {
          expected,
          conflictPolicy: conflictPolicy || 'preserve-remote'
        } : {}),
        ...(normalizedReferenceGuards.length ? { referenceGuards: normalizedReferenceGuards } : {})
      }
    }, publishOptions);
  }

  custom(spaceId, payload, options = {}) {
    const { operationId, entityType, entityId, ...publishOptions } = options || {};
    return this.publish(spaceId, {
      operationId: String(operationId || '').trim() || undefined,
      type: 'custom',
      entityType: entityType || 'custom',
      entityId: entityId || createId('custom'),
      payload
    }, publishOptions);
  }

  async flushOutbox() {
    if (!navigator.onLine || !getSessionToken()) return { sent: 0, rejected: 0, pending: 0, sentOperations: [], rejectedOperations: [] };
    const sessionContext = this.captureSessionContext();
    this.assertSessionContext(sessionContext);
    if (!this.realtimeLeader) {
      const pendingCount = (await listOutbox()).length;
      this.assertSessionContext(sessionContext);
      if (pendingCount) this.tabCoordinator.broadcast('outbox-ready', { pending: pendingCount });
      return { sent: 0, rejected: 0, pending: pendingCount, delegated: true, sentOperations: [], rejectedOperations: [] };
    }
    const pending = await listOutbox();
    this.assertSessionContext(sessionContext);
    let sent = 0;
    let rejected = 0;
    const sentOperations = [];
    const rejectedOperations = [];
    const cancelledOperationIds = new Set();
    const processedOperationIds = new Set();
    const individualBatchFallbackIds = new Set();
    const blockedSpaceIds = new Set();
    outboxLoop:
    for (const queuedItem of pending) {
      const queuedOperationId = String(queuedItem?.operationId || '').trim();
      if (cancelledOperationIds.has(queuedOperationId) || processedOperationIds.has(queuedOperationId)) continue;
      let item = queuedItem;
      const itemSpaceId = String(item?.spaceId || item?.request?.spaceId || '').trim();
      if (blockedSpaceIds.has(itemSpaceId)) continue;
      if (this.isSpaceAuthorizationUnconfirmed(itemSpaceId)) {
        blockedSpaceIds.add(itemSpaceId);
        dispatch('p2p:outbox-authorization-waiting', {
          operationId: item.operationId,
          spaceId: itemSpaceId
        });
        continue;
      }

      if (item?.relayedFromLocalNetwork === true) {
        const relayedAtomicBatch = this.completeAtomicOutboxBatch(pending, item, individualBatchFallbackIds);
        if (relayedAtomicBatch.length) {
          const batchId = String(item?.batchId || '').trim();
          try {
            const envelopes = relayedAtomicBatch.map((candidate) => candidate?.localRelayEnvelope || null);
            if (envelopes.some((envelope) => !envelope?.capability || !envelope?.signedPayload || !envelope?.signature)) {
              const error = new Error('El lote offline perdió uno de sus sobres criptográficos originales y no puede conservar la autoría.');
              error.status = 409;
              error.code = 'P2P_SIN_RELAY_BATCH_ENVELOPE_MISSING';
              throw error;
            }
            const data = await apiPost('/api/p2p/events/relay-local-batch', {
              deviceId: sessionContext.deviceId,
              batchId,
              envelopes
            });
            this.assertSessionContext(sessionContext);
            const events = Array.isArray(data?.events) ? data.events : [];
            const responseMatches = events.length === relayedAtomicBatch.length && events.every((event, index) => (
              String(event?.operation?.operationId || '').trim()
                === String(relayedAtomicBatch[index]?.operationId || relayedAtomicBatch[index]?.request?.operation?.operationId || '').trim()
              && String(event?.batchId || '').trim() === batchId
              && Math.max(0, Number(event?.batchIndex || 0)) === index
              && Math.max(0, Number(event?.batchSize || 0)) === relayedAtomicBatch.length
            ));
            if (!responseMatches) {
              const responseError = new Error('El relay devolvió un lote offline incompleto o fuera de orden.');
              responseError.status = 502;
              responseError.code = 'P2P_SIN_RELAY_BATCH_RESPONSE_INVALID';
              throw responseError;
            }

            const canonicalRelayedEvents = [];
            for (const event of events) {
              this.assertEncryptedTransportEvent(event);
              canonicalRelayedEvents.push(await decryptOperationEvent(event));
              this.assertSessionContext(sessionContext);
            }
            await this.applyDecryptedOperationEventBatch(canonicalRelayedEvents, sessionContext, {
              outboxConfirmed: true,
              localRelayConfirmation: true
            });
            this.assertSessionContext(sessionContext);

            for (const candidate of relayedAtomicBatch) {
              const operationId = String(candidate?.operationId || '').trim();
              await removeOutbox(operationId);
              this.assertSessionContext(sessionContext);
              processedOperationIds.add(operationId);
              sent += 1;
              sentOperations.push({
                operationId,
                batchId,
                batchIndex: Math.max(0, Number(candidate?.batchIndex || 0)),
                atomic: true,
                relayedFromLocalNetwork: true,
                originalActorUserId: String(data?.originalActorUserId || candidate?.originalActorUserId || '').trim(),
                originalSourceDeviceId: String(data?.originalSourceDeviceId || candidate?.originalSourceDeviceId || '').trim()
              });
            }
            dispatch('p2p:operation-local-relay-batch-confirmed', {
              events: canonicalRelayedEvents,
              batchId,
              operationIds: relayedAtomicBatch.map((candidate) => String(candidate?.operationId || '').trim()),
              originalActorUserId: String(data?.originalActorUserId || item?.originalActorUserId || '').trim(),
              originalSourceDeviceId: String(data?.originalSourceDeviceId || item?.originalSourceDeviceId || '').trim(),
              reused: Boolean(data?.reused)
            });
            continue;
          } catch (error) {
            if (this.isSessionContextChangedError(error) || !this.isSessionContextCurrent(sessionContext)) {
              throw this.createSessionContextChangedError();
            }
            const relayCode = String(error?.code || '').trim().toUpperCase();
            if (relayCode === 'P2P_BATCH_PREEXISTING_OPERATION') {
              individualBatchFallbackIds.add(batchId);
            } else {
              const signedRelayCannotRefresh = this.isKeyAuthorityRetryableError(error);
              const optionalRelayUnavailable = relayCode === 'P2P_SIN_CAPABILITY_UNAVAILABLE';
              if (!signedRelayCannotRefresh && !optionalRelayUnavailable && !this.isPermanentOutboxRejection(error)) {
                break outboxLoop;
              }
              await this.revertRejectedOutboxBatch(relayedAtomicBatch, error, sessionContext);
              this.assertSessionContext(sessionContext);
              for (const candidate of relayedAtomicBatch) {
                const operationId = String(candidate?.operationId || '').trim();
                processedOperationIds.add(operationId);
                rejected += 1;
                rejectedOperations.push({
                  operationId,
                  batchId,
                  batchIndex: Math.max(0, Number(candidate?.batchIndex || 0)),
                  status: Number(error?.status || 0),
                  code: String(error?.code || ''),
                  message: String(error?.message || ''),
                  relayedFromLocalNetwork: true,
                  atomic: true
                });
              }
              continue;
            }
          }
        }

        try {
          const envelope = item?.localRelayEnvelope;
          if (!envelope?.capability || !envelope?.signedPayload || !envelope?.signature) {
            const error = new Error('La operación offline perdió su sobre criptográfico original y no puede conservar la autoría.');
            error.status = 409;
            error.code = 'P2P_SIN_RELAY_ENVELOPE_MISSING';
            throw error;
          }
          const data = await apiPost('/api/p2p/events/relay-local', {
            deviceId: sessionContext.deviceId,
            envelope
          });
          this.assertSessionContext(sessionContext);
          if (data?.event) {
            this.assertEncryptedTransportEvent(data.event);
            const canonicalRelayedEvent = await decryptOperationEvent(data.event);
            await this.applyDecryptedOperationEvent(canonicalRelayedEvent, sessionContext, {
              localRelayConfirmation: true
            });
            this.assertSessionContext(sessionContext);
            dispatch('p2p:operation-local-relay-confirmed', {
              event: canonicalRelayedEvent,
              reused: Boolean(data?.reused)
            });
          }
          await removeOutbox(item.operationId);
          this.assertSessionContext(sessionContext);
          processedOperationIds.add(queuedOperationId);
          sent += 1;
          sentOperations.push({
            operationId: queuedOperationId,
            relayedFromLocalNetwork: true,
            originalActorUserId: String(data?.originalActorUserId || item?.originalActorUserId || '').trim(),
            originalSourceDeviceId: String(data?.originalSourceDeviceId || item?.originalSourceDeviceId || '').trim()
          });
          dispatch('p2p:operation-local-relayed', {
            operationId: queuedOperationId,
            spaceId: itemSpaceId,
            originalActorUserId: data?.originalActorUserId || item?.originalActorUserId || '',
            originalSourceDeviceId: data?.originalSourceDeviceId || item?.originalSourceDeviceId || '',
            reused: Boolean(data?.reused)
          });
        } catch (error) {
          if (this.isSessionContextChangedError(error) || !this.isSessionContextCurrent(sessionContext)) {
            throw this.createSessionContextChangedError();
          }
          const relayCode = String(error?.code || '').trim().toUpperCase();
          const signedRelayCannotRefresh = this.isKeyAuthorityRetryableError(error);
          const optionalRelayUnavailable = relayCode === 'P2P_SIN_CAPABILITY_UNAVAILABLE';
          if (!signedRelayCannotRefresh && !optionalRelayUnavailable && !this.isPermanentOutboxRejection(error)) break outboxLoop;
          await this.revertRejectedOutbox(item, error, sessionContext);
          this.assertSessionContext(sessionContext);
          processedOperationIds.add(queuedOperationId);
          rejected += 1;
          rejectedOperations.push({
            operationId: queuedOperationId,
            status: Number(error?.status || 0),
            code: String(error?.code || ''),
            message: String(error?.message || ''),
            relayedFromLocalNetwork: true
          });
        }
        continue;
      }

      const atomicBatch = this.completeAtomicOutboxBatch(pending, item, individualBatchFallbackIds);
      if (atomicBatch.length) {
        const batchId = String(item.batchId || '').trim();
        let batchItems = atomicBatch;
        let authorityRefreshAttempted = false;
        let fallbackToIndividual = false;
        let batchHandled = false;
        while (true) {
          this.assertSessionContext(sessionContext);
          try {
            const data = await apiPost('/api/p2p/events/publish-batch', {
              deviceId: sessionContext.deviceId,
              spaceId: itemSpaceId,
              batchId,
              operations: batchItems.map((candidate) => candidate?.request?.operation || {})
            });
            this.assertSessionContext(sessionContext);
            const events = Array.isArray(data?.events) ? data.events : [];
            const responseMatches = events.length === batchItems.length && events.every((event, index) => (
              String(event?.operation?.operationId || '').trim()
                === String(batchItems[index]?.operationId || batchItems[index]?.request?.operation?.operationId || '').trim()
            ));
            if (!responseMatches) {
              const responseError = new Error('El relay devolvió un lote incompleto o fuera de orden.');
              responseError.status = 502;
              responseError.code = 'P2P_BATCH_RESPONSE_INVALID';
              throw responseError;
            }

            const sourceWasNotQueued = data?.sourceDeviceQueued === false;
            if (sourceWasNotQueued) {
              const replayedEvents = [];
              for (const event of events) {
                this.assertEncryptedTransportEvent(event);
                replayedEvents.push(await decryptOperationEvent(event));
                this.assertSessionContext(sessionContext);
              }
              await this.applyDecryptedOperationEventBatch(replayedEvents, sessionContext, {
                outboxConfirmed: true,
                orderedSourceFallback: true
              });
              this.assertSessionContext(sessionContext);
            }

            for (const candidate of batchItems) {
              const operationId = String(candidate?.operationId || '').trim();
              processedOperationIds.add(operationId);
              sent += 1;
              sentOperations.push({
                operationId,
                batchId,
                batchIndex: Math.max(0, Number(candidate?.batchIndex || 0)),
                atomic: true
              });
            }
            dispatch('p2p:operation-batch-published', {
              batchId,
              operationIds: batchItems.map((candidate) => String(candidate?.operationId || '').trim()),
              sourceDeviceQueued: data?.sourceDeviceQueued !== false,
              reused: Boolean(data?.reused)
            });
            batchHandled = true;
            break;
          } catch (error) {
            if (this.isSessionContextChangedError(error) || !this.isSessionContextCurrent(sessionContext)) {
              throw this.createSessionContextChangedError();
            }
            let liveOutbox = null;
            try {
              liveOutbox = await listOutbox();
              this.assertSessionContext(sessionContext);
            } catch (outboxError) {
              if (this.isSessionContextChangedError(outboxError) || !this.isSessionContextCurrent(sessionContext)) {
                throw this.createSessionContextChangedError();
              }
            }
            if (Array.isArray(liveOutbox)) {
              const liveOperationIds = new Set(liveOutbox.map((candidate) => String(candidate?.operationId || '').trim()).filter(Boolean));
              if (batchItems.every((candidate) => !liveOperationIds.has(String(candidate?.operationId || '').trim()))) {
                for (const candidate of batchItems) {
                  const operationId = String(candidate?.operationId || '').trim();
                  processedOperationIds.add(operationId);
                  sent += 1;
                  sentOperations.push({
                    operationId,
                    batchId,
                    batchIndex: Math.max(0, Number(candidate?.batchIndex || 0)),
                    atomic: true,
                    confirmedByStream: true
                  });
                }
                dispatch('p2p:operation-batch-published', {
                  batchId,
                  operationIds: batchItems.map((candidate) => String(candidate?.operationId || '').trim()),
                  confirmedByStream: true,
                  responseError: error
                });
                batchHandled = true;
                break;
              }
            }
            if (String(error?.code || '').trim().toUpperCase() === 'P2P_BATCH_PREEXISTING_OPERATION') {
              individualBatchFallbackIds.add(batchId);
              fallbackToIndividual = true;
              break;
            }
            if (this.isKeyAuthorityRetryableError(error) && !authorityRefreshAttempted) {
              authorityRefreshAttempted = true;
              try {
                batchItems = await this.refreshOutboxBatchEncryption(batchItems, sessionContext);
                item = batchItems.find((candidate) => String(candidate?.operationId || '').trim() === queuedOperationId) || item;
                continue;
              } catch (refreshError) {
                if (this.isSessionContextChangedError(refreshError) || !this.isSessionContextCurrent(sessionContext)) {
                  throw this.createSessionContextChangedError();
                }
                if (!this.isSpaceLocalOutboxBlocker(refreshError)) break outboxLoop;
                blockedSpaceIds.add(itemSpaceId);
                dispatch('p2p:outbox-key-waiting', {
                  operationId: item.operationId,
                  batchId,
                  spaceId: itemSpaceId,
                  error: refreshError
                });
                batchHandled = true;
                break;
              }
            }
            if (!this.isPermanentOutboxRejection(error)) {
              if (!this.isSpaceLocalOutboxBlocker(error)) break outboxLoop;
              blockedSpaceIds.add(itemSpaceId);
              dispatch('p2p:outbox-space-blocked', {
                operationId: item.operationId,
                batchId,
                spaceId: itemSpaceId,
                error
              });
              batchHandled = true;
              break;
            }

            await this.revertRejectedOutboxBatch(batchItems, error, sessionContext);
            this.assertSessionContext(sessionContext);
            for (const candidate of batchItems) {
              const operationId = String(candidate?.operationId || '').trim();
              processedOperationIds.add(operationId);
              rejected += 1;
              rejectedOperations.push({
                operationId,
                batchId,
                batchIndex: Math.max(0, Number(candidate?.batchIndex || 0)),
                status: Number(error?.status || 0),
                code: String(error?.code || ''),
                message: String(error?.message || ''),
                cancelled: false,
                atomic: true
              });
            }
            batchHandled = true;
            break;
          }
        }
        if (batchHandled) continue;
        if (fallbackToIndividual) {
          item = batchItems.find((candidate) => String(candidate?.operationId || '').trim() === queuedOperationId) || item;
        }
      }

      let authorityRefreshAttempted = false;
      while (true) {
        this.assertSessionContext(sessionContext);
        try {
          const endpoint = String(item?.endpoint || '/api/p2p/events/publish');
          const data = await apiPost(endpoint, item.request);
          this.assertSessionContext(sessionContext);
          if (item?.lifecycleAction) {
            await enqueueOutbox({
              ...item,
              backendLifecycle: data?.lifecycle ? { ...data.lifecycle } : item.backendLifecycle || null,
              backendAcceptedAt: new Date().toISOString(),
              attempts: Math.max(0, Number(item.attempts || 0)) + 1
            });
            this.assertSessionContext(sessionContext);
            if (data?.lifecycle) {
              this.rememberLifecycleTransaction(data.lifecycle);
              dispatch('p2p:lifecycle-progress', { transaction: data.lifecycle, source: 'outbox' });
            }
            sent += 1;
            sentOperations.push({
              operationId: String(item?.operationId || '').trim(),
              lifecycleAction: String(item.lifecycleAction || '').trim()
            });
            break;
          }
          const operation = item?.request?.operation || {};
          const orderedSourceConfirmation = item?.request?.includeSourceDevice === true
            && isEntityOperationType(operation.type)
            && !(item?.request?.targetDeviceIds || []).length;
          const sourceWasNotQueued = orderedSourceConfirmation && (
            data?.sourceDeviceQueued === false
            || (data?.sourceDeviceQueued === undefined
              && Number.isFinite(Number(data?.deliveredToDevices))
              && Number(data.deliveredToDevices) === 0)
          );
          if (data.event && (!orderedSourceConfirmation || sourceWasNotQueued)) {
            this.assertEncryptedTransportEvent(data.event);
            const replayedEvent = await decryptOperationEvent(data.event);
            await this.applyDecryptedOperationEvent(replayedEvent, sessionContext);
            this.assertSessionContext(sessionContext);
            dispatch('p2p:operation-outbox-confirmed', {
              event: replayedEvent,
              replayedFromOutbox: true,
              orderedSourceFallback: sourceWasNotQueued
            });
          }
          if (!orderedSourceConfirmation || sourceWasNotQueued) {
            await removeOutbox(item.operationId);
            this.assertSessionContext(sessionContext);
          }
          sent += 1;
          sentOperations.push({
            operationId: String(item?.operationId || '').trim(),
            batchId: String(item?.batchId || '').trim(),
            batchIndex: Math.max(0, Number(item?.batchIndex || 0))
          });
          break;
        } catch (error) {
          if (this.isSessionContextChangedError(error) || !this.isSessionContextCurrent(sessionContext)) {
            throw this.createSessionContextChangedError();
          }
          if (this.isKeyAuthorityRetryableError(error) && !authorityRefreshAttempted) {
            authorityRefreshAttempted = true;
            try {
              const refreshedItem = await this.refreshOutboxEncryption(item, sessionContext);
              if (refreshedItem) {
                item = refreshedItem;
                continue;
              }
            } catch (refreshError) {
              if (this.isSessionContextChangedError(refreshError) || !this.isSessionContextCurrent(sessionContext)) {
                throw this.createSessionContextChangedError();
              }
              if (!this.isSpaceLocalOutboxBlocker(refreshError)) break outboxLoop;
              blockedSpaceIds.add(itemSpaceId);
              dispatch('p2p:outbox-key-waiting', {
                operationId: item.operationId,
                spaceId: itemSpaceId,
                error: refreshError
              });
              break;
            }
          }
          if (!this.isPermanentOutboxRejection(error)) {
            if (!this.isSpaceLocalOutboxBlocker(error)) break outboxLoop;
            blockedSpaceIds.add(itemSpaceId);
            dispatch('p2p:outbox-space-blocked', {
              operationId: item.operationId,
              spaceId: itemSpaceId,
              error
            });
            break;
          }
          await this.revertRejectedOutbox(item, error, sessionContext);
          this.assertSessionContext(sessionContext);
          rejected += 1;
          rejectedOperations.push({
            operationId: String(item?.operationId || '').trim(),
            batchId: String(item?.batchId || '').trim(),
            batchIndex: Math.max(0, Number(item?.batchIndex || 0)),
            status: Number(error?.status || 0),
            code: String(error?.code || ''),
            message: String(error?.message || ''),
            cancelled: false
          });

          const batchId = String(item?.batchId || '').trim();
          if (batchId && item?.abortBatchOnFailure !== false) {
            const failedIndex = Math.max(0, Number(item?.batchIndex || 0));
            const batchCancellationError = new Error('La operación anterior del mismo lote fue rechazada; esta operación se canceló para conservar la consistencia local.');
            batchCancellationError.status = 409;
            batchCancellationError.code = 'P2P_BATCH_CANCELLED';
            for (const candidate of pending) {
              const candidateOperationId = String(candidate?.operationId || '').trim();
              if (!candidateOperationId
                || cancelledOperationIds.has(candidateOperationId)
                || String(candidate?.batchId || '').trim() !== batchId
                || Math.max(0, Number(candidate?.batchIndex || 0)) <= failedIndex) continue;
              await this.revertRejectedOutbox(candidate, batchCancellationError, sessionContext);
              this.assertSessionContext(sessionContext);
              cancelledOperationIds.add(candidateOperationId);
              rejected += 1;
              rejectedOperations.push({
                operationId: candidateOperationId,
                batchId,
                batchIndex: Math.max(0, Number(candidate?.batchIndex || 0)),
                status: 409,
                code: 'P2P_BATCH_CANCELLED',
                message: batchCancellationError.message,
                cancelled: true
              });
            }
          }
          break;
        }
      }
    }
    const remaining = (await listOutbox()).length;
    this.assertSessionContext(sessionContext);
    if (sent > 0 && typeof this.scheduleReplicaHealthRefresh === 'function' && typeof this.readableSpaceIds === 'function') {
      this.scheduleReplicaHealthRefresh(this.readableSpaceIds());
    }
    return { sent, rejected, pending: remaining, sentOperations, rejectedOperations };
  }

  async sendSnapshot(requestEvent = {}) {
    if (!this.realtimeLeader) return false;
    const sessionContext = this.captureSessionContext();
    this.assertSessionContext(sessionContext);
    const request = requestEvent.data || {};
    const requestDeviceId = String(request.requestDeviceId || '').trim();
    const requestId = String(request.requestId || '').trim();
    const spaceId = String(request.spaceId || requestEvent.spaceId || '').trim();
    if (!requestDeviceId || !requestId || !spaceId || requestDeviceId === sessionContext.deviceId) return false;
    const expiresAt = Date.parse(request.expiresAt || '');
    if (Number.isFinite(expiresAt) && expiresAt <= Date.now() + 1000) return false;

    const localStateRevisions = await listStateRevisions([spaceId]);
    this.assertSessionContext(sessionContext);
    const localStateRevision = Math.max(0, Number(localStateRevisions?.[spaceId] || 0));
    const requestedStateRevision = Math.max(0, Number(request.currentStateRevision || 0));
    this.recoveryRequirements = await getRecoveryRequirements();
    this.assertSessionContext(sessionContext);
    const unresolvedRecoveryRevision = Math.max(0, Number(this.recoveryRequirements?.[spaceId] || 0));
    if (unresolvedRecoveryRevision || localStateRevision !== requestedStateRevision) {
      dispatch('p2p:snapshot-source-deferred', {
        requestId,
        spaceId,
        localStateRevision,
        requestedStateRevision,
        unresolvedRecoveryRevision,
        reason: unresolvedRecoveryRevision
          ? 'source_recovery_pending'
          : localStateRevision < requestedStateRevision
            ? 'source_revision_behind'
            : 'source_revision_advanced'
      });
      return false;
    }

    let pendingForSpace = (await listOutbox()).filter((item) => String(item?.spaceId || '').trim() === spaceId);
    this.assertSessionContext(sessionContext);
    if (pendingForSpace.length && navigator.onLine && getSessionToken()) {
      await this.flushOutbox().catch((error) => {
        if (this.isSessionContextChangedError(error)) throw error;
        return null;
      });
      this.assertSessionContext(sessionContext);
      pendingForSpace = (await listOutbox()).filter((item) => String(item?.spaceId || '').trim() === spaceId);
      this.assertSessionContext(sessionContext);
    }

    const localEntities = await listEntities(spaceId);
    this.assertSessionContext(sessionContext);
    const hasOptimisticEntities = localEntities.some((entity) => entity?.optimistic === true);
    if (pendingForSpace.length || hasOptimisticEntities) {
      dispatch('p2p:snapshot-source-deferred', {
        requestId,
        spaceId,
        pendingOperations: pendingForSpace.length,
        optimisticEntities: localEntities.filter((entity) => entity?.optimistic === true).length
      });
      return false;
    }

    const entities = sortSnapshotEntities(localEntities.map((entity) => ({
      entityType: entity.entityType,
      entityId: entity.entityId,
      value: entity.value,
      deleted: Boolean(entity.deleted),
      operationId: entity.operationId,
      operationType: entity.operationType || (entity.deleted ? 'entity.delete' : 'entity.put'),
      spaceSequence: Number(entity.spaceSequence || 0),
      stateRevision: Number(entity.stateRevision || entity.spaceSequence || 0),
      updatedAt: entity.updatedAt || ''
    })));
    const entityStateRevision = entities.reduce((maximum, entity) => Math.max(
      maximum,
      Number(entity.stateRevision || entity.spaceSequence || 0)
    ), 0);
    const sourceStateRevision = Math.max(entityStateRevision, localStateRevision);
    const snapshotDigest = await sha256Hex(JSON.stringify(entities));
    this.assertSessionContext(sessionContext);
    let transportEntities = entities;
    let encryptionMetadata = {};
    if (this.spaceRequiresEncryption(spaceId)) {
      const activeKey = await getActiveSpaceKey(spaceId);
      if (!activeKey) {
        await this.requestSpaceKey(spaceId, '', { force: true }).catch(() => false);
        const error = new Error('Este dispositivo todavía no tiene la clave necesaria para reconstruir el proyecto.');
        error.code = 'P2P_SPACE_KEY_MISSING';
        throw error;
      }
      transportEntities = await encryptSnapshotEntities(spaceId, entities);
      encryptionMetadata = { encrypted: true, encryptionVersion: 1, keyId: activeKey.keyId };
    }
    this.assertSessionContext(sessionContext);
    const chunks = snapshotChunksByBytes(transportEntities, this.eventMaxBytes);
    if (chunks.length > this.snapshotMaxChunks) {
      const error = new Error('La copia local necesita demasiados fragmentos para reconstruirse de forma segura. Reduce o divide la información del proyecto.');
      error.code = 'P2P_SNAPSHOT_TOO_LARGE';
      throw error;
    }
    const chunkByteCounts = chunks.map((chunk) => jsonByteLength(chunk));
    const snapshotByteCount = chunkByteCounts.reduce((total, bytes) => total + bytes, 0);
    if (snapshotByteCount > this.snapshotMaxBytes) {
      const error = new Error('La copia local supera el tamaño seguro para una reconstrucción entre dispositivos. Reduce o divide la información del proyecto.');
      error.code = 'P2P_SNAPSHOT_TOO_LARGE';
      throw error;
    }
    const chunkOperations = chunks.map((chunk, index) => ({
      operationId: `${requestId}:chunk:${index}`,
      type: 'snapshot.chunk',
      entityType: '__snapshot__',
      entityId: `${requestId}:${index}`,
      ...encryptionMetadata,
      payload: {
        requestId,
        chunkIndex: index,
        chunkCount: chunks.length,
        entityCount: entities.length,
        snapshotByteCount,
        chunkByteCount: chunkByteCounts[index],
        sourceStateRevision,
        snapshotDigest,
        entities: chunk
      }
    }));
    const estimatedTransferBytes = chunkOperations.reduce((total, operation) => (
      total + jsonByteLength(operation) + SNAPSHOT_TRANSFER_EVENT_OVERHEAD_BYTES
    ), 0);
    if (estimatedTransferBytes > this.snapshotTransferMaxBytes) {
      const error = new Error('La reconstrucción completa no cabe de forma segura en la cola temporal del dispositivo invitado. Reduce o divide la información del proyecto.');
      error.code = 'P2P_SNAPSHOT_TOO_LARGE';
      throw error;
    }
    for (const operation of chunkOperations) {
      this.assertSessionContext(sessionContext);
      await this.publish(
        spaceId,
        operation,
        { targetDeviceIds: [requestDeviceId], applyLocally: false, queueWhenOffline: false }
      );
      this.assertSessionContext(sessionContext);
    }
    this.assertSessionContext(sessionContext);
    await this.publish(spaceId, {
      operationId: `${requestId}:complete`,
      type: 'snapshot.complete',
      entityType: '__snapshot__',
      entityId: requestId,
      ...encryptionMetadata,
      payload: {
        requestId,
        chunkCount: chunks.length,
        entityCount: entities.length,
        snapshotByteCount,
        sourceStateRevision,
        snapshotDigest
      }
    }, { targetDeviceIds: [requestDeviceId], applyLocally: false, queueWhenOffline: false });
    this.assertSessionContext(sessionContext);
    return true;
  }

  async ensurePushSubscriptionForCurrentVapidKey(registration, keyData = {}, sessionContext = this.captureSessionContext()) {
    this.assertSessionContext(sessionContext);
    const pushManager = registration?.pushManager;
    if (!pushManager || typeof pushManager.getSubscription !== 'function' || typeof pushManager.subscribe !== 'function') {
      throw new Error('Este dispositivo no permite administrar la suscripción de notificaciones web push.');
    }
    const publicKey = String(keyData.publicKey || '').trim();
    if (!keyData.enabled || !publicKey) {
      const error = new Error('Las notificaciones todavía no están configuradas en el backend.');
      error.code = 'P2P_PUSH_NOT_CONFIGURED';
      throw error;
    }
    const expectedApplicationServerKey = urlBase64ToUint8Array(publicKey);
    let subscription = await pushManager.getSubscription();
    this.assertSessionContext(sessionContext);

    if (subscription) {
      const comparison = compareSubscriptionWithExpectedVapidKey(
        subscription,
        expectedApplicationServerKey,
        publicKey
      );
      if (comparison === false) {
        const staleEndpoint = String(subscription.endpoint || '').trim();
        if (staleEndpoint) {
          await apiPost('/api/push/unsubscribe', { endpoint: staleEndpoint });
          this.assertSessionContext(sessionContext);
        }
        if (typeof subscription.unsubscribe !== 'function') {
          const error = new Error('La suscripción Push usa una clave anterior y el navegador no permite renovarla de forma segura.');
          error.code = 'P2P_PUSH_VAPID_ROTATION_UNSUPPORTED';
          throw error;
        }
        await subscription.unsubscribe();
        this.assertSessionContext(sessionContext);
        clearStoredPushVapidBinding(staleEndpoint);
        subscription = await pushManager.getSubscription();
        this.assertSessionContext(sessionContext);
        if (subscription) {
          const concurrentComparison = compareSubscriptionWithExpectedVapidKey(
            subscription,
            expectedApplicationServerKey,
            publicKey
          );
          if (concurrentComparison !== true) {
            const error = new Error('La suscripción Push anterior no pudo reemplazarse con la clave vigente.');
            error.code = 'P2P_PUSH_VAPID_ROTATION_FAILED';
            throw error;
          }
        }
      }
    }

    if (!subscription) {
      subscription = await pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: expectedApplicationServerKey
      });
      this.assertSessionContext(sessionContext);
    }
    writeStoredPushVapidBinding(subscription, publicKey);
    return subscription;
  }

  async enablePushNotifications() {
    const sessionContext = this.captureSessionContext();
    this.assertSessionContext(sessionContext);
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
      throw new Error('Este dispositivo no soporta notificaciones web push.');
    }
    const keyData = await apiGet('/api/push/public-key');
    this.assertSessionContext(sessionContext);
    if (!keyData.enabled || !keyData.publicKey) throw new Error('Las notificaciones todavía no están configuradas en el backend.');
    const permission = await Notification.requestPermission();
    this.assertSessionContext(sessionContext);
    if (permission !== 'granted') throw new Error('No se concedió permiso para mostrar notificaciones.');
    const registration = await navigator.serviceWorker.ready;
    this.assertSessionContext(sessionContext);
    const subscription = await this.ensurePushSubscriptionForCurrentVapidKey(registration, keyData, sessionContext);
    this.assertSessionContext(sessionContext);
    await requireServiceWorkerPushAccountBinding(sessionContext.userId, sessionContext.deviceId);
    this.assertSessionContext(sessionContext);
    await apiPost('/api/push/subscribe', {
      subscription: subscription.toJSON(),
      meta: {
        deviceId: sessionContext.deviceId,
        name: getDeviceName(),
        platform: navigator.userAgentData?.platform || navigator.platform || '',
        appMode: getAppMode(),
        language: navigator.language || 'es-CO'
      }
    });
    this.assertSessionContext(sessionContext);
    dispatch('p2p:push', { enabled: true });
    return true;
  }

  async registerExistingPushSubscription() {
    const sessionContext = this.captureSessionContext();
    this.assertSessionContext(sessionContext);
    if (!('serviceWorker' in navigator) || !('Notification' in window) || Notification.permission !== 'granted') return false;
    const registration = await navigator.serviceWorker.ready;
    this.assertSessionContext(sessionContext);
    const keyData = await apiGet('/api/push/public-key');
    this.assertSessionContext(sessionContext);
    if (!keyData.enabled || !keyData.publicKey) return false;
    const subscription = await this.ensurePushSubscriptionForCurrentVapidKey(registration, keyData, sessionContext);
    this.assertSessionContext(sessionContext);
    await requireServiceWorkerPushAccountBinding(sessionContext.userId, sessionContext.deviceId);
    this.assertSessionContext(sessionContext);
    await apiPost('/api/push/subscribe', {
      subscription: subscription.toJSON(),
      meta: {
        deviceId: sessionContext.deviceId,
        name: getDeviceName(),
        platform: navigator.userAgentData?.platform || navigator.platform || '',
        appMode: getAppMode(),
        language: navigator.language || 'es-CO'
      }
    });
    this.assertSessionContext(sessionContext);
    dispatch('p2p:push', { enabled: true, restored: true });
    return true;
  }

  async detachPushSubscription(options = {}) {
    const browserFallback = options.browserFallback !== false;
    const requestUserId = String(this.user?.userId || options.userId || '').trim();
    const requestDeviceId = String(this.deviceId || options.deviceId || '').trim();
    const clearAccountBinding = async () => updateServiceWorkerPushAccountBinding({
      action: 'clear',
      expectedUserId: requestUserId,
      expectedDeviceId: requestDeviceId
    }).catch(() => ({ ok: false, changed: false }));
    if (!('serviceWorker' in navigator)) {
      return { detached: false, backendReleased: false, browserUnsubscribed: false, accountBindingCleared: false, reason: 'unsupported' };
    }

    const requestSessionToken = getSessionToken();
    let registration = null;
    try {
      registration = typeof navigator.serviceWorker.getRegistration === 'function'
        ? await navigator.serviceWorker.getRegistration()
        : navigator.serviceWorker.controller
          ? await navigator.serviceWorker.ready
          : null;
    } catch {
      registration = null;
    }

    let subscription = null;
    try {
      subscription = await registration?.pushManager?.getSubscription?.() || null;
    } catch {
      subscription = null;
    }
    const endpoint = String(subscription?.endpoint || '').trim();
    if (!subscription || !endpoint) {
      clearStoredPushVapidBinding();
      const bindingResult = await clearAccountBinding();
      return {
        detached: false,
        backendReleased: false,
        browserUnsubscribed: false,
        accountBindingCleared: Boolean(bindingResult?.ok),
        reason: 'missing_subscription'
      };
    }

    let backendReleased = false;
    let backendError = null;
    if (requestSessionToken) {
      try {
        await apiPost('/api/push/unsubscribe', { endpoint });
        if (getSessionToken() !== requestSessionToken) {
          const bindingResult = await clearAccountBinding();
          return {
            detached: false,
            backendReleased: false,
            browserUnsubscribed: false,
            accountBindingCleared: Boolean(bindingResult?.ok),
            sessionChanged: true,
            reason: 'session_changed'
          };
        }
        backendReleased = true;
      } catch (error) {
        if (isSessionChangedError(error) || getSessionToken() !== requestSessionToken) {
          const bindingResult = await clearAccountBinding();
          return {
            detached: false,
            backendReleased: false,
            browserUnsubscribed: false,
            accountBindingCleared: Boolean(bindingResult?.ok),
            sessionChanged: true,
            reason: 'session_changed'
          };
        }
        backendError = error;
      }
    }

    let browserUnsubscribed = false;
    if (!backendReleased && browserFallback && typeof subscription.unsubscribe === 'function') {
      try {
        browserUnsubscribed = Boolean(await subscription.unsubscribe());
        if (browserUnsubscribed) clearStoredPushVapidBinding(endpoint);
      } catch {
        browserUnsubscribed = false;
      }
    }

    const bindingResult = await clearAccountBinding();
    const accountBindingCleared = Boolean(bindingResult?.ok);
    const detached = backendReleased || browserUnsubscribed;
    dispatch('p2p:push', {
      enabled: !detached,
      detached,
      backendReleased,
      browserUnsubscribed,
      accountBindingCleared,
      fallback: !backendReleased && browserUnsubscribed
    });
    return {
      detached,
      backendReleased,
      browserUnsubscribed,
      accountBindingCleared,
      fallback: !backendReleased && browserUnsubscribed,
      error: backendError
    };
  }

  async retireDevice(targetDeviceId = '') {
    const sessionContext = this.captureSessionContext();
    this.assertSessionContext(sessionContext);
    const cleanTargetDeviceId = String(targetDeviceId || '').trim().slice(0, 180);
    if (!cleanTargetDeviceId) throw new Error('Selecciona un dispositivo válido para retirarlo.');
    if (cleanTargetDeviceId === sessionContext.deviceId) {
      const error = new Error('No puedes retirar el dispositivo que estás usando actualmente.');
      error.code = 'P2P_DEVICE_RETIREMENT_CURRENT_DEVICE';
      throw error;
    }

    await this.fenceBootstrapResponses(sessionContext);
    this.assertSessionContext(sessionContext);
    const data = await apiPost('/api/p2p/devices/retire', {
      targetDeviceId: cleanTargetDeviceId,
      currentDeviceId: sessionContext.deviceId
    });
    this.assertSessionContext(sessionContext);
    const retirement = data?.retirement || { deviceId: cleanTargetDeviceId };
    this.bootstrapState = {
      ...(this.bootstrapState || {}),
      devices: Array.isArray(data?.devices)
        ? data.devices
        : (this.bootstrapState?.devices || []).filter((device) => String(device?.deviceId || '') !== cleanTargetDeviceId),
      replicaHealth: data?.replicaHealth && typeof data.replicaHealth === 'object'
        ? data.replicaHealth
        : (this.bootstrapState?.replicaHealth || {})
    };
    this.broadcastTabState(this.bootstrapState);
    dispatch('p2p:state', { state: this.bootstrapState, source: 'device-retired' });
    dispatch('p2p:device-retired', { retirement, devices: this.bootstrapState.devices });
    return retirement;
  }

  getEntity(spaceId, entityType, entityId) {
    if (!this.canReadSpace(spaceId)) return Promise.resolve(null);
    return getEntity(spaceId, entityType, entityId);
  }

  listEntities(spaceId) {
    if (!this.canReadSpace(spaceId)) return Promise.resolve([]);
    return listEntities(spaceId);
  }

  listLocalSpaces() {
    return listSpaces();
  }

  listLocalInvitations() {
    return listInvitations();
  }
}

export const semillaP2P = new SemillaP2PClient();
window.SemillaP2P = semillaP2P;
