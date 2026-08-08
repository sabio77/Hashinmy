import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const currentFile = fileURLToPath(import.meta.url);
const sourcePath = path.resolve(path.dirname(currentFile), '../src/js/p2p-storage.js');
const source = await fs.readFile(sourcePath, 'utf8');
const testSource = `${source}\nexport { reduceEntityRecord, discardPendingOperationRecord, reconcileEntityMissingFromSnapshot, findReferenceGuardConflictsFromRecords, findReferenceRequirementConflictsFromRecords, normalizeReferenceGuards, normalizeReferenceRequirements, normalizeDependentDeletes, applyDependentDeletes, planSnapshotSessionCleanup };`;
const moduleUrl = `data:text/javascript;base64,${Buffer.from(testSource).toString('base64')}`;
const {
  reduceEntityRecord,
  discardPendingOperationRecord,
  reconcileEntityMissingFromSnapshot,
  findReferenceGuardConflictsFromRecords,
  findReferenceRequirementConflictsFromRecords,
  normalizeReferenceGuards,
  normalizeReferenceRequirements,
  normalizeDependentDeletes,
  applyDependentDeletes,
  planSnapshotSessionCleanup,
  normalizeRecoveryRequirements,
  mergeRecoveryRequirementMaps,
  resolveRecoveryRequirementMap,
  planRecoveryRequirementUpdate,
  findRemovedSpaceIds,
  planSpaceReconciliation
} = await import(moduleUrl);


const snapshotCleanupNow = 1_000_000;
const snapshotCleanupPlan = planSnapshotSessionCleanup([
  { key: 'current-0', snapshotKey: 'space_a|request_new|device_1', spaceId: 'space_a', createdAtMs: snapshotCleanupNow - 1000 },
  { key: 'old-same-space', snapshotKey: 'space_a|request_old|device_2', spaceId: 'space_a', createdAtMs: snapshotCleanupNow - 1000 },
  { key: 'fresh-other-space', snapshotKey: 'space_b|request_b|device_3', spaceId: 'space_b', createdAtMs: snapshotCleanupNow - 1000 },
  { key: 'expired-other-space', snapshotKey: 'space_c|request_c|device_4', spaceId: 'space_c', createdAtMs: snapshotCleanupNow - 700000 }
], {
  currentSnapshotKey: 'space_a|request_new|device_1',
  spaceId: 'space_a',
  removeOtherSessions: true,
  nowMs: snapshotCleanupNow,
  maxAgeMs: 300000
});
if (!snapshotCleanupPlan.includes('old-same-space')
  || !snapshotCleanupPlan.includes('expired-other-space')
  || snapshotCleanupPlan.includes('current-0')
  || snapshotCleanupPlan.includes('fresh-other-space')) {
  throw new Error('La limpieza de snapshots no conserva solo la sesión vigente y los espacios no relacionados.');
}
const terminalSnapshotCleanup = planSnapshotSessionCleanup([
  { key: 'current-0', snapshotKey: 'space_a|request_new|device_1', spaceId: 'space_a', createdAtMs: snapshotCleanupNow - 1000 },
  { key: 'other-0', snapshotKey: 'space_b|request_b|device_3', spaceId: 'space_b', createdAtMs: snapshotCleanupNow - 1000 }
], {
  currentSnapshotKey: 'space_a|request_new|device_1',
  removeCurrent: true,
  nowMs: snapshotCleanupNow,
  maxAgeMs: 300000
});
if (terminalSnapshotCleanup.length !== 1 || terminalSnapshotCleanup[0] !== 'current-0') {
  throw new Error('Un snapshot terminalmente incompleto no libera únicamente sus propios fragmentos.');
}

function requestResult(factory) {
  const request = {};
  queueMicrotask(() => {
    try {
      request.result = factory();
      request.onsuccess?.();
    } catch (error) {
      request.error = error;
      request.onerror?.();
    }
  });
  return request;
}

function memoryEntityStore(initial = []) {
  const records = new Map(initial.map((record) => [record.key, structuredClone(record)]));
  return {
    records,
    get(key) { return requestResult(() => structuredClone(records.get(key))); },
    put(record) { return requestResult(() => { records.set(record.key, structuredClone(record)); return record.key; }); },
    delete(key) { return requestResult(() => records.delete(key)); }
  };
}

const localSpaceRecords = [
  { spaceId: 'space_keep', name: 'Conservado' },
  { spaceId: 'space_revoked', name: 'Revocado' },
  { spaceId: 'space_unconfirmed', name: 'Copia local' },
  'space_orphan_entity'
];
const removedSpaces = findRemovedSpaceIds(localSpaceRecords, ['space_revoked']);
if (removedSpaces.length !== 1 || removedSpaces[0] !== 'space_revoked') {
  throw new Error('Solo una revocación explícita debe autorizar la purga del espacio local.');
}
if (findRemovedSpaceIds(localSpaceRecords, []).length !== 0) {
  throw new Error('La ausencia de un espacio en el bootstrap no puede interpretarse como revocación.');
}

const preservedReconciliation = planSpaceReconciliation(
  localSpaceRecords.filter((space) => typeof space === 'object'),
  [{ spaceId: 'space_keep', name: 'Confirmado por backend' }],
  []
);
const confirmedSpace = preservedReconciliation.spaces.find((space) => space.spaceId === 'space_keep');
const unconfirmedSpace = preservedReconciliation.spaces.find((space) => space.spaceId === 'space_unconfirmed');
if (preservedReconciliation.removedSpaceIds.length
  || confirmedSpace?.authorizationState !== 'confirmed'
  || unconfirmedSpace?.authorizationState !== 'unconfirmed'
  || !preservedReconciliation.preservedSpaceIds.includes('space_unconfirmed')) {
  throw new Error('El bootstrap no preservó la copia local ausente en modo seguro de solo lectura.');
}

const revokedReconciliation = planSpaceReconciliation(
  localSpaceRecords.filter((space) => typeof space === 'object'),
  [{ spaceId: 'space_keep', name: 'Confirmado por backend' }],
  ['space_unconfirmed']
);
if (!revokedReconciliation.removedSpaceIds.includes('space_unconfirmed')
  || revokedReconciliation.spaces.some((space) => space.spaceId === 'space_unconfirmed')) {
  throw new Error('Una revocación explícita no retiró el espacio de la reconciliación local.');
}

const normalizedRequirements = normalizeRecoveryRequirements({
  space_1: 10,
  space_2: '12',
  empty: 0,
  invalid: 'not-a-number',
  '': 9
});
if (normalizedRequirements.space_1 !== 10
  || normalizedRequirements.space_2 !== 12
  || Object.keys(normalizedRequirements).length !== 2) {
  throw new Error('Los watermarks persistentes de recuperación no se normalizaron correctamente.');
}

const retainedRequirement = mergeRecoveryRequirementMaps({ space_1: 10 }, {});
if (retainedRequirement.space_1 !== 10) {
  throw new Error('Una revisión máxima posterior borró una recuperación pendiente sin snapshot verificado.');
}
const mergedRequirement = mergeRecoveryRequirementMaps({ space_1: 10 }, { space_1: 8, space_2: 12 });
if (mergedRequirement.space_1 !== 10 || mergedRequirement.space_2 !== 12) {
  throw new Error('Los watermarks de recuperación pudieron retroceder o perder otro espacio pendiente.');
}
const unresolvedRequirement = resolveRecoveryRequirementMap(mergedRequirement, 'space_1', 9);
if (unresolvedRequirement.space_1 !== 10) {
  throw new Error('Un snapshot atrasado cerró indebidamente una recuperación pendiente.');
}
const resolvedRequirement = resolveRecoveryRequirementMap(unresolvedRequirement, 'space_1', 10);
if ('space_1' in resolvedRequirement || resolvedRequirement.space_2 !== 12) {
  throw new Error('Un snapshot completo no resolvió únicamente el watermark cubierto.');
}
const reconciledRequirements = planRecoveryRequirementUpdate(
  { space_1: 10, space_2: 12, removed_space: 7 },
  {
    appliedStateRevisions: { space_1: 10, space_2: 11 },
    retainSpaceIds: ['space_1', 'space_2'],
    required: { space_1: 14 }
  }
);
if (reconciledRequirements.space_1 !== 14
  || reconciledRequirements.space_2 !== 12
  || 'removed_space' in reconciledRequirements) {
  throw new Error('La reconciliación de watermarks no limpió revisiones satisfechas o perdió brechas nuevas.');
}

function event(operation, revision = 0, optimistic = false) {
  return {
    eventType: 'p2p.operation',
    spaceId: 'space_1',
    actorUserId: optimistic ? 'usr_local' : 'usr_server',
    sourceDeviceId: optimistic ? 'dev_local' : 'dev_remote',
    spaceSequence: revision,
    stateRevision: revision,
    optimistic,
    createdAt: `2026-07-28T00:00:${String(revision).padStart(2, '0')}.000Z`,
    operation
  };
}

const baseOperation = {
  operationId: 'op_base',
  type: 'entity.put',
  entityType: 'note',
  entityId: 'n1',
  payload: { value: { a: 0 } }
};
let record = reduceEntityRecord(null, event(baseOperation, 1)).entity;
if (record.value.a !== 0 || record.optimistic) throw new Error('No se creó la base confirmada.');

const legacyTechnicalRoot = {
  key: 'space_1|admin.project|project_root',
  spaceId: 'space_1',
  entityType: 'admin.project',
  entityId: 'project_root',
  value: { name: 'Espacio compartido', initialBudget: 0 },
  deleted: false,
  optimistic: false,
  stateRevision: 0,
  spaceSequence: 0
};
const authoritativeRootAtZero = event({
  operationId: 'snapshot_root_zero',
  type: 'entity.put',
  entityType: 'admin.project',
  entityId: 'project_root',
  payload: { value: { name: 'Proyecto real', initialBudget: 25000000 } }
}, 0, false);
const repairedLegacyRoot = reduceEntityRecord(legacyTechnicalRoot, authoritativeRootAtZero, { authoritativeSnapshot: true });
if (!repairedLegacyRoot.applied
  || repairedLegacyRoot.entity?.optimistic
  || repairedLegacyRoot.entity?.value?.name !== 'Proyecto real'
  || repairedLegacyRoot.entity?.value?.initialBudget !== 25000000
  || repairedLegacyRoot.entity?.pendingOperations?.length) {
  throw new Error('Un snapshot autoritativo con revisión 0 no reparó una raíz técnica legacy del proyecto.');
}

const staleTechnicalProjectRoot = reduceEntityRecord(null, event({
  operationId: 'legacy_project_root_high_revision',
  type: 'entity.put',
  entityType: 'admin.project',
  entityId: 'project',
  payload: {
    value: {
      name: 'Espacio compartido',
      initialBudget: 0,
      createdAt: '2026-07-28T00:00:05.000Z',
      updatedAt: '2026-07-28T00:00:05.000Z'
    }
  }
}, 5)).entity;
const repairedStaleTechnicalProjectRoot = reduceEntityRecord(staleTechnicalProjectRoot, event({
  operationId: 'snapshot_project_root_legacy_revision_zero',
  type: 'entity.put',
  entityType: 'admin.project',
  entityId: 'project',
  payload: {
    value: {
      name: 'Proyecto invitado real',
      description: 'Datos autoritativos del dispositivo que invita',
      address: 'Calle 10',
      initialBudget: 42000000,
      createdAt: '2026-07-20T15:00:00.000Z',
      updatedAt: '2026-07-20T15:00:00.000Z'
    }
  }
}, 0), { authoritativeSnapshot: true });
if (!repairedStaleTechnicalProjectRoot.applied
  || repairedStaleTechnicalProjectRoot.entity?.value?.name !== 'Proyecto invitado real'
  || repairedStaleTechnicalProjectRoot.entity?.value?.initialBudget !== 42000000) {
  throw new Error('Una revisión local legacy inflada impidió reparar la raíz técnica con el snapshot autoritativo válido.');
}

