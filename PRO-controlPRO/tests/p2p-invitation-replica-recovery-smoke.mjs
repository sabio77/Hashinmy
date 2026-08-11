import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const currentFile = fileURLToPath(import.meta.url);
const root = path.resolve(path.dirname(currentFile), '..');
const clientSource = fs.readFileSync(path.join(root, 'src', 'js', 'p2p-client.js'), 'utf8');
const storageSource = fs.readFileSync(path.join(root, 'src', 'js', 'p2p-storage.js'), 'utf8');

const reconciliationStart = storageSource.indexOf('function cleanSpaceId(');
const reconciliationEnd = storageSource.indexOf('\nasync function purgeSpaceRecords', reconciliationStart);
assert.ok(reconciliationStart >= 0 && reconciliationEnd > reconciliationStart, 'No se encontró la reconciliación durable de proyectos.');
const reconciliationSource = storageSource.slice(reconciliationStart, reconciliationEnd)
  .replaceAll('export function', 'function');
const reconciliationModule = await import(`data:text/javascript;base64,${Buffer.from(`${reconciliationSource}
export { planSpaceReconciliation };`).toString('base64')}#replica-reconciliation`);

const pendingReplicaReconciliation = reconciliationModule.planSpaceReconciliation(
  [{ spaceId: 'space_pending', authorizationState: 'unconfirmed', authorizationPendingReason: 'replica_recovery', authorizationUnconfirmedAt: '2026-07-31T14:20:00.000Z' }],
  [{ spaceId: 'space_pending', members: [{ userId: 'user_guest', permissions: ['read'] }] }],
  [],
  ['space_pending']
);
assert.equal(pendingReplicaReconciliation.spaces[0].authorizationState, 'unconfirmed', 'El bootstrap habilitó una invitación cuya réplica sigue atrasada.');
assert.equal(pendingReplicaReconciliation.spaces[0].authorizationPendingReason, 'replica_recovery');
assert.deepEqual(pendingReplicaReconciliation.pendingReplicaSpaceIds, ['space_pending']);

const recoveredReplicaReconciliation = reconciliationModule.planSpaceReconciliation(
  pendingReplicaReconciliation.spaces,
  [{ spaceId: 'space_pending', members: [{ userId: 'user_guest', permissions: ['read'] }] }],
  [],
  []
);
assert.equal(recoveredReplicaReconciliation.spaces[0].authorizationState, 'confirmed', 'Una réplica ya recuperada permaneció bloqueada.');
assert.equal('authorizationPendingReason' in recoveredReplicaReconciliation.spaces[0], false);

const missingMembershipReconciliation = reconciliationModule.planSpaceReconciliation(
  [{ spaceId: 'space_local', authorizationState: 'confirmed' }],
  [],
  []
);
assert.equal(missingMembershipReconciliation.spaces[0].authorizationPendingReason, 'membership_unconfirmed', 'Una omisión del plano de control se confundió con recuperación de réplica.');

const mergeStart = clientSource.indexOf('export function mergeCommittedInvitationState(');
const mergeEnd = clientSource.indexOf('\nexport function assertAcceptedInvitationReplicaState', mergeStart);
assert.ok(mergeStart >= 0 && mergeEnd > mergeStart, 'No se encontró la reconciliación local de invitaciones confirmadas.');
const mergeSource = clientSource.slice(mergeStart, mergeEnd).replace('export function', 'function');
const mergeModule = await import(`data:text/javascript;base64,${Buffer.from(`${mergeSource}\nexport { mergeCommittedInvitationState };`).toString('base64')}#invitation-state`);

const prepareStart = clientSource.indexOf('export function prepareCommittedControlState(');
const prepareEnd = clientSource.indexOf('\nexport function assertAcceptedInvitationReplicaState', prepareStart);
assert.ok(prepareStart >= 0 && prepareEnd > prepareStart, 'No se encontró la preparación durable del estado de control.');
const prepareSource = clientSource.slice(prepareStart, prepareEnd).replace('export function', 'function');
const prepareModule = await import(`data:text/javascript;base64,${Buffer.from(`${prepareSource}\nexport { prepareCommittedControlState };`).toString('base64')}#prepared-control-state`);

