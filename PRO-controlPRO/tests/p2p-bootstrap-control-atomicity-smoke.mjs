import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const currentFile = fileURLToPath(import.meta.url);
const root = path.resolve(path.dirname(currentFile), '..');
const storageSource = fs.readFileSync(path.join(root, 'src', 'js', 'p2p-storage.js'), 'utf8');
const clientSource = fs.readFileSync(path.join(root, 'src', 'js', 'p2p-client.js'), 'utf8');

const storageStart = storageSource.indexOf('export async function replaceBootstrapControlState(');
const storageEnd = storageSource.indexOf('\nexport async function listSpaces()', storageStart);
assert.ok(storageStart >= 0 && storageEnd > storageStart, 'No se encontró el commit atómico del estado de control del bootstrap.');
const storageMethod = storageSource.slice(storageStart, storageEnd);
assert.match(
  storageMethod,
  /withStores\(\s*\[STORES\.spaces, STORES\.invitations, STORES\.entities, STORES\.outbox, STORES\.snapshots, STORES\.meta\]/,
  'Proyectos e invitaciones no comparten la misma transacción IndexedDB.'
);
assert.match(storageMethod, /await replaceSpacesInStores\(stores, spaces, options\)/);
assert.match(storageMethod, /stores\[STORES\.invitations\]\.clear\(\)/);
assert.match(storageMethod, /stores\[STORES\.invitations\]\.put\(invitation\)/);

assert.match(clientSource, /replaceBootstrapControlState,/);
assert.doesNotMatch(clientSource, /replaceSpaces\(this\.bootstrapState\.spaces[\s\S]*replaceInvitations/);

const applyStart = clientSource.indexOf('  async applyBootstrapData(data = {}, context = {})');
const applyEnd = clientSource.indexOf('\n  mergeReplicaHealth(', applyStart);
assert.ok(applyStart >= 0 && applyEnd > applyStart, 'No se encontró applyBootstrapData.');
const applyMethod = clientSource.slice(applyStart, applyEnd);

const applyHarness = `
const CURSOR_META_PREFIX = 'deliveryCursor:';
const BOOTSTRAP_INCREMENTAL_SECTION_NAMES = Object.freeze(['devices', 'spaces', 'revokedSpaceIds', 'invitations', 'lifecycleTransactions', 'limits']);
let replaceFailure = null;
let recoveryFailure = null;
function normalizeBootstrapSectionFingerprints(input = null) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {};
  const normalized = {};
  for (const sectionName of BOOTSTRAP_INCREMENTAL_SECTION_NAMES) {
    const fingerprint = String(input[sectionName] || '').trim().toLowerCase();
    if (/^[a-f0-9]{32}$/.test(fingerprint)) normalized[sectionName] = fingerprint;
  }
  return normalized;
}
function bootstrapSectionIsUnchanged(data = {}, sectionName = '', knownFingerprints = {}) {
  if (!BOOTSTRAP_INCREMENTAL_SECTION_NAMES.includes(sectionName)) return false;
  if (Object.prototype.hasOwnProperty.call(data || {}, sectionName)) return false;
  if (!Array.isArray(data?.unchangedSections) || !data.unchangedSections.includes(sectionName)) return false;
  const knownFingerprint = String(knownFingerprints?.[sectionName] || '').trim().toLowerCase();
  const responseFingerprint = String(data?.bootstrapSectionFingerprints?.[sectionName] || '').trim().toLowerCase();
  return /^[a-f0-9]{32}$/.test(knownFingerprint) && responseFingerprint === knownFingerprint;
}
function normalizeInvitationCollection(value = {}) {
  return {
    received: Array.isArray(value.received) ? value.received : [],
    sent: Array.isArray(value.sent) ? value.sent : []
  };
}
function normalizeReplicaHealthMap(value = {}) { return value; }
async function getMeta() { return 0; }
async function setMeta() { return true; }
async function listOutbox() { return []; }
async function replaceBootstrapControlState(spaces, invitations) {
  if (replaceFailure) throw replaceFailure;
  return { spaces: spaces.map((space) => ({ ...space, durable: true })), removedSpaceIds: [], preservedSpaceIds: [], invitations };
}
async function purgeSpaceCrypto() { return true; }
function configureP2PStorageLimits() {}
function dispatch() {}
class TestClient {
  constructor() {
    this.bootstrapState = { marker: 'old', spaces: [{ spaceId: 'old' }] };
    this.bootstrapSectionFingerprints = {};
    this.eventMaxBytes = 20000;
    this.entityMaxBytes = 10000;
    this.snapshotGrantTtlSeconds = 30;
    this.lastProcessedSequence = 0;
    this.lastAcceptedStreamSequence = 0;
    this.highestPendingAck = 0;
    this.snapshotRecoveryRequired = false;
  }
  captureSessionContext() { return { deviceId: 'device_atomic_1' }; }
  assertSessionContext() { return true; }
  async ensureCurrentSpaceKey() { return true; }
  async lifecycleCancellations() { return []; }
  async syncRecoveryRequirements() { if (recoveryFailure) throw recoveryFailure; }
  snapshotRecoveryDelay() { return 0; }
  scheduleSnapshotRecovery() {}
  clearSnapshotRecovery() {}
  scheduleLifecycleFinalizationObserver() {}
${applyMethod}
}
function setReplaceFailure(error) { replaceFailure = error; }
function setRecoveryFailure(error) { recoveryFailure = error; }
export { TestClient, setReplaceFailure, setRecoveryFailure };
`;

const applyModule = await import(`data:text/javascript;base64,${Buffer.from(applyHarness).toString('base64')}#apply`);
{
  const client = new applyModule.TestClient();
  applyModule.setReplaceFailure(new Error('fallo de commit local'));
  await assert.rejects(
    client.applyBootstrapData({ spaces: [{ spaceId: 'new' }], invitations: { received: [{ invitationId: 'inv_1' }] } }),
    /fallo de commit local/
  );
  assert.equal(client.bootstrapState.marker, 'old', 'El estado en memoria cambió antes de confirmar la transacción local.');
  assert.equal(client.eventMaxBytes, 20000, 'Los límites en memoria cambiaron aunque el commit del bootstrap falló.');
}

{
  const client = new applyModule.TestClient();
  applyModule.setReplaceFailure(null);
  applyModule.setRecoveryFailure(new Error('fallo posterior al commit'));
  const error = await client.applyBootstrapData({
    spaces: [{ spaceId: 'new', encryptionVersion: 0 }],
    invitations: { received: [{ invitationId: 'inv_2' }] },
    limits: { eventMaxBytes: 65536 }
  }).then(() => null, (caught) => caught);
  assert.equal(error?.p2pBootstrapControlStateCommitted, true, 'Una falla posterior no declaró que el grafo autoritativo ya quedó persistido.');
  assert.equal(client.bootstrapState.spaces[0].spaceId, 'new');
  assert.equal(client.bootstrapState.spaces[0].durable, true);
  assert.equal(client.eventMaxBytes, 65536);
}

{
  const client = new applyModule.TestClient();
  applyModule.setRecoveryFailure(null);
  const fingerprint = 'a'.repeat(32);
  client.bootstrapState = {
    spaces: [{ spaceId: 'cached', encryptionVersion: 0 }],
    revokedSpaceIds: ['revoked_cached'],
    invitations: { received: [{ invitationId: 'inv_cached' }], sent: [] },
    devices: [
      { deviceId: 'device_atomic_1', name: 'Anterior', lastSeenAt: 'old' },
      { deviceId: 'device_other', name: 'Otro', lastSeenAt: 'stable' }
    ],
    lifecycleTransactions: [],
    replicaHealth: {}
  };
  client.bootstrapSectionFingerprints = Object.fromEntries(
    ['devices', 'spaces', 'revokedSpaceIds', 'invitations', 'lifecycleTransactions', 'limits'].map((name) => [name, fingerprint])
  );
  const state = await client.applyBootstrapData({
    device: { deviceId: 'device_atomic_1', name: 'Actual', lastSeenAt: 'fresh' },
    unchangedSections: ['devices', 'spaces', 'revokedSpaceIds', 'invitations', 'lifecycleTransactions', 'limits'],
    bootstrapSectionFingerprints: { ...client.bootstrapSectionFingerprints },
    stateRevisions: {},
    deliveryState: { sequence: 0 },
    snapshotRequests: [],
    replicaHealth: {}
  });
  assert.equal(state.spaces[0].spaceId, 'cached', 'Una sección omitida con huella válida perdió el estado de espacios ya aplicado.');
  assert.equal(state.invitations.received[0].invitationId, 'inv_cached', 'Una sección omitida con huella válida perdió las invitaciones ya aplicadas.');
  assert.equal(state.devices.find((device) => device.deviceId === 'device_atomic_1')?.lastSeenAt, 'fresh', 'El dispositivo actual no conservó sus timestamps frescos al omitir la lista completa.');
  assert.equal(state.devices.find((device) => device.deviceId === 'device_other')?.lastSeenAt, 'stable', 'La omisión incremental alteró otro dispositivo sin cambios.');
}

const fetchStart = clientSource.indexOf('  async fetchBootstrap(requestSnapshots = false');
const fetchEnd = clientSource.indexOf('\n  async start(user = {})', fetchStart);
assert.ok(fetchStart >= 0 && fetchEnd > fetchStart, 'No se encontró fetchBootstrap.');
const fetchMethod = clientSource.slice(fetchStart, fetchEnd);
const fetchHarness = `
const requests = [];
async function listSpaces() { return []; }
async function listKnownSpaceIds() { return []; }
async function listStateRevisions() { return {}; }
const CURSOR_META_PREFIX = 'p2p_delivery_cursor:';
async function getMeta() { return 0; }
function apiPost(path, body) { return new Promise((resolve, reject) => requests.push({ path, body, resolve, reject })); }
class TestClient {
  constructor() {
    this.bootstrapRequestSequence = 0;
    this.bootstrapAppliedSequence = 0;
    this.bootstrapMinimumApplicableSequence = 0;
    this.bootstrapApplyQueue = Promise.resolve();
    this.bootstrapState = { marker: 'initial' };
    this.applied = [];
  }
  get device() { return { deviceId: 'device_atomic_2' }; }
  captureSessionContext() { return { deviceId: 'device_atomic_2' }; }
  assertSessionContext() { return true; }
  async completedLifecycleReceipts() { return []; }
  async applyBootstrapData(data) {
    this.bootstrapState = data;
    if (data.failAfterCommit) {
      const error = new Error('post-commit');
      error.p2pBootstrapControlStateCommitted = true;
      throw error;
    }
    this.applied.push(data.marker);
    return data;
  }
${fetchMethod}
}
export { TestClient, requests };
`;
const fetchModule = await import(`data:text/javascript;base64,${Buffer.from(fetchHarness).toString('base64')}#fetch`);
async function flushMicrotasks() { await new Promise((resolve) => setImmediate(resolve)); }

{
  const client = new fetchModule.TestClient();
  const older = client.fetchBootstrap(false);
  await flushMicrotasks();
  const newer = client.fetchBootstrap(false);
  await flushMicrotasks();
  fetchModule.requests[1].resolve({ marker: 'newer-committed', failAfterCommit: true });
  await assert.rejects(newer, /post-commit/);
  assert.equal(client.bootstrapAppliedSequence, 2, 'La secuencia perdió un bootstrap cuyo commit local sí ocurrió.');

  fetchModule.requests[0].resolve({ marker: 'older-late' });
  const olderResult = await older;
  assert.equal(olderResult.marker, 'newer-committed', 'Una respuesta anterior sobrescribió el control ya persistido por una lectura más nueva.');
  assert.deepEqual(client.applied, [], 'La respuesta obsoleta alcanzó applyBootstrapData después del commit más nuevo.');
}

console.log('OK: proyectos e invitaciones se reemplazan en un único commit local, el estado en memoria espera la persistencia y una falla posterior no permite aplicar un bootstrap anterior.');