const corruptSameRevision = reduceEntityRecord(null, event({
  operationId: 'same_revision_corrupt',
  type: 'entity.put',
  entityType: 'admin.project',
  entityId: 'same_revision',
  payload: { value: { name: 'Copia técnica', initialBudget: 1 } }
}, 8)).entity;
const repairedSameRevision = reduceEntityRecord(corruptSameRevision, event({
  operationId: 'snapshot_same_revision',
  type: 'entity.put',
  entityType: 'admin.project',
  entityId: 'same_revision',
  payload: { value: { name: 'Proyecto autoritativo', initialBudget: 98000000 } }
}, 8), { authoritativeSnapshot: true });
if (!repairedSameRevision.applied
  || repairedSameRevision.entity?.value?.name !== 'Proyecto autoritativo'
  || repairedSameRevision.entity?.value?.initialBudget !== 98000000) {
  throw new Error('Un snapshot autoritativo no pudo corregir una copia local dañada en la misma revisión.');
}
const preservedNewerRevision = reduceEntityRecord(repairedSameRevision.entity, event({
  operationId: 'snapshot_older_revision',
  type: 'entity.put',
  entityType: 'admin.project',
  entityId: 'same_revision',
  payload: { value: { name: 'Snapshot atrasado', initialBudget: 10 } }
}, 7), { authoritativeSnapshot: true });
if (preservedNewerRevision.applied
  || preservedNewerRevision.reason !== 'stale'
  || preservedNewerRevision.entity?.value?.name !== 'Proyecto autoritativo') {
  throw new Error('Un snapshot autoritativo atrasado sustituyó una revisión local realmente más nueva.');
}

const customOperation = {
  operationId: 'op_custom_durable',
  type: 'custom',
  entityType: 'crdt-log',
  entityId: 'change-1',
  payload: { delta: { insert: 'A' }, clock: 1 }
};
let customRecord = reduceEntityRecord(null, event(customOperation, 4)).entity;
if (!customRecord
  || customRecord.operationType !== 'custom'
  || customRecord.value?.delta?.insert !== 'A'
  || customRecord.stateRevision !== 4
  || customRecord.optimistic) {
  throw new Error('La operación custom no quedó como estado durable reconstruible.');
}
const customPending = {
  ...customOperation,
  operationId: 'op_custom_pending',
  payload: { delta: { insert: 'B' }, clock: 2 }
};
customRecord = reduceEntityRecord(customRecord, event(customPending, 0, true)).entity;
if (!customRecord.optimistic || customRecord.value?.delta?.insert !== 'B') {
  throw new Error('La operación custom offline no creó una capa optimista durable.');
}
const customRollback = discardPendingOperationRecord(customRecord, customPending);
if (!customRollback.reverted
  || customRollback.entity?.optimistic
  || customRollback.entity?.operationType !== 'custom'
  || customRollback.entity?.value?.delta?.insert !== 'A') {
  throw new Error('El rechazo de una operación custom no restauró su base canónica.');
}

const acceptedPatch = {
  operationId: 'op_accepted',
  type: 'entity.patch',
  entityType: 'note',
  entityId: 'n1',
  payload: { patch: { a: 1 } }
};
record = reduceEntityRecord(record, event(acceptedPatch, 0, true)).entity;
const rejectedPatch = {
  operationId: 'op_rejected',
  type: 'entity.patch',
  entityType: 'note',
  entityId: 'n1',
  payload: { patch: { rejected: true } }
};
record = reduceEntityRecord(record, event(rejectedPatch, 0, true)).entity;
if (!record.optimistic || record.pendingOperations.length !== 2 || !record.value.rejected) {
  throw new Error('No se materializaron las capas optimistas.');
}

record = reduceEntityRecord(record, event(acceptedPatch, 2)).entity;
if (!record.optimistic || record.pendingOperations.length !== 1 || record.confirmedValue.a !== 1 || !record.value.rejected) {
  throw new Error('La confirmación no separó la base canónica de la operación pendiente.');
}

const rollback = discardPendingOperationRecord(record, rejectedPatch);
record = rollback.entity;
if (!rollback.reverted || record.optimistic || record.pendingOperations.length || record.value.rejected || record.value.a !== 1) {
  throw new Error('La operación rechazada contaminó el estado confirmado.');
}

const rejectedCreation = {
  operationId: 'op_new',
  type: 'entity.put',
  entityType: 'task',
  entityId: 'new',
  payload: { value: { title: 'Temporal' } }
};
const temporaryRecord = reduceEntityRecord(null, event(rejectedCreation, 0, true)).entity;
const removed = discardPendingOperationRecord(temporaryRecord, rejectedCreation);
if (!removed.reverted || removed.entity !== null) {
  throw new Error('Una creación rechazada no fue eliminada localmente.');
}

const localPatch = {
  operationId: 'op_local',
  type: 'entity.patch',
  entityType: 'note',
  entityId: 'n1',
  payload: { patch: { local: 1 } }
};
record = reduceEntityRecord(record, event(localPatch, 0, true)).entity;
const remotePatch = {
  operationId: 'op_remote',
  type: 'entity.patch',
  entityType: 'note',
  entityId: 'n1',
  payload: { patch: { remote: 2 } }
};
record = reduceEntityRecord(record, event(remotePatch, 3)).entity;
if (record.confirmedValue.remote !== 2 || record.confirmedValue.local || record.value.local !== 1 || record.value.remote !== 2) {
  throw new Error('La operación remota no conservó correctamente la superposición local pendiente.');
}

const concurrentBase = {
  operationId: 'op_concurrent_base',
  type: 'entity.put',
  entityType: 'card',
  entityId: 'c1',
  payload: { value: { base: true } }
};
let concurrent = reduceEntityRecord(null, event(concurrentBase, 1)).entity;
const localFirst = {
  operationId: 'op_local_first',
  type: 'entity.patch',
  entityType: 'card',
  entityId: 'c1',
  payload: { patch: { first: 1 } }
};
const localSecond = {
  operationId: 'op_local_second',
  type: 'entity.patch',
  entityType: 'card',
  entityId: 'c1',
  payload: { patch: { second: 2 } }
};
concurrent = reduceEntityRecord(concurrent, event(localFirst, 0, true)).entity;
concurrent = reduceEntityRecord(concurrent, event(localSecond, 0, true)).entity;
concurrent = reduceEntityRecord(concurrent, event(localSecond, 2)).entity;
if (concurrent.confirmedValue.second !== 2 || concurrent.value.first !== 1 || concurrent.pendingOperations.length !== 1) {
  throw new Error('La confirmación canónica en orden del servidor no rebasó la operación local restante.');
}
concurrent = reduceEntityRecord(concurrent, event(localFirst, 3)).entity;
if (concurrent.optimistic || concurrent.pendingOperations.length || concurrent.value.first !== 1 || concurrent.value.second !== 2) {
  throw new Error('Las confirmaciones canónicas con orden distinto al inicio local no convergieron.');
}

const conflictBase = {
  operationId: 'op_conflict_base',
  type: 'entity.put',
  entityType: 'admin.project',
  entityId: 'project',
  payload: { value: { name: 'Inicial', address: 'Calle 1', description: 'Base' } }
};
let conflictRecord = reduceEntityRecord(null, event(conflictBase, 10)).entity;
const localConditionalPatch = {
  operationId: 'op_local_conditional',
  type: 'entity.patch',
  entityType: 'admin.project',
  entityId: 'project',
  payload: {
    patch: { name: 'Nombre local', description: 'Descripción local' },
    expected: { name: 'Inicial', description: 'Base' },
    conflictPolicy: 'preserve-remote'
  }
};
conflictRecord = reduceEntityRecord(conflictRecord, event(localConditionalPatch, 0, true)).entity;
const remoteConcurrentPatch = {
  operationId: 'op_remote_concurrent',
  type: 'entity.patch',
  entityType: 'admin.project',
  entityId: 'project',
  payload: { patch: { name: 'Nombre remoto', address: 'Calle 2' } }
};
conflictRecord = reduceEntityRecord(conflictRecord, event(remoteConcurrentPatch, 11)).entity;
if (conflictRecord.value.name !== 'Nombre remoto'
  || conflictRecord.value.description !== 'Descripción local'
  || conflictRecord.value.address !== 'Calle 2') {
  throw new Error('La capa optimista condicional no preservó el campo remoto concurrente.');
}
const conditionalConfirmation = reduceEntityRecord(conflictRecord, event(localConditionalPatch, 12));
conflictRecord = conditionalConfirmation.entity;
if (conditionalConfirmation.conflicts?.length !== 1
  || conditionalConfirmation.conflicts[0].field !== 'name'
  || conflictRecord.value.name !== 'Nombre remoto'
  || conflictRecord.value.description !== 'Descripción local'
  || conflictRecord.value.address !== 'Calle 2'
  || conflictRecord.optimistic) {
  throw new Error('Una edición concurrente sobrescribió silenciosamente un campo remoto más reciente.');
}

const deleteBase = {
  operationId: 'op_delete_base',
  type: 'entity.put',
  entityType: 'admin.purchase',
  entityId: 'purchase_safe_delete',
  payload: { value: { description: 'Material inicial', amount: 100, invoiceNumber: 'F-1' } }
};
let deleteRecord = reduceEntityRecord(null, event(deleteBase, 20)).entity;
const guardedDelete = {
  operationId: 'op_guarded_delete',
  type: 'entity.delete',
  entityType: 'admin.purchase',
  entityId: 'purchase_safe_delete',
  payload: {
    expected: { description: 'Material inicial', amount: 100, invoiceNumber: 'F-1' },
    conflictPolicy: 'preserve-remote'
  }
};
deleteRecord = reduceEntityRecord(deleteRecord, event(guardedDelete, 0, true)).entity;
if (!deleteRecord.deleted || !deleteRecord.optimistic) {
  throw new Error('La eliminación condicional no produjo su capa optimista local.');
}
const remoteBeforeDelete = {
  operationId: 'op_remote_before_delete',
  type: 'entity.patch',
  entityType: 'admin.purchase',
  entityId: 'purchase_safe_delete',
  payload: { patch: { amount: 145, invoiceNumber: 'F-2' } }
};
deleteRecord = reduceEntityRecord(deleteRecord, event(remoteBeforeDelete, 21)).entity;
if (deleteRecord.deleted || deleteRecord.value?.amount !== 145 || deleteRecord.value?.invoiceNumber !== 'F-2') {
  throw new Error('Una edición remota posterior no pudo recuperar el registro frente a una eliminación local desactualizada.');
}
const guardedDeleteConfirmation = reduceEntityRecord(deleteRecord, event(guardedDelete, 22));
deleteRecord = guardedDeleteConfirmation.entity;
if (guardedDeleteConfirmation.conflicts?.length !== 1
  || guardedDeleteConfirmation.conflicts[0].field !== '__entity__'
  || deleteRecord.deleted
  || deleteRecord.value?.amount !== 145
  || deleteRecord.value?.invoiceNumber !== 'F-2'
  || deleteRecord.optimistic) {
  throw new Error('Una eliminación desactualizada borró silenciosamente un registro modificado por otro colaborador.');
}
const freshGuardedDelete = {
  ...guardedDelete,
  operationId: 'op_fresh_guarded_delete',
  payload: {
    expected: { description: 'Material inicial', amount: 145, invoiceNumber: 'F-2' },
    conflictPolicy: 'preserve-remote'
  }
};
const acceptedDelete = reduceEntityRecord(deleteRecord, event(freshGuardedDelete, 23));
if (acceptedDelete.conflicts?.length || !acceptedDelete.entity?.deleted || acceptedDelete.entity?.optimistic) {
  throw new Error('Una eliminación condicional basada en la versión vigente no fue aplicada.');
}


