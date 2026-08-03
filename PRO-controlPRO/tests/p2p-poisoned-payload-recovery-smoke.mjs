import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const currentFile = fileURLToPath(import.meta.url);
const root = path.resolve(path.dirname(currentFile), '..');
const source = fs.readFileSync(path.join(root, 'src', 'js', 'p2p-client.js'), 'utf8');
const cryptoModule = await import('../src/js/p2p-crypto.js');
const { createRejectedEncryptedPayloadError, isRejectedEncryptedPayloadError } = cryptoModule;

function methodSource(signature, nextSignature) {
  const start = source.indexOf(`  ${signature}`);
  const end = source.indexOf(`\n  ${nextSignature}`, start);
  assert.ok(start >= 0 && end > start, `No se encontró ${signature}.`);
  return source.slice(start, end);
}

const assertTransportEncryptionSource = methodSource(
  'assertEncryptedTransportEvent(',
  'keyEnvelopeRejectionScope('
);
const TestEncryptionClient = new Function(
  'createRejectedEncryptedPayloadError',
  `return class TestEncryptionClient {
    spaceRequiresEncryption() { return true; }
${assertTransportEncryptionSource}
  };`
)(createRejectedEncryptedPayloadError);
const encryptionClient = new TestEncryptionClient();

for (const [operation, expectedReason] of [
  [
    { type: 'entity.put', payload: { description: 'texto plano' } },
    'transport_encryption_metadata_missing'
  ],
  [
    { type: 'entity.patch', encrypted: true, encryptionVersion: 1, keyId: 'key_valid_0001', payload: { description: 'texto plano' } },
    'transport_payload_unprotected'
  ]
]) {
  let rejection = null;
  try {
    encryptionClient.assertEncryptedTransportEvent({ spaceId: 'space_budget', operation });
  } catch (error) {
    rejection = error;
  }
  assert.ok(rejection, 'El transporte sin cifrado no fue rechazado.');
  assert.equal(isRejectedEncryptedPayloadError(rejection), true, 'El rechazo no quedó clasificado como payload remoto determinista.');
  assert.equal(rejection.reason, expectedReason);
  assert.equal(rejection.retryable, false);
  assert.equal(rejection.spaceId, 'space_budget');
}
assert.equal(encryptionClient.assertEncryptedTransportEvent({
  spaceId: 'space_budget',
  operation: {
    type: 'entity.put',
    encrypted: true,
    encryptionVersion: 1,
    keyId: 'key_valid_0001',
    payload: {
      __p2pEncrypted: {
        version: 1,
        algorithm: 'A256GCM',
        keyId: 'key_valid_0001',
        iv: 'abcdefghijklmnop',
        ciphertext: 'abcdefghijklmnopqrstuvwx'
      }
    }
  }
}), true, 'Un evento protegido válido fue rechazado por la nueva defensa.');

const methods = [
  methodSource('snapshotSourceRejectionScope(', 'rejectedSnapshotSourceDeviceIds('),
  methodSource('rejectedSnapshotSourceDeviceIds(', 'rememberRejectedSnapshotSource('),
  methodSource('rememberRejectedSnapshotSource(', 'forgetRejectedSnapshotSource('),
  methodSource('forgetRejectedSnapshotSource(', 'snapshotSourceExclusionsBySpace('),
  methodSource('snapshotSourceExclusionsBySpace(', 'rejectEncryptedTransportEvents('),
  methodSource('rejectEncryptedTransportEvents(', 'async requestSpaceKey(')
].join('\n');

const harness = `
const SNAPSHOT_SOURCE_REJECTION_TTL_MS = 5 * 60 * 1000;
const SNAPSHOT_SOURCE_REJECTION_MAX_SOURCES = 32;
const SNAPSHOT_REJECTION_RETRY_MS = 5 * 1000;
const dispatched = [];
function dispatch(name, detail = {}) { dispatched.push({ name, detail }); }
class TestClient {
  constructor() {
    this.rejectedSnapshotSources = new Map();
    this.snapshotRecoveryRequired = false;
    this.recoverySpaces = ['space_budget', 'space_clean'];
    this.scheduled = [];
  }
  recoveryEligibleSpaceIds() { return this.recoverySpaces; }
  scheduleSnapshotRecovery(delay, options) { this.scheduled.push({ delay, options }); }
${methods}
}
export { TestClient, dispatched, SNAPSHOT_SOURCE_REJECTION_TTL_MS };
`;

