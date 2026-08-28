import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const clientPath = path.resolve(here, '../src/js/p2p-client.js');
const source = fs.readFileSync(clientPath, 'utf8');

const startBegin = source.indexOf('\n  async start(user = {}) {');
const startEnd = source.indexOf('\n  async stop(options = {}) {', startBegin);
assert.ok(startBegin >= 0 && startEnd > startBegin, 'No se encontró el flujo de inicio P2P.');
const startBlock = source.slice(startBegin, startEnd);
const leaderBootstrapGuard = startBlock.indexOf('if (this.realtimeLeader) {');
const bootstrapCall = startBlock.indexOf("await this.fetchBootstrap('new-device', { prefetchRealtimeToken: true });");
assert.ok(leaderBootstrapGuard >= 0 && bootstrapCall > leaderBootstrapGuard, 'El bootstrap inicial dejó de estar restringido a la pestaña líder.');
assert.ok(!startBlock.includes("this.fetchBootstrap(this.realtimeLeader ? 'new-device' : false)"), 'Una pestaña seguidora todavía puede consumir un bootstrap HTTP propio.');
assert.ok(bootstrapCall >= 0, 'El bootstrap inicial ya no solicita la credencial realtime dentro de su propia respuesta.');
assert.ok(startBlock.includes("this.requestTabState('startup-follower')"), 'La pestaña seguidora ya no obtiene el estado compartido desde el líder.');
assert.ok(startBlock.includes('this.scheduleReplicaHealthRefresh(this.pendingReplicaHealthSpaceIdsFromBootstrap(), { delayMs: 500 })'), 'El arranque sigue haciendo un POST de salud para todos los espacios inmediatamente después del bootstrap.');
assert.ok(!startBlock.includes('if (backendReady) this.scheduleReplicaHealthRefresh(this.readableSpaceIds(), { delayMs: 500 });'), 'El arranque sano volvió a programar una respuesta HTTP de salud redundante.');

const leadershipBegin = source.indexOf('\n  queueLeadershipChange(');
const leadershipEnd = source.indexOf('\n  captureSessionContext()', leadershipBegin);
assert.ok(leadershipBegin >= 0 && leadershipEnd > leadershipBegin, 'No se encontró la transición de liderazgo entre pestañas.');
const leadershipBlock = source.slice(leadershipBegin, leadershipEnd);
assert.ok(leadershipBlock.includes('const requiresBootstrap = this.needsInitialBackendBootstrap();'), 'El cambio de líder no distingue una inicialización real de una reconexión ordinaria.');
assert.ok(leadershipBlock.includes('if (requiresBootstrap) {\n          await this.refreshBootstrap'), 'El cambio de líder continúa forzando bootstrap en cada promoción.');
assert.ok(leadershipBlock.includes('if (requiresBootstrap) {\n          this.scheduleReplicaHealthRefresh'), 'Las consultas auxiliares no quedaron limitadas a la inicialización necesaria.');
assert.ok(leadershipBlock.includes('this.pendingReplicaHealthSpaceIdsFromBootstrap()'), 'Una promoción con bootstrap sigue consultando salud de todos los espacios aunque ya estén convergidos.');

