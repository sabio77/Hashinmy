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
  '  async waitForInvitationSourceRevision(',
  "\n  async buildInvitationBootstrapEscrow(spaceId = '', sessionContext = this.captureSessionContext()) {"
);
const build = extract(
  "  async buildInvitationBootstrapEscrow(spaceId = '', sessionContext = this.captureSessionContext()) {",
  '\n  async applyInvitationBootstrapEscrow('
);
const apply = extract(
  "  async applyInvitationBootstrapEscrow(escrow = null, space = null, invitation = null, sessionContext = this.captureSessionContext()) {",
  '\n  async createSpace('
);
const invite = extract("  async invite(email = '', options = {}) {", '\n  async respondToInvitation(');
const recover = extract('  async recoverAcceptedInvitationBootstrap(', '\n  async createSpace(');
const respond = extract("  async respondToInvitation(invitationId = '', decision = 'accept') {", '\n  async leave(');
const bootstrap = extract('  async applyBootstrapData(data = {}, context = {}) {', '\n  async refreshBootstrap(');


for (const needle of [
  "requestSnapshots: 'force'",
  'snapshotSpaceIds: [cleanSpaceId]',
  'waitForInvitationSourceRevision(',
  "eventNames = ['p2p:snapshot-complete', 'p2p:operation', 'p2p:state']",
  'P2P_INVITATION_SOURCE_SYNC_PENDING'
]) {
  if (!freshness.includes(needle)) throw new Error(`La invitación perdió la prevalidación event-driven de revisión vigente: ${needle}`);
}
if (freshness.includes('setInterval(')) {
  throw new Error('La espera de revisión vigente volvió a usar polling en lugar de señales P2P.');
}

for (const needle of [
  'this.invitationEscrowAuthority',
  'encryptSnapshotEntities(cleanSpaceId, entities)',
  'createSpaceKeyEnvelope(cleanSpaceId',
  'P2P_INVITATION_ESCROW_PENDING',
  'P2P_INVITATION_ESCROW_TOO_LARGE'
]) {
  if (!build.includes(needle)) throw new Error(`La semilla cifrada de invitación perdió: ${needle}`);
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
  'await this.ensureInvitationSourceCurrent(requestedSpaceId, sessionContext)',
  "error?.code === 'P2P_INVITATION_ESCROW_STALE_STATE'",
  'INVITATION_SOURCE_CREATE_MAX_ATTEMPTS'
]) {
  if (!invite.includes(needle)) throw new Error(`La creación perdió la defensa contra snapshot de invitación obsoleto: ${needle}`);
}
for (const needle of [
  "status || '').trim().toLowerCase() === 'accepted'",
  "apiPost('/api/p2p/invitations/respond'",
  'deviceId: sessionContext.deviceId',
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
const bootstrapIndex = respond.indexOf("await this.refreshBootstrap({ requestSnapshots: 'force' })");
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
const forcedEscrowIndex = bootstrap.indexOf('{ forceSnapshot: true }', pendingRecoveryIndex);
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

console.log('OK: crear/aceptar invitaciones usa escrow cifrado y recupera también una aceptación interrumpida, incluso si la clave ya fue importada, antes de depender de otra réplica.');
