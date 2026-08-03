import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const currentFile = fileURLToPath(import.meta.url);
const root = path.resolve(path.dirname(currentFile), '..');
const clientSource = fs.readFileSync(path.join(root, 'src', 'js', 'p2p-client.js'), 'utf8');
const storageSource = fs.readFileSync(path.join(root, 'src', 'js', 'p2p-storage.js'), 'utf8');

const helperStart = clientSource.indexOf('function eventCursorSequence');
const helperEnd = clientSource.indexOf('function sortSnapshotEntities', helperStart);
assert.ok(helperStart >= 0 && helperEnd > helperStart, 'No se encontró el contrato de lote atómico del transporte.');
const helperSource = clientSource.slice(helperStart, helperEnd);

const collectStart = clientSource.indexOf('  clearAtomicTransportBatchTimer() {');
const collectEnd = clientSource.indexOf('\n  enqueueEvent(event = {}) {', collectStart);
assert.ok(collectStart >= 0 && collectEnd > collectStart, 'No se encontró el ensamblador cercado de lotes remotos.');
const collectMethods = clientSource.slice(collectStart, collectEnd);

const clientHarness = `
const ATOMIC_BATCH_ASSEMBLY_TIMEOUT_MS = 25;
const dispatched = [];
const window = { setTimeout, clearTimeout };
function dispatch(name, detail = {}) { dispatched.push({ name, detail }); }
function isEntityOperationType(type = '') { return ['entity.put','entity.patch','entity.delete','custom'].includes(String(type || '')); }
${helperSource}
class TestClient {
  constructor(){
    this.pendingAtomicEventBatches = new Map();
    this.atomicBatchAssemblyTimer = 0;
    this.pipelineGeneration = 1;
    this.eventPipelineBlocked = false;
    this.reconnects = 0;
    this.sessionContext = { userId:'usr_owner', deviceId:'dev_owner', generation:1 };
  }
  captureSessionContext(){ return this.sessionContext; }
  isSessionContextCurrent(context){ return context === this.sessionContext; }
  scheduleReconnect(){ this.reconnects += 1; }
${collectMethods}
}
export { TestClient, dispatched };
`;
const clientModule = await import(`data:text/javascript;base64,${Buffer.from(clientHarness).toString('base64')}`);

function event(batchIndex, overrides = {}) {
  return {
    eventId: `evt_${batchIndex}`,
    eventType: 'p2p.operation',
    deviceSequence: 20 + batchIndex,
    deliverySequence: 100 + batchIndex,
    spaceSequence: 50 + batchIndex,
    stateRevision: 50 + batchIndex,
    spaceId: 'space_1',
    actorUserId: 'usr_owner',
    sourceDeviceId: 'dev_owner',
    batchId: 'batch_1',
    batchIndex,
    batchSize: 2,
    operation: {
      operationId: `op_${batchIndex}`,
      type: 'entity.put',
      entityType: 'admin.purchase',
      entityId: `entity_${batchIndex}`,
      payload: {}
    },
    ...overrides
  };
}

const client = new clientModule.TestClient();
const buffered = client.collectAtomicTransportBatch(event(0));
assert.equal(buffered.buffered, true, 'La primera operación no quedó retenida hasta completar el lote.');
assert.equal(client.pendingAtomicEventBatches.size, 1, 'El lote parcial no quedó cercado en memoria.');
const completed = client.collectAtomicTransportBatch(event(1));
assert.equal(completed.atomic, true, 'El lote completo no fue reconocido como atómico.');
assert.deepEqual(completed.events.map((item) => item.batchIndex), [0, 1], 'El lote perdió su orden canónico.');
assert.equal(client.pendingAtomicEventBatches.size, 0, 'El ensamblador no liberó el lote ya completo.');
assert.equal(client.atomicBatchAssemblyTimer, 0, 'El lote completo dejó un vencimiento activo.');

const timeoutClient = new clientModule.TestClient();
timeoutClient.collectAtomicTransportBatch(event(0, { batchId: 'batch_timeout' }));
await new Promise((resolve) => setTimeout(resolve, 60));
assert.equal(timeoutClient.eventPipelineBlocked, true, 'Un lote truncado no bloqueó la tubería antes de reanudarla.');
assert.equal(timeoutClient.pendingAtomicEventBatches.size, 0, 'El lote truncado conservó memoria después del vencimiento.');
assert.equal(timeoutClient.atomicBatchAssemblyTimer, 0, 'El vencimiento no liberó su temporizador.');
assert.equal(timeoutClient.reconnects, 1, 'El lote truncado no forzó una reconexión para replay.');
assert.ok(
  clientModule.dispatched.some((entry) => entry.name === 'p2p:error'
    && entry.detail?.stage === 'event-batch-timeout'
    && entry.detail?.error?.code === 'P2P_ATOMIC_BATCH_TIMEOUT'),
  'El vencimiento del lote no produjo una señal observable y tipada.'
);


const interleavedClient = new clientModule.TestClient();
interleavedClient.collectAtomicTransportBatch(event(0));
assert.throws(
  () => interleavedClient.collectAtomicTransportBatch({ eventId: 'evt_control', eventType: 'p2p.membership.changed' }),
  (error) => error?.code === 'P2P_ATOMIC_BATCH_INCOMPLETE',
  'Un evento intercalado pudo atravesar un lote incompleto.'
);

