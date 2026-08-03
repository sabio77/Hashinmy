const DEFAULT_LOW_SPACE_BYTES = 32 * 1024 * 1024;
const DEFAULT_HIGH_USAGE_RATIO = 0.92;

function finiteBytes(value = 0) {
  const number = Number(value || 0);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : 0;
}

function storageManagerFrom(value = null) {
  return value || globalThis.navigator?.storage || null;
}

export function calculateStorageDurability(input = {}, options = {}) {
  const quotaBytes = finiteBytes(input.quotaBytes ?? input.quota);
  const usageBytes = Math.min(quotaBytes || Number.MAX_SAFE_INTEGER, finiteBytes(input.usageBytes ?? input.usage));
  const remainingBytes = quotaBytes ? Math.max(0, quotaBytes - usageBytes) : 0;
  const usageRatio = quotaBytes ? Math.min(1, usageBytes / quotaBytes) : 0;
  const lowSpaceBytes = Math.max(1024 * 1024, finiteBytes(options.lowSpaceBytes) || DEFAULT_LOW_SPACE_BYTES);
  const highUsageRatio = Math.min(0.99, Math.max(0.5, Number(options.highUsageRatio || DEFAULT_HIGH_USAGE_RATIO)));
  const persistSupported = Boolean(input.persistSupported);
  const estimateSupported = Boolean(input.estimateSupported);
  const persisted = Boolean(input.persisted);
  const lowSpace = Boolean(
    quotaBytes
    && (remainingBytes <= Math.min(lowSpaceBytes, Math.max(4 * 1024 * 1024, quotaBytes * 0.08))
      || usageRatio >= highUsageRatio)
  );

  let status = 'unknown';
  if (lowSpace) status = 'low-space';
  else if (persisted) status = 'persistent';
  else if (persistSupported) status = 'best-effort';
  else if (estimateSupported || input.supported) status = 'unprotected';
  else status = 'unsupported';

  return {
    supported: Boolean(input.supported || persistSupported || estimateSupported),
    persistSupported,
    estimateSupported,
    persisted,
    quotaBytes,
    usageBytes,
    remainingBytes,
    usageRatio,
    lowSpace,
    status,
    requestAttempted: Boolean(input.requestAttempted),
    requestGranted: Boolean(input.requestGranted),
    error: input.error || null
  };
}

export async function inspectStorageDurability(storageManager = null, options = {}) {
  const manager = storageManagerFrom(storageManager);
  if (!manager) return calculateStorageDurability({}, options);

  const persistSupported = typeof manager.persist === 'function';
  const estimateSupported = typeof manager.estimate === 'function';
  const persistedSupported = typeof manager.persisted === 'function';
  if (!persistSupported && !estimateSupported && !persistedSupported) {
    return calculateStorageDurability({}, options);
  }
  let persisted = false;
  let estimate = {};
  let error = null;

  const tasks = [];
  if (persistedSupported) {
    tasks.push(
      Promise.resolve()
        .then(() => manager.persisted())
        .then((value) => { persisted = Boolean(value); })
        .catch((caught) => { error ||= caught; })
    );
  }
  if (estimateSupported) {
    tasks.push(
      Promise.resolve()
        .then(() => manager.estimate())
        .then((value) => { estimate = value && typeof value === 'object' ? value : {}; })
        .catch((caught) => { error ||= caught; })
    );
  }
  await Promise.all(tasks);

  return calculateStorageDurability({
    supported: true,
    persistSupported,
    estimateSupported,
    persisted,
    quota: estimate.quota,
    usage: estimate.usage,
    error
  }, options);
}

export async function requestPersistentStorage(storageManager = null, options = {}) {
  const manager = storageManagerFrom(storageManager);
  if (!manager || typeof manager.persist !== 'function') {
    return inspectStorageDurability(manager, options);
  }

  let granted = false;
  let error = null;
  try {
    granted = Boolean(await manager.persist());
  } catch (caught) {
    error = caught;
  }

  const inspected = await inspectStorageDurability(manager, options);
  return calculateStorageDurability({
    ...inspected,
    persisted: inspected.persisted || granted,
    requestAttempted: true,
    requestGranted: granted,
    error: error || inspected.error
  }, options);
}

export function formatStorageBytes(bytes = 0, locale = 'es-CO') {
  const value = finiteBytes(bytes);
  if (!value) return '';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const index = Math.min(units.length - 1, Math.floor(Math.log(value) / Math.log(1024)));
  const amount = value / (1024 ** index);
  return `${new Intl.NumberFormat(locale || 'es-CO', {
    maximumFractionDigits: amount >= 10 || index === 0 ? 0 : 1
  }).format(amount)} ${units[index]}`;
}