const module = await import(`data:text/javascript;base64,${Buffer.from(harness).toString('base64')}`);
const client = new module.TestClient();
const rejected = client.rejectEncryptedTransportEvents([
  { eventId: 'event_bad_1', spaceId: 'space_budget', sourceDeviceId: 'device_bad_0001' },
  { eventId: 'event_bad_2', spaceId: 'space_budget', sourceDeviceId: 'device_bad_0001' },
  { eventId: 'event_bad_3', spaceId: 'space_other', sourceDeviceId: 'device_bad_0002' }
], Object.assign(new Error('ciphertext alterado'), { reason: 'authentication_failed' }));

assert.deepEqual(rejected, {
  space_budget: ['device_bad_0001'],
  space_other: ['device_bad_0002']
}, 'La cuarentena no quedó separada por proyecto o no deduplicó la fuente.');
assert.equal(client.snapshotRecoveryRequired, true, 'El payload irrecuperable no activó recuperación por snapshot.');
assert.deepEqual(client.scheduled, [{ delay: 5000, options: { replace: true } }]);
assert.equal(module.dispatched.length, 1, 'La cuarentena no emitió una única señal observable.');
assert.equal(module.dispatched[0].name, 'p2p:encrypted-payload-rejected');
assert.equal(module.dispatched[0].detail.reason, 'authentication_failed');
assert.deepEqual(client.snapshotSourceExclusionsBySpace(), rejected, 'El siguiente bootstrap no recibiría las fuentes rechazadas.');

client.rejectedSnapshotSources.get('space_budget').set(
  'device_bad_0001',
  Date.now() - module.SNAPSHOT_SOURCE_REJECTION_TTL_MS - 1
);
assert.deepEqual(client.rejectedSnapshotSourceDeviceIds('space_budget'), [], 'Una fuente reparada quedó excluida permanentemente.');
assert.equal(client.rejectedSnapshotSources.has('space_budget'), false, 'La cuarentena vencida no se limpió.');
assert.equal(client.forgetRejectedSnapshotSource('space_other', 'device_bad_0002'), true);
assert.deepEqual(client.snapshotSourceExclusionsBySpace(), {}, 'La fuente válida siguió excluida después de una recuperación confirmada.');

const bootstrapStart = source.indexOf('  async fetchBootstrap(');
const bootstrapEnd = source.indexOf('\n  async start(', bootstrapStart);
assert.ok(bootstrapStart >= 0 && bootstrapEnd > bootstrapStart, 'No se encontró fetchBootstrap.');
const bootstrapSource = source.slice(bootstrapStart, bootstrapEnd);
assert.match(bootstrapSource, /excludedSnapshotSourceDeviceIdsBySpace:\s*requestSnapshots === false/);
assert.match(bootstrapSource, /this\.snapshotSourceExclusionsBySpace\(\)/);

const batchStart = source.indexOf('  async handleEventBatch(');
const batchEnd = source.indexOf('\n  async handleKeyRequestEvent(', batchStart);
const batchSource = source.slice(batchStart, batchEnd);
assert.match(batchSource, /isRejectedEncryptedPayloadError\(error\)/);
assert.match(batchSource, /this\.rejectEncryptedTransportEvents\(ordered, error\)/);
assert.match(batchSource, /applied:\s*!deferred && !rejected/);
assert.match(batchSource, /this\.scheduleAck\(nextCursor\)/, 'Un lote venenoso volvería a bloquearse en cada replay.');

const eventStart = source.indexOf('  async handleEvent(event');
const eventEnd = source.indexOf('\n  ackRetryDelay()', eventStart);
assert.ok(eventStart >= 0 && eventEnd > eventStart, 'No se encontró handleEvent.');
const eventSource = source.slice(eventStart, eventEnd);
assert.match(eventSource, /isRejectedEncryptedPayloadError\(error\)/);
assert.match(eventSource, /this\.rejectEncryptedTransportEvents\(\[event\], error\)/);
assert.match(eventSource, /this\.scheduleAck\(nextCursor\)/, 'Un evento venenoso no avanza el cursor durable.');

console.log('OK: payload cifrado corrupto o transporte sin protección se descartan sin bloquear la cola, ponen en cuarentena su fuente y solicitan una réplica alternativa.');
