import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const appSource = fs.readFileSync(path.join(root, 'src/js/app.js'), 'utf8');

const diagnosticStart = appSource.indexOf('function reportPanelCloneDiagnostic(');
const diagnosticEnd = appSource.indexOf('\nlet externalSessionQueue', diagnosticStart);
assert.ok(diagnosticStart >= 0 && diagnosticEnd > diagnosticStart, 'No se encontró el control de ruido diagnóstico de clonación.');
const diagnosticModuleSource = `
const PANEL_CLONE_DIAGNOSTIC_DEDUP_MS = 2 * 60 * 1000;
const state = { panelCloneDiagnosticSignatures: new Map() };
const logs = [];
const console = {
  info(...args) { logs.push(['info', ...args]); },
  warn(...args) { logs.push(['warn', ...args]); },
  error(...args) { logs.push(['error', ...args]); }
};
${appSource.slice(diagnosticStart, diagnosticEnd)}
export { logs, reportPanelCloneDiagnostic };
`;
const diagnostics = await import(`data:text/javascript;base64,${Buffer.from(diagnosticModuleSource).toString('base64')}#panel-clone-diagnostics`);
diagnostics.reportPanelCloneDiagnostic('recuperacion-incompleta', { spaceIds: ['project_1'], attempts: { project_1: 1 } }, 'warn');
diagnostics.reportPanelCloneDiagnostic('recuperacion-incompleta', { spaceIds: ['project_1'], attempts: { project_1: 1 } }, 'warn');
assert.equal(diagnostics.logs.length, 1, 'La misma recuperación incompleta llena la consola repetidamente dentro de la ventana de deduplicación.');
diagnostics.reportPanelCloneDiagnostic('recuperacion-incompleta', { spaceIds: ['project_1'], attempts: { project_1: 2 } }, 'warn');
assert.equal(diagnostics.logs.length, 2, 'La deduplicación ocultó un cambio real en el número de intentos.');

const persistenceStart = appSource.indexOf('function missingProjectRecoveryStorageKey(');
const activeHelperStart = appSource.indexOf('function activeSnapshotRequestSpaceIds(');
const helperStart = appSource.indexOf('function clearMissingProjectRecoveryTimer(');
const helperEnd = appSource.indexOf('\nfunction panelHydrationRecoveryInFlight(', helperStart);
assert.ok(persistenceStart >= 0 && activeHelperStart > persistenceStart, 'No se encontró el contador durable de recuperaciones.');
assert.ok(activeHelperStart >= 0 && helperStart > activeHelperStart, 'No se encontró el control de solicitudes de snapshot activas.');
assert.ok(helperStart >= 0 && helperEnd > helperStart, 'No se encontraron los reintentos dirigidos de clonación del panel.');

const persistenceSource = appSource.slice(persistenceStart, activeHelperStart);
const activeHelperSource = appSource.slice(activeHelperStart, helperStart);
const helperSource = appSource.slice(helperStart, helperEnd);
const moduleSource = `
const MISSING_PROJECT_RECOVERY_RETRY_MIN_MS = 15 * 1000;
const MISSING_PROJECT_RECOVERY_RETRY_MAX_MS = 2 * 60 * 1000;
const MISSING_PROJECT_RECOVERY_RETRY_MARGIN_MS = 1500;
const PORTFOLIO_RESOURCE_TYPE = 'admin.portfolio';
let nextTimerId = 1;
const timers = new Map();
const clearedTimers = [];
const recoveryCalls = [];
const window = {
  setTimeout(callback, delayMs) {
    const timerId = nextTimerId++;
    timers.set(timerId, { callback, delayMs });
    return timerId;
  },
  clearTimeout(timerId) {
    clearedTimers.push(timerId);
    timers.delete(timerId);
  }
};
const state = {
  user: { userId: 'guest_1' },
  p2pState: {
    spaces: [{ spaceId: 'project_1', resourceType: 'admin.project' }],
    snapshotRequests: []
  },
  projects: new Map(),
  missingProjectRecoveryAttempts: new Map(),
  missingProjectRecoveryAttemptAt: new Map(),
  missingProjectRecoveryQueuedSpaceIds: new Set(),
  missingProjectRecoveryTimer: 0,
  missingProjectRecoveryDueAt: 0,
  missingProjectRecoveryAt: new Map()
};
function getSessionToken() { return 'session'; }
function persistMissingProjectRecoveryAttempts() { return true; }
async function recoverMissingProjectCards(spaceIds, options) {
  recoveryCalls.push({ spaceIds, options });
  return true;
}
${activeHelperSource}
${helperSource}
export {
  state,
  timers,
  clearedTimers,
  recoveryCalls,
  activeSnapshotRequestSpaceIds,
  missingProjectRecoveryDelay,
  scheduleMissingProjectRecovery,
  forgetMissingProjectRecovery
};
`;

