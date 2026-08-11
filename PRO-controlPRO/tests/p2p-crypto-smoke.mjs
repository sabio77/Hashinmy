import { webcrypto } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

class FakeRequest {
  constructor(transaction, executor) {
    this.result = undefined;
    this.error = null;
    this.onsuccess = null;
    this.onerror = null;
    transaction?.beginRequest();
    queueMicrotask(() => {
      try {
        this.result = executor();
        this.onsuccess?.({ target: this });
      } catch (error) {
        this.error = error;
        this.onerror?.({ target: this });
      } finally {
        transaction?.finishRequest(this.error);
      }
    });
  }
}

class FakeTransaction {
  constructor(database, storeNames) {
    this.database = database;
    this.storeNames = Array.isArray(storeNames) ? storeNames : [storeNames];
    this.pending = 0;
    this.failed = null;
    this.completed = false;
    this.oncomplete = null;
    this.onerror = null;
    this.onabort = null;
  }

  beginRequest() {
    this.pending += 1;
  }

  finishRequest(error = null) {
    if (error && !this.failed) this.failed = error;
    this.pending -= 1;
    if (this.pending === 0 && !this.completed) {
      setTimeout(() => {
        if (this.completed || this.pending !== 0) return;
        this.completed = true;
        if (this.failed) this.onerror?.({ target: this });
        else this.oncomplete?.({ target: this });
      }, 0);
    }
  }

  objectStore(name) {
    if (!this.storeNames.includes(name)) throw new Error(`Store fuera de la transacción: ${name}`);
    return new FakeObjectStore(this.database, name, this);
  }
}

class FakeIndex {
  constructor(storeMap, field, transaction) {
    this.storeMap = storeMap;
    this.field = field;
    this.transaction = transaction;
  }

  getAll(value) {
    return new FakeRequest(this.transaction, () => Array.from(this.storeMap.values())
      .filter((record) => record?.[this.field] === value)
      .map((record) => structuredClone(record)));
  }
}

class FakeObjectStore {
  constructor(database, name, transaction = null) {
    this.database = database;
    this.name = name;
    this.transaction = transaction;
  }

  get map() {
    const map = this.database.stores.get(this.name);
    if (!map) throw new Error(`Store inexistente: ${this.name}`);
    return map;
  }

  createIndex(name, field) {
    this.database.indexes.set(`${this.name}:${name}`, field);
    return new FakeIndex(this.map, field, this.transaction);
  }

  index(name) {
    const field = this.database.indexes.get(`${this.name}:${name}`);
    if (!field) throw new Error(`Índice inexistente: ${this.name}:${name}`);
    return new FakeIndex(this.map, field, this.transaction);
  }

  get(key) {
    return new FakeRequest(this.transaction, () => {
      const value = this.map.get(key);
      return value === undefined ? undefined : structuredClone(value);
    });
  }

  put(value) {
    return new FakeRequest(this.transaction, () => {
      const key = value?.id ?? value?.eventKey;
      if (!key) throw new Error('Registro sin clave primaria.');
      this.map.set(key, structuredClone(value));
      return key;
    });
  }

  delete(key) {
    return new FakeRequest(this.transaction, () => this.map.delete(key));
  }

  count() {
    return new FakeRequest(this.transaction, () => this.map.size);
  }

  getAll() {
    return new FakeRequest(this.transaction, () => Array.from(this.map.values()).map((value) => structuredClone(value)));
  }
}

class FakeDatabase {
  constructor(name) {
    this.name = name;
    this.stores = new Map();
    this.indexes = new Map();
    this.onversionchange = null;
    this.closed = false;
    this.objectStoreNames = {
      contains: (storeName) => this.stores.has(storeName)
    };
  }

  createObjectStore(name) {
    if (!this.stores.has(name)) this.stores.set(name, new Map());
    return new FakeObjectStore(this, name, null);
  }

  transaction(storeNames) {
    return new FakeTransaction(this, storeNames);
  }

  close() {
    this.closed = true;
  }
}

