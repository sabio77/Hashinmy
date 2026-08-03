import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const currentFile = fileURLToPath(import.meta.url);
const root = path.resolve(path.dirname(currentFile), '..');
const clientSource = fs.readFileSync(path.join(root, 'src', 'js', 'p2p-client.js'), 'utf8');

function methodSource(name, nextName) {
  const start = clientSource.indexOf(`  ${name}`);
  const end = clientSource.indexOf(`\n  ${nextName}`, start);
  assert.ok(start >= 0 && end > start, `No se encontró ${name}.`);
  return clientSource.slice(start, end);
}

const completeBatchMethod = methodSource('completeAtomicOutboxBatch(', 'async refreshOutboxBatchEncryption(');
const flushMethod = methodSource('async flushOutbox(', 'async sendSnapshot(');

const harness = `
let outbox = [];
let requests = [];
let batchMode = 'success';
function getSessionToken(){ return 'session'; }
function isEntityOperationType(type){ return ['entity.put','entity.patch','entity.delete','custom'].includes(type); }
function dispatch(){}
async function listOutbox(){ return outbox.slice(); }
async function removeOutbox(operationId){ outbox = outbox.filter((item)=>item.operationId!==operationId); }
async function apiPost(path, body){
  requests.push({path,body});
  if(path === '/api/p2p/events/publish-batch'){
    if(batchMode === 'preexisting'){
      const error = new Error('migración'); error.status = 409; error.code = 'P2P_BATCH_PREEXISTING_OPERATION'; throw error;
    }
    if(batchMode === 'rejected'){
      const error = new Error('permisos'); error.status = 403; error.code = 'P2P_BATCH_ACTOR_FORBIDDEN'; throw error;
    }
    if(batchMode === 'confirmed-error'){
      outbox = [];
      const error = new Error('respuesta perdida'); throw error;
    }
    return {
      batchId: body.batchId,
      events: body.operations.map((operation,index)=>({eventType:'p2p.operation',operation,deliverySequence:index+1,spaceSequence:index+1,stateRevision:index+1})),
      sourceDeviceQueued: true,
      deliveredToDevices: 2
    };
  }
  return {event:{eventType:'p2p.operation',operation:body.operation},sourceDeviceQueued:true,deliveredToDevices:2};
}
async function decryptOperationEvent(event){ return event; }
class TestClient {
  constructor(){ this.realtimeLeader=true; this.tabCoordinator={broadcast(){}}; this.reverted=[]; }
  captureSessionContext(){ return {userId:'usr_1',deviceId:'dev_1',sessionToken:'session',generation:1}; }
  assertSessionContext(){ return true; }
  isSessionContextCurrent(){ return true; }
  isSessionContextChangedError(){ return false; }
  createSessionContextChangedError(){ return new Error('session'); }
  isSpaceAuthorizationUnconfirmed(){ return false; }
  isKeyAuthorityRetryableError(error){ return ['P2P_KEY_STALE','P2P_BATCH_KEY_MISMATCH'].includes(error?.code); }
  isSpaceLocalOutboxBlocker(){ return false; }
  isPermanentOutboxRejection(error){ const status=Number(error?.status||0); return status>=400&&status<500&&![401,408,425,429].includes(status); }
  assertEncryptedTransportEvent(){ return true; }
  async applyDecryptedOperationEvent(){ return true; }
  async refreshOutboxBatchEncryption(items){ return items; }
  async refreshOutboxEncryption(){ return null; }
  async revertRejectedOutboxBatch(items,error){ this.reverted=items.map((item)=>item.operationId); outbox=[]; return {count:items.length,rollbacks:items.map(()=>({reverted:true,status:error.status}))}; }
  async revertRejectedOutbox(item){ this.reverted.push(item.operationId); outbox=outbox.filter((entry)=>entry.operationId!==item.operationId); }
${completeBatchMethod}
${flushMethod}
}
function setOutbox(items){ outbox=items; requests=[]; }
function setBatchMode(value){ batchMode=value; }
export {TestClient,setOutbox,setBatchMode};
export function state(){return {outbox:outbox.slice(),requests:requests.slice()};}
`;
const moduleUrl = `data:text/javascript;base64,${Buffer.from(harness).toString('base64')}`;
const module = await import(moduleUrl);
Object.defineProperty(globalThis, 'navigator', { value: { onLine: true }, configurable: true });

function batchItems(batchId='batch_1') {
  return [0,1].map((batchIndex)=>({
    operationId: `op_${batchIndex}`,
    spaceId: 'space_1',
    batchId,
    batchIndex,
    batchSize: 2,
    abortBatchOnFailure: true,
    request: {
      deviceId: 'dev_1',
      spaceId: 'space_1',
      includeSourceDevice: true,
      targetDeviceIds: [],
      operation: {operationId:`op_${batchIndex}`,type:'entity.put',entityType:'item',entityId:`item_${batchIndex}`,payload:{}}
    }
  }));
}

module.setBatchMode('success');
module.setOutbox(batchItems());
let client = new module.TestClient();
let result = await client.flushOutbox();
assert.equal(result.sent, 2);
assert.equal(result.rejected, 0);
assert.deepEqual(module.state().requests.map((request)=>request.path), ['/api/p2p/events/publish-batch']);
assert.ok(result.sentOperations.every((entry)=>entry.atomic === true));

module.setBatchMode('rejected');
module.setOutbox(batchItems('batch_rejected'));
client = new module.TestClient();
result = await client.flushOutbox();
assert.equal(result.sent, 0);
assert.equal(result.rejected, 2);
assert.deepEqual(client.reverted, ['op_0','op_1']);
assert.ok(result.rejectedOperations.every((entry)=>entry.atomic === true && entry.code === 'P2P_BATCH_ACTOR_FORBIDDEN'));
assert.equal(module.state().outbox.length, 0);


module.setBatchMode('confirmed-error');
module.setOutbox(batchItems('batch_stream_confirmed'));
client = new module.TestClient();
result = await client.flushOutbox();
assert.equal(result.sent, 2);
assert.equal(result.rejected, 0);
assert.ok(result.sentOperations.every((entry)=>entry.confirmedByStream === true));

module.setBatchMode('preexisting');
module.setOutbox(batchItems('batch_legacy'));
client = new module.TestClient();
result = await client.flushOutbox();
assert.equal(result.sent, 2);
assert.deepEqual(module.state().requests.map((request)=>request.path), [
  '/api/p2p/events/publish-batch',
  '/api/p2p/events/publish',
  '/api/p2p/events/publish'
]);

assert.match(clientSource, /rejectOutboxOperationBatch/);
assert.match(clientSource, /enqueueOutboxBatch/);
assert.match(clientSource, /P2P_BATCH_PREEXISTING_OPERATION/);
console.log('OK: el outbox confirma lotes con una sola llamada, revierte rechazos completos y conserva compatibilidad con operaciones antiguas.');