const projectionBase = {
  operationId: 'op_projection_base',
  type: 'entity.put',
  entityType: 'admin.projection',
  entityId: 'projection_linked',
  payload: { value: { description: 'Acero', projectedAmount: 1000 } }
};
const linkedPurchaseBase = {
  operationId: 'op_linked_purchase',
  type: 'entity.put',
  entityType: 'admin.purchase',
  entityId: 'purchase_linked',
  payload: { value: { description: 'Factura real', amount: 1100, projectionId: 'projection_linked' } }
};
let linkedProjectionRecord = reduceEntityRecord(null, event(projectionBase, 30)).entity;
const linkedPurchaseRecord = reduceEntityRecord(null, event(linkedPurchaseBase, 31)).entity;
const referenceGuardedDelete = {
  operationId: 'op_reference_guarded_delete',
  type: 'entity.delete',
  entityType: 'admin.projection',
  entityId: 'projection_linked',
  payload: {
    expected: { description: 'Acero', projectedAmount: 1000 },
    conflictPolicy: 'preserve-remote',
    referenceGuards: [{ entityType: 'admin.purchase', field: 'projectionId', equals: 'projection_linked' }]
  }
};
const normalizedGuards = normalizeReferenceGuards([
  ...referenceGuardedDelete.payload.referenceGuards,
  { entityType: 'admin.purchase', field: '__proto__.polluted', equals: {} }
]);
if (normalizedGuards.length !== 1 || normalizedGuards[0].field !== 'projectionId') {
  throw new Error('Las guardas referenciales no limitaron o normalizaron su contrato seguro.');
}
const referenceConflicts = findReferenceGuardConflictsFromRecords(
  [linkedProjectionRecord, linkedPurchaseRecord],
  event(referenceGuardedDelete, 0, true)
);
if (referenceConflicts.length !== 1
  || referenceConflicts[0].field !== '__reference__'
  || referenceConflicts[0].referenceEntityId !== 'purchase_linked') {
  throw new Error('No se detectó la compra activa que protege la proyección vinculada.');
}
linkedProjectionRecord = reduceEntityRecord(
  linkedProjectionRecord,
  event({ ...referenceGuardedDelete, referenceConflicts }, 0, true)
).entity;
if (linkedProjectionRecord.deleted || !linkedProjectionRecord.optimistic) {
  throw new Error('La guarda referencial no preservó la proyección durante la capa optimista.');
}
const canonicalReferenceConflict = reduceEntityRecord(
  linkedProjectionRecord,
  event({ ...referenceGuardedDelete, referenceConflicts }, 32)
);
linkedProjectionRecord = canonicalReferenceConflict.entity;
if (canonicalReferenceConflict.conflicts?.[0]?.field !== '__reference__'
  || !canonicalReferenceConflict.skipped
  || linkedProjectionRecord.deleted
  || linkedProjectionRecord.optimistic) {
  throw new Error('La confirmación ordenada eliminó una proyección todavía referenciada por una compra real.');
}

const strictProjectionRecord = reduceEntityRecord(null, event({
  operationId: 'op_strict_projection',
  type: 'entity.put',
  entityType: 'admin.projection',
  entityId: 'projection_strict',
  payload: { value: { description: 'Concreto', projectedAmount: 2000 } }
}, 33)).entity;
const strictProjectionLinkRecord = reduceEntityRecord(null, event({
  operationId: 'op_strict_projection_link',
  type: 'entity.put',
  entityType: 'admin.projection-link',
  entityId: 'purchase_strict',
  payload: {
    value: { purchaseId: 'purchase_strict', projectionId: 'projection_strict', active: true },
    referenceRequirements: [{ entityType: 'admin.projection', entityId: 'projection_strict' }]
  }
}, 34)).entity;
const strictDeleteOperation = {
  operationId: 'op_strict_projection_delete',
  type: 'entity.delete',
  entityType: 'admin.projection',
  entityId: 'projection_strict',
  payload: {
    expected: { description: 'Concreto', projectedAmount: 2000 },
    conflictPolicy: 'preserve-remote',
    referenceGuards: [{ entityType: 'admin.projection-link', field: 'projectionId', equals: 'projection_strict' }]
  }
};
const strictDeleteConflicts = findReferenceGuardConflictsFromRecords(
  [strictProjectionRecord, strictProjectionLinkRecord],
  event(strictDeleteOperation, 35)
);
if (strictDeleteConflicts.length !== 1
  || strictDeleteConflicts[0].referenceEntityType !== 'admin.projection-link'
  || strictDeleteConflicts[0].referenceEntityId !== 'purchase_strict') {
  throw new Error('El vínculo administrativo separado no protegió la proyección frente a una eliminación concurrente.');
}

const purchaseWithDependentDelete = {
  operationId: 'op_purchase_delete_with_link',
  type: 'entity.delete',
  entityType: 'admin.purchase',
  entityId: 'purchase_cascade',
  dependentDeletes: [{
    entityType: 'admin.projection-link',
    entityId: 'purchase_cascade',
    relation: 'admin.purchase-projection-link-v1'
  }],
  payload: { expected: { description: 'Compra vinculada', amount: 1250 }, conflictPolicy: 'preserve-remote' }
};
const normalizedDependentDeletes = normalizeDependentDeletes([
  ...purchaseWithDependentDelete.dependentDeletes,
  { entityType: 'admin.projection', entityId: 'purchase_cascade', relation: 'invalid' }
], purchaseWithDependentDelete);
if (normalizedDependentDeletes.length !== 1
  || normalizedDependentDeletes[0].entityType !== 'admin.projection-link') {
  throw new Error('La eliminación dependiente aceptó una relación que permitiría borrar entidades ajenas al vínculo compra-proyección.');
}
const cascadePurchaseRecord = reduceEntityRecord(null, event({
  operationId: 'op_purchase_cascade_base',
  type: 'entity.put',
  entityType: 'admin.purchase',
  entityId: 'purchase_cascade',
  payload: { value: { description: 'Compra vinculada', amount: 1250 } }
}, 40)).entity;
const cascadeLinkRecord = reduceEntityRecord(null, event({
  operationId: 'op_purchase_cascade_link',
  type: 'entity.put',
  entityType: 'admin.projection-link',
  entityId: 'purchase_cascade',
  payload: { value: { purchaseId: 'purchase_cascade', projectionId: 'projection_cascade', active: true } }
}, 41)).entity;
const cascadeSourceResult = reduceEntityRecord(cascadePurchaseRecord, event(purchaseWithDependentDelete, 42));
const cascadeStore = memoryEntityStore([cascadeLinkRecord]);
const cascadeResult = await applyDependentDeletes(
  cascadeStore,
  event(purchaseWithDependentDelete, 42),
  cascadeSourceResult,
  true
);
const cascadedLink = cascadeStore.records.get(cascadeLinkRecord.key);
if (cascadeResult.applied !== 1
  || !cascadedLink?.deleted
  || cascadedLink?.optimistic
  || cascadedLink?.confirmedOperationId !== purchaseWithDependentDelete.operationId) {
  throw new Error('Eliminar una compra no retiró atómicamente su vínculo de proyección en la réplica canónica.');
}

const optimisticCascadeStore = memoryEntityStore([cascadeLinkRecord]);
const optimisticSourceResult = reduceEntityRecord(cascadePurchaseRecord, event(purchaseWithDependentDelete, 0, true));
await applyDependentDeletes(
  optimisticCascadeStore,
  event(purchaseWithDependentDelete, 0, true),
  optimisticSourceResult,
  true
);
const optimisticCascadedLink = optimisticCascadeStore.records.get(cascadeLinkRecord.key);
if (!optimisticCascadedLink?.deleted || !optimisticCascadedLink?.optimistic) {
  throw new Error('La eliminación dependiente no acompañó la capa optimista de la compra.');
}
const skippedSourceResult = {
  applied: true,
  skipped: true,
  entity: cascadePurchaseRecord,
  conflicts: [{ field: '__entity__' }]
};
const revertedCascade = await applyDependentDeletes(
  optimisticCascadeStore,
  event(purchaseWithDependentDelete, 43),
  skippedSourceResult,
  true
);
const restoredLink = optimisticCascadeStore.records.get(cascadeLinkRecord.key);
if (revertedCascade.reverted !== 1 || restoredLink?.deleted || restoredLink?.optimistic) {
  throw new Error('El rechazo canónico de una compra no restauró su vínculo eliminado de forma optimista.');
}

const normalizedReferenceRequirements = normalizeReferenceRequirements([
  { entityType: 'admin.projection', entityId: 'projection_strict' },
  { entityType: 'admin.projection', entityId: 'projection_strict' },
  { entityType: '', entityId: 'invalid' }
]);
if (normalizedReferenceRequirements.length !== 1
  || normalizedReferenceRequirements[0].entityId !== 'projection_strict') {
  throw new Error('Los requisitos referenciales de alta no se normalizaron ni deduplicaron.');
}
const deletedProjectionRecord = reduceEntityRecord(strictProjectionRecord, event({
  operationId: 'op_projection_deleted_first',
  type: 'entity.delete',
  entityType: 'admin.projection',
  entityId: 'projection_strict',
  payload: { expected: { description: 'Concreto', projectedAmount: 2000 }, conflictPolicy: 'preserve-remote' }
}, 36)).entity;
const lateLinkOperation = {
  operationId: 'op_late_projection_link',
  type: 'entity.put',
  entityType: 'admin.projection-link',
  entityId: 'purchase_late',
  payload: {
    value: { purchaseId: 'purchase_late', projectionId: 'projection_strict', active: true },
    referenceRequirements: [{ entityType: 'admin.projection', entityId: 'projection_strict' }]
  }
};
const missingReferenceConflicts = findReferenceRequirementConflictsFromRecords(
  [deletedProjectionRecord],
  event(lateLinkOperation, 37)
);
if (missingReferenceConflicts.length !== 1
  || missingReferenceConflicts[0].field !== '__reference_required__'
  || missingReferenceConflicts[0].referenceEntityId !== 'projection_strict') {
  throw new Error('Un vínculo tardío no detectó que su proyección ya había sido eliminada.');
}
const rejectedLateLink = reduceEntityRecord(
  null,
  event({ ...lateLinkOperation, referenceConflicts: missingReferenceConflicts }, 37)
);
if (!rejectedLateLink.skipped || rejectedLateLink.entity !== null) {
  throw new Error('La réplica materializó un vínculo hacia una proyección eliminada.');
}

const ghostOperation = {
  operationId: 'op_ghost',
  type: 'entity.put',
  entityType: 'note',
  entityId: 'ghost',
  payload: { value: { stale: true } }
};
const ghostRecord = reduceEntityRecord(null, event(ghostOperation, 2)).entity;
const removedGhost = reconcileEntityMissingFromSnapshot(ghostRecord, 5);
if (!removedGhost.changed || removedGhost.entity !== null) {
  throw new Error('Una copia completa no eliminó una entidad canónica ausente en la réplica fuente.');
}

const newerRecord = reduceEntityRecord(null, event({ ...ghostOperation, operationId: 'op_newer' }, 6)).entity;
const preservedNewer = reconcileEntityMissingFromSnapshot(newerRecord, 5);
if (preservedNewer.changed || preservedNewer.entity?.stateRevision !== 6) {
  throw new Error('Una copia atrasada eliminó una entidad canónica local más reciente.');
}

const pendingAfterGhost = {
  operationId: 'op_pending_after_ghost',
  type: 'entity.patch',
  entityType: 'note',
  entityId: 'ghost',
  payload: { patch: { localPending: true } }
};
const ghostWithPending = reduceEntityRecord(ghostRecord, event(pendingAfterGhost, 0, true)).entity;
const reconciledPending = reconcileEntityMissingFromSnapshot(ghostWithPending, 5);
if (!reconciledPending.changed
  || !reconciledPending.entity?.optimistic
  || reconciledPending.entity?.confirmedExists
  || reconciledPending.entity?.value?.localPending !== true) {
  throw new Error('La reconciliación exacta eliminó una operación local todavía pendiente.');
}

