import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const currentFile = fileURLToPath(import.meta.url);
const root = path.resolve(path.dirname(currentFile), '..');
const source = fs.readFileSync(path.join(root, 'src', 'js', 'p2p-client.js'), 'utf8');

const helperStart = source.indexOf('function eventCursorSequence(');
const helperEnd = source.indexOf('\nexport function describeAtomicTransportBatchEvent(', helperStart);
assert.ok(helperStart >= 0 && helperEnd > helperStart, 'No se encontraron las validaciones del sobre realtime.');
const helperSource = source
  .slice(helperStart, helperEnd)
  .replaceAll('export function ', 'function ');

const harness = `${helperSource}\nexport { assertCanonicalOperationEnvelope, assertCanonicalControlEnvelope, assertRealtimeEventEnvelope, assertRealtimeSequenceContinuity };`;
const module = await import(`data:text/javascript;base64,${Buffer.from(harness).toString('base64')}`);

const event = (deviceSequence, overrides = {}) => ({
  eventId: `evt_${deviceSequence}`,
  eventType: 'p2p.test.control',
  deviceSequence,
  deliverySequence: 1000 + deviceSequence,
  ...overrides
});

const controlEvent = (eventType, overrides = {}) => ({
  eventId: `control_${eventType.replaceAll('.', '_')}`,
  eventType,
  deviceSequence: 21,
  deliverySequence: 2021,
  spaceId: 'space_control_1',
  actorUserId: 'user_actor_1',
  sourceDeviceId: '',
  data: {},
  ...overrides
});

const publicKey = { kty: 'EC', crv: 'P-256', x: 'x'.repeat(43), y: 'y'.repeat(43) };
const invitation = (status = 'created', overrides = {}) => ({
  invitationId: `inv_${status}`,
  spaceId: 'space_control_1',
  inviterUserId: 'user_inviter_1',
  recipientUserId: 'user_recipient_1',
  recipientEmail: 'persona@example.com',
  permissions: ['read', 'add'],
  role: 'member',
  accessScope: 'project',
  status,
  ...overrides
});
const space = {
  spaceId: 'space_control_1',
  ownerUserId: 'user_owner_1',
  members: [
    {
      userId: 'user_owner_1',
      role: 'owner',
      permissions: ['read', 'add', 'delete', 'projection', 'invite', 'write']
    },
    { userId: 'user_inviter_1', role: 'member', permissions: ['read', 'invite'] },
    { userId: 'user_recipient_1', role: 'member', permissions: ['read', 'add'] }
  ]
};

const spaceAfterInviterExit = {
  spaceId: 'space_control_1',
  ownerUserId: 'user_owner_2',
  members: [
    {
      userId: 'user_owner_2',
      role: 'owner',
      permissions: ['read', 'add', 'delete', 'projection', 'invite', 'write']
    },
    { userId: 'user_recipient_1', role: 'member', permissions: ['read', 'add'] }
  ]
};

const elevatedPermissions = ['read', 'add', 'delete', 'projection', 'invite', 'write'];
const spaceWithElevatedGrant = {
  spaceId: 'space_control_1',
  ownerUserId: 'user_owner_1',
  members: [
    { userId: 'user_owner_1', role: 'owner', permissions: elevatedPermissions },
    { userId: 'user_manager_1', role: 'manager', permissions: elevatedPermissions },
    { userId: 'user_recipient_1', role: 'admin', accessScope: 'portfolio', permissions: elevatedPermissions }
  ]
};

const operationEvent = (deviceSequence, overrides = {}) => ({
  eventId: `operation_evt_${deviceSequence}`,
  eventType: 'p2p.operation',
  deviceSequence,
  deliverySequence: 2000 + deviceSequence,
  spaceSequence: 40 + deviceSequence,
  stateRevision: 30 + deviceSequence,
  spaceId: 'space_realtime_1',
  actorUserId: 'user_actor_1',
  sourceDeviceId: 'device_source_1',
  operation: {
    operationId: `operation_${deviceSequence}`,
    type: 'entity.put',
    entityType: 'admin.purchase',
    entityId: `purchase_${deviceSequence}`,
    payload: {}
  },
  ...overrides
});

