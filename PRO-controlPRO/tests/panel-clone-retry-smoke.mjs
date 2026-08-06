import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const appSource = fs.readFileSync(path.join(root, 'src/js/app.js'), 'utf8');

const activeHelperStart = appSource.indexOf('function activeSnapshotRequestSpaceIds(');
const helperStart = appSource.indexOf('function clearMissingProjectRecoveryTimer(');
const helperEnd = appSource.indexOf('\nfunction panelHydrationRecoveryInFlight(', helperStart);
assert.ok(activeHelperStart >= 0 && helperStart > activeHelperStart, 'No se encontró el control de solicitudes de snapshot activas.');
assert.ok(helperStart >= 0 && helperEnd > helperStart, 'No se encontraron los reintentos dirigidos de clonación del panel.');

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
  missingProjectRecoveryQueuedSpaceIds: new Set(),
  missingProjectRecoveryTimer: 0,
  missingProjectRecoveryDueAt: 0,
  missingProjectRecoveryAt: new Map()
};
function getSessionToken() { return 'session'; }
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

const recoveryStart = appSource.indexOf('async function recoverMissingProjectCards(');
const recoveryEnd = appSource.indexOf('\nasync function refreshProjects()', recoveryStart);
assert.ok(recoveryStart >= 0 && recoveryEnd > recoveryStart, 'No se encontró la recuperación de raíces faltantes.');
const recoverySource = appSource.slice(recoveryStart, recoveryEnd);
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
assert.match(appSource, /function reportPanelCloneDiagnostic\(/, 'Falta el canal estructurado de diagnóstico para la clonación del panel.');
for (const stage of [
  'invitacion-respuesta-iniciada',
  'invitacion-respuesta-aplicada',
  'recuperacion-iniciada',
  'recuperacion-ya-en-curso',
  'recuperacion-bootstrap-evaluado',
  'recuperacion-incompleta',
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

console.log('OK: un panel invitado incompleto reintenta su clonación dirigida hasta recuperar todas las raíces, sin duplicar solicitudes activas.');