const recoveryBegin = source.indexOf('\n  async recoverOnline(options = {}) {');
const recoveryEnd = source.indexOf('\n  abortRealtimeForReplay(', recoveryBegin);
assert.ok(recoveryBegin >= 0 && recoveryEnd > recoveryBegin, 'No se encontró el flujo de recuperación online.');
const recoveryBlock = source.slice(recoveryBegin, recoveryEnd);
assert.ok(recoveryBlock.includes('navigator.onLine === false'), 'La recuperación online puede seguir consumiendo solicitudes mientras no existe red.');
assert.ok(recoveryBlock.includes('const bootstrapRequired = this.needsInitialBackendBootstrap()'), 'La recuperación no evalúa si el estado inicial ya fue aplicado.');
assert.ok(recoveryBlock.includes("recoveryReason === 'bootstrap-start'"), 'Se perdió la recuperación explícita del bootstrap inicial.');
assert.ok(recoveryBlock.includes("recoveryReason === 'local-capability-refresh'"), 'Se perdió la renovación explícita de la capacidad local.');
assert.ok(recoveryBlock.includes("const bootstrapSnapshots = recoveryReason === 'local-capability-refresh' ? false : 'new-device';"), 'La renovación de capacidad local volvió a solicitar snapshots innecesarios.');
assert.ok(recoveryBlock.includes('if (bootstrapRequired) {\n        await this.refreshBootstrap({ requestSnapshots: bootstrapSnapshots });'), 'La recuperación ordinaria todavía fuerza un snapshot de control completo.');
assert.ok(recoveryBlock.includes('if (bootstrapRequired) {\n        this.scheduleReplicaHealthRefresh'), 'La recuperación ordinaria todavía fuerza salud de réplicas y push.');
assert.ok(recoveryBlock.includes('this.pendingReplicaHealthSpaceIdsFromBootstrap()'), 'Una recuperación con bootstrap vuelve a consultar salud de espacios ya convergidos.');
assert.ok(recoveryBlock.includes('if (this.highestPendingAck > 0)'), 'La recuperación sigue forzando ACK HTTP aunque no exista ACK pendiente.');

const foregroundBegin = source.indexOf('\n  async recoverForeground() {');
const foregroundEnd = source.indexOf('\n  async recoverOnline(options = {}) {', foregroundBegin);
const foregroundBlock = source.slice(foregroundBegin, foregroundEnd);
assert.ok(foregroundBlock.includes("this.recoverOnline({ reason: 'foreground-resume' })"), 'El retorno a primer plano no está marcado como recuperación ordinaria incremental.');

const reconnectBegin = source.indexOf('\n  scheduleReconnect() {');
const reconnectEnd = source.indexOf('\n  clearAtomicTransportBatchTimer()', reconnectBegin);
assert.ok(reconnectBegin >= 0 && reconnectEnd > reconnectBegin, 'No se encontró el reconector SSE.');
const reconnectBlock = source.slice(reconnectBegin, reconnectEnd);
const transportGuard = reconnectBlock.indexOf('if (navigator.onLine === false || automaticNetworkRecoveryDeferred()) return;');
const delayCall = reconnectBlock.indexOf('const delay = realtimeReconnectDelay(this.retryCount);');
assert.ok(transportGuard >= 0 && delayCall > transportGuard, 'El reconector SSE programa reintentos antes de cortar por estado offline/oculto.');
assert.ok(source.includes("export function automaticNetworkRecoveryDeferred(documentRef = globalThis.document)"), 'No existe una frontera explícita para suspender recuperación HTTP automática en pestañas ocultas.');
assert.ok(source.includes("if (automaticNetworkRecoveryDeferred()) return;\n      this.recoverOnline({ reason: 'network-online' })"), 'El evento online todavía puede abrir HTTP/SSE desde una pestaña oculta sin actividad útil.');
assert.ok(source.includes('const REALTIME_HIDDEN_SUSPEND_MS = REALTIME_STABLE_CONNECTION_MS;'), 'La pestaña oculta no tiene una ventana acotada para ceder el stream SSE estable.');
assert.ok(source.includes('this.scheduleHiddenRealtimeSuspension();'), 'visibilitychange ya no programa la suspensión del stream en segundo plano.');
const hiddenSuspendBegin = source.indexOf('\n  scheduleHiddenRealtimeSuspension() {');
const hiddenSuspendEnd = source.indexOf('\n  async suspendRealtimeForHiddenInactivity(', hiddenSuspendBegin);
assert.ok(hiddenSuspendBegin >= 0 && hiddenSuspendEnd > hiddenSuspendBegin, 'No se encontró la política de suspensión SSE por inactividad oculta.');
const hiddenSuspendBlock = source.slice(hiddenSuspendBegin, hiddenSuspendEnd);
assert.ok(hiddenSuspendBlock.includes("document.visibilityState !== 'hidden'"), 'La suspensión puede activarse aunque la pestaña ya haya vuelto a primer plano.');
assert.ok(hiddenSuspendBlock.includes('REALTIME_HIDDEN_SUSPEND_MS'), 'La suspensión oculta perdió su ventana de gracia anti-thrashing.');
assert.ok(hiddenSuspendBlock.includes('!this.tabCoordinationReady'), 'La suspensión oculta puede cortar bootstrap/openRealtime antes de que el arbitraje multiventana esté listo.');
const hiddenReleaseBegin = source.indexOf('\n  async suspendRealtimeForHiddenInactivity(');
const hiddenReleaseEnd = source.indexOf('\n  async resumeForegroundAfterVisibility()', hiddenReleaseBegin);
const hiddenReleaseBlock = source.slice(hiddenReleaseBegin, hiddenReleaseEnd);
assert.ok(hiddenReleaseBlock.includes('await this.tabCoordinator.suspend();'), 'La pestaña oculta no cede el liderazgo coordinado antes de dejar de consumir SSE.');
const visibleResumeBegin = source.indexOf('\n  async resumeForegroundAfterVisibility() {');
const visibleResumeEnd = source.indexOf('\n  async recoverForeground() {', visibleResumeBegin);
const visibleResumeBlock = source.slice(visibleResumeBegin, visibleResumeEnd);
assert.ok(visibleResumeBlock.includes('await this.tabCoordinator.resume();'), 'El retorno visible no reingresa al arbitraje de una sola conexión SSE.');
assert.ok(startBlock.includes('this.scheduleHiddenRealtimeSuspension();'), 'Un arranque que ya ocurre en segundo plano puede conservar SSE indefinidamente.');
const stopBegin = source.indexOf('\n  async stop(options = {}) {');
const stopEnd = source.indexOf('\n  async refreshBootstrap(', stopBegin);
const stopBlock = source.slice(stopBegin, stopEnd);
assert.ok(stopBlock.includes('this.cancelHiddenRealtimeSuspension();'), 'stop() deja armado el temporizador de suspensión oculta.');

