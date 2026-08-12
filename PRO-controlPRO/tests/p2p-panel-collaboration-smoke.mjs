import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  PANEL_INVITATION_RESOURCE_TYPE,
  aggregatePanelMembers,
  buildProjectPanels,
  groupPendingInvitations,
  panelDisplayName
} from '../src/js/panel-domain.js';

const owner = { userId: 'owner-1', displayName: 'Propietario', email: 'owner@example.com' };
const guest = { userId: 'guest-1', displayName: 'Invitado', email: 'guest@example.com' };
const project = (spaceId, ownerUserId, members, name, updatedAt) => ({
  space: { spaceId, ownerUserId, members },
  project: { name, updatedAt, isTrashed: false },
  metrics: { totalCapital: 100, totalPurchases: 25, availableCapital: 75 }
});

const ownerMember = { userId: owner.userId, role: 'owner', permissions: ['read', 'add', 'delete', 'projection', 'invite'], profile: owner };
const guestMember = { userId: guest.userId, role: 'member', permissions: ['read', 'add'], profile: guest };

const panelsForGuest = buildProjectPanels([
  project('a', owner.userId, [ownerMember, guestMember], 'Uno', '2026-08-10T10:00:00Z'),
  project('b', owner.userId, [ownerMember, guestMember], 'Dos', '2026-08-10T11:00:00Z'),
  project('self', guest.userId, [{ ...guestMember, role: 'owner' }], 'Propio', '2026-08-10T09:00:00Z')
], guest);

assert.equal(panelsForGuest.length, 2, 'los proyectos del mismo propietario deben agruparse en un solo panel');
assert.equal(panelsForGuest[0].isOwn, true, 'el panel propio debe mostrarse primero');
const invitedPanel = panelsForGuest.find((panel) => panel.ownerUserId === owner.userId);
assert.equal(invitedPanel.projects.length, 2, 'los dos proyectos invitados deben aparecer dentro del mismo panel');
assert.equal(panelDisplayName(invitedPanel, guest), 'Propietario');
assert.equal(aggregatePanelMembers(invitedPanel).find((member) => member.userId === guest.userId).projectSpaceIds.length, 2);

const pendingAcceptedSpace = {
  spaceId: 'pending-c',
  ownerUserId: owner.userId,
  resourceType: 'admin.project',
  authorizationState: 'unconfirmed',
  authorizationPendingReason: 'replica_recovery',
  updatedAt: '2026-08-10T12:00:00Z',
  members: [ownerMember, guestMember]
};
const panelsDuringRecovery = buildProjectPanels([], guest, { spaces: [pendingAcceptedSpace] });
const recoveringPanel = panelsDuringRecovery.find((panel) => panel.ownerUserId === owner.userId);
assert.ok(recoveringPanel, 'aceptar una invitación debe materializar inmediatamente la card del panel aunque la raíz cifrada siga recuperándose');
assert.equal(recoveringPanel.projects.length, 0);
assert.equal(recoveringPanel.pendingSpaces.length, 1, 'el espacio aceptado debe permanecer visible como proyecto en sincronización');
assert.equal(aggregatePanelMembers(recoveringPanel).find((member) => member.userId === guest.userId).projectSpaceIds[0], 'pending-c', 'abandonar panel debe incluir también espacios aceptados cuya raíz aún está llegando');

const groups = groupPendingInvitations([
  { invitationId: 'i1', inviterUserId: owner.userId, inviter: owner, resourceType: PANEL_INVITATION_RESOURCE_TYPE, status: 'pending' },
  { invitationId: 'i2', inviterUserId: owner.userId, inviter: owner, resourceType: PANEL_INVITATION_RESOURCE_TYPE, status: 'pending' },
  { invitationId: 'i3', inviterUserId: owner.userId, inviter: owner, resourceType: 'admin.project', status: 'pending' }
]);
assert.equal(groups.length, 2, 'una invitación completa de panel debe consolidarse sin mezclar una invitación de proyecto');
assert.equal(groups.find((group) => group.kind === 'panel').invitations.length, 2);
console.log('OK: paneles por propietario, participantes agregados e invitaciones completas consolidadas sin alterar los espacios P2P por proyecto.');

