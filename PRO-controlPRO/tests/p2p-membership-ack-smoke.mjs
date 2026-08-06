import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const currentFile = fileURLToPath(import.meta.url);
const root = path.resolve(path.dirname(currentFile), '..');
const source = fs.readFileSync(path.join(root, 'src', 'js', 'p2p-client.js'), 'utf8');

const methodStart = source.indexOf('  async handleEvent(event = {}');
const methodEnd = source.indexOf('\n  ackRetryDelay()', methodStart);
assert.ok(methodStart >= 0 && methodEnd > methodStart, 'No se encontró el procesamiento realtime para validar el ACK de membresía.');
const methodSource = source.slice(methodStart, methodEnd);

const harness = `
const CURSOR_META_PREFIX = 'cursor:';
const dispatched = [];
const metaWrites = [];
const controlCommits = [];
function dispatch(name, detail = {}) { dispatched.push({ name, detail }); }
function prepareCommittedControlState({ spaces = [], invitations = [] } = {}, options = {}) {
  return {
    spaces: spaces.map((space) => ({
      ...space,
      authorizationState: options.authorizationState === 'unconfirmed' ? 'unconfirmed' : 'confirmed',
      ...(options.authorizationState === 'unconfirmed' ? { authorizationPendingReason: 'replica_recovery' } : {})
    })),
    invitations
  };
}
async function saveControlStateAtomically(state) { controlCommits.push(state); }
function assertRealtimeEventEnvelope(event) { return event; }
function assertRealtimeSequenceContinuity() { return true; }
function eventCursorSequence(event = {}) { return Number(event.deviceSequence || 0); }
function isEntityOperationType() { return false; }
function realtimeProtocolError(message, code, detail = {}) { const error = new Error(message); error.code = code; Object.assign(error, detail); return error; }
async function setMeta(key, value) { metaWrites.push({ key, value }); }
class TestClient {
  constructor(refreshBootstrap, userId = '') {
    this.refreshCalls = [];
    this.refreshBootstrap = async (options = {}) => {
      this.refreshCalls.push(options);
      return refreshBootstrap(options);
    };
    this.user = userId ? { userId } : null;
    this.lastAcceptedStreamSequence = 0;
    this.lastProcessedSequence = 0;
    this.pendingAckReplicaSpaceIds = new Set();
    this.bootstrapState = { spaces: [] };
    this.acks = [];
  }
  captureSessionContext() { return { deviceId: 'device_membership_0001' }; }
  assertSessionContext() { return true; }
  async fenceBootstrapResponses() { return true; }
  applyCommittedControlState(state) { this.bootstrapState = { ...this.bootstrapState, spaces: state.spaces }; }
  emitBootstrapState(source = 'bootstrap', detail = {}) { dispatch('p2p:state', { state: this.bootstrapState, source, ...detail }); return this.bootstrapState; }
  scheduleAck(sequence) { this.acks.push(sequence); }
${methodSource}
}
export { TestClient, dispatched, metaWrites, controlCommits };
`;

const module = await import(`data:text/javascript;base64,${Buffer.from(harness).toString('base64')}`);
const event = {
  eventId: 'event_membership_1',
  eventType: 'p2p.membership.changed',
  deviceSequence: 41,
  spaceId: 'space_membership_1',
  data: {
    space: {
      spaceId: 'space_membership_1',
      ownerUserId: 'user_owner_old',
      members: []
    }
  }
};

const transientError = new Error('bootstrap temporalmente no disponible');
const failingClient = new module.TestClient(async () => { throw transientError; });
await assert.rejects(
  failingClient.handleEvent(event),
  (error) => error === transientError,
  'Una falla al confirmar la membresía autoritativa volvió a absorberse silenciosamente.'
);
assert.equal(failingClient.lastProcessedSequence, 0, 'El cursor durable avanzó aunque la membresía no se aplicó.');
assert.deepEqual(failingClient.acks, [], 'El cliente confirmó al backend un cambio de acceso todavía no aplicado.');
assert.deepEqual(module.metaWrites, [], 'La secuencia fallida quedó persistida y ya no podría reproducirse.');