class FakeIndexedDB {
  constructor() {
    this.databases = new Map();
  }

  open(name) {
    const request = { result: null, error: null, onupgradeneeded: null, onsuccess: null, onerror: null, onblocked: null };
    queueMicrotask(() => {
      try {
        let database = this.databases.get(name);
        const created = !database;
        if (!database) {
          database = new FakeDatabase(name);
          this.databases.set(name, database);
        }
        database.closed = false;
        request.result = database;
        if (created) request.onupgradeneeded?.({ target: request });
        request.onsuccess?.({ target: request });
      } catch (error) {
        request.error = error;
        request.onerror?.({ target: request });
      }
    });
    return request;
  }
}

Object.defineProperty(globalThis, 'crypto', { configurable: true, value: webcrypto });
const fakeIndexedDB = new FakeIndexedDB();
Object.defineProperty(globalThis, 'indexedDB', { configurable: true, value: fakeIndexedDB });
Object.defineProperty(globalThis, 'btoa', { configurable: true, value: (value) => Buffer.from(value, 'binary').toString('base64') });
Object.defineProperty(globalThis, 'atob', { configurable: true, value: (value) => Buffer.from(value, 'base64').toString('binary') });

const currentFile = fileURLToPath(import.meta.url);
const moduleUrl = pathToFileURL(path.resolve(path.dirname(currentFile), '../src/js/p2p-crypto.js')).href;
const cryptoLayer = await import(moduleUrl);

const source = { userId: 'usr_source', deviceId: 'dev_source_000001' };
const guest = { userId: 'usr_guest', deviceId: 'dev_guest_000001' };
const spaceId = 'space_secure_000001';

await cryptoLayer.setP2PCryptoContext(source.userId, source.deviceId);
const sourceIdentity = await cryptoLayer.ensureDeviceEncryptionIdentity();
if (!sourceIdentity.publicKey || sourceIdentity.privateKey || sourceIdentity.publicKey.d) {
  throw new Error('La API pública de identidad expuso material privado o no entregó la clave pública.');
}
const sourceKey = await cryptoLayer.ensureSpaceKey(spaceId);
await cryptoLayer.activateSpaceKey(spaceId, sourceKey.keyId, { keyEpoch: 1 });
if (!sourceKey?.keyId || !(await cryptoLayer.hasSpaceKey(spaceId, sourceKey.keyId))) {
  throw new Error('No se generó ni persistió la clave AES del proyecto.');
}
const stagedRotation = await cryptoLayer.ensureSpaceKey(spaceId, { rotate: true, activate: false });
const activeBeforeCommit = await cryptoLayer.getActiveSpaceKey(spaceId);
if (!stagedRotation?.keyId || stagedRotation.keyId === sourceKey.keyId || activeBeforeCommit?.keyId !== sourceKey.keyId) {
  throw new Error('La rotación preparatoria activó una clave antes de completar su distribución.');
}
await cryptoLayer.activateSpaceKey(spaceId, stagedRotation.keyId, { keyEpoch: 2 });
const activeAfterCommit = await cryptoLayer.getActiveSpaceKey(spaceId);
if (activeAfterCommit?.keyId !== stagedRotation.keyId) {
  throw new Error('La clave rotada no se activó después de confirmar su distribución.');
}
const sourceKeyForSharing = activeAfterCommit;
const sourceDatabase = fakeIndexedDB.databases.get(`semilla_p2p_crypto_v1_${source.userId}`);
const sourceRecords = Array.from(sourceDatabase?.stores?.get('records')?.values?.() || []);
const storedIdentity = sourceRecords.find((record) => record.id === 'deviceIdentity');
const storedSpaceKeys = sourceRecords.filter((record) => record.type === 'spaceKey');
const storedWrappingKey = sourceRecords.find((record) => record.type === 'storageWrappingKey');
if (!storedIdentity?.privateKey || storedIdentity.privateKey.extractable !== false || storedIdentity.privateKey.d) {
  throw new Error('La identidad privada no quedó almacenada como CryptoKey no extraíble.');
}
if (!storedWrappingKey?.key || storedWrappingKey.key.extractable !== false) {
  throw new Error('La instalación no protegió las claves de proyecto con una clave local no extraíble.');
}
if (!storedSpaceKeys.length || storedSpaceKeys.some((record) => record.raw || !record.wrappedRaw || !record.storageIv)) {
  throw new Error('IndexedDB conservó material AES de proyecto en texto legible.');
}

