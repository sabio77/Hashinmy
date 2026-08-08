import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../src/js/p2p-client.js', import.meta.url), 'utf8');
const start = source.indexOf('function sortSnapshotEntities');
const end = source.indexOf('async function sha256Hex', start);
assert.ok(start >= 0 && end > start, 'No se encontraron los helpers de recuperación local.');
const helperSource = source.slice(start, end)
  .replace('export function canonicalLocalSnapshotEntities', 'function canonicalLocalSnapshotEntities')
  .replace('export function localSnapshotSourceAllowed', 'function localSnapshotSourceAllowed')
  .replace('export function planLocalSnapshotRequests', 'function planLocalSnapshotRequests');
const moduleUrl = `data:text/javascript;base64,${Buffer.from(`${helperSource}\nexport { canonicalLocalSnapshotEntities, localSnapshotSourceAllowed, planLocalSnapshotRequests };`).toString('base64')}`;
const {
  canonicalLocalSnapshotEntities,
  localSnapshotSourceAllowed,
  planLocalSnapshotRequests
} = await import(moduleUrl);

const entities = canonicalLocalSnapshotEntities([
  {
    entityType: 'purchase', entityId: 'confirmed', optimistic: true,
    value: { total: 999 }, operationId: 'pending_1',
    confirmedExists: true, confirmedValue: { total: 100 }, confirmedDeleted: false,
    confirmedOperationId: 'server_1', confirmedOperationType: 'entity.put',
    confirmedSpaceSequence: 7, confirmedStateRevision: 7, confirmedUpdatedAt: '2026-08-01T20:00:00.000Z'
  },
  {
    entityType: 'purchase', entityId: 'only-pending', optimistic: true,
    value: { total: 50 }, operationId: 'pending_2',
    confirmedExists: false, confirmedValue: null, confirmedDeleted: false,
    confirmedOperationId: '', confirmedSpaceSequence: 0, confirmedStateRevision: 0
  },
  {
    entityType: 'purchase', entityId: 'deleted',
    confirmedExists: false, confirmedValue: null, confirmedDeleted: true,
    confirmedOperationId: 'server_2', confirmedOperationType: 'entity.delete',
    confirmedSpaceSequence: 8, confirmedStateRevision: 8
  }
]);
assert.equal(entities.length, 2, 'El snapshot local incluyó una entidad exclusivamente optimista.');
assert.deepEqual(entities.find((entity) => entity.entityId === 'confirmed')?.value, { total: 100 }, 'El snapshot filtró el valor optimista en vez del confirmado.');
assert.equal(entities.find((entity) => entity.entityId === 'deleted')?.deleted, true, 'El snapshot perdió una eliminación confirmada.');

const space = { ownerUserId: 'owner_a' };
assert.equal(localSnapshotSourceAllowed(space, 'owner_a', 'member_b'), true, 'El propietario debe poder reconstruir al invitado.');
assert.equal(localSnapshotSourceAllowed(space, 'member_b', 'member_b'), true, 'Dos instalaciones de la misma cuenta deben poder reconstruirse entre sí.');
assert.equal(localSnapshotSourceAllowed(space, 'member_b', 'member_c'), false, 'Un invitado no debe imponer snapshots a otro invitado.');

assert.deepEqual(planLocalSnapshotRequests(
  { space_a: 4, space_b: 9, space_c: 2 },
  { space_a: 8, space_b: 9, space_c: 1 }
), [{ spaceId: 'space_a', localStateRevision: 4, remoteStateRevision: 8 }]);

assert.deepEqual(planLocalSnapshotRequests(
  { legacy_project: 0 },
  { legacy_project: 0 },
  { forceSpaceIds: ['legacy_project'] }
), [{
  spaceId: 'legacy_project',
  localStateRevision: 0,
  remoteStateRevision: 0,
  forceRecovery: true
}], 'Una réplica mínima legacy con revisión 0 debe poder pedir snapshot por Wi-Fi aunque ambos watermarks sean iguales.');

for (const expected of [
  "type: 'p2p.sin.control'",
  "type: 'p2p.sin.snapshot'",
  "action === 'state.advertisement'",
  "action === 'snapshot.request'",
  'verifySignedLocalEnvelope',
  'resolveRecoveryRequirement(spaceId, sourceStateRevision)',
  "space.authorizationState === 'unconfirmed' && !this.isSpaceReplicaRecoveryPending(spaceId)",
  'forceRecovery: plan.forceRecovery === true',
  'await this.confirmRecoveredReplicaAuthorization(spaceId, sessionContext)',
  'this.localTransport?.sendTo?.(sessionId, body)'
]) {
  assert.ok(source.includes(expected), `Falta la protección de recuperación local: ${expected}`);
}
assert.ok(!source.includes('setInterval('), 'La anti-entropía local agregó polling periódico.');

console.log('OK: la red local detecta revisiones atrasadas y reconstruye solo estado canónico mediante snapshots firmados, cifrados y dirigidos.');
