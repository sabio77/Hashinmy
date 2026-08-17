import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const currentFile = fileURLToPath(import.meta.url);
const clientPath = path.resolve(path.dirname(currentFile), '../src/js/p2p-client.js');
const source = await fs.readFile(clientPath, 'utf8');

function extract(startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  if (start < 0 || end <= start) throw new Error(`No se pudo aislar ${startMarker.trim()}.`);
  return source.slice(start, end);
}

const freshness = extract(
  '  async ensureInvitationSourceCurrent(',
  "\n  async buildInvitationBootstrapEscrow(spaceId = '', sessionContext = this.captureSessionContext(), auditContext = {}) {"
);
const build = extract(
  "  async buildInvitationBootstrapEscrow(spaceId = '', sessionContext = this.captureSessionContext(), auditContext = {}) {",
  '\n  async applyInvitationBootstrapEscrow('
);
const apply = extract(
  "  async applyInvitationBootstrapEscrow(escrow = null, space = null, invitation = null, sessionContext = this.captureSessionContext(), auditContext = {}) {",
  '\n  async createSpace('
);
const invite = extract("  async invite(email = '', options = {}) {", '\n  async respondToInvitation(');
const recover = extract('  async recoverAcceptedInvitationBootstrap(', '\n  async createSpace(');
const respond = extract("  async respondToInvitation(invitationId = '', decision = 'accept', options = {}) {", '\n  async leave(');
const bootstrap = extract('  async applyBootstrapData(data = {}, context = {}) {', '\n  async refreshBootstrap(');


for (const needle of [
  "auditSource: 'invitation-response'",
  "invitationAuditLog('frontend.bootstrap.request'",
  "invitationAuditLog('frontend.bootstrap.backend-response'",
  "invitationAuditLog('frontend.bootstrap.applied'",
  "...(auditTraceId ? { auditTraceId } : {})"
]) {
  if (!source.includes(needle)) throw new Error(`La auditoría de aceptación perdió la correlación del bootstrap: ${needle}`);
}

for (const needle of [
  "requestSnapshots: 'force'",
  'snapshotSpaceIds: [cleanSpaceId]',
  'this.isRetryableTransportError(error)',
  "dispatch('p2p:invitation-source-best-effort'",
  'const current = localStateRevision >= backendStateRevision',
  'refreshDeferred'
]) {
  if (!freshness.includes(needle)) throw new Error(`La invitación perdió la política best-effort de revisión disponible: ${needle}`);
}
if (freshness.includes('await this.waitForInvitationSourceRevision(')
  || freshness.includes("error.code = 'P2P_INVITATION_SOURCE_SYNC_PENDING'")) {
  throw new Error('La invitación vuelve a bloquearse esperando que la copia local alcance la revisión más reciente.');
}

const invitationAuthorization = extract(
  "  assertInvitationSourceAllowed(spaceId = '') {",
  "\n  spaceRequiresEncryption(spaceId = '') {"
);
for (const needle of [
  'this.isSpaceReplicaRecoveryPending(cleanSpaceId)',
  "permissions.includes('invite')",
  "reason: 'replica_recovery'",
  'return this.assertSpaceAuthorizationConfirmed(cleanSpaceId)'
]) {
  if (!invitationAuthorization.includes(needle)) throw new Error(`La autorización best-effort de invitación perdió: ${needle}`);
}
if (!invite.includes('this.assertInvitationSourceAllowed(requestedSpaceId)')) {
  throw new Error('La invitación individual volvió a bloquearse por replica_recovery antes de consultar la autoridad del backend.');
}
if (!invite.includes('this.assertInvitationSourceAllowed(spaceId)')) {
  throw new Error('La invitación de panel volvió a bloquearse por replica_recovery antes de consultar la autoridad del backend.');
}

const invitationAuthorizationFunction = invitationAuthorization
  .replace("  assertInvitationSourceAllowed(spaceId = '') {", "function assertInvitationSourceAllowed(spaceId = '') {");