const durableModuleSource = `
const MISSING_PROJECT_RECOVERY_ATTEMPT_TTL_MS = 6 * 60 * 60 * 1000;
const state = {
  user: { userId: 'guest_1' },
  missingProjectRecoveryAttempts: new Map(),
  missingProjectRecoveryAttemptAt: new Map()
};
const stored = new Map();
const localStorage = {
  getItem(key) { return stored.has(key) ? stored.get(key) : null; },
  setItem(key, value) { stored.set(key, value); },
  removeItem(key) { stored.delete(key); }
};
function scopedStorageKey(value) { return value; }
${persistenceSource}
export { state, stored, recordMissingProjectRecoveryAttempt, restoreMissingProjectRecoveryAttempts, persistMissingProjectRecoveryAttempts };
`;
const durable = await import(`data:text/javascript;base64,${Buffer.from(durableModuleSource).toString('base64')}#panel-clone-durable`);
assert.equal(durable.recordMissingProjectRecoveryAttempt('project_reload'), 1);
assert.equal(durable.recordMissingProjectRecoveryAttempt('project_reload'), 2);
assert.equal(durable.recordMissingProjectRecoveryAttempt('project_reload'), 3);
durable.state.missingProjectRecoveryAttempts.clear();
durable.state.missingProjectRecoveryAttemptAt.clear();
assert.equal(durable.restoreMissingProjectRecoveryAttempts('guest_1'), 1);
assert.equal(
  durable.state.missingProjectRecoveryAttempts.get('project_reload'),
  3,
  'Refrescar la página reinicia el límite de tres intentos y permite un ciclo infinito.'
);

const helpers = await import(`data:text/javascript;base64,${Buffer.from(moduleSource).toString('base64')}#panel-clone-retry`);

const activeExpiresAt = new Date(Date.now() + 60_000).toISOString();
helpers.state.p2pState.snapshotRequests = [
  { requestId: 'request_active', spaceId: 'project_1', expiresAt: activeExpiresAt },
  { requestId: 'request_expired', spaceId: 'project_expired', expiresAt: new Date(Date.now() - 60_000).toISOString() }
];
assert.deepEqual(
  [...helpers.activeSnapshotRequestSpaceIds()],
  ['project_1'],
  'Una concesión de snapshot vigente no se distingue de una solicitud vencida.'
);
helpers.state.p2pState.snapshotRequests = [];

helpers.state.missingProjectRecoveryAttempts.set('project_1', 1);
assert.equal(
  helpers.missingProjectRecoveryDelay(['project_1'], []),
  15_000,
  'El primer intento sin fuente no se reprograma con rapidez.'
);
helpers.state.missingProjectRecoveryAttempts.set('project_1', 2);
assert.equal(helpers.missingProjectRecoveryDelay(['project_1'], []), 30_000);
helpers.state.missingProjectRecoveryAttempts.set('project_1', 5);
assert.equal(
  helpers.missingProjectRecoveryDelay(['project_1'], []),
  120_000,
  'El backoff de clonación supera el máximo seguro.'
);

const expiresAt = new Date(Date.now() + 60_000).toISOString();
assert.equal(helpers.scheduleMissingProjectRecovery(['project_1'], {
  snapshotRequests: [{ spaceId: 'project_1', expiresAt }]
}), true);
const scheduledTimerId = helpers.state.missingProjectRecoveryTimer;
const scheduled = helpers.timers.get(scheduledTimerId);
assert.ok(scheduled, 'No quedó un temporizador durable para volver a pedir la clonación.');
assert.ok(
  scheduled.delayMs >= 55_000 && scheduled.delayMs <= 65_000,
  'El reintento no respeta la concesión de snapshot activa y puede duplicar solicitudes.'
);

scheduled.callback();
await Promise.resolve();
assert.deepEqual(helpers.recoveryCalls, [{
  spaceIds: ['project_1'],
  options: { force: true, source: 'scheduled-retry' }
}], 'Al vencer la concesión no se vuelve a solicitar la raíz faltante de forma dirigida.');

