export const PROJECT_ENTITY_TYPE = 'admin.project';
export const PROJECT_ENTITY_ID = 'project';
export const PURCHASE_ENTITY_TYPE = 'admin.purchase';
export const INCOME_ENTITY_TYPE = 'admin.income';
export const PROJECTION_ENTITY_TYPE = 'admin.projection';
export const PROJECTION_LINK_ENTITY_TYPE = 'admin.projection-link';
export const ADMIN_PROJECT_PERMISSION_PROFILE = 'admin-project-v1';

export const COLLABORATION_PERMISSIONS = Object.freeze(['read', 'add', 'delete', 'projection', 'invite']);
export const COLLABORATION_ROLES = Object.freeze(['manager', 'admin', 'individual', 'member']);
export const INDIVIDUAL_EDIT_WINDOW_MS = 60 * 60 * 1000;
export const MAX_MONEY_VALUE = Number.MAX_SAFE_INTEGER;
const MAX_MONEY_BIGINT = BigInt(MAX_MONEY_VALUE);
const MIN_MONEY_BIGINT = -MAX_MONEY_BIGINT;

export function createLocalId(prefix = 'item') {
  const random = globalThis.crypto?.randomUUID?.().replace(/-/g, '')
    || `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
  return `${String(prefix || 'item').replace(/[^a-z0-9_-]/gi, '').slice(0, 24)}_${random}`;
}

export function cleanText(value = '', maxLength = 300) {
  return String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

export function localDateValue(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const year = String(date.getFullYear()).padStart(4, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function normalizeProjectFilterText(value = '') {
  return cleanText(value, 1200)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function projectMatchesFilter(project = {}, query = '') {
  const tokens = normalizeProjectFilterText(query).split(' ').filter(Boolean);
  if (!tokens.length) return true;
  const searchable = normalizeProjectFilterText([
    project?.name,
    project?.description,
    project?.address
  ].filter(Boolean).join(' '));
  return tokens.every((token) => searchable.includes(token));
}

function normalizeMoneyString(value = '') {
  const raw = String(value ?? '').trim();
  if (!raw) return '';

  // Los inputs HTML de tipo number pueden producir notación científica. No se
  // deben eliminar las letras "e/E", porque "1e6" terminaría convertido en 16.
  if (/^[+-]?(?:\d+(?:[.,]\d+)?|[.,]\d+)[eE][+-]?\d+$/.test(raw)) {
    return raw.replace(',', '.');
  }
  if (/[eE]/.test(raw)) return '';

  const compact = raw.replace(/\s+/g, '').replace(/[^0-9,.-]/g, '');
  if (!compact || !/^[+-]?[0-9.,]+$/.test(compact)) return '';
  const sign = compact.startsWith('-') ? '-' : '';
  const unsigned = compact.replace(/^[+-]/, '');
  if (!unsigned || /[+-]/.test(unsigned)) return '';

  const dots = (unsigned.match(/\./g) || []).length;
  const commas = (unsigned.match(/,/g) || []).length;
  let decimalSeparator = '';

  if (dots && commas) {
    decimalSeparator = unsigned.lastIndexOf('.') > unsigned.lastIndexOf(',') ? '.' : ',';
    const thousandsSeparator = decimalSeparator === '.' ? ',' : '.';
    if (unsigned.split(decimalSeparator).length !== 2) return '';
    const [integerPart, decimalPart] = unsigned.split(decimalSeparator);
    const integerGroups = integerPart.split(thousandsSeparator);
    const validThousands = integerGroups.length === 1 || (
      integerGroups[0].length >= 1
      && integerGroups[0].length <= 3
      && integerGroups.slice(1).every((group) => group.length === 3)
    );
    if (!validThousands || !/^\d+$/.test(decimalPart)) return '';
  } else {
    const separator = dots ? '.' : commas ? ',' : '';
    if (separator) {
      const groups = unsigned.split(separator);
      const thousandsOnly = groups.length > 1
        && groups[0].length >= 1
        && groups[0].length <= 3
        && groups.slice(1).every((group) => group.length === 3);
      if (!thousandsOnly) {
        if (groups.length !== 2 || !groups.every((group, index) => index === 0 ? /^\d*$/.test(group) : /^\d+$/.test(group))) return '';
        decimalSeparator = separator;
      }
    }
  }

  let normalized = unsigned;
  if (decimalSeparator) {
    const decimalIndex = unsigned.lastIndexOf(decimalSeparator);
    const integerPart = unsigned.slice(0, decimalIndex).replace(/[.,]/g, '') || '0';
    const decimalPart = unsigned.slice(decimalIndex + 1).replace(/[.,]/g, '');
    normalized = `${integerPart}.${decimalPart}`;
  } else {
    normalized = unsigned.replace(/[.,]/g, '');
  }
  return `${sign}${normalized}`;
}

export function moneyValue(value = 0) {
  const normalized = typeof value === 'string' ? normalizeMoneyString(value) : value;
  const amount = Number(normalized);
  if (!Number.isFinite(amount) || amount < 0) return 0;
  const rounded = Math.round(amount);
  return Number.isSafeInteger(rounded) && rounded <= MAX_MONEY_VALUE ? rounded : 0;
}

function exactMoneyInteger(value = 0) {
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number' && Number.isSafeInteger(value)) return BigInt(value);
  return BigInt(moneyValue(value));
}

function compactExactMoney(value = 0n) {
  return value <= MAX_MONEY_BIGINT && value >= MIN_MONEY_BIGINT ? Number(value) : value;
}

export function sumMoneyValues(values = [], selector = (value) => value) {
  const entries = Array.isArray(values) ? values : [];
  const total = entries.reduce((sum, entry, index) => sum + exactMoneyInteger(selector(entry, index)), 0n);
  return compactExactMoney(total);
}

export function addMoneyValues(left = 0, right = 0) {
  return compactExactMoney(exactMoneyInteger(left) + exactMoneyInteger(right));
}

export function subtractMoneyValues(left = 0, right = 0) {
  return compactExactMoney(exactMoneyInteger(left) - exactMoneyInteger(right));
}

export function absoluteMoneyValue(value = 0) {
  const exact = exactMoneyInteger(value);
  return compactExactMoney(exact < 0n ? -exact : exact);
}

function moneyPercentage(numerator = 0, denominator = 0) {
  const total = exactMoneyInteger(denominator);
  if (total <= 0n) return 0;
  const used = exactMoneyInteger(numerator);
  const scaledPercent = (used * 1_000_000n) / total;
  return Math.min(999, Number(scaledPercent) / 10_000);
}

export function normalizeProjectInput(input = {}) {
  return {
    name: cleanText(input.name, 120),
    description: cleanText(input.description, 900),
    address: cleanText(input.address, 240),
    initialBudget: moneyValue(input.initialBudget),
    portfolioSpaceId: cleanText(input.portfolioSpaceId, 140),
    portfolioOwnerUserId: cleanText(input.portfolioOwnerUserId, 140),
    createdAt: cleanText(input.createdAt, 60) || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

export function normalizePurchaseInput(input = {}) {
  return {
    description: cleanText(input.description, 360),
    invoiceNumber: cleanText(input.invoiceNumber, 120),
    amount: moneyValue(input.amount),
    projectionId: cleanText(input.projectionId, 180),
    purchasedAt: cleanText(input.purchasedAt, 24) || localDateValue(),
    createdByUserId: cleanText(input.createdByUserId, 140),
    createdAt: cleanText(input.createdAt, 60) || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

export function normalizeIncomeInput(input = {}) {
  return {
    description: cleanText(input.description, 360),
    amount: moneyValue(input.amount),
    receivedAt: cleanText(input.receivedAt, 24) || localDateValue(),
    createdByUserId: cleanText(input.createdByUserId, 140),
    createdAt: cleanText(input.createdAt, 60) || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

export function normalizeProjectionInput(input = {}) {
  return {
    description: cleanText(input.description, 360),
    projectedAmount: moneyValue(input.projectedAmount),
    expectedAt: cleanText(input.expectedAt, 24),
    status: ['pending', 'completed'].includes(input.status) ? input.status : 'pending',
    actualPurchaseId: cleanText(input.actualPurchaseId, 180),
    actualAmount: moneyValue(input.actualAmount),
    createdByUserId: cleanText(input.createdByUserId, 140),
    createdAt: cleanText(input.createdAt, 60) || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

export function normalizeProjectionLinkInput(input = {}) {
  return {
    purchaseId: cleanText(input.purchaseId, 180),
    projectionId: cleanText(input.projectionId, 180),
    active: input.active !== false && Boolean(cleanText(input.projectionId, 180)),
    createdByUserId: cleanText(input.createdByUserId, 140),
    createdAt: cleanText(input.createdAt, 60) || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

function valuesEqual(left, right) {
  if (Object.is(left, right)) return true;
  if (left === null || right === null || typeof left !== 'object' || typeof right !== 'object') return false;
  if (Array.isArray(left) !== Array.isArray(right)) return false;
  if (Array.isArray(left)) {
    return left.length === right.length && left.every((value, index) => valuesEqual(value, right[index]));
  }
  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();
  return leftKeys.length === rightKeys.length
    && leftKeys.every((key, index) => key === rightKeys[index] && valuesEqual(left[key], right[key]));
}

export function buildConcurrentSafePatch(previous = {}, next = {}, fields = []) {
  const patch = {};
  const expected = {};
  for (const rawField of Array.isArray(fields) ? fields : []) {
    const field = cleanText(rawField, 80);
    if (!field || valuesEqual(previous?.[field], next?.[field])) continue;
    patch[field] = next?.[field];
    expected[field] = previous?.[field];
  }
  if (Object.keys(patch).length && Object.prototype.hasOwnProperty.call(next || {}, 'updatedAt')) {
    patch.updatedAt = next.updatedAt;
  }
  return {
    patch,
    expected,
    changedFields: Object.keys(expected),
    changed: Object.keys(expected).length > 0
  };
}

export function activeEntityValue(entity = null) {
  if (!entity || entity.deleted) return null;
  return entity.value && typeof entity.value === 'object' ? entity.value : null;
}

export function isTrashedValue(value = null) {
  return Boolean(cleanText(value && typeof value === 'object' ? value.trashedAt : '', 60));
}

export function entitiesByType(entities = [], entityType = '', options = {}) {
  const includeTrashed = options.includeTrashed === true;
  const onlyTrashed = options.onlyTrashed === true;
  return (Array.isArray(entities) ? entities : [])
    .filter((entity) => {
      if (entity?.entityType !== entityType || entity.deleted) return false;
      const value = activeEntityValue(entity);
      if (!value) return false;
      const trashed = isTrashedValue(value);
      if (onlyTrashed) return trashed;
      return includeTrashed || !trashed;
    })
    .map((entity) => ({
      id: entity.entityId,
      ...activeEntityValue(entity),
      isTrashed: isTrashedValue(activeEntityValue(entity)),
      _entity: entity
    }))
    .sort((left, right) => String(right.trashedAt || right.createdAt || right.updatedAt || '').localeCompare(String(left.trashedAt || left.createdAt || left.updatedAt || '')));
}

export function projectRecord(space = {}, entities = []) {
  const entity = (Array.isArray(entities) ? entities : []).find((candidate) => (
    candidate?.entityType === PROJECT_ENTITY_TYPE
    && candidate?.entityId === PROJECT_ENTITY_ID
    && !candidate.deleted
  ));
  const value = activeEntityValue(entity) || {};
  return {
    spaceId: space.spaceId || '',
    ownerUserId: space.ownerUserId || '',
    members: Array.isArray(space.members) ? space.members : [],
    name: cleanText(value.name || space.title || 'Proyecto sin nombre', 120),
    description: cleanText(value.description || '', 900),
    address: cleanText(value.address || '', 240),
    initialBudget: moneyValue(value.initialBudget),
    createdAt: value.createdAt || space.createdAt || '',
    updatedAt: value.updatedAt || space.updatedAt || '',
    trashedAt: cleanText(value.trashedAt || '', 60),
    trashedBy: cleanText(value.trashedBy || '', 180),
    restoredAt: cleanText(value.restoredAt || '', 60),
    isTrashed: isTrashedValue(value),
    loaded: Boolean(entity),
    _entity: entity || null
  };
}

export function resolvePurchaseProjectionLinks(purchases = [], projectionLinks = [], options = {}) {
  const strictLinks = options.strictLinks === true;
  const linksByPurchaseId = new Map();
  for (const link of Array.isArray(projectionLinks) ? projectionLinks : []) {
    const purchaseId = cleanText(link?.purchaseId || link?.id, 180);
    if (!purchaseId) continue;
    linksByPurchaseId.set(purchaseId, link);
  }
  return (Array.isArray(purchases) ? purchases : []).map((purchase) => {
    const link = linksByPurchaseId.get(cleanText(purchase?.id, 180));
    const linkedProjectionId = link?.active === false ? '' : cleanText(link?.projectionId, 180);
    const legacyProjectionId = strictLinks ? '' : cleanText(purchase?.projectionId, 180);
    return {
      ...purchase,
      projectionId: linkedProjectionId || legacyProjectionId,
      projectionLink: link || null
    };
  });
}

export function resolveProjectionActuals(projections = [], purchases = [], projectionLinks = [], options = {}) {
  const safePurchases = resolvePurchaseProjectionLinks(purchases, projectionLinks, options);
  return (Array.isArray(projections) ? projections : []).map((projection) => {
    const linkedPurchases = safePurchases.filter((purchase) => purchase.projectionId === projection.id);
    const projectedAmount = moneyValue(projection.projectedAmount);
    if (!linkedPurchases.length) {
      return {
        ...projection,
        status: 'pending',
        actualPurchaseId: '',
        actualPurchaseIds: [],
        actualAmount: 0,
        varianceAmount: 0,
        varianceStatus: 'pending'
      };
    }
    const actualAmount = sumMoneyValues(linkedPurchases, (purchase) => purchase.amount);
    const varianceAmount = subtractMoneyValues(actualAmount, projectedAmount);
    return {
      ...projection,
      status: 'completed',
      actualPurchaseId: linkedPurchases[0].id || '',
      actualPurchaseIds: linkedPurchases.map((purchase) => purchase.id).filter(Boolean),
      actualAmount,
      varianceAmount,
      varianceStatus: varianceAmount > 0 ? 'over' : varianceAmount < 0 ? 'under' : 'exact'
    };
  });
}

export function calculateProjectMetrics(project = {}, purchases = [], incomes = [], projections = []) {
  const initialBudget = moneyValue(project.initialBudget);
  const totalPurchases = sumMoneyValues(purchases, (item) => item.amount);
  const totalIncomes = sumMoneyValues(incomes, (item) => item.amount);
  const totalCapital = addMoneyValues(initialBudget, totalIncomes);
  const availableCapital = subtractMoneyValues(totalCapital, totalPurchases);
  const pendingProjections = projections.filter((item) => item.status !== 'completed');
  const completedProjections = projections.filter((item) => item.status === 'completed');
  const projectedPending = sumMoneyValues(pendingProjections, (item) => item.projectedAmount);
  const projectedCompleted = sumMoneyValues(completedProjections, (item) => item.projectedAmount);
  const actualAgainstProjection = sumMoneyValues(completedProjections, (item) => item.actualAmount);
  const projectionVariance = subtractMoneyValues(actualAgainstProjection, projectedCompleted);
  const projectedAvailable = subtractMoneyValues(availableCapital, projectedPending);
  const budgetUsage = moneyPercentage(totalPurchases, totalCapital);
  return {
    initialBudget,
    totalIncomes,
    totalCapital,
    totalPurchases,
    availableCapital,
    projectedPending,
    projectedCompleted,
    actualAgainstProjection,
    projectionVariance,
    projectedAvailable,
    budgetUsage,
    purchaseCount: purchases.length,
    incomeCount: incomes.length,
    projectionCount: projections.length,
    pendingProjectionCount: pendingProjections.length
  };
}

export function memberForUser(space = {}, userId = '') {
  return (space?.members || []).find((member) => member?.userId === userId) || null;
}

export function normalizeCollaborationRole(value = '', fallback = 'member') {
  const role = String(value || '').trim().toLowerCase();
  return ['owner', ...COLLABORATION_ROLES].includes(role) ? role : fallback;
}

export function roleLabel(role = '') {
  return ({ owner: 'Propietario', manager: 'Gerente', admin: 'Admin', individual: 'Individual', member: 'Personalizado' })[normalizeCollaborationRole(role)] || 'Personalizado';
}

export function rolePermissions(role = '', permissions = []) {
  const normalizedRole = normalizeCollaborationRole(role);
  if (['owner', 'manager', 'admin'].includes(normalizedRole)) return ['read', 'add', 'delete', 'projection', 'invite', 'write'];
  if (normalizedRole === 'individual') return ['read', 'add', 'delete', 'projection'];
  return Array.from(new Set((Array.isArray(permissions) ? permissions : []).map((value) => String(value || '').trim().toLowerCase()).filter(Boolean)));
}

export function hasPermission(space = {}, userId = '', permission = '') {
  const member = memberForUser(space, userId);
  if (!member) return false;
  const role = normalizeCollaborationRole(member.role);
  if (permission === 'manage_access') return ['owner', 'manager', 'admin'].includes(role);
  if (permission === 'delete_project') return ['owner', 'manager'].includes(role);
  if (permission === 'edit_project') return ['owner', 'manager', 'admin'].includes(role);
  const permissions = rolePermissions(role, member.permissions);
  if (permissions.includes(permission)) return true;
  return permissions.includes('write') && ['add', 'delete', 'projection'].includes(permission);
}

export function individualRecordAccess(space = {}, userId = '', record = {}, now = Date.now()) {
  const member = memberForUser(space, userId);
  if (normalizeCollaborationRole(member?.role) !== 'individual') return { restricted: false, owner: true, withinWindow: true, allowed: true };
  const createdAtMs = Date.parse(record?.createdAt || '');
  const owner = Boolean(userId && record?.createdByUserId === userId);
  const withinWindow = Number.isFinite(createdAtMs) && now >= createdAtMs && now - createdAtMs <= INDIVIDUAL_EDIT_WINDOW_MS;
  return { restricted: true, owner, withinWindow, allowed: owner && withinWindow };
}

export function operationAuthorship(record = {}, userId = '') {
  return {
    ownerUserId: cleanText(record?.createdByUserId || userId, 140),
    createdAt: cleanText(record?.createdAt || '', 60)
  };
}

export function normalizeCollaborationPermissions(input = []) {
  const values = new Set((Array.isArray(input) ? input : []).map((value) => String(value || '').toLowerCase()));
  values.add('read');
  return COLLABORATION_PERMISSIONS.filter((permission) => values.has(permission));
}

export function sharedOwnerPanelId(ownerUserId = '') {
  const normalizedOwnerUserId = cleanText(ownerUserId, 140);
  return normalizedOwnerUserId ? `__shared_owner_panel__:${normalizedOwnerUserId}` : '';
}

/**
 * Determina si una card de panel invitado debe permanecer detrás de la
 * comparación autoritativa del inventario completo.
 *
 * Los proyectos de una invitación individual también se agrupan en un panel
 * virtual `shared-portfolio`, por lo que ese tipo por sí solo no demuestra que
 * exista una invitación global. La barrera solo se activa cuando memoriaBACKEND
 * ya entregó un manifiesto del panel o cuando la aceptación local de ese panel
 * todavía está pendiente de completar su hidratación.
 */
export function panelRequiresAuthoritativeHydration(input = {}) {
  const panel = input.panel && typeof input.panel === 'object' ? input.panel : {};
  const panelId = cleanText(panel.id || input.panelId || '', 220);
  const panelType = cleanText(panel.type || input.panelType || '', 40).toLowerCase();
  if (!panelId || panel.owned === true) return false;
  if (panelType === 'portfolio') return true;
  if (panelType !== 'shared-portfolio') return false;

  const manifests = Array.isArray(input.portfolioHydration) ? input.portfolioHydration : [];
  const hasAuthoritativeManifest = manifests.some((candidate) => (
    cleanText(candidate?.portfolioSpaceId || '', 140) === panelId
  ));
  return input.pendingAuthoritativePanel === true || hasAuthoritativeManifest;
}

/**
 * Identifica los espacios de proyecto que deben estar hidratados antes de
 * abrir automáticamente un panel recién aceptado.
 *
 * El plano de control puede confirmar el panel y sus membresías antes de que
 * IndexedDB reciba las raíces de cada proyecto. Mantener esta selección en el
 * dominio evita presentar un panel aparentemente vacío durante esa ventana y
 * conserva el aislamiento entre paneles, propietarios y aplicaciones.
 */
export function pendingPanelExpectedProjectSpaceIds(input = {}) {
  const spaces = Array.isArray(input.spaces) ? input.spaces : [];
  const panelId = cleanText(input.panelId || '', 220);
  const currentUserId = cleanText(input.currentUserId || '', 140);
  const portfolioResourceType = cleanText(input.portfolioResourceType || 'admin.portfolio', 80) || 'admin.portfolio';
  const projectResourceType = cleanText(input.projectResourceType || PROJECT_ENTITY_TYPE, 80) || PROJECT_ENTITY_TYPE;
  const personalPanelId = cleanText(input.personalPanelId || '__personal_panel__', 220) || '__personal_panel__';
  const sharedProjectsPanelId = cleanText(input.sharedProjectsPanelId || '__shared_projects_panel__', 220) || '__shared_projects_panel__';
  if (!panelId || !currentUserId || panelId === personalPanelId) return [];

  const readableProjects = spaces.filter((space) => (
    cleanText(space?.resourceType || '', 80) === projectResourceType
    && Boolean(cleanText(space?.spaceId || '', 140))
    && hasPermission(space, currentUserId, 'read')
  ));
  const portfolioSpace = spaces.find((space) => (
    cleanText(space?.resourceType || '', 80) === portfolioResourceType
    && cleanText(space?.spaceId || '', 140) === panelId
  )) || null;

  let candidates = [];
  if (portfolioSpace) {
    const ownerUserId = cleanText(portfolioSpace.ownerUserId || '', 140);
    candidates = readableProjects.filter((space) => {
      const governanceSpaceId = cleanText(space?.governanceSpaceId || '', 140);
      if (governanceSpaceId) return governanceSpaceId === panelId;
      const member = memberForUser(space, currentUserId);
      return Boolean(
        ownerUserId
        && cleanText(space?.ownerUserId || '', 140) === ownerUserId
        && String(member?.accessScope || '').trim().toLowerCase() === 'portfolio'
      );
    });
  } else if (panelId.startsWith('__shared_owner_panel__:')) {
    candidates = readableProjects.filter((space) => sharedOwnerPanelId(space?.ownerUserId || '') === panelId);
  } else if (panelId === sharedProjectsPanelId) {
    candidates = readableProjects.filter((space) => (
      cleanText(space?.ownerUserId || '', 140) !== currentUserId
      && !cleanText(space?.governanceSpaceId || '', 140)
      && !sharedOwnerPanelId(space?.ownerUserId || '')
    ));
  } else {
    // Un invitado puede recibir proyectos de un portfolio sin ser miembro del
    // espacio administrativo. En ese caso el panel es virtual y usa como id el
    // governanceSpaceId de los proyectos autorizados.
    candidates = readableProjects.filter((space) => cleanText(space?.governanceSpaceId || '', 140) === panelId);
  }

  return Array.from(new Set(candidates
    .map((space) => cleanText(space?.spaceId || '', 140))
    .filter(Boolean)))
    .sort((left, right) => left.localeCompare(right));
}

/**
 * Verifica que un panel invitado tenga una comparación autoritativa contra el
 * panel del propietario y que cada proyecto esperado tenga su réplica autorizada
 * y materializada hasta la revisión autoritativa antes de mostrar su card.
 */
export function invitedPortfolioHydrationStatus(input = {}) {
  const spaces = Array.isArray(input.spaces) ? input.spaces : [];
  const panelId = cleanText(input.panelId || '', 220);
  const currentUserId = cleanText(input.currentUserId || '', 140);
  const portfolioResourceType = cleanText(input.portfolioResourceType || 'admin.portfolio', 80) || 'admin.portfolio';
  const projectResourceType = cleanText(input.projectResourceType || PROJECT_ENTITY_TYPE, 80) || PROJECT_ENTITY_TYPE;
  const loadedProjectSpaceIds = new Set((Array.isArray(input.loadedProjectSpaceIds)
    ? input.loadedProjectSpaceIds
    : [])
    .map((spaceId) => cleanText(spaceId || '', 140))
    .filter(Boolean));
  const manifests = Array.isArray(input.portfolioHydration) ? input.portfolioHydration : [];
  const manifest = manifests.find((candidate) => (
    cleanText(candidate?.portfolioSpaceId || '', 140) === panelId
  )) || null;
  const controlExpectedSpaceIds = pendingPanelExpectedProjectSpaceIds(input);
  const manifestExpectedSpaceIds = Array.from(new Set(Array.isArray(manifest?.expectedProjectSpaceIds)
    ? manifest.expectedProjectSpaceIds
      .map((spaceId) => cleanText(spaceId || '', 140))
      .filter(Boolean)
    : []))
    .sort((left, right) => left.localeCompare(right));
  const authoritativeProjectSpaceIdSet = new Set(manifestExpectedSpaceIds);
  const controlProjectSpaceIdSet = new Set(controlExpectedSpaceIds);
  const unexpectedProjectSpaceIds = controlExpectedSpaceIds
    .filter((spaceId) => !authoritativeProjectSpaceIdSet.has(spaceId));
  const absentControlProjectSpaceIds = manifestExpectedSpaceIds
    .filter((spaceId) => !controlProjectSpaceIdSet.has(spaceId));
  const projectInventoryMatches = Boolean(manifest)
    && unexpectedProjectSpaceIds.length === 0
    && absentControlProjectSpaceIds.length === 0;
  const expectedProjectSpaceIds = Array.from(new Set([
    ...manifestExpectedSpaceIds,
    ...controlExpectedSpaceIds
  ])).sort((left, right) => left.localeCompare(right));
  const projectSpacesById = new Map(spaces
    .filter((space) => cleanText(space?.resourceType || '', 80) === projectResourceType)
    .map((space) => [cleanText(space?.spaceId || '', 140), space])
    .filter(([spaceId]) => Boolean(spaceId)));
  const pendingProjectAuthorizationSpaceIds = expectedProjectSpaceIds.filter((spaceId) => {
    const projectSpace = projectSpacesById.get(spaceId) || null;
    return !projectSpace
      || projectSpace.authorizationState === 'unconfirmed'
      || !currentUserId
      || !hasPermission(projectSpace, currentUserId, 'read');
  });
  const pendingProjectAuthorizationSpaceIdSet = new Set(pendingProjectAuthorizationSpaceIds);
  const missingProjectSpaceIds = expectedProjectSpaceIds
    .filter((spaceId) => !loadedProjectSpaceIds.has(spaceId));
  const comparisonComplete = manifest?.complete === true;
  const comparisonAuthoritative = Boolean(manifest && manifest?.authoritative !== false);
  const portfolioSpace = spaces.find((space) => (
    cleanText(space?.resourceType || '', 80) === portfolioResourceType
    && cleanText(space?.spaceId || '', 140) === panelId
    && space?.authorizationState !== 'unconfirmed'
  )) || null;
  const portfolioRootLoaded = Boolean(
    portfolioSpace
    && currentUserId
    && hasPermission(portfolioSpace, currentUserId, 'read')
  );
  const manifestInventoryRevision = Math.max(0, Math.floor(Number(manifest?.inventoryRevision || 0)));
  const portfolioInventoryRevision = Math.max(0, Math.floor(Number(portfolioSpace?.projectInventoryRevision || 0)));
  const inventoryRevisionMatches = Boolean(manifest) && manifestInventoryRevision === portfolioInventoryRevision;
  return {
    panelId,
    ready: Boolean(
      panelId
      && comparisonComplete
      && comparisonAuthoritative
      && portfolioRootLoaded
      && inventoryRevisionMatches
      && projectInventoryMatches
      && pendingProjectAuthorizationSpaceIds.length === 0
      && missingProjectSpaceIds.length === 0
    ),
    comparisonComplete,
    comparisonAuthoritative,
    portfolioRootLoaded,
    manifestInventoryRevision,
    portfolioInventoryRevision,
    inventoryRevisionMatches,
    projectInventoryMatches,
    authoritativeProjectSpaceIds: manifestExpectedSpaceIds,
    controlProjectSpaceIds: controlExpectedSpaceIds,
    unexpectedProjectSpaceIds,
    absentControlProjectSpaceIds,
    expectedProjectSpaceIds,
    authorizedProjectSpaceIds: expectedProjectSpaceIds.filter((spaceId) => !pendingProjectAuthorizationSpaceIdSet.has(spaceId)),
    pendingProjectAuthorizationSpaceIds,
    loadedProjectSpaceIds: expectedProjectSpaceIds.filter((spaceId) => loadedProjectSpaceIds.has(spaceId)),
    missingProjectSpaceIds,
    reason: !manifest
      ? 'authoritative_manifest_missing'
      : !comparisonComplete
        ? 'authoritative_comparison_incomplete'
        : !comparisonAuthoritative
          ? 'authoritative_comparison_stale'
          : !portfolioRootLoaded
            ? 'portfolio_root_missing'
            : !inventoryRevisionMatches
              ? 'portfolio_inventory_revision_mismatch'
              : pendingProjectAuthorizationSpaceIds.length
                ? 'project_replica_unconfirmed'
                : missingProjectSpaceIds.length
                  ? 'project_roots_missing'
                  : !projectInventoryMatches
                    ? 'project_inventory_set_mismatch'
                    : 'ready'
  };
}

function projectOwnerProfile(data = {}) {
  const ownerUserId = cleanText(data?.space?.ownerUserId || '', 140);
  if (!ownerUserId) return null;
  return (Array.isArray(data?.space?.members) ? data.space.members : [])
    .find((member) => cleanText(member?.userId || '', 140) === ownerUserId)?.profile || null;
}

function projectPortfolioId(data = {}) {
  return cleanText(data?.space?.governanceSpaceId || data?.project?.portfolioSpaceId || '', 140);
}

/**
 * Devuelve únicamente proyectos administrativos anteriores a la creación del
 * panel que todavía no quedaron gobernados por ese portfolio en el backend.
 *
 * Estos espacios deben recibir una concesión explícita al enviar la primera
 * invitación global; los proyectos nuevos, que sí tienen governanceSpaceId,
 * continúan heredando participantes exclusivamente desde memoriaBACKEND.
 */
export function legacyPortfolioProjectsForInvitation(projects = [], portfolioSpace = {}) {
  const portfolioSpaceId = cleanText(portfolioSpace?.spaceId || '', 140);
  const portfolioOwnerUserId = cleanText(portfolioSpace?.ownerUserId || '', 140);
  if (!portfolioSpaceId || !portfolioOwnerUserId) return [];

  return (Array.isArray(projects) ? projects : []).filter((data) => {
    const projectSpaceId = cleanText(data?.space?.spaceId || '', 140);
    if (!projectSpaceId || data?.space?.resourceType !== PROJECT_ENTITY_TYPE) return false;
    if (data?.space?.authorizationState === 'unconfirmed') return false;

    const projectOwnerUserId = cleanText(
      data?.space?.ownerUserId || data?.project?.portfolioOwnerUserId || '',
      140
    );
    if (projectOwnerUserId !== portfolioOwnerUserId) return false;

    const backendGovernanceSpaceId = cleanText(data?.space?.governanceSpaceId || '', 140);
    if (backendGovernanceSpaceId === portfolioSpaceId) return false;
    if (backendGovernanceSpaceId) return false;

    const persistedPortfolioSpaceId = cleanText(data?.project?.portfolioSpaceId || '', 140);
    return !persistedPortfolioSpaceId || persistedPortfolioSpaceId === portfolioSpaceId;
  });
}

/**
 * Construye las vistas de panel únicamente a partir de espacios autorizados.
 *
 * Un usuario invitado a uno o varios proyectos no necesita ser miembro del
 * espacio administrativo del panel. En ese caso se crea una vista virtual con
 * la misma identidad del portfolio (o, para proyectos legacy, del propietario)
 * y solo se agregan los proyectos que ya están presentes en su bootstrap.
 * Esto evita mezclar propietarios diferentes y jamás revela proyectos para los
 * que la cuenta no recibió membresía.
 */
export function buildProjectPanelScopes(input = {}) {
  const spaces = Array.isArray(input.spaces) ? input.spaces : [];
  const projects = Array.isArray(input.projects) ? input.projects : [];
  const currentUserId = cleanText(input.currentUserId || '', 140);
  const activePanelId = cleanText(input.activePanelId || '', 220);
  const portfolioResourceType = cleanText(input.portfolioResourceType || 'admin.portfolio', 80) || 'admin.portfolio';
  const personalPanelId = cleanText(input.personalPanelId || '__personal_panel__', 220) || '__personal_panel__';
  const sharedProjectsPanelId = cleanText(input.sharedProjectsPanelId || '__shared_projects_panel__', 220) || '__shared_projects_panel__';

  const scopes = spaces
    .filter((space) => space?.resourceType === portfolioResourceType && space?.authorizationState !== 'unconfirmed')
    .map((space) => ({
      id: cleanText(space?.spaceId || '', 140),
      type: 'portfolio',
      space,
      ownerUserId: cleanText(space?.ownerUserId || '', 140),
      ownerProfile: projectOwnerProfile({ space }),
      owned: cleanText(space?.ownerUserId || '', 140) === currentUserId,
      projects: []
    }))
    .filter((scope) => scope.id);
  const scopesById = new Map(scopes.map((scope) => [scope.id, scope]));
  const scopesByOwner = new Map();
  for (const scope of scopes) {
    if (!scope.ownerUserId) continue;
    const ownerScopes = scopesByOwner.get(scope.ownerUserId) || [];
    ownerScopes.push(scope);
    scopesByOwner.set(scope.ownerUserId, ownerScopes);
  }

  const personalProjects = [];
  const ungroupedSharedProjects = [];

  const resolveActualOwnerScope = (ownerUserId = '') => {
    const candidates = scopesByOwner.get(ownerUserId) || [];
    return candidates.find((scope) => scope.id === activePanelId)
      || candidates.find((scope) => scope.owned)
      || candidates[0]
      || null;
  };

  const resolveVirtualScope = (data = {}, portfolioId = '', ownerUserId = '') => {
    const virtualId = portfolioId || sharedOwnerPanelId(ownerUserId);
    if (!virtualId) return null;
    let scope = scopesById.get(virtualId);
    if (!scope) {
      scope = {
        id: virtualId,
        type: 'shared-portfolio',
        space: null,
        ownerUserId,
        ownerProfile: projectOwnerProfile(data),
        owned: false,
        projects: []
      };
      scopes.push(scope);
      scopesById.set(virtualId, scope);
    } else if (!scope.ownerProfile) {
      scope.ownerProfile = projectOwnerProfile(data);
    }
    return scope;
  };

  for (const data of projects) {
    const spaceId = cleanText(data?.space?.spaceId || '', 140);
    if (!spaceId) continue;
    const ownerUserId = cleanText(data?.space?.ownerUserId || data?.project?.portfolioOwnerUserId || '', 140);
    const portfolioId = projectPortfolioId(data);
    const ownedProject = Boolean(currentUserId && cleanText(data?.space?.ownerUserId || '', 140) === currentUserId);

    if (portfolioId && scopesById.has(portfolioId)) {
      scopesById.get(portfolioId).projects.push(data);
      continue;
    }

    const ownerScope = resolveActualOwnerScope(ownerUserId);
    if (!portfolioId && ownerScope) {
      ownerScope.projects.push(data);
      continue;
    }

    if (ownedProject) {
      personalProjects.push(data);
      continue;
    }

    const virtualScope = resolveVirtualScope(data, portfolioId, ownerUserId);
    if (virtualScope) virtualScope.projects.push(data);
    else ungroupedSharedProjects.push(data);
  }

  if (!scopes.some((scope) => scope.owned) || personalProjects.length) {
    scopes.push({
      id: personalPanelId,
      type: 'personal',
      space: null,
      ownerUserId: currentUserId,
      ownerProfile: null,
      owned: true,
      projects: personalProjects
    });
  }
  if (ungroupedSharedProjects.length) {
    scopes.push({
      id: sharedProjectsPanelId,
      type: 'shared',
      space: null,
      ownerUserId: '',
      ownerProfile: null,
      owned: false,
      projects: ungroupedSharedProjects
    });
  }

  return scopes.sort((left, right) => {
    const rank = (scope) => scope.type === 'personal' || scope.owned
      ? 0
      : scope.type === 'portfolio' || scope.type === 'shared-portfolio'
        ? 1
        : 2;
    const rankDifference = rank(left) - rank(right);
    if (rankDifference) return rankDifference;
    return String(left.id || '').localeCompare(String(right.id || ''));
  });
}
