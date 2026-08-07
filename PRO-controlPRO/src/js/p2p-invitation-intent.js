const INVITATION_QUERY_PARAM = 'p2pInvitation';
const MAX_INVITATION_ID_LENGTH = 160;

export function normalizeInvitationIntentId(value = '') {
  const normalized = String(value || '').trim();
  if (!normalized || normalized.length > MAX_INVITATION_ID_LENGTH) return '';
  return normalized;
}

export function readInvitationIntent(locationLike = globalThis.location) {
  try {
    const href = typeof locationLike === 'string' ? locationLike : locationLike?.href;
    if (!href) return '';
    return normalizeInvitationIntentId(new URL(href, 'http://localhost/').searchParams.get(INVITATION_QUERY_PARAM));
  } catch {
    return '';
  }
}

export function invitationIntentFromServiceWorkerMessage(message = {}) {
  if (message?.type !== 'P2P_PUSH_RECEIVED') return '';
  const payload = message?.payload && typeof message.payload === 'object' ? message.payload : {};
  if (payload.type !== 'p2p.invitation') return '';
  return normalizeInvitationIntentId(payload.invitationId);
}

export function resolveCanonicalInvitationDecision(invitation = {}, requestedDecision = '') {
  const status = String(invitation?.status || '').trim().toLowerCase();
  if (status === 'accepted') return 'accept';
  if (status === 'rejected' || status === 'cancelled') return 'reject';
  const requested = String(requestedDecision || '').trim().toLowerCase();
  return requested === 'reject' ? 'reject' : 'accept';
}

export function findPendingInvitation(invitations = [], invitationId = '') {
  const cleanInvitationId = normalizeInvitationIntentId(invitationId);
  if (!cleanInvitationId || !Array.isArray(invitations)) return null;
  return invitations.find((invitation) => (
    normalizeInvitationIntentId(invitation?.invitationId) === cleanInvitationId
    && invitation?.status === 'pending'
  )) || null;
}


function normalizedInvitationRole(value = '') {
  const role = String(value || '').trim().toLowerCase();
  return ['owner', 'manager', 'admin', 'individual', 'member'].includes(role) ? role : 'member';
}

function normalizedInvitationScope(value = '') {
  return String(value || '').trim().toLowerCase() === 'portfolio' ? 'portfolio' : 'project';
}

export function invitationGovernanceSpaceId(invitation = {}, portfolioResourceType = 'admin.portfolio') {
  return String(invitation?.resourceType === portfolioResourceType
    ? invitation?.spaceId || ''
    : invitation?.governanceSpaceId || '').trim();
}

function samePortfolioGrant(left = {}, right = {}) {
  return String(left?.inviterUserId || '').trim() === String(right?.inviterUserId || '').trim()
    && normalizedInvitationRole(left?.role) === normalizedInvitationRole(right?.role)
    && normalizedInvitationScope(left?.accessScope) === 'portfolio'
    && normalizedInvitationScope(right?.accessScope) === 'portfolio';
}

export function relatedPortfolioProjectInvitations(invitations = [], portfolioInvitation = {}, options = {}) {
  const portfolioResourceType = String(options.portfolioResourceType || 'admin.portfolio').trim() || 'admin.portfolio';
  const allPending = (Array.isArray(invitations) ? invitations : []).filter((invitation) => invitation?.status === 'pending');
  if (portfolioInvitation?.resourceType !== portfolioResourceType || portfolioInvitation?.status !== 'pending') return [];
  const portfolioSpaceId = invitationGovernanceSpaceId(portfolioInvitation, portfolioResourceType);
  if (!portfolioSpaceId) return [];

  const matchingParents = allPending.filter((invitation) => (
    invitation?.resourceType === portfolioResourceType
    && samePortfolioGrant(invitation, portfolioInvitation)
  ));
  const legacyAssociationIsUnambiguous = matchingParents.length === 1
    && String(matchingParents[0]?.invitationId || '').trim() === String(portfolioInvitation?.invitationId || '').trim();

  return allPending.filter((invitation) => {
    if (invitation?.resourceType === portfolioResourceType || !samePortfolioGrant(invitation, portfolioInvitation)) return false;
    const governanceSpaceId = invitationGovernanceSpaceId(invitation, portfolioResourceType);
    if (governanceSpaceId) return governanceSpaceId === portfolioSpaceId;
    return legacyAssociationIsUnambiguous;
  });
}

export function autoAcceptablePortfolioProjectInvitations(invitations = [], portfolioAuthorizations = [], options = {}) {
  const portfolioResourceType = String(options.portfolioResourceType || 'admin.portfolio').trim() || 'admin.portfolio';
  const authorizations = (Array.isArray(portfolioAuthorizations) ? portfolioAuthorizations : [])
    .map((authorization) => ({
      spaceId: String(authorization?.spaceId || '').trim(),
      role: normalizedInvitationRole(authorization?.role),
      authorizedInviterUserIds: new Set((authorization?.authorizedInviterUserIds || [])
        .map((userId) => String(userId || '').trim())
        .filter(Boolean))
    }))
    .filter((authorization) => authorization.spaceId && authorization.authorizedInviterUserIds.size);

  return (Array.isArray(invitations) ? invitations : []).filter((invitation) => {
    if (invitation?.status !== 'pending'
      || invitation?.resourceType === portfolioResourceType
      || normalizedInvitationScope(invitation?.accessScope) !== 'portfolio') return false;
    const inviterUserId = String(invitation?.inviterUserId || '').trim();
    const role = normalizedInvitationRole(invitation?.role);
    const governanceSpaceId = invitationGovernanceSpaceId(invitation, portfolioResourceType);
    const candidates = authorizations.filter((authorization) => (
      authorization.authorizedInviterUserIds.has(inviterUserId)
      && authorization.role === role
      && (!governanceSpaceId || authorization.spaceId === governanceSpaceId)
    ));
    return candidates.length === 1;
  });
}

export function clearInvitationIntentFromUrl({
  locationLike = globalThis.location,
  historyLike = globalThis.history
} = {}) {
  try {
    const href = typeof locationLike === 'string' ? locationLike : locationLike?.href;
    if (!href || typeof historyLike?.replaceState !== 'function') return false;
    const url = new URL(href, 'http://localhost/');
    if (!url.searchParams.has(INVITATION_QUERY_PARAM)) return false;
    url.searchParams.delete(INVITATION_QUERY_PARAM);
    const target = `${url.pathname}${url.search}${url.hash}` || './';
    historyLike.replaceState(historyLike.state ?? null, '', target);
    return true;
  } catch {
    return false;
  }
}

export const P2P_INVITATION_QUERY_PARAM = INVITATION_QUERY_PARAM;