console.log('OK: estado canónico/optimista, edición y eliminación concurrentes seguras, custom durable, reversión, limpieza por revocación, snapshots exactos, limpieza de sesiones incompletas y watermarks persistentes de recuperación.');

const rebindFunctionStart = source.indexOf('export async function rebindLocalDeviceId');
const rebindFunctionEnd = source.indexOf('export async function removeOutbox', rebindFunctionStart);
if (rebindFunctionStart < 0 || rebindFunctionEnd <= rebindFunctionStart) {
  throw new Error('No se pudo aislar la migración local de identidad del dispositivo.');
}
const isolatedRebindSource = `
const STORES = { outbox: 'outbox', entities: 'entities' };
const rows = {
  outbox: [
    { operationId: 'op_rebind', request: { deviceId: 'dev_old', operation: { operationId: 'op_rebind' } } },
    { operationId: 'op_keep', request: { deviceId: 'dev_other', operation: { operationId: 'op_keep' } } }
  ],
  entities: [
    {
      key: 'space|note|1',
      confirmedSourceDeviceId: 'dev_old',
      unresolvedSourceDeviceId: 'dev_old',
      pendingOperations: [
        { operation: { operationId: 'op_rebind' }, sourceDeviceId: 'dev_old' },
        { operation: { operationId: 'op_remote' }, sourceDeviceId: 'dev_remote' }
      ]
    },
    { key: 'space|note|2', confirmedSourceDeviceId: 'dev_remote', pendingOperations: [] }
  ]
};
const clone = (value) => structuredClone(value);
const requestToPromise = async (request) => request;
const storeFor = (name) => ({
  getAll: () => clone(rows[name]),
  put: (value) => {
    const keyName = name === STORES.outbox ? 'operationId' : 'key';
    const index = rows[name].findIndex((entry) => entry[keyName] === value[keyName]);
    if (index >= 0) rows[name][index] = clone(value);
    else rows[name].push(clone(value));
    return value;
  }
});
const withStores = async (names, _mode, callback) => callback(Object.fromEntries(names.map((name) => [name, storeFor(name)])));
${source.slice(rebindFunctionStart, rebindFunctionEnd).replace('export async function rebindLocalDeviceId', 'async function rebindLocalDeviceId')}
export { rebindLocalDeviceId, rows };
`;
const rebindModuleUrl = `data:text/javascript;base64,${Buffer.from(isolatedRebindSource).toString('base64')}`;
const { rebindLocalDeviceId: rebindLocalIdentity, rows: reboundRows } = await import(rebindModuleUrl);
const rebindResult = await rebindLocalIdentity('dev_old', 'dev_new');
if (rebindResult.outbox !== 1
  || rebindResult.entities !== 1
  || reboundRows.outbox.find((item) => item.operationId === 'op_rebind')?.request?.deviceId !== 'dev_new'
  || reboundRows.outbox.find((item) => item.operationId === 'op_keep')?.request?.deviceId !== 'dev_other'
  || reboundRows.entities[0]?.pendingOperations?.[0]?.sourceDeviceId !== 'dev_new'
  || reboundRows.entities[0]?.pendingOperations?.[1]?.sourceDeviceId !== 'dev_remote'
  || reboundRows.entities[0]?.unresolvedSourceDeviceId !== 'dev_new'
  || reboundRows.entities[0]?.confirmedSourceDeviceId !== 'dev_old') {
  throw new Error('La migración de deviceId no conservó de forma atómica el outbox y las capas optimistas correctas.');
}

console.log('OK: la migración local de deviceId religa solo operaciones pendientes y conserva el historial canónico.');

const clientSourcePath = path.resolve(path.dirname(currentFile), '../src/js/p2p-client.js');
const clientSource = await fs.readFile(clientSourcePath, 'utf8');
const clientClassStart = clientSource.indexOf('export class SemillaP2PClient');
const clientClassEnd = clientSource.indexOf('export const semillaP2P');
if (clientClassStart < 0 || clientClassEnd <= clientClassStart) {
  throw new Error('No se pudo aislar el cliente P2P para validar el cambio seguro de cuenta.');
}
const isolatedClientSource = `
const DEFAULT_EVENT_MAX_BYTES = 262144;
const DEFAULT_ENTITY_MAX_BYTES = 131072;
const DEFAULT_SNAPSHOT_MAX_BYTES = 1024 * 1024;
const DEFAULT_SNAPSHOT_TRANSFER_MAX_BYTES = 1536 * 1024;
const DEFAULT_SNAPSHOT_MAX_CHUNKS = 500;
const SNAPSHOT_TRANSFER_EVENT_OVERHEAD_BYTES = 2 * 1024;
const RETRY_BASE_MS = 1000;
const LIFECYCLE_FINALIZATION_OBSERVER_BASE_MS = 1500;
const LIFECYCLE_FINALIZATION_OBSERVER_MAX_MS = 30000;
const LIFECYCLE_RECEIPT_META_KEY = 'p2pLifecycleReceipts';
const LIFECYCLE_RECEIPT_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const LIFECYCLE_RECEIPT_MAX = 256;
const LOCAL_LIFECYCLE_TOMBSTONE_META_KEY = 'p2pLocalLifecycleTombstones';
const LOCAL_LIFECYCLE_TOMBSTONE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const LOCAL_LIFECYCLE_TOMBSTONE_MAX = 256;
const readySourceLifecycleTransactions = (transactions = []) => {
  const ready = new Map();
  for (const transaction of Array.isArray(transactions) ? transactions : []) {
    const transactionId = String(transaction?.transactionId || '').trim();
    const spaceId = String(transaction?.spaceId || '').trim();
    if (
      !transactionId
      || !spaceId
      || String(transaction?.role || '').trim() !== 'source'
      || String(transaction?.status || '').trim() !== 'ready'
    ) continue;
    ready.set(transactionId, { ...transaction, transactionId, spaceId });
  }
  return [...ready.values()];
};
const lifecycleFinalizationObserverDelay = (attempt = 0) => {
  const normalizedAttempt = Math.min(8, Math.max(0, Math.floor(Number(attempt || 0))));
  return Math.min(
    LIFECYCLE_FINALIZATION_OBSERVER_MAX_MS,
    LIFECYCLE_FINALIZATION_OBSERVER_BASE_MS * (2 ** normalizedAttempt)
  );
};
const CURSOR_META_PREFIX = 'cursor:';
const pendingApiCalls = [];
const createdEventSources = [];
let outboxItems = [];
const removedOutboxIds = [];
const purgedSpaceIds = [];
const dispatchedEvents = [];
const reboundDeviceIds = [];
const pushBindingUpdates = [];
let storedDeviceId = '';
const windowListeners = new Map();
const apiPost = (endpoint, payload) => new Promise((resolve, reject) => pendingApiCalls.push({ endpoint, payload, resolve, reject }));
let activeSessionToken = 'test-session-token';
const getSessionToken = () => activeSessionToken;
const setActiveSessionToken = (token = '') => { activeSessionToken = String(token || ''); };
const isSessionChangedError = () => false;
const metaRecords = new Map();
const getMeta = async (key, fallback = null) => metaRecords.has(key) ? structuredClone(metaRecords.get(key)) : structuredClone(fallback);
const setMeta = async (key, value) => { metaRecords.set(key, structuredClone(value)); return value; };
const listSpaces = async () => [];
const saveSpaces = async () => {};
const listStateRevisions = async () => ({});
const enqueueOutbox = async (item) => {
  const index = outboxItems.findIndex((candidate) => candidate.operationId === item.operationId);
  if (index >= 0) outboxItems[index] = structuredClone(item);
  else outboxItems.push(structuredClone(item));
  return item;
};
const listOutbox = async () => outboxItems.map((item) => ({ ...item, request: { ...(item.request || {}) } }));
const removeOutbox = async (operationId) => {
  removedOutboxIds.push(operationId);
  outboxItems = outboxItems.filter((item) => item.operationId !== operationId);
  return true;
};
const purgeLocalSpace = async (spaceId) => {
  purgedSpaceIds.push(spaceId);
  return { spaceId, purged: true };
};
const getRecoveryRequirements = async () => ({});
const updateRecoveryRequirements = async () => ({});
const setOutboxItems = (items) => {
  outboxItems = (items || []).map((item) => ({ ...item, request: { ...(item.request || {}) } }));
  removedOutboxIds.length = 0;
};
const getOutboxItems = () => outboxItems.map((item) => ({ ...item, request: { ...(item.request || {}) } }));
const setStoredDeviceId = (deviceId = '') => { storedDeviceId = String(deviceId || '').trim(); };
const rotateStoredDeviceId = (_userId = '', expectedDeviceId = '') => {
  const expected = String(expectedDeviceId || '').trim();
  if (storedDeviceId && expected && storedDeviceId !== expected) return storedDeviceId;
  storedDeviceId = 'dev_rotated_identity';
  return storedDeviceId;
};
const isDeviceIdentityConflict = (error = null) => String(error?.code || '').trim().toUpperCase() === 'P2P_DEVICE_IDENTITY_CONFLICT';
const rebindLocalDeviceId = async (previousDeviceId = '', nextDeviceId = '') => {
  reboundDeviceIds.push({ previousDeviceId, nextDeviceId });
  let changed = 0;
  outboxItems = outboxItems.map((item) => {
    if (String(item?.request?.deviceId || '').trim() !== String(previousDeviceId || '').trim()) return item;
    changed += 1;
    return { ...item, request: { ...(item.request || {}), deviceId: nextDeviceId } };
  });
  return { outbox: changed, entities: 0 };
};
const updateServiceWorkerPushAccountBinding = async (message = {}) => {
  pushBindingUpdates.push({ ...message });
  return { ok: true, changed: true };
};
const isEntityOperationType = (type = '') => ['entity.put', 'entity.patch', 'entity.delete', 'custom'].includes(String(type || ''));
const normalizeInvitationCollection = (input = {}) => ({
  received: Array.isArray(input?.received) ? input.received : [],
  sent: Array.isArray(input?.sent) ? input.sent : []
});
const normalizeDeleteReferenceGuards = (input = []) => {
  const guards = [];
  for (const source of Array.isArray(input) ? input.slice(0, 8) : []) {
    const entityType = String(source?.entityType || '').trim().slice(0, 120);
    const field = String(source?.field || '').trim().slice(0, 120);
    if (!entityType || !field || !/^[a-zA-Z0-9_$.-]+$/.test(field)) continue;
    const equals = source?.equals;
    if (!['string', 'number', 'boolean'].includes(typeof equals) && equals !== null) continue;
    guards.push({ entityType, field, equals });
  }
  return guards;
};
const normalizeReferenceRequirements = (input = []) => {
  const requirements = [];
  const seen = new Set();
  for (const source of Array.isArray(input) ? input.slice(0, 8) : []) {
    const entityType = String(source?.entityType || '').trim().slice(0, 120);
    const entityId = String(source?.entityId || '').trim().slice(0, 180);
    if (!entityType || !entityId) continue;
    const key = entityType + '|' + entityId;
    if (seen.has(key)) continue;
    seen.add(key);
    requirements.push({ entityType, entityId });
  }
  return requirements;
};
const normalizeDependentDeletes = (input = [], source = {}) => {
  const sourceType = String(source?.entityType || '').trim().toLowerCase();
  const sourceId = String(source?.entityId || '').trim().slice(0, 180);
  const deletes = [];
  const seen = new Set();
  for (const candidate of Array.isArray(input) ? input.slice(0, 4) : []) {
    const entityType = String(candidate?.entityType || '').trim().toLowerCase().slice(0, 80);
    const entityId = String(candidate?.entityId || '').trim().slice(0, 180);
    const relation = String(candidate?.relation || '').trim().toLowerCase().slice(0, 80);
    const supported = sourceType === 'admin.purchase'
      && entityType === 'admin.projection-link'
      && entityId === sourceId
      && relation === 'admin.purchase-projection-link-v1';
    if (!supported) continue;
    const key = entityType + '|' + entityId + '|' + relation;
    if (seen.has(key)) continue;
    seen.add(key);
    deletes.push({ entityType, entityId, relation });
  }
  return deletes;
};
const getBackendUrl = () => 'https://backend.test';
const setP2PStorageUser = async () => '';
const configureP2PStorageLimits = () => ({});
const setP2PCryptoContext = async () => '';
const closeP2PCryptoContext = () => {};
const ensureDeviceEncryptionIdentity = async () => ({ publicKey: null });
const getActiveSpaceKey = async () => null;
const hasSpaceKey = async () => false;
const ensureSpaceKey = async () => ({ keyId: 'test-key' });
const activateSpaceKey = async (_spaceId, keyId, options = {}) => ({ keyId, keyEpoch: Number(options.keyEpoch || 0) });
const createSpaceKeyEnvelope = async () => ({});
const createSpaceKeyEnvelopes = async () => [];
const importSpaceKeyEnvelope = async (_spaceId, envelope, options = {}) => ({ imported: true, keyId: envelope.keyId, keyEpoch: Number(options.keyEpoch || 0) });
const isRejectedKeyEnvelopeError = (error = null) => error?.code === 'P2P_KEY_ENVELOPE_REJECTED';
const encryptOperationForTransport = async (_spaceId, operation) => operation;
const decryptOperationEvent = async (event) => event;
const encryptSnapshotEntities = async (_spaceId, entities) => ({ entities, keyId: '' });
const deferEncryptedEvent = async () => ({});
const listDeferredEncryptedEvents = async () => [];
const removeDeferredEncryptedEvent = async () => true;
const purgeSpaceCrypto = async () => true;
const dispatch = (name, detail = {}) => {
  dispatchedEvents.push({ name, detail });
  for (const listener of windowListeners.get(name) || []) listener({ detail });
};
const getDeviceName = () => 'Dispositivo de prueba';
const getAppMode = () => 'standalone';
const navigator = { onLine: true, language: 'es-CO', platform: 'test', userAgentData: null };
const window = {
  addEventListener(name, listener) {
    if (!windowListeners.has(name)) windowListeners.set(name, new Set());
    windowListeners.get(name).add(listener);
  },
  removeEventListener(name, listener) { windowListeners.get(name)?.delete(listener); },
  clearTimeout() {},
  setTimeout(callback) { return setTimeout(callback, 0); }
};
class P2PTabCoordinator {
  constructor() { this.broadcasts = []; }
  async start(options = {}) {
    this.options = options;
    return true;
  }
  async stop() { return true; }
  async requestLeadership() { return true; }
  broadcast(type, payload = {}) {
    this.broadcasts.push({ type, payload });
    return true;
  }
  isLeader() { return true; }
}
class EventSource {
  static OPEN = 1;
  static CLOSED = 2;
  constructor(url) {
    this.url = url;
    this.readyState = 1;
    this.listeners = new Map();
    this.closed = false;
    createdEventSources.push(this);
  }
  addEventListener(type, callback) { this.listeners.set(type, callback); }
  close() { this.closed = true; this.readyState = EventSource.CLOSED; }
}
${clientSource.slice(clientClassStart, clientClassEnd).replace('export class SemillaP2PClient', 'class SemillaP2PClient')}
export {
  SemillaP2PClient,
  pendingApiCalls,
  createdEventSources,
  setOutboxItems,
  getOutboxItems,
  setStoredDeviceId,
  setActiveSessionToken,
  reboundDeviceIds,
  pushBindingUpdates,
  removedOutboxIds,
  purgedSpaceIds,
  dispatchedEvents
};
`;
const clientModuleUrl = `data:text/javascript;base64,${Buffer.from(isolatedClientSource).toString('base64')}`;
const {
  SemillaP2PClient,
  pendingApiCalls,
  createdEventSources,
  setOutboxItems,
  getOutboxItems,
  setStoredDeviceId,
  setActiveSessionToken,
  reboundDeviceIds,
  pushBindingUpdates,
  removedOutboxIds,
  purgedSpaceIds,
  dispatchedEvents
} = await import(clientModuleUrl);

