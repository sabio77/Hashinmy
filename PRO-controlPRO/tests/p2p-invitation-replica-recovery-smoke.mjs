import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const currentFile = fileURLToPath(import.meta.url);
const root = path.resolve(path.dirname(currentFile), '..');
const clientSource = fs.readFileSync(path.join(root, 'src', 'js', 'p2p-client.js'), 'utf8');
const storageSource = fs.readFileSync(path.join(root, 'src', 'js', 'p2p-storage.js'), 'utf8');
const projectDomainSource = fs.readFileSync(path.join(root, 'src', 'js', 'project-domain.js'), 'utf8');

const snapshotIdsStart = clientSource.indexOf('export function normalizeSnapshotSpaceIds(');
const snapshotIdsEnd = clientSource.indexOf('\nfunction createId(', snapshotIdsStart);
assert.ok(snapshotIdsStart >= 0 && snapshotIdsEnd > snapshotIdsStart, 'No se encontró la selección de snapshots de invitaciones.');
const snapshotIdsSource = clientSource.slice(snapshotIdsStart, snapshotIdsEnd)
  .replaceAll('export function', 'function');
const snapshotIdsModule = await import(`data:text/javascript;base64,${Buffer.from(`${snapshotIdsSource}
export { acceptedInvitationSnapshotSpaceIds, snapshotEntityFromLocalRecord, isReplicaRecoveryPendingSpace, isMembershipAuthorizationUnconfirmedSpace };`).toString('base64')}#accepted-snapshot-spaces`);
assert.deepEqual(
  snapshotIdsModule.acceptedInvitationSnapshotSpaceIds({
    spaces: [
      { spaceId: 'portfolio_1' },
      { spaceId: 'project_1', governanceSpaceId: 'portfolio_1' },
      { spaceId: 'project_2', governanceSpaceId: 'portfolio_1' },
      { spaceId: 'project_3', governanceSpaceId: 'portfolio_1' },
      { spaceId: 'project_4', governanceSpaceId: 'portfolio_1' },
      { spaceId: 'project_other', governanceSpaceId: 'portfolio_2' }
    ]
  }, 'portfolio_1', 'guest_1'),
  ['portfolio_1', 'project_1', 'project_2', 'project_3', 'project_4'],
  'Aceptar un panel no dirige la recuperación a sus proyectos gobernados.'
);
assert.deepEqual(
  snapshotIdsModule.acceptedInvitationSnapshotSpaceIds({ spaces: [{ spaceId: 'project_1' }] }, 'project_1'),
  ['project_1'],
  'Aceptar un proyecto individual no conserva su raíz como objetivo de snapshot.'
);

assert.deepEqual(
  snapshotIdsModule.acceptedInvitationSnapshotSpaceIds({
    spaces: [
      {
        spaceId: 'portfolio_legacy',
        resourceType: 'admin.portfolio',
        ownerUserId: 'owner_1',
        members: [{ userId: 'guest_1', permissions: ['read'], accessScope: 'portfolio' }]
      },
      {
        spaceId: 'project_legacy_1',
        resourceType: 'admin.project',
        ownerUserId: 'owner_1',
        members: [{ userId: 'guest_1', permissions: ['read'], accessScope: 'portfolio' }]
      },
      {
        spaceId: 'project_legacy_2',
        resourceType: 'admin.project',
        ownerUserId: 'owner_1',
        members: [{ userId: 'guest_1', permissions: ['read'], accessScope: 'portfolio' }]
      }
    ],
    portfolioHydration: [{
      portfolioSpaceId: 'portfolio_legacy',
      expectedProjectSpaceIds: [],
      complete: true,
      authoritative: true
    }]
  }, 'portfolio_legacy', 'guest_1'),
  ['portfolio_legacy', 'project_legacy_1', 'project_legacy_2'],
  'Aceptar un panel legacy debe clonar también las raíces compartidas por accessScope=portfolio aunque el manifiesto administrado esté vacío.'
);

