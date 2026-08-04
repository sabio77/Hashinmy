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
if (!appSource.includes('result = await semillaP2P.trash(pending.spaceId') || !appSource.includes('await refreshProjects();\n      closeDialog(elements.accessDialog); showDashboard();')) {
  throw new Error('La eliminación desde participantes no usa la papelera o no actualiza la vista antes de volver al panel.');
}
for (const marker of ['trash-button', 'trash-dialog', 'action-menu-dialog', 'action-menu-confirm-panel']) {
  if (!indexSource.includes(marker)) throw new Error(`index.html perdió la interfaz de papelera/menú: ${marker}`);
}
for (const marker of ["lifecycleOperation('entity.trash'", "lifecycleOperation('entity.restore'", "operationType: 'entity.purge'"]) {
  if (!clientSource.includes(marker)) throw new Error(`El cliente P2P perdió una operación de ciclo de vida: ${marker}`);
}

console.log('OK: menú vertical, papelera restaurable, purga permanente, métricas activas y concurrencia del ciclo de vida P2P validados.');
