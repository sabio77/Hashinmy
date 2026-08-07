import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  COLLABORATION_PERMISSIONS,
  hasPermission,
  normalizeCollaborationPermissions
} from '../src/js/project-domain.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const appSource = fs.readFileSync(path.join(root, 'src/js/app.js'), 'utf8');
const p2pClientSource = fs.readFileSync(path.join(root, 'src/js/p2p-client.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'src/css/app.css'), 'utf8');

assert.ok(COLLABORATION_PERMISSIONS.includes('invite'), 'El permiso invitar debe ser configurable para roles personalizados.');
assert.deepEqual(
  normalizeCollaborationPermissions(['read', 'invite']),
  ['read', 'invite'],
  'La normalización no debe eliminar el permiso invitar.'
);
assert.equal(hasPermission({ members: [{ userId: 'guest', role: 'member', permissions: ['read', 'invite'] }] }, 'guest', 'invite'), true);
assert.equal(hasPermission({ members: [{ userId: 'guest', role: 'member', permissions: ['read'] }] }, 'guest', 'invite'), false);

assert.match(html, /name="permission" value="invite"/, 'El formulario debe permitir conceder el permiso invitar.');
assert.match(appSource, /panel\.type === 'portfolio' && panel\.space\?\.spaceId && currentMember\(panel\.space\)[\s\S]*?scope: 'panel'[\s\S]*?panelId: panel\.id/, 'Cada panel real, propio o invitado, debe construir su menú contextual propio para sus participantes.');
assert.match(appSource, /spaceUserCan\(space, 'invite'\)[\s\S]*?menuActionButton\('invite-panel'/, 'Invitar solo debe mostrarse con el permiso correspondiente.');
assert.match(appSource, /menuActionButton\('manage-panel-access'[\s\S]*?access\.manage/, 'El menú de cada panel real debe enlazar con Participantes.');
assert.match(appSource, /menuActionButton\('leave-panel'/, 'El menú debe exponer Abandonar panel para invitados.');
assert.match(appSource, /await semillaP2P\.leave\(panel\.space\.spaceId\)/, 'Abandonar panel debe usar la operación autoritativa existente del cliente P2P.');
assert.match(appSource, /canViewPortfolioParticipants = Boolean\(portfolioSpace && currentMember\(portfolioSpace\)/, 'El botón principal Participantes debe estar disponible para cualquier miembro confirmado del panel.');
assert.match(appSource, /if \(!space \|\| isAuthorizationUnconfirmed\(space\) \|\| !currentMember\(space\)\) return;/, 'La vista de participantes debe permitir miembros confirmados sin concederles permisos administrativos.');
assert.match(appSource, /state\.accessScopeContext === 'portfolio'[\s\S]*?menuActionButton\('manage-panel-access'/, 'La administración del panel debe reutilizar el contexto de acceso existente.');
assert.match(appSource, /member\.userId === state\.user\.userId && actorRole !== 'owner'[\s\S]*?actions\.leavePanel/, 'Un invitado debe poder abandonar el panel desde su propia fila de participante.');
assert.match(appSource, /pending\.scope === 'portfolio'[\s\S]*?actions\.leftPanelSuccess/, 'La salida desde Participantes debe comunicar correctamente el abandono del panel.');
assert.match(appSource, /if \(targetSpace && !spaceUserCan\(targetSpace, 'invite'\)\) return;/, 'El formulario de invitación debe quedar protegido incluso si se intenta abrir por otra ruta.');
assert.match(appSource, /return \['member'\];/, 'Un rol personalizado con invitar solo debe poder conceder un rol personalizado.');


assert.match(appSource, /const governedProject = state\.accessScopeContext === 'project'[\s\S]*?space\.governanceSpaceId[\s\S]*?data\?\.project\?\.portfolioSpaceId/, 'La interfaz debe detectar proyectos gobernados incluso si el vínculo proviene del estado administrativo local.');
assert.match(appSource, /actorRole === 'owner' && !governedProject[\s\S]*?accessActionButton\('transfer'/, 'Un proyecto gobernado por panel no debe ofrecer una transferencia de propiedad que rompa la raíz administrativa.');
assert.match(appSource, /member\.accessScope === 'portfolio'[\s\S]*?member\.hasDirectGrant === true[\s\S]*?access\.directGrantScope/, 'Un acceso independiente preservado bajo la herencia del panel debe ser visible y distinguible en la interfaz.');
assert.match(appSource, /function canManageDirectGrant[\s\S]*?member\.directGrantRole[\s\S]*?roleRank\(actorRole\) > roleRank\(directGrantRole\)/, 'La interfaz debe autorizar la revocación independiente contra la jerarquía del grant directo, no contra el rol heredado visible.');
assert.match(appSource, /directGrantManageable[\s\S]*?accessActionButton\('revoke-direct'[\s\S]*?access\.revokeDirect/, 'El proyecto debe ofrecer una acción separada para retirar solo el grant directo sin desvincular el panel.');
assert.match(appSource, /'revoke-direct': t\('access\.revokeDirectConfirm'/, 'La confirmación debe explicar que el acceso heredado del panel continuará activo.');
assert.match(appSource, /semillaP2P\.revoke\(pending\.spaceId, pending\.userId, \{ directGrantOnly: true \}\)/, 'La acción independiente debe viajar al backend con la intención explícita directGrantOnly.');
assert.match(appSource, /action === 'revoke-direct'[\s\S]*?canManageDirectGrant\(space, member\)/, 'Una acción disparada desde estado obsoleto debe volver a pasar la jerarquía directa antes de abrir la confirmación.');
assert.match(appSource, /pending\.action === 'revoke-direct'[\s\S]*?access\.revokeDirectSuccess/, 'La interfaz debe distinguir el éxito de la revocación directa del retiro global del panel.');
assert.match(p2pClientSource, /async revoke\(spaceId = '', userId = '', options = \{\}\)[\s\S]*?directGrantOnly = options\.directGrantOnly === true/, 'El cliente debe soportar la revocación independiente sin cambiar el contrato existente.');
assert.match(p2pClientSource, /\.\.\.\(!directGrantOnly \? \[cleanSpaceId\] : \[\]\)/, 'Retirar solo el grant directo no debe rotar la clave del proyecto mientras el usuario conserve autorización heredada.');


const rolePresetStart = appSource.indexOf('function applyRolePresetToPermissionControls(');
const rolePresetEnd = appSource.indexOf('\nfunction accessPermissionEditor(', rolePresetStart);
assert.ok(rolePresetStart >= 0 && rolePresetEnd > rolePresetStart, 'No se encontró el helper de permisos del formulario de invitación.');
const rolePresetSource = appSource.slice(rolePresetStart, rolePresetEnd);
const applyRolePresetToPermissionControls = Function(
  'normalizeCollaborationRole',
  'rolePermissions',
  'roleHint',
  `${rolePresetSource}; return applyRolePresetToPermissionControls;`
)(
  (role) => role,
  (role) => role === 'manager' ? ['read', 'add', 'delete', 'projection', 'invite', 'write'] : ['read'],
  () => ''
);
const invitePermissionControls = [
  { value: 'read', checked: false, disabled: false },
  { value: 'add', checked: false, disabled: false },
  { value: 'invite', checked: false, disabled: false }
];
const invitePermissionFieldset = {
  dataset: {},
  querySelectorAll: () => invitePermissionControls
};
assert.doesNotThrow(
  () => applyRolePresetToPermissionControls(invitePermissionFieldset, 'manager'),
  'Abrir la invitación al panel no debe fallar al consultar el Set de permisos del rol.'
);
assert.deepEqual(
  invitePermissionControls.map(({ value, checked, disabled }) => ({ value, checked, disabled })),
  [
    { value: 'read', checked: true, disabled: true },
    { value: 'add', checked: true, disabled: true },
    { value: 'invite', checked: true, disabled: true }
  ],
  'El preset Gerente debe marcar y bloquear correctamente los permisos disponibles antes de abrir el diálogo.'
);
assert.match(rolePresetSource, /permissions\.has\(checkbox\.value\)/, 'Los permisos convertidos a Set deben consultarse con has(), no con includes().');
assert.doesNotMatch(rolePresetSource, /permissions\.includes\(/, 'Un Set no admite includes() y bloquearía la apertura del diálogo.');
assert.match(css, /\.panel-switcher-card > \.panel-context-menu-button/, 'El botón de tres puntos debe estar integrado visualmente en la card del panel.');

for (const language of ['es', 'en', 'ar']) {
  const messages = JSON.parse(fs.readFileSync(path.join(root, `textX/app/${language}.json`), 'utf8'));
  assert.ok(messages.invite?.invite, `El idioma ${language} debe traducir el permiso invitar.`);
  assert.ok(messages.actions?.panelMenu, `El idioma ${language} debe traducir el menú del panel.`);
  assert.ok(messages.actions?.leavePanel, `El idioma ${language} debe traducir Abandonar panel.`);
  assert.ok(messages.actions?.leavePanelConfirm, `El idioma ${language} debe traducir la confirmación de abandono.`);
  assert.ok(messages.access?.portfolioMemberDescription, `El idioma ${language} debe explicar la vista de participantes para invitados.`);
  assert.ok(messages.access?.directGrantScope, `El idioma ${language} debe identificar un acceso directo adicional.`);
  assert.ok(messages.access?.revokeDirect, `El idioma ${language} debe traducir la acción de revocar acceso directo.`);
  assert.ok(messages.access?.revokeDirectConfirm, `El idioma ${language} debe traducir la confirmación de revocación directa.`);
  assert.ok(messages.access?.revokeDirectSuccess, `El idioma ${language} debe traducir el resultado de revocación directa.`);
}

console.log('OK: los paneles y proyectos distinguen revocación global de grant directo; propietarios pueden retirar invitados sin dejar accesos independientes obsoletos.');