assert.deepEqual(
  snapshotIdsModule.acceptedInvitationSnapshotSpaceIds({
    spaces: [
      {
        spaceId: 'portfolio_legacy',
        resourceType: 'admin.portfolio',
        ownerUserId: 'owner_1',
        members: [{ userId: 'guest_1', permissions: ['read'], accessScope: 'portfolio' }]
      },
      {
        spaceId: 'portfolio_2',
        resourceType: 'admin.portfolio',
        ownerUserId: 'owner_1',
        members: [{ userId: 'guest_1', permissions: ['read'], accessScope: 'portfolio' }]
      },
      {
        spaceId: 'project_legacy_ambiguous',
        resourceType: 'admin.project',
        ownerUserId: 'owner_1',
        members: [{ userId: 'guest_1', permissions: ['read'], accessScope: 'portfolio' }]
      }
    ]
  }, 'portfolio_legacy', 'guest_1'),
  ['portfolio_legacy'],
  'Una raíz legacy ambigua no puede clonarse automáticamente entre dos paneles legibles del mismo propietario.'
);

assert.deepEqual(
  snapshotIdsModule.acceptedInvitationSnapshotSpaceIds({
    spaces: [{
      spaceId: 'portfolio_manifest',
      resourceType: 'admin.portfolio',
      ownerUserId: 'owner_1',
      members: [{ userId: 'guest_1', permissions: ['read'], accessScope: 'portfolio' }]
    }],
    portfolioHydration: [{
      portfolioSpaceId: 'portfolio_manifest',
      expectedProjectSpaceIds: ['project_manifest_2', 'project_manifest_1'],
      complete: true,
      authoritative: true
    }]
  }, 'portfolio_manifest', 'guest_1'),
  ['portfolio_manifest', 'project_manifest_2', 'project_manifest_1'],
  'La clonación inicial debe usar también el inventario autoritativo aunque las altas de proyecto aún no aparezcan ordenadas en spaces.'
);
assert.equal(snapshotIdsModule.isReplicaRecoveryPendingSpace({
  authorizationState: 'unconfirmed',
  authorizationPendingReason: 'replica_recovery'
}), true, 'Una réplica atrasada no se identifica como estado recuperable.');
assert.equal(snapshotIdsModule.isMembershipAuthorizationUnconfirmedSpace({
  authorizationState: 'unconfirmed',
  authorizationPendingReason: 'replica_recovery'
}), false, 'Una réplica autorizada se sigue confundiendo con una membresía desconocida.');
assert.equal(snapshotIdsModule.isMembershipAuthorizationUnconfirmedSpace({
  authorizationState: 'unconfirmed',
  authorizationPendingReason: 'membership_unconfirmed'
}), true, 'Una membresía realmente desconocida dejó de permanecer bloqueada.');

