import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const appSource = fs.readFileSync(path.join(root, 'src/js/app.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'src/css/app.css'), 'utf8');

assert.match(html, /id="panel-switcher"/, 'La interfaz debe exponer un selector principal de paneles.');
assert.match(html, /id="panel-list"/, 'Los paneles disponibles deben tener una lista interactiva independiente de los proyectos.');
assert.match(appSource, /const PERSONAL_PANEL_ID = '__personal_panel__'/, 'El panel personal debe tener identidad estable y separada.');
assert.match(appSource, /const SHARED_PROJECTS_PANEL_ID = '__shared_projects_panel__'/, 'Las invitaciones individuales deben agruparse sin mezclarse con el panel personal.');
assert.match(appSource, /function panelScopes\(\)/, 'La clasificación de paneles debe estar centralizada.');
assert.match(appSource, /const allProjects = panelProjects[\s\S]*?\.filter\(\(item\) => !item\.project\.isTrashed\)/, 'El dashboard debe filtrar únicamente los proyectos del panel activo.');
assert.match(appSource, /const ordered = \[\.\.\.activePanelProjects\(\)\]/, 'La papelera también debe respetar el panel activo.');
assert.match(appSource, /state\.pendingPanelId = invitation\?\.resourceType === PORTFOLIO_RESOURCE_TYPE/, 'Aceptar una invitación debe preparar la entrada automática al panel correcto.');
assert.match(appSource, /relatedPortfolioProjectInvitations\(state\.p2pState\.invitations\?\.received/, 'Aceptar un panel debe procesar también los proyectos heredados asociados.');
assert.match(appSource, /elements\.panelList\?\.addEventListener\('click'/, 'El usuario debe poder cambiar de panel explícitamente.');
assert.match(css, /\.panel-switcher-card\[data-active="true"\]/, 'El panel activo debe distinguirse visualmente.');
for (const language of ['es', 'en', 'ar']) {
  const messages = JSON.parse(fs.readFileSync(path.join(root, `textX/app/${language}.json`), 'utf8'));
  assert.ok(messages.dashboard?.personalPanel, `El idioma ${language} debe traducir el panel personal.`);
  assert.ok(messages.dashboard?.sharedProjectsPanel, `El idioma ${language} debe traducir los proyectos compartidos.`);
  assert.ok(messages.dashboard?.invitedPanel, `El idioma ${language} debe traducir los paneles invitados.`);
}

console.log('OK: panel personal, paneles invitados y proyectos compartidos permanecen separados y navegables.');