await cryptoLayer.setP2PCryptoContext(guest.userId, guest.deviceId);
const guestIdentity = await cryptoLayer.ensureDeviceEncryptionIdentity();

const poisonedSpaceId = 'space_poisoned_envelope_000001';
await cryptoLayer.setP2PCryptoContext(source.userId, source.deviceId);
const poisonedSourceKey = await cryptoLayer.ensureSpaceKey(poisonedSpaceId);
await cryptoLayer.activateSpaceKey(poisonedSpaceId, poisonedSourceKey.keyId, { keyEpoch: 1 });
const validRecoveryEnvelope = await cryptoLayer.createSpaceKeyEnvelope(poisonedSpaceId, {
  deviceId: guest.deviceId,
  encryptionPublicKey: guestIdentity.publicKey
});
const poisonedEnvelope = structuredClone(validRecoveryEnvelope);
const poisonedEnvelopeBytes = Buffer.from(poisonedEnvelope.ciphertext, 'base64url');
if (!poisonedEnvelopeBytes.length) throw new Error('La prueba no recibió un sobre de clave para alterar.');
poisonedEnvelopeBytes[Math.floor(poisonedEnvelopeBytes.length / 2)] ^= 0x01;
poisonedEnvelope.ciphertext = poisonedEnvelopeBytes.toString('base64url');
await cryptoLayer.setP2PCryptoContext(guest.userId, guest.deviceId);
let poisonedEnvelopeRejected = false;
try {
  await cryptoLayer.importSpaceKeyEnvelope(poisonedSpaceId, poisonedEnvelope, { keyEpoch: 1 });
} catch (error) {
  poisonedEnvelopeRejected = cryptoLayer.isRejectedKeyEnvelopeError(error)
    && error?.code === 'P2P_KEY_ENVELOPE_REJECTED'
    && error?.reason === 'authentication_failed'
    && error?.retryable === false;
}
if (!poisonedEnvelopeRejected || await cryptoLayer.hasSpaceKey(poisonedSpaceId, poisonedSourceKey.keyId)) {
  throw new Error('Un sobre de clave corrupto no quedó clasificado como evento remoto descartable y sin efectos locales.');
}
const recoveredPoisonedSpace = await cryptoLayer.importSpaceKeyEnvelope(
  poisonedSpaceId,
  validRecoveryEnvelope,
  { keyEpoch: 1 }
);
if (!recoveredPoisonedSpace.imported || recoveredPoisonedSpace.keyId !== poisonedSourceKey.keyId) {
  throw new Error('Un reenvío válido no pudo recuperar el proyecto después de rechazar el sobre corrupto.');
}

await cryptoLayer.setP2PCryptoContext(source.userId, source.deviceId);
const envelope = await cryptoLayer.createSpaceKeyEnvelope(spaceId, {
  deviceId: guest.deviceId,
  encryptionPublicKey: guestIdentity.publicKey
});
const staleEnvelope = await cryptoLayer.createSpaceKeyEnvelope(spaceId, {
  deviceId: guest.deviceId,
  encryptionPublicKey: guestIdentity.publicKey
}, { keyId: sourceKey.keyId });
const plaintextOperation = {
  operationId: 'op_secure_000001',
  type: 'entity.put',
  entityType: 'admin.purchase',
  entityId: 'purchase_000001',
  payload: { value: { description: 'Factura reservada', amount: 875000 } }
};
const encryptedOperation = await cryptoLayer.encryptOperationForTransport(spaceId, plaintextOperation);
if (!encryptedOperation.encrypted || encryptedOperation.payload?.value || !encryptedOperation.payload?.__p2pEncrypted) {
  throw new Error('La operación dejó datos administrativos legibles en el transporte.');
}