helpers.state.missingProjectRecoveryQueuedSpaceIds.add('project_1');
helpers.state.missingProjectRecoveryTimer = 77;
helpers.state.missingProjectRecoveryDueAt = Date.now() + 5000;
helpers.forgetMissingProjectRecovery(['project_1']);
assert.equal(helpers.state.missingProjectRecoveryAttempts.has('project_1'), false);
assert.equal(helpers.state.missingProjectRecoveryQueuedSpaceIds.has('project_1'), false);
assert.equal(helpers.state.missingProjectRecoveryTimer, 0, 'Una raíz recuperada dejó un reintento obsoleto activo.');

const cleanStartBegin = appSource.indexOf('function invitationCloneSpaceIds(');
const cleanStartEnd = appSource.indexOf('\nfunction panelHydrationRecoveryInFlight(', cleanStartBegin);
assert.ok(cleanStartBegin >= 0 && cleanStartEnd > cleanStartBegin, 'No se encontró la preparación limpia de una nueva aceptación.');
const cleanStartModuleSource = `
const PORTFOLIO_RESOURCE_TYPE = 'admin.portfolio';
const state = {
  p2pState: {
    spaces: [
      { spaceId: 'panel_1', resourceType: 'admin.portfolio' },
      { spaceId: 'project_1', resourceType: 'admin.project', governanceSpaceId: 'panel_1' }
    ],
    portfolioHydration: [{ portfolioSpaceId: 'panel_1', expectedProjectSpaceIds: ['project_1', 'project_2'] }],
    snapshotRequests: [
      { requestId: 'stale_panel', spaceId: 'panel_1' },
      { requestId: 'stale_project', spaceId: 'project_1' },
      { requestId: 'unrelated', spaceId: 'project_other' }
    ]
  },
  panelCloneRecoveryGeneration: 4,
  panelClonePreparedSpaceIds: new Set(['stale_space']),
  panelClonePreparationPromise: null,
  incompletePanelWarnings: new Map([['panel_1', 'stale']]),
  pendingAuthoritativePanelIds: new Set(['panel_1']),
  panelHydrationGraceUntil: new Map([['panel_1', Date.now() + 1000]]),
  panelCloneDiagnosticSignatures: new Map([['stale', Date.now()]]),
  renderSequence: 7
};
const clearedPanels = [];
const forgottenSpaces = [];
const diagnostics = [];
const transportCleanupCalls = [];
const semillaP2P = {
  async prepareInvitationCloneRecovery(spaceIds) {
    transportCleanupCalls.push([...spaceIds]);
    return {
      spaceIds: [...spaceIds],
      removedSnapshotSessions: 2,
      removedRecoveryRequirements: 1,
      clearedRejectedSources: 1,
      clearedInitialCloneRetries: 1
    };
  }
};
function clearPanelHydrationRetry(panelId) { clearedPanels.push(panelId); return true; }
function forgetMissingProjectRecovery(spaceIds) { forgottenSpaces.push(...spaceIds); return true; }
function reportPanelCloneDiagnostic(stage, detail) { diagnostics.push({ stage, detail }); }
${appSource.slice(cleanStartBegin, cleanStartEnd)}
export { state, clearedPanels, forgottenSpaces, diagnostics, transportCleanupCalls, prepareInvitationCloneAttempt, panelCloneRecoveryIsCurrent };
`;
const cleanStart = await import(`data:text/javascript;base64,${Buffer.from(cleanStartModuleSource).toString('base64')}#panel-clone-clean-start`);
const preparation = await cleanStart.prepareInvitationCloneAttempt({
  invitationId: 'invite_1',
  resourceType: 'admin.portfolio',
  spaceId: 'panel_1'
}, [{ spaceId: 'legacy_project' }]);
assert.equal(preparation.recoveryGeneration, 5, 'Una aceptación nueva no invalida recuperaciones anteriores.');
assert.equal(cleanStart.panelCloneRecoveryIsCurrent(4), false, 'Una recuperación anterior todavía puede aplicar efectos después de aceptar nuevamente.');
assert.deepEqual(cleanStart.clearedPanels, ['panel_1'], 'La aceptación nueva conserva el temporizador o contador agotado de hidratación.');
assert.deepEqual(
  new Set(cleanStart.forgottenSpaces),
  new Set(['panel_1', 'project_1', 'project_2', 'legacy_project']),
  'La aceptación nueva no limpia todos los residuos conocidos de la clonación anterior.'
);
assert.deepEqual(
  new Set(cleanStart.transportCleanupCalls.flat()),
  new Set(['panel_1', 'project_1', 'project_2', 'legacy_project']),
  'La preparación no limpió exclusiones de fuente, sesiones parciales y requisitos persistidos antes de aceptar.'
);
assert.deepEqual(
  cleanStart.state.p2pState.snapshotRequests,
  [{ requestId: 'unrelated', spaceId: 'project_other' }],
  'La aceptación conservó concesiones obsoletas del panel o eliminó solicitudes de otros espacios.'
);
assert.equal(preparation.transportCleanup?.removedSnapshotSessions, 2);
assert.equal(cleanStart.state.pendingAuthoritativePanelIds.has('panel_1'), false);
assert.equal(cleanStart.state.incompletePanelWarnings.has('panel_1'), false);
assert.equal(cleanStart.state.panelCloneDiagnosticSignatures.size, 0);
assert.equal(cleanStart.state.renderSequence, 8, 'Una lectura visual previa todavía puede sobrescribir el panel recién aceptado.');
assert.equal(cleanStart.diagnostics.at(-1)?.stage, 'invitacion-preparacion-limpia');