const serverRecoveryBegin = source.indexOf('\n  scheduleServerRecovery(');
const serverRecoveryEnd = source.indexOf('\n  isRetryableTransportError(', serverRecoveryBegin);
const serverRecoveryBlock = source.slice(serverRecoveryBegin, serverRecoveryEnd);
assert.ok(serverRecoveryBlock.includes("const recoveryStage = this.serverRetryStage || 'transport-retry';"), 'La recuperación diferida pierde la causa que decide si realmente requiere bootstrap.');
assert.ok(serverRecoveryBlock.includes('this.recoverOnline({ reason: recoveryStage })'), 'La recuperación diferida no conserva su motivo al reintentar.');
assert.ok(serverRecoveryBlock.includes('this.scheduleServerRecovery(recoveryError, recoveryStage)'), 'Un segundo fallo pierde la política de recuperación original.');
assert.ok(source.includes('const SERVER_RECOVERY_MAX_ATTEMPTS = 6;'), 'La recuperación exterior volvió a quedar sin presupuesto total de respuestas HTTP.');
assert.ok(serverRecoveryBlock.includes('attempt >= SERVER_RECOVERY_MAX_ATTEMPTS'), 'El backoff exterior no se detiene al agotar su presupuesto de intentos.');
assert.ok(serverRecoveryBlock.includes('if (!hadScheduledRetry) this.serverRetryAttempt = attempt + 1;'), 'Los 429 dirigidos por Retry-After no consumen el presupuesto total de recuperación.');
assert.ok(serverRecoveryBlock.includes('navigator.onLine === false || automaticNetworkRecoveryDeferred()'), 'Un temporizador ya programado todavía puede ejecutar recuperación HTTP después de quedar offline/oculto.');
const retryableTransportBegin = source.indexOf('\n  isRetryableTransportError(error = null) {');
const retryableTransportEnd = source.indexOf('\n  isPermanentOutboxRejection(', retryableTransportBegin);
const retryableTransportBlock = source.slice(retryableTransportBegin, retryableTransportEnd);
assert.ok(!retryableTransportBlock.includes('[401, 408, 425, 429]'), 'Una sesión HTTP 401 definitiva todavía rearma el ciclo automático de recuperación.');
assert.ok(retryableTransportBlock.includes('[408, 425, 500, 502, 503, 504].includes(status)') && retryableTransportBlock.includes('status === 429'), 'Se perdieron los estados transitorios que sí requieren recuperación diferida.');

