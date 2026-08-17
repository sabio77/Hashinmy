import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const currentFile = fileURLToPath(import.meta.url);
const root = path.resolve(path.dirname(currentFile), '..');
const storageSource = await fs.readFile(path.join(root, 'src/js/p2p-storage.js'), 'utf8');
const storageModuleUrl = `data:text/javascript;base64,${Buffer.from(`${storageSource}\nexport { reduceEntityRecord, discardPendingOperationRecord };`).toString('base64')}`;
const { reduceEntityRecord, discardPendingOperationRecord } = await import(storageModuleUrl);
const domain = await import(pathToFileURL(path.join(root, 'src/js/project-domain.js')).href);

function event(operation, revision) {
  return {
    eventType: 'p2p.operation',
    spaceId: 'space_trash',
    actorUserId: 'usr_owner',
    sourceDeviceId: 'dev_owner',
    spaceSequence: revision,
    stateRevision: revision,
    optimistic: false,
    createdAt: `2026-08-03T20:00:0${revision}.000Z`,
    operation
  };
}

const baseValue = {
  description: 'Compra de materiales',
  amount: 125000,
  createdAt: '2026-08-03T19:00:00.000Z',
  updatedAt: '2026-08-03T19:00:00.000Z'
};
let record = reduceEntityRecord(null, event({
  operationId: 'op_put',
  type: 'entity.put',
  entityType: 'admin.purchase',
  entityId: 'purchase_1',
  payload: { value: baseValue }
}, 1)).entity;

const trashAt = '2026-08-03T20:00:02.000Z';
record = reduceEntityRecord(record, event({
  operationId: 'op_trash',
  type: 'entity.trash',
  entityType: 'admin.purchase',
  entityId: 'purchase_1',
  payload: { expected: baseValue, at: trashAt, actorUserId: 'usr_spoofed' }
}, 2)).entity;
if (record.deleted || record.value.description !== baseValue.description || record.value.trashedAt !== trashAt || record.value.trashedBy !== 'usr_owner') {
  throw new Error('Enviar a papelera no preservó el registro completo ni usó el actor autenticado para su auditoría.');
}

const optimisticBase = reduceEntityRecord(null, event({
  operationId: 'op_optimistic_put',
  type: 'entity.put',
  entityType: 'admin.income',
  entityId: 'income_optimistic',
  payload: { value: baseValue }
}, 10)).entity;
const optimisticTrashOperation = {
  operationId: 'op_optimistic_trash',
  type: 'entity.trash',
  entityType: 'admin.income',
  entityId: 'income_optimistic',
  payload: { expected: baseValue, at: '2026-08-03T20:00:11.000Z', actorUserId: 'usr_spoofed' }
};
const optimisticTrash = reduceEntityRecord(optimisticBase, {
  ...event(optimisticTrashOperation, 0),
  optimistic: true,
  spaceSequence: 0,
  stateRevision: 0
}).entity;
if (!optimisticTrash.optimistic || optimisticTrash.value.trashedAt !== optimisticTrashOperation.payload.at || optimisticTrash.value.trashedBy !== 'usr_owner') {
  throw new Error('La papelera optimista no se materializó localmente durante una desconexión.');
}
const revertedTrash = discardPendingOperationRecord(optimisticTrash, optimisticTrashOperation);
if (!revertedTrash.reverted || revertedTrash.entity.optimistic || revertedTrash.entity.value.trashedAt) {
  throw new Error('El rechazo autoritativo no revirtió limpiamente la papelera optimista.');
}
const pendingTrash = reduceEntityRecord(optimisticBase, {
  ...event(optimisticTrashOperation, 0),
  optimistic: true,
  spaceSequence: 0,
  stateRevision: 0
}).entity;
const confirmedTrash = reduceEntityRecord(pendingTrash, event(optimisticTrashOperation, 11)).entity;
if (confirmedTrash.optimistic || confirmedTrash.pendingOperations.length || confirmedTrash.value.trashedAt !== optimisticTrashOperation.payload.at) {
  throw new Error('La confirmación canónica no consolidó la operación optimista sin duplicarla.');
}

const staleTrash = reduceEntityRecord(record, event({
  operationId: 'op_stale_trash',
  type: 'entity.trash',
  entityType: 'admin.purchase',
  entityId: 'purchase_1',
  payload: { expected: baseValue, at: '2026-08-03T20:00:03.000Z', actorUserId: 'usr_other' }
}, 3));
if (!staleTrash.skipped || staleTrash.entity?.value?.trashedBy !== 'usr_owner') {
  throw new Error('Una operación de papelera con versión obsoleta sobrescribió el estado concurrente.');
}

