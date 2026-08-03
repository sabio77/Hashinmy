import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const currentFile = fileURLToPath(import.meta.url);
const root = path.resolve(path.dirname(currentFile), '..');
const storageSource = fs.readFileSync(path.join(root, 'src', 'js', 'p2p-storage.js'), 'utf8');
const clientSource = fs.readFileSync(path.join(root, 'src', 'js', 'p2p-client.js'), 'utf8');
const appSource = fs.readFileSync(path.join(root, 'src', 'js', 'app.js'), 'utf8');

const storageStart = storageSource.indexOf('export async function enqueueOptimisticOperationBatch');
const storageEnd = storageSource.indexOf('export async function listOutbox', storageStart);
assert.ok(storageStart >= 0 && storageEnd > storageStart, 'No se encontró la transacción local por lote.');
const storageFunction = storageSource
  .slice(storageStart, storageEnd)
  .replace('export async function', 'async function');

const storageHarness = `
const STORES = { entities: 'entities', outbox: 'outbox' };
let transactionCalls = 0;
let applied = [];
let saved = [];
async function requestToPromise(request) { return request.result; }
async function applyEntityOperation(_store, event) {
  applied.push(event.operation.operationId);
  return { applied: true, operationId: event.operation.operationId };
}
async function withStores(names, mode, callback) {
  transactionCalls += 1;
  if (mode !== 'readwrite' || names.join(',') !== 'entities,outbox') throw new Error('Contrato de transacción inválido.');
  return callback({
    entities: {},
    outbox: { put(item) { saved.push(item.operationId); return { result: item.operationId }; } }
  });
}
${storageFunction}
export { enqueueOptimisticOperationBatch, applied, saved, transactionCalls };
`;
const storageUrl = `data:text/javascript;base64,${Buffer.from(storageHarness).toString('base64')}`;
const storageModule = await import(storageUrl);
const batchEntries = [
  { item: { operationId: 'op_purchase' }, event: { operation: { operationId: 'op_purchase' } } },
  { item: { operationId: 'op_link' }, event: { operation: { operationId: 'op_link' } } }
];
const localBatchResult = await storageModule.enqueueOptimisticOperationBatch(batchEntries);
assert.equal(storageModule.transactionCalls, 1, 'El lote abrió más de una transacción IndexedDB.');
assert.deepEqual(storageModule.applied, ['op_purchase', 'op_link'], 'Las capas optimistas perdieron el orden del lote.');
assert.deepEqual(storageModule.saved, ['op_purchase', 'op_link'], 'El outbox no se guardó dentro de la misma transacción.');
assert.equal(localBatchResult.count, 2, 'El lote no confirmó sus dos operaciones locales.');
await assert.rejects(
  () => storageModule.enqueueOptimisticOperationBatch([
    batchEntries[0],
    { item: { operationId: 'op_purchase' }, event: { operation: { operationId: 'op_purchase' } } }
  ]),
  /repetidos/,
  'Un lote con operationId repetido no fue rechazado antes de escribir.'
);
await assert.rejects(
  () => storageModule.enqueueOptimisticOperationBatch([
    batchEntries[0],
    { item: { operationId: 'op_link_outbox' }, event: { operation: { operationId: 'op_link_event' } } }
  ]),
  /mismo identificador/,
  'Un lote con identidades distintas entre evento y outbox no fue rechazado antes de escribir.'
);

const rejectBatchStart = storageSource.indexOf('async function rejectOutboxOperationInStores');
const rejectBatchEnd = storageSource.indexOf('export async function clearP2PLocalData', rejectBatchStart);
assert.ok(rejectBatchStart >= 0 && rejectBatchEnd > rejectBatchStart, 'No se encontró la reversión local atómica por lote.');
const rejectBatchFunctions = storageSource
  .slice(rejectBatchStart, rejectBatchEnd)
  .replaceAll('export async function', 'async function');