assert.ok(source.includes("const ACKNOWLEDGED_CURSOR_META_PREFIX = 'deliveryAckCursor:';"), 'No existe un cursor durable separado para ACK ya confirmados.');

const realtimeBegin = source.indexOf('\n  async openRealtime() {');
const realtimeEnd = source.indexOf('\n  scheduleReconnect() {', realtimeBegin);
assert.ok(realtimeBegin >= 0 && realtimeEnd > realtimeBegin, 'No se encontró la apertura realtime.');
const realtimeBlock = source.slice(realtimeBegin, realtimeEnd);
assert.ok(realtimeBlock.includes('getMeta(acknowledgedCursorKey, 0)'), 'La reconexión no recupera el último ACK confirmado entre pestañas o reinicios.');
assert.ok(realtimeBlock.includes('if (pendingAckSequence > this.lastAcknowledgedSequence)'), 'El handshake SSE todavía confirma por HTTP un cursor ya reconocido.');
assert.ok(!realtimeBlock.includes('this.scheduleAck(this.lastProcessedSequence, { immediate: true });'), 'El handshake SSE volvió a generar un ACK HTTP incondicional.');
assert.ok(realtimeBlock.includes('const prefetchedRealtimeToken = this.takeRealtimeReconnectToken();'), 'La reconexión SSE no intenta reutilizar una credencial de un solo uso entregada por el stream estable.');
assert.ok(realtimeBlock.includes("source.addEventListener('p2p_reconnect_token'"), 'El cliente no recibe la credencial SSE de reconexión sin una respuesta HTTP adicional.');
assert.ok(realtimeBlock.includes("await apiPost('/api/p2p/realtime/token'"), 'Se perdió el fallback autenticado para conexiones nuevas o credenciales vencidas.');
assert.ok(source.includes('REALTIME_RECONNECT_TOKEN_EXPIRY_SAFETY_MS'), 'La credencial SSE de reconexión no tiene margen local contra expiración durante el handshake.');

const ackBegin = source.indexOf('\n  scheduleAck(sequence = 0, options = {}) {');
const ackEnd = source.indexOf('\n  async ensureInvitationSourceCurrent(', ackBegin);
assert.ok(ackBegin >= 0 && ackEnd > ackBegin, 'No se encontró el flujo de ACK P2P.');
const ackBlock = source.slice(ackBegin, ackEnd);
assert.ok(ackBlock.includes('requestedSequence <= this.lastAcknowledgedSequence'), 'scheduleAck no descarta cursores que ya fueron confirmados.');
assert.ok(ackBlock.includes("setMeta(`${ACKNOWLEDGED_CURSOR_META_PREFIX}${sessionContext.deviceId}`, confirmedAckSequence)"), 'Un ACK exitoso no persiste el cursor confirmado para futuras reconexiones.');

const resetBegin = source.indexOf('\n  async resetDeliveryCursor(');
const resetEnd = source.indexOf('\n  clearSnapshotRecovery()', resetBegin);
assert.ok(resetBegin >= 0 && resetEnd > resetBegin, 'No se encontró el restablecimiento del cursor realtime.');
const resetBlock = source.slice(resetBegin, resetEnd);
assert.ok(resetBlock.includes("setMeta(`${ACKNOWLEDGED_CURSOR_META_PREFIX}${sessionContext.deviceId}`, 0)"), 'Un reset autoritativo no invalida el ACK durable anterior.');


