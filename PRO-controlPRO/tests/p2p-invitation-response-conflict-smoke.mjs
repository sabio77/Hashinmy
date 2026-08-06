import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const clientSource = fs.readFileSync(path.join(root, 'src/js/p2p-client.js'), 'utf8');
const storageSource = fs.readFileSync(path.join(root, 'src/js/p2p-storage.js'), 'utf8');

const conflictStart = clientSource.indexOf('export function isRecoverableInvitationResponseConflict(');
const conflictEnd = clientSource.indexOf('\nfunction normalizeInvitationCollection(', conflictStart);
assert.ok(conflictStart >= 0 && conflictEnd > conflictStart, 'No se encontró la convergencia idempotente posterior a un 409.');
const helperPreamble = `
function resolveCanonicalInvitationDecision(invitation = {}, requestedDecision = '') {
  const status = String(invitation?.status || '').trim().toLowerCase();
  if (status === 'accepted') return 'accept';
  if (status === 'rejected') return 'reject';
  return String(requestedDecision || '').trim().toLowerCase() === 'reject' ? 'reject' : 'accept';
}
function normalizeSnapshotSpaceIds(values = [], maximum = 1000) {
  return Array.from(new Set((Array.isArray(values) ? values : [])
    .map((value) => String(value || '').trim())
    .filter(Boolean))).slice(0, Math.max(0, Number(maximum || 0)) || 1000);
}
`;
const conflictHelpers = await import(`data:text/javascript;base64,${Buffer.from(
  helperPreamble
    + clientSource.slice(conflictStart, conflictEnd).replaceAll('export function', 'function')
    + '\nexport { isRecoverableInvitationResponseConflict, canonicalInvitationFromBootstrap, invitationResponseBootstrapIsComplete, invitationResponseConflictDelay };'
).toString('base64')}#invitation-conflict-helpers`);

assert.equal(conflictHelpers.isRecoverableInvitationResponseConflict({
  status: 409,
  code: 'P2P_INVITATION_RESPONSE_IN_PROGRESS'
}), true);
assert.equal(conflictHelpers.isRecoverableInvitationResponseConflict({
  status: 409,
  message: 'Otra solicitud equivalente ya se está procesando. Inténtalo nuevamente.'
}), true, 'El cliente nuevo no es compatible con el mensaje del backend anterior.');
assert.equal(conflictHelpers.isRecoverableInvitationResponseConflict({
  status: 409,
  code: 'P2P_PORTFOLIO_ACCESS_REVOKED'
}), false, 'Un conflicto real de autorización fue ocultado como una carrera recuperable.');
assert.equal(conflictHelpers.canonicalInvitationFromBootstrap({
  invitations: {
    received: [{ invitationId: 'inv_1', status: 'accepted' }],
    sent: [{ invitationId: 'inv_2', status: 'pending' }]
  }
}, 'inv_1')?.status, 'accepted');


