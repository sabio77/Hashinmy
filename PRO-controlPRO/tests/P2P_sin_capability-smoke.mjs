import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';

if (!globalThis.crypto) Object.defineProperty(globalThis, 'crypto', { value: webcrypto });
if (!globalThis.location) Object.defineProperty(globalThis, 'location', { value: { origin: 'https://hashinmy.com' } });
if (!globalThis.btoa) globalThis.btoa = (value) => Buffer.from(value, 'binary').toString('base64');
if (!globalThis.atob) globalThis.atob = (value) => Buffer.from(value, 'base64').toString('binary');

const {
  canonicalizeP2PLocalValue,
  verifyP2PLocalCapability,
  verifyP2PLocalSignature
} = await import('../src/js/p2p-crypto.js');
const {
  lifecycleReplicationPairAuthorized,
  memberAllowsDurableOperation,
  requiredPermissionForDurableOperation
} = await import('../src/js/p2p-permissions.js');

const toBase64Url = (bytes) => Buffer.from(bytes).toString('base64url');
assert.equal(
  canonicalizeP2PLocalValue({ z: undefined, a: [1, undefined], b: 'ok' }),
  '{"a":[1,null],"b":"ok"}'
);
const authorityKeys = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
const previousAuthorityKeys = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
const deviceKeys = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
const authorityPublic = { ...(await crypto.subtle.exportKey('jwk', authorityKeys.publicKey)), key_ops: ['verify'] };
const previousAuthorityPublic = { ...(await crypto.subtle.exportKey('jwk', previousAuthorityKeys.publicKey)), key_ops: ['verify'] };
const devicePublic = { ...(await crypto.subtle.exportKey('jwk', deviceKeys.publicKey)), key_ops: ['verify'] };
const now = Date.now();
const authority = {
  enabled: true,
  schemaVersion: 1,
  algorithm: 'ES256',
  keyId: 'p2psin_prueba_segura',
  publicKey: authorityPublic,
  capabilityTtlSeconds: 604800
};
const payload = {
  schemaVersion: 1,
  issuer: 'memoriaBACKEND',
  authorityKeyId: authority.keyId,
  tenantId: 'tenant_control',
  origin: 'https://hashinmy.com',
  applicationId: 'control-proyectos',
  userId: 'user_1',
  deviceId: 'device_1',
  signingPublicKey: devicePublic,
  memberships: [{ spaceId: 'space_1', role: 'member', permissions: ['read', 'add'], resourceType: 'admin.project', permissionProfile: 'admin-project-v1', encryptionKeyEpoch: 2 }],
  issuedAt: new Date(now - 1000).toISOString(),
  expiresAt: new Date(now + 3600000).toISOString()
};
const capabilitySignature = await crypto.subtle.sign(
  { name: 'ECDSA', hash: 'SHA-256' },
  authorityKeys.privateKey,
  new TextEncoder().encode(canonicalizeP2PLocalValue(payload))
);
const capability = { schemaVersion: 1, algorithm: 'ES256', payload, signature: toBase64Url(capabilitySignature) };

const verified = await verifyP2PLocalCapability(authority, capability, {
  origin: 'https://hashinmy.com',
  applicationId: 'control-proyectos',
  userId: 'user_1',
  deviceId: 'device_1',
  nowMs: now
});
assert.equal(verified.memberships[0].spaceId, 'space_1');
assert.equal(verified.memberships[0].resourceType, 'admin.project');
assert.equal(verified.memberships[0].permissionProfile, 'admin-project-v1');