const provisional = prepareModule.prepareCommittedControlState({
  spaces: [{ spaceId: 'space_1', updatedAt: '2026-07-31T14:20:00.000Z' }],
  invitations: [{ invitationId: 'inv_1' }]
}, {
  authorizationState: 'unconfirmed',
  currentSpaces: [],
  unconfirmedAt: '2026-07-31T14:21:00.000Z'
});
assert.equal(provisional.spaces[0].authorizationState, 'unconfirmed', 'Una aceptación provisional se persistió como autorizada antes de confirmar su réplica.');
assert.equal(provisional.spaces[0].authorizationPendingReason, 'replica_recovery');
assert.equal(provisional.spaces[0].authorizationUnconfirmedAt, '2026-07-31T14:21:00.000Z');

const preservedConfirmation = prepareModule.prepareCommittedControlState({
  spaces: [{ spaceId: 'space_1', updatedAt: '2026-07-31T14:20:00.000Z', memberCount: 2 }]
}, {
  authorizationState: 'unconfirmed',
  currentSpaces: [{
    spaceId: 'space_1',
    authorizationState: 'confirmed',
    updatedAt: '2026-07-31T14:22:00.000Z',
    memberCount: 3,
    currentMarker: 'bootstrap-authoritative'
  }]
});
assert.equal(preservedConfirmation.spaces[0].authorizationState, 'confirmed', 'El replay de una aceptación rebajó una réplica ya confirmada.');
assert.equal(preservedConfirmation.spaces[0].memberCount, 3, 'El replay sobrescribió el grafo confirmado con datos de una aceptación anterior.');
assert.equal(preservedConfirmation.spaces[0].currentMarker, 'bootstrap-authoritative');
assert.equal('authorizationUnconfirmedAt' in preservedConfirmation.spaces[0], false);

const explicitConfirmation = prepareModule.prepareCommittedControlState({
  spaces: [{ spaceId: 'space_2', authorizationState: 'unconfirmed', authorizationUnconfirmedAt: 'old' }]
}, { authorizationState: 'confirmed' });
assert.equal(explicitConfirmation.spaces[0].authorizationState, 'confirmed');
assert.equal('authorizationPendingReason' in explicitConfirmation.spaces[0], false);
assert.equal('authorizationUnconfirmedAt' in explicitConfirmation.spaces[0], false, 'La confirmación autoritativa conservó la marca provisional.');

const protocolErrorStart = clientSource.indexOf('function realtimeProtocolError(');
const protocolErrorEnd = clientSource.indexOf('\nconst CANONICAL_STATE_OPERATION_TYPES', protocolErrorStart);
const replicaAssertionStart = clientSource.indexOf('export function assertAcceptedInvitationReplicaState(');
const replicaAssertionEnd = clientSource.indexOf('\nfunction urlBase64ToUint8Array', replicaAssertionStart);
assert.ok(protocolErrorStart >= 0 && protocolErrorEnd > protocolErrorStart, 'No se encontró el constructor de errores de protocolo.');
assert.ok(replicaAssertionStart >= 0 && replicaAssertionEnd > replicaAssertionStart, 'No se encontró la validación común de réplica aceptada.');
const replicaAssertionSource = [
  clientSource.slice(protocolErrorStart, protocolErrorEnd),
  clientSource.slice(replicaAssertionStart, replicaAssertionEnd).replace('export function', 'function'),
  'export { assertAcceptedInvitationReplicaState };'
].join('\n');
const replicaAssertionModule = await import(`data:text/javascript;base64,${Buffer.from(replicaAssertionSource).toString('base64')}#accepted-replica-state`);

const confirmedReplica = replicaAssertionModule.assertAcceptedInvitationReplicaState({
  spaces: [{ spaceId: 'space_1', authorizationState: 'confirmed' }],
  revokedSpaceIds: []
}, 'space_1');
assert.equal(confirmedReplica.space?.spaceId, 'space_1');
assert.equal(confirmedReplica.explicitlyRevoked, false);
assert.equal(confirmedReplica.replicaPending, false);