const portfolioInvitation = {
  invitationId: 'inv_portfolio',
  status: 'accepted',
  decision: 'accept',
  resourceType: 'admin.portfolio',
  accessScope: 'portfolio',
  spaceId: 'portfolio_1'
};
assert.equal(conflictHelpers.invitationResponseBootstrapIsComplete({
  spaces: [{ spaceId: 'portfolio_1', projectInventoryRevision: 1 }],
  portfolioHydration: []
}, portfolioInvitation, 'accept'), false, 'La aceptación del panel se cerró antes de recibir su manifiesto de proyectos.');
assert.equal(conflictHelpers.invitationResponseBootstrapIsComplete({
  spaces: [{ spaceId: 'portfolio_1', projectInventoryRevision: 1 }],
  portfolioHydration: [{
    portfolioSpaceId: 'portfolio_1',
    expectedProjectSpaceIds: ['project_1'],
    expectedProjectCount: 1,
    inventoryRevision: 1,
    complete: true,
    authoritative: false
  }]
}, portfolioInvitation, 'accept'), false, 'Un manifiesto local no autoritativo cerró prematuramente la carrera del 409.');
assert.equal(conflictHelpers.invitationResponseBootstrapIsComplete({
  spaces: [{ spaceId: 'portfolio_1', projectInventoryRevision: 1 }],
  portfolioHydration: [{
    portfolioSpaceId: 'portfolio_1',
    expectedProjectSpaceIds: ['project_1'],
    expectedProjectCount: 1,
    inventoryRevision: 1,
    complete: true,
    authoritative: true
  }]
}, portfolioInvitation, 'accept'), false, 'El panel se confirmó aunque uno de sus proyectos esperados todavía no estaba autorizado.');
assert.equal(conflictHelpers.invitationResponseBootstrapIsComplete({
  spaces: [{ spaceId: 'portfolio_1', projectInventoryRevision: 2 }, { spaceId: 'project_1' }],
  portfolioHydration: [{
    portfolioSpaceId: 'portfolio_1',
    expectedProjectSpaceIds: ['project_1'],
    expectedProjectCount: 1,
    inventoryRevision: 1,
    complete: true,
    authoritative: true
  }]
}, portfolioInvitation, 'accept'), false, 'Un manifiesto autoritativo anterior se aceptó aunque el inventario del panel ya había avanzado.');
assert.equal(conflictHelpers.invitationResponseBootstrapIsComplete({
  spaces: [{ spaceId: 'portfolio_1', projectInventoryRevision: 1 }, { spaceId: 'project_1' }],
  portfolioHydration: [{
    portfolioSpaceId: 'portfolio_1',
    expectedProjectSpaceIds: ['project_1'],
    expectedProjectCount: 1,
    inventoryRevision: 1,
    complete: true,
    authoritative: true
  }]
}, portfolioInvitation, 'accept'), true, 'El manifiesto autoritativo completo no liberó la aceptación del panel.');
assert.equal(conflictHelpers.invitationResponseBootstrapIsComplete({
  spaces: [{ spaceId: 'project_direct' }]
}, {
  status: 'accepted',
  resourceType: 'admin.project',
  accessScope: 'project',
  spaceId: 'project_direct'
}, 'accept'), true, 'Una invitación directa a proyecto quedó esperando un manifiesto de panel que no aplica.');

assert.equal(conflictHelpers.invitationResponseConflictDelay(0, { retryAfterSeconds: 1 }), 1000, 'Retry-After del 409 no gobierna la primera espera.');
assert.equal(conflictHelpers.invitationResponseConflictDelay(6, null), 1500, 'El backoff del 409 no queda acotado.');