const bootstrapHealthHelperBegin = source.indexOf('\n  pendingReplicaHealthSpaceIdsFromBootstrap()');
const bootstrapHealthHelperEnd = source.indexOf('\n  mergeReplicaHealth(', bootstrapHealthHelperBegin);
assert.ok(bootstrapHealthHelperBegin >= 0 && bootstrapHealthHelperEnd > bootstrapHealthHelperBegin, 'No existe filtro de convergencia para evitar el health POST posterior a bootstrap.');
const bootstrapHealthHelper = source.slice(bootstrapHealthHelperBegin, bootstrapHealthHelperEnd);
assert.ok(bootstrapHealthHelper.includes('Number(entry?.pendingReplicas || 0) > 0'), 'El filtro de health no se limita a espacios con trabajo pendiente.');
assert.ok(bootstrapHealthHelper.includes('entry?.currentDeviceRegistered === true && entry?.currentDeviceConfirmed === false'), 'El filtro de health puede omitir la recuperación del dispositivo actual no confirmado.');

const healthBegin = source.indexOf('\n  scheduleReplicaHealthRefresh(');
const healthEnd = source.indexOf('\n  async fenceBootstrapResponses(', healthBegin);
assert.ok(healthBegin >= 0 && healthEnd > healthBegin, 'No se encontró el programador de salud de réplicas.');
const healthBlock = source.slice(healthBegin, healthEnd);
assert.ok(source.includes('const REPLICA_HEALTH_BACKGROUND_RETRY_MAX_ATTEMPTS = 2;'), 'La comprobación de réplicas offline volvió a quedar sin un presupuesto explícito.');
assert.ok(healthBlock.includes('backgroundAttempt <= REPLICA_HEALTH_BACKGROUND_RETRY_MAX_ATTEMPTS'), 'Una réplica offline todavía puede rearmar polling HTTP indefinido.');
assert.ok(healthBlock.includes('REPLICA_HEALTH_BACKGROUND_RETRY_BASE_MS * (2 ** Math.max(0, backgroundAttempt - 1))'), 'Las comprobaciones offline perdieron el backoff progresivo.');
assert.ok(healthBlock.includes('if (attempt < REPLICA_HEALTH_RETRY_ATTEMPT_CAP)'), 'Los fallos del endpoint de salud todavía reintentan HTTP después de agotar su presupuesto.');
assert.ok((healthBlock.match(/if \(attempt < REPLICA_HEALTH_RETRY_ATTEMPT_CAP\)/g) || []).length >= 2, 'Una réplica online pendiente todavía puede mantener sondeos HTTP después de agotar la convergencia rápida.');
assert.ok(healthBlock.includes('this.replicaHealthConvergenceAttempts.delete(spaceId);'), 'El agotamiento del endpoint de salud no libera el ciclo de reintento para una actividad futura.');

const deferredHealthBegin = source.indexOf('\n  resumeDeferredReplicaHealthChecks(');
const deferredHealthEnd = source.indexOf('\n  async refreshReplicaHealth(', deferredHealthBegin);
assert.ok(deferredHealthBegin >= 0 && deferredHealthEnd > deferredHealthBegin, 'No existe reanudación dirigida de salud tras actividad relevante.');
const deferredHealthBlock = source.slice(deferredHealthBegin, deferredHealthEnd);
assert.ok(deferredHealthBlock.includes('this.replicaHealthBackgroundAttempts.keys()'), 'La reanudación volvió a consultar todos los espacios en vez de solo los pendientes offline.');
assert.ok(deferredHealthBlock.includes('REPLICA_HEALTH_BACKGROUND_RETRY_MAX_ATTEMPTS'), 'La reanudación relevante puede reiniciar el polling periódico agotado.');
assert.ok(foregroundBlock.includes('this.resumeDeferredReplicaHealthChecks({ delayMs: 500 })'), 'Volver a primer plano ya no refresca de forma dirigida las réplicas offline agotadas.');
assert.ok(source.includes("this.recoverOnline({ reason: 'network-online' }).then((recovered) => {"), 'El retorno real de red no está identificado como actividad relevante.');
assert.ok(source.includes('if (recovered) this.resumeDeferredReplicaHealthChecks({ delayMs: 500 });'), 'El retorno de red no reactiva una única comprobación dirigida de salud.');