const cleanupPlanStart = appSource.indexOf('function failedInvitationCloneCleanupPlan(');
const cleanupPlanEnd = appSource.indexOf('\nasync function abandonFailedInvitationClones(', cleanupPlanStart);
assert.ok(cleanupPlanStart >= 0 && cleanupPlanEnd > cleanupPlanStart, 'No se encontró la limpieza terminal de clonaciones invitadas.');
const cleanupPlanModuleSource = `
const PORTFOLIO_RESOURCE_TYPE = 'admin.portfolio';
const PROJECT_RESOURCE_TYPE = 'admin.project';
${appSource.slice(cleanupPlanStart, cleanupPlanEnd)}
export { failedInvitationCloneCleanupPlan };
`;
const cleanupPlan = await import(`data:text/javascript;base64,${Buffer.from(cleanupPlanModuleSource).toString('base64')}#panel-clone-cleanup-plan`);
const panelSpace = {
  spaceId: 'panel_1', resourceType: 'admin.portfolio', ownerUserId: 'owner_1',
  members: [{ userId: 'guest_1', permissions: ['read'], accessScope: 'portfolio' }]
};
const panelProject = {
  spaceId: 'project_panel', resourceType: 'admin.project', governanceSpaceId: 'panel_1', ownerUserId: 'owner_1',
  members: [{ userId: 'guest_1', permissions: ['read'], accessScope: 'portfolio' }]
};
const directProject = {
  spaceId: 'project_direct', resourceType: 'admin.project', ownerUserId: 'owner_2',
  members: [{ userId: 'guest_1', permissions: ['read'], accessScope: 'project' }]
};
const ownProject = {
  spaceId: 'project_own', resourceType: 'admin.project', ownerUserId: 'guest_1',
  members: [{ userId: 'guest_1', permissions: ['read'], accessScope: 'project' }]
};
assert.deepEqual(
  cleanupPlan.failedInvitationCloneCleanupPlan(
    ['project_panel', 'project_direct', 'project_own'],
    [panelSpace, panelProject, directProject, ownProject],
    'guest_1'
  ),
  [
    { targetSpaceId: 'panel_1', affectedSpaceIds: ['project_panel'] },
    { targetSpaceId: 'project_direct', affectedSpaceIds: ['project_direct'] }
  ],
  'El límite terminal no agrupa proyectos heredados por panel o intenta retirar espacios propios.'
);

