export const ADMIN_PROJECT_PERMISSION_PROFILE = 'admin-project-v1';

function normalize(value = '', max = 80) {
  return String(value || '').trim().toLowerCase().slice(0, max);
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
    if (entityType === 'admin.project') return 'owner';
    if (entityType === 'admin.projection-link') return 'projection';
    if (['entity.delete', 'entity.trash', 'entity.restore', 'entity.purge'].includes(operationType) && entityType === 'admin.projection') return 'delete_projection';
    if (entityType === 'admin.projection') return 'projection';
  }

  if (['entity.delete', 'entity.trash', 'entity.restore', 'entity.purge'].includes(operationType)) return 'delete';
  return 'add';
}

export function memberAllowsDurableOperation(scope = {}, membership = {}, operation = {}) {
  const permissions = normalizedPermissions(membership);
  if (!permissions.includes('read')) return false;
  if (membership?.role === 'owner') return true;

  const required = requiredPermissionForDurableOperation(scope, operation);
  if (required === 'owner') return false;
  if (required === 'delete_projection') {
    return permissions.includes('write')
      || (permissions.includes('delete') && permissions.includes('projection'));
  }
  if (permissions.includes(required)) return true;
  return permissions.includes('write') && ['add', 'delete', 'projection'].includes(required);
}
