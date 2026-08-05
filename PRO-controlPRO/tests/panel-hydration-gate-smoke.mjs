import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const currentFile = fileURLToPath(import.meta.url);
const root = path.resolve(path.dirname(currentFile), '..');
const domainSource = fs.readFileSync(path.join(root, 'src', 'js', 'project-domain.js'), 'utf8');
const clientSource = fs.readFileSync(path.join(root, 'src', 'js', 'p2p-client.js'), 'utf8');
const appSource = fs.readFileSync(path.join(root, 'src', 'js', 'app.js'), 'utf8');

const cleanTextStart = domainSource.indexOf('export function cleanText(');
const cleanTextEnd = domainSource.indexOf('\nexport function localDateValue', cleanTextStart);
const membershipStart = domainSource.indexOf('export function memberForUser(');
const membershipEnd = domainSource.indexOf('\nexport function individualRecordAccess', membershipStart);
const hydrationStart = domainSource.indexOf('export function sharedOwnerPanelId(');
const hydrationEnd = domainSource.indexOf('\nfunction projectOwnerProfile', hydrationStart);
assert.ok(cleanTextStart >= 0 && cleanTextEnd > cleanTextStart);
assert.ok(membershipStart >= 0 && membershipEnd > membershipStart);
assert.ok(hydrationStart >= 0 && hydrationEnd > hydrationStart);

const domainModuleSource = [
  "const PROJECT_ENTITY_TYPE = 'admin.project';",
  "const COLLABORATION_ROLES = Object.freeze(['manager', 'admin', 'individual', 'member']);",
  domainSource.slice(cleanTextStart, cleanTextEnd),
  domainSource.slice(membershipStart, membershipEnd),
  domainSource.slice(hydrationStart, hydrationEnd),
  'export { invitedPortfolioHydrationStatus, panelRequiresAuthoritativeHydration };'
].join('\n').replaceAll('export function', 'function');
const domain = await import(`data:text/javascript;base64,${Buffer.from(domainModuleSource).toString('base64')}#panel-hydration-domain`);

const guestUserId = 'user_guest';
const panelId = 'portfolio_1';
const member = { userId: guestUserId, role: 'member', permissions: ['read'], accessScope: 'portfolio' };
const spaces = [
  { spaceId: panelId, resourceType: 'admin.portfolio', ownerUserId: 'user_owner', members: [member], projectInventoryRevision: 7 },
  { spaceId: 'project_1', resourceType: 'admin.project', governanceSpaceId: panelId, ownerUserId: 'user_owner', members: [member] },
  { spaceId: 'project_2', resourceType: 'admin.project', governanceSpaceId: panelId, ownerUserId: 'user_owner', members: [member] }
];
const completeManifest = [{
  portfolioSpaceId: panelId,
  expectedProjectSpaceIds: ['project_2', 'project_1', 'project_2'],
  inventoryRevision: 7,
  complete: true
}];

const partial = domain.invitedPortfolioHydrationStatus({
  spaces,
  panelId,
  currentUserId: guestUserId,
  portfolioHydration: completeManifest,
  loadedProjectSpaceIds: ['project_1']
});
assert.equal(partial.ready, false);
assert.equal(partial.reason, 'project_roots_missing');
assert.deepEqual(partial.expectedProjectSpaceIds, ['project_1', 'project_2']);
assert.deepEqual(partial.missingProjectSpaceIds, ['project_2']);

const ready = domain.invitedPortfolioHydrationStatus({
  spaces,
  panelId,
  currentUserId: guestUserId,
  portfolioHydration: completeManifest,
  loadedProjectSpaceIds: ['project_2', 'project_1']
});
assert.equal(ready.ready, true);
assert.equal(ready.reason, 'ready');
assert.equal(ready.portfolioRootLoaded, true);
assert.equal(ready.inventoryRevisionMatches, true);
assert.equal(ready.projectInventoryMatches, true);
assert.deepEqual(ready.authoritativeProjectSpaceIds, ['project_1', 'project_2']);
assert.deepEqual(ready.controlProjectSpaceIds, ['project_1', 'project_2']);

