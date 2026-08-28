import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const clientSource = fs.readFileSync(path.join(root, 'src/js/p2p-client.js'), 'utf8');
const appSource = fs.readFileSync(path.join(root, 'src/js/app.js'), 'utf8');
const htmlSource = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

const start = clientSource.indexOf('function normalizeReplicaHealthMap');
const end = clientSource.indexOf('function jsonByteLength', start);
assert.ok(start >= 0 && end > start, 'No se encontró el normalizador de cobertura P2P.');
const moduleUrl = `data:text/javascript;base64,${Buffer.from(`${clientSource.slice(start, end)}\nexport { normalizeReplicaHealthMap };`).toString('base64')}`;
const { normalizeReplicaHealthMap } = await import(moduleUrl);

assert.deepEqual(normalizeReplicaHealthMap({
  space_1: {
    state: 'healthy',
    currentStateRevision: '12',
    registeredReplicas: 2.9,
    confirmedReplicas: '2',
    pendingReplicas: -4,
    onlineReplicas: 'invalid'
  },
  invalid: null
}), {
  space_1: {
    spaceId: 'space_1',
    state: 'healthy',
    currentStateRevision: 12,
    memberAccounts: 0,
    registeredAccounts: 0,
    accountsWithoutDevice: 0,
    registeredReplicas: 2,
    confirmedReplicas: 2,
    pendingReplicas: 0,
    confirmedAccounts: 0,
    availableReplicas: 0,
    availableAccounts: 0,
    pendingAvailableReplicas: 0,
    presentReplicas: 0,
    presentAccounts: 0,
    missingReplicas: 0,
    onlineReplicas: 0,
    currentDeviceRegistered: false,
    currentDeviceConfirmed: null,
    currentDeviceAvailable: null,
    currentDevicePresent: null,
    currentDeviceOnline: false,
    displayState: 'healthy',
    lastConfirmedAt: '',
    truncated: false
  }
});