const rejectHarness = `
const STORES = { entities: 'entities', outbox: 'outbox' };
let transactionCalls = 0;
let deleted = [];
async function requestToPromise(request){ return request.result; }
function isEntityOperation(){ return false; }
function operationIdOf(operation){ return operation?.operationId || ''; }
function normalizeDependentDeletes(){ return []; }
async function withStores(names, mode, callback){
  transactionCalls += 1;
  if(mode !== 'readwrite' || names.join(',') !== 'entities,outbox') throw new Error('Contrato de reversión inválido.');
  return callback({
    entities: {},
    outbox: { delete(operationId){ deleted.push(operationId); return {result:true}; } }
  });
}
${rejectBatchFunctions}
export { rejectOutboxOperationBatch, transactionCalls, deleted };
`;
const rejectUrl = `data:text/javascript;base64,${Buffer.from(rejectHarness).toString('base64')}`;
const rejectModule = await import(rejectUrl);
const rejectedBatchResult = await rejectModule.rejectOutboxOperationBatch([
  { operationId: 'op_purchase', batchIndex: 0, request: { operation: { operationId: 'op_purchase' } } },
  { operationId: 'op_link', batchIndex: 1, request: { operation: { operationId: 'op_link' } } }
], Object.assign(new Error('rechazo'), { status: 403 }));
assert.equal(rejectModule.transactionCalls, 1, 'La reversión del lote abrió más de una transacción IndexedDB.');
assert.deepEqual(rejectModule.deleted, ['op_link', 'op_purchase'], 'La reversión no retiró primero la operación dependiente más reciente.');
assert.deepEqual(rejectedBatchResult.rollbacks.map((entry) => entry.operationId), ['op_purchase', 'op_link'], 'La respuesta de reversión perdió el orden público del lote.');

const batchStart = clientSource.indexOf('  async publishBatch(');
const batchEnd = clientSource.indexOf('\n  put(spaceId', batchStart);
assert.ok(batchStart >= 0 && batchEnd > batchStart, 'No se encontró publishBatch en el cliente P2P.');
const batchMethod = clientSource.slice(batchStart, batchEnd);

const clientHarness = `
let queuedEntries = [];
let dispatched = [];
let localBroadcasts = [];
let idCounter = 0;
function createId(prefix) { idCounter += 1; return prefix + '_' + idCounter; }
function getSessionToken() { return 'session'; }
function dispatch(name, detail) { dispatched.push({ name, detail }); }
async function enqueueOptimisticOperationBatch(entries) {
  queuedEntries = entries;
  return { results: entries.map((entry) => ({ applied: true, operationId: entry.item.operationId })) };
}
async function listOutbox() { return queuedEntries.map((entry) => entry.item); }
class TestClient {
  constructor() {
    this.flushResult = { sent: 0, rejected: 0, pending: 0, sentOperations: [], rejectedOperations: [] };
  }
  captureSessionContext() { return { userId: 'usr_1', deviceId: 'dev_1' }; }
  assertSessionContext() { return true; }
  async preparePublishEnvelope(spaceId, operation, _options, _sessionContext, createdAt) {
    return {
      normalized: { ...operation },
      request: { spaceId, operation },
      localEvent: { spaceId, operation, createdAt },
      outboxItem: { operationId: operation.operationId, spaceId, createdAt },
      deliveryIntent: { durableStateOperation: true },
      orderedSourceConfirmation: true
    };
  }
  async flushOutbox() { return this.flushResult; }
  async broadcastPreparedOperationBatchToLocalNetwork(entries, batchId) {
    localBroadcasts.push({ batchId, operationIds: entries.map((entry) => entry.normalized.operationId) });
    return { delivered: 1, peers: ['peer_local_1'] };
  }
${batchMethod}
}
export { TestClient, queuedEntries, dispatched, localBroadcasts };
`;
const clientUrl = `data:text/javascript;base64,${Buffer.from(clientHarness).toString('base64')}`;
const clientModule = await import(clientUrl);
Object.defineProperty(globalThis, 'navigator', { value: { onLine: false }, configurable: true });
const offlineClient = new clientModule.TestClient();
const offlineResult = await offlineClient.publishBatch('space_1', [
  { operation: { operationId: 'op_purchase', type: 'entity.put' } },
  { operation: { operationId: 'op_link', type: 'entity.put' } }
]);
assert.equal(offlineResult.queued, true, 'El lote offline no quedó marcado como recuperable.');
assert.equal(offlineResult.localDelivered, 1, 'El lote offline no se transmitió por la red local.');
assert.deepEqual(offlineResult.localPeers, ['peer_local_1'], 'El resultado no informó el par local que recibió el lote.');
assert.equal(clientModule.localBroadcasts.length, 1, 'El lote offline se difundió más de una vez.');
assert.deepEqual(clientModule.localBroadcasts[0].operationIds, ['op_purchase', 'op_link'], 'La difusión local perdió una operación o alteró su orden.');
assert.equal(clientModule.queuedEntries.length, 2, 'Las dos operaciones no se guardaron juntas antes de usar la red.');
assert.equal(clientModule.queuedEntries[0].item.batchId, clientModule.queuedEntries[1].item.batchId, 'Las operaciones perdieron su identidad común de lote.');
assert.equal(clientModule.queuedEntries[0].item.batchIndex, 0);
assert.equal(clientModule.queuedEntries[1].item.batchIndex, 1);
assert.ok(
  clientModule.queuedEntries[0].item.createdAt < clientModule.queuedEntries[1].item.createdAt,
  'El outbox no conserva un orden estable entre compra y vínculo.'
);