const legacySpaces = [
  { spaceId: panelId, resourceType: 'admin.portfolio', ownerUserId: 'user_owner', members: [member], projectInventoryRevision: 0 },
  { spaceId: 'legacy_1', resourceType: 'admin.project', governanceSpaceId: '', ownerUserId: 'user_owner', members: [member] },
  { spaceId: 'legacy_2', resourceType: 'admin.project', governanceSpaceId: '', ownerUserId: 'user_owner', members: [member] },
  { spaceId: 'legacy_3', resourceType: 'admin.project', governanceSpaceId: '', ownerUserId: 'user_owner', members: [member] }
];
const legacyManifest = [{
  portfolioSpaceId: panelId,
  expectedProjectSpaceIds: [],
  inventoryRevision: 0,
  complete: true
}];
const legacyReady = domain.invitedPortfolioHydrationStatus({
  spaces: legacySpaces,
  panelId,
  currentUserId: guestUserId,
  portfolioHydration: legacyManifest,
  loadedProjectSpaceIds: ['legacy_1', 'legacy_2', 'legacy_3']
});
assert.equal(legacyReady.ready, true, 'Los proyectos anteriores al panel con concesión portfolio no pueden quedar bloqueados por un manifiesto administrado vacío.');
assert.equal(legacyReady.projectInventoryMatches, true);
assert.deepEqual(legacyReady.authoritativeProjectSpaceIds, []);
assert.deepEqual(legacyReady.legacyProjectSpaceIds, ['legacy_1', 'legacy_2', 'legacy_3']);
assert.deepEqual(legacyReady.unexpectedProjectSpaceIds, []);

const legacyReplicaPending = domain.invitedPortfolioHydrationStatus({
  spaces: legacySpaces.map((space) => space.spaceId === 'legacy_2'
    ? { ...space, authorizationState: 'unconfirmed', authorizationPendingReason: 'replica_recovery' }
    : space),
  panelId,
  currentUserId: guestUserId,
  portfolioHydration: legacyManifest,
  loadedProjectSpaceIds: ['legacy_1', 'legacy_2', 'legacy_3']
});
assert.equal(legacyReplicaPending.ready, false);
assert.equal(legacyReplicaPending.reason, 'project_replica_unconfirmed');
assert.deepEqual(legacyReplicaPending.pendingProjectAuthorizationSpaceIds, ['legacy_2']);

const ambiguousLegacyPanel = domain.invitedPortfolioHydrationStatus({
  spaces: [
    ...legacySpaces,
    { spaceId: 'portfolio_2', resourceType: 'admin.portfolio', ownerUserId: 'user_owner', members: [member], projectInventoryRevision: 0 }
  ],
  panelId,
  currentUserId: guestUserId,
  portfolioHydration: legacyManifest,
  loadedProjectSpaceIds: ['legacy_1', 'legacy_2', 'legacy_3']
});
assert.equal(ambiguousLegacyPanel.ready, false, 'Un proyecto legacy sin vínculo persistido no puede mezclarse automáticamente entre dos paneles del mismo propietario.');
assert.equal(ambiguousLegacyPanel.reason, 'project_inventory_set_mismatch');
assert.deepEqual(ambiguousLegacyPanel.legacyProjectSpaceIds, []);
assert.deepEqual(ambiguousLegacyPanel.unexpectedProjectSpaceIds, ['legacy_1', 'legacy_2', 'legacy_3']);

const explicitlyBoundLegacyPanel = domain.invitedPortfolioHydrationStatus({
  spaces: [
    ...legacySpaces,
    { spaceId: 'portfolio_2', resourceType: 'admin.portfolio', ownerUserId: 'user_owner', members: [member], projectInventoryRevision: 0 }
  ],
  projects: legacySpaces.slice(1).map((space) => ({
    space,
    project: { portfolioSpaceId: panelId }
  })),
  panelId,
  currentUserId: guestUserId,
  portfolioHydration: legacyManifest,
  loadedProjectSpaceIds: ['legacy_1', 'legacy_2', 'legacy_3']
});
assert.equal(explicitlyBoundLegacyPanel.ready, true, 'El vínculo persistido de la entidad debe resolver de forma segura la coexistencia de varios paneles del mismo propietario.');
assert.deepEqual(explicitlyBoundLegacyPanel.legacyProjectSpaceIds, ['legacy_1', 'legacy_2', 'legacy_3']);

