export const ADMIN_PROJECT_PERMISSION_PROFILE = 'admin-project-v1';

function normalize(value = '', max = 80) {
  return String(value || '').trim().toLowerCase().slice(0, max);
}

const INDIVIDUAL_EDIT_WINDOW_MS = 60 * 60 * 1000;
const TRACKED_ENTITY_TYPES = new Set(['admin.purchase', 'admin.income', 'admin.projection', 'admin.projection-link']);

function normalizedRole(membership = {}) {
  const role = normalize(membership?.role, 32);
  return ['owner', 'manager', 'admin', 'individual', 'member'].includes(role) ? role : 'member';
}

function normalizedPermissions(membership = {}) {
  return Array.from(new Set((Array.isArray(membership?.permissions) ? membership.permissions : [])
    .map((permission) => normalize(permission, 24))
    .filter(Boolean)));
}

export function usesAdminProjectPermissionProfile(scope = {}) {
  const resourceType = normalize(scope?.resourceType, 80);
  const permissionProfile = normalize(scope?.permissionProfile, 80);
  return resourceType === 'admin.project'
    && (!permissionProfile || permissionProfile === ADMIN_PROJECT_PERMISSION_PROFILE);
}

export function requiredPermissionForDurableOperation(scope = {}, operation = {}) {
  const operationType = normalize(operation?.type, 48);
  const entityType = normalize(operation?.entityType, 80);

  if (usesAdminProjectPermissionProfile(scope)) {
    if (entityType === 'admin.project') return ['entity.delete', 'entity.trash', 'entity.purge'].includes(operationType) ? 'delete_project' : 'edit_project';
    if (entityType === 'admin.projection-link') return 'projection';
    if (['entity.delete', 'entity.trash', 'entity.restore', 'entity.purge'].includes(operationType) && entityType === 'admin.projection') return 'delete_projection';
    if (entityType === 'admin.projection') return 'projection';
  }

  if (['entity.delete', 'entity.trash', 'entity.restore', 'entity.purge'].includes(operationType)) return 'delete';
  return 'add';
}

export function memberAllowsDurableOperation(scope = {}, membership = {}, operation = {}, options = {}) {
  const role = normalizedRole(membership);
  const permissions = ['owner', 'manager', 'admin'].includes(role)
    ? ['read', 'add', 'delete', 'projection', 'invite', 'write']
    : role === 'individual' ? ['read', 'add', 'delete', 'projection'] : normalizedPermissions(membership);
  if (!permissions.includes('read')) return false;

  const required = requiredPermissionForDurableOperation(scope, operation);
  if (required === 'delete_project') return ['owner', 'manager'].includes(role);
  if (required === 'edit_project') return ['owner', 'manager', 'admin'].includes(role);
  if (required === 'owner') return role === 'owner';
  if (role === 'individual' && TRACKED_ENTITY_TYPES.has(normalize(operation?.entityType, 80))) {
    const actorUserId = String(options.actorUserId || membership?.userId || '').trim();
    const ownerUserId = String(operation?.authorship?.ownerUserId || operation?.authorship?.createdByUserId || '').trim();
    const createdAtMs = Date.parse(operation?.authorship?.createdAt || '');
    if (!actorUserId || ownerUserId !== actorUserId || !Number.isFinite(createdAtMs)) return false;
    if (Date.now() - createdAtMs > INDIVIDUAL_EDIT_WINDOW_MS || createdAtMs > Date.now() + (5 * 60 * 1000)) return false;
  }
  if (required === 'delete_projection') {
    return permissions.includes('write')
      || (permissions.includes('delete') && permissions.includes('projection'));
  }
  if (permissions.includes(required)) return true;
  return permissions.includes('write') && ['add', 'delete', 'projection'].includes(required);
}

export function lifecycleReplicationPairAuthorized(sourceMembership = {}, targetMembership = {}, action = '') {
  const cleanAction = normalize(action, 24);
  if (!['trash', 'purge'].includes(cleanAction)) return false;
  const sourcePermissions = normalizedPermissions(sourceMembership);
  const targetPermissions = normalizedPermissions(targetMembership);
  return ['owner', 'manager'].includes(normalizedRole(sourceMembership))
    && sourcePermissions.includes('read')
    && targetPermissions.includes('read')
    && usesAdminProjectPermissionProfile(sourceMembership)
    && usesAdminProjectPermissionProfile(targetMembership);
}