const lifecycleReceiptClient = new SemillaP2PClient();
lifecycleReceiptClient.user = { userId: 'usr_lifecycle_receipt' };
lifecycleReceiptClient.deviceId = 'dev_lifecycle_receipt';
lifecycleReceiptClient.started = true;
lifecycleReceiptClient.sessionGeneration = 1;
await lifecycleReceiptClient.rememberLifecycleReceipt({
  transactionId: 'tx_purge_receipt',
  action: 'purge',
  spaceId: 'space_purge_receipt',
  operationId: 'op_purge_receipt',
  sourceDeviceId: 'dev_source_receipt',
  remoteEventId: 'evt_purge_receipt',
  appliedStateRevision: 0,
  status: 'prepared'
});
if ((await lifecycleReceiptClient.completedLifecycleReceipts(['space_purge_receipt'])).length !== 0) {
  throw new Error('Una purga preparada se confirmó aunque el proyecto todavía existe localmente.');
}
const recoveredPurgeReceipts = await lifecycleReceiptClient.completedLifecycleReceipts([]);
if (recoveredPurgeReceipts.length !== 1
  || recoveredPurgeReceipts[0]?.transactionId !== 'tx_purge_receipt'
  || recoveredPurgeReceipts[0]?.status !== 'completed') {
  throw new Error('El arranque no recuperó el comprobante de una purga ya persistida antes del cierre.');
}

const localLifecycleClient = new SemillaP2PClient();
localLifecycleClient.user = { userId: 'usr_local_lifecycle' };
localLifecycleClient.deviceId = 'dev_local_lifecycle';
localLifecycleClient.started = true;
localLifecycleClient.sessionGeneration = 1;
const preparedLocalTombstone = await localLifecycleClient.rememberLocalLifecycleTombstone({
  transactionId: 'tx_local_purge',
  action: 'purge',
  spaceId: 'space_local_purge',
  operationId: 'op_local_purge',
  sourceUserId: 'usr_owner_source',
  sourceDeviceId: 'dev_owner_source',
  status: 'prepared'
});
if (preparedLocalTombstone.status !== 'prepared' || preparedLocalTombstone.completedAt) {
  throw new Error('El comprobante LAN se marcó como completado antes de persistir la purga local.');
}
const matchedPreparedTombstone = await localLifecycleClient.matchingLocalLifecycleTombstone({
  transactionId: 'tx_local_purge',
  action: 'purge',
  spaceId: 'space_local_purge',
  operationId: 'op_local_purge',
  sourceDeviceId: 'dev_owner_source'
}, { userId: 'usr_owner_source', deviceId: 'dev_owner_source' });
if (matchedPreparedTombstone?.status !== 'prepared') {
  throw new Error('El reintento LAN no recuperó el comprobante preparado de la purga interrumpida.');
}
const completedLocalTombstone = await localLifecycleClient.rememberLocalLifecycleTombstone({
  transactionId: 'tx_local_purge',
  action: 'purge',
  spaceId: 'space_local_purge',
  operationId: 'op_local_purge',
  sourceUserId: 'usr_owner_source',
  sourceDeviceId: 'dev_owner_source',
  status: 'completed'
});
if (completedLocalTombstone.status !== 'completed'
  || !completedLocalTombstone.completedAt
  || completedLocalTombstone.preparedAt !== preparedLocalTombstone.preparedAt) {
  throw new Error('El comprobante LAN no conservó la transición durable prepared → completed.');
}
const legacyLocalTombstone = localLifecycleClient.normalizeLocalLifecycleTombstones([{
  transactionId: 'tx_legacy_trash',
  action: 'trash',
  spaceId: 'space_legacy_trash',
  operationId: 'op_legacy_trash',
  sourceUserId: 'usr_legacy_owner',
  sourceDeviceId: 'dev_legacy_owner',
  targetUserId: 'usr_local_lifecycle',
  expiresAtMs: Date.now() + 60000
}]);
if (legacyLocalTombstone[0]?.status !== 'completed'
  || !legacyLocalTombstone[0]?.preparedAt
  || !legacyLocalTombstone[0]?.completedAt) {
  throw new Error('La migración de comprobantes LAN anteriores perdió compatibilidad.');
}
const monotonicLocalTombstone = await localLifecycleClient.rememberLocalLifecycleTombstone({
  transactionId: 'tx_local_purge',
  action: 'purge',
  spaceId: 'space_local_purge',
  operationId: 'op_local_purge',
  sourceUserId: 'usr_owner_source',
  sourceDeviceId: 'dev_owner_source',
  status: 'prepared'
});
if (monotonicLocalTombstone.status !== 'completed' || !monotonicLocalTombstone.completedAt) {
  throw new Error('Un reintento tardío degradó un comprobante LAN ya completado.');
}

const purgeProof = await localLifecycleClient.completedPurgeProofForSpace('space_local_purge');
if (purgeProof?.source !== 'local-network' || purgeProof.record?.status !== 'completed') {
  throw new Error('Una señal atrasada de papelera no pudo detectar la purga local que la reemplaza.');
}
await localLifecycleClient.rememberLifecycleReceipt({
  transactionId: 'tx_backend_purge_proof',
  action: 'purge',
  spaceId: 'space_backend_purge_proof',
  operationId: 'op_backend_purge_proof',
  sourceDeviceId: 'dev_backend_source',
  remoteEventId: 'evt_backend_purge_proof',
  status: 'completed'
});
const backendPurgeProof = await localLifecycleClient.completedPurgeProofForSpace('space_backend_purge_proof');
if (backendPurgeProof?.source !== 'memoriaBACKEND') {
  throw new Error('Una señal atrasada de papelera no detectó la purga ya confirmada por memoriaBACKEND.');
}

const identityRecoveryClient = new SemillaP2PClient();
identityRecoveryClient.user = { userId: 'usr_identity_recovery', email: 'identity@example.com' };
identityRecoveryClient.deviceId = 'dev_cloned_identity';
identityRecoveryClient.started = true;
identityRecoveryClient.sessionGeneration = 2;
setStoredDeviceId('dev_cloned_identity');
setOutboxItems([{
  operationId: 'op_identity_rebind',
  spaceId: 'space_identity',
  request: {
    deviceId: 'dev_cloned_identity',
    spaceId: 'space_identity',
    operation: { operationId: 'op_identity_rebind', type: 'custom' }
  }
}]);
let identityStopOptions = null;
let identityRestartUser = null;
identityRecoveryClient.stop = async (options = {}) => {
  identityStopOptions = options;
  identityRecoveryClient.started = false;
  return true;
};
identityRecoveryClient.start = async (user) => {
  identityRestartUser = user;
  identityRecoveryClient.user = user;
  identityRecoveryClient.deviceId = 'dev_rotated_identity';
  identityRecoveryClient.started = true;
  return {};
};
const identityConflict = new Error('La clave pública no coincide.');
identityConflict.code = 'P2P_DEVICE_IDENTITY_CONFLICT';
identityConflict.status = 409;
const identityRecovered = await identityRecoveryClient.restartWithFreshDeviceIdentity(identityConflict, { skipLeadershipWait: true });
const reboundOutbox = getOutboxItems();
if (!identityRecovered
  || reboundDeviceIds.length !== 1
  || reboundDeviceIds[0]?.previousDeviceId !== 'dev_cloned_identity'
  || reboundDeviceIds[0]?.nextDeviceId !== 'dev_rotated_identity'
  || reboundOutbox[0]?.request?.deviceId !== 'dev_rotated_identity'
  || pushBindingUpdates.length !== 1
  || pushBindingUpdates[0]?.action !== 'set'
  || pushBindingUpdates[0]?.userId !== 'usr_identity_recovery'
  || pushBindingUpdates[0]?.deviceId !== 'dev_rotated_identity'
  || identityStopOptions?.skipLeadershipWait !== true
  || identityRestartUser?.userId !== 'usr_identity_recovery'
  || !dispatchedEvents.some((event) => event.name === 'p2p:device-identity-rotated'
    && event.detail?.previousDeviceId === 'dev_cloned_identity'
    && event.detail?.deviceId === 'dev_rotated_identity')) {
  throw new Error('La colisión criptográfica no rotó el deviceId ni conservó las operaciones locales pendientes.');
}

