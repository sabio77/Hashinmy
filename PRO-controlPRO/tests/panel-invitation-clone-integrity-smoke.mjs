import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const appSource = fs.readFileSync(path.join(root, 'src/js/app.js'), 'utf8');
const clientSource = fs.readFileSync(path.join(root, 'src/js/p2p-client.js'), 'utf8');

const responseHelperStart = appSource.indexOf('async function respondToInvitationOnce(');
const responseHelperEnd = appSource.indexOf('\nasync function autoAcceptInheritedPortfolioInvitations(', responseHelperStart);
assert.ok(responseHelperStart >= 0 && responseHelperEnd > responseHelperStart, 'No se encontró la exclusión de respuestas duplicadas de invitación.');

const responseModuleSource = `
const state = { invitationResponseTasks: new Map() };
const responseCalls = [];
let activeResponse = null;
const semillaP2P = {
  respondToInvitation(invitationId, decision, options) {
    responseCalls.push({ invitationId, decision, options });
    if (!activeResponse) activeResponse = new Promise((resolve) => { globalThis.__resolveInvitationResponse = resolve; });
    return activeResponse;
  }
};
${appSource.slice(responseHelperStart, responseHelperEnd)}
export { state, responseCalls, respondToInvitationOnce };
`;
const responseModule = await import(
  `data:text/javascript;base64,${Buffer.from(responseModuleSource).toString('base64')}#panel-invitation-response-once`
);
const first = responseModule.respondToInvitationOnce('inv_1', 'accept', { prepareCloneRecovery: false });
const second = responseModule.respondToInvitationOnce('inv_1', 'accept');
const conflicting = responseModule.respondToInvitationOnce('inv_1', 'reject');
assert.equal(responseModule.responseCalls.length, 1, 'Dos rutas concurrentes enviaron más de una respuesta para la misma invitación.');
assert.deepEqual(responseModule.responseCalls[0], {
  invitationId: 'inv_1',
  decision: 'accept',
  options: { prepareCloneRecovery: false }
}, 'La exclusión compartida no propagó la preparación coordinada de la clonación.');
globalThis.__resolveInvitationResponse({ invitation: { invitationId: 'inv_1', status: 'accepted' } });
assert.deepEqual(await Promise.all([first, second, conflicting]), [
  { invitation: { invitationId: 'inv_1', status: 'accepted' } },
  { invitation: { invitationId: 'inv_1', status: 'accepted' } },
  { invitation: { invitationId: 'inv_1', status: 'accepted' } }
]);
assert.equal(responseModule.state.invitationResponseTasks.size, 0, 'La exclusión de invitaciones dejó una tarea cerrada retenida en memoria.');

const busyStart = appSource.indexOf('function setP2PBusy(value) {');
const busyEnd = appSource.indexOf('\nfunction setConnectionState(', busyStart);
assert.ok(busyStart >= 0 && busyEnd > busyStart, 'No se encontró la liberación del bloqueo de mutaciones P2P.');
const busySource = appSource.slice(busyStart, busyEnd);
assert.match(
  busySource,
  /wasBusy && !state\.p2pBusy[\s\S]*autoAcceptableInheritedPortfolioInvitations\(\)\.length[\s\S]*autoAcceptInheritedPortfolioInvitations\(\{ source: 'busy-cleared' \}\)/,
  'Las invitaciones heredadas pueden agotar sus temporizadores mientras la aceptación principal continúa ocupada.'
);

