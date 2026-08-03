function clean(value = '') {
  return String(value || '').trim();
}

function timestamp(value = '') {
  const parsed = Date.parse(clean(value));
  return Number.isFinite(parsed) ? parsed : 0;
}

export function normalizeDeviceRecord(device = {}, currentDeviceId = '') {
  const deviceId = clean(device?.deviceId).slice(0, 180);
  if (!deviceId) return null;
  const currentId = clean(currentDeviceId);
  return {
    deviceId,
    name: clean(device?.name).slice(0, 120),
    platform: clean(device?.platform).slice(0, 120),
    appMode: clean(device?.appMode).slice(0, 80),
    language: clean(device?.language).slice(0, 40),
    createdAt: clean(device?.createdAt).slice(0, 80),
    updatedAt: clean(device?.updatedAt).slice(0, 80),
    lastSeenAt: clean(device?.lastSeenAt).slice(0, 80),
    current: Boolean(currentId && deviceId === currentId)
  };
}

export function normalizeDeviceList(devices = [], currentDeviceId = '') {
  const unique = new Map();
  for (const candidate of Array.isArray(devices) ? devices : []) {
    const normalized = normalizeDeviceRecord(candidate, currentDeviceId);
    if (!normalized) continue;
    const existing = unique.get(normalized.deviceId);
    if (!existing || timestamp(normalized.lastSeenAt || normalized.updatedAt) >= timestamp(existing.lastSeenAt || existing.updatedAt)) {
      unique.set(normalized.deviceId, normalized);
    }
  }
  return Array.from(unique.values()).sort((left, right) => {
    if (left.current !== right.current) return left.current ? -1 : 1;
    const recentDifference = timestamp(right.lastSeenAt || right.updatedAt) - timestamp(left.lastSeenAt || left.updatedAt);
    if (recentDifference) return recentDifference;
    return left.deviceId.localeCompare(right.deviceId);
  });
}

export function canRetireDevice(device = null, currentDeviceId = '', deviceCount = 0, currentDeviceRegistered = false) {
  const deviceId = clean(device?.deviceId);
  const currentId = clean(currentDeviceId);
  return Boolean(
    deviceId
    && currentId
    && deviceId !== currentId
    && Number(deviceCount || 0) > 1
    && currentDeviceRegistered === true
  );
}

export function compactDeviceId(deviceId = '') {
  const value = clean(deviceId);
  if (value.length <= 14) return value;
  return `${value.slice(0, 6)}…${value.slice(-6)}`;
}
