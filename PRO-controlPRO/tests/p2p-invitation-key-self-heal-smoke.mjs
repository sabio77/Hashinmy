import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const currentFile = fileURLToPath(import.meta.url);
const clientPath = path.resolve(path.dirname(currentFile), '../src/js/p2p-client.js');
const source = await fs.readFile(clientPath, 'utf8');

function extractMethod(startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  if (start < 0 || end <= start) throw new Error(`No se pudo aislar ${startMarker.trim()}`);
  return source.slice(start, end).trim();
}

const requestAndWaitSource = extractMethod(
  "  async requestSpaceKeyAndWait(spaceId = '', keyId = '', options = {}) {",
  "\n  async recoverMissingSpaceKey("
);
const recoverSource = extractMethod(
  "  async recoverMissingSpaceKey(spaceId = '', keyId = '', options = {}) {",
  "\n  async ensureCurrentSpaceKey("
);
const ensureSource = extractMethod(
  "  async ensureCurrentSpaceKey(spaceId = '', options = {}) {",
  "\n  assertEncryptedTransportEvent("
);

const MISSING_SPACE_KEY_RECOVERY_WAIT_MS = 25;
const navigator = { onLine: true };
const listeners = new Map();
const window = {
  addEventListener(name, listener) {
    const bucket = listeners.get(name) || new Set();
    bucket.add(listener);
    listeners.set(name, bucket);
  },
  removeEventListener(name, listener) {
    listeners.get(name)?.delete(listener);
  },
  dispatchEvent(event) {
    for (const listener of listeners.get(event.type) || []) listener(event);
  },
  setTimeout,
  clearTimeout
};
const getSessionToken = () => 'session_test';
let keyStore = new Map();
let activeBySpace = new Map();
let generatedKeyCounter = 0;
const hasSpaceKey = async (spaceId, keyId) => keyStore.get(spaceId)?.has(keyId) === true;
const activateSpaceKey = async (spaceId, keyId, options = {}) => {
  if (!(await hasSpaceKey(spaceId, keyId))) throw new Error('Se intentó activar una clave ausente.');
  const active = { spaceId, keyId, keyEpoch: Number(options.keyEpoch || 0) };
  activeBySpace.set(spaceId, active);
  return active;
};
const getActiveSpaceKey = async (spaceId) => activeBySpace.get(spaceId) || null;
const ensureSpaceKey = async (spaceId, options = {}) => {
  if (options.rotate !== true) throw new Error('La prueba esperaba una rotación explícita.');
  generatedKeyCounter += 1;
  const keyId = `key_rotated_${generatedKeyCounter}`;
  const keys = keyStore.get(spaceId) || new Set();
  keys.add(keyId);
  keyStore.set(spaceId, keys);
  return { spaceId, keyId, keyEpoch: 0 };
};
const dispatched = [];
const dispatch = (name, detail = {}) => dispatched.push({ name, detail });

const requestSpaceKeyAndWait = eval(`({${requestAndWaitSource}}).requestSpaceKeyAndWait`);
const recoverMissingSpaceKey = eval(`({${recoverSource}}).recoverMissingSpaceKey`);
const ensureCurrentSpaceKey = eval(`({${ensureSource}}).ensureCurrentSpaceKey`);

function baseClient({ owner = true } = {}) {
  const authority = {
    space: {
      spaceId: 'space_self_heal',
      ownerUserId: 'user_owner',
      encryptionVersion: 1,
      activeEncryptionKeyId: 'key_active',
      encryptionKeyEpoch: 3
    },
    keyId: 'key_active',
    keyEpoch: 3,
    rotationRequired: false
  };
  return {
    user: { userId: owner ? 'user_owner' : 'user_guest' },
    missingSpaceKeyRecoveryPromises: new Map(),
    captureSessionContext() { return { userId: this.user.userId, deviceId: 'dev_self_heal', generation: 1 }; },
    assertSessionContext() { return true; },
    isSessionContextChangedError() { return false; },
    spaceEncryptionAuthority() { return authority; },
    async refreshBootstrap() { return {}; },
    requestSpaceKeyAndWait,
    recoverMissingSpaceKey,
    ensureCurrentSpaceKey,
    authority
  };
}