const automaticStart = appSource.indexOf('function autoAcceptableInheritedPortfolioInvitations(');
const automaticEnd = appSource.indexOf('\nfunction memberLabel(', automaticStart);
assert.ok(automaticStart >= 0 && automaticEnd > automaticStart, 'No se encontró el autoaceptado recuperable de invitaciones heredadas.');
const automaticSource = appSource.slice(automaticStart, automaticEnd);
assert.match(
  automaticSource,
  /if \(state\.portfolioInviteAccepting \|\| state\.p2pBusy\) \{[\s\S]*schedulePortfolioInviteRetry/,
  'El autoaceptado descarta la invitación descubierta mientras la aceptación manual todavía está ocupada.'
);
assert.match(
  automaticSource,
  /portfolioInviteRetryAttempts[\s\S]*PORTFOLIO_INVITE_RETRY_MAX_ATTEMPTS/,
  'Los reintentos heredados no están acotados y podrían convertirse en polling permanente.'
);
assert.doesNotMatch(
  automaticSource,
  /semillaP2P\.respondToInvitation\(/,
  'El autoaceptado evita la exclusión compartida y llama directamente al backend.'
);
assert.match(
  automaticSource,
  /prepareInvitationCloneSpaces\([\s\S]*invitationSpaceId[\s\S]*inherited-project-invitation/,
  'Un proyecto heredado descubierto después del panel conserva residuos de una clonación anterior.'
);
assert.match(
  automaticSource,
  /respondToInvitationOnce\(invitation\.invitationId, 'accept', \{ prepareCloneRecovery: false \}\)/,
  'El autoaceptado no reutiliza la preparación dirigida ya realizada para ese proyecto.'
);
assert.match(
  automaticSource,
  /finally \{[\s\S]*const remaining = autoAcceptableInheritedPortfolioInvitations\(\);[\s\S]*schedulePortfolioInviteRetry/,
  'Las invitaciones que aparecen durante applyP2PState vuelven a perderse al cerrar el autoaceptado.'
);
assert.match(
  automaticSource,
  /await applyP2PState\(semillaP2P\.bootstrapState\);/,
  'El estado del autoaceptado se aplica sin esperar y puede competir con la hidratación del panel.'
);

const preparationStart = appSource.indexOf('async function prepareInvitationCloneSpaces(');
const preparationEnd = appSource.indexOf('\nasync function prepareInvitationCloneAttempt(', preparationStart);
assert.ok(preparationStart >= 0 && preparationEnd > preparationStart, 'No se encontró la limpieza incremental por espacio de clonación.');
const preparationSource = appSource.slice(preparationStart, preparationEnd);
assert.match(preparationSource, /state\.panelClonePreparationPromise \|\| Promise\.resolve\(\)/, 'Dos limpiezas concurrentes pueden volver a cruzarse.');
assert.match(preparationSource, /!state\.panelClonePreparedSpaceIds\.has\(spaceId\)/, 'La limpieza no distingue espacios nuevos de espacios con snapshot parcial válido.');
assert.match(preparationSource, /semillaP2P\.prepareInvitationCloneRecovery\(pendingSpaceIds\)/, 'La limpieza incremental no llega al transporte e IndexedDB.');
assert.match(preparationSource, /panelClonePreparedSpaceIds\.add\(spaceId\)/, 'Un espacio limpio puede volver a borrarse en cada reintento.');

const recoveryStart = appSource.indexOf('async function recoverMissingProjectCards(');
const recoveryEnd = appSource.indexOf('\nasync function refreshProjects(', recoveryStart);
assert.ok(recoveryStart >= 0 && recoveryEnd > recoveryStart, 'No se encontró la recuperación de proyectos faltantes.');
const recoverySource = appSource.slice(recoveryStart, recoveryEnd);
assert.match(
  recoverySource,
  /await prepareInvitationCloneSpaces\(candidates,[\s\S]*await semillaP2P\.recoverMissingProjectRoots\(candidates\)/,
  'La recuperación solicita otra copia antes de limpiar sesiones incompletas, fuentes rechazadas y watermarks del proyecto.'
);

const manualStart = appSource.indexOf('async function respondInvitation(event) {');
const manualEnd = appSource.indexOf('\nfunction renderLocalNetworkStatus(', manualStart);
assert.ok(manualStart >= 0 && manualEnd > manualStart, 'No se encontró la aceptación manual de invitaciones.');
const manualSource = appSource.slice(manualStart, manualEnd);
assert.equal(
  (manualSource.match(/await prepareInvitationCloneAttempt\(invitation, related\)/g) || []).length,
  1,
  'La aceptación manual no establece una única frontera de limpieza para el panel completo.'
);
assert.match(
  manualSource,
  /respondToInvitationOnce\(invitationId, decision, \{ prepareCloneRecovery: decision !== 'accept' \}\)/,
  'La invitación principal vuelve a limpiar el transporte después de preparar la clonación completa.'
);
assert.match(
  manualSource,
  /respondToInvitationOnce\(item\.invitationId, decision, \{ prepareCloneRecovery: decision !== 'accept' \}\)/,
  'Las invitaciones heredadas vuelven a limpiar snapshots parciales de la clonación principal.'
);

const cloneHelperStart = clientSource.indexOf('export function requiredInitialCloneEntityIds(');
const cloneHelperEnd = clientSource.indexOf('\nexport function initialCloneCanonicalPendingEntityIds(', cloneHelperStart);
assert.ok(cloneHelperStart >= 0 && cloneHelperEnd > cloneHelperStart, 'No se encontró la validación de entidades obligatorias de la clonación inicial.');
const cloneModule = await import(
  `data:text/javascript;base64,${Buffer.from(`${clientSource.slice(cloneHelperStart, cloneHelperEnd)}`).toString('base64')}#initial-clone-required-entities`
);

const projectSpace = { resourceType: 'admin.project', permissionProfile: 'admin-project-v1' };
assert.deepEqual(
  cloneModule.requiredInitialCloneEntityIds(projectSpace),
  ['admin.project:project'],
  'Un proyecto administrativo no exige su entidad raíz antes de responder la clonación.'
);
assert.deepEqual(
  cloneModule.missingRequiredInitialCloneEntityIds(projectSpace, []),
  ['admin.project:project'],
  'Una réplica vacía fue considerada una fuente completa del proyecto.'
);
assert.deepEqual(
  cloneModule.missingRequiredInitialCloneEntityIds(projectSpace, [
    { entityType: 'admin.project', entityId: 'project', deleted: false }
  ]),
  [],
  'Una réplica con la raíz real del proyecto fue rechazada incorrectamente.'
);
assert.deepEqual(
  cloneModule.requiredInitialCloneEntityIds({
    requiredSnapshotEntities: [
      { entityType: 'custom.root', entityId: 'main' },
      { entityType: 'custom.root', entityId: 'main' },
      { entityType: 'custom.meta', entityId: 'settings' }
    ]
  }),
  ['custom.meta:settings', 'custom.root:main'],
  'La semilla no respeta entidades raíz explícitas para otras aplicaciones.'
);

const sendSnapshotStart = clientSource.indexOf('  async sendSnapshot(requestEvent = {}, options = {}) {');
const sendSnapshotEnd = clientSource.indexOf('\n  async ensurePushSubscriptionForCurrentVapidKey(', sendSnapshotStart);
assert.ok(sendSnapshotStart >= 0 && sendSnapshotEnd > sendSnapshotStart, 'No se encontró el envío de snapshots.');
const sendSnapshotSource = clientSource.slice(sendSnapshotStart, sendSnapshotEnd);
assert.match(
  sendSnapshotSource,
  /missingRequiredInitialCloneEntityIds\(sourceSpace, entities\)/,
  'El envío no valida las raíces obligatorias contra la copia canónica local.'
);
assert.match(
  sendSnapshotSource,
  /dispatch\('p2p:snapshot-source-required-entity-missing'/,
  'La réplica incompleta no deja un diagnóstico específico para recuperación.'
);
assert.match(
  sendSnapshotSource,
  /if \(missingRequiredEntityIds\.length\) \{[\s\S]*scheduleInitialCloneSnapshotRetry[\s\S]*return false;/,
  'Una réplica sin raíz todavía puede cerrar un snapshot vacío como si fuera completo.'
);

console.log('OK: la aceptación se serializa y una réplica sin la raíz del proyecto no puede completar una clonación inicial vacía.');
