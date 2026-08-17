import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const clientSource = fs.readFileSync(path.join(root, 'src/js/p2p-client.js'), 'utf8');
const appSource = fs.readFileSync(path.join(root, 'src/js/app.js'), 'utf8');
const cssSource = fs.readFileSync(path.join(root, 'src/css/app.css'), 'utf8');

const contractStart = clientSource.indexOf('function isEntityOperationType');
const contractEnd = clientSource.indexOf('function normalizeDeleteReferenceGuards', contractStart);
assert.ok(contractStart >= 0 && contractEnd > contractStart, 'No se encontró el contrato de entrega del cliente.');
const contractSource = clientSource.slice(contractStart, contractEnd)
  .replace('export function normalizePublishDeliveryIntent', 'function normalizePublishDeliveryIntent');
const contractUrl = `data:text/javascript;base64,${Buffer.from(`${contractSource}\nexport { normalizePublishDeliveryIntent };`).toString('base64')}`;
const { normalizePublishDeliveryIntent } = await import(contractUrl);

assert.deepEqual(
  normalizePublishDeliveryIntent('entity.trash', { deferSourceUntilReplicas: true }),
  { targetDeviceIds: [], includeSourceDevice: false, durableStateOperation: true, deferSourceUntilReplicas: true },
  'La papelera crítica dejó de excluir al dispositivo iniciador durante la fase remota.'
);
assert.deepEqual(
  normalizePublishDeliveryIntent('entity.restore', { deferSourceUntilReplicas: true }),
  { targetDeviceIds: [], includeSourceDevice: false, durableStateOperation: true, deferSourceUntilReplicas: true },
  'La restauración crítica dejó de excluir al dispositivo iniciador durante la fase remota.'
);
assert.throws(
  () => normalizePublishDeliveryIntent('entity.patch', { deferSourceUntilReplicas: true }),
  (error) => error?.code === 'P2P_LIFECYCLE_OPERATION_INVALID',
  'Una operación ordinaria puede activar indebidamente la coordinación crítica.'
);

for (const marker of [
  "trashProjectAfterReplicas(spaceId = '', options = {})",
  "restoreProjectAfterReplicas(spaceId = '', options = {})",
  "deleteProjectAfterReplicas(spaceId = '', options = {})",
  "event.eventType === 'p2p.lifecycle.progress'",
  "event.eventType === 'p2p.lifecycle.finalize'",
  "event.eventType === 'p2p.lifecycle.remote-purge'",
  "createSignedLocalControlBody('lifecycle.purge.request'",
  "action === 'lifecycle.ack'",
  'pendingLocalLifecycleTransactions',
  'localLifecycleCompleted: true',
  'LOCAL_LIFECYCLE_TOMBSTONE_META_KEY',
  'rememberLocalLifecycleTombstone',
  'matchingLocalLifecycleTombstone',
  'LIFECYCLE_RECEIPT_META_KEY',
  'rememberLifecycleReceipt',
  'rememberTrashLifecycleReceipt',
  'lifecycleReceipts',
  'completedLifecycleReceipts',
  'lifecycleReconciliationDeferred',
  'finalizeLifecycleFromEvent',
  'LIFECYCLE_FINALIZATION_MAX_ATTEMPTS = 3',
  'LIFECYCLE_REQUEST_MAX_ATTEMPTS = 3',
  'lifecycleFinalizeEvent',
  'p2p:lifecycle-retry-exhausted',
  '[SemillaP2P][LIFECYCLE_AUDIT]'
]) {
  assert.ok(clientSource.includes(marker), `El cliente perdió la coordinación remota/local requerida: ${marker}`);
}

const finalizeHelperIndex = clientSource.indexOf('async finalizeLifecycleFromEvent(');
const localApplyIndex = clientSource.indexOf('await this.applyDecryptedOperationEvent(decryptedEvent, sessionContext);', finalizeHelperIndex);
const completeIndex = clientSource.indexOf("apiPost('/api/p2p/lifecycle/complete'", finalizeHelperIndex);
const finalizeRealtimeIndex = clientSource.indexOf("event.eventType === 'p2p.lifecycle.finalize'");
const finalizeDelegateIndex = clientSource.indexOf('await this.finalizeLifecycleFromEvent(transaction, nestedEvent, sessionContext,', finalizeRealtimeIndex);
assert.ok(finalizeHelperIndex >= 0 && localApplyIndex > finalizeHelperIndex && completeIndex > localApplyIndex, 'El iniciador confirma antes de aplicar localmente o perdió el orden autoritativo de finalización.');
assert.ok(finalizeRealtimeIndex >= 0 && finalizeDelegateIndex > finalizeRealtimeIndex, 'El SSE de finalización dejó de reutilizar la ruta idempotente y auditable de commit local.');