const panelWithUnexpectedProject = domain.invitedPortfolioHydrationStatus({
  spaces: [
    ...spaces,
    { spaceId: 'project_stale', resourceType: 'admin.project', governanceSpaceId: panelId, ownerUserId: 'user_owner', members: [member] }
  ],
  panelId,
  currentUserId: guestUserId,
  portfolioHydration: completeManifest,
  loadedProjectSpaceIds: ['project_1', 'project_2', 'project_stale']
});
assert.equal(panelWithUnexpectedProject.ready, false, 'La card no puede mostrar un inventario local con proyectos adicionales que no existen en el panel autoritativo.');
assert.equal(panelWithUnexpectedProject.reason, 'project_inventory_set_mismatch');
assert.equal(panelWithUnexpectedProject.projectInventoryMatches, false);
assert.deepEqual(panelWithUnexpectedProject.authoritativeProjectSpaceIds, ['project_1', 'project_2']);
assert.deepEqual(panelWithUnexpectedProject.controlProjectSpaceIds, ['project_1', 'project_2', 'project_stale']);
assert.deepEqual(panelWithUnexpectedProject.unexpectedProjectSpaceIds, ['project_stale']);
assert.deepEqual(panelWithUnexpectedProject.absentControlProjectSpaceIds, []);

const staleInventory = domain.invitedPortfolioHydrationStatus({
  spaces,
  panelId,
  currentUserId: guestUserId,
  portfolioHydration: [{ ...completeManifest[0], inventoryRevision: 6 }],
  loadedProjectSpaceIds: ['project_2', 'project_1']
});
assert.equal(staleInventory.ready, false, 'Una card no puede usar un manifiesto anterior a la revisión vigente del panel.');
assert.equal(staleInventory.reason, 'portfolio_inventory_revision_mismatch');
assert.equal(staleInventory.manifestInventoryRevision, 6);
assert.equal(staleInventory.portfolioInventoryRevision, 7);

const unconfirmedProjectReplica = domain.invitedPortfolioHydrationStatus({
  spaces: spaces.map((space) => space.spaceId === 'project_2'
    ? { ...space, authorizationState: 'unconfirmed', authorizationPendingReason: 'replica_recovery' }
    : space),
  panelId,
  currentUserId: guestUserId,
  portfolioHydration: completeManifest,
  loadedProjectSpaceIds: ['project_2', 'project_1']
});
assert.equal(unconfirmedProjectReplica.ready, false, 'Una raíz existente no demuestra que compras, ingresos y proyecciones hayan alcanzado la revisión autoritativa.');
assert.equal(unconfirmedProjectReplica.reason, 'project_replica_unconfirmed');
assert.deepEqual(unconfirmedProjectReplica.pendingProjectAuthorizationSpaceIds, ['project_2']);

const virtualPartialPanel = domain.invitedPortfolioHydrationStatus({
  spaces: spaces.slice(1),
  panelId,
  currentUserId: guestUserId,
  portfolioHydration: completeManifest,
  loadedProjectSpaceIds: ['project_1', 'project_2']
});
assert.equal(virtualPartialPanel.ready, false);
assert.equal(virtualPartialPanel.portfolioRootLoaded, false);
assert.equal(virtualPartialPanel.reason, 'portfolio_root_missing');

assert.equal(domain.panelRequiresAuthoritativeHydration({
  panel: { id: panelId, type: 'shared-portfolio', owned: false },
  portfolioHydration: completeManifest
}), true, 'Un panel virtual con manifiesto autoritativo no puede eludir la barrera global.');
assert.equal(domain.panelRequiresAuthoritativeHydration({
  panel: { id: panelId, type: 'shared-portfolio', owned: false },
  portfolioHydration: [],
  pendingAuthoritativePanel: true
}), true, 'La aceptación local de un panel debe bloquear su card antes de recibir el manifiesto.');
assert.equal(domain.panelRequiresAuthoritativeHydration({
  panel: { id: panelId, type: 'shared-portfolio', owned: false },
  portfolioHydration: [],
  pendingAuthoritativePanel: false
}), false, 'Una invitación individual de proyecto no debe quedar esperando un manifiesto de panel inexistente.');

const incompleteComparison = domain.invitedPortfolioHydrationStatus({
  spaces,
  panelId,
  currentUserId: guestUserId,
  portfolioHydration: [{ ...completeManifest[0], complete: false }],
  loadedProjectSpaceIds: ['project_1', 'project_2']
});
assert.equal(incompleteComparison.ready, false);
assert.equal(incompleteComparison.reason, 'authoritative_comparison_incomplete');