assert.equal(module.assertRealtimeEventEnvelope(event(11)).eventId, 'evt_11');
assert.equal(module.assertRealtimeSequenceContinuity([event(11), event(12)], 10), 12);
assert.equal(module.assertRealtimeEventEnvelope(operationEvent(11)).operation.operationId, 'operation_11');
const directCanonicalEvent = operationEvent(19);
delete directCanonicalEvent.deviceSequence;
assert.equal(module.assertCanonicalOperationEnvelope(directCanonicalEvent).eventId, 'operation_evt_19');
assert.equal(module.assertRealtimeEventEnvelope(operationEvent(12, {
  stateRevision: 0,
  operation: {
    operationId: 'snapshot_12',
    type: 'snapshot.chunk',
    entityType: 'generic',
    entityId: '',
    payload: { requestId: 'snapshot_request_1', entities: [] }
  }
})).operation.type, 'snapshot.chunk');
assert.equal(module.assertRealtimeEventEnvelope({
  eventId: 'gap_1',
  eventType: 'p2p.delivery.gap',
  currentSequence: 40
}, { gap: true }).currentSequence, 40);
assert.equal(module.assertRealtimeEventEnvelope({
  eventId: 'gap_cursor_reset_1',
  eventType: 'p2p.delivery.gap',
  currentSequence: 3,
  reason: 'cursor_ahead_of_server',
  cursorResetRequired: true,
  resetToSequence: 3
}, { gap: true }).resetToSequence, 3);

assert.equal(module.assertRealtimeEventEnvelope(controlEvent('p2p.membership.changed', {
  actorUserId: 'user_owner_1',
  data: {
    space,
    targetUserId: 'user_recipient_1',
    permissions: ['read', 'add']
  }
})).eventType, 'p2p.membership.changed');
assert.equal(module.assertRealtimeEventEnvelope(controlEvent('p2p.membership.changed', {
  actorUserId: 'user_manager_1',
  data: {
    space: spaceWithElevatedGrant,
    targetUserId: 'user_recipient_1',
    permissions: elevatedPermissions,
    role: 'admin',
    accessScope: 'portfolio'
  }
})).eventType, 'p2p.membership.changed');
assert.equal(module.assertRealtimeEventEnvelope(controlEvent('p2p.membership.revoked', {
  data: { spaceId: 'space_control_1', revokedUserId: 'user_revoked_1', selfRemoval: false }
})).eventType, 'p2p.membership.revoked');
assert.equal(module.assertRealtimeEventEnvelope(controlEvent('p2p.space.deleted', {
  data: { spaceId: 'space_control_1', deletedByUserId: 'user_actor_1' }
})).eventType, 'p2p.space.deleted');
assert.equal(module.assertRealtimeEventEnvelope(controlEvent('p2p.invitation.created', {
  actorUserId: 'user_inviter_1',
  data: { invitation: invitation('pending') }
})).eventType, 'p2p.invitation.created');
assert.equal(module.assertRealtimeEventEnvelope(controlEvent('p2p.invitation.accepted', {
  actorUserId: 'user_recipient_1',
  data: { invitation: invitation('accepted'), space }
})).eventType, 'p2p.invitation.accepted');
assert.equal(module.assertRealtimeEventEnvelope(controlEvent('p2p.invitation.accepted', {
  actorUserId: 'user_recipient_1',
  data: { invitation: invitation('accepted'), space: spaceAfterInviterExit }
})).eventType, 'p2p.invitation.accepted');
assert.equal(module.assertRealtimeEventEnvelope(controlEvent('p2p.invitation.accepted', {
  actorUserId: 'user_recipient_1',
  data: {
    invitation: invitation('accepted', { role: 'admin', accessScope: 'portfolio', permissions: elevatedPermissions }),
    space: spaceWithElevatedGrant
  }
})).eventType, 'p2p.invitation.accepted');
assert.equal(module.assertRealtimeEventEnvelope(controlEvent('p2p.invitation.rejected', {
  actorUserId: 'user_recipient_1',
  data: { invitation: invitation('rejected'), space: null }
})).eventType, 'p2p.invitation.rejected');
assert.equal(module.assertRealtimeEventEnvelope(controlEvent('p2p.invitation.cancelled', {
  actorUserId: 'user_inviter_1',
  data: { invitation: invitation('cancelled'), space: null }
})).eventType, 'p2p.invitation.cancelled');
assert.equal(module.assertRealtimeEventEnvelope(controlEvent('p2p.key.request', {
  actorUserId: 'user_requester_1',
  sourceDeviceId: 'device_requester_0001',
  data: {
    requestDevice: {
      deviceId: 'device_requester_0001',
      userId: 'user_requester_1',
      encryptionPublicKey: publicKey
    },
    keyId: 'key_active_0001',
    keyEpoch: 1
  }
})).eventType, 'p2p.key.request');
assert.equal(module.assertRealtimeEventEnvelope(controlEvent('p2p.key.envelope', {
  sourceDeviceId: 'device_sender_00001',
  data: {
    envelope: {
      senderDeviceId: 'device_sender_00001',
      recipientDeviceId: 'device_target_00001',
      keyId: 'key_active_0001',
      senderPublicKey: publicKey
    },
    keyEpoch: 1
  }
})).eventType, 'p2p.key.envelope');
assert.equal(module.assertRealtimeEventEnvelope(controlEvent('p2p.snapshot.request', {
  actorUserId: 'user_requester_1',
  sourceDeviceId: 'device_requester_0001',
  data: {
    requestId: 'snapshot_request_1',
    requestDeviceId: 'device_requester_0001',
    requestUserId: 'user_requester_1',
    spaceId: 'space_control_1',
    localStateRevision: 4,
    currentStateRevision: 5
  }
})).eventType, 'p2p.snapshot.request');