assert.throws(
  () => replicaAssertionModule.assertAcceptedInvitationReplicaState({
    spaces: [{ spaceId: 'space_1', authorizationState: 'confirmed' }],
    stateRevisions: { space_1: 9 },
    revokedSpaceIds: []
  }, 'space_1', {
    localStateRevision: 3,
    recoveryRequirements: { space_1: 9 }
  }),
  (error) => error?.code === 'P2P_INVITATION_REPLICA_UNCONFIRMED',
  'La membresía del bootstrap se confundió con una copia local completa.'
);
const allowedPendingReplica = replicaAssertionModule.assertAcceptedInvitationReplicaState({
  spaces: [{ spaceId: 'space_1', authorizationState: 'unconfirmed', authorizationPendingReason: 'replica_recovery' }],
  stateRevisions: { space_1: 9 },
  revokedSpaceIds: []
}, 'space_1', {
  localStateRevision: 3,
  recoveryRequirements: { space_1: 9 },
  allowReplicaPending: true
});
assert.equal(allowedPendingReplica.replicaPending, true, 'El flujo recuperable no informó que el snapshot sigue pendiente.');
assert.equal(allowedPendingReplica.backendStateRevision, 9);
assert.equal(allowedPendingReplica.localStateRevision, 3);

assert.throws(
  () => replicaAssertionModule.assertAcceptedInvitationReplicaState({
    spaces: [{
      spaceId: 'space_membership_unknown',
      authorizationState: 'unconfirmed',
      authorizationPendingReason: 'membership_unconfirmed'
    }],
    revokedSpaceIds: []
  }, 'space_membership_unknown', { allowReplicaPending: true }),
  (error) => error?.code === 'P2P_INVITATION_REPLICA_UNCONFIRMED',
  'El modo recuperable permitió confirmar el cursor con una membresía todavía desconocida.'
);

assert.throws(
  () => replicaAssertionModule.assertAcceptedInvitationReplicaState({
    spaces: [{ spaceId: 'space_1', authorizationState: 'unconfirmed' }],
    revokedSpaceIds: []
  }, 'space_1', { code: 'P2P_LOCAL_INVITATION_REPLICA_UNCONFIRMED' }),
  (error) => error?.code === 'P2P_LOCAL_INVITATION_REPLICA_UNCONFIRMED',
  'Una aceptación local puede finalizar con autorización no confirmada.'
);
assert.throws(
  () => replicaAssertionModule.assertAcceptedInvitationReplicaState({ spaces: [], revokedSpaceIds: [] }, 'space_1'),
  (error) => error?.code === 'P2P_INVITATION_REPLICA_UNCONFIRMED',
  'Una aceptación puede finalizar aunque el bootstrap omita por completo el proyecto.'
);
const revokedReplica = replicaAssertionModule.assertAcceptedInvitationReplicaState({
  spaces: [],
  revokedSpaceIds: ['space_1']
}, 'space_1');
assert.equal(revokedReplica.space, null);
assert.equal(revokedReplica.explicitlyRevoked, true, 'Una revocación explícita posterior debe cerrar la transición sin pedir una réplica imposible.');

const owner = { userId: 'user_owner', email: 'owner@example.com' };
const guest = { userId: 'user_guest', email: 'guest@example.com' };
const pending = {
  invitationId: 'inv_1',
  spaceId: 'space_1',
  inviterUserId: owner.userId,
  recipientUserId: guest.userId,
  recipientEmail: guest.email,
  status: 'pending'
};

let ownerState = mergeModule.mergeCommittedInvitationState({}, [pending], owner);
assert.equal(ownerState.sent.length, 1, 'El emisor no ve inmediatamente su invitación confirmada.');
assert.equal(ownerState.received.length, 0);

let guestState = mergeModule.mergeCommittedInvitationState({}, [pending], guest);
assert.equal(guestState.received.length, 1, 'El destinatario no ve inmediatamente la invitación recibida.');
assert.equal(guestState.sent.length, 0);

const accepted = { ...pending, status: 'accepted', updatedAt: '2026-07-31T13:57:00.000Z' };
guestState = mergeModule.mergeCommittedInvitationState(guestState, [accepted], guest);
assert.equal(guestState.received.length, 1, 'La actualización de estado duplicó la invitación.');
assert.equal(guestState.received[0].status, 'accepted', 'La respuesta canónica no sustituyó la invitación pendiente.');

const unrelatedState = mergeModule.mergeCommittedInvitationState(
  { received: [accepted], sent: [accepted] },
  [accepted],
  { userId: 'user_other', email: 'other@example.com' }
);
assert.deepEqual(unrelatedState, { received: [], sent: [] }, 'Una cuenta ajena conservó una invitación que no le corresponde.');