const trashedValue = structuredClone(record.value);
const restoreAt = '2026-08-03T20:00:04.000Z';
record = reduceEntityRecord(record, event({
  operationId: 'op_restore',
  type: 'entity.restore',
  entityType: 'admin.purchase',
  entityId: 'purchase_1',
  payload: { expected: trashedValue, at: restoreAt, actorUserId: 'usr_owner' }
}, 4)).entity;
if (record.deleted || record.value.trashedAt !== '' || record.value.trashedBy !== '' || record.value.restoredAt !== restoreAt) {
  throw new Error('Restaurar no devolvió el registro a las vistas activas con auditoría.');
}

const missingProjectValue = {
  name: 'Proyecto recuperable',
  description: 'Copia raíz reconstruida desde el valor esperado cifrado.',
  address: 'Bogotá',
  initialBudget: 500000,
  createdAt: '2026-08-03T18:00:00.000Z',
  updatedAt: '2026-08-03T18:00:00.000Z'
};
const recoveredMissingProject = reduceEntityRecord(null, {
  ...event({
    operationId: 'op_trash_missing_project',
    type: 'entity.trash',
    entityType: 'admin.project',
    entityId: 'project',
    payload: { expected: missingProjectValue, at: trashAt, actorUserId: 'usr_owner' }
  }, 12),
  spaceId: 'space_missing_project'
});
if (recoveredMissingProject.skipped || recoveredMissingProject.entity?.value?.trashedAt !== trashAt || recoveredMissingProject.entity?.value?.name !== missingProjectValue.name) {
  throw new Error('Una réplica sin raíz local no reconstruyó el proyecto directamente en la papelera.');
}
const missingProjectRestore = reduceEntityRecord(null, {
  ...event({
    operationId: 'op_restore_missing_project',
    type: 'entity.restore',
    entityType: 'admin.project',
    entityId: 'project',
    payload: { expected: missingProjectValue, at: restoreAt, actorUserId: 'usr_owner' }
  }, 13),
  spaceId: 'space_missing_project_restore'
});
if (!missingProjectRestore.skipped || missingProjectRestore.entity) {
  throw new Error('Una restauración atrasada reconstruyó una raíz ausente que pudo haber sido purgada.');
}

const missingGenericRecord = reduceEntityRecord(null, event({
  operationId: 'op_trash_missing_generic',
  type: 'entity.trash',
  entityType: 'admin.purchase',
  entityId: 'purchase_missing',
  payload: { expected: baseValue, at: trashAt, actorUserId: 'usr_owner' }
}, 14));
if (!missingGenericRecord.skipped || missingGenericRecord.entity) {
  throw new Error('La recuperación especial de la raíz se extendió indebidamente a registros genéricos.');
}

const purgeExpected = structuredClone(record.value);
record = reduceEntityRecord(record, event({
  operationId: 'op_purge',
  type: 'entity.purge',
  entityType: 'admin.purchase',
  entityId: 'purchase_1',
  payload: { expected: purgeExpected, conflictPolicy: 'preserve-remote' }
}, 5)).entity;
if (!record.deleted || record.value !== null) {
  throw new Error('La eliminación permanente no produjo una tumba canónica.');
}

const activeEntity = { entityType: 'admin.income', entityId: 'income_active', deleted: false, value: { description: 'Activo', amount: 10, createdAt: '2026-08-03T18:00:00.000Z' } };
const trashedEntity = { entityType: 'admin.income', entityId: 'income_trash', deleted: false, value: { description: 'Papelera', amount: 20, trashedAt: trashAt, createdAt: '2026-08-03T18:00:00.000Z' } };
const active = domain.entitiesByType([activeEntity, trashedEntity], 'admin.income');
const trash = domain.entitiesByType([activeEntity, trashedEntity], 'admin.income', { onlyTrashed: true });
if (active.length !== 1 || active[0].id !== 'income_active' || trash.length !== 1 || trash[0].id !== 'income_trash' || !trash[0].isTrashed) {
  throw new Error('El dominio administrativo mezcló registros activos con la papelera.');
}