Object.defineProperty(globalThis, 'navigator', { value: { onLine: true }, configurable: true });
const onlineClient = new clientModule.TestClient();
onlineClient.flushResult = {
  sent: 2,
  rejected: 0,
  pending: 2,
  sentOperations: [
    { operationId: 'op_purchase', batchId: 'batch_fixed', batchIndex: 0 },
    { operationId: 'op_link', batchId: 'batch_fixed', batchIndex: 1 }
  ],
  rejectedOperations: []
};
const onlineResult = await onlineClient.publishBatch('space_1', [
  { operation: { operationId: 'op_purchase', type: 'entity.put' } },
  { operation: { operationId: 'op_link', type: 'entity.put' } }
], { batchId: 'batch_fixed' });
assert.equal(onlineResult.queued, false, 'Un lote ya aceptado por el backend quedó reportado como offline.');
assert.equal(onlineResult.sent, 2, 'No se reconocieron ambas publicaciones del lote.');

const rejectedClient = new clientModule.TestClient();
rejectedClient.flushResult = {
  sent: 1,
  rejected: 1,
  pending: 0,
  sentOperations: [{ operationId: 'op_purchase', batchId: 'batch_rejected', batchIndex: 0 }],
  rejectedOperations: [{
    operationId: 'op_link',
    batchId: 'batch_rejected',
    batchIndex: 1,
    status: 409,
    code: 'P2P_REFERENCE_REQUIRED',
    cancelled: false
  }]
};
await assert.rejects(
  () => rejectedClient.publishBatch('space_1', [
    { operation: { operationId: 'op_purchase', type: 'entity.put' } },
    { operation: { operationId: 'op_link', type: 'entity.put' } }
  ], { batchId: 'batch_rejected' }),
  (error) => error?.code === 'P2P_BATCH_PARTIAL_REJECTION'
    && error?.p2pBatchPartial === true
    && error?.rejectedOperations?.[0]?.operationId === 'op_link',
  'El cliente no informó el rechazo parcial del vínculo después de conservar la compra.'
);

assert.match(clientSource, /abortBatchOnFailure: true/);
assert.match(clientSource, /P2P_BATCH_CANCELLED/);
assert.match(clientSource, /await this\.revertRejectedOutbox\(candidate, batchCancellationError, sessionContext\)/);
assert.match(appSource, /semillaP2P\.publishBatch\([\s\S]*recordOperation[\s\S]*projectionLinkOperation/);
assert.match(appSource, /recordRejected[\s\S]*p2pBatchPartial/);

console.log('OK: compra y vínculo de proyección se guardan en un lote local atómico, ordenado y recuperable ante cierre o rechazo.');