const canonicalFallbackEntity = snapshotIdsModule.snapshotEntityFromLocalRecord({
  entityType: 'admin.project',
  entityId: 'project',
  value: { name: 'Edición todavía pendiente' },
  deleted: false,
  operationId: 'op_pending',
  operationType: 'entity.patch',
  stateRevision: 8,
  spaceSequence: 8,
  optimistic: true,
  confirmedExists: true,
  confirmedValue: { name: 'Proyecto confirmado' },
  confirmedDeleted: false,
  confirmedOperationId: 'op_confirmed',
  confirmedOperationType: 'entity.put',
  confirmedStateRevision: 7,
  confirmedSpaceSequence: 7,
  confirmedUpdatedAt: '2026-08-05T20:00:00.000Z',
  pendingOperations: [{ operation: { operationId: 'op_pending' } }]
}, { allowConfirmedFallback: true });
assert.deepEqual(canonicalFallbackEntity, {
  entityType: 'admin.project',
  entityId: 'project',
  value: { name: 'Proyecto confirmado' },
  deleted: false,
  operationId: 'op_confirmed',
  operationType: 'entity.put',
  spaceSequence: 7,
  stateRevision: 7,
  updatedAt: '2026-08-05T20:00:00.000Z'
}, 'La clonación inicial no usa la versión canónica cuando la interfaz conserva una edición optimista pendiente.');
assert.equal(snapshotIdsModule.snapshotEntityFromLocalRecord({
  entityType: 'admin.purchase',
  entityId: 'purchase_new',
  value: { amount: 100 },
  optimistic: true,
  confirmedExists: false,
  confirmedValue: null,
  pendingOperations: [{ operation: { operationId: 'op_new' } }]
}, { allowConfirmedFallback: true }), null, 'Una entidad nunca confirmada se filtró dentro del snapshot canónico inicial.');
assert.equal(snapshotIdsModule.snapshotEntityFromLocalRecord({
  entityType: 'admin.project',
  entityId: 'project',
  value: { name: 'Pendiente' },
  optimistic: true,
  confirmedExists: true,
  confirmedValue: { name: 'Confirmado' }
}), null, 'Una recuperación ordinaria reutilizó estado pendiente sin habilitar explícitamente la clonación inicial.');
assert.match(
  clientSource,
  /if \(!allowStaleSource && \(pendingForSpace\.length \|\| hasOptimisticEntities\)\)/,
  'Los cambios pendientes todavía bloquean también la clonación inicial.'
);
assert.match(
  clientSource,
  /snapshotEntityFromLocalRecord\(entity, \{[\s\S]*allowConfirmedFallback: allowStaleSource/,
  'El snapshot inicial no convierte registros optimistas a su estado canónico confirmado.'
);
assert.match(
  clientSource,
  /p2p:snapshot-source-canonical-fallback/,
  'Falta la señal diagnóstica que distingue una clonación canónica desde una fuente con cambios pendientes.'
);

const cleanTextStart = projectDomainSource.indexOf('export function cleanText(');
const cleanTextEnd = projectDomainSource.indexOf('\nexport function localDateValue', cleanTextStart);
const membershipStart = projectDomainSource.indexOf('export function memberForUser(');
const membershipEnd = projectDomainSource.indexOf('\nexport function individualRecordAccess', membershipStart);
const pendingPanelStart = projectDomainSource.indexOf('export function sharedOwnerPanelId(');
const pendingPanelEnd = projectDomainSource.indexOf('\nfunction projectOwnerProfile', pendingPanelStart);
assert.ok(cleanTextStart >= 0 && cleanTextEnd > cleanTextStart, 'No se encontró la normalización de texto del dominio.');
assert.ok(membershipStart >= 0 && membershipEnd > membershipStart, 'No se encontró la política de permisos del dominio.');
assert.ok(pendingPanelStart >= 0 && pendingPanelEnd > pendingPanelStart, 'No se encontró la barrera de hidratación del panel aceptado.');
const pendingPanelSource = [
  "const PROJECT_ENTITY_TYPE = 'admin.project';",
  "const COLLABORATION_ROLES = Object.freeze(['manager', 'admin', 'individual', 'member']);",
  projectDomainSource.slice(cleanTextStart, cleanTextEnd),
  projectDomainSource.slice(membershipStart, membershipEnd),
  projectDomainSource.slice(pendingPanelStart, pendingPanelEnd),
  'export { pendingPanelExpectedProjectSpaceIds };'
].join('\n').replaceAll('export function', 'function');
const pendingPanelModule = await import(`data:text/javascript;base64,${Buffer.from(pendingPanelSource).toString('base64')}#pending-panel-projects`);
const member = (userId, accessScope = 'project', permissions = ['read']) => ({ userId, role: 'member', permissions, accessScope });
const hydrationSpaces = [
  { spaceId: 'portfolio_1', resourceType: 'admin.portfolio', ownerUserId: 'owner_1', members: [member('guest_1', 'portfolio')] },
  { spaceId: 'project_1', resourceType: 'admin.project', governanceSpaceId: 'portfolio_1', ownerUserId: 'owner_1', members: [member('guest_1', 'portfolio')] },
  { spaceId: 'project_legacy', resourceType: 'admin.project', ownerUserId: 'owner_1', members: [member('guest_1', 'portfolio')] },
  { spaceId: 'project_individual', resourceType: 'admin.project', ownerUserId: 'owner_1', members: [member('guest_1', 'project')] },
  { spaceId: 'project_other_panel', resourceType: 'admin.project', governanceSpaceId: 'portfolio_2', ownerUserId: 'owner_2', members: [member('guest_1', 'portfolio')] },
  { spaceId: 'project_without_read', resourceType: 'admin.project', governanceSpaceId: 'portfolio_1', ownerUserId: 'owner_1', members: [member('guest_1', 'portfolio', [])] }
];
assert.deepEqual(
  pendingPanelModule.pendingPanelExpectedProjectSpaceIds({
    spaces: hydrationSpaces,
    panelId: 'portfolio_1',
    currentUserId: 'guest_1'
  }),
  ['project_1', 'project_legacy'],
  'El panel aceptado no espera exactamente sus proyectos gobernados o heredados con lectura.'
);
assert.deepEqual(
  pendingPanelModule.pendingPanelExpectedProjectSpaceIds({
    spaces: hydrationSpaces.filter((space) => space.spaceId !== 'portfolio_1'),
    panelId: 'portfolio_1',
    currentUserId: 'guest_1'
  }),
  ['project_1'],
  'Un panel virtual no espera la raíz del proyecto gobernado que debe mostrar.'
);

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
assert.match(realtimeMethod, /requiresSnapshotRecovery\s*=\s*event\.eventType\s*===\s*'p2p\.invitation\.accepted'/);
assert.match(realtimeMethod, /prepareCommittedControlState\(/, 'El evento de invitación no prepara una frontera durable de autorización.');
assert.match(realtimeMethod, /authorizationState: requiresSnapshotRecovery \? 'unconfirmed' : 'confirmed'/, 'Una aceptación remota todavía se persiste como confirmada antes del bootstrap.');
assert.match(realtimeMethod, /currentSpaces: this\.bootstrapState\.spaces \|\| \[\]/, 'El replay no protege una réplica que ya estaba confirmada.');
assert.match(realtimeMethod, /await saveControlStateAtomically\(committedControlState\)/);
assert.match(realtimeMethod, /this\.applyCommittedControlState\(committedControlState, \{[\s\S]*source: 'realtime-invitation',[\s\S]*dispatch: !requiresSnapshotRecovery[\s\S]*\}\)/, 'Una aceptación remota todavía publica el estado provisional antes de registrar la clonación dirigida.');
assert.match(realtimeMethod, /await this\.refreshBootstrap\(\{ requestSnapshots: false, dispatchState: false \}\)/, 'Una aceptación remota todavía expone a la interfaz el bootstrap intermedio sin snapshots.');
assert.match(realtimeMethod, /requestSnapshots: 'initial-clone'/, 'Una aceptación remota no solicita la mejor copia persistida disponible.');
assert.match(realtimeMethod, /snapshotSpaceIds: recoverySpaceIds/, 'La aceptación remota no dirige la recuperación al panel y sus proyectos internos.');
assert.match(realtimeMethod, /snapshotSpaceIds: recoverySpaceIds,[\s\S]*dispatchState: true/, 'La aceptación remota no publica un único estado después de registrar la clonación dirigida.');
assert.match(realtimeMethod, /this\.emitBootstrapState\('realtime-invitation-confirmed'/, 'La aceptación remota sin raíces pendientes no publica el estado confirmado.');
assert.match(realtimeMethod, /acceptedInvitationSnapshotSpaceIds\(state, cleanSpaceId, sessionContext\.userId\)/, 'La aceptación remota no incluye proyectos legacy vinculados al usuario actual.');
assert.match(realtimeMethod, /assertAcceptedInvitationReplicaState\(/, 'La aceptación remota no usa la validación común de réplica.');
assert.match(realtimeMethod, /recoveryRequirements: this\.recoveryRequirements/, 'La aceptación remota ignora el watermark de recuperación local.');
assert.match(realtimeMethod, /allowReplicaPending: true/, 'La aceptación remota bloquearía la cola antes de recibir el snapshot que debe completarla.');
assert.match(realtimeMethod, /P2P_REALTIME_INVITATION_REPLICA_UNCONFIRMED/, 'La aceptación puede confirmarse sin comprobar una réplica recuperable.');

const acceptedBranchStart = realtimeMethod.indexOf('      if (requiresSnapshotRecovery) {');
const acceptedBranchEnd = realtimeMethod.indexOf('      } else {', acceptedBranchStart);
assert.ok(acceptedBranchStart >= 0 && acceptedBranchEnd > acceptedBranchStart);
const acceptedBranch = realtimeMethod.slice(acceptedBranchStart, acceptedBranchEnd);
assert.doesNotMatch(acceptedBranch, /\.catch\(/, 'La recuperación crítica de una invitación aceptada todavía absorbe el fallo y permite avanzar el ACK.');

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
assert.match(responseMethod, /requestSnapshots: 'initial-clone'/, 'El dispositivo que acepta no solicita una clonación inicial dirigida.');
assert.match(responseMethod, /snapshotSpaceIds: recoverySpaceIds/, 'La aceptación local no dirige el snapshot a los proyectos internos del panel.');
assert.match(responseMethod, /acceptedInvitationSnapshotSpaceIds\(state, acceptedSpaceId, sessionContext\.userId\)/, 'La aceptación local no incluye proyectos legacy vinculados al usuario actual.');
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
assert.match(responseMethod, /await this\.persistParticipationHydration\(data, sessionContext\)/, 'La aceptación local no conserva el manifiesto autoritativo recibido antes del primer bootstrap.');
assert.match(responseMethod, /this\.applyCommittedControlState\(committedControlState, \{[\s\S]*source: 'local-invitation-response',[\s\S]*dispatch: canonicalDecision !== 'accept'[\s\S]*\}\)/, 'La aceptación local todavía publica la concesión provisional antes de registrar la clonación.');
assert.match(responseMethod, /await this\.refreshBootstrap\(\{ requestSnapshots: false, dispatchState: false \}\)/, 'La aceptación local todavía expone el bootstrap intermedio a la interfaz.');
assert.match(responseMethod, /snapshotSpaceIds: recoverySpaceIds,[\s\S]*dispatchState: true/, 'La aceptación local no publica el estado posterior a la clonación dirigida.');
assert.match(responseMethod, /this\.emitBootstrapState\('local-invitation-confirmed'/, 'La aceptación local sin raíces pendientes no publica el estado confirmado.');

assert.match(clientSource, /async refreshBootstrap\(\{ requestSnapshots = false, snapshotSpaceIds = \[\], dispatchState = true \} = \{\}\)/, 'El bootstrap no permite retener el estado intermedio durante una clonación dirigida.');
assert.match(clientSource, /if \(dispatchState !== false\) this\.emitBootstrapState\('bootstrap-refresh'\)/, 'El bootstrap ignora la publicación diferida de la interfaz.');
assert.match(clientSource, /pendingReplicaSpaceIds/, 'El bootstrap no preserva el bloqueo mientras la revisión local está atrasada.');
assert.match(clientSource, /recoveryEligibleSpaceIds\(/, 'La recuperación excluye precisamente el proyecto aceptado que debe recibir el snapshot.');
assert.match(clientSource, /const spaceIds = this\.recoveryEligibleSpaceIds\(\)/, 'La reconciliación posterior al snapshot no lee la revisión de los proyectos todavía bloqueados.');
assert.match(clientSource, /appliedStateRevisions: localStateRevisions/, 'Un watermark ya satisfecho puede quedar persistido y bloquear la promoción después de reiniciar.');
assert.match(clientSource, /recoveryRequirement > localStateRevision/, 'Un watermark satisfecho todavía se interpreta como réplica pendiente.');
assert.match(clientSource, /membershipUnconfirmed/, 'El modo de recuperación no distingue una réplica atrasada de una membresía desconocida.');
assert.match(clientSource, /isMembershipAuthorizationUnconfirmedSpace\(/, 'Las operaciones todavía usan el marcador de réplica atrasada como si fuera una membresía desconocida.');
assert.match(clientSource, /allowStaleSource = request\.allowStaleSource === true && recoveryReason === 'initial_clone'/, 'La fuente no reconoce la concesión limitada de clonación inicial.');
assert.match(clientSource, /const sourceRevisionUnavailable = allowStaleSource\s*\? false\s*:/, 'La fuente de clonación inicial todavía se descarta cuando termina de publicar su outbox después de emitirse la concesión.');
assert.match(clientSource, /if \(!allowStaleSource && sourceStateRevision !== requestedStateRevision\)/, 'Las recuperaciones normales dejaron de exigir coincidencia exacta con la revisión autorizada.');
const backendSynchronizationSource = fs.readFileSync(path.resolve(root, '..', 'memoriaBACKEND', 'P2P_SINCRONIZACIONx', 'BLOQUE', 'synchronization.js'), 'utf8');
assert.match(backendSynchronizationSource, /latestStateRevisions = await getSpaceStateRevisions\(\[spaceId\]\)/, 'memoriaBACKEND no revalida una fuente adelantada contra el watermark vigente.');
assert.match(backendSynchronizationSource, /sourceStateRevision <= latestAuthoritativeRevision/, 'memoriaBACKEND podría aceptar una copia todavía no confirmada por el estado autoritativo.');
assert.match(backendSynchronizationSource, /authorizedStateRevision/, 'La ampliación segura de la concesión no se conserva durante los fragmentos del snapshot.');
assert.match(backendSynchronizationSource, /KEEPTTL: true/, 'La ampliación de la concesión puede renovar indebidamente la ventana temporal del snapshot.');
assert.match(clientSource, /!this\.isSpaceAuthorizationConfirmed\(cleanSpaceId\)[\s\S]*!this\.isSpaceReplicaRecoveryPending\(cleanSpaceId\)/, 'La réplica aceptada no puede solicitar su clave cifrada y queda bloqueada antes de aplicar el snapshot.');
assert.match(clientSource, /confirmRecoveredReplicaAuthorization\(/, 'No existe promoción durable después de completar la réplica.');
assert.match(clientSource, /p2p:replica-recovery-confirmed/, 'La interfaz no recibe la transición que habilita la edición.');

const appSource = fs.readFileSync(path.join(root, 'src', 'js', 'app.js'), 'utf8');
assert.match(appSource, /result\?\.accessRevoked === true/, 'La interfaz no distingue una aceptación seguida por revocación.');
assert.match(appSource, /result\?\.replicaPending === true/, 'La interfaz presenta como lista una invitación cuya réplica sigue en recuperación.');
assert.match(appSource, /invite\.acceptedAccessRevoked/, 'Falta el mensaje de estado para una aceptación ya revocada.');
assert.match(appSource, /invite\.acceptedSyncing/, 'Falta el mensaje de recuperación posterior a la aceptación.');
assert.match(appSource, /function isAuthorizationUnconfirmed\(space = null\) \{ return isMembershipAuthorizationUnconfirmed\(space\); \}/, 'La interfaz todavía deshabilita acciones por una réplica autorizada que solo está convergiendo.');
assert.match(appSource, /authorizationUnconfirmed \|\| replicaRecoveryPending/, 'La interfaz perdió el indicador visual de sincronización al habilitar el clon inicial.');
assert.match(appSource, /p2p:replica-recovery-pending/);
assert.match(appSource, /p2p:replica-recovery-confirmed/);
assert.match(appSource, /pendingPanelExpectedProjectSpaceIds\(/, 'La interfaz no calcula qué proyectos autorizados debe hidratar antes de abrir el panel.');
assert.match(appSource, /expectedSpaceIds\.every\(\(spaceId\) => state\.projects\.has\(spaceId\)\)/, 'La interfaz no espera todas las raíces autorizadas del panel.');
const refreshProjectsStart = appSource.indexOf('async function refreshProjects() {');
const refreshProjectsEnd = appSource.indexOf('\nfunction renderPortfolioMetrics', refreshProjectsStart);
const refreshProjectsMethod = appSource.slice(refreshProjectsStart, refreshProjectsEnd);
assert.match(refreshProjectsMethod, /pendingPanelIsHydrated\(state\.pendingPanelId\)/, 'El panel pendiente todavía se activa antes de hidratar sus cards.');
assert.match(refreshProjectsMethod, /state\.pendingPanelId = '';/, 'El panel pendiente no se consume después de completar su hidratación.');
const applyStateStart = appSource.indexOf('function applyP2PState(nextState = {})');
const applyStateEnd = appSource.indexOf('\nasync function loadPublicConfig', applyStateStart);
const applyStateMethod = appSource.slice(applyStateStart, applyStateEnd);
assert.match(applyStateMethod, /const projectsReady = refreshProjects\(\)/, 'La aplicación del bootstrap no expone cuándo termina de reconstruir los proyectos.');
assert.match(applyStateMethod, /return projectsReady;/, 'El flujo de aceptación no puede esperar la hidratación de las cards.');
const appResponseStart = appSource.indexOf('async function respondInvitation(event) {');
const appResponseEnd = appSource.indexOf('\nfunction renderLocalNetworkStatus', appResponseStart);
const appResponseMethod = appSource.slice(appResponseStart, appResponseEnd);
assert.match(appResponseMethod, /await applyP2PState\(semillaP2P\.bootstrapState\);[\s\S]*showDashboard\(\);/, 'El panel se muestra antes de terminar de cargar sus proyectos internos.');

const missingRootsMethodStart = clientSource.indexOf('  async recoverMissingProjectRoots(');
const missingRootsMethodEnd = clientSource.indexOf('\n  async recoverOnline()', missingRootsMethodStart);
assert.ok(missingRootsMethodStart >= 0 && missingRootsMethodEnd > missingRootsMethodStart, 'No se encontró la recuperación explícita de raíces faltantes.');
const missingRootsMethod = clientSource.slice(missingRootsMethodStart, missingRootsMethodEnd);
assert.match(missingRootsMethod, /requestSnapshots: 'initial-clone'/, 'La recuperación tardía de una raíz faltante debe aceptar la mejor copia disponible y converger después.');
assert.doesNotMatch(missingRootsMethod, /requestSnapshots: 'force'/, 'La recuperación de una raíz ausente no debe exigir una fuente ya actualizada antes de permitir el clon inicial.');

console.log('OK: una invitación aceptada obtiene una clonación inicial dirigida, conserva bloqueadas las membresías desconocidas y permite trabajar sobre la mejor copia validada mientras converge.');