const appSource = await fs.readFile(path.join(root, 'src/js/app.js'), 'utf8');
const indexSource = await fs.readFile(path.join(root, 'index.html'), 'utf8');
const clientSource = await fs.readFile(path.join(root, 'src/js/p2p-client.js'), 'utf8');
for (const marker of ['data-action-menu-scope', 'trash-project', 'trash-record', 'restore-project', 'restore-record', 'purge-project', 'purge-record', 'renderTrash', 'confirmPermanentProject']) {
  if (!appSource.includes(marker)) throw new Error(`La interfaz perdió el ciclo de papelera requerido: ${marker}`);
}
if (appSource.includes('data-record-action') || appSource.includes('semillaP2P.delete(')) {
  throw new Error('La interfaz conservó una ruta de eliminación inmediata fuera de la papelera.');
}
if (!appSource.includes('result = await semillaP2P.trashProjectAfterReplicas(pending.spaceId') || !appSource.includes('await refreshProjects();\n      closeDialog(elements.accessDialog); showDashboard();')) {
  throw new Error('La eliminación desde participantes no usa la papelera coordinada o no actualiza la vista antes de volver al panel.');
}
if (!appSource.includes("pending.action === 'delete-project' && error?.p2pQueued")) {
  throw new Error('La eliminación desde participantes perdió su recuperación offline y por red local.');
}
for (const marker of ['trash-button', 'trash-dialog', 'action-menu-dialog', 'action-menu-confirm-panel']) {
  if (!indexSource.includes(marker)) throw new Error(`index.html perdió la interfaz de papelera/menú: ${marker}`);
}
for (const marker of ["lifecycleOperation('entity.trash'", "lifecycleOperation('entity.restore'", "operationType: 'entity.purge'"]) {
  if (!clientSource.includes(marker)) throw new Error(`El cliente P2P perdió una operación de ciclo de vida: ${marker}`);
}

for (const marker of [
  'localLifecycleCapabilityAuthorization',
  'completedPurgeProofForSpace',
  'lifecycleReplicationPairAuthorized',
  "tombstone?.status === 'completed'",
  "status: 'prepared'",
  "status: 'completed'",
  'lifecycleStateApplied',
  "lifecycleAction === 'restore'"
]) {
  if (!clientSource.includes(marker)) throw new Error(`La recuperación idempotente P2P_sin_ perdió el contrato: ${marker}`);
}

const observerStart = clientSource.indexOf('const LIFECYCLE_FINALIZATION_OBSERVER_BASE_MS');
const observerEnd = clientSource.indexOf('export function retryAfterMilliseconds', observerStart);
if (observerStart < 0 || observerEnd <= observerStart) {
  throw new Error('No se encontró el contrato reutilizable del observador de finalización.');
}
const observerSource = clientSource.slice(observerStart, observerEnd)
  .replace('export function readySourceLifecycleTransactions', 'function readySourceLifecycleTransactions')
  .replace('export function lifecycleFinalizationObserverDelay', 'function lifecycleFinalizationObserverDelay');
const observerModuleUrl = `data:text/javascript;base64,${Buffer.from(`${observerSource}
export { readySourceLifecycleTransactions, lifecycleFinalizationObserverDelay };`).toString('base64')}`;
const { readySourceLifecycleTransactions, lifecycleFinalizationObserverDelay } = await import(observerModuleUrl);
const readyTransactions = readySourceLifecycleTransactions([
  { transactionId: 'tx_ready', spaceId: 'space_ready', role: 'source', status: 'ready' },
  { transactionId: 'tx_waiting', spaceId: 'space_waiting', role: 'source', status: 'waiting' },
  { transactionId: 'tx_target', spaceId: 'space_target', role: 'target', status: 'ready' },
  { transactionId: 'tx_completed', spaceId: 'space_completed', role: 'source', status: 'completed' },
  { transactionId: 'tx_ready', spaceId: 'space_ready', role: 'source', status: 'ready', updatedAt: 'later' }
]);
if (readyTransactions.length !== 1 || readyTransactions[0].transactionId !== 'tx_ready' || readyTransactions[0].updatedAt !== 'later') {
  throw new Error('El observador no limita su trabajo a transacciones ready del dispositivo iniciador o no deduplica reintentos.');
}
if (
  lifecycleFinalizationObserverDelay(0) !== 1500
  || lifecycleFinalizationObserverDelay(1) !== 3000
  || lifecycleFinalizationObserverDelay(99) !== 30000
) {
  throw new Error('El observador perdió su backoff acotado y podría consumir recursos de forma permanente.');
}
for (const marker of [
  'lifecycleFinalizationObserverTimer',
  'scheduleLifecycleFinalizationObserver',
  'runLifecycleFinalizationObserver',
  "apiPost('/api/p2p/lifecycle/resume'",
  '!this.realtimeLeader',
  'this.clearLifecycleFinalizationObserver()',
  'this.scheduleLifecycleFinalizationObserver({ immediate: true }, sessionContext)',
  'lifecycleTransactions: (Array.isArray(this.bootstrapState?.lifecycleTransactions)'
]) {
  if (!clientSource.includes(marker)) throw new Error(`El observador de finalización perdió una garantía requerida: ${marker}`);
}
if (clientSource.includes('setInterval(')) {
  throw new Error('El observador de finalización introdujo polling permanente.');
}

console.log('OK: menú vertical, papelera restaurable, purga permanente, métricas activas, concurrencia y observador autodesactivable del ciclo de vida P2P validados.');