assert.throws(
  () => module.assertRealtimeEventEnvelope(controlEvent('p2p.membership.revoked')),
  (error) => error?.code === 'P2P_CANONICAL_CONTROL_INVALID_ENVELOPE'
    && error.reason === 'membership-revoked',
  'Una revocación sin cuenta ni espacio coherente siguió avanzando el cursor.'
);
assert.throws(
  () => module.assertRealtimeEventEnvelope(controlEvent('p2p.space.deleted', {
    data: { spaceId: 'space_different' }
  })),
  (error) => error?.code === 'P2P_CANONICAL_CONTROL_INVALID_ENVELOPE'
    && error.reason === 'space-deleted',
  'Una eliminación dirigida a otro espacio siguió pudiendo purgar o confirmar el evento equivocado.'
);
assert.throws(
  () => module.assertRealtimeEventEnvelope(controlEvent('p2p.membership.changed', {
    data: { space: { ...space, members: [] } }
  })),
  (error) => error?.code === 'P2P_CANONICAL_CONTROL_INVALID_ENVELOPE'
    && error.reason === 'membership-changed',
  'Un cambio de membresía sin estado recuperable siguió siendo confirmado silenciosamente.'
);
assert.throws(
  () => module.assertRealtimeEventEnvelope(controlEvent('p2p.membership.changed', {
    actorUserId: 'user_owner_1',
    data: { space }
  })),
  (error) => error?.code === 'P2P_CANONICAL_CONTROL_INVALID_ENVELOPE'
    && error.reason === 'membership-changed',
  'Un evento sin transición declarada siguió reemplazando el grafo local y avanzando el cursor.'
);
assert.throws(
  () => module.assertRealtimeEventEnvelope(controlEvent('p2p.membership.changed', {
    actorUserId: 'user_owner_1',
    data: {
      space,
      revokedUserId: 'user_removed_1',
      targetUserId: 'user_recipient_1',
      permissions: ['read', 'add']
    }
  })),
  (error) => error?.code === 'P2P_CANONICAL_CONTROL_INVALID_ENVELOPE'
    && error.reason === 'membership-changed',
  'Un evento que mezcla revocación y permisos siguió considerándose una transición canónica única.'
);
assert.throws(
  () => module.assertRealtimeEventEnvelope(controlEvent('p2p.space.deleted', {
    data: { spaceId: 'space_control_1', deletedByUserId: 'user_other_1' }
  })),
  (error) => error?.code === 'P2P_CANONICAL_CONTROL_INVALID_ENVELOPE'
    && error.reason === 'space-deleted',
  'Una eliminación atribuida a otra identidad siguió pudiendo purgar el espacio local.'
);
assert.throws(
  () => module.assertRealtimeEventEnvelope(controlEvent('p2p.membership.revoked', {
    data: { spaceId: 'space_control_1', revokedUserId: 'user_revoked_1', selfRemoval: true }
  })),
  (error) => error?.code === 'P2P_CANONICAL_CONTROL_INVALID_ENVELOPE'
    && error.reason === 'membership-revoked',
  'Una salida voluntaria ejecutada por otra cuenta siguió pudiendo avanzar el cursor.'
);
assert.throws(
  () => module.assertRealtimeEventEnvelope(controlEvent('p2p.membership.changed', {
    data: { space: { ...space, ownerUserId: 'user_missing_owner_1' } }
  })),
  (error) => error?.code === 'P2P_CANONICAL_CONTROL_INVALID_ENVELOPE'
    && error.reason === 'membership-changed',
  'Un espacio cuyo propietario no existe como owner canónico siguió reemplazando la membresía local.'
);
assert.throws(
  () => module.assertRealtimeEventEnvelope(controlEvent('p2p.membership.changed', {
    actorUserId: 'user_owner_1',
    data: {
      space,
      targetUserId: 'user_recipient_1',
      permissions: ['read']
    }
  })),
  (error) => error?.code === 'P2P_CANONICAL_CONTROL_INVALID_ENVELOPE'
    && error.reason === 'membership-changed',
  'Un evento de permisos contradictorio siguió reemplazando el estado canónico local.'
);
assert.throws(
  () => module.assertRealtimeEventEnvelope(controlEvent('p2p.membership.changed', {
    actorUserId: 'user_inviter_1',
    data: {
      space,
      targetUserId: 'user_recipient_1',
      permissions: ['read', 'add'],
      role: 'member',
      accessScope: 'project'
    }
  })),
  (error) => error?.code === 'P2P_CANONICAL_CONTROL_INVALID_ENVELOPE'
    && error.reason === 'membership-changed',
  'Un miembro sin facultad administrativa siguió pudiendo reemplazar permisos mediante un evento realtime.'
);
assert.throws(
  () => module.assertRealtimeEventEnvelope(controlEvent('p2p.invitation.accepted', {
    actorUserId: 'user_recipient_1',
    data: { invitation: invitation('accepted'), space: null }
  })),
  (error) => error?.code === 'P2P_CANONICAL_CONTROL_INVALID_ENVELOPE'
    && error.reason === 'invitation-accepted-space',
  'Una aceptación sin membresía reconstruible siguió cerrando la invitación en el cliente.'
);
assert.throws(
  () => module.assertRealtimeEventEnvelope(controlEvent('p2p.invitation.accepted', {
    actorUserId: 'user_recipient_1',
    data: {
      invitation: invitation('accepted'),
      space: { ...space, members: space.members.filter((member) => member.userId !== 'user_recipient_1') }
    }
  })),
  (error) => error?.code === 'P2P_CANONICAL_CONTROL_INVALID_ENVELOPE'
    && error.reason === 'invitation-accepted-space',
  'Una aceptación sin el invitado dentro de la membresía siguió cerrándose como válida.'
);
assert.throws(
  () => module.assertRealtimeEventEnvelope(controlEvent('p2p.invitation.accepted', {
    actorUserId: 'user_recipient_1',
    data: {
      invitation: invitation('accepted', { role: 'manager', accessScope: 'portfolio', permissions: elevatedPermissions }),
      space: spaceWithElevatedGrant
    }
  })),
  (error) => error?.code === 'P2P_CANONICAL_CONTROL_INVALID_ENVELOPE'
    && error.reason === 'invitation-accepted-space',
  'Una aceptación con rol distinto al persistido siguió avanzando el cursor del cliente.'
);
assert.throws(
  () => module.assertRealtimeEventEnvelope(controlEvent('p2p.invitation.rejected', {
    actorUserId: 'user_recipient_1',
    data: { invitation: invitation('rejected'), space }
  })),
  (error) => error?.code === 'P2P_CANONICAL_CONTROL_INVALID_ENVELOPE'
    && error.reason === 'invitation-rejected-space',
  'Una invitación rechazada con un espacio adjunto siguió creando un estado local ambiguo.'
);
assert.throws(
  () => module.assertRealtimeEventEnvelope(controlEvent('p2p.invitation.cancelled', {
    actorUserId: 'user_recipient_1',
    data: { invitation: invitation('cancelled'), space: null }
  })),
  (error) => error?.code === 'P2P_CANONICAL_CONTROL_INVALID_ENVELOPE'
    && error.reason === 'invitation-actor',
  'Una cancelación atribuida al invitado siguió avanzando el cursor del cliente.'
);
assert.throws(
  () => module.assertRealtimeEventEnvelope(controlEvent('p2p.invitation.cancelled', {
    actorUserId: 'user_inviter_1',
    data: { invitation: invitation('cancelled'), space }
  })),
  (error) => error?.code === 'P2P_CANONICAL_CONTROL_INVALID_ENVELOPE'
    && error.reason === 'invitation-cancelled-space',
  'Una cancelación con grafo de membresía siguió creando un estado local ambiguo.'
);
assert.throws(
  () => module.assertRealtimeEventEnvelope(controlEvent('p2p.key.request', {
    actorUserId: 'user_requester_1',
    sourceDeviceId: 'device_requester_0001',
    data: {
      requestDevice: {
        deviceId: 'device_other_000001',
        userId: 'user_requester_1',
        encryptionPublicKey: publicKey
      },
      keyId: 'key_active_0001',
      keyEpoch: 1
    }
  })),
  (error) => error?.code === 'P2P_CANONICAL_CONTROL_INVALID_ENVELOPE'
    && error.reason === 'key-request',
  'Una solicitud de clave con identidad de dispositivo contradictoria siguió siendo aceptada.'
);
assert.throws(
  () => module.assertRealtimeEventEnvelope(controlEvent('p2p.snapshot.request', {
    actorUserId: 'user_requester_1',
    sourceDeviceId: 'device_requester_0001',
    data: {
      requestId: 'snapshot_request_bad',
      requestDeviceId: 'device_requester_0001',
      requestUserId: 'user_requester_1',
      spaceId: 'space_control_1',
      localStateRevision: 5,
      currentStateRevision: 5
    }
  })),
  (error) => error?.code === 'P2P_CANONICAL_CONTROL_INVALID_ENVELOPE'
    && error.reason === 'snapshot-request',
  'Una solicitud de snapshot sin brecha real siguió consumiendo trabajo y cursor.'
);