const missingManifest = domain.invitedPortfolioHydrationStatus({
  spaces,
  panelId,
  currentUserId: guestUserId,
  portfolioHydration: [],
  loadedProjectSpaceIds: ['project_1', 'project_2']
});
assert.equal(missingManifest.ready, false);
assert.equal(missingManifest.reason, 'authoritative_manifest_missing');

const recoveryStart = appSource.indexOf('function panelRecoveryProgress(');
const recoveryEnd = appSource.indexOf('\nfunction reportIncompleteInvitedPanel', recoveryStart);
assert.ok(recoveryStart >= 0 && recoveryEnd > recoveryStart);
const recoveryModuleSource = `
const state = {
  p2pState: { snapshotRequests: [{ spaceId: 'project_3' }, { spaceId: 'other_project' }] },
  pendingAuthoritativePanelIds: new Set(['${panelId}'])
};
${appSource.slice(recoveryStart, recoveryEnd)}
export { panelRecoveryProgress, panelIsRecovering };
`;
const recoveryUi = await import(`data:text/javascript;base64,${Buffer.from(recoveryModuleSource).toString('base64')}#panel-recovery-ui`);
const recoveryProgress = recoveryUi.panelRecoveryProgress({
  expectedProjectSpaceIds: ['project_1', 'project_2', 'project_3', 'project_4'],
  authorizedProjectSpaceIds: ['project_1', 'project_2'],
  loadedProjectSpaceIds: ['project_1', 'project_2', 'project_3', 'project_4'],
  pendingProjectAuthorizationSpaceIds: ['project_3', 'project_4']
});
assert.equal(recoveryProgress.ready, 2);
assert.equal(recoveryProgress.total, 4);
assert.deepEqual(recoveryProgress.pendingProjectSpaceIds, ['project_3', 'project_4']);
assert.deepEqual(recoveryProgress.activeSnapshotSpaceIds, ['project_3']);
assert.equal(recoveryUi.panelIsRecovering({ id: panelId }, { reason: 'project_replica_unconfirmed' }), true);
assert.equal(recoveryUi.panelIsRecovering({ id: panelId }, { reason: 'project_roots_missing' }), true);
assert.equal(recoveryUi.panelIsRecovering({ id: panelId }, { reason: 'portfolio_inventory_revision_mismatch' }), false, 'Una divergencia de revisión no puede degradarse a estado transitorio.');

const normalizeStart = clientSource.indexOf('export function normalizeSnapshotSpaceIds(');
const normalizeEnd = clientSource.indexOf('\nfunction createId(', normalizeStart);
assert.ok(normalizeStart >= 0 && normalizeEnd > normalizeStart);
const clientModuleSource = `${clientSource.slice(normalizeStart, normalizeEnd).replaceAll('export function', 'function')}
export { normalizePortfolioHydrationManifests };`;
const client = await import(`data:text/javascript;base64,${Buffer.from(clientModuleSource).toString('base64')}#panel-hydration-client`);
assert.deepEqual(client.normalizePortfolioHydrationManifests([
  { portfolioSpaceId: panelId, expectedProjectSpaceIds: ['project_2', 'project_1', 'project_2'], inventoryRevision: 7, complete: true }
]), [{
  portfolioSpaceId: panelId,
  expectedProjectSpaceIds: ['project_1', 'project_2'],
  expectedProjectCount: 2,
  inventoryRevision: 7,
  complete: true
}]);

assert.match(clientSource, /PORTFOLIO_HYDRATION_META_KEY/);
assert.match(clientSource, /getMeta\(PORTFOLIO_HYDRATION_META_KEY, \[\]\)/, 'El manifiesto no se recupera para uso local-first.');
assert.match(clientSource, /metaEntries: \[\{ key: PORTFOLIO_HYDRATION_META_KEY, value: portfolioHydration \}\]/, 'El manifiesto autoritativo no participa del commit atómico del bootstrap.');
assert.match(clientSource, /participationReconciliation\?\.portfolioHydration/, 'El cliente ignora la comparación entregada por memoriaBACKEND.');