assert.match(clientSource, /listStateRevisions\(targetSpaceIds\)/, 'La consulta de salud no confirma la revisión local persistida.');
assert.match(clientSource, /deviceId: sessionContext\.deviceId[\s\S]*stateRevisions: localStateRevisions[\s\S]*deliverySequence:/, 'La cobertura no queda ligada al dispositivo y a su cursor local persistido.');
assert.match(clientSource, /const bootstrapRequest = \{[\s\S]*deliverySequence: Math\.max\(0, Number\(localDeliverySequence \|\| 0\)\)/, 'El bootstrap no puede reconciliar una réplica ya al día porque omite el cursor local.');
assert.match(clientSource, /replicaSpaceIds: localSpaceIds/, 'El bootstrap no distingue proyectos realmente almacenados de espacios solo conocidos/autorizados.');
assert.match(clientSource, /replicaSpaceIds: localSpaces\.map\(\(space\) => String\(space\?\.spaceId \|\| ''\)\.trim\(\)\)\.filter\(Boolean\)/, 'La consulta de salud no declara qué proyectos existen realmente en esta instalación.');
assert.match(clientSource, /const revisionSpaceIds = Array\.from\(new Set\(\[[\s\S]*\.\.\.localSpaceIds[\s\S]*listStateRevisions\(revisionSpaceIds\)/, 'El bootstrap puede omitir la revisión de un proyecto visible si su índice derivado de spaceId se perdió, permitiendo un falso 0/N inicial.');
assert.match(clientSource, /replicaHealthOnly: true/, 'La actualización de cobertura vuelve a recargar todas las entidades.');

assert.match(clientSource, /pendingAckReplicaSpaceIds/, 'El ACK no conserva los espacios cuyo estado local debe confirmarse.');
assert.match(clientSource, /appliedStateRevisions\s*=\s*await listStateRevisions\(replicaSpaceIds\)/, 'El ACK no lee las revisiones realmente persistidas antes de declarar cobertura.');
assert.match(clientSource, /appliedStateRevisions[\s\S]*apiPost\('\/api\/p2p\/events\/ack'/, 'El ACK no envía la declaración de estado aplicado al backend.');
assert.match(clientSource, /replicaRevisionHints \|\| ackResult\.replicaRevisions/, 'El cliente no trata las revisiones del relay como hints compatibles.');
assert.match(clientSource, /waitingOnlineReplica[\s\S]*replicaHealthConvergenceAttempts[\s\S]*scheduleReplicaHealthRefresh\(retrySpaceIds/, 'La UI puede quedar congelada mientras otra réplica conectada termina de confirmarse.');
assert.match(clientSource, /pendingReplicas[\s\S]*REPLICA_HEALTH_BACKGROUND_RETRY_MAX_ATTEMPTS[\s\S]*backgroundAttempt <= REPLICA_HEALTH_BACKGROUND_RETRY_MAX_ATTEMPTS[\s\S]*retrySpaceIds\.push\(spaceId\)/, 'La cobertura offline perdió sus comprobaciones de convergencia acotadas.');
assert.match(clientSource, /currentDeviceRegistered[\s\S]*currentDeviceConfirmed[\s\S]*currentDeviceOnline/, 'El cliente no conserva la identidad segura de su propia réplica dentro de la salud agregada.');
assert.match(clientSource, /availableReplicas[\s\S]*presentReplicas[\s\S]*currentDevicePresent[\s\S]*displayState/, 'El cliente descarta la presencia de copia separada de la frescura y la prueba ACK durable.');
assert.match(clientSource, /currentReplicaNeedsRecovery[\s\S]*currentDeviceConfirmed === false[\s\S]*waitingOnlineReplica = currentReplicaNeedsRecovery/, 'La auto-recuperación todavía depende de una presencia Redis perfecta para reconocer al propio dispositivo activo.');
assert.match(clientSource, /attempt >= REPLICA_HEALTH_SELF_RECOVERY_ATTEMPTS[\s\S]*currentReplicaNeedsRecovery[\s\S]*selfRecoverySpaceIds\.push\(spaceId\)/, 'Una réplica local conectada puede seguir en 0\/N sin escalar a recuperación real.');
assert.match(clientSource, /recoverReplicaHealthConvergence[\s\S]*requestSnapshots: 'force'[\s\S]*snapshotSpaceIds: targets[\s\S]*replica-health-self-recovery/, 'La recuperación de cobertura no solicita una reconstrucción dirigida únicamente a los espacios pendientes.');
assert.match(clientSource, /REPLICA_HEALTH_SELF_RECOVERY_COOLDOWN_MS[\s\S]*replicaHealthRecoveryCooldownUntil/, 'La auto-recuperación de cobertura puede generar tormentas de snapshots sin cooldown.');
assert.match(clientSource, /REPLICA_HEALTH_RETRY_ATTEMPT_CAP[\s\S]*if \(attempt < REPLICA_HEALTH_RETRY_ATTEMPT_CAP\)[\s\S]*scheduleReplicaHealthRefresh\(retrySpaceIds/, 'La reconciliación rápida perdió su presupuesto finito de reintentos.');
assert.match(clientSource, /resumeDeferredReplicaHealthChecks[\s\S]*replicaHealthBackgroundAttempts\.keys\(\)[\s\S]*scheduleReplicaHealthRefresh/, 'Una actividad relevante ya no puede reactivar una comprobación dirigida tras agotar el polling offline.');
assert.match(clientSource, /if \(backendReady\) this\.scheduleReplicaHealthRefresh\(this\.pendingReplicaHealthSpaceIdsFromBootstrap\(\), \{ delayMs: 500 \}\)/, 'El arranque líder dejó de reconciliar las réplicas que el bootstrap sí marcó como pendientes.');
assert.match(clientSource, /pendingReplicaHealthSpaceIdsFromBootstrap[\s\S]*onlineReplicas[\s\S]*confirmedReplicas/, 'El filtro posterior al bootstrap puede ocultar un 0/N que todavía necesita convergencia.');
assert.match(clientSource, /scheduleReplicaHealthRefresh\(refreshSpaceIds\.length \? refreshSpaceIds : this\.readableSpaceIds\(\)\)/, 'Un ACK de control no provoca reconciliación de cobertura cuando no trae revisiones de entidad.');
assert.match(clientSource, /p2p:operation-published[\s\S]*scheduleReplicaHealthRefresh\(\[spaceId\]\)/, 'La copia origen no renueva su cobertura después de publicar una operación durable.');
assert.match(clientSource, /replayed > 0\) this\.scheduleReplicaHealthRefresh\(\[event\.spaceId\]\)/, 'La reproducción de eventos cifrados diferidos no renueva la cobertura después de aplicarlos.');
assert.match(clientSource, /p2p\.replica\.topology\.changed[\s\S]*scheduleReplicaHealthRefresh\(\[event\.spaceId\], \{ delayMs: 350 \}\)/, 'Un alta o retiro de dispositivo no fuerza una actualización inmediata de cobertura en las demás instalaciones.');
assert.match(clientSource, /const sent = await this\.sendSnapshot\(event\);[\s\S]*if \(sent && event\.spaceId\) this\.scheduleReplicaHealthRefresh\(\[event\.spaceId\], \{ delayMs: 750 \}\)/, 'La fuente de un snapshot no recalcula la cobertura después de crear la copia remota.');
assert.match(appSource, /localProjectLoaded[\s\S]*state\.projects\?\.has\?\.\(cleanSpaceId\)[\s\S]*currentVisibleCopy/, 'La card no usa el proyecto ya hidratado como evidencia local de al menos 1/N copias.');
assert.match(appSource, /currentVisibleCopy[\s\S]*health\.presentReplicas[\s\S]*const registered = Math\.max\(present/, 'La card no garantiza el mínimo 1/N de una copia local visible ni usa la presencia de réplica separada de su frescura.');
assert.match(appSource, /coverageState[\s\S]*registered > 0 && present >= registered[\s\S]*\? 'healthy'/, 'Una cobertura completa N/N no fuerza el estado visual verde.');
assert.match(appSource, /replicas\.freshness[\s\S]*confirmed[\s\S]*registered/, 'La card dejó de informar por separado cuántas copias están realmente al día.');
assert.match(appSource, /health\.displayState \|\| health\.state/, 'La card no separa el estado visual de disponibilidad del estado durable de confirmación.');

const presentationStart = appSource.indexOf('function replicaHealthForSpace');
const presentationEnd = appSource.indexOf('function concurrentConflictMessage', presentationStart);
assert.ok(presentationStart >= 0 && presentationEnd > presentationStart, 'No se encontró la presentación de cobertura de la card.');
const presentationModuleUrl = `data:text/javascript;base64,${Buffer.from(`
const state = { p2pState: { replicaHealth: {} }, projects: new Map() };
const t = (_key, fallback) => fallback;
${appSource.slice(presentationStart, presentationEnd)}
export { state, replicaHealthPresentation };
`).toString('base64')}`;
const presentationModule = await import(presentationModuleUrl);
presentationModule.state.projects.set('space_local', { project: { loaded: true } });
presentationModule.state.p2pState.replicaHealth.space_local = {
  state: 'unavailable',
  displayState: 'unavailable',
  registeredReplicas: 2,
  confirmedReplicas: 0,
  availableReplicas: 0,
  presentReplicas: 0,
  currentDeviceRegistered: false,
  currentDeviceOnline: false
};
const localFloor = presentationModule.replicaHealthPresentation('space_local');
assert.equal(localFloor.summary, '1/2 copias', 'Una card hidratada localmente volvió a mostrar el imposible 0/2.');
assert.equal(localFloor.state, 'single', 'Una cobertura parcial 1/2 no debe presentarse como completa.');

presentationModule.state.p2pState.replicaHealth.space_complete = {
  state: 'degraded',
  displayState: 'degraded',
  registeredReplicas: 80,
  confirmedReplicas: 79,
  availableReplicas: 79,
  presentReplicas: 80
};
const completeCoverage = presentationModule.replicaHealthPresentation('space_complete');
assert.equal(completeCoverage.summary, '80/80 copias', 'La cobertura física completa no se conserva en la presentación.');
assert.equal(completeCoverage.state, 'healthy', 'Una cobertura completa 80/80 debe usar el estado visual verde.');
assert.equal(completeCoverage.freshnessState, 'degraded', 'La cobertura verde no debe ocultar que una réplica todavía está pendiente de ACK/frescura.');
assert.equal(completeCoverage.freshness, '79/80 al día', 'La frescura real dejó de mostrarse por separado de la cobertura.');
assert.match(appSource, /replica-health-badge/, 'La interfaz no muestra el estado de las réplicas.');
assert.match(appSource, /event\.detail\?\.replicaHealthOnly === true/, 'La interfaz no separa cobertura de la carga funcional.');
assert.match(htmlSource, /id="project-replica-health"/, 'Falta el indicador de cobertura dentro del proyecto.');

for (const language of ['es', 'en', 'ar']) {
  const payload = JSON.parse(fs.readFileSync(path.join(root, `textX/app/${language}.json`), 'utf8'));
  for (const key of ['healthy', 'degraded', 'single', 'unavailable', 'unknown', 'summary', 'freshness', 'detail']) {
    assert.equal(typeof payload.replicas?.[key], 'string', `Falta replicas.${key} en ${language}.`);
  }
}

console.log('OK: normalización, ACK aplicado, auto-recuperación dirigida de 0/N, reconciliación acotada y reanudable, arranque líder e indicadores ES/EN/AR validados.');