const incompleteClient = new module.TestClient(async () => ({ spaces: [] }));
await assert.rejects(
  incompleteClient.handleEvent(event),
  (error) => error?.code === 'P2P_REALTIME_MEMBERSHIP_STATE_MISSING'
    && error?.spaceId === event.spaceId,
  'Un bootstrap exitoso pero incompleto permitió confirmar un cambio de membresía sin estado autoritativo.'
);
assert.equal(incompleteClient.lastProcessedSequence, 0, 'El cursor avanzó aunque el bootstrap omitió el proyecto afectado.');
assert.deepEqual(incompleteClient.acks, [], 'Se envió ACK aunque el bootstrap no confirmó el proyecto afectado.');
assert.deepEqual(module.metaWrites, [], 'La secuencia incompleta quedó persistida y ya no podría reproducirse.');

const canonicalSpace = {
  spaceId: 'space_membership_1',
  ownerUserId: 'user_owner_new',
  members: [{ userId: 'user_owner_new', role: 'owner', permissions: ['read'] }]
};
const healthyClient = new module.TestClient(async () => ({ spaces: [canonicalSpace] }));
await healthyClient.handleEvent(event);
assert.equal(healthyClient.lastProcessedSequence, 41, 'El cursor no avanzó después de aplicar la membresía autoritativa.');
assert.deepEqual(healthyClient.acks, [41], 'El ACK no se programó después de una aplicación válida.');
assert.equal(module.dispatched.at(-1)?.name, 'p2p:membership');
assert.equal(
  module.dispatched.at(-1)?.detail?.space?.ownerUserId,
  'user_owner_new',
  'La interfaz recibió el grafo transportado y no el estado autoritativo leído antes del ACK.'
);

const inheritedMembershipEvent = {
  ...event,
  eventId: 'event_membership_inherited_1',
  deviceSequence: 42,
  spaceId: 'space_inherited_1',
  data: {
    ...event.data,
    targetUserId: 'user_guest_1',
    space: {
      spaceId: 'space_inherited_1',
      ownerUserId: 'user_owner_1',
      members: [{ userId: 'user_guest_1', role: 'member', permissions: ['read'], accessScope: 'portfolio' }]
    }
  }
};
const inheritedSpace = {
  spaceId: 'space_inherited_1',
  ownerUserId: 'user_owner_1',
  members: [{ userId: 'user_guest_1', role: 'member', permissions: ['read'], accessScope: 'portfolio' }]
};
const inheritedClient = new module.TestClient(async () => ({ spaces: [inheritedSpace] }), 'user_guest_1');
await inheritedClient.handleEvent(inheritedMembershipEvent);
assert.equal(module.controlCommits.length, 1, 'La membresía heredada no creó una frontera durable antes del primer bootstrap.');
assert.equal(module.controlCommits[0]?.spaces?.[0]?.authorizationState, 'unconfirmed');
assert.equal(module.controlCommits[0]?.spaces?.[0]?.authorizationPendingReason, 'replica_recovery');
assert.deepEqual(
  inheritedClient.refreshCalls,
  [
    { requestSnapshots: false, dispatchState: false },
    { requestSnapshots: 'initial-clone', snapshotSpaceIds: ['space_inherited_1'], dispatchState: true }
  ],
  'Una membresía heredada para la cuenta actual no solicita la clonación inicial dirigida de su proyecto.'
);
assert.equal(inheritedClient.lastProcessedSequence, 42, 'La membresía heredada no avanzó después de confirmar su recuperación dirigida.');
assert.deepEqual(inheritedClient.acks, [42], 'La membresía heredada no confirmó el evento después de la recuperación autoritativa.');

console.log('OK: los cambios de membresía solo avanzan cursor y ACK después de confirmar el proyecto en el bootstrap autoritativo; las altas heredadas solicitan clonación inicial dirigida y las fallas conservan el evento para replay.');
