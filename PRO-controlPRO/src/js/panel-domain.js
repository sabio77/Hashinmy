export const PANEL_INVITATION_RESOURCE_TYPE = 'admin.panel';

function clean(value = '', max = 220) {
  return String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

function memberProfile(space = {}, userId = '') {
  return (Array.isArray(space?.members) ? space.members : [])
    .find((member) => clean(member?.userId, 140) === clean(userId, 140))?.profile || null;
}

function projectUpdatedAt(projectData = {}) {
  return clean(projectData?.project?.updatedAt || projectData?.space?.updatedAt || '', 80);
}

export function panelIdForOwner(ownerUserId = '') {
  const owner = clean(ownerUserId, 140);
  return owner ? `owner:${owner}` : '';
}

export function buildProjectPanels(projectValues = [], currentUser = {}, options = {}) {
  const currentUserId = clean(currentUser?.userId, 140);
  const byOwner = new Map();
  for (const data of Array.isArray(projectValues) ? projectValues : []) {
    const ownerUserId = clean(data?.space?.ownerUserId, 140);
    if (!ownerUserId || data?.project?.isTrashed) continue;
    let panel = byOwner.get(ownerUserId);
    if (!panel) {
      const profile = memberProfile(data.space, ownerUserId);
      panel = {
        panelId: panelIdForOwner(ownerUserId),
        ownerUserId,
        ownerProfile: profile,
        isOwn: Boolean(currentUserId && ownerUserId === currentUserId),
        projects: [],
        pendingSpaces: [],
        memberUserIds: new Set(),
        updatedAt: ''
      };
      byOwner.set(ownerUserId, panel);
    }
    panel.projects.push(data);
    panel.updatedAt = [panel.updatedAt, projectUpdatedAt(data)].sort().at(-1) || '';
    for (const member of Array.isArray(data?.space?.members) ? data.space.members : []) {
      const userId = clean(member?.userId, 140);
      if (userId) panel.memberUserIds.add(userId);
    }
  }

  const loadedSpaceIds = new Set((Array.isArray(projectValues) ? projectValues : [])
    .map((data) => clean(data?.space?.spaceId, 140))
    .filter(Boolean));
  for (const space of Array.isArray(options?.spaces) ? options.spaces : []) {
    const spaceId = clean(space?.spaceId, 140);
    const ownerUserId = clean(space?.ownerUserId, 140);
    if (!spaceId || !ownerUserId || loadedSpaceIds.has(spaceId)) continue;
    const currentMember = (Array.isArray(space?.members) ? space.members : [])
      .find((member) => clean(member?.userId, 140) === currentUserId);
    const currentPermissions = Array.isArray(currentMember?.permissions) ? currentMember.permissions : [];
    if (currentUserId && !currentMember) continue;
    if (currentMember && currentMember.role !== 'owner' && !currentPermissions.includes('read')) continue;

    let panel = byOwner.get(ownerUserId);
    if (!panel) {
      panel = {
        panelId: panelIdForOwner(ownerUserId),
        ownerUserId,
        ownerProfile: memberProfile(space, ownerUserId),
        isOwn: Boolean(currentUserId && ownerUserId === currentUserId),
        projects: [],
        pendingSpaces: [],
        memberUserIds: new Set(),
        updatedAt: ''
      };
      byOwner.set(ownerUserId, panel);
    }
    if (!Array.isArray(panel.pendingSpaces)) panel.pendingSpaces = [];
    panel.pendingSpaces.push(space);
    panel.updatedAt = [panel.updatedAt, clean(space?.updatedAt || space?.createdAt || '', 80)].sort().at(-1) || '';
    for (const member of Array.isArray(space?.members) ? space.members : []) {
      const userId = clean(member?.userId, 140);
      if (userId) panel.memberUserIds.add(userId);
    }
  }

  if (currentUserId && !byOwner.has(currentUserId)) {
    byOwner.set(currentUserId, {
      panelId: panelIdForOwner(currentUserId),
      ownerUserId: currentUserId,
      ownerProfile: {
        displayName: clean(currentUser?.displayName, 140),
        email: clean(currentUser?.email, 254)
      },
      isOwn: true,
      projects: [],
      pendingSpaces: [],
      memberUserIds: new Set([currentUserId]),
      updatedAt: ''
    });
  }

  return [...byOwner.values()]
    .map((panel) => ({
      ...panel,
      projects: panel.projects.sort((a, b) => projectUpdatedAt(b).localeCompare(projectUpdatedAt(a))),
      pendingSpaces: (Array.isArray(panel.pendingSpaces) ? panel.pendingSpaces : [])
        .sort((a, b) => clean(b?.updatedAt || b?.createdAt || '', 80).localeCompare(clean(a?.updatedAt || a?.createdAt || '', 80))),
      memberUserIds: [...panel.memberUserIds]
    }))
    .sort((a, b) => Number(b.isOwn) - Number(a.isOwn) || b.updatedAt.localeCompare(a.updatedAt) || a.ownerUserId.localeCompare(b.ownerUserId));
}

export function panelDisplayName(panel = {}, currentUser = {}) {
  if (panel?.isOwn) return clean(currentUser?.displayName || currentUser?.email, 160) || 'Mi panel';
  return clean(panel?.ownerProfile?.displayName || panel?.ownerProfile?.email, 160) || 'Panel compartido';
}

export function aggregatePanelMembers(panel = {}) {
  const members = new Map();
  const spaces = [
    ...(Array.isArray(panel?.projects) ? panel.projects.map((projectData) => projectData?.space) : []),
    ...(Array.isArray(panel?.pendingSpaces) ? panel.pendingSpaces : [])
  ];
  const seenSpaceIds = new Set();
  for (const space of spaces) {
    const spaceId = clean(space?.spaceId, 140);
    if (!spaceId || seenSpaceIds.has(spaceId)) continue;
    seenSpaceIds.add(spaceId);
    for (const member of Array.isArray(space?.members) ? space.members : []) {
      const userId = clean(member?.userId, 140);
      if (!userId) continue;
      let aggregate = members.get(userId);
      if (!aggregate) {
        aggregate = {
          userId,
          role: member.role === 'owner' ? 'owner' : 'member',
          profile: member.profile || null,
          permissions: new Set(),
          projectSpaceIds: []
        };
        members.set(userId, aggregate);
      }
      if (!aggregate.profile && member.profile) aggregate.profile = member.profile;
      if (member.role === 'owner') aggregate.role = 'owner';
      for (const permission of Array.isArray(member.permissions) ? member.permissions : []) aggregate.permissions.add(clean(permission, 24));
      aggregate.projectSpaceIds.push(spaceId);
    }
  }
  return [...members.values()].map((member) => ({
    ...member,
    permissions: [...member.permissions].filter(Boolean),
    projectSpaceIds: [...new Set(member.projectSpaceIds.filter(Boolean))]
  }));
}

export function groupPendingInvitations(invitations = []) {
  const pending = (Array.isArray(invitations) ? invitations : []).filter((invitation) => invitation?.status === 'pending');
  const groups = new Map();
  for (const invitation of pending) {
    const resourceType = clean(invitation?.resourceType, 80).toLowerCase() || 'generic';
    const inviterUserId = clean(invitation?.inviterUserId, 140);
    const isPanel = resourceType === PANEL_INVITATION_RESOURCE_TYPE && inviterUserId;
    const key = isPanel ? `panel:${inviterUserId}` : `invitation:${clean(invitation?.invitationId, 160)}`;
    let group = groups.get(key);
    if (!group) {
      group = {
        key,
        kind: isPanel ? 'panel' : 'project',
        inviterUserId,
        inviter: invitation?.inviter || null,
        invitations: []
      };
      groups.set(key, group);
    }
    group.invitations.push(invitation);
  }
  return [...groups.values()];
}