const lifecycleStartIndex = clientSource.indexOf("async startProjectLifecycle(action = '', spaceId = '', options = {})");
const lifecycleStartEnd = clientSource.indexOf("trashProjectAfterReplicas(spaceId = '', options = {})", lifecycleStartIndex);
const lifecycleStartSource = clientSource.slice(lifecycleStartIndex, lifecycleStartEnd);
const durableIntentIndex = lifecycleStartSource.indexOf('await enqueueOutbox(outboxItem);');
const backendStartIndex = lifecycleStartSource.indexOf("data = await apiPost(outboxItem.endpoint, outboxItem.request, { maxAttempts: 1, audit: false });");
assert.ok(durableIntentIndex >= 0 && backendStartIndex > durableIntentIndex, 'La intención crítica no se conserva antes de contactar al backend.');
assert.ok(!lifecycleStartSource.includes('await removeOutbox(outboxItem.operationId).catch(() => null);\n      const transaction'), 'La intención crítica vuelve a retirarse apenas el backend acepta iniciar la coordinación.');
assert.ok(lifecycleStartSource.includes('attempt <= LIFECYCLE_REQUEST_MAX_ATTEMPTS'), 'La solicitud crítica no tiene un máximo explícito de tres intentos.');
assert.ok(lifecycleStartSource.includes('data?.lifecycleFinalizeEvent'), 'La respuesta de inicio no puede completar directamente una transacción ready cuando se pierde el SSE.');
assert.ok(lifecycleStartSource.includes("this.lifecycleAudit('lifecycle-start-request-failed'"), 'Los fallos de inicio no generan una auditoría estructurada por intento.');
assert.ok(lifecycleStartSource.includes('previousStatePreserved: true'), 'El agotamiento de la solicitud no declara que el estado local previo quedó preservado.');
assert.ok(lifecycleStartSource.includes('lifecycleFinalizeEventMissingError'), 'Una respuesta ready sin evento autoritativo puede volver a quedar bloqueada sin consumir los tres intentos.');
assert.ok(clientSource.includes("error.code = 'P2P_LIFECYCLE_FINALIZE_EVENT_MISSING'"), 'Falta un error semántico auditable para una finalización ready incompleta.');
assert.ok(clientSource.includes('this.scheduleLifecycleFinalizationObserver({}, sessionContext);'), 'El observador dejó de reprogramar de forma acotada los intentos cuando la red está temporalmente fuera de línea.');
assert.ok(!clientSource.includes('if (navigator.onLine === false) return false;\n\n    const observerTask = (async () => {'), 'El observador todavía puede abandonar una transacción activa sin consumir sus tres intentos.');
const lifecycleCompleteIndex = clientSource.indexOf("apiPost('/api/p2p/lifecycle/complete'", finalizeHelperIndex);
const lifecycleOutboxRemovalIndex = clientSource.indexOf('await removeOutbox(operationId).catch(() => null);', finalizeHelperIndex);
assert.ok(lifecycleCompleteIndex >= 0 && lifecycleOutboxRemovalIndex > lifecycleCompleteIndex, 'La intención durable se elimina antes de confirmar el cierre y ya no podría recuperarse si falla la confirmación final.');

const remotePurgeIndex = clientSource.indexOf("event.eventType === 'p2p.lifecycle.remote-purge'");
const remoteReceiptIndex = clientSource.indexOf('await this.rememberLifecycleReceipt({', remotePurgeIndex);
const remotePurgeApplyIndex = clientSource.indexOf('const purge = await purgeLocalSpace(cleanSpaceId);', remotePurgeIndex);
const remoteReceiptCompletedIndex = clientSource.indexOf('await this.rememberLifecycleReceipt({', remotePurgeApplyIndex);
assert.ok(
  remoteReceiptIndex > remotePurgeIndex
  && remotePurgeApplyIndex > remoteReceiptIndex
  && clientSource.slice(remoteReceiptIndex, remotePurgeApplyIndex).includes("status: 'prepared'")
  && remoteReceiptCompletedIndex > remotePurgeApplyIndex
  && clientSource.slice(remoteReceiptCompletedIndex, remoteReceiptCompletedIndex + 600).includes("status: 'completed'"),
  'La purga remota no conserva un comprobante preparado antes de borrar ni lo completa después de persistir la eliminación.'
);
assert.ok(clientSource.includes("record.status !== 'prepared' || record.action !== 'purge' || localSpaces.has(record.spaceId)"), 'El arranque no recupera una purga aplicada cuyo proceso cayó antes de completar el comprobante.');

