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
assert.match(appSource, /function allPanelScopes\(\)/, 'La clasificación completa de paneles debe estar centralizada.');
assert.match(appSource, /function panelScopes\(\)/, 'La vista debe aplicar una compuerta separada sobre la clasificación autoritativa.');
assert.match(appSource, /buildProjectPanelScopes\(\{/, 'La clasificación debe usar el modelo puro que separa paneles virtuales por propietario.');
assert.match(appSource, /function projectBelongsToPortfolio\(data = null, portfolioSpace = null\)[\s\S]*?governanceSpaceId[\s\S]*?return governanceSpaceId === portfolioSpaceId/, 'La relación autoritativa governanceSpaceId debe prevalecer sobre metadatos replicados o el propietario.');
assert.match(appSource, /function portfolioForProjectSpace\(space = null\)[\s\S]*?portfolioSpaceById\(space\?\.governanceSpaceId \|\| data\?\.project\?\.portfolioSpaceId/, 'Las acciones de acceso deben resolver primero el panel gobernante autoritativo del proyecto.');
assert.match(appSource, /\['shared', 'shared-portfolio'\]\.includes/, 'Los paneles virtuales de proyectos individuales no deben habilitar acciones de panel completo.');
assert.match(appSource, /const allProjects = panelProjects[\s\S]*?item\.project\.loaded === true[\s\S]*?!item\.project\.isTrashed/, 'El dashboard debe renderizar únicamente proyectos completos del panel activo.');
assert.match(appSource, /isIncompleteInvitedPortfolio[\s\S]*?panel\.portfolioHead[\s\S]*?panel\.syncComplete !== true/, 'Un panel invitado con cabeza conocida debe permanecer fuera de la UI hasta completar todo su conjunto de proyectos.');
assert.match(appSource, /portfolioHeads: state\.p2pState\.portfolioHeads/, 'La vista debe conservar y consumir las cabezas de versión de panel entregadas por el backend.');
assert.match(appSource, /const ordered = \[\.\.\.activePanelProjects\(\)\]/, 'La papelera también debe respetar el panel activo.');
assert.match(appSource, /state\.pendingPanelId = invitation\?\.resourceType === PORTFOLIO_RESOURCE_TYPE/, 'Aceptar una invitación debe preparar la entrada automática al panel correcto.');
assert.match(appSource, /sharedOwnerPanelId\(result\?\.space\?\.ownerUserId/, 'Una invitación legacy a un proyecto debe abrir el panel virtual estable del propietario.');
assert.match(appSource, /relatedPortfolioProjectInvitations\(state\.p2pState\.invitations\?\.received/, 'Aceptar un panel debe procesar también los proyectos heredados asociados.');
assert.match(appSource, /elements\.panelList\?\.addEventListener\('click'/, 'El usuario debe poder cambiar de panel explícitamente.');
assert.match(css, /\.panel-switcher-card\[data-active="true"\]/, 'El panel activo debe distinguirse visualmente.');
for (const language of ['es', 'en', 'ar']) {
  const messages = JSON.parse(fs.readFileSync(path.join(root, `textX/app/${language}.json`), 'utf8'));
  assert.ok(messages.dashboard?.personalPanel, `El idioma ${language} debe traducir el panel personal.`);
  assert.ok(messages.dashboard?.sharedProjectsPanel, `El idioma ${language} debe traducir los proyectos compartidos.`);
  assert.ok(messages.dashboard?.invitedPanel, `El idioma ${language} debe traducir los paneles invitados.`);
  assert.ok(messages.p2p?.panelSyncPending, `El idioma ${language} debe traducir la sincronización fail-closed del panel.`);
  assert.ok(messages.p2p?.pendingProjectsTitle, `El idioma ${language} debe traducir la espera de proyectos completos.`);
}

console.log('OK: panel personal, paneles invitados y proyectos compartidos permanecen separados y navegables.');