assert.throws(
  () => module.assertRealtimeEventEnvelope({ eventType: 'p2p.membership.changed', deviceSequence: 11 }),
  (error) => error?.code === 'P2P_REALTIME_EVENT_INVALID_ENVELOPE',
  'Un JSON válido sin eventId siguió siendo aceptado silenciosamente.'
);
assert.throws(
  () => module.assertRealtimeEventEnvelope(event(11.5)),
  (error) => error?.code === 'P2P_REALTIME_EVENT_INVALID_ENVELOPE',
  'Una secuencia fraccionaria siguió siendo utilizable como cursor.'
);
assert.throws(
  () => module.assertCanonicalOperationEnvelope({ ...operationEvent(20), eventId: '' }),
  (error) => error?.code === 'P2P_CANONICAL_OPERATION_INVALID_ENVELOPE'
    && error.reason === 'event-identity',
  'Una respuesta canónica directa sin eventId siguió pudiendo escribirse localmente.'
);
assert.throws(
  () => module.assertCanonicalOperationEnvelope({
    ...operationEvent(21),
    deviceSequence: undefined,
    deliverySequence: undefined
  }),
  (error) => error?.code === 'P2P_CANONICAL_OPERATION_INVALID_ENVELOPE'
    && error.reason === 'transport-sequence',
  'Una respuesta canónica sin ninguna secuencia de transporte siguió pudiendo aplicarse fuera del stream.'
);
assert.throws(
  () => module.assertRealtimeEventEnvelope(operationEvent(13, { spaceSequence: undefined })),
  (error) => error?.code === 'P2P_CANONICAL_OPERATION_INVALID_ENVELOPE'
    && error.reason === 'space-sequence',
  'Una operación canónica sin secuencia del espacio siguió entrando como estado optimista.'
);
assert.throws(
  () => module.assertRealtimeEventEnvelope(operationEvent(14, { stateRevision: 0 })),
  (error) => error?.code === 'P2P_CANONICAL_OPERATION_INVALID_ENVELOPE'
    && error.reason === 'durable-state-revision',
  'Una mutación durable sin revisión canónica siguió pudiendo convertirse en dato fantasma.'
);
assert.throws(
  () => module.assertRealtimeEventEnvelope(operationEvent(15, {
    operation: {
      operationId: 'operation_15',
      type: 'entity.patch',
      entityType: 'admin.purchase',
      entityId: '',
      payload: {}
    }
  })),
  (error) => error?.code === 'P2P_CANONICAL_OPERATION_INVALID_ENVELOPE'
    && error.reason === 'entity-identity',
  'Una operación sin entidad de destino siguió siendo aceptada por el stream.'
);
assert.throws(
  () => module.assertRealtimeEventEnvelope(operationEvent(16, {
    spaceSequence: 50,
    stateRevision: 51
  })),
  (error) => error?.code === 'P2P_CANONICAL_OPERATION_INVALID_ENVELOPE'
    && error.reason === 'revision-order',
  'Una revisión de estado posterior a la secuencia del espacio siguió siendo aceptada.'
);
assert.throws(
  () => module.assertRealtimeEventEnvelope(operationEvent(17, { actorUserId: '' })),
  (error) => error?.code === 'P2P_CANONICAL_OPERATION_INVALID_ENVELOPE'
    && error.reason === 'identity',
  'Una operación sin identidad de origen siguió pudiendo aplicarse y confirmarse.'
);

