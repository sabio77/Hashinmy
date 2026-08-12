import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const source = fs.readFileSync(path.resolve(here, '../src/js/p2p-client.js'), 'utf8');

const required = [
  "'/api/p2p/crypto/invitation-key-targets'",
  "'/api/p2p/crypto/invitation-key-stage'",
  "'/api/p2p/crypto/invitation-bootstrap-stage'",
  "'/api/p2p/crypto/invitation-acceptance-complete'",
  'stageInvitationBootstrapSnapshot',
  'applyInvitationBootstrapSnapshot',
  'stageInvitationKeyForRecipient',
  'stagedKeyEnvelope',
  'stagedKeySource',
  'escrowRecipient',
  'escrowEnvelope',
  'escrowStaged',
  "deviceId: this.deviceId"
];
for (const marker of required) {
  if (!source.includes(marker)) throw new Error(`Falta el contrato de clave temporal de invitación: ${marker}`);
}

const inviteStart = source.indexOf("async invite(email = '', options = {})");
const respondStart = source.indexOf("async respondToInvitation(invitationId = '', decision = 'accept')");
if (inviteStart < 0 || respondStart < 0) throw new Error('No se encontraron los flujos de invitar/responder.');
const inviteSource = source.slice(inviteStart, respondStart);
const bootstrapStageIndex = inviteSource.indexOf('await this.stageInvitationBootstrapSnapshot(data.invitation)');
const stageIndex = inviteSource.indexOf('await this.stageInvitationKeyForRecipient(data.invitation)');
const commitIndex = inviteSource.indexOf('prepareCommittedControlState');
if (bootstrapStageIndex < 0 || stageIndex < 0 || commitIndex < 0
  || bootstrapStageIndex > stageIndex || stageIndex > commitIndex) {
  throw new Error('La invitación debe congelar primero el snapshot cifrado, preparar después la clave temporal y solo entonces consolidar el alta.');
}

const respondEnd = source.indexOf('\n  async ', respondStart + 10);
const respondSource = source.slice(respondStart, respondEnd > respondStart ? respondEnd : undefined);
const importIndex = respondSource.indexOf('await importSpaceKeyEnvelope(acceptedSpaceId, data.stagedKeyEnvelope');
const bootstrapApplyIndex = respondSource.indexOf('await this.applyInvitationBootstrapSnapshot(');
const fallbackIndex = respondSource.indexOf('await this.requestSpaceKey(acceptedSpaceId');
const refreshIndex = respondSource.indexOf('await this.refreshBootstrap({');
const replicaValidationIndex = respondSource.indexOf('assertAcceptedInvitationReplicaState(');
const cleanupIndex = respondSource.indexOf("await apiPost('/api/p2p/crypto/invitation-acceptance-complete'");
if (importIndex < 0 || bootstrapApplyIndex < 0 || fallbackIndex < 0 || refreshIndex < 0
  || replicaValidationIndex < 0 || cleanupIndex < 0
  || importIndex > bootstrapApplyIndex || bootstrapApplyIndex > fallbackIndex || fallbackIndex > refreshIndex
  || refreshIndex > replicaValidationIndex || replicaValidationIndex > cleanupIndex) {
  throw new Error('Al aceptar debe importar la AES, materializar el snapshot Redis, reconciliar/validar la réplica y solo entonces destruir el material temporal.');
}
if (!/apiPost\('\/api\/p2p\/invitations\/respond', \{ invitationId, decision, deviceId: this\.deviceId \}\)/.test(respondSource)) {
  throw new Error('La aceptación debe identificar el dispositivo para recuperar su sobre ECDH específico.');
}


const bootstrapApplyStart = source.indexOf('  async applyInvitationBootstrapSnapshot(');
const bootstrapApplyEnd = source.indexOf('\n  async replayDeferredEncryptedEvents(', bootstrapApplyStart);
if (bootstrapApplyStart < 0 || bootstrapApplyEnd <= bootstrapApplyStart) {
  throw new Error('No se encontró la materialización local del snapshot temporal de invitación.');
}
const bootstrapApplySource = source.slice(bootstrapApplyStart, bootstrapApplyEnd);
const decryptLoopIndex = bootstrapApplySource.indexOf('const decryptedChunks = []');
const canonicalTotalIndex = bootstrapApplySource.indexOf('decryptedSnapshotByteCount += decryptedChunkByteCount');
const stageCanonicalIndex = bootstrapApplySource.indexOf('for (const decrypted of decryptedChunks)');
if (decryptLoopIndex < 0 || canonicalTotalIndex < 0 || stageCanonicalIndex < 0
  || decryptLoopIndex > canonicalTotalIndex || canonicalTotalIndex > stageCanonicalIndex) {
  throw new Error('El snapshot de invitación debe descifrarse completo y recalcular sus bytes canónicos antes de materializar fragmentos.');
}
if (!bootstrapApplySource.includes('snapshotByteCount: decryptedSnapshotByteCount')) {
  throw new Error('La validación local todavía mezcla el tamaño cifrado de Redis con el tamaño canónico descifrado.');
}
if ((bootstrapApplySource.match(/snapshotByteCount: decryptedSnapshotByteCount/g) || []).length < 2) {
  throw new Error('Fragmentos y cierre del snapshot deben usar el mismo total descifrado para evitar missing_snapshot_chunks.');
}

console.log('OK: el cliente conserva snapshot + clave antes de anunciar, los materializa al aceptar y confirma su consumo solo después de validar la réplica local.');