const bootstrapFetchBegin = source.indexOf('\n  async fetchBootstrap(requestSnapshots = false, auditContext = {}) {');
const bootstrapFetchEnd = source.indexOf('\n  async start(user = {}) {', bootstrapFetchBegin);
assert.ok(bootstrapFetchBegin >= 0 && bootstrapFetchEnd > bootstrapFetchBegin, 'No se encontró el bootstrap HTTP incremental.');
const bootstrapFetchBlock = source.slice(bootstrapFetchBegin, bootstrapFetchEnd);
assert.ok(bootstrapFetchBlock.includes('bootstrapSectionFingerprints: { ...this.bootstrapSectionFingerprints }'), 'Las lecturas posteriores no informan las secciones de bootstrap que el cliente ya posee.');
assert.ok(bootstrapFetchBlock.includes("prefetchRealtimeToken === true ? { prefetchRealtimeToken: true }"), 'El bootstrap no puede pedir explícitamente la credencial SSE sin afectar lecturas ordinarias.');
assert.ok(bootstrapFetchBlock.includes('this.storeRealtimeReconnectToken(data.realtimeBootstrap);'), 'La credencial SSE incluida en bootstrap no se reutiliza para evitar POST /realtime/token.');
assert.ok(source.includes("bootstrapSectionIsUnchanged(data, 'spaces', this.bootstrapSectionFingerprints)"), 'El cliente no conserva espacios idénticos cuando el backend omite la sección.');
assert.ok(source.includes("bootstrapSectionIsUnchanged(data, 'invitations', this.bootstrapSectionFingerprints)"), 'El cliente no conserva invitaciones idénticas cuando el backend omite la sección.');
assert.ok(source.includes("bootstrapSectionIsUnchanged(data, 'lifecycleTransactions', this.bootstrapSectionFingerprints)"), 'El cliente no conserva transacciones de ciclo de vida idénticas cuando el backend omite la sección.');
assert.ok(source.includes('this.bootstrapSectionFingerprints = responseFingerprints;'), 'Las huellas confirmadas por el backend no quedan disponibles para el siguiente bootstrap.');
assert.ok(source.includes("Object.prototype.hasOwnProperty.call(data.limits, 'streamHeartbeatMs')"), 'El cliente ignora el heartbeat configurable entregado por bootstrap.');
assert.ok(source.includes('this.realtimeStableConnectionMs = realtimeStableConnectionMs(this.streamHeartbeatMs);'), 'La ventana estable SSE no se sincroniza con el heartbeat del backend.');
assert.ok(reconnectBlock.includes('this.realtimeStableConnectionMs'), 'La reconexión SSE sigue usando una ventana estable fija aunque cambie el heartbeat del backend.');
assert.ok(source.includes('responseFingerprint === knownFingerprint'), 'Una sección omitida puede reutilizarse sin comprobar que la huella del backend coincide con el estado conocido.');
assert.ok(source.includes("this.pushConfigurationLoaded = true;"), 'La configuración Push entregada por bootstrap no queda disponible para evitar GET /push/public-key.');
assert.ok(source.includes("this.pushPublicKey = normalizePushPublicKey(data.limits.pushPublicKey || '');"), 'El cliente no consume la clave VAPID incremental incluida en los límites de bootstrap.');
assert.ok(source.includes('storedPushBackendRegistrationIsFresh(subscription, keyData, sessionContext)'), 'El cliente no evita POST /push/subscribe cuando la vinculación durable sigue fresca.');
assert.ok(source.includes('Math.floor(ttlSeconds * 1000 * 0.5)'), 'La renovación Push no conserva un margen previo al TTL de Redis.');