const nonConflictClient = new SemillaP2PClient();
nonConflictClient.user = { userId: 'usr_identity_non_conflict' };
nonConflictClient.deviceId = 'dev_identity_non_conflict';
if (await nonConflictClient.restartWithFreshDeviceIdentity(Object.assign(new Error('otro error'), { code: 'OTHER_ERROR' })) !== false) {
  throw new Error('Un error no relacionado intentó rotar la identidad del dispositivo.');
}

const leadershipStopClient = new SemillaP2PClient();
leadershipStopClient.user = { userId: 'usr_leadership_stop' };
leadershipStopClient.deviceId = 'dev_leadership_stop';
leadershipStopClient.started = true;
leadershipStopClient.leadershipTask = new Promise(() => {});
const leadershipStopResult = await Promise.race([
  leadershipStopClient.stop({ skipLeadershipWait: true }).then(() => 'stopped'),
  new Promise((resolve) => setTimeout(() => resolve('timeout'), 100))
]);
if (leadershipStopResult !== 'stopped') {
  throw new Error('La recuperación de identidad quedó esperando circularmente su propia tarea de liderazgo.');
}

const cancelledRecoveryClient = new SemillaP2PClient();
cancelledRecoveryClient.user = { userId: 'usr_identity_cancelled' };
cancelledRecoveryClient.deviceId = 'dev_identity_cancelled';
cancelledRecoveryClient.started = true;
cancelledRecoveryClient.sessionGeneration = 3;
setStoredDeviceId('dev_identity_cancelled');
setActiveSessionToken('session-before-logout');
let releaseCoordinatorStop;
cancelledRecoveryClient.tabCoordinator.stop = () => new Promise((resolve) => { releaseCoordinatorStop = resolve; });
let cancelledRestartCalls = 0;
cancelledRecoveryClient.start = async () => { cancelledRestartCalls += 1; return {}; };
const cancelledRecovery = cancelledRecoveryClient.restartWithFreshDeviceIdentity(identityConflict);
await new Promise((resolve) => setTimeout(resolve, 0));
const manualStop = cancelledRecoveryClient.stop();
setActiveSessionToken('');
releaseCoordinatorStop?.();
const [cancelledRecoveryResult] = await Promise.all([cancelledRecovery, manualStop]);
if (cancelledRecoveryResult !== false
  || cancelledRestartCalls !== 0
  || cancelledRecoveryClient.user !== null
  || cancelledRecoveryClient.deviceId !== '') {
  throw new Error('Un cierre de sesión concurrente pudo reactivar la cuenta anterior durante la rotación de identidad.');
}
setActiveSessionToken('test-session-token');

const nestedRecoveryClient = new SemillaP2PClient();
nestedRecoveryClient.identityRecoveryPromise = Promise.resolve(true);
nestedRecoveryClient.identityRecoveryRestarting = true;
if (await nestedRecoveryClient.restartWithFreshDeviceIdentity(identityConflict) !== false) {
  throw new Error('Una colisión repetida durante el reinicio creó una espera recursiva sobre la misma recuperación.');
}

console.log('OK: colisiones de identidad rotan el dispositivo, conservan el outbox y quedan canceladas por logout sin bloqueos recursivos.');
const referenceGuardClient = new SemillaP2PClient();
referenceGuardClient.publish = (spaceId, operation, options) => ({ spaceId, operation, options });
const referenceDeleteRequest = referenceGuardClient.delete('space_guard', 'admin.projection', 'projection_guard', {
  expected: { projectedAmount: 1000 },
  referenceGuards: [
    { entityType: 'admin.purchase', field: 'projectionId', equals: 'projection_guard' },
    { entityType: '', field: 'projectionId', equals: 'invalid' },
    { entityType: 'admin.purchase', field: 'unsafe[field]', equals: 'invalid' }
  ],
  queueWhenOffline: false
});
if (referenceDeleteRequest.operation.payload.referenceGuards?.length !== 1
  || referenceDeleteRequest.operation.payload.referenceGuards[0].equals !== 'projection_guard'
  || referenceDeleteRequest.options.queueWhenOffline !== false) {
  throw new Error('El cliente no publicó una eliminación referencial cifrable y normalizada.');
}
const dependentDeleteRequest = referenceGuardClient.delete('space_guard', 'admin.purchase', 'purchase_guard', {
  dependentDeletes: [
    {
      entityType: 'admin.projection-link',
      entityId: 'purchase_guard',
      relation: 'admin.purchase-projection-link-v1'
    },
    {
      entityType: 'admin.projection-link',
      entityId: 'another_purchase',
      relation: 'admin.purchase-projection-link-v1'
    },
    {
      entityType: 'admin.projection-link',
      entityId: 'purchase_guard',
      relation: 'unsafe-relation'
    }
  ],
  queueWhenOffline: false
});
if (dependentDeleteRequest.operation.dependentDeletes?.length !== 1
  || dependentDeleteRequest.operation.dependentDeletes[0].entityId !== 'purchase_guard'
  || dependentDeleteRequest.operation.dependentDeletes[0].relation !== 'admin.purchase-projection-link-v1'
  || dependentDeleteRequest.options.queueWhenOffline !== false) {
  throw new Error('El cliente no limitó la eliminación dependiente al vínculo exacto de la compra eliminada.');
}
const requiredReferencePut = referenceGuardClient.put(
  'space_guard',
  'admin.projection-link',
  'purchase_guard',
  { purchaseId: 'purchase_guard', projectionId: 'projection_guard', active: true },
  {
    referenceRequirements: [
      { entityType: 'admin.projection', entityId: 'projection_guard' },
      { entityType: 'admin.projection', entityId: 'projection_guard' },
      { entityType: '', entityId: 'invalid' }
    ],
    queueWhenOffline: false
  }
);
if (requiredReferencePut.operation.payload.referenceRequirements?.length !== 1
  || requiredReferencePut.operation.payload.referenceRequirements[0].entityId !== 'projection_guard'
  || requiredReferencePut.options.queueWhenOffline !== false) {
  throw new Error('El cliente no publicó un alta condicionada por una referencia activa y normalizada.');
}


const deletionClient = new SemillaP2PClient();
deletionClient.user = { userId: 'usr_owner_delete' };
deletionClient.deviceId = 'dev_owner_delete';
deletionClient.started = true;
deletionClient.sessionGeneration = 4;
deletionClient.bootstrapState = {
  spaces: [{
    spaceId: 'space_delete_local',
    ownerUserId: 'usr_owner_delete',
    authorizationState: 'confirmed',
    members: [{ userId: 'usr_owner_delete', role: 'owner', permissions: ['read', 'write'] }]
  }],
  invitations: {
    received: [{ invitationId: 'inv_delete_received', spaceId: 'space_delete_local' }],
    sent: [{ invitationId: 'inv_delete_sent', spaceId: 'space_delete_local' }]
  }
};
deletionClient.bindTabRelays(deletionClient.captureSessionContext());
deletionClient.refreshBootstrap = async () => deletionClient.bootstrapState;
const deletionPromise = deletionClient.deleteSpace('space_delete_local');
const deletionRequest = pendingApiCalls.shift();
if (deletionRequest?.endpoint !== '/api/p2p/access/delete'
  || deletionRequest?.payload?.spaceId !== 'space_delete_local') {
  throw new Error('La eliminación local no usó el contrato autoritativo de borrado del propietario.');
}
deletionRequest.resolve({ deleted: true, spaceId: 'space_delete_local' });
await deletionPromise;
if (!purgedSpaceIds.includes('space_delete_local')
  || deletionClient.bootstrapState.spaces.some((space) => space.spaceId === 'space_delete_local')
  || deletionClient.bootstrapState.invitations.received.length
  || deletionClient.bootstrapState.invitations.sent.length
  || !dispatchedEvents.some((event) => event.name === 'p2p:space-deleted' && event.detail?.source === 'local-owner-delete')
  || !deletionClient.tabCoordinator.broadcasts.some((message) => message.type === 'state')
  || !deletionClient.tabCoordinator.broadcasts.some((message) => message.type === 'space-deleted' && message.payload?.spaceId === 'space_delete_local')) {
  throw new Error('La confirmación de borrado no purgó la réplica, limpió invitaciones ni coordinó el cierre en las demás pestañas.');
}
deletionClient.unbindTabRelays();

const lifecycleObserverClient = new SemillaP2PClient();
lifecycleObserverClient.user = { userId: 'usr_lifecycle_observer' };
lifecycleObserverClient.deviceId = 'dev_lifecycle_observer';
lifecycleObserverClient.started = true;
lifecycleObserverClient.manualClose = false;
lifecycleObserverClient.realtimeLeader = true;
lifecycleObserverClient.sessionGeneration = 5;
lifecycleObserverClient.bootstrapState = {
  spaces: [{
    spaceId: 'space_lifecycle_observer',
    ownerUserId: 'usr_lifecycle_observer',
    authorizationState: 'confirmed',
    members: [{ userId: 'usr_lifecycle_observer', role: 'owner', permissions: ['read', 'write'] }]
  }],
  lifecycleTransactions: [{
    transactionId: 'tx_lifecycle_observer',
    spaceId: 'space_lifecycle_observer',
    role: 'source',
    status: 'ready'
  }]
};
if (!lifecycleObserverClient.scheduleLifecycleFinalizationObserver({ immediate: true })) {
  throw new Error('Una transacción ready visible no activó el observador de finalización.');
}
await new Promise((resolve) => setTimeout(resolve, 0));
const lifecycleObserverRequest = pendingApiCalls.shift();
if (lifecycleObserverRequest?.endpoint !== '/api/p2p/lifecycle/resume'
  || lifecycleObserverRequest?.payload?.transactionId !== 'tx_lifecycle_observer'
  || lifecycleObserverRequest?.payload?.deviceId !== 'dev_lifecycle_observer') {
  throw new Error('El observador no reanudó de forma idempotente la acción lista del dispositivo iniciador.');
}
const lifecycleObserverTask = lifecycleObserverClient.lifecycleFinalizationObserverPromise;
lifecycleObserverRequest.resolve({
  ok: true,
  lifecycle: {
    transactionId: 'tx_lifecycle_observer',
    spaceId: 'space_lifecycle_observer',
    role: 'source',
    status: 'completed'
  }
});
await lifecycleObserverTask;
if (lifecycleObserverClient.bootstrapState.lifecycleTransactions.length
  || lifecycleObserverClient.lifecycleFinalizationObserverTimer
  || lifecycleObserverClient.lifecycleFinalizationObserverPromise
  || lifecycleObserverClient.lifecycleFinalizationObserverAttempt !== 0) {
  throw new Error('El observador no se autodesactivó después de confirmar la finalización.');
}
lifecycleObserverClient.realtimeLeader = false;
lifecycleObserverClient.bootstrapState.lifecycleTransactions = [{
  transactionId: 'tx_lifecycle_follower',
  spaceId: 'space_lifecycle_observer',
  role: 'source',
  status: 'ready'
}];
if (lifecycleObserverClient.scheduleLifecycleFinalizationObserver({ immediate: true }) !== false
  || lifecycleObserverClient.lifecycleFinalizationObserverTimer) {
  throw new Error('Una pestaña seguidora activó indebidamente el observador de finalización.');
}

