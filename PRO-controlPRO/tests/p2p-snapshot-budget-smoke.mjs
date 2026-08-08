import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  configureP2PStorageLimits,
  validateSnapshotBudgetMetadata
} from '../src/js/p2p-storage.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

configureP2PStorageLimits({ snapshotMaxBytes: 1024, snapshotMaxChunks: 4 });
// El configurador no permite rebajar el límite de bytes por debajo de 8 KiB.
const configuredLimits = configureP2PStorageLimits({ snapshotMaxBytes: 8 * 1024, snapshotMaxChunks: 4, snapshotSessionTtlSeconds: 60 });
if (configuredLimits.snapshotSessionTtlSeconds !== 300) {
  throw new Error('La retención de snapshots incompletos quedó por debajo de la ventana mínima segura.');
}

const valid = validateSnapshotBudgetMetadata({
  chunkCount: 2,
  snapshotByteCount: 4096,
  chunkByteCount: 2048
});
if (!valid.valid) throw new Error('Un fragmento dentro del presupuesto fue rechazado.');

if (validateSnapshotBudgetMetadata({
  chunkCount: 5,
  snapshotByteCount: 4096,
  chunkByteCount: 1024
}).reason !== 'snapshot_chunk_limit_exceeded') {
  throw new Error('El almacenamiento local no cercó el número total de fragmentos.');
}

if (validateSnapshotBudgetMetadata({
  chunkCount: 2,
  snapshotByteCount: 9000,
  chunkByteCount: 4500
}).reason !== 'snapshot_byte_limit_exceeded') {
  throw new Error('El almacenamiento local no cercó el tamaño acumulado del snapshot.');
}

if (validateSnapshotBudgetMetadata({
  chunkCount: 2,
  snapshotByteCount: 4096,
  chunkByteCount: 5000
}).reason !== 'snapshot_chunk_byte_count_invalid') {
  throw new Error('El almacenamiento local aceptó un fragmento mayor que su manifiesto.');
}

if (validateSnapshotBudgetMetadata({
  chunkCount: 1,
  snapshotByteCount: 4096,
  chunkByteCount: 12,
  entities: []
}).reason !== 'snapshot_chunk_byte_count_mismatch') {
  throw new Error('El almacenamiento local confió en un tamaño declarado que no coincide con el fragmento recibido.');
}

const decryptedSnapshotEntities = [{
  entityType: 'admin.project',
  entityId: 'project',
  value: { name: 'Proyecto recuperado', budget: 42000000 }
}];
const encryptedTransportByteCount = 640;
const encryptedSnapshotBudget = validateSnapshotBudgetMetadata({
  chunkCount: 1,
  snapshotByteCount: encryptedTransportByteCount,
  chunkByteCount: encryptedTransportByteCount,
  entities: decryptedSnapshotEntities
}, { measuredChunkByteCount: encryptedTransportByteCount });
if (!encryptedSnapshotBudget.valid) {
  throw new Error('IndexedDB sigue comparando el tamaño cifrado declarado contra el tamaño menor de las entidades ya descifradas.');
}

const client = fs.readFileSync(path.join(root, 'src/js/p2p-client.js'), 'utf8');
for (const marker of [
  'snapshotTransferMaxBytes',
  'snapshotMaxChunks',
  'snapshotByteCount',
  'chunkByteCount',
  'P2P_SNAPSHOT_TOO_LARGE',
  'snapshotSessionTtlSeconds'
]) {
  if (!client.includes(marker)) throw new Error(`Falta la validación preventiva del cliente: ${marker}`);
}

const storageSource = fs.readFileSync(path.join(root, 'src/js/p2p-storage.js'), 'utf8');
for (const marker of ['cleanupSnapshotSessions', 'removeOtherSessions', 'removeCurrent']) {
  if (!storageSource.includes(marker)) throw new Error(`Falta el ciclo de limpieza local de snapshots: ${marker}`);
}

console.log('OK: el cliente y IndexedDB rechazan snapshots que exceden su presupuesto antes de materializarlos y elimina sesiones parciales obsoletas.');
