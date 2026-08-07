import assert from 'node:assert/strict';
import {
  autoAcceptablePortfolioProjectInvitations,
  clearInvitationIntentFromUrl,
  findPendingInvitation,
  invitationGovernanceSpaceId,
  invitationIntentFromServiceWorkerMessage,
  normalizeInvitationIntentId,
  readInvitationIntent,
  relatedPortfolioProjectInvitations,
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
assert.equal(resolveCanonicalInvitationDecision({ status: 'cancelled' }, 'accept'), 'reject');
assert.equal(resolveCanonicalInvitationDecision({ status: 'pending' }, 'reject'), 'reject');
assert.equal(resolveCanonicalInvitationDecision({}, 'accept'), 'accept');


const legacyPortfolioInvitation = {
  invitationId: 'inv_portfolio_legacy',
  spaceId: 'space_portfolio_legacy',
  resourceType: 'admin.portfolio',
  inviterUserId: 'user_owner',
  role: 'manager',
  accessScope: 'portfolio',
  status: 'pending'
};
const legacyProjectInvitations = [
  {
    invitationId: 'inv_project_legacy_1',
    spaceId: 'space_project_legacy_1',
    governanceSpaceId: '',
    resourceType: 'admin.project',
    inviterUserId: 'user_owner',
    role: 'manager',
    accessScope: 'portfolio',
    status: 'pending'
  },
  {
    invitationId: 'inv_project_legacy_2',
    spaceId: 'space_project_legacy_2',
    governanceSpaceId: '',
    resourceType: 'admin.project',
    inviterUserId: 'user_owner',
    role: 'manager',
    accessScope: 'portfolio',
    status: 'pending'
  }
];
const legacyBundle = [legacyPortfolioInvitation, ...legacyProjectInvitations];
assert.equal(invitationGovernanceSpaceId(legacyPortfolioInvitation), 'space_portfolio_legacy');
assert.deepEqual(
  relatedPortfolioProjectInvitations(legacyBundle, legacyPortfolioInvitation).map((item) => item.invitationId),
  ['inv_project_legacy_1', 'inv_project_legacy_2'],
  'Un panel único debe incorporar las invitaciones heredadas de proyectos antiguos sin governanceSpaceId.'
);
assert.deepEqual(
  autoAcceptablePortfolioProjectInvitations(legacyProjectInvitations, [{
    spaceId: 'space_portfolio_legacy',
    role: 'manager',
    authorizedInviterUserIds: ['user_owner']
  }]).map((item) => item.invitationId),
  ['inv_project_legacy_1', 'inv_project_legacy_2'],
  'Tras aceptar el panel, sus proyectos heredados deben aceptarse automáticamente si la asociación es inequívoca.'
);

const secondLegacyPortfolio = { ...legacyPortfolioInvitation, invitationId: 'inv_portfolio_legacy_2', spaceId: 'space_portfolio_other' };
assert.deepEqual(
  relatedPortfolioProjectInvitations([...legacyBundle, secondLegacyPortfolio], legacyPortfolioInvitation),
  [],
  'Dos paneles pendientes del mismo remitente no deben absorber proyectos legacy de forma ambigua.'
);
assert.deepEqual(
  autoAcceptablePortfolioProjectInvitations(legacyProjectInvitations, [
    { spaceId: 'space_portfolio_legacy', role: 'manager', authorizedInviterUserIds: ['user_owner'] },
    { spaceId: 'space_portfolio_other', role: 'manager', authorizedInviterUserIds: ['user_owner'] }
  ]),
  [],
  'La recuperación automática debe conservar separadas asociaciones legacy ambiguas.'
);

const exactProjectInvitation = {
  ...legacyProjectInvitations[0],
  invitationId: 'inv_project_exact',
  governanceSpaceId: 'space_portfolio_legacy'
};
assert.deepEqual(
  relatedPortfolioProjectInvitations([legacyPortfolioInvitation, secondLegacyPortfolio, exactProjectInvitation], legacyPortfolioInvitation)
    .map((item) => item.invitationId),
  ['inv_project_exact'],
  'Una relación explícita por governanceSpaceId siempre debe prevalecer aun si existen otros paneles.'
);

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
