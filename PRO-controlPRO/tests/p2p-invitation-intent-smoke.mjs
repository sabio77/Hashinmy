import assert from 'node:assert/strict';
import {
  clearInvitationIntentFromUrl,
  findPendingInvitation,
  invitationIntentFromServiceWorkerMessage,
  normalizeInvitationIntentId,
  readInvitationIntent,
  resolveCanonicalInvitationDecision
} from '../src/js/p2p-invitation-intent.js';

assert.equal(normalizeInvitationIntentId('  inv_123  '), 'inv_123');
assert.equal(normalizeInvitationIntentId(''), '');
assert.equal(normalizeInvitationIntentId('x'.repeat(161)), '');

assert.equal(
  readInvitationIntent('https://seed.example/index.html?lang=es&p2pInvitation=inv_deep_link#panel'),
  'inv_deep_link'
);
assert.equal(readInvitationIntent('https://seed.example/index.html?lang=es'), '');
assert.equal(readInvitationIntent('not a valid url'), '');

assert.equal(invitationIntentFromServiceWorkerMessage({
  type: 'P2P_PUSH_RECEIVED',
  payload: { type: 'p2p.invitation', invitationId: ' inv_push ' }
}), 'inv_push');
assert.equal(invitationIntentFromServiceWorkerMessage({
  type: 'P2P_PUSH_RECEIVED',
  payload: { type: 'p2p.invitation.response', invitationId: 'inv_response' }
}), '');
assert.equal(invitationIntentFromServiceWorkerMessage({ type: 'OTHER' }), '');

const invitations = [
  { invitationId: 'inv_old', status: 'accepted' },
  { invitationId: 'inv_pending', status: 'pending' }
];
assert.equal(findPendingInvitation(invitations, 'inv_pending'), invitations[1]);
assert.equal(findPendingInvitation(invitations, 'inv_old'), null);
assert.equal(findPendingInvitation(invitations, 'missing'), null);

assert.equal(resolveCanonicalInvitationDecision({ status: 'accepted' }, 'reject'), 'accept');
assert.equal(resolveCanonicalInvitationDecision({ status: 'rejected' }, 'accept'), 'reject');
assert.equal(resolveCanonicalInvitationDecision({ status: 'pending' }, 'reject'), 'reject');
assert.equal(resolveCanonicalInvitationDecision({}, 'accept'), 'accept');

let replacedWith = '';
const historyLike = {
  state: { preserved: true },
  replaceState(state, title, url) {
    assert.deepEqual(state, { preserved: true });
    assert.equal(title, '');
    replacedWith = url;
  }
};
assert.equal(clearInvitationIntentFromUrl({
  locationLike: { href: 'https://seed.example/app/?lang=es&p2pInvitation=inv_1#pending' },
  historyLike
}), true);
assert.equal(replacedWith, '/app/?lang=es#pending');
assert.equal(clearInvitationIntentFromUrl({
  locationLike: { href: 'https://seed.example/app/?lang=es#pending' },
  historyLike
}), false);

console.log('OK: enlace profundo y recepción Push de invitaciones conducen de forma segura a una invitación pendiente.');