const applyStart = clientSource.indexOf('  applyCommittedControlState(');
const applyEnd = clientSource.indexOf('\n  handleTabMessage(', applyStart);
assert.ok(applyStart >= 0 && applyEnd > applyStart, 'No se encontró la aplicación en memoria del commit de control.');
const applyMethod = clientSource.slice(applyStart, applyEnd);
assert.match(applyMethod, /space\.authorizationState === 'unconfirmed'/, 'La aplicación en memoria ignora la frontera provisional de autorización.');
assert.match(applyMethod, /this\.rememberAuthoritativeSpace\(committedSpace\)/, 'El espacio durable no se refleja en memoria.');
assert.doesNotMatch(applyMethod, /const confirmedSpace = \{ \.\.\.space, authorizationState: 'confirmed' \}/, 'La aplicación local todavía fuerza como confirmada toda aceptación provisional.');
assert.match(applyMethod, /mergeCommittedInvitationState\(/, 'La invitación durable no se refleja en memoria.');
assert.match(applyMethod, /dispatch\('p2p:state'/, 'El estado durable no se propaga a la interfaz ni a otras pestañas.');

const realtimeStart = clientSource.indexOf("    } else if (event.eventType?.startsWith('p2p.invitation.')) {");
const realtimeEnd = clientSource.indexOf('\n    } else {', realtimeStart);
assert.ok(realtimeStart >= 0 && realtimeEnd > realtimeStart, 'No se encontró la aplicación realtime de invitaciones.');
const realtimeMethod = clientSource.slice(realtimeStart, realtimeEnd);
assert.match(realtimeMethod, /const invitationAccepted = event\.eventType === 'p2p\.invitation\.accepted'/, 'La rama realtime dejó de identificar explícitamente una aceptación.');
assert.match(realtimeMethod, /acceptedForCurrentUser[\s\S]*event\.actorUserId[\s\S]*sessionContext\.userId/, 'La recuperación forzada se ejecutaría también en cuentas que no fueron las que aceptaron.');
assert.match(realtimeMethod, /requiresSnapshotRecovery = acceptedForCurrentUser/, 'La recuperación inicial debe quedar acotada a los dispositivos de la cuenta invitada.');
assert.match(realtimeMethod, /prepareCommittedControlState\(/, 'El evento de invitación no prepara una frontera durable de autorización.');
assert.match(realtimeMethod, /authorizationState: requiresSnapshotRecovery \? 'unconfirmed' : 'confirmed'/, 'Una aceptación remota todavía se persiste como confirmada antes del bootstrap.');
assert.match(realtimeMethod, /currentSpaces: this\.bootstrapState\.spaces \|\| \[\]/, 'El replay no protege una réplica que ya estaba confirmada.');
assert.match(realtimeMethod, /await saveControlStateAtomically\(committedControlState\)/);
assert.match(realtimeMethod, /this\.applyCommittedControlState\(committedControlState, \{ source: 'realtime-invitation' \}\)/);
assert.match(realtimeMethod, /requestSnapshots: 'force',[\s\S]*snapshotSpaceIds: cleanSpaceId \? \[cleanSpaceId\] : \[\]/, 'Una aceptación remota debe forzar snapshot únicamente para el espacio recién autorizado.');
assert.match(realtimeMethod, /assertAcceptedInvitationReplicaState\(/, 'La aceptación remota no usa la validación común de réplica.');
assert.match(realtimeMethod, /recoveryRequirements: this\.recoveryRequirements/, 'La aceptación remota ignora el watermark de recuperación local.');
assert.match(realtimeMethod, /allowReplicaPending: true/, 'La aceptación remota bloquearía la cola antes de recibir el snapshot que debe completarla.');
assert.match(realtimeMethod, /P2P_REALTIME_INVITATION_REPLICA_UNCONFIRMED/, 'La aceptación puede confirmarse sin comprobar una réplica recuperable.');

const acceptedBranchStart = realtimeMethod.indexOf('      if (requiresSnapshotRecovery) {');
const acceptedBranchEnd = realtimeMethod.indexOf('      } else {', acceptedBranchStart);
assert.ok(acceptedBranchStart >= 0 && acceptedBranchEnd > acceptedBranchStart);
const acceptedBranch = realtimeMethod.slice(acceptedBranchStart, acceptedBranchEnd);
assert.match(acceptedBranch, /requestSpaceKey\(cleanSpaceId, '', \{ force: true \}\)/, 'Una invitación cifrada no solicita la clave antes de pedir su snapshot.');
assert.ok(
  acceptedBranch.indexOf('requestSpaceKey(cleanSpaceId') < acceptedBranch.indexOf('this.refreshBootstrap({'),
  'La recuperación realtime solicita el snapshot antes de preparar la clave cifrada.'
);
const acceptedCriticalBootstrap = acceptedBranch.slice(acceptedBranch.indexOf('const state = await this.refreshBootstrap({'));
assert.doesNotMatch(acceptedCriticalBootstrap, /refreshBootstrap\(\{[\s\S]*?\}\)\.catch\(/, 'La recuperación crítica de una invitación aceptada todavía absorbe el fallo y permite avanzar el ACK.');

const inviteStart = clientSource.indexOf("  async invite(email = '', options = {})");
const inviteEnd = clientSource.indexOf('\n  async respondToInvitation(', inviteStart);
const inviteMethod = clientSource.slice(inviteStart, inviteEnd);
assert.match(inviteMethod, /prepareCommittedControlState\(/);
assert.match(inviteMethod, /authorizationState: 'confirmed'/, 'La creación autoritativa del propietario dejó de persistirse como confirmada.');
assert.match(inviteMethod, /this\.applyCommittedControlState\(committedControlState, \{ source: 'local-invite' \}\)/);

const responseStart = inviteEnd + 1;
const responseEnd = clientSource.indexOf('\n  async leave(', responseStart);
const responseMethod = clientSource.slice(responseStart, responseEnd);
assert.match(responseMethod, /canonicalDecision === 'accept'/);
assert.match(responseMethod, /requestSpaceKey\(acceptedSpaceId, '', \{ force: true \}\)/, 'La aceptación local cifrada no solicita su clave antes del snapshot.');
assert.ok(
  responseMethod.indexOf('requestSpaceKey(acceptedSpaceId') < responseMethod.indexOf("requestSnapshots: 'force'"),
  'La aceptación local solicita el snapshot antes de preparar la clave cifrada.'
);
assert.equal(
  (responseMethod.match(/requestSpaceKey\(acceptedSpaceId/g) || []).length,
  1,
  'La aceptación local conserva una solicitud de clave tardía duplicada.'
);
assert.match(responseMethod, /requestSnapshots: 'force',[\s\S]*snapshotSpaceIds: acceptedSpaceId \? \[acceptedSpaceId\] : \[\]/, 'El dispositivo que acepta debe recuperar únicamente el espacio recién autorizado.');
assert.match(responseMethod, /assertAcceptedInvitationReplicaState\(/, 'La aceptación local no confirma su réplica contra el bootstrap autoritativo.');
assert.match(responseMethod, /P2P_LOCAL_INVITATION_REPLICA_UNCONFIRMED/, 'La aceptación local no distingue una réplica todavía no confirmada.');
assert.match(responseMethod, /recoveryRequirements: this\.recoveryRequirements/, 'La aceptación local ignora el watermark de recuperación local.');
assert.match(responseMethod, /allowReplicaPending: true/, 'La aceptación local no conserva un estado recuperable mientras llega el snapshot.');
assert.match(responseMethod, /data\.space = replicaState\.space \|\| null/, 'La respuesta local conserva un espacio anterior en vez del estado autoritativo.');
assert.match(responseMethod, /data\.accessRevoked = replicaState\.explicitlyRevoked/, 'La interfaz no puede distinguir una revocación inmediatamente posterior.');
assert.match(responseMethod, /data\.replicaPending = replicaState\.replicaPending/, 'La interfaz no puede distinguir una membresía aceptada de una réplica ya completa.');
assert.match(responseMethod, /prepareCommittedControlState\(/, 'La respuesta local no prepara el estado provisional antes de persistirlo.');
assert.match(responseMethod, /authorizationState: canonicalDecision === 'accept' \? 'unconfirmed' : 'confirmed'/, 'La aceptación local todavía obtiene permisos antes de confirmar su réplica.');
assert.match(responseMethod, /currentSpaces: this\.bootstrapState\.spaces \|\| \[\]/, 'La aceptación repetida puede rebajar una réplica ya confirmada.');
assert.match(responseMethod, /this\.applyCommittedControlState\(committedControlState, \{ source: 'local-invitation-response' \}\)/);

assert.match(clientSource, /pendingReplicaSpaceIds/, 'El bootstrap no preserva el bloqueo mientras la revisión local está atrasada.');
assert.match(clientSource, /recoveryEligibleSpaceIds\(/, 'La recuperación excluye precisamente el proyecto aceptado que debe recibir el snapshot.');
assert.match(clientSource, /const spaceIds = this\.recoveryEligibleSpaceIds\(\)/, 'La reconciliación posterior al snapshot no lee la revisión de los proyectos todavía bloqueados.');
assert.match(clientSource, /appliedStateRevisions: localStateRevisions/, 'Un watermark ya satisfecho puede quedar persistido y bloquear la promoción después de reiniciar.');
assert.match(clientSource, /recoveryRequirement > localStateRevision/, 'Un watermark satisfecho todavía se interpreta como réplica pendiente.');
assert.match(clientSource, /membershipUnconfirmed/, 'El modo de recuperación no distingue una réplica atrasada de una membresía desconocida.');
assert.match(clientSource, /!this\.isSpaceAuthorizationConfirmed\(cleanSpaceId\)[\s\S]*!this\.isSpaceReplicaRecoveryPending\(cleanSpaceId\)/, 'La réplica aceptada no puede solicitar su clave cifrada y queda bloqueada antes de aplicar el snapshot.');
assert.match(clientSource, /confirmRecoveredReplicaAuthorization\(/, 'No existe promoción durable después de completar la réplica.');
assert.match(clientSource, /p2p:replica-recovery-confirmed/, 'La interfaz no recibe la transición que habilita la edición.');

const sendSnapshotStart = clientSource.indexOf('  async sendSnapshot(requestEvent = {})');
const sendSnapshotEnd = clientSource.indexOf('\n  async ', sendSnapshotStart + 10);
assert.ok(sendSnapshotStart >= 0 && sendSnapshotEnd > sendSnapshotStart, 'No se encontró la respuesta local a solicitudes de snapshot.');
const sendSnapshotMethod = clientSource.slice(sendSnapshotStart, sendSnapshotEnd);
assert.ok(
  sendSnapshotMethod.indexOf('await this.flushOutbox()') < sendSnapshotMethod.indexOf('const localStateRevisions = await listStateRevisions([spaceId])'),
  'La fuente sigue fijando su revisión antes de vaciar operaciones pendientes y puede producir un snapshot obsoleto.'
);
assert.match(sendSnapshotMethod, /if \(localStateRevision < requestedStateRevision\)/, 'La fuente dejó de rechazar una réplica realmente atrasada.');
assert.doesNotMatch(sendSnapshotMethod, /localStateRevision !== requestedStateRevision/, 'La fuente todavía rechaza una revisión legítimamente más nueva que la solicitud.');
assert.doesNotMatch(sendSnapshotMethod, /reason: 'source_revision_advanced'/, 'La fuente todavía se bloquea por haber avanzado mientras sincronizaba su outbox.');

const appSource = fs.readFileSync(path.join(root, 'src', 'js', 'app.js'), 'utf8');
assert.match(appSource, /result\?\.accessRevoked === true/, 'La interfaz no distingue una aceptación seguida por revocación.');
assert.match(appSource, /result\?\.replicaPending === true/, 'La interfaz presenta como lista una invitación cuya réplica sigue en recuperación.');
assert.match(appSource, /invite\.acceptedAccessRevoked/, 'Falta el mensaje de estado para una aceptación ya revocada.');
assert.match(appSource, /invite\.acceptedSyncing/, 'Falta el mensaje de recuperación posterior a la aceptación.');
assert.match(appSource, /p2p:replica-recovery-pending/);
assert.match(appSource, /p2p:replica-recovery-confirmed/);

console.log('OK: una membresía aceptada permanece en solo lectura hasta alcanzar la revisión autoritativa, la cola SSE puede transportar el snapshot y la promoción final queda persistida.');