assert.throws(
  () => clientModule.normalizeAtomicTransportBatchEvents([
    event(0),
    event(1, { deviceSequence: 23, deliverySequence: 103 })
  ]),
  (error) => error?.code === 'P2P_ATOMIC_BATCH_SEQUENCE_GAP',
  'Una discontinuidad de entrega no invalidó el lote remoto.'
);

const storageStart = storageSource.indexOf('function atomicBatchDescriptor');
const storageEnd = storageSource.indexOf('\nexport async function applyP2PEvent(event = {})', storageStart);
assert.ok(storageStart >= 0 && storageEnd > storageStart, 'No se encontró la aplicación transaccional del lote remoto.');
const storageBatchSource = storageSource.slice(storageStart, storageEnd)
  .replace('export async function applyP2PEventBatch', 'async function applyP2PEventBatch');

const storageHarness = `
const STORES = { entities:'entities', outbox:'outbox', meta:'meta' };
const STATE_REVISION_META_PREFIX = 'stateRevision:';
let transactionCalls = 0;
let writes = [];
function operationIdOf(operation = {}) { return String(operation.operationId || ''); }
function isEntityOperation(operation = {}) { return ['entity.put','entity.patch','entity.delete','custom'].includes(String(operation.type || '')); }
function normalizeSequence(value = 0) { const parsed = Number(value || 0); return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 0; }
async function requestToPromise(request) { return request.result; }
async function applyEntityOperation(_store, currentEvent) { writes.push('entity:' + currentEvent.operation.operationId); return { applied:true, maxStateRevision:Number(currentEvent.stateRevision || 0) }; }
async function confirmOutboxOperation(_store, currentEvent) { writes.push('outbox:' + currentEvent.operation.operationId); return true; }
async function withStores(names, mode, callback) {
  transactionCalls += 1;
  assertContract(names.join(',') === 'entities,outbox,meta' && mode === 'readwrite');
  const meta = {
    get(){ return { result:{ key:'stateRevision:space_1', value:49 } }; },
    put(record){ writes.push('meta:' + record.value); return { result:record }; }
  };
  return callback({ entities:{}, outbox:{}, meta });
}
function assertContract(value){ if(!value) throw new Error('Contrato transaccional inválido'); }
${storageBatchSource}
export { applyP2PEventBatch, writes, transactionCalls };
`;
const storageModule = await import(`data:text/javascript;base64,${Buffer.from(storageHarness).toString('base64')}`);
const storageResult = await storageModule.applyP2PEventBatch([event(0), event(1)]);
assert.equal(storageModule.transactionCalls, 1, 'La réplica abrió más de una transacción para el lote remoto.');
assert.deepEqual(storageModule.writes, [
  'entity:op_0', 'outbox:op_0',
  'entity:op_1', 'outbox:op_1',
  'meta:51'
], 'La revisión o el outbox se confirmaron fuera del commit único del lote.');
assert.equal(storageResult.atomic, true);
assert.equal(storageResult.count, 2);

const applyBatchStart = clientSource.indexOf('  async applyDecryptedOperationEventBatch(');
const handleBatchStart = clientSource.indexOf('  async handleEventBatch(', applyBatchStart);
const handleKeyStart = clientSource.indexOf('  async handleKeyRequestEvent(', handleBatchStart);
assert.ok(applyBatchStart >= 0 && handleBatchStart > applyBatchStart && handleKeyStart > handleBatchStart);
const applyBatchMethod = clientSource.slice(applyBatchStart, handleBatchStart);
const handleBatchMethod = clientSource.slice(handleBatchStart, handleKeyStart);
assert.ok(
  applyBatchMethod.indexOf('await applyP2PEventBatch(ordered)') < applyBatchMethod.indexOf("dispatch('p2p:operation'"),
  'La interfaz puede observar una operación antes de que todo el lote quede persistido.'
);
assert.match(handleBatchMethod, /await this\.applyDecryptedOperationEventBatch\(decryptedEvents, sessionContext\)/);
assert.match(handleBatchMethod, /this\.scheduleAck\(nextCursor\)/);
assert.match(clientSource, /await this\.applyDecryptedOperationEventBatch\(replayedEvents, sessionContext, \{/);
assert.match(storageSource, /transaction\.abort\(\)/, 'Una excepción de callback no aborta explícitamente la transacción IndexedDB.');

assert.match(clientSource, /clearAtomicTransportBatchTimer\(\);\s*this\.pendingAtomicEventBatches\.clear\(\);\s*this\.lastProcessedSequence = 0;/, 'El inicio de sesión no limpia un vencimiento heredado.');
assert.match(clientSource, /this\.pipelineGeneration \+= 1;\s*this\.clearAtomicTransportBatchTimer\(\);\s*this\.pendingAtomicEventBatches\.clear\(\);/, 'El cierre de sesión no cancela el lote parcial.');

console.log('OK: los lotes remotos vencen si quedan truncados, fuerzan replay y solo se materializan completos en una transacción antes de notificar a la interfaz o confirmar ACK.');