// Los reintentos exteriores P2P también deben usar una lista cerrada de estados
// transitorios. Si aquí reaparece `status >= 500`, un 501/505 definitivo puede
// multiplicar bootstrap, outbox, lifecycle o reconexiones y consumir respuestas inútiles.
assert.ok(
  source.includes('[408, 425, 500, 502, 503, 504].includes(status)'),
  'El cliente P2P perdió la lista cerrada de estados HTTP transitorios.'
);
assert.ok(!source.includes('status >= 500'), 'El cliente P2P vuelve a reintentar indiscriminadamente cualquier 5xx definitivo.');

const panelRetryBegin = source.indexOf('export function panelInvitationResponseRetryDelay(');
const panelRetryEnd = source.indexOf('\nfunction createId(', panelRetryBegin);
assert.ok(panelRetryBegin >= 0 && panelRetryEnd > panelRetryBegin, 'No se pudo aislar la política de reintento de invitaciones de panel.');
const panelRetrySource = `${source.slice(panelRetryBegin, panelRetryEnd).replace('export function panelInvitationResponseRetryDelay', 'function panelInvitationResponseRetryDelay')}
export { panelInvitationResponseRetryDelay };`;
const panelRetryModuleUrl = `data:text/javascript;base64,${Buffer.from(panelRetrySource).toString('base64')}`;
const { panelInvitationResponseRetryDelay } = await import(panelRetryModuleUrl);
assert.equal(panelInvitationResponseRetryDelay({ status: 501 }, 0), 0, 'Un 501 definitivo todavía programa otra respuesta de invitación.');
assert.equal(panelInvitationResponseRetryDelay({ status: 505 }, 0), 0, 'Un 505 definitivo todavía programa otra respuesta de invitación.');
assert.ok(panelInvitationResponseRetryDelay({ status: 503 }, 0) > 0, 'Un 503 transitorio dejó de conservar recuperación limitada.');
assert.ok(panelInvitationResponseRetryDelay({ status: 0, name: 'TypeError' }, 0) > 0, 'Un fallo de transporte sin respuesta dejó de ser recuperable.');

const transportRetryBegin = source.indexOf('\n  isRetryableTransportError(error = null) {');
const transportRetryEnd = source.indexOf('\n  isPermanentOutboxRejection(', transportRetryBegin);
assert.ok(transportRetryBegin >= 0 && transportRetryEnd > transportRetryBegin, 'No se pudo aislar la clasificación de transporte P2P.');
const transportRetryMethod = source.slice(transportRetryBegin, transportRetryEnd)
  .trim()
  .replace('isRetryableTransportError(error = null) {', 'function isRetryableTransportError(error = null) {')
  .replace('this.isKeyAuthorityRetryableError(error)', 'isKeyAuthorityRetryableError(error)');
const transportRetrySource = `const isKeyAuthorityRetryableError = () => false;
${transportRetryMethod}
export { isRetryableTransportError };`;
const transportRetryModuleUrl = `data:text/javascript;base64,${Buffer.from(transportRetrySource).toString('base64')}`;
const { isRetryableTransportError } = await import(transportRetryModuleUrl);
assert.equal(isRetryableTransportError({ status: 501 }), false, 'Un 501 definitivo todavía activa recuperación exterior P2P.');
assert.equal(isRetryableTransportError({ status: 511 }), false, 'Un 511 definitivo todavía activa recuperación exterior P2P.');
assert.equal(isRetryableTransportError({ status: 503 }), true, 'Un 503 transitorio dejó de activar recuperación exterior limitada.');
assert.equal(isRetryableTransportError({ status: 0, name: 'TypeError' }), true, 'Un fallo de red sin status dejó de activar recuperación exterior.');

