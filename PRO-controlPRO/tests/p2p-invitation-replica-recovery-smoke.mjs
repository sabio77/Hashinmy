import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const currentFile = fileURLToPath(import.meta.url);
const root = path.resolve(path.dirname(currentFile), '..');
const clientSource = fs.readFileSync(path.join(root, 'src', 'js', 'p2p-client.js'), 'utf8');
const storageSource = fs.readFileSync(path.join(root, 'src', 'js', 'p2p-storage.js'), 'utf8');

const headMergeStart = clientSource.indexOf('export function mergePortfolioHeadsWithDeferredManifest(');
const headMergeEnd = clientSource.indexOf('\nexport function assertCanonicalControlEnvelope', headMergeStart);
assert.ok(headMergeStart >= 0 && headMergeEnd > headMergeStart, 'No se encontró la protección de cabezas de panel diferidas.');
const headMergeSource = clientSource.slice(headMergeStart, headMergeEnd).replace('export function', 'function');
const headMergeModule = await import(`data:text/javascript;base64,${Buffer.from(`${headMergeSource}
export { mergePortfolioHeadsWithDeferredManifest };`).toString('base64')}#portfolio-head-deferred`);
const previousHead = {
  portfolioSpaceId: 'portfolio_pending',
  revisionCode: 'HoldKnown',
  replicaRevisionCode: 'PoldKnown',
  managedSpaceIds: ['project_known'],
  stateRevisions: { portfolio_pending: 4, project_known: 7 }
};
const preservedDeferredHead = headMergeModule.mergePortfolioHeadsWithDeferredManifest(
  {},
  { portfolio_pending: previousHead },
  { failed: 1, deferred: true, pendingPortfolioSpaceIds: ['portfolio_pending'] },
  [{ spaceId: 'portfolio_pending', resourceType: 'admin.portfolio' }]
);
assert.equal(preservedDeferredHead.portfolio_pending?.revisionCode, 'HoldKnown', 'Un fallo transitorio de bootstrap descartó la última cabeza conocida del panel.');
assert.equal(preservedDeferredHead.portfolio_pending?.syncDeferred, true, 'La cabeza conservada debe quedar explícitamente bloqueada hasta una lectura autoritativa.');
const firstDeferredHead = headMergeModule.mergePortfolioHeadsWithDeferredManifest(
  {},
  {},
  {},
  [{ spaceId: 'portfolio_new', resourceType: 'admin.portfolio' }]
);
assert.equal(firstDeferredHead.portfolio_new?.syncDeferred, true, 'Una membresía de panel sin cabeza no quedó protegida contra cards mínimas incompletas.');
const refreshedHead = headMergeModule.mergePortfolioHeadsWithDeferredManifest(
  { portfolio_pending: previousHead },
  preservedDeferredHead,
  { failed: 0, deferred: false, pendingPortfolioSpaceIds: [] },
  [{ spaceId: 'portfolio_pending', resourceType: 'admin.portfolio' }]
);
assert.equal(refreshedHead.portfolio_pending?.syncDeferred, false, 'Una cabeza autoritativa nueva no desbloqueó el panel después de la recuperación.');
const degradedIncomingHead = headMergeModule.mergePortfolioHeadsWithDeferredManifest(
  {
    portfolio_degraded: {
      portfolioSpaceId: 'portfolio_degraded',
      managedSpaceIds: ['project_1', 'project_2', 'project_3', 'project_4'],
      projectCount: 4,
      stateRevisions: { portfolio_degraded: 3, project_1: 8, project_2: 4, project_3: 9, project_4: 2 }
    }
  },
  {},
  { failed: 1, deferred: true, pendingPortfolioSpaceIds: ['portfolio_degraded'] },
  [{ spaceId: 'portfolio_degraded', resourceType: 'admin.portfolio' }]
);
assert.equal(degradedIncomingHead.portfolio_degraded?.projectCount, 4, 'Un fallo transitorio del índice volvió a convertir un panel conocido en 0 proyectos.');
assert.equal(degradedIncomingHead.portfolio_degraded?.syncDeferred, true, 'Una cabeza parcial conocida se marcó como completa antes de reparar el índice del panel.');

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
assert.equal(provisional.spaces[0].replicaBootstrapMode, 'minimal');
assert.equal(provisional.spaces[0].replicaStaleAt, '2026-07-31T14:21:00.000Z', 'La aceptación mínima no registró cuándo quedó obsoleta la réplica local.');

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
assert.equal('replicaStaleAt' in explicitConfirmation.spaces[0], false, 'La confirmación autoritativa conservó la marca obsoleta.');

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
assert.match(realtimeMethod, /requiresSnapshotRecovery\s*=\s*event\.eventType\s*===\s*'p2p\.invitation\.accepted'/);
assert.match(realtimeMethod, /prepareCommittedControlState\(/, 'El evento de invitación no prepara una frontera durable de autorización.');
assert.match(realtimeMethod, /authorizationState: requiresSnapshotRecovery \? 'unconfirmed' : 'confirmed'/, 'Una aceptación remota todavía se persiste como confirmada antes del bootstrap.');
assert.match(realtimeMethod, /currentSpaces: this\.bootstrapState\.spaces \|\| \[\]/, 'El replay no protege una réplica que ya estaba confirmada.');
assert.match(realtimeMethod, /await saveControlStateAtomically\(committedControlState\)/);
assert.match(realtimeMethod, /this\.applyCommittedControlState\(committedControlState, \{ source: 'realtime-invitation' \}\)/);
assert.match(realtimeMethod, /acceptedByCurrentUser/, 'El evento no distingue al invitado de los miembros que ya tenían réplica.');
assert.match(realtimeMethod, /this\.scheduleMinimalReplicaRecovery\(cleanSpaceId,/, 'La aceptación remota no programa la recuperación dirigida de la réplica.');
assert.doesNotMatch(realtimeMethod, /await this\.refreshBootstrap\(\{ requestSnapshots: 'force' \}\)/, 'La aceptación remota todavía bloquea el ACK esperando una copia completa.');
assert.match(realtimeMethod, /minimalBootstrap: requiresSnapshotRecovery/, 'El evento no informa a la interfaz que el control mínimo ya fue montado.');

const recoveryStart = clientSource.indexOf("  scheduleMinimalReplicaRecovery(spaceId = '', options = {})");
const recoveryEnd = clientSource.indexOf('\n  async recoverOnline()', recoveryStart);
assert.ok(recoveryStart >= 0 && recoveryEnd > recoveryStart, 'No se encontró la recuperación asíncrona posterior a la aceptación.');
const recoveryMethod = clientSource.slice(recoveryStart, recoveryEnd);
assert.match(recoveryMethod, /requestSnapshots: 'force'/, 'La recuperación en segundo plano no solicita el snapshot dirigido.');
assert.match(recoveryMethod, /snapshotSpaceIds: \[cleanSpaceId\]/, 'La recuperación solicita copias ajenas al proyecto aceptado.');
assert.match(recoveryMethod, /assertAcceptedInvitationReplicaState\(/, 'La recuperación no usa la validación común de réplica.');
assert.match(recoveryMethod, /recoveryRequirements: this\.recoveryRequirements/, 'La recuperación ignora el watermark local.');
assert.match(recoveryMethod, /allowReplicaPending: true/, 'La recuperación no admite que el snapshot siga en tránsito.');
assert.match(recoveryMethod, /minimalReplicaRecoveryBySpace\.get\(cleanSpaceId\)/, 'La recuperación no evita solicitudes duplicadas para el mismo espacio.');

const membershipStart = clientSource.indexOf("    } else if (event.eventType === 'p2p.membership.changed') {");
const membershipEnd = clientSource.indexOf("    } else if (event.eventType?.startsWith('p2p.invitation.')) {", membershipStart);
assert.ok(membershipStart >= 0 && membershipEnd > membershipStart, 'No se encontró la rama realtime de membresía heredada.');
const membershipMethod = clientSource.slice(membershipStart, membershipEnd);
assert.match(membershipMethod, /newlyRecognizedReplica/, 'La herencia del panel no distingue proyectos nuevos de cambios normales de permisos.');
assert.match(membershipMethod, /authorizationState: 'unconfirmed'/, 'Un proyecto heredado se confirma antes de recuperar su réplica.');
assert.match(membershipMethod, /source: 'realtime-membership-minimal'/, 'El control mínimo heredado no se aplica a la interfaz.');
assert.match(membershipMethod, /scheduleMinimalReplicaRecovery\(cleanSpaceId,/, 'El proyecto heredado no inicia recuperación dirigida en segundo plano.');
assert.match(membershipMethod, /minimalBootstrap: true/, 'El evento heredado no informa que solo contiene control mínimo.');
assert.match(membershipMethod, /const state = await this\.refreshBootstrap\(\{ requestSnapshots: false \}\)/, 'Los cambios normales de permisos perdieron su confirmación autoritativa antes del ACK.');

const inviteStart = clientSource.indexOf("  async invite(email = '', options = {})");
const inviteEnd = clientSource.indexOf('\n  async respondToInvitation(', inviteStart);
const inviteMethod = clientSource.slice(inviteStart, inviteEnd);
assert.match(inviteMethod, /prepareCommittedControlState\(/);
assert.match(inviteMethod, /authorizationState: 'confirmed'/, 'La creación autoritativa del propietario dejó de persistirse como confirmada.');
assert.match(inviteMethod, /this\.applyCommittedControlState\(committedControlState, \{ source: 'local-invite' \}\)/);
assert.match(inviteMethod, /expectedPortfolioProjectSpaceIds/, 'La invitación de panel no transporta el manifiesto de proyectos que el remitente ve.');
assert.match(inviteMethod, /this\.attachProjectsToPortfolio\(requestedSpaceId, missingSpaceIds\)/, 'La invitación no repara proyectos legacy antes de publicarse.');
assert.match(inviteMethod, /expectedPortfolioProjectSpaceIds = \[\.\.\.managedSpaceIds\]/, 'La invitación no termina usando la cabeza autoritativa más reciente del panel.');
assert.match(inviteMethod, /portfolioProjectSpaceIds: expectedPortfolioProjectSpaceIds/, 'El backend no recibe el manifiesto exacto de proyectos al crear o reutilizar la invitación.');

const responseStart = inviteEnd + 1;
const responseEnd = clientSource.indexOf('\n  async leave(', responseStart);
const responseMethod = clientSource.slice(responseStart, responseEnd);
assert.match(responseMethod, /canonicalDecision === 'accept'/);
assert.doesNotMatch(responseMethod, /await this\.refreshBootstrap\(\{ requestSnapshots: 'force'/, 'Aceptar localmente todavía espera la copia completa antes de responder.');
assert.match(responseMethod, /this\.scheduleMinimalReplicaRecovery\(acceptedSpaceId,/, 'La aceptación local no inicia la recuperación dirigida en segundo plano.');
assert.match(responseMethod, /data\.space = provisionalSpace/, 'La respuesta local no conserva el control mínimo autorizado.');
assert.match(responseMethod, /data\.accessRevoked = false/, 'La respuesta local no refleja el commit atómico recién aceptado.');
assert.match(responseMethod, /data\.replicaPending = Boolean\(provisionalSpace\)/, 'La interfaz no puede distinguir el control mínimo de una réplica completa.');
assert.match(responseMethod, /data\.minimalBootstrap = Boolean\(provisionalSpace\)/, 'La interfaz no recibe la marca de bootstrap mínimo.');
assert.match(responseMethod, /data\.replicaStaleAt = provisionalSpace\?\.replicaStaleAt/, 'La respuesta no expone la antigüedad del control mínimo.');
assert.match(responseMethod, /prepareCommittedControlState\(/, 'La respuesta local no prepara el estado provisional antes de persistirlo.');
assert.match(responseMethod, /authorizationState: canonicalDecision === 'accept' \? 'unconfirmed' : 'confirmed'/, 'La aceptación local todavía obtiene permisos antes de confirmar su réplica.');
assert.match(responseMethod, /currentSpaces: this\.bootstrapState\.spaces \|\| \[\]/, 'La aceptación repetida puede rebajar una réplica ya confirmada.');
assert.match(responseMethod, /this\.applyCommittedControlState\(committedControlState, \{[\s\S]*?source: 'local-invitation-response',[\s\S]*?dispatch: !\(canonicalDecision === 'accept' && portfolioInvitation\)/, 'La aceptación de panel no debe publicar raíces mínimas antes de incorporar su cabeza autoritativa.');
assert.match(responseMethod, /if \(portfolioInvitation\) \{[\s\S]*?dispatch\('p2p:state', \{ state: this\.bootstrapState, source: 'local-invitation-response' \}\)/, 'El primer estado visible del panel aceptado debe incluir ya su cabeza de versión.');
assert.match(responseMethod, /data\.preferredSnapshotSourceUserId \|\| data\.invitation\?\.inviterUserId/, 'La cuenta que invitó debe seguir siendo una fuente preferente aunque su deviceId certificado haya quedado obsoleto.');
assert.match(responseMethod, /data\.preferredSnapshotPanelRevisionCode \|\| currentReplicaRevisionCode/, 'La recuperación debe anclarse a la cabeza alfanumérica vigente devuelta al aceptar el panel.');
assert.match(responseMethod, /const recoverySpaceIds = normalizeSnapshotSpaceIds\(\[[\s\S]*?acceptedSpaceId,[\s\S]*?\.\.\.participationRootIds,[\s\S]*?portfolioHead\?\.managedSpaceIds/, 'La aceptación del panel no dirige la recuperación a los projectIds autoritativos conocidos por la cabeza mínima cuando el manifiesto de raíces llega parcial.');
assert.match(clientSource, /function hasCanonicalProjectRootEntity\([\s\S]*?hasOwnProperty\.call\(value, 'initialBudget'\)[\s\S]*?initialBudget > 0[\s\S]*?value\.createdAt \|\| value\.updatedAt/, 'Una entidad técnica con presupuesto 0 todavía puede hacerse pasar por raíz de proyecto cargada y dejar métricas falsas en 0.');
assert.match(clientSource, /async sendSnapshot\(requestEvent = \{\}\)[\s\S]*?isAdminProjectSpace\(spaceId\)[\s\S]*?!hasCanonicalProjectRootEntity\(localEntities\)[\s\S]*?canonical_project_root_missing/, 'Una réplica sin raíz funcional todavía puede ganar el turno de snapshot antes que el dispositivo actualizado del invitador.');

assert.match(clientSource, /pendingReplicaSpaceIds/, 'El bootstrap no preserva el bloqueo mientras la revisión local está atrasada.');
assert.match(
  clientSource,
  /if \(provisionalReplicaSpaceIds\.has\(spaceId\)\) return true;/,
  'Una aceptación mínima con revisión 0 puede quedar confirmada antes de recibir snapshot.complete.'
);
assert.match(
  clientSource,
  /pendingReplicaRecoverySpaceIds\(spaces = this\.bootstrapState\.spaces \|\| \[\]\)/,
  'La recuperación no conserva como deuda los espacios mínimos aunque no exista un watermark mayor que cero.'
);
assert.match(
  clientSource,
  /const snapshotSpaceIds = this\.snapshotRecoveryTargetSpaceIds\(\);[\s\S]*?requestSnapshots: 'force',[\s\S]*?snapshotSpaceIds/,
  'El reintento de snapshot pierde el objetivo explícito y memoriaBACKEND no vuelve a solicitar proyectos legacy con revisión 0.'
);
assert.match(
  clientSource,
  /const SNAPSHOT_SOURCE_RESPONSE_WATCHDOG_MS = 25 \* 1000;/,
  'La recuperación volvió a depender únicamente del TTL largo del grant y puede dejar las cards sincronizando durante minutos.'
);
const recoveryDelayStart = clientSource.indexOf('  snapshotRecoveryDelay(snapshotRequests = []) {');
const recoveryDelayEnd = clientSource.indexOf('\n  async resetDeliveryCursor', recoveryDelayStart);
assert.ok(recoveryDelayStart >= 0 && recoveryDelayEnd > recoveryDelayStart, 'No se encontró el watchdog de recuperación de snapshot.');
const recoveryDelayMethod = clientSource.slice(recoveryDelayStart, recoveryDelayEnd)
  .trim()
  .replace(/^snapshotRecoveryDelay/, 'function snapshotRecoveryDelay');
const recoveryDelayModule = await import(`data:text/javascript;base64,${Buffer.from(`
const SNAPSHOT_RECOVERY_FALLBACK_MS = 60 * 1000;
const SNAPSHOT_RECOVERY_MARGIN_MS = 5 * 1000;
const SNAPSHOT_SOURCE_RESPONSE_WATCHDOG_MS = 25 * 1000;
${recoveryDelayMethod}
export { snapshotRecoveryDelay };
`).toString('base64')}#snapshot-recovery-watchdog`);
const longGrantRetryDelay = recoveryDelayModule.snapshotRecoveryDelay.call(
  { snapshotGrantTtlSeconds: 600 },
  [{ requestId: 'req_stalled', expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString() }]
);
assert.ok(
  longGrantRetryDelay >= 5000 && longGrantRetryDelay <= 25000,
  `Un grant sin respuesta todavía posterga la recuperación ${longGrantRetryDelay} ms en lugar de volver a consultar tras la gracia de la fuente.`
);
const noGrantRetryDelay = recoveryDelayModule.snapshotRecoveryDelay.call({ snapshotGrantTtlSeconds: 600 }, []);
assert.equal(noGrantRetryDelay, 60000, 'El watchdog se activó fuera de una recuperación con snapshot pendiente.');
assert.match(
  storageSource,
  /pendingReplicaSpaceIds: reconciliation\.pendingReplicaSpaceIds/,
  'La persistencia atómica descarta la lista de réplicas pendientes y la capa superior no puede señalizar la recuperación.'
);
assert.match(clientSource, /recoveryEligibleSpaceIds\(/, 'La recuperación excluye precisamente el proyecto aceptado que debe recibir el snapshot.');
assert.match(clientSource, /const spaceIds = this\.recoveryEligibleSpaceIds\(\)/, 'La reconciliación posterior al snapshot no lee la revisión de los proyectos todavía bloqueados.');
assert.match(clientSource, /appliedStateRevisions: localStateRevisions/, 'Un watermark ya satisfecho puede quedar persistido y bloquear la promoción después de reiniciar.');
assert.match(clientSource, /recoveryRequirement > localStateRevision/, 'Un watermark satisfecho todavía se interpreta como réplica pendiente.');
assert.match(clientSource, /membershipUnconfirmed/, 'El modo de recuperación no distingue una réplica atrasada de una membresía desconocida.');
assert.match(clientSource, /!this\.isSpaceAuthorizationConfirmed\(cleanSpaceId\)[\s\S]*!this\.isSpaceReplicaRecoveryPending\(cleanSpaceId\)/, 'La réplica aceptada no puede solicitar su clave cifrada y queda bloqueada antes de aplicar el snapshot.');
assert.match(clientSource, /confirmRecoveredReplicaAuthorization\(/, 'No existe promoción durable después de completar la réplica.');
assert.match(clientSource, /p2p:replica-recovery-confirmed/, 'La interfaz no recibe la transición que habilita la edición.');
assert.match(clientSource, /confirmRecoveredReplicaAuthorization\([\s\S]*?getEntity\(cleanSpaceId, 'admin\.project', 'project'\)[\s\S]*?!hasCanonicalProjectRootEntity\(\[recoveredProjectRoot\]\)[\s\S]*?return false;/, 'Una operación delta todavía puede confirmar una réplica sin haber recibido la raíz canónica del proyecto.');
assert.match(clientSource, /'p2p\.snapshot\.declined'/, 'El cliente no reconoce que una fuente descartó explícitamente una concesión de snapshot.');
assert.match(clientSource, /apiPost\('\/api\/p2p\/snapshots\/decline'/, 'Una fuente incapaz de servir la réplica no libera su concesión en memoriaBACKEND.');
assert.match(clientSource, /event\.eventType === 'p2p\.snapshot\.declined'[\s\S]*?transientSnapshotSourceDecline\(reason\)[\s\S]*?rememberRejectedSnapshotSource[\s\S]*?SNAPSHOT_REJECTION_RETRY_MS/, 'El invitado no distingue carreras transitorias de fuentes realmente inválidas antes de reintentar.');
const transientSnapshotDeclines = clientSource.match(/const TRANSIENT_SNAPSHOT_SOURCE_DECLINE_REASONS = new Set\(\[([\s\S]*?)\]\);/)?.[1] || '';
for (const reason of [
  'source_recovery_pending',
  'source_revision_behind',
  'p2p_space_key_missing',
  'p2p_snapshot_source_busy',
  'p2p_key_stale',
  'p2p_key_authority_pending',
  'p2p_key_rotation_required'
]) {
  assert.ok(
    transientSnapshotDeclines.includes(`'${reason}'`),
    `La condición transitoria ${reason} vuelve a poner una réplica recuperable en cuarentena durante 5 minutos.`
  );
}
assert.equal(
  transientSnapshotDeclines.includes("'canonical_project_root_missing'"),
  false,
  'Una fuente realmente incompleta no debe reutilizarse como si su rechazo fuera transitorio.'
);
assert.match(clientSource, /p2p:snapshot-source-decline-error'[\s\S]*?throw declineError;/, 'Una falla al liberar el grant todavía permite ACKear el request y deja al invitado esperando hasta el TTL.');


assert.match(clientSource, /scheduleMinimalReplicaRecovery\(spaceId = '', options = \{\}\)/, 'Falta la recuperación asíncrona y deduplicada posterior a la aceptación.');
assert.match(clientSource, /minimalReplicaRecoveryBySpace = new Map\(\)/, 'La recuperación de invitaciones puede duplicarse por espacio.');
assert.match(clientSource, /minimalBootstrap: requiresSnapshotRecovery/, 'El evento de invitación no informa que montó solo el control mínimo.');
assert.doesNotMatch(clientSource, /if \(canonicalDecision === 'accept'\) \{\s*const state = await this\.refreshBootstrap\(\{ requestSnapshots: 'force' \}\)/, 'Aceptar una invitación sigue bloqueando la respuesta hasta iniciar la copia completa.');

const appSource = fs.readFileSync(path.join(root, 'src', 'js', 'app.js'), 'utf8');
const snapshotCompleteListenerStart = appSource.indexOf("window.addEventListener('p2p:snapshot-complete'");
const snapshotCompleteListenerEnd = appSource.indexOf("window.addEventListener('p2p:operation'", snapshotCompleteListenerStart);
assert.ok(snapshotCompleteListenerStart >= 0 && snapshotCompleteListenerEnd > snapshotCompleteListenerStart, 'La interfaz no escucha la finalización durable del snapshot.');
const snapshotCompleteListener = appSource.slice(snapshotCompleteListenerStart, snapshotCompleteListenerEnd);
assert.match(snapshotCompleteListener, /refreshProjects\(\)/, 'Una raíz recuperada puede quedar visualmente en “Sincronizando” porque snapshot.complete no rehidrata IndexedDB.');
assert.match(snapshotCompleteListener, /applyP2PState\(semillaP2P\.bootstrapState\)/, 'La finalización del snapshot no recupera el control si la raíz llegó antes que el estado visible de la interfaz.');

assert.match(appSource, /result\?\.accessRevoked === true/, 'La interfaz no distingue una aceptación seguida por revocación.');
assert.match(appSource, /result\?\.replicaPending === true/, 'La interfaz presenta como lista una invitación cuya réplica sigue en recuperación.');
assert.match(appSource, /invite\.acceptedAccessRevoked/, 'Falta el mensaje de estado para una aceptación ya revocada.');
assert.match(appSource, /invite\.acceptedSyncing/, 'Falta el mensaje de recuperación posterior a la aceptación.');
assert.match(appSource, /p2p:replica-recovery-pending/);
assert.match(appSource, /p2p:replica-recovery-confirmed/);
assert.match(appSource, /state\.projects = new Map\(entries\)/, 'La interfaz no conserva inmediatamente las raíces mínimas de proyectos aceptados.');
assert.match(appSource, /function panelProjectSources\(\) \{[\s\S]*?state\.p2pState\.spaces[\s\S]*?resolvedProjectData\(space, \[\]\)/, 'El dashboard no consume las raíces P2P mínimas antes de terminar la hidratación de IndexedDB.');
assert.match(appSource, /projects:\s*panelProjectSources\(\)/, 'Los scopes del panel todavía dependen exclusivamente de state.projects y pueden renderizar 0 proyectos durante la aceptación.');
assert.doesNotMatch(appSource, /if \(pending\) return \{ reused: true, invitation: pending, space \};/, 'Una invitación pendiente puede evitar la nueva validación del manifiesto y conservar un panel antiguo con 0 proyectos.');
assert.match(appSource, /function panelProjectCount\(/, 'La card del panel no calcula proyectos reconocidos mientras la réplica completa sus datos.');
assert.match(appSource, /panel\.expectedProjectSpaceIds/, 'El contador del panel ignora proyectos reconocidos por la cabeza mínima.');
assert.match(appSource, /panel\.portfolioHead\?\.projectCount/, 'El contador del panel no conserva el total autoritativo durante una recuperación parcial.');
assert.match(appSource, /function pendingPanelProjectPlaceholders\(/, 'Faltan cards mínimas para proyectos reconocidos cuya raíz todavía está llegando.');
assert.match(appSource, /\[\.\.\.panelProjects, \.\.\.pendingPanelProjectPlaceholders\(panel\)\]/, 'El dashboard sigue excluyendo proyectos mínimos del panel aceptado.');
const renderDashboardStart = appSource.indexOf('function renderDashboard()');
const renderDashboardEnd = appSource.indexOf('\nfunction queueInvitationIntent(', renderDashboardStart);
assert.ok(renderDashboardStart >= 0 && renderDashboardEnd > renderDashboardStart, 'No se encontró el render del dashboard.');
const renderDashboardSource = appSource.slice(renderDashboardStart, renderDashboardEnd);
assert.doesNotMatch(renderDashboardSource, /\.filter\(\(item\) => item\.project\.loaded === true && !item\.project\.isTrashed\)/, 'El dashboard vuelve a ocultar las cards hasta hidratar por completo el proyecto.');
assert.match(appSource, /if \(!projectLoaded\) \{[\s\S]*?openButton\.disabled = true/, 'Una card mínima podría abrirse antes de validar la réplica completa.');
assert.match(appSource, /menu\.disabled = Boolean\(lifecycleTransaction\) \|\| !projectLoaded/, 'Una card mínima permite acciones antes de validar la réplica completa.');
assert.match(appSource, /function panelScopes\(\) \{[\s\S]*?return allPanelScopes\(\);/, 'El panel aceptado sigue oculto durante la sincronización inicial.');
assert.match(appSource, /isIncompleteInvitedPortfolio/, 'Se perdió el diagnóstico de panel incompleto necesario para mantener activa la recuperación.');
assert.match(appSource, /!panel\.portfolioHead \|\| panel\.portfolioHead\?\.syncDeferred === true/, 'La recuperación no vuelve a solicitar la raíz del panel cuando falta o quedó diferida su cabeza de versión.');



const sendSnapshotStart = clientSource.indexOf('  async sendSnapshot(requestEvent = {})');
const sendSnapshotEnd = clientSource.indexOf('\n  async ensurePushSubscriptionForCurrentVapidKey(', sendSnapshotStart);
assert.ok(sendSnapshotStart >= 0 && sendSnapshotEnd > sendSnapshotStart, 'No se encontró la respuesta de snapshot del dispositivo fuente.');
const sendSnapshotMethod = clientSource.slice(sendSnapshotStart, sendSnapshotEnd);
const snapshotFlushIndex = sendSnapshotMethod.indexOf('await this.flushOutbox()');
const snapshotRevisionReadIndex = sendSnapshotMethod.indexOf('const localStateRevisions = await listStateRevisions([spaceId]);');
assert.ok(snapshotFlushIndex >= 0 && snapshotRevisionReadIndex > snapshotFlushIndex, 'La fuente debe confirmar su outbox antes de congelar la revisión que enviará al invitado.');
assert.match(sendSnapshotMethod, /if \(localStateRevision < requestedStateRevision\)/, 'La fuente debe diferir solo si está atrasada, no por haber avanzado a la cabeza autoritativa.');
assert.doesNotMatch(sendSnapshotMethod, /localStateRevision !== requestedStateRevision/, 'La igualdad estricta vuelve a dejar al invitado bloqueado si la fuente confirma cambios después del request.');
assert.match(sendSnapshotMethod, /!this\.realtimeLeader[\s\S]*?deferSnapshotSource\(requestEvent,[\s\S]*?source_not_realtime_leader/, 'Una pestaña que perdió el liderazgo todavía consume el request sin liberar el lease para la nueva líder.');
assert.match(sendSnapshotMethod, /expiresAt <= Date\.now\(\) \+ 1000[\s\S]*?deferSnapshotSource\(requestEvent,[\s\S]*?source_request_expiring/, 'Un request a punto de expirar todavía queda ACKeado silenciosamente sin liberar su concesión.');
assert.match(sendSnapshotMethod, /deferSnapshotSource\(requestEvent,[\s\S]*?source_recovery_pending/, 'Una fuente con recuperación pendiente no libera su grant para que el invitado pruebe otra réplica.');
assert.match(sendSnapshotMethod, /deferSnapshotSource\(requestEvent,[\s\S]*?canonical_project_root_missing/, 'Una fuente sin raíz canónica no libera su grant y puede bloquear la recuperación durante todo el TTL.');

console.log('OK: la aceptación monta control mínimo sin bloquear, muestra panel y cards reconocidas de inmediato y mantiene la edición bloqueada hasta completar la réplica.');