assert.throws(
  () => module.assertRealtimeEventEnvelope(operationEvent(18, {
    operation: {
      operationId: 'operation_18',
      type: 'entity.put',
      entityType: 'admin.purchase',
      entityId: 'purchase_18',
      payload: null
    }
  })),
  (error) => error?.code === 'P2P_CANONICAL_OPERATION_INVALID_ENVELOPE'
    && error.reason === 'payload',
  'Una operación sin payload estructurado siguió pudiendo llegar al reductor local.'
);

assert.throws(
  () => module.assertRealtimeEventEnvelope({
    eventId: 'gap_bad',
    eventType: 'p2p.delivery.gap',
    currentSequence: 'desconocida'
  }, { gap: true }),
  (error) => error?.code === 'P2P_REALTIME_GAP_INVALID_ENVELOPE',
  'Un aviso de brecha semánticamente inválido no fue bloqueado.'
);
assert.throws(
  () => module.assertRealtimeEventEnvelope({
    eventId: 'gap_cursor_reset_bad',
    eventType: 'p2p.delivery.gap',
    currentSequence: 3,
    reason: 'cursor_ahead_of_server'
  }, { gap: true }),
  (error) => error?.code === 'P2P_REALTIME_GAP_INVALID_ENVELOPE',
  'Un restablecimiento de cursor sin marcador y destino autoritativos siguió siendo aceptado.'
);
assert.throws(
  () => module.assertRealtimeSequenceContinuity([event(12)], 10),
  (error) => error?.code === 'P2P_REALTIME_SEQUENCE_GAP'
    && error.expectedSequence === 11
    && error.receivedSequence === 12,
  'El cliente todavía puede saltar una secuencia y confirmar el evento posterior.'
);
assert.throws(
  () => module.assertRealtimeSequenceContinuity([event(10)], 10),
  (error) => error?.code === 'P2P_REALTIME_SEQUENCE_REPLAY',
  'El cliente todavía acepta una reproducción anterior al cursor de la sesión.'
);