// Soak determinista: miles de pérdidas cortas no pueden desactivar la penalización ni
// crecer por encima del máximo. Una conexión realmente estable sí restablece el ciclo.
const reconnectConstantsStart = source.indexOf('const RETRY_BASE_MS = 1200;');
const reconnectConstantsEnd = source.indexOf('const SERVER_RETRY_FALLBACK_MS = 5000;');
const reconnectHelpersStart = source.indexOf('export function realtimeStableConnectionMs');
const reconnectHelpersEnd = source.indexOf('const INVITATION_SOURCE_CREATE_MAX_ATTEMPTS = 3;');
assert.ok(reconnectConstantsStart >= 0 && reconnectConstantsEnd > reconnectConstantsStart, 'No se pudo aislar la política SSE para la prueba prolongada.');
assert.ok(reconnectHelpersStart >= 0 && reconnectHelpersEnd > reconnectHelpersStart, 'No se pudieron aislar los helpers SSE para la prueba prolongada.');
const reconnectModuleSource = `${source.slice(reconnectConstantsStart, reconnectConstantsEnd)}
${source.slice(reconnectHelpersStart, reconnectHelpersEnd)
  .replace('export function realtimeStableConnectionMs', 'function realtimeStableConnectionMs')
  .replace('export function realtimeReconnectRetryCount', 'function realtimeReconnectRetryCount')
  .replace('export function realtimeReconnectDelay', 'function realtimeReconnectDelay')}
export { realtimeStableConnectionMs, realtimeReconnectRetryCount, realtimeReconnectDelay };`;
const reconnectModuleUrl = `data:text/javascript;base64,${Buffer.from(reconnectModuleSource).toString('base64')}`;
const { realtimeStableConnectionMs, realtimeReconnectRetryCount, realtimeReconnectDelay } = await import(reconnectModuleUrl);
let soakRetryCount = 0;
for (let cycle = 0; cycle < 20000; cycle += 1) {
  soakRetryCount = realtimeReconnectRetryCount(soakRetryCount, cycle % 3 === 0 ? 0 : 25_000);
  const delay = realtimeReconnectDelay(soakRetryCount, (cycle % 101) / 100);
  assert.ok(delay >= 250 && delay <= 30_000, `El backoff salió de límites durante el ciclo ${cycle}.`);
  soakRetryCount = Math.min(1000, soakRetryCount + 1);
}
assert.ok(soakRetryCount > 0, 'Las pérdidas de red/conexiones cortas borraron la penalización acumulada durante el soak.');
assert.equal(realtimeReconnectRetryCount(soakRetryCount, 75_000), 0, 'Una conexión estable no restablece la penalización después del soak.');
const slowHeartbeatStableMs = realtimeStableConnectionMs(120_000);
assert.equal(
  realtimeReconnectRetryCount(soakRetryCount, 75_000, slowHeartbeatStableMs),
  soakRetryCount,
  'El soak puede borrar la penalización con una conexión menor a tres heartbeats configurados por el backend.'
);
assert.equal(
  realtimeReconnectRetryCount(soakRetryCount, 360_000, slowHeartbeatStableMs),
  0,
  'El soak no restablece la penalización después de tres heartbeats configurados por el backend.'
);

const apiSource = fs.readFileSync(path.resolve(here, '../src/js/api.js'), 'utf8');
assert.ok(apiSource.includes('const requestedMaxAttempts = Math.min(3'), 'El gateway puede provocar más de tres intentos por solicitud.');
assert.ok(apiSource.includes('const REQUEST_RETRYABLE_HTTP_STATUSES = new Set([408, 425, 500, 502, 503, 504]);'), 'La política de recuperación debe limitarse a estados HTTP transitorios conocidos.');
assert.ok(apiSource.includes('if (REQUEST_RETRYABLE_HTTP_STATUSES.has(status)) return true;'), 'Los fallos transitorios del gateway dejaron de usar la política limitada de recuperación.');
assert.ok(!apiSource.includes('status >= 500'), 'Un 5xx definitivo puede volver a consumir hasta tres HTTP Responses innecesarias.');
assert.ok(apiSource.includes('if (status === 429) return false;'), 'Un 429 autoritativo vuelve a generar respuestas HTTP por reintentos inmediatos.');
assert.ok(reconnectBlock.indexOf('if (navigator.onLine === false) return;') < reconnectBlock.indexOf('this.retryTimer = window.setTimeout'), 'Una pérdida de red puede seguir dejando reintentos SSE armados durante el soak.');

console.log('p2p-http-response-efficiency-smoke: ok');
