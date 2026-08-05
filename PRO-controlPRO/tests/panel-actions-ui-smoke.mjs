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
assert.match(appSource, /scope: 'panel'[\s\S]*?panelId: panel\.id/, 'Cada panel real invitado debe construir su menú contextual propio.');
assert.match(appSource, /spaceUserCan\(space, 'invite'\)[\s\S]*?menuActionButton\('invite-panel'/, 'Invitar solo debe mostrarse con el permiso correspondiente.');
assert.match(appSource, /menuActionButton\('leave-panel'/, 'El menú debe exponer Abandonar panel.');
assert.match(appSource, /await semillaP2P\.leave\(panel\.space\.spaceId\)/, 'Abandonar panel debe usar la operación autoritativa existente del cliente P2P.');
assert.match(appSource, /if \(targetSpace && !spaceUserCan\(targetSpace, 'invite'\)\) return;/, 'El formulario de invitación debe quedar protegido incluso si se intenta abrir por otra ruta.');
assert.match(appSource, /return \['member'\];/, 'Un rol personalizado con invitar solo debe poder conceder un rol personalizado.');
assert.match(css, /\.panel-switcher-card > \.panel-context-menu-button/, 'El botón de tres puntos debe estar integrado visualmente en la card del panel.');

for (const language of ['es', 'en', 'ar']) {
  const messages = JSON.parse(fs.readFileSync(path.join(root, `textX/app/${language}.json`), 'utf8'));
  assert.ok(messages.invite?.invite, `El idioma ${language} debe traducir el permiso invitar.`);
  assert.ok(messages.actions?.panelMenu, `El idioma ${language} debe traducir el menú del panel.`);
  assert.ok(messages.actions?.leavePanel, `El idioma ${language} debe traducir Abandonar panel.`);
  assert.ok(messages.actions?.leavePanelConfirm, `El idioma ${language} debe traducir la confirmación de abandono.`);
}

console.log('OK: los paneles invitados tienen menú seguro, abandono autoritativo e invitación gobernada por permiso.');
