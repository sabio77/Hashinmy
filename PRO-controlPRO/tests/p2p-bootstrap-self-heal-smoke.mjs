import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const currentFile = fileURLToPath(import.meta.url);
const root = path.resolve(path.dirname(currentFile), '..');
const source = await fs.readFile(path.join(root, 'src/js/p2p-client.js'), 'utf8');
const storageSource = await fs.readFile(path.join(root, 'src/js/p2p-storage.js'), 'utf8');

const fetchStart = source.indexOf('  async fetchBootstrap(requestSnapshots = false, auditContext = {}) {');
const fetchEnd = source.indexOf('\n  async start(', fetchStart);
if (fetchStart < 0 || fetchEnd <= fetchStart) throw new Error('No se encontró fetchBootstrap.');
const fetchSource = source.slice(fetchStart, fetchEnd);
if (!fetchSource.includes('listKnownSpaceIds()')
  || !fetchSource.includes('listStateRevisions(durableKnownSpaceIds)')
  || !fetchSource.includes('...durableKnownSpaceIds')
  || !fetchSource.includes('...Object.keys(this.recoveryRequirements || {})')
  || !fetchSource.includes('knownSpaceIds,')) {
  throw new Error('El bootstrap no informa al backend todos los spaceId recuperables desde IndexedDB para reparar un índice derivado perdido.');
}
const knownIdsStart = storageSource.indexOf('export async function listKnownSpaceIds()');
const knownIdsEnd = storageSource.indexOf('\nexport async function replaceSpaces(', knownIdsStart);
if (knownIdsStart < 0 || knownIdsEnd <= knownIdsStart) throw new Error('No se encontró la enumeración durable de spaceId.');
const knownIdsSource = storageSource.slice(knownIdsStart, knownIdsEnd);
for (const storeName of ['STORES.spaces', 'STORES.entities', 'STORES.outbox', 'STORES.snapshots', 'STORES.meta']) {
  if (!knownIdsSource.includes(storeName)) throw new Error(`La recuperación local omite ${storeName}.`);
}

const recoveryStart = source.indexOf("  async recoverAcceptedInvitationBootstrap(space = null, receivedInvitations = []");
const recoveryEnd = source.indexOf('\n  async ', recoveryStart + 20);
if (recoveryStart < 0 || recoveryEnd <= recoveryStart) throw new Error('No se encontró la recuperación de invitaciones aceptadas.');
const recoverySource = source.slice(recoveryStart, recoveryEnd);
const missingIndex = recoverySource.indexOf("if (!invitation?.invitationId)");
const fallbackIndex = recoverySource.indexOf('this.requestSpaceKeyAndWait(spaceId, activeKeyId', missingIndex);
const returnIndex = recoverySource.indexOf("reason: keyRecovered ? 'accepted-invitation-missing-key-recovered'", fallbackIndex);
if (missingIndex < 0 || fallbackIndex <= missingIndex || returnIndex <= fallbackIndex) {
  throw new Error('La ausencia del índice de invitación todavía abandona la recuperación sin intentar la clave desde otra réplica autorizada.');
}

const realtimeStart = source.indexOf('  async openRealtime() {');
const realtimeEnd = source.indexOf('\n  scheduleReconnect()', realtimeStart);
if (realtimeStart < 0 || realtimeEnd <= realtimeStart) throw new Error('No se encontró openRealtime.');
const realtimeSource = source.slice(realtimeStart, realtimeEnd);
if (!source.includes('const REALTIME_READY_TIMEOUT_MS = 15 * 1000;')
  || !realtimeSource.includes("error.code = 'P2P_REALTIME_READY_TIMEOUT'")
  || !realtimeSource.includes("dispatch('p2p:connection', { state: 'disconnected'")
  || !realtimeSource.includes('this.scheduleReconnect();')) {
  throw new Error('El stream todavía puede permanecer indefinidamente en estado Conectando sin watchdog ni reconexión.');
}

const tabRetryStart = source.indexOf('  schedulePendingTabStateRequestRetry(');
const tabRetryEnd = source.indexOf('\n  requestTabState(', tabRetryStart);
if (tabRetryStart < 0 || tabRetryEnd <= tabRetryStart) throw new Error('No se encontró el watchdog del estado compartido entre pestañas.');
const tabRetrySource = source.slice(tabRetryStart, tabRetryEnd);
if (!source.includes('const TAB_STATE_REQUEST_RECOVERY_ATTEMPTS = 4;')
  || !tabRetrySource.includes('this.pendingTabStateRequestAttempt === TAB_STATE_REQUEST_RECOVERY_ATTEMPTS')
  || !tabRetrySource.includes("state: 'disconnected'")
  || !tabRetrySource.includes('this.tabCoordinator.requestLeadership()')) {
  throw new Error('Una pestaña seguidora todavía puede quedarse en Conectando si deja de recibir estado de la pestaña líder.');
}
const openPromiseIndex = realtimeSource.indexOf('this.openPromise = opening;');
const openFailureCatchIndex = realtimeSource.indexOf('} catch (error) {', openPromiseIndex);
const retryableOpenFailureIndex = realtimeSource.indexOf('this.isRetryableTransportError(error)', openFailureCatchIndex);
const retryOpenFailureIndex = realtimeSource.indexOf('this.scheduleReconnect();', retryableOpenFailureIndex);
if (openPromiseIndex < 0
  || openFailureCatchIndex <= openPromiseIndex
  || retryableOpenFailureIndex <= openFailureCatchIndex
  || retryOpenFailureIndex <= retryableOpenFailureIndex) {
  throw new Error('Una falla al obtener el token realtime todavía puede dejar Conectando sin reintentar porque ocurre antes de crear EventSource.');
}

console.log('OK: bootstrap informa IDs recuperables, la clave tiene fallback sin índice de invitación y ningún líder/seguidor puede quedar indefinidamente en Conectando.');
