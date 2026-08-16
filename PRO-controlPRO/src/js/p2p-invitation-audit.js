import { P2P_APPLICATION_ID } from './application-scope.js';

const AUDIT_PREFIX = '[P2P_INVITATION_AUDIT]';
const SENSITIVE_AUDIT_MARKER = 'XXXsenXXX';
const AUDIT_ENTITY_MANIFEST_LIMIT = 400;
const PROJECT_ROOT_ENTITY_TYPE = 'admin.project';
const PROJECT_ROOT_ENTITY_ID = 'project';

function clean(value = '', maxLength = 240) {
  return String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

function nonnegativeInteger(value = 0) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 0;
}

function entityRevision(entity = null) {
  return Math.max(0, Number(entity?.stateRevision || entity?.spaceSequence || entity?.confirmedStateRevision || entity?.confirmedSpaceSequence || 0));
}

function entityIdentity(entity = null) {
  const entityType = clean(entity?.entityType || '', 120);
  const entityId = clean(entity?.entityId || '', 180);
  return entityType && entityId ? `${entityType}\u0000${entityId}` : '';
}

function entityValue(entity = null) {
  return entity?.value && typeof entity.value === 'object' && !Array.isArray(entity.value) ? entity.value : null;
}

function entityManifestEntry(entity = null) {
  const value = entityValue(entity);
  return {
    entityType: clean(entity?.entityType || '', 120),
    entityId: clean(entity?.entityId || '', 180),
    operationType: clean(entity?.operationType || entity?.confirmedOperationType || '', 80),
    stateRevision: entityRevision(entity),
    deleted: entity?.deleted === true || entity?.confirmedDeleted === true,
    optimistic: entity?.optimistic === true,
    encrypted: entity?.encrypted === true,
    valuePresent: Boolean(value),
    valueKeys: value ? Object.keys(value).map((key) => clean(key, 100)).filter(Boolean).sort().slice(0, 80) : []
  };
}

function projectRootSummary(records = []) {
  const root = records.find((entity) => (
    clean(entity?.entityType || '', 120) === PROJECT_ROOT_ENTITY_TYPE
    && clean(entity?.entityId || '', 180) === PROJECT_ROOT_ENTITY_ID
  )) || null;
  if (!root) return { present: false, expectedEntityType: PROJECT_ROOT_ENTITY_TYPE, expectedEntityId: PROJECT_ROOT_ENTITY_ID };
  const value = entityValue(root);
  return {
    present: true,
    ...entityManifestEntry(root),
    displayFields: value ? {
      name: clean(value.name || '', 120),
      description: clean(value.description || '', 500),
      address: clean(value.address || '', 240),
      initialBudget: Number.isFinite(Number(value.initialBudget)) ? Number(value.initialBudget) : null,
      createdAt: clean(value.createdAt || '', 80),
      updatedAt: clean(value.updatedAt || '', 80),
      trashedAt: clean(value.trashedAt || '', 80)
    } : null
  };
}

