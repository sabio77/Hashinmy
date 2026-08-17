import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const [app, client, html] = await Promise.all([
  fs.readFile(path.resolve(here, '../src/js/app.js'), 'utf8'),
  fs.readFile(path.resolve(here, '../src/js/p2p-client.js'), 'utf8'),
  fs.readFile(path.resolve(here, '../index.html'), 'utf8')
]);

for (const needle of [
  'function panelIsComplete(',
  'partiallyAcceptedPanelInvitationForOwner(',
  'function createPanelCard(',
  "invite.dataset.panelAction = 'invite'",
  'async function revokePanelParticipant(',
  'async function leavePanel(',
  'semillaP2P.respondToInvitationGroup(ids, button.dataset.decision, { auditTraceId })',
  "applyP2PState(semillaP2P.bootstrapState, { auditTraceId, source: 'invitation-response' })",
  'semillaP2P.recoverMissingProjectRoots(candidates, auditContext)',
  'async function refreshProjects(auditContext = {})',
  'function renderDashboard(auditContext = {})',
  "String(invitation.invitationScope || '').toLowerCase() === 'panel'"
]) {
  if (!app.includes(needle)) throw new Error(`La interfaz perdió la capacidad de panel: ${needle}`);
}

for (const needle of [
  "invitationAuditLog('frontend.ui.project-hydration'",
  "invitationAuditLog('frontend.ui.project-root-check'",
  "invitationAuditLog('frontend.ui.panel-visibility'",
  "auditTraceId: String(auditContext?.auditTraceId || '').trim()"
]) {
  if (!app.includes(needle)) throw new Error(`La trazabilidad de aceptación se perdió antes de renderizar el panel: ${needle}`);
}

for (const needle of [
  'async invitePanel(',
  "invitationScope: 'panel'",
  'invitationGroupId',
  'async respondToInvitationGroup(',
  'invitationGroupExpectedCount: ownedSpaces.length',
  'resumablePanelInvitationGroup(',
  'resumePlan?.invitationGroupId',
  'const resumedInvitation = resumedBySpaceId.get(space.spaceId) || null',
  'resumed: resumedBySpaceId.size > 0'
]) {
  if (!client.includes(needle)) throw new Error(`El cliente P2P perdió el contrato de invitación agrupada: ${needle}`);
}

const resumeHelperStart = client.indexOf('export function normalizeSnapshotSpaceIds(');
const resumeHelperEnd = client.indexOf('\nfunction createId(', resumeHelperStart);
if (resumeHelperStart < 0 || resumeHelperEnd <= resumeHelperStart) throw new Error('No se pudo aislar el plan de reanudación de invitaciones de panel.');
const resumeHelpers = new Function(`${client.slice(resumeHelperStart, resumeHelperEnd).replaceAll('export function ', 'function ')}\nreturn { panelInvitationManifestFingerprint, resumablePanelInvitationGroup, panelInvitationResponseRetryDelay };`)();
const requestedPanelSpaces = ['space_panel_a', 'space_panel_b', 'space_panel_c'];
const resumableGroupId = `panel_invite_${resumeHelpers.panelInvitationManifestFingerprint(requestedPanelSpaces)}_resume`;
const partialSent = [{
  invitationId: 'inv_panel_resume_1',
  spaceId: 'space_panel_a',
  invitationScope: 'panel',
  invitationGroupId: resumableGroupId,
  invitationGroupExpectedCount: 3,
  recipientEmail: 'guest@example.com',
  permissions: ['add', 'read'],
  status: 'pending',
  createdAt: '2026-08-12T20:00:00.000Z',
  updatedAt: '2026-08-12T20:00:00.000Z',
  expiresAt: '2099-08-19T20:00:00.000Z'
}];
const resumePlan = resumeHelpers.resumablePanelInvitationGroup(partialSent, {
  recipientEmail: 'GUEST@example.com',
  spaceIds: requestedPanelSpaces,
  permissions: ['read', 'add']
});
if (resumePlan?.invitationGroupId !== resumableGroupId
  || resumePlan.existingSpaceIds.join(',') !== 'space_panel_a'
  || resumePlan.missingSpaceIds.join(',') !== 'space_panel_b,space_panel_c') {
  throw new Error('Una creación parcial de panel no puede reanudarse después de recargar o cambiar de dispositivo.');
}
const permissionConflict = resumeHelpers.resumablePanelInvitationGroup(partialSent, {
  recipientEmail: 'guest@example.com',
  spaceIds: requestedPanelSpaces,
  permissions: ['read', 'delete']
});
if (permissionConflict !== null) throw new Error('La reanudación de panel reutilizó una invitación parcial con permisos incompatibles.');
const changedManifest = resumeHelpers.resumablePanelInvitationGroup(partialSent, {
  recipientEmail: 'guest@example.com',
  spaceIds: ['space_panel_a', 'space_panel_c', 'space_panel_d'],
  permissions: ['read', 'add']
});
if (changedManifest !== null) throw new Error('La reanudación automática reutilizó un grupo parcial cuyo conjunto de proyectos ya cambió.');
const explicitLegacyResume = resumeHelpers.resumablePanelInvitationGroup([{ ...partialSent[0], invitationGroupId: 'panel_resume_legacy' }], {
  recipientEmail: 'guest@example.com',
  spaceIds: requestedPanelSpaces,
  permissions: ['read', 'add'],
  invitationGroupId: 'panel_resume_legacy'
});
if (explicitLegacyResume?.invitationGroupId !== 'panel_resume_legacy') {
  throw new Error('Un diálogo aún abierto dejó de poder continuar explícitamente su grupo parcial legado.');
}