const appSource = readFileSync(fileURLToPath(new URL('../src/js/app.js', import.meta.url)), 'utf8');
const indexSource = readFileSync(fileURLToPath(new URL('../index.html', import.meta.url)), 'utf8');
const p2pClientSource = readFileSync(fileURLToPath(new URL('../src/js/p2p-client.js', import.meta.url)), 'utf8');
for (const marker of ['renderPanelDirectory', 'openPanelAccessManagement', 'revoke-panel', 'leave-panel', 'data-invitation-group-id']) {
  assert.ok(appSource.includes(marker), `app.js debe conectar la colaboración por panel: ${marker}`);
}
for (const marker of ['P2P_INVITATION_RECIPIENT_MEMBER', 'panelPartialSent', 'panelResponsePartial']) {
  assert.ok(appSource.includes(marker), `la colaboración por panel debe tolerar proyectos ya compartidos y respuestas parciales: ${marker}`);
}
assert.match(appSource, /if \(Number\(error\?\.status \|\| 0\) === 409 && error\?\.code === 'P2P_INVITATION_RECIPIENT_MEMBER'\)[\s\S]*alreadyMembers \+= 1;[\s\S]*continue;/, 'un proyecto donde el destinatario ya es miembro no debe abortar la invitación de los demás proyectos del panel');
assert.match(appSource, /const failures = \[\];[\s\S]*for \(const invitation of group\.invitations\)[\s\S]*failures\.push\(\{ invitationId: invitation\.invitationId, error \}\);/, 'una respuesta fallida de un proyecto no debe impedir procesar las demás invitaciones agrupadas del panel');
for (const marker of ['back-to-panels-button', 'panel-invite-button', 'panel-members-button', 'panel-leave-button']) {
  assert.ok(indexSource.includes(marker), `index.html debe exponer el control de panel: ${marker}`);
}

assert.ok(p2pClientSource.includes("snapshotSpaceIds: acceptedSpaceId ? [acceptedSpaceId] : []"), 'aceptar localmente debe solicitar snapshot solo del espacio recién autorizado');
assert.ok(p2pClientSource.includes("snapshotSpaceIds: cleanSpaceId ? [cleanSpaceId] : []"), 'la aceptación recibida en tiempo real debe recuperar solo el espacio afectado');
assert.match(
  p2pClientSource,
  /async leave\(spaceId = ''\)[\s\S]*!this\.isSpaceAuthorizationConfirmed\(cleanSpaceId\)[\s\S]*!this\.isSpaceReplicaRecoveryPending\(cleanSpaceId\)[\s\S]*this\.assertSpaceAuthorizationConfirmed\(cleanSpaceId\)/,
  'un invitado debe poder abandonar un proyecto/panel mientras la membresía ya está confirmada y solo falta recuperar la réplica'
);

assert.match(appSource, /const invitationIds = \[\];[\s\S]*requireBatchRelease: true[\s\S]*invitationIds\.push\(result\.invitation\.invitationId\)[\s\S]*if \(!failures\.length && invitationIds\.length\)[\s\S]*releaseInvitationBatch\(invitationIds\)/, 'el panel debe marcar sus invitaciones como lote y no liberar ninguna notificación hasta que todos los proyectos se hayan preparado sin fallos');
assert.ok(p2pClientSource.includes('requireBatchRelease: options.requireBatchRelease === true'), 'el cliente debe conservar explícitamente la política de liberación por lote');
assert.ok(p2pClientSource.includes("/api/p2p/invitations/release-batch"), 'el cliente P2P debe exponer la liberación del lote preparado');
