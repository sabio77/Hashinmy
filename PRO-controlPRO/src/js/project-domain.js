export const PROJECT_ENTITY_TYPE = 'admin.project';
export const PROJECT_ENTITY_ID = 'project';
export const PURCHASE_ENTITY_TYPE = 'admin.purchase';
export const INCOME_ENTITY_TYPE = 'admin.income';
export const PROJECTION_ENTITY_TYPE = 'admin.projection';
export const PROJECTION_LINK_ENTITY_TYPE = 'admin.projection-link';
export const ADMIN_PROJECT_PERMISSION_PROFILE = 'admin-project-v1';

export const COLLABORATION_PERMISSIONS = Object.freeze(['read', 'add', 'delete', 'projection']);
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
    createdAt: cleanText(input.createdAt, 60) || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

export function normalizeIncomeInput(input = {}) {
  return {
    description: cleanText(input.description, 360),
    amount: moneyValue(input.amount),
    receivedAt: cleanText(input.receivedAt, 24) || localDateValue(),
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
    createdAt: cleanText(input.createdAt, 60) || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

export function normalizeProjectionLinkInput(input = {}) {
  return {
    purchaseId: cleanText(input.purchaseId, 180),
    projectionId: cleanText(input.projectionId, 180),
    active: input.active !== false && Boolean(cleanText(input.projectionId, 180)),
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

export function hasPermission(space = {}, userId = '', permission = '') {
  const member = memberForUser(space, userId);
  if (!member) return false;
  if (member.role === 'owner') return true;
  const permissions = Array.isArray(member.permissions) ? member.permissions : [];
  if (permissions.includes(permission)) return true;
  return permissions.includes('write') && ['add', 'delete', 'projection'].includes(permission);
}

export function normalizeCollaborationPermissions(input = []) {
  const values = new Set((Array.isArray(input) ? input : []).map((value) => String(value || '').toLowerCase()));
  values.add('read');
  return COLLABORATION_PERMISSIONS.filter((permission) => values.has(permission));
}
