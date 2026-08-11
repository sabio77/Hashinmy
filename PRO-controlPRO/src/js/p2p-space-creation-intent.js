const MAX_TEXT_ID = 180;

function cleanText(value = '', maxLength = MAX_TEXT_ID) {
  return String(value ?? '').trim().slice(0, maxLength);
}

function safeObject(value = {}) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

export function normalizeSpaceCreationIntent(input = {}) {
  const source = safeObject(input);
  const requestId = cleanText(source.requestId);
  const operationId = cleanText(source.operationId);
  const resourceType = cleanText(source.resourceType || 'generic', 120);
  const permissionProfile = cleanText(source.permissionProfile, 80).toLowerCase();
  const entityType = cleanText(source.entityType, 160);
  const entityId = cleanText(source.entityId, 180);
  const value = safeObject(source.value);
  if (!requestId || !operationId || !entityType || !entityId) return null;
  return {
    requestId,
    operationId,
    resourceType,
    permissionProfile,
    entityType,
    entityId,
    spaceId: cleanText(source.spaceId),
    value,
    createdAt: cleanText(source.createdAt || new Date().toISOString(), 64),
    updatedAt: cleanText(source.updatedAt || new Date().toISOString(), 64)
  };
}

export function normalizeSpaceCreationIntents(input = []) {
  const unique = new Map();
  for (const candidate of Array.isArray(input) ? input : []) {
    const normalized = normalizeSpaceCreationIntent(candidate);
    if (!normalized) continue;
    const current = unique.get(normalized.requestId);
    const currentUpdatedAt = Date.parse(current?.updatedAt || '') || 0;
    const nextUpdatedAt = Date.parse(normalized.updatedAt || '') || 0;
    if (!current || nextUpdatedAt >= currentUpdatedAt) unique.set(normalized.requestId, normalized);
  }
  return [...unique.values()].sort((left, right) => {
    const leftTime = Date.parse(left.createdAt || '') || 0;
    const rightTime = Date.parse(right.createdAt || '') || 0;
    return leftTime - rightTime || left.requestId.localeCompare(right.requestId);
  });
}

function requiredAdapter(adapters = {}, name = '') {
  const adapter = adapters?.[name];
  if (typeof adapter !== 'function') throw new Error(`Falta el adaptador ${name} para recuperar la creación del espacio.`);
  return adapter;
}

export async function completeSpaceCreationIntent(input = {}, adapters = {}) {
  let intent = normalizeSpaceCreationIntent(input);
  if (!intent) throw new Error('La intención de creación del espacio está incompleta o dañada.');

  const saveIntent = requiredAdapter(adapters, 'saveIntent');
  const removeIntent = requiredAdapter(adapters, 'removeIntent');
  const createSpace = requiredAdapter(adapters, 'createSpace');
  const listEntities = requiredAdapter(adapters, 'listEntities');
  const putEntity = requiredAdapter(adapters, 'putEntity');

  intent = normalizeSpaceCreationIntent(await saveIntent(intent) || intent);
  if (!intent) throw new Error('No se pudo conservar la intención de creación antes de iniciar el commit remoto.');

  if (!intent.spaceId) {
    const created = await createSpace({
      resourceType: intent.resourceType,
      permissionProfile: intent.permissionProfile,
      requestId: intent.requestId
    });
    const spaceId = cleanText(created?.space?.spaceId || created?.spaceId || '');
    if (!spaceId) throw new Error('El backend confirmó la creación, pero no devolvió el identificador del espacio.');
    intent = normalizeSpaceCreationIntent({ ...intent, spaceId, updatedAt: new Date().toISOString() });
    intent = normalizeSpaceCreationIntent(await saveIntent(intent) || intent);
    if (!intent?.spaceId) throw new Error('No se pudo conservar el espacio resuelto para completar la creación.');
  }

  const entities = await listEntities(intent.spaceId);
  const existing = (Array.isArray(entities) ? entities : []).find((entity) => (
    entity?.entityType === intent.entityType
    && entity?.entityId === intent.entityId
    && !entity?.deleted
  ));

  let publishResult = null;
  let queued = false;
  if (!existing) {
    try {
      publishResult = await putEntity(
        intent.spaceId,
        intent.entityType,
        intent.entityId,
        intent.value,
        { operationId: intent.operationId }
      );
    } catch (error) {
      if (!error?.p2pQueued) throw error;
      queued = true;
      publishResult = { queued: true, operationId: intent.operationId, error };
    }
  }

  await removeIntent(intent.requestId);
  return {
    intent,
    spaceId: intent.spaceId,
    operationId: intent.operationId,
    existing: Boolean(existing),
    queued,
    publishResult
  };
}