const bootstrapIndex = clientSource.indexOf("apiPost('/api/p2p/bootstrap'");
const ackIndex = clientSource.indexOf("apiPost('/api/p2p/events/ack'");
assert.ok(clientSource.lastIndexOf('lifecycleReceipts', bootstrapIndex) > 0, 'El bootstrap no entrega comprobantes para reconciliar eliminaciones ya aplicadas.');
assert.ok(clientSource.lastIndexOf('lifecycleReceipts', ackIndex) > 0, 'El ACK no adjunta comprobantes durables para cerrar una confirmación partida.');

for (const marker of [
  'activeProjectLifecycle',
  'lifecycleProgressPresentation',
  'project-lifecycle-progress',
  'trashProjectAfterReplicas',
  'restoreProjectAfterReplicas',
  'deleteProjectAfterReplicas',
  'p2p:lifecycle-progress',
  'p2p:lifecycle-completed',
  '{completed} de {total} dispositivos completados · {remaining} pendientes'
]) {
  assert.ok(appSource.includes(marker), `La interfaz perdió el progreso o la acción coordinada: ${marker}`);
}
assert.ok(cssSource.includes('.project-card[data-lifecycle]') && cssSource.includes('.project-lifecycle-track'), 'La tarjeta no muestra visualmente el progreso de réplicas.');
assert.ok(cssSource.includes('.trash-item[data-lifecycle] .project-lifecycle-progress'), 'El progreso de la papelera no se adapta a pantallas móviles.');
const purgeRequestIndex = clientSource.indexOf("action === 'lifecycle.purge.request'");
const tombstoneIndex = clientSource.indexOf('await this.rememberLocalLifecycleTombstone({', purgeRequestIndex);
const purgeLocalIndex = clientSource.indexOf('const purge = await purgeLocalSpace(spaceId);', purgeRequestIndex);
assert.ok(purgeRequestIndex >= 0 && tombstoneIndex > purgeRequestIndex && purgeLocalIndex > tombstoneIndex, 'La réplica puede borrar el proyecto antes de conservar el comprobante que permite repetir el ACK.');
assert.ok(!appSource.includes("if (action === 'trash-project') result = await semillaP2P.trash(context.spaceId"), 'La interfaz volvió a aplicar la papelera local antes de las demás réplicas.');
assert.ok(!appSource.includes("if (action === 'restore-project') result = await semillaP2P.restore(context.spaceId"), 'La interfaz volvió a restaurar el iniciador antes de las demás réplicas.');
assert.ok(appSource.includes("if (action === 'restore-project') result = await semillaP2P.restoreProjectAfterReplicas(context.spaceId"), 'La restauración del proyecto no usa el ciclo coordinado por réplicas.');
assert.ok(!appSource.includes("result = await semillaP2P.trash(pending.spaceId, PROJECT_ENTITY_TYPE"), 'La eliminación desde Participantes volvió a saltarse la coordinación por réplicas.');
assert.ok(appSource.includes("result = await semillaP2P.trashProjectAfterReplicas(pending.spaceId"), 'La eliminación desde Participantes no usa el mismo ciclo coordinado del menú del proyecto.');
assert.ok(appSource.includes("pending.action === 'delete-project' && error?.p2pQueued"), 'La eliminación desde Participantes no conserva la coordinación cuando memoriaBACKEND está temporalmente fuera de línea.');
assert.ok(appSource.includes("Number(error?.p2pLocalDelivered || 0) > 0"), 'La eliminación desde Participantes perdió el respaldo P2P_sin_ para réplicas conectadas por Wi‑Fi.');
assert.ok(!appSource.includes("if (action === 'purge-project') result = await semillaP2P.deleteSpace(context.spaceId)"), 'La interfaz volvió a purgar el iniciador antes de los demás dispositivos.');
assert.ok(clientSource.includes("lifecycleAction === 'trash'") && clientSource.includes("completedPurgeProofForSpace"), 'La protección contra una papelera superada por una purga se perdió.');
assert.ok(!clientSource.includes("const supersedingPurgeProof = localLifecycle && lifecycleIdentityValid\n      ?"), 'Una restauración local podría quedar indebidamente confirmada por una prueba de purga anterior.');
assert.ok(clientSource.includes('async recoverForeground()') && clientSource.includes("window.addEventListener('pageshow', this.boundForegroundRecovery)") && clientSource.includes("document.addEventListener('visibilitychange', this.boundForegroundRecovery)"), 'La PWA no fuerza recuperación al volver al primer plano.');
assert.ok(appSource.includes("['recover', 'foreground-recover', 'realtime', 'realtime-ready-timeout'].includes(stage)"), 'La UI vuelve a confundir errores P2P no relacionados con una caída del stream.');

console.log('OK: proyecto visible, progreso por dispositivo, réplicas primero, iniciador al final y respaldo P2P_sin_ firmado validados.');