const eventListenerStart = source.indexOf("source.addEventListener('p2p_event'");
const eventListenerEnd = source.indexOf('      source.onerror', eventListenerStart);
const eventListener = source.slice(eventListenerStart, eventListenerEnd);
assert.match(eventListener, /assertRealtimeEventEnvelope\(payload\)/);
assert.match(eventListener, /event-envelope/);

const gapListenerStart = source.indexOf("source.addEventListener('p2p_gap'");
const gapListenerEnd = source.indexOf("source.addEventListener('p2p_event'", gapListenerStart);
const gapListener = source.slice(gapListenerStart, gapListenerEnd);
assert.match(gapListener, /assertRealtimeEventEnvelope\(gapEvent, \{ gap: true \}\)/);
assert.match(gapListener, /delivery-gap-envelope/);

const singleApplyStart = source.indexOf('  async applyDecryptedOperationEvent(event = {}');
const singleApplyEnd = source.indexOf('\n  async applyDecryptedOperationEventBatch(', singleApplyStart);
const singleApply = source.slice(singleApplyStart, singleApplyEnd);
assert.match(singleApply, /assertCanonicalOperationEnvelope\(event\)/);

const batchApplyStart = source.indexOf('  async applyDecryptedOperationEventBatch(');
const batchApplyEnd = source.indexOf('\n  async handleEventBatch(', batchApplyStart);
const batchApply = source.slice(batchApplyStart, batchApplyEnd);
assert.match(batchApply, /ordered\.forEach\(\(event\) => assertCanonicalOperationEnvelope\(event\)\)/);