const authorizationModuleUrl = `data:text/javascript;base64,${Buffer.from(`${invitationAuthorizationFunction}
export { assertInvitationSourceAllowed };`).toString('base64')}`;
const { assertInvitationSourceAllowed } = await import(authorizationModuleUrl);
const bestEffortEvents = [];
const baseAuthorizationContext = {
  user: { userId: 'owner_1' },
  bootstrapState: {
    spaces: [{
      spaceId: 'space_1',
      ownerUserId: 'owner_1',
      authorizationState: 'unconfirmed',
      authorizationPendingReason: 'replica_recovery',
      members: [{ userId: 'owner_1', permissions: ['read'] }]
    }]
  },
  isSpaceAuthorizationConfirmed() { return false; },
  isSpaceReplicaRecoveryPending() { return true; },
  assertSpaceAuthorizationConfirmed() { throw Object.assign(new Error('blocked'), { code: 'P2P_AUTHORIZATION_UNCONFIRMED' }); }
};
globalThis.dispatch = (type, detail) => bestEffortEvents.push({ type, detail });
assertInvitationSourceAllowed.call(baseAuthorizationContext, 'space_1');
if (!bestEffortEvents.some((event) => event.type === 'p2p:invitation-source-best-effort' && event.detail?.reason === 'replica_recovery')) {
  throw new Error('El propietario en replica_recovery no conserva el camino best-effort de invitación.');
}
const memberContext = {
  ...baseAuthorizationContext,
  user: { userId: 'member_1' },
  bootstrapState: {
    spaces: [{
      spaceId: 'space_1',
      ownerUserId: 'owner_1',
      authorizationState: 'unconfirmed',
      authorizationPendingReason: 'replica_recovery',
      members: [{ userId: 'member_1', permissions: ['read', 'invite'] }]
    }]
  }
};
assertInvitationSourceAllowed.call(memberContext, 'space_1');
let unauthorizedBlocked = false;
try {
  assertInvitationSourceAllowed.call({
    ...memberContext,
    bootstrapState: {
      spaces: [{
        spaceId: 'space_1',
        ownerUserId: 'owner_1',
        authorizationState: 'unconfirmed',
        authorizationPendingReason: 'replica_recovery',
        members: [{ userId: 'member_1', permissions: ['read'] }]
      }]
    }
  }, 'space_1');
} catch (error) {
  unauthorizedBlocked = error?.code === 'P2P_AUTHORIZATION_UNCONFIRMED';
}
if (!unauthorizedBlocked) throw new Error('Un miembro sin permiso invite pudo usar el bypass de replica_recovery.');

for (const needle of [
  'this.invitationEscrowAuthority',
  'encryptSnapshotEntities(cleanSpaceId, entities)',
  'createSpaceKeyEnvelope(cleanSpaceId',
  "invitationAuditLog('frontend.escrow.pending-local-omitted'",
  "reason: 'pending_local_changes'",
  'P2P_INVITATION_ESCROW_TOO_LARGE'
]) {
  if (!build.includes(needle)) throw new Error(`La semilla cifrada de invitación perdió: ${needle}`);
}
if (build.includes("error.code = 'P2P_INVITATION_ESCROW_PENDING'")) {
  throw new Error('La invitación vuelve a bloquearse por cambios locales pendientes en lugar de sembrar la última copia confirmada disponible.');
}
if (build.indexOf('canonicalLocalSnapshotEntities(localEntities)') < 0) {
  throw new Error('La invitación dejó de excluir del escrow los cambios optimistas todavía no confirmados.');
}
if (build.indexOf('this.flushOutbox()') > build.indexOf('listEntities(cleanSpaceId)')) {
  throw new Error('La invitación captura el snapshot antes de intentar consolidar el outbox local.');
}