const previousAuthorityKeyId = 'p2psin_prueba_anterior';
const previousPayload = {
  ...payload,
  authorityKeyId: previousAuthorityKeyId,
  issuedAt: new Date(now - 2000).toISOString(),
  expiresAt: new Date(now + 3600000).toISOString()
};
const previousCapabilitySignature = await crypto.subtle.sign(
  { name: 'ECDSA', hash: 'SHA-256' },
  previousAuthorityKeys.privateKey,
  new TextEncoder().encode(canonicalizeP2PLocalValue(previousPayload))
);
const previousCapability = {
  schemaVersion: 1,
  algorithm: 'ES256',
  payload: previousPayload,
  signature: toBase64Url(previousCapabilitySignature)
};
const rotatingAuthority = {
  ...authority,
  verificationKeys: [
    { keyId: authority.keyId, publicKey: authorityPublic },
    { keyId: previousAuthorityKeyId, publicKey: previousAuthorityPublic }
  ]
};
const verifiedPrevious = await verifyP2PLocalCapability(rotatingAuthority, previousCapability, {
  origin: 'https://hashinmy.com',
  applicationId: 'control-proyectos',
  userId: 'user_1',
  deviceId: 'device_1',
  nowMs: now
});
assert.equal(verifiedPrevious.authorityKeyId, previousAuthorityKeyId, 'Una PWA actualizada debe aceptar capacidades vigentes de la autoridad anterior configurada.');
await assert.rejects(
  () => verifyP2PLocalCapability(authority, previousCapability, {
    origin: 'https://hashinmy.com', applicationId: 'control-proyectos', nowMs: now
  }),
  (error) => error?.code === 'P2P_SIN_CAPABILITY_AUTHORITY_MISMATCH',
  'Una clave anterior no anunciada debe permanecer rechazada.'
);

await assert.rejects(
  () => verifyP2PLocalCapability(authority, { ...capability, payload: { ...payload, applicationId: 'inventario' } }, {
    origin: 'https://hashinmy.com', applicationId: 'control-proyectos', nowMs: now
  }),
  (error) => error?.code === 'P2P_SIN_CAPABILITY_SCOPE_MISMATCH'
);
await assert.rejects(
  () => verifyP2PLocalCapability(authority, { ...capability, payload: { ...payload, memberships: [] } }, {
    origin: 'https://hashinmy.com', applicationId: 'control-proyectos', nowMs: now
  }),
  (error) => error?.code === 'P2P_SIN_CAPABILITY_SIGNATURE_INVALID'
);

const operation = { type: 'p2p.sin.operation', userId: 'user_1', deviceId: 'device_1', operationId: 'op_1' };
const deviceSignature = await crypto.subtle.sign(
  { name: 'ECDSA', hash: 'SHA-256' },
  deviceKeys.privateKey,
  new TextEncoder().encode(canonicalizeP2PLocalValue(operation))
);
assert.equal(await verifyP2PLocalSignature(devicePublic, operation, toBase64Url(deviceSignature)), true);
assert.equal(await verifyP2PLocalSignature(devicePublic, { ...operation, userId: 'owner_falso' }, toBase64Url(deviceSignature)), false);


const adminScope = { resourceType: 'admin.project', permissionProfile: 'admin-project-v1' };
const genericScope = { resourceType: 'generic', permissionProfile: '' };
const deleteOnly = { role: 'member', permissions: ['read', 'delete'] };
const projectionOnly = { role: 'member', permissions: ['read', 'projection'] };
const deleteAndProjection = { role: 'member', permissions: ['read', 'delete', 'projection'] };
const addOnly = { role: 'member', permissions: ['read', 'add'] };
const deleteProjection = { type: 'entity.delete', entityType: 'admin.projection' };
const deleteProjectionLink = { type: 'entity.delete', entityType: 'admin.projection-link' };
const putProjection = { type: 'entity.put', entityType: 'admin.projection' };
const putProjectRoot = { type: 'entity.patch', entityType: 'admin.project' };