await cryptoLayer.setP2PCryptoContext(guest.userId, guest.deviceId);
const imported = await cryptoLayer.importSpaceKeyEnvelope(spaceId, envelope, { keyEpoch: 2 });
if (!imported.imported || imported.keyId !== sourceKeyForSharing.keyId) {
  throw new Error('El dispositivo invitado no pudo importar la clave compartida mediante ECDH.');
}
let staleEnvelopeRejected = false;
try {
  await cryptoLayer.importSpaceKeyEnvelope(spaceId, staleEnvelope, { keyEpoch: 1 });
} catch (error) {
  staleEnvelopeRejected = error?.code === 'P2P_KEY_EPOCH_STALE';
}
const activeAfterStaleEnvelope = await cryptoLayer.getActiveSpaceKey(spaceId);
if (!staleEnvelopeRejected || activeAfterStaleEnvelope?.keyId !== sourceKeyForSharing.keyId || activeAfterStaleEnvelope?.keyEpoch !== 2) {
  throw new Error('Un sobre antiguo pudo degradar la clave activa después de una rotación posterior.');
}
const migrationSpaceId = 'space_legacy_epoch_migration';
await cryptoLayer.setP2PCryptoContext(source.userId, source.deviceId);
const legacySourceKey = await cryptoLayer.ensureSpaceKey(migrationSpaceId);
const legacyEnvelope = await cryptoLayer.createSpaceKeyEnvelope(migrationSpaceId, {
  deviceId: guest.deviceId,
  encryptionPublicKey: guestIdentity.publicKey
}, { keyId: legacySourceKey.keyId });
const migratedSourceKey = await cryptoLayer.ensureSpaceKey(migrationSpaceId, { rotate: true, activate: false });
const migratedEnvelope = await cryptoLayer.createSpaceKeyEnvelope(migrationSpaceId, {
  deviceId: guest.deviceId,
  encryptionPublicKey: guestIdentity.publicKey
}, { keyId: migratedSourceKey.keyId });
await cryptoLayer.setP2PCryptoContext(guest.userId, guest.deviceId);
await cryptoLayer.importSpaceKeyEnvelope(migrationSpaceId, legacyEnvelope, { keyEpoch: 0 });
const unversionedActive = await cryptoLayer.getActiveSpaceKey(migrationSpaceId);
if (unversionedActive?.keyId !== legacySourceKey.keyId || unversionedActive?.keyEpoch !== 0) {
  throw new Error('Un sobre heredado sin época inventó una versión autoritativa local.');
}
await cryptoLayer.importSpaceKeyEnvelope(migrationSpaceId, migratedEnvelope, { keyEpoch: 1 });
const migratedActive = await cryptoLayer.getActiveSpaceKey(migrationSpaceId);
if (migratedActive?.keyId !== migratedSourceKey.keyId || migratedActive?.keyEpoch !== 1) {
  throw new Error('La primera época autoritativa no pudo reemplazar una clave heredada sin versión.');
}

const decryptedEvent = await cryptoLayer.decryptOperationEvent({
  eventId: 'evt_secure_000001',
  eventType: 'p2p.operation',
  spaceId,
  operation: encryptedOperation
});
if (decryptedEvent.operation.payload?.value?.description !== 'Factura reservada'
  || decryptedEvent.operation.payload?.value?.amount !== 875000) {
  throw new Error('La réplica invitada no recuperó exactamente el payload administrativo.');
}