const responseStart = clientSource.indexOf("  async respondToInvitation(invitationId = '', decision = 'accept', options = {}) {");
const responseEnd = clientSource.indexOf('\n  async leave(', responseStart);
assert.ok(responseStart >= 0 && responseEnd > responseStart, 'No se encontró la respuesta de invitación del cliente.');
const responseMethod = clientSource.slice(responseStart, responseEnd);
assert.match(responseMethod, /catch \(error\) \{[\s\S]*isRecoverableInvitationResponseConflict\(error\)/);
assert.match(responseMethod, /refreshBootstrap\(\{ requestSnapshots: false, dispatchState: false \}\)/);
assert.match(responseMethod, /canonicalInvitationFromBootstrap\(convergedState, invitationId\)/);
assert.match(responseMethod, /recoveredResponseConflict: true/);
assert.match(responseMethod, /invitationResponseBootstrapIsComplete\(convergedState, invitation, canonicalDecision\)/, 'El 409 se considera resuelto sin comprobar que el panel y todos sus proyectos ya convergieron.');
assert.match(responseMethod, /for \(let attempt = 0; attempt < 10; attempt \+= 1\)/, 'La convergencia sigue agotándose antes de una operación lenta normal.');
assert.match(responseMethod, /waitForInvitationResponseConflict\(attempt, conflictError\)/, 'El cliente ignora Retry-After en conflictos recuperables.');
assert.match(responseMethod, /if \(!\[1, 3, 5, 7, 9\]\.includes\(attempt\)\) continue;/, 'No existe un reenvío idempotente acotado cuando el bloqueo quedó huérfano.');
assert.ok((responseMethod.match(/apiPost\('\/api\/p2p\/invitations\/respond'/g) || []).length >= 2, 'El 409 pendiente nunca reintenta la operación idempotente.');
assert.match(responseMethod, /if \(!data\) throw conflictError;/, 'Se vuelve a lanzar un 409 antiguo aunque un reintento más reciente cambie el diagnóstico.');
assert.match(
  responseMethod,
  /if \(options\?\.prepareCloneRecovery !== false\) \{[\s\S]*await this\.prepareInvitationCloneRecovery\(recoverySpaceIds\);[\s\S]*\}/,
  'La clonación no permite reutilizar una limpieza coordinada sin volver a borrar snapshots parciales.'
);
assert.match(
  responseMethod,
  /state = await this\.refreshBootstrap\(\{[\s\S]*requestSnapshots: 'initial-clone',[\s\S]*snapshotSpaceIds: recoverySpaceIds/,
  'Omitir la limpieza coordinada también omitió la solicitud del snapshot inicial.'
);

const cleanupStart = clientSource.indexOf('  async prepareInvitationCloneRecovery(spaceIds = []) {');
const cleanupEnd = clientSource.indexOf('\n  async recoverMissingProjectRoots(', cleanupStart);
assert.ok(cleanupStart >= 0 && cleanupEnd > cleanupStart, 'No se encontró la limpieza dirigida antes de clonar.');
const cleanupMethod = clientSource.slice(cleanupStart, cleanupEnd);
assert.match(cleanupMethod, /this\.rejectedSnapshotSources\.delete\(spaceId\)/);
assert.match(cleanupMethod, /this\.clearInitialCloneSnapshotRetry\(requestId\)/);
assert.match(cleanupMethod, /this\.pendingLocalSnapshotRequests\.delete\(requestId\)/, 'Una solicitud LAN anterior puede bloquear la clonación directa del mismo espacio.');
assert.match(cleanupMethod, /this\.nextBootstrapSnapshotSpaceIds = queuedSnapshotSpaceIds\.filter/, 'Una recuperación bootstrap ya en cola sobrevive a la nueva frontera de clonación.');
assert.match(cleanupMethod, /this\.pendingReplicaHealthSpaceIds\.delete\(spaceId\)/, 'Una comprobación de salud obsoleta puede competir con la construcción del panel.');
assert.match(cleanupMethod, /this\.snapshotRecoveryRequired = Object\.keys\(this\.recoveryRequirements\)\.length > 0/);
assert.match(cleanupMethod, /if \(!this\.snapshotRecoveryRequired\) this\.clearSnapshotRecovery\(\)/, 'El temporizador global de recuperación queda abierto después de retirar su último requisito.');
assert.match(cleanupMethod, /resetInvitationCloneRecoveryState\(normalizedSpaceIds\)/);
assert.match(cleanupMethod, /snapshotRequests:[\s\S]*filter/);

const storageCleanupStart = storageSource.indexOf('export async function resetInvitationCloneRecoveryState(');
const storageCleanupEnd = storageSource.indexOf('\nfunction normalizePendingSpaceCreation(', storageCleanupStart);
assert.ok(storageCleanupStart >= 0 && storageCleanupEnd > storageCleanupStart, 'IndexedDB no expone una limpieza dirigida para la clonación.');
const storageCleanup = storageSource.slice(storageCleanupStart, storageCleanupEnd);
assert.match(storageCleanup, /STORES\.snapshots, STORES\.meta/);
assert.match(storageCleanup, /targetSpaceIds\.has\(snapshotRecordSpaceId\(record\)\)/);
assert.match(storageCleanup, /delete recoveryRequirements\[spaceId\]/);
assert.doesNotMatch(storageCleanup, /STORES\.entities|STORES\.outbox/, 'La preparación limpia datos administrativos válidos además de residuos de transporte.');

console.log('OK: un 409 concurrente espera la herencia autoritativa completa y cada clon empieza sin exclusiones, solicitudes LAN, colas, fragmentos ni watermarks obsoletos.');