const cleanupBlockEnd = appSource.indexOf('\nfunction panelScopes()', cleanupPlanStart);
const cleanupCalls = [];
const cleanupBlockModuleSource = `
const PORTFOLIO_RESOURCE_TYPE = 'admin.portfolio';
const PROJECT_RESOURCE_TYPE = 'admin.project';
const MISSING_PROJECT_RECOVERY_MAX_ATTEMPTS = 3;
const state = {
  user: { userId: 'guest_1' },
  p2pState: { spaces: ${JSON.stringify([panelSpace, panelProject])} },
  pendingAuthoritativePanelIds: new Set(['panel_1']),
  panelHydrationGraceUntil: new Map([['panel_1', Date.now() + 1000]]),
  pendingPanelId: 'panel_1',
  panelCloneRecoveryGeneration: 0,
  panelCloneCleanupPromise: null
};
const leaveCalls = [];
const forgotten = [];
const cleanupCalls = [];
let applied = 0;
const semillaP2P = {
  bootstrapState: { spaces: [] },
  async leave(spaceId) {
    leaveCalls.push(spaceId);
    return { revokedSpaceIds: ['panel_1', 'project_panel'] };
  }
};
async function applyP2PState() { applied += 1; }
function forgetMissingProjectRecovery(spaceIds) { forgotten.push(...spaceIds); }
function clearPanelHydrationRetry() { return true; }
function panelCloneRecoveryIsCurrent(generation) { return Number(generation) === Number(state.panelCloneRecoveryGeneration); }
function reportPanelCloneDiagnostic(stage, detail, level) { cleanupCalls.push({ stage, detail, level }); }
function setStatus() {}
function t(key, fallback) { return fallback; }
const elements = { dashboardStatus: null };
${appSource.slice(cleanupPlanStart, cleanupBlockEnd)}
function appliedValue() { return applied; }
export { abandonFailedInvitationClones, leaveCalls, forgotten, cleanupCalls, state, appliedValue };
`;
const cleanupBlock = await import(`data:text/javascript;base64,${Buffer.from(cleanupBlockModuleSource).toString('base64')}#panel-clone-cleanup-block`);
const cleanupResult = await cleanupBlock.abandonFailedInvitationClones(['project_panel']);
assert.deepEqual(cleanupBlock.leaveCalls, ['panel_1'], 'La autolimpieza del proyecto heredado no abandona el panel como una sola operación autoritativa.');
assert.deepEqual(cleanupResult.revokedSpaceIds, ['panel_1', 'project_panel']);
assert.equal(cleanupBlock.appliedValue(), 1, 'La interfaz no aplica el estado posterior a la revocación terminal.');
assert.equal(cleanupBlock.state.pendingPanelId, '', 'El panel fallido permanece seleccionado después de retirarlo.');
assert.equal(cleanupBlock.state.panelCloneCleanupPromise, null, 'La promesa de limpieza queda montada y bloquea aceptaciones futuras.');
assert.equal(cleanupBlock.cleanupCalls.at(-1)?.stage, 'recuperacion-cancelada-limite');
cleanupBlock.state.panelCloneRecoveryGeneration = 1;
const staleCleanupResult = await cleanupBlock.abandonFailedInvitationClones(['project_panel'], { recoveryGeneration: 0 });
assert.equal(staleCleanupResult.stale, true, 'Una limpieza anterior no se invalida al comenzar una aceptación nueva.');
assert.deepEqual(cleanupBlock.leaveCalls, ['panel_1'], 'Una limpieza obsoleta revocó el acceso recién aceptado.');

