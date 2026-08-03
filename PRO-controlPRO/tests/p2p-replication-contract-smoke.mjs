import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const sourcePath = path.join(root, 'src', 'js', 'p2p-client.js');
const source = fs.readFileSync(sourcePath, 'utf8');
const start = source.indexOf('function isEntityOperationType');
const end = source.indexOf('function normalizeDeleteReferenceGuards', start);
assert.ok(start >= 0 && end > start, 'No se encontró el contrato de entrega dentro de p2p-client.js.');

const contractSource = source.slice(start, end).replace('export function normalizePublishDeliveryIntent', 'function normalizePublishDeliveryIntent');
const moduleSource = `${contractSource}\nexport { normalizePublishDeliveryIntent };`;
const moduleUrl = `data:text/javascript;base64,${Buffer.from(moduleSource).toString('base64')}`;
const { normalizePublishDeliveryIntent } = await import(moduleUrl);

for (const type of ['entity.put', 'entity.patch', 'entity.delete', 'custom']) {
  assert.throws(
    () => normalizePublishDeliveryIntent(type, { targetDeviceIds: ['dev_target_000001'] }),
    (error) => error?.status === 400 && error?.code === 'P2P_PARTIAL_STATE_DELIVERY_FORBIDDEN',
    `${type} todavía admite una réplica parcial.`
  );
}

assert.deepEqual(
  normalizePublishDeliveryIntent('entity.patch', { includeSourceDevice: false }),
  { targetDeviceIds: [], includeSourceDevice: true, durableStateOperation: true },
  'Una operación durable puede excluir al dispositivo emisor.'
);

assert.deepEqual(
  normalizePublishDeliveryIntent('snapshot.chunk', {
    targetDeviceIds: ['dev_target_000001', 'dev_target_000001', 'dev_target_000002'],
    includeSourceDevice: false
  }),
  {
    targetDeviceIds: ['dev_target_000001', 'dev_target_000002'],
    includeSourceDevice: false,
    durableStateOperation: false
  },
  'La entrega dirigida de snapshots dejó de conservarse.'
);

assert.match(source, /const deliveryIntent = normalizePublishDeliveryIntent\(normalized\.type, options\);/);
assert.match(source, /includeSourceDevice: deliveryIntent\.includeSourceDevice/);
assert.match(source, /const orderedSourceConfirmation = deliveryIntent\.durableStateOperation/);

console.log('OK: el cliente impide fan-out parcial del estado durable y conserva snapshots dirigidos.');
