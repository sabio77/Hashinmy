import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const currentFile = fileURLToPath(import.meta.url);
const root = path.resolve(path.dirname(currentFile), '..');
const source = fs.readFileSync(path.join(root, 'src', 'js', 'p2p-client.js'), 'utf8');

assert.match(source, /type: 'p2p\.sin\.signed-batch'/, 'El cliente no genera un sobre explícito para lotes LAN.');
assert.match(source, /signedPayload\.batchId = batchId/);
assert.match(source, /signedPayload\.batchIndex = batchIndex/);
assert.match(source, /signedPayload\.batchSize = batchSize/);
assert.match(source, /body\?\.type === 'p2p\.sin\.signed-batch'[\s\S]*handleLocalTransportBatchPayload/);
assert.match(source, /handleLocalTransportBatchPayload[\s\S]*enqueueOptimisticOperationBatch/,
  'El receptor no aplica el lote LAN dentro de una sola transacción local.');
assert.match(source, /relayedFromLocalNetwork: true[\s\S]*localRelayEnvelope:[\s\S]*signedPayload/,
  'El receptor no conserva los sobres firmados para recuperar conectividad sin cambiar la autoría.');
assert.match(source, /apiPost\('\/api\/p2p\/events\/relay-local-batch'/,
  'Los lotes recibidos por LAN no tienen una ruta atómica de recuperación hacia memoriaBACKEND.');
assert.match(source, /relayCode === 'P2P_BATCH_PREEXISTING_OPERATION'[\s\S]*individualBatchFallbackIds\.add\(batchId\)/,
  'Falta la compatibilidad segura para datos publicados por versiones anteriores.');
assert.match(source, /applyDecryptedOperationEventBatch\(canonicalRelayedEvents/,
  'La confirmación canónica del relay vuelve a aplicar las operaciones de forma individual.');

const completeStart = source.indexOf('  completeAtomicOutboxBatch(');
const completeEnd = source.indexOf('\n  async refreshOutboxBatchEncryption', completeStart);
const flushStart = source.indexOf('  async flushOutboxToLocalNetwork()');
const flushEnd = source.indexOf('\n  async activateDeviceCryptoIdentity', flushStart);
assert.ok(completeStart >= 0 && completeEnd > completeStart, 'No se encontró el agrupador de outbox atómico.');
assert.ok(flushStart >= 0 && flushEnd > flushStart, 'No se encontró la descarga del outbox por red local.');
const completeMethod = source.slice(completeStart, completeEnd);
const flushMethod = source.slice(flushStart, flushEnd);

const harness = `
let batchBroadcasts = [];
let individualBroadcasts = [];
const pending = [
  {
    operationId: 'op_purchase', spaceId: 'space_1', batchId: 'batch_1', batchIndex: 0, batchSize: 2,
    abortBatchOnFailure: true, createdAt: '2026-08-01T18:00:00.000Z',
    request: { spaceId: 'space_1', includeSourceDevice: true, targetDeviceIds: [], operation: { operationId: 'op_purchase', type: 'entity.put' } }
  },
  {
    operationId: 'op_projection_link', spaceId: 'space_1', batchId: 'batch_1', batchIndex: 1, batchSize: 2,
    abortBatchOnFailure: true, createdAt: '2026-08-01T18:00:00.001Z',
    request: { spaceId: 'space_1', includeSourceDevice: true, targetDeviceIds: [], operation: { operationId: 'op_projection_link', type: 'entity.put' } }
  },
  {
    operationId: 'op_income', spaceId: 'space_1', createdAt: '2026-08-01T18:00:00.002Z',
    request: { spaceId: 'space_1', includeSourceDevice: true, targetDeviceIds: [], operation: { operationId: 'op_income', type: 'entity.put' } }
  }
];
function isEntityOperationType(type) { return String(type || '').startsWith('entity.'); }
async function listOutbox() { return pending; }
class TestClient {
  constructor() {
    this.localTransport = {
      status: () => ({ connected: true }),
      async broadcast(body) { individualBroadcasts.push(body); return { delivered: 1 }; }
    };
  }
  sinBackendEnabled() { return true; }
  captureSessionContext() { return { userId: 'user_1', deviceId: 'device_1' }; }
  async createSignedLocalOperationBody(request) { return { type: 'p2p.sin.signed-operation', operationId: request.operation.operationId }; }
  async broadcastPreparedOperationBatchToLocalNetwork(entries, batchId) {
    batchBroadcasts.push({ batchId, operationIds: entries.map((entry) => entry.request.operation.operationId) });
    return { delivered: 1 };
  }
${completeMethod}
${flushMethod}
}
export { TestClient, batchBroadcasts, individualBroadcasts };
`;
const harnessUrl = `data:text/javascript;base64,${Buffer.from(harness).toString('base64')}`;
const module = await import(harnessUrl);
const client = new module.TestClient();
const result = await client.flushOutboxToLocalNetwork();
assert.equal(result.pending, 3);
assert.equal(result.delivered, 2, 'Debe existir una difusión para el lote y otra para la operación independiente.');
assert.deepEqual(module.batchBroadcasts, [{
  batchId: 'batch_1',
  operationIds: ['op_purchase', 'op_projection_link']
}], 'El outbox descompuso o reordenó el lote antes de transmitirlo por Wi-Fi.');
assert.deepEqual(module.individualBroadcasts.map((entry) => entry.operationId), ['op_income'],
  'Una operación del lote se volvió a transmitir individualmente o se perdió la operación independiente.');


const receiverStart = source.indexOf('  capabilityOperationAuthorized(');
const receiverEnd = source.indexOf('\n  async broadcastPreparedOperationToLocalNetwork', receiverStart);
assert.ok(receiverStart >= 0 && receiverEnd > receiverStart, 'No se encontró el receptor de lotes LAN.');
const receiverMethods = source.slice(receiverStart, receiverEnd);
const receiverHarness = `
const P2P_APPLICATION_ID = 'control-proyectos';
const window = { location: { origin: 'https://hashinmy.com' } };
let enqueueCalls = [];
let dispatched = [];
function dispatch(name, detail) { dispatched.push({ name, detail }); }
function isEntityOperationType(type) { return ['entity.put', 'entity.patch', 'entity.delete', 'custom'].includes(String(type || '')); }
function memberAllowsDurableOperation(_scope, membership, operation) {
  const permissions = Array.isArray(membership?.permissions) ? membership.permissions : [];
  if (!permissions.includes('read')) return false;
  if (membership?.role === 'owner') return true;
  const entityType = String(operation?.entityType || '').toLowerCase();
  if (entityType === 'admin.project') return false;
  if (entityType === 'admin.projection-link') return permissions.includes('projection') || permissions.includes('write');
  if (operation?.type === 'entity.delete' && entityType === 'admin.projection') return permissions.includes('write') || (permissions.includes('delete') && permissions.includes('projection'));
  if (entityType === 'admin.projection') return permissions.includes('projection') || permissions.includes('write');
  if (operation?.type === 'entity.delete') return permissions.includes('delete') || permissions.includes('write');
  return permissions.includes('add') || permissions.includes('write');
}
async function verifyP2PLocalCapability() {
  return {
    userId: 'user_sender',
    deviceId: 'device_sender',
    signingPublicKey: { kty: 'EC' },
    memberships: [{ spaceId: 'space_1', role: 'member', permissions: ['read', 'add', 'projection'], resourceType: 'admin.project', permissionProfile: 'admin-project-v1' }]
  };
}
async function verifyP2PLocalSignature(_key, _payload, signature) { return signature !== 'bad'; }
async function decryptOperationEvent(event) { return { ...event, operation: { ...event.operation } }; }
async function encryptOperationForTransport(_spaceId, operation) { return operation; }
async function enqueueOptimisticOperationBatch(entries) {
  enqueueCalls.push(entries);
  return { results: entries.map((entry) => ({ applied: true, operationId: entry.item.operationId })) };
}
async function enqueueOptimisticOperation() { throw new Error('No debe usarse la ruta individual para un lote.'); }
class ReceiverClient {
  constructor() {
    this.localCapabilityAuthority = {};
    this.bootstrapState = {
      spaces: [{
        spaceId: 'space_1',
        authorizationState: 'confirmed',
        resourceType: 'admin.project',
        permissionProfile: 'admin-project-v1',
        members: [{ userId: 'user_sender', role: 'member', permissions: ['read', 'add', 'projection'] }]
      }]
    };
  }
  captureSessionContext() { return { userId: 'user_receiver', deviceId: 'device_receiver' }; }
  assertSessionContext() { return true; }
  assertEncryptedTransportEvent() { return true; }
  spaceRequiresEncryption() { return false; }
${receiverMethods}
}
export { ReceiverClient, enqueueCalls, dispatched };
`;
const receiverUrl = `data:text/javascript;base64,${Buffer.from(receiverHarness).toString('base64')}`;
const receiverModule = await import(receiverUrl);
const receiver = new receiverModule.ReceiverClient();
const signedEntries = [0, 1].map((index) => ({
  signedPayload: {
    schemaVersion: 1,
    type: 'p2p.sin.operation',
    origin: 'https://hashinmy.com',
    applicationId: 'control-proyectos',
    userId: 'user_sender',
    deviceId: 'device_sender',
    spaceId: 'space_1',
    operationId: index === 0 ? 'op_purchase' : 'op_projection_link',
    batchId: 'batch_1',
    batchIndex: index,
    batchSize: 2,
    request: {
      deviceId: 'device_sender',
      spaceId: 'space_1',
      includeSourceDevice: true,
      targetDeviceIds: [],
      operation: {
        operationId: index === 0 ? 'op_purchase' : 'op_projection_link',
        type: 'entity.put',
        entityType: index === 0 ? 'admin.purchase' : 'admin.projection-link',
        entityId: index === 0 ? 'purchase_1' : 'link_1',
        payload: { value: { amount: index + 1 } }
      }
    },
    createdAt: `2026-08-01T18:00:00.00${index}Z`,
    nonce: `nonce_${index}`
  },
  signature: `signature_${index}`
}));
const accepted = await receiver.handleLocalTransportBatchPayload({
  messageId: 'message_batch_1',
  sentAt: '2026-08-01T18:00:00.000Z',
  peer: { userId: 'user_sender', deviceId: 'device_sender' },
  body: {
    schemaVersion: 1,
    type: 'p2p.sin.signed-batch',
    batchId: 'batch_1',
    spaceId: 'space_1',
    batchSize: 2,
    capability: { payload: { userId: 'user_sender' } },
    entries: signedEntries
  }
});
assert.equal(accepted, true, 'El receptor rechazó un lote LAN válido.');
assert.equal(receiverModule.enqueueCalls.length, 1, 'El receptor no usó una sola transacción para el lote.');
assert.equal(receiverModule.enqueueCalls[0].length, 2);
assert.deepEqual(
  receiverModule.enqueueCalls[0].map((entry) => [entry.item.operationId, entry.item.batchIndex, entry.item.batchSize]),
  [['op_purchase', 0, 2], ['op_projection_link', 1, 2]],
  'La persistencia receptora perdió identidad u orden del lote.'
);
assert.ok(receiverModule.enqueueCalls[0].every((entry) => entry.item.relayedFromLocalNetwork === true));
assert.ok(receiverModule.enqueueCalls[0].every((entry) => entry.item.localRelayEnvelope?.signedPayload?.batchId === 'batch_1'));

const enqueueCountBeforeReject = receiverModule.enqueueCalls.length;
const rejected = await receiver.handleLocalTransportBatchPayload({
  messageId: 'message_batch_bad',
  peer: { userId: 'user_sender', deviceId: 'device_sender' },
  body: {
    schemaVersion: 1,
    type: 'p2p.sin.signed-batch',
    batchId: 'batch_bad',
    spaceId: 'space_1',
    batchSize: 2,
    capability: {},
    entries: signedEntries.map((entry, index) => ({
      ...entry,
      signature: index === 1 ? 'bad' : entry.signature,
      signedPayload: { ...entry.signedPayload, batchId: 'batch_bad' }
    }))
  }
});
assert.equal(rejected, false, 'El receptor aceptó un lote con una firma inválida.');
assert.equal(receiverModule.enqueueCalls.length, enqueueCountBeforeReject, 'El receptor escribió parcialmente un lote rechazado.');

console.log('OK: los lotes P2P_sin_ permanecen atómicos por LAN y al recuperar conectividad.');
