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
  if (status === 'rejected') return 'reject';
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