const retryablePanelResponseCases = [
  [{ status: 0 }, true],
  [{ status: 503 }, true],
  [{ status: 409, code: 'P2P_INVITATION_GROUP_RESPONSE_IN_PROGRESS' }, true],
  [{ status: 409, code: 'P2P_INVITATION_GROUP_LOCK_LOST' }, true],
  [{ status: 409, code: 'P2P_INVITATION_GROUP_INCOMPLETE' }, true],
  [{ status: 409, code: 'P2P_INVITATION_GROUP_CHANGED' }, false],
  [{ status: 409, code: 'P2P_INVITATION_GROUP_DECISION_CONFLICT' }, false],
  [{ status: 403 }, false],
  [{ status: 0, code: 'APP_SESSION_CHANGED', sessionChanged: true }, false]
];
for (const [error, expectedRetry] of retryablePanelResponseCases) {
  const delay = resumeHelpers.panelInvitationResponseRetryDelay(error, 0);
  if ((delay > 0) !== expectedRetry) {
    throw new Error(`Clasificación incorrecta al reanudar respuesta de panel: ${error.code || error.status || 'transport'}.`);
  }
}
if (resumeHelpers.panelInvitationResponseRetryDelay({ status: 429, retryAfterSeconds: 4 }, 0) !== 4000) {
  throw new Error('La reanudación del panel dejó de respetar un Retry-After corto del backend.');
}
if (resumeHelpers.panelInvitationResponseRetryDelay({ status: 429, retryAfterSeconds: 30 }, 0) !== 0) {
  throw new Error('La respuesta del panel podría bloquear la interfaz esperando un rate-limit prolongado.');
}

for (const needle of [
  'invitationGroupExpectedCount: Math.max(0, Math.floor(Number(options.invitationGroupExpectedCount || 0)))',
  'error.panelInvitationGroupId = invitationGroupId',
  'error.completedPanelInvitations = results.map((result) => result?.invitation).filter(Boolean)'
]) {
  if (!client.includes(needle)) throw new Error(`El cliente P2P perdió la recuperación segura de un panel parcialmente creado: ${needle}`);
}

for (const needle of [
  "const groupComplete = group.type !== 'panel'",
  "item.dataset.groupState = groupComplete ? 'ready' : 'preparing'",
  "const ids = groupInvitations.map((item) => item.invitationId).filter(Boolean)",
  "if (group.type === 'panel' && !groupComplete && decision !== 'reject') {",
  'button.disabled = true',
  "button.dataset.invitationIds = ids.join(',')",
  "invitationRejectLog('frontend.ui.reject-click'",
  "invitationRejectLog('frontend.ui.reject-complete'"
]) {
  if (!app.includes(needle)) throw new Error(`La interfaz perdió la protección de aceptar incompleto o la salida de rechazo: ${needle}`);
}
if (!app.includes("decision === 'reject'")) throw new Error('El botón Rechazar dejó de mantenerse disponible durante una preparación incompleta.');

const groupResponseStart = client.indexOf("  async respondToInvitationGroup(invitationIds = [], decision = 'accept', options = {}) {");
const groupResponseEnd = client.indexOf("\n  async respondToInvitation(invitationId = '', decision = 'accept', options = {}) {", groupResponseStart);
if (groupResponseStart < 0 || groupResponseEnd <= groupResponseStart) throw new Error('No se pudo aislar respondToInvitationGroup().');
const groupResponse = client.slice(groupResponseStart, groupResponseEnd);
for (const needle of [
  "apiPost('/api/p2p/invitations/respond-group'",
  'PANEL_INVITATION_RESPONSE_MAX_ATTEMPTS',
  'panelInvitationResponseRetryDelay(error, attempt)',
  "dispatch('p2p:invitation-group-resume'",
  'await saveControlStateAtomically(committedControlState)',
  'await this.applyInvitationBootstrapEscrow(',
  "await this.refreshBootstrap({ requestSnapshots: 'force'"
]) {
  if (!groupResponse.includes(needle)) throw new Error(`La respuesta de panel perdió su commit agrupado: ${needle}`);
}
if (groupResponse.includes('await this.respondToInvitation(')) throw new Error('La respuesta de panel volvió a responder proyecto por proyecto desde el cliente.');
for (const needle of [
  "const rejectingRequested = requestedDecision === 'reject'",
  "invitationRejectLog('frontend.client.group-reject-begin'",
  'const removedSpaceIds = normalizeSnapshotSpaceIds(data?.removedSpaceIds || [])',
  'await purgeLocalSpace(spaceId)',
  'await purgeSpaceCrypto(spaceId)',
  'this.removeSpaceFromBootstrapState(spaceId)',
  "invitationRejectLog('frontend.client.group-reject-complete'"
]) {
  if (!groupResponse.includes(needle)) throw new Error(`El cliente perdió la limpieza local del rechazo agrupado: ${needle}`);
}

for (const id of ['invite-dialog-title', 'invite-dialog-description', 'panel-access-dialog', 'panel-access-list', 'panel-access-status']) {
  if (!html.includes(`id="${id}"`)) throw new Error(`Falta el control de interfaz requerido: ${id}`);
}

const groupDetection = app.indexOf('const isPanelGroup = Boolean(button.dataset.invitationGroupId);');
if (groupDetection < 0) throw new Error('Un panel de un solo proyecto dejaría de tratarse como invitación de panel.');

console.log('OK: paneles propios/invitados, invitación agrupada, visibilidad completa, salida y revocación agregada permanecen conectados al flujo P2P existente.');