const batchStart = source.indexOf('  async handleEventBatch(');
const batchEnd = source.indexOf('\n  async handleKeyRequestEvent(', batchStart);
const batchHandler = source.slice(batchStart, batchEnd);
assert.match(batchHandler, /assertRealtimeSequenceContinuity\(ordered, this\.lastAcceptedStreamSequence\)/);
assert.match(batchHandler, /this\.lastAcceptedStreamSequence = nextCursor/);

const keyRequestStart = source.indexOf('  async requestSpaceKey(');
const keyRequestEnd = source.indexOf('\n  async sendSpaceKeyEnvelope(', keyRequestStart);
const keyRequestHandler = source.slice(keyRequestStart, keyRequestEnd);
assert.match(keyRequestHandler, /excludeDeviceIds/);
assert.match(keyRequestHandler, /rejectedKeyEnvelopeDeviceIds/);

const keyEnvelopeStart = source.indexOf('  async handleKeyEnvelopeEvent(');
const keyEnvelopeEnd = source.indexOf('\n  async handleEvent(event = {}', keyEnvelopeStart);
const keyEnvelopeHandler = source.slice(keyEnvelopeStart, keyEnvelopeEnd);
assert.match(keyEnvelopeHandler, /isRejectedKeyEnvelopeError\(error\)/);
assert.match(keyEnvelopeHandler, /rememberRejectedKeyEnvelopeSource/);
assert.match(keyEnvelopeHandler, /force: true/);
assert.match(keyEnvelopeHandler, /scheduleRejectedKeyEnvelopeRetry/);
assert.match(keyEnvelopeHandler, /reason: 'rejected_envelope'/);
assert.match(keyEnvelopeHandler, /return \{[\s\S]*imported: false/);

const eventHandlerStart = source.indexOf('  async handleEvent(event = {}');
const eventHandlerEnd = source.indexOf('\n  ackRetryDelay()', eventHandlerStart);
const eventHandler = source.slice(eventHandlerStart, eventHandlerEnd);
assert.doesNotMatch(eventHandler, /if \(!event\?\.eventId\) return/);
assert.match(eventHandler, /assertRealtimeSequenceContinuity\(\[event\], this\.lastAcceptedStreamSequence\)/);
assert.match(eventHandler, /this\.lastAcceptedStreamSequence = currentSequence/);
assert.match(eventHandler, /this\.resetDeliveryCursor\(currentSequence, sessionContext\)/);
assert.match(eventHandler, /this\.lastAcceptedStreamSequence = nextCursor/);

const openRealtimeStart = source.indexOf('  async openRealtime()');
const openRealtimeEnd = source.indexOf('\n  scheduleReconnect()', openRealtimeStart);
const openRealtime = source.slice(openRealtimeStart, openRealtimeEnd);
assert.match(openRealtime, /this\.lastAcceptedStreamSequence = cursor/);

console.log('OK: eventos críticos exigen sobres canónicos y un sobre de clave corrupto se aísla, solicita otra fuente y permite continuar el cursor sin perder operaciones funcionales.');