assert.equal(requiredPermissionForDurableOperation(adminScope, deleteProjection), 'delete_projection');
assert.equal(memberAllowsDurableOperation(adminScope, deleteOnly, deleteProjection), false, 'Eliminar sin Proyecciones no puede borrar una proyección por LAN.');
assert.equal(memberAllowsDurableOperation(adminScope, projectionOnly, deleteProjection), false, 'Proyecciones sin Eliminar tampoco puede borrar una proyección.');
assert.equal(memberAllowsDurableOperation(adminScope, deleteAndProjection, deleteProjection), true, 'Borrar una proyección exige ambos permisos.');
assert.equal(memberAllowsDurableOperation(adminScope, projectionOnly, deleteProjectionLink), true, 'Un vínculo de proyección usa el permiso Proyecciones incluso al eliminarse.');
assert.equal(memberAllowsDurableOperation(adminScope, addOnly, putProjection), false, 'Agregar no sustituye el permiso Proyecciones en el perfil administrativo.');
assert.equal(memberAllowsDurableOperation(adminScope, deleteAndProjection, putProjectRoot), false, 'La raíz presupuestal permanece exclusiva del propietario.');
assert.equal(memberAllowsDurableOperation(genericScope, addOnly, putProjection), true, 'Una app genérica no hereda reglas administrativas solo por reutilizar un entityType.');
assert.equal(memberAllowsDurableOperation(genericScope, deleteOnly, deleteProjection), true, 'En un espacio genérico la eliminación conserva la política genérica.');

const clientSource = await (await import('node:fs/promises')).readFile(new URL('../src/js/p2p-client.js', import.meta.url), 'utf8');
assert.match(clientSource, /p2p\.sin\.signed-operation/);
assert.match(clientSource, /verifyP2PLocalCapability/);
assert.match(clientSource, /verifyP2PLocalSignature/);
assert.match(clientSource, /memberAllowsDurableOperation/);
assert.match(clientSource, /localRelayEnvelope:\s*\{/);
assert.match(clientSource, /relayedFromLocalNetwork:\s*true/);
assert.match(clientSource, /enqueueOptimisticOperation\(relayedOutboxItem, optimisticEvent\)/);
assert.match(clientSource, /\/api\/p2p\/events\/relay-local/);
assert.match(clientSource, /const canonicalRelayedEvent = await decryptOperationEvent\(data\.event\)/);
assert.match(clientSource, /await this\.applyDecryptedOperationEvent\(canonicalRelayedEvent, sessionContext/);
assert.match(clientSource, /p2p:operation-local-relay-confirmed/);
assert.match(clientSource, /originalActorUserId/);
assert.match(clientSource, /originalSourceDeviceId/);
assert.match(clientSource, /P2P_SIN_RELAY_ENVELOPE_MISSING/);
assert.match(clientSource, /optionalRelayUnavailable = relayCode === 'P2P_SIN_CAPABILITY_UNAVAILABLE'/);
assert.doesNotMatch(clientSource, /body\?\.type\s*!==\s*['"]p2p\.sin\.operation['"]/);

const lifecycleOwner = { resourceType: 'admin.project', permissionProfile: 'admin-project-v1', role: 'owner', permissions: ['read'] };
const lifecycleReplica = { resourceType: 'admin.project', permissionProfile: 'admin-project-v1', role: 'member', permissions: ['read'] };
assert.equal(lifecycleReplicationPairAuthorized(lifecycleOwner, lifecycleReplica, 'trash'), true);
assert.equal(lifecycleReplicationPairAuthorized(lifecycleOwner, lifecycleReplica, 'purge'), true);
assert.equal(lifecycleReplicationPairAuthorized({ ...lifecycleOwner, role: 'member' }, lifecycleReplica, 'purge'), false);
assert.equal(lifecycleReplicationPairAuthorized(lifecycleOwner, { ...lifecycleReplica, permissions: [] }, 'trash'), false);
assert.equal(lifecycleReplicationPairAuthorized(lifecycleOwner, lifecycleReplica, 'restore'), false);
assert.equal(lifecycleReplicationPairAuthorized({ ...lifecycleOwner, resourceType: 'generic' }, lifecycleReplica, 'purge'), false);

console.log('P2P_sin capability smoke: OK');