const followerClient = new SemillaP2PClient();
followerClient.user = { userId: 'usr_shared_tab' };
followerClient.deviceId = 'dev_shared_tab';
followerClient.started = true;
followerClient.sessionGeneration = 5;
followerClient.bootstrapState = {
  spaces: [
    { spaceId: 'space_deleted_elsewhere' },
    { spaceId: 'space_revoked_elsewhere' },
    { spaceId: 'space_keep_shared' }
  ],
  invitations: {
    received: [
      { invitationId: 'inv_deleted_elsewhere', spaceId: 'space_deleted_elsewhere' },
      { invitationId: 'inv_keep_shared', spaceId: 'space_keep_shared' }
    ],
    sent: [{ invitationId: 'inv_revoked_elsewhere', spaceId: 'space_revoked_elsewhere' }]
  }
};
followerClient.recoveryRequirements = {
  space_deleted_elsewhere: 11,
  space_revoked_elsewhere: 12,
  space_keep_shared: 13
};
followerClient.snapshotRecoveryRequired = true;
const followerContext = followerClient.captureSessionContext();
followerClient.handleTabMessage({
  type: 'space-deleted',
  payload: { spaceId: 'space_deleted_elsewhere', source: 'local-owner-delete' }
}, followerContext);
followerClient.handleTabMessage({
  type: 'access-revoked',
  payload: { spaceIds: ['space_revoked_elsewhere'], source: 'local-leave' }
}, followerContext);
if (followerClient.bootstrapState.spaces.length !== 1
  || followerClient.bootstrapState.spaces[0]?.spaceId !== 'space_keep_shared'
  || followerClient.bootstrapState.invitations.received.length !== 1
  || followerClient.bootstrapState.invitations.received[0]?.spaceId !== 'space_keep_shared'
  || followerClient.bootstrapState.invitations.sent.length
  || Object.keys(followerClient.recoveryRequirements).length !== 1
  || followerClient.recoveryRequirements.space_keep_shared !== 13
  || !followerClient.snapshotRecoveryRequired
  || !dispatchedEvents.some((event) => event.name === 'p2p:space-deleted' && event.detail?.sharedTab === true)
  || !dispatchedEvents.some((event) => event.name === 'p2p:access-revoked' && event.detail?.sharedTab === true)) {
  throw new Error('Una pestaña secundaria conservó proyectos, invitaciones o recuperación después de un borrado o revocación coordinados.');
}

const client = new SemillaP2PClient();
client.user = { userId: 'usr_account_a' };
client.deviceId = 'dev_account_a';
client.started = true;
client.sessionGeneration = 7;
const accountAContext = client.captureSessionContext();
if (!Object.isFrozen(accountAContext) || !client.isSessionContextCurrent(accountAContext)) {
  throw new Error('La identidad de sesión P2P no quedó capturada de forma inmutable.');
}

const legacyGuestClient = new SemillaP2PClient();
legacyGuestClient.user = { userId: 'usr_legacy_guest' };
legacyGuestClient.deviceId = 'dev_legacy_guest';
legacyGuestClient.started = true;
legacyGuestClient.sessionGeneration = 1;
legacyGuestClient.bootstrapState = {
  spaces: [{
    spaceId: 'space_legacy_without_authority',
    ownerUserId: 'usr_legacy_owner',
    encryptionVersion: 1,
    activeEncryptionKeyId: '',
    encryptionKeyEpoch: 0,
    members: [{ userId: 'usr_legacy_guest', permissions: ['read', 'invite'] }]
  }]
};
let legacyAuthorityBlocked = false;
try {
  await legacyGuestClient.ensureCurrentSpaceKey('space_legacy_without_authority', { requireAuthority: true });
} catch (error) {
  legacyAuthorityBlocked = error?.code === 'P2P_KEY_AUTHORITY_PENDING' && Number(error?.status || 0) === 409;
}
if (!legacyAuthorityBlocked) {
  throw new Error('Un participante pudo invitar desde un proyecto heredado sin clave autoritativa inicializada por el propietario.');
}

const rotationGuestClient = new SemillaP2PClient();
rotationGuestClient.user = { userId: 'usr_rotation_guest' };
rotationGuestClient.deviceId = 'dev_rotation_guest';
rotationGuestClient.started = true;
rotationGuestClient.sessionGeneration = 1;
rotationGuestClient.bootstrapState = {
  spaces: [{
    spaceId: 'space_rotation_required',
    ownerUserId: 'usr_rotation_owner',
    encryptionVersion: 1,
    activeEncryptionKeyId: 'key_before_revocation_0001',
    encryptionKeyEpoch: 3,
    encryptionRotationRequired: true,
    members: [{ userId: 'usr_rotation_guest', permissions: ['read', 'add'] }]
  }]
};
let nonOwnerRotationBlocked = false;
try {
  await rotationGuestClient.ensureCurrentSpaceKey('space_rotation_required');
} catch (error) {
  nonOwnerRotationBlocked = error?.code === 'P2P_KEY_ROTATION_REQUIRED'
    && Number(error?.status || 0) === 409
    && error?.retryable === true;
}
if (!nonOwnerRotationBlocked || !rotationGuestClient.isKeyAuthorityRetryableError({ code: 'P2P_KEY_ROTATION_REQUIRED' })) {
  throw new Error('Un participante no propietario pudo continuar usando la clave anterior durante una rotación obligatoria.');
}

const rotationOwnerClient = new SemillaP2PClient();
rotationOwnerClient.user = { userId: 'usr_rotation_owner' };
rotationOwnerClient.deviceId = 'dev_rotation_owner';
rotationOwnerClient.started = true;
rotationOwnerClient.sessionGeneration = 1;
rotationOwnerClient.bootstrapState = structuredClone(rotationGuestClient.bootstrapState);
rotationOwnerClient.bootstrapState.spaces[0].members = [{ userId: 'usr_rotation_owner', role: 'owner', permissions: ['read', 'write'] }];
let requiredActivation = null;
let requiredDistribution = null;
rotationOwnerClient.activateAuthoritativeSpaceKey = async (spaceId, keyId, expectedKeyId) => {
  requiredActivation = { spaceId, keyId, expectedKeyId };
  const space = {
    ...rotationOwnerClient.bootstrapState.spaces[0],
    activeEncryptionKeyId: keyId,
    encryptionKeyEpoch: 4,
    encryptionRotationRequired: false,
    encryptionRotationRequiredAt: ''
  };
  rotationOwnerClient.bootstrapState.spaces = [space];
  return { space };
};
rotationOwnerClient.distributeSpaceKey = async (spaceId, keyId) => {
  requiredDistribution = { spaceId, keyId };
  return { deliveredToDevices: 2 };
};
const rotatedOwnerKey = await rotationOwnerClient.ensureCurrentSpaceKey('space_rotation_required');
if (requiredActivation?.spaceId !== 'space_rotation_required'
  || requiredActivation?.keyId !== 'test-key'
  || requiredActivation?.expectedKeyId !== 'key_before_revocation_0001'
  || requiredDistribution?.keyId !== 'test-key'
  || rotatedOwnerKey?.keyId !== 'test-key'
  || rotatedOwnerKey?.keyEpoch !== 4
  || rotatedOwnerKey?.distribution?.deliveredToDevices !== 2) {
  throw new Error('El propietario no cerró automáticamente la barrera con una clave nueva y su redistribución.');
}

const legacyOwnerClient = new SemillaP2PClient();
legacyOwnerClient.user = { userId: 'usr_legacy_owner' };
legacyOwnerClient.deviceId = 'dev_legacy_owner';
legacyOwnerClient.started = true;
legacyOwnerClient.sessionGeneration = 1;
legacyOwnerClient.bootstrapState = {
  spaces: [{
    spaceId: 'space_legacy_owner_initializes',
    ownerUserId: 'usr_legacy_owner',
    encryptionVersion: 1,
    activeEncryptionKeyId: '',
    encryptionKeyEpoch: 0,
    members: [{ userId: 'usr_legacy_owner', permissions: ['read', 'write', 'invite'] }]
  }]
};
let initializedLegacyKey = null;
legacyOwnerClient.activateAuthoritativeSpaceKey = async (spaceId, keyId, expectedKeyId) => {
  initializedLegacyKey = { spaceId, keyId, expectedKeyId };
  return { space: { encryptionKeyEpoch: 1 } };
};
const initializedLegacy = await legacyOwnerClient.ensureCurrentSpaceKey('space_legacy_owner_initializes');
if (initializedLegacyKey?.spaceId !== 'space_legacy_owner_initializes'
  || initializedLegacyKey?.keyId !== 'test-key'
  || initializedLegacyKey?.expectedKeyId !== ''
  || initializedLegacy?.keyEpoch !== 1) {
  throw new Error('Abrir un proyecto heredado como propietario no inicializó su primera época autoritativa.');
}

const staleKeyClient = new SemillaP2PClient();
staleKeyClient.user = { userId: 'usr_epoch_guest' };
staleKeyClient.deviceId = 'dev_epoch_guest';
staleKeyClient.started = true;
staleKeyClient.sessionGeneration = 2;
staleKeyClient.bootstrapState = {
  spaces: [{
    spaceId: 'space_epoch_fenced',
    ownerUserId: 'usr_epoch_owner',
    encryptionVersion: 1,
    activeEncryptionKeyId: 'key_current_000002',
    encryptionKeyEpoch: 2,
    members: [{ userId: 'usr_epoch_guest', permissions: ['read'] }]
  }]
};
const staleKeyContext = staleKeyClient.captureSessionContext();
const staleEnvelopeResult = await staleKeyClient.handleKeyEnvelopeEvent({
  eventId: 'event_stale_envelope',
  eventType: 'p2p.key.envelope',
  spaceId: 'space_epoch_fenced',
  sourceDeviceId: 'dev_epoch_sender',
  data: {
    keyEpoch: 1,
    envelope: {
      keyId: 'key_previous_000001',
      senderDeviceId: 'dev_epoch_sender',
      recipientDeviceId: 'dev_epoch_guest'
    }
  }
}, staleKeyContext);
if (staleEnvelopeResult?.reason !== 'stale_authority') {
  throw new Error('Un sobre retrasado pudo superar la época autoritativa ya conocida por una instalación nueva.');
}
const staleRequestResult = await staleKeyClient.handleKeyRequestEvent({
  eventId: 'event_stale_request',
  eventType: 'p2p.key.request',
  spaceId: 'space_epoch_fenced',
  sourceDeviceId: 'dev_epoch_requester',
  data: {
    keyId: 'key_previous_000001',
    keyEpoch: 1,
    requestDevice: { deviceId: 'dev_epoch_requester' }
  }
}, staleKeyContext);
if (staleRequestResult !== false) {
  throw new Error('Una solicitud retrasada pudo redistribuir una clave anterior a la época autoritativa conocida.');
}
const newerEnvelopeResult = await staleKeyClient.handleKeyEnvelopeEvent({
  eventId: 'event_newer_envelope',
  eventType: 'p2p.key.envelope',
  spaceId: 'space_epoch_fenced',
  sourceDeviceId: 'dev_epoch_sender',
  data: {
    keyEpoch: 3,
    envelope: {
      keyId: 'key_current_000003',
      senderDeviceId: 'dev_epoch_sender',
      recipientDeviceId: 'dev_epoch_guest'
    }
  }
}, staleKeyContext);
const advancedAuthority = staleKeyClient.spaceEncryptionAuthority('space_epoch_fenced');
if (!newerEnvelopeResult?.imported
  || advancedAuthority.keyId !== 'key_current_000003'
  || advancedAuthority.keyEpoch !== 3) {
  throw new Error('Un sobre autorizado más reciente no adelantó monotónicamente la autoridad local del proyecto.');
}
const rememberedAfterStaleResponse = staleKeyClient.rememberAuthoritativeSpace({
  ...advancedAuthority.space,
  activeEncryptionKeyId: 'key_previous_000002',
  encryptionKeyEpoch: 2,
  updatedAt: '2026-07-30T00:00:00.000Z'
});
if (rememberedAfterStaleResponse?.activeEncryptionKeyId !== 'key_current_000003'
  || rememberedAfterStaleResponse?.encryptionKeyEpoch !== 3
  || staleKeyClient.spaceEncryptionAuthority('space_epoch_fenced').keyEpoch !== 3) {
  throw new Error('Una respuesta autoritativa atrasada pudo degradar el bootstrap en memoria.');
}
client.user = { userId: 'usr_account_b' };
client.deviceId = 'dev_account_b';
client.sessionGeneration += 1;
if (client.isSessionContextCurrent(accountAContext)) {
  throw new Error('Una operación iniciada por una cuenta anterior continuó siendo válida después del cambio de sesión.');
}
let staleContextRejected = false;
try {
  client.assertSessionContext(accountAContext);
} catch (error) {
  staleContextRejected = error?.code === 'P2P_SESSION_CONTEXT_CHANGED' && error?.sessionContextChanged === true;
}
if (!staleContextRejected) {
  throw new Error('El cliente no descartó de forma identificable una respuesta asíncrona perteneciente a otra cuenta.');
}