export function createInvitationAuditTraceId(prefix = 'invite') {
  const safePrefix = clean(prefix, 40).replace(/[^a-zA-Z0-9_-]/g, '_') || 'invite';
  const random = globalThis.crypto?.randomUUID?.().replace(/-/g, '')
    || `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
  return `${safePrefix}_${random}`.slice(0, 180);
}

export function maskInvitationAuditEmail(value = '') {
  const email = clean(value, 320).toLowerCase();
  const separator = email.lastIndexOf('@');
  if (separator <= 0) return email ? '***' : '';
  const local = email.slice(0, separator);
  const domain = email.slice(separator + 1);
  const visible = local.slice(0, Math.min(2, local.length));
  return `${visible}${local.length > visible.length ? '***' : ''}@${domain}`;
}

export function invitationAuditEntitySummary(entities = []) {
  const records = Array.isArray(entities) ? entities : [];
  const entityTypes = {};
  let deleted = 0;
  let optimistic = 0;
  let confirmed = 0;
  for (const entity of records) {
    const type = clean(entity?.entityType || '', 120) || '(sin tipo)';
    entityTypes[type] = nonnegativeInteger(entityTypes[type]) + 1;
    if (entity?.deleted === true || entity?.confirmedDeleted === true) deleted += 1;
    if (entity?.optimistic === true) optimistic += 1;
    if (entity?.confirmedExists === true || entity?.confirmedDeleted === true || entity?.optimistic !== true) confirmed += 1;
  }
  const manifest = records.slice(0, AUDIT_ENTITY_MANIFEST_LIMIT).map(entityManifestEntry);
  return {
    total: records.length,
    confirmed,
    deleted,
    optimistic,
    entityTypes,
    manifest,
    manifestTruncated: records.length > manifest.length,
    projectRoot: projectRootSummary(records)
  };
}

export function invitationAuditEntityComparison(expectedEntities = [], actualEntities = []) {
  const expected = Array.isArray(expectedEntities) ? expectedEntities : [];
  const actual = Array.isArray(actualEntities) ? actualEntities : [];
  const actualByIdentity = new Map(actual.map((entity) => [entityIdentity(entity), entity]).filter(([identity]) => Boolean(identity)));
  const missing = [];
  const stale = [];
  const valueMissing = [];
  const deletedMismatch = [];
  let matched = 0;

  for (const expectedEntity of expected) {
    const identity = entityIdentity(expectedEntity);
    if (!identity) continue;
    const actualEntity = actualByIdentity.get(identity);
    if (!actualEntity) {
      missing.push(entityManifestEntry(expectedEntity));
      continue;
    }
    matched += 1;
    const expectedDeleted = expectedEntity?.deleted === true || expectedEntity?.confirmedDeleted === true;
    const actualDeleted = actualEntity?.deleted === true || actualEntity?.confirmedDeleted === true;
    if (expectedDeleted !== actualDeleted) deletedMismatch.push({ expected: entityManifestEntry(expectedEntity), actual: entityManifestEntry(actualEntity) });
    if (!expectedDeleted && !entityValue(actualEntity)) valueMissing.push(entityManifestEntry(actualEntity));
    const expectedRevision = entityRevision(expectedEntity);
    const actualRevision = entityRevision(actualEntity);
    if (expectedRevision > 0 && actualRevision < expectedRevision) {
      stale.push({ expected: entityManifestEntry(expectedEntity), actual: entityManifestEntry(actualEntity) });
    }
  }

  const expectedRoot = projectRootSummary(expected);
  const actualRoot = projectRootSummary(actual);
  const complete = missing.length === 0 && stale.length === 0 && valueMissing.length === 0 && deletedMismatch.length === 0;
  return {
    complete,
    expectedCount: expected.length,
    actualCount: actual.length,
    matchedCount: matched,
    missingCount: missing.length,
    staleCount: stale.length,
    valueMissingCount: valueMissing.length,
    deletedMismatchCount: deletedMismatch.length,
    missing: missing.slice(0, AUDIT_ENTITY_MANIFEST_LIMIT),
    stale: stale.slice(0, AUDIT_ENTITY_MANIFEST_LIMIT),
    valueMissing: valueMissing.slice(0, AUDIT_ENTITY_MANIFEST_LIMIT),
    deletedMismatch: deletedMismatch.slice(0, AUDIT_ENTITY_MANIFEST_LIMIT),
    issueListTruncated: [missing, stale, valueMissing, deletedMismatch].some((list) => list.length > AUDIT_ENTITY_MANIFEST_LIMIT),
    projectRoot: {
      expected: expectedRoot,
      persisted: actualRoot,
      complete: expectedRoot.present === false || (actualRoot.present === true && actualRoot.valuePresent === true && actualRoot.deleted !== true)
    }
  };
}

export function invitationAuditEscrowSummary(escrow = null) {
  if (!escrow || typeof escrow !== 'object' || Array.isArray(escrow)) return { present: false };
  return {
    present: true,
    schemaVersion: nonnegativeInteger(escrow.schemaVersion),
    spaceId: clean(escrow.spaceId, 160),
    sourceDeviceId: clean(escrow.sourceDeviceId, 180),
    keyId: clean(escrow.keyId, 180),
    keyEpoch: nonnegativeInteger(escrow.keyEpoch),
    sourceStateRevision: nonnegativeInteger(escrow.sourceStateRevision),
    snapshotDigest: clean(escrow.snapshotDigest, 128),
    entityCount: nonnegativeInteger(escrow.entityCount),
    transportEntityCount: Array.isArray(escrow.entities) ? escrow.entities.length : 0,
    keyEnvelopePresent: Boolean(escrow.keyEnvelope),
    recipientDeviceId: clean(escrow.keyEnvelope?.recipientDeviceId, 180),
    createdAt: clean(escrow.createdAt, 80)
  };
}

export function invitationAuditError(error = null) {
  if (!error) return null;
  return {
    name: clean(error?.name || 'Error', 80),
    code: clean(error?.code || '', 120),
    status: Number(error?.status || 0) || 0,
    message: clean(error?.message || error, 500),
    reason: clean(error?.reason || '', 180)
  };
}

// Auditoría temporal solicitada para rastrear el contenido exacto que atraviesa
// creación/aceptación/hidratación. Todo uso de esta función queda localizable por
// la marca literal XXXsenXXX y debe retirarse al finalizar el diagnóstico.
export function XXXsenXXX(detail = null) {
  return { [SENSITIVE_AUDIT_MARKER]: detail };
}

export function invitationAuditLog(stage = '', detail = {}) {
  const entry = {
    at: new Date().toISOString(),
    applicationId: P2P_APPLICATION_ID,
    stage: clean(stage, 160),
    ...(detail && typeof detail === 'object' && !Array.isArray(detail) ? detail : { detail })
  };
  const containsSensitiveAudit = Object.prototype.hasOwnProperty.call(entry, SENSITIVE_AUDIT_MARKER);
  console.info(containsSensitiveAudit ? `${AUDIT_PREFIX}[${SENSITIVE_AUDIT_MARKER}]` : AUDIT_PREFIX, entry);
  try {
    // El contenido crudo se mantiene en consola, pero no se propaga por un evento global.
    // Así se preserva la auditoría solicitada sin ampliar la superficie de exposición.
    const eventEntry = containsSensitiveAudit
      ? { ...entry, [SENSITIVE_AUDIT_MARKER]: '[omitido del evento; disponible solo en consola]' }
      : entry;
    globalThis.dispatchEvent?.(new CustomEvent('p2p:invitation-audit', { detail: eventEntry }));
  } catch {}
  return entry;
}