const tampered = structuredClone(encryptedOperation);
const ciphertext = tampered.payload.__p2pEncrypted.ciphertext;
const tamperedBytes = Buffer.from(ciphertext, 'base64');
if (!tamperedBytes.length) throw new Error('La prueba no recibió ciphertext para alterar.');
tamperedBytes[Math.floor(tamperedBytes.length / 2)] ^= 0x01;
tampered.payload.__p2pEncrypted.ciphertext = tamperedBytes.toString('base64url');
let tamperError = null;
try {
  await cryptoLayer.decryptOperationEvent({
    eventId: 'evt_tampered',
    eventType: 'p2p.operation',
    spaceId,
    operation: tampered
  });
} catch (error) {
  tamperError = error;
}
if (!cryptoLayer.isRejectedEncryptedPayloadError(tamperError)
  || tamperError?.code !== 'P2P_ENCRYPTED_PAYLOAD_REJECTED'
  || tamperError?.reason !== 'authentication_failed'
  || tamperError?.retryable !== false) {
  throw new Error('AES-GCM no clasificó el ciphertext alterado como payload remoto determinista y no reintentable.');
}

await cryptoLayer.setP2PCryptoContext(source.userId, source.deviceId);
const snapshotEntities = await cryptoLayer.encryptSnapshotEntities(spaceId, [{
  entityType: 'admin.project',
  entityId: 'project_000001',
  value: { name: 'Proyecto cifrado', budget: 42000000 },
  stateRevision: 7,
  operationType: 'entity.put',
  deleted: false
}]);
await cryptoLayer.setP2PCryptoContext(guest.userId, guest.deviceId);
const encryptedSnapshotChunkBytes = new TextEncoder().encode(JSON.stringify(snapshotEntities)).byteLength;
const snapshotEvent = await cryptoLayer.decryptOperationEvent({
  eventId: 'evt_snapshot_secure',
  eventType: 'p2p.operation',
  spaceId,
  operation: {
    operationId: 'snapshot_secure:chunk:0',
    type: 'snapshot.chunk',
    encrypted: true,
    encryptionVersion: 1,
    keyId: sourceKeyForSharing.keyId,
    payload: { entities: snapshotEntities, chunkByteCount: encryptedSnapshotChunkBytes }
  }
});
const decryptedSnapshotChunkBytes = new TextEncoder().encode(JSON.stringify(snapshotEvent.operation.payload.entities)).byteLength;
if (snapshotEvent.operation.payload.entities[0]?.value?.budget !== 42000000
  || snapshotEvent.operation.payload.transportChunkByteCount !== encryptedSnapshotChunkBytes
  || snapshotEvent.operation.payload.chunkByteCount !== decryptedSnapshotChunkBytes) {
  throw new Error('El snapshot cifrado no preservó por separado el presupuesto de transporte y el tamaño local descifrado.');
}

const delayedSpaceId = 'space_delayed_key_000001';
await cryptoLayer.setP2PCryptoContext(source.userId, source.deviceId);
await cryptoLayer.ensureSpaceKey(delayedSpaceId);
const delayedEnvelope = await cryptoLayer.createSpaceKeyEnvelope(delayedSpaceId, {
  deviceId: guest.deviceId,
  encryptionPublicKey: guestIdentity.publicKey
});
const delayedOperation = await cryptoLayer.encryptOperationForTransport(delayedSpaceId, {
  operationId: 'op_delayed_key',
  type: 'entity.patch',
  entityType: 'admin.project',
  entityId: 'project_000001',
  payload: {
    patch: { description: 'Cambio mientras el invitado estaba desconectado' },
    expected: { description: 'Descripción original' },
    conflictPolicy: 'preserve-remote'
  }
});
const delayedEvent = {
  eventId: 'evt_delayed_key',
  eventType: 'p2p.operation',
  deviceSequence: 9,
  spaceSequence: 4,
  spaceId: delayedSpaceId,
  operation: delayedOperation
};