for (const needle of [
  'importSpaceKeyEnvelope(spaceId, escrow.keyEnvelope',
  'decryptOperationEvent(encryptedEvent)',
  'applyP2PEvent(event)',
  "type: 'snapshot.complete'",
  'resolveRecoveryRequirement(spaceId, sourceStateRevision)'
]) {
  if (!apply.includes(needle)) throw new Error(`La reconstrucción inmediata perdió: ${needle}`);
}
if (!invite.includes('bootstrapEscrow = await this.buildInvitationBootstrapEscrow') || !invite.includes('bootstrapEscrow\n        });')) {
  throw new Error('El POST de creación ya no adjunta la semilla cifrada generada localmente.');
}
for (const needle of [
  'sourceFreshness = await this.ensureInvitationSourceCurrent(requestedSpaceId, sessionContext)',
  "invitationAuditLog('frontend.invite.source-state'",
  "error?.code === 'P2P_INVITATION_ESCROW_FUTURE_STATE'",
  'INVITATION_SOURCE_CREATE_MAX_ATTEMPTS'
]) {
  if (!invite.includes(needle)) throw new Error(`La creación perdió el envío best-effort o la compatibilidad de transición: ${needle}`);
}
if (invite.includes("error.code = 'P2P_INVITATION_SOURCE_SYNC_PENDING'")) {
  throw new Error('La creación todavía expone el bloqueo P2P_INVITATION_SOURCE_SYNC_PENDING.');
}
for (const needle of [
  "status || '').trim().toLowerCase() === 'accepted'",
  "apiPost('/api/p2p/invitations/respond'",
  'deviceId: sessionContext.deviceId',
  'auditTraceId',
  "invitationAuditLog('frontend.recovery.begin'",
  "invitationAuditLog('frontend.recovery.backend-response'",
  "invitationAuditLog('frontend.recovery.complete'",
  'await this.applyInvitationBootstrapEscrow(',
  'options.forceSnapshot !== true'
]) {
  if (!recover.includes(needle)) throw new Error(`La recuperación multidispositivo de invitaciones perdió: ${needle}`);
}
if (!recover.includes('const localKeyAvailable = await hasSpaceKey(spaceId, activeKeyId)')) {
  throw new Error('La recuperación dejó de distinguir una clave ya importada de un snapshot todavía pendiente.');
}
if (!respond.includes('deviceId: sessionContext.deviceId')) {
  throw new Error('La aceptación ya no identifica el dispositivo que debe recibir la clave reenvuelta.');
}
const applyIndex = respond.indexOf('await this.applyInvitationBootstrapEscrow(');
const bootstrapIndex = respond.indexOf("await this.refreshBootstrap({ requestSnapshots: 'force'");
if (applyIndex < 0 || bootstrapIndex < 0 || applyIndex > bootstrapIndex) {
  throw new Error('La aceptación vuelve a depender del bootstrap remoto antes de reconstruir la copia inicial local.');
}
if (!bootstrap.includes("Object.prototype.hasOwnProperty.call(data, 'invitationEscrowAuthority')")) {
  throw new Error('El bootstrap no conserva la autoridad pública de escrow anunciada por memoriaBACKEND.');
}
const recoveryIndex = bootstrap.indexOf('await this.recoverAcceptedInvitationBootstrap(');
const ensureIndex = bootstrap.indexOf('await this.ensureCurrentSpaceKey(space.spaceId)');
if (recoveryIndex < 0 || ensureIndex < 0 || recoveryIndex > ensureIndex) {
  throw new Error('Un segundo dispositivo no intenta recuperar el escrow aceptado antes de depender de otra réplica para la clave.');
}

const pendingRecoveryIndex = bootstrap.indexOf("const replicaRecoveryPending = space?.authorizationState === 'unconfirmed'");
const forcedEscrowIndex = bootstrap.indexOf('forceSnapshot: true', pendingRecoveryIndex);
const unconfirmedSkipIndex = bootstrap.indexOf("if (space?.authorizationState === 'unconfirmed' || !encrypted) continue;", pendingRecoveryIndex);
if (pendingRecoveryIndex < 0 || forcedEscrowIndex < 0 || unconfirmedSkipIndex < 0 || forcedEscrowIndex > unconfirmedSkipIndex) {
  throw new Error('Un espacio aceptado en replica_recovery vuelve a saltarse el escrow antes de depender de otra réplica.');
}
for (const needle of [
  'const escrowRecoveredSpaceIds = new Set()',
  'await listStateRevisions(this.recoveryEligibleSpaceIds())',
  'await this.confirmRecoveredReplicaAuthorization(spaceId, sessionContext)'
]) {
  if (!bootstrap.includes(needle)) throw new Error(`La recuperación tras una aceptación interrumpida perdió: ${needle}`);
}
for (const needle of [
  "invitationAuditLog('frontend.escrow.built'",
  "invitationAuditLog('frontend.escrow.decrypted'",
  "invitationAuditLog('frontend.escrow.persisted'",
  "invitationAuditLog('frontend.escrow.persistence-mismatch'",
  "invitationAuditLog('frontend.escrow.apply.complete'"
]) {
  if (!build.concat(apply).includes(needle)) throw new Error(`La auditoría de escrow perdió la etapa: ${needle}`);
}
for (const needle of [
  'auditTraceId,',
  "invitationAuditLog('frontend.invite.begin'",
  "invitationAuditLog('frontend.invite.backend-response'",
  "invitationAuditLog('frontend.response.begin'",
  "invitationAuditLog('frontend.response.backend-response'",
  "invitationAuditLog('frontend.response.local-state'",
  "invitationAuditLog('frontend.response.complete'"
]) {
  if (!invite.concat(respond).includes(needle)) throw new Error(`La trazabilidad end-to-end de invitaciones perdió: ${needle}`);
}
if (!respond.includes('auditTraceId')) {
  throw new Error('La respuesta de invitación ya no envía auditTraceId al backend.');
}

if (!source.includes("invitationAuditLog('frontend.panel-response.local-state'")) {
  throw new Error('La aceptación agrupada perdió la auditoría del estado local final por proyecto.');
}
if (!apply.includes('invitationAuditEntityComparison(decryptedEntities, persistedEntities)')) {
  throw new Error('La aceptación dejó de comparar la semilla descifrada contra lo realmente persistido en IndexedDB.');
}

console.log('OK: crear/aceptar invitaciones usa escrow cifrado, conserva trazabilidad estructurada y recupera también una aceptación interrumpida antes de depender de otra réplica.');
