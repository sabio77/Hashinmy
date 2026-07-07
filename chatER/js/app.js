const chaterVolatileStorage = new Map();
const chaterRuntimeSession = {
  email: '',
  userId: ''
};
let chaterStorageWarningShown = false;
let chaterEphemeralPurgeTimer = null;

function getBrowserLocalStorage() {
  try {
    return window.localStorage || null;
  } catch (error) {
    return null;
  }
}

function warnStorageFallback(error) {
  if (chaterStorageWarningShown) return;
  chaterStorageWarningShown = true;
  console.warn('ChatER usa almacenamiento temporal porque el almacenamiento persistente del navegador no está disponible.', error);
}

function readStorageItem(key, fallbackValue = '') {
  const storageKey = String(key || '');
  if (!storageKey) return fallbackValue;

  try {
    const storage = getBrowserLocalStorage();
    if (storage) {
      const value = storage.getItem(storageKey);
      if (value !== null && value !== undefined) return value;
    }
  } catch (error) {
    warnStorageFallback(error);
  }

  if (chaterVolatileStorage.has(storageKey)) return chaterVolatileStorage.get(storageKey);
  return fallbackValue;
}

function writeStorageItem(key, value, options = {}) {
  const storageKey = String(key || '');
  if (!storageKey) return false;

  const serializedValue = String(value ?? '');
  chaterVolatileStorage.set(storageKey, serializedValue);

  try {
    const storage = getBrowserLocalStorage();
    if (!storage) throw new Error('localStorage no está disponible.');
    storage.setItem(storageKey, serializedValue);
    return true;
  } catch (error) {
    warnStorageFallback(error);
    if (options.throwOnError) throw error;
    return false;
  }
}

function removeStorageItem(key) {
  const storageKey = String(key || '');
  if (!storageKey) return false;

  chaterVolatileStorage.delete(storageKey);

  try {
    const storage = getBrowserLocalStorage();
    if (storage) storage.removeItem(storageKey);
    return true;
  } catch (error) {
    warnStorageFallback(error);
    return false;
  }
}

const AUTH_REQUIRED = true;
const requireGmailDomain = true;
const MEMORIA_BACKEND_KEEPALIVE_PATH = '/vida';
const CHATER_IMAGE_UPLOAD_MAX_BYTES = 200 * 1024;
const CHATER_IMAGE_UPLOAD_MAX_DIMENSION = 4096;
const CHATER_EPHEMERAL_TTL_SECONDS = 24 * 60 * 60;
const CHATER_EPHEMERAL_TTL_MS = CHATER_EPHEMERAL_TTL_SECONDS * 1000;
const CHATER_LOCAL_EPHEMERAL_PURGE_MIN_DELAY_MS = 1000;
const CHATER_LOCAL_EPHEMERAL_PURGE_MAX_DELAY_MS = 2147480000;

function parseChatEphemeralTimestampMs(value = '') {
  const parsed = value instanceof Date
    ? value.getTime()
    : (Number.isFinite(Number(value)) ? Number(value) : Date.parse(String(value || '')));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function coerceChatEphemeralExpiresAtIso(expiresAt = '', baseTime = Date.now()) {
  const baseMs = parseChatEphemeralTimestampMs(baseTime) || Date.now();
  const maxExpiresMs = baseMs + CHATER_EPHEMERAL_TTL_MS;
  const requestedMs = parseChatEphemeralTimestampMs(expiresAt);
  const finalMs = requestedMs > 0 ? Math.min(requestedMs, maxExpiresMs) : maxExpiresMs;
  return new Date(finalMs).toISOString();
}

function getChatEphemeralExpiresAtIso(baseTime = Date.now()) {
  return coerceChatEphemeralExpiresAtIso('', baseTime);
}

function getChatMessageCreatedAtIso(message = {}, fallbackIso = new Date().toISOString()) {
  const candidate = message.createdAt
    || message.clientTime
    || message.sentAt
    || message.timestamp
    || message.backendReceivedAt
    || message.metadata?.createdAt
    || message.metadata?.clientTime
    || '';
  const candidateMs = parseChatEphemeralTimestampMs(candidate);
  if (candidateMs) return new Date(candidateMs).toISOString();
  const fallbackMs = parseChatEphemeralTimestampMs(fallbackIso) || Date.now();
  return new Date(fallbackMs).toISOString();
}

function normalizeChatMessageEphemeralFields(message = {}, options = {}) {
  if (!message || typeof message !== 'object') return message;
  const nowIso = options.nowIso || new Date().toISOString();
  const createdAt = getChatMessageCreatedAtIso(message, nowIso);
  const expiresAt = coerceChatEphemeralExpiresAtIso(
    message.expiresAt
      || message.expiryAt
      || message.expireAt
      || message.expiresAtAt
      || message.metadata?.expiresAt
      || message.metadata?.expiryAt
      || '',
    createdAt
  );
  return {
    ...message,
    createdAt,
    clientTime: message.clientTime || createdAt,
    expiresAt,
    ttlSeconds: Number(message.ttlSeconds || message.ephemeralTtlSeconds || message.metadata?.ephemeralTtlSeconds || CHATER_EPHEMERAL_TTL_SECONDS) || CHATER_EPHEMERAL_TTL_SECONDS
  };
}

function isChatMessageExpired(message = {}, nowMs = Date.now()) {
  const expiresAtMs = parseChatEphemeralTimestampMs(
    message.expiresAt
      || message.expiryAt
      || message.expireAt
      || message.expiresAtAt
      || message.metadata?.expiresAt
      || ''
  );
  return Boolean(expiresAtMs && expiresAtMs <= nowMs);
}

function getChatMessageOrderTimeMs(message = {}) {
  const candidates = [
    message.createdAt,
    message.backendReceivedAt,
    message.clientTime,
    message.sentAt,
    message.timestamp,
    message.metadata?.createdAt,
    message.metadata?.backendReceivedAt,
    message.metadata?.clientTime
  ];
  for (const candidate of candidates) {
    const parsed = parseChatEphemeralTimestampMs(candidate);
    if (parsed) return parsed;
  }
  return 0;
}

function normalizeAndPruneChatMessages(messages = []) {
  if (!Array.isArray(messages) || !messages.length) return [];
  const nowIso = new Date().toISOString();
  const nowMs = Date.parse(nowIso);
  return messages
    .map((message, index) => ({ message: normalizeChatMessageEphemeralFields(message, { nowIso }), index }))
    .filter(({ message }) => !isChatMessageExpired(message, nowMs))
    .sort((left, right) => {
      const diff = getChatMessageOrderTimeMs(left.message) - getChatMessageOrderTimeMs(right.message);
      return diff || (left.index - right.index);
    })
    .map(({ message }) => message);
}

function pruneExpiredChatMessagesFromConversation(conversation = {}) {
  if (!conversation || !Array.isArray(conversation.messages)) return false;
  const beforeCount = conversation.messages.length;
  const nextMessages = normalizeAndPruneChatMessages(conversation.messages);
  if (nextMessages.length === beforeCount) {
    conversation.messages = nextMessages;
    return false;
  }
  conversation.messages = nextMessages;
  conversation.messagesHydrated = Boolean(conversation.messagesHydrated);
  conversation.status = conversation.status === 'Enviando...' ? 'Mensajes expirados depurados' : (conversation.status || 'Sincronizado');
  return true;
}

function pruneExpiredChatMessagesFromState(state = null) {
  const targetState = state || (typeof appState !== 'undefined' ? appState : null);
  if (!targetState || !Array.isArray(targetState.conversations)) return false;
  let changed = false;
  targetState.conversations.forEach((conversation) => {
    if (pruneExpiredChatMessagesFromConversation(conversation)) changed = true;
  });
  return changed;
}

function getNextChatEphemeralExpiryMsFromState(state = null, nowMs = Date.now()) {
  const targetState = state || (typeof appState !== 'undefined' ? appState : null);
  if (!targetState || !Array.isArray(targetState.conversations)) return 0;

  let nextExpiryMs = 0;
  targetState.conversations.forEach((conversation) => {
    const messages = Array.isArray(conversation.messages) ? conversation.messages : [];
    messages.forEach((message) => {
      const normalizedMessage = normalizeChatMessageEphemeralFields(message);
      const expiresAtMs = parseChatEphemeralTimestampMs(normalizedMessage.expiresAt);
      if (expiresAtMs > nowMs && (!nextExpiryMs || expiresAtMs < nextExpiryMs)) {
        nextExpiryMs = expiresAtMs;
      }
    });
  });

  return nextExpiryMs;
}

function clearEphemeralLocalPurgeTimer() {
  if (!chaterEphemeralPurgeTimer) return;
  clearTimeout(chaterEphemeralPurgeTimer);
  chaterEphemeralPurgeTimer = null;
}

function scheduleNextEphemeralLocalPurge(reason = 'state-change') {
  if (typeof window === 'undefined' || !window.setTimeout) return false;
  clearEphemeralLocalPurgeTimer();

  const nowMs = Date.now();
  const nextExpiryMs = getNextChatEphemeralExpiryMsFromState(appState, nowMs);
  if (!nextExpiryMs) return false;

  const delayMs = Math.max(
    CHATER_LOCAL_EPHEMERAL_PURGE_MIN_DELAY_MS,
    Math.min(CHATER_LOCAL_EPHEMERAL_PURGE_MAX_DELAY_MS, nextExpiryMs - nowMs + 100)
  );

  chaterEphemeralPurgeTimer = window.setTimeout(() => {
    runScheduledEphemeralLocalPurge(reason);
  }, delayMs);
  return true;
}

function refreshInterfaceAfterEphemeralLocalPurge() {
  if (!chatView || chatView.hidden) return;
  if (activeSection === 'chats') {
    renderChatList(searchInput?.value || '');
    renderConversation();
    return;
  }
  renderNavigationState();
}

function runScheduledEphemeralLocalPurge(reason = 'timer') {
  chaterEphemeralPurgeTimer = null;
  const changed = pruneExpiredChatMessagesFromState(appState);

  if (changed) {
    persistState();
    refreshInterfaceAfterEphemeralLocalPurge();
    return;
  }

  scheduleNextEphemeralLocalPurge(`after-${reason}`);
}

function clampImageUploadMaxBytes(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return CHATER_IMAGE_UPLOAD_MAX_BYTES;
  return Math.max(1, Math.min(CHATER_IMAGE_UPLOAD_MAX_BYTES, Math.round(parsed)));
}

function clampImageUploadMaxDimension(value, fallback = 1600) {
  const parsed = Number(value);
  const parsedFallback = Number(fallback);
  const safeFallback = Number.isFinite(parsedFallback) && parsedFallback > 0 ? parsedFallback : 1600;
  const resolved = Number.isFinite(parsed) && parsed > 0 ? parsed : safeFallback;
  return Math.max(320, Math.min(CHATER_IMAGE_UPLOAD_MAX_DIMENSION, Math.round(resolved)));
}

const CHATER_CONFIG = {
  backendBaseUrl: normalizeMemoriaBackendBaseUrl(window.CHATER_CONFIG?.MEMORIA_BACKEND_URL || window.PLATFORM_AUTH_CONFIG?.backendBaseUrl || window.CONFIGmemoriaBACKEND?.MEMORIA_BACKEND_URL || ''),
  siteId: normalizeMemoriaSiteId(window.CHATER_CONFIG?.MEMORIA_SITE_ID || window.CHATER_CONFIG?.SITE_ID || window.PLATFORM_AUTH_CONFIG?.siteId || window.CONFIGmemoriaBACKEND?.MEMORIA_SITE_ID || ''),
  projectOrigin: normalizeMemoriaProjectOrigin(window.CHATER_CONFIG?.MEMORIA_PROJECT_ORIGIN || window.CHATER_CONFIG?.ORIGEN_PROYECTO || window.CHATER_CONFIG?.PROJECT_ORIGIN || window.PLATFORM_AUTH_CONFIG?.memoriaBackendConfig?.origenProyecto || window.CONFIGmemoriaBACKEND?.ORIGEN_PROYECTO || ''),
  apiPrefix: normalizeMemoriaApiPrefix(window.CHATER_CONFIG?.MEMORIA_API_PREFIX || '/api/v1'),
  realtimeUrl: window.CHATER_CONFIG?.STREME_REALTIME_URL || '',
  realtimeTransport: window.CHATER_CONFIG?.STREME_TRANSPORT || 'auto',
  stremeChannel: normalizeMemoriaChannel(window.CHATER_CONFIG?.STREME_CHANNEL || 'chater-general'),
  enableStaticVisitTracking: window.CHATER_CONFIG?.ENABLE_STATIC_VISIT_TRACKING !== false,
  enableClientTelemetry: window.CHATER_CONFIG?.ENABLE_CLIENT_TELEMETRY !== false,
  requireGoogleGmailAuth: window.CHATER_CONFIG?.REQUIRE_GOOGLE_GMAIL_AUTH !== false,
  enableRemoteUserPreferences: window.CHATER_CONFIG?.ENABLE_REMOTE_USER_PREFERENCES !== false,
  enableLocalDemoSeed: window.CHATER_CONFIG?.ENABLE_LOCAL_DEMO_SEED === true,
  apiTimeoutMs: resolvePositiveConfigNumber(window.CHATER_CONFIG?.API_TIMEOUT_MS, 15000),
  mediaUploadTimeoutMs: resolvePositiveConfigNumber(window.CHATER_CONFIG?.MEDIA_UPLOAD_TIMEOUT_MS, 60000),
  r2xImageMaxBytes: clampImageUploadMaxBytes(resolvePositiveConfigNumber(window.CHATER_CONFIG?.TEMP_IMAGE_R2X_MAX_BYTES, CHATER_IMAGE_UPLOAD_MAX_BYTES)),
  enableR2xImageUploads: window.CHATER_CONFIG?.ENABLE_R2X_IMAGE_UPLOADS !== false,
  pushPublicKey: window.CHATER_CONFIG?.PUSH_PUBLIC_KEY || '',
  messageMediaPreviewMaxBytes: resolvePositiveConfigNumber(window.CHATER_CONFIG?.MESSAGE_MEDIA_PREVIEW_MAX_BYTES, 1500000),
  lightStartsAt: 6,
  darkStartsAt: 18,
  deviceKey: 'chater.device.id',
  stremeLastEventKey: 'chater.streme.lastEventId',
  stremeLastEventByChannelKey: 'chater.streme.lastEventId.byChannel',
  stateKey: 'chater.demo.state.v2',
  outboxKey: 'chater.backend.outbox.v1',
  emojiRecentsKey: 'chater.emoji.recents.v1',
  notificationRegistrationKey: 'chater.notifications.registration.v1',
  localStatusPreviewMaxBytes: 1500000
};

const STATE_VISIBLE_HOURS = 24;
const STATE_VISIBLE_MS = STATE_VISIBLE_HOURS * 60 * 60 * 1000;
const STATE_EXPIRY_SWEEP_INTERVAL_MS = 60 * 1000;
const PRESENCE_SYNC_MIN_INTERVAL_MS = 25000;
const USER_PREFERENCES_SYNC_DEBOUNCE_MS = 1200;

function resolvePositiveConfigNumber(value, fallback) {
  const parsed = Number(value);
  const safeFallback = Number(fallback) || 0;
  if (!Number.isFinite(parsed) || parsed <= 0) return safeFallback;
  return Math.round(parsed);
}

function normalizeMemoriaSiteId(value = '') {
  const normalized = String(value || '').trim();
  return normalized;
}

function normalizeMemoriaProjectOrigin(value = '') {
  const raw = String(value || '').trim();
  if (!raw) return '';

  try {
    const url = new URL(raw, window.location.origin);
    return url.origin.replace(/\/+$/, '');
  } catch (error) {
    return raw.replace(/\/+$/, '');
  }
}

function normalizeMemoriaApiPrefix(value = '/api/v1') {
  const normalized = String(value || '/api/v1').trim().replace(/\/+$/, '');
  if (!normalized) return '/api/v1';
  return normalized.startsWith('/') ? normalized : `/${normalized}`;
}

function normalizeMemoriaBackendBaseUrl(value = '') {
  const raw = String(value || '').trim();
  if (!raw) return '';

  try {
    const url = new URL(raw, window.location.origin);
    return url.origin.replace(/\/+$/, '');
  } catch (error) {
    return raw.replace(/\/+$/, '');
  }
}

function normalizeMemoriaChannel(value = 'chater-general') {
  const normalized = String(value || 'chater-general').trim();
  return normalized || 'chater-general';
}

function getMemoriaSiteId() {
  return CHATER_CONFIG.siteId || '';
}

function withMemoriaSitePayload(payload = {}) {
  return {
    s: getMemoriaSiteId(),
    ...(payload && typeof payload === 'object' ? payload : {})
  };
}

function getCurrentUserIdentifier() {
  return normalizeBackendUserId(getSessionUserId()) || normalizeStorageIdentity(getSessionEmail()) || 'anonymous';
}


function isBooleanFlagPresent(value) {
  return value !== undefined && value !== null && String(value).trim() !== '';
}

function coerceBooleanFlag(value, fallback = false) {
  if (!isBooleanFlagPresent(value)) return fallback === null ? null : Boolean(fallback);
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value !== 0 : Boolean(fallback);

  const normalized = String(value).trim().toLowerCase();
  if (['true', '1', 'yes', 'y', 'si', 'sí', 'on', 'enabled', 'habilitado', 'archived', 'deleted', 'blocked'].includes(normalized)) return true;
  if (['false', '0', 'no', 'n', 'off', 'disabled', 'deshabilitado', 'null', 'undefined', 'none', ''].includes(normalized)) return false;
  return fallback === null ? null : Boolean(fallback);
}

function coerceFirstBooleanFlag(values = [], fallback = false) {
  const sourceValues = Array.isArray(values) ? values : [values];
  for (const value of sourceValues) {
    if (isBooleanFlagPresent(value)) return coerceBooleanFlag(value, fallback);
  }
  return fallback === null ? null : Boolean(fallback);
}

function normalizeParticipantIdentityKey(participant = {}) {
  if (!participant || typeof participant !== 'object') return '';
  const email = normalizeStorageIdentity(participant.email || participant.userEmail || participant.contactEmail || participant.mail || '');
  if (email) return `email:${email}`;
  const userId = normalizeBackendUserId(participant.userId || participant.contactUserId || participant.uid || participant.id || '');
  if (userId) return `user:${userId}`;
  const displayName = String(participant.displayName || participant.name || participant.alias || '').trim().toLowerCase();
  return displayName ? `name:${displayName}` : '';
}

function hashStableText(value = '') {
  let hash = 2166136261;
  const text = String(value || '');
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function buildSharedConversationKeyFromParticipants(participants = [], type = 'direct') {
  const identityKeys = (Array.isArray(participants) ? participants : [])
    .map(normalizeParticipantIdentityKey)
    .filter(Boolean)
    .sort();
  if (!identityKeys.length) return '';
  return `chater:${String(type || 'direct').trim() || 'direct'}:${hashStableText(identityKeys.join('|'))}`;
}

function getCurrentUserLifecycleParticipant() {
  const userId = normalizeBackendUserId(getSessionUserId());
  const email = normalizeStorageIdentity(getSessionEmail());
  if (!userId && !email) return null;
  return {
    ...(userId ? { userId } : {}),
    ...(email ? { email, userEmail: email, displayName: email, name: email } : {}),
    role: 'owner'
  };
}

function ensureCurrentUserInLifecycleParticipants(participants = []) {
  const normalizedParticipants = normalizeConversationParticipantsForApi(participants);
  const selfParticipant = getCurrentUserLifecycleParticipant();
  if (!selfParticipant) return normalizedParticipants;

  const selfKey = normalizeParticipantIdentityKey(selfParticipant);
  const hasSelf = normalizedParticipants.some((participant) => normalizeParticipantIdentityKey(participant) === selfKey);
  if (hasSelf) return normalizedParticipants;

  return normalizeConversationParticipantsForApi([selfParticipant, ...normalizedParticipants]);
}

function buildSharedConversationLifecycleMetadata(participants = [], options = {}) {
  const normalizedParticipants = ensureCurrentUserInLifecycleParticipants(participants);
  const participantCount = Math.max(
    1,
    Number(options.participantCount || 0) || 0,
    normalizedParticipants.length || 0
  );
  const conversationType = options.type || options.conversationType || 'direct';
  const sharedConversationKey = options.sharedConversationKey || buildSharedConversationKeyFromParticipants(normalizedParticipants, conversationType);

  return {
    sharedConversationKey,
    redisConversationKey: sharedConversationKey,
    redisChatKey: sharedConversationKey,
    conversationType,
    participantCount,
    deletionCounterInitial: participantCount,
    deletionCounterRemaining: participantCount,
    reuseExistingRedisChat: true,
    deleteFinalOnlyWhenAllParticipantsDeleted: true,
    visibilityMode: 'per-participant',
    lifecycleVersion: 1
  };
}

function resolveConversationParticipantCountHint(conversation = {}) {
  if (!conversation || typeof conversation !== 'object') return 0;
  const metadata = conversation.metadata && typeof conversation.metadata === 'object' ? conversation.metadata : {};
  const registry = conversation.deletionRegistry && typeof conversation.deletionRegistry === 'object' ? conversation.deletionRegistry : {};
  const localRegistry = conversation.localDeletionRegistry && typeof conversation.localDeletionRegistry === 'object' ? conversation.localDeletionRegistry : {};
  const participantRegistry = conversation.participantDeletionRegistry && typeof conversation.participantDeletionRegistry === 'object'
    ? conversation.participantDeletionRegistry
    : {};
  const metadataParticipantRegistry = metadata.participantDeletionRegistry && typeof metadata.participantDeletionRegistry === 'object'
    ? metadata.participantDeletionRegistry
    : {};
  const registryParticipantRegistry = registry.participantDeletionRegistry && typeof registry.participantDeletionRegistry === 'object'
    ? registry.participantDeletionRegistry
    : {};
  const localParticipantRegistry = localRegistry.participantDeletionRegistry && typeof localRegistry.participantDeletionRegistry === 'object'
    ? localRegistry.participantDeletionRegistry
    : {};

  const readCount = (value) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : 0;
  };

  const explicitCount = Math.max(
    readCount(conversation.participantCount),
    readCount(metadata.participantCount),
    readCount(conversation.deletionCounterInitial),
    readCount(metadata.deletionCounterInitial),
    readCount(participantRegistry.counterInitial),
    readCount(participantRegistry.participantCount),
    readCount(metadataParticipantRegistry.counterInitial),
    readCount(metadataParticipantRegistry.participantCount),
    readCount(registryParticipantRegistry.counterInitial),
    readCount(registryParticipantRegistry.participantCount),
    readCount(localParticipantRegistry.counterInitial),
    readCount(localParticipantRegistry.participantCount)
  );

  const remainingCount = Math.max(
    readCount(conversation.remainingParticipantCount),
    readCount(conversation.deletionCounterRemaining),
    readCount(metadata.remainingParticipantCount),
    readCount(metadata.deletionCounterRemaining),
    readCount(participantRegistry.counterRemaining),
    readCount(metadataParticipantRegistry.counterRemaining),
    readCount(registryParticipantRegistry.counterRemaining),
    readCount(localParticipantRegistry.counterRemaining)
  );
  const deletedParticipantCount = getConversationDeletedParticipantIdentityKeys(conversation).size;
  const inferredCount = remainingCount || deletedParticipantCount
    ? Math.max(remainingCount + deletedParticipantCount, deletedParticipantCount)
    : 0;

  return Math.max(explicitCount, inferredCount, 0);
}

function hasRemoteLifecycleParticipant(participants = []) {
  const selfKey = normalizeLifecycleIdentityKeyFromValue(getCurrentUserLifecycleParticipant());
  return (Array.isArray(participants) ? participants : []).some((participant) => {
    const participantKey = normalizeLifecycleIdentityKeyFromValue(participant);
    return participantKey && (!selfKey || participantKey !== selfKey);
  });
}

function shouldRepairConversationSharedLifecycleKey(explicitKey = '', canonicalKey = '', participants = [], conversationType = 'direct') {
  const normalizedExplicitKey = String(explicitKey || '').trim();
  const normalizedCanonicalKey = String(canonicalKey || '').trim();
  if (!normalizedCanonicalKey) return false;
  if (!normalizedExplicitKey) return true;
  if (normalizedExplicitKey === normalizedCanonicalKey) return false;
  if (!hasRemoteLifecycleParticipant(participants)) return false;

  const selfParticipant = getCurrentUserLifecycleParticipant();
  const selfOnlyKey = selfParticipant
    ? buildSharedConversationKeyFromParticipants([selfParticipant], conversationType)
    : '';

  // Iteraciones anteriores podían guardar la clave Redis solo con el usuario actual.
  // Esa clave rompe la reutilización del mismo chat por todos los participantes;
  // cuando se detecta ese caso se repara con la clave canónica de participantes.
  return Boolean(selfOnlyKey && normalizedExplicitKey === selfOnlyKey);
}

function resolveConversationSharedLifecycleKey(conversation = {}, participants = [], conversationType = 'direct') {
  const metadata = conversation.metadata && typeof conversation.metadata === 'object' ? conversation.metadata : {};
  const candidates = [
    conversation.sharedConversationKey,
    conversation.redisConversationKey,
    conversation.redisChatKey,
    metadata.sharedConversationKey,
    metadata.redisConversationKey,
    metadata.redisChatKey
  ]
    .map((candidate) => String(candidate || '').trim())
    .filter(Boolean);
  const canonicalKey = buildSharedConversationKeyFromParticipants(participants, conversationType);
  const stableExplicitKey = candidates.find((candidate) => {
    return !shouldRepairConversationSharedLifecycleKey(candidate, canonicalKey, participants, conversationType);
  }) || candidates[0] || '';

  return shouldRepairConversationSharedLifecycleKey(stableExplicitKey, canonicalKey, participants, conversationType)
    ? canonicalKey
    : (stableExplicitKey || canonicalKey);
}

function buildConversationSharedLifecycleMetadata(conversation = {}) {
  const metadata = conversation.metadata && typeof conversation.metadata === 'object' ? conversation.metadata : {};
  const participants = ensureCurrentUserInLifecycleParticipants(normalizeConversationParticipantsForApi(
    conversation.participants,
    conversation.email || conversation.contactEmail || metadata.email || metadata.contactEmail,
    conversation.name || conversation.displayName || metadata.name || metadata.displayName
  ));
  const conversationType = conversation.type || conversation.conversationType || metadata.type || metadata.conversationType || 'direct';
  const sharedConversationKey = resolveConversationSharedLifecycleKey(conversation, participants, conversationType);

  return buildSharedConversationLifecycleMetadata(participants, {
    type: conversationType,
    participantCount: resolveConversationParticipantCountHint(conversation),
    sharedConversationKey
  });
}


function getConversationSharedMergeKey(conversation = {}) {
  if (!conversation || typeof conversation !== 'object') return '';
  const metadata = conversation.metadata && typeof conversation.metadata === 'object' ? conversation.metadata : {};
  const key = conversation.sharedConversationKey
    || conversation.redisConversationKey
    || conversation.redisChatKey
    || metadata.sharedConversationKey
    || metadata.redisConversationKey
    || metadata.redisChatKey
    || '';
  return String(key || '').trim();
}

function normalizeLifecycleIdentityKeyFromValue(value = {}) {
  if (!value) return '';
  if (typeof value === 'string') {
    const rawValue = String(value || '').trim();
    const loweredValue = rawValue.toLowerCase();
    if (loweredValue.startsWith('email:')) {
      const email = normalizeStorageIdentity(rawValue.slice(6));
      return email ? `email:${email}` : '';
    }
    if (loweredValue.startsWith('user:')) {
      const userId = normalizeBackendUserId(rawValue.slice(5));
      return userId ? `user:${userId}` : '';
    }
    const email = normalizeStorageIdentity(rawValue);
    if (email && email.includes('@')) return `email:${email}`;
    const userId = normalizeBackendUserId(rawValue);
    return userId ? `user:${userId}` : '';
  }
  if (typeof value !== 'object') return '';
  return normalizeParticipantIdentityKey(value);
}

function collectLifecycleIdentityKeys(source = null) {
  const keys = new Set();
  const collect = (value) => {
    if (!value) return;
    if (Array.isArray(value)) {
      value.forEach(collect);
      return;
    }
    if (typeof value === 'object') {
      const directKey = normalizeLifecycleIdentityKeyFromValue(value);
      if (directKey) keys.add(directKey);
      [
        value.deletedParticipants,
        value.deletedParticipant,
        value.deletedParticipantIds,
        value.deletedParticipantEmails,
        value.deletedByParticipants,
        value.hiddenForParticipants,
        value.hiddenForUserEmails,
        value.restoredParticipants,
        value.restoredParticipant,
        value.deletionRegistry?.deletedParticipants,
        value.deletionRegistry?.hiddenForParticipants,
        value.participantDeletionRegistry?.deletedParticipants,
        value.participantDeletionRegistry?.deletedParticipantIdentityKeys
      ].forEach(collect);
      return;
    }
    const key = normalizeLifecycleIdentityKeyFromValue(value);
    if (key) keys.add(key);
  };

  collect(source);
  return keys;
}

function getConversationParticipantIdentityKeys(conversation = {}) {
  const participants = normalizeConversationParticipantsForApi(
    conversation.participants,
    conversation.email || conversation.contactEmail,
    conversation.name || conversation.displayName
  );
  return new Set(participants.map(normalizeParticipantIdentityKey).filter(Boolean));
}

function getConversationDeletionRegistrySources(conversation = {}) {
  const metadata = conversation.metadata && typeof conversation.metadata === 'object' ? conversation.metadata : {};
  const localRegistry = conversation.localDeletionRegistry && typeof conversation.localDeletionRegistry === 'object'
    ? conversation.localDeletionRegistry
    : {};
  const registry = conversation.deletionRegistry && typeof conversation.deletionRegistry === 'object'
    ? conversation.deletionRegistry
    : {};

  return [
    ...getDeletionRegistrySources(conversation, metadata),
    conversation.deletedParticipant,
    conversation.deletedParticipants,
    conversation.deletedParticipantIdentityKeys,
    conversation.deletedByParticipantIdentityKeys,
    conversation.participantDeletionRegistry,
    conversation.participantDeletionRegistry?.deletedParticipants,
    conversation.participantDeletionRegistry?.deletedParticipantIdentityKeys,
    registry.deletedParticipants,
    registry.deletedParticipantIdentityKeys,
    registry.hiddenForParticipants,
    registry.participantDeletionRegistry,
    registry.participantDeletionRegistry?.deletedParticipants,
    registry.participantDeletionRegistry?.deletedParticipantIdentityKeys,
    localRegistry.deletedParticipant,
    localRegistry.deletedParticipants,
    localRegistry.deletedParticipantIdentityKeys,
    localRegistry.deletedByParticipantIdentityKeys,
    localRegistry.deletionRegistry?.deletedParticipants,
    localRegistry.deletionRegistry?.deletedParticipantIdentityKeys,
    localRegistry.participantDeletionRegistry?.deletedParticipants,
    localRegistry.participantDeletionRegistry?.deletedParticipantIdentityKeys
  ];
}

function getConversationDeletedParticipantIdentityKeys(conversation = {}) {
  const keys = new Set();
  getConversationDeletionRegistrySources(conversation).forEach((source) => {
    collectLifecycleIdentityKeys(source).forEach((key) => keys.add(key));
  });
  return keys;
}

function stripLifecycleIdentityKeyFromDeletionSource(source = null, identityKey = '') {
  const normalizedIdentityKey = String(identityKey || '').trim();
  if (!source || !normalizedIdentityKey) return source;

  if (Array.isArray(source)) {
    return source
      .map((item) => stripLifecycleIdentityKeyFromDeletionSource(item, normalizedIdentityKey))
      .filter((item) => {
        if (!item) return false;
        const itemKey = normalizeLifecycleIdentityKeyFromValue(item);
        return !itemKey || itemKey !== normalizedIdentityKey;
      });
  }

  if (typeof source !== 'object') {
    const sourceKey = normalizeLifecycleIdentityKeyFromValue(source);
    return sourceKey && sourceKey === normalizedIdentityKey ? '' : source;
  }

  const lifecycleKeys = [
    'deletedParticipant',
    'deletedParticipants',
    'deletedParticipantIds',
    'deletedParticipantEmails',
    'deletedParticipantIdentityKeys',
    'deletedByParticipantIdentityKeys',
    'deletedByParticipants',
    'hiddenForParticipants',
    'hiddenForUserEmails',
    'participantDeletionRegistry',
    'deletionRegistry',
    'localDeletionRegistry'
  ];
  const hasNestedLifecycleData = lifecycleKeys.some((key) => Object.prototype.hasOwnProperty.call(source, key));
  const directKey = normalizeLifecycleIdentityKeyFromValue(source);
  if (directKey && directKey === normalizedIdentityKey && !hasNestedLifecycleData) return null;

  const cloned = { ...source };
  lifecycleKeys.forEach((key) => {
    if (!Object.prototype.hasOwnProperty.call(cloned, key)) return;
    cloned[key] = stripLifecycleIdentityKeyFromDeletionSource(cloned[key], normalizedIdentityKey);
  });
  return cloned;
}

function stripCurrentParticipantFromDeletionSource(source = null) {
  const actorKey = normalizeLifecycleIdentityKeyFromValue(getCurrentParticipantLifecycleIdentity());
  return stripLifecycleIdentityKeyFromDeletionSource(source, actorKey);
}

function getConversationDeletionCounterState(conversation = {}, actor = getCurrentParticipantLifecycleIdentity()) {
  const lifecycle = buildConversationSharedLifecycleMetadata(conversation);
  const participantKeys = getConversationParticipantIdentityKeys(conversation);
  const deletedBeforeKeys = getConversationDeletedParticipantIdentityKeys(conversation);
  const actorKey = normalizeLifecycleIdentityKeyFromValue(actor);
  const deletedAfterKeys = new Set(deletedBeforeKeys);
  if (actorKey) deletedAfterKeys.add(actorKey);

  const participantCount = Math.max(
    Number(lifecycle.participantCount || 0) || 0,
    participantKeys.size,
    1
  );
  const deletedBeforeCount = Math.min(deletedBeforeKeys.size, participantCount);
  const deletedAfterCount = Math.min(deletedAfterKeys.size, participantCount);
  const remainingCount = Math.max(participantCount - deletedAfterCount, 0);

  return {
    participantCount,
    deletedBeforeCount,
    deletedAfterCount,
    remainingCount,
    actorIdentityKey: actorKey,
    deletedParticipantIdentityKeys: Array.from(deletedAfterKeys),
    deletedParticipants: [actor].filter(Boolean)
  };
}

function getConversationRestoreCounterState(conversation = {}, actor = getCurrentParticipantLifecycleIdentity()) {
  const lifecycle = buildConversationSharedLifecycleMetadata(conversation);
  const participantKeys = getConversationParticipantIdentityKeys(conversation);
  const deletedBeforeKeys = getConversationDeletedParticipantIdentityKeys(conversation);
  const actorKey = normalizeLifecycleIdentityKeyFromValue(actor);
  const deletedAfterKeys = new Set(deletedBeforeKeys);
  if (actorKey) deletedAfterKeys.delete(actorKey);

  const participantCount = Math.max(
    Number(lifecycle.participantCount || 0) || 0,
    participantKeys.size,
    1
  );
  const deletedBeforeCount = Math.min(deletedBeforeKeys.size, participantCount);
  const deletedAfterCount = Math.min(deletedAfterKeys.size, participantCount);
  const remainingCount = Math.max(participantCount - deletedAfterCount, 0);

  return {
    participantCount,
    deletedBeforeCount,
    deletedAfterCount,
    remainingCount,
    actorIdentityKey: actorKey,
    deletedParticipantIdentityKeys: Array.from(deletedAfterKeys)
  };
}

function buildLocalConversationIdForContact(contact = {}) {
  const participants = buildConversationCreateParticipants(contact);
  const lifecycle = buildSharedConversationLifecycleMetadata(participants, { type: 'direct' });
  if (lifecycle.sharedConversationKey) return `chat-${hashStableText(lifecycle.sharedConversationKey)}`;
  const normalizedContact = normalizeContactCreationInput(contact);
  return `chat-${normalizedContact.email || Date.now()}`;
}

function getCurrentParticipantLifecycleIdentity() {
  return {
    userId: normalizeBackendUserId(getSessionUserId()) || normalizeBackendUserId(getCurrentUserIdentifier()),
    userEmail: normalizeStorageIdentity(getSessionEmail()),
    email: normalizeStorageIdentity(getSessionEmail()),
    displayName: normalizeStorageIdentity(getSessionEmail()) || 'Usuario actual'
  };
}

function buildConversationParticipantDeletionPayload(conversation = {}, options = {}) {
  const deletedAt = options.deletedAt || new Date().toISOString();
  const clientMutationId = options.clientMutationId || generateClientMutationId();
  const lifecycle = buildConversationSharedLifecycleMetadata(conversation);
  const actor = getCurrentParticipantLifecycleIdentity();
  const counterState = getConversationDeletionCounterState(conversation, actor);

  return {
    mode: 'hide_for_actor',
    visibilityScope: 'actor_only',
    internalOnly: true,
    visibleInChat: false,
    deletedAt,
    actorDeletedAt: deletedAt,
    actorUserId: actor.userId,
    actorUserEmail: actor.userEmail,
    actorIdentityKey: counterState.actorIdentityKey,
    deletedByUserId: actor.userId,
    deletedByUserEmail: actor.userEmail,
    deletedForCurrentUser: true,
    isDeletedForCurrentUser: true,
    hiddenForCurrentUser: true,
    deletedParticipant: actor,
    deletedParticipants: counterState.deletedParticipants,
    deletedParticipantIdentityKeys: counterState.deletedParticipantIdentityKeys,
    sharedConversationKey: lifecycle.sharedConversationKey,
    redisConversationKey: lifecycle.redisConversationKey,
    redisChatKey: lifecycle.redisChatKey,
    participantCount: counterState.participantCount,
    remainingParticipantCount: counterState.remainingCount,
    deletionCounterInitial: counterState.participantCount,
    deletionCounterBefore: counterState.participantCount - counterState.deletedBeforeCount,
    deletionCounterAfter: counterState.remainingCount,
    deletionCounterRemaining: counterState.remainingCount,
    deletedParticipantCountBefore: counterState.deletedBeforeCount,
    deletedParticipantCountAfter: counterState.deletedAfterCount,
    deletionRegistry: {
      internalOnly: true,
      visibleInChat: false,
      deletedParticipants: counterState.deletedParticipants,
      deletedParticipantIdentityKeys: counterState.deletedParticipantIdentityKeys,
      deletedAt,
      updatedAt: deletedAt
    },
    participantDeletionRegistry: {
      counterInitial: counterState.participantCount,
      counterRemaining: counterState.remainingCount,
      deleteWhenRemainingParticipants: 0,
      deletedParticipantIdentityKeys: counterState.deletedParticipantIdentityKeys,
      internalOnly: true,
      visibleInChat: false
    },
    deleteRedisWhenRemainingCountIsZero: true,
    deleteFinalOnlyWhenAllParticipantsDeleted: true,
    reuseExistingRedisChat: true,
    clientMutationId
  };
}

function buildConversationParticipantRestorePayload(conversation = {}, options = {}) {
  const restoredAt = options.restoredAt || new Date().toISOString();
  const clientMutationId = options.clientMutationId || generateClientMutationId();
  const lifecycle = buildConversationSharedLifecycleMetadata(conversation);
  const actor = getCurrentParticipantLifecycleIdentity();
  const counterState = getConversationRestoreCounterState(conversation, actor);

  return {
    mode: 'restore_for_actor',
    visibilityScope: 'actor_only',
    internalOnly: true,
    visibleInChat: false,
    restoredAt,
    actorRestoredAt: restoredAt,
    actorUserId: actor.userId,
    actorUserEmail: actor.userEmail,
    actorIdentityKey: counterState.actorIdentityKey,
    restoredByUserId: actor.userId,
    restoredByUserEmail: actor.userEmail,
    restoredParticipant: actor,
    restoredParticipantIdentityKey: counterState.actorIdentityKey,
    deletedForCurrentUser: false,
    isDeletedForCurrentUser: false,
    hiddenForCurrentUser: false,
    removeActorFromDeletionRegistry: true,
    sharedConversationKey: lifecycle.sharedConversationKey,
    redisConversationKey: lifecycle.redisConversationKey,
    redisChatKey: lifecycle.redisChatKey,
    participantCount: counterState.participantCount,
    remainingParticipantCount: counterState.remainingCount,
    deletionCounterInitial: counterState.participantCount,
    deletionCounterBefore: counterState.participantCount - counterState.deletedBeforeCount,
    deletionCounterAfter: counterState.remainingCount,
    deletionCounterRemaining: counterState.remainingCount,
    deletedParticipantCountBefore: counterState.deletedBeforeCount,
    deletedParticipantCountAfter: counterState.deletedAfterCount,
    deletedParticipantIdentityKeys: counterState.deletedParticipantIdentityKeys,
    deletionRegistry: {
      internalOnly: true,
      visibleInChat: false,
      deletedParticipantIdentityKeys: counterState.deletedParticipantIdentityKeys,
      restoredParticipant: actor,
      restoredAt,
      updatedAt: restoredAt
    },
    participantDeletionRegistry: {
      counterInitial: counterState.participantCount,
      counterRemaining: counterState.remainingCount,
      deleteWhenRemainingParticipants: 0,
      deletedParticipantIdentityKeys: counterState.deletedParticipantIdentityKeys,
      internalOnly: true,
      visibleInChat: false
    },
    restoreExistingRedisChat: true,
    reuseExistingRedisChat: true,
    clientMutationId
  };
}

function normalizeIdentityList(value = []) {
  const items = Array.isArray(value) ? value : (value ? [value] : []);
  return items.flatMap((item) => {
    if (!item) return [];
    if (typeof item === 'string') {
      const lifecycleKey = normalizeLifecycleIdentityKeyFromValue(item);
      return [
        lifecycleKey,
        normalizeStorageIdentity(item),
        normalizeBackendUserId(item)
      ].filter(Boolean);
    }
    if (typeof item !== 'object') return [];
    return [
      normalizeLifecycleIdentityKeyFromValue(item),
      normalizeStorageIdentity(item.email || item.userEmail || item.contactEmail || item.actorUserEmail || item.deletedByUserEmail || ''),
      normalizeBackendUserId(item.userId || item.actorUserId || item.deletedByUserId || item.uid || item.id || '')
    ].filter(Boolean);
  });
}

function getDeletionRegistrySources(raw = {}, metadata = {}) {
  return [
    raw.deletedParticipant,
    raw.deletedParticipants,
    raw.deletedParticipantIds,
    raw.deletedParticipantEmails,
    raw.deletedParticipantIdentityKeys,
    raw.deletedByParticipantIdentityKeys,
    raw.deletedByParticipants,
    raw.hiddenForParticipants,
    raw.hiddenForUserEmails,
    raw.participantDeletionRegistry,
    raw.participantDeletionRegistry?.deletedParticipants,
    raw.participantDeletionRegistry?.deletedParticipantIdentityKeys,
    metadata.deletedParticipant,
    metadata.deletedParticipants,
    metadata.deletedParticipantIds,
    metadata.deletedParticipantEmails,
    metadata.deletedParticipantIdentityKeys,
    metadata.deletedByParticipantIdentityKeys,
    metadata.deletedByParticipants,
    metadata.hiddenForParticipants,
    metadata.hiddenForUserEmails,
    metadata.participantDeletionRegistry,
    metadata.participantDeletionRegistry?.deletedParticipants,
    metadata.participantDeletionRegistry?.deletedParticipantIdentityKeys,
    raw.deletionRegistry?.deletedParticipants,
    raw.deletionRegistry?.deletedParticipantIdentityKeys,
    raw.deletionRegistry?.hiddenForParticipants,
    raw.deletionRegistry?.participantDeletionRegistry,
    raw.deletionRegistry?.participantDeletionRegistry?.deletedParticipants,
    raw.deletionRegistry?.participantDeletionRegistry?.deletedParticipantIdentityKeys,
    metadata.deletionRegistry?.deletedParticipants,
    metadata.deletionRegistry?.deletedParticipantIdentityKeys,
    metadata.deletionRegistry?.hiddenForParticipants,
    metadata.deletionRegistry?.participantDeletionRegistry,
    metadata.deletionRegistry?.participantDeletionRegistry?.deletedParticipants,
    metadata.deletionRegistry?.participantDeletionRegistry?.deletedParticipantIdentityKeys
  ];
}

function deletionRegistryIncludesCurrentUser(raw = {}, metadata = {}) {
  const selfEmail = normalizeStorageIdentity(getSessionEmail());
  const selfUserId = normalizeBackendUserId(getSessionUserId()) || normalizeBackendUserId(getCurrentUserIdentifier());
  const selfIdentityKeys = new Set([
    selfEmail,
    selfUserId,
    selfEmail ? `email:${selfEmail}` : '',
    selfUserId ? `user:${selfUserId}` : ''
  ].filter(Boolean));
  if (!selfIdentityKeys.size) return false;

  return getDeletionRegistrySources(raw, metadata).some((source) => {
    const identities = new Set([
      ...normalizeIdentityList(source),
      ...Array.from(collectLifecycleIdentityKeys(source))
    ].filter(Boolean));
    return Array.from(identities).some((identity) => selfIdentityKeys.has(identity));
  });
}

function hasParticipantDeletionRegistry(raw = {}, metadata = {}) {
  return getDeletionRegistrySources(raw, metadata).some((source) => {
    if (!source) return false;
    if (Array.isArray(source)) return source.length > 0;
    if (typeof source === 'object') {
      if (collectLifecycleIdentityKeys(source).size > 0) return true;
      return Object.entries(source).some(([key, value]) => {
        if (['internalOnly', 'visibleInChat'].includes(key)) return false;
        if (Array.isArray(value)) return value.length > 0;
        if (value && typeof value === 'object') return collectLifecycleIdentityKeys(value).size > 0 || Object.keys(value).length > 0;
        return value !== undefined && value !== null && value !== '';
      });
    }
    return String(source || '').trim() !== '';
  });
}

function resolveConversationDeletedForCurrentUser(raw = {}, metadata = {}) {
  const explicitForCurrentUser = coerceFirstBooleanFlag([
    raw.deletedForCurrentUser,
    raw.isDeletedForCurrentUser,
    raw.deletedForMe,
    raw.isDeletedForMe,
    raw.hiddenForCurrentUser,
    raw.isHiddenForCurrentUser,
    metadata.deletedForCurrentUser,
    metadata.deletedForMe,
    metadata.hiddenForCurrentUser
  ], null);

  if (explicitForCurrentUser !== null) return explicitForCurrentUser;
  if (deletionRegistryIncludesCurrentUser(raw, metadata)) return true;
  if (hasParticipantDeletionRegistry(raw, metadata)) return false;
  return coerceFirstBooleanFlag([raw.deleted, raw.isDeleted], false);
}

function resolveConversationArchivedForCurrentUser(raw = {}, metadata = {}) {
  return coerceFirstBooleanFlag([
    raw.archivedForCurrentUser,
    raw.isArchivedForCurrentUser,
    raw.archivedForMe,
    raw.isArchivedForMe,
    metadata.archivedForCurrentUser,
    metadata.archivedForMe,
    raw.archived,
    raw.isArchived
  ], false);
}

function normalizeProfileAvatarImage(value = '') {
  return normalizeAssetImagePath(value);
}

function readProfileAvatarCandidate(source = {}) {
  if (!source || typeof source !== 'object') return '';
  const publicData = source.publicData && typeof source.publicData === 'object' ? source.publicData : {};
  const metadata = source.metadata && typeof source.metadata === 'object' ? source.metadata : {};
  const profile = source.profile && typeof source.profile === 'object' ? source.profile : {};
  const contact = source.contact && typeof source.contact === 'object' ? source.contact : {};
  return normalizeProfileAvatarImage(
    source.avatarImage
    || source.avatarAsset
    || source.profileImage
    || source.avatarUrl
    || source.photoUrl
    || source.photoURL
    || source.picture
    || source.imageUrl
    || source.profileImageUrl
    || publicData.avatarImage
    || publicData.avatarAsset
    || publicData.profileImage
    || publicData.avatarUrl
    || publicData.photoUrl
    || publicData.photoURL
    || publicData.picture
    || publicData.imageUrl
    || publicData.profileImageUrl
    || metadata.avatarImage
    || metadata.avatarAsset
    || metadata.profileImage
    || metadata.avatarUrl
    || metadata.photoUrl
    || metadata.photoURL
    || metadata.picture
    || metadata.imageUrl
    || metadata.profileImageUrl
    || profile.avatarImage
    || profile.avatarAsset
    || profile.profileImage
    || profile.avatarUrl
    || profile.photoUrl
    || profile.photoURL
    || profile.picture
    || profile.imageUrl
    || profile.profileImageUrl
    || contact.avatarImage
    || contact.avatarAsset
    || contact.profileImage
    || contact.avatarUrl
    || contact.photoUrl
    || contact.photoURL
    || contact.picture
    || contact.imageUrl
    || contact.profileImageUrl
    || ''
  );
}

function withProfileAvatarAliases(base = {}, avatarImage = '') {
  const normalizedAvatar = normalizeProfileAvatarImage(avatarImage);
  if (!normalizedAvatar) return base;
  return {
    ...base,
    avatarImage: normalizedAvatar,
    profileImage: normalizedAvatar,
    avatarUrl: normalizedAvatar,
    photoUrl: normalizedAvatar,
    picture: normalizedAvatar,
    profileImageUrl: normalizedAvatar
  };
}

function normalizeConversationParticipantForApi(participant = {}, fallbackRole = 'participant') {
  if (!participant || typeof participant !== 'object') return null;

  const email = normalizeStorageIdentity(
    participant.email
    || participant.userEmail
    || participant.contactEmail
    || participant.mail
    || ''
  );
  const userId = normalizeBackendUserId(
    participant.userId
    || participant.internalUserId
    || participant.uid
    || participant.id
    || ''
  );
  const displayName = String(
    participant.displayName
    || participant.name
    || participant.alias
    || email
    || ''
  ).trim();
  const avatarImage = readProfileAvatarCandidate(participant);

  if (!email && !userId && !displayName) return null;

  return withProfileAvatarAliases({
    ...(userId ? { userId } : {}),
    ...(email ? { email, userEmail: email } : {}),
    ...(displayName ? { displayName, name: displayName } : {}),
    role: participant.role || participant.kind || fallbackRole
  }, avatarImage);
}

function normalizeConversationParticipantsForApi(participants = [], fallbackEmail = '', fallbackName = '') {
  const sourceParticipants = Array.isArray(participants) ? participants : [];
  const normalized = [];
  const seen = new Set();

  const addParticipant = (participant, fallbackRole = 'participant') => {
    const normalizedParticipant = normalizeConversationParticipantForApi(participant, fallbackRole);
    if (!normalizedParticipant) return;
    const identity = normalizedParticipant.email || normalizedParticipant.userId || normalizedParticipant.displayName;
    const identityKey = String(identity || '').trim().toLowerCase();
    if (!identityKey || seen.has(identityKey)) return;
    seen.add(identityKey);
    normalized.push(normalizedParticipant);
  };

  sourceParticipants.forEach((participant) => addParticipant(participant));

  const contactEmail = normalizeStorageIdentity(fallbackEmail);
  if (contactEmail) {
    addParticipant({
      email: contactEmail,
      displayName: String(fallbackName || contactEmail).trim(),
      role: 'contact'
    }, 'contact');
  }

  return normalized;
}

function getConversationDisplayParticipant(participants = []) {
  if (!Array.isArray(participants) || !participants.length) return null;
  const selfEmail = normalizeStorageIdentity(getSessionEmail());
  const nonSelf = participants.find((participant) => {
    const participantEmail = normalizeStorageIdentity(participant.email || participant.userEmail || '');
    return participantEmail && participantEmail !== selfEmail;
  });

  return nonSelf || participants.find((participant) => participant.email || participant.displayName || participant.name) || null;
}

function buildCommunicationSessionParticipants(conversationId = '') {
  const conversation = appState?.conversations?.find((item) => String(item.id || '') === String(conversationId || '')) || {};
  const selfEmail = normalizeStorageIdentity(getSessionEmail());
  const selfUserId = normalizeBackendUserId(getSessionUserId()) || normalizeBackendUserId(getCurrentUserIdentifier());
  const participants = [];
  const seen = new Set();

  const addParticipant = (participant = {}, fallbackRole = 'participant') => {
    const normalizedParticipant = normalizeConversationParticipantForApi(participant, fallbackRole);
    if (!normalizedParticipant) return;
    const identity = normalizedParticipant.email || normalizedParticipant.userId || normalizedParticipant.displayName;
    const identityKey = String(identity || '').trim().toLowerCase();
    if (!identityKey || seen.has(identityKey)) return;
    seen.add(identityKey);
    participants.push(normalizedParticipant);
  };

  addParticipant({
    userId: selfUserId,
    email: selfEmail,
    displayName: selfEmail,
    role: 'initiator'
  }, 'initiator');

  normalizeConversationParticipantsForApi(conversation.participants, conversation.email || conversation.contactEmail, conversation.name || conversation.displayName)
    .forEach((participant) => {
      const participantEmail = normalizeStorageIdentity(participant.email || participant.userEmail || '');
      const participantUserId = normalizeBackendUserId(participant.userId || '');
      if ((selfEmail && participantEmail === selfEmail) || (selfUserId && participantUserId === selfUserId)) return;
      addParticipant({ ...participant, role: participant.role || 'participant' }, 'participant');
    });

  return participants.length ? participants : [{ email: selfEmail || getSessionEmail(), role: 'initiator' }];
}

function buildConversationCreateParticipants(contact = {}) {
  const contactEmail = normalizeStorageIdentity(contact.email || contact.contactEmail || contact.userEmail || '');
  const contactDisplayName = String(contact.name || contact.displayName || contact.alias || contactEmail || '').trim();
  const ownerUserId = normalizeBackendUserId(getSessionUserId());
  const contactUserId = normalizeBackendUserId(
    contact.userId
    || contact.contactUserId
    || contact.internalUserId
    || contact.uid
    || contact.id
    || ''
  );

  return normalizeConversationParticipantsForApi([
    {
      ...(ownerUserId ? { userId: ownerUserId } : {}),
      email: getSessionEmail(),
      displayName: getSessionEmail(),
      role: 'owner'
    },
    withProfileAvatarAliases({
      ...(contactUserId ? { userId: contactUserId } : {}),
      email: contactEmail,
      displayName: contactDisplayName,
      role: 'contact'
    }, readProfileAvatarCandidate(contact))
  ]);
}

function getPrimaryRemoteParticipant(participants = []) {
  const displayParticipant = getConversationDisplayParticipant(participants);
  const selfEmail = normalizeStorageIdentity(getSessionEmail());
  const participantEmail = normalizeStorageIdentity(displayParticipant?.email || displayParticipant?.userEmail || '');
  if (participantEmail && participantEmail !== selfEmail) return displayParticipant;
  return participants.find((participant) => {
    const email = normalizeStorageIdentity(participant.email || participant.userEmail || '');
    return email && email !== selfEmail;
  }) || null;
}

function normalizeApiCollectionPayload(payload = {}, collectionKey = '') {
  if (!payload || typeof payload !== 'object' || !collectionKey) return payload;

  const aliases = getApiCollectionAliases(collectionKey);
  const collection = findFirstApiArray(payload, aliases);
  if (collection && !Array.isArray(payload[collectionKey])) {
    return { ...payload, [collectionKey]: collection };
  }

  return payload;
}

function getApiCollectionAliases(collectionKey = '') {
  const normalizedKey = String(collectionKey || '').trim();
  const aliasesByCollection = {
    conversations: ['conversations', 'conversation', 'chats', 'chat', 'conversaciones', 'conversacion', 'items', 'records'],
    chats: ['chats', 'chat', 'conversations', 'conversation', 'conversaciones', 'conversacion', 'items', 'records'],
    messages: ['messages', 'message', 'mensajes', 'mensaje', 'items', 'records'],
    mensajes: ['mensajes', 'mensaje', 'messages', 'message', 'items', 'records'],
    states: ['states', 'state', 'statuses', 'status', 'estados', 'estado', 'publicaciones', 'publicacion', 'publicacionesEfimeras', 'publicacionEfimera', 'publicaciones_efimeras', 'publicacion_efimera', 'items', 'records'],
    calls: ['calls', 'call', 'history', 'sesiones', 'sesion', 'sesionesComunicacion', 'sesionComunicacion', 'sesiones_comunicacion', 'sesion_comunicacion', 'llamadas', 'llamada', 'items', 'records'],
    history: ['history', 'calls', 'call', 'sesiones', 'sesion', 'sesionesComunicacion', 'sesionComunicacion', 'llamadas', 'llamada', 'items', 'records'],
    searchResults: ['searchResults', 'results', 'resultados', 'busqueda', 'coincidencias', 'items', 'records'],
    busqueda: ['busqueda', 'resultados', 'searchResults', 'results', 'coincidencias', 'items', 'records']
  };

  const aliases = aliasesByCollection[normalizedKey] || [normalizedKey, 'items', 'records'];
  return [...new Set(aliases.filter(Boolean))];
}

function getApiEntityAliases(entityKeys = []) {
  const sharedRecordAliases = ['record', 'registro', 'item'];
  const aliasesByEntity = {
    conversation: ['conversation', 'chat', 'conversacion', ...sharedRecordAliases],
    chat: ['chat', 'conversation', 'conversacion', ...sharedRecordAliases],
    message: ['message', 'mensaje', ...sharedRecordAliases],
    state: ['state', 'status', 'estado', 'publicacion', 'publicacionEfimera', 'publicacion_efimera', ...sharedRecordAliases],
    call: ['call', 'sesion', 'sesionComunicacion', 'sesion_comunicacion', 'llamada'],
    promotion: ['promotion', 'statePromotion', 'promocion', 'promocionEstado'],
    statePromotion: ['statePromotion', 'promotion', 'promocionEstado', 'promocion'],
    upload: ['upload', 'subida', 'intent', 'intencion'],
    image: ['image', 'imagen'],
    media: ['media', 'archivo', 'file', 'asset'],
    file: ['file', 'archivo', 'media', 'asset'],
    read: ['read', 'download', 'descarga', 'urlDescarga']
  };

  const baseKeys = Array.isArray(entityKeys) ? entityKeys : [entityKeys];
  const aliases = [];
  baseKeys.forEach((key) => {
    const normalizedKey = String(key || '').trim();
    if (!normalizedKey) return;
    aliases.push(normalizedKey, ...(aliasesByEntity[normalizedKey] || []));
  });
  aliases.push(...sharedRecordAliases);

  return [...new Set(aliases.filter(Boolean))];
}

function getApiPayloadContainers(payload = {}) {
  const containers = [];
  const visit = (candidate) => {
    if (!candidate || typeof candidate !== 'object' || containers.includes(candidate)) return;
    containers.push(candidate);
    ['data', 'result', 'payload', 'body', 'response'].forEach((key) => {
      if (candidate[key] && typeof candidate[key] === 'object') visit(candidate[key]);
    });
  };

  visit(payload);
  return containers;
}

function findFirstApiArray(payload = {}, aliases = []) {
  const containers = getApiPayloadContainers(payload);
  for (const container of containers) {
    if (Array.isArray(container)) return container;
    for (const alias of aliases) {
      if (Array.isArray(container?.[alias])) return container[alias];
    }
  }
  return null;
}

function normalizeBackendUserId(value = '') {
  const normalized = String(value || '').trim();
  if (!normalized || normalized.toLowerCase() === 'anonymous') return '';
  return normalized;
}

function extractBackendUserIdFromPayload(payload = {}) {
  if (!payload || typeof payload !== 'object') return '';

  const containers = getApiPayloadContainers(payload);
  const directKeys = ['internalUserId', 'userId', 'uid', 'sub'];
  const nestedDirectKeys = [...directKeys, 'id'];
  const nestedKeys = ['user', 'profile', 'perfil', 'account', 'cuenta', 'session', 'auth'];

  for (const container of containers) {
    for (const nestedKey of nestedKeys) {
      const nested = container?.[nestedKey];
      if (!nested || typeof nested !== 'object') continue;
      for (const directKey of nestedDirectKeys) {
        const candidate = normalizeBackendUserId(nested[directKey]);
        if (candidate && candidate !== normalizeStorageIdentity(nested.email || container.email || '')) return candidate;
      }
    }

    for (const directKey of directKeys) {
      const candidate = normalizeBackendUserId(container?.[directKey]);
      if (candidate && candidate !== normalizeStorageIdentity(container?.email || '')) return candidate;
    }

    if (container?.email || container?.userEmail || container?.correo) {
      const candidate = normalizeBackendUserId(container?.id);
      if (candidate && candidate !== normalizeStorageIdentity(container.email || container.userEmail || container.correo || '')) return candidate;
    }
  }

  return '';
}

function persistBackendUserIdFromPayload(payload = {}) {
  const backendUserId = extractBackendUserIdFromPayload(payload);
  chaterRuntimeSession.userId = backendUserId || '';
  return backendUserId;
}

function normalizeMemoriaBackendUserPayload(payload = {}, fallbackEmail = '') {
  if (!payload || typeof payload !== 'object') return payload || {};
  const data = payload.data && typeof payload.data === 'object' ? payload.data : {};
  const session = payload.session || data.session || data.auth || data.tokens || {};
  const compactUser = payload.u || data.u || session.u || {};
  const user = payload.user || data.user || data.profile || data.perfil || session.user || compactUser || {};
  const email = normalizeStorageIdentity(
    user.email
    || user.e
    || compactUser.email
    || compactUser.e
    || payload.email
    || payload.e
    || data.email
    || data.e
    || session.email
    || session.e
    || fallbackEmail
    || ''
  );

  return {
    ...payload,
    user: {
      ...user,
      id: user.id || user.i || compactUser.i || user.uid || compactUser.uid || '',
      uid: user.uid || user.i || compactUser.i || user.id || '',
      email,
      name: user.name || user.n || compactUser.n || user.displayName || '',
      photoURL: user.photoURL || user.p || compactUser.p || user.avatarUrl || ''
    }
  };
}

function getMemoriaBackendPayloadEmail(payload = {}, fallbackEmail = '') {
  return normalizeMemoriaBackendUserPayload(payload, fallbackEmail)?.user?.email || normalizeStorageIdentity(fallbackEmail);
}


function isAllowedGmailAddress(email = '') {
  const normalizedEmail = normalizeStorageIdentity(email);
  return /@(gmail\.com|googlemail\.com)$/i.test(normalizedEmail);
}

function extractIdempotencyKeyFromBody(body) {
  if (!body || typeof body !== 'string') return '';
  try {
    const payload = JSON.parse(body);
    return String(payload.clientMutationId || payload.idempotencyKey || payload.mutationId || '').trim();
  } catch (error) {
    return '';
  }
}

function sanitizeLocalStremeChannel(value = '', fallback = 'chater-general') {
  const rawValue = value || fallback || (fallback === '' ? '' : 'chater-general');
  if (!rawValue) return '';
  const clean = String(rawValue)
    .trim()
    .replace(/[^A-Za-z0-9_.:-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80);
  return /^[A-Za-z0-9_.:-]{1,80}$/.test(clean) ? clean : fallback;
}

function hashIdentityForStreme(value = '') {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return '';
  let hash = 0x811c9dc5;
  for (let index = 0; index < normalized.length; index += 1) {
    hash ^= normalized.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function getUserStremeInboxChannel(email = '', userId = '') {
  const identity = normalizeStorageIdentity(email) || normalizeBackendUserId(userId);
  const hashedIdentity = hashIdentityForStreme(identity);
  return hashedIdentity ? sanitizeLocalStremeChannel(`chater-user-${hashedIdentity}`) : '';
}

function getCurrentUserStremeInboxChannel() {
  return getUserStremeInboxChannel(getSessionEmail(), getSessionUserId() || getCurrentUserIdentifier());
}

function getConversationStremeChannel(conversationId = '') {
  const normalizedConversationId = String(conversationId || '').trim();
  if (!normalizedConversationId) return '';
  return sanitizeLocalStremeChannel(`chater-conversacion-${normalizedConversationId}`);
}

function getDefaultStremeChannel() {
  return getCurrentUserStremeInboxChannel()
    || getConversationStremeChannel(typeof activeConversationId !== 'undefined' ? activeConversationId : '')
    || CHATER_CONFIG.stremeChannel
    || 'chater-general';
}

function normalizeStremeChannelList(channels = [], fallback = '') {
  const rawList = Array.isArray(channels)
    ? channels
    : String(channels || '').split(/[\n,;|]+/);
  const normalized = [];

  rawList.forEach((channel) => {
    const cleanChannel = sanitizeLocalStremeChannel(channel, '');
    if (cleanChannel && !normalized.includes(cleanChannel)) normalized.push(cleanChannel);
  });

  if (!normalized.length && fallback) {
    const fallbackChannel = sanitizeLocalStremeChannel(fallback, '');
    if (fallbackChannel) normalized.push(fallbackChannel);
  }

  return normalized.slice(0, 8);
}


function normalizeClientIdempotencyKey(value = '', fallbackPrefix = 'op') {
  const raw = String(value || '').trim();
  const base = raw || `${fallbackPrefix}:${Date.now()}:${Math.random().toString(36).slice(2)}`;
  const hashSuffix = hashIdentityForStreme(base);
  const clean = raw
    .replace(/[^A-Za-z0-9_.:-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
  if (clean.length >= 8 && clean.length <= 120) return clean;
  if (clean.length > 120) return `${clean.slice(0, 103)}:${hashSuffix}`.slice(0, 160);
  return `${fallbackPrefix}:${hashSuffix}:${Date.now().toString(36)}`
    .replace(/[^A-Za-z0-9_.:-]/g, '_')
    .slice(0, 160);
}

function resolveStremePublishIdempotencyKey(payload = {}, options = {}) {
  return normalizeClientIdempotencyKey(
    options.idempotencyKey
      || payload.stremeIdempotencyKey
      || payload.dedupeKey
      || payload.clientMutationId
      || payload.clientMessageId
      || payload.mutationId
      || '',
    'streme'
  );
}

function getConversationSubscriptionChannels(conversationId = '') {
  const conversation = appState?.conversations?.find((item) => String(item.id || '') === String(conversationId || '')) || {};
  const lifecycle = buildConversationSharedLifecycleMetadata(conversation);
  return normalizeStremeChannelList([
    getConversationStremeChannel(conversationId),
    lifecycle.redisConversationKey ? getConversationStremeChannel(lifecycle.redisConversationKey) : ''
  ]);
}

function getDesiredStremeSubscriptionChannels(conversationId = activeConversationId) {
  const inboxChannel = getCurrentUserStremeInboxChannel();
  const defaultChannel = getDefaultStremeChannel();
  const conversationChannels = conversationId ? getConversationSubscriptionChannels(conversationId) : [];

  return normalizeStremeChannelList([
    inboxChannel,
    defaultChannel,
    ...conversationChannels
  ], defaultChannel || 'chater-general');
}

function getStremeMultiplexSourceKey(channels = []) {
  const normalizedChannels = normalizeStremeChannelList(channels);
  return normalizedChannels.length ? `${STREME_MULTIPLEX_SOURCE_KEY_PREFIX}${normalizedChannels.join('|')}` : '';
}

function createDemoStateTiming(minutesAgo = 0) {
  const createdAt = new Date(Date.now() - Math.max(0, Number(minutesAgo || 0)) * 60 * 1000).toISOString();
  const expiresAtIso = new Date(Date.parse(createdAt) + STATE_VISIBLE_MS).toISOString();
  return {
    createdAt,
    expiresAtIso,
    // Alias legado preservado para datos locales/API de iteraciones anteriores.
    expiresAtAt: expiresAtIso
  };
}

const demoStateTimings = {
  familia: createDemoStateTiming(25),
  carlos: createDemoStateTiming(6 * 60),
  equipo: createDemoStateTiming(12 * 60)
};

// La autenticación y su persistencia pertenecen únicamente a auth-gate.js, igual que en el proyecto de referencia.
// ChatER solo conserva en memoria runtime el correo confirmado por window.memoriaBACKEND para aislar datos de la interfaz.
const initialSessionEmail = '';

const seedState = {
  conversations: [
    {
      id: 'familia',
      name: 'Familia',
      email: 'familia@chater.local',
      avatar: 'FA',
      avatarImage: 'assets/avatar-familia.png',
      status: 'En línea',
      section: 'chats',
      archived: false,
      pinned: true,
      unread: 0,
      messages: [
        { id: 'seed-familia-1', type: 'incoming', text: 'Hola, ¿cómo vas?', time: '09:12' },
        { id: 'seed-familia-2', type: 'outgoing', text: 'Todo bien, ya estoy revisando los mensajes.', time: '09:14' },
        { id: 'seed-familia-3', type: 'incoming', text: 'Perfecto, hablamos más tarde.', time: '09:16' }
      ]
    },
    {
      id: 'trabajo',
      name: 'Equipo de trabajo',
      email: 'equipo@empresa.com',
      avatar: 'ET',
      avatarImage: 'assets/avatar-equipo-trabajo.png',
      status: 'Última vez hoy a las 10:30',
      section: 'chats',
      archived: false,
      pinned: true,
      unread: 2,
      messages: [
        { id: 'seed-trabajo-1', type: 'incoming', text: 'La reunión quedó confirmada para esta tarde.', time: '10:05' },
        { id: 'seed-trabajo-2', type: 'outgoing', text: 'Listo, estaré pendiente.', time: '10:07' }
      ]
    },
    {
      id: 'soporte',
      name: 'Soporte ChatER',
      email: 'soporte@chater.app',
      avatar: 'SO',
      avatarImage: 'assets/avatar-soporte.png',
      status: 'Disponible',
      section: 'chats',
      archived: false,
      pinned: false,
      unread: 0,
      messages: [
        { id: 'seed-soporte-1', type: 'incoming', text: 'Gracias por contactarnos. ¿En qué podemos ayudarte?', time: '08:40' }
      ]
    },
    {
      id: 'carlos',
      name: 'Carlos Méndez',
      email: 'carlos@example.com',
      avatar: 'CA',
      avatarImage: 'assets/avatar-carlos.png',
      status: 'En línea',
      section: 'chats',
      archived: false,
      pinned: false,
      unread: 1,
      messages: [
        { id: 'seed-carlos-1', type: 'incoming', text: '¿Probamos el chat hoy?', time: '11:22' },
        { id: 'seed-carlos-2', type: 'outgoing', text: 'Sí, ya quedó funcionando la base.', time: '11:23' }
      ]
    }
  ],
  states: [
    { id: 'estado-familia', conversationId: 'familia', contactEmail: 'familia@chater.local', name: 'Familia', preview: 'Foto actualizada hace 25 min', avatar: 'FA', avatarImage: 'assets/avatar-familia.png', expiresAt: '24 h', viewed: false, ...demoStateTimings.familia },
    { id: 'estado-carlos', conversationId: 'carlos', contactEmail: 'carlos@example.com', name: 'Carlos Méndez', preview: 'Nuevo estado disponible', avatar: 'CA', avatarImage: 'assets/avatar-carlos.png', expiresAt: '18 h', viewed: false, ...demoStateTimings.carlos },
    { id: 'estado-equipo', conversationId: 'trabajo', contactEmail: 'equipo@empresa.com', name: 'Equipo de trabajo', preview: 'Aviso de la jornada', avatar: 'ET', avatarImage: 'assets/avatar-equipo-trabajo.png', expiresAt: '12 h', viewed: false, ...demoStateTimings.equipo }
  ],
  calls: [
    { id: 'call-1', conversationId: 'carlos', name: 'Carlos Méndez', preview: 'Llamada saliente hoy, 11:45', type: 'voice', avatar: 'CA', avatarImage: 'assets/avatar-carlos.png' },
    { id: 'call-2', conversationId: 'trabajo', name: 'Equipo de trabajo', preview: 'Videollamada perdida ayer', type: 'video', avatar: 'ET', avatarImage: 'assets/avatar-equipo-trabajo.png' },
    { id: 'call-3', conversationId: 'soporte', name: 'Soporte ChatER', preview: 'Llamada entrante lunes', type: 'voice', avatar: 'SO', avatarImage: 'assets/avatar-soporte.png' }
  ],
  business: {
    metrics: {
      catalogViews7d: 0,
      statusViews7d: 0
    },
    verification: { status: 'not_requested', requestedAt: '', syncedAt: '' },
    catalog: [
      { id: 'catalog-seed-1', name: 'Servicio personalizado', price: '', description: 'Muestra aquí tus productos o servicios cuando conectes catálogo.', createdAt: '' }
    ],
    campaigns: [],
    broadcasts: [],
    orders: [],
    activities: []
  },
  privacy: {
    profileVisibility: 'contacts',
    statusVisibility: 'contacts',
    lastActivityVisibility: 'contacts',
    publicFields: ['displayName', 'avatar'],
    privateFields: ['email'],
    syncStatus: '',
    syncedAt: ''
  }
};

const emojiModes = [
  { id: 'emoji', label: 'Emojis', icon: '☻' },
  { id: 'gif', label: 'GIF', icon: 'GIF' },
  { id: 'sticker', label: 'Stickers', icon: '▧' }
];

const emojiCategories = [
  {
    id: 'smileys',
    label: 'Caras y emociones',
    icon: '😊',
    emojis: ['😀', '😃', '😄', '😁', '😆', '😂', '🤣', '😊', '😇', '🙂', '🙃', '😉', '😍', '😘', '😋', '😎', '🥳', '😢', '😭', '😡', '😱', '🤔', '😴', '🤗']
  },
  {
    id: 'gestures',
    label: 'Gestos',
    icon: '👍',
    emojis: ['👍', '👎', '👌', '👏', '🙌', '🙏', '🤝', '💪', '👋', '✌️', '☝️', '👇', '👉', '👈', '🤙', '🫶']
  },
  {
    id: 'symbols',
    label: 'Símbolos',
    icon: '❤️',
    emojis: ['❤️', '🧡', '💛', '💚', '💙', '💜', '🤍', '🔥', '✨', '⭐', '✅', '❌', '⚠️', '📌', '💬', '🚀']
  },
  {
    id: 'objects',
    label: 'Objetos y actividad',
    icon: '☕',
    emojis: ['☕', '🎉', '🎁', '📷', '🎧', '💻', '📱', '🕘', '📍', '📝', '📎', '🔔', '🔒', '🛒', '🚗', '🏠']
  }
];

const emojiSearchAliases = {
  '😀': 'feliz sonrisa alegría',
  '😃': 'feliz sonrisa alegría',
  '😄': 'feliz sonrisa alegría',
  '😁': 'sonrisa feliz',
  '😆': 'risa carcajada',
  '😂': 'risa carcajada lágrimas',
  '🤣': 'risa carcajada suelo',
  '😊': 'sonrisa amable feliz',
  '😍': 'amor enamorado corazón',
  '😘': 'beso amor',
  '😎': 'cool gafas tranquilo',
  '🥳': 'fiesta celebración cumpleaños',
  '😢': 'triste lágrima',
  '😭': 'llanto triste',
  '😡': 'enojo rabia molesto',
  '😱': 'susto sorpresa',
  '🤔': 'pensando duda',
  '😴': 'sueño dormir cansado',
  '👍': 'ok bien aprobar',
  '👎': 'mal desaprobar',
  '👏': 'aplausos bravo',
  '🙏': 'gracias favor oración',
  '🤝': 'acuerdo trato saludo',
  '💪': 'fuerza ánimo',
  '👋': 'hola saludo adiós',
  '❤️': 'amor corazón rojo',
  '🔥': 'fuego urgente tendencia',
  '✨': 'brillo especial',
  '⭐': 'estrella favorito',
  '✅': 'listo correcto aprobado',
  '❌': 'cancelar error no',
  '⚠️': 'alerta advertencia',
  '📌': 'pin fijar importante',
  '💬': 'chat mensaje conversación',
  '🚀': 'lanzar rápido avance',
  '☕': 'café descanso',
  '🎉': 'fiesta celebración',
  '🎁': 'regalo',
  '📷': 'foto cámara estado',
  '📱': 'móvil teléfono app',
  '📍': 'ubicación lugar',
  '📎': 'adjunto archivo',
  '🔔': 'notificación alerta',
  '🔒': 'seguro privado bloqueo'
};

const gifQuickActions = [
  { id: 'gif-gracias', label: 'Gracias', token: '🎬 GIF: gracias' },
  { id: 'gif-risa', label: 'Risa', token: '🎬 GIF: risa' },
  { id: 'gif-aplausos', label: 'Aplausos', token: '🎬 GIF: aplausos' },
  { id: 'gif-ok', label: 'Perfecto', token: '🎬 GIF: perfecto' },
  { id: 'gif-saludo', label: 'Saludo', token: '🎬 GIF: saludo' },
  { id: 'gif-celebrar', label: 'Celebrar', token: '🎬 GIF: celebrar' }
];

const stickerQuickActions = [
  { id: 'sticker-ok', label: 'Ok', token: '▧ Sticker: ok' },
  { id: 'sticker-hola', label: 'Hola', token: '▧ Sticker: hola' },
  { id: 'sticker-gracias', label: 'Gracias', token: '▧ Sticker: gracias' },
  { id: 'sticker-risa', label: 'Risa', token: '▧ Sticker: risa' },
  { id: 'sticker-amor', label: 'Corazón', token: '▧ Sticker: corazón' },
  { id: 'sticker-urgente', label: 'Urgente', token: '▧ Sticker: urgente' }
];

let appState = loadState(initialSessionEmail);
let activeConversationId = getVisibleConversations()[0]?.id || appState.conversations[0]?.id || null;
let activeSection = 'chats';
let activeChatListGroup = 'main';
let activeStateId = appState.states[0]?.id || null;
let activeStateStorageEmail = normalizeStorageIdentity(initialSessionEmail);
let chaterBrandLogoVersion = readStorageItem('chater.brand.logo.version', '');
let stremeSocket = null;
let stremeEventSource = null;
const stremeEventSourcesByChannel = new Map();
let stremeActiveSseChannelsKey = '';
const STREME_MULTIPLEX_SOURCE_KEY_PREFIX = '__multiplex__:';
let stremeActiveTransport = 'none';
let stremeReconnectTimer = null;
let stremeReconnectAttempts = 0;
let stremeManualDisconnect = false;
let stremeSessionGuard = null;
let chatRealtimeEventSource = null;
let chatRealtimeReconnectTimer = null;
let chatRealtimeReconnectAttempts = 0;
let chatRealtimeManualDisconnect = false;
let chatRealtimeSessionGuard = null;
let pushConfigCache = null;
let pushConfigInFlight = null;
let toastTimer = null;
let activeSessionRuntimeId = 0;
let activeSessionRuntimeEmail = normalizeStorageIdentity(initialSessionEmail);
let activeModalKind = '';
let activeQrScannerCleanup = null;
let activeEmojiMode = 'emoji';
let activeEmojiCategoryId = 'recent';
let initialSyncInFlight = '';
let outboxFlushInFlight = '';
let outboxRetryTimer = null;
let memoriaKeepaliveTimer = 0;
let memoriaKeepaliveInFlight = false;
const messageHistoryHydration = {
  inFlight: new Set(),
  retryAfterMs: 30000
};
const contactConversationSyncState = {
  inFlight: new Map()
};
const realtimeConversationSyncState = {
  inFlight: '',
  lastSyncedAt: 0
};
const typingState = {
  isTyping: false,
  timer: null,
  conversationId: ''
};
const REMOTE_TYPING_GRACE_MS = 2000;
const REMOTE_TYPING_STALE_MS = 6500;
const CONTACT_SEND_SYNC_SOFT_TIMEOUT_MS = 1800;
const remoteTypingDisplayState = new Map();

const presenceSyncState = {
  status: '',
  lastSyncedAt: 0,
  inFlight: false
};

const staticVisitState = {
  pageLoadId: generateClientMutationId(),
  inFlight: false,
  payload: null,
  error: '',
  registeredAt: ''
};

const syncCursorState = {
  lastEventId: readStorageItem(CHATER_CONFIG.stremeLastEventKey, ''),
  lastSyncedEventId: '',
  inFlight: false,
  timer: null,
  error: '',
  syncedAt: ''
};

const userPreferencesSyncState = {
  inFlight: false,
  timer: null,
  lastSyncedAt: '',
  error: '',
  remoteLoadedAt: ''
};

const clientTelemetryState = {
  timestamps: [],
  inFlightKeys: new Set()
};

const voiceRecorderState = {
  recorder: null,
  stream: null,
  chunks: [],
  conversationId: '',
  sessionGuard: null,
  autoStopTimer: null,
  startedAt: 0
};

const chatView = document.getElementById('chatView');
const authFeedbackState = { message: '' };

function setAuthFeedback(message = '') {
  authFeedbackState.message = String(message || '');
}

function getAuthFeedback() {
  return authFeedbackState.message;
}
const userEmailLabel = document.getElementById('userEmailLabel');
const profileButton = document.getElementById('profileButton');
const newChatButton = document.getElementById('newChatButton');
const headerCameraButton = document.getElementById('headerCameraButton');
const headerSearchButton = document.getElementById('headerSearchButton');
const toolsButton = document.getElementById('toolsButton');
const sidebarHeading = document.querySelector('.sidebar-title h1');
const sidebarSubtitle = document.querySelector('.sidebar-title p');
const chatList = document.getElementById('chatList');
const searchInput = document.getElementById('searchInput');
const messagesContainer = document.getElementById('messages');
const statusPanel = document.getElementById('statusPanel');
const activeAvatar = document.getElementById('activeAvatar');
const activeName = document.getElementById('activeName');
const activeStatus = document.getElementById('activeStatus');
const messageForm = document.getElementById('messageForm');
const messageInput = document.getElementById('messageInput');
const sendButton = document.getElementById('sendButton');
const emojiButton = document.getElementById('emojiButton');
const attachButton = document.getElementById('attachButton');
const cameraComposerButton = document.getElementById('cameraComposerButton');
const quickComposerButton = document.getElementById('quickComposerButton');
const voiceNoteButton = document.getElementById('voiceNoteButton');
const emojiPanel = document.getElementById('emojiPanel');
const audioCallButton = document.getElementById('audioCallButton');
const videoCallButton = document.getElementById('videoCallButton');
const pinConversationButton = document.getElementById('pinConversationButton');
const archiveConversationButton = document.getElementById('archiveConversationButton');
const conversationMenuButton = document.getElementById('conversationMenuButton');
const backButton = document.getElementById('backButton');
const modalOverlay = document.getElementById('modalOverlay');
const modalTitle = document.getElementById('modalTitle');
const modalBody = document.getElementById('modalBody');
const modalCloseButton = document.getElementById('modalCloseButton');
const themeColorMeta = document.querySelector('meta[name="theme-color"]');
const toast = document.getElementById('toast');
const sectionTabs = Array.from(document.querySelectorAll('.mode-tab'));
const bottomNavButtons = Array.from(document.querySelectorAll('.bottom-nav-item'));
const floatingActionButton = document.getElementById('floatingActionButton');
const brandLogoElements = Array.from(document.querySelectorAll('[data-brand-logo]'));

const chatSelectionState = {
  active: false,
  selectedIds: new Set(),
  toolbar: null,
  lastAnchor: null
};

const chatFloatingMenuState = {
  menu: null,
  backdrop: null,
  anchor: null
};

const CHAT_LONG_PRESS_DELAY_MS = 540;
const CHAT_LONG_PRESS_MOVE_TOLERANCE_PX = 10;
const DEFAULT_CHAT_LIST_NAME = 'Prioridad';

const apiClient = {
  async request(path, options = {}) {
    if (!CHATER_CONFIG.backendBaseUrl) {
      return { ok: true, offlineDemo: true, requestId: generateClientMutationId() };
    }

    const {
      skipRefresh,
      timeoutMs = CHATER_CONFIG.apiTimeoutMs,
      headers: optionHeaders,
      siteScoped = true,
      idempotencyKey,
      ...fetchOptions
    } = options;
    const method = String(fetchOptions.method || 'GET').toUpperCase();
    const hasBody = fetchOptions.body !== undefined && fetchOptions.body !== null;
    const isJsonBody = hasBody && typeof fetchOptions.body === 'string';
    const mutationId = String(idempotencyKey || extractIdempotencyKeyFromBody(fetchOptions.body) || '').trim();
    const headers = {
      Accept: 'application/json',
      ...(isJsonBody ? { 'Content-Type': 'application/json' } : {}),
      ...(siteScoped && getMemoriaSiteId() ? { 'X-MB-Site': getMemoriaSiteId() } : {}),
      ...(method !== 'GET' && method !== 'HEAD' ? { 'X-Hashinmy-Action': 'webapp' } : {}),
      ...(mutationId ? { 'X-MB-Idempotency-Key': mutationId } : {}),
      ...(optionHeaders || {})
    };

    const response = await fetchWithTimeout(buildApiUrl(path, { siteScoped }), {
      credentials: 'include',
      ...fetchOptions,
      headers
    }, timeoutMs);

    if (!response.ok) {
      const error = await createBackendHttpError(response);
      handleProtectedApiAuthFailure(path, error);
      throw error;
    }

    if (response.status === 204) {
      return { ok: true };
    }

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      return { ok: true, status: response.status };
    }

    const payload = await response.json();
    if (isMemoriaBackendErrorPayload(payload)) {
      const error = createBackendPayloadError(payload, response);
      handleProtectedApiAuthFailure(path, error);
      throw error;
    }

    return payload;
  },
  getProfile() {
    const params = new URLSearchParams({ email: getSessionEmail(), userEmail: getSessionEmail(), userId: getCurrentUserIdentifier() });
    return this.request(`/api/v1/perfil-usuario?${params.toString()}`);
  },
  getUserPreferences() {
    const params = new URLSearchParams({
      userId: getCurrentUserIdentifier(),
      userEmail: getSessionEmail(),
      email: getSessionEmail(),
      scope: 'chater-static-site'
    });
    return this.request(`/api/v1/preferencias-usuario?${params.toString()}`);
  },
  saveUserPreferences(payload = {}, clientMutationId = generateClientMutationId()) {
    return this.request('/api/v1/preferencias-usuario', {
      method: 'POST',
      idempotencyKey: clientMutationId,
      body: JSON.stringify(withMemoriaSitePayload({
        ...payload,
        userId: payload.userId || getCurrentUserIdentifier(),
        userEmail: payload.userEmail || getSessionEmail(),
        clientMutationId
      }))
    });
  },
  getConversations() {
    const params = new URLSearchParams({ userEmail: getSessionEmail(), email: getSessionEmail(), userId: getCurrentUserIdentifier(), limit: '80' });
    return this.request(`/api/v1/conversaciones?${params.toString()}`)
      .then((payload) => normalizeApiCollectionPayload(payload, 'conversations'));
  },
  getMessages(conversationId, options = {}) {
    const params = new URLSearchParams();
    const conversation = options.conversation || appState.conversations.find((item) => String(item.id || '') === String(conversationId || '')) || {};
    const lifecycle = buildConversationSharedLifecycleMetadata(conversation);
    params.set('conversationId', conversationId);
    params.set('limit', String(options.limit || 50));
    params.set('userEmail', getSessionEmail());
    params.set('actorUserEmail', getSessionEmail());
    params.set('actorUserId', getCurrentUserIdentifier());
    if (lifecycle.sharedConversationKey) params.set('sharedConversationKey', lifecycle.sharedConversationKey);
    if (lifecycle.redisConversationKey) params.set('redisConversationKey', lifecycle.redisConversationKey);
    if (options.before) params.set('before', options.before);
    if (options.cursor) params.set('cursor', options.cursor);
    return this.request(`/api/v1/mensajes?${params.toString()}`)
      .then((payload) => normalizeApiCollectionPayload(payload, 'messages'));
  },
  searchContent(query, options = {}) {
    const normalizedQuery = String(query || '').trim();
    if (!normalizedQuery) return Promise.resolve({ ok: true, searchResults: [] });

    const params = new URLSearchParams({
      q: normalizedQuery,
      query: normalizedQuery,
      userId: options.userId || getCurrentUserIdentifier(),
      userEmail: options.userEmail || getSessionEmail(),
      limit: String(options.limit || 20)
    });

    if (options.entityTypes) params.set('entityTypes', options.entityTypes);
    if (options.conversationId) params.set('conversationId', options.conversationId);
    if (options.cursor) params.set('cursor', options.cursor);

    return this.request(`/api/v1/busqueda/buscar?${params.toString()}`)
      .then((payload) => normalizeApiCollectionPayload(payload, 'searchResults'));
  },
  updateConversation(conversationId, patch = {}) {
    const clientMutationId = patch.clientMutationId || generateClientMutationId();
    return this.request(`/api/v1/conversaciones/${encodeURIComponent(conversationId)}`, {
      method: 'PATCH',
      idempotencyKey: clientMutationId,
      body: JSON.stringify(withMemoriaSitePayload({
        ...patch,
        clientMutationId
      }))
    });
  },
  markConversationRead(conversationId, clientMutationId = generateClientMutationId(), readAt = new Date().toISOString()) {
    return this.request('/api/v1/interacciones-mensaje', {
      method: 'POST',
      idempotencyKey: clientMutationId,
      body: JSON.stringify(withMemoriaSitePayload({
        conversationId,
        actorUserId: getCurrentUserIdentifier(),
        actorUserEmail: getSessionEmail(),
        interactionType: 'read',
        readAt,
        clientMutationId
      }))
    });
  },
  markConversationUnread(conversationId, clientMutationId = generateClientMutationId(), unreadAt = new Date().toISOString()) {
    return this.request('/api/v1/interacciones-mensaje', {
      method: 'POST',
      idempotencyKey: clientMutationId,
      body: JSON.stringify(withMemoriaSitePayload({
        conversationId,
        actorUserId: getCurrentUserIdentifier(),
        actorUserEmail: getSessionEmail(),
        interactionType: 'unread',
        unreadAt,
        clientMutationId
      }))
    });
  },
  markMessageDelivered(conversationId, messageId, clientMutationId = generateClientMutationId(), deliveredAt = new Date().toISOString()) {
    return this.request('/api/v1/interacciones-mensaje', {
      method: 'POST',
      idempotencyKey: clientMutationId,
      body: JSON.stringify(withMemoriaSitePayload({
        messageId,
        conversationId,
        actorUserId: getCurrentUserIdentifier(),
        actorUserEmail: getSessionEmail(),
        interactionType: 'delivered',
        deliveredAt,
        clientMutationId
      }))
    });
  },
  markMessageRead(conversationId, messageId, clientMutationId = generateClientMutationId(), readAt = new Date().toISOString()) {
    return this.request('/api/v1/interacciones-mensaje', {
      method: 'POST',
      idempotencyKey: clientMutationId,
      body: JSON.stringify(withMemoriaSitePayload({
        messageId,
        conversationId,
        actorUserId: getCurrentUserIdentifier(),
        actorUserEmail: getSessionEmail(),
        interactionType: 'read',
        readAt,
        clientMutationId
      }))
    });
  },
  createChatShortcut(conversation = {}, clientMutationId = generateClientMutationId()) {
    return this.request('/api/v1/accesos-directos-chat', {
      method: 'POST',
      idempotencyKey: clientMutationId,
      body: JSON.stringify(withMemoriaSitePayload({
        userId: getCurrentUserIdentifier(),
        userEmail: getSessionEmail(),
        conversationId: conversation.id,
        contactEmail: conversation.email || conversation.contactEmail || '',
        displayName: conversation.name || conversation.displayName || '',
        shortcutUrl: buildConversationShortcutUrl(conversation),
        source: 'chater-static-site',
        clientMutationId
      }))
    });
  },
  syncChatAction(actionType = '', conversation = {}, payload = {}, clientMutationId = generateClientMutationId()) {
    const lifecycle = buildConversationSharedLifecycleMetadata(conversation);
    return this.request('/api/v1/acciones-chat', {
      method: 'POST',
      idempotencyKey: clientMutationId,
      body: JSON.stringify(withMemoriaSitePayload({
        actionType,
        conversationId: conversation.id,
        sharedConversationKey: lifecycle.sharedConversationKey,
        redisConversationKey: lifecycle.redisConversationKey,
        redisChatKey: lifecycle.redisChatKey,
        participantCount: lifecycle.participantCount,
        deleteFinalOnlyWhenAllParticipantsDeleted: true,
        reuseExistingRedisChat: true,
        contactEmail: conversation.email || conversation.contactEmail || '',
        displayName: conversation.name || conversation.displayName || '',
        actorUserId: getCurrentUserIdentifier(),
        actorUserEmail: getSessionEmail(),
        payload: {
          ...lifecycle,
          ...(payload && typeof payload === 'object' ? payload : {})
        },
        source: 'chater-static-site',
        clientMutationId
      }))
    });
  },
  getStates() {
    const params = new URLSearchParams({ userEmail: getSessionEmail(), email: getSessionEmail(), userId: getCurrentUserIdentifier(), limit: '80' });
    return this.request(`/api/v1/publicaciones-efimeras?${params.toString()}`)
      .then((payload) => normalizeApiCollectionPayload(payload, 'states'));
  },
  getCallsHistory() {
    const params = new URLSearchParams({ userEmail: getSessionEmail(), participantEmail: getSessionEmail(), userId: getCurrentUserIdentifier(), participantUserId: getCurrentUserIdentifier(), limit: '80' });
    return this.request(`/api/v1/sesiones-comunicacion?${params.toString()}`)
      .then((payload) => normalizeApiCollectionPayload(payload, 'calls'));
  },
  sendMessage(conversationId, text, clientMessageId, options = {}) {
    const conversation = options.conversation || appState.conversations.find((item) => String(item.id || '') === String(conversationId || '')) || {};
    const recipients = getConversationRemoteIdentities(conversation);
    const firstRecipient = recipients[0] || {};
    const senderUserId = getCurrentUserIdentifier();
    const senderUserEmail = getSessionEmail();
    const lifecycle = buildConversationSharedLifecycleMetadata(conversation);
    const clientTime = options.clientTime || options.createdAt || new Date().toISOString();
    const expiresAt = coerceChatEphemeralExpiresAtIso(options.expiresAt || '', clientTime);

    return this.request('/api/v1/chats/send', {
      method: 'POST',
      idempotencyKey: clientMessageId,
      body: JSON.stringify(withMemoriaSitePayload({
        conversationId,
        chatId: conversationId,
        sharedConversationKey: lifecycle.sharedConversationKey,
        redisConversationKey: lifecycle.redisConversationKey,
        redisChatKey: lifecycle.redisChatKey,
        participantCount: lifecycle.participantCount,
        reuseExistingRedisChat: true,
        senderUserId,
        senderUserEmail,
        recipientUserId: firstRecipient.userId || '',
        recipientUserEmail: firstRecipient.email || '',
        text,
        status: 'sent',
        clientTime,
        expiresAt,
        ttlSeconds: CHATER_EPHEMERAL_TTL_SECONDS,
        metadata: {
          source: 'chater-static-site',
          senderUserId,
          senderUserEmail,
          recipientUserId: firstRecipient.userId || '',
          recipientUserEmail: firstRecipient.email || '',
          recipients,
          ...lifecycle,
          expiresAt,
          ephemeralTtlSeconds: CHATER_EPHEMERAL_TTL_SECONDS,
          channel: lifecycle.redisConversationKey ? getConversationStremeChannel(lifecycle.redisConversationKey) : getConversationStremeChannel(conversationId),
          userInboxChannel: getCurrentUserStremeInboxChannel(),
          remoteInboxChannels: recipients.map((recipient) => getUserStremeInboxChannel(recipient.email, recipient.userId)).filter(Boolean)
        },
        clientMutationId: clientMessageId
      }))
    });
  },
  createConversation(contact) {
    const clientMutationId = contact.clientMutationId || generateClientMutationId();
    const participants = buildConversationCreateParticipants(contact);
    const participantEmails = participants.map((participant) => participant.email || participant.userEmail || '').filter(Boolean);
    const lifecycle = buildSharedConversationLifecycleMetadata(participants, { type: 'direct' });
    const contactUserId = normalizeBackendUserId(contact.userId || contact.contactUserId || contact.internalUserId || contact.uid || contact.id || '');
    const contactEmail = normalizeStorageIdentity(contact.email || contact.contactEmail || contact.userEmail || '');
    const displayName = String(contact.name || contact.displayName || contact.alias || contact.email || '').trim();

    return this.request('/api/v1/conversaciones', {
      method: 'POST',
      idempotencyKey: clientMutationId,
      body: JSON.stringify(withMemoriaSitePayload({
        type: 'direct',
        conversationType: 'direct',
        participants,
        participantEmails,
        sharedConversationKey: lifecycle.sharedConversationKey,
        redisConversationKey: lifecycle.redisConversationKey,
        redisChatKey: lifecycle.redisChatKey,
        participantCount: lifecycle.participantCount,
        reuseExistingRedisChat: true,
        restoreExistingRedisChat: true,
        restoreIfParticipantDeleted: true,
        deleteFinalOnlyWhenAllParticipantsDeleted: true,
        visibilityMode: 'per-participant',
        deletionPolicy: {
          mode: 'per-participant',
          counterInitial: lifecycle.participantCount,
          deleteWhenRemainingParticipants: 0,
          internalOnly: true,
          visibleInChat: false
        },
        ownerUserId: normalizeBackendUserId(getSessionUserId()),
        ownerUserEmail: getSessionEmail(),
        contactUserId,
        contactEmail,
        displayName,
        title: displayName,
        status: 'active',
        metadata: {
          source: 'chater-static-site',
          ownerUserId: normalizeBackendUserId(getSessionUserId()),
          ownerUserEmail: getSessionEmail(),
          contactUserId,
          contactEmail,
          displayName,
          participants,
          participantEmails,
          ...lifecycle,
          restoreExistingRedisChat: true,
          restoreIfParticipantDeleted: true,
          channel: lifecycle.redisConversationKey ? getConversationStremeChannel(lifecycle.redisConversationKey) : getConversationStremeChannel(clientMutationId)
        },
        clientMutationId
      }))
    });
  },
  resolveContactQr(contact = {}, rawPayload = '') {
    const clientMutationId = contact.clientMutationId || generateClientMutationId();
    const contactEmail = normalizeStorageIdentity(contact.email || contact.contactEmail || contact.userEmail || '');
    const contactUserId = normalizeBackendUserId(contact.userId || contact.contactUserId || contact.uid || contact.id || '');
    const displayName = String(contact.name || contact.displayName || contact.alias || contactEmail || '').trim();
    const qrPayload = String(rawPayload || contact.rawPayload || contact.payload || contact.qr || '').trim();

    return this.request('/api/v1/contactos/qr-resolver', {
      method: 'POST',
      idempotencyKey: clientMutationId,
      body: JSON.stringify(withMemoriaSitePayload({
        payload: qrPayload,
        rawPayload: qrPayload,
        fromUserId: getCurrentUserIdentifier(),
        fromUserEmail: getSessionEmail(),
        actorUserId: getCurrentUserIdentifier(),
        actorUserEmail: getSessionEmail(),
        contactEmail,
        contactUserId,
        displayName,
        source: 'chater-profile-qr',
        clientMutationId
      }))
    });
  },
  upsertUserRelation(contact = {}) {
    const contactEmail = normalizeStorageIdentity(contact.email || contact.contactEmail || '');
    if (!contactEmail) return Promise.resolve({ ok: true, skipped: true, reason: 'missing_contact_email' });

    const clientMutationId = contact.relationClientMutationId || contact.clientMutationId || generateClientMutationId();
    const displayName = String(contact.name || contact.displayName || contact.alias || contactEmail).trim();
    const conversationId = String(contact.conversationId || contact.chatId || '').trim();

    return this.request('/api/v1/relaciones-usuario', {
      method: 'POST',
      idempotencyKey: clientMutationId,
      body: JSON.stringify(withMemoriaSitePayload({
        fromUserId: getCurrentUserIdentifier(),
        fromUserEmail: getSessionEmail(),
        contactEmail,
        displayName,
        alias: displayName,
        relationType: contact.relationType || 'contact',
        status: contact.status || 'active',
        favorite: coerceFirstBooleanFlag([contact.favorite], false),
        blocked: coerceFirstBooleanFlag([contact.blocked], false),
        tags: normalizeContactRelationTags(contact.tags || contact.relationTags || []),
        metadata: {
          source: 'chater-static-site',
          conversationId,
          localConversationId: contact.localConversationId || '',
          reason: contact.reason || 'conversation-contact'
        },
        clientMutationId
      }))
    });
  },
  updatePrivacySettings(payload = {}) {
    const clientMutationId = payload.clientMutationId || generateClientMutationId();
    return this.request('/api/v1/privacidad-usuario', {
      method: 'POST',
      idempotencyKey: clientMutationId,
      body: JSON.stringify(withMemoriaSitePayload({
        userId: payload.userId || getCurrentUserIdentifier(),
        userEmail: payload.userEmail || getSessionEmail(),
        profileVisibility: payload.profileVisibility || 'contacts',
        statusVisibility: payload.statusVisibility || 'contacts',
        lastActivityVisibility: payload.lastActivityVisibility || 'contacts',
        publicFields: Array.isArray(payload.publicFields) ? payload.publicFields : ['displayName', 'avatar'],
        privateFields: Array.isArray(payload.privateFields) ? payload.privateFields : ['email'],
        metadata: {
          source: 'chater-static-site',
          ...(payload.metadata && typeof payload.metadata === 'object' ? payload.metadata : {})
        },
        clientMutationId
      }))
    });
  },
  blockUser(payload = {}) {
    const clientMutationId = payload.clientMutationId || generateClientMutationId();
    const blockedEmail = normalizeStorageIdentity(payload.blockedUserEmail || payload.blockedEmail || payload.contactEmail || '');
    const blockedUserId = normalizeBackendUserId(payload.blockedUserId || payload.contactUserId || '');
    return this.request('/api/v1/bloqueos-usuario', {
      method: 'POST',
      idempotencyKey: clientMutationId,
      body: JSON.stringify(withMemoriaSitePayload({
        blockerUserId: payload.blockerUserId || getCurrentUserIdentifier(),
        blockerUserEmail: payload.blockerUserEmail || getSessionEmail(),
        blockedUserId,
        blockedUserEmail: blockedEmail,
        blockedEmail,
        contactEmail: blockedEmail,
        conversationId: payload.conversationId || '',
        reason: payload.reason || 'user-request',
        scope: payload.scope || 'conversation',
        status: payload.status || 'active',
        metadata: {
          source: 'chater-static-site',
          displayName: payload.displayName || '',
          ...(payload.metadata && typeof payload.metadata === 'object' ? payload.metadata : {})
        },
        clientMutationId
      }))
    });
  },
  reportModeration(payload = {}) {
    const clientMutationId = payload.clientMutationId || generateClientMutationId();
    return this.request('/api/v1/reportes-moderacion', {
      method: 'POST',
      idempotencyKey: clientMutationId,
      body: JSON.stringify(withMemoriaSitePayload({
        reporterUserId: payload.reporterUserId || getCurrentUserIdentifier(),
        reporterUserEmail: payload.reporterUserEmail || getSessionEmail(),
        entityType: payload.entityType || 'conversation',
        entityId: payload.entityId || payload.conversationId || '',
        conversationId: payload.conversationId || payload.entityId || '',
        reason: payload.reason || 'other',
        evidence: payload.evidence && typeof payload.evidence === 'object' ? payload.evidence : {},
        status: payload.status || 'submitted',
        metadata: {
          source: 'chater-static-site',
          ...(payload.metadata && typeof payload.metadata === 'object' ? payload.metadata : {})
        },
        clientMutationId
      }))
    });
  },
  setTyping(conversationId, isTyping) {
    const clientMutationId = generateClientMutationId();
    return this.request('/api/v1/senales-efimeras', {
      method: 'POST',
      idempotencyKey: clientMutationId,
      body: JSON.stringify(withMemoriaSitePayload({
        userId: getCurrentUserIdentifier(),
        userEmail: getSessionEmail(),
        conversationId,
        signalType: 'typing',
        active: Boolean(isTyping),
        expiresAt: new Date(Date.now() + 12000).toISOString(),
        payload: { isTyping: Boolean(isTyping) },
        clientMutationId
      }))
    });
  },
  updatePresence(status = 'online', options = {}) {
    const normalizedStatus = normalizePresenceStatus(status);
    const nowIso = new Date().toISOString();
    const clientMutationId = options.clientMutationId || generateClientMutationId();
    return this.request('/api/v1/presencia-usuario', {
      method: 'POST',
      keepalive: options.keepalive === true,
      idempotencyKey: clientMutationId,
      body: JSON.stringify(withMemoriaSitePayload({
        userId: options.userId || getCurrentUserIdentifier(),
        userEmail: options.userEmail || getSessionEmail(),
        status: normalizedStatus,
        deviceId: options.deviceId || getDeviceId(),
        heartbeatAt: options.heartbeatAt || nowIso,
        lastSeenAt: options.lastSeenAt || nowIso,
        expiresAt: options.expiresAt || (normalizedStatus === 'offline' ? nowIso : new Date(Date.now() + 45000).toISOString()),
        metadata: {
          source: 'chater-static-site',
          transport: stremeActiveTransport || resolveStremeTransport(),
          activeConversationId: activeConversationId || '',
          visibilityState: document.visibilityState || ''
        },
        clientMutationId
      }))
    });
  },
  prepareMediaUpload(file, clientMutationId = generateClientMutationId()) {
    const expiresAt = getChatEphemeralExpiresAtIso();
    return this.request('/api/v1/media-firmada', {
      method: 'POST',
      timeoutMs: CHATER_CONFIG.mediaUploadTimeoutMs,
      idempotencyKey: clientMutationId,
      body: JSON.stringify(withMemoriaSitePayload({
        entityType: 'mensaje',
        entityId: clientMutationId,
        userId: getCurrentUserIdentifier(),
        userEmail: getSessionEmail(),
        filename: file.name,
        fileName: file.name,
        mimeType: file.type || 'application/octet-stream',
        size: file.size,
        sizeBytes: file.size,
        source: 'chater-static-site',
        expiresAt,
        ttlSeconds: CHATER_EPHEMERAL_TTL_SECONDS,
        metadata: {
          source: 'chater-static-site',
          userId: getCurrentUserIdentifier(),
          userEmail: getSessionEmail(),
          expiresAt,
          ephemeralTtlSeconds: CHATER_EPHEMERAL_TTL_SECONDS
        },
        clientMutationId
      }))
    });
  },
  confirmMediaUpload(mediaId, payload = {}, clientMutationId = generateClientMutationId()) {
    return this.request(`/api/v1/media-firmada/${encodeURIComponent(mediaId)}`, {
      method: 'PATCH',
      timeoutMs: CHATER_CONFIG.mediaUploadTimeoutMs,
      idempotencyKey: clientMutationId,
      body: JSON.stringify(withMemoriaSitePayload({
        ...payload,
        mediaId,
        source: 'chater-static-site',
        userId: payload.userId || getCurrentUserIdentifier(),
        userEmail: payload.userEmail || getSessionEmail(),
        status: payload.status || 'uploaded',
        uploaded: payload.uploaded !== false,
        uploadedAt: payload.uploadedAt || new Date().toISOString(),
        clientMutationId
      }))
    });
  },
  getMediaReadUrl(mediaId, options = {}) {
    const clientMutationId = options.clientMutationId || generateClientMutationId();
    return this.request(`/api/v1/media-firmada/${encodeURIComponent(mediaId)}/url-lectura`, {
      method: 'POST',
      timeoutMs: CHATER_CONFIG.mediaUploadTimeoutMs,
      idempotencyKey: clientMutationId,
      body: JSON.stringify(withMemoriaSitePayload({
        mediaId,
        source: 'chater-static-site',
        userId: options.userId || getCurrentUserIdentifier(),
        userEmail: options.userEmail || getSessionEmail(),
        entityType: options.entityType || 'mensaje',
        entityId: options.entityId || '',
        conversationId: options.conversationId || '',
        ttlSeconds: options.ttlSeconds || 900,
        clientMutationId
      }))
    });
  },
  async createR2xImageIntent(file, options = {}, clientMutationId = generateClientMutationId()) {
    const maxBytes = clampImageUploadMaxBytes(Math.min(
      Number(options.maxBytes || CHATER_CONFIG.r2xImageMaxBytes),
      CHATER_CONFIG.r2xImageMaxBytes
    ));
    const uploadPolicy = await assertR2xReadyWebpFile(file, maxBytes);
    const expiresAt = getChatEphemeralExpiresAtIso();

    return this.request('/api/v1/imagenes-r2x/intenciones', {
      method: 'POST',
      timeoutMs: CHATER_CONFIG.mediaUploadTimeoutMs,
      idempotencyKey: clientMutationId,
      body: JSON.stringify(withMemoriaSitePayload({
        context: options.context || 'chat-message',
        userId: options.userId || getCurrentUserIdentifier(),
        userEmail: options.userEmail || getSessionEmail(),
        fileName: file.name,
        filename: file.name,
        mimeType: 'image/webp',
        sizeBytes: file.size,
        size: file.size,
        maxBytes: uploadPolicy.maxBytes,
        policyMaxBytes: uploadPolicy.maxBytes,
        width: options.width || 0,
        height: options.height || 0,
        sha256: options.sha256 || '',
        entityType: options.entityType || 'mensaje',
        entityId: options.entityId || clientMutationId,
        conversationId: options.conversationId || '',
        expiresAt,
        ttlSeconds: CHATER_EPHEMERAL_TTL_SECONDS,
        metadata: {
          source: 'chater-static-site',
          expiresAt,
          ephemeralTtlSeconds: CHATER_EPHEMERAL_TTL_SECONDS,
          originalFilename: options.originalFilename || '',
          originalMimeType: options.originalMimeType || '',
          maxBytes: uploadPolicy.maxBytes,
          guaranteedMaxBytes: true,
          legoValidator: uploadPolicy.validator || 'IMAGENwebpCOMPRESIONx'
        },
        clientMutationId
      }))
    });
  },
  confirmR2xImage(imageId, options = {}, clientMutationId = generateClientMutationId()) {
    return this.request(`/api/v1/imagenes-r2x/${encodeURIComponent(imageId)}/confirmar`, {
      method: 'POST',
      timeoutMs: CHATER_CONFIG.mediaUploadTimeoutMs,
      idempotencyKey: clientMutationId,
      body: JSON.stringify(withMemoriaSitePayload({
        userId: options.userId || getCurrentUserIdentifier(),
        userEmail: options.userEmail || getSessionEmail(),
        entityType: options.entityType || '',
        entityId: options.entityId || '',
        conversationId: options.conversationId || '',
        expiresAt: options.expiresAt || getChatEphemeralExpiresAtIso(),
        ttlSeconds: CHATER_EPHEMERAL_TTL_SECONDS,
        metadata: {
          source: 'chater-static-site',
          expiresAt: options.expiresAt || getChatEphemeralExpiresAtIso(),
          ephemeralTtlSeconds: CHATER_EPHEMERAL_TTL_SECONDS
        },
        clientMutationId
      }))
    });
  },
  getR2xImageReadUrl(imageId, options = {}, clientMutationId = generateClientMutationId()) {
    return this.request(`/api/v1/imagenes-r2x/${encodeURIComponent(imageId)}/url-descarga`, {
      method: 'POST',
      timeoutMs: CHATER_CONFIG.mediaUploadTimeoutMs,
      idempotencyKey: clientMutationId,
      body: JSON.stringify(withMemoriaSitePayload({
        userId: options.userId || getCurrentUserIdentifier(),
        userEmail: options.userEmail || getSessionEmail(),
        entityType: options.entityType || '',
        entityId: options.entityId || '',
        conversationId: options.conversationId || '',
        clientMutationId
      }))
    });
  },
  getR2xImageConfig(context = 'chat-message') {
    const params = new URLSearchParams({ context: normalizeR2xImageContext(context) });
    return this.request(`/api/v1/imagenes-r2x/config?${params.toString()}`);
  },
  createMediaMessage(conversationId, payload) {
    const clientMutationId = payload.clientMutationId || generateClientMutationId();
    const conversation = appState.conversations.find((item) => String(item.id || '') === String(conversationId || '')) || {};
    const recipients = getConversationRemoteIdentities(conversation);
    const firstRecipient = recipients[0] || {};
    const senderUserId = getCurrentUserIdentifier();
    const senderUserEmail = getSessionEmail();
    const lifecycle = buildConversationSharedLifecycleMetadata(conversation);
    const clientTime = payload.clientTime || payload.createdAt || new Date().toISOString();
    const expiresAt = coerceChatEphemeralExpiresAtIso(payload.expiresAt || '', clientTime);
    return this.request('/api/v1/chats/send', {
      method: 'POST',
      idempotencyKey: clientMutationId,
      body: JSON.stringify(withMemoriaSitePayload({
        conversationId,
        chatId: conversationId,
        sharedConversationKey: lifecycle.sharedConversationKey,
        redisConversationKey: lifecycle.redisConversationKey,
        redisChatKey: lifecycle.redisChatKey,
        participantCount: lifecycle.participantCount,
        reuseExistingRedisChat: true,
        senderUserId,
        senderUserEmail,
        recipientUserId: firstRecipient.userId || '',
        recipientUserEmail: firstRecipient.email || '',
        text: payload.caption || '',
        attachments: [{
          mediaId: payload.mediaId || '',
          mediaUrl: payload.mediaUrl || '',
          filename: payload.filename || payload.mediaName || 'Adjunto',
          mimeType: payload.mimeType || payload.mediaMimeType || 'application/octet-stream',
          sizeBytes: payload.sizeBytes || payload.mediaSizeBytes || 0
        }],
        media: payload,
        status: 'sent',
        clientTime,
        expiresAt,
        ttlSeconds: CHATER_EPHEMERAL_TTL_SECONDS,
        metadata: {
          source: 'chater-static-site',
          senderUserId,
          senderUserEmail,
          recipientUserId: firstRecipient.userId || '',
          recipientUserEmail: firstRecipient.email || '',
          recipients,
          ...lifecycle,
          expiresAt,
          ephemeralTtlSeconds: CHATER_EPHEMERAL_TTL_SECONDS,
          channel: lifecycle.redisConversationKey ? getConversationStremeChannel(lifecycle.redisConversationKey) : getConversationStremeChannel(conversationId),
          userInboxChannel: getCurrentUserStremeInboxChannel(),
          remoteInboxChannels: recipients.map((recipient) => getUserStremeInboxChannel(recipient.email, recipient.userId)).filter(Boolean),
          media: payload
        },
        clientMutationId
      }))
    });
  },
  createState(payload) {
    const clientMutationId = payload.clientMutationId || generateClientMutationId();
    return this.request('/api/v1/publicaciones-efimeras', {
      method: 'POST',
      idempotencyKey: clientMutationId,
      body: JSON.stringify(withMemoriaSitePayload({
        ...payload,
        authorUserId: payload.authorUserId || getCurrentUserIdentifier(),
        authorUserEmail: payload.authorUserEmail || getSessionEmail(),
        visibility: payload.visibility || 'contacts',
        expiresAt: payload.expiresAt || new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        status: payload.status || 'published',
        clientMutationId
      }))
    });
  },
  registerStateView(stateId, clientMutationId = generateClientMutationId()) {
    return this.request('/api/v1/vistas-contenido', {
      method: 'POST',
      idempotencyKey: clientMutationId,
      body: JSON.stringify(withMemoriaSitePayload({
        viewerUserId: getCurrentUserIdentifier(),
        viewerUserEmail: getSessionEmail(),
        entityType: 'publicacion-efimera',
        entityId: stateId,
        viewedAt: new Date().toISOString(),
        dedupeKey: `state-view:${stateId}:${getCurrentUserIdentifier()}`,
        clientMutationId
      }))
    });
  },
  promoteState(stateId, payload = {}) {
    const clientMutationId = payload.clientMutationId || generateClientMutationId();
    const requestedAt = payload.requestedAt || new Date().toISOString();
    const promotion = {
      ...payload,
      stateId,
      status: payload.status || payload.promotionStatus || 'requested',
      requestedAt,
      source: 'chater-static-site',
      clientMutationId
    };

    return this.request(`/api/v1/publicaciones-efimeras/${encodeURIComponent(stateId)}`, {
      method: 'PATCH',
      idempotencyKey: clientMutationId,
      body: JSON.stringify(withMemoriaSitePayload({
        stateId,
        promotionRequested: true,
        promotionStatus: promotion.status,
        promotion,
        metadata: {
          source: 'chater-static-site',
          promotion
        },
        clientMutationId
      }))
    });
  },
  createCall(conversationId, type, clientMutationId = generateClientMutationId()) {
    const participants = buildCommunicationSessionParticipants(conversationId);
    const remoteParticipant = getPrimaryRemoteParticipant(participants);
    return this.request('/api/v1/sesiones-comunicacion', {
      method: 'POST',
      idempotencyKey: clientMutationId,
      body: JSON.stringify(withMemoriaSitePayload({
        conversationId,
        communicationType: type === 'video' ? 'video' : 'voice',
        participants,
        initiatorUserId: getCurrentUserIdentifier(),
        initiatorUserEmail: getSessionEmail(),
        targetUserId: remoteParticipant?.userId || '',
        targetUserEmail: remoteParticipant?.email || remoteParticipant?.userEmail || '',
        status: 'started',
        direction: 'outgoing',
        startedAt: new Date().toISOString(),
        channel: `chater-conversacion-${conversationId}`,
        metadata: {
          source: 'chater-static-site',
          participantEmails: participants.map((participant) => participant.email || participant.userEmail || '').filter(Boolean)
        },
        clientMutationId
      }))
    });
  },
  scheduleCall(conversationId, type, scheduledAt, clientMutationId = generateClientMutationId()) {
    const participants = buildCommunicationSessionParticipants(conversationId);
    const remoteParticipant = getPrimaryRemoteParticipant(participants);
    return this.request('/api/v1/sesiones-comunicacion', {
      method: 'POST',
      idempotencyKey: clientMutationId,
      body: JSON.stringify(withMemoriaSitePayload({
        conversationId,
        communicationType: type === 'video' ? 'video' : 'voice',
        participants,
        initiatorUserId: getCurrentUserIdentifier(),
        initiatorUserEmail: getSessionEmail(),
        targetUserId: remoteParticipant?.userId || '',
        targetUserEmail: remoteParticipant?.email || remoteParticipant?.userEmail || '',
        status: 'scheduled',
        direction: 'outgoing',
        scheduledAt,
        channel: `chater-conversacion-${conversationId}`,
        metadata: {
          source: 'chater-static-site',
          participantEmails: participants.map((participant) => participant.email || participant.userEmail || '').filter(Boolean)
        },
        clientMutationId
      }))
    });
  },
  sendCallSignal(payload = {}) {
    const clientMutationId = payload.clientMutationId || generateClientMutationId();
    return this.request('/api/v1/signaling-tiempo-real', {
      method: 'POST',
      idempotencyKey: clientMutationId,
      body: JSON.stringify(withMemoriaSitePayload({
        sessionId: payload.sessionId || payload.callId || '',
        callId: payload.callId || payload.sessionId || '',
        conversationId: payload.conversationId || payload.chatId || '',
        chatId: payload.chatId || payload.conversationId || '',
        fromUserId: payload.fromUserId || getCurrentUserIdentifier(),
        fromUserEmail: payload.fromUserEmail || getSessionEmail(),
        toUserId: payload.toUserId || '',
        toUserEmail: payload.toUserEmail || '',
        signalType: payload.signalType || 'invite',
        status: payload.status || 'sent',
        communicationType: payload.communicationType || payload.callType || 'voice',
        sdp: payload.sdp || '',
        candidate: payload.candidate || null,
        payload: payload.payload || {},
        metadata: {
          source: 'chater-static-site',
          transport: stremeActiveTransport || resolveStremeTransport(),
          ...(payload.metadata && typeof payload.metadata === 'object' ? payload.metadata : {})
        },
        clientMutationId
      }))
    });
  },
  publishStremeEvent(payload, options = {}) {
    const clientMutationId = payload.clientMutationId || generateClientMutationId();
    const requestedChannels = normalizeStremeChannelList(payload.channels || payload.canales || [], '');
    const channel = payload.channel || payload.canal || requestedChannels[0] || (payload.chatId ? `chater-conversacion-${payload.chatId}` : getDefaultStremeChannel());
    const channels = normalizeStremeChannelList(requestedChannels.length ? requestedChannels : [channel], channel);
    const stremeIdempotencyKey = resolveStremePublishIdempotencyKey(
      { ...payload, clientMutationId, channels, canales: channels },
      options
    );
    return this.request('/api/v1/streme/eventos', {
      method: 'POST',
      idempotencyKey: stremeIdempotencyKey,
      body: JSON.stringify(withMemoriaSitePayload({
        canal: channel,
        channel,
        canales: channels,
        channels,
        type: payload.type || payload.tipo || 'chater.event',
        tipo: payload.type || payload.tipo || 'chater.event',
        payload: { ...payload, channel, canal: channel, channels, canales: channels },
        datos: { ...payload, channel, canal: channel, channels, canales: channels },
        sender: getSessionEmail(),
        senderUserId: getCurrentUserIdentifier(),
        clientMutationId
      }))
    });
  },
  getPushConfig() {
    return this.request('/api/v1/push/config');
  },
  registerDevice(payload) {
    const clientMutationId = payload.clientMutationId || generateClientMutationId();
    return this.request('/api/v1/push/suscripciones', {
      method: 'POST',
      idempotencyKey: clientMutationId,
      body: JSON.stringify(withMemoriaSitePayload({
        userId: getCurrentUserIdentifier(),
        userEmail: getSessionEmail(),
        deviceId: payload.deviceId || getDeviceId(),
        platform: payload.platform || 'web-pwa',
        browser: payload.userAgent || navigator.userAgent || '',
        pwa: true,
        appMode: payload.appMode || 'static-site-pwa',
        clientId: payload.clientId || payload.deviceId || getDeviceId(),
        permission: payload.permission || getNotificationPermissionStatus(),
        subscription: payload.pushSubscription || payload.subscription || null,
        pushSubscription: payload.pushSubscription || payload.subscription || null,
        vapidPublicKey: payload.vapidPublicKey || resolvePushPublicKey(payload.pushConfig || null),
        token: payload.token || payload.pushToken || '',
        active: true,
        clientMutationId
      }))
    });
  },
  unregisterDevice(payload = {}) {
    const clientMutationId = payload.clientMutationId || generateClientMutationId();
    const pushSubscription = payload.pushSubscription || payload.subscription || null;
    const endpoint = String(payload.endpoint || pushSubscription?.endpoint || '').trim();

    return this.request('/api/v1/push/suscripciones', {
      method: 'DELETE',
      idempotencyKey: clientMutationId,
      body: JSON.stringify(withMemoriaSitePayload({
        userId: payload.userId || getCurrentUserIdentifier(),
        userEmail: payload.userEmail || getSessionEmail(),
        deviceId: payload.deviceId || getDeviceId(),
        clientId: payload.clientId || payload.deviceId || getDeviceId(),
        endpoint,
        subscription: pushSubscription,
        pushSubscription,
        active: false,
        status: 'revoked',
        reason: payload.reason || 'user-disabled-notifications',
        clientMutationId
      }))
    });
  },
  sendNotificationTest(payload = {}) {
    const clientMutationId = payload.clientMutationId || generateClientMutationId();
    return this.request('/api/v1/push/enviar', {
      method: 'POST',
      idempotencyKey: clientMutationId,
      body: JSON.stringify(withMemoriaSitePayload({
        deviceId: payload.deviceId || getDeviceId(),
        titulo: payload.title || 'ChatER prueba',
        title: payload.title || 'ChatER prueba',
        mensaje: payload.body || payload.message || 'Este dispositivo puede recibir avisos de ChatER.',
        message: payload.body || payload.message || 'Este dispositivo puede recibir avisos de ChatER.',
        body: payload.body || payload.message || 'Este dispositivo puede recibir avisos de ChatER.',
        url: './index.html',
        clientMutationId
      }))
    });
  },
  getApiManifest() {
    const params = new URLSearchParams({ mountOnly: '1', exposure: 'public', client: 'chater-static-site' });
    return this.request(`/api/v1/versiones/manifest?${params.toString()}`);
  },
  registerStaticVisit(payload = {}) {
    const clientMutationId = payload.clientMutationId || payload.idempotencyKey || `visit-${generateClientMutationId()}`;
    return this.request('/api/v1/visitas/apertura', {
      method: 'POST',
      idempotencyKey: clientMutationId,
      body: JSON.stringify(withMemoriaSitePayload({
        ...payload,
        idempotencyKey: clientMutationId,
        clientMutationId
      }))
    });
  },
  registerClientTelemetry(payload = {}, clientMutationId = generateClientMutationId()) {
    return this.request('/api/v1/eventos/registrar', {
      method: 'POST',
      keepalive: true,
      idempotencyKey: clientMutationId,
      body: JSON.stringify(withMemoriaSitePayload({
        type: payload.type || 'client_error',
        name: payload.name || 'Error técnico del navegador',
        category: payload.category || 'frontend-error',
        path: payload.path || `${window.location.pathname || '/'}${window.location.search || ''}`,
        value: 1,
        visitorId: payload.visitorId || getDeviceId(),
        sessionId: payload.sessionId || `browser-${getDeviceId()}`,
        data: payload.data && typeof payload.data === 'object' ? payload.data : {},
        metadata: {
          source: 'chater-static-site',
          ...(payload.metadata && typeof payload.metadata === 'object' ? payload.metadata : {})
        },
        clientMutationId
      }))
    });
  },
  recordIdReconciliation(payload = {}) {
    const entityType = String(payload.entityType || 'entidad').trim() || 'entidad';
    const temporaryId = String(payload.temporaryId || payload.localId || '').trim();
    const realId = String(payload.realId || payload.remoteId || '').trim();
    const clientMutationId = payload.clientMutationId || buildDeterministicMutationId('reconcile', entityType, temporaryId, realId);

    return this.request('/api/v1/reconciliacion-ids', {
      method: 'POST',
      idempotencyKey: clientMutationId,
      body: JSON.stringify(withMemoriaSitePayload({
        temporaryId,
        localId: temporaryId,
        realId,
        remoteId: realId,
        entityType,
        userId: payload.userId || getCurrentUserIdentifier(),
        userEmail: payload.userEmail || getSessionEmail(),
        deviceId: payload.deviceId || getDeviceId(),
        status: payload.status || 'resolved',
        metadata: {
          source: 'chater-static-site',
          ...(payload.metadata && typeof payload.metadata === 'object' ? payload.metadata : {})
        },
        clientMutationId
      }))
    });
  },
  updateSyncCursor(payload = {}) {
    const lastEventId = String(payload.lastEventId || payload.cursor || '').trim();
    const clientMutationId = payload.clientMutationId || buildDeterministicMutationId('cursor', getDeviceId(), lastEventId);

    return this.request('/api/v1/cursor-sincronizacion', {
      method: 'POST',
      idempotencyKey: clientMutationId,
      body: JSON.stringify(withMemoriaSitePayload({
        userId: payload.userId || getCurrentUserIdentifier(),
        userEmail: payload.userEmail || getSessionEmail(),
        deviceId: payload.deviceId || getDeviceId(),
        lastEventId,
        cursor: payload.cursor || lastEventId,
        pendingEvents: Array.isArray(payload.pendingEvents) ? payload.pendingEvents : [],
        status: payload.status || 'active',
        transport: payload.transport || stremeActiveTransport || resolveStremeTransport(),
        metadata: {
          source: 'chater-static-site',
          ...(payload.metadata && typeof payload.metadata === 'object' ? payload.metadata : {})
        },
        clientMutationId
      }))
    });
  },
  getBlocksSyncValidation() {
    const params = new URLSearchParams({ client: 'chater-static-site', scope: 'runtime-static-site' });
    return this.request(`/api/v1/bloques-sincronizados/validacion?${params.toString()}`);
  },
  getBlocksSyncMounts() {
    const params = new URLSearchParams({ client: 'chater-static-site', scope: 'runtime-static-site' });
    return this.request(`/api/v1/bloques-sincronizados/montajes?${params.toString()}`);
  },
  syncBusinessToolAction(toolId, payload = {}) {
    const clientMutationId = payload.clientMutationId || generateClientMutationId();
    const normalizedToolId = String(toolId || payload.toolId || 'business-tool').trim() || 'business-tool';
    const action = String(payload.action || payload.eventType || 'tool_action').trim() || 'tool_action';
    const numericValue = Number(payload.value || payload.amount || 0);

    return this.request('/api/v1/landing-tools/evento', {
      method: 'POST',
      idempotencyKey: clientMutationId,
      body: JSON.stringify(withMemoriaSitePayload({
        type: 'tool_action',
        eventType: 'tool_action',
        action,
        ctaId: normalizedToolId,
        toolId: normalizedToolId,
        path: `${window.location.pathname || '/'}${window.location.search || ''}`,
        value: Number.isFinite(numericValue) ? numericValue : 0,
        userId: getCurrentUserIdentifier(),
        userEmail: getSessionEmail(),
        clientTime: payload.clientTime || new Date().toISOString(),
        metadata: {
          source: 'chater-static-site',
          toolId: normalizedToolId,
          action,
          payload
        },
        clientMutationId
      }))
    });
  }
};
function buildApiUrl(path, options = {}) {
  const configuredApiPrefix = normalizeMemoriaApiPrefix(CHATER_CONFIG.apiPrefix || '/api/v1');
  const rawBaseUrl = String(CHATER_CONFIG.backendBaseUrl || '').trim().replace(/\/+$/, '');
  let baseUrl = rawBaseUrl;
  let normalizedPath = String(path || '').startsWith('/') ? String(path || '') : `/${path || ''}`;

  if (configuredApiPrefix !== '/api/v1' && normalizedPath.startsWith('/api/v1/')) {
    normalizedPath = `${configuredApiPrefix}${normalizedPath.slice('/api/v1'.length)}`;
  }

  if (baseUrl.endsWith(configuredApiPrefix)) {
    baseUrl = baseUrl.slice(0, -configuredApiPrefix.length) || baseUrl;
  }

  if (baseUrl.endsWith('/api/v1')) {
    baseUrl = baseUrl.slice(0, -'/api/v1'.length) || baseUrl;
  }

  const url = new URL(`${baseUrl}${normalizedPath}`, window.location.origin);
  if (options.siteScoped !== false && getMemoriaSiteId() && !url.searchParams.has('s')) {
    url.searchParams.set('s', getMemoriaSiteId());
  }
  return url.toString();
}

function shouldRequireGoogleGmailAuth() {
  return AUTH_REQUIRED;
}

function getMemoriaBackendSdk() {
  return window.memoriaBACKEND && typeof window.memoriaBACKEND === 'object' ? window.memoriaBACKEND : null;
}

function isMemoriaBackendSdkAuthenticated(sdk = getMemoriaBackendSdk()) {
  if (!sdk || typeof sdk !== 'object') return false;
  return sdk.ok === 1;
}

function isMemoriaBackendAuthenticated() {
  return isMemoriaBackendSdkAuthenticated(getMemoriaBackendSdk());
}

function getMemoriaBackendSessionUser(sdk = getMemoriaBackendSdk()) {
  if (!sdk || typeof sdk !== 'object') return {};
  const user = sdk.u || sdk.user || sdk.profile || sdk.perfil || {};
  return user && typeof user === 'object' ? user : {};
}

function buildMemoriaBackendRuntimePayload(sdk = getMemoriaBackendSdk(), extraPayload = {}) {
  if (!isMemoriaBackendSdkAuthenticated(sdk)) return null;
  const user = getMemoriaBackendSessionUser(sdk);
  return normalizeMemoriaBackendUserPayload({
    ok: 1,
    ...sdk,
    ...extraPayload,
    u: user,
    user: {
      ...(user && typeof user === 'object' ? user : {}),
      ...(extraPayload.user && typeof extraPayload.user === 'object' ? extraPayload.user : {})
    }
  }, extraPayload.email || user.email || user.e || '');
}

function isMemoriaBackendSessionReady() {
  return isMemoriaBackendSdkAuthenticated();
}

function getPlatformAuthGate() {
  const gate = window.platformAuthGate;
  if (!gate || typeof gate.whenReady !== 'function') return null;
  return gate;
}

function isPlatformAuthGateAvailable() {
  return Boolean(getPlatformAuthGate());
}

function shouldWaitForPlatformAuthGate() {
  return !!(
    shouldRequireGoogleGmailAuth()
    && window.platformAuthGate
    && typeof window.platformAuthGate.whenReady === 'function'
    && window.PLATFORM_AUTH_CONFIG?.forceGoogleLogin !== false
  );
}

function isMemoriaBackendAuthOwnerActive() {
  return Boolean(shouldRequireGoogleGmailAuth() && CHATER_CONFIG.backendBaseUrl && isPlatformAuthGateAvailable());
}

function keepLocalLoginHiddenForMemoriaBackend() {
  if (!isMemoriaBackendAuthOwnerActive()) return false;
  if (chatView && !getSessionEmail()) chatView.hidden = true;
  return true;
}

function waitForRequiredAuthentication() {
  if (!shouldRequireGoogleGmailAuth()) {
    return Promise.resolve(window.memoriaBACKEND || null);
  }

  const forceGoogleLogin = window.PLATFORM_AUTH_CONFIG?.forceGoogleLogin !== false;

  if (shouldWaitForPlatformAuthGate()) {
    window.platformAuthGate.showWaiting?.();
    return window.platformAuthGate.whenReady().then((api) => api || window.memoriaBACKEND || null);
  }

  if (forceGoogleLogin) {
    return Promise.reject(new Error('auth_gate_no_disponible'));
  }

  if (isMemoriaBackendAuthenticated()) {
    window.platformAuthGate?.markAuthenticated?.();
    return Promise.resolve(window.memoriaBACKEND || null);
  }

  window.platformAuthGate?.showWaiting?.();

  return new Promise((resolve) => {
    const resolveWhenAuthenticated = () => {
      if (!isMemoriaBackendAuthenticated()) return;
      window.removeEventListener('memoriaBACKEND:login', resolveWhenAuthenticated);
      window.platformAuthGate?.markAuthenticated?.();
      resolve(window.memoriaBACKEND);
    };

    window.addEventListener('memoriaBACKEND:login', resolveWhenAuthenticated);
    window.platformAuthGate?.whenReady?.().then(resolveWhenAuthenticated).catch(() => {});
    resolveWhenAuthenticated();
  });
}

function isMemoriaBackendKeepaliveEnabled() {
  // Producción ChatER no usa polling de backend. Esta llamada queda solo como
  // diagnóstico/evento manual explícito para entornos privados que la activen.
  return window.CHATER_CONFIG?.ENABLE_MEMORIA_BACKEND_KEEPALIVE === true;
}

function startMemoriaBackendKeepalive() {
  if (memoriaKeepaliveTimer || !isMemoriaBackendKeepaliveEnabled()) return;
  memoriaKeepaliveTimer = 1;

  pingMemoriaBackendVida();

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) pingMemoriaBackendVida();
  }, { passive: true });
}

async function pingMemoriaBackendVida() {
  if (memoriaKeepaliveInFlight) return;

  const url = getMemoriaBackendKeepaliveUrl();
  if (!url || typeof fetch !== 'function') return;

  memoriaKeepaliveInFlight = true;
  try {
    await fetch(url, {
      method: 'GET',
      cache: 'no-store',
      credentials: 'include',
      keepalive: true,
      headers: {
        'X-MB-Site': getMemoriaSiteId()
      }
    });
  } catch (_) {
    // Esta llamada no modifica la interfaz y no se ejecuta en producción por defecto.
  } finally {
    memoriaKeepaliveInFlight = false;
  }
}

function getMemoriaBackendKeepaliveUrl() {
  const baseUrl = CHATER_CONFIG.backendBaseUrl;
  if (!baseUrl) return '';

  try {
    return new URL(MEMORIA_BACKEND_KEEPALIVE_PATH, baseUrl).toString();
  } catch (_) {
    return '';
  }
}

async function completeMemoriaBackendRuntimeSession(api = getMemoriaBackendSdk()) {
  const sdk = api || getMemoriaBackendSdk();
  const runtimePayload = buildMemoriaBackendRuntimePayload(sdk);
  if (!runtimePayload) return false;

  const email = getMemoriaBackendPayloadEmail(runtimePayload, '');
  if (!email) {
    setAuthFeedback('memoriaBACKEND no entregó el correo de la cuenta validada.');
    return false;
  }
  if (requireGmailDomain && !isAllowedGmailAddress(email)) {
    setAuthFeedback('ChatER requiere una cuenta Gmail validada por Google para abrir la sesión.');
    return false;
  }

  return activateMemoriaBackendRuntimeSession(email, runtimePayload);
}

function handleMemoriaBackendLoginEvent() {
  completeMemoriaBackendRuntimeSession().catch((error) => {
    setAuthFeedback(error?.message || 'No se pudo leer la sesión expuesta por memoriaBACKEND.');
  });
}

function registerMemoriaBackendLoginListeners() {
  window.addEventListener('memoriaBACKEND:login', handleMemoriaBackendLoginEvent);
}

async function bootstrapGoogleGmailSession() {
  renderBrandLogos();

  if (!shouldRequireGoogleGmailAuth()) {
    renderShell();
    return;
  }

  if (!CHATER_CONFIG.backendBaseUrl) {
    clearSession();
    setAuthFeedback('Configura MEMORIA_BACKEND_URL para acceder a ChatER con memoriaBACKEND.');
    renderShell();
    return;
  }

  setAuthFeedback('Esperando memoriaBACKEND...');
  keepLocalLoginHiddenForMemoriaBackend();

  try {
    const api = await waitForRequiredAuthentication();
    const completed = await completeMemoriaBackendRuntimeSession(api);
    if (completed || getSessionEmail()) return;
    clearSession();
    setAuthFeedback('La sesión debe completarse en memoriaBACKEND para abrir ChatER.');
    keepLocalLoginHiddenForMemoriaBackend();
  } catch (error) {
    clearSession();
    setAuthFeedback(error?.message || 'No se pudo validar la sesión con memoriaBACKEND.');
    getPlatformAuthGate()?.showError?.(getAuthFeedback());
    keepLocalLoginHiddenForMemoriaBackend();
  }
}

async function fetchWithTimeout(resource, options = {}, timeoutMs = CHATER_CONFIG.apiTimeoutMs) {
  const normalizedTimeout = resolvePositiveConfigNumber(timeoutMs, CHATER_CONFIG.apiTimeoutMs);
  if (!normalizedTimeout || typeof AbortController === 'undefined') {
    return fetch(resource, options);
  }

  const externalSignal = options.signal;
  const controller = new AbortController();
  let didTimeout = false;

  const abortFromExternalSignal = () => {
    controller.abort(externalSignal?.reason);
  };

  if (externalSignal?.aborted) {
    controller.abort(externalSignal.reason);
  } else if (externalSignal?.addEventListener) {
    externalSignal.addEventListener('abort', abortFromExternalSignal, { once: true });
  }

  const timeoutId = setTimeout(() => {
    didTimeout = true;
    controller.abort();
  }, normalizedTimeout);

  try {
    return await fetch(resource, { ...options, signal: controller.signal });
  } catch (error) {
    if (didTimeout) {
      const timeoutError = new Error(`memoriaBACKEND no respondió en ${Math.round(normalizedTimeout / 1000)} segundos.`);
      timeoutError.code = 'REQUEST_TIMEOUT';
      timeoutError.timeoutMs = normalizedTimeout;
      throw timeoutError;
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
    if (externalSignal?.removeEventListener) {
      externalSignal.removeEventListener('abort', abortFromExternalSignal);
    }
  }
}

function isMemoriaBackendErrorPayload(payload = {}) {
  if (!payload || typeof payload !== 'object') return false;
  const ok = payload.ok;
  if (ok === false || ok === 0) return true;
  if (typeof ok === 'string') {
    const normalizedOk = ok.trim().toLowerCase();
    return normalizedOk === '0' || normalizedOk === 'false';
  }
  return false;
}

function createBackendPayloadError(payload = {}, response = null) {
  const statusCode = Number(
    payload.metadata?.statusCode
    || payload.statusCode
    || payload.error?.statusCode
    || response?.status
    || 0
  ) || 500;
  const message = extractBackendErrorMessage(payload) || `memoriaBACKEND rechazó la operación (${statusCode}).`;
  const error = new Error(message);
  error.status = statusCode;
  error.code = String(payload.err || payload.error?.code || payload.code || payload.metadata?.err || '').trim();
  error.payload = payload;
  return error;
}

async function createBackendHttpError(response) {
  const payload = await readBackendErrorPayload(response);
  const message = extractBackendErrorMessage(payload) || `memoriaBACKEND respondió ${response.status}`;
  const error = new Error(message);
  error.status = response.status;
  error.code = String(payload.err || payload.error?.code || payload.code || payload.metadata?.err || '').trim();
  error.payload = payload;
  return error;
}

async function readBackendErrorPayload(response) {
  const contentType = response.headers.get('content-type') || '';
  try {
    if (contentType.includes('application/json')) return response.json();
    const text = await response.text();
    return text ? { message: text } : {};
  } catch (error) {
    return {};
  }
}

function extractBackendErrorMessage(payload = {}) {
  if (!payload || typeof payload !== 'object') return '';
  return String(
    payload.message
    || payload.error?.message
    || payload.error_description
    || payload.detail
    || payload.title
    || payload.err
    || payload.error?.code
    || payload.code
    || payload.metadata?.err
    || ''
  ).trim();
}

function advanceSessionRuntime(email = getSessionEmail()) {
  activeSessionRuntimeId += 1;
  activeSessionRuntimeEmail = normalizeStorageIdentity(email);
  messageHistoryHydration.inFlight.clear();
}

function captureSessionGuard(email = getSessionEmail()) {
  const normalizedEmail = normalizeStorageIdentity(email);
  return {
    id: activeSessionRuntimeId,
    email: normalizedEmail
  };
}

function getSessionGuardKey(guard = captureSessionGuard()) {
  return `${guard.email || 'anonymous'}#${guard.id}`;
}

function isSessionGuardCurrent(guard) {
  const currentEmail = normalizeStorageIdentity(getSessionEmail());
  return Boolean(
    guard
    && guard.id === activeSessionRuntimeId
    && guard.email === currentEmail
    && guard.email === activeSessionRuntimeEmail
  );
}

function readBackendOutbox(email = getSessionEmail()) {
  const storageKey = getOutboxStorageKey(email);
  try {
    let parsed = JSON.parse(readStorageItem(storageKey, '[]') || '[]');

    if ((!Array.isArray(parsed) || !parsed.length) && shouldAdoptLegacyStorage(email) && storageKey !== CHATER_CONFIG.outboxKey) {
      const legacyParsed = JSON.parse(readStorageItem(CHATER_CONFIG.outboxKey, '[]') || '[]');
      if (Array.isArray(legacyParsed) && legacyParsed.length) {
        parsed = legacyParsed;
        writeStorageItem(storageKey, JSON.stringify(legacyParsed));
      }
    }

    if (!Array.isArray(parsed)) return [];
    const compactedQueue = compactBackendOutboxQueue(parsed);
    if (compactedQueue.length !== parsed.length) persistBackendOutbox(compactedQueue, email);
    return compactedQueue;
  } catch (error) {
    console.warn('No se pudo leer la cola local de sincronización.', error);
    return [];
  }
}

function persistBackendOutbox(queue, email = getSessionEmail()) {
  try {
    writeStorageItem(getOutboxStorageKey(email), JSON.stringify(Array.isArray(queue) ? queue : []), { throwOnError: true });
  } catch (error) {
    console.warn('No se pudo guardar la cola local de sincronización.', error);
  }
}

function isQueuedConversationArchivePatch(operation = {}) {
  return operation?.type === 'updateConversation'
    && operation.payload?.patch
    && Object.prototype.hasOwnProperty.call(operation.payload.patch, 'archived');
}

function getQueuedArchiveConversationId(operation = {}) {
  return String(operation.payload?.conversationId || operation.payload?.patch?.conversationId || '').trim();
}

function getQueuedArchiveMutationId(operation = {}) {
  return String(operation.payload?.patch?.clientMutationId || operation.payload?.clientMutationId || '').trim();
}

function getQueuedArchiveChangedAt(operation = {}) {
  const patch = operation.payload?.patch || {};
  return patch.archiveChangedAt
    || patch.archiveUpdatedAt
    || patch.archivedAt
    || patch.restoredAt
    || operation.updatedAt
    || operation.createdAt
    || '';
}

function getConversationArchiveOutboxKey(conversationId = '') {
  return `conversation-archive:${String(conversationId || '').trim()}`;
}

function shouldDiscardQueuedArchiveOperation(operation = {}) {
  if (!isQueuedConversationArchivePatch(operation)) return false;

  const conversationId = getQueuedArchiveConversationId(operation);
  if (!conversationId) return false;

  const conversation = appState.conversations.find((item) => String(item.id || '') === conversationId && !item.deleted);
  if (!conversation) return false;

  const queuedArchived = coerceBooleanFlag(operation.payload.patch.archived, false);
  const localArchived = coerceFirstBooleanFlag([conversation.archived], false);
  if (queuedArchived === localArchived) return false;

  const queuedMutationId = getQueuedArchiveMutationId(operation);
  const localMutationId = String(conversation.archiveLocalMutationId || conversation.archiveClientMutationId || '').trim();
  if (localMutationId && queuedMutationId && localMutationId !== queuedMutationId) return true;

  if (isArchiveSyncStatusPending(conversation.archiveSyncStatus)) return true;

  const queuedChangedAt = parseArchiveTimestampMs(getQueuedArchiveChangedAt(operation));
  const localChangedAt = parseArchiveTimestampMs(getLocalArchiveChangedAt(conversation));
  if (localChangedAt && queuedChangedAt) return localChangedAt >= queuedChangedAt - 5000;

  if (hasExplicitLocalArchiveDecision(conversation)) return true;

  return false;
}

function isQueuedEphemeralMessageOperationExpired(operation = {}) {
  if (!['sendMessage', 'createMediaMessage'].includes(operation?.type)) return false;
  const payload = operation.payload || {};
  const mediaPayload = payload.mediaMessagePayload || {};
  const createdAt = payload.createdAt
    || payload.clientTime
    || mediaPayload.createdAt
    || mediaPayload.clientTime
    || operation.createdAt
    || '';
  const explicitExpiresAt = payload.expiresAt
    || mediaPayload.expiresAt
    || mediaPayload.metadata?.expiresAt
    || '';
  if (!explicitExpiresAt && !createdAt) return false;
  const expiresAt = explicitExpiresAt || coerceChatEphemeralExpiresAtIso('', createdAt);
  return isChatMessageExpired({ expiresAt });
}

function removeQueuedEphemeralMessageFromLocalState(operation = {}) {
  const payload = operation.payload || {};
  const conversationId = String(payload.conversationId || '').trim();
  const messageId = String(payload.clientMessageId || payload.mediaMessagePayload?.clientMutationId || '').trim();
  if (!conversationId || !messageId || typeof appState === 'undefined') return false;
  const conversation = appState.conversations?.find?.((item) => String(item.id || '') === conversationId);
  if (!conversation || !Array.isArray(conversation.messages)) return false;
  const beforeCount = conversation.messages.length;
  conversation.messages = conversation.messages.filter((message) => {
    const ids = getMessageIdentityCandidates(message);
    return !ids.includes(messageId);
  });
  return conversation.messages.length !== beforeCount;
}

function cleanupExpiredQueuedEphemeralOperation(operation = {}, options = {}) {
  if (!isQueuedEphemeralMessageOperationExpired(operation)) return false;
  const localStateChanged = removeQueuedEphemeralMessageFromLocalState(operation);
  if (localStateChanged && typeof options.onLocalStateChanged === 'function') {
    options.onLocalStateChanged(operation);
  }
  if (localStateChanged && options.persist !== false) {
    persistState();
    if (options.render !== false) renderCurrentSection();
  }
  return true;
}



function isQueuedStremeOperationExpired(operation = {}) {
  if (operation?.type !== 'publishStremeEvent') return false;
  const eventPayload = getQueuedStremeEventPayload(operation);
  const nestedPayload = eventPayload.payload && typeof eventPayload.payload === 'object' ? eventPayload.payload : {};
  const datosPayload = eventPayload.datos && typeof eventPayload.datos === 'object' ? eventPayload.datos : {};
  const createdAt = eventPayload.createdAt
    || eventPayload.clientTime
    || eventPayload.timestamp
    || nestedPayload.createdAt
    || nestedPayload.clientTime
    || nestedPayload.timestamp
    || datosPayload.createdAt
    || datosPayload.clientTime
    || datosPayload.timestamp
    || operation.createdAt
    || operation.enqueuedAt
    || operation.queuedAt
    || '';
  const explicitExpiresAt = eventPayload.expiresAt
    || eventPayload.expiryAt
    || eventPayload.expireAt
    || nestedPayload.expiresAt
    || nestedPayload.expiryAt
    || nestedPayload.expireAt
    || datosPayload.expiresAt
    || datosPayload.expiryAt
    || datosPayload.expireAt
    || '';
  if (!explicitExpiresAt && !createdAt) return false;
  const expiresAt = explicitExpiresAt || coerceChatEphemeralExpiresAtIso('', createdAt);
  return isChatMessageExpired({ expiresAt });
}

function cleanupExpiredQueuedStremeOperation(operation = {}) {
  return isQueuedStremeOperationExpired(operation);
}

function getQueuedStremeEventPayload(operation = {}) {
  if (operation?.type !== 'publishStremeEvent') return {};
  const payload = operation.payload || {};
  return payload.event && typeof payload.event === 'object' ? payload.event : payload;
}

function getQueuedStremeEventType(operation = {}) {
  const eventPayload = getQueuedStremeEventPayload(operation);
  const nestedPayload = eventPayload.payload && typeof eventPayload.payload === 'object' ? eventPayload.payload : {};
  const datosPayload = eventPayload.datos && typeof eventPayload.datos === 'object' ? eventPayload.datos : {};
  return normalizeStremeEventType(
    eventPayload.type
      || eventPayload.tipo
      || nestedPayload.type
      || nestedPayload.tipo
      || datosPayload.type
      || datosPayload.tipo
      || ''
  );
}

function isObsoleteQueuedStremeEventOperation(operation = {}) {
  if (operation?.type !== 'publishStremeEvent') return false;
  const eventType = getQueuedStremeEventType(operation);
  const obsoletePendingType = ['message', 'outgoing', 'pending'].join('.');
  return eventType === 'message.created' || eventType === obsoletePendingType;
}

function collectQueuedStremeConflictText(source = {}, depth = 0) {
  if (!source || depth > 3) return '';
  if (typeof source === 'string') return source;
  if (typeof source !== 'object') return String(source || '');

  const pieces = [
    source.lastError,
    source.lastErrorCode,
    source.lastStatusCode,
    source.error,
    source.err,
    source.code,
    source.statusCode,
    source.status,
    source.responseStatus,
    source.message,
    source.conflictCode,
    source.idempotencyStatus,
    source.skipped
  ];

  ['payload', 'event', 'response', 'metadata', 'data', 'details'].forEach((key) => {
    const nested = source[key];
    if (nested && typeof nested === 'object') {
      pieces.push(collectQueuedStremeConflictText(nested, depth + 1));
    } else if (typeof nested === 'string') {
      pieces.push(nested);
    }
  });

  return pieces.filter(Boolean).join(' ');
}

function isStremeConflictNoopText(value = '') {
  const text = String(value || '').toLowerCase();
  if (!text) return false;
  return text.includes('streme_idempotency_conflict_noop')
    || text.includes('idempotency')
    || text.includes('idempotencia')
    || text.includes('idempotent')
    || text.includes('idempotente')
    || text.includes('conflict')
    || text.includes('conflicto')
    || text.includes('processing')
    || text.includes('proceso')
    || text.includes('scope_mismatch')
    || text.includes('duplicad');
}

function isQueuedStremeConflictNoopOperation(operation = {}) {
  if (operation?.type !== 'publishStremeEvent') return false;
  const attempts = Number(operation.attempts || 0);
  if (attempts <= 0) return false;

  const status = Number(operation.lastStatusCode || operation.statusCode || operation.status || 0);
  const conflictText = collectQueuedStremeConflictText(operation);
  return status === 409 || isStremeConflictNoopText(conflictText);
}

function isStremeQueuedReplayNoopError(error = {}) {
  if (isStremePublishIdempotencyConflict(error)) return true;

  const status = Number(
    error.status
      || error.responseStatus
      || error.statusCode
      || error.payload?.statusCode
      || error.payload?.metadata?.statusCode
      || 0
  );
  if (status === 409) return true;

  return isStremeConflictNoopText(collectQueuedStremeConflictText(error));
}

function compactBackendOutboxQueue(queue = []) {
  let expiredLocalStateChanged = false;
  const items = Array.isArray(queue)
    ? queue.filter((operation) => {
        if (!operation || !operation.id || !operation.type || !operation.payload) return false;
        if (cleanupExpiredQueuedEphemeralOperation(operation, {
          persist: false,
          render: false,
          onLocalStateChanged: () => { expiredLocalStateChanged = true; }
        })) {
          return false;
        }
        if (cleanupExpiredQueuedStremeOperation(operation)) return false;
        if (isObsoleteQueuedStremeEventOperation(operation)) return false;
        if (isQueuedStremeConflictNoopOperation(operation)) return false;
        return true;
      })
    : [];
  if (expiredLocalStateChanged) {
    persistState();
    renderCurrentSection();
  }
  const latestArchiveOperationByConversation = new Map();

  items.forEach((operation, index) => {
    if (!isQueuedConversationArchivePatch(operation)) return;
    const conversationId = getQueuedArchiveConversationId(operation);
    if (!conversationId) return;

    const current = latestArchiveOperationByConversation.get(conversationId);
    const currentTime = current !== undefined ? parseArchiveTimestampMs(getQueuedArchiveChangedAt(items[current])) : 0;
    const operationTime = parseArchiveTimestampMs(getQueuedArchiveChangedAt(operation));
    if (current === undefined || operationTime >= currentTime) {
      latestArchiveOperationByConversation.set(conversationId, index);
    }
  });

  return items.filter((operation, index) => {
    if (!isQueuedConversationArchivePatch(operation)) return true;
    if (shouldDiscardQueuedArchiveOperation(operation)) return false;
    const conversationId = getQueuedArchiveConversationId(operation);
    if (!conversationId) return true;
    return latestArchiveOperationByConversation.get(conversationId) === index;
  });
}

function removeQueuedArchiveOperationsForConversation(conversationId = '', email = getSessionEmail()) {
  const normalizedConversationId = String(conversationId || '').trim();
  if (!normalizedConversationId || !CHATER_CONFIG.backendBaseUrl) return;

  const ownerEmail = normalizeStorageIdentity(email);
  const queue = readBackendOutbox(ownerEmail);
  if (!queue.length) return;

  const filteredQueue = queue.filter((operation) => {
    return !(isQueuedConversationArchivePatch(operation) && getQueuedArchiveConversationId(operation) === normalizedConversationId);
  });

  if (filteredQueue.length !== queue.length) {
    persistBackendOutbox(filteredQueue, ownerEmail);
  }
}


function getConversationLifecycleContactEmail(conversation = {}) {
  const directEmail = normalizeStorageIdentity(conversation.email || conversation.contactEmail || conversation.userEmail || '');
  if (directEmail) return directEmail;

  const participants = normalizeConversationParticipantsForApi(
    conversation.participants,
    conversation.email || conversation.contactEmail,
    conversation.name || conversation.displayName
  );
  const remoteParticipant = getPrimaryRemoteParticipant(participants) || {};
  return normalizeStorageIdentity(remoteParticipant.email || remoteParticipant.userEmail || remoteParticipant.contactEmail || '');
}

function getQueuedLifecycleConversationId(operation = {}) {
  const payload = operation.payload || {};
  const patch = payload.patch || {};
  const conversation = payload.conversation || {};
  const contact = payload.contact || {};
  return String(
    payload.conversationId
    || payload.localConversationId
    || patch.conversationId
    || conversation.id
    || conversation.conversationId
    || contact.conversationId
    || contact.chatId
    || ''
  ).trim();
}

function getQueuedLifecycleContactEmail(operation = {}) {
  const payload = operation.payload || {};
  const contact = payload.contact || {};
  const conversation = payload.conversation || {};
  const patch = payload.patch || {};
  return normalizeStorageIdentity(
    payload.contactEmail
    || payload.blockedEmail
    || payload.blockedUserEmail
    || payload.email
    || patch.contactEmail
    || patch.email
    || contact.email
    || contact.contactEmail
    || contact.userEmail
    || conversation.email
    || conversation.contactEmail
    || conversation.userEmail
    || ''
  );
}

function isQueuedLifecycleOperationForConversation(operation = {}, conversation = {}) {
  const conversationId = String(conversation.id || '').trim();
  const contactEmail = getConversationLifecycleContactEmail(conversation);
  const operationConversationId = getQueuedLifecycleConversationId(operation);
  const operationContactEmail = getQueuedLifecycleContactEmail(operation);

  return Boolean(
    (conversationId && operationConversationId && operationConversationId === conversationId)
    || (contactEmail && operationContactEmail && operationContactEmail === contactEmail)
  );
}

function shouldRemoveQueuedLifecycleOperation(operation = {}, conversation = {}) {
  if (!isQueuedLifecycleOperationForConversation(operation, conversation)) return false;

  if (operation.type === 'blockUser') return true;
  if (operation.type === 'upsertUserRelation') return true;
  if (operation.type === 'createConversation') return true;
  if (operation.type === 'updateConversation') return true;
  if (operation.type === 'sendMessage') return true;
  if (operation.type === 'createMediaMessage') return true;

  if (operation.type === 'syncChatAction') {
    const actionType = String(operation.payload?.actionType || '').trim();
    return ['delete_conversation', 'restore_conversation', 'clear_messages'].includes(actionType);
  }

  return false;
}

function removeQueuedLifecycleOperationsForConversation(conversation = {}, email = getSessionEmail()) {
  if (!conversation || !CHATER_CONFIG.backendBaseUrl) return;

  const ownerEmail = normalizeStorageIdentity(email);
  const queue = readBackendOutbox(ownerEmail);
  if (!queue.length) return;

  const filteredQueue = queue.filter((operation) => !shouldRemoveQueuedLifecycleOperation(operation, conversation));
  if (filteredQueue.length !== queue.length) {
    persistBackendOutbox(filteredQueue, ownerEmail);
  }
}

function clearConversationBlockState(conversation = {}, options = {}) {
  if (!conversation) return;
  const changedAt = options.changedAt || options.syncedAt || new Date().toISOString();
  const clientMutationId = options.clientMutationId || generateClientMutationId();
  conversation.blocked = false;
  conversation.blockDesiredBlocked = false;
  conversation.blockSyncStatus = options.syncStatus || '';
  conversation.blockSyncedAt = options.syncedAt || '';
  conversation.blockChangedAt = changedAt;
  conversation.blockLocalChangedAt = changedAt;
  conversation.blockClientMutationId = clientMutationId;
  conversation.blockLocalMutationId = clientMutationId;
}

async function syncConversationUnblockCleanup(conversation = {}, payload = null, sessionGuard = captureSessionGuard(), options = {}) {
  if (!conversation || !payload || !CHATER_CONFIG.backendBaseUrl) return;

  const cleanupStatus = options.status || 'delete_cleanup';
  conversation.blockSyncStatus = `syncing:${cleanupStatus}`;
  persistState();

  try {
    await apiClient.blockUser(payload);
    if (!isSessionGuardCurrent(sessionGuard)) return;
    const syncedAt = new Date().toISOString();
    conversation.blocked = false;
    conversation.blockDesiredBlocked = false;
    conversation.blockSyncStatus = `synced:${cleanupStatus}`;
    conversation.blockSyncedAt = syncedAt;
    conversation.blockChangedAt = syncedAt;
    conversation.blockClientMutationId = payload.clientMutationId || conversation.blockClientMutationId || '';
  } catch (error) {
    if (!isSessionGuardCurrent(sessionGuard)) return;
    const pendingAt = new Date().toISOString();
    conversation.blocked = false;
    conversation.blockDesiredBlocked = false;
    conversation.blockSyncStatus = `pending:${cleanupStatus}`;
    conversation.blockChangedAt = pendingAt;
    conversation.blockLocalChangedAt = pendingAt;
    conversation.blockClientMutationId = payload.clientMutationId || conversation.blockClientMutationId || '';
    conversation.blockLocalMutationId = payload.clientMutationId || conversation.blockLocalMutationId || '';
    enqueueBackendOperation({
      type: 'blockUser',
      dedupeKey: `block-user:${conversation.id}`,
      replaceExisting: true,
      payload
    });
  } finally {
    if (isSessionGuardCurrent(sessionGuard)) persistState();
  }
}

function enqueueBackendOperation(operation) {
  if (!CHATER_CONFIG.backendBaseUrl || !operation?.type || !operation?.payload) return null;

  const ownerEmail = normalizeStorageIdentity(getSessionEmail());
  if (shouldRequireGoogleGmailAuth() && !ownerEmail) {
    console.warn('No se encoló la operación pendiente porque no hay una sesión Google/Gmail vigente validada por memoriaBACKEND.');
    return null;
  }

  let queue = readBackendOutbox(ownerEmail);
  const operationForArchiveCheck = { type: operation.type, payload: operation.payload };
  if (operation.replaceExisting && isQueuedConversationArchivePatch(operationForArchiveCheck)) {
    const conversationId = getQueuedArchiveConversationId(operationForArchiveCheck);
    if (conversationId) {
      queue = queue.filter((item) => !(isQueuedConversationArchivePatch(item) && getQueuedArchiveConversationId(item) === conversationId));
    }
  }

  const dedupeKey = operation.dedupeKey || `${operation.type}:${operation.payload.clientMutationId || operation.payload.localId || generateClientMutationId()}`;
  const existingOperation = queue.find((item) => item.dedupeKey === dedupeKey);
  if (existingOperation) {
    if (operation.replaceExisting) {
      existingOperation.payload = operation.payload;
      existingOperation.attempts = 0;
      existingOperation.lastAttemptAt = '';
      existingOperation.lastError = '';
      existingOperation.updatedAt = new Date().toISOString();
      persistBackendOutbox(queue, ownerEmail);
      scheduleOutboxFlush();
    }
    return existingOperation;
  }

  const queuedOperation = {
    id: `outbox-${generateClientMutationId()}`,
    type: operation.type,
    dedupeKey,
    payload: operation.payload,
    attempts: 0,
    ownerEmail,
    createdAt: new Date().toISOString()
  };

  queue.push(queuedOperation);
  persistBackendOutbox(queue, ownerEmail);
  scheduleOutboxFlush();
  return queuedOperation;
}

function normalizeContactRelationTags(tags = []) {
  const rawTags = Array.isArray(tags) ? tags : String(tags || '').split(',');
  return [...new Set(rawTags
    .map((tag) => String(tag || '').trim())
    .filter(Boolean))]
    .slice(0, 20);
}

function buildContactRelationPayload(contact = {}, options = {}) {
  const contactEmail = normalizeStorageIdentity(contact.email || contact.contactEmail || options.email || '');
  if (!contactEmail) return null;

  const displayName = String(contact.name || contact.displayName || options.name || contactEmail).trim();
  const conversationId = String(contact.conversationId || contact.chatId || options.conversationId || '').trim();
  const clientMutationId = contact.relationClientMutationId
    || options.relationClientMutationId
    || `${contact.clientMutationId || options.clientMutationId || generateClientMutationId()}:relation`;

  return {
    email: contactEmail,
    contactEmail,
    name: displayName,
    displayName,
    alias: String(contact.alias || displayName).trim(),
    conversationId,
    localConversationId: String(contact.localConversationId || options.localConversationId || '').trim(),
    relationType: contact.relationType || options.relationType || 'contact',
    status: contact.status || options.status || 'active',
    favorite: coerceFirstBooleanFlag([contact.favorite, options.favorite], false),
    blocked: coerceFirstBooleanFlag([contact.blocked, options.blocked], false),
    tags: normalizeContactRelationTags(contact.tags || options.tags || contact.relationTags || []),
    reason: contact.reason || options.reason || 'conversation-contact',
    clientMutationId,
    relationClientMutationId: clientMutationId
  };
}

function enqueueContactRelationSync(contact = {}, options = {}) {
  const payload = buildContactRelationPayload(contact, options);
  if (!payload) return null;

  return enqueueBackendOperation({
    type: 'upsertUserRelation',
    dedupeKey: `relation:${payload.contactEmail}`,
    replaceExisting: true,
    payload
  });
}

async function syncContactRelation(contact = {}, options = {}) {
  const payload = buildContactRelationPayload(contact, options);
  if (!payload || !CHATER_CONFIG.backendBaseUrl) return null;

  try {
    const response = await apiClient.upsertUserRelation(payload);
    markContactRelationSynced(payload, response);
    return response;
  } catch (error) {
    if (options.enqueueOnFailure !== false) {
      enqueueContactRelationSync(payload);
    }
    if (options.throwOnError) throw error;
    return null;
  }
}


function isContactProfileNotFoundError(error = {}) {
  const status = Number(error.status || error.responseStatus || error.payload?.statusCode || error.payload?.metadata?.statusCode || 0);
  const code = getBackendErrorCode(error);
  const message = String(error.message || error.payload?.message || error.payload?.error?.message || '').toLowerCase();
  return code === 'contact_profile_not_found'
    || code.includes('contact_profile_not_found')
    || (status === 404 && /(contacto|perfil|profile|contact).*(no existe|no encontrado|not found|missing)/i.test(message));
}

function buildContactProfileNotFoundFeedback(contact = {}) {
  const email = normalizeStorageIdentity(contact.email || contact.contactEmail || '');
  return email
    ? `No se encontró un perfil ChatER activo para ${email}. El contacto solo se puede crear si esa persona ya inició sesión con Google/Gmail en ChatER.`
    : 'No se encontró un perfil ChatER activo para ese contacto. El contacto solo se puede crear si esa persona ya inició sesión con Google/Gmail en ChatER.';
}

function markContactRelationSynced(contact = {}, payload = {}) {
  const contactEmail = normalizeStorageIdentity(contact.email || contact.contactEmail || '');
  if (!contactEmail) return;

  appState.conversations.forEach((conversation) => {
    const conversationEmail = normalizeStorageIdentity(conversation.email || conversation.contactEmail || '');
    if (conversationEmail !== contactEmail) return;
    conversation.relationSyncStatus = payload?.offlineDemo ? 'local' : 'synced';
    conversation.relationSyncedAt = new Date().toISOString();
  });
  persistState();
}

function scheduleOutboxFlush(delayMs = 1400) {
  if (!CHATER_CONFIG.backendBaseUrl) return;
  clearTimeout(outboxRetryTimer);
  outboxRetryTimer = setTimeout(flushBackendOutbox, delayMs);
}

async function flushBackendOutbox() {
  if (!CHATER_CONFIG.backendBaseUrl || !getSessionEmail()) return;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return;

  const sessionGuard = captureSessionGuard();
  if (!sessionGuard.email || !isSessionGuardCurrent(sessionGuard)) return;

  const sessionKey = getSessionGuardKey(sessionGuard);
  if (outboxFlushInFlight === sessionKey) return;

  outboxFlushInFlight = sessionKey;
  try {
    while (isSessionGuardCurrent(sessionGuard) && readBackendOutbox(sessionGuard.email).length) {
      const operation = readBackendOutbox(sessionGuard.email)[0];
      if (isQueuedStremeConflictNoopOperation(operation)) {
        persistBackendOutbox(readBackendOutbox(sessionGuard.email).filter((item) => item.id !== operation.id), sessionGuard.email);
        continue;
      }
      try {
        await replayBackendOperation(operation, sessionGuard);
        if (!isSessionGuardCurrent(sessionGuard)) break;
        persistBackendOutbox(readBackendOutbox(sessionGuard.email).filter((item) => item.id !== operation.id), sessionGuard.email);
      } catch (error) {
        if (!isSessionGuardCurrent(sessionGuard)) break;
        const currentQueue = readBackendOutbox(sessionGuard.email);
        if (operation.type === 'publishStremeEvent' && isStremeQueuedReplayNoopError(error)) {
          persistBackendOutbox(currentQueue.filter((item) => item.id !== operation.id), sessionGuard.email);
          continue;
        }
        const updatedOperation = {
          ...operation,
          attempts: Number(operation.attempts || 0) + 1,
          lastAttemptAt: new Date().toISOString(),
          lastError: error?.message || 'No se pudo sincronizar la operación pendiente.',
          lastErrorCode: getBackendErrorCode(error),
          lastStatusCode: Number(error?.status || error?.responseStatus || error?.statusCode || error?.payload?.statusCode || error?.payload?.metadata?.statusCode || 0) || ''
        };

        if (error?.message === 'conversation_sync_pending' && currentQueue.length > 1) {
          persistBackendOutbox([
            ...currentQueue.filter((item) => item.id !== operation.id),
            updatedOperation
          ], sessionGuard.email);
          continue;
        }

        const updatedQueue = currentQueue.map((item) => (item.id === operation.id ? updatedOperation : item));
        persistBackendOutbox(updatedQueue, sessionGuard.email);
        break;
      }
    }
  } finally {
    if (outboxFlushInFlight === sessionKey) {
      outboxFlushInFlight = '';
    }

    if (isSessionGuardCurrent(sessionGuard)) {
      const pendingQueue = readBackendOutbox(sessionGuard.email);
      if (pendingQueue.length) {
        const attempts = Number(pendingQueue[0].attempts || 0);
        const nextDelay = Math.min(60000, 3000 * (2 ** Math.min(attempts, 5)));
        scheduleOutboxFlush(nextDelay);
      }
    }
  }
}

async function replayBackendOperation(operation, sessionGuard = captureSessionGuard()) {
  if (operation.type === 'createConversation') {
    const contact = operation.payload.contact || {};
    const payload = await apiClient.createConversation(contact);
    if (!isSessionGuardCurrent(sessionGuard)) return;
    const remoteConversationId = extractEntityId(payload, ['chat', 'conversation']) || operation.payload.localConversationId || contact.conversationId || '';
    markQueuedConversationSynced(operation.payload.localConversationId, payload);
    await syncContactRelation(contact, {
      conversationId: remoteConversationId,
      localConversationId: operation.payload.localConversationId,
      enqueueOnFailure: true
    });
    return;
  }

  if (operation.type === 'upsertUserRelation') {
    await apiClient.upsertUserRelation(operation.payload);
    if (!isSessionGuardCurrent(sessionGuard)) return;
    markContactRelationSynced(operation.payload);
    return;
  }

  if (operation.type === 'updatePrivacySettings') {
    await apiClient.updatePrivacySettings(operation.payload);
    if (!isSessionGuardCurrent(sessionGuard)) return;
    markPrivacySettingsSynced(operation.payload);
    return;
  }

  if (operation.type === 'blockUser') {
    await apiClient.blockUser(operation.payload);
    if (!isSessionGuardCurrent(sessionGuard)) return;
    markConversationBlockSynced(operation.payload.conversationId, operation.payload.status !== 'revoked');
    return;
  }

  if (operation.type === 'reportModeration') {
    await apiClient.reportModeration(operation.payload);
    if (!isSessionGuardCurrent(sessionGuard)) return;
    markConversationReportSynced(operation.payload.conversationId || operation.payload.entityId, operation.payload.reason);
    return;
  }

  if (operation.type === 'markChatRead') {
    await apiClient.markConversationRead(
      operation.payload.conversationId,
      operation.payload.clientMutationId,
      operation.payload.readAt
    );
    if (!isSessionGuardCurrent(sessionGuard)) return;
    markConversationReadSynced(operation.payload.conversationId, operation.payload.readAt);
    return;
  }

  if (operation.type === 'markChatUnread') {
    await apiClient.markConversationUnread(
      operation.payload.conversationId,
      operation.payload.clientMutationId,
      operation.payload.unreadAt
    );
    if (!isSessionGuardCurrent(sessionGuard)) return;
    markConversationUnreadSynced(operation.payload.conversationId, operation.payload.unreadAt);
    return;
  }

  if (operation.type === 'markMessageDelivered') {
    await apiClient.markMessageDelivered(
      operation.payload.conversationId,
      operation.payload.messageId,
      operation.payload.clientMutationId,
      operation.payload.deliveredAt
    );
    return;
  }

  if (operation.type === 'markMessageRead') {
    await apiClient.markMessageRead(
      operation.payload.conversationId,
      operation.payload.messageId,
      operation.payload.clientMutationId,
      operation.payload.readAt
    );
    return;
  }

  if (operation.type === 'createChatShortcut') {
    const conversation = appState.conversations.find((item) => item.id === operation.payload.conversationId) || operation.payload.conversation || {};
    await apiClient.createChatShortcut(conversation, operation.payload.clientMutationId);
    if (!isSessionGuardCurrent(sessionGuard)) return;
    markChatShortcutSynced(operation.payload.conversationId);
    return;
  }

  if (operation.type === 'syncChatAction') {
    const conversation = appState.conversations.find((item) => item.id === operation.payload.conversationId) || operation.payload.conversation || {};
    await apiClient.syncChatAction(
      operation.payload.actionType,
      conversation,
      operation.payload.payload || {},
      operation.payload.clientMutationId
    );
    if (!isSessionGuardCurrent(sessionGuard)) return;
    markChatActionSynced(operation.payload.conversationId, operation.payload.actionType);
    return;
  }

  if (operation.type === 'recordIdReconciliation') {
    await apiClient.recordIdReconciliation(operation.payload);
    return;
  }

  if (operation.type === 'updateSyncCursor') {
    await apiClient.updateSyncCursor(operation.payload);
    return;
  }

  if (operation.type === 'sendCallSignal') {
    await apiClient.sendCallSignal(operation.payload);
    return;
  }

  if (operation.type === 'publishStremeEvent') {
    if (cleanupExpiredQueuedStremeOperation(operation)) return;
    const eventPayload = operation.payload.event || operation.payload;
    const stremeIdempotencyKey = resolveStremePublishIdempotencyKey(eventPayload, {
      idempotencyKey: operation.payload.stremeIdempotencyKey || operation.stremeIdempotencyKey || operation.dedupeKey || ''
    });
    try {
      await apiClient.publishStremeEvent(eventPayload, { idempotencyKey: stremeIdempotencyKey });
    } catch (error) {
      if (isStremePublishIdempotencyConflict(error) || isStremeQueuedReplayNoopError(error)) return;
      throw error;
    }
    return;
  }

  if (operation.type === 'sendMessage') {
    if (cleanupExpiredQueuedEphemeralOperation(operation)) {
      return;
    }
    if (operation.payload.requiresConversationSync && isConversationWaitingForBackendSync(operation.payload.conversationId)) {
      throw new Error('conversation_sync_pending');
    }

    const conversation = appState.conversations.find((item) => String(item.id || '') === String(operation.payload.conversationId || ''));
    const queuedMessage = conversation?.messages?.find((item) => String(item.id || '') === String(operation.payload.clientMessageId || '') || String(item.clientMutationId || item.clientMessageId || '') === String(operation.payload.clientMessageId || ''));
    const payload = await apiClient.sendMessage(
      operation.payload.conversationId,
      operation.payload.text,
      operation.payload.clientMessageId,
      {
        conversation,
        createdAt: operation.payload.createdAt || operation.payload.clientTime || '',
        clientTime: operation.payload.clientTime || operation.payload.createdAt || '',
        expiresAt: operation.payload.expiresAt || ''
      }
    );
    if (!isSessionGuardCurrent(sessionGuard)) return;
    markQueuedMessageSynced(operation.payload.conversationId, operation.payload.clientMessageId, payload);
    if (conversation && queuedMessage) {
      publishRealtimeMessageCreated(conversation, queuedMessage, payload, { clientMessageId: operation.payload.clientMessageId });
    }
    return;
  }

  if (operation.type === 'createMediaMessage') {
    if (cleanupExpiredQueuedEphemeralOperation(operation)) {
      return;
    }
    const payload = await apiClient.createMediaMessage(
      operation.payload.conversationId,
      operation.payload.mediaMessagePayload
    );
    if (!isSessionGuardCurrent(sessionGuard)) return;
    markQueuedMessageSynced(operation.payload.conversationId, operation.payload.clientMessageId, payload);
    return;
  }

  if (operation.type === 'createState') {
    const payload = await apiClient.createState(operation.payload.statePayload);
    if (!isSessionGuardCurrent(sessionGuard)) return;
    markQueuedStateSynced(operation.payload.localStateId, payload);
    return;
  }

  if (operation.type === 'markStateViewed') {
    await apiClient.registerStateView(operation.payload.stateId, operation.payload.clientMutationId);
    if (!isSessionGuardCurrent(sessionGuard)) return;
    return;
  }

  if (operation.type === 'promoteState') {
    const payload = await apiClient.promoteState(operation.payload.stateId, operation.payload.promotionPayload);
    if (!isSessionGuardCurrent(sessionGuard)) return;
    markQueuedStatePromotionSynced(operation.payload.stateId, payload);
    return;
  }

  if (operation.type === 'createCall') {
    const payload = await apiClient.createCall(operation.payload.conversationId, operation.payload.callType, operation.payload.clientMutationId);
    if (!isSessionGuardCurrent(sessionGuard)) return;
    markQueuedCallSynced(operation.payload.localCallId, payload);
    const conversation = appState.conversations.find((item) => item.id === operation.payload.conversationId);
    publishCallInviteThroughMemoria(conversation, operation.payload.callType, payload, {
      clientMutationId: operation.payload.clientMutationId,
      localCallId: operation.payload.localCallId
    });
    return;
  }

  if (operation.type === 'scheduleCall') {
    const payload = await apiClient.scheduleCall(
      operation.payload.conversationId,
      operation.payload.callType,
      operation.payload.scheduledAt,
      operation.payload.clientMutationId
    );
    if (!isSessionGuardCurrent(sessionGuard)) return;
    markQueuedCallSynced(operation.payload.localCallId, payload);
    return;
  }

  if (operation.type === 'registerDevice') {
    await apiClient.registerDevice(operation.payload);
    if (!isSessionGuardCurrent(sessionGuard)) return;
    markNotificationRegistrationSynced(operation.payload);
    return;
  }

  if (operation.type === 'unregisterDevice') {
    await apiClient.unregisterDevice(operation.payload);
    if (!isSessionGuardCurrent(sessionGuard)) return;
    markNotificationRegistrationRevokedSynced(operation.payload);
    return;
  }

  if (operation.type === 'saveUserPreferences') {
    await apiClient.saveUserPreferences(operation.payload, operation.payload.clientMutationId);
    return;
  }

  if (operation.type === 'businessToolAction') {
    await apiClient.syncBusinessToolAction(operation.payload.toolId, operation.payload);
    return;
  }

  if (operation.type === 'updateConversation') {
    if (shouldDiscardQueuedArchiveOperation(operation)) return;
    await apiClient.updateConversation(operation.payload.conversationId, operation.payload.patch);
    if (!isSessionGuardCurrent(sessionGuard)) return;
    markQueuedConversationPatchSynced(operation.payload.conversationId, operation.payload.patch);
    return;
  }

  throw new Error(`Operación pendiente no soportada: ${operation.type}`);
}

function extractNestedObject(payload, keys = []) {
  if (!payload || typeof payload !== 'object') return null;

  const aliases = getApiEntityAliases(keys);
  const containers = getApiPayloadContainers(payload);
  for (const container of containers) {
    for (const key of aliases) {
      if (container?.[key] && typeof container[key] === 'object') return container[key];
    }
  }

  return payload.data && typeof payload.data === 'object' ? payload.data : payload;
}

function extractEntityId(payload, entityKeys = []) {
  const entity = extractNestedObject(payload, entityKeys);
  const candidates = [
    entity?.id,
    entity?.chatId,
    entity?.conversationId,
    entity?.messageId,
    entity?.stateId,
    entity?.callId,
    entity?.sessionId,
    entity?.sesionId,
    payload?.id,
    payload?.sessionId,
    payload?.sesionId,
    payload?.data?.id,
    payload?.data?.sessionId,
    payload?.data?.sesionId
  ];
  const resolvedId = candidates.find((candidate) => candidate !== undefined && candidate !== null && String(candidate).trim());
  return resolvedId ? String(resolvedId) : '';
}

function isMessageLikePayload(value = {}) {
  if (!value || typeof value !== 'object') return false;
  return ['id', 'messageId', 'clientMutationId', 'clientMessageId', 'text', 'body', 'caption', 'status', 'media', 'file', 'attachmentName', 'filename']
    .some((key) => value[key] !== undefined && value[key] !== null);
}

function mergeSyncedConversationPayload(localConversationId, payload = {}) {
  const remoteConversation = extractNestedObject(payload, ['chat', 'conversation'])
    || extractNestedObject(payload, ['record'])
    || null;

  if (!remoteConversation || typeof remoteConversation !== 'object') return;

  const remoteId = extractEntityId(payload, ['chat', 'conversation'])
    || remoteConversation.id
    || remoteConversation.chatId
    || remoteConversation.conversationId
    || '';
  const normalizedRemote = normalizeConversationFromApi(remoteConversation);
  const effectiveId = String(remoteId || normalizedRemote.id || localConversationId || '');
  const remoteSharedKey = getConversationSharedMergeKey(normalizedRemote);
  const conversation = appState.conversations.find((item) => {
    const itemId = String(item.id || '');
    return itemId === String(localConversationId || '')
      || (effectiveId && itemId === effectiveId)
      || (remoteSharedKey && getConversationSharedMergeKey(item) === remoteSharedKey);
  });

  if (!conversation) return;

  const existingMessages = Array.isArray(conversation.messages) ? conversation.messages : [];
  const remoteMessages = Array.isArray(normalizedRemote.messages) ? normalizedRemote.messages : [];
  Object.assign(conversation, {
    ...conversation,
    ...normalizedRemote,
    id: effectiveId || conversation.id,
    ...resolveConversationArchiveMergeState(normalizedRemote, conversation),
    ...resolveConversationDeleteMergeState(normalizedRemote, conversation),
    ...resolveConversationBlockMergeState(normalizedRemote, conversation),
    messages: mergeMessagesByIdentity(existingMessages, remoteMessages),
    messagesHydrated: Boolean(conversation.messagesHydrated || normalizedRemote.messagesHydrated),
    contactSyncStatus: 'synced',
    status: normalizedRemote.status || conversation.status || 'Sincronizado'
  });
}

function markQueuedConversationSynced(localConversationId, payload = {}) {
  const remoteId = extractEntityId(payload, ['chat', 'conversation']);
  const conversation = appState.conversations.find((item) => item.id === localConversationId);

  if (conversation) {
    conversation.status = 'Sincronizado';
    if (remoteId && remoteId !== localConversationId) {
      syncIdReconciliation('conversacion', localConversationId, String(remoteId), {
        metadata: { process: 'createConversation' }
      });
      applyRemoteConversationId(localConversationId, String(remoteId));
    }
  }

  mergeSyncedConversationPayload(remoteId ? String(remoteId) : localConversationId, payload);
  persistState();
  renderCurrentSection();
}

function buildConversationBlockPayload(conversation = getActiveConversation(), blocked = true, options = {}) {
  if (!conversation) return null;
  const participants = normalizeConversationParticipantsForApi(conversation.participants, conversation.email || conversation.contactEmail, conversation.name || conversation.displayName);
  const remoteParticipant = getPrimaryRemoteParticipant(participants) || {};
  const blockedEmail = normalizeStorageIdentity(remoteParticipant.email || remoteParticipant.userEmail || conversation.email || conversation.contactEmail || '');
  const blockedUserId = normalizeBackendUserId(remoteParticipant.userId || conversation.contactUserId || conversation.userId || '');
  const clientMutationId = options.clientMutationId || buildDeterministicMutationId('block-user', conversation.id, blocked ? 'active' : 'revoked');

  return {
    blockerUserId: getCurrentUserIdentifier(),
    blockerUserEmail: getSessionEmail(),
    blockedUserId,
    blockedUserEmail: blockedEmail,
    blockedEmail,
    contactEmail: blockedEmail,
    conversationId: conversation.id,
    displayName: conversation.name || blockedEmail,
    reason: options.reason || (blocked ? 'user-blocked-contact' : 'user-unblocked-contact'),
    scope: 'conversation',
    status: blocked ? 'active' : 'revoked',
    metadata: {
      source: 'chater-static-site',
      conversationName: conversation.name || '',
      previousBlocked: Boolean(conversation.blocked)
    },
    clientMutationId
  };
}

function markConversationBlockSynced(conversationId = '', blocked = true) {
  const conversation = appState.conversations.find((item) => String(item.id || '') === String(conversationId || ''));
  if (!conversation) return;
  const syncedAt = new Date().toISOString();
  conversation.blocked = Boolean(blocked);
  conversation.blockDesiredBlocked = Boolean(blocked);
  conversation.blockSyncStatus = 'synced';
  conversation.blockSyncedAt = syncedAt;
  conversation.blockChangedAt = syncedAt;
  conversation.status = blocked ? 'Contacto bloqueado' : 'Contacto desbloqueado';
  persistState();
  renderCurrentSection();
  renderConversation();
}

async function toggleConversationBlock(conversation = getActiveConversation()) {
  if (!conversation) return;
  const nextBlocked = !conversation.blocked;
  const payload = buildConversationBlockPayload(conversation, nextBlocked);
  if (!payload) return;

  const previousBlocked = Boolean(conversation.blocked);
  const blockChangedAt = new Date().toISOString();
  conversation.blocked = nextBlocked;
  conversation.blockDesiredBlocked = nextBlocked;
  conversation.blockSyncStatus = CHATER_CONFIG.backendBaseUrl ? 'syncing' : 'local';
  conversation.blockChangedAt = blockChangedAt;
  conversation.blockLocalChangedAt = blockChangedAt;
  conversation.blockClientMutationId = payload.clientMutationId || '';
  conversation.blockLocalMutationId = payload.clientMutationId || '';
  conversation.status = nextBlocked ? 'Contacto bloqueado' : 'Contacto desbloqueado';
  persistState();
  renderCurrentSection();
  renderConversation();
  showToast(nextBlocked ? 'Contacto bloqueado.' : 'Contacto desbloqueado.');

  if (!CHATER_CONFIG.backendBaseUrl) return;

  try {
    await apiClient.blockUser(payload);
    markConversationBlockSynced(conversation.id, nextBlocked);
  } catch (error) {
    const stillSameState = Boolean(conversation.blocked) === nextBlocked;
    conversation.blockSyncStatus = stillSameState ? 'pending' : conversation.blockSyncStatus;
    if (!stillSameState) conversation.blocked = previousBlocked;
    enqueueBackendOperation({
      type: 'blockUser',
      dedupeKey: `block-user:${conversation.id}`,
      replaceExisting: true,
      payload
    });
    persistState();
    showToast('Cambio de bloqueo guardado en cola de sincronización.');
  }
}

function buildModerationReportPayload(conversation = getActiveConversation(), reason = 'other', details = '') {
  if (!conversation) return null;
  const lastMessage = conversation.messages?.at?.(-1) || null;
  const participants = normalizeConversationParticipantsForApi(conversation.participants, conversation.email || conversation.contactEmail, conversation.name || conversation.displayName);
  const contact = getPrimaryRemoteParticipant(participants) || {};
  const clientMutationId = buildDeterministicMutationId('report-moderation', conversation.id, reason, Date.now());

  return {
    reporterUserId: getCurrentUserIdentifier(),
    reporterUserEmail: getSessionEmail(),
    entityType: 'conversation',
    entityId: conversation.id,
    conversationId: conversation.id,
    reason: String(reason || 'other').trim() || 'other',
    evidence: {
      contactEmail: normalizeStorageIdentity(contact.email || contact.userEmail || conversation.email || conversation.contactEmail || ''),
      contactUserId: normalizeBackendUserId(contact.userId || ''),
      displayName: conversation.name || '',
      lastMessageId: lastMessage?.id || '',
      lastMessagePreview: String(lastMessage?.text || lastMessage?.attachmentName || '').slice(0, 240),
      details: String(details || '').trim().slice(0, 600),
      reportedAt: new Date().toISOString()
    },
    status: 'submitted',
    metadata: {
      source: 'chater-static-site',
      localOnlyUntilBackendAccepts: !CHATER_CONFIG.backendBaseUrl
    },
    clientMutationId
  };
}

function markConversationReportSynced(conversationId = '', reason = '') {
  const conversation = appState.conversations.find((item) => String(item.id || '') === String(conversationId || ''));
  if (!conversation) return;
  conversation.reportSyncStatus = 'synced';
  conversation.reportSyncedAt = new Date().toISOString();
  conversation.lastReportReason = reason || conversation.lastReportReason || 'other';
  persistState();
  renderCurrentSection();
}

async function submitConversationReport(conversation = getActiveConversation(), reason = 'other', details = '') {
  if (!conversation) return;
  const payload = buildModerationReportPayload(conversation, reason, details);
  if (!payload) return;

  conversation.reportSyncStatus = CHATER_CONFIG.backendBaseUrl ? 'syncing' : 'local';
  conversation.lastReportReason = payload.reason;
  persistState();

  if (!CHATER_CONFIG.backendBaseUrl) {
    conversation.reportSyncStatus = 'local';
    conversation.reportSyncedAt = new Date().toISOString();
    persistState();
    showToast('Reporte guardado localmente. Configura memoriaBACKEND para sincronizarlo.');
    return;
  }

  try {
    await apiClient.reportModeration(payload);
    markConversationReportSynced(conversation.id, payload.reason);
    showToast('Reporte enviado a moderación.');
  } catch (error) {
    conversation.reportSyncStatus = 'pending';
    enqueueBackendOperation({
      type: 'reportModeration',
      dedupeKey: `report:${payload.clientMutationId}`,
      payload
    });
    persistState();
    showToast('Reporte guardado en cola de sincronización.');
  }
}

function markQueuedConversationPatchSynced(conversationId, patch = {}) {
  const conversation = appState.conversations.find((item) => item.id === conversationId);
  if (!conversation) return;

  if (Object.prototype.hasOwnProperty.call(patch || {}, 'archived')) {
    const patchMutationId = String(patch.clientMutationId || '').trim();
    const currentLocalMutationId = String(conversation.archiveLocalMutationId || '').trim();
    if (patchMutationId && currentLocalMutationId && patchMutationId !== currentLocalMutationId) {
      persistState();
      renderCurrentSection();
      return;
    }

    const archiveChangedAt = patch.archiveChangedAt || patch.archivedAt || patch.restoredAt || new Date().toISOString();
    conversation.archived = Boolean(patch.archived);
    conversation.archiveSyncStatus = 'synced';
    conversation.archiveSyncedAt = new Date().toISOString();
    conversation.archiveChangedAt = archiveChangedAt;
    conversation.archiveClientMutationId = patch.clientMutationId || conversation.archiveClientMutationId || '';
    conversation.archiveLocalMutationId = patch.clientMutationId || conversation.archiveLocalMutationId || '';
    conversation.archiveLocalChangedAt = conversation.archiveLocalChangedAt || archiveChangedAt;
    conversation.archiveDesiredArchived = Boolean(patch.archived);
    conversation.status = conversation.archived ? 'Archivado' : 'Restaurado';
  }

  if (Object.prototype.hasOwnProperty.call(patch || {}, 'pinned')) {
    conversation.pinned = Boolean(patch.pinned);
    conversation.pinSyncStatus = 'synced';
    conversation.pinSyncedAt = new Date().toISOString();
    conversation.status = conversation.pinned ? 'Chat fijado' : 'Chat desfijado';
  }

  if (Object.prototype.hasOwnProperty.call(patch || {}, 'muted')) {
    conversation.muted = Boolean(patch.muted);
    conversation.mutedUntil = patch.mutedUntil || '';
    conversation.muteSyncStatus = 'synced';
    conversation.muteSyncedAt = new Date().toISOString();
    conversation.status = conversation.muted ? 'Chat silenciado' : 'Chat con sonido activo';
  }

  if (Object.prototype.hasOwnProperty.call(patch || {}, 'restricted')) {
    conversation.restricted = Boolean(patch.restricted);
    conversation.settings = { ...(conversation.settings || {}), ...(patch.settings || {}), restricted: conversation.restricted };
    conversation.restrictSyncStatus = 'synced';
    conversation.restrictSyncedAt = new Date().toISOString();
    conversation.status = conversation.restricted ? 'Chat restringido' : 'Restricción retirada';
  }

  if (Object.prototype.hasOwnProperty.call(patch || {}, 'settings') && patch.settings && typeof patch.settings === 'object') {
    conversation.settings = { ...(conversation.settings || {}), ...patch.settings };
    if (patch.settings.customListName !== undefined) conversation.customListName = String(patch.settings.customListName || '').trim();
  }

  persistState();
  renderCurrentSection();
}

function applyRemoteConversationId(localConversationId, remoteConversationId) {
  appState.conversations.forEach((conversation) => {
    if (conversation.id === localConversationId) conversation.id = remoteConversationId;
  });

  appState.calls.forEach((call) => {
    if (call.conversationId === localConversationId) call.conversationId = remoteConversationId;
  });

  if (activeConversationId === localConversationId) {
    activeConversationId = remoteConversationId;
  }

  const updatedQueue = readBackendOutbox().map((operation) => ({
    ...operation,
    payload: replaceConversationIdInPayload(operation.payload, localConversationId, remoteConversationId)
  }));
  persistBackendOutbox(updatedQueue);
}

function reconcileRemoteConversationIdentityBySharedKey(remoteConversation = {}) {
  const remoteId = String(remoteConversation.id || remoteConversation.chatId || remoteConversation.conversationId || '').trim();
  const sharedKey = getConversationSharedMergeKey(remoteConversation);
  if (!remoteId || !sharedKey) return null;

  const localConversation = appState.conversations.find((conversation) => {
    return String(conversation.id || '') !== remoteId
      && getConversationSharedMergeKey(conversation) === sharedKey;
  });
  if (!localConversation?.id) return null;

  applyRemoteConversationId(localConversation.id, remoteId);
  return appState.conversations.find((conversation) => String(conversation.id || '') === remoteId) || null;
}

function replaceConversationIdInPayload(payload, localConversationId, remoteConversationId) {
  if (!payload || typeof payload !== 'object') return payload;

  const localId = String(localConversationId || '').trim();
  const remoteId = String(remoteConversationId || '').trim();
  if (!localId || !remoteId) return payload;

  const replaceInObject = (value, depth = 0) => {
    if (!value || typeof value !== 'object' || depth > 4) return value;
    if (Array.isArray(value)) return value.map((item) => replaceInObject(item, depth + 1));

    const cloned = { ...value };
    ['id', 'chatId', 'conversationId', 'localConversationId'].forEach((key) => {
      if (String(cloned[key] || '') === localId) cloned[key] = remoteId;
    });
    ['conversation', 'chat', 'contact', 'payload', 'data', 'metadata'].forEach((key) => {
      if (cloned[key] && typeof cloned[key] === 'object') cloned[key] = replaceInObject(cloned[key], depth + 1);
    });
    return cloned;
  };

  return replaceInObject(payload);
}

function markQueuedMessageSynced(conversationId, clientMessageId, payload = {}) {
  const remoteMessage = extractNestedObject(payload, ['message']);
  let conversation = appState.conversations.find((item) => item.id === conversationId);
  let message = conversation?.messages.find((item) => item.id === clientMessageId || item.clientMutationId === clientMessageId);

  if (!message) {
    const found = findConversationMessageById(clientMessageId);
    if (found?.message) {
      conversation = found.conversation || conversation;
      message = found.message;
    }
  }

  if (message) {
    if (isMessageLikePayload(remoteMessage)) {
      updateExistingMessageFromRealtime(message, normalizeMessageFromApi(remoteMessage));
    }
    setMessageReceiptStatus(message, remoteMessage?.receiptStatus || remoteMessage?.status || 'backend_received', {
      backendReceivedAt: remoteMessage?.createdAt || new Date().toISOString()
    });
    message.clientMutationId = remoteMessage?.clientMutationId || remoteMessage?.clientMessageId || message.clientMutationId || clientMessageId;
    const remoteId = extractEntityId(payload, ['message']);
    if (remoteId) {
      if (remoteId !== clientMessageId) {
        syncIdReconciliation('mensaje', clientMessageId, remoteId, {
          metadata: { conversationId, process: 'sendMessage' }
        });
      }
      message.id = remoteId;
    }
  }

  if (conversation) {
    conversation.status = 'Entregado';
    conversation.messages = normalizeAndPruneChatMessages(conversation.messages);
  }
  removeQueuedBackendOperationsForMessage(clientMessageId);
  persistState();
  renderCurrentSection();
}

function markQueuedStateSynced(localStateId, payload = {}) {
  const state = appState.states.find((item) => item.id === localStateId);

  if (state) {
    state.synced = true;
    state.syncStatus = 'synced';
    const remoteId = extractEntityId(payload, ['state']);
    if (remoteId) {
      if (remoteId !== localStateId) {
        syncIdReconciliation('publicacion-efimera', localStateId, remoteId, {
          metadata: { process: 'createState' }
        });
      }
      replaceQueuedStateId(localStateId, remoteId);
      state.id = remoteId;
    }
  }

  persistState();
  if (activeSection === 'states') renderCurrentSection();
}

function markQueuedStatePromotionSynced(stateId, payload = {}) {
  const promotedState = appState.states.find((item) => item.id === stateId);
  const promotion = extractNestedObject(payload, ['promotion', 'statePromotion']) || payload;
  if (promotedState) {
    promotedState.promotionRequested = true;
    promotedState.promotionStatus = promotion.status || promotion.promotionStatus || 'synced';
    promotedState.promotionId = promotion.id || promotion.promotionId || promotedState.promotionId || '';
    promotedState.promotionSyncedAt = new Date().toISOString();
  }
  persistState();
  if (activeSection === 'states') renderCurrentSection();
}

function replaceQueuedStateId(localStateId, remoteStateId) {
  if (activeStateId === localStateId) activeStateId = remoteStateId;
  const updatedQueue = readBackendOutbox().map((operation) => {
    if (operation.payload?.stateId !== localStateId) return operation;
    return {
      ...operation,
      payload: {
        ...operation.payload,
        stateId: remoteStateId,
        promotionPayload: operation.payload.promotionPayload
          ? { ...operation.payload.promotionPayload, stateId: remoteStateId }
          : operation.payload.promotionPayload
      }
    };
  });
  persistBackendOutbox(updatedQueue);
}

function markQueuedCallSynced(localCallId, payload = {}) {
  const call = appState.calls.find((item) => item.id === localCallId);
  const remoteId = extractEntityId(payload, ['call']);
  if (call) {
    call.synced = true;
    call.syncStatus = 'synced';
    if (remoteId) {
      if (remoteId !== localCallId) {
        syncIdReconciliation('sesion-comunicacion', localCallId, remoteId, {
          metadata: { process: 'createCall' }
        });
      }
      call.id = remoteId;
    }
  }
  persistState();
  if (activeSection === 'calls') renderCurrentSection();
}

function syncIdReconciliation(entityType = 'entidad', temporaryId = '', realId = '', options = {}) {
  const normalizedTemporaryId = String(temporaryId || '').trim();
  const normalizedRealId = String(realId || '').trim();
  if (!CHATER_CONFIG.backendBaseUrl || !getSessionEmail() || !normalizedTemporaryId || !normalizedRealId || normalizedTemporaryId === normalizedRealId) {
    return null;
  }

  const payload = {
    entityType: String(entityType || 'entidad').trim() || 'entidad',
    temporaryId: normalizedTemporaryId,
    localId: normalizedTemporaryId,
    realId: normalizedRealId,
    remoteId: normalizedRealId,
    userId: getCurrentUserIdentifier(),
    userEmail: getSessionEmail(),
    deviceId: getDeviceId(),
    status: options.status || 'resolved',
    metadata: {
      source: 'chater-static-site',
      ...(options.metadata && typeof options.metadata === 'object' ? options.metadata : {})
    },
    clientMutationId: options.clientMutationId || buildDeterministicMutationId('reconcile', entityType, normalizedTemporaryId, normalizedRealId)
  };

  apiClient.recordIdReconciliation(payload).catch((error) => {
    console.warn('No se pudo registrar la reconciliación de IDs en memoriaBACKEND.', error);
    enqueueBackendOperation({
      type: 'recordIdReconciliation',
      dedupeKey: `reconciliation:${payload.entityType}:${normalizedTemporaryId}:${normalizedRealId}`,
      payload
    });
  });
  return payload;
}

function getPendingOutboxCount() {
  return readBackendOutbox().length;
}

function getSyncCursorStatusLabel() {
  if (!getEffectiveRealtimeUrl()) return 'Sin tiempo real configurado';
  if (!syncCursorState.lastEventId) return 'Esperando primer evento streme';
  if (syncCursorState.inFlight) return 'Sincronizando cursor con memoriaBACKEND';
  if (syncCursorState.lastSyncedEventId === syncCursorState.lastEventId) {
    return `Cursor sincronizado ${syncCursorState.syncedAt ? formatScheduledCallTime(syncCursorState.syncedAt) : 'con memoriaBACKEND'}`;
  }
  if (syncCursorState.error) return 'Cursor local guardado; reintento pendiente con memoriaBACKEND';
  return 'Cursor local pendiente de confirmar';
}

function readStremeLastEventIdsByChannel(email = getSessionEmail()) {
  const raw = readStorageItem(getStremeLastEventByChannelStorageKey(email), '{}');
  try {
    const parsed = JSON.parse(raw || '{}');
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return Object.entries(parsed).reduce((acc, [channel, eventId]) => {
      const safeChannel = sanitizeLocalStremeChannel(channel, '');
      const safeEventId = String(eventId || '').trim();
      if (safeChannel && safeEventId) acc[safeChannel] = safeEventId;
      return acc;
    }, {});
  } catch (error) {
    return {};
  }
}

function writeStremeLastEventIdsByChannel(cursors = {}, email = getSessionEmail()) {
  const normalized = {};
  Object.entries(cursors && typeof cursors === 'object' ? cursors : {}).forEach(([channel, eventId]) => {
    const safeChannel = sanitizeLocalStremeChannel(channel, '');
    const safeEventId = String(eventId || '').trim();
    if (safeChannel && safeEventId) normalized[safeChannel] = safeEventId;
  });
  writeStorageItem(getStremeLastEventByChannelStorageKey(email), JSON.stringify(normalized));
  return normalized;
}

function getStremeLastEventIdsForChannels(channels = []) {
  const normalizedChannels = normalizeStremeChannelList(channels);
  if (!normalizedChannels.length) return {};
  const cursors = readStremeLastEventIdsByChannel();
  return normalizedChannels.reduce((acc, channel) => {
    if (cursors[channel]) acc[channel] = cursors[channel];
    return acc;
  }, {});
}

function serializeStremeLastEventIdsForChannels(channels = []) {
  const cursors = getStremeLastEventIdsForChannels(channels);
  return Object.keys(cursors).length ? JSON.stringify(cursors) : '';
}

function persistStremeLastEventId(lastEventId = '', metadata = {}) {
  const normalizedLastEventId = String(lastEventId || '').trim();
  if (!normalizedLastEventId) return;

  const channel = sanitizeLocalStremeChannel(
    metadata.channel || metadata.canal || metadata.stremeChannel || metadata.eventChannel || '',
    ''
  );

  writeStorageItem(getStremeLastEventStorageKey(), normalizedLastEventId);

  if (channel) {
    const cursors = readStremeLastEventIdsByChannel();
    cursors[channel] = normalizedLastEventId;
    writeStremeLastEventIdsByChannel(cursors);
  }

  scheduleSyncCursorUpdate(normalizedLastEventId, {
    ...(metadata && typeof metadata === 'object' ? metadata : {}),
    ...(channel ? { channel, lastEventIdsByChannel: getStremeLastEventIdsForChannels([channel]) } : {})
  });
}

function getStremeEventIdCandidate(payload = {}) {
  if (!payload || typeof payload !== 'object') return '';
  const data = payload.data && typeof payload.data === 'object' ? payload.data : {};
  const event = payload.event && typeof payload.event === 'object' ? payload.event : {};
  const message = payload.message && typeof payload.message === 'object' ? payload.message : {};
  return String(
    payload.lastEventId
    || payload.eventId
    || payload.id
    || event.lastEventId
    || event.eventId
    || event.id
    || message.lastEventId
    || message.eventId
    || message.id
    || data.lastEventId
    || data.eventId
    || data.id
    || ''
  ).trim();
}

function getStremeChannelCandidate(payload = {}, metadata = {}) {
  if (!payload || typeof payload !== 'object') return sanitizeLocalStremeChannel(metadata.channel || metadata.canal || '', '');
  const data = payload.data && typeof payload.data === 'object' ? payload.data : {};
  const event = payload.event && typeof payload.event === 'object' ? payload.event : {};
  const message = payload.message && typeof payload.message === 'object' ? payload.message : {};
  const innerPayload = payload.payload && typeof payload.payload === 'object' ? payload.payload : {};
  const rawChannel = payload.channel
    || payload.canal
    || event.channel
    || event.canal
    || message.channel
    || message.canal
    || data.channel
    || data.canal
    || innerPayload.channel
    || innerPayload.canal
    || metadata.channel
    || metadata.canal
    || '';
  return sanitizeLocalStremeChannel(rawChannel, '');
}

function persistStremeCursorFromParsedPayload(payload = {}, metadata = {}) {
  const lastEventId = getStremeEventIdCandidate(payload) || metadata.lastEventId || metadata.eventId || '';
  const channel = getStremeChannelCandidate(payload, metadata);
  persistStremeLastEventId(lastEventId, {
    ...(metadata && typeof metadata === 'object' ? metadata : {}),
    ...(channel ? { channel } : {})
  });
}

function scheduleSyncCursorUpdate(lastEventId = '', metadata = {}) {
  const normalizedLastEventId = String(lastEventId || '').trim();
  if (!CHATER_CONFIG.backendBaseUrl || !getSessionEmail() || !normalizedLastEventId) return;
  syncCursorState.lastEventId = normalizedLastEventId;
  syncCursorState.error = '';
  syncCursorState.metadata = {
    source: 'streme',
    transport: stremeActiveTransport || resolveStremeTransport(),
    ...(metadata && typeof metadata === 'object' ? metadata : {})
  };
  clearTimeout(syncCursorState.timer);
  syncCursorState.timer = setTimeout(flushSyncCursorUpdate, 1200);
}

async function flushSyncCursorUpdate() {
  syncCursorState.timer = null;
  if (!CHATER_CONFIG.backendBaseUrl || !getSessionEmail() || syncCursorState.inFlight) return;
  const lastEventId = String(syncCursorState.lastEventId || '').trim();
  if (!lastEventId || lastEventId === syncCursorState.lastSyncedEventId) return;

  const sessionGuard = captureSessionGuard();
  const payload = {
    userId: getCurrentUserIdentifier(),
    userEmail: getSessionEmail(),
    deviceId: getDeviceId(),
    lastEventId,
    cursor: lastEventId,
    status: 'active',
    metadata: syncCursorState.metadata || {},
    clientMutationId: buildDeterministicMutationId('cursor', getDeviceId(), lastEventId)
  };

  syncCursorState.inFlight = true;
  try {
    await apiClient.updateSyncCursor(payload);
    if (!isSessionGuardCurrent(sessionGuard)) return;
    syncCursorState.lastSyncedEventId = lastEventId;
    syncCursorState.syncedAt = new Date().toISOString();
    syncCursorState.error = '';
  } catch (error) {
    if (!isSessionGuardCurrent(sessionGuard)) return;
    syncCursorState.error = error?.message || 'No se pudo sincronizar el cursor.';
    console.warn('No se pudo actualizar CURSOResincronizacionX en memoriaBACKEND.', error);
    enqueueBackendOperation({
      type: 'updateSyncCursor',
      dedupeKey: `cursor:${getDeviceId()}`,
      replaceExisting: true,
      payload
    });
  } finally {
    syncCursorState.inFlight = false;
  }
}

function parseDateMs(value = '') {
  if (!value) return 0;
  const timestamp = Date.parse(String(value));
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function resolveStateExpiryMs(state = {}) {
  const explicitExpiry = [
    state.expiresAtIso,
    // Compatibilidad hacia atrás con el campo escrito por iteraciones previas.
    state.expiresAtAt,
    state.expiryAt,
    state.expireAt,
    state.endsAt,
    state.expiresAt
  ].map(parseDateMs).find(Boolean);

  if (explicitExpiry) return explicitExpiry;

  const createdAt = parseDateMs(state.createdAt || state.publishedAt || state.created_at);
  if (!createdAt) return 0;
  return createdAt + STATE_VISIBLE_MS;
}

function getStateExpiryIso(state = {}) {
  const expiryMs = resolveStateExpiryMs(state);
  return expiryMs ? new Date(expiryMs).toISOString() : '';
}

function isStateExpired(state = {}, now = Date.now()) {
  const expiryMs = resolveStateExpiryMs(state);
  return Boolean(expiryMs && expiryMs <= now);
}

function getActiveStates() {
  return appState.states.filter((state) => !isStateExpired(state));
}

function getStateExpiryLabel(state = {}, now = Date.now()) {
  const expiryMs = resolveStateExpiryMs(state);
  if (!expiryMs) return state.expiresAt || `${STATE_VISIBLE_HOURS} h`;

  const remainingMs = expiryMs - now;
  if (remainingMs <= 0) return 'Vencido';

  const remainingMinutes = Math.ceil(remainingMs / (60 * 1000));
  if (remainingMinutes < 60) return `${remainingMinutes} min`;

  const remainingHours = Math.ceil(remainingMinutes / 60);
  return `${remainingHours} h`;
}

function pruneExpiredStates() {
  const beforeCount = appState.states.length;
  if (!beforeCount) return false;

  appState.states = appState.states.filter((state) => !isStateExpired(state));
  if (appState.states.length === beforeCount) return false;

  if (!appState.states.some((state) => state.id === activeStateId)) {
    activeStateId = getActiveStates()[0]?.id || null;
  }

  persistState();
  return true;
}

function markConversationReadSynced(conversationId, readAt = new Date().toISOString()) {
  const conversation = appState.conversations.find((item) => item.id === conversationId);
  if (!conversation) return;

  conversation.unread = 0;
  conversation.lastReadSyncStatus = 'synced';
  conversation.readSyncedAt = readAt;
  conversation.lastReadAt = conversation.lastReadAt || readAt;
  persistState();
  if (activeSection === 'chats') renderChatList(searchInput.value);
}

async function markConversationRead(conversation, options = {}) {
  if (!conversation) return;

  const forceRemoteReceipt = Boolean(options.force);
  const unreadBefore = Number(conversation.unread || 0);
  const readAt = new Date().toISOString();
  const clientMutationId = generateClientMutationId();

  conversation.unread = 0;
  conversation.lastReadAt = readAt;
  sendReadReceiptsForConversation(conversation, { readAt, force: forceRemoteReceipt || unreadBefore > 0 });

  if (!CHATER_CONFIG.backendBaseUrl || (!forceRemoteReceipt && unreadBefore <= 0)) {
    conversation.lastReadSyncStatus = CHATER_CONFIG.backendBaseUrl ? conversation.lastReadSyncStatus : 'local';
    persistState();
    return;
  }

  const sessionGuard = captureSessionGuard();
  conversation.lastReadSyncStatus = 'syncing';
  persistState();

  try {
    const payload = await apiClient.markConversationRead(conversation.id, clientMutationId, readAt);
    if (!isSessionGuardCurrent(sessionGuard)) return;
    const syncedAt = payload?.readAt || payload?.data?.readAt || readAt;
    markConversationReadSynced(conversation.id, syncedAt);
  } catch (error) {
    if (!isSessionGuardCurrent(sessionGuard)) return;
    conversation.lastReadSyncStatus = 'pending';
    enqueueBackendOperation({
      type: 'markChatRead',
      dedupeKey: `read:${conversation.id}:${clientMutationId}`,
      payload: { conversationId: conversation.id, readAt, clientMutationId }
    });
    persistState();
  }
}

function normalizeStorageIdentity(email = '') {
  return String(email || '').trim().toLowerCase();
}

function isValidEmailAddress(value = '') {
  const normalizedEmail = normalizeStorageIdentity(value);
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail);
}

function getScopedStorageKey(baseKey, email = getSessionEmail()) {
  const identity = normalizeStorageIdentity(email);
  return identity ? `${baseKey}.account.${encodeURIComponent(identity)}` : baseKey;
}

function getStateStorageKey(email = getSessionEmail()) {
  return getScopedStorageKey(CHATER_CONFIG.stateKey, email);
}

function getOutboxStorageKey(email = getSessionEmail()) {
  return getScopedStorageKey(CHATER_CONFIG.outboxKey, email);
}

function getStremeLastEventStorageKey(email = getSessionEmail()) {
  return getScopedStorageKey(CHATER_CONFIG.stremeLastEventKey, email);
}

function getStremeLastEventByChannelStorageKey(email = getSessionEmail()) {
  return getScopedStorageKey(CHATER_CONFIG.stremeLastEventByChannelKey, email);
}

function getEmojiRecentsStorageKey(email = getSessionEmail()) {
  return getScopedStorageKey(CHATER_CONFIG.emojiRecentsKey, email);
}

function getNotificationRegistrationStorageKey(email = getSessionEmail()) {
  return getScopedStorageKey(CHATER_CONFIG.notificationRegistrationKey, email);
}

function shouldAdoptLegacyStorage() {
  return false;
}

function isPersistedChaterStateShape(saved = null) {
  if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return false;
  return Array.isArray(saved.conversations)
    || Array.isArray(saved.states)
    || Array.isArray(saved.calls)
    || (saved.business && typeof saved.business === 'object')
    || (saved.privacy && typeof saved.privacy === 'object')
    || Object.prototype.hasOwnProperty.call(saved, 'ownerEmail');
}

function readStoredStateFromKey(storageKey) {
  try {
    const saved = JSON.parse(readStorageItem(storageKey, 'null'));
    if (isPersistedChaterStateShape(saved)) {
      return normalizeLoadedState(saved);
    }
  } catch (error) {
    console.warn('No se pudo cargar el estado local de ChatER.', error);
  }
  return null;
}

function shouldUseLocalDemoSeedState() {
  // Producción no debe inventar chats: hashinmy.com debe mostrar solo datos del
  // perfil Gmail y de memoriaBACKEND. La semilla queda disponible únicamente
  // para demos locales activadas explícitamente por configuración.
  return CHATER_CONFIG.enableLocalDemoSeed === true;
}

function createProductionEmptyChatERState() {
  return normalizeLoadedState({
    conversations: [],
    states: [],
    calls: [],
    business: seedState.business,
    privacy: seedState.privacy,
    ownerEmail: normalizeStorageIdentity(getSessionEmail())
  });
}

function loadState(email = getSessionEmail()) {
  const storageKey = getStateStorageKey(email);
  const scopedState = readStoredStateFromKey(storageKey);
  if (scopedState) return scopedState;

  if (shouldAdoptLegacyStorage(email) && storageKey !== CHATER_CONFIG.stateKey) {
    const legacyState = readStoredStateFromKey(CHATER_CONFIG.stateKey);
    if (legacyState) {
      writeStorageItem(storageKey, JSON.stringify({ ...legacyState, ownerEmail: normalizeStorageIdentity(email) }));
      return legacyState;
    }
  }

  if (shouldUseLocalDemoSeedState()) {
    return normalizeLoadedState(JSON.parse(JSON.stringify(seedState)));
  }

  return createProductionEmptyChatERState();
}

function isLocalDemoSeedConversation(conversation = {}) {
  const id = String(conversation.id || '').trim();
  const email = normalizeStorageIdentity(conversation.email || conversation.contactEmail || conversation.userEmail || '');
  const source = String(conversation.metadata?.source || conversation.source || '').trim();
  if (source === 'local-demo-seed') return true;
  return (id === 'familia' && email === 'familia@chater.local')
    || (id === 'trabajo' && email === 'equipo@empresa.com')
    || (id === 'soporte' && email === 'soporte@chater.app')
    || (id === 'carlos' && email === 'carlos@example.com');
}

function isLocalDemoSeedState(statusItem = {}) {
  const id = String(statusItem.id || '').trim();
  const email = normalizeStorageIdentity(statusItem.contactEmail || statusItem.email || statusItem.ownerEmail || statusItem.userEmail || '');
  const source = String(statusItem.metadata?.source || statusItem.source || '').trim();
  if (source === 'local-demo-seed') return true;
  return (id === 'estado-familia' && email === 'familia@chater.local')
    || (id === 'estado-carlos' && email === 'carlos@example.com')
    || (id === 'estado-equipo' && email === 'equipo@empresa.com');
}

function isLocalDemoSeedCall(call = {}) {
  const id = String(call.id || '').trim();
  const source = String(call.metadata?.source || call.source || '').trim();
  return source === 'local-demo-seed' || ['call-1', 'call-2', 'call-3'].includes(id);
}

function normalizeLoadedState(saved) {
  const allowLocalDemoSeed = shouldUseLocalDemoSeedState();
  const sourceConversations = Array.isArray(saved.conversations) ? saved.conversations : [];
  const sourceStates = Array.isArray(saved.states) ? saved.states : [];
  const sourceCalls = Array.isArray(saved.calls) ? saved.calls : [];
  const state = {
    conversations: allowLocalDemoSeed ? sourceConversations : sourceConversations.filter((conversation) => !isLocalDemoSeedConversation(conversation)),
    states: allowLocalDemoSeed ? sourceStates : sourceStates.filter((statusItem) => !isLocalDemoSeedState(statusItem)),
    calls: allowLocalDemoSeed ? sourceCalls : sourceCalls.filter((call) => !isLocalDemoSeedCall(call)),
    business: normalizeBusinessState(saved.business),
    privacy: normalizePrivacyState(saved.privacy)
  };

  state.conversations.forEach((conversation) => {
    conversation.messages = normalizeAndPruneChatMessages(Array.isArray(conversation.messages) ? conversation.messages : []);
    conversation.avatar = conversation.avatar || getInitials(conversation.name || conversation.email);
    conversation.avatarImage = normalizeAssetImagePath(conversation.avatarImage || conversation.avatarAsset);
    conversation.archived = coerceFirstBooleanFlag([conversation.archived, conversation.isArchived], false);
    conversation.pinned = Boolean(conversation.pinned || conversation.isPinned);
    conversation.deleted = resolveConversationDeletedForCurrentUser(conversation, conversation.metadata || {});
    conversation.muted = Boolean(conversation.muted || conversation.isMuted || conversation.mutedUntil);
    conversation.mutedUntil = conversation.mutedUntil || '';
    conversation.restricted = Boolean(conversation.restricted || conversation.isRestricted || conversation.settings?.restricted);
    conversation.favorite = Boolean(conversation.favorite || conversation.isFavorite);
    conversation.customListName = String(conversation.customListName || conversation.listName || conversation.chatListName || '').trim();
    conversation.shortcutRequestedAt = conversation.shortcutRequestedAt || '';
    conversation.shortcutSyncStatus = conversation.shortcutSyncStatus || '';
    conversation.actionSyncStatus = conversation.actionSyncStatus || '';
    conversation.actionSyncedAt = conversation.actionSyncedAt || '';
    conversation.deleteSyncStatus = conversation.deleteSyncStatus || '';
    conversation.deleteChangedAt = conversation.deleteChangedAt || conversation.deletedAt || conversation.restoredAt || '';
    conversation.deleteClientMutationId = conversation.deleteClientMutationId || conversation.deleteMutationId || '';
    conversation.deleteLocalMutationId = conversation.deleteLocalMutationId || '';
    conversation.deleteLocalChangedAt = conversation.deleteLocalChangedAt || '';
    if (Object.prototype.hasOwnProperty.call(conversation, 'deleteDesiredDeleted')) {
      conversation.deleteDesiredDeleted = coerceBooleanFlag(conversation.deleteDesiredDeleted, conversation.deleted);
    } else if (conversation.deleted) {
      conversation.deleteDesiredDeleted = true;
      conversation.deleteLocalChangedAt = conversation.deleteLocalChangedAt || conversation.deleteChangedAt || conversation.deletedAt || '';
    }
    conversation.settings = conversation.settings && typeof conversation.settings === 'object' ? conversation.settings : {};
    conversation.pinSyncStatus = conversation.pinSyncStatus || '';
    conversation.pinSyncedAt = conversation.pinSyncedAt || '';
    conversation.archiveSyncStatus = conversation.archiveSyncStatus || '';
    conversation.archiveSyncedAt = conversation.archiveSyncedAt || '';
    conversation.archiveChangedAt = conversation.archiveChangedAt || conversation.archiveUpdatedAt || conversation.archivedAt || conversation.restoredAt || '';
    conversation.archiveClientMutationId = conversation.archiveClientMutationId || conversation.archiveMutationId || '';
    conversation.archiveLocalMutationId = conversation.archiveLocalMutationId || '';
    conversation.archiveLocalChangedAt = conversation.archiveLocalChangedAt || '';
    if (Object.prototype.hasOwnProperty.call(conversation, 'archiveDesiredArchived')) {
      conversation.archiveDesiredArchived = coerceBooleanFlag(conversation.archiveDesiredArchived, conversation.archived);
    }
    conversation.blocked = coerceFirstBooleanFlag([conversation.blocked, conversation.isBlocked], false);
    conversation.blockSyncStatus = conversation.blockSyncStatus || '';
    conversation.blockSyncedAt = conversation.blockSyncedAt || '';
    conversation.reportSyncStatus = conversation.reportSyncStatus || '';
    conversation.reportSyncedAt = conversation.reportSyncedAt || '';
    conversation.lastReportReason = conversation.lastReportReason || '';
    conversation.unread = Number(conversation.unread || 0);
    conversation.participants = normalizeConversationParticipantsForApi(conversation.participants, conversation.email || conversation.contactEmail, conversation.name || conversation.displayName);
    const lifecycle = buildConversationSharedLifecycleMetadata(conversation);
    conversation.sharedConversationKey = lifecycle.sharedConversationKey || conversation.sharedConversationKey || '';
    conversation.redisConversationKey = lifecycle.redisConversationKey || conversation.redisConversationKey || conversation.sharedConversationKey || '';
    conversation.redisChatKey = lifecycle.redisChatKey || conversation.redisChatKey || conversation.redisConversationKey || '';
    conversation.participantCount = Number(lifecycle.participantCount || conversation.participantCount || 1) || 1;
    conversation.reuseExistingRedisChat = coerceFirstBooleanFlag([conversation.reuseExistingRedisChat], true);
    conversation.deleteFinalOnlyWhenAllParticipantsDeleted = coerceFirstBooleanFlag([conversation.deleteFinalOnlyWhenAllParticipantsDeleted], true);
    conversation.metadata = {
      ...(conversation.metadata && typeof conversation.metadata === 'object' ? conversation.metadata : {}),
      sharedConversationKey: conversation.sharedConversationKey,
      redisConversationKey: conversation.redisConversationKey,
      redisChatKey: conversation.redisChatKey,
      participantCount: conversation.participantCount,
      reuseExistingRedisChat: conversation.reuseExistingRedisChat,
      deleteFinalOnlyWhenAllParticipantsDeleted: conversation.deleteFinalOnlyWhenAllParticipantsDeleted
    };
    conversation.messagesHydrated = Boolean(conversation.messagesHydrated);
    conversation.messagesHistoryCursor = conversation.messagesHistoryCursor || '';
    conversation.messagesHistoryLastErrorAt = conversation.messagesHistoryLastErrorAt || '';
    conversation.lastReadAt = conversation.lastReadAt || '';
    conversation.readSyncedAt = conversation.readSyncedAt || '';
    conversation.lastReadSyncStatus = conversation.lastReadSyncStatus || '';
  });

  state.states.forEach((statusItem) => {
    statusItem.avatar = statusItem.avatar || getInitials(statusItem.name);
    statusItem.avatarImage = normalizeAssetImagePath(statusItem.avatarImage || statusItem.avatarAsset);
    statusItem.conversationId = String(statusItem.conversationId || statusItem.chatId || '').trim();
    statusItem.contactEmail = normalizeStorageIdentity(statusItem.contactEmail || statusItem.email || statusItem.ownerEmail || statusItem.userEmail || '');
    statusItem.createdAt = statusItem.createdAt || statusItem.publishedAt || '';
    const expiresAtIso = getStateExpiryIso(statusItem);
    statusItem.expiresAtIso = expiresAtIso;
    // Alias legado preservado para no romper estados guardados ni APIs antiguas.
    statusItem.expiresAtAt = expiresAtIso;
    statusItem.expiresAt = getStateExpiryLabel(statusItem);
    statusItem.viewed = Boolean(statusItem.viewed);
  });

  state.calls.forEach((call) => {
    call.avatar = call.avatar || getInitials(call.name);
    call.avatarImage = normalizeAssetImagePath(call.avatarImage || call.avatarAsset);
  });

  return state;
}

function normalizePrivacyVisibility(value = 'contacts') {
  const normalized = String(value || 'contacts').trim().toLowerCase();
  if (['public', 'everyone', 'todos'].includes(normalized)) return 'public';
  if (['nobody', 'none', 'nadie', 'private'].includes(normalized)) return 'nobody';
  return 'contacts';
}

function normalizePrivacyFieldList(value = [], fallback = []) {
  const source = Array.isArray(value) ? value : fallback;
  const seen = new Set();
  return source
    .map((item) => String(item || '').trim())
    .filter(Boolean)
    .filter((item) => {
      const key = item.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function normalizePrivacyState(raw = {}) {
  const source = raw && typeof raw === 'object' ? raw : {};
  return {
    profileVisibility: normalizePrivacyVisibility(source.profileVisibility),
    statusVisibility: normalizePrivacyVisibility(source.statusVisibility),
    lastActivityVisibility: normalizePrivacyVisibility(source.lastActivityVisibility),
    publicFields: normalizePrivacyFieldList(source.publicFields, ['displayName', 'avatar']),
    privateFields: normalizePrivacyFieldList(source.privateFields, ['email']),
    syncStatus: source.syncStatus || '',
    syncedAt: source.syncedAt || '',
    lastError: source.lastError || ''
  };
}

function ensurePrivacyState() {
  const current = appState.privacy && typeof appState.privacy === 'object' ? appState.privacy : null;
  const normalized = normalizePrivacyState(current || {});

  if (current) {
    Object.keys(current).forEach((key) => { delete current[key]; });
    Object.assign(current, normalized);
    appState.privacy = current;
    return current;
  }

  appState.privacy = normalized;
  return appState.privacy;
}

function buildPrivacySettingsPayload(privacy = ensurePrivacyState(), options = {}) {
  const normalized = normalizePrivacyState(privacy);
  return {
    ...normalized,
    userId: options.userId || getCurrentUserIdentifier(),
    userEmail: options.userEmail || getSessionEmail(),
    metadata: {
      source: 'chater-static-site',
      reason: options.reason || 'privacy-settings'
    },
    clientMutationId: options.clientMutationId || generateClientMutationId()
  };
}

function enqueuePrivacySettingsSync(payload = {}) {
  return enqueueBackendOperation({
    type: 'updatePrivacySettings',
    dedupeKey: `privacy:${getCurrentUserIdentifier()}`,
    replaceExisting: true,
    payload
  });
}

function markPrivacySettingsSynced(payload = {}) {
  const privacy = ensurePrivacyState();
  Object.assign(privacy, normalizePrivacyState(payload), {
    syncStatus: 'synced',
    syncedAt: new Date().toISOString(),
    lastError: ''
  });
  persistState();
}

async function persistPrivacySettings(options = {}) {
  const privacy = ensurePrivacyState();
  const payload = buildPrivacySettingsPayload(privacy, options);
  privacy.syncStatus = CHATER_CONFIG.backendBaseUrl ? 'syncing' : 'local';
  privacy.lastError = '';
  persistState();

  if (!CHATER_CONFIG.backendBaseUrl) {
    privacy.syncStatus = 'local';
    persistState();
    showToast('Privacidad guardada localmente. Configura memoriaBACKEND para sincronizarla.');
    return null;
  }

  try {
    const response = await apiClient.updatePrivacySettings(payload);
    markPrivacySettingsSynced(payload);
    showToast('Privacidad sincronizada con memoriaBACKEND.');
    return response;
  } catch (error) {
    privacy.syncStatus = 'pending';
    privacy.lastError = error?.message || 'Pendiente de sincronizar privacidad.';
    enqueuePrivacySettingsSync(payload);
    persistState();
    showToast('Privacidad guardada y en cola de sincronización.');
    return null;
  }
}

function getPrivacyVisibilityLabel(value = 'contacts') {
  const normalized = normalizePrivacyVisibility(value);
  if (normalized === 'public') return 'Todos';
  if (normalized === 'nobody') return 'Nadie';
  return 'Mis contactos';
}

function normalizeBusinessState(raw = {}) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const metrics = source.metrics && typeof source.metrics === 'object' ? source.metrics : {};
  const verification = source.verification && typeof source.verification === 'object' ? source.verification : {};

  return {
    metrics: {
      catalogViews7d: Math.max(0, Number(metrics.catalogViews7d || 0)),
      statusViews7d: Math.max(0, Number(metrics.statusViews7d || 0))
    },
    verification: {
      status: String(verification.status || 'not_requested'),
      requestedAt: verification.requestedAt || '',
      syncedAt: verification.syncedAt || ''
    },
    catalog: normalizeBusinessCollection(source.catalog),
    campaigns: normalizeBusinessCollection(source.campaigns),
    broadcasts: normalizeBusinessCollection(source.broadcasts),
    orders: normalizeBusinessCollection(source.orders),
    activities: normalizeBusinessCollection(source.activities).slice(0, 30)
  };
}

function normalizeBusinessCollection(value) {
  return Array.isArray(value)
    ? value.filter((item) => item && typeof item === 'object').map((item) => ({ ...item }))
    : [];
}

function ensureBusinessState() {
  const current = appState.business && typeof appState.business === 'object' ? appState.business : null;
  const normalized = normalizeBusinessState(current || {});

  if (current) {
    Object.keys(current).forEach((key) => { delete current[key]; });
    Object.assign(current, normalized);
    appState.business = current;
    return current;
  }

  appState.business = normalized;
  return appState.business;
}

function getBusinessMetrics() {
  const business = ensureBusinessState();
  return {
    conversationsStarted7d: getVisibleConversations().length + getArchivedConversations().length,
    catalogViews7d: Number(business.metrics.catalogViews7d || 0),
    statusViews7d: Math.max(Number(business.metrics.statusViews7d || 0), getActiveStates().length)
  };
}

function addBusinessActivity(toolId, title, detail = '', payload = {}) {
  const business = ensureBusinessState();
  business.activities.unshift({
    id: `activity-${generateClientMutationId()}`,
    toolId,
    title,
    detail,
    payload,
    createdAt: new Date().toISOString()
  });
  business.activities = business.activities.slice(0, 30);
}

function queueBusinessToolAction(toolId, action, payload = {}) {
  const clientMutationId = payload.clientMutationId || generateClientMutationId();
  if (!CHATER_CONFIG.backendBaseUrl) return null;

  return enqueueBackendOperation({
    type: 'businessToolAction',
    dedupeKey: `business-tool:${toolId}:${action}:${clientMutationId}`,
    payload: {
      toolId,
      action,
      ...payload,
      clientMutationId,
      userEmail: getSessionEmail(),
      clientTime: new Date().toISOString()
    }
  });
}

function persistBusinessToolAction(toolId, action, payload = {}, activity = {}) {
  addBusinessActivity(toolId, activity.title || getBusinessToolTitle(toolId), activity.detail || '', { action, ...payload });
  queueBusinessToolAction(toolId, action, payload);
  persistState();
  updateActivityBadges();
  if (!chatView.hidden && activeSection === 'tools') {
    renderCurrentSection();
  }
}

function getBusinessToolTitle(toolId = '') {
  const tool = getBusinessToolRowsConfig().find((item) => item.id === toolId) || getTechnicalToolRowsConfig().find((item) => item.id === toolId);
  return tool?.title || 'Herramienta';
}

function normalizeRecentEmojiList(value = []) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  return value
    .map((emoji) => String(emoji || '').trim())
    .filter(Boolean)
    .filter((emoji) => {
      if (seen.has(emoji)) return false;
      seen.add(emoji);
      return true;
    })
    .slice(0, 32);
}

function extractRemoteRecentEmojis(payload = {}) {
  const containers = getApiPayloadContainers(payload);
  const directKeys = ['emojiRecents', 'recentEmojis', 'emojisRecientes', 'emojiHistory', 'historialEmojis'];
  const nestedKeys = ['view', 'vista', 'visualBehavior', 'comportamientoVisual', 'personalConfig', 'configuracionPersonal', 'preferences', 'preferencias'];

  for (const container of containers) {
    for (const directKey of directKeys) {
      const direct = normalizeRecentEmojiList(container?.[directKey]);
      if (direct.length) return direct;
    }

    for (const nestedKey of nestedKeys) {
      const nested = container?.[nestedKey];
      if (!nested || typeof nested !== 'object') continue;
      for (const directKey of directKeys) {
        const nestedValue = normalizeRecentEmojiList(nested[directKey]);
        if (nestedValue.length) return nestedValue;
      }
    }
  }

  return [];
}

function mergeRecentEmojiPreferences(remoteEmojis = [], localEmojis = readRecentEmojis()) {
  return normalizeRecentEmojiList([...remoteEmojis, ...localEmojis]);
}

function applyRemoteUserPreferences(payload = {}) {
  if (!CHATER_CONFIG.enableRemoteUserPreferences || !payload || payload.offlineDemo) return false;

  const remoteRecentEmojis = extractRemoteRecentEmojis(payload);
  if (!remoteRecentEmojis.length) {
    userPreferencesSyncState.remoteLoadedAt = new Date().toISOString();
    return false;
  }

  const localRecentEmojis = readRecentEmojis();
  const mergedRecentEmojis = mergeRecentEmojiPreferences(remoteRecentEmojis, localRecentEmojis);
  const changed = JSON.stringify(mergedRecentEmojis) !== JSON.stringify(localRecentEmojis);

  if (changed) {
    try {
      writeStorageItem(getEmojiRecentsStorageKey(), JSON.stringify(mergedRecentEmojis));
    } catch (error) {
      console.warn('No se pudieron aplicar las preferencias remotas de emojis.', error);
    }
  }

  userPreferencesSyncState.remoteLoadedAt = new Date().toISOString();
  userPreferencesSyncState.error = '';
  return changed;
}

function buildUserPreferencesPayload(reason = 'sync') {
  const notificationRegistration = readNotificationRegistration();
  const recentEmojis = readRecentEmojis();
  return {
    userId: getCurrentUserIdentifier(),
    userEmail: getSessionEmail(),
    email: getSessionEmail(),
    theme: 'automatic',
    language: navigator.language || 'es-CO',
    notifications: {
      permission: getNotificationPermissionStatus(),
      deviceId: getDeviceId(),
      pushEnabled: Boolean(notificationRegistration?.pushEnabled || notificationRegistration?.pushSubscription),
      syncStatus: notificationRegistration?.syncStatus || '',
      registeredAt: notificationRegistration?.registeredAt || '',
      lastError: notificationRegistration?.lastError || ''
    },
    view: {
      recentEmojis,
      emojiRecents: recentEmojis,
      activeSection,
      displayMode: getCurrentDisplayMode()
    },
    visualBehavior: {
      themeMode: 'automatic',
      lightStartsAt: CHATER_CONFIG.lightStartsAt,
      darkStartsAt: CHATER_CONFIG.darkStartsAt
    },
    personalConfig: {
      source: 'chater-static-site',
      reason,
      emojiRecents: recentEmojis,
      deviceId: getDeviceId(),
      updatedAt: new Date().toISOString()
    }
  };
}

function enqueueUserPreferencesSync(payload = {}) {
  if (!CHATER_CONFIG.backendBaseUrl || !getSessionEmail()) return null;
  return enqueueBackendOperation({
    type: 'saveUserPreferences',
    dedupeKey: `user-preferences:${getDeviceId()}`,
    replaceExisting: true,
    payload
  });
}

function getUserPreferencesStatusLabel() {
  if (!CHATER_CONFIG.enableRemoteUserPreferences) return 'Desactivadas por configuración.';
  if (!CHATER_CONFIG.backendBaseUrl) return 'Pendientes: configura memoriaBACKEND para sincronizar preferencias protegidas.';
  if (userPreferencesSyncState.inFlight) return 'Sincronizando con PREFERENCIASusuarioX…';
  if (userPreferencesSyncState.error) return `Pendientes: ${userPreferencesSyncState.error}`;
  if (userPreferencesSyncState.lastSyncedAt) return `Sincronizadas ${formatScheduledCallTime(userPreferencesSyncState.lastSyncedAt)}.`;
  if (userPreferencesSyncState.remoteLoadedAt) return `Leídas ${formatScheduledCallTime(userPreferencesSyncState.remoteLoadedAt)}.`;
  return 'Pendientes de leer desde /api/v1/preferencias-usuario.';
}

function scheduleUserPreferencesSync(reason = 'change') {
  if (!CHATER_CONFIG.backendBaseUrl || !getSessionEmail() || !CHATER_CONFIG.enableRemoteUserPreferences) return;
  clearTimeout(userPreferencesSyncState.timer);
  userPreferencesSyncState.timer = window.setTimeout(() => {
    syncUserPreferencesToBackend(reason);
  }, USER_PREFERENCES_SYNC_DEBOUNCE_MS);
}

async function syncUserPreferencesToBackend(reason = 'sync') {
  if (!CHATER_CONFIG.backendBaseUrl || !getSessionEmail() || !CHATER_CONFIG.enableRemoteUserPreferences) return;
  if (userPreferencesSyncState.inFlight) {
    scheduleUserPreferencesSync(reason);
    return;
  }

  const clientMutationId = generateClientMutationId();
  const payload = {
    ...buildUserPreferencesPayload(reason),
    clientMutationId
  };

  userPreferencesSyncState.inFlight = true;
  try {
    await apiClient.saveUserPreferences(payload, clientMutationId);
    userPreferencesSyncState.lastSyncedAt = new Date().toISOString();
    userPreferencesSyncState.error = '';
  } catch (error) {
    userPreferencesSyncState.error = error?.message || 'Preferencias pendientes de sincronizar.';
    enqueueUserPreferencesSync(payload);
  } finally {
    userPreferencesSyncState.inFlight = false;
  }
}

function persistState() {
  pruneExpiredChatMessagesFromState(appState);
  const ownerEmail = normalizeStorageIdentity(getSessionEmail());
  const storageKey = getStateStorageKey(ownerEmail);
  try {
    writeStorageItem(storageKey, JSON.stringify(createPersistableState(ownerEmail)), { throwOnError: true });
  } catch (error) {
    const compactState = createCompactPersistableState(ownerEmail);
    try {
      writeStorageItem(storageKey, JSON.stringify(compactState), { throwOnError: true });
      console.warn('Se guardó ChatER sin previsualizaciones multimedia locales para proteger el almacenamiento del navegador.', error);
    } catch (compactError) {
      const emergencyState = createEmergencyPersistableState(ownerEmail);
      writeStorageItem(storageKey, JSON.stringify(emergencyState));
      console.warn('Se guardó ChatER en modo compacto de emergencia para evitar que el almacenamiento local bloquee la app.', compactError);
    }
  }
  scheduleNextEphemeralLocalPurge('persist-state');
}

function createPersistableState(ownerEmail = '') {
  return {
    ...appState,
    ownerEmail,
    conversations: appState.conversations.map((conversation) => ({
      ...conversation,
      messages: (conversation.messages || []).map(removeTransientPreviewFromMessage)
    })),
    states: appState.states.map(removeTransientPreviewFromMessage)
  };
}

function removeTransientPreviewFromMessage(message = {}) {
  if (!String(message.mediaPreviewDataUrl || '').startsWith('blob:')) return message;
  return {
    ...message,
    mediaPreviewDataUrl: '',
    mediaSyncStatus: message.mediaSyncStatus || 'preview-transient'
  };
}

function createCompactPersistableState(ownerEmail = '') {
  return {
    ...appState,
    ownerEmail,
    conversations: appState.conversations.map(compactConversationForPersistence),
    states: appState.states.map(compactStateForPersistence)
  };
}

function createEmergencyPersistableState(ownerEmail = '') {
  const business = ensureBusinessState();
  return {
    ...appState,
    ownerEmail,
    conversations: appState.conversations.map((conversation) => ({
      ...compactConversationForPersistence(conversation),
      messages: (conversation.messages || []).slice(-30).map(compactMessageForPersistence)
    })),
    states: appState.states.slice(0, 40).map(compactStateForPersistence),
    calls: appState.calls.slice(0, 60),
    business: {
      ...business,
      activities: (business.activities || []).slice(0, 12)
    }
  };
}

function compactConversationForPersistence(conversation = {}) {
  return {
    ...conversation,
    messages: (conversation.messages || []).map(compactMessageForPersistence)
  };
}

function compactMessageForPersistence(message = {}) {
  if (!message.mediaPreviewDataUrl) return message;
  return {
    ...message,
    mediaPreviewDataUrl: '',
    mediaSyncStatus: message.mediaSyncStatus || 'preview-removed-for-storage'
  };
}

function compactStateForPersistence(state = {}) {
  if (!state.mediaPreviewDataUrl) return state;
  return {
    ...state,
    mediaPreviewDataUrl: '',
    mediaSyncStatus: state.mediaSyncStatus || 'preview-removed-for-storage'
  };
}

function resetActivePointers() {
  activeConversationId = getFirstVisibleConversationId() || appState.conversations.find((conversation) => !conversation.deleted)?.id || null;
  activeStateId = getActiveStates()[0]?.id || appState.states[0]?.id || null;
  activeSection = 'chats';
  messageHistoryHydration.inFlight.clear();
  contactConversationSyncState.inFlight.clear();
}

function activateSessionState(email, forceReload = false) {
  const identity = normalizeStorageIdentity(email);
  if (!forceReload && activeStateStorageEmail === identity) return;
  clearEphemeralLocalPurgeTimer();
  appState = loadState(identity);
  activeStateStorageEmail = identity;
  resetActivePointers();
  scheduleNextEphemeralLocalPurge('session-state-activated');
}

function getSessionEmail() {
  return chaterRuntimeSession.email || '';
}

function getSessionUserId() {
  return chaterRuntimeSession.userId || '';
}

function setSessionEmail(email) {
  chaterRuntimeSession.email = normalizeStorageIdentity(email);
}

function applyMemoriaBackendRuntimeUserPayload(payload = {}) {
  const normalizedPayload = normalizeMemoriaBackendUserPayload(payload, getSessionEmail());
  persistBackendUserIdFromPayload(normalizedPayload);
}

function hasBackendSessionCredentials() {
  if (!CHATER_CONFIG.backendBaseUrl) return !shouldRequireGoogleGmailAuth();
  return isMemoriaBackendSdkAuthenticated();
}

function getBackendErrorCode(error = {}) {
  return String(
    error.code
    || error.payload?.err
    || error.payload?.code
    || error.payload?.error?.code
    || error.payload?.metadata?.err
    || error.payload?.message
    || error.message
    || ''
  ).trim().toLowerCase();
}


function isStremePublishIdempotencyConflict(error = {}) {
  const status = Number(
    error.status
      || error.responseStatus
      || error.statusCode
      || error.payload?.statusCode
      || error.payload?.metadata?.statusCode
      || 0
  );
  if (status !== 409) return false;
  const conflictText = [
    getBackendErrorCode(error),
    collectQueuedStremeConflictText(error),
    error.payload?.message,
    error.payload?.error?.message
  ].filter(Boolean).join(' ');
  return !conflictText || isStremeConflictNoopText(conflictText);
}

function isBackendAuthError(error = {}) {
  const status = Number(error.status || error.responseStatus || error.payload?.statusCode || error.payload?.metadata?.statusCode || 0);
  if ([401, 403].includes(status)) return true;

  const code = getBackendErrorCode(error);
  return /(login|auth|sesion|session|token|cookie|credencial|credential).*(requerid|required|invalid|inval|expired|expir|revoked|revoc|denied|forbidden|unauthorized|no autorizado)|^(login_requerido|unauthorized|forbidden|invalid_session|session_required|auth_required|token_expired)$/.test(code);
}


function isProtectedChatERMemoriaApiPath(path = '') {
  const pathname = String(path || '').split('?')[0].replace(/\/+$/, '') || '/';
  const protectedPrefixes = [
    '/api/v1/perfil-usuario',
    '/api/v1/preferencias-usuario',
    '/api/v1/conversaciones',
    '/api/v1/mensajes',
    '/api/v1/relaciones-usuario',
    '/api/v1/privacidad-usuario',
    '/api/v1/bloqueos-usuario',
    '/api/v1/reportes-moderacion',
    '/api/v1/senales-efimeras',
    '/api/v1/presencia-usuario',
    '/api/v1/media-firmada',
    '/api/v1/imagenes-r2x',
    '/api/v1/publicaciones-efimeras',
    '/api/v1/vistas-contenido',
    '/api/v1/sesiones-comunicacion',
    '/api/v1/signaling-tiempo-real',
    '/api/v1/streme/eventos',
    '/api/v1/push',
    '/api/v1/reconciliacion-ids',
    '/api/v1/cursor-sincronizacion',
    '/api/v1/busqueda'
  ];

  return protectedPrefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

function handleProtectedApiAuthFailure(path = '', error = {}) {
  if (!CHATER_CONFIG.backendBaseUrl || !shouldRequireGoogleGmailAuth()) return false;
  if (!getSessionEmail() || !isProtectedChatERMemoriaApiPath(path) || !isBackendAuthError(error)) return false;

  requireFreshBackendLogin(getSessionEmail(), 'Tu sesión Google/Gmail ya no fue aceptada por memoriaBACKEND. Ingresa nuevamente para sincronizar ChatER.');
  renderShell();
  return true;
}

function requireFreshBackendLogin(email = '', message = 'Vuelve a ingresar con Google/Gmail para que memoriaBACKEND valide tu sesión.') {
  clearSession();
  setAuthFeedback(message);
}

function clearRuntimeSessionIdentity(email = getSessionEmail()) {
  chaterRuntimeSession.email = '';
  chaterRuntimeSession.userId = '';
  removeStorageItem(getStremeLastEventStorageKey(email));
  removeStorageItem(getStremeLastEventByChannelStorageKey(email));
  removeStorageItem(CHATER_CONFIG.stremeLastEventKey);
}

function clearSession() {
  const sessionEmail = getSessionEmail();
  disconnectStremeRealtime();
  clearEphemeralLocalPurgeTimer();
  resetTypingStateForSessionEnd();
  closeTransientUiForSessionEnd();
  clearRuntimeSessionIdentity(sessionEmail);
  clearTimeout(outboxRetryTimer);
  advanceSessionRuntime('');
  initialSyncInFlight = '';
  outboxFlushInFlight = '';
  appState = loadState('');
  activeStateStorageEmail = '';
  resetActivePointers();
}

function getDeviceId() {
  let deviceId = readStorageItem(CHATER_CONFIG.deviceKey, '');
  if (!deviceId) {
    deviceId = `web-${generateClientMutationId()}`;
    writeStorageItem(CHATER_CONFIG.deviceKey, deviceId);
  }
  return deviceId;
}

function generateClientMutationId() {
  if (window.crypto?.randomUUID) {
    return window.crypto.randomUUID();
  }
  return `cmid-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function buildDeterministicMutationId(prefix = 'client', ...parts) {
  const safeParts = parts
    .map((part) => String(part || '').trim())
    .filter(Boolean)
    .map((part) => part.replace(/[^a-zA-Z0-9._:-]/g, '-').slice(0, 48));
  const body = safeParts.join('-').replace(/-+/g, '-').slice(0, 120);
  return `${prefix}-${body || generateClientMutationId()}`.slice(0, 160);
}

function sanitizeTelemetryText(value = '', maxLength = 260) {
  const normalized = String(value || '')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[correo]')
    .replace(/(bearer|token|idToken|refreshToken|signedSession|authorization)\s*[:=]\s*[^\s&]+/gi, '$1=[redactado]')
    .replace(/([?&](?:token|tk|idToken|refreshToken|signedSession|code|credential)=)[^&\s]+/gi, '$1[redactado]')
    .replace(/https?:\/\/[^\s?#]+([^\s]*)/gi, (match) => {
      try {
        const url = new URL(match);
        return `${url.origin}${url.pathname}`;
      } catch (error) {
        return '[url]';
      }
    })
    .replace(/\s+/g, ' ')
    .trim();

  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, Math.max(0, maxLength - 1)).trim()}…`;
}

function sanitizeTelemetryStack(value = '') {
  return String(value || '')
    .split('\n')
    .slice(0, 8)
    .map((line) => sanitizeTelemetryText(line, 220))
    .filter(Boolean)
    .join('\n')
    .slice(0, 1200);
}

function getSafeTelemetryUserId() {
  const userId = normalizeBackendUserId(getSessionUserId());
  if (userId && !userId.includes('@')) return userId;
  return '';
}

function canSendClientTelemetry(key = '') {
  if (!CHATER_CONFIG.backendBaseUrl || !CHATER_CONFIG.enableClientTelemetry) return false;
  const now = Date.now();
  clientTelemetryState.timestamps = clientTelemetryState.timestamps.filter((timestamp) => now - timestamp < 60000);
  if (clientTelemetryState.timestamps.length >= 8) return false;
  if (key && clientTelemetryState.inFlightKeys.has(key)) return false;
  clientTelemetryState.timestamps.push(now);
  if (key) clientTelemetryState.inFlightKeys.add(key);
  return true;
}

function buildClientTelemetryPayload(kind = 'client_error', details = {}) {
  const error = details.error || details.reason || {};
  const rawMessage = details.message || error.message || String(error || 'Error técnico del navegador');
  const rawStack = details.stack || error.stack || '';
  const safeMessage = sanitizeTelemetryText(rawMessage, 240) || 'Error técnico del navegador';
  const safeSource = sanitizeTelemetryText(details.source || details.filename || window.location.pathname || '/', 180);
  const safeStack = sanitizeTelemetryStack(rawStack);
  const userId = getSafeTelemetryUserId();

  return {
    type: kind,
    name: kind === 'unhandled_rejection' ? 'Promesa rechazada en navegador' : 'Error técnico del navegador',
    category: 'frontend-error',
    path: `${window.location.pathname || '/'}${window.location.search || ''}`.slice(0, 240),
    data: {
      level: 'error',
      message: safeMessage,
      source: safeSource,
      line: Number(details.lineno || details.line || 0) || 0,
      column: Number(details.colno || details.column || 0) || 0,
      stack: safeStack,
      browser: sanitizeTelemetryText(navigator.userAgent || '', 180),
      userId,
      hasAuthenticatedSession: Boolean(getSessionEmail()),
      appVersion: typeof APP_VERSION !== 'undefined' ? APP_VERSION : '',
      serviceWorkerVersion: '2026-07-06-auth-reference-6',
      occurredAt: new Date().toISOString()
    }
  };
}

function reportClientTelemetry(kind = 'client_error', details = {}) {
  const message = sanitizeTelemetryText(details.message || details.error?.message || details.reason?.message || String(details.reason || ''), 160);
  const source = sanitizeTelemetryText(details.source || details.filename || '', 120);
  const dedupeKey = buildDeterministicMutationId('client-telemetry', kind, message, source);
  if (!canSendClientTelemetry(dedupeKey)) return;

  apiClient.registerClientTelemetry(buildClientTelemetryPayload(kind, details), dedupeKey)
    .catch(() => null)
    .finally(() => {
      clientTelemetryState.inFlightKeys.delete(dedupeKey);
    });
}

function registerClientTelemetryListeners() {
  if (!CHATER_CONFIG.enableClientTelemetry) return;

  window.addEventListener('error', (event) => {
    reportClientTelemetry('client_error', {
      message: event.message,
      error: event.error,
      source: event.filename,
      lineno: event.lineno,
      colno: event.colno
    });
  });

  window.addEventListener('unhandledrejection', (event) => {
    reportClientTelemetry('unhandled_rejection', {
      reason: event.reason,
      message: event.reason?.message || String(event.reason || 'Promesa rechazada sin manejar'),
      stack: event.reason?.stack || ''
    });
  });
}

function getActiveConversation() {
  return appState.conversations.find((conversation) => conversation.id === activeConversationId && !conversation.deleted);
}

function compareConversationsForList(first = {}, second = {}) {
  const firstPinned = first.pinned ? 1 : 0;
  const secondPinned = second.pinned ? 1 : 0;
  if (firstPinned !== secondPinned) return secondPinned - firstPinned;

  const firstLastMessage = first.messages?.at?.(-1) || {};
  const secondLastMessage = second.messages?.at?.(-1) || {};
  const firstTime = Date.parse(firstLastMessage.createdAt || first.updatedAt || first.lastActivityAt || '') || 0;
  const secondTime = Date.parse(secondLastMessage.createdAt || second.updatedAt || second.lastActivityAt || '') || 0;
  if (firstTime !== secondTime) return secondTime - firstTime;

  return String(first.name || '').localeCompare(String(second.name || ''), 'es');
}

function getVisibleConversations() {
  return appState.conversations
    .filter((conversation) => !conversation.archived && !conversation.deleted)
    .sort(compareConversationsForList);
}

function getArchivedConversations() {
  return appState.conversations
    .filter((conversation) => conversation.archived && !conversation.deleted)
    .sort(compareConversationsForList);
}

function isArchivedChatListOpen() {
  return activeSection === 'chats' && activeChatListGroup === 'archived';
}

function setActiveChatListGroup(group = 'main') {
  activeChatListGroup = group === 'archived' ? 'archived' : 'main';
}

function getCurrentChatListConversations() {
  return isArchivedChatListOpen() ? getArchivedConversations() : getVisibleConversations();
}

function getFirstVisibleConversationId(excludeConversationId = '') {
  return getVisibleConversations().find((conversation) => conversation.id !== excludeConversationId)?.id || null;
}

function getActiveState() {
  const activeStates = getActiveStates();
  return activeStates.find((state) => state.id === activeStateId) || activeStates[0] || null;
}

function getCurrentTime() {
  return new Date().toLocaleTimeString('es-CO', {
    hour: '2-digit',
    minute: '2-digit'
  });
}

function formatEventTime(value) {
  if (!value) return getCurrentTime();
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return getCurrentTime();
  return date.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
}

function formatScheduledCallTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'fecha pendiente';
  return date.toLocaleString('es-CO', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function getMinimumScheduleDateTimeValue() {
  const date = new Date(Date.now() + 5 * 60 * 1000);
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return localDate.toISOString().slice(0, 16);
}

function getAutomaticTheme(now = new Date()) {
  const hour = now.getHours();
  return hour >= CHATER_CONFIG.lightStartsAt && hour < CHATER_CONFIG.darkStartsAt ? 'light' : 'dark';
}

function updateThemeMeta(theme) {
  if (!themeColorMeta) return;
  themeColorMeta.setAttribute('content', theme === 'light' ? '#f0f2f5' : '#0b141a');
}

function applyAutomaticTheme() {
  const theme = getAutomaticTheme();
  document.documentElement.dataset.theme = theme;
  document.documentElement.dataset.themeMode = 'automatic';
  updateThemeMeta(theme);
  return theme;
}

function renderAvatarInPlace(container, entity = {}) {
  if (!container) return;
  const fallback = entity.avatar || getInitials(entity.name || entity.email || 'ChatER');
  const renderToken = generateClientMutationId();
  container.dataset.avatarRenderToken = renderToken;
  container.innerHTML = '';
  container.textContent = fallback;

  if (entity.avatarImage) {
    const image = document.createElement('img');
    image.className = 'avatar-image';
    image.alt = '';
    image.src = entity.avatarImage;
    image.onload = () => {
      if (container.dataset.avatarRenderToken !== renderToken) return;
      container.textContent = '';
      container.appendChild(image);
    };
    image.onerror = () => {
      if (container.dataset.avatarRenderToken !== renderToken) return;
      container.textContent = fallback;
    };
  }
}

function createAvatarElement(entity, className = 'chat-item-avatar') {
  const wrapper = document.createElement('div');
  wrapper.className = className;
  renderAvatarInPlace(wrapper, entity);
  return wrapper;
}

function getProfilePreviewField(source = {}, keys = []) {
  if (!source || typeof source !== 'object') return '';
  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

function resolveConversationProfilePreview(conversation = {}) {
  const participants = normalizeConversationParticipantsForApi(
    conversation.participants,
    conversation.email || conversation.contactEmail,
    conversation.name || conversation.displayName
  );
  const remoteParticipant = getPrimaryRemoteParticipant(participants) || {};
  const metadata = conversation.metadata && typeof conversation.metadata === 'object' ? conversation.metadata : {};
  const publicData = conversation.publicData && typeof conversation.publicData === 'object' ? conversation.publicData : {};
  const contact = conversation.contact && typeof conversation.contact === 'object' ? conversation.contact : {};

  const email = normalizeStorageIdentity(
    getProfilePreviewField(remoteParticipant, ['email', 'userEmail', 'contactEmail', 'mail'])
    || getProfilePreviewField(contact, ['email', 'userEmail', 'contactEmail', 'mail'])
    || getProfilePreviewField(conversation, ['email', 'contactEmail', 'userEmail', 'mail'])
    || getProfilePreviewField(metadata, ['email', 'contactEmail', 'userEmail', 'mail'])
    || getProfilePreviewField(publicData, ['email', 'contactEmail', 'userEmail', 'mail'])
  );

  const displayName = String(
    getProfilePreviewField(conversation, ['name', 'displayName', 'alias', 'customListName'])
    || getProfilePreviewField(remoteParticipant, ['displayName', 'name', 'alias'])
    || getProfilePreviewField(contact, ['displayName', 'name', 'alias'])
    || getProfilePreviewField(metadata, ['displayName', 'name', 'alias'])
    || getProfilePreviewField(publicData, ['displayName', 'name', 'alias'])
    || email
    || 'Contacto'
  ).trim();

  const avatarImage = normalizeAssetImagePath(
    getProfilePreviewField(conversation, ['avatarImage', 'profileImage', 'avatarUrl', 'photoUrl', 'picture', 'imageUrl', 'profileImageUrl'])
    || getProfilePreviewField(remoteParticipant, ['avatarImage', 'profileImage', 'avatarUrl', 'photoUrl', 'picture', 'imageUrl', 'profileImageUrl'])
    || getProfilePreviewField(contact, ['avatarImage', 'profileImage', 'avatarUrl', 'photoUrl', 'picture', 'imageUrl', 'profileImageUrl'])
    || getProfilePreviewField(metadata, ['avatarImage', 'profileImage', 'avatarUrl', 'photoUrl', 'picture', 'imageUrl', 'profileImageUrl'])
    || getProfilePreviewField(publicData, ['avatarImage', 'profileImage', 'avatarUrl', 'photoUrl', 'picture', 'imageUrl', 'profileImageUrl'])
  );

  return {
    name: displayName,
    email,
    avatar: conversation.avatar || remoteParticipant.avatar || contact.avatar || getInitials(displayName || email || 'Contacto'),
    avatarImage
  };
}

function openConversationProfilePreview(conversation = {}) {
  const profile = resolveConversationProfilePreview(conversation);
  const container = document.createElement('div');
  container.className = 'profile-preview-modal';

  const avatar = document.createElement('div');
  avatar.className = 'profile-preview-avatar';
  avatar.textContent = profile.avatar || getInitials(profile.name || profile.email || 'Contacto');

  if (profile.avatarImage) {
    const image = document.createElement('img');
    image.alt = `Foto de perfil de ${profile.name || profile.email || 'contacto'}`;
    image.src = profile.avatarImage;
    image.onload = () => {
      avatar.textContent = '';
      avatar.appendChild(image);
    };
    image.onerror = () => {
      avatar.classList.add('profile-preview-placeholder');
      avatar.textContent = profile.avatar || getInitials(profile.name || profile.email || 'Contacto');
    };
  } else {
    avatar.classList.add('profile-preview-placeholder');
  }

  const info = document.createElement('div');
  info.className = 'profile-preview-info';

  const name = document.createElement('strong');
  name.textContent = profile.name || 'Contacto';

  const email = document.createElement('span');
  email.className = 'profile-preview-email';
  email.textContent = profile.email || 'Correo no disponible';

  info.append(name, email);
  container.append(avatar, info);
  setModal('Perfil del chat', container, 'conversation-profile-preview');
}

function attachConversationProfilePreview(avatarElement, conversation = {}) {
  if (!avatarElement) return;
  avatarElement.classList.add('profile-preview-trigger');
  avatarElement.title = 'Ver foto de perfil y correo';
  avatarElement.setAttribute('aria-label', 'Ver foto de perfil y correo');
  avatarElement.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    openConversationProfilePreview(conversation);
  });
}
function renderBrandLogoInPlace(container) {
  if (!container) return;
  const fallback = 'CE';
  const renderToken = generateClientMutationId();
  container.dataset.logoRenderToken = renderToken;
  container.classList.remove('has-image');
  container.innerHTML = '';
  container.textContent = fallback;

  const image = document.createElement('img');
  image.className = 'brand-logo-image';
  image.alt = '';
  const logoSrc = 'assets/chater-logo.png';
  image.src = chaterBrandLogoVersion ? `${logoSrc}?v=${encodeURIComponent(chaterBrandLogoVersion)}` : logoSrc;
  image.onload = () => {
    if (container.dataset.logoRenderToken !== renderToken) return;
    container.textContent = '';
    container.classList.add('has-image');
    container.appendChild(image);
  };
  image.onerror = () => {
    if (container.dataset.logoRenderToken !== renderToken) return;
    container.classList.remove('has-image');
    container.textContent = fallback;
  };
}

function renderBrandLogos() {
  brandLogoElements.forEach(renderBrandLogoInPlace);
}


function getInitials(value = '') {
  return value
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('') || 'CE';
}

function escapeHTML(value = '') {
  return String(value).replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#039;',
    '"': '&quot;'
  }[character]));
}

function normalizeUiSearchText(value = '') {
  const text = String(value || '');
  const normalizedText = typeof text.normalize === 'function' ? text.normalize('NFD') : text;
  return normalizedText
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function valueMatchesUiSearch(value, normalizedFilter = '') {
  if (!normalizedFilter) return true;
  return normalizeUiSearchText(value).includes(normalizedFilter);
}

function showToast(message) {
  clearTimeout(toastTimer);
  toast.textContent = message;
  toast.hidden = false;
  toastTimer = setTimeout(() => {
    toast.hidden = true;
  }, 2600);
}

const SCROLLABLE_LIST_SELECTOR = [
  '#chatList',
  '.chat-list',
  '.messages',
  '.modal-body',
  '.modal-list',
  '.archived-modal-list',
  '.quick-composer-list',
  '.call-starter-list',
  '.emoji-panel-content',
  '.emoji-grid',
  '.emoji-token-grid',
  '.tools-panel',
  '.qr-scanner-panel',
  '.permission-lego-content',
  '.contact-create-actions',
  '.section-menu-grid',
  '.section-menu-actions',
  '.quick-action-grid',
  '.api-status-grid',
  '.call-action-grid',
  '.call-shortcut-rail',
  '.tools-metric-grid',
  '.business-summary-list',
  '.chat-floating-menu-list',
  '.chat-floating-menu-options',
  '[data-search-results]',
  '[data-remote-search-results]',
  '[role="list"]',
  '[role="listbox"]'
].join(',');

function applyListScrollSemantics(root = document) {
  if (!root?.querySelectorAll) return;
  const nodes = [];
  if (root.matches?.(SCROLLABLE_LIST_SELECTOR)) nodes.push(root);
  root.querySelectorAll(SCROLLABLE_LIST_SELECTOR).forEach((node) => nodes.push(node));

  nodes.forEach((node) => {
    if (!node || node.dataset?.listScrollLocked === 'true') return;
    node.dataset.listScroll = 'true';
    if (!node.hasAttribute('tabindex')) node.setAttribute('tabindex', '0');
    if (!node.hasAttribute('aria-label') && node.classList?.contains('archived-modal-list')) node.setAttribute('aria-label', 'Lista de chats archivados');
    if (!node.hasAttribute('aria-label') && node.classList?.contains('quick-composer-list')) node.setAttribute('aria-label', 'Lista de acciones rápidas');
    if (!node.hasAttribute('aria-label') && node.classList?.contains('call-starter-list')) node.setAttribute('aria-label', 'Lista de contactos para llamada');
    if (!node.hasAttribute('aria-label') && node.classList?.contains('section-menu-actions')) node.setAttribute('aria-label', 'Lista de acciones de la sección');
    if (!node.hasAttribute('aria-label') && node.classList?.contains('call-shortcut-rail')) node.setAttribute('aria-label', 'Lista de accesos de llamada');
    if (!node.hasAttribute('aria-label') && node.classList?.contains('api-status-grid')) node.setAttribute('aria-label', 'Lista de estados de APIs');
    if (!node.hasAttribute('aria-label') && node.matches?.('[data-search-results], [data-remote-search-results]')) node.setAttribute('aria-label', 'Lista de resultados de búsqueda');
    if (!node.hasAttribute('aria-label') && node.matches?.('[role="list"], [role="listbox"]')) node.setAttribute('aria-label', 'Lista navegable');
  });
}

function setModal(title, contentNodeOrHtml, modalKind = '') {
  stopActiveQrScanner();
  activeModalKind = modalKind;
  modalTitle.textContent = title;
  modalBody.innerHTML = '';

  if (typeof contentNodeOrHtml === 'string') {
    modalBody.innerHTML = contentNodeOrHtml;
  } else {
    modalBody.appendChild(contentNodeOrHtml);
  }

  applyListScrollSemantics(modalBody);
  modalOverlay.hidden = false;
  renderNavigationState();
}

function closeModal() {
  stopActiveQrScanner();
  activeModalKind = '';
  modalOverlay.hidden = true;
  modalBody.innerHTML = '';
  renderNavigationState();
}

function stopActiveQrScanner() {
  if (!activeQrScannerCleanup) return;
  try {
    activeQrScannerCleanup();
  } catch (error) {
    console.warn('No se pudo cerrar el escáner QR activo.', error);
  } finally {
    activeQrScannerCleanup = null;
  }
}

function closeEmojiPanel() {
  if (!emojiPanel) return;
  emojiPanel.hidden = true;
  emojiButton.classList.remove('active');
}

function closeTransientPanels() {
  closeEmojiPanel();
  closeChatFloatingMenu();
}

async function requestChaterPermission(capability, options = {}) {
  const permissionBridge = window.ChatERPermisosLego;
  const request = typeof options.request === 'function' ? options.request : null;

  if (!permissionBridge?.requestCapability) {
    if (request) return request();
    return true;
  }

  return permissionBridge.requestCapability({
    appName: 'ChatER',
    capability,
    ...options,
    request
  });
}

function setMobileSearchVisible(visible) {
  if (!chatView) return;
  chatView.classList.toggle('mobile-search-visible', Boolean(visible));
}

function closeTransientUiForSessionEnd() {
  closeTransientPanels();
  closeChatSelectionMode({ render: false });
  cancelVoiceNoteRecording();
  closeModal();
}

function activateMemoriaBackendRuntimeSession(email, payload = {}) {
  const authoritativePayload = normalizeMemoriaBackendUserPayload(payload, email);
  const resolvedEmail = getMemoriaBackendPayloadEmail(authoritativePayload, email);

  if (!resolvedEmail) {
    setAuthFeedback('memoriaBACKEND no entregó el correo de la sesión Google validada.');
    return false;
  }

  applyMemoriaBackendRuntimeUserPayload(authoritativePayload);
  setSessionEmail(resolvedEmail);
  advanceSessionRuntime(resolvedEmail);
  activateSessionState(resolvedEmail, true);
  setAuthFeedback('');
  closeModal();
  renderShell();
  return true;
}


function renderShell() {
  renderBrandLogos();
  const email = getSessionEmail();

  if (!email && keepLocalLoginHiddenForMemoriaBackend()) {
    return;
  }

  if (email && CHATER_CONFIG.backendBaseUrl && !hasBackendSessionCredentials()) {
    requireFreshBackendLogin(email, 'Tu sesión necesita validarse con Google en memoriaBACKEND.');
    keepLocalLoginHiddenForMemoriaBackend();
    if (chatView) chatView.hidden = true;
    return;
  }

  if (chatView) chatView.hidden = !email;

  if (!email) return;

  const initials = getInitials(email.split('@')[0].replace(/[._-]/g, ' '));
  userEmailLabel.textContent = email;
  profileButton.textContent = initials;
  const launchedFromDeepLink = applyDeepLinkFromLocation({ silent: true });
  if (!launchedFromDeepLink) {
    renderCurrentSection();
    renderConversation();
  }
  connectStremeRealtime();
  syncInitialDataFromBackend();
  flushBackendOutbox();
}

const sectionChrome = {
  chats: { title: 'ChatER', subtitle: 'Conversaciones por correo', search: 'Buscar o iniciar un chat' },
  states: { title: 'Novedades', subtitle: 'Estados visibles por 24 horas', search: 'Buscar estados' },
  calls: { title: 'Llamadas', subtitle: 'Historial de voz y video', search: 'Buscar llamadas' },
  tools: { title: 'Herramientas', subtitle: 'Configuración de la app', search: 'Buscar herramientas' }
};

function updateSectionChrome() {
  const meta = sectionChrome[activeSection] || sectionChrome.chats;
  if (chatView) chatView.dataset.section = activeSection;
  if (sidebarHeading) sidebarHeading.textContent = meta.title;
  if (sidebarSubtitle) sidebarSubtitle.textContent = activeSection === 'chats' ? getSessionEmail() || meta.subtitle : meta.subtitle;
  if (searchInput) searchInput.placeholder = meta.search;
}

function getPrimaryActionMeta(section = activeSection) {
  if (section === 'states') {
    return { icon: '📷', label: 'Crear estado', action: 'createStatus' };
  }

  if (section === 'calls') {
    return { icon: '☎+', label: 'Nueva llamada', action: 'startCall' };
  }

  if (section === 'tools') {
    return { icon: 'API', label: 'Estado memoriaBACKEND', action: 'apiStatus' };
  }

  return { icon: '＋', label: 'Nuevo chat', action: 'newChat' };
}

function updateSectionPrimaryActions() {
  const actionMeta = getPrimaryActionMeta();

  if (floatingActionButton) {
    floatingActionButton.textContent = actionMeta.icon;
    floatingActionButton.dataset.action = actionMeta.action;
    floatingActionButton.setAttribute('aria-label', actionMeta.label);
    floatingActionButton.title = actionMeta.label;
    floatingActionButton.hidden = !getSessionEmail();
  }

  if (headerCameraButton) {
    headerCameraButton.setAttribute('aria-label', activeSection === 'calls' ? 'Iniciar llamada desde conversaciones' : 'Crear estado rápido');
    headerCameraButton.title = activeSection === 'calls' ? 'Nueva llamada' : 'Crear estado';
  }

  if (toolsButton) {
    toolsButton.setAttribute('aria-label', 'Abrir menú de opciones');
    toolsButton.title = 'Más opciones';
  }
}

function focusSectionSearch() {
  closeTransientPanels();
  setMobileSearchVisible(true);
  searchInput?.focus();
  searchInput?.select?.();
  const meta = sectionChrome[activeSection] || sectionChrome.chats;
  showToast(meta.search);
}

function handleHeaderCameraAction() {
  closeTransientPanels();

  if (activeSection === 'calls') {
    openCallStarterModal();
    return;
  }

  openCreateStatusModal();
}

function handleFloatingAction() {
  const action = floatingActionButton?.dataset.action || getPrimaryActionMeta().action;

  if (action === 'newChat') {
    openNewChatModal({ name: searchInput?.value?.trim() || '' });
    return;
  }

  if (action === 'createStatus') {
    openCreateStatusModal();
    return;
  }

  if (action === 'startCall') {
    openCallStarterModal();
    return;
  }

  if (action === 'apiStatus') {
    openApiStatusModal();
  }
}

function getSectionMenuActions(section = activeSection) {
  const commonActions = [
    { id: 'profile', icon: 'CE', title: 'Perfil y sesión', description: 'Ver correo activo, tema automático y sesión local.' },
    { id: 'tools', icon: '⚙', title: 'Abrir herramientas', description: 'Ir a instalación, APIs, notificaciones y herramientas comerciales.' },
    { id: 'api', icon: 'API', title: 'Estado memoriaBACKEND', description: 'Revisar conexión configurada, streme y modo demo.' }
  ];

  if (section === 'states') {
    return [
      { id: 'create-status', icon: '📷', title: 'Añadir estado', description: 'Publica una novedad visible durante 24 horas.' },
      { id: 'promote-status', icon: '↗', title: 'Promocionar estado', description: 'Prepara la promoción del estado activo.' },
      ...commonActions,
      { id: 'logout', icon: '↩', title: 'Cerrar sesión', description: 'Salir de este navegador.' }
    ];
  }

  if (section === 'calls') {
    return [
      { id: 'start-call', icon: '☎', title: 'Nueva llamada', description: 'Iniciar llamada de voz o video desde una conversación.' },
      { id: 'schedule-call', icon: '▦', title: 'Programar llamada', description: 'Agendar una llamada futura por correo electrónico.' },
      { id: 'call-keypad', icon: '⌗', title: 'Teclado por correo', description: 'Llamar creando o reutilizando un chat por correo.' },
      ...commonActions,
      { id: 'logout', icon: '↩', title: 'Cerrar sesión', description: 'Salir de este navegador.' }
    ];
  }

  if (section === 'tools') {
    return [
      { id: 'install', icon: '⬇', title: 'Instalar app', description: 'Agregar ChatER a la pantalla principal cuando el navegador lo permita.' },
      { id: 'update', icon: '↻', title: 'Actualizar app', description: 'Buscar y aplicar cambios publicados del static site.' },
      { id: 'notifications', icon: '🔔', title: 'Notificaciones', description: 'Configurar avisos locales o push para este dispositivo.' },
      ...commonActions.filter((action) => action.id !== 'tools'),
      { id: 'logout', icon: '↩', title: 'Cerrar sesión', description: 'Salir de este navegador.' }
    ];
  }

  return [
    { id: 'new-chat', icon: '＋', title: 'Nuevo chat', description: 'Iniciar una conversación usando correo electrónico.' },
    { id: 'archived', icon: '⇩', title: 'Archivados', description: 'Ver, restaurar o abrir conversaciones archivadas.' },
    { id: 'create-status', icon: '📷', title: 'Crear estado', description: 'Publica una novedad desde el encabezado.' },
    ...commonActions,
    { id: 'logout', icon: '↩', title: 'Cerrar sesión', description: 'Salir de este navegador.' }
  ];
}

function getSectionMenuTitle(section = activeSection) {
  if (section === 'states') return 'Opciones de novedades';
  if (section === 'calls') return 'Opciones de llamadas';
  if (section === 'tools') return 'Opciones de herramientas';
  return 'Opciones de chats';
}

function openSectionMenuModal() {
  closeTransientPanels();

  const container = document.createElement('div');
  container.className = 'section-menu-grid';
  container.innerHTML = `
    <p class="modal-copy">Acciones rápidas de la sección actual. Este menú mantiene funcional el botón de tres puntos de la cabecera sin duplicar la barra inferior.</p>
    <div class="section-menu-actions"></div>
  `;

  const actionsContainer = container.querySelector('.section-menu-actions');
  getSectionMenuActions().forEach((action) => {
    const button = document.createElement('button');
    button.className = 'tool-row section-menu-action';
    button.type = 'button';
    button.dataset.sectionMenuAction = action.id;
    button.innerHTML = `
      <span class="tool-icon">${escapeHTML(action.icon)}</span>
      <span><strong>${escapeHTML(action.title)}</strong><br><small>${escapeHTML(action.description)}</small></span>
    `;
    actionsContainer.appendChild(button);
  });

  container.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-section-menu-action]');
    if (!button) return;
    const action = button.dataset.sectionMenuAction;
    closeModal();
    await handleSectionMenuAction(action);
  });

  setModal(getSectionMenuTitle(), container, 'section-menu');
}

async function handleSectionMenuAction(action) {
  if (action === 'new-chat') {
    openNewChatModal();
    return;
  }

  if (action === 'archived') {
    openArchivedChatsList();
    return;
  }

  if (action === 'create-status') {
    openCreateStatusModal();
    return;
  }

  if (action === 'promote-status') {
    openPromoteStatusModal();
    return;
  }

  if (action === 'start-call') {
    openCallStarterModal();
    return;
  }

  if (action === 'schedule-call') {
    openScheduleCallModal();
    return;
  }

  if (action === 'call-keypad') {
    openCallKeypadModal();
    return;
  }

  if (action === 'profile') {
    openProfileModal();
    return;
  }

  if (action === 'tools') {
    selectSection('tools');
    return;
  }

  if (['api', 'install', 'update', 'notifications', 'logout'].includes(action)) {
    await handleToolAction(action);
  }
}

function parseDeepLinkTarget(urlLike = window.location.href) {
  let url;
  try {
    url = new URL(urlLike || window.location.href, window.location.href);
  } catch (error) {
    url = window.location;
  }

  const searchParams = new URLSearchParams(url.search || '');
  const hashParams = parseDeepLinkHash(url.hash || '');
  const section = normalizeDeepLinkSection(searchParams.get('section') || hashParams.section || hashParams.route || '');
  const chatId = firstNonEmptyDeepLinkValue(searchParams.get('chatId'), searchParams.get('chat'), hashParams.chatId, hashParams.chat);
  const stateId = firstNonEmptyDeepLinkValue(searchParams.get('stateId'), searchParams.get('state'), hashParams.stateId, hashParams.state);
  const callId = firstNonEmptyDeepLinkValue(searchParams.get('callId'), searchParams.get('call'), hashParams.callId, hashParams.call);

  if (chatId) return { type: 'chat', value: chatId };
  if (stateId) return { type: 'state', value: stateId };
  if (callId) return { type: 'call', value: callId };
  if (section) return { type: 'section', section };
  return { type: 'none' };
}

function parseDeepLinkHash(hash = '') {
  const cleanHash = String(hash || '').replace(/^#\/?/, '').trim();
  if (!cleanHash) return {};

  if (!cleanHash.includes('=') && !cleanHash.includes('&')) {
    const [rawType, ...rest] = cleanHash.split(/[/:]/).filter(Boolean);
    const type = normalizeDeepLinkAlias(rawType);
    const value = safeDecodeDeepLinkValue(rest.join('/'));
    if (['chats', 'states', 'calls', 'tools'].includes(type)) return { section: type };
    if (type === 'chat') return { chat: value };
    if (type === 'state') return { state: value };
    if (type === 'call') return { call: value };
    return { section: normalizeDeepLinkSection(cleanHash) };
  }

  const params = new URLSearchParams(cleanHash);
  const result = {};
  params.forEach((value, key) => {
    result[normalizeDeepLinkAlias(key)] = safeDecodeDeepLinkValue(value);
  });
  return result;
}

function normalizeDeepLinkAlias(value = '') {
  const normalized = String(value || '').trim().toLowerCase();
  const aliases = {
    novedades: 'states',
    estados: 'states',
    stateid: 'stateId',
    estado: 'state',
    llamadas: 'calls',
    callid: 'callId',
    herramientas: 'tools',
    tool: 'tools',
    chats: 'chats',
    chatid: 'chatId'
  };
  return aliases[normalized] || normalized;
}

function normalizeDeepLinkSection(value = '') {
  const normalized = normalizeDeepLinkAlias(value);
  return ['chats', 'states', 'calls', 'tools'].includes(normalized) ? normalized : '';
}

function firstNonEmptyDeepLinkValue(...values) {
  return values.map(safeDecodeDeepLinkValue).find(Boolean) || '';
}

function safeDecodeDeepLinkValue(value = '') {
  const rawValue = String(value || '').trim();
  if (!rawValue) return '';
  try {
    return decodeURIComponent(rawValue);
  } catch (error) {
    return rawValue;
  }
}

function applyDeepLinkFromLocation(options = {}) {
  return applyDeepLinkFromUrl(window.location.href, options);
}

function applyDeepLinkFromUrl(urlLike = window.location.href, options = {}) {
  if (!getSessionEmail()) return false;
  const target = parseDeepLinkTarget(urlLike);
  if (!target || target.type === 'none') return false;
  return applyDeepLinkTarget(target, options);
}

function applyDeepLinkTarget(target = {}, options = {}) {
  closeTransientPanels();
  setMobileSearchVisible(false);

  if (target.type === 'section' && target.section) {
    activeSection = target.section;
    chatView.classList.remove('chat-open');
    renderCurrentSection();
    return true;
  }

  if (target.type === 'chat') {
    const conversation = findConversationByDeepLinkValue(target.value);
    if (!conversation) {
      activeSection = 'chats';
      chatView.classList.remove('chat-open');
      renderCurrentSection();
      if (!options.silent) showToast('El chat solicitado aún no está disponible en este dispositivo.');
      return true;
    }

    activeSection = 'chats';
    activeConversationId = conversation.id;
    if (searchInput) searchInput.value = '';
    chatView.classList.add('chat-open');
    markConversationRead(conversation);
    renderCurrentSection();
    hydrateConversationMessages(conversation.id);
    return true;
  }

  if (target.type === 'state') {
    const state = appState.states.find((item) => String(item.id) === String(target.value));
    activeSection = 'states';
    if (state) activeStateId = state.id;
    chatView.classList.add('chat-open');
    renderCurrentSection();
    if (!state && !options.silent) showToast('El estado solicitado ya no está disponible.');
    return true;
  }

  if (target.type === 'call') {
    const call = appState.calls.find((item) => String(item.id) === String(target.value));
    activeSection = 'calls';
    chatView.classList.add('chat-open');
    renderCurrentSection();
    if (call) {
      openCallDetailModal(call);
    } else if (!options.silent) {
      showToast('La llamada solicitada no está disponible en el historial local.');
    }
    return true;
  }

  return false;
}

function findConversationByDeepLinkValue(value = '') {
  const normalizedValue = normalizeStorageIdentity(value);
  const rawValue = String(value || '').trim();
  return appState.conversations.find((conversation) => {
    const conversationId = String(conversation.id || '');
    const conversationEmail = normalizeStorageIdentity(conversation.email || conversation.contactEmail || '');
    return conversationId === rawValue || conversationEmail === normalizedValue;
  }) || null;
}

function renderNavigationState() {
  updateSectionChrome();
  updateSectionPrimaryActions();

  const activitySummary = getNavigationActivitySummary();

  sectionTabs.forEach((tab) => {
    const section = tab.dataset.section;
    tab.classList.toggle('active', section === activeSection);
    updateActivityBadge(tab, activitySummary[section] || 0, 'mode-tab-badge', section);
  });

  bottomNavButtons.forEach((button) => {
    const section = button.dataset.bottomSection;
    const tool = button.dataset.bottomTool;
    const isActiveSection = Boolean(section && section === activeSection);
    const isActiveTool = Boolean(tool && tool === activeModalKind);
    button.classList.toggle('active', isActiveSection || isActiveTool);
    updateActivityBadge(button, activitySummary[section] || 0, 'bottom-nav-badge', section);
    if (isActiveSection || isActiveTool) {
      button.setAttribute('aria-current', 'page');
    } else {
      button.removeAttribute('aria-current');
    }
  });
}

function getNavigationActivitySummary() {
  const unreadChats = getVisibleConversations().reduce((total, conversation) => total + Number(conversation.unread || 0), 0);
  const unviewedStates = getActiveStates().filter((state) => !state.viewed && !state.own).length;
  const missedCalls = appState.calls.filter((call) => {
    const status = String(call.status || '').toLowerCase();
    const preview = String(call.preview || '').toLowerCase();
    return status === 'missed' || preview.includes('perdida') || preview.includes('perdido');
  }).length;
  const pendingTools = getPendingOutboxCount();

  return {
    chats: unreadChats,
    states: unviewedStates,
    calls: missedCalls,
    tools: pendingTools
  };
}

function updateActivityBadge(container, count = 0, badgeClass = '', section = '') {
  if (!container || !badgeClass) return;
  const normalizedCount = Math.max(0, Number(count || 0));
  const baseLabel = container.dataset.baseAriaLabel || container.getAttribute('aria-label') || container.textContent.trim();
  container.dataset.baseAriaLabel = baseLabel;
  container.classList.toggle('has-activity', normalizedCount > 0);

  let badge = container.querySelector(`.${badgeClass}`);
  if (!badge) {
    badge = document.createElement('span');
    badge.className = badgeClass;
    badge.setAttribute('aria-hidden', 'true');
    container.appendChild(badge);
  }

  if (!normalizedCount) {
    badge.hidden = true;
    badge.textContent = '';
    container.setAttribute('aria-label', baseLabel);
    return;
  }

  const formattedCount = formatBadgeCount(normalizedCount);
  badge.hidden = false;
  badge.textContent = formattedCount;
  container.setAttribute('aria-label', `${baseLabel}. ${formattedCount} ${getActivityDescription(section, normalizedCount)}.`);
}

function formatBadgeCount(count = 0) {
  const normalizedCount = Math.max(0, Number(count || 0));
  return normalizedCount > 99 ? '99+' : String(normalizedCount);
}

function getActivityDescription(section = '', count = 0) {
  const plural = Number(count || 0) === 1 ? '' : 's';

  if (section === 'states') return `estado${plural} sin ver`;
  if (section === 'calls') return `llamada${plural} perdida${plural}`;
  if (section === 'tools') return `sincronización${plural === '' ? '' : 'es'} pendiente${plural}`;
  return `mensaje${plural} sin leer`;
}

function selectSection(section) {
  if (!['chats', 'states', 'calls', 'tools'].includes(section)) return;
  closeTransientPanels();
  if (section !== 'chats') closeChatSelectionMode({ render: false });
  setMobileSearchVisible(false);
  const sectionChanged = activeSection !== section;
  if (sectionChanged) {
    stopTypingNow();
    if (searchInput) searchInput.value = '';
  }
  activeSection = section;
  if (section !== 'chats') activeChatListGroup = 'main';
  chatView.classList.remove('chat-open');
  renderCurrentSection();
}

function renderCurrentSection() {
  pruneExpiredStates();
  renderNavigationState();

  if (activeSection === 'states') {
    closeTransientPanels();
    renderStatesList();
    renderStatusPanel(getActiveState());
    setComposerEnabled(false);
    applyListScrollSemantics(chatView);
    return;
  }

  statusPanel.hidden = true;
  messagesContainer.hidden = false;
  messageForm.hidden = false;

  if (activeSection === 'calls') {
    closeTransientPanels();
    renderCallsList();
    setComposerEnabled(false);
    renderCallsEmptyState();
    applyListScrollSemantics(chatView);
    return;
  }

  if (activeSection === 'tools') {
    closeTransientPanels();
    renderToolsList();
    setComposerEnabled(false);
    renderToolsPanel();
    applyListScrollSemantics(chatView);
    return;
  }

  renderChatList(searchInput.value);
  renderConversation();
  applyListScrollSemantics(chatView);
}

async function startConversationFromSearch(email = '') {
  const normalizedEmail = normalizeStorageIdentity(email);
  if (!isValidEmailAddress(normalizedEmail)) {
    openNewChatModal();
    return;
  }

  await openOrCreateContactConversation({ email: normalizedEmail }, { closeModal: false, clearSearch: true, source: 'search' });
}


function getMessagePreviewText(message = null, emptyText = 'Sin mensajes todavía') {
  if (!message) return emptyText;
  const directText = String(message.text || message.body || message.caption || message.mediaCaption || '').trim();
  if (directText) return directText;

  const mediaKind = getMessageMediaKind(message);
  const mediaName = String(message.mediaName || message.attachmentName || message.filename || '').trim();
  if (mediaKind === 'image') return mediaName ? `Imagen · ${mediaName}` : 'Imagen';
  if (mediaKind === 'video') return mediaName ? `Video · ${mediaName}` : 'Video';
  if (mediaKind === 'audio') return mediaName ? `Audio · ${mediaName}` : 'Audio';
  if (mediaKind === 'file') return mediaName ? `Archivo · ${mediaName}` : 'Archivo adjunto';

  return mediaName || emptyText;
}

function renderChatList(filter = '') {
  const normalizedFilter = normalizeUiSearchText(filter);
  const archivedListOpen = isArchivedChatListOpen();
  const sourceConversations = getCurrentChatListConversations();
  const filteredConversations = sourceConversations.filter((conversation) => {
    const participants = Array.isArray(conversation.participants) ? conversation.participants : [];
    const participantSearchValues = participants.flatMap((participant) => [
      participant.name,
      participant.displayName,
      participant.alias,
      participant.email,
      participant.userEmail,
      participant.contactEmail
    ]);
    const lastMessage = conversation.messages.at(-1) || {};

    return [
      conversation.name,
      conversation.displayName,
      conversation.alias,
      conversation.email,
      conversation.contactEmail,
      conversation.userEmail,
      conversation.customListName,
      lastMessage.text,
      lastMessage.attachmentName,
      lastMessage.mediaName,
      ...participantSearchValues
    ]
      .filter(Boolean)
      .some((value) => valueMatchesUiSearch(value, normalizedFilter));
  });

  chatList.innerHTML = '';

  if (archivedListOpen) {
    chatList.appendChild(createArchivedChatListHeader());
  } else if (!normalizedFilter && getArchivedConversations().length) {
    chatList.appendChild(createArchivedChatsShortcut());
  }

  if (!filteredConversations.length) {
    const searchTerm = filter.trim();
    const canCreateFromEmail = Boolean(searchTerm && isValidEmailAddress(searchTerm));
    const archivedHint = !archivedListOpen && getArchivedConversations().length ? 'También puedes revisar Archivados si buscas una conversación guardada.' : '';
    const emptyTitle = searchTerm ? 'Sin resultados' : (archivedListOpen ? 'No hay chats archivados' : 'No hay conversaciones activas');
    const emptyCopy = searchTerm
      ? `No hay coincidencias para “${escapeHTML(searchTerm)}”. ${archivedHint}`.trim()
      : (archivedListOpen
        ? 'Los chats que archives aparecerán aquí con la misma estructura de la lista principal.'
        : (getArchivedConversations().length ? 'Revisa Archivados o usa el botón + para iniciar un chat por correo electrónico.' : 'Usa el botón + para crear un contacto por correo electrónico.'));
    chatList.insertAdjacentHTML('beforeend', `
      <div class="empty-state list-empty">
        <strong>${emptyTitle}</strong>
        <span>${emptyCopy}</span>
        ${canCreateFromEmail ? `<button class="primary-button inline-empty-action" type="button" data-create-chat-from-search="${escapeHTML(normalizeStorageIdentity(searchTerm))}">Crear contacto con ${escapeHTML(normalizeStorageIdentity(searchTerm))}</button>` : ''}
        ${searchTerm && !canCreateFromEmail ? '<button class="secondary-button inline-empty-action" type="button" data-open-new-chat-from-search>Crear contacto por correo</button>' : ''}
      </div>
    `);
    return;
  }

  filteredConversations.forEach((conversation) => {
    const lastMessage = conversation.messages.at(-1);
    const button = document.createElement('button');
    const isSelected = chatSelectionState.active && chatSelectionState.selectedIds.has(String(conversation.id));
    button.className = `chat-item ${conversation.id === activeConversationId ? 'active' : ''} ${conversation.pinned ? 'pinned' : ''} ${isSelected ? 'selected' : ''}`;
    button.type = 'button';
    button.dataset.conversationId = conversation.id;
    button.setAttribute('aria-label', chatSelectionState.active ? `Seleccionar conversación con ${conversation.name}` : `Abrir conversación con ${conversation.name}`);
    button.setAttribute('aria-pressed', isSelected ? 'true' : 'false');

    const avatar = createAvatarElement(conversation);
    attachConversationProfilePreview(avatar, conversation);
    const content = document.createElement('div');
    content.className = 'chat-item-content';
    content.innerHTML = `
      <p class="chat-item-name">${escapeHTML(conversation.name)}</p>
      <p class="chat-item-preview">${escapeHTML(getMessagePreviewText(lastMessage))}</p>
    `;

    const meta = document.createElement('span');
    meta.className = 'chat-item-time';
    meta.innerHTML = `${lastMessage ? `<span>${escapeHTML(lastMessage.time)}</span>` : ''}${conversation.pinned ? '<span class="pinned-badge" aria-label="Chat fijado" title="Chat fijado">📌</span>' : ''}${conversation.muted ? '<span class="pinned-badge" aria-label="Chat silenciado" title="Chat silenciado">🔕</span>' : ''}${conversation.favorite ? '<span class="pinned-badge" aria-label="Chat favorito" title="Chat favorito">⭐</span>' : ''}${conversation.customListName ? '<span class="pinned-badge" aria-label="Chat en lista" title="Chat en lista">☰</span>' : ''}${conversation.restricted ? '<span class="pinned-badge" aria-label="Chat restringido" title="Chat restringido">⛔</span>' : ''}${conversation.unread ? `<strong class="unread-badge">${conversation.unread}</strong>` : ''}`;

    button.append(avatar, content, meta);
    button.addEventListener('click', (event) => {
      if (button.dataset.longPressHandled === '1') {
        button.dataset.longPressHandled = '0';
        event.preventDefault();
        return;
      }

      if (chatSelectionState.active) {
        event.preventDefault();
        toggleChatSelection(conversation);
        return;
      }

      closeTransientPanels();
      if (activeConversationId !== conversation.id) stopTypingNow();
      activeConversationId = conversation.id;
      markConversationRead(conversation);
      setMobileSearchVisible(false);
      chatView.classList.add('chat-open');
      persistState();
      renderChatList(searchInput.value);
      renderConversation();
      sendStremeEvent({ type: 'chat.opened', chatId: conversation.id });
      hydrateConversationMessages(conversation.id);
    });
    attachChatItemLongPress(button, conversation);

    chatList.appendChild(button);
  });

  refreshChatSelectionToolbar();
}

function createArchivedChatsShortcut() {
  const archivedCount = getArchivedConversations().length;
  const archivedUnread = getArchivedConversations().reduce((total, conversation) => total + Number(conversation.unread || 0), 0);
  const button = document.createElement('button');
  button.className = 'archive-shortcut';
  button.type = 'button';
  button.setAttribute('aria-label', 'Abrir lista de conversaciones archivadas');
  button.innerHTML = `
    <span class="archive-shortcut-icon" aria-hidden="true">▣</span>
    <span class="archive-shortcut-label">Archivados</span>
    <span class="archive-shortcut-count">${archivedUnread || archivedCount}</span>
  `;
  button.addEventListener('click', openArchivedChatsList);
  return button;
}

function createArchivedChatListHeader() {
  const archivedCount = getArchivedConversations().length;
  const header = document.createElement('div');
  header.className = 'archive-list-header';
  header.innerHTML = `
    <button class="archive-list-back" type="button" aria-label="Volver a chats principales">‹</button>
    <span class="archive-list-title">Archivados</span>
    <small>${archivedCount} ${archivedCount === 1 ? 'chat' : 'chats'}</small>
  `;
  header.querySelector('.archive-list-back')?.addEventListener('click', closeArchivedChatsList);
  return header;
}

function openArchivedChatsList() {
  closeTransientPanels();
  closeModal();
  closeChatSelectionMode({ render: false });
  setActiveChatListGroup('archived');
  activeSection = 'chats';
  if (searchInput) searchInput.value = '';
  chatView.classList.remove('chat-open');
  renderCurrentSection();
}

function closeArchivedChatsList() {
  setActiveChatListGroup('main');
  if (searchInput) searchInput.value = '';
  closeChatSelectionMode({ render: false });
  renderCurrentSection();
}

function renderStatesList() {
  const normalizedFilter = normalizeUiSearchText(searchInput.value);
  const states = getActiveStates().filter((state) => {
    return [state.name, state.preview, getStateExpiryLabel(state), state.mediaSyncStatus].some((value) => valueMatchesUiSearch(value, normalizedFilter));
  });
  chatList.innerHTML = '';

  const statusHeading = document.createElement('div');
  statusHeading.className = 'section-list-heading states-list-heading';
  statusHeading.textContent = 'Estados';
  chatList.appendChild(statusHeading);

  const createButton = document.createElement('button');
  createButton.className = 'state-item action-item';
  createButton.type = 'button';
  createButton.innerHTML = `
    <div class="state-avatar state-add-avatar" aria-hidden="true">＋</div>
    <div>
      <p class="state-name">Añadir estado</p>
      <p class="state-preview">Desaparece después de 24 horas.</p>
    </div>
    <span class="chat-item-time">Nuevo</span>
  `;
  createButton.addEventListener('click', openCreateStatusModal);
  chatList.appendChild(createButton);

  const promoteButton = document.createElement('button');
  promoteButton.className = 'state-promo-button';
  promoteButton.type = 'button';
  promoteButton.innerHTML = '<span aria-hidden="true">📣</span><strong>Promocionar tu estado</strong>';
  promoteButton.addEventListener('click', openPromoteStatusModal);
  chatList.appendChild(promoteButton);

  const recentHeading = document.createElement('div');
  recentHeading.className = 'section-list-heading states-recent-heading';
  recentHeading.textContent = 'Recientes';
  chatList.appendChild(recentHeading);

  if (!states.length) {
    const empty = document.createElement('div');
    empty.className = 'empty-state list-empty';
    empty.innerHTML = '<strong>Sin estados</strong>No hay estados que coincidan con la búsqueda.';
    chatList.appendChild(empty);
    return;
  }

  states.forEach((state) => {
    const button = document.createElement('button');
    button.className = `state-item ${state.id === activeStateId ? 'active' : ''}`;
    button.type = 'button';
    const avatar = createAvatarElement(state, `state-avatar ${state.viewed ? 'viewed' : ''}`);
    const content = document.createElement('div');
    content.innerHTML = `
      <p class="state-name">${escapeHTML(state.name)}</p>
      <p class="state-preview">${escapeHTML(state.preview)}</p>
    `;
    const meta = document.createElement('span');
    meta.className = 'chat-item-time';
    meta.textContent = getStateExpiryLabel(state);
    button.append(avatar, content, meta);
    button.addEventListener('click', () => {
      activeStateId = state.id;
      renderStatesList();
      renderStatusPanel(state);
      setMobileSearchVisible(false);
      chatView.classList.add('chat-open');
    });
    chatList.appendChild(button);
  });
}

function renderCallsList() {
  const normalizedFilter = normalizeUiSearchText(searchInput.value);
  const calls = appState.calls.filter((call) => {
    return [call.name, call.preview, call.type, call.status].some((value) => valueMatchesUiSearch(value, normalizedFilter));
  });
  chatList.innerHTML = '';

  chatList.appendChild(createCallsActionHub());

  const recentHeading = document.createElement('div');
  recentHeading.className = 'section-list-heading';
  recentHeading.textContent = 'Recientes';
  chatList.appendChild(recentHeading);

  if (!calls.length) {
    const empty = document.createElement('div');
    empty.className = 'empty-state list-empty';
    empty.innerHTML = `
      <strong>Sin llamadas</strong>
      Usa Llamar, Programar o Teclado para crear tu primer registro de llamadas por correo.
    `;
    chatList.appendChild(empty);
    return;
  }

  calls.forEach((call) => {
    const button = document.createElement('button');
    button.className = `call-item ${call.status === 'scheduled' ? 'scheduled-call' : ''}`;
    button.type = 'button';
    const avatar = createAvatarElement(call);
    const content = document.createElement('div');
    content.innerHTML = `
      <p class="call-name">${escapeHTML(call.name)}</p>
      <p class="call-preview">${escapeHTML(call.preview)}</p>
    `;
    const action = document.createElement('span');
    action.className = 'call-action';
    action.textContent = call.status === 'scheduled' ? 'Programada' : (call.type === 'video' ? 'Video' : 'Voz');
    button.append(avatar, content, action);
    button.addEventListener('click', () => openCallDetailModal(call));
    chatList.appendChild(button);
  });
}

function createCallsActionHub() {
  const hub = document.createElement('section');
  hub.className = 'calls-action-hub';
  hub.setAttribute('aria-label', 'Acciones rápidas de llamadas');

  const actionGrid = document.createElement('div');
  actionGrid.className = 'call-action-grid';
  [
    { action: 'start', icon: '☎', label: 'Llamar' },
    { action: 'schedule', icon: '▦', label: 'Programar' },
    { action: 'keypad', icon: '⌗', label: 'Teclado' }
  ].forEach((item) => {
    const button = document.createElement('button');
    button.className = 'call-hub-button';
    button.type = 'button';
    button.dataset.callAction = item.action;
    button.innerHTML = `<span aria-hidden="true">${escapeHTML(item.icon)}</span><strong>${escapeHTML(item.label)}</strong>`;
    actionGrid.appendChild(button);
  });

  actionGrid.addEventListener('click', (event) => {
    const button = event.target.closest('[data-call-action]');
    if (!button) return;
    if (button.dataset.callAction === 'start') openCallStarterModal();
    if (button.dataset.callAction === 'schedule') openScheduleCallModal();
    if (button.dataset.callAction === 'keypad') openCallKeypadModal();
  });

  hub.appendChild(actionGrid);

  const quickContacts = getCallShortcutContacts();
  if (quickContacts.length) {
    const rail = document.createElement('div');
    rail.className = 'call-shortcut-rail';
    quickContacts.forEach((conversation) => {
      const button = document.createElement('button');
      button.className = 'call-shortcut';
      button.type = 'button';
      button.setAttribute('aria-label', `Llamar a ${conversation.name}`);
      const avatar = createAvatarElement(conversation, 'chat-item-avatar');
      const label = document.createElement('span');
      label.textContent = conversation.name;
      button.append(avatar, label);
      button.addEventListener('click', () => startCall('voice', conversation));
      rail.appendChild(button);
    });
    hub.appendChild(rail);
  }

  return hub;
}

function getCallShortcutContacts() {
  const shortcuts = [];
  const seen = new Set();
  const pushConversation = (conversation) => {
    if (!conversation?.id || seen.has(conversation.id)) return;
    seen.add(conversation.id);
    shortcuts.push(conversation);
  };

  appState.calls.forEach((call) => {
    const conversation = findConversationForCall(call);
    if (conversation) pushConversation(conversation);
  });

  appState.conversations.forEach(pushConversation);
  return shortcuts.slice(0, 4);
}

function findConversationForCall(call = {}) {
  const callConversationId = String(call.conversationId || call.chatId || '').trim();
  const callEmail = normalizeStorageIdentity(call.email || call.contactEmail || call.contact?.email || '');

  return appState.conversations.find((conversation) => {
    const conversationEmail = normalizeStorageIdentity(conversation.email || conversation.contactEmail || '');
    return (callConversationId && conversation.id === callConversationId)
      || (callEmail && conversationEmail === callEmail)
      || (call.name && conversation.name === call.name);
  }) || null;
}


function getStatePreviewText(state = {}) {
  const basePreview = String(state.preview || 'Estado disponible');
  if (state.mediaKind === 'video') return `Video · ${basePreview}`;
  if (state.mediaName || state.mediaUrl || state.mediaPreviewDataUrl || state.mediaId) return `Imagen · ${basePreview}`;
  return basePreview;
}

function renderStatusMediaPickerPreview(container, file = null, previewDataUrl = '') {
  if (!container) return;
  container.innerHTML = '';
  container.classList.toggle('has-media', Boolean(file));

  if (!file) {
    container.innerHTML = '<span aria-hidden="true">▧</span><strong>Vista previa 9:16</strong><small>Opcional: agrega una imagen o video corto para que el estado se vea como una historia de 24 horas.</small>';
    return;
  }

  const mediaKind = getStatusMediaKind(file.type);
  if (previewDataUrl && mediaKind === 'image') {
    const image = document.createElement('img');
    image.alt = '';
    image.src = previewDataUrl;
    container.appendChild(image);
  } else if (previewDataUrl && mediaKind === 'video') {
    const video = document.createElement('video');
    video.src = previewDataUrl;
    video.muted = true;
    video.playsInline = true;
    video.controls = true;
    container.appendChild(video);
  } else {
    const badge = document.createElement('span');
    badge.setAttribute('aria-hidden', 'true');
    badge.textContent = mediaKind === 'video' ? '▶' : '▧';
    container.appendChild(badge);
  }

  const label = document.createElement('small');
  label.textContent = `${file.name} · ${formatFileSize(file.size)}`;
  container.appendChild(label);
}

function renderStatusHero(container, state = {}) {
  if (!container) return;
  container.innerHTML = '';
  container.classList.toggle('has-media', Boolean(state.mediaPreviewDataUrl || state.mediaUrl || state.mediaName || state.mediaId));

  const mediaSrc = state.mediaPreviewDataUrl || state.mediaUrl || '';
  const mediaKind = state.mediaKind || getStatusMediaKind(state.mediaMimeType || '');

  if (mediaSrc && mediaKind === 'image') {
    const image = document.createElement('img');
    image.alt = '';
    image.src = mediaSrc;
    image.onerror = () => renderStatusHeroFallback(container, state);
    container.appendChild(image);
    appendStatusHeroCaption(container, state);
    return;
  }

  if (mediaSrc && mediaKind === 'video') {
    const video = document.createElement('video');
    video.src = mediaSrc;
    video.muted = true;
    video.playsInline = true;
    video.controls = true;
    video.onerror = () => renderStatusHeroFallback(container, state);
    container.appendChild(video);
    appendStatusHeroCaption(container, state);
    return;
  }

  if (state.mediaName || state.mediaId) {
    renderStatusHeroFallback(container, state);
    return;
  }

  renderAvatarInPlace(container, state);
}

function renderStatusHeroFallback(container, state = {}) {
  if (!container) return;
  container.innerHTML = '';
  container.classList.add('has-media');
  const badge = document.createElement('span');
  badge.className = 'status-hero-fallback';
  badge.textContent = state.mediaKind === 'video' ? '▶' : '▧';
  const copy = document.createElement('small');
  copy.textContent = state.mediaName ? `${state.mediaName}${state.mediaSizeBytes ? ` · ${formatFileSize(state.mediaSizeBytes)}` : ''}` : 'Estado visual pendiente';
  container.append(badge, copy);
}

function appendStatusHeroCaption(container, state = {}) {
  const caption = document.createElement('small');
  caption.className = 'status-hero-caption';
  caption.textContent = state.mediaName || getStatePreviewText(state);
  container.appendChild(caption);
}

function getStatusMediaKind(mimeType = '') {
  const normalizedMime = String(mimeType || '').toLowerCase();
  if (normalizedMime.startsWith('video/')) return 'video';
  return 'image';
}

function formatFileSize(sizeBytes = 0) {
  const size = Number(sizeBytes || 0);
  if (!size) return '0 KB';
  if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('No se pudo leer la vista previa del archivo.'));
    reader.readAsDataURL(file);
  });
}

async function readStatusMediaPreview(file) {
  if (!file || file.size > CHATER_CONFIG.localStatusPreviewMaxBytes) return '';
  if (!/^image\//i.test(file.type || '') && !/^video\//i.test(file.type || '')) return '';
  return readFileAsDataUrl(file);
}

function shouldUseR2xTemporaryImageApi(file) {
  if (!CHATER_CONFIG.backendBaseUrl || !CHATER_CONFIG.enableR2xImageUploads || !file) return false;
  const mimeType = String(file.type || '').toLowerCase();
  const name = String(file.name || '').toLowerCase();
  if (!mimeType.startsWith('image/')) return false;
  if (mimeType === 'image/svg+xml' || /\.svg$/i.test(name)) return false;
  if (mimeType === 'image/gif' || /\.gif$/i.test(name)) return false;
  return typeof document !== 'undefined' && typeof HTMLCanvasElement !== 'undefined';
}

const R2X_IMAGE_POLICY_CACHE_TTL_MS = 10 * 60 * 1000;
const r2xImagePolicyCache = new Map();
const r2xImagePolicyInFlight = new Map();

function normalizeR2xImageContext(context = 'chat-message') {
  const normalized = String(context || 'chat-message').trim();
  return normalized || 'chat-message';
}

function getDefaultR2xImagePolicy(context = 'chat-message') {
  return {
    context: normalizeR2xImageContext(context),
    enabled: true,
    maxBytes: clampImageUploadMaxBytes(CHATER_CONFIG.r2xImageMaxBytes),
    maxDimension: 1600,
    mimeType: 'image/webp',
    extension: '.webp',
    source: 'local-fallback'
  };
}

function parsePositivePolicyNumber(...values) {
  for (const value of values) {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed > 0) return Math.round(parsed);
  }
  return 0;
}

function parseR2xPolicyAvailability(...values) {
  const availableValues = values.filter((value) => value !== undefined && value !== null && value !== '');
  if (!availableValues.length) return true;
  return !availableValues.some((value) => {
    if (value === false || value === 0) return true;
    const normalized = String(value).trim().toLowerCase();
    return ['0', 'false', 'disabled', 'inactivo', 'inactive', 'unavailable', 'no-disponible', 'not-configured'].includes(normalized);
  });
}

function normalizeR2xImagePolicyPayload(payload = {}, context = 'chat-message') {
  const normalizedContext = normalizeR2xImageContext(context);
  const defaultPolicy = getDefaultR2xImagePolicy(normalizedContext);
  if (!payload || typeof payload !== 'object') return defaultPolicy;

  const data = payload.data && typeof payload.data === 'object' ? payload.data : {};
  const policy = data.policy || data.politica || payload.policy || payload.politica || {};
  const contexts = policy.contexts || policy.contextos || data.contexts || data.contextos || {};
  const contextPolicy = contexts[normalizedContext] || contexts[normalizedContext.replace(/-/g, '_')] || contexts.default || {};
  const r2Config = data.r2 || data.cloudflareR2 || data.storage || payload.r2 || payload.cloudflareR2 || {};

  const maxByteCandidates = [
    contextPolicy.maxBytes,
    contextPolicy.maxSizeBytes,
    contextPolicy.maxFileSizeBytes,
    contextPolicy.sizeBytes,
    policy.maxBytes,
    policy.maxSizeBytes,
    policy.maxFileSizeBytes,
    policy.globalMaxBytes,
    policy.maxGlobalBytes,
    data.maxBytes,
    data.maxSizeBytes,
    payload.maxBytes,
    defaultPolicy.maxBytes
  ].map(Number).filter((value) => Number.isFinite(value) && value > 0);
  const maxBytes = clampImageUploadMaxBytes(maxByteCandidates.length ? Math.round(Math.min(...maxByteCandidates)) : defaultPolicy.maxBytes);

  const maxDimension = parsePositivePolicyNumber(
    contextPolicy.maxDimension,
    contextPolicy.maxWidth,
    contextPolicy.width,
    policy.maxDimension,
    policy.maxWidth,
    data.maxDimension,
    defaultPolicy.maxDimension
  ) || defaultPolicy.maxDimension;

  return {
    context: normalizedContext,
    enabled: parseR2xPolicyAvailability(
      contextPolicy.enabled,
      contextPolicy.available,
      policy.enabled,
      policy.available,
      data.enabled,
      data.available,
      data.configured,
      data.r2Configured,
      r2Config.enabled,
      r2Config.available,
      r2Config.configured
    ),
    maxBytes,
    maxDimension,
    mimeType: contextPolicy.mimeType || policy.mimeType || data.mimeType || defaultPolicy.mimeType,
    extension: contextPolicy.extension || policy.extension || data.extension || defaultPolicy.extension,
    source: 'memoriaBACKEND'
  };
}

function createR2xPolicyUnavailableError(message = 'ImagenesCloudflareR2x no está disponible para este contexto.', cause = null) {
  const error = new Error(message);
  error.code = 'R2X_POLICY_UNAVAILABLE';
  if (cause) error.cause = cause;
  return error;
}

function isR2xPolicyUnavailableError(error) {
  return String(error?.code || '').toUpperCase() === 'R2X_POLICY_UNAVAILABLE';
}

async function resolveChatImageCompressionPolicy(context = 'chat-message') {
  const normalizedContext = normalizeR2xImageContext(context);
  const fallbackPolicy = getDefaultR2xImagePolicy(normalizedContext);

  if (!CHATER_CONFIG.backendBaseUrl) return fallbackPolicy;

  try {
    const policy = await loadR2xImagePolicy(normalizedContext);
    if (!policy?.enabled) return fallbackPolicy;
    return {
      ...fallbackPolicy,
      ...policy,
      maxBytes: clampImageUploadMaxBytes(Math.min(policy.maxBytes || fallbackPolicy.maxBytes, CHATER_CONFIG.r2xImageMaxBytes)),
      maxDimension: clampImageUploadMaxDimension(parsePositivePolicyNumber(policy.maxDimension, fallbackPolicy.maxDimension), fallbackPolicy.maxDimension),
      source: policy.source || 'memoriaBACKEND'
    };
  } catch (error) {
    if (isBackendAuthError(error)) throw error;
    console.warn('No se pudo leer la política de imagen antes de comprimir; se usa política local estricta de 200 KB.', error);
    return fallbackPolicy;
  }
}

function isRecoverableR2xBackendError(error = {}) {
  const status = Number(error.status || error.responseStatus || error.payload?.statusCode || error.payload?.metadata?.statusCode || 0);
  const code = String(error.code || error.payload?.err || error.payload?.code || error.payload?.error?.code || error.payload?.metadata?.err || '').trim().toUpperCase();
  const message = String(error.message || error.payload?.message || error.payload?.error?.message || '').trim().toUpperCase();

  if ([404, 405, 410, 501, 503].includes(status)) return true;
  if (code && /(R2X|IMAGENES_R2X|IMAGE_R2X|R2|STORAGE|ROUTE|ENDPOINT).*(NOT_FOUND|UNAVAILABLE|NOT_CONFIGURED|DISABLED|MISSING)/.test(code)) return true;
  if (code && /(NOT_FOUND|ROUTE_NOT_FOUND|ENDPOINT_NOT_FOUND|NOT_IMPLEMENTED|STORAGE_NOT_CONFIGURED|R2_NOT_CONFIGURED)/.test(code)) return true;
  if (message && /(IMAGENES-R2X|IMAGENES R2X|IMAGENES_R2X|R2X|CLOUDFLARE R2).*(NO EST|NOT FOUND|UNAVAILABLE|NO DISPONIBLE|NOT CONFIGURED|SIN CONFIGURAR|DISABLED|DESACTIV)/.test(message)) return true;
  return false;
}

async function loadR2xImagePolicy(context = 'chat-message', options = {}) {
  const normalizedContext = normalizeR2xImageContext(context);
  const cachedPolicy = r2xImagePolicyCache.get(normalizedContext);
  const cacheIsFresh = cachedPolicy?.checkedAt && Date.now() - cachedPolicy.checkedAt < R2X_IMAGE_POLICY_CACHE_TTL_MS;
  if (!options.force && cacheIsFresh) return cachedPolicy.policy;
  if (!options.force && r2xImagePolicyInFlight.has(normalizedContext)) return r2xImagePolicyInFlight.get(normalizedContext);

  const inFlight = apiClient.getR2xImageConfig(normalizedContext)
    .then((payload) => {
      const policy = normalizeR2xImagePolicyPayload(payload, normalizedContext);
      r2xImagePolicyCache.set(normalizedContext, { policy, checkedAt: Date.now(), error: '' });
      return policy;
    })
    .catch((error) => {
      if (isBackendAuthError(error)) throw error;
      const fallbackPolicy = {
        ...getDefaultR2xImagePolicy(normalizedContext),
        enabled: false,
        source: 'memoriaBACKEND-unavailable',
        error: error?.message || 'config no disponible'
      };
      r2xImagePolicyCache.set(normalizedContext, { policy: fallbackPolicy, checkedAt: Date.now(), error: fallbackPolicy.error });
      console.warn('No se pudo leer /api/v1/imagenes-r2x/config; ChatER usará MEDIAfirmadaX como respaldo canónico para no bloquear adjuntos.', error);
      return fallbackPolicy;
    })
    .finally(() => {
      r2xImagePolicyInFlight.delete(normalizedContext);
    });

  r2xImagePolicyInFlight.set(normalizedContext, inFlight);
  return inFlight;
}

function buildTemporaryWebpFilename(fileName = 'imagen.webp') {
  const cleanName = String(fileName || 'imagen').split(/[\/]/).pop().replace(/\.[^.]+$/, '').replace(/[^a-z0-9._-]+/gi, '-').replace(/^-+|-+$/g, '');
  return `${cleanName || 'imagen'}.webp`;
}

function canvasToWebpBlob(canvas, quality) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timeout = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error('El navegador no completó la conversión WebP a tiempo. La imagen no se enviará sin garantía de peso.'));
    }, 12000);

    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      callback(value);
    };

    try {
      canvas.toBlob(async (blob) => {
        if (!blob) {
          finish(reject, new Error('No se pudo convertir la imagen a WebP.'));
          return;
        }
        try {
          await assertVerifiedWebpBlob(blob);
          finish(resolve, blob);
        } catch (error) {
          finish(reject, error);
        }
      }, 'image/webp', quality);
    } catch (error) {
      finish(reject, new Error('El navegador bloqueó la conversión WebP segura. La imagen no se enviará sin cumplir el límite de 200 KB.'));
    }
  });
}

async function loadImageElementForCanvasFallback(file) {
  const objectUrl = URL.createObjectURL(file);
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('El navegador no pudo leer la imagen seleccionada.'));
    };
    image.src = objectUrl;
  });
}

async function loadImageSourceForCanvas(file) {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch (errorWithOrientation) {
      try {
        return await createImageBitmap(file);
      } catch (errorWithoutOrientation) {
        console.warn('createImageBitmap no pudo preparar la imagen; se usa Image como respaldo compatible para conservar el límite WebP.', errorWithoutOrientation || errorWithOrientation);
      }
    }
  }

  return loadImageElementForCanvasFallback(file);
}

const FALLBACK_PROGRESSIVE_DOWNSCALE_RATIO = 0.5;
const FALLBACK_PROGRESSIVE_DOWNSCALE_TRIGGER_RATIO = 1.85;

function getCanvasImageSourceSize(source, fallbackWidth = 1, fallbackHeight = 1) {
  return {
    width: Math.max(1, Math.round(Number(source?.width || source?.naturalWidth || fallbackWidth || 1))),
    height: Math.max(1, Math.round(Number(source?.height || source?.naturalHeight || fallbackHeight || 1)))
  };
}

function createCanvasDownscaleScratch(width, height) {
  const scratch = document.createElement('canvas');
  scratch.width = Math.max(1, Math.round(width));
  scratch.height = Math.max(1, Math.round(height));
  const scratchContext = scratch.getContext('2d', { alpha: true, desynchronized: true }) || scratch.getContext('2d', { alpha: true });
  if (!scratchContext) throw new Error('El navegador no pudo preparar una etapa intermedia de compresión.');
  scratchContext.imageSmoothingEnabled = true;
  scratchContext.imageSmoothingQuality = 'high';
  return { canvas: scratch, context: scratchContext };
}

function releaseCanvasDownscaleScratch(canvas) {
  try {
    if (canvas?.getContext) {
      canvas.width = 1;
      canvas.height = 1;
    }
  } catch (error) {
    // Liberación defensiva sin bloquear el envío de la imagen.
  }
}

function drawImageSourceProgressively(context, source, targetWidth, targetHeight, sourceWidth, sourceHeight) {
  let currentSource = source;
  let currentWidth = Math.max(1, Math.round(sourceWidth || targetWidth));
  let currentHeight = Math.max(1, Math.round(sourceHeight || targetHeight));
  const scratchCanvases = [];

  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';

  try {
    while (currentWidth / targetWidth > FALLBACK_PROGRESSIVE_DOWNSCALE_TRIGGER_RATIO
      || currentHeight / targetHeight > FALLBACK_PROGRESSIVE_DOWNSCALE_TRIGGER_RATIO) {
      const nextWidth = Math.max(targetWidth, Math.round(currentWidth * FALLBACK_PROGRESSIVE_DOWNSCALE_RATIO));
      const nextHeight = Math.max(targetHeight, Math.round(currentHeight * FALLBACK_PROGRESSIVE_DOWNSCALE_RATIO));
      if (nextWidth === currentWidth && nextHeight === currentHeight) break;

      const scratch = createCanvasDownscaleScratch(nextWidth, nextHeight);
      scratch.context.drawImage(currentSource, 0, 0, currentWidth, currentHeight, 0, 0, nextWidth, nextHeight);
      scratchCanvases.push(scratch.canvas);
      currentSource = scratch.canvas;
      currentWidth = nextWidth;
      currentHeight = nextHeight;
    }

    context.drawImage(currentSource, 0, 0, currentWidth, currentHeight, 0, 0, targetWidth, targetHeight);
  } finally {
    scratchCanvases.forEach(releaseCanvasDownscaleScratch);
  }
}

async function calculateBlobSha256(blob) {
  try {
    if (!window.crypto?.subtle || !blob?.arrayBuffer) return '';
    const hashBuffer = await window.crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
    return Array.from(new Uint8Array(hashBuffer)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
  } catch (error) {
    console.warn('No se pudo calcular SHA-256 de la imagen WebP temporal.', error);
    return '';
  }
}

function readBlobHeaderBytes(blob, length = 12) {
  return new Promise((resolve, reject) => {
    const slice = blob?.slice ? blob.slice(0, length) : null;
    if (!slice) {
      reject(new Error('No se pudo verificar la firma binaria WebP.'));
      return;
    }

    if (slice.arrayBuffer) {
      slice.arrayBuffer().then((buffer) => resolve(new Uint8Array(buffer))).catch(reject);
      return;
    }

    if (typeof FileReader === 'function') {
      const reader = new FileReader();
      reader.onload = () => resolve(new Uint8Array(reader.result));
      reader.onerror = () => reject(reader.error || new Error('No se pudo leer la firma binaria WebP.'));
      reader.readAsArrayBuffer(slice);
      return;
    }

    reject(new Error('Este navegador no permite verificar la firma binaria WebP.'));
  });
}

async function isVerifiedWebpBlob(blob) {
  if (!blob || typeof blob.size !== 'number' || blob.size < 12) return false;
  if (window.ChatERImageWebpCompressorLego?.isVerifiedWebpBlob) {
    return Boolean(await window.ChatERImageWebpCompressorLego.isVerifiedWebpBlob(blob));
  }

  const bytes = await readBlobHeaderBytes(blob, 12);
  const textAt = (start, end) => Array.from(bytes.slice(start, end)).map((byte) => String.fromCharCode(byte)).join('');
  return textAt(0, 4) === 'RIFF' && textAt(8, 12) === 'WEBP';
}

async function assertVerifiedWebpBlob(blob) {
  if (blob?.type && !/^image\/webp$/i.test(blob.type)) {
    throw new Error('La imagen comprimida no está en formato WebP real.');
  }
  if (!(await isVerifiedWebpBlob(blob))) {
    throw new Error('La imagen comprimida no tiene firma binaria WebP real.');
  }
}

function shouldUseBrowserFallbackAfterLegoCompressionError(error = {}) {
  const code = String(error.code || '').trim();
  const nonFallbackCodes = new Set([
    'IMAGE_COMPRESSION_ABORTED',
    'IMAGE_COMPRESSION_INVALID_INPUT',
    'IMAGE_COMPRESSION_LIMIT_UNMET'
  ]);

  if (nonFallbackCodes.has(code)) return false;

  const message = String(error.message || '').toLowerCase();
  if (message.includes('por debajo de 200 kb') || message.includes('supera el límite de 200 kb')) return false;
  return true;
}

function assertCompressedWebpFileWithinLimit(file, maxBytes) {
  if (!file || typeof file.size !== 'number') {
    throw new Error('La compresión no produjo una imagen WebP verificable.');
  }
  if (file.size > maxBytes) {
    throw new Error(`La imagen WebP comprimida supera ${formatFileSize(maxBytes)} y no se enviará.`);
  }
  if (file.type && !/^image\/webp$/i.test(file.type)) {
    throw new Error('La imagen comprimida no está en formato WebP real.');
  }
}

async function assertR2xReadyWebpFile(file, maxBytes = CHATER_CONFIG.r2xImageMaxBytes) {
  const effectiveMaxBytes = clampImageUploadMaxBytes(Math.min(
    Number(maxBytes || CHATER_CONFIG.r2xImageMaxBytes),
    CHATER_CONFIG.r2xImageMaxBytes
  ));

  if (window.ChatERImageWebpCompressorLego?.assertReadyForUpload) {
    const result = await window.ChatERImageWebpCompressorLego.assertReadyForUpload(file, effectiveMaxBytes);
    return {
      ...(result || {}),
      validator: 'IMAGENwebpCOMPRESIONx.assertReadyForUpload',
      maxBytes: effectiveMaxBytes,
      guaranteedMaxBytes: true
    };
  }

  assertCompressedWebpFileWithinLimit(file, effectiveMaxBytes);
  await assertVerifiedWebpBlob(file);
  return {
    ok: true,
    validator: 'js/app.js defensive-fallback',
    mimeType: 'image/webp',
    maxBytes: effectiveMaxBytes,
    sizeBytes: file.size,
    guaranteedMaxBytes: true
  };
}

const FALLBACK_WEBP_VISUAL_QUALITY_FLOOR = 0.66;
const FALLBACK_WEBP_NOTICEABLE_QUALITY_FLOOR = 0.74;
const FALLBACK_WEBP_EMERGENCY_QUALITY_FLOOR = 0.52;
const FALLBACK_WEBP_MIN_LONG_SIDE_ABSOLUTE = 480;
const FALLBACK_WEBP_MIN_LONG_SIDE_RATIO = 0.18;

function getFallbackWebpQualityBand(quality = 0) {
  const normalizedQuality = Number(quality || 0);
  if (normalizedQuality >= FALLBACK_WEBP_NOTICEABLE_QUALITY_FLOOR) return 'quality-preserved';
  if (normalizedQuality >= FALLBACK_WEBP_VISUAL_QUALITY_FLOOR) return 'acceptable';
  if (normalizedQuality >= FALLBACK_WEBP_EMERGENCY_QUALITY_FLOOR) return 'emergency-visible-loss';
  return 'rejectable-visible-loss';
}

function getFallbackWebpMinimumLongSide(originalWidth = 0, originalHeight = 0, maxVisualLongSide = 1600) {
  const originalLongSide = Math.max(Number(originalWidth || 0), Number(originalHeight || 0));
  const policyLongSideCap = clampImageUploadMaxDimension(maxVisualLongSide, 1600);
  if (!originalLongSide) return Math.min(FALLBACK_WEBP_MIN_LONG_SIDE_ABSOLUTE, policyLongSideCap);
  if (originalLongSide <= FALLBACK_WEBP_MIN_LONG_SIDE_ABSOLUTE) return Math.max(1, Math.round(originalLongSide));
  return Math.min(
    Math.round(originalLongSide),
    policyLongSideCap,
    Math.max(FALLBACK_WEBP_MIN_LONG_SIDE_ABSOLUTE, Math.round(originalLongSide * FALLBACK_WEBP_MIN_LONG_SIDE_RATIO))
  );
}

function evaluateFallbackWebpVisualCandidate({ width = 0, height = 0, quality = 0, blob = null } = {}, originalWidth = 0, originalHeight = 0, maxVisualLongSide = 1600) {
  const originalLongSide = Math.max(Number(originalWidth || 0), Number(originalHeight || 0));
  const finalLongSide = Math.max(Number(width || 0), Number(height || 0));
  const normalizedQuality = Number(quality || 0);
  const policyLongSideCap = clampImageUploadMaxDimension(maxVisualLongSide, 1600);
  const minLongSide = getFallbackWebpMinimumLongSide(originalWidth, originalHeight, policyLongSideCap);
  const qualityOk = normalizedQuality >= FALLBACK_WEBP_VISUAL_QUALITY_FLOOR;
  const dimensionOk = !originalLongSide || originalLongSide <= FALLBACK_WEBP_MIN_LONG_SIDE_ABSOLUTE || finalLongSide >= minLongSide;
  return {
    ok: Boolean(blob && qualityOk && dimensionOk),
    qualityOk,
    dimensionOk,
    minQuality: FALLBACK_WEBP_VISUAL_QUALITY_FLOOR,
    minLongSide,
    finalLongSide,
    originalLongSide,
    policyLongSideCap,
    qualityBand: getFallbackWebpQualityBand(normalizedQuality),
    reason: !qualityOk ? 'quality-below-fallback-visual-floor' : (!dimensionOk ? 'dimension-below-policy-capped-fallback-visual-floor' : 'fallback-visual-floor-ok')
  };
}

function shouldContinueFallbackWebpSearchAfterVisualRejection(visualGate = {}, quality = 0, targetWidth = 0, targetHeight = 0) {
  if (!visualGate || visualGate.ok) return false;
  if (!visualGate.qualityOk && Number(quality || 0) < FALLBACK_WEBP_VISUAL_QUALITY_FLOOR) return true;
  if (!visualGate.dimensionOk) return Math.max(Number(targetWidth || 0), Number(targetHeight || 0)) > Number(visualGate.minLongSide || 0);
  return false;
}

async function convertImageFileToTemporaryWebp(file, options = {}) {
  const maxBytes = clampImageUploadMaxBytes(options.maxBytes || CHATER_CONFIG.r2xImageMaxBytes);
  const maxDimension = clampImageUploadMaxDimension(options.maxDimension, 1600);

  if (window.ChatERImageWebpCompressorLego?.compress) {
    try {
      return await window.ChatERImageWebpCompressorLego.compress(file, {
        maxBytes,
        maxDimension,
        onProgress: typeof options.onProgress === 'function' ? options.onProgress : undefined,
        signal: options.signal
      });
    } catch (error) {
      if (!shouldUseBrowserFallbackAfterLegoCompressionError(error)) throw error;
      console.warn('El bloque lego de compresión WebP no pudo finalizar por compatibilidad del navegador; se intenta respaldo compatible conservando el límite estricto.', error);
    }
  }

  const imageSource = await loadImageSourceForCanvas(file);
  const originalWidth = Number(imageSource.width || imageSource.naturalWidth || 0);
  const originalHeight = Number(imageSource.height || imageSource.naturalHeight || 0);

  if (!originalWidth || !originalHeight) {
    if (imageSource.close) imageSource.close();
    throw new Error('La imagen seleccionada no tiene dimensiones válidas.');
  }

  const initialScale = Math.min(1, maxDimension / Math.max(originalWidth, originalHeight));
  let targetWidth = Math.max(1, Math.round(originalWidth * initialScale));
  let targetHeight = Math.max(1, Math.round(originalHeight * initialScale));
  let quality = 0.82;
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d', { alpha: true });

  if (!context) {
    if (imageSource.close) imageSource.close();
    throw new Error('El navegador no pudo preparar la imagen para memoriaBACKEND.');
  }

  try {
    for (let attempt = 0; attempt < 12; attempt += 1) {
      if (typeof options.onProgress === 'function') {
        options.onProgress(Math.min(96, Math.round(8 + (attempt / 12) * 82)), 'compressing');
      }
      canvas.width = targetWidth;
      canvas.height = targetHeight;
      context.clearRect(0, 0, targetWidth, targetHeight);
      const sourceSize = getCanvasImageSourceSize(imageSource, originalWidth, originalHeight);
      drawImageSourceProgressively(context, imageSource, targetWidth, targetHeight, sourceSize.width, sourceSize.height);

      const blob = await canvasToWebpBlob(canvas, quality);
      if (blob.size <= maxBytes) {
        const visualGate = evaluateFallbackWebpVisualCandidate({ width: targetWidth, height: targetHeight, quality, blob }, originalWidth, originalHeight, maxDimension);
        if (!visualGate.ok && shouldContinueFallbackWebpSearchAfterVisualRejection(visualGate, quality, targetWidth, targetHeight)) {
          if (!visualGate.qualityOk) {
            targetWidth = Math.max(1, Math.round(targetWidth * 0.88));
            targetHeight = Math.max(1, Math.round(targetHeight * 0.88));
            quality = Math.max(FALLBACK_WEBP_VISUAL_QUALITY_FLOOR, 0.74);
          } else {
            quality = Math.max(FALLBACK_WEBP_VISUAL_QUALITY_FLOOR, quality - 0.03);
          }
          continue;
        }

        if (!visualGate.ok) {
          throw new Error('La imagen cumpliría el peso máximo, pero tendría pérdida visual notable. No se enviará automáticamente.');
        }

        const webpFile = typeof File === 'function'
          ? new File([blob], buildTemporaryWebpFilename(file.name), { type: 'image/webp', lastModified: Date.now() })
          : Object.assign(blob, { name: buildTemporaryWebpFilename(file.name) });
        assertCompressedWebpFileWithinLimit(webpFile, maxBytes);
        await assertVerifiedWebpBlob(webpFile);
        if (typeof options.onProgress === 'function') options.onProgress(100, 'compressed');
        const sha256 = await calculateBlobSha256(webpFile);
        const fallbackGuaranteeBase = window.ChatERImageWebpCompressorLego?.createCompressionGuarantee
          ? await window.ChatERImageWebpCompressorLego.createCompressionGuarantee(webpFile, maxBytes, {
            width: targetWidth,
            height: targetHeight,
            originalWidth,
            originalHeight,
            quality,
            qualityBand: getFallbackWebpQualityBand(quality),
            compressionMode: 'browser-canvas-fallback',
            targetBytes: maxBytes,
            attempts: attempt + 1,
            acceptedReason: 'fallback-canvas-visual-gate-under-limit'
          })
          : null;
        const fallbackGuarantee = {
          ...(fallbackGuaranteeBase || {}),
          ok: true,
          guaranteedMaxBytes: true,
          validator: fallbackGuaranteeBase?.validator || 'IMAGENwebpCOMPRESIONx-fallback-canvas',
          mimeType: 'image/webp',
          formatVerified: 'RIFF_WEBP',
          maxBytes,
          hardMaxBytes: fallbackGuaranteeBase?.hardMaxBytes || CHATER_CONFIG.r2xImageMaxBytes,
          targetBytes: fallbackGuaranteeBase?.targetBytes || maxBytes,
          sizeBytes: webpFile.size,
          headroomBytes: Math.max(0, maxBytes - webpFile.size),
          width: targetWidth,
          height: targetHeight,
          originalWidth,
          originalHeight,
          quality,
          qualityBand: fallbackGuaranteeBase?.qualityBand || getFallbackWebpQualityBand(quality),
          compressionMode: 'browser-canvas-fallback',
          attempts: attempt + 1,
          acceptedReason: 'fallback-canvas-visual-gate-under-limit',
          finalVisualGate: visualGate,
          weakPointResolved: 'respaldo Canvas alineado con la compuerta visual del bloque LEGO: redimensionado multipaso, RIFF/WEBP real, <= 200 KB, calidad/dimensión mínimas y compuerta visual limitada por maxDimension efectivo antes del upload'
        };
        return {
          file: webpFile,
          width: targetWidth,
          height: targetHeight,
          originalWidth,
          originalHeight,
          quality,
          maxBytes,
          sizeBytes: webpFile.size,
          sha256,
          originalFileName: file.name || '',
          originalMimeType: file.type || '',
          compressionMode: 'browser-canvas-fallback',
          qualityBand: fallbackGuarantee.qualityBand,
          guarantee: fallbackGuarantee,
          diagnostics: {
            attempts: attempt + 1,
            lastSize: webpFile.size,
            targetBytes: maxBytes,
            hardMaxBytes: maxBytes,
            finalWidth: targetWidth,
            finalHeight: targetHeight,
            finalQuality: quality,
            finalQualityBand: fallbackGuarantee.qualityBand,
            finalVisualGate: visualGate,
            visualQualityFloor: FALLBACK_WEBP_VISUAL_QUALITY_FLOOR,
            visualMinLongSide: visualGate.minLongSide,
            guaranteedMaxBytes: true,
            guarantee: fallbackGuarantee,
            weakPointResolved: fallbackGuarantee.weakPointResolved
          }
        };
      }

      if (quality > FALLBACK_WEBP_VISUAL_QUALITY_FLOOR) {
        quality = Math.max(FALLBACK_WEBP_VISUAL_QUALITY_FLOOR, quality - 0.08);
      } else {
        targetWidth = Math.max(1, Math.round(targetWidth * 0.82));
        targetHeight = Math.max(1, Math.round(targetHeight * 0.82));
        quality = 0.74;
      }
    }
  } finally {
    if (imageSource.close) imageSource.close();
  }

  throw new Error(`La imagen debe quedar en WebP y pesar máximo ${formatFileSize(maxBytes)} para subirla por memoriaBACKEND.`);
}


async function reusePreparedWebpCompressionResult(file, sourceCompression = null, options = {}) {
  if (!file || !sourceCompression || sourceCompression.file !== file) return null;
  const mimeType = String(file.type || '').toLowerCase();
  if (mimeType !== 'image/webp') return null;

  const maxBytes = clampImageUploadMaxBytes(Math.min(
    Number(options.maxBytes || CHATER_CONFIG.r2xImageMaxBytes),
    CHATER_CONFIG.r2xImageMaxBytes
  ));

  if (Number(file.size || 0) > maxBytes) return null;

  try {
    if (window.ChatERImageWebpCompressorLego?.reusePreparedWebp) {
      const reused = await window.ChatERImageWebpCompressorLego.reusePreparedWebp(file, sourceCompression, {
        maxBytes,
        maxDimension: options.maxDimension,
        targetBytes: options.targetBytes,
        signal: options.signal
      });
      if (reused?.file) {
        reused.effectivePolicy = {
          ...(sourceCompression.effectivePolicy || {}),
          ...(options.policy && typeof options.policy === 'object' ? options.policy : {}),
          maxBytes,
          maxDimension: clampImageUploadMaxDimension(options.maxDimension, getDefaultR2xImagePolicy('chat-message').maxDimension),
          reusedPreparedWebp: true,
          reuseReason: options.reason || 'prepared-webp-already-validated'
        };
        return reused;
      }
    }

    const readyGate = await assertR2xReadyWebpFile(file, maxBytes);
    const sha = sourceCompression.sha256 || await calculateBlobSha256(file);
    const guarantee = {
      ...(sourceCompression.guarantee && typeof sourceCompression.guarantee === 'object' ? sourceCompression.guarantee : {}),
      ...readyGate,
      validator: readyGate.validator || 'IMAGENwebpCOMPRESIONx.assertReadyForUpload',
      guaranteedMaxBytes: true,
      maxBytes,
      sizeBytes: file.size,
      headroomBytes: Math.max(0, maxBytes - file.size),
      reusedPreparedWebp: true,
      acceptedReason: 'reused-already-validated-webp-for-effective-policy',
      weakPointResolved: 'reutilización defensiva del WebP ya validado sin segunda compresión antes del upload'
    };

    return {
      ...sourceCompression,
      file,
      maxBytes,
      sizeBytes: file.size,
      sha256: sha,
      guarantee,
      diagnostics: {
        ...(sourceCompression.diagnostics && typeof sourceCompression.diagnostics === 'object' ? sourceCompression.diagnostics : {}),
        reusedPreparedWebp: true,
        hardMaxBytes: maxBytes,
        finalHeadroomBytes: Math.max(0, maxBytes - file.size),
        acceptedReason: 'reused-already-validated-webp-for-effective-policy',
        weakPointResolved: 'la app reutiliza el archivo WebP ya comprimido y solo revalida bytes/formato contra la política efectiva; la compuerta visual de respaldo respeta maxDimension efectivo'
      },
      effectivePolicy: {
        ...(sourceCompression.effectivePolicy || {}),
        ...(options.policy && typeof options.policy === 'object' ? options.policy : {}),
        maxBytes,
        maxDimension: clampImageUploadMaxDimension(options.maxDimension, getDefaultR2xImagePolicy('chat-message').maxDimension),
        reusedPreparedWebp: true,
        reuseReason: options.reason || 'prepared-webp-already-validated'
      }
    };
  } catch (error) {
    if (Number(file.size || 0) > maxBytes) return null;
    throw error;
  }
}

function normalizeR2xImageUploadPreparation(payload = {}) {
  const data = payload?.data && typeof payload.data === 'object' ? payload.data : {};
  const image = extractNestedObject(payload, ['image', 'imagen']) || {};
  const upload = extractNestedObject(payload, ['upload', 'subida', 'intent', 'intencion']) || {};
  const headers = upload.headers || upload.cabeceras || data.headers || {};
  const fields = upload.fields || data.fields || {};
  const uploadUrl = upload.uploadUrl || upload.url || upload.signedUrl || data.uploadUrl || data.url || data.signedUrl || '';
  const method = String(upload.method || data.method || (Object.keys(fields).length ? 'POST' : 'PUT')).toUpperCase();
  const imageId = String(
    image.imageId || image.id || upload.imageId || upload.id || data.imageId || data.id || payload.imageId || payload.id || ''
  ).trim();

  return {
    uploadUrl,
    method,
    headers: headers && typeof headers === 'object' ? headers : {},
    fields: fields && typeof fields === 'object' ? fields : {},
    mediaId: imageId,
    imageId,
    publicUrl: image.publicUrl || image.readUrl || upload.publicUrl || upload.readUrl || data.publicUrl || data.readUrl || '',
    provider: 'imagenes-r2x',
    r2xConfirmed: false
  };
}

function normalizeR2xImageReadPayload(payload = {}, fallback = {}) {
  const data = payload?.data && typeof payload.data === 'object' ? payload.data : {};
  const image = extractNestedObject(payload, ['image', 'imagen']) || {};
  const read = extractNestedObject(payload, ['read', 'download', 'descarga', 'urlDescarga']) || {};
  const imageId = String(
    image.imageId || image.id || data.imageId || data.id || fallback.imageId || fallback.mediaId || ''
  ).trim();

  return {
    ...fallback,
    mediaId: imageId || fallback.mediaId || '',
    imageId: imageId || fallback.imageId || '',
    publicUrl: read.url || read.publicUrl || read.signedUrl || image.publicUrl || image.readUrl || data.publicUrl || data.readUrl || fallback.publicUrl || '',
    provider: 'imagenes-r2x',
    r2xConfirmed: true
  };
}

async function prepareR2xTemporaryImageForBackend(file, options = {}) {
  const clientMutationId = options.clientMutationId || generateClientMutationId();
  const context = normalizeR2xImageContext(options.context || 'chat-message');
  const policy = await loadR2xImagePolicy(context);
  if (!policy.enabled) {
    throw createR2xPolicyUnavailableError('ImagenesCloudflareR2x no está disponible en memoriaBACKEND para este contexto. Se debe usar MEDIAfirmadaX como respaldo.');
  }

  const effectivePolicyMaxBytes = clampImageUploadMaxBytes(Math.min(policy.maxBytes, CHATER_CONFIG.r2xImageMaxBytes));
  let converted = await reusePreparedWebpCompressionResult(file, options.precompressedImage, {
    maxBytes: effectivePolicyMaxBytes,
    maxDimension: policy.maxDimension,
    policy,
    reason: 'imagenes-r2x-preupload'
  });

  if (converted) {
    if (typeof options.onProgress === 'function') options.onProgress(18, 'compressed-reused');
  } else {
    converted = await convertImageFileToTemporaryWebp(file, {
      maxBytes: effectivePolicyMaxBytes,
      maxDimension: policy.maxDimension,
      onProgress: (progress, stage) => {
        if (typeof options.onProgress !== 'function') return;
        const scaledProgress = Math.max(8, Math.min(18, Math.round(8 + (Number(progress || 0) / 100) * 10)));
        options.onProgress(scaledProgress, stage || 'compressing');
      }
    });
  }

  const uploadPolicy = await assertR2xReadyWebpFile(converted.file, effectivePolicyMaxBytes);
  if (typeof options.onProgress === 'function') options.onProgress(18, converted.effectivePolicy?.reusedPreparedWebp ? 'compressed-reused' : 'compressed');

  let preparedUpload = null;

  try {
    const intentPayload = await apiClient.createR2xImageIntent(converted.file, {
      context,
      entityType: options.entityType || 'mensaje',
      entityId: options.entityId || clientMutationId,
      conversationId: options.conversationId || '',
      width: converted.width,
      height: converted.height,
      sha256: converted.sha256,
      originalFilename: converted.originalFileName,
      originalMimeType: converted.originalMimeType,
      maxBytes: uploadPolicy.maxBytes
    }, `${clientMutationId}:r2x-intent`);

    preparedUpload = normalizeR2xImageUploadPreparation(intentPayload);
    if (!preparedUpload.uploadUrl || !preparedUpload.imageId) {
      throw createR2xPolicyUnavailableError('memoriaBACKEND no devolvió una intención válida de imagen temporal.');
    }

    await uploadMediaFileToSignedUrl(converted.file, preparedUpload, {
      onProgress: (progress) => {
        if (typeof options.onProgress === 'function') options.onProgress(20 + progress * 0.58, 'uploading');
      }
    });
    if (typeof options.onProgress === 'function') options.onProgress(84, 'uploaded');

    const confirmationPayload = await apiClient.confirmR2xImage(preparedUpload.imageId, {
      entityType: options.entityType || 'mensaje',
      entityId: options.entityId || clientMutationId,
      conversationId: options.conversationId || ''
    }, `${clientMutationId}:r2x-confirm`);
    if (typeof options.onProgress === 'function') options.onProgress(88, 'confirmed');

    preparedUpload = normalizeR2xImageReadPayload(confirmationPayload, preparedUpload);
  } catch (error) {
    if (isBackendAuthError(error)) throw error;
    if (isR2xPolicyUnavailableError(error) || isRecoverableR2xBackendError(error)) {
      throw createR2xPolicyUnavailableError('ImagenesCloudflareR2x no respondió como API disponible; se debe usar MEDIAfirmadaX como respaldo.', error);
    }
    throw error;
  }

  if (!preparedUpload.publicUrl) {
    try {
      const readPayload = await apiClient.getR2xImageReadUrl(preparedUpload.imageId, {
        entityType: options.entityType || 'mensaje',
        entityId: options.entityId || clientMutationId,
        conversationId: options.conversationId || ''
      }, `${clientMutationId}:r2x-read`);
      preparedUpload = normalizeR2xImageReadPayload(readPayload, preparedUpload);
    } catch (error) {
      console.warn('La imagen WebP quedó confirmada, pero memoriaBACKEND no devolvió URL de lectura inmediata.', error);
    }
  }

  return {
    file: converted.file,
    preparedUpload,
    width: converted.width,
    height: converted.height,
    originalFileName: converted.originalFileName,
    originalMimeType: converted.originalMimeType,
    maxBytes: uploadPolicy.maxBytes,
    sizeBytes: converted.file.size,
    quality: converted.quality || converted.guarantee?.quality || 0,
    compressionMode: converted.compressionMode || converted.guarantee?.compressionMode || '',
    guarantee: converted.guarantee || uploadPolicy,
    diagnostics: converted.diagnostics || null,
    guaranteedMaxBytes: true
  };
}

async function prepareStatusMediaForBackend(file, clientMutationId) {
  let uploadFile = file;
  let preparedUpload = null;
  let imageMetadata = null;

  if (shouldUseR2xTemporaryImageApi(file)) {
    try {
      const r2xPreparation = await prepareR2xTemporaryImageForBackend(file, {
        context: 'status-media',
        entityType: 'publicacion-efimera',
        entityId: clientMutationId,
        clientMutationId: `${clientMutationId}:status-media`
      });
      uploadFile = r2xPreparation.file;
      preparedUpload = r2xPreparation.preparedUpload;
      imageMetadata = r2xPreparation;
    } catch (error) {
      if (!isR2xPolicyUnavailableError(error)) throw error;
      console.warn('ImagenesCloudflareR2x no está disponible para estados visuales; se usa MEDIAfirmadaX sin cambiar la experiencia del usuario.', error);
    }
  }

  if (!preparedUpload) {
    const preparationPayload = await apiClient.prepareMediaUpload(file, `${clientMutationId}:status-media`);
    preparedUpload = normalizeMediaUploadPreparation(preparationPayload);

    if (!preparedUpload.uploadUrl && !preparedUpload.mediaId) {
      throw new Error('memoriaBACKEND no devolvió uploadUrl ni mediaId para el estado visual.');
    }

    if (preparedUpload.uploadUrl) {
      await uploadMediaFileToSignedUrl(file, preparedUpload);
    }

    preparedUpload = await completeMediaFirmadaUploadForBackend(preparedUpload, file, {
      entityType: 'publicacion-efimera',
      entityId: clientMutationId,
      clientMutationId: `${clientMutationId}:status-media`
    });
  }

  return {
    mediaId: preparedUpload.mediaId || '',
    mediaUrl: preparedUpload.publicUrl || '',
    mediaName: uploadFile.name,
    mediaMimeType: uploadFile.type || 'application/octet-stream',
    mediaSizeBytes: uploadFile.size,
    mediaKind: getStatusMediaKind(uploadFile.type || ''),
    mediaProvider: preparedUpload.provider || 'media-firmada',
    originalMediaName: imageMetadata?.originalFileName || '',
    media: {
      id: preparedUpload.mediaId || '',
      url: preparedUpload.publicUrl || '',
      filename: uploadFile.name,
      mimeType: uploadFile.type || 'application/octet-stream',
      sizeBytes: uploadFile.size,
      kind: getStatusMediaKind(uploadFile.type || ''),
      provider: preparedUpload.provider || 'media-firmada',
      originalFilename: imageMetadata?.originalFileName || ''
    }
  };
}

function buildStateApiPayload(text, clientMutationId, mediaPayload = null) {
  const payload = {
    type: mediaPayload ? 'media' : 'text',
    text,
    expiresInHours: 24,
    clientMutationId
  };

  if (mediaPayload) {
    Object.assign(payload, {
      mediaId: mediaPayload.mediaId || '',
      mediaUrl: mediaPayload.mediaUrl || '',
      mediaName: mediaPayload.mediaName || '',
      mediaMimeType: mediaPayload.mediaMimeType || '',
      mediaSizeBytes: mediaPayload.mediaSizeBytes || 0,
      mediaKind: mediaPayload.mediaKind || 'image',
      media: mediaPayload.media || null
    });
  }

  return payload;
}

function renderStatusPanel(selectedState = null) {
  const state = selectedState || getActiveState();
  activeName.textContent = 'Estados';
  activeStatus.textContent = 'Actualizaciones visibles por 24 horas';
  activeAvatar.textContent = '24';
  messagesContainer.hidden = true;
  messageForm.hidden = true;
  statusPanel.hidden = false;

  if (!state) {
    statusPanel.innerHTML = `
      <article class="status-card">
        <h3>No hay estados disponibles</h3>
        <p>Crea un estado desde el botón de herramientas o desde la lista de estados.</p>
        <button id="createStatusFromPanel" class="primary-button" type="button">Crear estado</button>
      </article>
    `;
    statusPanel.querySelector('#createStatusFromPanel').addEventListener('click', openCreateStatusModal);
    return;
  }

  statusPanel.innerHTML = `
    <article class="status-card status-preview-card">
      <div class="status-hero" aria-hidden="true"></div>
      <h3>${escapeHTML(state.name)}</h3>
      <p>${escapeHTML(getStatePreviewText(state))}. Visible durante ${escapeHTML(getStateExpiryLabel(state))}.</p>
      <div class="status-actions">
        <button id="markStateViewedButton" class="secondary-button" type="button">Marcar como visto</button>
        <button id="replyStateButton" class="primary-button" type="button">Responder por chat</button>
      </div>
    </article>
    <article class="status-card">
      <h3>Publicar estado</h3>
      <p>El estado se guarda localmente y queda listo para sincronizarse con la API de estados 24h de memoriaBACKEND.</p>
      <button id="createStatusFromPanel" class="primary-button" type="button">Crear estado</button>
    </article>
  `;

  renderStatusHero(statusPanel.querySelector('.status-hero'), state);
  statusPanel.querySelector('#markStateViewedButton').addEventListener('click', () => markStateViewed(state));
  statusPanel.querySelector('#replyStateButton').addEventListener('click', () => replyToState(state));
  statusPanel.querySelector('#createStatusFromPanel').addEventListener('click', openCreateStatusModal);
}

function renderCallsEmptyState() {
  activeName.textContent = 'Llamadas';
  activeStatus.textContent = 'Historial y acciones de voz o video';
  activeAvatar.textContent = 'LL';
  messagesContainer.hidden = false;
  messageForm.hidden = true;
  statusPanel.hidden = true;
  messagesContainer.innerHTML = `
    <div class="empty-state">
      <strong>Selecciona una llamada</strong>
      Abre una llamada del historial para repetirla, ver su tipo o volver al chat relacionado.
    </div>
  `;
}

function renderConversation() {
  if (activeSection !== 'chats') return;

  const conversation = getActiveConversation();
  messagesContainer.hidden = false;
  messageForm.hidden = false;
  statusPanel.hidden = true;

  if (!conversation) {
    activeName.textContent = 'Selecciona un chat';
    activeStatus.textContent = 'Elige una conversación para comenzar';
    activeAvatar.textContent = 'A';
    if (pinConversationButton) {
      pinConversationButton.disabled = true;
      pinConversationButton.textContent = '⌖';
      pinConversationButton.setAttribute('aria-label', 'Fijar conversación');
      pinConversationButton.title = 'Fijar conversación';
    }
    if (archiveConversationButton) {
      archiveConversationButton.disabled = true;
      archiveConversationButton.textContent = '⇩';
      archiveConversationButton.setAttribute('aria-label', 'Archivar conversación');
    }
    if (conversationMenuButton) {
      conversationMenuButton.disabled = true;
      conversationMenuButton.textContent = '⋮';
      conversationMenuButton.setAttribute('aria-label', 'Abrir opciones de conversación');
      conversationMenuButton.title = 'Opciones de conversación';
    }
    messagesContainer.innerHTML = `
      <div class="empty-state">
        <strong>Bienvenido a ChatER</strong>
        Selecciona una conversación para ver los mensajes o inicia un chat por correo.
      </div>
    `;
    setComposerEnabled(false);
    return;
  }

  activeName.textContent = conversation.name;
  const statusDetails = [];
  if (conversation.archived) statusDetails.push('En Archivados');
  if (conversation.restricted) statusDetails.push('Restringido');
  if (conversation.muted) statusDetails.push('Silenciado');
  if (conversation.favorite) statusDetails.push('Favorito');
  if (conversation.customListName) statusDetails.push(`Lista ${conversation.customListName}`);
  activeStatus.textContent = conversation.blocked
    ? 'Contacto bloqueado · No recibirás ni enviarás mensajes aquí'
    : [conversation.status || 'Disponible', ...statusDetails].filter(Boolean).join(' · ');
  renderAvatarInPlace(activeAvatar, conversation);
  if (pinConversationButton) {
    pinConversationButton.disabled = false;
    pinConversationButton.textContent = conversation.pinned ? '📌' : '⌖';
    pinConversationButton.setAttribute('aria-label', conversation.pinned ? 'Desfijar conversación' : 'Fijar conversación');
    pinConversationButton.title = conversation.pinned ? 'Desfijar conversación' : 'Fijar conversación';
  }
  if (archiveConversationButton) {
    archiveConversationButton.disabled = false;
    archiveConversationButton.textContent = conversation.archived ? '↥' : '⇩';
    archiveConversationButton.setAttribute('aria-label', conversation.archived ? 'Restaurar conversación' : 'Archivar conversación');
    archiveConversationButton.title = conversation.archived ? 'Restaurar conversación' : 'Archivar conversación';
  }
  if (conversationMenuButton) {
    conversationMenuButton.disabled = false;
    conversationMenuButton.textContent = '⋮';
    conversationMenuButton.setAttribute('aria-label', `Abrir opciones de conversación con ${conversation.name}`);
    conversationMenuButton.title = 'Opciones de conversación';
  }
  // Un chat archivado sigue siendo abrible y operable; archivado solo controla su visibilidad en la lista principal.
  setComposerEnabled(!conversation.blocked);
  ensureStremeConversationSubscription(conversation.id);
  const removedExpiredMessages = pruneExpiredChatMessagesFromConversation(conversation);
  if (removedExpiredMessages) {
    persistState();
    renderChatList(searchInput.value);
  }

  messagesContainer.innerHTML = '';
  conversation.messages.forEach((message) => {
    messagesContainer.appendChild(createMessageElement(message));
  });

  messagesContainer.scrollTop = messagesContainer.scrollHeight;
  hydrateConversationMessages(conversation.id);
}

function shouldHydrateConversationMessages(conversation, options = {}) {
  if (!CHATER_CONFIG.backendBaseUrl || !getSessionEmail() || !conversation?.id) return false;
  const forceHydration = Boolean(options.force);
  if (conversation.messagesHydrated && !forceHydration) return false;
  if (messageHistoryHydration.inFlight.has(conversation.id)) return false;

  const lastErrorAt = conversation.messagesHistoryLastErrorAt ? Date.parse(conversation.messagesHistoryLastErrorAt) : 0;
  if (!forceHydration && lastErrorAt && Date.now() - lastErrorAt < messageHistoryHydration.retryAfterMs) return false;

  return true;
}

function syncIncomingReceiptsForVisibleConversation(conversation = {}, options = {}) {
  if (!conversation?.id || !Array.isArray(conversation.messages)) return;
  conversation.messages.forEach((message) => {
    if (shouldSendReceiptForIncomingMessage(message)) sendDeliveredReceiptForMessage(conversation, message);
  });

  if (options.markRead) {
    conversation.unread = 0;
    sendReadReceiptsForConversation(conversation, { readAt: options.readAt || new Date().toISOString(), force: true });
  }
}

async function hydrateConversationMessages(conversationId, options = {}) {
  const sessionGuard = captureSessionGuard();
  const conversation = appState.conversations.find((item) => item.id === conversationId);
  if (!shouldHydrateConversationMessages(conversation, options)) return;

  const hydrationKey = String(conversation.id || conversationId || '');
  messageHistoryHydration.inFlight.add(hydrationKey);
  const previousStatus = conversation.status;
  if (activeConversationId === conversation.id && activeSection === 'chats') {
    activeStatus.textContent = 'Cargando historial...';
  }

  try {
    const payload = await apiClient.getMessages(conversation.id, {
      limit: 50,
      before: conversation.messagesHistoryCursor || '',
      conversation
    });

    if (!isSessionGuardCurrent(sessionGuard)) return;

    if (!payload?.offlineDemo) {
      const remoteMessages = extractArrayFromPayload(payload, ['messages', 'items']).map(normalizeMessageFromApi);
      if (remoteMessages.length) {
        conversation.messages = mergeMessagesByIdentity(remoteMessages, conversation.messages);
        syncIncomingReceiptsForVisibleConversation(conversation, {
          markRead: activeConversationId === conversation.id && activeSection === 'chats'
        });
      }
      conversation.messagesHydrated = true;
      conversation.messagesHistoryCursor = payload.nextCursor || payload.cursor || payload.data?.nextCursor || '';
      conversation.messagesHistoryLastErrorAt = '';
      if (!previousStatus || previousStatus === 'Cargando historial...') {
        conversation.status = 'Sincronizado';
      } else {
        conversation.status = previousStatus;
      }
      persistState();
      if (activeConversationId === conversation.id && activeSection === 'chats') {
        renderChatList(searchInput.value);
        renderConversation();
      }
    }
  } catch (error) {
    if (isSessionGuardCurrent(sessionGuard)) {
      conversation.messagesHistoryLastErrorAt = new Date().toISOString();
      conversation.status = previousStatus || conversation.status;
      persistState();
      console.warn('No se pudo hidratar el historial de mensajes desde memoriaBACKEND.', error);
      if (activeConversationId === conversation.id && activeSection === 'chats') {
        activeStatus.textContent = conversation.status || 'Historial pendiente';
      }
    }
  } finally {
    messageHistoryHydration.inFlight.delete(hydrationKey);
    if (conversation.id && conversation.id !== hydrationKey) {
      messageHistoryHydration.inFlight.delete(conversation.id);
    }
  }
}

async function forceHydrateConversationHistory(conversationOrId, options = {}) {
  if (!CHATER_CONFIG.backendBaseUrl || !getSessionEmail()) return;
  const conversationId = typeof conversationOrId === 'object'
    ? String(conversationOrId?.id || '')
    : String(conversationOrId || '');
  const conversation = appState.conversations.find((item) => String(item.id || '') === conversationId);
  if (!conversation) return;

  conversation.messagesHydrated = false;
  conversation.messagesHistoryLastErrorAt = options.clearLastError === false
    ? conversation.messagesHistoryLastErrorAt
    : '';
  persistState();
  await hydrateConversationMessages(conversation.id, { force: true });
}

function createMessageElement(message) {
  const mediaKind = getMessageMediaKind(message);
  const hasVisualMedia = Boolean(message.mediaPreviewDataUrl || message.mediaUrl || message.attachmentName || message.mediaName || message.mediaId);
  const messageElement = document.createElement('article');
  messageElement.className = `message ${message.type}`;
  messageElement.classList.toggle('has-media', hasVisualMedia && mediaKind !== 'file');
  messageElement.dataset.messageId = String(message.id || '');
  messageElement.dataset.clientMutationId = String(message.clientMutationId || message.clientMessageId || '');
  messageElement.innerHTML = `
    <p class="message-text"></p>
    <div class="message-extra"></div>
    <div class="message-time">${escapeHTML(message.time || '')}</div>
  `;

  const messageText = String(message.text || '').trim();
  const shouldShowText = Boolean(messageText) && !isAutomaticMediaCaption(messageText, mediaKind);
  const textNode = messageElement.querySelector('.message-text');
  textNode.textContent = shouldShowText ? messageText : '';
  textNode.hidden = !shouldShowText;

  const extra = messageElement.querySelector('.message-extra');
  renderMessageAttachment(extra, message, mediaKind);

  const receipt = createMessageReceiptElement(message);
  if (receipt) {
    const timeNode = messageElement.querySelector('.message-time');
    timeNode.classList.add('message-time-with-receipt');
    timeNode.appendChild(receipt);
  }

  if (isMessageRetryable(message)) {
    messageElement.appendChild(createMessageRetryButton(message));
  }

  return messageElement;
}

function isAutomaticMediaCaption(text = '', mediaKind = 'file') {
  const normalized = String(text || '').trim().toLowerCase();
  if (!normalized) return false;
  if (mediaKind === 'image') return ['imagen adjunta', 'imagen'].includes(normalized);
  if (mediaKind === 'video') return ['video adjunto', 'vídeo adjunto', 'video'].includes(normalized);
  if (mediaKind === 'audio') return ['audio adjunto', 'audio'].includes(normalized);
  if (mediaKind === 'file') return ['archivo adjunto', 'adjunto'].includes(normalized);
  return false;
}

function isMessageUploadInProgress(message = {}) {
  const status = String(message.status || message.mediaSyncStatus || '').trim().toLowerCase();
  return ['uploading', 'creating-media-message'].includes(status);
}

function isMessageRetryable(message = {}) {
  if (message.type !== 'outgoing') return false;
  const status = String(message.status || message.mediaSyncStatus || '').trim().toLowerCase();
  return ['pending', 'failed', 'pending-media-retry'].includes(status);
}

function getMessageUploadProgress(message = {}) {
  const explicitProgress = Number(message.uploadProgress || message.mediaUploadProgress || 0);
  if (Number.isFinite(explicitProgress) && explicitProgress > 0) {
    return Math.max(1, Math.min(99, Math.round(explicitProgress)));
  }

  const status = String(message.status || message.mediaSyncStatus || '').trim().toLowerCase();
  if (status === 'creating-media-message') return 88;
  if (status === 'uploading') return 12;
  return 100;
}

function createMessageRetryButton(message = {}) {
  const button = document.createElement('button');
  button.className = 'message-retry-button';
  button.type = 'button';
  button.dataset.messageRetry = String(message.id || message.clientMutationId || message.clientMessageId || '');
  button.setAttribute('aria-label', 'Reintentar envío');
  button.title = 'Reintentar envío';
  button.textContent = '↻';
  return button;
}


function findConversationMessageById(messageId = '') {
  const normalizedId = String(messageId || '').trim();
  if (!normalizedId) return null;
  for (const conversation of appState.conversations) {
    const message = conversation.messages?.find((item) => String(item.id || '') === normalizedId || String(item.clientMutationId || item.clientMessageId || '') === normalizedId);
    if (message) return { conversation, message };
  }
  return null;
}

function hasQueuedBackendOperationForMessage(messageId = '') {
  const normalizedId = String(messageId || '').trim();
  if (!normalizedId) return false;
  return readBackendOutbox().some((operation) => {
    const payload = operation.payload || {};
    const queuedId = payload.clientMessageId || payload.messageId || payload.mediaMessagePayload?.clientMutationId || payload.mediaMessagePayload?.clientMessageId || '';
    return String(queuedId || '') === normalizedId || String(operation.dedupeKey || '').includes(normalizedId);
  });
}

function removeQueuedBackendOperationsForMessage(messageId = '', email = getSessionEmail()) {
  const normalizedId = String(messageId || '').trim();
  const ownerEmail = normalizeStorageIdentity(email);
  if (!normalizedId || !ownerEmail) return false;

  const queue = readBackendOutbox(ownerEmail);
  const filteredQueue = queue.filter((operation) => {
    if (!['sendMessage', 'createMediaMessage'].includes(operation.type)) return true;
    const payload = operation.payload || {};
    const queuedId = payload.clientMessageId || payload.messageId || payload.mediaMessagePayload?.clientMutationId || payload.mediaMessagePayload?.clientMessageId || '';
    const dedupeKey = String(operation.dedupeKey || '');
    return !(String(queuedId || '') === normalizedId || dedupeKey.includes(normalizedId));
  });

  if (filteredQueue.length === queue.length) return false;
  persistBackendOutbox(filteredQueue, ownerEmail);
  return true;
}

function collectIdentityCandidatesFromArray(value = []) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function getConversationIdentityContainers(conversation = {}) {
  const metadata = conversation.metadata && typeof conversation.metadata === 'object' ? conversation.metadata : {};
  const data = conversation.data && typeof conversation.data === 'object' ? conversation.data : {};
  const contact = conversation.contact && typeof conversation.contact === 'object' ? conversation.contact : {};
  const remote = conversation.remote && typeof conversation.remote === 'object' ? conversation.remote : {};
  const recipient = conversation.recipient && typeof conversation.recipient === 'object' ? conversation.recipient : {};

  return { metadata, data, contact, remote, recipient };
}

function getConversationRemoteIdentities(conversation = {}) {
  const identities = [];
  const selfEmail = normalizeStorageIdentity(getSessionEmail());
  const selfUserId = normalizeBackendUserId(getSessionUserId()) || normalizeBackendUserId(getCurrentUserIdentifier());
  const { metadata, data, contact, remote, recipient } = getConversationIdentityContainers(conversation);

  const pushIdentity = (candidate = {}, fallbackName = '') => {
    if (!candidate) return;
    if (typeof candidate === 'string') {
      const normalizedEmail = normalizeStorageIdentity(candidate);
      const email = candidate.includes('@') ? normalizedEmail : '';
      const userId = email ? '' : normalizeBackendUserId(candidate);
      pushIdentity({ email, userId, name: fallbackName || email || userId });
      return;
    }
    if (typeof candidate !== 'object' || Array.isArray(candidate)) return;

    const email = normalizeStorageIdentity(
      candidate.email
        || candidate.userEmail
        || candidate.contactEmail
        || candidate.recipientUserEmail
        || candidate.recipientEmail
        || candidate.toEmail
        || candidate.mail
        || ''
    );
    const userId = normalizeBackendUserId(
      candidate.userId
        || candidate.contactUserId
        || candidate.remoteUserId
        || candidate.otherUserId
        || candidate.participantUserId
        || candidate.recipientUserId
        || candidate.toUserId
        || candidate.uid
        || candidate.id
        || ''
    );
    if (!email && !userId) return;
    if ((selfEmail && email && email === selfEmail) || (selfUserId && userId && userId === selfUserId)) return;
    const key = `${email}|${userId}`;
    if (identities.some((item) => `${item.email}|${item.userId}` === key)) return;
    identities.push({
      email,
      userId,
      name: candidate.name || candidate.displayName || candidate.alias || fallbackName || email || userId
    });
  };

  pushIdentity({
    email: conversation.email
      || conversation.contactEmail
      || conversation.userEmail
      || conversation.recipientUserEmail
      || conversation.toEmail
      || metadata.contactEmail
      || metadata.email
      || metadata.recipientUserEmail
      || data.contactEmail
      || data.email
      || data.recipientUserEmail
      || contact.email
      || contact.userEmail
      || remote.email
      || recipient.email
      || '',
    userId: conversation.contactUserId
      || conversation.remoteUserId
      || conversation.otherUserId
      || conversation.participantUserId
      || conversation.recipientUserId
      || conversation.toUserId
      || metadata.contactUserId
      || metadata.remoteUserId
      || metadata.recipientUserId
      || data.contactUserId
      || data.remoteUserId
      || data.recipientUserId
      || contact.userId
      || contact.id
      || remote.userId
      || remote.id
      || recipient.userId
      || recipient.id
      || '',
    name: conversation.name
      || conversation.displayName
      || conversation.alias
      || metadata.displayName
      || metadata.name
      || data.displayName
      || data.name
      || contact.name
      || remote.name
      || recipient.name
      || ''
  });

  [
    conversation.participants,
    conversation.participantList,
    conversation.members,
    conversation.recipients,
    metadata.participants,
    metadata.participantList,
    metadata.members,
    metadata.recipients,
    data.participants,
    data.participantList,
    data.members,
    data.recipients
  ].forEach((list) => collectIdentityCandidatesFromArray(list).forEach(pushIdentity));

  [
    conversation.participantEmails,
    metadata.participantEmails,
    data.participantEmails
  ].forEach((list) => collectIdentityCandidatesFromArray(list).forEach((email) => pushIdentity({ email })));

  if (Array.isArray(conversation.messages)) {
    conversation.messages.slice(-5).forEach((message) => {
      pushIdentity({
        email: message.type === 'incoming'
          ? (message.senderUserEmail || message.senderEmail || '')
          : (message.recipientUserEmail || message.recipientEmail || ''),
        userId: message.type === 'incoming'
          ? (message.senderUserId || message.fromUserId || '')
          : (message.recipientUserId || message.toUserId || ''),
        name: message.senderName || message.recipientName || ''
      });
    });
  }

  return identities;
}

function getConversationRealtimeChannels(conversation = {}, options = {}) {
  const channels = [];
  const pushChannel = (channel = '') => {
    const cleanChannel = sanitizeLocalStremeChannel(channel, '');
    if (cleanChannel && !channels.includes(cleanChannel)) channels.push(cleanChannel);
  };

  if (options.includeConversation !== false) {
    pushChannel(getConversationStremeChannel(conversation.id));
    const lifecycle = buildConversationSharedLifecycleMetadata(conversation);
    if (lifecycle.redisConversationKey && lifecycle.redisConversationKey !== conversation.id) {
      pushChannel(getConversationStremeChannel(lifecycle.redisConversationKey));
    }
  }
  if (options.includeSelf !== false) pushChannel(getCurrentUserStremeInboxChannel());
  if (options.includeRemote !== false) {
    getConversationRemoteIdentities(conversation).forEach((identity) => {
      pushChannel(getUserStremeInboxChannel(identity.email, identity.userId));
    });
  }

  return channels;
}

function publishDurableStremeEventToChannels(payload = {}, channels = [], options = {}) {
  const uniqueChannels = [...new Set((channels || []).map((channel) => sanitizeLocalStremeChannel(channel, '')).filter(Boolean))];
  if (!uniqueChannels.length) return [];
  const baseDedupeKey = options.dedupeKey || `streme-event:${payload.type || payload.tipo || 'event'}:${payload.clientMutationId || generateClientMutationId()}`;
  const primaryChannel = uniqueChannels[0];

  // Un solo POST publica el mismo evento en todos los canales STREMEx.
  // Esto conserva el contrato historico de devolver una lista de operaciones,
  // pero elimina N solicitudes por mensaje/check cuando hay inbox + conversacion.
  return [publishDurableStremeEvent({
    ...payload,
    channel: primaryChannel,
    canal: primaryChannel,
    channels: uniqueChannels,
    canales: uniqueChannels
  }, {
    ...options,
    dedupeKey: `${baseDedupeKey}:bulk:${uniqueChannels.join('|')}`
  })];
}

function getMessageSenderIdentity(message = {}, fallbackConversation = {}) {
  const senderEmail = normalizeStorageIdentity(message.senderUserEmail || message.senderEmail || message.fromEmail || '');
  const senderUserId = normalizeBackendUserId(message.senderUserId || message.fromUserId || '');
  if (senderEmail || senderUserId) return { email: senderEmail, userId: senderUserId };

  if (message.type === 'incoming') {
    const remote = getConversationRemoteIdentities(fallbackConversation)[0] || {};
    return { email: remote.email || '', userId: remote.userId || '' };
  }

  return { email: getSessionEmail(), userId: getSessionUserId() || getCurrentUserIdentifier() };
}

function getReceiptTargetChannels(conversation = {}, message = {}) {
  const sender = getMessageSenderIdentity(message, conversation);
  const channels = [getConversationStremeChannel(conversation.id)];
  const senderChannel = getUserStremeInboxChannel(sender.email, sender.userId);
  if (senderChannel) channels.push(senderChannel);
  return [...new Set(channels.filter(Boolean))];
}

function shouldSendReceiptForIncomingMessage(message = {}) {
  if (!message || message.type !== 'incoming') return false;
  return Boolean(message.id || message.clientMutationId || message.clientMessageId);
}

function publishMessageReceipt(conversation = {}, message = {}, receiptType = 'delivered', timestamp = new Date().toISOString()) {
  if (!CHATER_CONFIG.backendBaseUrl || !conversation?.id || !shouldSendReceiptForIncomingMessage(message)) return [];
  const normalizedReceiptType = receiptType === 'read' ? 'read' : 'delivered';
  const messageId = String(message.id || message.messageId || '').trim();
  const clientMutationId = String(message.clientMutationId || message.clientMessageId || '').trim();
  const receiptMutationId = generateClientMutationId();
  const payload = {
    type: normalizedReceiptType === 'read' ? 'message.read' : 'message.delivered',
    chatId: conversation.id,
    conversationId: conversation.id,
    messageId,
    clientMutationId: receiptMutationId,
    clientMessageId: clientMutationId,
    messageClientMutationId: clientMutationId,
    messageIds: [messageId].filter(Boolean),
    clientMessageIds: [clientMutationId].filter(Boolean),
    status: normalizedReceiptType,
    receiptStatus: normalizedReceiptType,
    deliveredAt: normalizedReceiptType === 'delivered' ? timestamp : (message.deliveredAt || ''),
    readAt: normalizedReceiptType === 'read' ? timestamp : '',
    actorUserId: getCurrentUserIdentifier(),
    actorUserEmail: getSessionEmail(),
    deviceId: getDeviceId(),
    receiptClientMutationId: receiptMutationId
  };

  return publishDurableStremeEventToChannels(payload, getReceiptTargetChannels(conversation, message), {
    dedupeKey: `streme-message-receipt:${normalizedReceiptType}:${messageId || clientMutationId || receiptMutationId}`,
    onErrorMessage: 'No se pudo publicar el recibo de mensaje en STREMEx. Se deja en cola durable.'
  });
}

function syncDeliveredReceiptWithBackend(conversation = {}, message = {}, deliveredAt = new Date().toISOString()) {
  if (!CHATER_CONFIG.backendBaseUrl || !conversation?.id || !shouldSendReceiptForIncomingMessage(message)) return;
  const messageId = String(message.id || message.messageId || message.clientMutationId || '').trim();
  if (!messageId || message.deliveredReceiptSyncedAt) return;
  const clientMutationId = generateClientMutationId();
  apiClient.markMessageDelivered(conversation.id, messageId, clientMutationId, deliveredAt)
    .then(() => {
      message.deliveredReceiptSyncedAt = deliveredAt;
      persistState();
    })
    .catch(() => {
      enqueueBackendOperation({
        type: 'markMessageDelivered',
        dedupeKey: `delivered:${conversation.id}:${messageId}`,
        replaceExisting: true,
        payload: { conversationId: conversation.id, messageId, deliveredAt, clientMutationId }
      });
    });
}

function sendDeliveredReceiptForMessage(conversation = {}, message = {}) {
  if (!shouldSendReceiptForIncomingMessage(message) || message.deliveredReceiptSentAt) return;
  const deliveredAt = new Date().toISOString();
  message.deliveredReceiptSentAt = deliveredAt;
  message.deliveredAt = message.deliveredAt || deliveredAt;
  publishMessageReceipt(conversation, message, 'delivered', deliveredAt);
  syncDeliveredReceiptWithBackend(conversation, message, deliveredAt);
}

function sendReadReceiptsForConversation(conversation = {}, options = {}) {
  if (!conversation?.id || !Array.isArray(conversation.messages)) return;
  const readAt = options.readAt || new Date().toISOString();
  const readableMessages = conversation.messages.filter((message) => {
    if (!shouldSendReceiptForIncomingMessage(message)) return false;
    if (message.readReceiptSentAt && !options.resendReadReceipts) return false;
    return true;
  });
  if (!readableMessages.length) return;

  readableMessages.forEach((message) => {
    message.readReceiptSentAt = readAt;
    message.readAt = message.readAt || readAt;
    if (!message.deliveredReceiptSentAt) {
      message.deliveredReceiptSentAt = message.deliveredAt || readAt;
      message.deliveredAt = message.deliveredAt || readAt;
    }
  });

  const messageIds = readableMessages.map((message) => String(message.id || message.messageId || '')).filter(Boolean);
  const clientMessageIds = readableMessages.map((message) => String(message.clientMutationId || message.clientMessageId || '')).filter(Boolean);
  const firstMessage = readableMessages[0];
  const receiptMutationId = generateClientMutationId();
  publishDurableStremeEventToChannels({
    type: 'message.read',
    chatId: conversation.id,
    conversationId: conversation.id,
    messageId: messageIds[0] || '',
    clientMutationId: receiptMutationId,
    clientMessageId: clientMessageIds[0] || '',
    messageClientMutationId: clientMessageIds[0] || '',
    messageIds,
    clientMessageIds,
    status: 'read',
    receiptStatus: 'read',
    readAt,
    actorUserId: getCurrentUserIdentifier(),
    actorUserEmail: getSessionEmail(),
    deviceId: getDeviceId(),
    receiptClientMutationId: receiptMutationId
  }, getReceiptTargetChannels(conversation, firstMessage), {
    dedupeKey: `streme-message-read:${conversation.id}:${receiptMutationId}`,
    onErrorMessage: 'No se pudo publicar la lectura del chat en STREMEx. Se deja en cola durable.'
  });

  if (CHATER_CONFIG.backendBaseUrl) {
    readableMessages.slice(0, 20).forEach((message) => {
      const messageId = String(message.id || message.messageId || message.clientMutationId || '').trim();
      if (!messageId || message.readReceiptSyncedAt) return;
      const clientMutationId = generateClientMutationId();
      apiClient.markMessageRead(conversation.id, messageId, clientMutationId, readAt)
        .then(() => {
          message.readReceiptSyncedAt = readAt;
          persistState();
        })
        .catch(() => {
          enqueueBackendOperation({
            type: 'markMessageRead',
            dedupeKey: `read-message:${conversation.id}:${messageId}`,
            replaceExisting: true,
            payload: { conversationId: conversation.id, messageId, readAt, clientMutationId }
          });
        });
    });
  }
}

function findOrCreateConversationForRealtimeMessage(data = {}, message = {}) {
  const rawConversation = getRealtimeRecord(data, ['conversation', 'chat']);
  const rawMetadata = rawConversation.metadata && typeof rawConversation.metadata === 'object' ? rawConversation.metadata : {};
  const messageMetadata = message.metadata && typeof message.metadata === 'object' ? message.metadata : {};
  const conversationId = String(
    data.chatId
      || data.conversationId
      || rawConversation.chatId
      || rawConversation.conversationId
      || rawConversation.id
      || message.chatId
      || message.conversationId
      || ''
  ).trim();
  let conversation = appState.conversations.find((item) => conversationId && String(item.id || '') === conversationId);
  if (conversation) return conversation;

  const incomingSharedKey = getConversationSharedMergeKey({
    ...rawConversation,
    ...data,
    ...message,
    metadata: { ...rawMetadata, ...messageMetadata, ...(data.metadata && typeof data.metadata === 'object' ? data.metadata : {}) }
  });
  if (incomingSharedKey) {
    conversation = appState.conversations.find((item) => getConversationSharedMergeKey(item) === incomingSharedKey);
    if (conversation) {
      if (conversationId && conversation.id !== conversationId) applyRemoteConversationId(conversation.id, conversationId);
      return conversation;
    }
  }

  const normalizedMessage = normalizeMessageFromApi({ ...message, chatId: conversationId, conversationId });
  const remoteEmail = normalizedMessage.type === 'incoming'
    ? normalizeStorageIdentity(normalizedMessage.senderUserEmail || data.senderUserEmail || data.senderEmail || '')
    : normalizeStorageIdentity(normalizedMessage.recipientUserEmail || data.recipientUserEmail || data.recipientEmail || '');
  const remoteUserId = normalizedMessage.type === 'incoming'
    ? normalizeBackendUserId(normalizedMessage.senderUserId || data.senderUserId || '')
    : normalizeBackendUserId(normalizedMessage.recipientUserId || data.recipientUserId || '');

  conversation = findConversationByContactIdentity({ email: remoteEmail, userId: remoteUserId });
  if (conversation) {
    if (conversationId && conversation.id !== conversationId) {
      applyRemoteConversationId(conversation.id, conversationId);
    }
    return conversation;
  }

  if (!conversationId && !remoteEmail && !remoteUserId && !incomingSharedKey) return null;

  const displayName = normalizedMessage.senderName || data.senderName || data.displayName || rawConversation.displayName || rawConversation.name || remoteEmail || 'Contacto';
  const participants = ensureCurrentUserInLifecycleParticipants(normalizeConversationParticipantsForApi(
    rawConversation.participants
      || rawConversation.participantList
      || rawConversation.members
      || data.participants
      || data.participantList
      || data.members
      || message.participants
      || messageMetadata.participants
      || [],
    remoteEmail,
    displayName
  ));
  const lifecycle = buildSharedConversationLifecycleMetadata(participants, {
    type: rawConversation.type || rawConversation.conversationType || data.type || data.conversationType || 'direct',
    participantCount: rawConversation.participantCount || data.participantCount || participants.length,
    sharedConversationKey: incomingSharedKey
  });

  conversation = {
    id: conversationId || (lifecycle.sharedConversationKey ? `chat-${hashStableText(lifecycle.sharedConversationKey)}` : `chat-${remoteEmail || remoteUserId || Date.now()}`),
    name: displayName,
    email: remoteEmail,
    contactEmail: remoteEmail,
    contactUserId: remoteUserId,
    avatar: getInitials(displayName),
    avatarImage: '',
    status: 'Nuevo mensaje',
    section: 'chats',
    archived: false,
    unread: 0,
    messages: [],
    messagesHydrated: false,
    messagesHistoryCursor: '',
    messagesHistoryLastErrorAt: '',
    lastReadAt: '',
    readSyncedAt: '',
    lastReadSyncStatus: 'local',
    participants,
    sharedConversationKey: lifecycle.sharedConversationKey,
    redisConversationKey: lifecycle.redisConversationKey,
    redisChatKey: lifecycle.redisChatKey,
    participantCount: lifecycle.participantCount,
    reuseExistingRedisChat: true,
    deleteFinalOnlyWhenAllParticipantsDeleted: true,
    metadata: {
      ...rawMetadata,
      ...lifecycle
    }
  };
  appState.conversations.unshift(conversation);

  if (remoteEmail && CHATER_CONFIG.backendBaseUrl) {
    syncContactRelation({
      name: displayName,
      email: remoteEmail,
      userId: remoteUserId,
      conversationId: conversation.id,
      source: 'realtime-message',
      reason: 'incoming-realtime-message'
    }, { enqueueOnFailure: true }).catch(() => {});
  }

  return conversation;
}

function applyRealtimeMessageReceipt(data = {}, forcedStatus = '') {
  const status = normalizeMessageReceiptStatus(forcedStatus || data.receiptStatus || data.status || data.interactionType || data.type, 'delivered');
  const conversationId = String(data.chatId || data.conversationId || '').trim();
  const messageIds = [
    ...(Array.isArray(data.messageIds) ? data.messageIds : []),
    data.messageId,
    data.id
  ].filter(Boolean).map(String);
  const clientMessageIds = [
    ...(Array.isArray(data.clientMessageIds) ? data.clientMessageIds : []),
    data.clientMessageId,
    data.messageClientMutationId,
    data.clientMutationId
  ].filter(Boolean).map(String);
  const identitySet = new Set([...messageIds, ...clientMessageIds]);
  if (!identitySet.size && !conversationId) return;

  let changed = false;
  appState.conversations.forEach((conversation) => {
    const conversationHasMatchingMessage = identitySet.size
      ? (conversation.messages || []).some((message) => getMessageIdentityCandidates(message).some((identity) => identitySet.has(identity)))
      : false;
    if (conversationId && String(conversation.id || '') !== conversationId && !conversationHasMatchingMessage) return;
    (conversation.messages || []).forEach((message) => {
      if (message.type !== 'outgoing') return;
      const matches = !identitySet.size || getMessageIdentityCandidates(message).some((identity) => identitySet.has(identity));
      if (!matches) return;
      const updated = setMessageReceiptStatus(message, status, {
        deliveredAt: data.deliveredAt || (status === 'delivered' ? new Date().toISOString() : ''),
        readAt: data.readAt || (status === 'read' ? new Date().toISOString() : '')
      });
      if (updated) changed = true;
    });
  });

  if (changed) {
    persistState();
    renderCurrentSection();
  }
}

function isMessageCreatedByCanonicalMemoriaBackend(payload = {}) {
  if (!payload || typeof payload !== 'object' || payload.offlineDemo) return false;
  const candidates = [
    payload.record,
    payload.message,
    payload.data?.record,
    payload.data?.message,
    payload.data?.data
  ];
  return candidates.some((record) => {
    if (!record || typeof record !== 'object') return false;
    const block = String(record.block || record.bloque || '').trim();
    const kind = String(record.kind || record.tipo || record.entityType || '').trim().toLowerCase();
    return block === 'MENSAJESx' || kind === 'mensaje';
  });
}

function publishRealtimeMessageCreated(conversation = {}, message = {}, payload = {}, options = {}) {
  if (!CHATER_CONFIG.backendBaseUrl || !conversation?.id || !message) return null;
  // memoriaBACKEND/MENSAJESx ya publica el evento canonico `message.created`
  // desde el backend apenas persiste el mensaje. Re-publicarlo desde el cliente
  // duplica trafico STREMEx, aumenta carga y puede desordenar estados en escala.
  if (isMessageCreatedByCanonicalMemoriaBackend(payload)) return null;
  const clientMutationId = message.clientMutationId || message.clientMessageId || options.clientMessageId || message.id || generateClientMutationId();
  const remoteMessage = extractNestedObject(payload, ['message']) || {};
  const messageId = extractEntityId(payload, ['message']) || remoteMessage.id || message.id || clientMutationId;
  const eventMessage = {
    id: messageId,
    messageId,
    clientMutationId,
    clientMessageId: clientMutationId,
    conversationId: conversation.id,
    chatId: conversation.id,
    type: 'outgoing',
    direction: 'outgoing',
    text: message.text || message.mediaCaption || remoteMessage.text || remoteMessage.caption || '',
    time: message.time || getCurrentTime(),
    status: normalizeMessageReceiptStatus(remoteMessage.receiptStatus || remoteMessage.status || message.status || 'backend_received', 'backend_received'),
    receiptStatus: normalizeMessageReceiptStatus(remoteMessage.receiptStatus || remoteMessage.status || message.status || 'backend_received', 'backend_received'),
    senderUserId: getCurrentUserIdentifier(),
    senderUserEmail: getSessionEmail(),
    senderName: getSessionEmail(),
    recipients: getConversationRemoteIdentities(conversation),
    recipientUserEmail: getConversationRemoteIdentities(conversation)[0]?.email || '',
    recipientUserId: getConversationRemoteIdentities(conversation)[0]?.userId || '',
    mediaId: message.mediaId || remoteMessage.mediaId || '',
    mediaProvider: message.mediaProvider || remoteMessage.mediaProvider || '',
    mediaKind: message.mediaKind || remoteMessage.mediaKind || '',
    mediaName: message.mediaName || message.attachmentName || remoteMessage.mediaName || '',
    mediaSizeBytes: message.mediaSizeBytes || message.attachmentSize || remoteMessage.mediaSizeBytes || 0,
    mediaUrl: message.mediaUrl || remoteMessage.mediaUrl || '',
    attachmentName: message.attachmentName || remoteMessage.attachmentName || '',
    attachmentSize: message.attachmentSize || remoteMessage.attachmentSize || 0,
    attachmentMimeType: message.attachmentMimeType || remoteMessage.attachmentMimeType || '',
    createdAt: new Date().toISOString()
  };

  return publishDurableStremeEventToChannels({
    type: 'message.created',
    chatId: conversation.id,
    conversationId: conversation.id,
    messageId,
    message: eventMessage,
    senderUserId: eventMessage.senderUserId,
    senderUserEmail: eventMessage.senderUserEmail,
    recipients: eventMessage.recipients,
    clientMutationId
  }, getConversationRealtimeChannels(conversation, {
    includeConversation: true,
    includeSelf: true,
    includeRemote: true
  }), {
    dedupeKey: `streme-message-created:${clientMutationId}`,
    onErrorMessage: 'No se pudo publicar el mensaje confirmado en STREMEx. Se deja en cola durable.'
  });
}

async function retryMessageDelivery(messageId = '') {
  const found = findConversationMessageById(messageId);
  if (!found) return;

  const { conversation, message } = found;
  if (!CHATER_CONFIG.backendBaseUrl) {
    showToast('Conecta memoriaBACKEND para reintentar el envío real.');
    return;
  }

  const status = String(message.status || message.mediaSyncStatus || '').trim().toLowerCase();
  const clientMessageId = message.clientMutationId || message.clientMessageId || message.id || generateClientMutationId();
  message.clientMutationId = clientMessageId;

  if (status === 'pending-media-retry') {
    const retryEntry = getPendingMediaRetry(clientMessageId);
    if (retryEntry?.file) {
      await retryPendingMediaAttachment(conversation, message, retryEntry);
      return;
    }

    if (hasQueuedBackendOperationForMessage(clientMessageId)) {
      message.status = 'creating-media-message';
      message.mediaSyncStatus = 'creating-media-message';
      conversation.status = 'Reintentando adjunto...';
      persistState();
      renderCurrentSection();
      await flushBackendOutbox();
      return;
    }
    showToast('Adjunta la imagen nuevamente para reintentar la subida desde este dispositivo.');
    return;
  }

  if (!String(message.text || '').trim()) {
    showToast('Este mensaje no tiene contenido para reintentar.');
    return;
  }

  const sessionGuard = captureSessionGuard();
  message.status = 'pending';
  message.receiptStatus = 'pending';
  conversation.status = 'Reintentando mensaje...';
  persistState();
  renderCurrentSection();

  try {
    const payload = await apiClient.sendMessage(conversation.id, message.text, clientMessageId, { conversation });
    if (!isSessionGuardCurrent(sessionGuard)) return;
    markQueuedMessageSynced(conversation.id, clientMessageId, payload);
    publishRealtimeMessageCreated(conversation, message, payload, { clientMessageId });
    showToast('Mensaje reenviado.');
  } catch (error) {
    if (!isSessionGuardCurrent(sessionGuard)) return;
    message.status = 'pending';
    message.receiptStatus = 'pending';
    conversation.status = 'Pendiente de sincronizar';
    enqueueBackendOperation({
      type: 'sendMessage',
      dedupeKey: `message:${clientMessageId}`,
      replaceExisting: true,
      payload: { conversationId: conversation.id, text: message.text, clientMessageId }
    });
    persistState();
    renderCurrentSection();
    showToast('No se pudo enviar ahora. Quedó en cola de sincronización.');
  }
}

function renderMessageAttachment(container, message = {}, mediaKind = getMessageMediaKind(message)) {
  if (!container) return;
  const mediaSrc = getMessageMediaDisplaySource(message);
  const mediaName = message.mediaName || message.attachmentName || 'Adjunto';
  const mediaSize = message.mediaSizeBytes || message.attachmentSize || 0;
  const shouldShowAttachment = Boolean(mediaSrc || mediaName || message.attachmentName);
  if (!shouldShowAttachment || mediaKind === 'none') return;

  if (mediaKind === 'image') {
    const figure = createMessageMediaShell(message, mediaName, mediaSize, 'image');

    if (mediaSrc) {
      const image = document.createElement('img');
      image.alt = '';
      image.loading = 'lazy';
      image.src = mediaSrc;
      image.onerror = () => renderMessageMediaFallback(figure, message, mediaKind, mediaName, mediaSize);
      figure.prepend(image);
    } else {
      renderMessageMediaFallback(figure, message, mediaKind, mediaName, mediaSize);
    }

    container.appendChild(figure);
    return;
  }

  if (mediaKind === 'video' && mediaSrc) {
    const figure = createMessageMediaShell(message, mediaName, mediaSize, 'video');
    const video = document.createElement('video');
    video.src = mediaSrc;
    video.controls = true;
    video.playsInline = true;
    video.onerror = () => renderMessageMediaFallback(figure, message, mediaKind, mediaName, mediaSize);
    figure.prepend(video);
    container.appendChild(figure);
    return;
  }

  if (mediaKind === 'audio' && mediaSrc) {
    const figure = createMessageMediaShell(message, mediaName, mediaSize, 'audio');
    const audio = document.createElement('audio');
    audio.src = mediaSrc;
    audio.controls = true;
    audio.onerror = () => renderMessageMediaFallback(figure, message, mediaKind, mediaName, mediaSize);
    figure.prepend(audio);
    container.appendChild(figure);
    return;
  }

  const chip = document.createElement(mediaSrc ? 'a' : 'span');
  chip.className = `attachment-chip attachment-chip-${mediaKind || 'file'}`;
  chip.title = mediaName;
  chip.textContent = `${getMessageMediaIcon(mediaKind)} ${mediaName}${mediaSize ? ` · ${formatFileSize(mediaSize)}` : ''}`;
  if (mediaSrc) {
    chip.href = mediaSrc;
    chip.download = mediaName || 'adjunto';
    chip.rel = 'noopener';
    chip.target = '_blank';
  }
  container.appendChild(chip);
}

function createMessageMediaShell(message = {}, mediaName = 'Adjunto', mediaSize = 0, mediaKind = 'file') {
  const figure = document.createElement('figure');
  figure.className = `message-media message-media-${mediaKind}`;
  figure.title = `${mediaName}${mediaSize ? ` · ${formatFileSize(mediaSize)}` : ''}`;

  if (mediaKind === 'image' && isMessageUploadInProgress(message)) {
    const progress = document.createElement('div');
    progress.className = 'message-media-progress';
    progress.setAttribute('aria-hidden', 'true');
    const bar = document.createElement('span');
    bar.style.width = `${getMessageUploadProgress(message)}%`;
    progress.appendChild(bar);
    figure.appendChild(progress);
  }

  const captionText = getVisibleMediaCaption(message, mediaName, mediaSize, mediaKind);
  if (captionText) {
    const caption = document.createElement('figcaption');
    caption.textContent = captionText;
    figure.appendChild(caption);
  }

  return figure;
}

function getVisibleMediaCaption(message = {}, mediaName = 'Adjunto', mediaSize = 0, mediaKind = 'file') {
  const explicitCaption = String(message.mediaCaption || message.caption || '').trim();

  if (mediaKind === 'image') {
    if (explicitCaption && !isAutomaticMediaCaption(explicitCaption, mediaKind)) return explicitCaption;
    return '';
  }

  return `${getMessageMediaIcon(mediaKind)} ${mediaName}${mediaSize ? ` · ${formatFileSize(mediaSize)}` : ''}${message.status ? ` · ${getMessageMediaStatusLabel(message.status)}` : ''}`;
}

function renderMessageMediaFallback(figure, message = {}, mediaKind = 'file', mediaName = 'Adjunto', mediaSize = 0) {
  if (!figure) return;
  const captionText = `${getMessageMediaIcon(mediaKind)} ${mediaName}${mediaSize ? ` · ${formatFileSize(mediaSize)}` : ''}${message.status ? ` · ${getMessageMediaStatusLabel(message.status)}` : ''}`;
  const progressOverlay = mediaKind === 'image' && isMessageUploadInProgress(message)
    ? figure.querySelector('.message-media-progress')
    : null;
  figure.innerHTML = '';
  const fallback = document.createElement('div');
  fallback.className = 'message-media-fallback';
  const icon = document.createElement('span');
  icon.setAttribute('aria-hidden', 'true');
  icon.textContent = getMessageMediaIcon(mediaKind);
  const label = document.createElement('strong');
  label.textContent = mediaKind === 'image' ? 'Imagen pendiente' : mediaKind === 'video' ? 'Video pendiente' : mediaKind === 'audio' ? 'Audio pendiente' : 'Archivo pendiente';
  fallback.append(icon, label);
  const caption = document.createElement('figcaption');
  caption.textContent = captionText;
  if (progressOverlay) figure.appendChild(progressOverlay);
  figure.append(fallback, caption);
}

function getMessageMediaKind(message = {}) {
  const explicitKind = String(message.mediaKind || '').trim().toLowerCase();
  if (['image', 'video', 'audio', 'file'].includes(explicitKind)) return explicitKind;

  const mimeType = String(message.attachmentMimeType || message.mediaMimeType || message.mimeType || '').trim().toLowerCase();
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType.startsWith('audio/')) return 'audio';

  const fileName = String(message.attachmentName || message.mediaName || message.filename || '').toLowerCase();
  if (/\.(png|jpe?g|webp|gif)$/i.test(fileName)) return 'image';
  if (/\.(mp4|webm|mov|m4v)$/i.test(fileName)) return 'video';
  if (/\.(mp3|m4a|aac|ogg|oga|wav|webm)$/i.test(fileName)) return 'audio';
  if (fileName || message.mediaUrl || message.mediaPreviewDataUrl || message.mediaId) return 'file';
  return 'none';
}

function getMessageMediaIcon(mediaKind = 'file') {
  if (mediaKind === 'image') return '▧';
  if (mediaKind === 'video') return '▶';
  if (mediaKind === 'audio') return '🎤';
  return '📎';
}

function getMessageMediaStatusLabel(status = '') {
  const normalized = String(status || '').trim().toLowerCase();
  if (!normalized || normalized === 'synced' || normalized === 'sent') return 'enviado';
  if (normalized === 'local') return 'local';
  if (normalized === 'uploading') return 'subiendo';
  if (normalized === 'creating-media-message') return 'registrando';
  if (normalized === 'pending-media-retry') return 'pendiente';
  if (normalized === 'failed') return 'fallido';
  return normalized.replace(/-/g, ' ');
}

function normalizeMessageMediaSource(value = '') {
  const source = String(value || '').trim();
  if (!source) return '';
  if (/^data:(image|video|audio|application|text)\//i.test(source) || /^blob:/i.test(source) || /^https?:\/\//i.test(source) || /^\.\//.test(source)) return source;
  if (source.startsWith('/api/') && CHATER_CONFIG.backendBaseUrl) {
    try {
      return buildApiUrl(source, { siteScoped: true });
    } catch (error) {
      return source;
    }
  }
  if (source.startsWith('/')) return source;
  return '';
}

const runtimeMediaObjectUrls = new Set();
const runtimePendingMediaRetries = new Map();
const RUNTIME_PENDING_MEDIA_RETRY_TTL_MS = 30 * 60 * 1000;
const RUNTIME_PENDING_MEDIA_RETRY_LIMIT = 24;

function prunePendingMediaRetries() {
  const now = Date.now();
  Array.from(runtimePendingMediaRetries.entries()).forEach(([key, entry]) => {
    if (!entry?.file || now - Number(entry.storedAt || 0) > RUNTIME_PENDING_MEDIA_RETRY_TTL_MS) {
      runtimePendingMediaRetries.delete(key);
    }
  });

  const overflow = runtimePendingMediaRetries.size - RUNTIME_PENDING_MEDIA_RETRY_LIMIT;
  if (overflow > 0) {
    Array.from(runtimePendingMediaRetries.entries())
      .sort((a, b) => Number(a[1]?.storedAt || 0) - Number(b[1]?.storedAt || 0))
      .slice(0, overflow)
      .forEach(([key]) => runtimePendingMediaRetries.delete(key));
  }
}

function rememberPendingMediaRetry(clientMessageId = '', file = null, metadata = {}) {
  const key = String(clientMessageId || '').trim();
  if (!key || !file) return;
  prunePendingMediaRetries();
  runtimePendingMediaRetries.set(key, {
    file,
    caption: String(metadata.caption || '').trim(),
    source: String(metadata.source || '').trim(),
    storedAt: Date.now()
  });
}

function getPendingMediaRetry(clientMessageId = '') {
  const key = String(clientMessageId || '').trim();
  if (!key) return null;
  prunePendingMediaRetries();
  return runtimePendingMediaRetries.get(key) || null;
}

function forgetPendingMediaRetry(clientMessageId = '') {
  const key = String(clientMessageId || '').trim();
  if (key) runtimePendingMediaRetries.delete(key);
}

function createRuntimeMediaObjectUrl(file) {
  if (!file || typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') return '';
  try {
    const objectUrl = URL.createObjectURL(file);
    runtimeMediaObjectUrls.add(objectUrl);
    return objectUrl;
  } catch (error) {
    return '';
  }
}

function revokeRuntimeMediaObjectUrls() {
  if (typeof URL === 'undefined' || typeof URL.revokeObjectURL !== 'function') return;
  runtimeMediaObjectUrls.forEach((objectUrl) => URL.revokeObjectURL(objectUrl));
  runtimeMediaObjectUrls.clear();
}

window.addEventListener('beforeunload', revokeRuntimeMediaObjectUrls);

async function createLocalMessageMediaPreview(file) {
  if (!file) return '';
  const mediaKind = getMessageMediaKind({ attachmentMimeType: file.type, attachmentName: file.name });
  if (!['image', 'video', 'audio'].includes(mediaKind)) return '';

  if (mediaKind === 'image' && Number(file.size || 0) > CHATER_CONFIG.messageMediaPreviewMaxBytes) {
    return createRuntimeMediaObjectUrl(file);
  }

  if (Number(file.size || 0) > CHATER_CONFIG.messageMediaPreviewMaxBytes) return '';

  try {
    return await readFileAsDataUrl(file);
  } catch (error) {
    return mediaKind === 'image' ? createRuntimeMediaObjectUrl(file) : '';
  }
}

async function createCompressedImageMessagePreview(file) {
  if (!file) return '';
  const mediaKind = getMessageMediaKind({ attachmentMimeType: file.type, attachmentName: file.name });
  if (mediaKind !== 'image') return '';
  if (Number(file.size || 0) > CHATER_CONFIG.messageMediaPreviewMaxBytes) return createRuntimeMediaObjectUrl(file);

  try {
    return await readFileAsDataUrl(file);
  } catch (error) {
    return createRuntimeMediaObjectUrl(file);
  }
}

function getMessageMediaDisplaySource(message = {}) {
  const previewSource = normalizeMessageMediaSource(message.mediaPreviewDataUrl || '');
  const remoteSource = normalizeMessageMediaSource(message.mediaUrl || '');
  if (isMessageUploadInProgress(message)) return previewSource || remoteSource;
  return remoteSource || previewSource;
}

function scrollToConversationMessage(message = {}) {
  if (!message || !messagesContainer) return false;
  const identitySet = new Set(getMessageIdentityCandidates(message));
  const elements = Array.from(messagesContainer.querySelectorAll('[data-message-id], [data-client-mutation-id]'));
  const target = elements.find((element) => {
    return [element.dataset.messageId, element.dataset.clientMutationId]
      .filter(Boolean)
      .some((identity) => identitySet.has(identity));
  });

  if (!target) {
    showToast('Mensaje encontrado. Abre el historial completo si no aparece en pantalla.');
    return false;
  }

  target.scrollIntoView({ block: 'center', behavior: 'smooth' });
  target.classList.add('message-search-highlight');
  window.setTimeout(() => target.classList.remove('message-search-highlight'), 1700);
  showToast('Mensaje encontrado en esta conversación.');
  return true;
}

function setComposerEnabled(enabled) {
  if (!enabled) closeEmojiPanel();
  messageInput.disabled = !enabled;
  sendButton.disabled = !enabled;
  emojiButton.disabled = !enabled;
  attachButton.disabled = !enabled;
  if (cameraComposerButton) cameraComposerButton.disabled = !enabled;
  if (quickComposerButton) quickComposerButton.disabled = !enabled;
  if (voiceNoteButton) voiceNoteButton.disabled = !enabled;
  audioCallButton.disabled = !enabled;
  videoCallButton.disabled = !enabled;
  updateComposerActionState();
  if (pinConversationButton && (activeSection !== 'chats' || !getActiveConversation())) {
    pinConversationButton.disabled = true;
  }
  if (archiveConversationButton && (activeSection !== 'chats' || !getActiveConversation())) {
    archiveConversationButton.disabled = true;
  }
  if (conversationMenuButton && (activeSection !== 'chats' || !getActiveConversation())) {
    conversationMenuButton.disabled = true;
  }
}

function updateComposerActionState() {
  const hasText = Boolean(messageInput?.value?.trim());
  const disabled = Boolean(messageInput?.disabled);
  const recordingVoice = Boolean(voiceRecorderState.recorder);

  if (sendButton) {
    sendButton.hidden = disabled || !hasText || recordingVoice;
    sendButton.disabled = disabled || !hasText || recordingVoice;
  }

  if (voiceNoteButton) {
    voiceNoteButton.hidden = disabled || (hasText && !recordingVoice);
    voiceNoteButton.disabled = disabled;
  }
}

function waitForPromiseWithTimeout(promise, timeoutMs = CONTACT_SEND_SYNC_SOFT_TIMEOUT_MS) {
  return new Promise((resolve) => {
    let settled = false;
    const timer = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve({ timedOut: true });
    }, Math.max(250, Number(timeoutMs) || CONTACT_SEND_SYNC_SOFT_TIMEOUT_MS));

    Promise.resolve(promise)
      .then((value) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        resolve({ timedOut: false, value });
      })
      .catch((error) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        resolve({ timedOut: false, error });
      });
  });
}

function isConversationWaitingForBackendSync(conversationId = '') {
  const normalizedId = String(conversationId || '').trim();
  if (!normalizedId) return false;
  const conversation = appState.conversations.find((item) => String(item.id || '') === normalizedId);
  if (!conversation) return false;
  if (contactConversationSyncState.inFlight.has(normalizedId)) return true;
  return ['pending', 'syncing'].includes(String(conversation.contactSyncStatus || '').trim().toLowerCase());
}

function buildContactSyncPayloadFromConversation(conversation = {}) {
  const remote = getConversationRemoteIdentities(conversation)[0] || {};
  return normalizeContactCreationInput({
    name: conversation.name || conversation.displayName || remote.name || '',
    email: remote.email || conversation.email || conversation.contactEmail || conversation.userEmail || '',
    userId: remote.userId || conversation.contactUserId || conversation.remoteUserId || conversation.otherUserId || '',
    source: conversation.contactSyncSource || 'conversation-send'
  });
}

async function ensureConversationReadyForMessage(conversation, sessionGuard = captureSessionGuard()) {
  // Compatibilidad conservada para módulos antiguos que puedan invocar esta función.
  // El envío real de ChatER ya no espera sincronizaciones previas de contacto: igual que
  // estadisponible, el mensaje sale directo al backend de chat y MENSAJESx resuelve la
  // conversación en Redis con los datos del propio payload.
  return Boolean(conversation?.id) && isSessionGuardCurrent(sessionGuard);
}

async function sendMessage(text) {
  const sessionGuard = captureSessionGuard();
  const conversation = getActiveConversation();
  if (!conversation) return;
  if (conversation.blocked) {
    showToast('Desbloquea este contacto para enviar mensajes.');
    return;
  }

  if (!isSessionGuardCurrent(sessionGuard)) return;

  const clientMessageId = generateClientMutationId();
  const sentAt = new Date().toISOString();
  const outgoing = {
    id: clientMessageId,
    clientMutationId: clientMessageId,
    type: 'outgoing',
    text,
    time: getCurrentTime(),
    createdAt: sentAt,
    clientTime: sentAt,
    expiresAt: getChatEphemeralExpiresAtIso(sentAt),
    ttlSeconds: CHATER_EPHEMERAL_TTL_SECONDS,
    status: 'local',
    receiptStatus: 'local',
    senderUserId: getCurrentUserIdentifier(),
    senderUserEmail: getSessionEmail(),
    backendReceivedAt: '',
    deliveredAt: '',
    readAt: ''
  };

  conversation.messages.push(outgoing);
  conversation.status = 'Enviando...';
  persistState();
  renderChatList(searchInput.value);
  renderConversation();
  // Camino eficiente tipo estadisponible: al enviar no se hace una publicación STREMEx
  // previa desde el cliente. El único POST necesario es /api/v1/chats/send y
  // MENSAJESx publica el evento chat.message canónico inmediatamente al persistir.
  // Esto evita tráfico duplicado, preserva orden backend y mantiene checks por eventos reales.

  try {
    const payload = await apiClient.sendMessage(conversation.id, text, clientMessageId, { conversation });
    if (!isSessionGuardCurrent(sessionGuard)) return;
    if (payload?.offlineDemo) {
      outgoing.status = 'local';
      conversation.status = 'Guardado localmente';
    } else {
      markQueuedMessageSynced(conversation.id, clientMessageId, payload);
      publishRealtimeMessageCreated(conversation, outgoing, payload, { clientMessageId });
    }
  } catch (error) {
    if (!isSessionGuardCurrent(sessionGuard)) return;
    outgoing.status = 'pending';
    outgoing.receiptStatus = 'pending';
    conversation.status = 'Pendiente de sincronizar';
    enqueueBackendOperation({
      type: 'sendMessage',
      dedupeKey: `message:${clientMessageId}`,
      payload: { conversationId: conversation.id, text, clientMessageId, createdAt: outgoing.createdAt, clientTime: outgoing.clientTime, expiresAt: outgoing.expiresAt }
    });
    showToast('Mensaje guardado localmente y en cola de sincronización.');
  } finally {
    if (isSessionGuardCurrent(sessionGuard)) {
      persistState();
      renderChatList(searchInput.value);
      renderConversation();
    }
  }
}

function openArchivedChatsModal() {
  closeTransientPanels();
  const archivedConversations = getArchivedConversations();
  const container = document.createElement('div');
  container.className = 'archived-modal-list';

  if (!archivedConversations.length) {
    container.innerHTML = `
      <div class="empty-state modal-empty-state">
        <strong>No hay chats archivados</strong>
        Cuando archives una conversación aparecerá aquí y podrás restaurarla sin perder mensajes.
      </div>
    `;
    setModal('Archivados', container, 'archived');
    return;
  }

  const summary = document.createElement('p');
  summary.className = 'modal-copy';
  summary.textContent = 'Los chats archivados se conservan fuera de la lista principal. Puedes abrirlos o restaurarlos en cualquier momento.';
  container.appendChild(summary);

  archivedConversations.forEach((conversation) => {
    const row = document.createElement('article');
    row.className = 'archived-chat-row';
    row.innerHTML = `
      <div class="archived-chat-main"></div>
      <div class="archived-chat-actions">
        <button class="secondary-button" type="button" data-action="open" data-conversation-id="${escapeHTML(conversation.id)}">Abrir</button>
        <button class="primary-button" type="button" data-action="restore" data-conversation-id="${escapeHTML(conversation.id)}">Restaurar</button>
      </div>
    `;

    const main = row.querySelector('.archived-chat-main');
    const avatar = createAvatarElement(conversation, 'chat-item-avatar');
    attachConversationProfilePreview(avatar, conversation);
    const lastMessage = conversation.messages.at(-1);
    const copy = document.createElement('span');
    copy.innerHTML = `<strong>${conversation.pinned ? '<span class="pinned-badge archived-pin" aria-label="Chat fijado" title="Chat fijado">📌</span>' : ''}${escapeHTML(conversation.name)}</strong><small>${escapeHTML(getMessagePreviewText(lastMessage, conversation.email || 'Sin mensajes todavía'))}</small>`;
    main.append(avatar, copy);
    container.appendChild(row);
  });

  container.addEventListener('click', async (event) => {
    const actionButton = event.target.closest('[data-action][data-conversation-id]');
    if (!actionButton) return;
    const conversation = appState.conversations.find((item) => item.id === actionButton.dataset.conversationId);
    if (!conversation) return;

    if (actionButton.dataset.action === 'open') {
      openArchivedConversation(conversation);
      return;
    }

    if (actionButton.dataset.action === 'restore') {
      await setConversationArchived(conversation, false, { keepActive: true });
      openArchivedConversation(conversation);
    }
  });

  setModal('Archivados', container, 'archived');
}

function openArchivedConversation(conversation) {
  if (!conversation || conversation.deleted) return;

  activeConversationId = conversation.id;
  activeSection = 'chats';
  setActiveChatListGroup('archived');
  if (searchInput) searchInput.value = '';
  closeTransientPanels();
  closeModal();
  markConversationRead(conversation);
  renderCurrentSection();
  chatView.classList.add('chat-open');
  sendStremeEvent({ type: 'chat.opened', chatId: conversation.id });
  hydrateConversationMessages(conversation.id);
}


function getConversationMenuActions(conversation = getActiveConversation()) {
  if (!conversation) return [];

  return [
    {
      id: 'info',
      icon: 'ℹ',
      title: 'Información del chat',
      description: 'Ver correo, estado local y sincronización de esta conversación.'
    },
    {
      id: 'search',
      icon: '⌕',
      title: 'Buscar en conversación',
      description: 'Encuentra mensajes o adjuntos dentro del historial local cargado.'
    },
    {
      id: 'pin',
      icon: conversation.pinned ? '📌' : '⌖',
      title: conversation.pinned ? 'Desfijar conversación' : 'Fijar conversación',
      description: conversation.pinned ? 'Quitar este chat de la parte superior.' : 'Mantener este chat arriba en la lista principal.'
    },
    {
      id: 'archive',
      icon: conversation.archived ? '↥' : '⇩',
      title: conversation.archived ? 'Restaurar conversación' : 'Archivar conversación',
      description: conversation.archived ? 'Devolver este chat a la lista principal.' : 'Mover este chat a Archivados sin borrar mensajes.'
    },
    {
      id: 'block',
      icon: conversation.blocked ? '✓' : '⊘',
      title: conversation.blocked ? 'Desbloquear contacto' : 'Bloquear contacto',
      description: conversation.blocked ? 'Permitir nuevamente mensajes y llamadas en este chat.' : 'Impedir mensajes y llamadas desde esta conversación.'
    },
    {
      id: 'report',
      icon: '!',
      title: 'Reportar conversación',
      description: 'Enviar un reporte de moderación a memoriaBACKEND con evidencia mínima.'
    }
  ];
}

function openConversationMenuModal() {
  closeTransientPanels();
  const conversation = getActiveConversation();
  if (!conversation || activeSection !== 'chats') {
    showToast('Selecciona un chat para ver sus opciones.');
    return;
  }

  const container = document.createElement('div');
  container.className = 'quick-composer-list';
  container.innerHTML = `
    <p class="modal-copy">Opciones de producción para este chat por correo electrónico. Los cambios locales se sincronizan con memoriaBACKEND cuando está configurado.</p>
    ${getConversationMenuActions(conversation).map((action) => `
      <button class="quick-composer-action" type="button" data-conversation-action="${escapeHTML(action.id)}">
        <span class="quick-composer-icon">${escapeHTML(action.icon)}</span>
        <span><strong>${escapeHTML(action.title)}</strong><small>${escapeHTML(action.description)}</small></span>
      </button>
    `).join('')}
  `;

  container.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-conversation-action]');
    if (!button) return;

    const action = button.dataset.conversationAction;
    if (action === 'info') {
      openConversationInfoModal(conversation);
      return;
    }

    if (action === 'search') {
      openConversationSearchModal(conversation);
      return;
    }

    if (action === 'pin') {
      await setConversationPinned(conversation, !conversation.pinned);
      closeModal();
      openConversationMenuModal();
      return;
    }

    if (action === 'archive') {
      const restoringArchivedConversation = Boolean(conversation.archived);
      await setConversationArchived(conversation, !conversation.archived, { keepActive: restoringArchivedConversation });
      closeModal();
      if (restoringArchivedConversation || activeConversationId === conversation.id) {
        openConversationMenuModal();
      }
      return;
    }

    if (action === 'block') {
      await toggleConversationBlock(conversation);
      closeModal();
      if (activeConversationId === conversation.id) openConversationMenuModal();
      return;
    }

    if (action === 'report') {
      openReportConversationModal(conversation);
    }
  });

  setModal('Opciones de conversación', container, 'conversation-menu');
}

function openReportConversationModal(conversation = getActiveConversation()) {
  if (!conversation) {
    showToast('Selecciona un chat para reportarlo.');
    return;
  }

  const container = document.createElement('form');
  container.innerHTML = `
    <p class="modal-copy">El reporte se sincroniza con <code>/api/v1/reportes-moderacion</code>. Incluye solo evidencia mínima del chat y no sustituye una revisión humana.</p>
    <label for="reportReasonSelect">Motivo</label>
    <select id="reportReasonSelect" required>
      <option value="spam">Spam o promoción abusiva</option>
      <option value="abuse">Acoso o conducta abusiva</option>
      <option value="fraud">Posible fraude o suplantación</option>
      <option value="illegal_content">Contenido ilegal o peligroso</option>
      <option value="other">Otro motivo</option>
    </select>
    <label for="reportDetailsInput">Detalle opcional</label>
    <textarea id="reportDetailsInput" rows="3" maxlength="600" placeholder="Describe brevemente qué ocurre"></textarea>
    <div class="quick-action-grid">
      <button class="primary-button" type="submit">Enviar reporte</button>
      <button class="secondary-button" type="button" data-report-action="back">Volver</button>
    </div>
  `;

  container.addEventListener('click', (event) => {
    const button = event.target.closest('[data-report-action="back"]');
    if (!button) return;
    event.preventDefault();
    openConversationMenuModal();
  });

  container.addEventListener('submit', async (event) => {
    event.preventDefault();
    const submitButton = container.querySelector('button[type="submit"]');
    submitButton.disabled = true;
    const reason = container.querySelector('#reportReasonSelect')?.value || 'other';
    const details = container.querySelector('#reportDetailsInput')?.value || '';
    await submitConversationReport(conversation, reason, details);
    closeModal();
  });

  setModal('Reportar conversación', container, 'report-conversation');
}

function openConversationInfoModal(conversation = getActiveConversation()) {
  if (!conversation) {
    showToast('Selecciona un chat para ver su información.');
    return;
  }

  const lastMessage = conversation.messages.at(-1);
  const container = document.createElement('div');
  container.innerHTML = `
    <div class="api-status-grid">
      <div><strong>Nombre</strong><span>${escapeHTML(conversation.name || 'Sin nombre')}</span></div>
      <div><strong>Correo</strong><span>${escapeHTML(conversation.email || conversation.contactEmail || 'Correo no disponible')}</span></div>
      <div><strong>Estado</strong><span>${escapeHTML(conversation.archived ? 'Archivado' : (conversation.status || 'Activo'))}</span></div>
      <div><strong>Mensajes locales</strong><span>${conversation.messages.length}</span></div>
      <div><strong>No leídos</strong><span>${Number(conversation.unread || 0)}</span></div>
      <div><strong>Fijado</strong><span>${conversation.pinned ? 'Sí' : 'No'}</span></div>
      <div><strong>Bloqueo</strong><span>${escapeHTML(conversation.blocked ? `Activo · ${conversation.blockSyncStatus || 'local'}` : (conversation.blockSyncStatus ? `Inactivo · ${conversation.blockSyncStatus}` : 'No bloqueado'))}</span></div>
      <div><strong>Moderación</strong><span>${escapeHTML(conversation.reportSyncStatus ? `Reporte ${conversation.reportSyncStatus}` : 'Sin reportes locales')}</span></div>
      <div><strong>Historial memoriaBACKEND</strong><span>${conversation.messagesHydrated ? 'Cargado o en modo local' : 'Pendiente de cargar al abrir el chat'}</span></div>
      <div><strong>Último mensaje</strong><span>${escapeHTML(lastMessage ? `${lastMessage.time || 'sin hora'} · ${getMessagePreviewText(lastMessage, 'mensaje')}` : 'Sin mensajes')}</span></div>
    </div>
    <div class="quick-action-grid">
      <button class="primary-button" type="button" data-info-action="search">Buscar mensajes</button>
      <button class="secondary-button" type="button" data-info-action="back">Volver a opciones</button>
    </div>
  `;

  container.addEventListener('click', (event) => {
    const button = event.target.closest('[data-info-action]');
    if (!button) return;
    if (button.dataset.infoAction === 'search') openConversationSearchModal(conversation);
    if (button.dataset.infoAction === 'back') openConversationMenuModal();
  });

  setModal('Información del chat', container, 'conversation-info');
}

function openConversationSearchModal(conversation = getActiveConversation()) {
  if (!conversation) {
    showToast('Selecciona un chat para buscar mensajes.');
    return;
  }

  let remoteSearchRequestId = 0;
  const container = document.createElement('div');
  container.innerHTML = `
    <label for="conversationSearchInput">Buscar mensaje o adjunto</label>
    <input id="conversationSearchInput" type="search" placeholder="Escribe una palabra del mensaje" autocomplete="off" />
    <p class="modal-copy">La búsqueda revisa el historial local cargado y, si memoriaBACKEND está configurado, consulta BUSQUEDAx en <code>/api/v1/busqueda/buscar</code> para encontrar mensajes no hidratados.</p>
    <div class="quick-composer-list" data-search-results></div>
    <div class="quick-composer-list" data-remote-search-results></div>
  `;

  const input = container.querySelector('#conversationSearchInput');
  const results = container.querySelector('[data-search-results]');
  const remoteResults = container.querySelector('[data-remote-search-results]');

  const renderLocalResults = () => {
    const query = normalizeUiSearchText(input.value);
    const matches = conversation.messages
      .map((message, index) => ({ message, index }))
      .filter(({ message }) => {
        if (!query) return false;
        return [message.text, message.attachmentName, message.status, message.time]
          .filter(Boolean)
          .some((value) => valueMatchesUiSearch(value, query));
      })
      .slice(-20)
      .reverse();

    if (!query) {
      results.innerHTML = '<p class="modal-copy">Escribe para ver coincidencias dentro de esta conversación.</p>';
      return;
    }

    if (!matches.length) {
      results.innerHTML = '<p class="modal-copy">No hay coincidencias en el historial local cargado.</p>';
      return;
    }

    results.innerHTML = `
      <p class="modal-copy">Coincidencias locales</p>
      ${matches.map(({ message, index }) => `
        <button class="quick-composer-action" type="button" data-result-index="${index}">
          <span class="quick-composer-icon">${message.type === 'outgoing' ? '↗' : '↙'}</span>
          <span><strong>${escapeHTML(message.text || message.attachmentName || 'Mensaje')}</strong><small>${escapeHTML(message.time || 'sin hora')} · ${escapeHTML(message.status || (message.type === 'outgoing' ? 'enviado' : 'recibido'))}</small></span>
        </button>
      `).join('')}
    `;
  };

  const renderRemoteResults = (matches = [], query = '') => {
    if (!CHATER_CONFIG.backendBaseUrl) {
      remoteResults.innerHTML = '<p class="modal-copy">BUSQUEDAx se activa al configurar MEMORIA_BACKEND_URL.</p>';
      return;
    }

    if (!query) {
      remoteResults.innerHTML = '<p class="modal-copy">BUSQUEDAx consultará memoriaBACKEND cuando escribas al menos 2 caracteres.</p>';
      return;
    }

    if (query.length < 2) {
      remoteResults.innerHTML = '<p class="modal-copy">Escribe al menos 2 caracteres para consultar BUSQUEDAx.</p>';
      return;
    }

    if (!matches.length) {
      remoteResults.innerHTML = '<p class="modal-copy">BUSQUEDAx no devolvió coincidencias remotas para esta conversación.</p>';
      return;
    }

    remoteResults.innerHTML = `
      <p class="modal-copy">Coincidencias remotas de memoriaBACKEND</p>
      ${matches.map((match, index) => `
        <button class="quick-composer-action" type="button" data-remote-result-index="${index}">
          <span class="quick-composer-icon">API</span>
          <span><strong>${escapeHTML(match.title || match.message.text || 'Resultado remoto')}</strong><small>${escapeHTML(match.preview || match.message.attachmentName || 'Resultado de BUSQUEDAx')} · ${escapeHTML(match.time || match.message.time || 'sin hora')}</small></span>
        </button>
      `).join('')}
    `;
  };

  const runRemoteSearch = async () => {
    const query = input.value.trim();
    const currentRequestId = ++remoteSearchRequestId;

    if (!CHATER_CONFIG.backendBaseUrl || query.length < 2) {
      renderRemoteResults([], query);
      return;
    }

    remoteResults.innerHTML = '<p class="modal-copy">Consultando BUSQUEDAx en memoriaBACKEND…</p>';

    try {
      const payload = await apiClient.searchContent(query, {
        conversationId: conversation.id,
        entityTypes: 'mensajes,archivos',
        limit: 20
      });
      if (currentRequestId !== remoteSearchRequestId || !document.body.contains(container)) return;
      const matches = normalizeSearchResultsFromApi(payload, conversation.id);
      container.__remoteSearchMatches = matches;
      renderRemoteResults(matches, query);
    } catch (error) {
      if (currentRequestId !== remoteSearchRequestId || !document.body.contains(container)) return;
      container.__remoteSearchMatches = [];
      remoteResults.innerHTML = `<p class="modal-copy">No se pudo consultar BUSQUEDAx: ${escapeHTML(extractBackendErrorMessage(error) || error?.message || 'búsqueda remota no disponible')}.</p>`;
    }
  };

  let remoteSearchTimer = null;
  const scheduleRemoteSearch = () => {
    clearTimeout(remoteSearchTimer);
    remoteSearchTimer = window.setTimeout(runRemoteSearch, 350);
  };

  input.addEventListener('input', () => {
    renderLocalResults();
    scheduleRemoteSearch();
  });

  results.addEventListener('click', (event) => {
    const resultButton = event.target.closest('[data-result-index]');
    if (!resultButton) return;
    const message = conversation.messages[Number(resultButton.dataset.resultIndex)];
    closeModal();
    activeConversationId = conversation.id;
    activeSection = 'chats';
    chatView.classList.add('chat-open');
    renderCurrentSection();
    window.setTimeout(() => scrollToConversationMessage(message), 50);
  });

  remoteResults.addEventListener('click', (event) => {
    const resultButton = event.target.closest('[data-remote-result-index]');
    if (!resultButton) return;
    const match = (container.__remoteSearchMatches || [])[Number(resultButton.dataset.remoteResultIndex)];
    if (!match) return;
    const message = ensureRemoteSearchMessageInConversation(conversation, match);
    closeModal();
    activeConversationId = conversation.id;
    activeSection = 'chats';
    chatView.classList.add('chat-open');
    persistState();
    renderCurrentSection();
    window.setTimeout(() => scrollToConversationMessage(message), 50);
  });

  setModal('Buscar en conversación', container, 'conversation-search');
  renderLocalResults();
  renderRemoteResults([], '');
  input.focus();
}

function normalizeSearchResultsFromApi(payload = {}, fallbackConversationId = '') {
  const rawResults = extractArrayFromPayload(payload, ['searchResults', 'busqueda', 'results', 'resultados', 'items', 'records']);
  return rawResults
    .map((raw) => normalizeSearchResultFromApi(raw, fallbackConversationId))
    .filter((result) => {
      if (!result || !(result.message.text || result.message.attachmentName || result.title || result.preview || result.message.id)) return false;
      if (!fallbackConversationId || !result.conversationId) return true;
      return String(result.conversationId) === String(fallbackConversationId);
    });
}

function normalizeSearchResultFromApi(raw = {}, fallbackConversationId = '') {
  if (!raw || typeof raw !== 'object') return null;
  const nested = getFirstObjectCandidate(raw.item, raw.entity, raw.result, raw.document, raw.data, raw.mensaje, raw.message, raw.archivo, raw.file);
  const source = Object.keys(nested).length ? { ...nested, ...raw } : raw;
  const message = normalizeMessageFromApi({
    ...source,
    id: source.messageId || source.id || source.entityId || source.resultId,
    text: source.text || source.body || source.snippet || source.preview || source.resumen || source.titulo || source.title || '',
    attachmentName: source.attachmentName || source.filename || source.fileName || source.nombreArchivo || '',
    createdAt: source.createdAt || source.timestamp || source.fecha || source.updatedAt || '',
    status: source.status || 'remote-search'
  });
  const conversationId = String(source.conversationId || source.chatId || source.parentId || fallbackConversationId || '').trim();

  return {
    id: String(source.id || source.resultId || source.entityId || message.id || generateClientMutationId()),
    entityType: String(source.entityType || source.type || source.tipo || source.kind || 'mensaje'),
    conversationId,
    title: String(source.title || source.titulo || source.subject || message.text || message.attachmentName || '').trim(),
    preview: String(source.preview || source.snippet || source.resumen || source.text || source.body || '').trim(),
    time: source.time || formatEventTime(source.createdAt || source.timestamp || source.fecha || ''),
    message
  };
}

function ensureRemoteSearchMessageInConversation(conversation, match = {}) {
  if (!conversation || !match?.message) return null;
  const existing = findExistingMessageByIdentity(conversation.messages || [], match.message);
  if (existing) return existing;

  const message = {
    ...match.message,
    id: match.message.id || match.id || generateClientMutationId(),
    status: match.message.status || 'remote-search'
  };
  conversation.messages = Array.isArray(conversation.messages) ? conversation.messages : [];
  conversation.messages.push(message);
  conversation.messages = mergeMessagesByIdentity(conversation.messages, []);
  conversation.messagesHydrated = true;
  return findExistingMessageByIdentity(conversation.messages, message) || message;
}

async function toggleActiveConversationPin() {
  const conversation = getActiveConversation();
  if (!conversation) return;
  await setConversationPinned(conversation, !conversation.pinned);
}

async function setConversationPinned(conversation, pinned) {
  if (!conversation) return;

  const sessionGuard = captureSessionGuard();
  const clientMutationId = generateClientMutationId();
  const previousPinned = Boolean(conversation.pinned);
  conversation.pinned = Boolean(pinned);
  conversation.pinSyncStatus = CHATER_CONFIG.backendBaseUrl ? 'syncing' : 'local';
  conversation.status = pinned ? 'Chat fijado' : 'Chat desfijado';

  persistState();
  renderCurrentSection();
  showToast(pinned ? 'Chat fijado arriba.' : 'Chat desfijado.');

  if (!CHATER_CONFIG.backendBaseUrl) return;

  const patch = { pinned: Boolean(pinned), clientMutationId };
  try {
    await apiClient.updateConversation(conversation.id, patch);
    if (!isSessionGuardCurrent(sessionGuard)) return;
    markQueuedConversationPatchSynced(conversation.id, patch);
  } catch (error) {
    if (!isSessionGuardCurrent(sessionGuard)) return;
    const stillSamePinState = Boolean(conversation.pinned) === Boolean(pinned);
    conversation.pinSyncStatus = stillSamePinState ? 'pending' : conversation.pinSyncStatus;
    if (!stillSamePinState) conversation.pinned = previousPinned;
    enqueueBackendOperation({
      type: 'updateConversation',
      dedupeKey: `conversation-pin:${conversation.id}:${clientMutationId}`,
      payload: { conversationId: conversation.id, patch }
    });
    persistState();
    renderCurrentSection();
  }
}


function buildConversationArchivePatch(archived, archiveChangedAt = new Date().toISOString(), clientMutationId = generateClientMutationId()) {
  const actor = getCurrentParticipantLifecycleIdentity();
  const nextArchived = Boolean(archived);
  return {
    archived: nextArchived,
    archivedForCurrentUser: nextArchived,
    isArchivedForCurrentUser: nextArchived,
    archivedForMe: nextArchived,
    archiveChangedAt,
    [nextArchived ? 'archivedAt' : 'restoredAt']: archiveChangedAt,
    archiveVisibilityScope: 'actor_only',
    visibilityScope: 'actor_only',
    actorUserId: actor.userId,
    actorUserEmail: actor.userEmail,
    actorIdentityKey: normalizeLifecycleIdentityKeyFromValue(actor),
    restoreMustNotRearchiveAutomatically: !nextArchived,
    archiveFinalOnlyByManualAction: true,
    clientMutationId
  };
}

function applyLocalConversationArchiveState(conversation = {}, archived = false, options = {}) {
  if (!conversation) return;
  const archiveChangedAt = options.archiveChangedAt || options.changedAt || new Date().toISOString();
  const clientMutationId = options.clientMutationId || generateClientMutationId();

  conversation.archived = Boolean(archived);
  conversation.archiveSyncStatus = options.syncStatus || (CHATER_CONFIG.backendBaseUrl ? 'syncing' : 'local');
  conversation.archiveChangedAt = archiveChangedAt;
  conversation.archiveClientMutationId = clientMutationId;
  conversation.archiveLocalMutationId = clientMutationId;
  conversation.archiveLocalChangedAt = archiveChangedAt;
  conversation.archiveDesiredArchived = Boolean(archived);
  conversation.status = options.status || (archived ? 'Archivado' : 'Restaurado');
}

function snapshotConversationArchiveState(conversation = {}) {
  return {
    archived: Boolean(conversation.archived),
    archiveSyncStatus: conversation.archiveSyncStatus || '',
    archiveChangedAt: conversation.archiveChangedAt || '',
    archiveClientMutationId: conversation.archiveClientMutationId || '',
    archiveLocalMutationId: conversation.archiveLocalMutationId || '',
    archiveLocalChangedAt: conversation.archiveLocalChangedAt || '',
    archiveDesiredArchived: Object.prototype.hasOwnProperty.call(conversation, 'archiveDesiredArchived')
      ? Boolean(conversation.archiveDesiredArchived)
      : undefined,
    status: conversation.status || ''
  };
}

function restoreConversationArchiveSnapshot(conversation = {}, snapshot = {}) {
  if (!conversation || !snapshot) return;
  conversation.archived = Boolean(snapshot.archived);
  conversation.archiveSyncStatus = snapshot.archiveSyncStatus || '';
  conversation.archiveChangedAt = snapshot.archiveChangedAt || '';
  conversation.archiveClientMutationId = snapshot.archiveClientMutationId || '';
  conversation.archiveLocalMutationId = snapshot.archiveLocalMutationId || '';
  conversation.archiveLocalChangedAt = snapshot.archiveLocalChangedAt || '';
  if (snapshot.archiveDesiredArchived === undefined) {
    delete conversation.archiveDesiredArchived;
  } else {
    conversation.archiveDesiredArchived = Boolean(snapshot.archiveDesiredArchived);
  }
  conversation.status = snapshot.status || conversation.status || '';
}

async function syncConversationArchiveState(conversation = {}, patch = {}, sessionGuard = captureSessionGuard()) {
  if (!conversation || !CHATER_CONFIG.backendBaseUrl) return;

  try {
    await apiClient.updateConversation(conversation.id, patch);
    if (!isSessionGuardCurrent(sessionGuard)) return;
    markQueuedConversationPatchSynced(conversation.id, patch);
  } catch (error) {
    if (!isSessionGuardCurrent(sessionGuard)) return;
    const expectedArchived = Boolean(patch.archived);
    const stillSameArchiveState = Boolean(conversation.archived) === expectedArchived;
    conversation.archiveSyncStatus = stillSameArchiveState ? 'pending' : conversation.archiveSyncStatus;
    enqueueBackendOperation({
      type: 'updateConversation',
      dedupeKey: getConversationArchiveOutboxKey(conversation.id),
      replaceExisting: true,
      payload: { conversationId: conversation.id, patch }
    });
    persistState();
    renderCurrentSection();
  }
}

async function toggleActiveConversationArchive() {
  const conversation = getActiveConversation();
  if (!conversation) return;
  await setConversationArchived(conversation, !conversation.archived);
}

async function setConversationArchived(conversation, archived, options = {}) {
  if (!conversation) return;

  const sessionGuard = captureSessionGuard();
  const clientMutationId = generateClientMutationId();
  const archiveChangedAt = new Date().toISOString();
  const previousArchiveState = snapshotConversationArchiveState(conversation);
  const patch = buildConversationArchivePatch(archived, archiveChangedAt, clientMutationId);

  applyLocalConversationArchiveState(conversation, archived, {
    archiveChangedAt,
    clientMutationId,
    syncStatus: CHATER_CONFIG.backendBaseUrl ? 'syncing' : 'local',
    status: archived ? 'Archivado' : 'Restaurado'
  });
  removeQueuedArchiveOperationsForConversation(conversation.id, sessionGuard.email);

  if (archived && activeConversationId === conversation.id && !options.keepActive) {
    activeConversationId = getFirstVisibleConversationId(conversation.id);
    chatView.classList.remove('chat-open');
  }

  if (!archived && isArchivedChatListOpen() && !options.keepArchivedList) {
    setActiveChatListGroup('main');
  }

  persistState();
  renderCurrentSection();
  if (!options.silent) showToast(archived ? 'Chat archivado.' : 'Chat restaurado.');

  if (!CHATER_CONFIG.backendBaseUrl) return;

  try {
    await apiClient.updateConversation(conversation.id, patch);
    if (!isSessionGuardCurrent(sessionGuard)) return;
    markQueuedConversationPatchSynced(conversation.id, patch);
  } catch (error) {
    if (!isSessionGuardCurrent(sessionGuard)) return;
    const stillSameArchiveState = Boolean(conversation.archived) === Boolean(archived);
    conversation.archiveSyncStatus = stillSameArchiveState ? 'pending' : conversation.archiveSyncStatus;
    if (!stillSameArchiveState) restoreConversationArchiveSnapshot(conversation, previousArchiveState);
    enqueueBackendOperation({
      type: 'updateConversation',
      dedupeKey: getConversationArchiveOutboxKey(conversation.id),
      replaceExisting: true,
      payload: { conversationId: conversation.id, patch }
    });
    persistState();
    renderCurrentSection();
  }
}

function getConversationById(conversationId = '') {
  const normalizedId = String(conversationId || '').trim();
  if (!normalizedId) return null;
  return appState.conversations.find((conversation) => String(conversation.id || '') === normalizedId && !conversation.deleted) || null;
}

function getSelectedChatConversations() {
  return Array.from(chatSelectionState.selectedIds)
    .map(getConversationById)
    .filter(Boolean);
}

function buildConversationShortcutUrl(conversation = {}) {
  const url = new URL(window.location.href);
  url.hash = `chat=${encodeURIComponent(conversation.id || '')}`;
  return url.toString();
}

function attachChatItemLongPress(button, conversation) {
  if (!button || !conversation) return;
  let timer = null;
  let startX = 0;
  let startY = 0;

  const clearTimer = () => {
    if (!timer) return;
    clearTimeout(timer);
    timer = null;
  };

  button.addEventListener('pointerdown', (event) => {
    if (activeSection !== 'chats') return;
    if (event.button !== undefined && event.button !== 0) return;
    startX = event.clientX;
    startY = event.clientY;
    button.dataset.longPressHandled = '0';
    clearTimer();
    timer = setTimeout(() => {
      button.dataset.longPressHandled = '1';
      enterChatSelectionMode(conversation, button);
      if (navigator.vibrate) navigator.vibrate(20);
    }, CHAT_LONG_PRESS_DELAY_MS);
  });

  button.addEventListener('pointermove', (event) => {
    if (!timer) return;
    const movedX = Math.abs(event.clientX - startX);
    const movedY = Math.abs(event.clientY - startY);
    if (movedX > CHAT_LONG_PRESS_MOVE_TOLERANCE_PX || movedY > CHAT_LONG_PRESS_MOVE_TOLERANCE_PX) clearTimer();
  });

  ['pointerup', 'pointerleave', 'pointercancel'].forEach((eventName) => {
    button.addEventListener(eventName, clearTimer);
  });

  button.addEventListener('contextmenu', (event) => {
    if (activeSection !== 'chats') return;
    event.preventDefault();
    button.dataset.longPressHandled = '1';
    enterChatSelectionMode(conversation, button);
  });
}

function enterChatSelectionMode(conversation, anchor = null) {
  if (!conversation) return;
  closeTransientPanels();
  chatSelectionState.active = true;
  chatSelectionState.selectedIds = new Set([String(conversation.id)]);
  chatSelectionState.lastAnchor = anchor;
  chatView.classList.add('chat-selection-active');
  renderChatList(searchInput.value);
  refreshChatSelectionToolbar();
}

function closeChatSelectionMode(options = {}) {
  closeChatFloatingMenu();
  chatSelectionState.active = false;
  chatSelectionState.selectedIds.clear();
  chatSelectionState.lastAnchor = null;
  chatView?.classList.remove('chat-selection-active');
  if (chatSelectionState.toolbar) chatSelectionState.toolbar.remove();
  chatSelectionState.toolbar = null;
  if (options.render !== false && activeSection === 'chats') renderChatList(searchInput.value);
}

function toggleChatSelection(conversation) {
  if (!conversation) return;
  const id = String(conversation.id || '');
  if (!id) return;
  if (chatSelectionState.selectedIds.has(id)) {
    chatSelectionState.selectedIds.delete(id);
  } else {
    chatSelectionState.selectedIds.add(id);
  }

  if (!chatSelectionState.selectedIds.size) {
    closeChatSelectionMode();
    return;
  }

  renderChatList(searchInput.value);
  refreshChatSelectionToolbar();
}

function selectAllVisibleChats() {
  const visibleIds = getVisibleConversations().map((conversation) => String(conversation.id || '')).filter(Boolean);
  if (!visibleIds.length) return;
  chatSelectionState.active = true;
  chatSelectionState.selectedIds = new Set(visibleIds);
  chatView.classList.add('chat-selection-active');
  renderChatList(searchInput.value);
  showToast('Todos los chats visibles quedaron seleccionados.');
}

function ensureChatSelectionToolbar() {
  if (chatSelectionState.toolbar) return chatSelectionState.toolbar;
  const toolbar = document.createElement('div');
  toolbar.className = 'chat-selection-toolbar';
  toolbar.setAttribute('role', 'toolbar');
  toolbar.setAttribute('aria-label', 'Acciones de chats seleccionados');
  toolbar.innerHTML = `
    <button class="selection-toolbar-button" type="button" data-selection-action="close" aria-label="Cancelar selección">‹</button>
    <strong class="selection-toolbar-count" aria-live="polite">0</strong>
    <span class="selection-toolbar-spacer"></span>
    <button class="selection-toolbar-button" type="button" data-selection-action="pin" aria-label="Fijar o desfijar chats seleccionados">⌖</button>
    <button class="selection-toolbar-button" type="button" data-selection-action="delete" aria-label="Eliminar chats seleccionados">🗑</button>
    <button class="selection-toolbar-button" type="button" data-selection-action="mute" aria-label="Silenciar o activar chats seleccionados">🔕</button>
    <button class="selection-toolbar-button" type="button" data-selection-action="archive" aria-label="Archivar chats seleccionados">⇩</button>
    <button class="selection-toolbar-button" type="button" data-selection-action="more" aria-label="Más opciones de chats seleccionados">⋮</button>
  `;
  toolbar.addEventListener('click', handleChatSelectionToolbarClick);
  document.body.appendChild(toolbar);
  chatSelectionState.toolbar = toolbar;
  return toolbar;
}

function refreshChatSelectionToolbar() {
  if (!chatSelectionState.active) return;
  const selected = getSelectedChatConversations();
  if (!selected.length) {
    closeChatSelectionMode({ render: false });
    return;
  }
  const toolbar = ensureChatSelectionToolbar();
  toolbar.querySelector('.selection-toolbar-count').textContent = String(selected.length);
  const pinButton = toolbar.querySelector('[data-selection-action="pin"]');
  const archiveButton = toolbar.querySelector('[data-selection-action="archive"]');
  const muteButton = toolbar.querySelector('[data-selection-action="mute"]');
  const allPinned = selected.every((conversation) => conversation.pinned);
  const allArchived = selected.every((conversation) => conversation.archived);
  const allMuted = selected.every((conversation) => conversation.muted);
  pinButton.textContent = allPinned ? '📌' : '⌖';
  pinButton.title = allPinned ? 'Desfijar seleccionados' : 'Fijar seleccionados';
  archiveButton.textContent = allArchived ? '↥' : '⇩';
  archiveButton.title = allArchived ? 'Restaurar seleccionados' : 'Archivar seleccionados';
  muteButton.textContent = allMuted ? '🔔' : '🔕';
  muteButton.title = allMuted ? 'Activar sonido' : 'Silenciar';
}

async function handleChatSelectionToolbarClick(event) {
  const button = event.target.closest('[data-selection-action]');
  if (!button) return;
  const action = button.dataset.selectionAction;
  const selected = getSelectedChatConversations();

  if (action === 'close') {
    closeChatSelectionMode();
    return;
  }

  if (!selected.length) {
    closeChatSelectionMode();
    return;
  }

  if (action === 'more') {
    openSelectedChatFloatingMenu(button);
    return;
  }

  if (action === 'pin') {
    const nextPinned = !selected.every((conversation) => conversation.pinned);
    await applyToConversationsSequentially(selected, (conversation) => setConversationPinned(conversation, nextPinned));
    closeChatSelectionMode();
    return;
  }

  if (action === 'archive') {
    const nextArchived = !selected.every((conversation) => conversation.archived);
    await applyToConversationsSequentially(selected, (conversation) => setConversationArchived(conversation, nextArchived));
    closeChatSelectionMode();
    return;
  }

  if (action === 'mute') {
    const nextMuted = !selected.every((conversation) => conversation.muted);
    await applyToConversationsSequentially(selected, (conversation) => setConversationMuted(conversation, nextMuted));
    closeChatSelectionMode();
    return;
  }

  if (action === 'delete') {
    await deleteSelectedConversations(selected);
  }
}

async function applyToConversationsSequentially(conversations = [], callback) {
  for (const conversation of conversations) {
    // Las acciones se ejecutan en serie para preservar idempotencia y cola local por chat.
    // eslint-disable-next-line no-await-in-loop
    await callback(conversation);
  }
}

function getChatFloatingMenuActions(conversations = getSelectedChatConversations()) {
  const selected = conversations.filter(Boolean);
  const conversation = selected[0] || getActiveConversation();
  const many = selected.length > 1;
  const allPinned = selected.length && selected.every((item) => item.pinned);
  const allArchived = selected.length && selected.every((item) => item.archived);
  const allRestricted = selected.length && selected.every((item) => item.restricted);
  const allFavorite = selected.length && selected.every((item) => item.favorite);
  const allBlocked = selected.length && selected.every((item) => item.blocked);

  return [
    { id: 'shortcut', label: 'Crear acceso directo', disabled: many || !conversation },
    { id: 'info', label: 'Ver contacto', disabled: many || !conversation },
    { id: 'search', label: 'Buscar en chat', disabled: many || !conversation },
    { id: 'pin', label: allPinned ? 'Desfijar chat' : 'Fijar chat', disabled: !selected.length },
    { id: 'archive', label: allArchived ? 'Restaurar chat' : 'Archivar chat', disabled: !selected.length },
    { id: 'unread', label: 'Marcar como no leído', disabled: !selected.length },
    { id: 'selectAll', label: 'Seleccionar todos', disabled: !getVisibleConversations().length },
    { id: 'restrict', label: allRestricted ? 'Quitar restricción' : 'Restringir chat', disabled: !selected.length },
    { id: 'favorite', label: allFavorite ? 'Quitar de Favoritos' : 'Añadir a Favoritos', disabled: !selected.length },
    { id: 'list', label: 'Añadir a lista', disabled: !selected.length },
    { id: 'clear', label: 'Vaciar chat', disabled: !selected.length },
    { id: 'report', label: 'Reportar conversación', disabled: many || !conversation },
    { id: 'block', label: allBlocked ? 'Desbloquear' : 'Bloquear', disabled: !selected.length }
  ];
}

function openSelectedChatFloatingMenu(anchor = null) {
  const selected = getSelectedChatConversations();
  if (!selected.length) return;
  openChatFloatingMenu({ conversations: selected, anchor: anchor || chatSelectionState.lastAnchor });
}

function openActiveConversationFloatingMenu() {
  closeTransientPanels();
  const conversation = getActiveConversation();
  if (!conversation || activeSection !== 'chats') {
    showToast('Selecciona un chat para ver sus opciones.');
    return;
  }
  openChatFloatingMenu({ conversations: [conversation], anchor: conversationMenuButton });
}

function openChatFloatingMenu({ conversations = [], anchor = null } = {}) {
  closeChatFloatingMenu();
  const selected = conversations.filter(Boolean);
  if (!selected.length) return;

  const backdrop = document.createElement('button');
  backdrop.className = 'chat-floating-menu-backdrop';
  backdrop.type = 'button';
  backdrop.setAttribute('aria-label', 'Cerrar menú de chat');
  backdrop.addEventListener('click', closeChatFloatingMenu);

  const menu = document.createElement('div');
  menu.className = 'chat-floating-menu';
  menu.setAttribute('role', 'menu');
  menu.setAttribute('aria-label', 'Opciones de chat');
  menu.innerHTML = `
    <div class="chat-floating-menu-list">
      ${getChatFloatingMenuActions(selected).map((action) => `
        <button type="button" role="menuitem" data-chat-floating-action="${escapeHTML(action.id)}" ${action.disabled ? 'disabled' : ''}>${escapeHTML(action.label)}</button>
      `).join('')}
    </div>
  `;
  menu.addEventListener('click', (event) => handleChatFloatingMenuAction(event, selected));

  document.body.append(backdrop, menu);
  positionChatFloatingMenu(menu, anchor);
  chatFloatingMenuState.backdrop = backdrop;
  chatFloatingMenuState.menu = menu;
  chatFloatingMenuState.anchor = anchor;
}

function positionChatFloatingMenu(menu, anchor = null) {
  const menuWidth = Math.min(330, Math.max(260, Math.round(window.innerWidth * 0.72)));
  menu.style.width = `${menuWidth}px`;
  let top = 74 + Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--safe-top')) || 74;
  let right = 10 + Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--safe-right')) || 10;

  if (anchor?.getBoundingClientRect) {
    const rect = anchor.getBoundingClientRect();
    top = Math.max(8, rect.bottom + 8);
    right = Math.max(8, window.innerWidth - rect.right);
  }

  menu.style.top = `${Math.min(top, Math.max(12, window.innerHeight - 420))}px`;
  menu.style.right = `${right}px`;
}

function closeChatFloatingMenu() {
  if (chatFloatingMenuState.menu) chatFloatingMenuState.menu.remove();
  if (chatFloatingMenuState.backdrop) chatFloatingMenuState.backdrop.remove();
  chatFloatingMenuState.menu = null;
  chatFloatingMenuState.backdrop = null;
  chatFloatingMenuState.anchor = null;
}

async function handleChatFloatingMenuAction(event, conversations = []) {
  const button = event.target.closest('[data-chat-floating-action]');
  if (!button || button.disabled) return;
  const action = button.dataset.chatFloatingAction;
  const selected = conversations.filter(Boolean);
  const firstConversation = selected[0];

  closeChatFloatingMenu();

  if (action === 'shortcut') {
    await createConversationShortcut(firstConversation);
    return;
  }

  if (action === 'info') {
    closeChatSelectionMode({ render: false });
    openConversationInfoModal(firstConversation);
    return;
  }

  if (action === 'search') {
    closeChatSelectionMode({ render: false });
    openConversationSearchModal(firstConversation);
    return;
  }

  if (action === 'pin') {
    const nextPinned = !selected.every((conversation) => conversation.pinned);
    await applyToConversationsSequentially(selected, (conversation) => setConversationPinned(conversation, nextPinned));
    closeChatSelectionMode();
    return;
  }

  if (action === 'archive') {
    const nextArchived = !selected.every((conversation) => conversation.archived);
    await applyToConversationsSequentially(selected, (conversation) => setConversationArchived(conversation, nextArchived));
    closeChatSelectionMode();
    return;
  }

  if (action === 'unread') {
    await applyToConversationsSequentially(selected, (conversation) => markConversationUnread(conversation));
    closeChatSelectionMode();
    return;
  }

  if (action === 'selectAll') {
    selectAllVisibleChats();
    return;
  }

  if (action === 'restrict') {
    const nextRestricted = !selected.every((conversation) => conversation.restricted);
    await applyToConversationsSequentially(selected, (conversation) => setConversationRestricted(conversation, nextRestricted));
    closeChatSelectionMode();
    return;
  }

  if (action === 'favorite') {
    const nextFavorite = !selected.every((conversation) => conversation.favorite);
    await applyToConversationsSequentially(selected, (conversation) => setConversationFavorite(conversation, nextFavorite));
    closeChatSelectionMode();
    return;
  }

  if (action === 'list') {
    openAddChatToListModal(selected);
    return;
  }

  if (action === 'clear') {
    await clearSelectedConversations(selected);
    closeChatSelectionMode();
    return;
  }

  if (action === 'report') {
    closeChatSelectionMode({ render: false });
    openReportConversationModal(firstConversation);
    return;
  }

  if (action === 'block') {
    const nextBlocked = !selected.every((conversation) => conversation.blocked);
    await applyToConversationsSequentially(selected, (conversation) => setConversationBlockState(conversation, nextBlocked));
    closeChatSelectionMode();
  }
}

function markConversationUnreadSynced(conversationId, unreadAt = new Date().toISOString()) {
  const conversation = getConversationById(conversationId);
  if (!conversation) return;
  conversation.unread = Math.max(1, Number(conversation.unread || 0));
  conversation.lastReadSyncStatus = 'synced-unread';
  conversation.unreadSyncedAt = unreadAt;
  conversation.status = 'Marcado como no leído';
  persistState();
  renderCurrentSection();
}

async function markConversationUnread(conversation) {
  if (!conversation) return;
  const unreadAt = new Date().toISOString();
  const clientMutationId = generateClientMutationId();
  conversation.unread = Math.max(1, Number(conversation.unread || 0));
  conversation.lastReadSyncStatus = CHATER_CONFIG.backendBaseUrl ? 'syncing-unread' : 'local-unread';
  conversation.status = 'Marcado como no leído';
  persistState();
  renderCurrentSection();
  showToast('Chat marcado como no leído.');

  if (!CHATER_CONFIG.backendBaseUrl) return;

  const sessionGuard = captureSessionGuard();
  try {
    await apiClient.markConversationUnread(conversation.id, clientMutationId, unreadAt);
    if (!isSessionGuardCurrent(sessionGuard)) return;
    markConversationUnreadSynced(conversation.id, unreadAt);
  } catch (error) {
    if (!isSessionGuardCurrent(sessionGuard)) return;
    conversation.lastReadSyncStatus = 'pending-unread';
    enqueueBackendOperation({
      type: 'markChatUnread',
      dedupeKey: `unread:${conversation.id}:${clientMutationId}`,
      payload: { conversationId: conversation.id, unreadAt, clientMutationId }
    });
    persistState();
  }
}

async function setConversationMuted(conversation, muted) {
  if (!conversation) return;
  const clientMutationId = generateClientMutationId();
  const previousMuted = Boolean(conversation.muted);
  const previousMutedUntil = conversation.mutedUntil || '';
  const mutedUntil = muted ? new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString() : '';
  conversation.muted = Boolean(muted);
  conversation.mutedUntil = mutedUntil;
  conversation.muteSyncStatus = CHATER_CONFIG.backendBaseUrl ? 'syncing' : 'local';
  conversation.status = muted ? 'Chat silenciado' : 'Chat con sonido activo';
  persistState();
  renderCurrentSection();
  showToast(muted ? 'Chat silenciado.' : 'Sonido del chat activado.');

  if (!CHATER_CONFIG.backendBaseUrl) return;

  const sessionGuard = captureSessionGuard();
  const patch = { muted: Boolean(muted), mutedUntil, clientMutationId };
  try {
    await apiClient.updateConversation(conversation.id, patch);
    if (!isSessionGuardCurrent(sessionGuard)) return;
    markQueuedConversationPatchSynced(conversation.id, patch);
  } catch (error) {
    if (!isSessionGuardCurrent(sessionGuard)) return;
    const stillSameMuteState = Boolean(conversation.muted) === Boolean(muted);
    conversation.muteSyncStatus = stillSameMuteState ? 'pending' : conversation.muteSyncStatus;
    if (!stillSameMuteState) {
      conversation.muted = previousMuted;
      conversation.mutedUntil = previousMutedUntil;
    }
    enqueueBackendOperation({
      type: 'updateConversation',
      dedupeKey: `conversation-mute:${conversation.id}:${clientMutationId}`,
      payload: { conversationId: conversation.id, patch }
    });
    persistState();
    renderCurrentSection();
  }
}

async function setConversationRestricted(conversation, restricted) {
  if (!conversation) return;
  const clientMutationId = generateClientMutationId();
  const previousRestricted = Boolean(conversation.restricted);
  const previousSettings = { ...(conversation.settings || {}) };
  conversation.restricted = Boolean(restricted);
  conversation.settings = { ...(conversation.settings || {}), restricted: Boolean(restricted) };
  conversation.restrictSyncStatus = CHATER_CONFIG.backendBaseUrl ? 'syncing' : 'local';
  conversation.status = restricted ? 'Chat restringido' : 'Restricción retirada';
  persistState();
  renderCurrentSection();
  showToast(restricted ? 'Chat restringido.' : 'Restricción retirada.');

  if (!CHATER_CONFIG.backendBaseUrl) return;

  const sessionGuard = captureSessionGuard();
  const patch = { restricted: Boolean(restricted), settings: conversation.settings, clientMutationId };
  try {
    await apiClient.updateConversation(conversation.id, patch);
    if (!isSessionGuardCurrent(sessionGuard)) return;
    markQueuedConversationPatchSynced(conversation.id, patch);
  } catch (error) {
    if (!isSessionGuardCurrent(sessionGuard)) return;
    const stillSameRestrictState = Boolean(conversation.restricted) === Boolean(restricted);
    conversation.restrictSyncStatus = stillSameRestrictState ? 'pending' : conversation.restrictSyncStatus;
    if (!stillSameRestrictState) {
      conversation.restricted = previousRestricted;
      conversation.settings = previousSettings;
    }
    enqueueBackendOperation({
      type: 'updateConversation',
      dedupeKey: `conversation-restrict:${conversation.id}:${clientMutationId}`,
      payload: { conversationId: conversation.id, patch }
    });
    persistState();
    renderCurrentSection();
  }
}

async function setConversationFavorite(conversation, favorite) {
  if (!conversation) return;
  conversation.favorite = Boolean(favorite);
  conversation.status = favorite ? 'Añadido a Favoritos' : 'Retirado de Favoritos';
  conversation.relationSyncStatus = CHATER_CONFIG.backendBaseUrl ? 'syncing' : 'local';
  persistState();
  renderCurrentSection();
  showToast(favorite ? 'Chat añadido a Favoritos.' : 'Chat retirado de Favoritos.');

  await syncContactRelation({
    ...conversation,
    contactEmail: conversation.email || conversation.contactEmail || '',
    favorite: Boolean(favorite),
    tags: buildConversationRelationTags(conversation),
    reason: favorite ? 'chat-favorite' : 'chat-unfavorite',
    relationClientMutationId: generateClientMutationId()
  }, { enqueueOnFailure: true });
}

function buildConversationRelationTags(conversation = {}) {
  const tags = [];
  if (conversation.customListName) tags.push(`lista:${conversation.customListName}`);
  if (conversation.favorite) tags.push('favorito');
  if (conversation.restricted) tags.push('restringido');
  return normalizeContactRelationTags(tags);
}

function openAddChatToListModal(conversations = []) {
  const selected = conversations.filter(Boolean);
  if (!selected.length) return;
  closeChatFloatingMenu();
  const form = document.createElement('form');
  const defaultList = selected.find((conversation) => conversation.customListName)?.customListName || DEFAULT_CHAT_LIST_NAME;
  form.innerHTML = `
    <p class="modal-copy">Asigna ${selected.length === 1 ? 'este chat' : `${selected.length} chats`} a una lista personal sincronizable con memoriaBACKEND mediante etiquetas de relación.</p>
    <label for="chatListNameInput">Nombre de lista</label>
    <input id="chatListNameInput" type="text" maxlength="40" value="${escapeHTML(defaultList)}" placeholder="Prioridad" required />
    <p class="form-feedback" data-feedback role="status" aria-live="polite"></p>
    <button class="primary-button" type="submit">Guardar lista</button>
  `;

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const listName = form.querySelector('#chatListNameInput').value.trim() || DEFAULT_CHAT_LIST_NAME;
    await applyToConversationsSequentially(selected, (conversation) => setConversationListName(conversation, listName));
    closeModal();
    closeChatSelectionMode();
  });

  setModal('Añadir a lista', form, 'add-chat-list');
}

async function setConversationListName(conversation, listName = DEFAULT_CHAT_LIST_NAME) {
  if (!conversation) return;
  const normalizedListName = String(listName || DEFAULT_CHAT_LIST_NAME).trim().slice(0, 40) || DEFAULT_CHAT_LIST_NAME;
  conversation.customListName = normalizedListName;
  conversation.settings = { ...(conversation.settings || {}), customListName: normalizedListName };
  conversation.status = `Añadido a lista ${normalizedListName}`;
  persistState();
  renderCurrentSection();

  const clientMutationId = generateClientMutationId();
  const patch = { settings: conversation.settings, clientMutationId };
  if (CHATER_CONFIG.backendBaseUrl) {
    try {
      await apiClient.updateConversation(conversation.id, patch);
      markQueuedConversationPatchSynced(conversation.id, patch);
    } catch (error) {
      enqueueBackendOperation({
        type: 'updateConversation',
        dedupeKey: `conversation-list:${conversation.id}:${clientMutationId}`,
        payload: { conversationId: conversation.id, patch }
      });
    }
  }

  await syncContactRelation({
    ...conversation,
    contactEmail: conversation.email || conversation.contactEmail || '',
    tags: buildConversationRelationTags(conversation),
    reason: 'chat-list',
    relationClientMutationId: generateClientMutationId()
  }, { enqueueOnFailure: true });
  showToast(`Chat añadido a lista ${normalizedListName}.`);
}

async function setConversationBlockState(conversation, blocked) {
  if (!conversation) return;
  if (Boolean(conversation.blocked) === Boolean(blocked)) return;
  await toggleConversationBlock(conversation);
}

function markChatShortcutSynced(conversationId = '') {
  const conversation = getConversationById(conversationId);
  if (!conversation) return;
  conversation.shortcutSyncStatus = 'synced';
  conversation.shortcutSyncedAt = new Date().toISOString();
  persistState();
}

async function createConversationShortcut(conversation) {
  if (!conversation) return;
  const clientMutationId = generateClientMutationId();
  conversation.shortcutRequestedAt = new Date().toISOString();
  conversation.shortcutSyncStatus = CHATER_CONFIG.backendBaseUrl ? 'syncing' : 'local';
  conversation.status = 'Acceso directo preparado';
  persistState();
  renderCurrentSection();

  if (!CHATER_CONFIG.backendBaseUrl) {
    showToast('Acceso directo preparado. Instala ChatER o abre este chat desde el acceso de la app.');
    return;
  }

  try {
    await apiClient.createChatShortcut(conversation, clientMutationId);
    markChatShortcutSynced(conversation.id);
    showToast('Acceso directo sincronizado.');
  } catch (error) {
    conversation.shortcutSyncStatus = 'pending';
    enqueueBackendOperation({
      type: 'createChatShortcut',
      dedupeKey: `chat-shortcut:${conversation.id}`,
      replaceExisting: true,
      payload: { conversationId: conversation.id, conversation, clientMutationId }
    });
    persistState();
    showToast('Acceso directo guardado en cola de sincronización.');
  }
}

function markChatActionSynced(conversationId = '', actionType = '') {
  const conversation = appState.conversations.find((item) => String(item.id || '') === String(conversationId || ''));
  if (!conversation) return;
  const syncedAt = new Date().toISOString();
  conversation.actionSyncStatus = `synced:${actionType}`;
  conversation.actionSyncedAt = syncedAt;
  if (actionType === 'delete_conversation' || actionType === 'restore_conversation') {
    conversation.deleteSyncStatus = `synced:${actionType}`;
    conversation.deleteSyncedAt = syncedAt;
  }
  persistState();
}

async function syncChatActionWithBackend(conversation, actionType = '', payload = {}, clientMutationId = generateClientMutationId()) {
  if (!conversation || !CHATER_CONFIG.backendBaseUrl) return;
  try {
    await apiClient.syncChatAction(actionType, conversation, payload, clientMutationId);
    markChatActionSynced(conversation.id, actionType);
  } catch (error) {
    conversation.actionSyncStatus = `pending:${actionType}`;
    if (actionType === 'delete_conversation' || actionType === 'restore_conversation') {
      conversation.deleteSyncStatus = `pending:${actionType}`;
    }
    enqueueBackendOperation({
      type: 'syncChatAction',
      dedupeKey: `chat-action:${actionType}:${conversation.id}:${clientMutationId}`,
      payload: { conversationId: conversation.id, conversation, actionType, payload, clientMutationId }
    });
    persistState();
  }
}

async function clearSelectedConversations(conversations = []) {
  const selected = conversations.filter(Boolean);
  if (!selected.length) return;
  const label = selected.length === 1 ? 'este chat' : `${selected.length} chats`;
  if (!window.confirm(`¿Vaciar ${label}? Se quitarán los mensajes cargados localmente y se enviará la acción a memoriaBACKEND cuando esté disponible.`)) return;

  await applyToConversationsSequentially(selected, async (conversation) => {
    const clearedBefore = new Date().toISOString();
    const clearedMessageIds = (conversation.messages || []).map((message) => message.id).filter(Boolean);
    conversation.messages = [];
    conversation.unread = 0;
    conversation.status = 'Chat vaciado';
    conversation.actionSyncStatus = CHATER_CONFIG.backendBaseUrl ? 'syncing:clear_messages' : 'local:clear_messages';
    persistState();
    await syncChatActionWithBackend(conversation, 'clear_messages', { clearedBefore, clearedMessageIds });
  });
  renderCurrentSection();
  renderConversation();
  showToast('Chat vaciado.');
}

async function deleteSelectedConversations(conversations = []) {
  const selected = conversations.filter(Boolean);
  if (!selected.length) return;
  const label = selected.length === 1 ? 'este chat' : `${selected.length} chats`;
  if (!window.confirm(`¿Eliminar ${label} de la lista? La copia local se ocultará y la acción quedará auditada para memoriaBACKEND.`)) return;

  const sessionGuard = captureSessionGuard();
  await applyToConversationsSequentially(selected, async (conversation) => {
    const clientMutationId = generateClientMutationId();
    const deletedAt = new Date().toISOString();
    const deletionLifecycle = buildConversationParticipantDeletionPayload(conversation, {
      deletedAt,
      clientMutationId
    });
    // Limpieza defensiva: aunque el estado local no marque bloqueo, la relación o
    // memoriaBACKEND pueden conservar un bloqueo previo. Eliminar un chat/contacto
    // siempre debe dejar el vínculo recreable y sin bloqueo residual.
    const wasBlocked = coerceFirstBooleanFlag([
      conversation.blocked,
      conversation.isBlocked,
      conversation.blockDesiredBlocked,
      conversation.metadata?.blocked,
      conversation.metadata?.isBlocked
    ], false);
    const unblockPayload = buildConversationBlockPayload(conversation, false, {
      clientMutationId: `${clientMutationId}:unblock`,
      reason: 'chat-deleted-cleanup'
    });

    removeQueuedLifecycleOperationsForConversation(conversation, sessionGuard.email);
    removeQueuedArchiveOperationsForConversation(conversation.id, sessionGuard.email);
    clearConversationBlockState(conversation, {
      syncStatus: wasBlocked && CHATER_CONFIG.backendBaseUrl ? 'syncing:delete_cleanup' : '',
      syncedAt: wasBlocked && !CHATER_CONFIG.backendBaseUrl ? deletedAt : '',
      changedAt: deletedAt,
      clientMutationId: `${clientMutationId}:unblock`
    });
    applyLocalConversationArchiveState(conversation, false, {
      archiveChangedAt: deletedAt,
      clientMutationId: `${clientMutationId}:archive-cleanup`,
      syncStatus: CHATER_CONFIG.backendBaseUrl ? 'pending:delete_cleanup' : 'local:delete_cleanup',
      status: 'Chat eliminado localmente'
    });
    conversation.deleted = true;
    conversation.deletedForCurrentUser = true;
    conversation.isDeletedForCurrentUser = true;
    conversation.hiddenForCurrentUser = true;
    conversation.localDeletionRegistry = deletionLifecycle;
    conversation.deletionRegistry = deletionLifecycle.deletionRegistry || conversation.deletionRegistry || null;
    conversation.participantDeletionRegistry = deletionLifecycle.participantDeletionRegistry || conversation.participantDeletionRegistry || null;
    conversation.deletedParticipants = deletionLifecycle.deletedParticipants || conversation.deletedParticipants || [];
    conversation.deletedParticipantIdentityKeys = deletionLifecycle.deletedParticipantIdentityKeys || conversation.deletedParticipantIdentityKeys || [];
    conversation.participantCount = deletionLifecycle.participantCount || conversation.participantCount || 1;
    conversation.deletionCounterInitial = deletionLifecycle.deletionCounterInitial || conversation.deletionCounterInitial || conversation.participantCount;
    conversation.deletionCounterRemaining = deletionLifecycle.deletionCounterRemaining;
    conversation.remainingParticipantCount = deletionLifecycle.remainingParticipantCount;
    conversation.deletedAt = deletedAt;
    conversation.deleteDesiredDeleted = true;
    conversation.deleteChangedAt = deletedAt;
    conversation.deleteLocalChangedAt = deletedAt;
    conversation.deleteClientMutationId = clientMutationId;
    conversation.deleteLocalMutationId = clientMutationId;
    conversation.deleteSyncStatus = CHATER_CONFIG.backendBaseUrl ? 'syncing:delete_conversation' : 'local:delete_conversation';
    conversation.actionSyncStatus = CHATER_CONFIG.backendBaseUrl ? 'syncing:delete_conversation' : 'local:delete_conversation';
    conversation.status = 'Chat eliminado localmente';
    if (activeConversationId === conversation.id) {
      activeConversationId = getFirstVisibleConversationId(conversation.id);
      chatView.classList.remove('chat-open');
    }
    persistState();

    await syncConversationUnblockCleanup(conversation, unblockPayload, sessionGuard);
    await syncChatActionWithBackend(conversation, 'delete_conversation', {
      deletedAt,
      ...deletionLifecycle,
      cleanup: {
        archived: false,
        blocked: false,
        deletedForCurrentUser: true,
        relationStatus: 'deleted',
        reason: 'delete-hides-only-for-actor'
      }
    }, clientMutationId);
    await syncContactRelation({
      ...conversation,
      email: conversation.email || conversation.contactEmail || '',
      contactEmail: conversation.email || conversation.contactEmail || '',
      blocked: false,
      status: 'deleted',
      reason: 'chat-delete-cleanup',
      relationClientMutationId: `${clientMutationId}:relation-delete-cleanup`
    }, { enqueueOnFailure: true });
  });

  closeChatSelectionMode();
  renderCurrentSection();
  renderConversation();
  showToast('Chat eliminado de la lista.');
}

function normalizeContactCreationInput(contact = {}) {
  const email = normalizeStorageIdentity(contact.email || contact.userEmail || contact.contactEmail || contact.mail || '');
  const userId = normalizeBackendUserId(contact.userId || contact.contactUserId || contact.uid || contact.id || '');
  const name = String(contact.name || contact.displayName || contact.alias || (email ? email.split('@')[0] : '') || 'Contacto').trim();
  const avatarImage = readProfileAvatarCandidate(contact);
  return withProfileAvatarAliases({
    name,
    displayName: name,
    email,
    userId,
    source: contact.source || 'manual',
    backendQrResolvedAt: contact.backendQrResolvedAt || contact.resolvedAt || '',
    relationId: contact.relationId || contact.relation?.id || ''
  }, avatarImage);
}

function findConversationByContactIdentity(contact = {}) {
  const normalizedContact = typeof contact === 'string'
    ? { email: contact }
    : normalizeContactCreationInput(contact);
  const normalizedEmail = normalizeStorageIdentity(normalizedContact.email || '');
  const normalizedUserId = normalizeBackendUserId(normalizedContact.userId || '');

  if (!normalizedEmail && !normalizedUserId) return null;

  const selfEmail = normalizeStorageIdentity(getSessionEmail());
  const selfUserId = normalizeBackendUserId(getSessionUserId()) || normalizeBackendUserId(getCurrentUserIdentifier());
  const candidateParticipants = buildConversationCreateParticipants(normalizedContact);
  const candidateLifecycle = buildSharedConversationLifecycleMetadata(candidateParticipants, { type: 'direct' });
  const candidateSharedKey = candidateLifecycle.sharedConversationKey || '';

  return appState.conversations.find((conversation) => {
    const directEmail = normalizeStorageIdentity(conversation.email || conversation.contactEmail || conversation.userEmail || '');
    const directUserId = normalizeBackendUserId(conversation.contactUserId || conversation.remoteUserId || conversation.otherUserId || conversation.participantUserId || '');
    const conversationSharedKey = getConversationSharedMergeKey(conversation);

    if (candidateSharedKey && conversationSharedKey && candidateSharedKey === conversationSharedKey) return true;
    if (normalizedEmail && directEmail === normalizedEmail) return true;
    if (normalizedUserId && directUserId === normalizedUserId) return true;

    const participants = Array.isArray(conversation.participants) ? conversation.participants : [];
    return participants.some((participant) => {
      const participantEmail = normalizeStorageIdentity(participant.email || participant.userEmail || participant.contactEmail || '');
      const participantUserId = normalizeBackendUserId(participant.userId || participant.contactUserId || participant.uid || participant.id || '');
      const isSelfParticipant = (selfEmail && participantEmail === selfEmail) || (selfUserId && participantUserId === selfUserId);
      if (isSelfParticipant) return false;
      if (normalizedEmail && participantEmail === normalizedEmail) return true;
      if (normalizedUserId && participantUserId === normalizedUserId) return true;
      return false;
    });
  }) || null;
}

function findConversationByContactEmail(email = '') {
  return findConversationByContactIdentity({ email });
}

function createLocalContactConversation(contact = {}) {
  const normalizedContact = normalizeContactCreationInput(contact);
  const existingConversation = findConversationByContactIdentity(normalizedContact);
  if (existingConversation) return existingConversation;

  const participants = normalizeConversationParticipantsForApi([
    { email: getSessionEmail(), userId: getSessionUserId() || getCurrentUserIdentifier(), role: 'owner', displayName: getSessionEmail() },
    withProfileAvatarAliases({ email: normalizedContact.email, userId: normalizedContact.userId || '', role: 'contact', displayName: normalizedContact.name }, normalizedContact.avatarImage)
  ], normalizedContact.email, normalizedContact.name);
  const lifecycle = buildSharedConversationLifecycleMetadata(participants, { type: 'direct' });

  const conversation = {
    id: buildLocalConversationIdForContact(normalizedContact),
    name: normalizedContact.name,
    email: normalizedContact.email,
    contactEmail: normalizedContact.email,
    contactUserId: normalizedContact.userId || '',
    avatar: getInitials(normalizedContact.name),
    avatarImage: normalizedContact.avatarImage || '',
    status: normalizedContact.source === 'profile-qr' ? 'Contacto creado desde QR' : 'Nuevo contacto',
    section: 'chats',
    archived: false,
    blocked: false,
    unread: 0,
    messages: [{
      id: generateClientMutationId(),
      type: 'system',
      text: normalizedContact.source === 'profile-qr'
        ? `Contacto creado desde QR: ${normalizedContact.email}.`
        : `Contacto creado con ${normalizedContact.email}.`,
      time: getCurrentTime()
    }],
    // Con backend activo se fuerza la lectura del historial remoto: si el chat ya existía
    // en Redis por la clave compartida, debe cargar ese mismo hilo y no quedarse solo
    // con el mensaje local de creación.
    messagesHydrated: !CHATER_CONFIG.backendBaseUrl,
    messagesHistoryCursor: '',
    messagesHistoryLastErrorAt: '',
    sharedConversationKey: lifecycle.sharedConversationKey,
    redisConversationKey: lifecycle.redisConversationKey,
    redisChatKey: lifecycle.redisChatKey,
    participantCount: lifecycle.participantCount,
    reuseExistingRedisChat: true,
    deleteFinalOnlyWhenAllParticipantsDeleted: true,
    metadata: {
      source: 'chater-static-site',
      contactProfile: withProfileAvatarAliases({
        email: normalizedContact.email,
        userId: normalizedContact.userId || '',
        displayName: normalizedContact.name
      }, normalizedContact.avatarImage),
      ...lifecycle
    },
    lastReadAt: new Date().toISOString(),
    readSyncedAt: '',
    lastReadSyncStatus: 'local',
    participants,
    contactSyncStatus: CHATER_CONFIG.backendBaseUrl ? 'pending' : 'local'
  };

  appState.conversations.unshift(conversation);
  persistState();
  return conversation;
}


async function createBackendConfirmedContactConversation(normalizedContact = {}, sessionGuard = captureSessionGuard()) {
  const createConversationMutationId = normalizedContact.clientMutationId || generateClientMutationId();
  const payload = await apiClient.createConversation({
    name: normalizedContact.name,
    email: normalizedContact.email,
    userId: normalizedContact.userId,
    avatarImage: normalizedContact.avatarImage || '',
    avatarUrl: normalizedContact.avatarUrl || normalizedContact.avatarImage || '',
    source: normalizedContact.source,
    clientMutationId: createConversationMutationId
  }).catch((error) => {
    if (isContactProfileNotFoundError(error)) {
      throw new Error(buildContactProfileNotFoundFeedback(normalizedContact));
    }
    throw error;
  });

  if (!isSessionGuardCurrent(sessionGuard)) {
    throw new Error('La sesión cambió antes de abrir el chat. Inicia sesión nuevamente para continuar.');
  }

  const conversation = createLocalContactConversation({
    ...normalizedContact,
    clientMutationId: createConversationMutationId
  });
  const localConversationId = conversation.id;

  if (payload?.offlineDemo) {
    conversation.status = 'Guardado localmente';
    conversation.contactSyncStatus = 'local';
    persistState();
    return conversation;
  }

  const remoteConversationId = extractEntityId(payload, ['chat', 'conversation']) || localConversationId;
  markQueuedConversationSynced(localConversationId, payload);
  const syncedConversation = appState.conversations.find((item) => String(item.id || '') === String(remoteConversationId || '')) || conversation;
  syncedConversation.contactSyncStatus = 'synced';
  syncedConversation.contactSyncedAt = new Date().toISOString();
  syncedConversation.status = 'Sincronizado';

  await syncContactRelation({
    name: normalizedContact.name,
    email: normalizedContact.email,
    userId: normalizedContact.userId,
    avatarImage: normalizedContact.avatarImage || '',
    avatarUrl: normalizedContact.avatarUrl || normalizedContact.avatarImage || '',
    conversationId: remoteConversationId || syncedConversation.id,
    source: normalizedContact.source,
    clientMutationId: createConversationMutationId
  }, { enqueueOnFailure: true });

  await forceHydrateConversationHistory(remoteConversationId || syncedConversation.id, { reason: 'redis-chat-reused-after-contact-create' });
  persistState();
  return syncedConversation;
}

async function syncNewContactConversation(conversation, contact, sessionGuard = captureSessionGuard()) {
  if (!conversation) return;

  if (!CHATER_CONFIG.backendBaseUrl) {
    conversation.status = 'Guardado localmente';
    conversation.contactSyncStatus = 'local';
    persistState();
    return;
  }

  const syncKey = String(conversation.id || '').trim();
  const previousSync = syncKey ? contactConversationSyncState.inFlight.get(syncKey) : null;
  if (previousSync) return previousSync;

  const syncPromise = (async () => {
    const normalizedContact = normalizeContactCreationInput(contact);
    const createConversationMutationId = contact.clientMutationId || generateClientMutationId();
    conversation.contactSyncStatus = 'syncing';
    conversation.status = conversation.status === 'Nuevo contacto' ? 'Creando contacto...' : conversation.status;
    persistState();

    try {
      const payload = await apiClient.createConversation({
        name: normalizedContact.name,
        email: normalizedContact.email,
        userId: normalizedContact.userId,
        avatarImage: normalizedContact.avatarImage || '',
        avatarUrl: normalizedContact.avatarUrl || normalizedContact.avatarImage || '',
        clientMutationId: createConversationMutationId
      });
      if (!isSessionGuardCurrent(sessionGuard)) return;
      if (payload?.offlineDemo) {
        conversation.status = 'Guardado localmente';
        conversation.contactSyncStatus = 'local';
      } else {
        const remoteConversationId = extractEntityId(payload, ['chat', 'conversation']) || conversation.id;
        markQueuedConversationSynced(conversation.id, payload);
        const syncedConversation = appState.conversations.find((item) => String(item.id || '') === String(remoteConversationId || '')) || conversation;
        syncedConversation.contactSyncStatus = 'synced';
        syncedConversation.contactSyncedAt = new Date().toISOString();
        await syncContactRelation({
          name: normalizedContact.name,
          email: normalizedContact.email,
          userId: normalizedContact.userId,
          avatarImage: normalizedContact.avatarImage || '',
          avatarUrl: normalizedContact.avatarUrl || normalizedContact.avatarImage || '',
          conversationId: remoteConversationId,
          source: normalizedContact.source,
          clientMutationId: createConversationMutationId
        }, { enqueueOnFailure: true });
        await forceHydrateConversationHistory(remoteConversationId || syncedConversation.id, { reason: 'redis-chat-reused-after-contact-create' });
      }
    } catch (error) {
      if (!isSessionGuardCurrent(sessionGuard)) return;
      if (isContactProfileNotFoundError(error)) {
        conversation.status = 'Contacto no encontrado en ChatER';
        conversation.contactSyncStatus = 'error:contact_not_found';
        showToast(buildContactProfileNotFoundFeedback(normalizedContact));
        throw error;
      }
      conversation.status = 'Pendiente de sincronizar';
      conversation.contactSyncStatus = 'pending';
      enqueueBackendOperation({
        type: 'createConversation',
        dedupeKey: `conversation:${conversation.id}`,
        payload: {
          localConversationId: conversation.id,
          contact: {
            name: normalizedContact.name,
            email: normalizedContact.email,
            userId: normalizedContact.userId,
            avatarImage: normalizedContact.avatarImage || '',
            avatarUrl: normalizedContact.avatarUrl || normalizedContact.avatarImage || '',
            source: normalizedContact.source,
            clientMutationId: createConversationMutationId
          }
        }
      });
      enqueueContactRelationSync({
        name: normalizedContact.name,
        email: normalizedContact.email,
        userId: normalizedContact.userId,
        avatarImage: normalizedContact.avatarImage || '',
        avatarUrl: normalizedContact.avatarUrl || normalizedContact.avatarImage || '',
        conversationId: conversation.id,
        source: normalizedContact.source,
        clientMutationId: createConversationMutationId
      });
      showToast('Contacto creado localmente y en cola de sincronización.');
    } finally {
      if (isSessionGuardCurrent(sessionGuard)) {
        persistState();
        renderChatList(searchInput.value);
        renderConversation();
      }
    }
  })();

  if (syncKey) contactConversationSyncState.inFlight.set(syncKey, syncPromise);

  try {
    return await syncPromise;
  } finally {
    if (syncKey && contactConversationSyncState.inFlight.get(syncKey) === syncPromise) {
      contactConversationSyncState.inFlight.delete(syncKey);
    }
  }
}

async function restoreDeletedContactConversation(conversation, normalizedContact = {}, options = {}) {
  if (!conversation?.deleted) return;
  const sessionGuard = captureSessionGuard();
  const restoredAt = new Date().toISOString();
  const clientMutationId = generateClientMutationId();
  const archiveMutationId = `${clientMutationId}:archive`;
  // Restaurar/recrear un contacto también debe revocar cualquier bloqueo residual
  // remoto aunque la copia local ya parezca limpia.
  const wasBlocked = coerceFirstBooleanFlag([
    conversation.blocked,
    conversation.isBlocked,
    conversation.blockDesiredBlocked,
    conversation.metadata?.blocked,
    conversation.metadata?.isBlocked
  ], false);
  const unblockPayload = buildConversationBlockPayload(conversation, false, {
    clientMutationId: `${clientMutationId}:unblock`,
    reason: 'contact-restore-cleanup'
  });
  const restoreStatus = normalizedContact.source === 'profile-qr' ? 'Chat restaurado desde QR' : 'Chat restaurado por contacto existente';
  const restoreLifecycle = buildConversationParticipantRestorePayload(conversation, {
    restoredAt,
    clientMutationId
  });

  removeQueuedLifecycleOperationsForConversation(conversation, sessionGuard.email);
  removeQueuedArchiveOperationsForConversation(conversation.id, sessionGuard.email);
  clearConversationBlockState(conversation, {
    syncStatus: wasBlocked && CHATER_CONFIG.backendBaseUrl ? 'syncing:restore_cleanup' : '',
    syncedAt: wasBlocked && !CHATER_CONFIG.backendBaseUrl ? restoredAt : '',
    changedAt: restoredAt,
    clientMutationId: `${clientMutationId}:unblock`
  });
  applyLocalConversationArchiveState(conversation, false, {
    archiveChangedAt: restoredAt,
    clientMutationId: archiveMutationId,
    syncStatus: CHATER_CONFIG.backendBaseUrl ? 'syncing' : 'local',
    status: restoreStatus
  });
  conversation.deleted = false;
  conversation.deletedForCurrentUser = false;
  conversation.isDeletedForCurrentUser = false;
  conversation.hiddenForCurrentUser = false;
  conversation.deletedAt = '';
  conversation.localDeletionRegistry = null;
  conversation.deletionRegistry = stripCurrentParticipantFromDeletionSource(conversation.deletionRegistry || null);
  conversation.participantDeletionRegistry = stripCurrentParticipantFromDeletionSource(conversation.participantDeletionRegistry || null);
  conversation.deletedParticipants = stripCurrentParticipantFromDeletionSource(conversation.deletedParticipants || []);
  conversation.deletedParticipantIdentityKeys = stripCurrentParticipantFromDeletionSource(conversation.deletedParticipantIdentityKeys || []);
  conversation.participantCount = restoreLifecycle.participantCount || conversation.participantCount || 1;
  conversation.deletionCounterInitial = restoreLifecycle.deletionCounterInitial || conversation.deletionCounterInitial || conversation.participantCount;
  conversation.deletionCounterRemaining = restoreLifecycle.deletionCounterRemaining;
  conversation.remainingParticipantCount = restoreLifecycle.remainingParticipantCount;
  conversation.deleteDesiredDeleted = false;
  conversation.deleteChangedAt = restoredAt;
  conversation.deleteLocalChangedAt = restoredAt;
  conversation.deleteClientMutationId = clientMutationId;
  conversation.deleteLocalMutationId = clientMutationId;
  conversation.deleteSyncStatus = CHATER_CONFIG.backendBaseUrl ? 'syncing:restore_conversation' : 'local:restore_conversation';
  conversation.status = restoreStatus;
  conversation.actionSyncStatus = CHATER_CONFIG.backendBaseUrl ? 'syncing:restore_conversation' : 'local:restore_conversation';
  conversation.restoredAt = restoredAt;

  if (!conversation.messages?.length) {
    conversation.messages = [{
      id: generateClientMutationId(),
      type: 'system',
      text: normalizedContact.source === 'profile-qr'
        ? `Contacto existente restaurado desde QR: ${normalizedContact.email}.`
        : `Contacto existente restaurado: ${normalizedContact.email}.`,
      time: getCurrentTime()
    }];
  }

  persistState();

  const archivePatch = buildConversationArchivePatch(false, restoredAt, archiveMutationId);
  await syncConversationArchiveState(conversation, archivePatch, sessionGuard);
  await syncConversationUnblockCleanup(conversation, unblockPayload, sessionGuard, { status: 'restore_cleanup' });
  await syncContactRelation({
    ...conversation,
    email: normalizedContact.email || conversation.email || conversation.contactEmail || '',
    contactEmail: normalizedContact.email || conversation.email || conversation.contactEmail || '',
    userId: normalizedContact.userId || conversation.contactUserId || '',
    blocked: false,
    status: 'active',
    reason: 'contact-restore-cleanup',
    relationClientMutationId: `${clientMutationId}:relation`
  }, { enqueueOnFailure: true });
  await syncChatActionWithBackend(conversation, 'restore_conversation', {
    restoredAt,
    ...restoreLifecycle,
    reason: options.reason || 'contact-open',
    source: normalizedContact.source || options.source || 'contact-open',
    contactEmail: normalizedContact.email || conversation.email || conversation.contactEmail || '',
    contactUserId: normalizedContact.userId || conversation.contactUserId || '',
    cleanup: {
      archived: false,
      blocked: false,
      deletedForCurrentUser: false,
      isDeletedForCurrentUser: false,
      hiddenForCurrentUser: false,
      localDeletionRegistry: null,
      removeActorFromDeletionRegistry: true,
      reason: 'restore-allows-clean-recreate'
    }
  }, clientMutationId);
  await forceHydrateConversationHistory(conversation.id, { reason: 'redis-chat-reused-after-contact-restore' });
}

async function openOrCreateContactConversation(contact = {}, options = {}) {
  const sessionGuard = captureSessionGuard();
  const normalizedContact = normalizeContactCreationInput(contact);

  if (!isValidEmailAddress(normalizedContact.email)) {
    throw new Error('El contacto necesita un correo electrónico válido.');
  }

  const existingConversation = findConversationByContactIdentity(normalizedContact);
  let conversation = existingConversation || null;
  const shouldConfirmBackendProfile = Boolean(!existingConversation && CHATER_CONFIG.backendBaseUrl);

  if (existingConversation) {
    await restoreDeletedContactConversation(existingConversation, normalizedContact, options);
    if (normalizedContact.name && normalizedContact.name !== 'Contacto' && !existingConversation.name) {
      existingConversation.name = normalizedContact.name;
    }
  } else if (shouldConfirmBackendProfile) {
    conversation = await createBackendConfirmedContactConversation(normalizedContact, sessionGuard);
  } else {
    conversation = createLocalContactConversation(normalizedContact);
  }

  if (!conversation) {
    throw new Error('No se pudo abrir el chat del contacto.');
  }

  activeConversationId = conversation.id;
  activeSection = 'chats';
  if (options.clearSearch !== false && searchInput) searchInput.value = '';
  if (options.closeModal) closeModal();
  persistState();
  renderCurrentSection();
  chatView.classList.add('chat-open');
  hydrateConversationMessages(conversation.id);

  if (!existingConversation && !shouldConfirmBackendProfile) {
    await syncNewContactConversation(conversation, normalizedContact, sessionGuard);
    showToast(`Contacto creado y chat abierto con ${normalizedContact.email}.`);
  } else if (!existingConversation) {
    showToast(`Contacto verificado y chat abierto con ${normalizedContact.email}.`);
  } else {
    showToast(existingConversation.archived
      ? `Chat archivado abierto con ${normalizedContact.email}.`
      : `Chat abierto con ${normalizedContact.email}.`);
  }

  return conversation;
}

function getCurrentProfileQrData() {
  const email = normalizeStorageIdentity(getSessionEmail());
  const userId = normalizeBackendUserId(getSessionUserId()) || normalizeBackendUserId(getCurrentUserIdentifier());
  const displayName = email ? email.split('@')[0] : 'Perfil ChatER';
  return { email, userId, displayName, name: displayName };
}

function isExpectedQrCameraFallbackError(error = {}) {
  const name = String(error?.name || '').toLowerCase();
  const code = String(error?.code || '').toLowerCase();
  const message = String(error?.message || error || '').toLowerCase();
  const expectedTokens = [
    'notallowed',
    'permission',
    'denied',
    'notfound',
    'notreadable',
    'overconstrained',
    'abort',
    'cancel',
    'insecure',
    'barcode',
    'detector',
    'camera',
    'cámara',
    'camara',
    'no se pudo iniciar barcode',
    'no se pudo acceder a la cámara'
  ];
  return expectedTokens.some((token) => name.includes(token) || code.includes(token) || message.includes(token));
}

function reportUnexpectedQrScannerError(error, message = 'No se pudo completar el flujo de QR.') {
  if (isExpectedQrCameraFallbackError(error)) return;
  console.warn(message, error);
}

function renderProfileQrForCurrentUser(container) {
  const target = container?.querySelector?.('[data-profile-qr-code]');
  const payloadTarget = container?.querySelector?.('[data-profile-qr-payload]');
  if (!target) return;

  if (!window.ChatERQRCodeLego?.renderProfileQr) {
    target.innerHTML = '<div class="qr-fallback-shape" aria-hidden="true">QR</div>';
    if (payloadTarget) payloadTarget.textContent = 'El bloque QR se cargará automáticamente al iniciar la app.';
    return;
  }

  try {
    const rendered = window.ChatERQRCodeLego.renderProfileQr(target, getCurrentProfileQrData(), {
      title: 'QR de perfil ChatER'
    });
    if (payloadTarget) payloadTarget.textContent = rendered.payload;
  } catch (error) {
    target.innerHTML = '<div class="qr-fallback-shape" aria-hidden="true">QR</div>';
    if (payloadTarget) payloadTarget.textContent = 'No se pudo generar el QR de perfil en este navegador.';
    console.warn('No se pudo generar el QR del perfil.', error);
  }
}

function parseContactQrPayload(rawValue = '') {
  const parsed = window.ChatERQRCodeLego?.parsePayload
    ? window.ChatERQRCodeLego.parsePayload(rawValue)
    : null;
  if (!parsed || !isValidEmailAddress(parsed.email)) {
    throw new Error('El QR no contiene un contacto ChatER válido.');
  }
  return normalizeContactCreationInput({ ...parsed, source: 'profile-qr' });
}

function normalizeContactFromQrResolverResponse(payload = {}, fallbackContact = {}) {
  const data = payload?.data && typeof payload.data === 'object' ? payload.data : payload;
  const profile = data?.profile && typeof data.profile === 'object' ? data.profile : {};
  const relation = data?.relation && typeof data.relation === 'object' ? data.relation : {};
  return normalizeContactCreationInput({
    ...fallbackContact,
    name: profile.displayName || profile.name || relation.displayName || relation.alias || fallbackContact.name || fallbackContact.displayName || '',
    email: profile.userEmail || profile.email || relation.contactEmail || relation.toUserEmail || fallbackContact.email || fallbackContact.contactEmail || '',
    userId: profile.userId || relation.contactUserId || relation.toUserId || fallbackContact.userId || fallbackContact.contactUserId || '',
    avatarImage: readProfileAvatarCandidate(profile) || readProfileAvatarCandidate(relation) || readProfileAvatarCandidate(fallbackContact),
    avatarUrl: readProfileAvatarCandidate(profile) || readProfileAvatarCandidate(relation) || readProfileAvatarCandidate(fallbackContact),
    source: 'profile-qr',
    backendQrResolvedAt: data?.resolvedAt || '',
    relationId: relation.id || ''
  });
}

async function resolveContactQrWithBackend(rawValue = '', fallbackContact = {}) {
  const normalizedFallback = normalizeContactCreationInput({ ...fallbackContact, source: 'profile-qr' });
  if (!CHATER_CONFIG.backendBaseUrl) return normalizedFallback;

  try {
    const payload = await apiClient.resolveContactQr(normalizedFallback, rawValue);
    return normalizeContactFromQrResolverResponse(payload, normalizedFallback);
  } catch (error) {
    console.warn('memoriaBACKEND rechazó o no pudo confirmar que el contacto del QR exista.', error);
    throw new Error('No se pudo crear el contacto: memoriaBACKEND no confirmó que el perfil del QR exista.');
  }
}

async function processDetectedContactQr(contactPayload = {}, rawValue = '') {
  let localContact;
  try {
    localContact = rawValue
      ? parseContactQrPayload(rawValue)
      : normalizeContactCreationInput({ ...contactPayload, source: 'profile-qr' });
  } catch (error) {
    if (!CHATER_CONFIG.backendBaseUrl || !rawValue) throw error;
    localContact = normalizeContactCreationInput({ ...contactPayload, source: 'profile-qr' });
  }

  const resolvedContact = await resolveContactQrWithBackend(rawValue, localContact);
  await openOrCreateContactConversation(resolvedContact, { closeModal: true, clearSearch: true, source: 'profile-qr' });
}

async function processContactQrPayload(rawValue = '') {
  await processDetectedContactQr({}, rawValue);
}

function openScanContactQrModal() {
  closeTransientPanels();
  const container = document.createElement('div');
  container.className = 'qr-scanner-panel';
  container.innerHTML = `
    <p class="modal-copy">Escanea el QR del perfil de otro usuario para crear el contacto y abrir el chat automáticamente.</p>
    <video class="qr-scanner-video" autoplay muted playsinline aria-label="Vista de cámara para escanear QR"></video>
    <p class="form-feedback" data-qr-feedback role="status" aria-live="polite">Preparando escáner QR...</p>
    <label for="manualQrPayload">Código QR manual</label>
    <textarea id="manualQrPayload" rows="3" placeholder="Pega aquí el contenido del QR si la cámara no está disponible"></textarea>
    <input type="file" accept="image/*" data-qr-file-input hidden>
    <div class="quick-action-grid">
      <button class="primary-button" type="button" data-qr-action="use-manual">Usar código</button>
      <button class="secondary-button" type="button" data-qr-action="image-file">Seleccionar imagen del QR</button>
      <button class="secondary-button" type="button" data-qr-action="back-contact">Crear por correo</button>
    </div>
  `;

  const feedback = container.querySelector('[data-qr-feedback]');
  const video = container.querySelector('video');
  const manualInput = container.querySelector('#manualQrPayload');
  const fileInput = container.querySelector('[data-qr-file-input]');

  const pickQrImageFile = () => requestChaterPermission('files', {
    title: 'Seleccionar imagen del QR',
    description: 'ChatER abrirá tus archivos para leer una imagen del QR de perfil y crear el contacto.',
    actionLabel: 'Seleccionar imagen',
    request: () => new Promise((resolve, reject) => {
      if (!fileInput) {
        reject(new Error('No se pudo abrir el selector de imágenes.'));
        return;
      }
      let settled = false;
      const finish = (callback, value) => {
        if (settled) return;
        settled = true;
        window.removeEventListener('focus', handleDialogReturn);
        fileInput.onchange = null;
        fileInput.oncancel = null;
        callback(value);
      };
      const handleDialogReturn = () => {
        window.setTimeout(() => {
          if (!settled && !fileInput.files?.length) finish(reject, new Error('No seleccionaste una imagen del QR.'));
        }, 350);
      };
      fileInput.value = '';
      fileInput.onchange = () => {
        const file = fileInput.files?.[0] || null;
        if (!file) {
          finish(reject, new Error('No seleccionaste una imagen del QR.'));
          return;
        }
        finish(resolve, file);
      };
      fileInput.oncancel = () => finish(reject, new Error('No seleccionaste una imagen del QR.'));
      window.addEventListener('focus', handleDialogReturn, { once: true });
      fileInput.click();
    })
  });

  container.addEventListener('click', async (event) => {
    const actionButton = event.target.closest('[data-qr-action]');
    if (!actionButton) return;
    if (actionButton.dataset.qrAction === 'back-contact') {
      openNewChatModal();
      return;
    }
    if (actionButton.dataset.qrAction === 'image-file') {
      try {
        const file = await pickQrImageFile();
        if (!window.ChatERQRCodeLego?.scanFromImage) throw new Error('El lector QR por imagen no está disponible en este navegador.');
        feedback.textContent = 'Leyendo imagen del QR...';
        const result = await window.ChatERQRCodeLego.scanFromImage(file, {
          emptyMessage: 'No se detectó un QR en la imagen seleccionada.',
          invalidMessage: 'La imagen no contiene un QR de perfil ChatER válido.',
          allowRawPayload: Boolean(CHATER_CONFIG.backendBaseUrl)
        });
        await processDetectedContactQr(result.contact, result.rawValue || '');
      } catch (error) {
        feedback.textContent = error?.message || 'No se pudo leer la imagen del QR.';
      }
      return;
    }
    if (actionButton.dataset.qrAction === 'use-manual') {
      try {
        await processContactQrPayload(manualInput.value.trim());
      } catch (error) {
        feedback.textContent = error?.message || 'No se pudo leer el código QR.';
      }
    }
  });

  setModal('Escanear QR de contacto', container, 'scan-contact-qr');

  const canUseCameraScanner = Boolean(navigator.mediaDevices?.getUserMedia && window.BarcodeDetector && window.ChatERQRCodeLego?.scanFromVideo);
  if (!canUseCameraScanner) {
    feedback.textContent = 'Este navegador no permite escanear QR directamente con cámara. Puedes seleccionar una imagen del QR o pegar su contenido para crear el contacto.';
    return;
  }

  let stopped = false;
  requestChaterPermission('camera', {
    title: 'Activar cámara para escanear QR',
    description: 'ChatER necesita la cámara solo para leer el QR del perfil y crear el contacto automáticamente.',
    actionLabel: 'Activar cámara',
    request: () => navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false })
  })
    .then((stream) => {
      if (!stream?.getTracks) {
        feedback.textContent = 'No se pudo iniciar la cámara. Selecciona una imagen del QR o pega el contenido manualmente.';
        return;
      }
      if (activeModalKind !== 'scan-contact-qr') {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      video.srcObject = stream;
      feedback.textContent = 'Apunta la cámara al QR del perfil.';
      activeQrScannerCleanup = () => {
        stopped = true;
        stream.getTracks().forEach((track) => track.stop());
        video.srcObject = null;
      };
      window.ChatERQRCodeLego.scanFromVideo(video, async (contactPayload, rawPayload) => {
        if (stopped) return;
        try {
          stopped = true;
          if (contactPayload && typeof contactPayload === 'object') {
            await processDetectedContactQr(contactPayload, rawPayload || '');
          } else {
            await processContactQrPayload(rawPayload || contactPayload);
          }
        } catch (error) {
          stopped = false;
          feedback.textContent = error?.message || 'El QR detectado no pertenece a un perfil ChatER válido.';
        }
      }, { intervalMs: 700, allowRawPayload: Boolean(CHATER_CONFIG.backendBaseUrl) }).then((cleanup) => {
        const stopStream = activeQrScannerCleanup;
        activeQrScannerCleanup = () => {
          cleanup?.();
          stopStream?.();
        };
      }).catch((error) => {
        feedback.textContent = 'No se pudo activar la lectura automática. Selecciona una imagen del QR o pega el contenido manualmente.';
        reportUnexpectedQrScannerError(error, 'No se pudo iniciar BarcodeDetector para QR.');
      });
    })
    .catch((error) => {
      feedback.textContent = 'No se pudo acceder a la cámara. Selecciona una imagen del QR o pega el contenido manualmente.';
      reportUnexpectedQrScannerError(error, 'Permiso de cámara no disponible para QR.');
    });
}

function openNewChatModal(seed = {}) {
  closeTransientPanels();
  const seedName = String(seed.name || '').trim();
  const seedEmail = normalizeStorageIdentity(seed.email || '');
  const form = document.createElement('form');
  form.innerHTML = `
    <p class="modal-copy">Crea un contacto con correo electrónico o escanea el QR de su perfil para abrir el chat al instante.</p>
    <label for="newChatName">Nombre visible opcional</label>
    <input id="newChatName" type="text" value="${escapeHTML(seedName)}" placeholder="Ej. María Gómez" />
    <label for="newChatEmail">Correo electrónico</label>
    <input id="newChatEmail" type="email" value="${escapeHTML(seedEmail)}" placeholder="contacto@correo.com" required />
    <div class="contact-create-actions">
      <button class="primary-button" type="submit">Crear contacto</button>
      <button class="qr-icon-button" type="button" data-contact-action="scan-qr" aria-label="Escanear QR de perfil" title="Escanear QR de perfil">▦</button>
    </div>
    <p class="form-feedback" data-feedback role="status" aria-live="polite"></p>
  `;

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const name = form.querySelector('#newChatName').value.trim();
    const email = form.querySelector('#newChatEmail').value.trim().toLowerCase();
    const feedback = form.querySelector('[data-feedback]');

    if (!email) {
      feedback.textContent = 'Escribe el correo electrónico del contacto.';
      return;
    }

    if (!isValidEmailAddress(email)) {
      feedback.textContent = 'Escribe un correo electrónico válido.';
      return;
    }

    try {
      await openOrCreateContactConversation({ name: name || email.split('@')[0], email, source: 'email' }, { closeModal: true, clearSearch: true });
    } catch (error) {
      feedback.textContent = error?.message || 'No se pudo crear el contacto.';
    }
  });

  form.addEventListener('click', (event) => {
    const actionButton = event.target.closest('[data-contact-action]');
    if (!actionButton) return;
    if (actionButton.dataset.contactAction === 'scan-qr') {
      event.preventDefault();
      openScanContactQrModal();
    }
  });

  setModal('agregar contacto por correo', form, 'new-contact');
  const focusTarget = seedEmail ? form.querySelector('#newChatName') : form.querySelector('#newChatEmail');
  focusTarget?.focus();
  if (seedName || seedEmail) form.querySelector('#newChatName')?.select?.();
}

function getBusinessToolRowsConfig() {
  const business = ensureBusinessState();
  const catalogCount = business.catalog.filter((item) => item.name).length;
  const campaignsCount = business.campaigns.length;
  const broadcastsCount = business.broadcasts.length;
  const ordersCount = business.orders.length;
  const verificationLabel = business.verification.status === 'pending' ? 'Solicitud en revisión' : business.verification.status === 'verified' ? 'Cuenta verificada' : 'Solicita una insignia de confianza';

  return [
    {
      id: 'business-verified',
      icon: '◎',
      title: 'Cuenta verificada',
      description: `${verificationLabel} para que tus contactos reconozcan tu perfil.`
    },
    {
      id: 'catalog',
      icon: '▦',
      title: 'Catálogo',
      description: catalogCount ? `${catalogCount} producto(s) o servicio(s) listos para compartir.` : 'Muestra tus productos y servicios.'
    },
    {
      id: 'ads-create',
      icon: '📣',
      title: 'Anuncios publicitarios',
      description: 'Crea anuncios que dirigen conversaciones hacia ChatER.'
    },
    {
      id: 'ads-manage',
      icon: '▣',
      title: 'Administra anuncios',
      description: campaignsCount ? `${campaignsCount} campaña(s) guardada(s) en esta sesión.` : 'Visualiza tus campañas en un solo lugar.'
    },
    {
      id: 'broadcasts',
      icon: '☊',
      title: 'Difusiones comerciales',
      description: broadcastsCount ? `${broadcastsCount} difusión(es) preparadas.` : 'Envía mensajes a varios contactos a la vez.'
    },
    {
      id: 'orders',
      icon: '▤',
      title: 'Pedidos',
      description: ordersCount ? `${ordersCount} pedido(s) registrados.` : 'Registra solicitudes de clientes y su seguimiento.'
    }
  ];
}

function getTechnicalToolRowsConfig() {
  const automaticTheme = applyAutomaticTheme() === 'light' ? 'claro' : 'oscuro';
  return [
    {
      id: 'theme',
      icon: '☀',
      title: 'Modo automático',
      description: `Ahora está en modo ${automaticTheme} según la hora local.`
    },
    {
      id: 'status',
      icon: '24',
      title: 'Crear estado',
      description: 'Publica una actualización visible por 24 horas.'
    },
    {
      id: 'api',
      icon: 'API',
      title: 'Estado memoriaBACKEND',
      description: 'Ver conexión, tiempo real y modo demo del sitio estático.'
    },
    {
      id: 'install',
      icon: '⬇',
      title: 'Instalar app',
      description: 'Agrega ChatER a la pantalla principal cuando el navegador lo permita.'
    },
    {
      id: 'notifications',
      icon: '🔔',
      title: 'Notificaciones',
      description: getNotificationToolDescription()
    },
    {
      id: 'update',
      icon: '↻',
      title: 'Actualizar app',
      description: 'Busca cambios del static site y aplica la nueva versión instalada.'
    },
    {
      id: 'logout',
      icon: '↩',
      title: 'Cerrar sesión',
      description: 'Salir de este navegador.'
    }
  ];
}

function getToolRowsConfig() {
  return [...getBusinessToolRowsConfig(), ...getTechnicalToolRowsConfig()];
}

function createToolRow(tool) {
  const button = document.createElement('button');
  button.className = 'tool-row';
  button.type = 'button';
  button.dataset.tool = tool.id;
  button.innerHTML = `
    <span class="tool-icon">${escapeHTML(tool.icon)}</span>
    <span><strong>${escapeHTML(tool.title)}</strong><br><small>${escapeHTML(tool.description)}</small></span>
  `;
  return button;
}

function isRunningAsInstalledPwa() {
  return Boolean(
    window.matchMedia?.('(display-mode: standalone)')?.matches
    || window.navigator?.standalone === true
  );
}

function getPwaStatusLabel() {
  const pwaStatus = window.ChatERPWA?.getStatus?.();
  if (!('serviceWorker' in navigator)) return 'No compatible';
  if (pwaStatus?.versionCheckInFlight) return 'Aplicando actualización automática';
  if (pwaStatus?.updateWaiting) return 'Activación automática pendiente';
  if (pwaStatus?.serviceWorker) return pwaStatus?.lastKnownVersion ? `Instalable activo · eventos memoriaBACKEND · versión ${pwaStatus.lastKnownVersion}` : 'Instalable activo · eventos memoriaBACKEND';
  return 'Preparando instalación';
}

function appendToolGroup(container, title, rows, options = {}) {
  if (!rows.length) return false;
  const heading = document.createElement('div');
  heading.className = 'tools-group-heading';
  heading.innerHTML = `<h3>${escapeHTML(title)}</h3>${options.description ? `<p>${escapeHTML(options.description)}</p>` : ''}`;
  container.appendChild(heading);
  rows.forEach((tool) => container.appendChild(createToolRow(tool)));
  return true;
}

function filterToolRows(rows, normalizedFilter = '') {
  if (!normalizedFilter) return rows;
  return rows.filter((tool) => [tool.title, tool.description, tool.id].some((value) => valueMatchesUiSearch(value, normalizedFilter)));
}

function renderToolsList() {
  const normalizedFilter = normalizeUiSearchText(searchInput.value);
  const metricsData = getBusinessMetrics();
  const businessRows = filterToolRows(getBusinessToolRowsConfig(), normalizedFilter);
  const technicalRows = filterToolRows(getTechnicalToolRowsConfig(), normalizedFilter);

  chatList.innerHTML = '';

  const metrics = document.createElement('section');
  metrics.className = 'tools-list-header';
  metrics.innerHTML = `
    <p class="section-kicker">Rendimiento de los últimos 7 días</p>
    <div class="tools-metric-grid" aria-label="Estado rápido de ChatER">
      <article><strong>${metricsData.conversationsStarted7d}</strong><span>Conversaciones iniciadas</span></article>
      <article><strong>${metricsData.catalogViews7d || '—'}</strong><span>Visualizaciones del catálogo</span></article>
      <article><strong>${metricsData.statusViews7d || '—'}</strong><span>Visualizaciones del estado</span></article>
    </div>
  `;
  chatList.appendChild(metrics);

  const renderedBusiness = appendToolGroup(chatList, 'Haz crecer tu empresa', businessRows, {
    description: 'Herramientas comerciales inspiradas en la referencia móvil, listas para memoriaBACKEND.'
  });
  const renderedTechnical = appendToolGroup(chatList, 'Administración de ChatER', technicalRows, {
    description: 'Instalación, actualización, notificaciones, APIs y sesión.'
  });

  if (!renderedBusiness && !renderedTechnical) {
    const empty = document.createElement('div');
    empty.className = 'empty-state list-empty';
    empty.innerHTML = '<strong>Sin herramientas</strong>No hay herramientas que coincidan con la búsqueda.';
    chatList.appendChild(empty);
  }
}

function renderToolsPanel() {
  const metricsData = getBusinessMetrics();
  activeName.textContent = 'Herramientas';
  activeStatus.textContent = 'Crecimiento, APIs, instalación y sesión';
  activeAvatar.textContent = '⚙';
  messagesContainer.hidden = false;
  messageForm.hidden = true;
  statusPanel.hidden = true;

  messagesContainer.innerHTML = `
    <section class="tools-panel" aria-label="Resumen de herramientas">
      <article class="tool-panel-card business-panel-card">
        <span class="tool-icon">▦</span>
        <div>
          <h3>Herramientas comerciales</h3>
          <p>${metricsData.conversationsStarted7d} conversaciones iniciadas · ${metricsData.catalogViews7d || 'sin'} visualizaciones de catálogo · ${metricsData.statusViews7d || 'sin'} visualizaciones de estado.</p>
        </div>
      </article>
      <article class="tool-panel-card">
        <span class="tool-icon">API</span>
        <div>
          <h3>memoriaBACKEND</h3>
          <p>${escapeHTML(CHATER_CONFIG.backendBaseUrl ? 'API configurada para producción.' : 'Modo demo local activo hasta configurar MEMORIA_BACKEND_URL.')}</p>
        </div>
      </article>
      <article class="tool-panel-card">
        <span class="tool-icon">↻</span>
        <div>
          <h3>App instalable</h3>
          <p>${escapeHTML(getPwaStatusLabel())}. ChatER actualiza shell, iconos y logo automáticamente cuando memoriaBACKEND emite un evento de versión o logo.</p>
        </div>
      </article>
      <article class="tool-panel-card">
        <span class="tool-icon">☀</span>
        <div>
          <h3>Modo visual automático</h3>
          <p>Claro de ${CHATER_CONFIG.lightStartsAt}:00 a ${CHATER_CONFIG.darkStartsAt}:00 y oscuro durante la noche.</p>
        </div>
      </article>
      <div class="quick-action-grid">
        <button class="primary-button" type="button" data-tool="catalog">Abrir catálogo</button>
        <button class="secondary-button" type="button" data-tool="broadcasts">Crear difusión</button>
        <button class="secondary-button" type="button" data-tool="api">Ver APIs</button>
        <button class="secondary-button" type="button" data-tool="update">Actualizar app</button>
      </div>
    </section>
  `;
}

async function handleToolAction(tool) {
  if (tool === 'business-verified') {
    openBusinessVerificationModal();
    return;
  }

  if (tool === 'catalog') {
    openCatalogModal();
    return;
  }

  if (tool === 'ads-create') {
    openAdCampaignModal();
    return;
  }

  if (tool === 'ads-manage') {
    openAdsManagerModal();
    return;
  }

  if (tool === 'broadcasts') {
    openBroadcastsModal();
    return;
  }

  if (tool === 'orders') {
    openOrdersModal();
    return;
  }

  if (tool === 'theme') {
    const mode = applyAutomaticTheme() === 'light' ? 'claro' : 'oscuro';
    showToast(`Modo automático activo: ${mode}.`);
    return;
  }

  if (tool === 'status') {
    closeModal();
    openCreateStatusModal();
    return;
  }

  if (tool === 'api') {
    openApiStatusModal();
    return;
  }

  if (tool === 'install') {
    const result = await window.ChatERPWA?.install?.();
    showToast(result?.message || 'La instalación depende del navegador y del manifiesto PWA.');
    return;
  }

  if (tool === 'notifications') {
    openNotificationSettingsModal();
    return;
  }

  if (tool === 'update') {
    const result = await window.ChatERPWA?.checkForUpdates?.();
    showToast(result?.message || 'Buscando actualizaciones de ChatER.');
    return;
  }

  if (tool === 'logout') {
    logoutCurrentSession();
  }
}

function createBusinessItemSummary(items = [], emptyText = 'Aún no hay registros.') {
  if (!items.length) return `<p class="business-empty">${escapeHTML(emptyText)}</p>`;
  return `
    <div class="business-summary-list">
      ${items.slice(0, 6).map((item) => `
        <article>
          <strong>${escapeHTML(item.name || item.title || item.customerEmail || 'Registro')}</strong>
          <span>${escapeHTML(item.description || item.detail || item.objective || item.message || item.status || 'Guardado localmente')}</span>
        </article>
      `).join('')}
    </div>
  `;
}

function openBusinessVerificationModal() {
  closeTransientPanels();
  const business = ensureBusinessState();
  const statusLabel = business.verification.status === 'pending'
    ? 'Solicitud enviada y pendiente de revisión'
    : business.verification.status === 'verified'
      ? 'Cuenta verificada'
      : 'Sin solicitud activa';
  const container = document.createElement('div');
  container.innerHTML = `
    <div class="api-status-grid">
      <div><strong>Estado</strong><span>${escapeHTML(statusLabel)}</span></div>
      <div><strong>Cuenta</strong><span>${escapeHTML(getSessionEmail())}</span></div>
      <div><strong>memoriaBACKEND</strong><span>${escapeHTML(CHATER_CONFIG.backendBaseUrl ? 'Registra solicitudes en /api/v1/landing-tools/evento.' : 'Modo local hasta configurar MEMORIA_BACKEND_URL.')}</span></div>
      <div><strong>Requisito</strong><span>Perfil activo, correo validado y actividad comercial legítima.</span></div>
    </div>
    <p class="modal-copy">La verificación ayuda a que tus contactos identifiquen tu cuenta comercial. La decisión final debe hacerla memoriaBACKEND o un equipo humano, no el cliente estático.</p>
    <div class="quick-action-grid">
      <button class="primary-button" type="button" data-business-verification-action="request">Solicitar verificación</button>
      <button class="secondary-button" type="button" data-business-verification-action="requirements">Ver requisitos</button>
    </div>
  `;

  container.addEventListener('click', (event) => {
    const button = event.target.closest('[data-business-verification-action]');
    if (!button) return;

    if (button.dataset.businessVerificationAction === 'requirements') {
      showToast('Requisitos: correo activo, perfil completo, catálogo o actividad verificable.');
      return;
    }

    business.verification.status = 'pending';
    business.verification.requestedAt = new Date().toISOString();
    persistBusinessToolAction('business-verified', 'requestVerification', {
      verification: business.verification,
      clientMutationId: generateClientMutationId()
    }, {
      title: 'Solicitud de verificación enviada',
      detail: 'La cuenta quedó marcada como pendiente de revisión.'
    });
    showToast('Solicitud de verificación guardada.');
    closeModal();
    openBusinessVerificationModal();
  });

  setModal('Cuenta verificada', container, 'business-tool');
}

function openCatalogModal() {
  closeTransientPanels();
  const business = ensureBusinessState();
  business.metrics.catalogViews7d = Number(business.metrics.catalogViews7d || 0) + 1;
  persistBusinessToolAction('catalog', 'viewCatalog', { clientMutationId: generateClientMutationId() }, {
    title: 'Catálogo abierto',
    detail: 'Se registró una visualización local del catálogo.'
  });

  const container = document.createElement('div');
  container.innerHTML = `
    <p class="modal-copy">Crea productos o servicios para compartirlos desde el chat. Los registros quedan locales y se encolan para memoriaBACKEND cuando esté configurado.</p>
    ${createBusinessItemSummary(business.catalog, 'Todavía no hay productos o servicios en el catálogo.')}
    <form class="business-form" data-business-form="catalog">
      <label for="catalogItemName">Nombre del producto o servicio</label>
      <input id="catalogItemName" type="text" placeholder="Ej. Instalación personalizada" required />
      <label for="catalogItemPrice">Precio o rango</label>
      <input id="catalogItemPrice" type="text" placeholder="Ej. Desde $120.000" />
      <label for="catalogItemDescription">Descripción</label>
      <textarea id="catalogItemDescription" rows="3" maxlength="240" placeholder="Describe lo que ofreces" required></textarea>
      <button class="primary-button" type="submit">Guardar en catálogo</button>
    </form>
  `;

  container.querySelector('[data-business-form="catalog"]').addEventListener('submit', (event) => {
    event.preventDefault();
    const item = {
      id: `catalog-${generateClientMutationId()}`,
      name: container.querySelector('#catalogItemName').value.trim(),
      price: container.querySelector('#catalogItemPrice').value.trim(),
      description: container.querySelector('#catalogItemDescription').value.trim(),
      createdAt: new Date().toISOString()
    };
    if (!item.name || !item.description) return;
    business.catalog.unshift(item);
    persistBusinessToolAction('catalog', 'upsertCatalogItem', { item, clientMutationId: generateClientMutationId() }, {
      title: 'Producto agregado al catálogo',
      detail: item.name
    });
    showToast('Producto guardado en el catálogo.');
    closeModal();
    openCatalogModal();
  });

  setModal('Catálogo', container, 'business-tool');
}

function openAdCampaignModal() {
  closeTransientPanels();
  const business = ensureBusinessState();
  const container = document.createElement('div');
  container.innerHTML = `
    <p class="modal-copy">Prepara campañas para dirigir clientes hacia tus conversaciones. memoriaBACKEND debe validar presupuesto, cumplimiento y publicación final.</p>
    <form class="business-form" data-business-form="campaign">
      <label for="campaignName">Nombre de la campaña</label>
      <input id="campaignName" type="text" placeholder="Ej. Promoción de temporada" required />
      <label for="campaignObjective">Objetivo</label>
      <select id="campaignObjective">
        <option value="messages">Recibir mensajes</option>
        <option value="catalog">Visitas al catálogo</option>
        <option value="status">Promocionar estado</option>
      </select>
      <label for="campaignBudget">Presupuesto estimado</label>
      <input id="campaignBudget" type="text" placeholder="Ej. $50.000 diarios" />
      <button class="primary-button" type="submit">Crear anuncio</button>
    </form>
  `;

  container.querySelector('[data-business-form="campaign"]').addEventListener('submit', (event) => {
    event.preventDefault();
    const campaign = {
      id: `campaign-${generateClientMutationId()}`,
      name: container.querySelector('#campaignName').value.trim(),
      objective: container.querySelector('#campaignObjective').value,
      budget: container.querySelector('#campaignBudget').value.trim(),
      status: 'draft',
      createdAt: new Date().toISOString()
    };
    if (!campaign.name) return;
    business.campaigns.unshift(campaign);
    persistBusinessToolAction('ads-create', 'createCampaignDraft', { campaign, clientMutationId: generateClientMutationId() }, {
      title: 'Anuncio creado como borrador',
      detail: campaign.name
    });
    showToast('Anuncio guardado como borrador.');
    closeModal();
    openAdsManagerModal();
  });

  setModal('Anuncios publicitarios', container, 'business-tool');
}

function openAdsManagerModal() {
  closeTransientPanels();
  const business = ensureBusinessState();
  const container = document.createElement('div');
  container.innerHTML = `
    <p class="modal-copy">Visualiza los anuncios creados en este dispositivo. Cuando memoriaBACKEND esté conectado, esta acción debe sincronizar campañas, estados y métricas.</p>
    ${createBusinessItemSummary(business.campaigns, 'Todavía no hay campañas guardadas.')}
    <div class="quick-action-grid">
      <button class="primary-button" type="button" data-tool="ads-create">Crear anuncio</button>
      <button class="secondary-button" type="button" data-business-action="sync-ads">Sincronizar campañas</button>
    </div>
  `;

  container.addEventListener('click', async (event) => {
    const toolButton = event.target.closest('[data-tool]');
    if (toolButton) {
      await handleToolAction(toolButton.dataset.tool);
      return;
    }

    if (event.target.closest('[data-business-action="sync-ads"]')) {
      persistBusinessToolAction('ads-manage', 'syncCampaigns', { campaigns: business.campaigns, clientMutationId: generateClientMutationId() }, {
        title: 'Sincronización de campañas solicitada',
        detail: `${business.campaigns.length} campaña(s) en revisión.`
      });
      showToast(CHATER_CONFIG.backendBaseUrl ? 'Campañas en cola de sincronización.' : 'Modo local: configura memoriaBACKEND para sincronizar campañas.');
    }
  });

  setModal('Administra anuncios', container, 'business-tool');
}

function openBroadcastsModal() {
  closeTransientPanels();
  const business = ensureBusinessState();
  const container = document.createElement('div');
  container.innerHTML = `
    <p class="modal-copy">Prepara una difusión comercial para contactos con correo. memoriaBACKEND debe aplicar consentimiento, límites y entrega final sin polling.</p>
    ${createBusinessItemSummary(business.broadcasts, 'Todavía no hay difusiones preparadas.')}
    <form class="business-form" data-business-form="broadcast">
      <label for="broadcastAudience">Audiencia</label>
      <select id="broadcastAudience">
        <option value="all-active">Contactos activos</option>
        <option value="unread">Conversaciones sin responder</option>
        <option value="custom">Lista personalizada</option>
      </select>
      <label for="broadcastMessage">Mensaje</label>
      <textarea id="broadcastMessage" rows="4" maxlength="500" placeholder="Escribe el mensaje comercial" required></textarea>
      <button class="primary-button" type="submit">Preparar difusión</button>
    </form>
  `;

  container.querySelector('[data-business-form="broadcast"]').addEventListener('submit', (event) => {
    event.preventDefault();
    const broadcast = {
      id: `broadcast-${generateClientMutationId()}`,
      audience: container.querySelector('#broadcastAudience').value,
      message: container.querySelector('#broadcastMessage').value.trim(),
      status: 'draft',
      createdAt: new Date().toISOString()
    };
    if (!broadcast.message) return;
    business.broadcasts.unshift(broadcast);
    persistBusinessToolAction('broadcasts', 'createBroadcastDraft', { broadcast, clientMutationId: generateClientMutationId() }, {
      title: 'Difusión preparada',
      detail: broadcast.message.slice(0, 80)
    });
    showToast('Difusión guardada como borrador.');
    closeModal();
    openBroadcastsModal();
  });

  setModal('Difusiones comerciales', container, 'business-tool');
}

function openOrdersModal() {
  closeTransientPanels();
  const business = ensureBusinessState();
  const container = document.createElement('div');
  container.innerHTML = `
    <p class="modal-copy">Registra pedidos asociados a un correo para dar seguimiento desde ChatER. memoriaBACKEND debe confirmar pagos, estados y notificaciones.</p>
    ${createBusinessItemSummary(business.orders, 'Todavía no hay pedidos registrados.')}
    <form class="business-form" data-business-form="order">
      <label for="orderCustomerEmail">Correo del cliente</label>
      <input id="orderCustomerEmail" type="email" placeholder="cliente@correo.com" required />
      <label for="orderDetail">Detalle del pedido</label>
      <textarea id="orderDetail" rows="3" maxlength="300" placeholder="Describe el pedido" required></textarea>
      <label for="orderAmount">Valor estimado</label>
      <input id="orderAmount" type="text" placeholder="Ej. $180.000" />
      <button class="primary-button" type="submit">Registrar pedido</button>
    </form>
  `;

  container.querySelector('[data-business-form="order"]').addEventListener('submit', (event) => {
    event.preventDefault();
    const customerEmail = normalizeStorageIdentity(container.querySelector('#orderCustomerEmail').value);
    if (!isValidEmailAddress(customerEmail)) {
      showToast('Escribe un correo válido para registrar el pedido.');
      return;
    }
    const order = {
      id: `order-${generateClientMutationId()}`,
      customerEmail,
      detail: container.querySelector('#orderDetail').value.trim(),
      amount: container.querySelector('#orderAmount').value.trim(),
      status: 'new',
      createdAt: new Date().toISOString()
    };
    if (!order.detail) return;
    business.orders.unshift(order);
    persistBusinessToolAction('orders', 'createOrder', { order, clientMutationId: generateClientMutationId() }, {
      title: 'Pedido registrado',
      detail: `${customerEmail} · ${order.detail.slice(0, 60)}`
    });
    showToast('Pedido registrado.');
    closeModal();
    openOrdersModal();
  });

  setModal('Pedidos', container, 'business-tool');
}


function openToolsModal() {
  closeTransientPanels();
  const container = document.createElement('div');
  getToolRowsConfig().forEach((tool) => container.appendChild(createToolRow(tool)));

  container.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-tool]');
    if (!button) return;
    await handleToolAction(button.dataset.tool);
  });

  setModal('Herramientas', container, 'tools');
}

const MEMORIA_BACKEND_REQUIRED_CAPABILITIES = [
  { label: 'Autenticación Google/Gmail', tokens: ['AUTENTICACIONx', 'window.memoriaBACKEND', '/login.js', 'google'] },
  { label: 'Perfil de usuario', tokens: ['PERFILusuarioX', '/api/v1/perfil-usuario', 'perfil-usuario'] },
  { label: 'Preferencias de usuario', tokens: ['PREFERENCIASusuarioX', '/api/v1/preferencias-usuario', 'preferencias-usuario'] },
  { label: 'Conversaciones', tokens: ['CONVERSACIONESx', '/api/v1/conversaciones', 'conversaciones'] },
  { label: 'Mensajes', tokens: ['MENSAJESx', '/api/v1/mensajes', 'mensajes'] },
  { label: 'Búsqueda federada', tokens: ['BUSQUEDAx', '/api/v1/busqueda/buscar', '/api/v1/busqueda', 'busqueda'] },
  { label: 'Interacciones de mensaje', tokens: ['INTERACCIONESmensajeX', '/api/v1/interacciones-mensaje', 'interacciones-mensaje'] },
  { label: 'Señales efímeras', tokens: ['SENALESefimerasX', '/api/v1/senales-efimeras', 'senales-efimeras'] },
  { label: 'Presencia de usuario', tokens: ['PRESENCIAusuarioX', '/api/v1/presencia-usuario', 'presencia-usuario'] },
  { label: 'Tiempo real streme', tokens: ['STREMEx', '/api/v1/streme', 'streme/eventos'] },
  { label: 'Cursor de sincronización', tokens: ['CURSOResincronizacionX', '/api/v1/cursor-sincronizacion', 'cursor-sincronizacion'] },
  { label: 'Reconciliación de IDs', tokens: ['RECONCILIACIONidsX', '/api/v1/reconciliacion-ids', 'reconciliacion-ids'] },
  { label: 'Media firmada', tokens: ['MEDIAfirmadaX', '/api/v1/media-firmada', 'media-firmada'] },
  { label: 'Imágenes R2x', tokens: ['ImagenesCloudflareR2x', '/api/v1/imagenes-r2x', 'imagenes-r2x'] },
  { label: 'Estados 24 horas', tokens: ['PUBLICACIONESefimerasX', '/api/v1/publicaciones-efimeras', 'publicaciones-efimeras'] },
  { label: 'Vistas de contenido', tokens: ['VISTAScontenidoX', '/api/v1/vistas-contenido', 'vistas-contenido'] },
  { label: 'Sesiones de comunicación', tokens: ['SESIONEScomunicacionX', '/api/v1/sesiones-comunicacion', 'sesiones-comunicacion'] },
  { label: 'Señalización de llamadas', tokens: ['SIGNALINGtiempoRealX', '/api/v1/signaling-tiempo-real', 'signaling-tiempo-real'] },
  { label: 'Push PWA', tokens: ['APInotificacionesPUSHx', '/api/v1/push', 'push/suscripciones'] },
  { label: 'Visitas static site', tokens: ['VISITASstaticSITEx', '/api/v1/visitas/apertura', '/api/v1/visitas', 'visitas/apertura'] },
  { label: 'Eventos de herramientas comerciales', tokens: ['LANDINGTOOLSx', '/api/v1/landing-tools', 'landing-tools/evento'] },
  { label: 'Gobernanza de bloques sincronizados', tokens: ['BLOQUESsincronizadosX', '/api/v1/bloques-sincronizados', 'bloques-sincronizados'] }
];

const API_MANIFEST_CACHE_TTL_MS = 5 * 60 * 1000;
let memoriaApiManifestCache = null;
let memoriaApiManifestInFlight = null;
let memoriaBlocksSyncCache = null;
let memoriaBlocksSyncInFlight = null;

function openApiStatusModal() {
  const backendStatus = CHATER_CONFIG.backendBaseUrl ? 'Configurado' : 'Falta MEMORIA_BACKEND_URL';
  const realtimeStatus = getStremeConnectionStatusLabel();
  const pendingOutboxCount = getPendingOutboxCount();
  const storageIdentity = normalizeStorageIdentity(getSessionEmail()) || 'sesión Google/Gmail pendiente';
  const manifestInitialLabel = CHATER_CONFIG.backendBaseUrl
    ? getCachedApiManifestSummaryLabel()
    : 'No se consulta hasta configurar MEMORIA_BACKEND_URL.';
  const blocksSyncInitialLabel = CHATER_CONFIG.backendBaseUrl
    ? getCachedBlocksSyncSummaryLabel()
    : 'No se consulta hasta configurar MEMORIA_BACKEND_URL.';
  const container = document.createElement('div');
  container.innerHTML = `
    <div class="api-status-grid">
      <div><strong>API base</strong><span>${escapeHTML(backendStatus)}</span></div>
      <div><strong>Tiempo real streme</strong><span>${escapeHTML(realtimeStatus)}</span></div>
      <div><strong>Cursor de sincronización</strong><span>${escapeHTML(getSyncCursorStatusLabel())}</span></div>
      <div><strong>Transporte streme</strong><span>${escapeHTML(getStremeTransportLabel())}</span></div>
      <div><strong>Tiempo máximo API</strong><span>${Math.round(CHATER_CONFIG.apiTimeoutMs / 1000)} s API · ${Math.round(CHATER_CONFIG.mediaUploadTimeoutMs / 1000)} s adjuntos</span></div>
      <div><strong>Sesión</strong><span>${isMemoriaBackendSessionReady() ? 'memoriaBACKEND activo' : 'Pendiente de memoriaBACKEND'}</span></div>
      <div><strong>Sin polling</strong><span>Chats, perfiles, fotos, estados, llamadas y versión de app se actualizan por eventos WebSocket/SSE de memoriaBACKEND.</span></div>
      <div><strong>Acciones pendientes</strong><span>${pendingOutboxCount ? `${pendingOutboxCount} operación(es) esperando memoriaBACKEND` : 'No hay operaciones pendientes'}</span></div>
      <div><strong>App instalada</strong><span>${escapeHTML(getPwaStatusLabel())}</span></div>
      <div><strong>Notificaciones</strong><span>${escapeHTML(getNotificationPermissionLabel())}</span></div>
      <div><strong>Preferencias de usuario</strong><span>${escapeHTML(getUserPreferencesStatusLabel())}</span></div>
      <div><strong>Visita static site</strong><span>${escapeHTML(getStaticVisitStatusLabel())}</span></div>
      <div><strong>Almacenamiento local</strong><span>Aislado para ${escapeHTML(storageIdentity)}.</span></div>
      <div class="api-status-wide" data-api-manifest-status><strong>Manifiesto memoriaBACKEND</strong><span>${escapeHTML(manifestInitialLabel)}</span></div>
      <div class="api-status-wide" data-blocks-sync-status><strong>Bloques sincronizados</strong><span>${escapeHTML(blocksSyncInitialLabel)}</span></div>
    </div>
    <div class="quick-action-grid">
      <button id="retryOutboxButton" class="primary-button" type="button">Reintentar sincronización</button>
      ${CHATER_CONFIG.backendBaseUrl ? '<button id="refreshApiManifestButton" class="secondary-button" type="button">Verificar APIs y bloques</button>' : ''}
    </div>
  `;

  container.querySelector('#retryOutboxButton').addEventListener('click', async () => {
    if (!CHATER_CONFIG.backendBaseUrl) {
      showToast('Configura MEMORIA_BACKEND_URL para sincronizar acciones pendientes.');
      return;
    }

    await flushBackendOutbox();
    showToast(getPendingOutboxCount() ? 'Aún hay acciones pendientes por sincronizar.' : 'Sincronización local completada.');
    closeModal();
    openApiStatusModal();
  });

  container.querySelector('#refreshApiManifestButton')?.addEventListener('click', async () => {
    await Promise.all([
      hydrateApiManifestStatus(container, { force: true }),
      hydrateBlocksSyncStatus(container, { force: true })
    ]);
  });

  setModal('Estado de memoriaBACKEND', container);
  hydrateApiManifestStatus(container);
  hydrateBlocksSyncStatus(container);
}

function getCachedApiManifestSummaryLabel() {
  if (!memoriaApiManifestCache?.checkedAt) return 'Pendiente de verificar contra /api/v1/versiones/manifest.';
  if (memoriaApiManifestCache.error) return `Última verificación falló: ${memoriaApiManifestCache.error}`;
  return memoriaApiManifestCache.summary?.label || `Verificado ${formatScheduledCallTime(memoriaApiManifestCache.checkedAt)}.`;
}

function getCachedBlocksSyncSummaryLabel() {
  if (!memoriaBlocksSyncCache?.checkedAt) return 'Pendiente de verificar contra /api/v1/bloques-sincronizados/validacion y /montajes.';
  if (memoriaBlocksSyncCache.error) return `Última verificación falló: ${memoriaBlocksSyncCache.error}`;
  return memoriaBlocksSyncCache.summary?.label || `Verificado ${formatScheduledCallTime(memoriaBlocksSyncCache.checkedAt)}.`;
}

async function hydrateApiManifestStatus(container, options = {}) {
  const target = container?.querySelector?.('[data-api-manifest-status]');
  if (!target) return;

  if (!CHATER_CONFIG.backendBaseUrl) {
    setApiManifestStatus(target, 'Manifiesto memoriaBACKEND', 'Modo demo local: no se consulta /api/v1/versiones/manifest hasta configurar MEMORIA_BACKEND_URL.');
    return;
  }

  setApiManifestStatus(target, 'Manifiesto memoriaBACKEND', options.force ? 'Verificando nuevamente las APIs publicadas…' : 'Consultando /api/v1/versiones/manifest…');

  try {
    const payload = await loadMemoriaApiManifest(options);
    if (!document.body.contains(container)) return;
    const summary = summarizeMemoriaApiManifest(payload);
    memoriaApiManifestCache = { payload, summary, checkedAt: new Date().toISOString(), error: '' };
    renderApiManifestSummary(target, summary, memoriaApiManifestCache.checkedAt);
  } catch (error) {
    if (!document.body.contains(container)) return;
    const message = sanitizeApiStatusError(error);
    memoriaApiManifestCache = { payload: null, summary: null, checkedAt: new Date().toISOString(), error: message };
    setApiManifestStatus(target, 'Manifiesto memoriaBACKEND', `No se pudo verificar el manifiesto de APIs: ${message}`);
  }
}

async function loadMemoriaApiManifest(options = {}) {
  const now = Date.now();
  const checkedAt = memoriaApiManifestCache?.checkedAt ? new Date(memoriaApiManifestCache.checkedAt).getTime() : 0;
  const cacheIsFresh = memoriaApiManifestCache?.payload && checkedAt && now - checkedAt < API_MANIFEST_CACHE_TTL_MS;
  if (!options.force && cacheIsFresh) return memoriaApiManifestCache.payload;
  if (!options.force && memoriaApiManifestInFlight) return memoriaApiManifestInFlight;

  memoriaApiManifestInFlight = apiClient.getApiManifest()
    .finally(() => {
      memoriaApiManifestInFlight = null;
    });

  return memoriaApiManifestInFlight;
}

async function hydrateBlocksSyncStatus(container, options = {}) {
  const target = container?.querySelector?.('[data-blocks-sync-status]');
  if (!target) return;

  if (!CHATER_CONFIG.backendBaseUrl) {
    setApiManifestStatus(target, 'Bloques sincronizados', 'Modo demo local: no se consulta BLOQUESsincronizadosX hasta configurar MEMORIA_BACKEND_URL.');
    return;
  }

  setApiManifestStatus(target, 'Bloques sincronizados', options.force ? 'Validando bloques, versiones y montajes runtime…' : 'Consultando BLOQUESsincronizadosX…');

  try {
    const payload = await loadMemoriaBlocksSyncStatus(options);
    if (!document.body.contains(container)) return;
    const summary = summarizeMemoriaBlocksSyncStatus(payload);
    memoriaBlocksSyncCache = { payload, summary, checkedAt: new Date().toISOString(), error: '' };
    renderBlocksSyncSummary(target, summary, memoriaBlocksSyncCache.checkedAt);
  } catch (error) {
    if (!document.body.contains(container)) return;
    const message = sanitizeApiStatusError(error);
    memoriaBlocksSyncCache = { payload: null, summary: null, checkedAt: new Date().toISOString(), error: message };
    setApiManifestStatus(target, 'Bloques sincronizados', `No se pudo verificar BLOQUESsincronizadosX: ${message}`);
  }
}

async function loadMemoriaBlocksSyncStatus(options = {}) {
  const now = Date.now();
  const checkedAt = memoriaBlocksSyncCache?.checkedAt ? new Date(memoriaBlocksSyncCache.checkedAt).getTime() : 0;
  const cacheIsFresh = memoriaBlocksSyncCache?.payload && checkedAt && now - checkedAt < API_MANIFEST_CACHE_TTL_MS;
  if (!options.force && cacheIsFresh) return memoriaBlocksSyncCache.payload;
  if (!options.force && memoriaBlocksSyncInFlight) return memoriaBlocksSyncInFlight;

  memoriaBlocksSyncInFlight = Promise.allSettled([
    apiClient.getBlocksSyncValidation(),
    apiClient.getBlocksSyncMounts()
  ]).then((results) => {
    const [validationResult, mountsResult] = results;
    const validation = validationResult.status === 'fulfilled' ? validationResult.value : null;
    const mounts = mountsResult.status === 'fulfilled' ? mountsResult.value : null;
    const errors = results
      .filter((result) => result.status === 'rejected')
      .map((result) => sanitizeApiStatusError(result.reason));

    if (!validation && !mounts) {
      throw new Error(errors[0] || 'BLOQUESsincronizadosX no respondió.');
    }

    return { validation, mounts, errors };
  }).finally(() => {
    memoriaBlocksSyncInFlight = null;
  });

  return memoriaBlocksSyncInFlight;
}

function renderBlocksSyncSummary(target, summary, checkedAt) {
  const details = summary.details.length
    ? `<small>${escapeHTML(summary.details.slice(0, 3).join(' · '))}${summary.details.length > 3 ? '…' : ''}</small>`
    : '<small>BLOQUESsincronizadosX respondió sin alertas verificables desde el static site.</small>';

  target.innerHTML = `
    <strong>Bloques sincronizados</strong>
    <span>${escapeHTML(summary.label)}</span>
    ${details}
    <small>Última verificación: ${escapeHTML(formatScheduledCallTime(checkedAt))}.</small>
  `;
}

function summarizeMemoriaBlocksSyncStatus(payload = {}) {
  const tokens = collectApiManifestTokens(payload);
  const hasValidation = Boolean(payload.validation);
  const hasMounts = Boolean(payload.mounts);
  const reportedErrors = Array.isArray(payload.errors) ? payload.errors.filter(Boolean) : [];
  const structuredWarnings = extractBlocksSyncWarnings(payload);
  const hasWarnings = reportedErrors.length > 0 || structuredWarnings.length > 0;
  const confirmsBlockGovernance = apiManifestTokensContain(tokens, 'bloques-sincronizados')
    || apiManifestTokensContain(tokens, 'BLOQUESsincronizadosX')
    || apiManifestTokensContain(tokens, 'runtimeMountCoverage')
    || apiManifestTokensContain(tokens, 'montajes');

  const details = [];
  if (hasValidation) details.push('Validación de bloques consultada');
  if (hasMounts) details.push('Montajes runtime consultados');
  if (reportedErrors.length) details.push(`Errores de consulta: ${reportedErrors.join(', ')}`);
  if (structuredWarnings.length) details.push(`Alertas: ${structuredWarnings.slice(0, 3).join(', ')}`);

  if (!tokens.length) {
    return { label: 'BLOQUESsincronizadosX respondió sin detalle verificable.', details, unknown: true };
  }

  if (hasWarnings) {
    return { label: 'BLOQUESsincronizadosX respondió con alertas de sincronización.', details, unknown: false };
  }

  if (confirmsBlockGovernance || (hasValidation && hasMounts)) {
    return { label: 'Validación de bloques, versiones y montajes runtime disponible.', details, unknown: false };
  }

  return { label: 'BLOQUESsincronizadosX respondió, pero falta detalle de gobernanza verificable.', details, unknown: true };
}

function extractBlocksSyncWarnings(payload = {}) {
  const warnings = [];
  const warningKeyPattern = /(missing|faltante|duplicate|duplicado|invalid|invalido|desync|desincroniz|warning|alerta|error)/i;
  const okKeyPattern = /^(ok|valid|validado|isValid|success)$/i;

  const visit = (value, key = '', depth = 0) => {
    if (depth > 7 || warnings.length > 12 || value === null || value === undefined) return;

    if (okKeyPattern.test(key) && value === false) {
      warnings.push(`${key}: false`);
      return;
    }

    if (Array.isArray(value)) {
      if (warningKeyPattern.test(key) && value.length > 0) {
        warnings.push(`${key}: ${value.length}`);
      }
      value.forEach((item) => visit(item, key, depth + 1));
      return;
    }

    if (typeof value === 'string') {
      const normalized = value.trim();
      if (warningKeyPattern.test(key) && normalized) warnings.push(`${key}: ${normalized.slice(0, 80)}`);
      return;
    }

    if (typeof value === 'number') {
      if (warningKeyPattern.test(key) && value > 0) warnings.push(`${key}: ${value}`);
      return;
    }

    if (typeof value === 'boolean') {
      if (warningKeyPattern.test(key) && value === true) warnings.push(`${key}: true`);
      return;
    }

    if (typeof value === 'object') {
      Object.entries(value).forEach(([childKey, childValue]) => visit(childValue, childKey, depth + 1));
    }
  };

  visit(payload);
  return [...new Set(warnings)];
}

function setApiManifestStatus(target, title, message) {
  target.innerHTML = `<strong>${escapeHTML(title)}</strong><span>${escapeHTML(message)}</span>`;
}

function renderApiManifestSummary(target, summary, checkedAt) {
  const missingText = summary.missing.length
    ? `<small>Faltan por confirmar: ${escapeHTML(summary.missing.slice(0, 4).join(', '))}${summary.missing.length > 4 ? '…' : ''}</small>`
    : '<small>Los procesos críticos del static site aparecen cubiertos por el manifiesto publicado.</small>';

  target.innerHTML = `
    <strong>Manifiesto memoriaBACKEND</strong>
    <span>${escapeHTML(summary.label)}</span>
    ${summary.unknown ? '<small>memoriaBACKEND respondió, pero el manifiesto no expuso detalle suficiente de bloques para una validación completa desde el static site.</small>' : missingText}
    <small>Última verificación: ${escapeHTML(formatScheduledCallTime(checkedAt))}.</small>
  `;
}

function summarizeMemoriaApiManifest(payload = {}) {
  const tokens = collectApiManifestTokens(payload);
  const checks = MEMORIA_BACKEND_REQUIRED_CAPABILITIES.map((capability) => ({
    ...capability,
    available: capability.tokens.some((token) => apiManifestTokensContain(tokens, token))
  }));
  const confirmed = checks.filter((check) => check.available);
  const missing = checks.filter((check) => !check.available).map((check) => check.label);
  const unknown = tokens.length < 3 || confirmed.length === 0;

  if (unknown) {
    return {
      label: 'Manifiesto recibido sin detalle verificable de bloques.',
      confirmedCount: confirmed.length,
      totalCount: checks.length,
      missing: [],
      unknown: true
    };
  }

  return {
    label: `${confirmed.length}/${checks.length} capacidades críticas detectadas en /api/v1/versiones/manifest.`,
    confirmedCount: confirmed.length,
    totalCount: checks.length,
    missing,
    unknown: false
  };
}

function collectApiManifestTokens(payload = {}) {
  const tokens = new Set();
  const visit = (value, depth = 0) => {
    if (depth > 7 || tokens.size > 2500 || value === null || value === undefined) return;

    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      const normalized = String(value).trim().toLowerCase();
      if (normalized) tokens.add(normalized);
      return;
    }

    if (Array.isArray(value)) {
      value.forEach((item) => visit(item, depth + 1));
      return;
    }

    if (typeof value === 'object') {
      Object.keys(value).forEach((key) => {
        const normalizedKey = String(key || '').trim().toLowerCase();
        if (normalizedKey) tokens.add(normalizedKey);
        visit(value[key], depth + 1);
      });
    }
  };

  visit(payload);
  return [...tokens];
}

function apiManifestTokensContain(tokens = [], expectedToken = '') {
  const normalizedExpected = String(expectedToken || '').trim().toLowerCase();
  if (!normalizedExpected) return false;
  return tokens.some((token) => token === normalizedExpected || token.includes(normalizedExpected));
}

function sanitizeApiStatusError(error) {
  const message = String(error?.message || error?.code || 'verificación no disponible').replace(/\s+/g, ' ').trim();
  if (!message) return 'verificación no disponible';
  return message.length > 140 ? `${message.slice(0, 137).trim()}…` : message;
}

function openProfileModal() {
  closeTransientPanels();
  const privacy = ensurePrivacyState();
  const container = document.createElement('div');
  container.innerHTML = `
    <p><strong>Correo:</strong> ${escapeHTML(getSessionEmail())}</p>
    <p><strong>Acceso:</strong> Google/Gmail validado por memoriaBACKEND, sin número telefónico.</p>
    <p><strong>Modo visual:</strong> claro de ${CHATER_CONFIG.lightStartsAt}:00 a ${CHATER_CONFIG.darkStartsAt}:00 y oscuro durante la noche.</p>
    <p><strong>Datos locales:</strong> conversaciones y cola de sincronización aisladas para este correo.</p>
    <p><strong>Notificaciones:</strong> ${escapeHTML(getNotificationPermissionLabel())}.</p>
    <p><strong>Privacidad:</strong> perfil ${escapeHTML(getPrivacyVisibilityLabel(privacy.profileVisibility))}, estados ${escapeHTML(getPrivacyVisibilityLabel(privacy.statusVisibility))}.</p>
    <section class="profile-qr-card" aria-label="QR de perfil">
      <div>
        <strong>QR de perfil</strong>
        <small>Muéstralo para que te agreguen sin escribir tu correo.</small>
      </div>
      <div class="profile-qr-code" data-profile-qr-code></div>
      <small class="profile-qr-payload" data-profile-qr-payload></small>
    </section>
    <div class="quick-action-grid">
      <button class="primary-button" type="button" data-profile-action="privacy">Configurar privacidad</button>
      <button class="secondary-button" type="button" data-profile-action="notifications">Notificaciones</button>
    </div>
  `;

  container.addEventListener('click', (event) => {
    const button = event.target.closest('[data-profile-action]');
    if (!button) return;
    if (button.dataset.profileAction === 'privacy') openPrivacySettingsModal();
    if (button.dataset.profileAction === 'notifications') openNotificationSettingsModal();
  });

  setModal('Perfil', container, 'profile');
  renderProfileQrForCurrentUser(container);
}

function openPrivacySettingsModal() {
  closeTransientPanels();
  const privacy = ensurePrivacyState();
  const container = document.createElement('form');
  container.innerHTML = `
    <p class="modal-copy">ChatER sincroniza estas preferencias con <code>/api/v1/privacidad-usuario</code> cuando memoriaBACKEND está configurado. En modo demo quedan locales.</p>
    <label for="profileVisibilitySelect">Quién puede ver tu perfil</label>
    <select id="profileVisibilitySelect">
      <option value="contacts">Mis contactos</option>
      <option value="public">Todos</option>
      <option value="nobody">Nadie</option>
    </select>
    <label for="statusVisibilitySelect">Quién puede ver tus estados</label>
    <select id="statusVisibilitySelect">
      <option value="contacts">Mis contactos</option>
      <option value="public">Todos</option>
      <option value="nobody">Nadie</option>
    </select>
    <label for="lastActivityVisibilitySelect">Quién puede ver tu última actividad</label>
    <select id="lastActivityVisibilitySelect">
      <option value="contacts">Mis contactos</option>
      <option value="public">Todos</option>
      <option value="nobody">Nadie</option>
    </select>
    <div class="api-status-grid">
      <div><strong>Sincronización</strong><span>${escapeHTML(privacy.syncStatus || (CHATER_CONFIG.backendBaseUrl ? 'Pendiente' : 'Modo local'))}</span></div>
      <div><strong>Última sincronización</strong><span>${escapeHTML(privacy.syncedAt || 'Sin registro')}</span></div>
    </div>
    <div class="quick-action-grid">
      <button class="primary-button" type="submit">Guardar privacidad</button>
      <button class="secondary-button" type="button" data-privacy-action="back">Volver al perfil</button>
    </div>
  `;

  container.querySelector('#profileVisibilitySelect').value = normalizePrivacyVisibility(privacy.profileVisibility);
  container.querySelector('#statusVisibilitySelect').value = normalizePrivacyVisibility(privacy.statusVisibility);
  container.querySelector('#lastActivityVisibilitySelect').value = normalizePrivacyVisibility(privacy.lastActivityVisibility);

  container.addEventListener('click', (event) => {
    const button = event.target.closest('[data-privacy-action="back"]');
    if (!button) return;
    event.preventDefault();
    openProfileModal();
  });

  container.addEventListener('submit', async (event) => {
    event.preventDefault();
    const submitButton = container.querySelector('button[type="submit"]');
    submitButton.disabled = true;
    privacy.profileVisibility = normalizePrivacyVisibility(container.querySelector('#profileVisibilitySelect')?.value);
    privacy.statusVisibility = normalizePrivacyVisibility(container.querySelector('#statusVisibilitySelect')?.value);
    privacy.lastActivityVisibility = normalizePrivacyVisibility(container.querySelector('#lastActivityVisibilitySelect')?.value);
    await persistPrivacySettings({ reason: 'profile-modal' });
    openProfileModal();
  });

  setModal('Privacidad', container, 'privacy-settings');
}

function getNotificationPermissionStatus() {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
  return Notification.permission || 'default';
}

function getNotificationPermissionLabel() {
  const permission = getNotificationPermissionStatus();
  const savedRegistration = readNotificationRegistration();

  if (permission === 'unsupported') return 'No compatibles en este navegador';
  if (permission === 'granted') {
    if (savedRegistration?.syncStatus === 'pending_revoke') return 'Desactivación pendiente con memoriaBACKEND';
    if (savedRegistration?.syncStatus === 'revoked' || savedRegistration?.syncStatus === 'revoked_local') return 'Desactivadas para este dispositivo';
    if (savedRegistration?.syncStatus === 'pending') return 'Permitidas · registro pendiente con memoriaBACKEND';
    if (savedRegistration?.registeredAt) return 'Permitidas y registradas para esta sesión';
    return 'Permitidas en el navegador';
  }
  if (permission === 'denied') return 'Bloqueadas por el navegador';
  return 'Sin activar';
}

function getNotificationRegistrationLabel(registration = readNotificationRegistration()) {
  if (!registration) return 'Aún no registrado';
  if (registration.syncStatus === 'pending_revoke') return 'Baja pendiente con memoriaBACKEND';
  if (registration.syncStatus === 'revoked' || registration.syncStatus === 'revoked_local') {
    return registration.revokedAt ? `Dado de baja ${formatScheduledCallTime(registration.revokedAt)}` : 'Dado de baja en este dispositivo';
  }
  if (registration.syncStatus === 'pending') return 'Registro pendiente con memoriaBACKEND';
  if (registration.registeredAt) return `Actualizado ${formatScheduledCallTime(registration.registeredAt)}`;
  return 'Aún no registrado';
}

function getNotificationToolDescription() {
  const label = getNotificationPermissionLabel();
  if (CHATER_CONFIG.backendBaseUrl) return `${label}. Registra o da de baja este dispositivo con memoriaBACKEND para avisos push.`;
  return `${label}. En demo local muestra pruebas del navegador y deja listo el contrato push.`;
}

function readNotificationRegistration(email = getSessionEmail()) {
  try {
    return JSON.parse(readStorageItem(getNotificationRegistrationStorageKey(email), 'null') || 'null') || null;
  } catch (error) {
    return null;
  }
}

function persistNotificationRegistration(registration = {}, email = getSessionEmail()) {
  try {
    writeStorageItem(getNotificationRegistrationStorageKey(email), JSON.stringify({
      ...registration,
      deviceId: registration.deviceId || getDeviceId(),
      permission: registration.permission || getNotificationPermissionStatus(),
      updatedAt: new Date().toISOString()
    }));
    scheduleUserPreferencesSync('notifications');
  } catch (error) {
    console.warn('No se pudo guardar el estado local de notificaciones.', error);
  }
}

function markNotificationRegistrationSynced(payload = {}) {
  persistNotificationRegistration({
    ...readNotificationRegistration(),
    ...payload,
    syncStatus: 'synced',
    registeredAt: new Date().toISOString(),
    revokedAt: '',
    lastError: ''
  });
}

function markNotificationRegistrationRevokedSynced(payload = {}) {
  persistNotificationRegistration({
    ...readNotificationRegistration(),
    ...payload,
    pushEnabled: false,
    active: false,
    subscription: null,
    pushSubscription: null,
    token: '',
    syncStatus: CHATER_CONFIG.backendBaseUrl ? 'revoked' : 'revoked_local',
    registeredAt: '',
    revokedAt: new Date().toISOString(),
    lastError: ''
  });
}

function openNotificationSettingsModal() {
  closeTransientPanels();
  const savedRegistration = readNotificationRegistration();
  const container = document.createElement('div');
  const pushCapability = getPushCapabilityLabel();
  container.innerHTML = `
    <div class="api-status-grid">
      <div><strong>Permiso del navegador</strong><span>${escapeHTML(getNotificationPermissionLabel())}</span></div>
      <div><strong>Push en segundo plano</strong><span>${escapeHTML(pushCapability)}</span></div>
      <div><strong>Registro local</strong><span>${escapeHTML(getNotificationRegistrationLabel(savedRegistration))}</span></div>
      <div><strong>memoriaBACKEND</strong><span>${escapeHTML(CHATER_CONFIG.backendBaseUrl ? 'Usa /api/v1/push/suscripciones para activar o dar de baja.' : 'Modo demo local hasta configurar MEMORIA_BACKEND_URL.')}</span></div>
    </div>
    <p class="modal-copy">Activa notificaciones para recibir mensajes, llamadas y estados cuando ChatER esté instalada o abierta. Si el navegador no permite push, la app conserva una prueba local y el registro queda pendiente para memoriaBACKEND.</p>
    <div class="quick-action-grid">
      <button class="primary-button" type="button" data-notification-action="activate">Activar notificaciones</button>
      <button class="secondary-button" type="button" data-notification-action="test">Enviar prueba</button>
      <button class="secondary-button" type="button" data-notification-action="deactivate">Desactivar en este dispositivo</button>
    </div>
  `;

  container.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-notification-action]');
    if (!button) return;

    if (button.dataset.notificationAction === 'activate') {
      const result = await activateNotificationsForDevice();
      showToast(result.message);
      closeModal();
      openNotificationSettingsModal();
      return;
    }

    if (button.dataset.notificationAction === 'test') {
      const result = await sendNotificationTest();
      showToast(result.message);
      closeModal();
      openNotificationSettingsModal();
      return;
    }

    if (button.dataset.notificationAction === 'deactivate') {
      const result = await deactivateNotificationsForDevice();
      showToast(result.message);
      closeModal();
      openNotificationSettingsModal();
    }
  });

  setModal('Notificaciones', container, 'notifications');
}

function normalizePushConfigPayload(payload = {}) {
  const data = (payload?.data && typeof payload.data === 'object' ? payload.data : payload) || {};
  const push = (data?.push && typeof data.push === 'object' ? data.push : data) || {};
  const publicKey = String(
    push.publicKey
    || push.vapidPublicKey
    || push.applicationServerKey
    || data.publicKey
    || data.vapidPublicKey
    || ''
  ).trim();

  return {
    ok: payload?.ok !== 0 && payload?.ok !== false,
    available: push.available !== false && push.enabled !== false,
    configured: Boolean(push.configured || publicKey),
    publicKey,
    subscribeEndpoint: String(push.subscribeEndpoint || push.endpoints?.subscribe || '').trim(),
    sendEndpoint: String(push.sendEndpoint || push.endpoints?.send || '').trim(),
    unsubscribeEndpoint: String(push.unsubscribeEndpoint || push.endpoints?.unsubscribe || '').trim(),
    requiredHeader: String(push.requiredHeader || 'X-Hashinmy-Action: webapp').trim(),
    checkedAt: new Date().toISOString()
  };
}

function resolvePushPublicKey(config = pushConfigCache) {
  return String(
    CHATER_CONFIG.pushPublicKey
    || config?.publicKey
    || config?.vapidPublicKey
    || ''
  ).trim();
}

async function loadPushConfigFromBackend(options = {}) {
  if (!CHATER_CONFIG.backendBaseUrl) return null;
  if (!options.force && pushConfigCache?.checkedAt) return pushConfigCache;
  if (pushConfigInFlight) return pushConfigInFlight;

  pushConfigInFlight = apiClient.getPushConfig()
    .then((payload) => {
      pushConfigCache = normalizePushConfigPayload(payload);
      return pushConfigCache;
    })
    .catch((error) => {
      pushConfigCache = {
        ok: false,
        available: false,
        configured: false,
        publicKey: '',
        error: error?.message || 'No se pudo leer /api/v1/push/config.',
        checkedAt: new Date().toISOString()
      };
      return pushConfigCache;
    })
    .finally(() => {
      pushConfigInFlight = null;
    });

  return pushConfigInFlight;
}

function getPushCapabilityLabel() {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return 'Sin service worker compatible';
  if (typeof window === 'undefined' || !('PushManager' in window)) return 'Push no compatible en este navegador';
  if (resolvePushPublicKey()) return 'Compatible con PushManager';
  if (CHATER_CONFIG.backendBaseUrl) return 'La clave pública se consulta en /api/v1/push/config al activar';
  return 'Requiere PUSH_PUBLIC_KEY o memoriaBACKEND configurado';
}

async function activateNotificationsForDevice() {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return { ok: false, message: 'Este navegador no permite notificaciones web.' };
  }

  let permission = Notification.permission;
  if (permission !== 'granted') {
    const permissionResult = await requestChaterPermission('notifications', {
      title: 'Activar notificaciones',
      description: 'ChatER necesita permiso para avisarte cuando recibas mensajes, llamadas y estados importantes.',
      actionLabel: 'Activar notificaciones',
      request: () => Notification.requestPermission()
    });
    permission = typeof permissionResult === 'string' ? permissionResult : Notification.permission;
  }

  if (permission !== 'granted') {
    persistNotificationRegistration({ permission, syncStatus: 'blocked', registeredAt: '' });
    return { ok: false, message: 'Las notificaciones quedaron bloqueadas. Actívalas desde los permisos del navegador.' };
  }

  const registration = await getReadyServiceWorkerRegistration();
  const pushConfig = CHATER_CONFIG.backendBaseUrl ? await loadPushConfigFromBackend() : null;
  const pushSubscription = await createPushSubscriptionIfPossible(registration, pushConfig);
  const payload = {
    deviceId: getDeviceId(),
    clientId: getDeviceId(),
    platform: 'web-pwa',
    appMode: 'static-site-pwa',
    permission,
    displayMode: getCurrentDisplayMode(),
    pushSubscription,
    pushEnabled: Boolean(pushSubscription),
    vapidPublicKey: resolvePushPublicKey(pushConfig),
    pushConfig,
    userAgent: navigator.userAgent || '',
    locale: navigator.language || 'es-CO',
    clientMutationId: generateClientMutationId()
  };

  persistNotificationRegistration({ ...payload, syncStatus: CHATER_CONFIG.backendBaseUrl ? 'pending' : 'local', registeredAt: new Date().toISOString() });

  if (CHATER_CONFIG.backendBaseUrl) {
    try {
      await apiClient.registerDevice(payload);
      markNotificationRegistrationSynced(payload);
    } catch (error) {
      persistNotificationRegistration({ ...payload, syncStatus: 'pending', lastError: error?.message || 'Registro pendiente con memoriaBACKEND' });
      enqueueBackendOperation({
        type: 'registerDevice',
        dedupeKey: `device:${payload.deviceId}:notifications`,
        payload,
        replaceExisting: true
      });
      return { ok: true, message: 'Notificaciones permitidas. El registro del dispositivo quedó en cola de sincronización.' };
    }
  }

  await showLocalNotificationPreview('ChatER', 'Notificaciones activas para mensajes, llamadas y estados.');
  return { ok: true, message: pushSubscription ? 'Notificaciones push activadas y registradas.' : 'Notificaciones activadas; falta clave pública VAPID en memoriaBACKEND o en config local para push en segundo plano real.' };
}

async function deactivateNotificationsForDevice() {
  const savedRegistration = readNotificationRegistration() || {};
  const registration = await getReadyServiceWorkerRegistration();
  let pushSubscription = savedRegistration.pushSubscription || savedRegistration.subscription || null;
  let endpoint = String(savedRegistration.endpoint || pushSubscription?.endpoint || '').trim();

  if (registration?.pushManager) {
    try {
      const activeSubscription = await registration.pushManager.getSubscription();
      if (activeSubscription) {
        const subscriptionJson = typeof activeSubscription.toJSON === 'function' ? activeSubscription.toJSON() : activeSubscription;
        pushSubscription = subscriptionJson || pushSubscription;
        endpoint = String(subscriptionJson?.endpoint || activeSubscription.endpoint || endpoint || '').trim();
        await activeSubscription.unsubscribe();
      }
    } catch (error) {
      console.warn('No se pudo cancelar la suscripción push local.', error);
    }
  }

  const clientMutationId = generateClientMutationId();
  const payload = {
    ...savedRegistration,
    deviceId: savedRegistration.deviceId || getDeviceId(),
    clientId: savedRegistration.clientId || savedRegistration.deviceId || getDeviceId(),
    endpoint,
    pushSubscription,
    subscription: pushSubscription,
    permission: getNotificationPermissionStatus(),
    userAgent: navigator.userAgent || '',
    locale: navigator.language || 'es-CO',
    active: false,
    reason: 'user-disabled-notifications',
    clientMutationId
  };

  persistNotificationRegistration({
    ...payload,
    pushEnabled: false,
    active: false,
    subscription: null,
    pushSubscription: null,
    token: '',
    syncStatus: CHATER_CONFIG.backendBaseUrl ? 'pending_revoke' : 'revoked_local',
    registeredAt: '',
    revokedAt: new Date().toISOString(),
    lastError: ''
  });

  if (CHATER_CONFIG.backendBaseUrl) {
    try {
      await apiClient.unregisterDevice(payload);
      markNotificationRegistrationRevokedSynced(payload);
      return { ok: true, message: 'Notificaciones desactivadas y baja sincronizada con memoriaBACKEND.' };
    } catch (error) {
      persistNotificationRegistration({
        ...payload,
        pushEnabled: false,
        active: false,
        subscription: null,
        pushSubscription: null,
        token: '',
        syncStatus: 'pending_revoke',
        registeredAt: '',
        revokedAt: new Date().toISOString(),
        lastError: error?.message || 'Baja pendiente con memoriaBACKEND'
      });
      enqueueBackendOperation({
        type: 'unregisterDevice',
        dedupeKey: `device:${payload.deviceId}:notifications-revoke`,
        payload,
        replaceExisting: true
      });
      return { ok: true, message: 'Notificaciones desactivadas en este navegador. La baja en memoriaBACKEND quedó en cola.' };
    }
  }

  markNotificationRegistrationRevokedSynced(payload);
  return { ok: true, message: 'Notificaciones desactivadas en este dispositivo.' };
}

async function sendNotificationTest() {
  const permission = getNotificationPermissionStatus();
  if (permission !== 'granted') {
    const activated = await activateNotificationsForDevice();
    if (!activated.ok) return activated;
  }

  if (CHATER_CONFIG.backendBaseUrl) {
    try {
      const payload = await apiClient.sendNotificationTest({ deviceId: getDeviceId() });
      if (!payload?.offlineDemo) {
        return { ok: true, message: 'Prueba enviada desde memoriaBACKEND.' };
      }
    } catch (error) {
      showToast('No se pudo enviar prueba backend; se mostrará una prueba local.');
    }
  }

  await showLocalNotificationPreview('ChatER prueba', 'Este dispositivo puede mostrar avisos locales de ChatER.');
  return { ok: true, message: 'Prueba local de notificación mostrada.' };
}

async function getReadyServiceWorkerRegistration() {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return null;
  try {
    return await Promise.race([
      navigator.serviceWorker.ready,
      new Promise((resolve) => setTimeout(() => resolve(null), 2500))
    ]);
  } catch (error) {
    return null;
  }
}

async function createPushSubscriptionIfPossible(registration, pushConfig = null) {
  const publicKey = resolvePushPublicKey(pushConfig);
  if (!registration?.pushManager || !publicKey) return null;
  try {
    const existing = await registration.pushManager.getSubscription();
    const subscription = existing || await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey)
    });
    return typeof subscription.toJSON === 'function' ? subscription.toJSON() : subscription;
  } catch (error) {
    console.warn('No se pudo crear la suscripción push.', error);
    return null;
  }
}

function urlBase64ToUint8Array(base64String = '') {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = `${base64String}${padding}`.replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((character) => character.charCodeAt(0)));
}

function getCurrentDisplayMode() {
  if (window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone) return 'standalone';
  if (window.matchMedia?.('(display-mode: minimal-ui)').matches) return 'minimal-ui';
  return 'browser';
}

async function showLocalNotificationPreview(title, body) {
  if (getNotificationPermissionStatus() !== 'granted') return false;
  const registration = await getReadyServiceWorkerRegistration();

  try {
    if (registration?.showNotification) {
      await registration.showNotification(title, {
        body,
        icon: 'assets/chater-icon-192.png',
        badge: 'assets/chater-maskable-512.png',
        tag: 'chater-local-test',
        renotify: false
      });
      return true;
    }

    if ('Notification' in window) {
      new Notification(title, { body, icon: 'assets/chater-icon-192.png', tag: 'chater-local-test' });
      return true;
    }
  } catch (error) {
    console.warn('No se pudo mostrar la notificación local de prueba.', error);
  }

  return false;
}

function handleNotificationClientMessage(message = {}) {
  if (message.type !== 'NOTIFICATION_CLICKED') return;
  const data = message.data || {};
  closeTransientPanels();
  closeModal();

  if (data.chatId) {
    const conversation = appState.conversations.find((item) => item.id === data.chatId);
    if (conversation) {
      activeSection = 'chats';
      activeConversationId = conversation.id;
      chatView.classList.add('chat-open');
      markConversationRead(conversation);
      renderCurrentSection();
      return;
    }
  }

  if (data.stateId) {
    const state = appState.states.find((item) => item.id === data.stateId);
    if (state) {
      activeSection = 'states';
      activeStateId = state.id;
      chatView.classList.add('chat-open');
      renderCurrentSection();
      return;
    }
  }

  if (data.callId) {
    const call = appState.calls.find((item) => item.id === data.callId);
    if (call) {
      activeSection = 'calls';
      chatView.classList.add('chat-open');
      renderCurrentSection();
      openCallDetailModal(call);
      return;
    }
  }

  if (message.url && applyDeepLinkFromUrl(message.url, { silent: true })) {
    return;
  }

  selectSection('chats');
}

function toggleEmojiPanel() {
  if (emojiButton.disabled || messageInput.disabled || activeSection !== 'chats' || !getActiveConversation()) {
    closeEmojiPanel();
    return;
  }

  const willOpen = emojiPanel.hidden;
  if (willOpen) {
    renderEmojiPanel();
  }

  emojiPanel.hidden = !willOpen;
  emojiButton.classList.toggle('active', willOpen);

  if (willOpen) {
    setTimeout(() => emojiPanel.querySelector('.emoji-search-input')?.focus({ preventScroll: true }), 0);
  }
}

function renderEmojiPanel(filterText = '') {
  if (!emojiPanel) return;

  const normalizedFilter = normalizeUiSearchText(filterText);
  const activeMode = emojiModes.find((mode) => mode.id === activeEmojiMode) || emojiModes[0];
  emojiPanel.innerHTML = '';

  const header = document.createElement('div');
  header.className = 'emoji-panel-header';

  const modeSwitcher = document.createElement('div');
  modeSwitcher.className = 'emoji-mode-switcher';
  modeSwitcher.setAttribute('aria-label', 'Tipo de contenido');

  emojiModes.forEach((mode) => {
    const button = document.createElement('button');
    button.className = `emoji-mode-button ${mode.id === activeMode.id ? 'active' : ''}`;
    button.type = 'button';
    button.dataset.emojiMode = mode.id;
    button.setAttribute('aria-label', `Abrir ${mode.label}`);
    button.innerHTML = `<span aria-hidden="true">${escapeHTML(mode.icon)}</span><strong>${escapeHTML(mode.label)}</strong>`;
    modeSwitcher.appendChild(button);
  });

  const search = document.createElement('input');
  search.className = 'emoji-search-input';
  search.type = 'search';
  search.autocomplete = 'off';
  search.placeholder = activeMode.id === 'emoji' ? 'Buscar emojis' : `Buscar ${activeMode.label.toLowerCase()}`;
  search.value = filterText;
  search.setAttribute('aria-label', search.placeholder);

  header.append(modeSwitcher, search);

  const content = document.createElement('div');
  content.className = 'emoji-panel-content';
  content.appendChild(renderEmojiContent(activeMode.id, normalizedFilter));

  emojiPanel.append(header, content);

  modeSwitcher.addEventListener('click', (event) => {
    const button = event.target.closest('[data-emoji-mode]');
    if (!button) return;
    activeEmojiMode = button.dataset.emojiMode;
    if (activeEmojiMode === 'emoji' && !activeEmojiCategoryId) activeEmojiCategoryId = 'recent';
    renderEmojiPanel(search.value);
  });

  search.addEventListener('input', () => renderEmojiPanel(search.value));
  applyListScrollSemantics(emojiPanel);
  if (!emojiPanel.hidden) {
    search.focus({ preventScroll: true });
  }
}

function renderEmojiContent(mode, normalizedFilter = '') {
  if (mode === 'gif') return renderTokenPicker('GIF rápidos', gifQuickActions, normalizedFilter, 'gif');
  if (mode === 'sticker') return renderTokenPicker('Stickers rápidos', stickerQuickActions, normalizedFilter, 'sticker');
  return renderEmojiPicker(normalizedFilter);
}

function renderEmojiPicker(normalizedFilter = '') {
  const container = document.createElement('div');
  const recentEmojis = readRecentEmojis();
  const categoryOptions = [
    { id: 'recent', label: 'Recientes', icon: '🕘', emojis: recentEmojis },
    ...emojiCategories
  ];

  if (!categoryOptions.some((category) => category.id === activeEmojiCategoryId)) {
    activeEmojiCategoryId = 'recent';
  }

  let visibleEmojis = [];
  let title = 'Recientes';

  if (normalizedFilter) {
    title = 'Resultados';
    visibleEmojis = searchEmojis(normalizedFilter);
  } else {
    const selectedCategory = categoryOptions.find((category) => category.id === activeEmojiCategoryId) || categoryOptions[0];
    title = selectedCategory.label;
    visibleEmojis = selectedCategory.id === 'recent' && !selectedCategory.emojis.length
      ? emojiCategories[0].emojis.slice(0, 12)
      : selectedCategory.emojis;
  }

  const heading = document.createElement('div');
  heading.className = 'emoji-section-title';
  heading.innerHTML = `<strong>${escapeHTML(title)}</strong><small>${normalizedFilter ? 'Filtrado en el teclado de emojis.' : 'Toca para insertar en el mensaje.'}</small>`;
  container.appendChild(heading);

  const grid = document.createElement('div');
  grid.className = 'emoji-grid';

  if (!visibleEmojis.length) {
    grid.innerHTML = '<p class="emoji-empty">No hay emojis que coincidan con la búsqueda.</p>';
  } else {
    [...new Set(visibleEmojis)].forEach((emoji) => {
      const button = document.createElement('button');
      button.className = 'emoji-option';
      button.type = 'button';
      button.textContent = emoji;
      button.setAttribute('aria-label', `Insertar emoji ${emoji}`);
      button.addEventListener('click', () => handleEmojiTokenSelection(emoji, { remember: true }));
      grid.appendChild(button);
    });
  }

  const categoryBar = document.createElement('div');
  categoryBar.className = 'emoji-category-bar';
  categoryBar.setAttribute('aria-label', 'Categorías de emojis');
  categoryOptions.forEach((category) => {
    const button = document.createElement('button');
    button.className = `emoji-category-button ${category.id === activeEmojiCategoryId ? 'active' : ''}`;
    button.type = 'button';
    button.dataset.emojiCategory = category.id;
    button.setAttribute('aria-label', `Abrir ${category.label}`);
    button.textContent = category.icon;
    button.addEventListener('click', () => {
      activeEmojiCategoryId = category.id;
      renderEmojiPanel('');
    });
    categoryBar.appendChild(button);
  });

  container.append(grid, categoryBar);
  return container;
}

function searchEmojis(normalizedFilter = '') {
  return emojiCategories
    .flatMap((category) => category.emojis.map((emoji) => ({
      emoji,
      searchText: normalizeUiSearchText(`${emoji} ${category.id} ${category.label} ${emojiSearchAliases[emoji] || ''}`)
    })))
    .filter((item) => item.searchText.includes(normalizedFilter))
    .map((item) => item.emoji);
}

function renderTokenPicker(title, items = [], normalizedFilter = '', mode = '') {
  const container = document.createElement('div');
  const filteredItems = items.filter((item) => [item.label, item.token].some((value) => valueMatchesUiSearch(value, normalizedFilter)));

  const heading = document.createElement('div');
  heading.className = 'emoji-section-title';
  heading.innerHTML = `<strong>${escapeHTML(title)}</strong><small>${mode === 'gif' ? 'Inserta una referencia GIF lista para sincronizar como mensaje.' : 'Inserta un sticker textual mientras memoriaBACKEND conecta media real.'}</small>`;
  container.appendChild(heading);

  const grid = document.createElement('div');
  grid.className = 'emoji-token-grid';

  if (!filteredItems.length) {
    grid.innerHTML = `<p class="emoji-empty">No hay ${escapeHTML(title.toLowerCase())} que coincidan con la búsqueda.</p>`;
  } else {
    filteredItems.forEach((item) => {
      const button = document.createElement('button');
      button.className = 'emoji-token-button';
      button.type = 'button';
      button.dataset.token = item.token;
      button.innerHTML = `<span aria-hidden="true">${mode === 'gif' ? 'GIF' : '▧'}</span><strong>${escapeHTML(item.label)}</strong>`;
      button.setAttribute('aria-label', `Insertar ${item.label}`);
      button.addEventListener('click', () => handleEmojiTokenSelection(item.token, { remember: false }));
      grid.appendChild(button);
    });
  }

  container.appendChild(grid);
  return container;
}

function handleEmojiTokenSelection(token, options = {}) {
  insertComposerText(token);
  if (options.remember) {
    persistRecentEmoji(token);
  }
}

function insertComposerText(token) {
  const value = String(token || '');
  if (!value || !messageInput || messageInput.disabled) return;

  const currentValue = messageInput.value || '';
  const start = Number.isFinite(messageInput.selectionStart) ? messageInput.selectionStart : currentValue.length;
  const end = Number.isFinite(messageInput.selectionEnd) ? messageInput.selectionEnd : currentValue.length;
  messageInput.value = `${currentValue.slice(0, start)}${value}${currentValue.slice(end)}`;

  const nextCursor = start + value.length;
  messageInput.setSelectionRange?.(nextCursor, nextCursor);
  messageInput.focus();
  updateComposerActionState();
  handleComposerTyping();
}

function readRecentEmojis() {
  try {
    const parsed = JSON.parse(readStorageItem(getEmojiRecentsStorageKey(), '[]') || '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((emoji) => typeof emoji === 'string' && emoji.trim()).slice(0, 32);
  } catch (error) {
    return [];
  }
}

function persistRecentEmoji(emoji) {
  const normalizedEmoji = String(emoji || '').trim();
  if (!normalizedEmoji) return;
  const recentEmojis = [normalizedEmoji, ...readRecentEmojis().filter((item) => item !== normalizedEmoji)].slice(0, 32);
  try {
    writeStorageItem(getEmojiRecentsStorageKey(), JSON.stringify(recentEmojis));
    scheduleUserPreferencesSync('emoji-recents');
  } catch (error) {
    console.warn('No se pudo guardar el historial local de emojis.', error);
  }
}

function attachFilePlaceholder() {
  selectComposerMediaAttachment({
    source: 'attachment',
    accept: 'image/*,audio/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.txt'
  });
}

function openCameraComposerPicker() {
  selectComposerMediaAttachment({
    source: 'camera',
    accept: 'image/*,video/*',
    capture: 'environment',
    emptyMessage: 'Selecciona una foto o video para enviarlo al chat.'
  });
}

async function selectComposerMediaAttachment(options = {}) {
  closeEmojiPanel();
  const conversation = getActiveConversation();
  if (activeSection !== 'chats' || !conversation || messageInput.disabled) return;

  const capability = options.source === 'camera' ? 'camera' : 'files';
  const openPicker = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = options.accept || 'image/*,audio/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.txt';
    if (options.capture) input.setAttribute('capture', options.capture);
    input.addEventListener('change', async () => {
      const file = input.files?.[0];
      if (!file) {
        if (options.emptyMessage) showToast(options.emptyMessage);
        return;
      }
      await sendMediaAttachment(conversation, file, { source: options.source });
    }, { once: true });
    input.click();
    return true;
  };

  try {
    await requestChaterPermission(capability, {
      title: capability === 'camera' ? 'Activar cámara para adjuntar' : 'Permiso de archivos para adjuntar',
      description: capability === 'camera'
        ? 'ChatER abrirá la cámara o galería para adjuntar una imagen o video al chat.'
        : 'ChatER abrirá el selector del dispositivo para adjuntar el archivo al chat.',
      actionLabel: capability === 'camera' ? 'Abrir cámara o galería' : 'Seleccionar archivo',
      request: openPicker
    });
  } catch (error) {
    showToast(error?.message || 'No se pudo abrir el selector asociado al permiso.');
  }
}

function openQuickComposerActionsModal() {
  closeTransientPanels();
  const conversation = getActiveConversation();
  if (activeSection !== 'chats' || !conversation || messageInput.disabled) return;

  const userEmail = getSessionEmail();
  const quickActions = [
    { id: 'hello', icon: '👋', title: 'Saludo rápido', text: 'Hola, ¿cómo estás?' },
    { id: 'details', icon: 'ℹ', title: 'Pedir detalles', text: '¿Me puedes compartir más detalles?' },
    { id: 'confirm', icon: '✅', title: 'Confirmar recibido', text: 'Recibido, quedo atento.' },
    { id: 'mail', icon: '@', title: 'Compartir mi correo', text: userEmail ? `Mi correo es ${userEmail}.` : 'Te comparto mi correo.' },
    { id: 'location', icon: '📍', title: 'Solicitar ubicación', text: '¿Me puedes compartir la ubicación?' }
  ];

  const container = document.createElement('div');
  container.className = 'quick-composer-list';
  container.innerHTML = `
    <p class="modal-copy">Elige una acción rápida para insertarla en el mensaje. Puedes editar el texto antes de enviarlo.</p>
    ${quickActions.map((action) => `
      <button class="quick-composer-action" type="button" data-template="${escapeHTML(action.id)}">
        <span class="quick-composer-icon">${escapeHTML(action.icon)}</span>
        <span><strong>${escapeHTML(action.title)}</strong><small>${escapeHTML(action.text)}</small></span>
      </button>
    `).join('')}
  `;

  container.addEventListener('click', (event) => {
    const button = event.target.closest('[data-template]');
    if (!button) return;
    const action = quickActions.find((item) => item.id === button.dataset.template);
    if (!action) return;
    closeModal();
    insertComposerText(action.text);
    updateComposerActionState();
  });

  setModal('Acciones rápidas', container, 'composer-quick-actions');
}

async function toggleVoiceNoteRecording() {
  if (voiceRecorderState.recorder) {
    stopVoiceNoteRecording();
    return;
  }

  closeTransientPanels();
  const conversation = getActiveConversation();
  if (activeSection !== 'chats' || !conversation || messageInput.disabled) return;

  if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
    showToast('Este navegador no permite grabar notas de voz desde la appWEB.');
    return;
  }

  try {
    const sessionGuard = captureSessionGuard();
    const stream = await requestChaterPermission('microphone', {
      title: 'Activar micrófono',
      description: 'ChatER necesita el micrófono para grabar la nota de voz antes de enviarla al chat.',
      actionLabel: 'Activar micrófono',
      request: () => navigator.mediaDevices.getUserMedia({ audio: true })
    });
    if (!stream?.getTracks) throw new Error('Permiso de micrófono no disponible.');
    if (!isSessionGuardCurrent(sessionGuard)) {
      stream.getTracks().forEach((track) => track.stop());
      return;
    }

    const preferredMimeType = MediaRecorder.isTypeSupported?.('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : '';
    const recorder = preferredMimeType ? new MediaRecorder(stream, { mimeType: preferredMimeType }) : new MediaRecorder(stream);

    voiceRecorderState.recorder = recorder;
    voiceRecorderState.stream = stream;
    voiceRecorderState.chunks = [];
    voiceRecorderState.conversationId = conversation.id;
    voiceRecorderState.sessionGuard = sessionGuard;
    voiceRecorderState.startedAt = Date.now();
    voiceRecorderState.autoStopTimer = setTimeout(stopVoiceNoteRecording, 60 * 1000);

    recorder.addEventListener('dataavailable', (event) => {
      if (event.data && event.data.size > 0) voiceRecorderState.chunks.push(event.data);
    });

    recorder.addEventListener('stop', handleVoiceRecorderStopped, { once: true });
    recorder.start();
    renderVoiceRecorderState(true);
    showToast('Grabando nota de voz. Toca el micrófono para detener.');
  } catch (error) {
    resetVoiceRecorderState();
    showToast('No se pudo iniciar la grabación de voz. Revisa permisos del micrófono.');
  }
}

function stopVoiceNoteRecording() {
  if (!voiceRecorderState.recorder) return;
  clearTimeout(voiceRecorderState.autoStopTimer);
  try {
    if (voiceRecorderState.recorder.state !== 'inactive') {
      voiceRecorderState.recorder.stop();
    }
  } catch (error) {
    resetVoiceRecorderState();
    showToast('La nota de voz se detuvo antes de completarse.');
  }
}

function cancelVoiceNoteRecording() {
  const recorder = voiceRecorderState.recorder;
  const stream = voiceRecorderState.stream;
  voiceRecorderState.chunks = [];
  voiceRecorderState.sessionGuard = null;

  try {
    if (recorder && recorder.state !== 'inactive') recorder.stop();
  } catch (error) {
    // Cancelación silenciosa para cambios de sesión o navegación.
  }

  stream?.getTracks?.().forEach((track) => track.stop());
  resetVoiceRecorderState();
}

async function handleVoiceRecorderStopped() {
  const chunks = [...voiceRecorderState.chunks];
  const conversationId = voiceRecorderState.conversationId;
  const sessionGuard = voiceRecorderState.sessionGuard;
  const durationSeconds = Math.max(1, Math.round((Date.now() - voiceRecorderState.startedAt) / 1000));
  const mimeType = chunks[0]?.type || 'audio/webm';
  const stream = voiceRecorderState.stream;
  resetVoiceRecorderState();
  stream?.getTracks?.().forEach((track) => track.stop());

  if (!chunks.length || !isSessionGuardCurrent(sessionGuard)) return;
  const conversation = appState.conversations.find((item) => item.id === conversationId);
  if (!conversation) return;

  const blob = new Blob(chunks, { type: mimeType });
  const extension = mimeType.includes('mp4') ? 'm4a' : 'webm';
  const filename = `nota-voz-${Date.now()}.${extension}`;
  const file = typeof File === 'function'
    ? new File([blob], filename, { type: mimeType })
    : Object.assign(blob, { name: filename });
  await sendMediaAttachment(conversation, file, {
    source: 'voice',
    caption: `Nota de voz · ${durationSeconds} s`
  });
}

function renderVoiceRecorderState(isRecording = Boolean(voiceRecorderState.recorder)) {
  if (!voiceNoteButton) return;
  voiceNoteButton.classList.toggle('recording', isRecording);
  voiceNoteButton.classList.toggle('active', isRecording);
  voiceNoteButton.textContent = isRecording ? '■' : '🎤';
  voiceNoteButton.setAttribute('aria-label', isRecording ? 'Detener nota de voz' : 'Grabar nota de voz');
  voiceNoteButton.title = isRecording ? 'Detener nota de voz' : 'Grabar nota de voz';
  updateComposerActionState();
}

function resetVoiceRecorderState() {
  clearTimeout(voiceRecorderState.autoStopTimer);
  voiceRecorderState.recorder = null;
  voiceRecorderState.stream = null;
  voiceRecorderState.chunks = [];
  voiceRecorderState.conversationId = '';
  voiceRecorderState.sessionGuard = null;
  voiceRecorderState.autoStopTimer = null;
  voiceRecorderState.startedAt = 0;
  renderVoiceRecorderState(false);
}

async function compressChatImageBeforeSend(file, onProgress) {
  const mediaKind = getMessageMediaKind({ attachmentMimeType: file?.type, attachmentName: file?.name });
  if (mediaKind !== 'image') return null;

  const policy = await resolveChatImageCompressionPolicy('chat-message');
  const defaultPolicy = getDefaultR2xImagePolicy('chat-message');
  const effectiveMaxBytes = clampImageUploadMaxBytes(Math.min(policy.maxBytes || CHATER_CONFIG.r2xImageMaxBytes, CHATER_CONFIG.r2xImageMaxBytes));
  const effectiveMaxDimension = clampImageUploadMaxDimension(policy.maxDimension || defaultPolicy.maxDimension, defaultPolicy.maxDimension);
  const converted = await convertImageFileToTemporaryWebp(file, {
    maxBytes: effectiveMaxBytes,
    maxDimension: effectiveMaxDimension,
    onProgress: typeof onProgress === 'function' ? onProgress : undefined
  });
  await assertR2xReadyWebpFile(converted.file, effectiveMaxBytes);
  converted.effectivePolicy = {
    context: policy.context || 'chat-message',
    source: policy.source || 'local-fallback',
    enabled: Boolean(policy.enabled),
    maxBytes: effectiveMaxBytes,
    maxDimension: effectiveMaxDimension,
    hardMaxDimension: CHATER_IMAGE_UPLOAD_MAX_DIMENSION
  };
  return converted;
}

async function assertImageAttachmentReadyForBackendUpload(file, maxBytes = CHATER_CONFIG.r2xImageMaxBytes) {
  const mediaKind = getMessageMediaKind({ attachmentMimeType: file?.type, attachmentName: file?.name });
  if (mediaKind !== 'image') return null;

  const effectiveMaxBytes = clampImageUploadMaxBytes(Math.min(
    Number(maxBytes || CHATER_CONFIG.r2xImageMaxBytes),
    CHATER_CONFIG.r2xImageMaxBytes
  ));
  return assertR2xReadyWebpFile(file, effectiveMaxBytes);
}

async function applyCompressedImageToOutgoingMessage(message, compressed, originalFile) {
  if (!message || !compressed?.file) return;
  const previousCompression = message.imageCompression && typeof message.imageCompression === 'object' ? message.imageCompression : null;
  const uploadFile = compressed.file;
  const guarantee = compressed.guarantee && typeof compressed.guarantee === 'object' ? compressed.guarantee : {};
  const diagnostics = compressed.diagnostics && typeof compressed.diagnostics === 'object' ? compressed.diagnostics : {};
  const effectiveMaxBytes = clampImageUploadMaxBytes(guarantee.maxBytes || compressed.maxBytes || CHATER_CONFIG.r2xImageMaxBytes);
  const finalUploadGate = await assertR2xReadyWebpFile(uploadFile, effectiveMaxBytes);
  const headroomBytes = Math.max(0, effectiveMaxBytes - uploadFile.size);
  const compressionMode = String(compressed.compressionMode || guarantee.compressionMode || '').trim();
  const previousOriginalFileName = String(previousCompression?.originalFileName || '').trim();
  const currentOriginalFileName = String(originalFile?.name || '').trim();
  const previousCompressedName = String(previousCompression?.fileName || previousCompression?.mediaName || previousCompression?.attachmentName || '').trim();
  const currentCompressedName = String(uploadFile?.name || compressed.originalFileName || '').trim();
  const previousCompressionMatchesOriginal = Boolean(
    previousCompression?.status === 'compressed'
    && compressionMode === 'original-webp-within-limit'
    && previousOriginalFileName
    && currentOriginalFileName
    && previousOriginalFileName === currentOriginalFileName
  );
  const previousCompressionMatchesUpload = Boolean(
    previousCompression?.status === 'compressed'
    && compressionMode === 'original-webp-within-limit'
    && previousCompressedName
    && currentCompressedName
    && previousCompressedName === currentCompressedName
    && Number(previousCompression.sizeBytes || 0) === Number(uploadFile.size || 0)
    && (previousCompression.validator || previousCompression.auditId || previousCompression.diagnostics)
  );
  const previousSourceAudit = (previousCompressionMatchesOriginal || previousCompressionMatchesUpload)
    ? previousCompression
    : null;
  const sourceWasAlreadyCompressed = Boolean(previousSourceAudit);
  const sourceAudit = sourceWasAlreadyCompressed ? previousSourceAudit : null;
  message.mediaName = uploadFile.name;
  message.mediaSizeBytes = uploadFile.size;
  message.attachmentName = uploadFile.name;
  message.attachmentSize = uploadFile.size;
  message.attachmentMimeType = uploadFile.type || 'image/webp';
  message.mediaKind = 'image';
  message.imageCompression = {
    status: 'compressed',
    maxBytes: effectiveMaxBytes,
    sizeBytes: uploadFile.size,
    fileName: uploadFile.name,
    mimeType: uploadFile.type || 'image/webp',
    width: compressed.width || guarantee.width || sourceAudit?.width || 0,
    height: compressed.height || guarantee.height || sourceAudit?.height || 0,
    originalWidth: previousSourceAudit?.originalWidth || compressed.originalWidth || guarantee.originalWidth || 0,
    originalHeight: previousSourceAudit?.originalHeight || compressed.originalHeight || guarantee.originalHeight || 0,
    quality: Number(sourceAudit?.quality || compressed.quality || guarantee.quality || 0),
    compressionMode: sourceAudit?.compressionMode || compressed.compressionMode || guarantee.compressionMode || '',
    qualityBand: sourceAudit?.qualityBand || compressed.qualityBand || guarantee.qualityBand || diagnostics.finalQualityBand || '',
    perceptualScore: Number(sourceAudit?.perceptualScore || compressed.perceptualScore || guarantee.perceptualScore || diagnostics.finalPerceptualScore || 0),
    originalFileName: previousSourceAudit?.originalFileName || originalFile?.name || compressed.originalFileName || '',
    originalMimeType: previousSourceAudit?.originalMimeType || originalFile?.type || compressed.originalMimeType || '',
    schemaVersion: sourceAudit?.schemaVersion || guarantee.schemaVersion || 'webp-200kb-v1',
    validator: guarantee.validator || finalUploadGate.validator || sourceAudit?.validator || 'IMAGENwebpCOMPRESIONx',
    validatorVersion: guarantee.validatorVersion || sourceAudit?.validatorVersion || '',
    formatVerified: guarantee.formatVerified || finalUploadGate.formatVerified || sourceAudit?.formatVerified || 'RIFF_WEBP',
    targetBytes: Number(guarantee.targetBytes || diagnostics.targetBytes || sourceAudit?.targetBytes || effectiveMaxBytes),
    hardMaxBytes: Number(guarantee.hardMaxBytes || diagnostics.hardMaxBytes || sourceAudit?.hardMaxBytes || CHATER_CONFIG.r2xImageMaxBytes),
    headroomBytes,
    auditId: guarantee.auditId || sourceAudit?.auditId || '',
    assertedAt: guarantee.assertedAt || new Date().toISOString(),
    acceptedReason: sourceAudit?.acceptedReason || guarantee.acceptedReason || diagnostics.acceptedReason || '',
    acceptedLimit: sourceAudit?.acceptedLimit || guarantee.acceptedLimit || diagnostics.finalAcceptedLimit || compressed.acceptedLimit || '',
    targetHeadroomMet: Boolean(sourceAudit?.targetHeadroomMet ?? guarantee.targetHeadroomMet ?? diagnostics.targetHeadroomMet ?? compressed.targetHeadroomMet),
    guaranteedMaxBytes: Boolean(guarantee.guaranteedMaxBytes || finalUploadGate.guaranteedMaxBytes || sourceAudit?.guaranteedMaxBytes) || uploadFile.size <= effectiveMaxBytes,
    effectivePolicy: compressed.effectivePolicy || sourceAudit?.effectivePolicy || null,
    uploadPreparation: sourceWasAlreadyCompressed ? {
      reusedCompressedWebp: true,
      compressionMode: compressed.compressionMode || guarantee.compressionMode || 'original-webp-within-limit',
      maxBytes: effectiveMaxBytes,
      sizeBytes: uploadFile.size,
      validator: guarantee.validator || finalUploadGate.validator || 'IMAGENwebpCOMPRESIONx.assertReadyForUpload',
      note: 'Se reutilizó un WebP ya validado para no recomprimir ni perder auditoría visual original, incluso si el archivo fuente ya terminaba en .webp y el nombre final no cambió.'
    } : null,
    diagnostics: {
      attempts: Number(sourceAudit?.diagnostics?.attempts || diagnostics.attempts || guarantee.attempts || 0),
      targetBytes: Number(sourceAudit?.diagnostics?.targetBytes || diagnostics.targetBytes || guarantee.targetBytes || 0),
      hardMaxBytes: Number(sourceAudit?.diagnostics?.hardMaxBytes || diagnostics.hardMaxBytes || effectiveMaxBytes),
      finalWidth: Number(compressed.width || diagnostics.finalWidth || sourceAudit?.diagnostics?.finalWidth || guarantee.width || 0),
      finalHeight: Number(compressed.height || diagnostics.finalHeight || sourceAudit?.diagnostics?.finalHeight || guarantee.height || 0),
      finalQuality: Number(sourceAudit?.diagnostics?.finalQuality || diagnostics.finalQuality || compressed.quality || guarantee.quality || 0),
      finalQualityBand: sourceAudit?.diagnostics?.finalQualityBand || compressed.qualityBand || guarantee.qualityBand || diagnostics.finalQualityBand || '',
      finalPerceptualScore: Number(sourceAudit?.diagnostics?.finalPerceptualScore || compressed.perceptualScore || guarantee.perceptualScore || diagnostics.finalPerceptualScore || 0),
      finalHeadroomBytes: Number(diagnostics.finalHeadroomBytes || headroomBytes),
      acceptedReason: sourceAudit?.diagnostics?.acceptedReason || guarantee.acceptedReason || diagnostics.acceptedReason || '',
      acceptedLimit: sourceAudit?.diagnostics?.acceptedLimit || guarantee.acceptedLimit || diagnostics.finalAcceptedLimit || compressed.acceptedLimit || '',
      targetHeadroomMet: Boolean(sourceAudit?.diagnostics?.targetHeadroomMet ?? guarantee.targetHeadroomMet ?? diagnostics.targetHeadroomMet ?? compressed.targetHeadroomMet),
      reusedCompressedWebp: sourceWasAlreadyCompressed,
      weakPointResolved: sourceWasAlreadyCompressed
        ? 'Se preserva la auditoría de la compresión original cuando memoriaBACKEND/R2 reutiliza un WebP ya válido, incluso si el WebP fuente y el WebP final conservan el mismo nombre; no se falsea calidad=1 ni se pierden dimensiones originales.'
        : (guarantee.weakPointResolved || diagnostics.weakPointResolved || 'WebP validado por bloque LEGO antes del upload y registrado en el mensaje para auditoría')
    }
  };
  message.mediaPreviewDataUrl = await createCompressedImageMessagePreview(uploadFile) || message.mediaPreviewDataUrl;
}

async function sendMediaAttachment(conversation, file, options = {}) {
  const sessionGuard = captureSessionGuard();
  const clientMessageId = generateClientMutationId();
  const mediaKind = getMessageMediaKind({ attachmentMimeType: file.type, attachmentName: file.name });
  const localPreviewDataUrl = await createLocalMessageMediaPreview(file);
  const createdAt = new Date().toISOString();
  const explicitCaption = Object.prototype.hasOwnProperty.call(options, 'caption')
    ? String(options.caption || '').trim()
    : '';
  const caption = explicitCaption || (mediaKind === 'image' ? '' : (mediaKind === 'audio' ? 'Audio adjunto' : (mediaKind === 'video' ? 'Video adjunto' : 'Archivo adjunto')));
  const outgoing = {
    id: clientMessageId,
    clientMutationId: clientMessageId,
    type: 'outgoing',
    text: caption,
    attachmentName: file.name,
    attachmentSize: file.size,
    attachmentMimeType: file.type || 'application/octet-stream',
    mediaKind,
    mediaName: file.name,
    mediaSizeBytes: file.size,
    mediaPreviewDataUrl: localPreviewDataUrl,
    mediaCaption: caption,
    mediaSyncStatus: CHATER_CONFIG.backendBaseUrl ? 'uploading' : 'local',
    time: getCurrentTime(),
    createdAt,
    clientTime: createdAt,
    expiresAt: getChatEphemeralExpiresAtIso(createdAt),
    ttlSeconds: CHATER_EPHEMERAL_TTL_SECONDS,
    status: CHATER_CONFIG.backendBaseUrl ? 'uploading' : 'local',
    receiptStatus: 'local',
    senderUserId: getCurrentUserIdentifier(),
    senderUserEmail: getSessionEmail(),
    backendReceivedAt: '',
    deliveredAt: '',
    readAt: ''
  };

  rememberPendingMediaRetry(clientMessageId, file, { caption, source: options.source });
  conversation.messages.push(outgoing);
  conversation.status = CHATER_CONFIG.backendBaseUrl ? 'Subiendo adjunto...' : 'Adjunto guardado localmente';
  persistState();
  renderChatList(searchInput.value);
  renderConversation();
  publishDurableStremeEvent({
    type: 'message.media.uploading',
    chatId: conversation.id,
    conversationId: conversation.id,
    clientMessageId,
    mediaKind,
    attachmentName: file.name
  }, { dedupeKey: `streme-media:${clientMessageId}` });

  let lastMediaProgressRenderAt = 0;
  const updateOutgoingMediaProgress = (progress, stage = 'uploading', force = false) => {
    const normalizedProgress = Math.max(1, Math.min(95, Math.round(Number(progress || 0))));
    if (!Number.isFinite(normalizedProgress)) return;
    outgoing.uploadProgress = normalizedProgress;
    outgoing.mediaUploadProgress = normalizedProgress;
    outgoing.mediaUploadStage = stage;
    outgoing.mediaSyncStatus = stage === 'creating-media-message' ? 'creating-media-message' : 'uploading';
    outgoing.status = outgoing.mediaSyncStatus;

    const now = Date.now();
    if (!force && now - lastMediaProgressRenderAt < 160) return;
    lastMediaProgressRenderAt = now;
    persistState();
    renderConversation();
  };

  let preparedUpload = null;
  let uploadFile = file;
  let imageCompressionResult = null;

  try {
    if (mediaKind === 'image') {
      updateOutgoingMediaProgress(6, 'compressing', true);
      const compressed = await compressChatImageBeforeSend(file, (progress, stage) => {
        const scaledProgress = Math.max(6, Math.min(18, Math.round(6 + (Number(progress || 0) / 100) * 12)));
        updateOutgoingMediaProgress(scaledProgress, stage || 'compressing');
      });
      if (!isSessionGuardCurrent(sessionGuard)) return;
      if (compressed?.file) {
        imageCompressionResult = compressed;
        uploadFile = compressed.file;
        await applyCompressedImageToOutgoingMessage(outgoing, compressed, file);
        updateOutgoingMediaProgress(18, 'compressed', true);
      }
    }

    if (!CHATER_CONFIG.backendBaseUrl) {
      outgoing.status = 'local';
      outgoing.mediaSyncStatus = 'local';
      outgoing.uploadProgress = 100;
      outgoing.mediaUploadProgress = 100;
      conversation.status = mediaKind === 'image' ? 'Imagen WebP guardada localmente' : 'Adjunto guardado localmente';
      forgetPendingMediaRetry(clientMessageId);
      showToast(mediaKind === 'image' ? 'Imagen comprimida a WebP y guardada localmente. Conecta memoriaBACKEND para subir archivos reales.' : 'Adjunto guardado localmente. Conecta memoriaBACKEND para subir archivos reales.');
      return;
    }

    const mediaMutationId = generateClientMutationId();

    if (shouldUseR2xTemporaryImageApi(uploadFile)) {
      try {
        updateOutgoingMediaProgress(8, 'compressing', true);
        const r2xPreparation = await prepareR2xTemporaryImageForBackend(uploadFile, {
          context: 'chat-message',
          entityType: 'mensaje',
          entityId: clientMessageId,
          conversationId: conversation.id,
          clientMutationId: mediaMutationId,
          onProgress: updateOutgoingMediaProgress,
          precompressedImage: imageCompressionResult
        });
        if (!isSessionGuardCurrent(sessionGuard)) return;
        uploadFile = r2xPreparation.file;
        preparedUpload = r2xPreparation.preparedUpload;
        await applyCompressedImageToOutgoingMessage(outgoing, r2xPreparation, file);
        updateOutgoingMediaProgress(90, 'creating-media-message', true);
      } catch (error) {
        if (!isR2xPolicyUnavailableError(error)) throw error;
        console.warn('ImagenesCloudflareR2x no está disponible para adjuntos de imagen; se comprime a WebP y se usa MEDIAfirmadaX como respaldo canónico.', error);
        updateOutgoingMediaProgress(10, 'compressing', true);
        const fallbackPolicy = getDefaultR2xImagePolicy('chat-message');
        const fallbackConverted = await reusePreparedWebpCompressionResult(uploadFile, imageCompressionResult, {
          maxBytes: CHATER_CONFIG.r2xImageMaxBytes,
          maxDimension: fallbackPolicy.maxDimension,
          policy: fallbackPolicy,
          reason: 'media-firmada-fallback-after-r2x-unavailable'
        }) || await convertImageFileToTemporaryWebp(uploadFile, {
          maxBytes: CHATER_CONFIG.r2xImageMaxBytes,
          maxDimension: fallbackPolicy.maxDimension,
          onProgress: (progress, stage) => {
            const scaledProgress = Math.max(10, Math.min(18, Math.round(10 + (Number(progress || 0) / 100) * 8)));
            updateOutgoingMediaProgress(scaledProgress, stage || 'compressing');
          }
        });
        if (!isSessionGuardCurrent(sessionGuard)) return;
        uploadFile = fallbackConverted.file;
        await applyCompressedImageToOutgoingMessage(outgoing, fallbackConverted, file);
        updateOutgoingMediaProgress(18, 'compressed', true);
      }
    }

    if (!preparedUpload) {
      await assertImageAttachmentReadyForBackendUpload(uploadFile);
      const preparationPayload = await apiClient.prepareMediaUpload(uploadFile, mediaMutationId);
      if (!isSessionGuardCurrent(sessionGuard)) return;
      preparedUpload = normalizeMediaUploadPreparation(preparationPayload);

      if (!preparedUpload.uploadUrl && !preparedUpload.mediaId) {
        throw new Error('memoriaBACKEND no devolvió uploadUrl ni mediaId para el adjunto.');
      }

      if (preparedUpload.uploadUrl) {
        await uploadMediaFileToSignedUrl(uploadFile, preparedUpload, {
          onProgress: (progress) => updateOutgoingMediaProgress(20 + progress * 0.58, 'uploading')
        });
        if (!isSessionGuardCurrent(sessionGuard)) return;
        updateOutgoingMediaProgress(84, 'uploaded', true);
      }

      preparedUpload = await completeMediaFirmadaUploadForBackend(preparedUpload, uploadFile, {
        entityType: 'mensaje',
        entityId: clientMessageId,
        conversationId: conversation.id,
        clientMutationId: mediaMutationId
      });
      if (!isSessionGuardCurrent(sessionGuard)) return;
    }

    const mediaMessagePayload = buildMediaMessagePayload(uploadFile, preparedUpload, clientMessageId, caption, {
      originalFilename: uploadFile === file ? '' : file.name,
      originalMimeType: uploadFile === file ? '' : (file.type || ''),
      provider: preparedUpload.provider || 'media-firmada',
      imageCompression: outgoing.imageCompression || null,
      createdAt: outgoing.createdAt,
      clientTime: outgoing.clientTime,
      expiresAt: outgoing.expiresAt
    });
    outgoing.mediaUrl = preparedUpload.publicUrl || outgoing.mediaUrl || '';
    outgoing.mediaSyncStatus = 'creating-media-message';
    outgoing.status = 'creating-media-message';
    outgoing.uploadProgress = Math.max(Number(outgoing.uploadProgress || 0), 88);
    outgoing.mediaUploadProgress = outgoing.uploadProgress;
    conversation.status = 'Registrando adjunto...';
    persistState();
    renderConversation();

    const messagePayload = await apiClient.createMediaMessage(conversation.id, mediaMessagePayload);
    if (!isSessionGuardCurrent(sessionGuard)) return;
    outgoing.uploadProgress = 100;
    outgoing.mediaUploadProgress = 100;
    markQueuedMessageSynced(conversation.id, clientMessageId, messagePayload);
    publishRealtimeMessageCreated(conversation, outgoing, messagePayload, { clientMessageId });
    forgetPendingMediaRetry(clientMessageId);
    conversation.status = 'Adjunto enviado';
    showToast('Adjunto enviado con memoriaBACKEND.');
  } catch (error) {
    if (!isSessionGuardCurrent(sessionGuard)) return;
    outgoing.status = 'pending-media-retry';
    outgoing.mediaSyncStatus = 'pending-media-retry';
    conversation.status = 'Adjunto requiere reintento manual';

    preparedUpload = error?.preparedUpload || preparedUpload;
    if (canQueueMediaMessageAfterUpload(preparedUpload)) {
      const mediaMessagePayload = buildMediaMessagePayload(uploadFile, preparedUpload, clientMessageId, caption, {
        originalFilename: uploadFile === file ? '' : file.name,
        originalMimeType: uploadFile === file ? '' : (file.type || ''),
        provider: preparedUpload.provider || 'media-firmada',
        imageCompression: outgoing.imageCompression || null,
        createdAt: outgoing.createdAt,
        clientTime: outgoing.clientTime,
        expiresAt: outgoing.expiresAt
      });
      enqueueBackendOperation({
        type: 'createMediaMessage',
        dedupeKey: `media-message:${clientMessageId}`,
        payload: { conversationId: conversation.id, clientMessageId, mediaMessagePayload }
      });
      forgetPendingMediaRetry(clientMessageId);
      conversation.status = 'Mensaje de adjunto pendiente de sincronizar';
      showToast('El archivo subió, pero el mensaje quedó en cola de sincronización.');
    } else {
      showToast('No se pudo completar el adjunto. Toca reintentar sin seleccionar el archivo otra vez.');
    }
  } finally {
    if (isSessionGuardCurrent(sessionGuard)) {
      persistState();
      renderChatList(searchInput.value);
      renderConversation();
    }
  }
}


async function retryPendingMediaAttachment(conversation, message, retryEntry = {}) {
  if (!conversation || !message) return;
  if (!CHATER_CONFIG.backendBaseUrl) {
    showToast('Conecta memoriaBACKEND para reintentar el adjunto.');
    return;
  }

  const originalFile = retryEntry.file;
  if (!originalFile) {
    showToast('Adjunta la imagen nuevamente para reintentar la subida desde este dispositivo.');
    return;
  }

  const sessionGuard = captureSessionGuard();
  const clientMessageId = message.clientMutationId || message.clientMessageId || message.id || generateClientMutationId();
  const explicitCaption = String(retryEntry.caption || message.mediaCaption || message.caption || '').trim();
  const mediaKind = getMessageMediaKind({ attachmentMimeType: originalFile.type, attachmentName: originalFile.name });
  message.clientMutationId = clientMessageId;
  message.mediaKind = mediaKind;
  message.attachmentName = originalFile.name;
  message.attachmentSize = originalFile.size;
  message.attachmentMimeType = originalFile.type || 'application/octet-stream';
  message.mediaName = originalFile.name;
  message.mediaSizeBytes = originalFile.size;
  message.mediaCaption = explicitCaption;
  message.text = explicitCaption || (mediaKind === 'image' ? '' : String(message.text || 'Adjunto'));
  message.status = 'uploading';
  message.mediaSyncStatus = 'uploading';
  message.uploadProgress = 1;
  message.mediaUploadProgress = 1;
  if (!message.mediaPreviewDataUrl) {
    message.mediaPreviewDataUrl = await createLocalMessageMediaPreview(originalFile);
  }
  conversation.status = 'Reintentando adjunto...';
  rememberPendingMediaRetry(clientMessageId, originalFile, { caption: explicitCaption, source: retryEntry.source || 'retry' });
  persistState();
  renderChatList(searchInput.value);
  renderConversation();
  publishDurableStremeEvent({
    type: 'message.media.retrying',
    chatId: conversation.id,
    conversationId: conversation.id,
    clientMessageId,
    mediaKind,
    attachmentName: originalFile.name
  }, { dedupeKey: `streme-media-retry:${clientMessageId}` });

  let lastMediaProgressRenderAt = 0;
  const updateOutgoingMediaProgress = (progress, stage = 'uploading', force = false) => {
    const normalizedProgress = Math.max(1, Math.min(95, Math.round(Number(progress || 0))));
    if (!Number.isFinite(normalizedProgress)) return;
    message.uploadProgress = normalizedProgress;
    message.mediaUploadProgress = normalizedProgress;
    message.mediaUploadStage = stage;
    message.mediaSyncStatus = stage === 'creating-media-message' ? 'creating-media-message' : 'uploading';
    message.status = message.mediaSyncStatus;

    const now = Date.now();
    if (!force && now - lastMediaProgressRenderAt < 160) return;
    lastMediaProgressRenderAt = now;
    persistState();
    renderConversation();
  };

  let preparedUpload = null;
  let uploadFile = originalFile;
  let imageCompressionResult = null;

  try {
    if (mediaKind === 'image') {
      updateOutgoingMediaProgress(6, 'compressing', true);
      const compressed = await compressChatImageBeforeSend(originalFile, (progress, stage) => {
        const scaledProgress = Math.max(6, Math.min(18, Math.round(6 + (Number(progress || 0) / 100) * 12)));
        updateOutgoingMediaProgress(scaledProgress, stage || 'compressing');
      });
      if (!isSessionGuardCurrent(sessionGuard)) return;
      if (compressed?.file) {
        imageCompressionResult = compressed;
        uploadFile = compressed.file;
        await applyCompressedImageToOutgoingMessage(message, compressed, originalFile);
        updateOutgoingMediaProgress(18, 'compressed', true);
      }
    }

    const mediaMutationId = generateClientMutationId();

    if (shouldUseR2xTemporaryImageApi(uploadFile)) {
      try {
        updateOutgoingMediaProgress(8, 'compressing', true);
        const r2xPreparation = await prepareR2xTemporaryImageForBackend(uploadFile, {
          context: 'chat-message',
          entityType: 'mensaje',
          entityId: clientMessageId,
          conversationId: conversation.id,
          clientMutationId: mediaMutationId,
          onProgress: updateOutgoingMediaProgress,
          precompressedImage: imageCompressionResult
        });
        if (!isSessionGuardCurrent(sessionGuard)) return;
        uploadFile = r2xPreparation.file;
        preparedUpload = r2xPreparation.preparedUpload;
        await applyCompressedImageToOutgoingMessage(message, r2xPreparation, originalFile);
        updateOutgoingMediaProgress(90, 'creating-media-message', true);
      } catch (error) {
        if (!isR2xPolicyUnavailableError(error)) throw error;
        console.warn('ImagenesCloudflareR2x no está disponible al reintentar adjunto; se comprime a WebP y se usa MEDIAfirmadaX como respaldo canónico.', error);
        updateOutgoingMediaProgress(10, 'compressing', true);
        const fallbackPolicy = getDefaultR2xImagePolicy('chat-message');
        const fallbackConverted = await reusePreparedWebpCompressionResult(uploadFile, imageCompressionResult, {
          maxBytes: CHATER_CONFIG.r2xImageMaxBytes,
          maxDimension: fallbackPolicy.maxDimension,
          policy: fallbackPolicy,
          reason: 'media-firmada-fallback-after-r2x-unavailable'
        }) || await convertImageFileToTemporaryWebp(uploadFile, {
          maxBytes: CHATER_CONFIG.r2xImageMaxBytes,
          maxDimension: fallbackPolicy.maxDimension,
          onProgress: (progress, stage) => {
            const scaledProgress = Math.max(10, Math.min(18, Math.round(10 + (Number(progress || 0) / 100) * 8)));
            updateOutgoingMediaProgress(scaledProgress, stage || 'compressing');
          }
        });
        if (!isSessionGuardCurrent(sessionGuard)) return;
        uploadFile = fallbackConverted.file;
        await applyCompressedImageToOutgoingMessage(message, fallbackConverted, originalFile);
        updateOutgoingMediaProgress(18, 'compressed', true);
      }
    }

    if (!preparedUpload) {
      await assertImageAttachmentReadyForBackendUpload(uploadFile);
      const preparationPayload = await apiClient.prepareMediaUpload(uploadFile, mediaMutationId);
      if (!isSessionGuardCurrent(sessionGuard)) return;
      preparedUpload = normalizeMediaUploadPreparation(preparationPayload);

      if (!preparedUpload.uploadUrl && !preparedUpload.mediaId) {
        throw new Error('memoriaBACKEND no devolvió uploadUrl ni mediaId para el adjunto.');
      }

      if (preparedUpload.uploadUrl) {
        await uploadMediaFileToSignedUrl(uploadFile, preparedUpload, {
          onProgress: (progress) => updateOutgoingMediaProgress(20 + progress * 0.58, 'uploading')
        });
        if (!isSessionGuardCurrent(sessionGuard)) return;
        updateOutgoingMediaProgress(84, 'uploaded', true);
      }

      preparedUpload = await completeMediaFirmadaUploadForBackend(preparedUpload, uploadFile, {
        entityType: 'mensaje',
        entityId: clientMessageId,
        conversationId: conversation.id,
        clientMutationId: mediaMutationId
      });
      if (!isSessionGuardCurrent(sessionGuard)) return;
    }

    const mediaMessagePayload = buildMediaMessagePayload(uploadFile, preparedUpload, clientMessageId, explicitCaption, {
      originalFilename: uploadFile === originalFile ? '' : originalFile.name,
      originalMimeType: uploadFile === originalFile ? '' : (originalFile.type || ''),
      provider: preparedUpload.provider || 'media-firmada',
      imageCompression: message.imageCompression || null,
      createdAt: message.createdAt || message.clientTime || new Date().toISOString(),
      clientTime: message.clientTime || message.createdAt || new Date().toISOString(),
      expiresAt: message.expiresAt || ''
    });
    message.mediaUrl = preparedUpload.publicUrl || message.mediaUrl || '';
    message.mediaSyncStatus = 'creating-media-message';
    message.status = 'creating-media-message';
    message.uploadProgress = Math.max(Number(message.uploadProgress || 0), 88);
    message.mediaUploadProgress = message.uploadProgress;
    conversation.status = 'Registrando adjunto...';
    persistState();
    renderConversation();

    const messagePayload = await apiClient.createMediaMessage(conversation.id, mediaMessagePayload);
    if (!isSessionGuardCurrent(sessionGuard)) return;
    message.uploadProgress = 100;
    message.mediaUploadProgress = 100;
    markQueuedMessageSynced(conversation.id, clientMessageId, messagePayload);
    publishRealtimeMessageCreated(conversation, message, messagePayload, { clientMessageId });
    forgetPendingMediaRetry(clientMessageId);
    conversation.status = 'Adjunto reenviado';
    showToast('Adjunto reenviado.');
  } catch (error) {
    if (!isSessionGuardCurrent(sessionGuard)) return;
    message.status = 'pending-media-retry';
    message.mediaSyncStatus = 'pending-media-retry';
    conversation.status = 'Adjunto requiere reintento manual';

    preparedUpload = error?.preparedUpload || preparedUpload;
    if (canQueueMediaMessageAfterUpload(preparedUpload)) {
      const mediaMessagePayload = buildMediaMessagePayload(uploadFile, preparedUpload, clientMessageId, explicitCaption, {
        originalFilename: uploadFile === originalFile ? '' : originalFile.name,
        originalMimeType: uploadFile === originalFile ? '' : (originalFile.type || ''),
        provider: preparedUpload.provider || 'media-firmada',
        imageCompression: message.imageCompression || null,
        createdAt: message.createdAt || message.clientTime || new Date().toISOString(),
        clientTime: message.clientTime || message.createdAt || new Date().toISOString(),
        expiresAt: message.expiresAt || ''
      });
      enqueueBackendOperation({
        type: 'createMediaMessage',
        dedupeKey: `media-message:${clientMessageId}`,
        payload: { conversationId: conversation.id, clientMessageId, mediaMessagePayload }
      });
      forgetPendingMediaRetry(clientMessageId);
      conversation.status = 'Mensaje de adjunto pendiente de sincronizar';
      showToast('El archivo subió, pero el mensaje quedó en cola de sincronización.');
    } else {
      rememberPendingMediaRetry(clientMessageId, originalFile, { caption: explicitCaption, source: retryEntry.source || 'retry' });
      showToast('No se pudo completar el adjunto. Toca reintentar sin seleccionar el archivo otra vez.');
    }
  } finally {
    if (isSessionGuardCurrent(sessionGuard)) {
      persistState();
      renderChatList(searchInput.value);
      renderConversation();
    }
  }
}

function extractQueryParamFromUrl(rawUrl = '', key = '') {
  try {
    const parsedUrl = new URL(String(rawUrl || ''), CHATER_CONFIG.backendBaseUrl || window.location.origin);
    return parsedUrl.searchParams.get(key) || '';
  } catch (error) {
    return '';
  }
}

function normalizeMediaUploadPreparation(payload = {}) {
  const data = payload?.data && typeof payload.data === 'object' ? payload.data : {};
  const upload = payload.upload || data.upload || extractNestedObject(payload, ['upload', 'subida', 'signedUpload', 'carga']) || {};
  const media = payload.media || data.media || upload.media || extractNestedObject(payload, ['media', 'file', 'asset']) || {};
  const headers = upload.headers || data.headers || payload.headers || {};
  const fields = upload.fields || data.fields || payload.fields || {};
  const uploadUrl = upload.uploadUrl || upload.signedUrl || upload.url || media.uploadUrl || media.signedUrl || media.url || data.uploadUrl || data.signedUrl || data.url || payload.uploadUrl || payload.signedUrl || '';
  const method = String(upload.method || data.method || payload.method || (Object.keys(fields).length ? 'POST' : 'PUT')).toUpperCase();
  const mediaId = String(
    upload.mediaId || upload.id || upload.fileId || media.mediaId || media.id || media.fileId || data.mediaId || data.id || payload.mediaId || payload.fileId || ''
  ).trim();
  const uploadToken = String(upload.token || upload.uploadToken || media.token || data.token || payload.token || extractQueryParamFromUrl(uploadUrl, 'token') || '').trim();

  return {
    uploadUrl,
    method,
    headers: headers && typeof headers === 'object' ? headers : {},
    fields: fields && typeof fields === 'object' ? fields : {},
    mediaId,
    uploadToken,
    publicUrl: upload.publicUrl || upload.readUrl || media.publicUrl || media.readUrl || data.publicUrl || data.readUrl || payload.publicUrl || '',
    provider: upload.provider || media.provider || data.provider || payload.provider || 'media-firmada',
    mediaUploaded: Boolean(upload.mediaUploaded || data.mediaUploaded || payload.mediaUploaded),
    mediaConfirmed: Boolean(upload.mediaConfirmed || data.mediaConfirmed || payload.mediaConfirmed || upload.confirmed || data.confirmed || payload.confirmed)
  };
}

function normalizeMediaReadPayload(payload = {}, fallback = {}) {
  const data = payload?.data && typeof payload.data === 'object' ? payload.data : {};
  const media = extractNestedObject(payload, ['media', 'file', 'asset', 'read']) || {};
  const read = extractNestedObject(payload, ['read', 'download', 'descarga', 'urlDescarga']) || {};
  const mediaId = String(
    media.mediaId || media.id || read.mediaId || read.id || data.mediaId || data.id || fallback.mediaId || ''
  ).trim();

  return {
    ...fallback,
    mediaId: mediaId || fallback.mediaId || '',
    publicUrl: read.url || read.publicUrl || read.signedUrl || media.publicUrl || media.readUrl || media.url || data.publicUrl || data.readUrl || data.url || fallback.publicUrl || '',
    provider: fallback.provider || media.provider || data.provider || 'media-firmada',
    mediaUploaded: true,
    mediaConfirmed: true
  };
}

async function completeMediaFirmadaUploadForBackend(preparedUpload, file, options = {}) {
  if (!preparedUpload?.mediaId) return preparedUpload;

  const clientMutationId = options.clientMutationId || generateClientMutationId();
  const entityType = options.entityType || 'mensaje';
  const entityId = options.entityId || clientMutationId;
  const conversationId = options.conversationId || '';

  let completedUpload = {
    ...preparedUpload,
    provider: preparedUpload.provider || 'media-firmada',
    mediaUploaded: true
  };

  const confirmPayload = await apiClient.confirmMediaUpload(completedUpload.mediaId, {
    entityType,
    entityId,
    conversationId,
    filename: file.name,
    fileName: file.name,
    mimeType: file.type || 'application/octet-stream',
    contentType: file.type || 'application/octet-stream',
    size: file.size,
    sizeBytes: file.size,
    token: completedUpload.uploadToken || extractQueryParamFromUrl(completedUpload.uploadUrl || '', 'token') || '',
    status: 'uploaded',
    uploaded: true
  }, `${clientMutationId}:media-confirm`);

  completedUpload = normalizeMediaReadPayload(confirmPayload, completedUpload);

  if (!completedUpload.publicUrl) {
    try {
      const readPayload = await apiClient.getMediaReadUrl(completedUpload.mediaId, {
        entityType,
        entityId,
        conversationId,
        clientMutationId: `${clientMutationId}:media-read`
      });
      completedUpload = normalizeMediaReadPayload(readPayload, completedUpload);
    } catch (error) {
      console.warn('El archivo quedó confirmado en MEDIAfirmadaX, pero memoriaBACKEND no devolvió URL de lectura inmediata.', error);
    }
  }

  return completedUpload;
}

function isMemoriaBackendMediaFirmadaUploadUrl(rawUrl = '') {
  try {
    if (!rawUrl || !CHATER_CONFIG.backendBaseUrl) return false;
    const uploadUrl = new URL(String(rawUrl), CHATER_CONFIG.backendBaseUrl || window.location.origin);
    const backendUrl = new URL(CHATER_CONFIG.backendBaseUrl, window.location.origin);
    return uploadUrl.origin === backendUrl.origin && /\/media-firmada\//.test(uploadUrl.pathname);
  } catch (error) {
    return false;
  }
}

function decorateMemoriaBackendUploadHeaders(rawUrl = '', headers = {}) {
  const decorated = { ...(headers || {}) };
  if (!isMemoriaBackendMediaFirmadaUploadUrl(rawUrl)) return decorated;
  if (getMemoriaSiteId() && !Object.keys(decorated).some((key) => key.toLowerCase() === 'x-mb-site')) {
    decorated['X-MB-Site'] = getMemoriaSiteId();
  }
  decorated['X-Hashinmy-Action'] = decorated['X-Hashinmy-Action'] || 'webapp';
  return decorated;
}

async function uploadMediaFileToSignedUrl(file, preparedUpload, options = {}) {
  const onProgress = typeof options.onProgress === 'function' ? options.onProgress : null;

  function emitProgress(loaded, total) {
    if (!onProgress || !total) return;
    const percent = Math.max(1, Math.min(100, (Number(loaded || 0) / Number(total || 1)) * 100));
    onProgress(percent);
  }

  function uploadWithXhr() {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open(preparedUpload.method || (Object.keys(preparedUpload.fields || {}).length ? 'POST' : 'PUT'), preparedUpload.uploadUrl, true);
      xhr.timeout = CHATER_CONFIG.mediaUploadTimeoutMs;
      if (isMemoriaBackendMediaFirmadaUploadUrl(preparedUpload.uploadUrl)) {
        xhr.withCredentials = true;
      }

      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) emitProgress(event.loaded, event.total);
      };
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          if (onProgress) onProgress(100);
          resolve();
          return;
        }
        reject(new Error(`Subida de adjunto respondió ${xhr.status}`));
      };
      xhr.onerror = () => reject(new Error('No se pudo subir el adjunto a la URL firmada.'));
      xhr.ontimeout = () => reject(new Error('La subida del adjunto superó el tiempo máximo.'));
      xhr.onabort = () => reject(new Error('La subida del adjunto fue cancelada.'));

      if (Object.keys(preparedUpload.fields || {}).length) {
        const formData = new FormData();
        Object.entries(preparedUpload.fields).forEach(([key, value]) => formData.append(key, value));
        formData.append('file', file);
        xhr.send(formData);
        return;
      }

      const headers = decorateMemoriaBackendUploadHeaders(preparedUpload.uploadUrl, preparedUpload.headers || {});
      if (!Object.keys(headers).some((key) => key.toLowerCase() === 'content-type')) {
        headers['Content-Type'] = file.type || 'application/octet-stream';
      }
      Object.entries(headers).forEach(([key, value]) => xhr.setRequestHeader(key, value));
      xhr.send(file);
    });
  }

  try {
    if (typeof XMLHttpRequest !== 'undefined' && preparedUpload.uploadUrl) {
      await uploadWithXhr();
      return;
    }

    if (Object.keys(preparedUpload.fields || {}).length) {
      const formData = new FormData();
      Object.entries(preparedUpload.fields).forEach(([key, value]) => formData.append(key, value));
      formData.append('file', file);
      const response = await fetchWithTimeout(preparedUpload.uploadUrl, {
        method: preparedUpload.method || 'POST',
        headers: decorateMemoriaBackendUploadHeaders(preparedUpload.uploadUrl, preparedUpload.headers || {}),
        credentials: isMemoriaBackendMediaFirmadaUploadUrl(preparedUpload.uploadUrl) ? 'include' : 'same-origin',
        body: formData
      }, CHATER_CONFIG.mediaUploadTimeoutMs);
      if (!response.ok) throw new Error(`Subida de adjunto respondió ${response.status}`);
      if (onProgress) onProgress(100);
      return;
    }

    const headers = decorateMemoriaBackendUploadHeaders(preparedUpload.uploadUrl, preparedUpload.headers || {});
    if (!Object.keys(headers).some((key) => key.toLowerCase() === 'content-type')) {
      headers['Content-Type'] = file.type || 'application/octet-stream';
    }

    const response = await fetchWithTimeout(preparedUpload.uploadUrl, {
      method: preparedUpload.method || 'PUT',
      headers,
      credentials: isMemoriaBackendMediaFirmadaUploadUrl(preparedUpload.uploadUrl) ? 'include' : 'same-origin',
      body: file
    }, CHATER_CONFIG.mediaUploadTimeoutMs);

    if (!response.ok) throw new Error(`Subida de adjunto respondió ${response.status}`);
    if (onProgress) onProgress(100);
  } catch (error) {
    error.preparedUpload = preparedUpload;
    throw error;
  }
}

function canQueueMediaMessageAfterUpload(preparedUpload = null) {
  if (!preparedUpload?.mediaId) return false;
  if (preparedUpload.provider === 'imagenes-r2x') return Boolean(preparedUpload.r2xConfirmed);
  if (preparedUpload.provider === 'media-firmada' || !preparedUpload.provider) return Boolean(preparedUpload.mediaConfirmed);
  return true;
}

function buildMediaMessagePayload(file, preparedUpload, clientMessageId, caption = '', metadata = {}) {
  const clientTime = metadata.clientTime || metadata.createdAt || new Date().toISOString();
  const expiresAt = coerceChatEphemeralExpiresAtIso(metadata.expiresAt || '', clientTime);
  return {
    mediaId: preparedUpload.mediaId || '',
    mediaUrl: preparedUpload.publicUrl || '',
    filename: file.name,
    mimeType: file.type || 'application/octet-stream',
    sizeBytes: file.size,
    caption,
    provider: metadata.provider || preparedUpload.provider || 'media-firmada',
    originalFilename: metadata.originalFilename || '',
    originalMimeType: metadata.originalMimeType || '',
    imageCompression: metadata.imageCompression || null,
    createdAt: clientTime,
    clientTime,
    expiresAt,
    ttlSeconds: CHATER_EPHEMERAL_TTL_SECONDS,
    metadata: {
      source: 'chater-static-site',
      createdAt: clientTime,
      clientTime,
      expiresAt,
      ephemeralTtlSeconds: CHATER_EPHEMERAL_TTL_SECONDS
    },
    clientMutationId: clientMessageId
  };
}

function openCreateStatusModal() {
  const form = document.createElement('form');
  let selectedStatusMediaFile = null;
  let selectedStatusMediaPreviewDataUrl = '';

  form.innerHTML = `
    <label for="statusTextInput">Texto del estado</label>
    <textarea id="statusTextInput" rows="4" maxlength="220" placeholder="Escribe una actualización para tus contactos" required></textarea>

    <label for="statusMediaInput">Imagen o video del estado</label>
    <button class="secondary-button" type="button" data-status-media-picker>Elegir imagen o video</button>
    <input id="statusMediaInput" type="file" accept="image/*,video/*" hidden />
    <div class="status-media-preview" data-status-media-preview aria-live="polite"></div>

    <p class="modal-copy">El estado se mostrará durante 24 horas. Puedes publicarlo solo con texto o agregar una imagen/video para que se vea como una historia visual.</p>
    <p class="form-feedback" data-feedback role="status" aria-live="polite"></p>
    <button class="primary-button" type="submit">Publicar estado</button>
  `;

  const mediaInput = form.querySelector('#statusMediaInput');
  const mediaPreview = form.querySelector('[data-status-media-preview]');
  const feedback = form.querySelector('[data-feedback]');
  const mediaPickerButton = form.querySelector('[data-status-media-picker]');
  renderStatusMediaPickerPreview(mediaPreview);

  mediaPickerButton?.addEventListener('click', async () => {
    try {
      await requestChaterPermission('files', {
        title: 'Permiso de archivos para estado',
        description: 'ChatER abrirá el selector del dispositivo para elegir una imagen o video del estado.',
        actionLabel: 'Elegir imagen o video',
        request: () => {
          mediaInput.click();
          return true;
        }
      });
    } catch (error) {
      feedback.textContent = error?.message || 'No se pudo abrir el selector de archivos.';
    }
  });

  mediaInput.addEventListener('change', async () => {
    selectedStatusMediaFile = mediaInput.files?.[0] || null;
    selectedStatusMediaPreviewDataUrl = '';
    feedback.textContent = '';

    if (!selectedStatusMediaFile) {
      renderStatusMediaPickerPreview(mediaPreview);
      return;
    }

    renderStatusMediaPickerPreview(mediaPreview, selectedStatusMediaFile);

    try {
      selectedStatusMediaPreviewDataUrl = await readStatusMediaPreview(selectedStatusMediaFile);
      renderStatusMediaPickerPreview(mediaPreview, selectedStatusMediaFile, selectedStatusMediaPreviewDataUrl);
      if (!selectedStatusMediaPreviewDataUrl && selectedStatusMediaFile.size > CHATER_CONFIG.localStatusPreviewMaxBytes) {
        feedback.textContent = 'El archivo se publicará, pero la vista previa local no se guardará para evitar superar el almacenamiento del navegador.';
      }
    } catch (error) {
      feedback.textContent = 'No se pudo generar la vista previa local. El estado seguirá usando el archivo seleccionado.';
    }
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const sessionGuard = captureSessionGuard();
    const textarea = form.querySelector('#statusTextInput');
    const submitButton = form.querySelector('button[type="submit"]');
    const text = textarea.value.trim();
    if (!text) return;

    const email = getSessionEmail();
    const mediaKind = selectedStatusMediaFile ? getStatusMediaKind(selectedStatusMediaFile.type || '') : '';
    const state = {
      id: `estado-${Date.now()}`,
      conversationId: '',
      contactEmail: normalizeStorageIdentity(email),
      name: email ? email.split('@')[0] : 'Mi estado',
      preview: text,
      avatar: getInitials(email ? email.split('@')[0] : 'Mi estado'),
      expiresAt: '24 h',
      expiresAtIso: new Date(Date.now() + STATE_VISIBLE_MS).toISOString(),
      expiresAtAt: '',
      viewed: true,
      own: true,
      createdAt: new Date().toISOString(),
      mediaName: selectedStatusMediaFile?.name || '',
      mediaMimeType: selectedStatusMediaFile?.type || '',
      mediaSizeBytes: selectedStatusMediaFile?.size || 0,
      mediaKind,
      mediaPreviewDataUrl: selectedStatusMediaPreviewDataUrl,
      mediaSyncStatus: selectedStatusMediaFile && CHATER_CONFIG.backendBaseUrl ? 'pending-upload' : (selectedStatusMediaFile ? 'local' : '')
    };
    // Alias legado preservado para compatibilidad con estados locales existentes y memoriaBACKEND antiguo.
    state.expiresAtAt = state.expiresAtIso;

    appState.states.unshift(state);
    activeStateId = state.id;
    activeSection = 'states';
    persistState();
    closeModal();
    renderCurrentSection();
    chatView.classList.add('chat-open');

    const createStateMutationId = generateClientMutationId();
    let statePayload = buildStateApiPayload(text, createStateMutationId);
    let mediaReadyForQueue = false;

    try {
      if (selectedStatusMediaFile && CHATER_CONFIG.backendBaseUrl) {
        state.mediaSyncStatus = 'uploading';
        persistState();
        feedback.textContent = 'Subiendo archivo del estado...';
        submitButton.disabled = true;
        const mediaPayload = await prepareStatusMediaForBackend(selectedStatusMediaFile, createStateMutationId);
        if (!isSessionGuardCurrent(sessionGuard)) return;
        mediaReadyForQueue = true;
        statePayload = buildStateApiPayload(text, createStateMutationId, mediaPayload);
        Object.assign(state, {
          mediaId: mediaPayload.mediaId || '',
          mediaUrl: mediaPayload.mediaUrl || state.mediaPreviewDataUrl || '',
          mediaSyncStatus: 'uploaded'
        });
        persistState();
      }

      const payload = await apiClient.createState(statePayload);
      if (!isSessionGuardCurrent(sessionGuard)) return;
      if (payload?.offlineDemo) {
        state.mediaSyncStatus = selectedStatusMediaFile ? 'local' : '';
        showToast(selectedStatusMediaFile ? 'Estado visual guardado localmente.' : 'Estado guardado localmente.');
      } else {
        state.mediaSyncStatus = selectedStatusMediaFile ? 'synced' : '';
        markQueuedStateSynced(state.id, payload);
        showToast(selectedStatusMediaFile ? 'Estado visual publicado y sincronizado.' : 'Estado publicado y sincronizado.');
      }
    } catch (error) {
      if (!isSessionGuardCurrent(sessionGuard)) return;
      state.synced = false;
      state.syncStatus = 'pending';

      if (!selectedStatusMediaFile || mediaReadyForQueue) {
        enqueueBackendOperation({
          type: 'createState',
          dedupeKey: `state:${state.id}`,
          payload: {
            localStateId: state.id,
            statePayload
          }
        });
        state.mediaSyncStatus = selectedStatusMediaFile ? 'pending-state-sync' : '';
        showToast('Estado guardado localmente y en cola de sincronización.');
      } else {
        state.mediaSyncStatus = 'local-media-retry-required';
        showToast('Estado visual guardado localmente. Reintenta publicarlo cuando memoriaBACKEND permita subir el archivo.');
      }
    } finally {
      if (isSessionGuardCurrent(sessionGuard)) {
        persistState();
        if (activeSection === 'states') renderCurrentSection();
      }
    }
  });

  setModal('Crear estado', form);
  form.querySelector('#statusTextInput').focus();
}

function openPromoteStatusModal() {
  closeTransientPanels();
  const state = getActiveState();
  const container = document.createElement('div');

  if (!state) {
    container.innerHTML = `
      <p>No tienes estados disponibles para promocionar.</p>
      <div class="quick-action-grid">
        <button class="primary-button" type="button" data-action="create-state">Añadir estado</button>
      </div>
    `;
  } else {
    const statusLabel = state.promotionRequested
      ? (state.promotionStatus === 'synced' ? 'Promoción sincronizada' : 'Promoción pendiente')
      : 'Lista para preparar';
    container.innerHTML = `
      <div class="status-promotion-summary">
        <strong>${escapeHTML(state.name)}</strong>
        <p>${escapeHTML(state.preview)} · ${escapeHTML(statusLabel)}</p>
      </div>
      <p>Prepara una promoción para aumentar la visibilidad del estado seleccionado. En modo local queda registrada y, si memoriaBACKEND está configurado, se sincroniza con la API de promoción.</p>
      <div class="quick-action-grid">
        <button class="primary-button" type="button" data-action="promote-state">Preparar promoción</button>
        <button class="secondary-button" type="button" data-action="create-state">Añadir otro estado</button>
      </div>
    `;
  }

  container.addEventListener('click', async (event) => {
    const actionButton = event.target.closest('[data-action]');
    if (!actionButton) return;

    if (actionButton.dataset.action === 'create-state') {
      closeModal();
      openCreateStatusModal();
      return;
    }

    if (actionButton.dataset.action === 'promote-state') {
      await promoteState(state);
      closeModal();
    }
  });

  setModal('Promocionar tu estado', container);
}

async function promoteState(state) {
  if (!state) {
    showToast('Crea un estado antes de promocionarlo.');
    return;
  }

  const sessionGuard = captureSessionGuard();
  const clientMutationId = generateClientMutationId();
  const promotionPayload = {
    stateId: state.id,
    objective: 'increase_status_views',
    channel: 'chater_status',
    clientMutationId
  };

  state.promotionRequested = true;
  state.promotionStatus = CHATER_CONFIG.backendBaseUrl ? 'pending' : 'local';
  state.promotionRequestedAt = new Date().toISOString();
  persistState();
  if (activeSection === 'states') renderCurrentSection();

  if (!CHATER_CONFIG.backendBaseUrl) {
    showToast('Promoción preparada localmente. Conecta memoriaBACKEND para publicarla.');
    return;
  }

  try {
    const payload = await apiClient.promoteState(state.id, promotionPayload);
    if (!isSessionGuardCurrent(sessionGuard)) return;
    if (payload?.offlineDemo) {
      state.promotionStatus = 'local';
      persistState();
      showToast('Promoción preparada localmente.');
    } else {
      markQueuedStatePromotionSynced(state.id, payload);
      showToast('Promoción sincronizada con memoriaBACKEND.');
    }
  } catch (error) {
    if (!isSessionGuardCurrent(sessionGuard)) return;
    enqueueBackendOperation({
      type: 'promoteState',
      dedupeKey: `state-promotion:${state.id}:${clientMutationId}`,
      payload: { stateId: state.id, promotionPayload }
    });
    state.promotionStatus = 'queued';
    persistState();
    showToast('Promoción preparada y en cola de sincronización.');
  }
}

async function markStateViewed(state) {
  const sessionGuard = captureSessionGuard();
  state.viewed = true;
  persistState();
  renderStatesList();
  renderStatusPanel(state);

  const viewStateMutationId = generateClientMutationId();

  try {
    const payload = await apiClient.registerStateView(state.id, viewStateMutationId);
    if (!isSessionGuardCurrent(sessionGuard)) return;
    showToast(payload?.offlineDemo ? 'Vista registrada localmente.' : 'Estado marcado como visto.');
  } catch (error) {
    if (!isSessionGuardCurrent(sessionGuard)) return;
    enqueueBackendOperation({
      type: 'markStateViewed',
      dedupeKey: `state-view:${state.id}`,
      payload: { stateId: state.id, clientMutationId: viewStateMutationId }
    });
    showToast('Vista registrada localmente y en cola de sincronización.');
  }
}

function findConversationForState(state = {}) {
  const stateConversationId = String(state.conversationId || state.chatId || '').trim();
  const stateContactEmail = normalizeStorageIdentity(state.contactEmail || state.email || state.ownerEmail || state.userEmail || '');

  return appState.conversations.find((conversation) => {
    const conversationEmail = normalizeStorageIdentity(conversation.email || conversation.contactEmail || '');
    return (stateConversationId && conversation.id === stateConversationId)
      || (stateContactEmail && conversationEmail === stateContactEmail)
      || (state.name && conversation.name === state.name)
      || (state.avatar && conversation.avatar === state.avatar);
  }) || null;
}

function createConversationFromState(state = {}) {
  const stateConversationId = String(state.conversationId || state.chatId || '').trim();
  const stateContactEmail = normalizeStorageIdentity(state.contactEmail || state.email || state.ownerEmail || state.userEmail || '');
  const contactName = String(state.name || state.displayName || stateContactEmail || 'Contacto').trim();

  if (!stateConversationId && !stateContactEmail) return null;

  const localConversationId = stateConversationId || `chat-${stateContactEmail}`;
  const conversation = {
    id: localConversationId,
    name: contactName,
    email: stateContactEmail,
    avatar: state.avatar || getInitials(contactName),
    avatarImage: normalizeAssetImagePath(state.avatarImage || state.avatarAsset),
    status: 'Disponible por estado',
    section: 'chats',
    unread: 0,
    messages: []
  };

  appState.conversations.unshift(conversation);
  persistState();

  if (CHATER_CONFIG.backendBaseUrl && stateContactEmail && !stateConversationId) {
    const createConversationMutationId = generateClientMutationId();
    enqueueBackendOperation({
      type: 'createConversation',
      dedupeKey: `conversation:${stateContactEmail}`,
      payload: {
        localConversationId,
        contact: { name: contactName, email: stateContactEmail, clientMutationId: createConversationMutationId }
      }
    });
  }

  return conversation;
}

function replyToState(state) {
  const relatedConversation = findConversationForState(state) || createConversationFromState(state);

  if (!relatedConversation) {
    showToast('No hay correo o chat relacionado para responder este estado.');
    return;
  }

  activeConversationId = relatedConversation.id;
  activeSection = 'chats';
  chatView.classList.add('chat-open');
  closeModal();
  renderCurrentSection();
  messageInput.value = `Respondiendo a tu estado: `;
  messageInput.focus();
  sendStremeEvent({ type: 'chat.opened', chatId: relatedConversation.id });
  hydrateConversationMessages(relatedConversation.id);
}

async function ensureCallPermissionForType(type) {
  if (type === 'video') {
    return requestChaterPermission('camera-microphone', {
      title: 'Activar cámara y micrófono',
      description: 'ChatER necesita cámara y micrófono para iniciar la videollamada con el contacto.',
      actionLabel: 'Activar cámara y micrófono',
      request: async () => {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
        stream.getTracks().forEach((track) => track.stop());
        return true;
      }
    });
  }

  return requestChaterPermission('microphone', {
    title: 'Activar micrófono para llamada',
    description: 'ChatER necesita el micrófono para iniciar la llamada de voz con el contacto.',
    actionLabel: 'Activar micrófono',
    request: async () => {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((track) => track.stop());
      return true;
    }
  });
}

async function startCall(type, conversationOverride = null) {
  closeEmojiPanel();
  const sessionGuard = captureSessionGuard();
  const conversation = conversationOverride || getActiveConversation();
  if (!conversation || (activeSection !== 'chats' && !conversationOverride)) return;
  const label = type === 'video' ? 'videollamada' : 'llamada de voz';

  try {
    await ensureCallPermissionForType(type);
  } catch (error) {
    showToast(error?.message || 'Activa los permisos del navegador para iniciar la llamada.');
    return;
  }

  const localCallId = `call-${Date.now()}`;
  appState.calls.unshift({
    id: localCallId,
    conversationId: conversation.id,
    name: conversation.name,
    preview: `${label} iniciada hoy, ${getCurrentTime()}`,
    type,
    avatar: conversation.avatar,
    avatarImage: conversation.avatarImage || ''
  });
  conversation.messages.push({ id: generateClientMutationId(), type: 'system', text: `Se inició una ${label}.`, time: getCurrentTime() });
  persistState();
  if (activeSection === 'calls') {
    renderCurrentSection();
  } else {
    renderConversation();
  }
  showToast(`Iniciando ${label} con ${conversation.name}.`);

  const createCallMutationId = generateClientMutationId();

  try {
    const payload = await apiClient.createCall(conversation.id, type, createCallMutationId);
    if (!isSessionGuardCurrent(sessionGuard)) return;
    if (payload?.offlineDemo) {
      showToast('Llamada registrada localmente. Falta conectar API de llamadas.');
    } else {
      markQueuedCallSynced(localCallId, payload);
      publishCallInviteThroughMemoria(conversation, type, payload, { clientMutationId: createCallMutationId, localCallId });
      showToast('Llamada registrada y sincronizada con memoriaBACKEND.');
    }
  } catch (error) {
    if (!isSessionGuardCurrent(sessionGuard)) return;
    enqueueBackendOperation({
      type: 'createCall',
      dedupeKey: `call:${localCallId}`,
      payload: { localCallId, conversationId: conversation.id, callType: type, clientMutationId: createCallMutationId }
    });
    showToast('Llamada registrada localmente y en cola de sincronización.');
  }
}


function extractCallSessionId(payload = {}, fallbackId = '') {
  const session = extractNestedObject(payload, ['call', 'session', 'sesion']);
  const candidates = [
    session?.sessionId,
    session?.sesionId,
    session?.callId,
    session?.id,
    payload?.sessionId,
    payload?.callId,
    payload?.sesionId,
    payload?.id,
    payload?.data?.sessionId,
    payload?.data?.callId,
    payload?.data?.id,
    fallbackId
  ];
  const resolvedId = candidates.find((candidate) => candidate !== undefined && candidate !== null && String(candidate).trim());
  return resolvedId ? String(resolvedId) : '';
}

function publishCallInviteThroughMemoria(conversation, type = 'voice', callPayload = {}, options = {}) {
  if (!conversation || !CHATER_CONFIG.backendBaseUrl || !getSessionEmail()) return;

  const normalizedType = type === 'video' ? 'video' : 'voice';
  const clientMutationId = options.clientMutationId || generateClientMutationId();
  const participants = buildCommunicationSessionParticipants(conversation.id);
  const remoteParticipant = getPrimaryRemoteParticipant(participants);
  const sessionId = extractCallSessionId(callPayload, options.localCallId || '');
  const call = {
    id: sessionId || options.localCallId || `call-${clientMutationId}`,
    sessionId,
    conversationId: conversation.id,
    chatId: conversation.id,
    name: conversation.name || remoteParticipant?.displayName || remoteParticipant?.email || 'Contacto',
    type: normalizedType,
    communicationType: normalizedType,
    status: 'started',
    direction: 'outgoing',
    startedAt: new Date().toISOString(),
    fromUserId: getCurrentUserIdentifier(),
    fromUserEmail: getSessionEmail(),
    toUserId: remoteParticipant?.userId || '',
    toUserEmail: remoteParticipant?.email || remoteParticipant?.userEmail || '',
    participants
  };

  const stremeCallInvitePayload = {
    type: 'call.incoming',
    chatId: conversation.id,
    conversationId: conversation.id,
    call,
    data: { call },
    clientMutationId: `${clientMutationId}:streme-call-invite`
  };

  publishDurableStremeEvent(stremeCallInvitePayload, {
    dedupeKey: `streme-call:${call.id}:incoming:${stremeCallInvitePayload.clientMutationId}`,
    onErrorMessage: 'No se pudo publicar STREMEx para la invitación de llamada. Se deja en cola de sincronización.'
  });

  const signalPayload = {
    sessionId,
    callId: call.id,
    conversationId: conversation.id,
    fromUserId: call.fromUserId,
    fromUserEmail: call.fromUserEmail,
    toUserId: call.toUserId,
    toUserEmail: call.toUserEmail,
    signalType: 'invite',
    status: 'sent',
    communicationType: normalizedType,
    payload: { call },
    metadata: { localCallId: options.localCallId || '', process: 'startCall' },
    clientMutationId: `${clientMutationId}:signaling-invite`
  };

  apiClient.sendCallSignal(signalPayload).catch((error) => {
    console.warn('No se pudo registrar SIGNALINGtiempoRealX para la llamada. Se deja en cola de sincronización.', error);
    enqueueBackendOperation({
      type: 'sendCallSignal',
      dedupeKey: `call-signal:${call.id}:invite:${signalPayload.clientMutationId}`,
      payload: signalPayload
    });
  });
}

function openCallStarterModal() {
  closeTransientPanels();

  const container = document.createElement('div');

  if (!appState.conversations.length) {
    container.innerHTML = `
      <p class="modal-copy">Crea primero un contacto por correo electrónico para iniciar llamadas desde ChatER.</p>
      <button class="primary-button" type="button" data-action="new-chat">Crear contacto</button>
    `;

    container.querySelector('[data-action="new-chat"]').addEventListener('click', () => {
      closeModal();
      openNewChatModal();
    });

    setModal('Nueva llamada', container);
    return;
  }

  container.innerHTML = `
    <p class="modal-copy">Selecciona una conversación y el tipo de llamada. La acción queda registrada localmente y se sincroniza con memoriaBACKEND cuando esté disponible.</p>
    <div class="call-starter-list"></div>
  `;

  const list = container.querySelector('.call-starter-list');
  appState.conversations.forEach((conversation) => {
    const row = document.createElement('article');
    row.className = 'call-starter-row';
    row.innerHTML = `
      <div class="chat-item-avatar" aria-hidden="true"></div>
      <div>
        <strong>${escapeHTML(conversation.name)}</strong>
        <p>${escapeHTML(conversation.email || conversation.status || 'Conversación disponible')}</p>
      </div>
      <div class="call-starter-actions">
        <button class="icon-button" type="button" data-call-type="voice" aria-label="Llamar por voz a ${escapeHTML(conversation.name)}">☎</button>
        <button class="icon-button" type="button" data-call-type="video" aria-label="Iniciar videollamada con ${escapeHTML(conversation.name)}">▣</button>
      </div>
    `;

    renderAvatarInPlace(row.querySelector('.chat-item-avatar'), conversation);

    row.addEventListener('click', (event) => {
      const actionButton = event.target.closest('[data-call-type]');
      if (!actionButton) return;
      closeModal();
      activeConversationId = conversation.id;
      activeSection = 'chats';
      chatView.classList.add('chat-open');
      renderCurrentSection();
      startCall(actionButton.dataset.callType, conversation);
    });

    list.appendChild(row);
  });

  setModal('Nueva llamada', container);
}

function openScheduleCallModal(defaultConversation = null) {
  closeTransientPanels();

  if (!appState.conversations.length) {
    const container = document.createElement('div');
    container.innerHTML = `
      <p class="modal-copy">Necesitas una conversación por correo antes de programar una llamada.</p>
      <button class="primary-button" type="button" data-action="new-chat">Crear conversación</button>
    `;
    container.querySelector('[data-action="new-chat"]').addEventListener('click', () => {
      closeModal();
      openNewChatModal();
    });
    setModal('Programar llamada', container);
    return;
  }

  const form = document.createElement('form');
  const defaultId = defaultConversation?.id || getActiveConversation()?.id || appState.conversations[0]?.id || '';
  form.innerHTML = `
    <label for="scheduledCallConversation">Contacto</label>
    <select id="scheduledCallConversation" required>
      ${appState.conversations.map((conversation) => `<option value="${escapeHTML(conversation.id)}" ${conversation.id === defaultId ? 'selected' : ''}>${escapeHTML(conversation.name)} · ${escapeHTML(conversation.email || 'sin correo visible')}</option>`).join('')}
    </select>

    <label for="scheduledCallType">Tipo de llamada</label>
    <select id="scheduledCallType" required>
      <option value="voice">Llamada de voz</option>
      <option value="video">Videollamada</option>
    </select>

    <label for="scheduledCallTime">Fecha y hora</label>
    <input id="scheduledCallTime" type="datetime-local" min="${getMinimumScheduleDateTimeValue()}" value="${getMinimumScheduleDateTimeValue()}" required />

    <p class="modal-copy">La llamada queda registrada en el historial y se sincroniza con memoriaBACKEND cuando la API esté disponible.</p>
    <p class="form-feedback" data-feedback role="status" aria-live="polite"></p>
    <button class="primary-button" type="submit">Guardar llamada programada</button>
  `;

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const conversationId = form.querySelector('#scheduledCallConversation').value;
    const callType = form.querySelector('#scheduledCallType').value === 'video' ? 'video' : 'voice';
    const scheduledAtRaw = form.querySelector('#scheduledCallTime').value;
    const feedback = form.querySelector('[data-feedback]');
    const conversation = appState.conversations.find((item) => item.id === conversationId);
    const scheduledAtDate = new Date(scheduledAtRaw);

    if (!conversation || Number.isNaN(scheduledAtDate.getTime())) {
      feedback.textContent = 'Selecciona un contacto y una fecha válida.';
      return;
    }

    await scheduleCallForConversation(conversation, callType, scheduledAtDate.toISOString());
    closeModal();
  });

  setModal('Programar llamada', form);
}

function openCallKeypadModal() {
  closeTransientPanels();
  const form = document.createElement('form');
  form.innerHTML = `
    <label for="callKeypadEmail">Correo del contacto</label>
    <input id="callKeypadEmail" type="email" inputmode="email" placeholder="contacto@correo.com" required />

    <label for="callKeypadType">Tipo de llamada</label>
    <select id="callKeypadType" required>
      <option value="voice">Llamada de voz</option>
      <option value="video">Videollamada</option>
    </select>

    <p class="modal-copy">ChatER usa correo electrónico como identidad. El teclado inicia una llamada creando o reutilizando la conversación asociada a ese correo.</p>
    <p class="form-feedback" data-feedback role="status" aria-live="polite"></p>
    <button class="primary-button" type="submit">Iniciar llamada</button>
  `;

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const emailInputElement = form.querySelector('#callKeypadEmail');
    const feedback = form.querySelector('[data-feedback]');
    const email = normalizeStorageIdentity(emailInputElement.value);
    const callType = form.querySelector('#callKeypadType').value === 'video' ? 'video' : 'voice';

    if (!emailInputElement.checkValidity()) {
      feedback.textContent = 'Escribe un correo electrónico válido.';
      return;
    }

    const conversation = getOrCreateConversationByEmail(email);
    closeModal();
    activeConversationId = conversation.id;
    activeSection = 'chats';
    chatView.classList.add('chat-open');
    renderCurrentSection();
    await startCall(callType, conversation);
  });

  setModal('Teclado de llamadas por correo', form);
  form.querySelector('#callKeypadEmail').focus();
}

function getOrCreateConversationByEmail(email) {
  const normalizedEmail = normalizeStorageIdentity(email);
  const existingConversation = findConversationByContactIdentity({ email: normalizedEmail });
  if (existingConversation) return existingConversation;

  const displayName = normalizedEmail.split('@')[0] || 'Contacto';
  const conversation = createLocalContactConversation({
    name: displayName,
    email: normalizedEmail,
    source: 'call-keypad'
  });
  conversation.status = 'Creado desde teclado de llamadas';
  conversation.contactSyncStatus = CHATER_CONFIG.backendBaseUrl ? 'pending' : 'local';
  persistState();

  if (CHATER_CONFIG.backendBaseUrl) {
    const createConversationMutationId = generateClientMutationId();
    enqueueBackendOperation({
      type: 'createConversation',
      dedupeKey: `conversation:${conversation.id}`,
      replaceExisting: true,
      payload: {
        localConversationId: conversation.id,
        contact: {
          name: displayName,
          email: normalizedEmail,
          source: 'call-keypad',
          clientMutationId: createConversationMutationId
        }
      }
    });
  }

  return conversation;
}


async function scheduleCallForConversation(conversation, type, scheduledAt) {
  const sessionGuard = captureSessionGuard();
  const label = type === 'video' ? 'videollamada' : 'llamada de voz';
  const localCallId = `call-scheduled-${Date.now()}`;
  const preview = `${label} programada para ${formatScheduledCallTime(scheduledAt)}`;

  appState.calls.unshift({
    id: localCallId,
    conversationId: conversation.id,
    name: conversation.name,
    preview,
    type,
    status: 'scheduled',
    scheduledAt,
    avatar: conversation.avatar,
    avatarImage: conversation.avatarImage || '',
    syncStatus: CHATER_CONFIG.backendBaseUrl ? 'pending' : 'local'
  });

  conversation.messages.push({
    id: generateClientMutationId(),
    type: 'system',
    text: `Se programó una ${label} para ${formatScheduledCallTime(scheduledAt)}.`,
    time: getCurrentTime()
  });

  persistState();
  if (activeSection === 'calls') renderCurrentSection();
  showToast(`${label.charAt(0).toUpperCase()}${label.slice(1)} programada.`);

  const scheduleCallMutationId = generateClientMutationId();

  try {
    const payload = await apiClient.scheduleCall(conversation.id, type, scheduledAt, scheduleCallMutationId);
    if (!isSessionGuardCurrent(sessionGuard)) return;
    if (payload?.offlineDemo) {
      showToast('Llamada programada localmente. Falta conectar API de programación.');
    } else {
      markQueuedCallSynced(localCallId, payload);
      showToast('Llamada programada y sincronizada con memoriaBACKEND.');
    }
  } catch (error) {
    if (!isSessionGuardCurrent(sessionGuard)) return;
    enqueueBackendOperation({
      type: 'scheduleCall',
      dedupeKey: `call-scheduled:${localCallId}`,
      payload: { localCallId, conversationId: conversation.id, callType: type, scheduledAt, clientMutationId: scheduleCallMutationId }
    });
    showToast('Llamada programada localmente y en cola de sincronización.');
  }
}

function openCallDetailModal(call) {
  const conversation = findConversationForCall(call);
  const callTypeLabel = call.type === 'video' ? 'Videollamada' : 'Llamada de voz';
  const statusLabel = call.status === 'scheduled' ? `Programada para ${formatScheduledCallTime(call.scheduledAt)}` : call.preview;
  const container = document.createElement('div');
  container.innerHTML = `
    <div class="call-detail">
      <div class="chat-item-avatar" aria-hidden="true"></div>
      <div>
        <strong>${escapeHTML(call.name)}</strong>
        <p>${escapeHTML(statusLabel)}</p>
        <p>Tipo: ${callTypeLabel}</p>
      </div>
    </div>
    <button class="tool-row" type="button" data-action="repeat-call">
      <span class="tool-icon">${call.type === 'video' ? '▣' : '☎'}</span>
      <span><strong>${call.status === 'scheduled' ? 'Llamar ahora' : 'Volver a llamar'}</strong><br><small>Inicia una nueva ${callTypeLabel.toLowerCase()}.</small></span>
    </button>
    <button class="tool-row" type="button" data-action="schedule-call">
      <span class="tool-icon">▦</span>
      <span><strong>Programar otra llamada</strong><br><small>Agenda una llamada futura con este contacto.</small></span>
    </button>
    <button class="tool-row" type="button" data-action="open-chat">
      <span class="tool-icon">💬</span>
      <span><strong>Abrir chat</strong><br><small>Vuelve a la conversación relacionada.</small></span>
    </button>
  `;

  renderAvatarInPlace(container.querySelector('.chat-item-avatar'), call);

  container.addEventListener('click', (event) => {
    const actionButton = event.target.closest('[data-action]');
    if (!actionButton) return;

    if (actionButton.dataset.action === 'schedule-call') {
      closeModal();
      openScheduleCallModal(conversation || null);
      return;
    }

    if (!conversation) {
      showToast('No hay una conversación relacionada con esta llamada.');
      return;
    }

    if (actionButton.dataset.action === 'repeat-call') {
      closeModal();
      activeConversationId = conversation.id;
      activeSection = 'chats';
      renderCurrentSection();
      chatView.classList.add('chat-open');
      startCall(call.type, conversation);
      return;
    }

    if (actionButton.dataset.action === 'open-chat') {
      activeConversationId = conversation.id;
      activeSection = 'chats';
      closeModal();
      renderCurrentSection();
      chatView.classList.add('chat-open');
    }
  });

  setModal('Detalle de llamada', container);
}


function getBrowserTimezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || '';
  } catch (error) {
    return '';
  }
}

function buildStaticVisitPayload(clientMutationId = `visit-${staticVisitState.pageLoadId}`) {
  const currentUrl = new URL(window.location.href);
  const path = `${currentUrl.pathname || '/'}${currentUrl.search || ''}`;
  return {
    path,
    url: currentUrl.href,
    referrer: document.referrer || '',
    title: document.title || 'ChatER',
    userId: getSessionUserId() || '',
    userEmail: getSessionEmail() || '',
    client: {
      language: navigator.language || document.documentElement.lang || 'es-CO',
      languages: Array.from(navigator.languages || []).filter(Boolean),
      timezone: getBrowserTimezone(),
      screen: {
        width: Number(window.screen?.width || 0),
        height: Number(window.screen?.height || 0),
        pixelRatio: Number(window.devicePixelRatio || 1)
      },
      pageLoadId: staticVisitState.pageLoadId,
      deviceId: getDeviceId(),
      pwaMode: isRunningAsInstalledPwa()
    },
    idempotencyKey: clientMutationId,
    clientMutationId
  };
}

function getStaticVisitPayloadData(payload = {}) {
  return extractNestedObject(payload, ['visit', 'visita', 'data', 'result', 'resultado']) || payload || {};
}

function getStaticVisitStatusLabel() {
  if (!CHATER_CONFIG.enableStaticVisitTracking) return 'Desactivado por configuración.';
  if (!CHATER_CONFIG.backendBaseUrl) return 'No configurado: falta MEMORIA_BACKEND_URL para registrar /api/v1/visitas/apertura.';
  if (staticVisitState.inFlight) return 'Registrando apertura con VISITASstaticSITEx…';
  if (staticVisitState.error) return `Último registro falló: ${staticVisitState.error}`;
  if (staticVisitState.payload) {
    const data = getStaticVisitPayloadData(staticVisitState.payload);
    const country = data.countryIsoCode || data.isoCode || data.country || '';
    const language = data.primaryLanguage || data.language || data.locale || '';
    const visitState = data.duplicate === true
      ? ' · carga ya contada'
      : data.registered === false
        ? ' · no contabilizada por memoriaBACKEND'
        : '';
    const suffix = [country, language].filter(Boolean).join(' · ');
    return `Apertura registrada${suffix ? ` · ${suffix}` : ''}${visitState}.`;
  }
  return 'Pendiente de registrar apertura.';
}

async function registerStaticSiteOpening(options = {}) {
  if (!CHATER_CONFIG.enableStaticVisitTracking || !CHATER_CONFIG.backendBaseUrl) return;
  if (staticVisitState.inFlight || staticVisitState.payload) return;

  staticVisitState.inFlight = true;
  staticVisitState.error = '';
  const clientMutationId = options.clientMutationId || `visita-${staticVisitState.pageLoadId}`;

  try {
    const payload = buildStaticVisitPayload(clientMutationId);
    const response = await apiClient.registerStaticVisit(payload);
    staticVisitState.payload = response;
    staticVisitState.registeredAt = new Date().toISOString();
  } catch (error) {
    staticVisitState.error = error?.message || 'No se pudo registrar la apertura.';
    console.warn('No se pudo registrar la apertura del static site en VISITASstaticSITEx.', error);
  } finally {
    staticVisitState.inFlight = false;
  }
}

async function syncInitialDataFromBackend() {
  if (!CHATER_CONFIG.backendBaseUrl || !getSessionEmail()) return;

  const sessionGuard = captureSessionGuard();
  const sessionKey = getSessionGuardKey(sessionGuard);
  if (initialSyncInFlight === sessionKey) return;

  initialSyncInFlight = sessionKey;
  try {
    const [profileResult, preferencesResult] = await Promise.allSettled([
      apiClient.getProfile(),
      CHATER_CONFIG.enableRemoteUserPreferences ? apiClient.getUserPreferences() : Promise.resolve(null)
    ]);

    if (!isSessionGuardCurrent(sessionGuard)) return;

    if ((profileResult.status === 'rejected' && isBackendAuthError(profileResult.reason))
      || (preferencesResult.status === 'rejected' && isBackendAuthError(preferencesResult.reason))) {
      requireFreshBackendLogin(sessionGuard.email, 'Tu sesión venció o no fue aceptada por memoriaBACKEND. Ingresa nuevamente con Google/Gmail.');
      renderShell();
      return;
    }

    const profilePayload = unwrapFulfilled(profileResult);
    const preferencesPayload = unwrapFulfilled(preferencesResult);
    const profileData = extractNestedObject(profilePayload, ['user', 'profile', 'perfil']);
    persistBackendUserIdFromPayload(profilePayload);
    const preferencesChanged = applyRemoteUserPreferences(preferencesPayload);
    if (profileData?.email || profilePayload?.user?.email || profilePayload?.email) {
      userEmailLabel.textContent = profileData?.email || profilePayload.user?.email || profilePayload.email;
    }

    const [chatsResult, statesResult, callsResult] = await Promise.allSettled([
      apiClient.getConversations(),
      apiClient.getStates(),
      apiClient.getCallsHistory()
    ]);

    if (!isSessionGuardCurrent(sessionGuard)) return;

    const remoteConversations = extractArrayFromPayload(unwrapFulfilled(chatsResult), ['chats', 'conversations', 'items']).map(normalizeConversationFromApi);
    const remoteStates = extractArrayFromPayload(unwrapFulfilled(statesResult), ['states', 'items']).map(normalizeStateFromApi);
    const remoteCalls = extractArrayFromPayload(unwrapFulfilled(callsResult), ['calls', 'history', 'items']).map(normalizeCallFromApi);

    let changed = Boolean(preferencesChanged);
    if (remoteConversations.length) {
      appState.conversations = mergeConversationsById(remoteConversations, appState.conversations);
      if (!appState.conversations.some((conversation) => conversation.id === activeConversationId)) {
        activeConversationId = appState.conversations[0]?.id || null;
      }
      changed = true;
    }

    if (remoteStates.length) {
      appState.states = mergeById(remoteStates, appState.states).filter((state) => !isStateExpired(state));
      if (!appState.states.some((state) => state.id === activeStateId)) {
        activeStateId = getActiveStates()[0]?.id || null;
      }
      changed = true;
    }

    if (remoteCalls.length) {
      appState.calls = mergeById(remoteCalls, appState.calls);
      changed = true;
    }

    if (changed && isSessionGuardCurrent(sessionGuard)) {
      persistState();
      renderCurrentSection();
      renderConversation();
    }
  } catch (error) {
    if (isSessionGuardCurrent(sessionGuard)) {
      console.warn('No se pudo sincronizar el estado inicial con memoriaBACKEND.', error);
    }
  } finally {
    if (initialSyncInFlight === sessionKey) {
      initialSyncInFlight = '';
    }
  }
}

async function syncRealtimeConversationInboxFromBackend(options = {}) {
  if (!CHATER_CONFIG.backendBaseUrl || !getSessionEmail()) return;

  const now = Date.now();
  if (!options.force && now - Number(realtimeConversationSyncState.lastSyncedAt || 0) < 2000) return;

  const sessionGuard = captureSessionGuard();
  const sessionKey = getSessionGuardKey(sessionGuard);
  if (realtimeConversationSyncState.inFlight === sessionKey) return;

  realtimeConversationSyncState.inFlight = sessionKey;
  try {
    const payload = await apiClient.getConversations();
    if (!isSessionGuardCurrent(sessionGuard) || payload?.offlineDemo) return;

    const remoteConversations = extractArrayFromPayload(payload, ['chats', 'conversations', 'items']).map(normalizeConversationFromApi);
    if (!remoteConversations.length) return;

    remoteConversations.forEach(reconcileRemoteConversationIdentityBySharedKey);
    appState.conversations = mergeConversationsById(remoteConversations, appState.conversations);
    if (!appState.conversations.some((conversation) => conversation.id === activeConversationId)) {
      activeConversationId = getFirstVisibleConversationId(activeConversationId) || getVisibleConversations()[0]?.id || null;
    }

    realtimeConversationSyncState.lastSyncedAt = Date.now();
    persistState();
    renderCurrentSection();
    renderConversation();
  } catch (error) {
    if (isSessionGuardCurrent(sessionGuard)) {
      console.warn('No se pudo reconciliar conversaciones desde STREMEx.', error);
    }
  } finally {
    if (realtimeConversationSyncState.inFlight === sessionKey) {
      realtimeConversationSyncState.inFlight = '';
    }
  }
}

function unwrapFulfilled(result) {
  if (result?.status !== 'fulfilled' || result.value?.offlineDemo) return null;
  return result.value;
}

function extractArrayFromPayload(payload, keys = []) {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload;

  const aliases = [
    ...(Array.isArray(keys) ? keys : [keys]),
    ...(Array.isArray(keys) ? keys : [keys]).flatMap((key) => getApiCollectionAliases(key))
  ];
  return findFirstApiArray(payload, [...new Set(aliases.filter(Boolean))]) || [];
}

function mergeById(primaryItems, secondaryItems) {
  const seen = new Set();
  return [...primaryItems, ...secondaryItems]
    .filter(Boolean)
    .filter((item) => {
      const id = String(item.id || '');
      if (!id || seen.has(id)) return false;
      seen.add(id);
      return true;
    });
}


function isDeleteSyncStatusPending(status = '') {
  const normalizedStatus = String(status || '').trim().toLowerCase();
  return normalizedStatus === 'syncing'
    || normalizedStatus === 'pending'
    || normalizedStatus.startsWith('syncing:')
    || normalizedStatus.startsWith('pending:');
}

function getDeleteDesiredDeletedState(conversation = {}) {
  return Object.prototype.hasOwnProperty.call(conversation, 'deleteDesiredDeleted')
    ? Boolean(conversation.deleteDesiredDeleted)
    : coerceFirstBooleanFlag([conversation.deleted, conversation.deletedForCurrentUser], false);
}

function getRemoteDeleteChangedAt(conversation = {}) {
  return conversation.deleteChangedAt
    || conversation.deletedAt
    || conversation.restoredAt
    || conversation.updatedAt
    || conversation.modifiedAt
    || conversation.deleteSyncedAt
    || '';
}

function getLocalDeleteChangedAt(conversation = {}) {
  return conversation.deleteLocalChangedAt
    || conversation.deleteChangedAt
    || conversation.deletedAt
    || conversation.restoredAt
    || conversation.deleteSyncedAt
    || conversation.updatedAt
    || '';
}

function hasExplicitLocalDeleteDecision(conversation = {}) {
  return Object.prototype.hasOwnProperty.call(conversation, 'deleteDesiredDeleted')
    || Boolean(conversation.deleteLocalChangedAt || conversation.deleteLocalMutationId);
}

function shouldPreserveLocalDeleteState(remoteConversation = {}, localConversation = {}) {
  const localDeleted = coerceFirstBooleanFlag([localConversation.deleted, localConversation.deletedForCurrentUser], false);
  const remoteDeleted = coerceFirstBooleanFlag([remoteConversation.deleted, remoteConversation.deletedForCurrentUser], false);
  if (localDeleted === remoteDeleted) return false;

  if (isDeleteSyncStatusPending(localConversation.deleteSyncStatus || localConversation.actionSyncStatus)) return true;
  if (!hasExplicitLocalDeleteDecision(localConversation)) return false;

  const localDesiredDeleted = getDeleteDesiredDeletedState(localConversation);
  const localMutationId = String(localConversation.deleteLocalMutationId || '').trim();
  const remoteMutationId = String(remoteConversation.deleteClientMutationId || remoteConversation.clientMutationId || '').trim();
  const remoteConfirmsLocalDesiredState = remoteDeleted === localDesiredDeleted;
  if (localMutationId && remoteMutationId && localMutationId === remoteMutationId) {
    return !remoteConfirmsLocalDesiredState;
  }

  return remoteDeleted !== localDesiredDeleted;
}

function buildLocalDeleteMergeState(localConversation = {}) {
  const deleted = coerceFirstBooleanFlag([localConversation.deleted, localConversation.deletedForCurrentUser], false);
  const deletionRegistry = deleted
    ? (localConversation.localDeletionRegistry || localConversation.deletionRegistry || null)
    : stripCurrentParticipantFromDeletionSource(localConversation.deletionRegistry || null);
  return {
    deleted,
    deletedForCurrentUser: deleted,
    isDeletedForCurrentUser: deleted,
    hiddenForCurrentUser: deleted,
    deletedAt: deleted ? (localConversation.deletedAt || localConversation.deleteChangedAt || localConversation.deleteLocalChangedAt || '') : '',
    localDeletionRegistry: deleted ? deletionRegistry : null,
    deletionRegistry,
    participantDeletionRegistry: deleted
      ? (localConversation.participantDeletionRegistry || deletionRegistry?.participantDeletionRegistry || null)
      : stripCurrentParticipantFromDeletionSource(localConversation.participantDeletionRegistry || deletionRegistry?.participantDeletionRegistry || null),
    deletedParticipants: deleted
      ? (localConversation.deletedParticipants || [])
      : stripCurrentParticipantFromDeletionSource(localConversation.deletedParticipants || []),
    deletedParticipantIdentityKeys: deleted
      ? (localConversation.deletedParticipantIdentityKeys || [])
      : stripCurrentParticipantFromDeletionSource(localConversation.deletedParticipantIdentityKeys || []),
    deletionCounterInitial: localConversation.deletionCounterInitial || localConversation.participantCount || '',
    deletionCounterRemaining: localConversation.deletionCounterRemaining ?? '',
    remainingParticipantCount: localConversation.remainingParticipantCount ?? localConversation.deletionCounterRemaining ?? '',
    deleteSyncStatus: localConversation.deleteSyncStatus || localConversation.actionSyncStatus || 'pending',
    deleteSyncedAt: localConversation.deleteSyncedAt || localConversation.actionSyncedAt || '',
    deleteChangedAt: localConversation.deleteChangedAt || localConversation.deleteLocalChangedAt || localConversation.deletedAt || localConversation.restoredAt || '',
    deleteClientMutationId: localConversation.deleteClientMutationId || localConversation.deleteLocalMutationId || '',
    deleteLocalMutationId: localConversation.deleteLocalMutationId || localConversation.deleteClientMutationId || '',
    deleteLocalChangedAt: localConversation.deleteLocalChangedAt || localConversation.deleteChangedAt || '',
    deleteDesiredDeleted: deleted
  };
}

function resolveConversationDeleteMergeState(remoteConversation = {}, localConversation = {}) {
  if (shouldPreserveLocalDeleteState(remoteConversation, localConversation)) {
    return buildLocalDeleteMergeState(localConversation);
  }

  const remoteDeleted = coerceFirstBooleanFlag([remoteConversation.deleted, remoteConversation.deletedForCurrentUser], false);
  const remoteDeleteChangedAt = getRemoteDeleteChangedAt(remoteConversation);
  const hasLocalDeleteDecision = hasExplicitLocalDeleteDecision(localConversation);
  const deletionRegistry = remoteDeleted
    ? (remoteConversation.localDeletionRegistry || remoteConversation.deletionRegistry || localConversation.localDeletionRegistry || localConversation.deletionRegistry || null)
    : stripCurrentParticipantFromDeletionSource(remoteConversation.deletionRegistry || localConversation.deletionRegistry || null);
  const participantDeletionRegistry = remoteDeleted
    ? (remoteConversation.participantDeletionRegistry || deletionRegistry?.participantDeletionRegistry || localConversation.participantDeletionRegistry || null)
    : stripCurrentParticipantFromDeletionSource(remoteConversation.participantDeletionRegistry || deletionRegistry?.participantDeletionRegistry || localConversation.participantDeletionRegistry || null);

  return {
    deleted: remoteDeleted,
    deletedForCurrentUser: remoteDeleted,
    isDeletedForCurrentUser: remoteDeleted,
    hiddenForCurrentUser: remoteDeleted,
    deletedAt: remoteDeleted ? (remoteConversation.deletedAt || remoteDeleteChangedAt || '') : '',
    localDeletionRegistry: remoteDeleted ? (remoteConversation.localDeletionRegistry || localConversation.localDeletionRegistry || null) : null,
    deletionRegistry,
    participantDeletionRegistry,
    deletedParticipants: remoteDeleted
      ? (remoteConversation.deletedParticipants || localConversation.deletedParticipants || [])
      : stripCurrentParticipantFromDeletionSource(remoteConversation.deletedParticipants || localConversation.deletedParticipants || []),
    deletedParticipantIdentityKeys: remoteDeleted
      ? (remoteConversation.deletedParticipantIdentityKeys || localConversation.deletedParticipantIdentityKeys || [])
      : stripCurrentParticipantFromDeletionSource(remoteConversation.deletedParticipantIdentityKeys || localConversation.deletedParticipantIdentityKeys || []),
    deletionCounterInitial: remoteConversation.deletionCounterInitial || localConversation.deletionCounterInitial || remoteConversation.participantCount || localConversation.participantCount || '',
    deletionCounterRemaining: remoteConversation.deletionCounterRemaining ?? localConversation.deletionCounterRemaining ?? '',
    remainingParticipantCount: remoteConversation.remainingParticipantCount ?? localConversation.remainingParticipantCount ?? remoteConversation.deletionCounterRemaining ?? localConversation.deletionCounterRemaining ?? '',
    deleteSyncStatus: remoteConversation.deleteSyncStatus || localConversation.deleteSyncStatus || '',
    deleteSyncedAt: remoteConversation.deleteSyncedAt || localConversation.deleteSyncedAt || '',
    deleteChangedAt: remoteDeleteChangedAt || localConversation.deleteChangedAt || '',
    deleteClientMutationId: remoteConversation.deleteClientMutationId || localConversation.deleteClientMutationId || '',
    deleteLocalMutationId: hasLocalDeleteDecision ? (localConversation.deleteLocalMutationId || '') : '',
    deleteLocalChangedAt: hasLocalDeleteDecision ? (localConversation.deleteLocalChangedAt || '') : '',
    deleteDesiredDeleted: hasLocalDeleteDecision ? getDeleteDesiredDeletedState(localConversation) : remoteDeleted
  };
}


function isBlockSyncStatusPending(status = '') {
  const normalizedStatus = String(status || '').trim().toLowerCase();
  return normalizedStatus === 'syncing'
    || normalizedStatus === 'pending'
    || normalizedStatus.startsWith('syncing:')
    || normalizedStatus.startsWith('pending:');
}

function getBlockDesiredBlockedState(conversation = {}) {
  return Object.prototype.hasOwnProperty.call(conversation, 'blockDesiredBlocked')
    ? Boolean(conversation.blockDesiredBlocked)
    : coerceFirstBooleanFlag([conversation.blocked], false);
}

function getRemoteBlockChangedAt(conversation = {}) {
  return conversation.blockChangedAt
    || conversation.blockUpdatedAt
    || conversation.blockedAt
    || conversation.unblockedAt
    || conversation.updatedAt
    || conversation.modifiedAt
    || conversation.blockSyncedAt
    || '';
}

function getLocalBlockChangedAt(conversation = {}) {
  return conversation.blockLocalChangedAt
    || conversation.blockChangedAt
    || conversation.blockSyncedAt
    || conversation.updatedAt
    || '';
}

function hasExplicitLocalBlockDecision(conversation = {}) {
  return Boolean(conversation.blockLocalChangedAt || conversation.blockLocalMutationId)
    || isBlockSyncStatusPending(conversation.blockSyncStatus);
}

function shouldPreserveLocalBlockState(remoteConversation = {}, localConversation = {}) {
  const localBlocked = coerceFirstBooleanFlag([localConversation.blocked], false);
  const remoteBlocked = coerceFirstBooleanFlag([remoteConversation.blocked], false);
  if (localBlocked === remoteBlocked) return false;

  if (isBlockSyncStatusPending(localConversation.blockSyncStatus)) return true;
  if (!hasExplicitLocalBlockDecision(localConversation)) return false;

  const localDesiredBlocked = getBlockDesiredBlockedState(localConversation);
  const localMutationId = String(localConversation.blockLocalMutationId || '').trim();
  const remoteMutationId = String(remoteConversation.blockClientMutationId || remoteConversation.clientMutationId || '').trim();
  const remoteConfirmsLocalDesiredState = remoteBlocked === localDesiredBlocked;
  if (localMutationId && remoteMutationId && localMutationId === remoteMutationId) {
    return !remoteConfirmsLocalDesiredState;
  }

  const localChangedAt = parseArchiveTimestampMs(getLocalBlockChangedAt(localConversation));
  const remoteChangedAt = parseArchiveTimestampMs(getRemoteBlockChangedAt(remoteConversation));
  if (remoteBlocked !== localDesiredBlocked) return true;
  if (localChangedAt && remoteChangedAt) return remoteChangedAt <= localChangedAt + ARCHIVE_CONFLICT_CLOCK_SKEW_TOLERANCE_MS;
  if (localChangedAt && !remoteChangedAt) return true;
  if (!localChangedAt && localMutationId && (!remoteMutationId || remoteMutationId !== localMutationId)) return true;

  return false;
}

function buildLocalBlockMergeState(localConversation = {}) {
  const blocked = coerceFirstBooleanFlag([localConversation.blocked], false);
  return {
    blocked,
    blockSyncStatus: localConversation.blockSyncStatus || 'pending',
    blockSyncedAt: localConversation.blockSyncedAt || '',
    blockChangedAt: localConversation.blockChangedAt || localConversation.blockLocalChangedAt || '',
    blockClientMutationId: localConversation.blockClientMutationId || localConversation.blockLocalMutationId || '',
    blockLocalMutationId: localConversation.blockLocalMutationId || localConversation.blockClientMutationId || '',
    blockLocalChangedAt: localConversation.blockLocalChangedAt || localConversation.blockChangedAt || '',
    blockDesiredBlocked: blocked
  };
}

function resolveConversationBlockMergeState(remoteConversation = {}, localConversation = {}) {
  if (shouldPreserveLocalBlockState(remoteConversation, localConversation)) {
    return buildLocalBlockMergeState(localConversation);
  }

  const remoteBlocked = coerceFirstBooleanFlag([remoteConversation.blocked], false);
  const remoteBlockChangedAt = getRemoteBlockChangedAt(remoteConversation);
  const hasLocalBlockDecision = hasExplicitLocalBlockDecision(localConversation);

  return {
    blocked: remoteBlocked,
    blockSyncStatus: remoteConversation.blockSyncStatus || localConversation.blockSyncStatus || '',
    blockSyncedAt: remoteConversation.blockSyncedAt || localConversation.blockSyncedAt || '',
    blockChangedAt: remoteBlockChangedAt || localConversation.blockChangedAt || '',
    blockClientMutationId: remoteConversation.blockClientMutationId || localConversation.blockClientMutationId || '',
    blockLocalMutationId: hasLocalBlockDecision ? (localConversation.blockLocalMutationId || '') : '',
    blockLocalChangedAt: hasLocalBlockDecision ? (localConversation.blockLocalChangedAt || '') : '',
    blockDesiredBlocked: hasLocalBlockDecision ? getBlockDesiredBlockedState(localConversation) : remoteBlocked
  };
}

function isArchiveSyncStatusPending(status = '') {
  const normalizedStatus = String(status || '').trim().toLowerCase();
  return normalizedStatus === 'syncing'
    || normalizedStatus === 'pending'
    || normalizedStatus.startsWith('syncing:')
    || normalizedStatus.startsWith('pending:');
}

const ARCHIVE_CONFLICT_CLOCK_SKEW_TOLERANCE_MS = 5000;

function parseArchiveTimestampMs(value = '') {
  const timestamp = Date.parse(String(value || ''));
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function getArchiveDesiredArchivedState(conversation = {}) {
  return Object.prototype.hasOwnProperty.call(conversation, 'archiveDesiredArchived')
    ? Boolean(conversation.archiveDesiredArchived)
    : coerceFirstBooleanFlag([conversation.archived], false);
}

function hasArchiveSpecificRemoteTimestamp(conversation = {}) {
  return Boolean(
    conversation.archiveChangedAt
    || conversation.archiveUpdatedAt
    || conversation.archivedAt
    || conversation.restoredAt
    || conversation.archiveSyncedAt
  );
}

function getRemoteArchiveChangedAt(conversation = {}) {
  return conversation.archiveChangedAt
    || conversation.archiveUpdatedAt
    || conversation.archivedAt
    || conversation.restoredAt
    || conversation.updatedAt
    || conversation.modifiedAt
    || conversation.archiveSyncedAt
    || '';
}

function getLocalArchiveChangedAt(conversation = {}) {
  return conversation.archiveLocalChangedAt
    || conversation.archiveChangedAt
    || conversation.archiveSyncedAt
    || conversation.updatedAt
    || '';
}

function hasExplicitLocalArchiveDecision(conversation = {}) {
  return Object.prototype.hasOwnProperty.call(conversation, 'archiveDesiredArchived')
    || Boolean(conversation.archiveLocalChangedAt || conversation.archiveLocalMutationId);
}

function shouldPreserveLocalArchiveState(remoteConversation = {}, localConversation = {}) {
  const localArchived = coerceFirstBooleanFlag([localConversation.archived], false);
  const remoteArchived = coerceFirstBooleanFlag([remoteConversation.archived], false);
  if (localArchived === remoteArchived) return false;

  if (isArchiveSyncStatusPending(localConversation.archiveSyncStatus)) return true;
  if (!hasExplicitLocalArchiveDecision(localConversation)) return false;

  const localDesiredArchived = getArchiveDesiredArchivedState(localConversation);
  const localMutationId = String(localConversation.archiveLocalMutationId || '').trim();
  const remoteMutationId = String(remoteConversation.archiveClientMutationId || remoteConversation.clientMutationId || '').trim();
  const remoteConfirmsLocalDesiredState = remoteArchived === localDesiredArchived;
  if (localMutationId && remoteMutationId && localMutationId === remoteMutationId) {
    return !remoteConfirmsLocalDesiredState;
  }

  const localChangedAt = parseArchiveTimestampMs(getLocalArchiveChangedAt(localConversation));
  const remoteChangedAt = parseArchiveTimestampMs(getRemoteArchiveChangedAt(remoteConversation));
  const remoteHasArchiveTimestamp = hasArchiveSpecificRemoteTimestamp(remoteConversation);
  const remoteContradictsLocalDecision = localDesiredArchived === localArchived && remoteArchived !== localDesiredArchived;

  if (remoteContradictsLocalDecision) {
    // Una decisión local explícita de archivar/restaurar es la fuente de verdad del cliente
    // frente a respuestas o eventos remotos viejos. Solo una decisión remota inequívocamente
    // posterior puede reemplazarla; así se evita rearchivar un chat recién restaurado.
    if (remoteHasArchiveTimestamp && localChangedAt && remoteChangedAt) {
      return remoteChangedAt <= localChangedAt + ARCHIVE_CONFLICT_CLOCK_SKEW_TOLERANCE_MS;
    }
    return true;
  }

  if (localChangedAt && remoteChangedAt) {
    if (!remoteHasArchiveTimestamp && localArchived !== remoteArchived) return true;
    return remoteChangedAt <= localChangedAt + ARCHIVE_CONFLICT_CLOCK_SKEW_TOLERANCE_MS;
  }

  if (localChangedAt && !remoteChangedAt) return true;
  if (!localChangedAt && localMutationId && (!remoteMutationId || remoteMutationId !== localMutationId)) return true;

  return false;
}

function buildLocalArchiveMergeState(localConversation = {}) {
  const archived = coerceFirstBooleanFlag([localConversation.archived], false);
  return {
    archived,
    archiveSyncStatus: localConversation.archiveSyncStatus || 'pending',
    archiveSyncedAt: localConversation.archiveSyncedAt || '',
    archiveChangedAt: localConversation.archiveChangedAt || localConversation.archiveLocalChangedAt || '',
    archiveClientMutationId: localConversation.archiveClientMutationId || localConversation.archiveLocalMutationId || '',
    archiveLocalMutationId: localConversation.archiveLocalMutationId || localConversation.archiveClientMutationId || '',
    archiveLocalChangedAt: localConversation.archiveLocalChangedAt || localConversation.archiveChangedAt || '',
    archiveDesiredArchived: archived,
    status: localConversation.status || (archived ? 'Archivado' : 'Restaurado')
  };
}

function resolveConversationArchiveMergeState(remoteConversation = {}, localConversation = {}) {
  if (shouldPreserveLocalArchiveState(remoteConversation, localConversation)) {
    return buildLocalArchiveMergeState(localConversation);
  }

  const remoteArchived = coerceFirstBooleanFlag([remoteConversation.archived], false);
  const remoteArchiveChangedAt = getRemoteArchiveChangedAt(remoteConversation);

  const hasLocalArchiveDecision = hasExplicitLocalArchiveDecision(localConversation);

  return {
    archived: remoteArchived,
    archiveSyncStatus: remoteConversation.archiveSyncStatus || localConversation.archiveSyncStatus || '',
    archiveSyncedAt: remoteConversation.archiveSyncedAt || localConversation.archiveSyncedAt || '',
    archiveChangedAt: remoteArchiveChangedAt || localConversation.archiveChangedAt || '',
    archiveClientMutationId: remoteConversation.archiveClientMutationId || localConversation.archiveClientMutationId || '',
    archiveLocalMutationId: hasLocalArchiveDecision ? (localConversation.archiveLocalMutationId || '') : '',
    archiveLocalChangedAt: hasLocalArchiveDecision ? (localConversation.archiveLocalChangedAt || '') : '',
    archiveDesiredArchived: hasLocalArchiveDecision ? getArchiveDesiredArchivedState(localConversation) : remoteArchived
  };
}

function mergeConversationsById(remoteConversations = [], localConversations = []) {
  const conversationsById = new Map();
  const sharedKeyToConversationId = new Map();

  const rememberConversation = (conversation = {}) => {
    const id = String(conversation.id || '');
    if (!id) return;
    conversationsById.set(id, { ...conversation });
    const sharedKey = getConversationSharedMergeKey(conversation);
    if (sharedKey && !sharedKeyToConversationId.has(sharedKey)) {
      sharedKeyToConversationId.set(sharedKey, id);
    }
  };

  localConversations.filter(Boolean).forEach(rememberConversation);

  remoteConversations.filter(Boolean).forEach((remoteConversation) => {
    const remoteId = String(remoteConversation.id || '');
    const sharedKey = getConversationSharedMergeKey(remoteConversation);
    const localIdBySharedKey = sharedKey ? sharedKeyToConversationId.get(sharedKey) : '';
    const localConversation = (remoteId && conversationsById.get(remoteId))
      || (localIdBySharedKey && conversationsById.get(localIdBySharedKey))
      || null;

    if (!remoteId && !localConversation) return;

    if (!localConversation) {
      conversationsById.set(remoteId, { ...remoteConversation });
      if (sharedKey) sharedKeyToConversationId.set(sharedKey, remoteId);
      return;
    }

    const effectiveId = remoteId || String(localConversation.id || localIdBySharedKey || '');
    const mergedConversation = {
      ...localConversation,
      ...remoteConversation,
      id: effectiveId || localConversation.id || remoteConversation.id,
      ...resolveConversationArchiveMergeState(remoteConversation, localConversation),
      messages: mergeMessagesByIdentity(remoteConversation.messages, localConversation.messages),
      messagesHydrated: Boolean(remoteConversation.messagesHydrated || localConversation.messagesHydrated),
      messagesHistoryCursor: remoteConversation.messagesHistoryCursor || localConversation.messagesHistoryCursor || '',
      messagesHistoryLastErrorAt: localConversation.messagesHistoryLastErrorAt || '',
      ...resolveConversationDeleteMergeState(remoteConversation, localConversation),
      ...resolveConversationBlockMergeState(remoteConversation, localConversation),
      favorite: Boolean(localConversation.favorite || remoteConversation.favorite),
      customListName: localConversation.customListName || remoteConversation.customListName || '',
      restricted: Boolean(localConversation.restricted || remoteConversation.restricted),
      muted: Boolean(localConversation.muted || remoteConversation.muted),
      mutedUntil: localConversation.mutedUntil || remoteConversation.mutedUntil || ''
    };

    if (localIdBySharedKey && localIdBySharedKey !== effectiveId) {
      conversationsById.delete(localIdBySharedKey);
    }
    conversationsById.set(mergedConversation.id, mergedConversation);
    if (sharedKey) sharedKeyToConversationId.set(sharedKey, mergedConversation.id);
  });

  const orderedConversations = [];
  const seen = new Set();
  [...remoteConversations, ...localConversations].filter(Boolean).forEach((conversation) => {
    const sharedKey = getConversationSharedMergeKey(conversation);
    const id = (sharedKey && sharedKeyToConversationId.get(sharedKey)) || String(conversation.id || '');
    if (!id || seen.has(id)) return;
    const mergedConversation = conversationsById.get(id);
    if (mergedConversation) {
      orderedConversations.push(mergedConversation);
      seen.add(id);
    }
  });

  return orderedConversations;
}

function getMessageIdentityCandidates(...sources) {
  const candidates = [];
  sources.filter(Boolean).forEach((source) => {
    const raw = source.message || source.record || source.registro || source.data?.record || source.data?.registro || source;
    ['id', 'messageId', 'clientMutationId', 'clientMessageId', 'localId'].forEach((key) => {
      if (raw?.[key]) candidates.push(String(raw[key]));
    });
  });
  return [...new Set(candidates.filter(Boolean))];
}

function findExistingMessageByIdentity(messages = [], ...sources) {
  const identitySet = new Set(getMessageIdentityCandidates(...sources));
  if (!identitySet.size) return null;
  return messages.find((message) => getMessageIdentityCandidates(message).some((identity) => identitySet.has(identity))) || null;
}

function normalizeMessageReceiptStatus(status = '', fallback = 'backend_received') {
  const normalized = String(status || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (['read', 'seen', 'viewed', 'opened', 'open', 'visto', 'leido', 'leído', 'chat_opened', 'chat_abierto'].includes(normalized)) return 'read';
  if (['delivered', 'received', 'received_by_app', 'app_delivered', 'delivery', 'entregado', 'recibido_app', 'llego_app', 'llegó_app'].includes(normalized)) return 'delivered';
  if (['sent', 'synced', 'backend_received', 'received_by_backend', 'server_received', 'accepted', 'created', 'stored', 'guardado', 'enviado'].includes(normalized)) return 'backend_received';
  if (['pending', 'local', 'queued', 'uploading', 'creating_media_message', 'pending_media_retry', 'failed'].includes(normalized)) return normalized;
  return fallback;
}

function getMessageReceiptRank(status = '') {
  const normalized = normalizeMessageReceiptStatus(status, 'local');
  if (normalized === 'read') return 3;
  if (normalized === 'delivered') return 2;
  if (normalized === 'backend_received') return 1;
  return 0;
}

function getMessageReceiptStatus(message = {}) {
  return normalizeMessageReceiptStatus(
    message.receiptStatus
      || message.deliveryStatus
      || message.readStatus
      || message.status
      || '',
    'local'
  );
}

function setMessageReceiptStatus(message = {}, status = '', metadata = {}) {
  if (!message || message.type !== 'outgoing') return false;
  const nextStatus = normalizeMessageReceiptStatus(status, 'backend_received');
  const currentStatus = getMessageReceiptStatus(message);
  if (getMessageReceiptRank(nextStatus) < getMessageReceiptRank(currentStatus)) return false;

  message.receiptStatus = nextStatus;
  message.status = nextStatus;
  if (metadata.deliveredAt) message.deliveredAt = metadata.deliveredAt;
  if (metadata.readAt) message.readAt = metadata.readAt;
  if (metadata.backendReceivedAt) message.backendReceivedAt = metadata.backendReceivedAt;
  return true;
}

function getMessageReceiptLabel(status = '') {
  const normalized = normalizeMessageReceiptStatus(status, 'local');
  if (normalized === 'read') return 'Leído: el contacto abrió el chat';
  if (normalized === 'delivered') return 'Entregado: llegó a la app del contacto';
  if (normalized === 'backend_received') return 'Recibido por memoriaBACKEND';
  if (normalized === 'failed') return 'No enviado; toca para reintentar';
  if (normalized === 'pending' || normalized === 'queued') return 'Pendiente de sincronizar con memoriaBACKEND';
  return 'Preparando envío';
}

function createMessageReceiptElement(message = {}) {
  if (!message || message.type !== 'outgoing') return null;
  const receiptStatus = getMessageReceiptStatus(message);
  const receipt = document.createElement('span');
  receipt.className = `message-receipt message-receipt-${receiptStatus}`;
  receipt.textContent = ['delivered', 'read'].includes(receiptStatus) ? '✓✓' : '✓';
  receipt.dataset.receiptStatus = receiptStatus;
  receipt.setAttribute('aria-label', getMessageReceiptLabel(receiptStatus));
  receipt.title = getMessageReceiptLabel(receiptStatus);
  return receipt;
}

function updateExistingMessageFromRealtime(existingMessage, normalizedMessage) {
  if (!existingMessage || !normalizedMessage) return;
  existingMessage.id = normalizedMessage.id || existingMessage.id;
  existingMessage.clientMutationId = normalizedMessage.clientMutationId || existingMessage.clientMutationId || '';
  existingMessage.text = normalizedMessage.text || existingMessage.text || '';
  existingMessage.time = normalizedMessage.time || existingMessage.time || getCurrentTime();
  if (existingMessage.type === 'outgoing') {
    setMessageReceiptStatus(existingMessage, normalizedMessage.receiptStatus || normalizedMessage.status || 'backend_received', {
      deliveredAt: normalizedMessage.deliveredAt,
      readAt: normalizedMessage.readAt,
      backendReceivedAt: normalizedMessage.backendReceivedAt || normalizedMessage.createdAt
    });
  } else {
    existingMessage.status = normalizedMessage.status || existingMessage.status || 'synced';
  }
  existingMessage.senderUserId = normalizedMessage.senderUserId || existingMessage.senderUserId || '';
  existingMessage.senderUserEmail = normalizedMessage.senderUserEmail || existingMessage.senderUserEmail || '';
  existingMessage.senderName = normalizedMessage.senderName || existingMessage.senderName || '';
  existingMessage.recipientUserId = normalizedMessage.recipientUserId || existingMessage.recipientUserId || '';
  existingMessage.recipientUserEmail = normalizedMessage.recipientUserEmail || existingMessage.recipientUserEmail || '';
  existingMessage.deliveredAt = normalizedMessage.deliveredAt || existingMessage.deliveredAt || '';
  existingMessage.readAt = normalizedMessage.readAt || existingMessage.readAt || '';
  existingMessage.backendReceivedAt = normalizedMessage.backendReceivedAt || existingMessage.backendReceivedAt || '';
  existingMessage.attachmentName = normalizedMessage.attachmentName || existingMessage.attachmentName || '';
  existingMessage.attachmentSize = normalizedMessage.attachmentSize || existingMessage.attachmentSize || 0;
  existingMessage.attachmentMimeType = normalizedMessage.attachmentMimeType || existingMessage.attachmentMimeType || '';
  existingMessage.mediaId = normalizedMessage.mediaId || existingMessage.mediaId || '';
  existingMessage.mediaProvider = normalizedMessage.mediaProvider || existingMessage.mediaProvider || '';
  existingMessage.mediaKind = normalizedMessage.mediaKind || existingMessage.mediaKind || '';
  existingMessage.mediaName = normalizedMessage.mediaName || existingMessage.mediaName || existingMessage.attachmentName || '';
  existingMessage.mediaSizeBytes = normalizedMessage.mediaSizeBytes || existingMessage.mediaSizeBytes || existingMessage.attachmentSize || 0;
  existingMessage.mediaUrl = normalizedMessage.mediaUrl || existingMessage.mediaUrl || '';
  existingMessage.mediaPreviewDataUrl = normalizedMessage.mediaPreviewDataUrl || existingMessage.mediaPreviewDataUrl || '';
  existingMessage.mediaSyncStatus = normalizedMessage.mediaSyncStatus || existingMessage.mediaSyncStatus || normalizedMessage.status || '';
  existingMessage.createdAt = normalizedMessage.createdAt || existingMessage.createdAt || '';
  existingMessage.clientTime = normalizedMessage.clientTime || existingMessage.clientTime || existingMessage.createdAt || '';
  existingMessage.expiresAt = normalizedMessage.expiresAt || existingMessage.expiresAt || coerceChatEphemeralExpiresAtIso('', existingMessage.clientTime || existingMessage.createdAt || new Date().toISOString());
  existingMessage.ttlSeconds = Number(normalizedMessage.ttlSeconds || existingMessage.ttlSeconds || CHATER_EPHEMERAL_TTL_SECONDS) || CHATER_EPHEMERAL_TTL_SECONDS;
  if (existingMessage.type !== 'outgoing' || normalizedMessage.type === 'system') {
    existingMessage.type = normalizedMessage.type || existingMessage.type;
  }
}

function mergeMessagesByIdentity(primaryMessages = [], secondaryMessages = []) {
  const mergedMessages = [];

  [...primaryMessages, ...secondaryMessages].filter(Boolean).forEach((message) => {
    const existingMessage = findExistingMessageByIdentity(mergedMessages, message);
    if (existingMessage) {
      updateExistingMessageFromRealtime(existingMessage, message);
      return;
    }
    mergedMessages.push(normalizeChatMessageEphemeralFields({ ...message }));
  });

  return normalizeAndPruneChatMessages(mergedMessages);
}


function getFirstArrayEntry(value) {
  if (!Array.isArray(value)) return null;
  return value.find((item) => item !== undefined && item !== null && item !== '') || null;
}

function getFirstObjectCandidate(...candidates) {
  return candidates.find((candidate) => candidate && typeof candidate === 'object' && !Array.isArray(candidate)) || {};
}

function getFirstIdCandidate(...candidates) {
  for (const candidate of candidates) {
    if (candidate === undefined || candidate === null || candidate === '') continue;
    if (typeof candidate === 'object') {
      const objectId = getFirstIdCandidate(candidate.mediaId, candidate.fileId, candidate.assetId, candidate.id, candidate.value);
      if (objectId) return objectId;
      continue;
    }
    const id = String(candidate).trim();
    if (id) return id;
  }
  return '';
}

function getFirstMediaObject(raw = {}) {
  return getFirstObjectCandidate(
    raw.media,
    raw.file,
    raw.archivo,
    raw.asset,
    raw.image,
    raw.video,
    raw.attachment,
    raw.adjunto,
    getFirstArrayEntry(raw.attachments),
    getFirstArrayEntry(raw.adjuntos),
    getFirstArrayEntry(raw.archivos),
    getFirstArrayEntry(raw.files),
    getFirstArrayEntry(raw.mediaItems),
    getFirstArrayEntry(raw.medias)
  );
}

function readMediaValue(media = {}, keys = []) {
  if (!media || typeof media !== 'object') return '';
  const sources = [media, media.media, media.file, media.archivo, media.asset, media.metadata]
    .filter((item) => item && typeof item === 'object' && !Array.isArray(item));

  for (const source of sources) {
    for (const key of keys) {
      const value = source?.[key];
      if (value !== undefined && value !== null && value !== '') return value;
    }
  }

  return '';
}

function normalizeConversationFromApi(raw = {}) {
  const metadata = raw.metadata && typeof raw.metadata === 'object' ? raw.metadata : {};
  const archiveChangedAt = raw.archiveChangedAt
    || raw.archiveUpdatedAt
    || raw.archivedAt
    || raw.restoredAt
    || metadata.archiveChangedAt
    || metadata.archiveUpdatedAt
    || metadata.archivedAt
    || metadata.restoredAt
    || '';
  const archiveClientMutationId = raw.archiveClientMutationId
    || raw.archiveMutationId
    || raw.clientMutationId
    || raw.idempotencyKey
    || metadata.archiveClientMutationId
    || metadata.archiveMutationId
    || metadata.clientMutationId
    || metadata.idempotencyKey
    || '';
  const deleteChangedAt = raw.deleteChangedAt
    || raw.deleteUpdatedAt
    || raw.deletedAt
    || raw.restoredAt
    || metadata.deleteChangedAt
    || metadata.deleteUpdatedAt
    || metadata.deletedAt
    || metadata.restoredAt
    || '';
  const deleteClientMutationId = raw.deleteClientMutationId
    || raw.deleteMutationId
    || metadata.deleteClientMutationId
    || metadata.deleteMutationId
    || '';
  const blockChangedAt = raw.blockChangedAt
    || raw.blockUpdatedAt
    || raw.blockedAt
    || raw.unblockedAt
    || metadata.blockChangedAt
    || metadata.blockUpdatedAt
    || metadata.blockedAt
    || metadata.unblockedAt
    || '';
  const blockClientMutationId = raw.blockClientMutationId
    || raw.blockMutationId
    || metadata.blockClientMutationId
    || metadata.blockMutationId
    || '';
  const participants = ensureCurrentUserInLifecycleParticipants(normalizeConversationParticipantsForApi(
    raw.participants || raw.participantList || raw.members || metadata.participants || metadata.participantList,
    raw.contactEmail || raw.email || metadata.contactEmail || metadata.email,
    raw.displayName || raw.name || metadata.displayName || metadata.name
  ));
  const lifecycle = buildConversationSharedLifecycleMetadata({
    ...raw,
    metadata,
    participants,
    email: raw.email || metadata.email || '',
    contactEmail: raw.contactEmail || metadata.contactEmail || '',
    name: raw.name || metadata.name || '',
    displayName: raw.displayName || metadata.displayName || '',
    type: raw.type || metadata.type || '',
    conversationType: raw.conversationType || metadata.conversationType || '',
    participantCount: raw.participantCount || metadata.participantCount || '',
    sharedConversationKey: raw.sharedConversationKey || metadata.sharedConversationKey || '',
    redisConversationKey: raw.redisConversationKey || metadata.redisConversationKey || '',
    redisChatKey: raw.redisChatKey || metadata.redisChatKey || ''
  });
  const archivedForCurrentUser = resolveConversationArchivedForCurrentUser(raw, metadata);
  const deletedForCurrentUser = resolveConversationDeletedForCurrentUser(raw, metadata);
  const deletionLifecycle = buildRealtimeDeletionLifecycleStorage(raw, metadata, raw);
  const blocked = coerceFirstBooleanFlag([raw.blocked, raw.isBlocked, metadata.blocked, metadata.isBlocked], false);
  const participant = getConversationDisplayParticipant(participants);
  const selfEmail = normalizeStorageIdentity(getSessionEmail());
  const rawEmail = normalizeStorageIdentity(raw.contactEmail || raw.email || metadata.contactEmail || metadata.email || '');
  const email = rawEmail && rawEmail !== selfEmail ? rawEmail : (participant?.email || rawEmail || '');
  const name = raw.displayName || raw.name || metadata.displayName || metadata.name || raw.title || participant?.displayName || participant?.name || email || 'Chat sin nombre';
  const hasEmbeddedMessages = Array.isArray(raw.messages) && raw.messages.length > 0;
  const messages = hasEmbeddedMessages ? raw.messages.map(normalizeMessageFromApi) : [];
  if (!messages.length && raw.lastMessage) {
    messages.push(normalizeMessageFromApi(raw.lastMessage));
  }

  return {
    id: String(raw.id || raw.chatId || raw.conversationId || `chat-${email || Date.now()}`),
    name,
    email,
    contactEmail: email,
    contactUserId: normalizeBackendUserId(raw.contactUserId || raw.remoteUserId || metadata.contactUserId || metadata.remoteUserId || participant?.userId || ''),
    avatar: raw.avatar || getInitials(name),
    avatarImage: readProfileAvatarCandidate(raw) || readProfileAvatarCandidate(participant) || readProfileAvatarCandidate(metadata),
    status: raw.statusLabel || raw.status || raw.presence || 'Sincronizado',
    section: 'chats',
    archived: archivedForCurrentUser,
    archiveChangedAt,
    archiveClientMutationId,
    archiveLocalMutationId: raw.archiveLocalMutationId || '',
    archiveLocalChangedAt: raw.archiveLocalChangedAt || '',
    archiveDesiredArchived: Object.prototype.hasOwnProperty.call(raw, 'archiveDesiredArchived')
      ? coerceBooleanFlag(raw.archiveDesiredArchived, archivedForCurrentUser)
      : archivedForCurrentUser,
    updatedAt: raw.updatedAt || raw.modifiedAt || metadata.updatedAt || metadata.modifiedAt || '',
    lastActivityAt: raw.lastActivityAt || metadata.lastActivityAt || '',
    pinned: Boolean(raw.pinned || raw.isPinned),
    deleted: deletedForCurrentUser,
    deleteChangedAt,
    deleteClientMutationId,
    deleteLocalMutationId: raw.deleteLocalMutationId || '',
    deleteLocalChangedAt: raw.deleteLocalChangedAt || '',
    deleteDesiredDeleted: Object.prototype.hasOwnProperty.call(raw, 'deleteDesiredDeleted')
      ? coerceBooleanFlag(raw.deleteDesiredDeleted, deletedForCurrentUser)
      : deletedForCurrentUser,
    deleteSyncStatus: raw.deleteSyncStatus || '',
    deleteSyncedAt: raw.deleteSyncedAt || '',
    deletionRegistry: deletionLifecycle.deletionRegistry || raw.deletionRegistry || metadata.deletionRegistry || null,
    localDeletionRegistry: deletedForCurrentUser ? (deletionLifecycle.localDeletionRegistry || raw.localDeletionRegistry || metadata.localDeletionRegistry || null) : null,
    participantDeletionRegistry: deletionLifecycle.participantDeletionRegistry || raw.participantDeletionRegistry || metadata.participantDeletionRegistry || null,
    deletedParticipants: deletionLifecycle.deletedParticipants?.length ? deletionLifecycle.deletedParticipants : (raw.deletedParticipants || metadata.deletedParticipants || []),
    deletedParticipantIdentityKeys: deletionLifecycle.deletedParticipantIdentityKeys?.length ? deletionLifecycle.deletedParticipantIdentityKeys : (raw.deletedParticipantIdentityKeys || metadata.deletedParticipantIdentityKeys || []),
    deletionCounterInitial: deletionLifecycle.deletionCounterInitial || raw.deletionCounterInitial || metadata.deletionCounterInitial || '',
    deletionCounterRemaining: deletionLifecycle.deletionCounterRemaining ?? raw.deletionCounterRemaining ?? metadata.deletionCounterRemaining ?? '',
    remainingParticipantCount: deletionLifecycle.remainingParticipantCount ?? raw.remainingParticipantCount ?? metadata.remainingParticipantCount ?? '',
    muted: Boolean(raw.muted || raw.isMuted || raw.mutedUntil),
    mutedUntil: raw.mutedUntil || '',
    restricted: Boolean(raw.restricted || raw.isRestricted || raw.settings?.restricted),
    favorite: Boolean(raw.favorite || raw.isFavorite),
    customListName: String(raw.customListName || raw.listName || raw.chatListName || raw.settings?.customListName || '').trim(),
    settings: raw.settings && typeof raw.settings === 'object' ? raw.settings : {},
    shortcutRequestedAt: raw.shortcutRequestedAt || '',
    shortcutSyncStatus: raw.shortcutSyncStatus || '',
    actionSyncStatus: raw.actionSyncStatus || '',
    actionSyncedAt: raw.actionSyncedAt || '',
    participants,
    pinSyncStatus: raw.pinSyncStatus || '',
    pinSyncedAt: raw.pinSyncedAt || '',
    archiveSyncStatus: raw.archiveSyncStatus || '',
    archiveSyncedAt: raw.archiveSyncedAt || '',
    blocked,
    blockChangedAt,
    blockClientMutationId,
    blockLocalMutationId: raw.blockLocalMutationId || '',
    blockLocalChangedAt: raw.blockLocalChangedAt || '',
    blockDesiredBlocked: Object.prototype.hasOwnProperty.call(raw, 'blockDesiredBlocked')
      ? coerceBooleanFlag(raw.blockDesiredBlocked, blocked)
      : blocked,
    blockSyncStatus: raw.blockSyncStatus || '',
    blockSyncedAt: raw.blockSyncedAt || '',
    reportSyncStatus: raw.reportSyncStatus || '',
    reportSyncedAt: raw.reportSyncedAt || '',
    lastReportReason: raw.lastReportReason || '',
    unread: Number(raw.unread || raw.unreadCount || 0),
    messages,
    messagesHydrated: Boolean(hasEmbeddedMessages || raw.messagesHydrated || raw.historyLoaded),
    messagesHistoryCursor: raw.messagesCursor || raw.nextCursor || raw.nextMessagesCursor || '',
    metadata: {
      ...metadata,
      ...lifecycle
    },
    sharedConversationKey: lifecycle.sharedConversationKey,
    redisConversationKey: lifecycle.redisConversationKey,
    redisChatKey: lifecycle.redisChatKey,
    participantCount: lifecycle.participantCount,
    reuseExistingRedisChat: true,
    deleteFinalOnlyWhenAllParticipantsDeleted: true,
    deletedForCurrentUser,
    hiddenForCurrentUser: deletedForCurrentUser
  };
}

function normalizeMessageFromApi(raw = {}) {
  const metadata = raw.metadata && typeof raw.metadata === 'object' ? raw.metadata : {};
  const mediaObject = getFirstMediaObject(raw);
  const sender = raw.sender && typeof raw.sender === 'object' ? raw.sender : {};
  const recipient = raw.recipient && typeof raw.recipient === 'object' ? raw.recipient : {};
  const senderEmail = normalizeStorageIdentity(
    raw.senderUserEmail
      || raw.senderEmail
      || raw.fromEmail
      || raw.authorEmail
      || metadata.senderUserEmail
      || metadata.senderEmail
      || metadata.fromEmail
      || sender.email
      || sender.userEmail
      || ''
  );
  const senderUserId = normalizeBackendUserId(
    raw.senderUserId
      || raw.fromUserId
      || raw.authorUserId
      || metadata.senderUserId
      || metadata.fromUserId
      || sender.userId
      || sender.id
      || ''
  );
  const selfEmail = normalizeStorageIdentity(getSessionEmail());
  const selfUserId = normalizeBackendUserId(getSessionUserId()) || normalizeBackendUserId(getCurrentUserIdentifier());
  const hasSenderIdentity = Boolean(senderEmail || senderUserId);
  const senderIsSelf = Boolean(
    (senderEmail && selfEmail && senderEmail === selfEmail)
      || (senderUserId && selfUserId && senderUserId === selfUserId)
  );
  const explicitOutgoing = raw.type === 'outgoing' || raw.direction === 'outgoing' || raw.isMine || raw.sender?.isMe;
  const isOutgoing = senderIsSelf || (!hasSenderIdentity && explicitOutgoing);
  const createdAt = raw.createdAt || raw.clientTime || raw.time || '';
  const mediaId = getFirstIdCandidate(
    raw.mediaId,
    raw.fileId,
    raw.assetId,
    readMediaValue(mediaObject, ['mediaId', 'fileId', 'assetId', 'id']),
    getFirstArrayEntry(raw.mediaIds),
    getFirstArrayEntry(raw.media_ids),
    getFirstArrayEntry(raw.fileIds),
    getFirstArrayEntry(raw.archivoIds)
  );
  const attachmentName = raw.attachmentName
    || raw.filename
    || raw.fileName
    || readMediaValue(mediaObject, ['filename', 'fileName', 'name', 'nombre', 'originalFilename', 'originalName'])
    || '';
  const attachmentSize = Number(raw.attachmentSize
    || raw.sizeBytes
    || raw.size
    || readMediaValue(mediaObject, ['sizeBytes', 'size', 'bytes', 'pesoBytes'])
    || 0);
  const attachmentMimeType = raw.attachmentMimeType
    || raw.mediaMimeType
    || raw.mimeType
    || readMediaValue(mediaObject, ['mimeType', 'type', 'contentType'])
    || '';
  const mediaUrl = raw.mediaUrl
    || raw.publicUrl
    || raw.readUrl
    || readMediaValue(mediaObject, ['mediaUrl', 'url', 'publicUrl', 'readUrl', 'downloadUrl', 'signedUrl', 'src'])
    || '';
  const mediaKind = raw.mediaKind || readMediaValue(mediaObject, ['kind', 'mediaKind', 'tipo', 'type']) || '';

  return {
    id: String(raw.id || raw.messageId || raw.clientMutationId || generateClientMutationId()),
    clientMutationId: raw.clientMutationId || raw.clientMessageId || '',
    type: raw.type === 'system' ? 'system' : (isOutgoing ? 'outgoing' : 'incoming'),
    text: String(raw.text || raw.body || raw.caption || ''),
    time: raw.time || formatEventTime(createdAt),
    status: isOutgoing ? normalizeMessageReceiptStatus(raw.receiptStatus || raw.deliveryStatus || raw.readStatus || raw.status || 'backend_received', 'backend_received') : (raw.status || 'synced'),
    receiptStatus: isOutgoing ? normalizeMessageReceiptStatus(raw.receiptStatus || raw.deliveryStatus || raw.readStatus || raw.status || 'backend_received', 'backend_received') : '',
    deliveryStatus: raw.deliveryStatus || '',
    readStatus: raw.readStatus || '',
    senderUserId,
    senderUserEmail: senderEmail,
    senderName: raw.senderName || metadata.senderName || sender.name || sender.displayName || '',
    recipientUserId: normalizeBackendUserId(raw.recipientUserId || raw.toUserId || metadata.recipientUserId || metadata.toUserId || recipient.userId || recipient.id || ''),
    recipientUserEmail: normalizeStorageIdentity(raw.recipientUserEmail || raw.recipientEmail || raw.toEmail || metadata.recipientUserEmail || metadata.recipientEmail || metadata.toEmail || recipient.email || recipient.userEmail || ''),
    deliveredAt: raw.deliveredAt || '',
    readAt: raw.readAt || '',
    backendReceivedAt: raw.backendReceivedAt || metadata.backendReceivedAt || raw.createdAt || '',
    attachmentName,
    attachmentSize,
    attachmentMimeType,
    mediaId,
    mediaProvider: raw.provider || raw.mediaProvider || readMediaValue(mediaObject, ['provider', 'storageProvider']) || '',
    mediaKind,
    mediaName: raw.mediaName || attachmentName,
    mediaSizeBytes: Number(raw.mediaSizeBytes || attachmentSize || 0),
    mediaUrl,
    mediaPreviewDataUrl: raw.mediaPreviewDataUrl || '',
    mediaSyncStatus: raw.mediaSyncStatus || raw.status || '',
    createdAt,
    clientTime: raw.clientTime || createdAt,
    expiresAt: coerceChatEphemeralExpiresAtIso(raw.expiresAt || raw.expiryAt || raw.expireAt || metadata.expiresAt || '', raw.clientTime || createdAt || new Date().toISOString()),
    ttlSeconds: Number(raw.ttlSeconds || raw.ephemeralTtlSeconds || metadata.ephemeralTtlSeconds || CHATER_EPHEMERAL_TTL_SECONDS) || CHATER_EPHEMERAL_TTL_SECONDS
  };
}

function normalizeStateFromApi(raw = {}) {
  const owner = raw.owner || raw.user || raw.contact || {};
  const chat = raw.chat || raw.conversation || owner.chat || owner.conversation || {};
  const mediaObject = getFirstMediaObject(raw);
  const contactEmail = normalizeStorageIdentity(
    raw.contactEmail
    || raw.email
    || raw.ownerEmail
    || raw.userEmail
    || owner.email
    || owner.contactEmail
    || chat.email
    || ''
  );
  const conversationId = String(raw.conversationId || raw.chatId || chat.id || chat.chatId || chat.conversationId || owner.conversationId || owner.chatId || '').trim();
  const name = raw.name || raw.displayName || owner.displayName || chat.displayName || contactEmail || 'Estado';
  const mediaId = getFirstIdCandidate(
    raw.mediaId,
    raw.fileId,
    raw.assetId,
    readMediaValue(mediaObject, ['mediaId', 'fileId', 'assetId', 'id']),
    getFirstArrayEntry(raw.mediaIds),
    getFirstArrayEntry(raw.media_ids),
    getFirstArrayEntry(raw.fileIds),
    getFirstArrayEntry(raw.archivoIds)
  );
  const mediaMimeType = raw.mediaMimeType || raw.mimeType || readMediaValue(mediaObject, ['mimeType', 'type', 'contentType']) || '';
  const mediaName = raw.mediaName || readMediaValue(mediaObject, ['filename', 'fileName', 'name', 'nombre', 'originalFilename']) || '';
  const mediaUrl = raw.mediaUrl || raw.publicUrl || readMediaValue(mediaObject, ['mediaUrl', 'url', 'publicUrl', 'readUrl', 'downloadUrl', 'signedUrl', 'src']) || '';

  return {
    id: String(raw.id || raw.stateId || `estado-${Date.now()}`),
    conversationId,
    contactEmail,
    name,
    preview: raw.preview || raw.text || raw.caption || 'Estado disponible',
    avatar: raw.avatar || getInitials(name),
    avatarImage: normalizeAssetImagePath(raw.avatarImage || raw.avatarAsset || owner.avatarImage || owner.avatarAsset || chat.avatarImage || chat.avatarAsset),
    mediaId,
    mediaUrl,
    mediaName,
    mediaMimeType,
    mediaSizeBytes: Number(raw.mediaSizeBytes || raw.sizeBytes || readMediaValue(mediaObject, ['sizeBytes', 'size', 'bytes']) || 0),
    mediaKind: raw.mediaKind || readMediaValue(mediaObject, ['kind', 'mediaKind', 'tipo']) || getStatusMediaKind(mediaMimeType),
    mediaSyncStatus: raw.mediaSyncStatus || '',
    expiresAt: raw.expiresIn || raw.expiresAtLabel || '24 h',
    expiresAtIso: raw.expiresAtIso || raw.expiresAtAt || raw.expiryAt || raw.expireAt || raw.endsAt || raw.expiresAt || '',
    expiresAtAt: raw.expiresAtAt || raw.expiresAtIso || raw.expiryAt || raw.expireAt || raw.endsAt || raw.expiresAt || '',
    viewed: Boolean(raw.viewed || raw.seen),
    promotionRequested: Boolean(raw.promotionRequested || raw.promotion || raw.promotionStatus),
    promotionStatus: raw.promotionStatus || raw.promotion?.status || '',
    promotionId: raw.promotionId || raw.promotion?.id || '',
    createdAt: raw.createdAt || raw.publishedAt || new Date().toISOString()
  };
}

function normalizeCallFromApi(raw = {}) {
  const name = raw.name || raw.displayName || raw.contact?.displayName || raw.contact?.email || 'Contacto';
  const scheduledAt = raw.scheduledAt || raw.startsAt || raw.startTime || '';
  const type = raw.type === 'video' ? 'video' : 'voice';
  const isScheduled = raw.status === 'scheduled' || raw.kind === 'scheduled' || Boolean(scheduledAt);
  return {
    id: String(raw.id || raw.callId || `call-${Date.now()}`),
    conversationId: String(raw.conversationId || raw.chatId || ''),
    email: normalizeStorageIdentity(raw.email || raw.contactEmail || raw.contact?.email || ''),
    name,
    preview: raw.preview || (isScheduled ? `${type === 'video' ? 'Videollamada' : 'Llamada de voz'} programada para ${formatScheduledCallTime(scheduledAt)}` : `${type === 'video' ? 'Videollamada' : 'Llamada de voz'} ${raw.direction || ''}`.trim()),
    type,
    status: isScheduled ? 'scheduled' : (raw.status || 'completed'),
    scheduledAt,
    avatar: raw.avatar || getInitials(name),
    avatarImage: normalizeAssetImagePath(raw.avatarImage || raw.avatarAsset || raw.contact?.avatarImage || raw.contact?.avatarAsset)
  };
}

function normalizeAssetImagePath(value = '') {
  const rawPath = String(value || '').trim().replace(/\\/g, '/');
  if (!rawPath) return '';

  if (/^https?:\/\//i.test(rawPath)) {
    try {
      const url = new URL(rawPath);
      if (!['http:', 'https:'].includes(url.protocol)) return '';
      return url.toString();
    } catch (error) {
      return '';
    }
  }

  const pathWithoutQuery = rawPath.split(/[?#]/)[0].replace(/^\/+/, '');
  const fileName = pathWithoutQuery.startsWith('assets/')
    ? pathWithoutQuery.slice('assets/'.length).split('/').pop()
    : pathWithoutQuery.split('/').pop();

  if (!fileName || fileName.includes('..') || !/^[a-z0-9._-]+\.png$/i.test(fileName)) return '';
  return `assets/${fileName}`;
}

function getEffectiveRealtimeUrl() {
  const configuredUrl = String(CHATER_CONFIG.realtimeUrl || '').trim();
  if (configuredUrl) return configuredUrl;
  if (!CHATER_CONFIG.backendBaseUrl) return '';
  return buildApiUrl('/api/v1/streme/eventos', { siteScoped: true });
}


function getStremeSessionTokenForEventSource() {
  return String(
    window.memoriaBACKEND?.tk
    || window.platformAuthGate?.getSessionToken?.()
    || ''
  ).trim();
}

function buildStremeUrl(transport = resolveStremeTransport(), channelOverride = '', channelsOverride = []) {
  const effectiveRealtimeUrl = getEffectiveRealtimeUrl();
  try {
    const url = new URL(effectiveRealtimeUrl, window.location.origin);
    const lastEventId = readStorageItem(getStremeLastEventStorageKey(), '');
    const lastEventIdsByChannel = serializeStremeLastEventIdsForChannels(channelsOverride);

    if (transport === 'websocket') {
      if (url.protocol === 'http:') url.protocol = 'ws:';
      if (url.protocol === 'https:') url.protocol = 'wss:';
    }

    if (transport === 'sse') {
      if (url.protocol === 'ws:') url.protocol = 'http:';
      if (url.protocol === 'wss:') url.protocol = 'https:';
    }

    applyStremeUrlScopeParams(url, channelOverride, channelsOverride);

    if (lastEventIdsByChannel) url.searchParams.set('lastEventIds', lastEventIdsByChannel);
    if (lastEventId) url.searchParams.set('lastEventId', lastEventId);
    const stremeSessionToken = getStremeSessionTokenForEventSource();
    if (transport === 'sse' && stremeSessionToken && !url.searchParams.has('token')) {
      url.searchParams.set('token', stremeSessionToken);
    }
    return url.toString();
  } catch (error) {
    return effectiveRealtimeUrl;
  }
}

function applyStremeUrlScopeParams(url, channelOverride = '', channelsOverride = []) {
  if (!url?.searchParams) return;

  const siteId = getMemoriaSiteId();
  if (siteId && !url.searchParams.has('s')) {
    url.searchParams.set('s', siteId);
  }

  const multiplexChannels = normalizeStremeChannelList(channelsOverride);
  const hasChannelParam = url.searchParams.has('canal')
    || url.searchParams.has('channel')
    || url.searchParams.has('canales')
    || url.searchParams.has('channels');

  if (!hasChannelParam) {
    if (multiplexChannels.length > 1) {
      url.searchParams.set('canales', multiplexChannels.join(','));
    } else {
      url.searchParams.set('canal', multiplexChannels[0] || sanitizeLocalStremeChannel(channelOverride, '') || getDefaultStremeChannel());
    }
  }

  if (!url.searchParams.has('clientId') && !url.searchParams.has('clienteId')) {
    url.searchParams.set('clientId', getDeviceId());
  }
}

function resolveStremeTransport() {
  const configuredTransport = String(CHATER_CONFIG.realtimeTransport || 'auto').trim().toLowerCase();
  const realtimeUrl = String(getEffectiveRealtimeUrl() || '').trim().toLowerCase();

  if (!realtimeUrl) return 'none';
  if (['websocket', 'ws'].includes(configuredTransport) && CHATER_CONFIG.realtimeUrl) return 'websocket';
  if (['sse', 'eventsource', 'event-source'].includes(configuredTransport)) return 'sse';
  if (CHATER_CONFIG.realtimeUrl && (realtimeUrl.startsWith('ws://') || realtimeUrl.startsWith('wss://'))) return 'websocket';
  return 'sse';
}

function getStremeTransportLabel() {
  const transport = stremeActiveTransport !== 'none' ? stremeActiveTransport : resolveStremeTransport();
  if (transport === 'websocket') return 'WebSocket';
  if (transport === 'sse') return 'SSE / EventSource';
  return 'Sin URL configurada';
}

function getStremeConnectionStatusLabel() {
  if (!getEffectiveRealtimeUrl()) return 'Sin URL configurada';
  if (typeof WebSocket !== 'undefined' && stremeSocket?.readyState === WebSocket.OPEN) return 'Conectado por WebSocket';
  const openSseCount = typeof EventSource !== 'undefined'
    ? Array.from(stremeEventSourcesByChannel.values()).filter((source) => source?.readyState === EventSource.OPEN).length
    : 0;
  if (openSseCount > 1) return `Conectado por SSE · ${openSseCount} canales`;
  if (openSseCount === 1 || (typeof EventSource !== 'undefined' && stremeEventSource?.readyState === EventSource.OPEN)) return 'Conectado por SSE';
  return `Configurado por ${getStremeTransportLabel()}, esperando conexión`;
}

function connectStremeRealtime() {
  if (!getSessionEmail()) return;
  connectChatRealtimeStream();
  if (!getEffectiveRealtimeUrl()) return;

  stremeManualDisconnect = false;
  stremeSessionGuard = captureSessionGuard();
  const transport = resolveStremeTransport();
  stremeActiveTransport = transport;

  if (transport === 'websocket') {
    if (!stremeSocket) connectStremeWebSocket();
    return;
  }

  if (transport === 'sse') {
    connectStremeMultiplexEventSource(getDesiredStremeSubscriptionChannels());
  }
}

function connectStremeWebSocket() {
  const connectionGuard = stremeSessionGuard || captureSessionGuard();

  if (typeof WebSocket === 'undefined') {
    if (!isSessionGuardCurrent(connectionGuard)) return;
    stremeActiveTransport = 'sse';
    connectStremeEventSource();
    return;
  }

  try {
    stremeSocket = new WebSocket(buildStremeUrl('websocket'));
    stremeSocket.addEventListener('open', () => {
      if (!isSessionGuardCurrent(connectionGuard)) return;
      stremeReconnectAttempts = 0;
      sendPresenceHeartbeat('online');
      if (activeConversationId) {
        sendStremeEvent({ type: 'chat.opened', chatId: activeConversationId });
      }
    });
    stremeSocket.addEventListener('message', (event) => {
      if (!isSessionGuardCurrent(connectionGuard)) return;
      handleRawStremeMessage(event.data);
    });
    stremeSocket.addEventListener('close', () => {
      if (!isSessionGuardCurrent(connectionGuard)) return;
      stremeSocket = null;
      if (!stremeManualDisconnect) scheduleStremeReconnect();
    });
    stremeSocket.addEventListener('error', () => {
      if (!isSessionGuardCurrent(connectionGuard)) return;
      stremeSocket?.close();
    });
  } catch (error) {
    if (!isSessionGuardCurrent(connectionGuard)) return;
    stremeSocket = null;
    scheduleStremeReconnect();
  }
}

function closeStremeSseSourcesExcept(sourceKeyToKeep = '') {
  stremeEventSourcesByChannel.forEach((source, sourceKey) => {
    if (sourceKey === sourceKeyToKeep) return;
    source?.close?.();
    stremeEventSourcesByChannel.delete(sourceKey);
    if (stremeEventSource === source) stremeEventSource = null;
  });
  if (!stremeEventSource && sourceKeyToKeep) {
    stremeEventSource = stremeEventSourcesByChannel.get(sourceKeyToKeep) || null;
  }
}

function connectStremeMultiplexEventSource(channels = []) {
  const connectionGuard = stremeSessionGuard || captureSessionGuard();
  const normalizedChannels = normalizeStremeChannelList(channels, getDefaultStremeChannel());
  const sourceKey = getStremeMultiplexSourceKey(normalizedChannels);
  if (!sourceKey) return;

  if (typeof EventSource === 'undefined') {
    if (isSessionGuardCurrent(connectionGuard)) {
      console.warn('Este navegador no soporta EventSource para streme.');
      scheduleStremeReconnect('', normalizedChannels);
    }
    return;
  }

  const existingSource = stremeEventSourcesByChannel.get(sourceKey);
  if (existingSource && existingSource.readyState !== EventSource.CLOSED) {
    closeStremeSseSourcesExcept(sourceKey);
    stremeActiveSseChannelsKey = sourceKey;
    stremeEventSource = existingSource;
    return;
  }

  closeStremeSseSourcesExcept('');

  try {
    const source = new EventSource(buildStremeUrl('sse', '', normalizedChannels), { withCredentials: true });
    stremeEventSourcesByChannel.set(sourceKey, source);
    stremeEventSource = source;
    stremeActiveSseChannelsKey = sourceKey;

    source.addEventListener('open', () => {
      if (!isSessionGuardCurrent(connectionGuard)) return;
      stremeReconnectAttempts = 0;
      sendPresenceHeartbeat('online');
      if (normalizedChannels.includes(getCurrentUserStremeInboxChannel())) {
        syncRealtimeConversationInboxFromBackend({ reason: 'streme-multiplex-open' });
      }
      if (activeConversationId) {
        sendStremeEvent({
          type: 'chat.opened',
          chatId: activeConversationId,
          channels: normalizedChannels
        });
      }
    });

    const handleSsePayload = (event) => {
      if (!isSessionGuardCurrent(connectionGuard)) return;
      if (event.data) {
        handleRawStremeMessage(event.data, {
          source: 'sse-multiplex-event',
          channels: normalizedChannels.join(','),
          lastEventId: event.lastEventId || ''
        });
      }
    };

    const handleSseControl = (event) => {
      if (!isSessionGuardCurrent(connectionGuard)) return;
      if (event.lastEventId) {
        persistStremeLastEventId(event.lastEventId, { source: 'sse-multiplex-control', channels: normalizedChannels.join(',') });
      }
    };

    source.addEventListener('message', handleSsePayload);
    source.addEventListener('streme-event', handleSsePayload);
    source.addEventListener('streme-message', handleSsePayload);
    source.addEventListener('streme-ready', handleSseControl);
    source.addEventListener('streme-heartbeat', handleSseControl);
    source.addEventListener('error', () => {
      if (!isSessionGuardCurrent(connectionGuard)) return;
      source.close();
      stremeEventSourcesByChannel.delete(sourceKey);
      if (stremeEventSource === source) stremeEventSource = stremeEventSourcesByChannel.values().next().value || null;
      if (stremeActiveSseChannelsKey === sourceKey) stremeActiveSseChannelsKey = '';
      if (!stremeManualDisconnect) scheduleStremeReconnect('', normalizedChannels);
    });
  } catch (error) {
    if (!isSessionGuardCurrent(connectionGuard)) return;
    stremeEventSourcesByChannel.delete(sourceKey);
    if (stremeActiveSseChannelsKey === sourceKey) stremeActiveSseChannelsKey = '';
    if (stremeEventSource?.readyState === EventSource.CLOSED) stremeEventSource = stremeEventSourcesByChannel.values().next().value || null;
    scheduleStremeReconnect('', normalizedChannels);
  }
}

function connectStremeEventSource(channelOverride = '') {
  const connectionGuard = stremeSessionGuard || captureSessionGuard();
  const channel = sanitizeLocalStremeChannel(channelOverride, '') || getDefaultStremeChannel();
  if (!channel) return;

  if (typeof EventSource === 'undefined') {
    if (isSessionGuardCurrent(connectionGuard)) {
      console.warn('Este navegador no soporta EventSource para streme.');
      scheduleStremeReconnect();
    }
    return;
  }

  const existingSource = stremeEventSourcesByChannel.get(channel);
  if (existingSource && existingSource.readyState !== EventSource.CLOSED) return;

  try {
    const source = new EventSource(buildStremeUrl('sse', channel), { withCredentials: true });
    stremeEventSourcesByChannel.set(channel, source);
    if (!stremeEventSource) stremeEventSource = source;

    source.addEventListener('open', () => {
      if (!isSessionGuardCurrent(connectionGuard)) return;
      stremeReconnectAttempts = 0;
      sendPresenceHeartbeat('online');
      if (channel === getCurrentUserStremeInboxChannel()) {
        syncRealtimeConversationInboxFromBackend({ reason: 'streme-inbox-open' });
      }
      if (activeConversationId && channel === getConversationStremeChannel(activeConversationId)) {
        sendStremeEvent({ type: 'chat.opened', chatId: activeConversationId, channel });
      }
    });
    const handleSsePayload = (event) => {
      if (!isSessionGuardCurrent(connectionGuard)) return;
      if (event.data) {
        handleRawStremeMessage(event.data, { source: 'sse-event', channel, lastEventId: event.lastEventId || '' });
      }
    };

    const handleSseControl = (event) => {
      if (!isSessionGuardCurrent(connectionGuard)) return;
      if (event.lastEventId) {
        persistStremeLastEventId(event.lastEventId, { source: 'sse-control', channel });
      }
    };

    source.addEventListener('message', handleSsePayload);
    source.addEventListener('streme-event', handleSsePayload);
    source.addEventListener('streme-message', handleSsePayload);
    source.addEventListener('streme-ready', handleSseControl);
    source.addEventListener('streme-heartbeat', handleSseControl);
    source.addEventListener('error', () => {
      if (!isSessionGuardCurrent(connectionGuard)) return;
      source.close();
      stremeEventSourcesByChannel.delete(channel);
      if (stremeEventSource === source) stremeEventSource = stremeEventSourcesByChannel.values().next().value || null;
      if (!stremeManualDisconnect) scheduleStremeReconnect(channel);
    });
  } catch (error) {
    if (!isSessionGuardCurrent(connectionGuard)) return;
    stremeEventSourcesByChannel.delete(channel);
    if (stremeEventSource?.readyState === EventSource.CLOSED) stremeEventSource = stremeEventSourcesByChannel.values().next().value || null;
    scheduleStremeReconnect(channel);
  }
}

function pruneStremeConversationSubscriptions(activeChannel = '') {
  if (!stremeEventSourcesByChannel.size) return;
  const inboxChannel = getCurrentUserStremeInboxChannel();
  const defaultChannel = getDefaultStremeChannel();

  stremeEventSourcesByChannel.forEach((source, channel) => {
    const isCoreChannel = channel === activeChannel || channel === inboxChannel || channel === defaultChannel;
    if (isCoreChannel || !String(channel || '').startsWith('chater-conversacion-')) return;

    source?.close?.();
    stremeEventSourcesByChannel.delete(channel);
    if (stremeEventSource === source) {
      stremeEventSource = stremeEventSourcesByChannel.values().next().value || null;
    }
  });
}

function ensureStremeConversationSubscription(conversationId = '') {
  if (!CHATER_CONFIG.backendBaseUrl || !getSessionEmail() || resolveStremeTransport() !== 'sse') return;
  connectStremeMultiplexEventSource(getDesiredStremeSubscriptionChannels(conversationId));
}

function handleRawStremeMessage(rawMessage, cursorMetadata = {}) {
  if (stremeSessionGuard && !isSessionGuardCurrent(stremeSessionGuard)) return;
  try {
    const parsedMessage = JSON.parse(rawMessage);
    persistStremeCursorFromParsedPayload(parsedMessage, { source: 'streme-payload', ...(cursorMetadata || {}) });
    handleStremeEvent(parsedMessage);
  } catch (error) {
    console.warn('Evento streme inválido.', error);
  }
}

function normalizeStremeEventType(type = '') {
  const rawType = String(type || '').trim();
  const normalizedType = rawType.toLowerCase();
  const aliases = {
    'streme.message.created': 'message.created',
    'streme.message.updated': 'message.updated',
    'streme.message.deleted': 'message.deleted',
    'streme.message.delivered': 'message.delivered',
    'streme.message.received': 'message.delivered',
    'streme.message.read': 'message.read',
    'streme.message.seen': 'message.read',
    'streme.message.opened': 'message.read',
    'streme.receipt.delivered': 'message.delivered',
    'streme.receipt.read': 'message.read',
    'streme.typing.started': 'typing.started',
    'streme.typing.stopped': 'typing.stopped',
    'streme.typing.start': 'typing.start',
    'streme.typing.stop': 'typing.stop',
    'streme.presence.changed': 'presence.changed',
    'streme.call.incoming': 'call.incoming',
    'streme.call.updated': 'call.updated',
    'streme.state.created': 'state.created',
    'streme.state.updated': 'state.updated',
    'streme.state.deleted': 'state.deleted',
    'streme.status.created': 'state.created',
    'streme.status.updated': 'state.updated',
    'streme.status.deleted': 'state.deleted',
    'streme.conversation.created': 'conversation.created',
    'streme.conversation.updated': 'conversation.updated',
    'streme.conversation.deleted': 'conversation.deleted',
    'streme.conversation.archived': 'conversation.archived',
    'streme.conversation.restored': 'conversation.restored',
    'streme.conversation.pinned': 'conversation.updated',
    'streme.conversation.unpinned': 'conversation.updated',
    'streme.chat.created': 'conversation.created',
    'streme.chat.updated': 'conversation.updated',
    'streme.chat.deleted': 'conversation.deleted',
    'streme.chat.archived': 'conversation.archived',
    'streme.chat.restored': 'conversation.restored',
    'streme.chat.pinned': 'conversation.updated',
    'streme.chat.unpinned': 'conversation.updated',
    'streme.profile.updated': 'profile.updated',
    'streme.user.profile.updated': 'profile.updated',
    'streme.avatar.updated': 'profile.avatar.updated',
    'streme.profile.avatar.updated': 'profile.avatar.updated',
    'streme.app.version.changed': 'app.version.changed',
    'streme.static.version.changed': 'app.version.changed',
    'streme.static-site.updated': 'app.version.changed',
    'streme.chater.updated': 'app.version.changed',
    'streme.app.logo.updated': 'app.logo.updated',
    'streme.brand.logo.updated': 'app.logo.updated'
  };
  if (aliases[normalizedType]) return aliases[normalizedType];
  const directAliases = {
    'chat.created': 'conversation.created',
    'chat.updated': 'conversation.updated',
    'chat.deleted': 'conversation.deleted',
    'chat.archived': 'conversation.archived',
    'chat.restored': 'conversation.restored',
    'conversation.pinned': 'conversation.updated',
    'conversation.unpinned': 'conversation.updated',
    'chat.pinned': 'conversation.updated',
    'chat.unpinned': 'conversation.updated',
    'status.created': 'state.created',
    'status.updated': 'state.updated',
    'status.deleted': 'state.deleted',
    'user.profile.updated': 'profile.updated',
    'avatar.updated': 'profile.avatar.updated',
    'profile.avatar.updated': 'profile.avatar.updated',
    'static.version.changed': 'app.version.changed',
    'static-site.updated': 'app.version.changed',
    'chater.updated': 'app.version.changed',
    'brand.logo.updated': 'app.logo.updated'
  };
  if (directAliases[normalizedType]) return directAliases[normalizedType];
  if (normalizedType.startsWith('streme.') && normalizedType.split('.').length >= 3) {
    return rawType.slice('streme.'.length);
  }
  return rawType;
}

function normalizeStremeInboundPayload(payload = {}) {
  if (!payload || typeof payload !== 'object') return {};

  const wrappedData = payload.data && typeof payload.data === 'object' ? payload.data : {};
  const event = [payload.event, payload.message, wrappedData.event, wrappedData.message]
    .find((candidate) => candidate && typeof candidate === 'object') || payload;
  const explicitPayload = event.payload
    || event.datos
    || event.data
    || payload.payload
    || payload.datos
    || wrappedData.payload
    || wrappedData.datos
    || wrappedData.data;
  const fallbackData = Object.keys(wrappedData).length ? wrappedData : event;
  const payloadData = explicitPayload || fallbackData;
  const normalizedData = payloadData && typeof payloadData === 'object' ? payloadData : { value: payloadData };
  const rawType = event.type || event.tipo || payload.type || payload.tipo || normalizedData.type || normalizedData.tipo || '';
  const normalizedType = normalizeStremeEventType(rawType);

  return {
    ...payload,
    ...event,
    id: event.id || event.eventId || payload.id || payload.eventId || payload.lastEventId || '',
    eventId: event.eventId || event.id || payload.eventId || payload.id || payload.lastEventId || '',
    rawType,
    type: normalizedType,
    data: normalizedData
  };
}


function getEffectiveChatRealtimeUrl() {
  if (!CHATER_CONFIG.backendBaseUrl) return '';
  return buildApiUrl('/api/v1/chats/stream', { siteScoped: true });
}

function buildChatRealtimeUrl() {
  const url = new URL(getEffectiveChatRealtimeUrl(), window.location.origin);
  const sessionEmail = getSessionEmail();
  const userId = getCurrentUserIdentifier();
  const identities = [sessionEmail, userId, getCurrentUserStremeInboxChannel()].filter(Boolean);
  url.searchParams.set('userEmail', sessionEmail);
  url.searchParams.set('email', sessionEmail);
  url.searchParams.set('userId', userId);
  url.searchParams.set('clientId', getDeviceId());
  const chatRealtimeSessionToken = getStremeSessionTokenForEventSource();
  if (chatRealtimeSessionToken && !url.searchParams.has('token')) url.searchParams.set('token', chatRealtimeSessionToken);
  if (identities.length) url.searchParams.set('identityKeys', identities.join(','));
  return url.toString();
}

function scheduleChatRealtimeReconnect() {
  if (!getEffectiveChatRealtimeUrl() || chatRealtimeManualDisconnect) return;
  clearTimeout(chatRealtimeReconnectTimer);
  const delay = Math.min(30000, 1000 * (2 ** chatRealtimeReconnectAttempts));
  chatRealtimeReconnectAttempts += 1;
  chatRealtimeReconnectTimer = setTimeout(() => connectChatRealtimeStream(), delay);
}

function handleChatRealtimeEventPayload(payload = {}) {
  if (!payload || typeof payload !== 'object') return;
  const type = String(payload.eventType || payload.type || payload.data?.type || payload.data?.eventType || '').trim();
  const data = payload.data && typeof payload.data === 'object' ? payload.data : payload;
  const chatId = data.chatId || data.conversationId || payload.chatId || payload.conversationId || data.message?.chatId || data.message?.conversationId || '';

  if (type === 'chat.message' || type === 'message.created') {
    receiveRealtimeMessage({
      ...data,
      chatId,
      conversationId: chatId || data.conversationId || payload.conversationId || '',
      messageId: data.messageId || data.message?.messageId || data.message?.id || payload.messageId || payload.id || '',
      message: data.message || data.record || data
    });
    return;
  }

  if (type === 'chat.typing' || type === 'typing.started' || type === 'typing.stopped') {
    updateTypingStatus({
      ...data,
      chatId,
      conversationId: chatId,
      userId: data.userId || data.actorUserId || payload.actorUserId || '',
      userEmail: data.userEmail || data.actorUserEmail || payload.actorUserEmail || ''
    }, type === 'chat.typing' ? Boolean(data.isTyping ?? data.typing ?? data.active) : type === 'typing.started');
  }
}

function connectChatRealtimeStream() {
  if (!getEffectiveChatRealtimeUrl() || !getSessionEmail() || typeof EventSource === 'undefined') return;
  if (chatRealtimeEventSource && chatRealtimeEventSource.readyState !== EventSource.CLOSED) return;

  chatRealtimeManualDisconnect = false;
  chatRealtimeSessionGuard = captureSessionGuard();
  const connectionGuard = chatRealtimeSessionGuard;

  try {
    chatRealtimeEventSource = new EventSource(buildChatRealtimeUrl(), { withCredentials: true });
    chatRealtimeEventSource.addEventListener('chat_ready', () => {
      if (!isSessionGuardCurrent(connectionGuard)) return;
      chatRealtimeReconnectAttempts = 0;
    });
    chatRealtimeEventSource.addEventListener('chat_event', (event) => {
      if (!isSessionGuardCurrent(connectionGuard)) return;
      try {
        handleChatRealtimeEventPayload(JSON.parse(event.data || '{}'));
      } catch (error) {
        console.warn('No se pudo procesar un evento simple de chat.', error);
      }
    });
    chatRealtimeEventSource.addEventListener('error', () => {
      if (!isSessionGuardCurrent(connectionGuard)) return;
      if (chatRealtimeManualDisconnect) return;
      if (chatRealtimeEventSource?.readyState === EventSource.CLOSED) {
        chatRealtimeEventSource = null;
        scheduleChatRealtimeReconnect();
      }
    });
  } catch (error) {
    chatRealtimeEventSource = null;
    scheduleChatRealtimeReconnect();
  }
}

function disconnectChatRealtimeStream() {
  chatRealtimeManualDisconnect = true;
  clearTimeout(chatRealtimeReconnectTimer);
  if (chatRealtimeEventSource) {
    chatRealtimeEventSource.close();
    chatRealtimeEventSource = null;
  }
  chatRealtimeSessionGuard = null;
}

function scheduleStremeReconnect(channel = '', channels = []) {
  if (!getEffectiveRealtimeUrl() || stremeManualDisconnect) return;
  clearTimeout(stremeReconnectTimer);
  const delay = Math.min(30000, 1000 * (2 ** stremeReconnectAttempts));
  stremeReconnectAttempts += 1;
  stremeReconnectTimer = setTimeout(() => {
    const multiplexChannels = normalizeStremeChannelList(channels);
    if (multiplexChannels.length && resolveStremeTransport() === 'sse') {
      connectStremeMultiplexEventSource(multiplexChannels);
      return;
    }

    const cleanChannel = sanitizeLocalStremeChannel(channel, '');
    if (cleanChannel && resolveStremeTransport() === 'sse') {
      connectStremeEventSource(cleanChannel);
      return;
    }
    connectStremeRealtime();
  }, delay);
}

function disconnectStremeRealtime() {
  disconnectChatRealtimeStream();
  stremeManualDisconnect = true;
  clearTimeout(stremeReconnectTimer);
  if (stremeSocket) {
    stremeSocket.close();
    stremeSocket = null;
  }
  if (stremeEventSource) {
    stremeEventSource.close();
    stremeEventSource = null;
  }
  stremeEventSourcesByChannel.forEach((source) => source?.close?.());
  stremeEventSourcesByChannel.clear();
  stremeActiveSseChannelsKey = '';
  stremeActiveTransport = 'none';
  stremeSessionGuard = null;
}

function createStremeClientEvent(payload) {
  return {
    ...payload,
    senderUserId: payload.senderUserId || getCurrentUserIdentifier(),
    senderUserEmail: payload.senderUserEmail || getSessionEmail(),
    deviceId: payload.deviceId || getDeviceId(),
    clientMutationId: payload.clientMutationId || generateClientMutationId(),
    clientTime: new Date().toISOString()
  };
}

function sendStremeEvent(payload) {
  const clientEvent = createStremeClientEvent(payload);

  if (typeof WebSocket !== 'undefined' && stremeSocket?.readyState === WebSocket.OPEN) {
    stremeSocket.send(JSON.stringify(clientEvent));
    return;
  }

  if (stremeActiveTransport === 'sse' && CHATER_CONFIG.backendBaseUrl) {
    apiClient.publishStremeEvent(clientEvent).catch(() => {
      // Los eventos efímeros de presencia/escritura no se encolan para evitar duplicados obsoletos.
    });
  }
}

function publishDurableStremeEvent(payload, options = {}) {
  if (!CHATER_CONFIG.backendBaseUrl) return null;

  const clientEvent = createStremeClientEvent(payload);
  const eventType = String(clientEvent.type || clientEvent.tipo || 'event').trim() || 'event';
  const dedupeKey = options.dedupeKey || `streme-event:${eventType}:${clientEvent.clientMutationId}`;
  const stremeIdempotencyKey = resolveStremePublishIdempotencyKey(clientEvent, {
    idempotencyKey: options.idempotencyKey || dedupeKey
  });

  return apiClient.publishStremeEvent(clientEvent, { idempotencyKey: stremeIdempotencyKey }).catch((error) => {
    if (isStremePublishIdempotencyConflict(error)) return null;
    console.warn(options.onErrorMessage || 'No se pudo publicar un evento durable en STREMEx. Se deja en cola de sincronización.', error);
    enqueueBackendOperation({
      type: 'publishStremeEvent',
      dedupeKey,
      payload: { event: clientEvent, stremeIdempotencyKey }
    });
    return null;
  });
}


function getRealtimeMergedMetadata(raw = {}, data = {}) {
  const dataMetadata = data?.metadata && typeof data.metadata === 'object' ? data.metadata : {};
  const rawMetadata = raw?.metadata && typeof raw.metadata === 'object' ? raw.metadata : {};
  return { ...dataMetadata, ...rawMetadata };
}

function getRealtimeArchiveFlagForCurrentUser(raw = {}, metadata = {}, data = {}) {
  const values = [
    raw.archivedForCurrentUser,
    raw.isArchivedForCurrentUser,
    raw.archivedForMe,
    raw.isArchivedForMe,
    metadata.archivedForCurrentUser,
    metadata.isArchivedForCurrentUser,
    metadata.archivedForMe,
    metadata.isArchivedForMe,
    data.archivedForCurrentUser,
    data.isArchivedForCurrentUser,
    data.archivedForMe,
    data.isArchivedForMe
  ];
  return coerceFirstBooleanFlag(values, null);
}

function getRealtimeActorIdentityKey(data = {}) {
  const raw = getRealtimeRecord(data, ['conversation', 'chat']);
  const metadata = getRealtimeMergedMetadata(raw, data);
  const directActorIdentityKey = [
    raw.actorIdentityKey,
    raw.actorParticipantIdentityKey,
    raw.lastActorScopedArchiveIdentityKey,
    raw.archivedForActorIdentityKey,
    raw.restoredArchiveForActorIdentityKey,
    raw.restoredActorIdentityKey,
    raw.hiddenForActorIdentityKey,
    raw.deletedForActorIdentityKey,
    metadata.actorIdentityKey,
    metadata.actorParticipantIdentityKey,
    metadata.lastActorScopedArchiveIdentityKey,
    metadata.archivedForActorIdentityKey,
    metadata.restoredArchiveForActorIdentityKey,
    metadata.restoredActorIdentityKey,
    metadata.hiddenForActorIdentityKey,
    metadata.deletedForActorIdentityKey,
    data.actorIdentityKey,
    data.actorParticipantIdentityKey,
    data.lastActorScopedArchiveIdentityKey,
    data.archivedForActorIdentityKey,
    data.restoredArchiveForActorIdentityKey,
    data.restoredActorIdentityKey,
    data.hiddenForActorIdentityKey,
    data.deletedForActorIdentityKey
  ].map(normalizeLifecycleIdentityKeyFromValue).find(Boolean);
  if (directActorIdentityKey) return directActorIdentityKey;

  const actor = getFirstObjectCandidate(
    raw.actor,
    raw.archivedBy,
    raw.restoredBy,
    raw.deletedBy,
    metadata.actor,
    metadata.archivedBy,
    metadata.restoredBy,
    metadata.deletedBy,
    data.actor,
    data.archivedBy,
    data.restoredBy,
    data.deletedBy
  ) || {};

  return normalizeLifecycleIdentityKeyFromValue({
    userId: actor.userId
      || actor.actorUserId
      || actor.deletedByUserId
      || raw.actorUserId
      || raw.archivedByUserId
      || raw.restoredByUserId
      || raw.deletedByUserId
      || metadata.actorUserId
      || metadata.archivedByUserId
      || metadata.restoredByUserId
      || metadata.deletedByUserId
      || data.actorUserId
      || data.archivedByUserId
      || data.restoredByUserId
      || data.deletedByUserId
      || '',
    email: actor.email
      || actor.userEmail
      || actor.actorUserEmail
      || actor.deletedByUserEmail
      || raw.actorUserEmail
      || raw.archivedByUserEmail
      || raw.restoredByUserEmail
      || raw.deletedByUserEmail
      || metadata.actorUserEmail
      || metadata.archivedByUserEmail
      || metadata.restoredByUserEmail
      || metadata.deletedByUserEmail
      || data.actorUserEmail
      || data.archivedByUserEmail
      || data.restoredByUserEmail
      || data.deletedByUserEmail
      || ''
  });
}


function getRealtimeDeleteFlagForCurrentUser(raw = {}, metadata = {}, data = {}) {
  const values = [
    raw.deletedForCurrentUser,
    raw.isDeletedForCurrentUser,
    raw.deletedForMe,
    raw.isDeletedForMe,
    raw.hiddenForCurrentUser,
    raw.isHiddenForCurrentUser,
    metadata.deletedForCurrentUser,
    metadata.isDeletedForCurrentUser,
    metadata.deletedForMe,
    metadata.isDeletedForMe,
    metadata.hiddenForCurrentUser,
    metadata.isHiddenForCurrentUser,
    data.deletedForCurrentUser,
    data.isDeletedForCurrentUser,
    data.deletedForMe,
    data.isDeletedForMe,
    data.hiddenForCurrentUser,
    data.isHiddenForCurrentUser
  ];
  return coerceFirstBooleanFlag(values, null);
}

function getRealtimeDeletionScope(raw = {}, metadata = {}, data = {}) {
  return String(
    raw.deleteVisibilityScope
      || raw.deletionVisibilityScope
      || raw.visibilityScope
      || raw.mode
      || metadata.deleteVisibilityScope
      || metadata.deletionVisibilityScope
      || metadata.visibilityScope
      || metadata.mode
      || data.deleteVisibilityScope
      || data.deletionVisibilityScope
      || data.visibilityScope
      || data.mode
      || ''
  ).trim().toLowerCase();
}

function getRealtimeDeletionRemainingCount(raw = {}, metadata = {}, data = {}) {
  const candidates = [
    raw.remainingParticipantCount,
    raw.deletionCounterRemaining,
    raw.deletionCounterAfter,
    raw.participantDeletionRegistry?.counterRemaining,
    raw.participantDeletionRegistry?.remainingParticipantCount,
    raw.deletionRegistry?.participantDeletionRegistry?.counterRemaining,
    raw.deletionRegistry?.participantDeletionRegistry?.remainingParticipantCount,
    metadata.remainingParticipantCount,
    metadata.deletionCounterRemaining,
    metadata.deletionCounterAfter,
    metadata.participantDeletionRegistry?.counterRemaining,
    metadata.participantDeletionRegistry?.remainingParticipantCount,
    metadata.deletionRegistry?.participantDeletionRegistry?.counterRemaining,
    metadata.deletionRegistry?.participantDeletionRegistry?.remainingParticipantCount,
    data.remainingParticipantCount,
    data.deletionCounterRemaining,
    data.deletionCounterAfter,
    data.participantDeletionRegistry?.counterRemaining,
    data.participantDeletionRegistry?.remainingParticipantCount,
    data.deletionRegistry?.participantDeletionRegistry?.counterRemaining,
    data.deletionRegistry?.participantDeletionRegistry?.remainingParticipantCount
  ];

  for (const candidate of candidates) {
    if (candidate === undefined || candidate === null || candidate === '') continue;
    const parsed = Number(candidate);
    if (Number.isFinite(parsed)) return Math.max(0, Math.round(parsed));
  }

  return null;
}

function isRealtimeDeletionFinalForAll(raw = {}, metadata = {}, data = {}) {
  const remainingCount = getRealtimeDeletionRemainingCount(raw, metadata, data);
  if (remainingCount === 0) return true;

  return coerceFirstBooleanFlag([
    raw.deleteForAllParticipants,
    raw.deletedForAllParticipants,
    raw.finalDelete,
    raw.isFinalDelete,
    raw.redisDeleted,
    raw.deleteRedisNow,
    metadata.deleteForAllParticipants,
    metadata.deletedForAllParticipants,
    metadata.finalDelete,
    metadata.isFinalDelete,
    metadata.redisDeleted,
    metadata.deleteRedisNow,
    data.deleteForAllParticipants,
    data.deletedForAllParticipants,
    data.finalDelete,
    data.isFinalDelete,
    data.redisDeleted,
    data.deleteRedisNow
  ], false);
}


function firstArrayCandidate(...candidates) {
  return candidates.find((candidate) => Array.isArray(candidate) && candidate.length) || [];
}

function hasObjectKeys(value = {}) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length);
}

function buildRealtimeDeletionLifecycleStorage(raw = {}, metadata = {}, data = {}) {
  const registry = getFirstObjectCandidate(
    raw.localDeletionRegistry,
    raw.deletionRegistry,
    metadata.localDeletionRegistry,
    metadata.deletionRegistry,
    data.localDeletionRegistry,
    data.deletionRegistry
  );
  const participantDeletionRegistry = getFirstObjectCandidate(
    raw.participantDeletionRegistry,
    metadata.participantDeletionRegistry,
    data.participantDeletionRegistry,
    registry.participantDeletionRegistry
  );
  const deletedParticipants = firstArrayCandidate(
    raw.deletedParticipants,
    metadata.deletedParticipants,
    data.deletedParticipants,
    registry.deletedParticipants,
    participantDeletionRegistry.deletedParticipants
  );
  const deletedParticipantIdentityKeys = new Set([
    ...Array.from(collectLifecycleIdentityKeys(raw.deletedParticipantIdentityKeys || [])),
    ...Array.from(collectLifecycleIdentityKeys(metadata.deletedParticipantIdentityKeys || [])),
    ...Array.from(collectLifecycleIdentityKeys(data.deletedParticipantIdentityKeys || [])),
    ...Array.from(collectLifecycleIdentityKeys(registry.deletedParticipantIdentityKeys || [])),
    ...Array.from(collectLifecycleIdentityKeys(participantDeletionRegistry.deletedParticipantIdentityKeys || [])),
    ...Array.from(collectLifecycleIdentityKeys(deletedParticipants || []))
  ].filter(Boolean));
  const remainingCount = getRealtimeDeletionRemainingCount(raw, metadata, data);
  const deletionActorIdentityKey = getRealtimeActorIdentityKey(data);
  const hasDeletionActorContext = Boolean(getRealtimeDeletionScope(raw, metadata, data))
    || remainingCount !== null
    || coerceFirstBooleanFlag([
      raw.deleted,
      raw.isDeleted,
      raw.deletedForCurrentUser,
      raw.isDeletedForCurrentUser,
      raw.hiddenForCurrentUser,
      metadata.deleted,
      metadata.isDeleted,
      metadata.deletedForCurrentUser,
      metadata.isDeletedForCurrentUser,
      metadata.hiddenForCurrentUser,
      data.deleted,
      data.isDeleted,
      data.deletedForCurrentUser,
      data.isDeletedForCurrentUser,
      data.hiddenForCurrentUser
    ], false);
  if (deletionActorIdentityKey && hasDeletionActorContext) {
    deletedParticipantIdentityKeys.add(deletionActorIdentityKey);
  }
  const inferredParticipantCountFromCounter = remainingCount === null
    ? 0
    : Math.max(0, remainingCount + deletedParticipantIdentityKeys.size);
  const hasLifecycleData = hasObjectKeys(registry)
    || hasObjectKeys(participantDeletionRegistry)
    || deletedParticipants.length > 0
    || deletedParticipantIdentityKeys.size > 0
    || remainingCount !== null
    || coerceFirstBooleanFlag([
      raw.deleted,
      raw.isDeleted,
      raw.deletedForCurrentUser,
      raw.isDeletedForCurrentUser,
      raw.hiddenForCurrentUser,
      metadata.deleted,
      metadata.isDeleted,
      metadata.deletedForCurrentUser,
      metadata.isDeletedForCurrentUser,
      metadata.hiddenForCurrentUser,
      data.deleted,
      data.isDeleted,
      data.deletedForCurrentUser,
      data.isDeletedForCurrentUser,
      data.hiddenForCurrentUser
    ], false);

  if (!hasLifecycleData) {
    return {
      deletionRegistry: null,
      localDeletionRegistry: null,
      participantDeletionRegistry: null,
      deletedParticipants: [],
      deletedParticipantIdentityKeys: [],
      participantCount: 0,
      deletionCounterInitial: undefined,
      deletionCounterRemaining: undefined,
      remainingParticipantCount: undefined
    };
  }

  const participantCount = Math.max(
    Number(raw.participantCount || metadata.participantCount || data.participantCount || 0) || 0,
    Number(raw.deletionCounterInitial || metadata.deletionCounterInitial || data.deletionCounterInitial || 0) || 0,
    Number(participantDeletionRegistry.counterInitial || 0) || 0,
    Number(participantDeletionRegistry.participantCount || 0) || 0,
    inferredParticipantCountFromCounter,
    deletedParticipantIdentityKeys.size,
    1
  );
  const normalizedCounterInitial = Math.max(Number(participantDeletionRegistry.counterInitial || 0) || 0, participantCount);
  const normalizedParticipantRegistry = {
    ...(hasObjectKeys(participantDeletionRegistry) ? participantDeletionRegistry : {}),
    counterInitial: normalizedCounterInitial,
    counterRemaining: remainingCount === null ? participantDeletionRegistry.counterRemaining : remainingCount,
    deleteWhenRemainingParticipants: 0,
    deletedParticipantIdentityKeys: Array.from(deletedParticipantIdentityKeys),
    internalOnly: true,
    visibleInChat: false
  };

  const normalizedRegistry = {
    ...(hasObjectKeys(registry) ? registry : {}),
    deletedParticipants,
    deletedParticipantIdentityKeys: Array.from(deletedParticipantIdentityKeys),
    participantDeletionRegistry: normalizedParticipantRegistry,
    internalOnly: true,
    visibleInChat: false
  };

  return {
    deletionRegistry: normalizedRegistry,
    localDeletionRegistry: normalizedRegistry,
    participantDeletionRegistry: normalizedParticipantRegistry,
    deletedParticipants,
    deletedParticipantIdentityKeys: Array.from(deletedParticipantIdentityKeys),
    participantCount,
    deletionCounterInitial: normalizedCounterInitial,
    deletionCounterRemaining: remainingCount === null ? normalizedParticipantRegistry.counterRemaining : remainingCount,
    remainingParticipantCount: remainingCount === null ? normalizedParticipantRegistry.counterRemaining : remainingCount
  };
}

function shouldHideRealtimeDeletedConversationForCurrentUser(data = {}) {
  const raw = getRealtimeRecord(data, ['conversation', 'chat']);
  const metadata = getRealtimeMergedMetadata(raw, data);
  const explicitDeletedForCurrentUser = getRealtimeDeleteFlagForCurrentUser(raw, metadata, data);
  if (isRealtimeDeletionFinalForAll(raw, metadata, data)) return true;
  if (explicitDeletedForCurrentUser !== null) return explicitDeletedForCurrentUser;
  if (deletionRegistryIncludesCurrentUser(raw, metadata)) return true;
  if (hasParticipantDeletionRegistry(raw, metadata)) return false;

  const scope = getRealtimeDeletionScope(raw, metadata, data);
  const actorKey = getRealtimeActorIdentityKey(data);
  const selfKey = normalizeLifecycleIdentityKeyFromValue(getCurrentParticipantLifecycleIdentity());
  const isActorScoped = ['actor_only', 'actor-only', 'per-participant', 'participant', 'current_user', 'current-user', 'hide_for_actor'].includes(scope)
    || scope.includes('actor')
    || scope.includes('participant');

  if ((isActorScoped || actorKey) && actorKey && selfKey && actorKey !== selfKey) return false;
  if ((isActorScoped || actorKey) && actorKey && selfKey && actorKey === selfKey) return true;

  return coerceFirstBooleanFlag([
    raw.deleted,
    raw.isDeleted,
    data.deleted,
    data.isDeleted
  ], false);
}

function buildRealtimeArchivePatchForCurrentUser(data = {}, archived = false) {
  const raw = getRealtimeRecord(data, ['conversation', 'chat']);
  const metadata = getRealtimeMergedMetadata(raw, data);
  const explicitArchivedForCurrentUser = getRealtimeArchiveFlagForCurrentUser(raw, metadata, data);
  const scope = String(
    raw.archiveVisibilityScope
      || raw.visibilityScope
      || metadata.archiveVisibilityScope
      || metadata.visibilityScope
      || data.archiveVisibilityScope
      || data.visibilityScope
      || ''
  ).trim().toLowerCase();
  const actorKey = getRealtimeActorIdentityKey(data);
  const selfKey = normalizeLifecycleIdentityKeyFromValue(getCurrentParticipantLifecycleIdentity());
  const isActorScoped = ['actor_only', 'actor-only', 'per-participant', 'participant', 'current_user', 'current-user'].includes(scope)
    || scope.includes('actor')
    || scope.includes('participant');

  if ((isActorScoped || !scope) && explicitArchivedForCurrentUser === null && actorKey && selfKey && actorKey !== selfKey) {
    return null;
  }

  const nextArchived = explicitArchivedForCurrentUser === null ? Boolean(archived) : Boolean(explicitArchivedForCurrentUser);
  const archiveChangedAt = raw.archiveChangedAt
    || raw.archiveUpdatedAt
    || raw.archivedAt
    || raw.restoredAt
    || metadata.archiveChangedAt
    || metadata.archiveUpdatedAt
    || metadata.archivedAt
    || metadata.restoredAt
    || data.createdAt
    || data.updatedAt
    || new Date().toISOString();
  const archiveClientMutationId = raw.archiveClientMutationId
    || raw.archiveMutationId
    || raw.clientMutationId
    || metadata.archiveClientMutationId
    || metadata.archiveMutationId
    || metadata.clientMutationId
    || data.clientMutationId
    || '';

  return {
    archived: nextArchived,
    archivedForCurrentUser: nextArchived,
    isArchivedForCurrentUser: nextArchived,
    archivedForMe: nextArchived,
    archiveVisibilityScope: scope || 'actor_only',
    visibilityScope: scope || 'actor_only',
    actorIdentityKey: actorKey || selfKey || '',
    archiveChangedAt,
    archiveClientMutationId
  };
}

function handleStremeEvent(payload) {
  if (stremeSessionGuard && !isSessionGuardCurrent(stremeSessionGuard)) return;
  const normalizedPayload = normalizeStremeInboundPayload(payload);
  const eventId = normalizedPayload.id || normalizedPayload.eventId || normalizedPayload.lastEventId;
  if (eventId) {
    persistStremeLastEventId(eventId, { source: 'normalized-streme-event', type: normalizedPayload.type || '' });
  }

  if (normalizedPayload.type === 'message.created') {
    receiveRealtimeMessage(normalizedPayload.data);
  }

  if (normalizedPayload.type === 'message.updated') {
    updateRealtimeMessage(normalizedPayload.data);
  }

  if (['message.delivered', 'message.received', 'receipt.delivered', 'delivered'].includes(normalizedPayload.type)) {
    applyRealtimeMessageReceipt(normalizedPayload.data, 'delivered');
  }

  if (['message.read', 'message.seen', 'message.opened', 'receipt.read', 'read'].includes(normalizedPayload.type)) {
    applyRealtimeMessageReceipt(normalizedPayload.data, 'read');
  }

  if (normalizedPayload.type === 'message.deleted') {
    deleteRealtimeMessage(normalizedPayload.data);
  }

  if (['typing.started', 'typing.stopped', 'typing.start', 'typing.stop'].includes(normalizedPayload.type)) {
    const typingEventData = { ...normalizedPayload, ...(normalizedPayload.data || {}) };
    updateTypingStatus(typingEventData, ['typing.started', 'typing.start'].includes(normalizedPayload.type));
  }

  if (normalizedPayload.type === 'presence.changed') {
    updatePresenceStatus(normalizedPayload.data);
  }

  if (normalizedPayload.type === 'call.incoming') {
    registerIncomingCall(normalizedPayload.data);
  }

  if (normalizedPayload.type === 'call.updated') {
    upsertRealtimeCall(normalizedPayload.data);
  }

  if (normalizedPayload.type === 'state.created') {
    registerRealtimeState(normalizedPayload.data);
  }

  if (normalizedPayload.type === 'state.updated') {
    upsertRealtimeState(normalizedPayload.data);
  }

  if (normalizedPayload.type === 'state.deleted') {
    removeRealtimeState(normalizedPayload.data);
  }

  if (normalizedPayload.type === 'conversation.created') {
    upsertRealtimeConversation(normalizedPayload.data);
  }

  if (normalizedPayload.type === 'conversation.updated') {
    upsertRealtimeConversation(normalizedPayload.data);
  }

  if (normalizedPayload.type === 'conversation.archived') {
    const archivePatch = buildRealtimeArchivePatchForCurrentUser(normalizedPayload.data, true);
    if (archivePatch) upsertRealtimeConversation(normalizedPayload.data, archivePatch);
  }

  if (normalizedPayload.type === 'conversation.restored') {
    const archivePatch = buildRealtimeArchivePatchForCurrentUser(normalizedPayload.data, false);
    if (archivePatch) upsertRealtimeConversation(normalizedPayload.data, archivePatch);
  }

  if (normalizedPayload.type === 'conversation.deleted') {
    removeRealtimeConversation(normalizedPayload.data);
  }

  if (normalizedPayload.type === 'profile.updated' || normalizedPayload.type === 'profile.avatar.updated') {
    applyRealtimeProfileUpdate(normalizedPayload.data);
  }

  if (normalizedPayload.type === 'app.logo.updated') {
    applyRealtimeBrandLogoUpdate(normalizedPayload.data);
    notifyPwaRealtimeUpdate(normalizedPayload.type, normalizedPayload.data);
  }

  if (normalizedPayload.type === 'app.version.changed') {
    notifyPwaRealtimeUpdate(normalizedPayload.type, normalizedPayload.data);
  }
}

function receiveRealtimeMessage(data = {}) {
  const message = data.message || data;
  const conversationId = data.chatId || data.conversationId || message.chatId || message.conversationId;
  const conversation = findOrCreateConversationForRealtimeMessage(data, message);
  if (!conversation) return;

  const normalizedMessage = normalizeMessageFromApi({
    ...message,
    senderUserId: message.senderUserId || data.senderUserId || '',
    senderUserEmail: message.senderUserEmail || data.senderUserEmail || '',
    recipientUserId: message.recipientUserId || data.recipientUserId || '',
    recipientUserEmail: message.recipientUserEmail || data.recipientUserEmail || '',
    chatId: conversation.id,
    conversationId: conversation.id
  });
  const existingMessage = findExistingMessageByIdentity(
    conversation.messages,
    normalizedMessage,
    message,
    { id: data.messageId, clientMutationId: data.clientMutationId }
  );

  if (existingMessage) {
    updateExistingMessageFromRealtime(existingMessage, normalizedMessage);
  } else {
    conversation.messages.push(normalizedMessage);
  }

  const storedMessage = existingMessage || normalizedMessage;
  if (storedMessage.type !== 'outgoing') {
    sendDeliveredReceiptForMessage(conversation, storedMessage);
    if (conversation.id === activeConversationId && activeSection === 'chats') {
      markConversationRead(conversation, { force: true });
    } else if (!existingMessage) {
      conversation.unread = Number(conversation.unread || 0) + 1;
    }
  } else {
    setMessageReceiptStatus(storedMessage, storedMessage.receiptStatus || storedMessage.status || 'backend_received', {
      backendReceivedAt: storedMessage.backendReceivedAt || new Date().toISOString()
    });
  }

  clearRemoteTypingStatus(conversation.id, storedMessage.type === 'outgoing' ? 'Entregado' : 'En línea', { render: false });
  conversation.status = storedMessage.type === 'outgoing' ? 'Entregado' : 'En línea';
  conversation.messages = normalizeAndPruneChatMessages(conversation.messages);
  persistState();
  renderCurrentSection();
}

function updateRealtimeMessage(data = {}) {
  const message = data.message || data;
  const conversationId = data.chatId || data.conversationId || message.chatId || message.conversationId;
  const conversation = appState.conversations.find((item) => item.id === conversationId);
  if (!conversation) return;

  const messageId = message.id || data.messageId;
  const existingMessage = findExistingMessageByIdentity(conversation.messages, message, { id: messageId, clientMutationId: data.clientMutationId });
  if (!existingMessage) return;

  existingMessage.text = String(message.text || existingMessage.text || '');
  existingMessage.time = message.time || formatEventTime(message.updatedAt || message.createdAt);
  if (existingMessage.type === 'outgoing') {
    setMessageReceiptStatus(existingMessage, message.receiptStatus || message.status || existingMessage.status || 'backend_received', {
      deliveredAt: message.deliveredAt,
      readAt: message.readAt,
      backendReceivedAt: message.backendReceivedAt || message.createdAt
    });
  } else {
    existingMessage.status = message.status || existingMessage.status || 'updated';
  }
  existingMessage.clientMutationId = message.clientMutationId || existingMessage.clientMutationId || '';
  conversation.messages = normalizeAndPruneChatMessages(conversation.messages);
  persistState();
  renderCurrentSection();
}

function deleteRealtimeMessage(data = {}) {
  const conversationId = data.chatId || data.conversationId;
  const messageId = data.messageId || data.id;
  const conversation = appState.conversations.find((item) => item.id === conversationId);
  if (!conversation || !messageId) return;

  const identitySet = new Set(getMessageIdentityCandidates({ id: messageId, clientMutationId: data.clientMutationId }));
  conversation.messages = conversation.messages.map((message) => {
    const matchesDeletedMessage = getMessageIdentityCandidates(message).some((identity) => identitySet.has(identity));
    if (!matchesDeletedMessage) return message;
    return {
      ...message,
      type: 'system',
      text: 'Este mensaje fue eliminado.',
      status: 'deleted'
    };
  });
  persistState();
  renderCurrentSection();
}

function registerIncomingCall(data = {}) {
  const call = normalizeCallFromApi(data.call || data);
  if (!appState.calls.some((item) => item.id === call.id)) {
    appState.calls.unshift(call);
    persistState();
    if (activeSection === 'calls') renderCurrentSection();
  }
  showToast(`Tienes una ${call.type === 'video' ? 'videollamada' : 'llamada'} entrante.`);
}

function registerRealtimeState(data = {}) {
  const state = normalizeStateFromApi(data.state || data);
  if (!appState.states.some((item) => item.id === state.id)) {
    appState.states.unshift(state);
    persistState();
    if (activeSection === 'states') renderCurrentSection();
  }
  showToast('Hay un nuevo estado disponible.');
}

function getRealtimeRecord(data = {}, keys = []) {
  if (!data || typeof data !== 'object') return {};
  const keyList = Array.isArray(keys) ? keys : [keys];
  for (const key of keyList) {
    const candidate = data[key];
    if (candidate && typeof candidate === 'object' && !Array.isArray(candidate)) return candidate;
  }
  return getFirstObjectCandidate(
    data.record,
    data.registro,
    data.item,
    data.entity,
    data.payload,
    data.data,
    data
  );
}

function getRealtimeConversationIdentity(raw = {}) {
  return String(raw.id || raw.chatId || raw.conversationId || raw.conversation?.id || raw.chat?.id || '').trim();
}

function findConversationForRealtimePatch(raw = {}) {
  const id = getRealtimeConversationIdentity(raw);
  const email = normalizeStorageIdentity(raw.contactEmail || raw.email || raw.userEmail || raw.participantEmail || raw.contact?.email || '');
  const userId = normalizeBackendUserId(raw.contactUserId || raw.userId || raw.remoteUserId || raw.contact?.userId || raw.contact?.id || '');
  const sharedKey = getConversationSharedMergeKey(raw);
  return appState.conversations.find((conversation) => {
    if (id && String(conversation.id || '') === id) return true;
    if (sharedKey && getConversationSharedMergeKey(conversation) === sharedKey) return true;
    if (email && [conversation.email, conversation.contactEmail].map(normalizeStorageIdentity).includes(email)) return true;
    if (userId && normalizeBackendUserId(conversation.contactUserId || '') === userId) return true;
    return false;
  }) || null;
}

function upsertRealtimeConversation(data = {}, forcedPatch = {}) {
  const rawRecord = getRealtimeRecord(data, ['conversation', 'chat']);
  const patch = getRealtimeRecord(data.patch && typeof data.patch === 'object' ? data.patch : {}, []);
  const raw = { ...rawRecord, ...patch, ...forcedPatch };
  const existing = findConversationForRealtimePatch(raw);
  const normalized = normalizeConversationFromApi(existing ? { ...existing, ...raw } : raw);
  if (!normalized.id) return false;

  if (existing?.id && normalized.id && String(existing.id) !== String(normalized.id) && getConversationSharedMergeKey(existing) && getConversationSharedMergeKey(existing) === getConversationSharedMergeKey(normalized)) {
    applyRemoteConversationId(existing.id, normalized.id);
  } else {
    reconcileRemoteConversationIdentityBySharedKey(normalized);
  }
  appState.conversations = mergeConversationsById([normalized], appState.conversations);
  if (!appState.conversations.some((conversation) => conversation.id === activeConversationId && !conversation.deleted)) {
    activeConversationId = getFirstVisibleConversationId(activeConversationId) || getVisibleConversations()[0]?.id || null;
  }

  persistState();
  renderCurrentSection();
  renderConversation();
  return true;
}

function removeRealtimeConversation(data = {}) {
  const raw = getRealtimeRecord(data, ['conversation', 'chat']);
  const metadata = getRealtimeMergedMetadata(raw, data);
  const id = getRealtimeConversationIdentity(raw) || getRealtimeConversationIdentity(data);
  const matchedConversation = findConversationForRealtimePatch({ ...raw, ...data });
  const targetId = id || matchedConversation?.id || '';
  const targetSharedKey = getConversationSharedMergeKey(raw) || getConversationSharedMergeKey(data) || getConversationSharedMergeKey(matchedConversation || {});
  const deletionLifecycle = buildRealtimeDeletionLifecycleStorage(raw, metadata, data);
  const shouldHideForCurrentUser = shouldHideRealtimeDeletedConversationForCurrentUser(data);
  let changed = false;

  appState.conversations = appState.conversations.map((conversation) => {
    const matchesById = targetId && String(conversation.id || '') === String(targetId);
    const matchesBySharedKey = targetSharedKey && getConversationSharedMergeKey(conversation) === targetSharedKey;
    if (!matchesById && !matchesBySharedKey) return conversation;
    changed = true;

    const lifecycleState = {
      localDeletionRegistry: deletionLifecycle.localDeletionRegistry || conversation.localDeletionRegistry || null,
      deletionRegistry: deletionLifecycle.deletionRegistry || conversation.deletionRegistry || null,
      participantDeletionRegistry: deletionLifecycle.participantDeletionRegistry || conversation.participantDeletionRegistry || null,
      deletedParticipants: deletionLifecycle.deletedParticipants?.length ? deletionLifecycle.deletedParticipants : (conversation.deletedParticipants || []),
      deletedParticipantIdentityKeys: deletionLifecycle.deletedParticipantIdentityKeys?.length ? deletionLifecycle.deletedParticipantIdentityKeys : (conversation.deletedParticipantIdentityKeys || []),
      participantCount: Math.max(Number(conversation.participantCount || 0) || 0, Number(deletionLifecycle.participantCount || 0) || 0, 1),
      deletionCounterInitial: deletionLifecycle.deletionCounterInitial || conversation.deletionCounterInitial || conversation.participantCount || 1,
      deletionCounterRemaining: deletionLifecycle.deletionCounterRemaining ?? conversation.deletionCounterRemaining,
      remainingParticipantCount: deletionLifecycle.remainingParticipantCount ?? conversation.remainingParticipantCount
    };

    if (!shouldHideForCurrentUser) {
      return {
        ...conversation,
        ...lifecycleState,
        status: conversation.status || 'Sincronizado'
      };
    }
    return {
      ...conversation,
      ...lifecycleState,
      archived: false,
      archiveDesiredArchived: false,
      blocked: false,
      blockDesiredBlocked: false,
      deleted: true,
      deletedForCurrentUser: true,
      isDeletedForCurrentUser: true,
      hiddenForCurrentUser: true,
      deleteDesiredDeleted: true,
      deleteChangedAt: raw.deleteChangedAt || raw.deletedAt || metadata.deleteChangedAt || metadata.deletedAt || new Date().toISOString(),
      status: 'Eliminado de tu lista'
    };
  });

  if (!changed) return false;
  if (shouldHideForCurrentUser && (String(activeConversationId || '') === String(targetId || '') || (matchedConversation && String(activeConversationId || '') === String(matchedConversation.id || '')))) {
    activeConversationId = getFirstVisibleConversationId(targetId || matchedConversation?.id || '');
  }
  persistState();
  renderCurrentSection();
  renderConversation();
  return true;
}

function upsertRealtimeState(data = {}) {
  const raw = getRealtimeRecord(data, ['state', 'status', 'publication', 'publicacion']);
  const stateId = String(raw.id || raw.stateId || data.stateId || data.id || '').trim();
  const existing = appState.states.find((item) => stateId && String(item.id || '') === stateId);
  const normalized = normalizeStateFromApi(existing ? { ...existing, ...raw } : raw);
  if (!normalized.id) return false;

  appState.states = mergeById([normalized], appState.states).filter((state) => !isStateExpired(state));
  if (!appState.states.some((state) => state.id === activeStateId)) activeStateId = getActiveStates()[0]?.id || null;
  persistState();
  if (activeSection === 'states') renderCurrentSection();
  return true;
}

function removeRealtimeState(data = {}) {
  const raw = getRealtimeRecord(data, ['state', 'status', 'publication', 'publicacion']);
  const stateId = String(raw.id || raw.stateId || data.stateId || data.id || '').trim();
  if (!stateId) return false;

  const beforeCount = appState.states.length;
  appState.states = appState.states.filter((state) => String(state.id || '') !== stateId);
  if (appState.states.length === beforeCount) return false;
  if (String(activeStateId || '') === stateId) activeStateId = getActiveStates()[0]?.id || null;
  persistState();
  if (activeSection === 'states') renderCurrentSection();
  return true;
}

function upsertRealtimeCall(data = {}) {
  const raw = getRealtimeRecord(data, ['call', 'session', 'communicationSession']);
  const normalized = normalizeCallFromApi(raw);
  if (!normalized.id) return false;
  appState.calls = mergeById([normalized], appState.calls);
  persistState();
  if (activeSection === 'calls') renderCurrentSection();
  return true;
}

function applyRealtimeProfileUpdate(data = {}) {
  const raw = getRealtimeRecord(data, ['profile', 'user', 'contact']);
  const email = normalizeStorageIdentity(raw.email || raw.userEmail || raw.contactEmail || data.email || data.userEmail || '');
  const userId = normalizeBackendUserId(raw.userId || raw.id || raw.contactUserId || data.userId || '');
  const conversationId = String(raw.conversationId || raw.chatId || data.conversationId || data.chatId || '').trim();
  const displayName = String(raw.displayName || raw.name || raw.alias || raw.fullName || data.displayName || data.name || '').trim();
  const avatarImage = normalizeAssetImagePath(
    raw.avatarImage
    || raw.avatarUrl
    || raw.photoUrl
    || raw.picture
    || raw.imageUrl
    || raw.profileImageUrl
    || data.avatarImage
    || data.avatarUrl
    || data.photoUrl
    || ''
  );
  const avatar = raw.avatar || (displayName ? getInitials(displayName) : '');
  const status = raw.statusLabel || raw.presence || raw.status || data.status || '';
  let changed = false;

  const matchesIdentity = (entity = {}) => Boolean(
    (conversationId && String(entity.id || entity.conversationId || '') === conversationId)
    || (email && [entity.email, entity.contactEmail, entity.userEmail].map(normalizeStorageIdentity).includes(email))
    || (userId && normalizeBackendUserId(entity.contactUserId || entity.userId || '') === userId)
  );

  appState.conversations = appState.conversations.map((conversation) => {
    if (!matchesIdentity(conversation)) return conversation;
    changed = true;
    return {
      ...conversation,
      ...(displayName ? { name: displayName } : {}),
      ...(avatar ? { avatar } : {}),
      ...(avatarImage ? { avatarImage } : {}),
      ...(status ? { status } : {})
    };
  });

  appState.states = appState.states.map((state) => {
    if (!matchesIdentity(state)) return state;
    changed = true;
    return {
      ...state,
      ...(displayName ? { name: displayName, avatar: getInitials(displayName) } : {}),
      ...(avatarImage ? { avatarImage } : {})
    };
  });

  appState.calls = appState.calls.map((call) => {
    if (!matchesIdentity(call)) return call;
    changed = true;
    return {
      ...call,
      ...(displayName ? { name: displayName, avatar: getInitials(displayName) } : {}),
      ...(avatarImage ? { avatarImage } : {})
    };
  });

  const selfEmail = normalizeStorageIdentity(getSessionEmail());
  const selfUserId = normalizeBackendUserId(getSessionUserId()) || normalizeBackendUserId(getCurrentUserIdentifier());
  if ((email && email === selfEmail) || (userId && userId === selfUserId)) {
    if (displayName) profileButton.textContent = getInitials(displayName);
    if (email) userEmailLabel.textContent = email;
  }

  if (!changed) return false;
  persistState();
  renderCurrentSection();
  renderConversation();
  return true;
}

function applyRealtimeBrandLogoUpdate(data = {}) {
  const raw = getRealtimeRecord(data, ['brand', 'logo', 'app']);
  const version = String(
    raw.logoVersion
    || raw.assetVersion
    || raw.version
    || raw.updatedAt
    || data.logoVersion
    || data.assetVersion
    || data.version
    || data.updatedAt
    || Date.now()
  ).trim();

  chaterBrandLogoVersion = version;
  writeStorageItem('chater.brand.logo.version', chaterBrandLogoVersion);
  renderBrandLogos();
}

function notifyPwaRealtimeUpdate(type = '', data = {}) {
  const detail = { type, data, receivedAt: new Date().toISOString() };
  const hasPwaRuntime = Boolean(window.ChatERPWA?.applyRealtimeUpdatePayload);
  let dispatched = false;

  if (!hasPwaRuntime) {
    window.__ChatERPWARealtimeUpdates = Array.isArray(window.__ChatERPWARealtimeUpdates) ? window.__ChatERPWARealtimeUpdates : [];
    window.__ChatERPWARealtimeUpdates.push(detail);
  }

  try {
    window.dispatchEvent(new CustomEvent('chater:pwa-realtime-update', { detail }));
    dispatched = true;
  } catch (error) {
    // CustomEvent puede no estar disponible en navegadores antiguos; se usa llamada directa o cola global.
  }

  if (!dispatched && hasPwaRuntime) {
    window.ChatERPWA.applyRealtimeUpdatePayload(detail).catch(() => null);
  }
}

function getTypingConversationId(data = {}) {
  return String(data.chatId || data.conversationId || data.chatID || data.channelId || data.roomId || '').trim();
}

function isTypingSignalFromSelf(data = {}) {
  const selfEmail = normalizeStorageIdentity(getSessionEmail());
  const selfUserId = normalizeBackendUserId(getSessionUserId()) || normalizeBackendUserId(getCurrentUserIdentifier());
  const senderEmail = normalizeStorageIdentity(
    data.senderUserEmail
    || data.senderEmail
    || data.userEmail
    || data.email
    || data.fromEmail
    || data.actorEmail
    || data.authorEmail
    || ''
  );
  const senderUserId = normalizeBackendUserId(
    data.senderUserId
    || data.userId
    || data.fromUserId
    || data.actorUserId
    || data.authorUserId
    || data.uid
    || ''
  );
  const senderDeviceId = String(data.deviceId || data.clientDeviceId || data.senderDeviceId || '').trim();

  return Boolean(
    (selfEmail && senderEmail && senderEmail === selfEmail)
    || (selfUserId && senderUserId && senderUserId === selfUserId)
    || (senderDeviceId && senderDeviceId === getDeviceId())
  );
}

function clearRemoteTypingStatus(conversationId = '', fallbackStatus = 'En línea', options = {}) {
  const normalizedConversationId = String(conversationId || '').trim();
  if (!normalizedConversationId) return;

  const entry = remoteTypingDisplayState.get(normalizedConversationId);
  if (entry?.timer) clearTimeout(entry.timer);
  if (entry?.staleTimer) clearTimeout(entry.staleTimer);
  remoteTypingDisplayState.delete(normalizedConversationId);

  const conversation = appState.conversations.find((item) => String(item.id || '') === normalizedConversationId);
  if (!conversation) return;

  if (conversation.status === 'Escribiendo...') {
    conversation.status = fallbackStatus || entry?.previousStatus || 'En línea';
  }

  if (options.render !== false) renderCurrentSection();
}

function clearAllRemoteTypingStatuses() {
  remoteTypingDisplayState.forEach((entry) => {
    if (entry?.timer) clearTimeout(entry.timer);
    if (entry?.staleTimer) clearTimeout(entry.staleTimer);
  });
  remoteTypingDisplayState.clear();
}

function scheduleRemoteTypingStaleClear(conversationId = '', entry = null) {
  const normalizedConversationId = String(conversationId || '').trim();
  if (!normalizedConversationId || !entry) return;

  if (entry.staleTimer) clearTimeout(entry.staleTimer);
  entry.staleTimer = setTimeout(() => {
    const latestEntry = remoteTypingDisplayState.get(normalizedConversationId);
    if (latestEntry !== entry) return;

    if (entry.timer) clearTimeout(entry.timer);
    remoteTypingDisplayState.delete(normalizedConversationId);

    const conversation = appState.conversations.find((item) => String(item.id || '') === normalizedConversationId);
    if (conversation?.status === 'Escribiendo...') {
      conversation.status = entry.previousStatus || 'En línea';
      renderCurrentSection();
    }
  }, REMOTE_TYPING_STALE_MS);
}

function updateTypingStatus(data = {}, isTyping) {
  const conversationId = getTypingConversationId(data);
  const conversation = appState.conversations.find((item) => String(item.id || '') === conversationId);
  if (!conversation || isTypingSignalFromSelf(data)) return;

  if (isTyping) {
    const existingEntry = remoteTypingDisplayState.get(conversation.id);
    if (existingEntry?.timer) clearTimeout(existingEntry.timer);
    if (existingEntry?.staleTimer) clearTimeout(existingEntry.staleTimer);

    const previousStatus = existingEntry?.previousStatus
      || (conversation.status && conversation.status !== 'Escribiendo...' ? conversation.status : 'En línea');

    const entry = {
      previousStatus,
      timer: null,
      staleTimer: null,
      startedAt: existingEntry?.startedAt || Date.now(),
      lastSignalAt: Date.now()
    };

    remoteTypingDisplayState.set(conversation.id, entry);
    scheduleRemoteTypingStaleClear(conversation.id, entry);

    conversation.status = 'Escribiendo...';
    renderCurrentSection();
    return;
  }

  const existingStopEntry = remoteTypingDisplayState.get(conversation.id);
  if (!existingStopEntry && conversation.status !== 'Escribiendo...') return;

  const previousEntry = existingStopEntry || {
    previousStatus: conversation.status && conversation.status !== 'Escribiendo...' ? conversation.status : 'En línea',
    timer: null,
    staleTimer: null,
    startedAt: Date.now(),
    lastSignalAt: Date.now()
  };

  if (previousEntry.timer) clearTimeout(previousEntry.timer);
  if (previousEntry.staleTimer) clearTimeout(previousEntry.staleTimer);
  previousEntry.lastSignalAt = Date.now();
  previousEntry.timer = setTimeout(() => {
    const latestEntry = remoteTypingDisplayState.get(conversation.id);
    if (latestEntry !== previousEntry) return;

    if (previousEntry.staleTimer) clearTimeout(previousEntry.staleTimer);
    remoteTypingDisplayState.delete(conversation.id);
    if (conversation.status === 'Escribiendo...') {
      conversation.status = previousEntry.previousStatus || 'En línea';
    }
    renderCurrentSection();
  }, REMOTE_TYPING_GRACE_MS);

  remoteTypingDisplayState.set(conversation.id, previousEntry);
}

function updatePresenceStatus(data = {}) {
  const conversation = appState.conversations.find((item) => item.email === data.email || item.id === data.chatId || item.id === data.conversationId);
  if (!conversation) return;
  const nextStatus = data.status === 'online' ? 'En línea' : 'No disponible';
  const remoteTypingEntry = remoteTypingDisplayState.get(conversation.id);

  if (remoteTypingEntry) {
    remoteTypingEntry.previousStatus = nextStatus;
    conversation.status = 'Escribiendo...';
    renderCurrentSection();
    return;
  }

  conversation.status = nextStatus;
  persistState();
  renderCurrentSection();
}

function normalizePresenceStatus(status = 'online') {
  const normalized = String(status || '').trim().toLowerCase();
  if (['online', 'offline', 'away', 'busy'].includes(normalized)) return normalized;
  if (['en-linea', 'en línea', 'activo', 'available', 'disponible'].includes(normalized)) return 'online';
  if (['desconectado', 'inactivo', 'unavailable', 'no-disponible'].includes(normalized)) return 'offline';
  return 'online';
}

function syncPresenceStatus(status = 'online', options = {}) {
  if (!CHATER_CONFIG.backendBaseUrl || !getSessionEmail()) return;

  const normalizedStatus = normalizePresenceStatus(status);
  const now = Date.now();
  if (!options.force
    && presenceSyncState.status === normalizedStatus
    && now - Number(presenceSyncState.lastSyncedAt || 0) < PRESENCE_SYNC_MIN_INTERVAL_MS) {
    return;
  }

  presenceSyncState.status = normalizedStatus;
  presenceSyncState.lastSyncedAt = now;
  presenceSyncState.inFlight = true;

  apiClient.updatePresence(normalizedStatus, options)
    .catch(() => {
      // La presencia es efímera: no se encola para evitar estados obsoletos al reconectar.
    })
    .finally(() => {
      presenceSyncState.inFlight = false;
    });
}

function sendPresenceHeartbeat(status = 'online', options = {}) {
  const normalizedStatus = normalizePresenceStatus(status);
  sendStremeEvent({
    type: normalizedStatus === 'offline' ? 'presence.offline' : 'presence.heartbeat',
    status: normalizedStatus,
    userId: getCurrentUserIdentifier(),
    userEmail: getSessionEmail(),
    deviceId: getDeviceId()
  });
  syncPresenceStatus(normalizedStatus, options);
}

function sendTypingSignal(conversationId, isTyping) {
  if (!conversationId) return;
  const conversation = appState.conversations.find((item) => String(item.id || '') === String(conversationId));
  const payload = { type: isTyping ? 'typing.start' : 'typing.stop', chatId: conversationId, conversationId };
  const channels = conversation
    ? getConversationRealtimeChannels(conversation, { includeConversation: true, includeSelf: false, includeRemote: true })
    : [getConversationStremeChannel(conversationId)];

  if (channels.length) {
    channels.forEach((channel) => sendStremeEvent({ ...payload, channel, canal: channel }));
  } else {
    sendStremeEvent(payload);
  }

  apiClient.setTyping(conversationId, isTyping).catch(() => {});
}

function handleComposerTyping() {
  const conversation = getActiveConversation();
  if (!conversation || messageInput.disabled) return;

  if (typingState.isTyping && typingState.conversationId && typingState.conversationId !== conversation.id) {
    stopTypingNow(typingState.conversationId);
  }

  if (!typingState.isTyping || typingState.conversationId !== conversation.id) {
    typingState.isTyping = true;
    typingState.conversationId = conversation.id;
    sendTypingSignal(conversation.id, true);
  }

  clearTimeout(typingState.timer);
  typingState.timer = setTimeout(() => {
    stopTypingNow(conversation.id);
  }, REMOTE_TYPING_GRACE_MS);
}

function stopTypingNow(conversationId = typingState.conversationId) {
  const stoppedConversationId = conversationId || typingState.conversationId;
  clearTimeout(typingState.timer);

  if (!typingState.isTyping || !stoppedConversationId) {
    if (!typingState.isTyping) typingState.conversationId = '';
    return;
  }

  sendTypingSignal(stoppedConversationId, false);

  if (typingState.conversationId === stoppedConversationId) {
    typingState.isTyping = false;
    typingState.conversationId = '';
  }
}

function resetTypingStateForSessionEnd() {
  clearTimeout(typingState.timer);
  typingState.isTyping = false;
  typingState.conversationId = '';
  clearAllRemoteTypingStatuses();
}

async function logoutCurrentSession() {
  disconnectStremeRealtime();
  try {
    const sdk = getMemoriaBackendSdk();
    const sdkLogout = sdk?.cerrarSesion || sdk?.logout || sdk?.signOut || sdk?.salir;
    if (typeof sdkLogout === 'function') {
      await sdkLogout.call(sdk);
    }
  } catch (error) {
    // El cierre local no debe fallar si memoriaBACKEND no está disponible.
  } finally {
    clearSession();
    closeModal();
    renderShell();
  }
}

searchInput.addEventListener('input', () => {
  renderCurrentSection();
});

chatList.addEventListener('click', async (event) => {
  const createFromSearchButton = event.target.closest('[data-create-chat-from-search]');
  if (createFromSearchButton && activeSection === 'chats') {
    await startConversationFromSearch(createFromSearchButton.dataset.createChatFromSearch);
    return;
  }

  const openNewChatFromSearchButton = event.target.closest('[data-open-new-chat-from-search]');
  if (openNewChatFromSearchButton && activeSection === 'chats') {
    openNewChatModal({ name: searchInput?.value?.trim() || '' });
    return;
  }

  const button = event.target.closest('[data-tool]');
  if (!button || activeSection !== 'tools') return;
  await handleToolAction(button.dataset.tool);
});

messagesContainer.addEventListener('click', async (event) => {
  const retryButton = event.target.closest('[data-message-retry]');
  if (retryButton) {
    await retryMessageDelivery(retryButton.dataset.messageRetry);
    return;
  }

  const button = event.target.closest('[data-tool]');
  if (!button || activeSection !== 'tools') return;
  await handleToolAction(button.dataset.tool);
});

sectionTabs.forEach((tab) => {
  tab.addEventListener('click', () => {
    selectSection(tab.dataset.section);
  });
});

bottomNavButtons.forEach((button) => {
  button.addEventListener('click', () => {
    const section = button.dataset.bottomSection;
    const tool = button.dataset.bottomTool;

    if (tool === 'tools') {
      selectSection('tools');
      return;
    }

    selectSection(section);
  });
});

messageForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const text = messageInput.value.trim();

  if (!text) return;

  stopTypingNow();
  closeEmojiPanel();
  sendMessage(text);
  messageInput.value = '';
  updateComposerActionState();
  messageInput.focus();
});

newChatButton.addEventListener('click', openNewChatModal);
headerCameraButton?.addEventListener('click', handleHeaderCameraAction);
headerSearchButton?.addEventListener('click', focusSectionSearch);
floatingActionButton?.addEventListener('click', handleFloatingAction);
toolsButton.addEventListener('click', openSectionMenuModal);
profileButton.addEventListener('click', openProfileModal);
modalCloseButton.addEventListener('click', closeModal);
modalOverlay.addEventListener('click', (event) => {
  if (event.target === modalOverlay) closeModal();
});
emojiButton.addEventListener('click', toggleEmojiPanel);
attachButton.addEventListener('click', attachFilePlaceholder);
cameraComposerButton?.addEventListener('click', openCameraComposerPicker);
quickComposerButton?.addEventListener('click', openQuickComposerActionsModal);
voiceNoteButton?.addEventListener('click', toggleVoiceNoteRecording);
audioCallButton.addEventListener('click', () => startCall('voice'));
videoCallButton.addEventListener('click', () => startCall('video'));
pinConversationButton?.addEventListener('click', toggleActiveConversationPin);
archiveConversationButton?.addEventListener('click', toggleActiveConversationArchive);
conversationMenuButton?.addEventListener('click', openActiveConversationFloatingMenu);
backButton.addEventListener('click', () => {
  closeTransientPanels();
  setMobileSearchVisible(false);
  chatView.classList.remove('chat-open');
});
messageInput.addEventListener('input', () => {
  updateComposerActionState();
  handleComposerTyping();
});

window.addEventListener('beforeunload', () => {
  stopTypingNow();
  cancelVoiceNoteRecording();
  sendPresenceHeartbeat('offline', { force: true, keepalive: true });
});

window.addEventListener('online', flushBackendOutbox);
window.addEventListener('hashchange', () => applyDeepLinkFromLocation({ source: 'hashchange' }));
navigator.serviceWorker?.addEventListener('message', (event) => handleNotificationClientMessage(event.data || {}));

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    closeModal();
    closeEmojiPanel();
    closeChatFloatingMenu();
    if (chatSelectionState.active) closeChatSelectionMode();
  }
});

applyAutomaticTheme();
setInterval(applyAutomaticTheme, 60 * 1000);
setInterval(() => {
  if (pruneExpiredStates() && !chatView.hidden) {
    renderCurrentSection();
  }
}, STATE_EXPIRY_SWEEP_INTERVAL_MS);
scheduleNextEphemeralLocalPurge('bootstrap');
renderEmojiPanel();
updateComposerActionState();
startMemoriaBackendKeepalive();
registerMemoriaBackendLoginListeners();
registerClientTelemetryListeners();
registerStaticSiteOpening();
bootstrapGoogleGmailSession();