await cryptoLayer.setP2PCryptoContext(guest.userId, guest.deviceId);
let missingKey = null;
try {
  await cryptoLayer.decryptOperationEvent(delayedEvent);
} catch (error) {
  missingKey = error;
}
if (missingKey?.code !== 'P2P_SPACE_KEY_MISSING') {
  throw new Error('El cliente no identificó de forma recuperable una clave todavía no recibida.');
}
await cryptoLayer.deferEncryptedEvent(delayedEvent, missingKey);
const deferred = await cryptoLayer.listDeferredEncryptedEvents(delayedSpaceId);
if (deferred.length !== 1 || deferred[0].event?.eventId !== delayedEvent.eventId) {
  throw new Error('El ciphertext pendiente no quedó preservado localmente para reproducirse después.');
}
await cryptoLayer.importSpaceKeyEnvelope(delayedSpaceId, delayedEnvelope);
const recovered = await cryptoLayer.decryptOperationEvent(deferred[0].event);
if (recovered.operation.payload?.patch?.description !== 'Cambio mientras el invitado estaba desconectado'
  || recovered.operation.payload?.expected?.description !== 'Descripción original'
  || recovered.operation.payload?.conflictPolicy !== 'preserve-remote') {
  throw new Error('El evento diferido no recuperó íntegramente el parche condicional cifrado.');
}
await cryptoLayer.removeDeferredEncryptedEvent(deferred[0].eventKey);
const purge = await cryptoLayer.purgeSpaceCrypto(delayedSpaceId);
if (purge.keys < 2 || (await cryptoLayer.listDeferredEncryptedEvents(delayedSpaceId)).length !== 0) {
  throw new Error('La revocación local no eliminó claves y eventos cifrados del proyecto.');
}

cryptoLayer.closeP2PCryptoContext();
await cryptoLayer.setP2PCryptoContext(source.userId, source.deviceId);
const guardedDeleteOperation = {
  operationId: 'op_guarded_delete_crypto',
  type: 'entity.delete',
  entityType: 'admin.purchase',
  entityId: 'purchase_crypto_1',
  payload: {
    expected: { description: 'Factura privada', amount: 200000 },
    conflictPolicy: 'preserve-remote',
    referenceGuards: [{ entityType: 'admin.purchase', field: 'projectionId', equals: 'projection_private_1' }]
  }
};
const encryptedGuardedDelete = await cryptoLayer.encryptOperationForTransport(spaceId, guardedDeleteOperation);
if (!encryptedGuardedDelete.payload?.__p2pEncrypted
  || JSON.stringify(encryptedGuardedDelete).includes('Factura privada')
  || JSON.stringify(encryptedGuardedDelete).includes('projection_private_1')
  || !cryptoLayer.isEncryptedOperation(encryptedGuardedDelete)) {
  throw new Error('La condición de una eliminación segura salió en texto plano hacia el relay.');
}
const decryptedGuardedDelete = await cryptoLayer.decryptOperationEvent({
  eventType: 'p2p.operation',
  spaceId,
  operation: encryptedGuardedDelete
});
if (decryptedGuardedDelete.operation?.payload?.expected?.amount !== 200000
  || decryptedGuardedDelete.operation?.payload?.conflictPolicy !== 'preserve-remote'
  || decryptedGuardedDelete.operation?.payload?.referenceGuards?.[0]?.equals !== 'projection_private_1') {
  throw new Error('La condición cifrada de eliminación no se recuperó exactamente en el dispositivo receptor.');
}
const dependentDeleteOperation = {
  operationId: 'op_dependent_delete_crypto',
  type: 'entity.delete',
  entityType: 'admin.purchase',
  entityId: 'purchase_crypto_1',
  dependentDeletes: [{
    entityType: 'admin.projection-link',
    entityId: 'purchase_crypto_1',
    relation: 'admin.purchase-projection-link-v1'
  }],
  payload: { expected: { amount: 200000 }, conflictPolicy: 'preserve-remote' }
};
const encryptedEmptyDependentDelete = await cryptoLayer.encryptOperationForTransport(spaceId, {
  ...dependentDeleteOperation,
  operationId: 'op_empty_dependent_delete_crypto',
  payload: {}
});
if (!encryptedEmptyDependentDelete.payload?.__p2pEncrypted) {
  throw new Error('Una eliminación dependiente sin condición quedó fuera del payload autenticado.');
}
const encryptedDependentDelete = await cryptoLayer.encryptOperationForTransport(spaceId, dependentDeleteOperation);
const decryptedDependentDelete = await cryptoLayer.decryptOperationEvent({
  eventType: 'p2p.operation',
  spaceId,
  operation: encryptedDependentDelete
});
if (decryptedDependentDelete.operation?.dependentDeletes?.length !== 1
  || decryptedDependentDelete.operation.dependentDeletes[0].entityId !== 'purchase_crypto_1'
  || decryptedDependentDelete.operation.payload?.expected?.amount !== 200000) {
  throw new Error('La eliminación dependiente autenticada no se recuperó junto con la condición cifrada.');
}
const recoveredStrippedDependentDelete = await cryptoLayer.decryptOperationEvent({
  eventType: 'p2p.operation',
  spaceId,
  operation: (() => {
    const { dependentDeletes: _stripped, ...withoutDependentDeletes } = encryptedDependentDelete;
    return withoutDependentDeletes;
  })()
});
if (recoveredStrippedDependentDelete.operation?.dependentDeletes?.[0]?.entityId !== 'purchase_crypto_1'
  || recoveredStrippedDependentDelete.operation?.payload?.expected?.amount !== 200000) {
  throw new Error('Un relay anterior que omita metadata no pudo recuperar el borrado dependiente autenticado.');
}
let tamperedDependentDeleteRejected = false;
try {
  await cryptoLayer.decryptOperationEvent({
    eventType: 'p2p.operation',
    spaceId,
    operation: {
      ...encryptedDependentDelete,
      dependentDeletes: [{
        ...encryptedDependentDelete.dependentDeletes[0],
        entityId: 'another_purchase'
      }]
    }
  });
} catch {
  tamperedDependentDeleteRejected = true;
}
if (!tamperedDependentDeleteRejected) {
  throw new Error('La metadata de eliminación dependiente pudo alterarse sin invalidar AES-GCM.');
}