assert.match(appSource, /function allPanelScopes\(\)/);
assert.match(appSource, /function panelNeedsAuthoritativeHydration\(panel = null\)/);
assert.match(appSource, /pendingAuthoritativePanelIds: new Set\(\)/, 'Falta recordar paneles aceptados antes de que llegue el manifiesto.');
assert.match(appSource, /projects: \[\.\.\.state\.projects\.values\(\)\]/, 'La barrera no recibe la asociación persistida necesaria para distinguir proyectos legacy entre varios paneles.');
assert.match(appSource, /if \(!panelNeedsAuthoritativeHydration\(panel\)\) return true;/, 'Los paneles virtuales todavía pueden saltarse la barrera autoritativa.');
assert.match(appSource, /if \(!status\.ready\) \{[\s\S]*reportIncompleteInvitedPanel\(panel, status\);[\s\S]*return false;/, 'La card invitada todavía se renderiza cuando faltan proyectos.');
assert.match(appSource, /console\.error\('\[P2P_PANEL_INCOMPLETO\]/, 'Falta el error de consola exigido para una carga parcial.');
assert.match(appSource, /snapshotRequests: Array\.isArray\(nextState\.snapshotRequests\)/, 'La interfaz descarta las solicitudes activas de snapshot y no puede explicar la recuperación.');
assert.match(appSource, /console\.info\('\[P2P_PANEL_SINCRONIZANDO\]/, 'Una recuperación esperada todavía se reporta como error duro.');
assert.match(appSource, /status\?\.reason === 'project_replica_unconfirmed'/, 'La réplica no confirmada debe reconocerse como transición segura de sincronización.');
assert.match(appSource, /card\.dataset\.syncing = 'true'/, 'La card del panel no muestra el estado transitorio de sincronización.');
assert.match(appSource, /button\.disabled = recovering/, 'La card en recuperación todavía puede activarse antes de validar todas las réplicas.');
assert.match(appSource, /button\.setAttribute\('aria-busy', 'true'\)/, 'La card en recuperación no expone su estado a tecnologías de asistencia.');
assert.match(appSource, /if \(!button \|\| button\.disabled \|\| button\.getAttribute\('aria-busy'\) === 'true'\) return;/, 'El delegado de clic no protege cards en recuperación.');
assert.match(appSource, /portfolioRootLoaded: status\?\.portfolioRootLoaded === true/, 'El diagnóstico no informa cuando falta la raíz administrativa del panel.');
assert.match(appSource, /inventoryRevisionMatches: status\?\.inventoryRevisionMatches === true/, 'El diagnóstico no informa la divergencia entre el panel y su manifiesto.');
assert.match(appSource, /projectInventoryMatches: status\?\.projectInventoryMatches === true/, 'El diagnóstico no informa si el conjunto de proyectos difiere del inventario autoritativo.');
assert.match(appSource, /unexpectedProjectSpaceIds: status\?\.unexpectedProjectSpaceIds \|\| \[\]/, 'El diagnóstico no identifica proyectos sobrantes o desactualizados.');
assert.match(appSource, /legacyProjectSpaceIds: status\?\.legacyProjectSpaceIds \|\| \[\]/, 'El diagnóstico no distingue las concesiones legacy válidas del inventario administrado.');
assert.match(appSource, /pendingProjectAuthorizationSpaceIds: status\?\.pendingProjectAuthorizationSpaceIds \|\| \[\]/, 'El diagnóstico no informa qué réplicas siguen sin confirmación autoritativa.');
assert.match(appSource, /portfolioHydration: Array\.isArray\(nextState\.portfolioHydration\)/, 'La interfaz descarta el manifiesto al aplicar el estado P2P.');
assert.match(appSource, /if \(panelNeedsAuthoritativeHydration\(panel\)\) return portfolioHydrationStatus\(cleanPanelId\)\.ready;/, 'La apertura automática no usa la misma barrera autoritativa que la card.');
assert.match(appSource, /state\.pendingAuthoritativePanelIds\.add\(state\.pendingPanelId\)/, 'Aceptar un panel no activa la barrera antes del siguiente bootstrap.');
assert.match(appSource, /for \(const spaceId of revokedSpaceIds\) state\.pendingAuthoritativePanelIds\.delete\(spaceId\);/, 'Una revocación puede dejar una barrera pendiente obsoleta.');

console.log('OK: paneles reales y virtuales quedan ocultos hasta coincidir exactamente con el inventario autoritativo y cargar todas sus raíces.');
