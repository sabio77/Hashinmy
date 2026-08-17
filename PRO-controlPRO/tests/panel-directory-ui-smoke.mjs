import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const [app, html, css, es] = await Promise.all([
  fs.readFile(path.resolve(here, '../src/js/app.js'), 'utf8'),
  fs.readFile(path.resolve(here, '../index.html'), 'utf8'),
  fs.readFile(path.resolve(here, '../src/css/app.css'), 'utf8'),
  fs.readFile(path.resolve(here, '../textX/app/es.json'), 'utf8')
]);

for (const needle of [
  "selectedPanelOwnerUserId: ''",
  'function panelOwnerIdsWithAccess()',
  'function panelDirectoryRequired()',
  'function panelAvatarNode(',
  "openButton.dataset.openPanel = ownerUserId",
  "configureDashboardChrome('panel-directory')",
  "configureDashboardChrome('panel-projects', ownerUserId, panelProjects)",
  'function openPanel(',
  'function showPanelDirectory()',
  "state.selectedPanelOwnerUserId = panelOwnerUserId(data.space) || state.selectedPanelOwnerUserId",
  "if (!directoryWasRequired && panelDirectoryRequired()) state.selectedPanelOwnerUserId = ''",
  "elements.backToPanelsButton?.addEventListener('click', showPanelDirectory)",
  "delete elements.dashboardView.dataset.dashboardMode"
]) {
  if (!app.includes(needle)) throw new Error(`La navegación panel→proyectos perdió el contrato: ${needle}`);
}

const panelCardStart = app.indexOf("function createPanelCard(ownerUserId = '', projects = []) {");
const panelCardEnd = app.indexOf('\nfunction configureDashboardChrome', panelCardStart);
if (panelCardStart < 0 || panelCardEnd <= panelCardStart) throw new Error('No se pudo aislar createPanelCard().');
const panelCard = app.slice(panelCardStart, panelCardEnd);
if (panelCard.includes('createProjectCard(')) throw new Error('La card de panel volvió a incrustar cards de proyectos en la lista principal.');
if (!panelCard.includes('panelAvatarNode(ownerUserId, projects)')) throw new Error('La card de panel dejó de incluir la identidad visual del propietario.');

for (const id of [
  'dashboard-heading-eyebrow',
  'dashboard-heading-title',
  'dashboard-heading-description',
  'panel-context-bar',
  'back-to-panels-button',
  'panel-context-owner',
  'panel-context-actions',
  'project-filter-toolbar'
]) {
  if (!html.includes(`id="${id}"`)) throw new Error(`Falta el control de navegación de paneles: ${id}`);
}

for (const needle of [
  '#dashboard-view[data-dashboard-mode="panel-directory"]',
  '.portfolio-panel-open',
  '.panel-owner-avatar',
  '.panel-context-bar',
  '.panel-directory-syncing'
]) {
  if (!css.includes(needle)) throw new Error(`Falta el tratamiento visual diferenciado de paneles: ${needle}`);
}

for (const key of ['directoryEyebrow', 'directoryTitle', 'directoryDescription', 'backToPanels', 'syncingCount']) {
  if (!es.includes(`"${key}"`)) throw new Error(`Falta texto de producción para la navegación de paneles: ${key}`);
}

console.log('OK: directorio oscuro de paneles separado de proyectos, acceso directo al panel propio y avatar del propietario permanecen conectados.');