const requiredReferencePut = {
  operationId: 'op_required_reference_crypto',
  type: 'entity.put',
  entityType: 'admin.projection-link',
  entityId: 'purchase_crypto_1',
  payload: {
    value: { purchaseId: 'purchase_crypto_1', projectionId: 'projection_private_1', active: true },
    referenceRequirements: [{ entityType: 'admin.projection', entityId: 'projection_private_1' }]
  }
};
const encryptedRequiredReferencePut = await cryptoLayer.encryptOperationForTransport(spaceId, requiredReferencePut);
if (!encryptedRequiredReferencePut.payload?.__p2pEncrypted
  || JSON.stringify(encryptedRequiredReferencePut).includes('projection_private_1')
  || !cryptoLayer.isEncryptedOperation(encryptedRequiredReferencePut)) {
  throw new Error('El requisito referencial de alta salió en texto plano hacia el relay.');
}
const decryptedRequiredReferencePut = await cryptoLayer.decryptOperationEvent({
  eventType: 'p2p.operation',
  spaceId,
  operation: encryptedRequiredReferencePut
});
if (decryptedRequiredReferencePut.operation?.payload?.referenceRequirements?.[0]?.entityId !== 'projection_private_1'
  || decryptedRequiredReferencePut.operation?.payload?.value?.active !== true) {
  throw new Error('El requisito referencial cifrado no se recuperó exactamente en el dispositivo receptor.');
}

const legacyEncryptedDelete = await cryptoLayer.encryptOperationForTransport(spaceId, {
  ...guardedDeleteOperation,
  operationId: 'op_legacy_delete_crypto',
  payload: {}
});
if (Object.keys(legacyEncryptedDelete.payload || {}).length !== 0
  || !cryptoLayer.isEncryptedOperation(legacyEncryptedDelete)) {
  throw new Error('La compatibilidad con eliminaciones cifradas antiguas sin condición se perdió.');
}

cryptoLayer.closeP2PCryptoContext();

console.log('OK: ECDH no extraíble, rechazo determinista de sobres corruptos, reenvío recuperable, clave autoritativa con epoch, AES-GCM, snapshots y recuperación diferida.');
