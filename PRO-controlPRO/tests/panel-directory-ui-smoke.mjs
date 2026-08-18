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
  'function showPanelDirectory(options = {})',
  "state.selectedPanelOwnerUserId = panelOwnerUserId(data.space) || state.selectedPanelOwnerUserId",
  "if (!directoryWasRequired && panelDirectoryRequired()) state.selectedPanelOwnerUserId = ''",
  "elements.backToPanelsButton?.addEventListener('click', () => requestAppNavigationBack(() => showPanelDirectory({ historyMode: 'replace' })))",
  "elements.backButton?.addEventListener('click', () => requestAppNavigationBack(() => showDashboard({ historyMode: 'replace' })))",
  "window.addEventListener('popstate', handleAppNavigationPopState)",
  "window.history.pushState(historyState, '')",
  "window.history.replaceState(historyState, '')",
  "applicationId: P2P_APPLICATION_ID",
  "sessionId: state.navigationSessionId",
  "level: 'project'",
  "level: 'panel'",
  "level: 'directory'",
  "hasDirectoryParent: panelDirectoryRequired()",
  'function ensurePanelDirectoryHistoryParent(',
  "navigation.level === 'directory' && !panelDirectoryRequired()",
  'sameNavigationDescriptor(activeNavigation, navigation)',
  "delete elements.dashboardView.dataset.dashboardMode"
]) {
  if (!app.includes(needle)) throw new Error(`La navegación panel→proyectos perdió el contrato: ${needle}`);
}


const historyStart = app.indexOf("function rawAppNavigationHistoryState(");
const historyEnd = app.indexOf('\nfunction applyP2PState', historyStart);
if (historyStart < 0 || historyEnd <= historyStart) throw new Error('No se pudo aislar la navegación integrada con History API.');
const historyNavigation = app.slice(historyStart, historyEnd);
for (const needle of [
  "if (!rawNavigation) return;",
  "if (!navigation) {",
  "window.history.back();",
  "restoreNavigationHistoryState(navigation)",
  "panelOwnerIdsWithAccess().includes(ownerUserId)",
  "panelIsComplete(ownerUserId)",
  "ensurePanelDirectoryHistoryParent(navigation)",
  "synchronizeNavigationHistory(options.historyMode || 'push')"
]) {
  if (!historyNavigation.includes(needle)) throw new Error(`La navegación Atrás perdió una protección obligatoria: ${needle}`);
}
if (historyNavigation.includes('event.preventDefault()')) {
  throw new Error('La vista raíz no debe cancelar el Back normal de Chrome/PWA.');
}

const panelCardStart = app.indexOf("function createPanelCard(ownerUserId = '', projects = []) {");
const panelCardEnd = app.indexOf('\nfunction configureDashboardChrome', panelCardStart);
if (panelCardStart < 0 || panelCardEnd <= panelCardStart) throw new Error('No se pudo aislar createPanelCard().');
const panelCard = app.slice(panelCardStart, panelCardEnd);
if (panelCard.includes('createProjectCard(')) throw new Error('La card de panel volvió a incrustar cards de proyectos en la lista principal.');
if (!panelCard.includes('panelAvatarNode(ownerUserId, projects)')) throw new Error('La card de panel dejó de incluir la identidad visual del propietario.');

const ownerAccessStart = app.indexOf('function panelOwnerIdsWithAccess() {');
const ownerAccessEnd = app.indexOf('\nfunction panelDirectoryRequired()', ownerAccessStart);
if (ownerAccessStart < 0 || ownerAccessEnd <= ownerAccessStart) throw new Error('No se pudo aislar panelOwnerIdsWithAccess().');
const ownerAccess = app.slice(ownerAccessStart, ownerAccessEnd);
if (ownerAccess.includes('state.p2pState.invitations')) {
  throw new Error('El directorio volvió a considerar invitaciones históricas aceptadas como acceso vigente y puede dejar paneles fantasma tras abandonar o revocar.');
}
for (const source of ['state.p2pState.spaces', 'state.projects.values()']) {
  if (!ownerAccess.includes(source)) throw new Error(`El acceso vigente a paneles dejó de derivarse de ${source}.`);
}

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
  'body:has(#dashboard-view[data-dashboard-mode="panel-directory"]:not(.hidden))',
  '.workspace:has(#dashboard-view[data-dashboard-mode="panel-directory"]:not(.hidden))',
  '.portfolio-panel-open',
  '.panel-owner-avatar',
  '.panel-context-bar',
  '.panel-directory-syncing'
]) {
  if (!css.includes(needle)) throw new Error(`Falta el tratamiento visual diferenciado de paneles: ${needle}`);
}

if (!/<meta\s+name=["']color-scheme["']\s+content=["']light["']\s*\/>/i.test(html)) {
  throw new Error('La app debe declarar una base clara estable para que el tema del sistema no oscurezca las vistas fuera de Paneles.');
}
if (!/:root\s*\{[\s\S]*?color-scheme:\s*light\s*;/.test(css)) {
  throw new Error('La hoja principal debe fijar color-scheme: light en la raíz.');
}
if (/@media\s*\(prefers-color-scheme:\s*dark\)/.test(css)) {
  throw new Error('El modo oscuro del sistema volvió a afectar globalmente la app; el oscuro debe permanecer aislado al directorio de paneles.');
}
if (!/#dashboard-view\[data-dashboard-mode=["']panel-directory["']\]\s*\{[^}]*color-scheme:\s*dark\s*;/.test(css)) {
  throw new Error('El directorio de paneles debe conservar su esquema oscuro local aunque el resto de la app sea claro.');
}

for (const key of ['directoryEyebrow', 'directoryTitle', 'directoryDescription', 'backToPanels', 'syncingCount']) {
  if (!es.includes(`"${key}"`)) throw new Error(`Falta texto de producción para la navegación de paneles: ${key}`);
}

console.log('OK: el directorio de paneles activa una superficie oscura completa y contextual; al salir, la base clara, navegación, avatar y limpieza de accesos permanecen intactos.');