// 1) Si otra réplica autorizada responde por el stream, la invitación no debe mostrar el error.
keyStore = new Map();
activeBySpace = new Map();
dispatched.length = 0;
const replicaClient = baseClient();
replicaClient.requestSpaceKey = async (spaceId, keyId) => {
  setTimeout(() => {
    const keys = keyStore.get(spaceId) || new Set();
    keys.add(keyId);
    keyStore.set(spaceId, keys);
    window.dispatchEvent({ type: 'p2p:key-received', detail: { spaceId, keyId } });
  }, 1);
  return true;
};
const recoveredFromReplica = await ensureCurrentSpaceKey.call(replicaClient, 'space_self_heal', {
  requireAuthority: true,
  allowOwnerRecoveryRotation: true
});
if (recoveredFromReplica?.keyId !== 'key_active'
  || !dispatched.some((entry) => entry.name === 'p2p:key-self-healed' && entry.detail?.strategy === 'authorized-replica')) {
  throw new Error('La clave no se recuperó automáticamente desde una réplica autorizada antes de fallar la invitación.');
}

// 2) Si ninguna réplica responde, un propietario con copia local vigente puede rotar y redistribuir.
keyStore = new Map();
activeBySpace = new Map();
dispatched.length = 0;
const ownerClient = baseClient();
let refreshCount = 0;
let distributionCount = 0;
ownerClient.requestSpaceKey = async () => false;
ownerClient.refreshBootstrap = async () => { refreshCount += 1; return {}; };
ownerClient.activateAuthoritativeSpaceKey = async (spaceId, keyId, expectedKeyId) => {
  if (expectedKeyId !== 'key_active') throw new Error('La rotación no respetó la autoridad previa.');
  ownerClient.authority.keyId = keyId;
  ownerClient.authority.keyEpoch = 4;
  ownerClient.authority.space.activeEncryptionKeyId = keyId;
  ownerClient.authority.space.encryptionKeyEpoch = 4;
  const active = { spaceId, keyId, keyEpoch: 4 };
  activeBySpace.set(spaceId, active);
  return { space: ownerClient.authority.space };
};
ownerClient.distributeSpaceKey = async () => {
  distributionCount += 1;
  return { recipients: 2, delivered: 2, failed: 0, complete: true };
};
const recoveredByRotation = await ensureCurrentSpaceKey.call(ownerClient, 'space_self_heal', {
  requireAuthority: true,
  allowOwnerRecoveryRotation: true
});
if (!String(recoveredByRotation?.keyId || '').startsWith('key_rotated_')
  || refreshCount !== 1
  || distributionCount !== 1
  || !dispatched.some((entry) => entry.name === 'p2p:key-self-healed' && entry.detail?.strategy === 'owner-rotation')) {
  throw new Error('El propietario no autocorrigió la clave faltante mediante una rotación autoritativa y redistribución.');
}

// 3) Una cuenta que no es propietaria no puede inventar una clave: falla solo después del intento de recuperación.
keyStore = new Map();
activeBySpace = new Map();
dispatched.length = 0;
const guestClient = baseClient({ owner: false });
guestClient.requestSpaceKey = async () => false;
let failure = null;
try {
  await ensureCurrentSpaceKey.call(guestClient, 'space_self_heal', { requireAuthority: true });
} catch (error) {
  failure = error;
}
if (failure?.code !== 'P2P_SPACE_KEY_MISSING'
  || failure?.recoveryAttempted !== true
  || !dispatched.some((entry) => entry.name === 'p2p:key-self-heal-failed')) {
  throw new Error('La ausencia definitiva de clave no quedó cercada después de agotar la autocuración segura.');
}

console.log('OK: la invitación autocorrige la clave faltante por stream, refresca autoridad y permite rotación segura del propietario solo como último recurso.');