console.log('OK: aislamiento de sesión y rotación obligatoria tras revocación evitan aplicar respuestas o claves obsoletas.');

const outboxIsolationClient = new SemillaP2PClient();
outboxIsolationClient.user = { userId: 'usr_outbox_isolation' };
outboxIsolationClient.deviceId = 'dev_outbox_isolation';
outboxIsolationClient.started = true;
outboxIsolationClient.sessionGeneration = 8;
outboxIsolationClient.realtimeLeader = true;
outboxIsolationClient.bootstrapState = {
  spaces: [
    { spaceId: 'space_blocked', members: [{ userId: 'usr_outbox_isolation', permissions: ['read', 'add'] }] },
    { spaceId: 'space_healthy', members: [{ userId: 'usr_outbox_isolation', permissions: ['read', 'add'] }] }
  ]
};
setOutboxItems([
  {
    operationId: 'op_blocked_first',
    spaceId: 'space_blocked',
    request: { spaceId: 'space_blocked', operation: { operationId: 'op_blocked_first', type: 'custom' } }
  },
  {
    operationId: 'op_blocked_second',
    spaceId: 'space_blocked',
    request: { spaceId: 'space_blocked', operation: { operationId: 'op_blocked_second', type: 'custom' } }
  },
  {
    operationId: 'op_healthy',
    spaceId: 'space_healthy',
    request: { spaceId: 'space_healthy', operation: { operationId: 'op_healthy', type: 'custom' } }
  }
]);
outboxIsolationClient.refreshOutboxEncryption = async () => {
  const error = new Error('La clave vigente todavía no está disponible en este proyecto.');
  error.code = 'P2P_SPACE_KEY_MISSING';
  error.status = 409;
  throw error;
};
const isolatedFlush = outboxIsolationClient.flushOutbox();
await new Promise((resolve) => setTimeout(resolve, 0));
const blockedPublish = pendingApiCalls.shift();
if (blockedPublish?.endpoint !== '/api/p2p/events/publish'
  || blockedPublish?.payload?.spaceId !== 'space_blocked'
  || blockedPublish?.payload?.operation?.operationId !== 'op_blocked_first') {
  throw new Error('La prueba no pudo interceptar la primera operación del proyecto bloqueado.');
}
const staleKeyError = new Error('La autoridad de cifrado cambió para este proyecto.');
staleKeyError.code = 'P2P_KEY_STALE';
staleKeyError.status = 409;
blockedPublish.reject(staleKeyError);
await new Promise((resolve) => setTimeout(resolve, 0));
const healthyPublish = pendingApiCalls.shift();
if (healthyPublish?.endpoint !== '/api/p2p/events/publish'
  || healthyPublish?.payload?.spaceId !== 'space_healthy'
  || healthyPublish?.payload?.operation?.operationId !== 'op_healthy') {
  throw new Error('Una clave pendiente en un proyecto bloqueó indebidamente la sincronización de otro proyecto independiente.');
}
healthyPublish.resolve({ deliveredToDevices: 1 });
const isolatedFlushResult = await isolatedFlush;
if (pendingApiCalls.length !== 0
  || isolatedFlushResult.sent !== 1
  || isolatedFlushResult.pending !== 2
  || removedOutboxIds.length !== 1
  || removedOutboxIds[0] !== 'op_healthy') {
  throw new Error('El aislamiento del outbox alteró el orden interno o confirmó operaciones del proyecto bloqueado.');
}

setOutboxItems([
  {
    operationId: 'op_global_first',
    spaceId: 'space_blocked',
    request: { spaceId: 'space_blocked', operation: { operationId: 'op_global_first', type: 'custom' } }
  },
  {
    operationId: 'op_global_second',
    spaceId: 'space_healthy',
    request: { spaceId: 'space_healthy', operation: { operationId: 'op_global_second', type: 'custom' } }
  }
]);
const globalFailureFlush = outboxIsolationClient.flushOutbox();
await new Promise((resolve) => setTimeout(resolve, 0));
const globalPublish = pendingApiCalls.shift();
const unavailableError = new Error('memoriaBACKEND no está disponible');
unavailableError.status = 503;
globalPublish.reject(unavailableError);
const globalFailureResult = await globalFailureFlush;
if (pendingApiCalls.length !== 0
  || globalFailureResult.sent !== 0
  || globalFailureResult.pending !== 2
  || removedOutboxIds.length !== 0) {
  throw new Error('Un fallo global del transporte intentó recorrer todos los proyectos o retiró operaciones pendientes.');
}

console.log('OK: una clave pendiente bloquea solo su proyecto, conserva el orden interno y un fallo global corta el lote sin tormenta de reintentos.');


const realtimeClient = new SemillaP2PClient();
realtimeClient.user = { userId: 'usr_stream_a' };
realtimeClient.deviceId = 'dev_stream_a';
realtimeClient.started = true;
realtimeClient.sessionGeneration = 3;
const staleOpening = realtimeClient.openRealtime();
await new Promise((resolve) => setTimeout(resolve, 0));
const realtimeTokenCall = pendingApiCalls.shift();
if (realtimeTokenCall?.endpoint !== '/api/p2p/realtime/token') {
  throw new Error('La prueba no pudo interceptar la creación del token SSE.');
}
realtimeClient.user = { userId: 'usr_stream_b' };
realtimeClient.deviceId = 'dev_stream_b';
realtimeClient.sessionGeneration += 1;
realtimeTokenCall.resolve({ realtimeToken: 'token_from_previous_account' });
let staleStreamRejected = false;
try {
  await staleOpening;
} catch (error) {
  staleStreamRejected = error?.code === 'P2P_SESSION_CONTEXT_CHANGED';
}
if (!staleStreamRejected || createdEventSources.length !== 0) {
  throw new Error('Una respuesta tardía de token pudo abrir un stream SSE para otra cuenta.');
}

const demotedClient = new SemillaP2PClient();
demotedClient.user = { userId: 'usr_stream_leader' };
demotedClient.deviceId = 'dev_stream_leader';
demotedClient.started = true;
demotedClient.sessionGeneration = 4;
demotedClient.realtimeLeader = true;
const demotedOpening = demotedClient.openRealtime();
await new Promise((resolve) => setTimeout(resolve, 0));
const demotedTokenCall = pendingApiCalls.shift();
if (demotedTokenCall?.endpoint !== '/api/p2p/realtime/token') {
  throw new Error('La prueba no pudo interceptar el token SSE de la ventana líder.');
}
demotedClient.realtimeLeader = false;
demotedTokenCall.resolve({ realtimeToken: 'token_after_leadership_loss' });
const demotedSource = await demotedOpening;
if (demotedSource !== null || createdEventSources.length !== 0) {
  throw new Error('Una ventana que perdió el liderazgo abrió un SSE con un token tardío.');
}

const stoppingClient = new SemillaP2PClient();
stoppingClient.user = { userId: 'usr_stop' };
stoppingClient.deviceId = 'dev_stop';
stoppingClient.started = true;
stoppingClient.sessionGeneration = 11;
const contextBeforeStop = stoppingClient.captureSessionContext();
await stoppingClient.stop();
if (stoppingClient.isSessionContextCurrent(contextBeforeStop)
  || stoppingClient.started
  || stoppingClient.user !== null
  || stoppingClient.deviceId !== '') {
  throw new Error('El cierre no invalidó la sesión antes de liberar el almacenamiento local.');
}

console.log('OK: respuestas tardías de token SSE y cierres concurrentes quedan aislados por cuenta.');


const staleBootstrapClient = new SemillaP2PClient();
staleBootstrapClient.user = { userId: 'usr_bootstrap_a' };
staleBootstrapClient.deviceId = 'dev_bootstrap_a';
staleBootstrapClient.started = true;
staleBootstrapClient.sessionGeneration = 20;
let staleBootstrapApplied = 0;
staleBootstrapClient.applyBootstrapData = async () => {
  staleBootstrapApplied += 1;
  return {};
};
const staleBootstrap = staleBootstrapClient.fetchBootstrap(false);
await new Promise((resolve) => setTimeout(resolve, 0));
const staleBootstrapCall = pendingApiCalls.shift();
if (staleBootstrapCall?.endpoint !== '/api/p2p/bootstrap') {
  throw new Error('La prueba no pudo interceptar el bootstrap pendiente.');
}
staleBootstrapClient.user = { userId: 'usr_bootstrap_b' };
staleBootstrapClient.deviceId = 'dev_bootstrap_b';
staleBootstrapClient.sessionGeneration += 1;
staleBootstrapCall.resolve({ spaces: [] });
let staleBootstrapRejected = false;
try {
  await staleBootstrap;
} catch (error) {
  staleBootstrapRejected = error?.code === 'P2P_SESSION_CONTEXT_CHANGED';
}
if (!staleBootstrapRejected || staleBootstrapApplied !== 0) {
  throw new Error('Un bootstrap tardío pudo aplicarse después de cambiar de cuenta.');
}

const orderedBootstrapClient = new SemillaP2PClient();
orderedBootstrapClient.user = { userId: 'usr_bootstrap_order' };
orderedBootstrapClient.deviceId = 'dev_bootstrap_order';
orderedBootstrapClient.started = true;
orderedBootstrapClient.sessionGeneration = 30;
const appliedBootstrapMarkers = [];
orderedBootstrapClient.applyBootstrapData = async (data) => {
  appliedBootstrapMarkers.push(data.marker);
  orderedBootstrapClient.bootstrapState = { marker: data.marker };
  return orderedBootstrapClient.bootstrapState;
};
const firstBootstrap = orderedBootstrapClient.fetchBootstrap(false);
await new Promise((resolve) => setTimeout(resolve, 0));
const firstBootstrapCall = pendingApiCalls.shift();
const secondBootstrap = orderedBootstrapClient.fetchBootstrap(false);
await new Promise((resolve) => setTimeout(resolve, 0));
const secondBootstrapCall = pendingApiCalls.shift();
if (firstBootstrapCall?.endpoint !== '/api/p2p/bootstrap' || secondBootstrapCall?.endpoint !== '/api/p2p/bootstrap') {
  throw new Error('La prueba no pudo interceptar los dos bootstrap concurrentes.');
}
secondBootstrapCall.resolve({ marker: 'newest' });
const newestState = await secondBootstrap;
firstBootstrapCall.resolve({ marker: 'obsolete' });
const obsoleteResult = await firstBootstrap;
if (appliedBootstrapMarkers.length !== 1
  || appliedBootstrapMarkers[0] !== 'newest'
  || newestState.marker !== 'newest'
  || obsoleteResult.marker !== 'newest') {
  throw new Error('Una respuesta bootstrap obsoleta pudo sobrescribir el estado más reciente.');
}

console.log('OK: estado local preservado ante omisiones, purga explícita y bootstrap obsoleto descartado.');