const recoveryStart = appSource.indexOf('async function recoverMissingProjectCards(');
const recoveryEnd = appSource.indexOf('\nasync function refreshProjects()', recoveryStart);
assert.ok(recoveryStart >= 0 && recoveryEnd > recoveryStart, 'No se encontró la recuperación de raíces faltantes.');
const recoverySource = appSource.slice(recoveryStart, recoveryEnd);
assert.match(appSource, /const MISSING_PROJECT_RECOVERY_MAX_ATTEMPTS = 3;/, 'El límite terminal debe ser exactamente de tres intentos.');
assert.match(
  recoverySource,
  /Number\(state\.missingProjectRecoveryAttempts\.get\(spaceId\) \|\| 0\) >= MISSING_PROJECT_RECOVERY_MAX_ATTEMPTS/,
  'La recuperación no corta el cuarto intento después de tres ciclos fallidos.'
);
assert.match(
  recoverySource,
  /await abandonFailedInvitationClones\(terminalSpaceIds, \{ recoveryGeneration \}\)/,
  'Al superar el límite no se retira la participación incompleta del panel o proyecto invitado.'
);
assert.match(appSource, /await semillaP2P\.leave\(plan\.targetSpaceId\)/, 'La limpieza terminal no usa la revocación autoritativa y dejaría solicitudes montadas en backend.');
assert.match(appSource, /recuperacion-cancelada-limite/, 'Falta el error estructurado que confirma la autolimpieza terminal.');
assert.match(
  recoverySource,
  /const activeRequestSpaceIds = activeSnapshotRequestSpaceIds\(\);/,
  'La recuperación no consulta las concesiones de snapshot que ya están activas.'
);
assert.match(
  recoverySource,
  /const requestableSpaceIds = requestedSpaceIds\.filter\(\(spaceId\) => !activeRequestSpaceIds\.has\(spaceId\)\);/,
  'Una raíz con snapshot en curso todavía puede volver a solicitarse de forma superpuesta.'
);
assert.match(
  recoverySource,
  /scheduleMissingProjectRecovery\(alreadyRecoveringSpaceIds, \{ snapshotRequests \}\);/,
  'Las raíces con una concesión activa no conservan un reintento posterior al vencimiento.'
);
assert.match(
  recoverySource,
  /const recoverySpaces = Array\.isArray\(recoveryState\?\.spaces\)[\s\S]*?: state\.p2pState\.spaces;/,
  'La validación posterior a bootstrap todavía consulta únicamente el estado visual anterior.'
);
assert.match(
  recoverySource,
  /if \(!panelCloneRecoveryIsCurrent\(recoveryGeneration\)\) \{[\s\S]*recuperacion-descartada-por-nueva-invitacion/,
  'Una recuperación iniciada antes de la nueva aceptación todavía puede aplicar resultados tardíos.'
);
assert.match(
  recoverySource,
  /scheduleMissingProjectRecovery\(unresolved, \{[\s\S]*snapshotRequests: recoveryState\?\.snapshotRequests \|\| \[\]/,
  'Una clonación incompleta no conserva un reintento ligado a la concesión activa.'
);
assert.match(
  recoverySource,
  /catch \(error\) \{[\s\S]*scheduleMissingProjectRecovery\(candidates\);/,
  'Un fallo temporal de red deja el panel bloqueado sin nueva recuperación.'
);
assert.match(
  appSource,
  /const missingProjectSpaceIds = entries[\s\S]*!data\.project\.loaded && !isAuthorizationUnconfirmed\(data\.space\)/,
  'Una copia revocada o de autorización desconocida todavía dispara recuperaciones infinitas.'
);
assert.match(
  appSource,
  /window\.addEventListener\('online',[\s\S]*recoverMissingProjectCards\(missingProjectSpaceIds, \{ force: true, source: 'online' \}\)/,
  'El retorno de internet no reactiva de inmediato las clonaciones pendientes.'
);
const responseStart = appSource.indexOf('async function respondInvitation(event) {');
const responseEnd = appSource.indexOf('\nfunction renderLocalNetworkStatus', responseStart);
const responseSource = appSource.slice(responseStart, responseEnd);
const cleanupAwaitAt = responseSource.indexOf('await state.panelCloneCleanupPromise.catch(() => null);');
const cleanPreparationAt = responseSource.indexOf('prepareInvitationCloneAttempt(invitation, related)');
const acceptRequestAt = responseSource.indexOf("await respondToInvitationOnce(invitationId, decision, { prepareCloneRecovery: decision !== 'accept' });");
assert.ok(
  cleanupAwaitAt >= 0 && cleanupAwaitAt < cleanPreparationAt && cleanPreparationAt < acceptRequestAt,
  'La nueva aceptación puede solaparse con una limpieza terminal anterior o iniciar sin limpiar sus residuos.'
);
assert.match(appSource, /function reportPanelCloneDiagnostic\(/, 'Falta el canal estructurado de diagnóstico para la clonación del panel.');
for (const stage of [
  'invitacion-respuesta-iniciada',
  'invitacion-respuesta-aplicada',
  'recuperacion-iniciada',
  'recuperacion-ya-en-curso',
  'recuperacion-bootstrap-evaluado',
  'recuperacion-incompleta',
  'recuperacion-cancelada-limite',
  'snapshot-completo',
  'snapshot-incompleto',
  'reporte-replica-diferido'
]) {
  assert.match(appSource, new RegExp(stage), `Falta la traza de clonación ${stage}.`);
}
assert.match(
  recoverySource,
  /projectRootChecks[\s\S]*projectRootLoaded[\s\S]*backendStateRevision/,
  'La consola no distingue por proyecto si llegó el espacio, la raíz y la revisión autoritativa.'
);

console.log('OK: la clonación invitada conserva tres intentos entre recargas, evita solicitudes superpuestas y retira autoritativamente el panel o proyecto que no logra vincularse.');
