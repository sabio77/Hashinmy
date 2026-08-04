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
assert.throws(
  () => normalizePublishDeliveryIntent('entity.patch', { deferSourceUntilReplicas: true }),
  (error) => error?.code === 'P2P_LIFECYCLE_OPERATION_INVALID',
  'Una operación ordinaria puede activar indebidamente la coordinación crítica.'
);

for (const marker of [
  "trashProjectAfterReplicas(spaceId = '', options = {})",
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
  'matchingLocalLifecycleTombstone'
]) {
  assert.ok(clientSource.includes(marker), `El cliente perdió la coordinación remota/local requerida: ${marker}`);
}

const finalizeIndex = clientSource.indexOf("event.eventType === 'p2p.lifecycle.finalize'");
const localApplyIndex = clientSource.indexOf('await this.applyDecryptedOperationEvent(decryptedEvent, sessionContext);', finalizeIndex);
const completeIndex = clientSource.indexOf("apiPost('/api/p2p/lifecycle/complete'", finalizeIndex);
assert.ok(finalizeIndex >= 0 && localApplyIndex > finalizeIndex && completeIndex > localApplyIndex, 'El iniciador confirma antes de aplicar localmente o aplica fuera del evento final autoritativo.');

for (const marker of [
  'activeProjectLifecycle',
  'lifecycleProgressPresentation',
  'project-lifecycle-progress',
  'trashProjectAfterReplicas',
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
assert.ok(!appSource.includes("if (action === 'purge-project') result = await semillaP2P.deleteSpace(context.spaceId)"), 'La interfaz volvió a purgar el iniciador antes de los demás dispositivos.');

console.log('OK: proyecto visible, progreso por dispositivo, réplicas primero, iniciador al final y respaldo P2P_sin_ firmado validados.');
