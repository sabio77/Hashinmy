const chaterVolatileStorage = new Map();
const chaterVolatileSessionStorage = new Map();
const chaterRuntimeAuth = {
  accessToken: '',
  refreshToken: '',
  verifiedAt: 0
};
let chaterStorageWarningShown = false;
let chaterSessionStorageWarningShown = false;

function getBrowserLocalStorage() {
  try {
    return window.localStorage || null;
  } catch (error) {
    return null;
  }
}

function getBrowserSessionStorage() {
  try {
    return window.sessionStorage || null;
  } catch (error) {
    return null;
  }
}

function warnStorageFallback(error) {
  if (chaterStorageWarningShown) return;
  chaterStorageWarningShown = true;
  console.warn('ChatER usa almacenamiento temporal porque el almacenamiento persistente del navegador no está disponible.', error);
}

function warnSessionStorageFallback(error) {
  if (chaterSessionStorageWarningShown) return;
  chaterSessionStorageWarningShown = true;
  console.warn('ChatER conserva credenciales temporales solo en memoria de la pestaña porque sessionStorage no está disponible.', error);
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

function readSessionStorageItem(key, fallbackValue = '') {
  const storageKey = String(key || '');
  if (!storageKey) return fallbackValue;

  try {
    const storage = getBrowserSessionStorage();
    if (storage) {
      const value = storage.getItem(storageKey);
      if (value !== null && value !== undefined) return value;
    }
  } catch (error) {
    warnSessionStorageFallback(error);
  }

  if (chaterVolatileSessionStorage.has(storageKey)) return chaterVolatileSessionStorage.get(storageKey);
  return fallbackValue;
}

function writeSessionStorageItem(key, value, options = {}) {
  const storageKey = String(key || '');
  if (!storageKey) return false;

  const serializedValue = String(value ?? '');
  chaterVolatileSessionStorage.set(storageKey, serializedValue);

  try {
    const storage = getBrowserSessionStorage();
    if (!storage) throw new Error('sessionStorage no está disponible.');
    storage.setItem(storageKey, serializedValue);
    return true;
  } catch (error) {
    warnSessionStorageFallback(error);
    if (options.throwOnError) throw error;
    return false;
  }
}

function removeSessionStorageItem(key) {
  const storageKey = String(key || '');
  if (!storageKey) return false;

  chaterVolatileSessionStorage.delete(storageKey);

  try {
    const storage = getBrowserSessionStorage();
    if (storage) storage.removeItem(storageKey);
    return true;
  } catch (error) {
    warnSessionStorageFallback(error);
    return false;
  }
}

const CHATER_CONFIG = {
  backendBaseUrl: normalizeMemoriaBackendBaseUrl(window.CHATER_CONFIG?.MEMORIA_BACKEND_URL || ''),
  siteId: normalizeMemoriaSiteId(window.CHATER_CONFIG?.MEMORIA_SITE_ID || window.CHATER_CONFIG?.SITE_ID || ''),
  projectOrigin: normalizeMemoriaProjectOrigin(window.CHATER_CONFIG?.MEMORIA_PROJECT_ORIGIN || window.CHATER_CONFIG?.ORIGEN_PROYECTO || window.CHATER_CONFIG?.PROJECT_ORIGIN || ''),
  apiPrefix: normalizeMemoriaApiPrefix(window.CHATER_CONFIG?.MEMORIA_API_PREFIX || '/api/v1'),
  realtimeUrl: window.CHATER_CONFIG?.STREME_REALTIME_URL || '',
  realtimeTransport: window.CHATER_CONFIG?.STREME_TRANSPORT || 'auto',
  stremeChannel: normalizeMemoriaChannel(window.CHATER_CONFIG?.STREME_CHANNEL || 'chater-general'),
  enableStaticVisitTracking: window.CHATER_CONFIG?.ENABLE_STATIC_VISIT_TRACKING !== false,
  enableClientTelemetry: window.CHATER_CONFIG?.ENABLE_CLIENT_TELEMETRY !== false,
  requireGoogleGmailAuth: window.CHATER_CONFIG?.REQUIRE_GOOGLE_GMAIL_AUTH !== false,
  requireGmailDomain: window.CHATER_CONFIG?.REQUIRE_GMAIL_DOMAIN !== false,
  enableGoogleLoginScript: window.CHATER_CONFIG?.ENABLE_GOOGLE_LOGIN_SCRIPT !== false,
  autoLoadGoogleLoginScript: window.CHATER_CONFIG?.AUTOLOAD_GOOGLE_LOGIN_SCRIPT !== false,
  googleLoginScriptUrl: window.CHATER_CONFIG?.GOOGLE_LOGIN_SCRIPT_URL || '',
  googleLoginBrandName: window.CHATER_CONFIG?.GOOGLE_LOGIN_BRAND_NAME || 'ChatER',
  googleLoginThemeColor: window.CHATER_CONFIG?.GOOGLE_LOGIN_THEME_COLOR || '#25d366',
  googleLoginLogoUrl: window.CHATER_CONFIG?.GOOGLE_LOGIN_LOGO_URL || '',
  googleLoginBackgroundUrl: window.CHATER_CONFIG?.GOOGLE_LOGIN_BACKGROUND_URL || '',
  enableRemoteUserPreferences: window.CHATER_CONFIG?.ENABLE_REMOTE_USER_PREFERENCES !== false,
  apiTimeoutMs: resolvePositiveConfigNumber(window.CHATER_CONFIG?.API_TIMEOUT_MS, 15000),
  mediaUploadTimeoutMs: resolvePositiveConfigNumber(window.CHATER_CONFIG?.MEDIA_UPLOAD_TIMEOUT_MS, 60000),
  r2xImageMaxBytes: resolvePositiveConfigNumber(window.CHATER_CONFIG?.TEMP_IMAGE_R2X_MAX_BYTES, 256000),
  enableR2xImageUploads: window.CHATER_CONFIG?.ENABLE_R2X_IMAGE_UPLOADS !== false,
  pushPublicKey: window.CHATER_CONFIG?.PUSH_PUBLIC_KEY || '',
  messageMediaPreviewMaxBytes: resolvePositiveConfigNumber(window.CHATER_CONFIG?.MESSAGE_MEDIA_PREVIEW_MAX_BYTES, 1500000),
  lightStartsAt: 6,
  darkStartsAt: 18,
  sessionKey: 'chater.session.email',
  accessTokenKey: 'chater.session.accessToken',
  refreshTokenKey: 'chater.session.refreshToken',
  userIdKey: 'chater.session.userId',
  authProviderKey: 'chater.session.authProvider',
  backendSessionVerifiedAtKey: 'chater.session.backendVerifiedAt',
  deviceKey: 'chater.device.id',
  stremeLastEventKey: 'chater.streme.lastEventId',
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

  if (!email && !userId && !displayName) return null;

  return {
    ...(userId ? { userId } : {}),
    ...(email ? { email, userEmail: email } : {}),
    ...(displayName ? { displayName, name: displayName } : {}),
    role: participant.role || participant.kind || fallbackRole
  };
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
    {
      ...(contactUserId ? { userId: contactUserId } : {}),
      email: contactEmail,
      displayName: contactDisplayName,
      role: 'contact'
    }
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
  const aliasesByEntity = {
    conversation: ['conversation', 'chat', 'conversacion'],
    chat: ['chat', 'conversation', 'conversacion'],
    message: ['message', 'mensaje'],
    state: ['state', 'status', 'estado', 'publicacion', 'publicacionEfimera', 'publicacion_efimera'],
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
  if (backendUserId) writeStorageItem(CHATER_CONFIG.userIdKey, backendUserId);
  return backendUserId;
}

function normalizeAuthPayload(payload = {}, fallbackEmail = '') {
  if (!payload || typeof payload !== 'object') return payload || {};
  const data = payload.data && typeof payload.data === 'object' ? payload.data : {};
  const session = payload.session || data.session || data.auth || data.tokens || {};
  const compactUser = payload.u || data.u || session.u || {};
  const user = payload.user || data.user || data.profile || data.perfil || session.user || compactUser || {};
  const accessToken = payload.accessToken
    || data.accessToken
    || session.accessToken
    || payload.token
    || data.token
    || session.token
    || payload.tk
    || data.tk
    || session.tk
    || payload.signedSession
    || data.signedSession
    || session.signedSession
    || '';
  const refreshToken = payload.refreshToken || data.refreshToken || session.refreshToken || '';
  const email = normalizeStorageIdentity(
    user.email
    || user.e
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
  const firebase = payload.firebase || data.firebase || session.firebase || user.firebase || {};
  const claims = payload.claims || data.claims || session.claims || user.claims || {};
  const claimsFirebase = claims.firebase || {};
  const provider = String(
    user.provider
    || user.providerId
    || user.authProvider
    || user.signInProvider
    || user.sign_in_provider
    || compactUser.provider
    || compactUser.providerId
    || compactUser.authProvider
    || compactUser.signInProvider
    || compactUser.sign_in_provider
    || compactUser.pr
    || payload.authProvider
    || payload.provider
    || payload.providerId
    || payload.signInProvider
    || payload.sign_in_provider
    || data.authProvider
    || data.provider
    || data.providerId
    || data.signInProvider
    || data.sign_in_provider
    || session.authProvider
    || session.provider
    || session.providerId
    || session.signInProvider
    || session.sign_in_provider
    || firebase.sign_in_provider
    || firebase.signInProvider
    || firebase.provider
    || firebase.providerId
    || claimsFirebase.sign_in_provider
    || claimsFirebase.signInProvider
    || claimsFirebase.provider
    || ''
  ).trim();

  return {
    ...payload,
    accessToken,
    refreshToken,
    authProvider: provider,
    user: {
      ...user,
      id: user.id || user.i || compactUser.i || user.uid || compactUser.uid || '',
      uid: user.uid || user.i || compactUser.i || user.id || '',
      email,
      name: user.name || user.n || compactUser.n || user.displayName || '',
      photoURL: user.photoURL || user.p || compactUser.p || user.avatarUrl || '',
      provider: provider || user.provider || ''
    }
  };
}

function extractGoogleFirebaseIdTokenFromPayload(payload = {}) {
  const visited = new Set();
  const directKeys = ['idToken', 'id_token', 'firebaseIdToken', 'firebaseToken', 'googleIdToken', 'tokenId', 'credential'];
  const nestedKeys = ['data', 'session', 'auth', 'tokens', 'firebase', 'credentialData', 'credential', 'user', 'claims'];

  const visit = (candidate, depth = 0) => {
    if (!candidate || typeof candidate !== 'object' || visited.has(candidate) || depth > 4) return '';
    visited.add(candidate);

    for (const key of directKeys) {
      const value = candidate[key];
      if (typeof value === 'string' && value.trim()) return value.trim();
    }

    for (const key of nestedKeys) {
      const nested = candidate[key];
      const nestedToken = visit(nested, depth + 1);
      if (nestedToken) return nestedToken;
    }

    return '';
  };

  return visit(payload);
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

function getDefaultStremeChannel() {
  const activeConversation = typeof getActiveConversation === 'function' ? getActiveConversation() : null;
  if (activeConversation?.id) return `chater-conversacion-${activeConversation.id}`;
  return CHATER_CONFIG.stremeChannel || 'chater-general';
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

const initialSessionEmail = readStorageItem(CHATER_CONFIG.sessionKey, '');

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
      status: 'Escribiendo...',
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
let activeStateId = appState.states[0]?.id || null;
let activeStateStorageEmail = normalizeStorageIdentity(initialSessionEmail);
let stremeSocket = null;
let stremeEventSource = null;
let stremeActiveTransport = 'none';
let stremeReconnectTimer = null;
let stremeReconnectAttempts = 0;
let stremeManualDisconnect = false;
let stremeSessionGuard = null;
let pushConfigCache = null;
let pushConfigInFlight = null;
let toastTimer = null;
let activeSessionRuntimeId = 0;
let activeSessionRuntimeEmail = normalizeStorageIdentity(initialSessionEmail);
let authAttemptRuntimeId = 0;
let activeGoogleLoginAttemptGuard = null;
let activeModalKind = '';
let activeEmojiMode = 'emoji';
let activeEmojiCategoryId = 'recent';
let initialSyncInFlight = '';
let outboxFlushInFlight = '';
let outboxRetryTimer = null;
const messageHistoryHydration = {
  inFlight: new Set(),
  retryAfterMs: 30000
};
const typingState = {
  isTyping: false,
  timer: null,
  conversationId: ''
};

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

const loginView = document.getElementById('loginView');
const chatView = document.getElementById('chatView');
const loginForm = document.getElementById('loginForm');
const emailInput = document.getElementById('emailInput');
const loginFeedback = document.getElementById('loginFeedback');
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
    const token = getAccessToken();
    const method = String(fetchOptions.method || 'GET').toUpperCase();
    const hasBody = fetchOptions.body !== undefined && fetchOptions.body !== null;
    const isJsonBody = hasBody && typeof fetchOptions.body === 'string';
    const mutationId = String(idempotencyKey || extractIdempotencyKeyFromBody(fetchOptions.body) || '').trim();
    const headers = {
      Accept: 'application/json',
      ...(isJsonBody ? { 'Content-Type': 'application/json' } : {}),
      ...(siteScoped && getMemoriaSiteId() ? { 'X-MB-Site': getMemoriaSiteId() } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(method !== 'GET' && method !== 'HEAD' ? { 'X-Hashinmy-Action': 'webapp' } : {}),
      ...(mutationId ? { 'X-MB-Idempotency-Key': mutationId } : {}),
      ...(optionHeaders || {})
    };

    const response = await fetchWithTimeout(buildApiUrl(path, { siteScoped }), {
      credentials: 'include',
      ...fetchOptions,
      headers
    }, timeoutMs);

    if (response.status === 401 && !skipRefresh && getRefreshToken()) {
      try {
        await this.refreshSession();
      } catch (error) {
        handleProtectedApiAuthFailure(path, error);
        throw error;
      }
      return this.request(path, { ...options, skipRefresh: true });
    }

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
  getAuthProviders() {
    return this.request('/auth/providers', { skipRefresh: true });
  },
  checkAuth() {
    return this.request('/auth/check', { skipRefresh: true })
      .then((payload) => normalizeAuthPayload(payload));
  },
  createFirebaseSession(idToken, options = {}) {
    const clientMutationId = options.clientMutationId || generateClientMutationId();
    return this.request('/auth/firebase/session', {
      method: 'POST',
      skipRefresh: true,
      idempotencyKey: clientMutationId,
      body: JSON.stringify(withMemoriaSitePayload({
        idToken,
        id: idToken,
        next: options.next || getCurrentPageUrl(),
        deviceId: getDeviceId(),
        clientMutationId
      }))
    }).then((payload) => normalizeAuthPayload(payload));
  },
  login(email) {
    return startGoogleGmailLogin({ fallbackEmail: email });
  },
  verifyOtp(email, otp) {
    return Promise.reject(new Error('ChatER solo permite acceso con Google/Gmail mediante AUTENTICACIONx de memoriaBACKEND.'));
  },
  refreshSession() {
    const clientMutationId = generateClientMutationId();
    return this.request('/auth/refresh', {
      method: 'POST',
      skipRefresh: true,
      idempotencyKey: clientMutationId,
      body: JSON.stringify(withMemoriaSitePayload({
        refreshToken: getRefreshToken(),
        deviceId: getDeviceId(),
        clientMutationId
      }))
    }).then((payload) => {
      const normalizedPayload = normalizeAuthPayload(payload, getSessionEmail());
      persistAuthTokens(normalizedPayload);
      return normalizedPayload;
    });
  },
  logout() {
    const clientMutationId = generateClientMutationId();
    return this.request('/auth/logout', {
      method: 'POST',
      idempotencyKey: clientMutationId,
      body: JSON.stringify(withMemoriaSitePayload({
        refreshToken: getRefreshToken(),
        deviceId: getDeviceId(),
        clientMutationId
      }))
    });
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
    params.set('conversationId', conversationId);
    params.set('limit', String(options.limit || 50));
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
  sendMessage(conversationId, text, clientMessageId) {
    return this.request('/api/v1/mensajes', {
      method: 'POST',
      idempotencyKey: clientMessageId,
      body: JSON.stringify(withMemoriaSitePayload({
        conversationId,
        senderUserId: getCurrentUserIdentifier(),
        senderUserEmail: getSessionEmail(),
        text,
        status: 'sent',
        clientTime: new Date().toISOString(),
        clientMutationId: clientMessageId
      }))
    });
  },
  createConversation(contact) {
    const clientMutationId = contact.clientMutationId || generateClientMutationId();
    return this.request('/api/v1/conversaciones', {
      method: 'POST',
      idempotencyKey: clientMutationId,
      body: JSON.stringify(withMemoriaSitePayload({
        type: 'direct',
        participants: buildConversationCreateParticipants(contact),
        ownerUserId: normalizeBackendUserId(getSessionUserId()),
        ownerUserEmail: getSessionEmail(),
        contactUserId: normalizeBackendUserId(contact.userId || contact.contactUserId || contact.internalUserId || contact.uid || contact.id || ''),
        contactEmail: normalizeStorageIdentity(contact.email || contact.contactEmail || contact.userEmail || ''),
        displayName: String(contact.name || contact.displayName || contact.alias || contact.email || '').trim(),
        title: String(contact.name || contact.displayName || contact.alias || contact.email || '').trim(),
        status: 'active',
        metadata: { source: 'chater-static-site' },
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
        favorite: Boolean(contact.favorite),
        blocked: Boolean(contact.blocked),
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
    return this.request('/api/v1/media-firmada', {
      method: 'POST',
      timeoutMs: CHATER_CONFIG.mediaUploadTimeoutMs,
      idempotencyKey: clientMutationId,
      body: JSON.stringify(withMemoriaSitePayload({
        entityType: 'mensaje',
        entityId: clientMutationId,
        filename: file.name,
        fileName: file.name,
        mimeType: file.type || 'application/octet-stream',
        size: file.size,
        sizeBytes: file.size,
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
        status: payload.status || 'uploaded',
        uploaded: payload.uploaded !== false,
        uploadedAt: payload.uploadedAt || new Date().toISOString(),
        clientMutationId
      }))
    });
  },
  getMediaReadUrl(mediaId, options = {}) {
    const params = new URLSearchParams({
      mediaId,
      userId: options.userId || getCurrentUserIdentifier(),
      userEmail: options.userEmail || getSessionEmail()
    });
    if (options.entityType) params.set('entityType', options.entityType);
    if (options.entityId) params.set('entityId', options.entityId);
    if (options.conversationId) params.set('conversationId', options.conversationId);
    return this.request(`/api/v1/media-firmada/${encodeURIComponent(mediaId)}/leer?${params.toString()}`, {
      timeoutMs: CHATER_CONFIG.mediaUploadTimeoutMs
    });
  },
  createR2xImageIntent(file, options = {}, clientMutationId = generateClientMutationId()) {
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
        width: options.width || 0,
        height: options.height || 0,
        sha256: options.sha256 || '',
        entityType: options.entityType || 'mensaje',
        entityId: options.entityId || clientMutationId,
        conversationId: options.conversationId || '',
        metadata: {
          source: 'chater-static-site',
          originalFilename: options.originalFilename || '',
          originalMimeType: options.originalMimeType || ''
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
    return this.request('/api/v1/mensajes', {
      method: 'POST',
      idempotencyKey: clientMutationId,
      body: JSON.stringify(withMemoriaSitePayload({
        conversationId,
        senderUserId: getCurrentUserIdentifier(),
        senderUserEmail: getSessionEmail(),
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
        clientTime: payload.clientTime || new Date().toISOString(),
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
  publishStremeEvent(payload) {
    const clientMutationId = payload.clientMutationId || generateClientMutationId();
    const channel = payload.channel || payload.canal || (payload.chatId ? `chater-conversacion-${payload.chatId}` : getDefaultStremeChannel());
    return this.request('/api/v1/streme/eventos', {
      method: 'POST',
      idempotencyKey: clientMutationId,
      body: JSON.stringify(withMemoriaSitePayload({
        canal: channel,
        channel,
        type: payload.type || payload.tipo || 'chater.event',
        tipo: payload.type || payload.tipo || 'chater.event',
        payload,
        datos: payload,
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

function getCurrentProjectOrigin() {
  return CHATER_CONFIG.projectOrigin || window.location.origin || '';
}

function getCurrentPageUrl() {
  const origin = getCurrentProjectOrigin();
  if (!origin) return `${window.location.origin}${window.location.pathname}${window.location.search}${window.location.hash}`;
  return `${origin}${window.location.pathname}${window.location.search}${window.location.hash}`;
}

function decorateMemoriaGoogleLoginUrl(rawUrl, options = {}) {
  const loginUrl = new URL(rawUrl, window.location.origin);
  if (getMemoriaSiteId() && !loginUrl.searchParams.has('s')) loginUrl.searchParams.set('s', getMemoriaSiteId());
  if (!loginUrl.searchParams.has('n')) loginUrl.searchParams.set('n', CHATER_CONFIG.googleLoginBrandName || 'ChatER');
  if (!loginUrl.searchParams.has('c')) loginUrl.searchParams.set('c', CHATER_CONFIG.googleLoginThemeColor || '#25d366');
  if (options.includeNext !== false && !loginUrl.searchParams.has('next')) loginUrl.searchParams.set('next', getCurrentPageUrl());
  if (CHATER_CONFIG.googleLoginLogoUrl && !loginUrl.searchParams.has('l')) loginUrl.searchParams.set('l', CHATER_CONFIG.googleLoginLogoUrl);
  if (CHATER_CONFIG.googleLoginBackgroundUrl && !loginUrl.searchParams.has('bg')) loginUrl.searchParams.set('bg', CHATER_CONFIG.googleLoginBackgroundUrl);
  return loginUrl.toString();
}

function buildMemoriaGoogleLoginUrl(path = '/auth/login') {
  return decorateMemoriaGoogleLoginUrl(buildApiUrl(path, { siteScoped: true }));
}

function uniqueLoginUrls(urls = []) {
  const seen = new Set();
  return urls.filter((url) => {
    const normalized = String(url || '').trim();
    if (!normalized || seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  });
}

function buildMemoriaGoogleLoginScriptUrlCandidates() {
  const candidates = [];
  const configuredScriptUrl = String(CHATER_CONFIG.googleLoginScriptUrl || '').trim();

  if (configuredScriptUrl) {
    try {
      candidates.push(decorateMemoriaGoogleLoginUrl(configuredScriptUrl));
    } catch (error) {
      console.warn('GOOGLE_LOGIN_SCRIPT_URL no es una URL válida; se usará la URL calculada desde MEMORIA_BACKEND_URL.', error);
    }
  }

  try {
    candidates.push(buildMemoriaGoogleLoginUrl('/login.js'));
  } catch (error) {
    console.warn('No se pudo calcular /login.js desde MEMORIA_BACKEND_URL.', error);
  }

  return uniqueLoginUrls(candidates);
}

function buildMemoriaGoogleLoginScriptUrl() {
  return buildMemoriaGoogleLoginScriptUrlCandidates()[0] || '';
}

function buildRuntimeMemoriaGoogleLoginScriptUrl(loginScriptUrl = buildMemoriaGoogleLoginScriptUrl()) {
  if (!loginScriptUrl) return '';

  try {
    const runtimeUrl = new URL(loginScriptUrl, window.location.origin);
    runtimeUrl.searchParams.set('_chaterAuth', String(Date.now()));
    return runtimeUrl.toString();
  } catch (error) {
    const separator = loginScriptUrl.includes('?') ? '&' : '?';
    return `${loginScriptUrl}${separator}_chaterAuth=${Date.now()}`;
  }
}

function shouldRequireGoogleGmailAuth() {
  // Requisito obligatorio del producto: chatER solo puede abrirse con
  // AUTENTICACIONx validando Google/Gmail. La bandera histórica de config se
  // conserva por compatibilidad de despliegues, pero ya no puede actuar como
  // bypass de acceso a la interfaz protegida.
  return true;
}

function isAllowedGmailAddress(email = '') {
  const normalized = normalizeStorageIdentity(email);
  if (!normalized) return false;
  if (CHATER_CONFIG.requireGmailDomain === false) return true;
  return normalized.endsWith('@gmail.com') || normalized.endsWith('@googlemail.com');
}

function getAuthPayloadEmail(payload = {}, fallbackEmail = '') {
  return normalizeAuthPayload(payload, fallbackEmail)?.user?.email || normalizeStorageIdentity(fallbackEmail);
}

function getAuthProviderEvidence(payload = {}) {
  if (!payload || typeof payload !== 'object') return '';

  const normalizedPayload = normalizeAuthPayload(payload);
  const data = normalizedPayload.data && typeof normalizedPayload.data === 'object' ? normalizedPayload.data : {};
  const session = normalizedPayload.session || data.session || data.auth || data.tokens || {};
  const compactUser = normalizedPayload.u || data.u || session.u || {};
  const user = normalizedPayload.user || data.user || data.profile || data.perfil || session.user || compactUser || {};
  const firebase = normalizedPayload.firebase || data.firebase || session.firebase || user.firebase || {};
  const claims = normalizedPayload.claims || data.claims || session.claims || user.claims || {};
  const claimsFirebase = claims.firebase || {};

  return String(
    normalizedPayload.authProvider
    || normalizedPayload.provider
    || normalizedPayload.providerId
    || normalizedPayload.signInProvider
    || normalizedPayload.sign_in_provider
    || data.authProvider
    || data.provider
    || data.providerId
    || data.signInProvider
    || data.sign_in_provider
    || session.authProvider
    || session.provider
    || session.providerId
    || session.signInProvider
    || session.sign_in_provider
    || user.authProvider
    || user.provider
    || user.providerId
    || user.signInProvider
    || user.sign_in_provider
    || compactUser.provider
    || compactUser.providerId
    || compactUser.pr
    || firebase.sign_in_provider
    || firebase.signInProvider
    || firebase.provider
    || claimsFirebase.sign_in_provider
    || claimsFirebase.signInProvider
    || ''
  ).trim().toLowerCase();
}

function isGoogleProviderPayload(payload = {}) {
  const provider = getAuthProviderEvidence(payload);
  return provider.includes('google') || provider.includes('gmail');
}

function validateGoogleGmailAuthPayload(payload = {}, fallbackEmail = '') {
  const normalizedPayload = normalizeAuthPayload(payload, '');
  // La identidad autorizada debe venir del contrato real de AUTENTICACIONx
  // (`u.e`, `user.email`, `data.user.email`, etc.). No se acepta el correo
  // recordado en localStorage como prueba de sesión porque un static site no
  // puede usar identidad local para abrir ChatER.
  const backendEmail = getAuthPayloadEmail(normalizedPayload, '');
  const fallbackIdentity = normalizeStorageIdentity(fallbackEmail);
  const email = backendEmail || '';

  if (!email) {
    return { ok: false, message: 'memoriaBACKEND no devolvió el correo de la cuenta Google validada.' };
  }

  if (fallbackIdentity && backendEmail && fallbackIdentity !== backendEmail) {
    return { ok: false, message: 'La sesión Google/Gmail verificada por memoriaBACKEND no coincide con la cuenta local recordada.' };
  }

  if (!isGoogleProviderPayload(normalizedPayload)) {
    return { ok: false, message: 'memoriaBACKEND debe confirmar proveedor Google/Gmail en la sesión antes de abrir ChatER.' };
  }

  if (!isAllowedGmailAddress(email)) {
    return { ok: false, message: 'ChatER solo permite cuentas Gmail verificadas por Google.' };
  }

  return { ok: true, email, payload: normalizedPayload };
}

function markBackendSessionVerified() {
  const verifiedAt = Date.now();
  chaterRuntimeAuth.verifiedAt = verifiedAt;
  writeSessionStorageItem(CHATER_CONFIG.backendSessionVerifiedAtKey, String(verifiedAt));
  // Limpieza de compatibilidad: versiones anteriores guardaban esta marca en localStorage.
  removeStorageItem(CHATER_CONFIG.backendSessionVerifiedAtKey);
}

function isBackendSessionRecentlyVerified(maxAgeMs = 10 * 60 * 1000) {
  const verifiedAt = Number(chaterRuntimeAuth.verifiedAt || readSessionStorageItem(CHATER_CONFIG.backendSessionVerifiedAtKey, '0'));
  return Number.isFinite(verifiedAt) && verifiedAt > 0 && Date.now() - verifiedAt <= maxAgeMs;
}

function persistAuthProvider(provider = 'google.com') {
  writeStorageItem(CHATER_CONFIG.authProviderKey, provider || 'google.com');
}

function getMemoriaBackendSdk() {
  return window.memoriaBACKEND && typeof window.memoriaBACKEND === 'object' ? window.memoriaBACKEND : null;
}

function loadMemoriaGoogleLoginScript(options = {}) {
  if (!CHATER_CONFIG.backendBaseUrl || CHATER_CONFIG.enableGoogleLoginScript === false) {
    return Promise.reject(new Error('Configura MEMORIA_BACKEND_URL para usar el login Google/Gmail de memoriaBACKEND.'));
  }

  const existing = document.getElementById('memoriaBackendGoogleLoginScript');
  if (getMemoriaBackendSdk() && existing?.dataset.loaded === 'true') return Promise.resolve(existing);

  // Si un intento anterior falló, quedó incompleto o pertenece a una carga sin `next`,
  // se crea un nodo nuevo. Reusar un <script> que ya disparó error puede dejar
  // el siguiente intento sin eventos de load/error y bloquear el acceso Google/Gmail.
  if (existing) existing.remove();

  const loginScriptUrls = buildMemoriaGoogleLoginScriptUrlCandidates();
  if (!loginScriptUrls.length) {
    return Promise.reject(new Error('No se pudo construir la URL de login.js desde memoriaBACKEND. Revisa MEMORIA_BACKEND_URL, MEMORIA_SITE_ID y GOOGLE_LOGIN_SCRIPT_URL.'));
  }

  return new Promise((resolve, reject) => {
    let currentIndex = 0;
    let lastError = null;

    const tryNextScript = () => {
      if (currentIndex >= loginScriptUrls.length) {
        const currentOrigin = getCurrentProjectOrigin() || 'dominio_actual_no_disponible';
        const detail = lastError?.message ? `${lastError.message} ` : '';
        reject(new Error(`${detail}El bloqueo ocurre antes de Firebase: autoriza ${currentOrigin} en los origins del site ${getMemoriaSiteId()} dentro de memoriaBACKEND y confirma también el dominio en Firebase Authentication.`));
        return;
      }

      const baseScriptUrl = loginScriptUrls[currentIndex];
      currentIndex += 1;

      const script = document.createElement('script');
      script.id = 'memoriaBackendGoogleLoginScript';
      script.async = false;
      script.defer = false;
      script.referrerPolicy = 'strict-origin-when-cross-origin';
      script.dataset.loading = 'true';
      script.dataset.loaded = 'false';
      script.dataset.baseSrc = baseScriptUrl;

      script.onload = () => {
        script.dataset.loading = 'false';
        script.dataset.loaded = 'true';
        resolve(script);
      };

      script.onerror = () => {
        script.dataset.loading = 'false';
        script.dataset.loaded = 'false';
        script.remove();
        lastError = new Error('No se pudo cargar un candidato válido de login.js desde memoriaBACKEND.');
        tryNextScript();
      };

      script.src = buildRuntimeMemoriaGoogleLoginScriptUrl(baseScriptUrl);
      document.head.appendChild(script);
    };

    tryNextScript();
  });
}

async function verifyMemoriaSdkSession() {
  const sdk = getMemoriaBackendSdk();
  const verifier = sdk?.verificarSesion || sdk?.checkSession;
  if (typeof verifier !== 'function') return null;
  const payload = await verifier.call(sdk);
  if (payload?.ok === 0 || payload?.ok === false) return null;
  return normalizeAuthPayload({ ...payload, sessionVerified: true });
}

async function verifyGoogleGmailPayloadAgainstBackend(payload = {}, fallbackEmail = '', options = {}) {
  if (!CHATER_CONFIG.backendBaseUrl) {
    throw new Error('Configura MEMORIA_BACKEND_URL para validar la sesión Google/Gmail con memoriaBACKEND.');
  }

  const authGuard = options.authGuard || null;
  if (authGuard && !isAuthAttemptCurrent(authGuard)) {
    throw new Error('Intento de autenticación Google/Gmail cancelado.');
  }

  const candidatePayload = normalizeAuthPayload(payload, fallbackEmail);
  const candidateToken = candidatePayload.accessToken || '';
  const firebaseIdToken = extractGoogleFirebaseIdTokenFromPayload(payload) || extractGoogleFirebaseIdTokenFromPayload(candidatePayload);
  let checkedPayload;

  if (firebaseIdToken) {
    checkedPayload = await apiClient.createFirebaseSession(firebaseIdToken, {
      next: getCurrentPageUrl(),
      clientMutationId: options.clientMutationId || buildDeterministicMutationId('auth-firebase-session', candidatePayload.user?.email || fallbackEmail || firebaseIdToken.slice(-24))
    });
  } else {
    checkedPayload = await apiClient.request('/auth/check', {
      skipRefresh: true,
      headers: candidateToken ? { Authorization: `Bearer ${candidateToken}` } : {}
    });
  }

  if (authGuard && !isAuthAttemptCurrent(authGuard)) {
    throw new Error('Intento de autenticación Google/Gmail cancelado.');
  }

  if (checkedPayload?.ok === 0 || checkedPayload?.ok === false) {
    throw new Error(checkedPayload?.err || 'login_requerido');
  }

  const backendProviderEvidence = getAuthProviderEvidence(checkedPayload);
  const normalizedCheckedPayload = normalizeAuthPayload({
    ...checkedPayload,
    accessToken: checkedPayload.accessToken || checkedPayload.token || checkedPayload.tk || candidatePayload.accessToken || '',
    refreshToken: checkedPayload.refreshToken || candidatePayload.refreshToken || '',
    // La evidencia de proveedor debe venir de AUTENTICACIONx después de validar
    // /auth/check o /auth/firebase/session. El payload local del SDK solo aporta
    // token/candidatos, nunca reemplaza la confirmación Google/Gmail del backend.
    authProvider: backendProviderEvidence,
    sessionVerified: true
  });
  const validation = validateGoogleGmailAuthPayload(normalizedCheckedPayload, fallbackEmail);
  if (!validation.ok) throw new Error(validation.message);
  return validation;
}

async function restoreGoogleGmailSessionFromBackend(options = {}) {
  if (!CHATER_CONFIG.backendBaseUrl) return false;

  const authGuard = options.authGuard || null;
  if (authGuard && !isAuthAttemptCurrent(authGuard)) return false;

  try {
    const payload = await apiClient.checkAuth();
    if (authGuard && !isAuthAttemptCurrent(authGuard)) return false;

    if (payload?.ok === 0 || payload?.ok === false) {
      clearSession();
      return false;
    }

    const normalizedPayload = normalizeAuthPayload({ ...payload, sessionVerified: true }, '');
    const validation = validateGoogleGmailAuthPayload(normalizedPayload, getSessionEmail());
    if (!validation.ok) {
      if (!options.silent) loginFeedback.textContent = validation.message;
      clearSession();
      return false;
    }

    if (!completeAuthenticatedSession(validation.email, validation.payload, authGuard)) return false;
    return true;
  } catch (error) {
    if (authGuard && !isAuthAttemptCurrent(authGuard)) return false;

    if (isBackendAuthError(error) || shouldRequireGoogleGmailAuth()) {
      clearSession();
    }

    if (!options.silent) {
      loginFeedback.textContent = error?.message || 'No se pudo verificar la sesión Google/Gmail con memoriaBACKEND.';
    }
    return false;
  }
}

async function startGoogleGmailLogin(options = {}) {
  if (!CHATER_CONFIG.backendBaseUrl) {
    throw new Error('Configura MEMORIA_BACKEND_URL para proteger ChatER con Google/Gmail desde memoriaBACKEND.');
  }

  const authGuard = options.authGuard || activeGoogleLoginAttemptGuard || captureAuthAttempt(options.fallbackEmail || 'google-gmail');
  activeGoogleLoginAttemptGuard = authGuard;
  if (!isAuthAttemptCurrent(authGuard)) return { ok: false, staleAuthAttempt: true };

  loginFeedback.textContent = 'Abriendo autenticación segura con Google...';
  try {
    await loadMemoriaGoogleLoginScript({ interactive: true });
  } catch (error) {
    if (!isAuthAttemptCurrent(authGuard)) return { ok: false, staleAuthAttempt: true };
    console.warn('No se pudo cargar login.js directamente; se usará /auth/login como respaldo.', error);
    window.location.assign(buildMemoriaGoogleLoginUrl('/auth/login'));
    return { ok: true, pendingGoogleLogin: true, fallbackRedirect: true };
  }
  if (!isAuthAttemptCurrent(authGuard)) return { ok: false, staleAuthAttempt: true };

  const sdkSession = await verifyMemoriaSdkSession().catch(() => null);
  if (!isAuthAttemptCurrent(authGuard)) return { ok: false, staleAuthAttempt: true };

  if (sdkSession) {
    const validation = await verifyGoogleGmailPayloadAgainstBackend(sdkSession, options.fallbackEmail || '', { authGuard });
    if (!completeAuthenticatedSession(validation.email, validation.payload, authGuard)) return { ok: false, staleAuthAttempt: true };
    return validation.payload;
  }

  const sdk = getMemoriaBackendSdk();
  const openLogin = sdk?.abrirLogin || sdk?.openLogin;
  if (typeof openLogin === 'function') {
    try {
      const result = openLogin.call(sdk, { next: getCurrentPageUrl() });
      if (result && typeof result.then === 'function') await result;
      return { ok: true, pendingGoogleLogin: true };
    } catch (error) {
      if (!isAuthAttemptCurrent(authGuard)) return { ok: false, staleAuthAttempt: true };
      console.warn('No se pudo abrir login.js directamente; se usará /auth/login.', error);
    }
  }

  if (!isAuthAttemptCurrent(authGuard)) return { ok: false, staleAuthAttempt: true };
  window.location.assign(buildMemoriaGoogleLoginUrl('/auth/login'));
  return { ok: true, pendingGoogleLogin: true };
}

async function handleMemoriaBackendLoginEvent(event) {
  const authGuard = activeGoogleLoginAttemptGuard;
  if (authGuard && !isAuthAttemptCurrent(authGuard)) return;

  const payload = normalizeAuthPayload({ ...(event?.detail || {}), sessionVerified: true });

  try {
    // El evento oficial de login.js puede llegar después de una redirección o
    // en navegadores donde la cookie de tercero no queda disponible. En ese caso
    // todavía no existe correo local, pero el payload/tk/idToken debe poder
    // validarse contra AUTENTICACIONx antes de abrir ChatER.
    const validation = await verifyGoogleGmailPayloadAgainstBackend(payload, '', { authGuard });
    completeAuthenticatedSession(validation.email, validation.payload, authGuard);
  } catch (error) {
    if (authGuard && !isAuthAttemptCurrent(authGuard)) return;
    loginFeedback.textContent = error?.message || 'No se pudo validar la sesión Google/Gmail con memoriaBACKEND.';
    clearSession();
    renderShell();
  }
}

function registerMemoriaBackendLoginListeners() {
  window.addEventListener('memoriaBACKEND:login', handleMemoriaBackendLoginEvent);
  window.addEventListener('memoriaBACKEND:sdk-ready', () => {
    restoreGoogleGmailSessionFromBackend({ silent: true });
  });
}

async function bootstrapGoogleGmailSession() {
  renderBrandLogos();

  if (!shouldRequireGoogleGmailAuth()) {
    renderShell();
    return;
  }

  if (!CHATER_CONFIG.backendBaseUrl) {
    clearSession();
    loginFeedback.textContent = 'Configura MEMORIA_BACKEND_URL para acceder a ChatER con Google/Gmail.';
    renderShell();
    return;
  }

  if (!getSessionEmail()) {
    loginFeedback.textContent = 'Verificando sesión Google/Gmail...';
  }

  const restored = await restoreGoogleGmailSessionFromBackend({ silent: true });
  if (!restored) {
    clearSession();
    loginFeedback.textContent = 'Ingresa con una cuenta Gmail validada por Google para continuar.';
    renderShell();
    if (CHATER_CONFIG.autoLoadGoogleLoginScript) {
      loadMemoriaGoogleLoginScript({ silent: true }).catch((error) => {
        console.warn('No se pudo precargar login.js desde memoriaBACKEND; se reintentará al tocar Continuar con Google.', error);
        if (!getSessionEmail()) {
          loginFeedback.textContent = 'Ingresa con una cuenta Gmail validada por Google para continuar.';
        }
      });
    }
    return;
  }

  renderShell();
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

function captureAuthAttempt(email = '') {
  authAttemptRuntimeId += 1;
  const guard = {
    id: authAttemptRuntimeId,
    email: normalizeStorageIdentity(email)
  };
  activeGoogleLoginAttemptGuard = guard;
  return guard;
}

function invalidateAuthAttempts() {
  authAttemptRuntimeId += 1;
  activeGoogleLoginAttemptGuard = null;
}

function isAuthAttemptCurrent(guard) {
  return Boolean(guard && guard.id === authAttemptRuntimeId && !getSessionEmail());
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
    return parsed.filter((operation) => operation && operation.id && operation.type && operation.payload);
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

function enqueueBackendOperation(operation) {
  if (!CHATER_CONFIG.backendBaseUrl || !operation?.type || !operation?.payload) return null;

  const ownerEmail = normalizeStorageIdentity(getSessionEmail());
  if (shouldRequireGoogleGmailAuth() && !ownerEmail) {
    console.warn('No se encoló la operación pendiente porque no hay una sesión Google/Gmail vigente validada por memoriaBACKEND.');
    return null;
  }

  const queue = readBackendOutbox(ownerEmail);
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
    favorite: Boolean(contact.favorite || options.favorite),
    blocked: Boolean(contact.blocked || options.blocked),
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
      try {
        await replayBackendOperation(operation, sessionGuard);
        if (!isSessionGuardCurrent(sessionGuard)) break;
        persistBackendOutbox(readBackendOutbox(sessionGuard.email).filter((item) => item.id !== operation.id), sessionGuard.email);
      } catch (error) {
        if (!isSessionGuardCurrent(sessionGuard)) break;
        const updatedQueue = readBackendOutbox(sessionGuard.email).map((item) => {
          if (item.id !== operation.id) return item;
          return {
            ...item,
            attempts: Number(item.attempts || 0) + 1,
            lastAttemptAt: new Date().toISOString(),
            lastError: error?.message || 'No se pudo sincronizar la operación pendiente.'
          };
        });
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
    const eventPayload = operation.payload.event || operation.payload;
    await apiClient.publishStremeEvent(eventPayload);
    return;
  }

  if (operation.type === 'sendMessage') {
    const payload = await apiClient.sendMessage(
      operation.payload.conversationId,
      operation.payload.text,
      operation.payload.clientMessageId
    );
    if (!isSessionGuardCurrent(sessionGuard)) return;
    markQueuedMessageSynced(operation.payload.conversationId, operation.payload.clientMessageId, payload);
    return;
  }

  if (operation.type === 'createMediaMessage') {
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
  conversation.blocked = Boolean(blocked);
  conversation.blockSyncStatus = 'synced';
  conversation.blockSyncedAt = new Date().toISOString();
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
  conversation.blocked = nextBlocked;
  conversation.blockSyncStatus = CHATER_CONFIG.backendBaseUrl ? 'syncing' : 'local';
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
    conversation.archived = Boolean(patch.archived);
    conversation.archiveSyncStatus = 'synced';
    conversation.archiveSyncedAt = new Date().toISOString();
    conversation.status = conversation.archived ? 'Archivado' : 'Restaurado';
  }

  if (Object.prototype.hasOwnProperty.call(patch || {}, 'pinned')) {
    conversation.pinned = Boolean(patch.pinned);
    conversation.pinSyncStatus = 'synced';
    conversation.pinSyncedAt = new Date().toISOString();
    conversation.status = conversation.pinned ? 'Chat fijado' : 'Chat desfijado';
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

function replaceConversationIdInPayload(payload, localConversationId, remoteConversationId) {
  if (!payload || typeof payload !== 'object') return payload;

  const updatedPayload = { ...payload };
  if (updatedPayload.conversationId === localConversationId) updatedPayload.conversationId = remoteConversationId;
  if (updatedPayload.localConversationId === localConversationId) updatedPayload.localConversationId = remoteConversationId;
  if (updatedPayload.contact?.conversationId === localConversationId) {
    updatedPayload.contact = { ...updatedPayload.contact, conversationId: remoteConversationId };
  }
  return updatedPayload;
}

function markQueuedMessageSynced(conversationId, clientMessageId, payload = {}) {
  const remoteMessage = extractNestedObject(payload, ['message']);
  const conversation = appState.conversations.find((item) => item.id === conversationId);
  const message = conversation?.messages.find((item) => item.id === clientMessageId || item.clientMutationId === clientMessageId);

  if (message) {
    if (isMessageLikePayload(remoteMessage)) {
      updateExistingMessageFromRealtime(message, normalizeMessageFromApi(remoteMessage));
    }
    message.status = remoteMessage?.status || message.status || 'sent';
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

  if (conversation) conversation.status = 'Entregado';
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

function persistStremeLastEventId(lastEventId = '', metadata = {}) {
  const normalizedLastEventId = String(lastEventId || '').trim();
  if (!normalizedLastEventId) return;
  writeStorageItem(getStremeLastEventStorageKey(), normalizedLastEventId);
  scheduleSyncCursorUpdate(normalizedLastEventId, metadata);
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

function getEmojiRecentsStorageKey(email = getSessionEmail()) {
  return getScopedStorageKey(CHATER_CONFIG.emojiRecentsKey, email);
}

function getNotificationRegistrationStorageKey(email = getSessionEmail()) {
  return getScopedStorageKey(CHATER_CONFIG.notificationRegistrationKey, email);
}

function shouldAdoptLegacyStorage(email = '') {
  const identity = normalizeStorageIdentity(email);
  return Boolean(identity && identity === normalizeStorageIdentity(initialSessionEmail));
}

function readStoredStateFromKey(storageKey) {
  try {
    const saved = JSON.parse(readStorageItem(storageKey, 'null'));
    if (saved?.conversations?.length) {
      return normalizeLoadedState(saved);
    }
  } catch (error) {
    console.warn('No se pudo cargar el estado local de ChatER.', error);
  }
  return null;
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

  return JSON.parse(JSON.stringify(seedState));
}

function normalizeLoadedState(saved) {
  const state = {
    conversations: Array.isArray(saved.conversations) ? saved.conversations : [],
    states: Array.isArray(saved.states) ? saved.states : [],
    calls: Array.isArray(saved.calls) ? saved.calls : [],
    business: normalizeBusinessState(saved.business),
    privacy: normalizePrivacyState(saved.privacy)
  };

  state.conversations.forEach((conversation) => {
    conversation.messages = Array.isArray(conversation.messages) ? conversation.messages : [];
    conversation.avatar = conversation.avatar || getInitials(conversation.name || conversation.email);
    conversation.avatarImage = normalizeAssetImagePath(conversation.avatarImage || conversation.avatarAsset);
    conversation.archived = Boolean(conversation.archived || conversation.isArchived);
    conversation.pinned = Boolean(conversation.pinned || conversation.isPinned);
    conversation.pinSyncStatus = conversation.pinSyncStatus || '';
    conversation.pinSyncedAt = conversation.pinSyncedAt || '';
    conversation.archiveSyncStatus = conversation.archiveSyncStatus || '';
    conversation.archiveSyncedAt = conversation.archiveSyncedAt || '';
    conversation.blocked = Boolean(conversation.blocked || conversation.isBlocked);
    conversation.blockSyncStatus = conversation.blockSyncStatus || '';
    conversation.blockSyncedAt = conversation.blockSyncedAt || '';
    conversation.reportSyncStatus = conversation.reportSyncStatus || '';
    conversation.reportSyncedAt = conversation.reportSyncedAt || '';
    conversation.lastReportReason = conversation.lastReportReason || '';
    conversation.unread = Number(conversation.unread || 0);
    conversation.participants = normalizeConversationParticipantsForApi(conversation.participants, conversation.email || conversation.contactEmail, conversation.name || conversation.displayName);
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
  const ownerEmail = normalizeStorageIdentity(getSessionEmail());
  const storageKey = getStateStorageKey(ownerEmail);
  try {
    writeStorageItem(storageKey, JSON.stringify({ ...appState, ownerEmail }), { throwOnError: true });
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
  activeConversationId = appState.conversations[0]?.id || null;
  activeStateId = appState.states[0]?.id || null;
  activeSection = 'chats';
  messageHistoryHydration.inFlight.clear();
}

function activateSessionState(email, forceReload = false) {
  const identity = normalizeStorageIdentity(email);
  if (!forceReload && activeStateStorageEmail === identity) return;
  appState = loadState(identity);
  activeStateStorageEmail = identity;
  resetActivePointers();
}

function getSessionEmail() {
  return readStorageItem(CHATER_CONFIG.sessionKey, '');
}

function getSessionUserId() {
  return readStorageItem(CHATER_CONFIG.userIdKey, '');
}

function setSessionEmail(email) {
  writeStorageItem(CHATER_CONFIG.sessionKey, email);
}

function getAccessToken() {
  return chaterRuntimeAuth.accessToken || readSessionStorageItem(CHATER_CONFIG.accessTokenKey, '');
}

function getRefreshToken() {
  return chaterRuntimeAuth.refreshToken || readSessionStorageItem(CHATER_CONFIG.refreshTokenKey, '');
}

function persistAuthTokens(payload = {}) {
  const normalizedPayload = normalizeAuthPayload(payload);

  // AUTENTICACIONx emite cookie HttpOnly como sesión principal. Cuando entrega tk/token
  // para navegadores que bloquean cookies, el contrato de memoriaBACKEND exige que sea
  // temporal por pestaña, nunca persistente en localStorage.
  if (normalizedPayload.accessToken) {
    chaterRuntimeAuth.accessToken = normalizedPayload.accessToken;
    writeSessionStorageItem(CHATER_CONFIG.accessTokenKey, normalizedPayload.accessToken);
  }

  if (normalizedPayload.refreshToken) {
    chaterRuntimeAuth.refreshToken = normalizedPayload.refreshToken;
    writeSessionStorageItem(CHATER_CONFIG.refreshTokenKey, normalizedPayload.refreshToken);
  }

  removeStorageItem(CHATER_CONFIG.accessTokenKey);
  removeStorageItem(CHATER_CONFIG.refreshTokenKey);

  if (normalizedPayload.authProvider || normalizedPayload.user?.provider) {
    persistAuthProvider(normalizedPayload.authProvider || normalizedPayload.user.provider);
  }

  if (normalizedPayload.sessionVerified || normalizedPayload.ok === 1 || normalizedPayload.accessToken || normalizedPayload.refreshToken) {
    markBackendSessionVerified();
  }

  persistBackendUserIdFromPayload(normalizedPayload);
}

function hasBackendSessionCredentials() {
  if (!CHATER_CONFIG.backendBaseUrl) return !shouldRequireGoogleGmailAuth();
  return Boolean(getAccessToken() || getRefreshToken() || isBackendSessionRecentlyVerified());
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
  const rememberedEmail = normalizeStorageIdentity(email || getSessionEmail());
  clearSession();
  if (rememberedEmail) emailInput.value = rememberedEmail;
  loginFeedback.textContent = message;
}

function clearAuthTokens(email = getSessionEmail()) {
  chaterRuntimeAuth.accessToken = '';
  chaterRuntimeAuth.refreshToken = '';
  chaterRuntimeAuth.verifiedAt = 0;
  removeSessionStorageItem(CHATER_CONFIG.accessTokenKey);
  removeSessionStorageItem(CHATER_CONFIG.refreshTokenKey);
  removeSessionStorageItem(CHATER_CONFIG.backendSessionVerifiedAtKey);
  // Limpia credenciales legadas si una versión anterior las dejó persistidas.
  removeStorageItem(CHATER_CONFIG.accessTokenKey);
  removeStorageItem(CHATER_CONFIG.refreshTokenKey);
  removeStorageItem(CHATER_CONFIG.userIdKey);
  removeStorageItem(CHATER_CONFIG.authProviderKey);
  removeStorageItem(CHATER_CONFIG.backendSessionVerifiedAtKey);
  removeStorageItem(getStremeLastEventStorageKey(email));
  removeStorageItem(CHATER_CONFIG.stremeLastEventKey);
}

function clearSession() {
  const sessionEmail = getSessionEmail();
  disconnectStremeRealtime();
  resetTypingStateForSessionEnd();
  closeTransientUiForSessionEnd();
  clearAuthTokens(sessionEmail);
  removeStorageItem(CHATER_CONFIG.sessionKey);
  clearTimeout(outboxRetryTimer);
  invalidateAuthAttempts();
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
      serviceWorkerVersion: '2026-07-03-config-json-memoriabackend-88',
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
  return appState.conversations.find((conversation) => conversation.id === activeConversationId);
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
    .filter((conversation) => !conversation.archived)
    .sort(compareConversationsForList);
}

function getArchivedConversations() {
  return appState.conversations
    .filter((conversation) => conversation.archived)
    .sort(compareConversationsForList);
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
  image.src = 'assets/chater-logo.png';
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

function showToast(message) {
  clearTimeout(toastTimer);
  toast.textContent = message;
  toast.hidden = false;
  toastTimer = setTimeout(() => {
    toast.hidden = true;
  }, 2600);
}

function setModal(title, contentNodeOrHtml, modalKind = '') {
  activeModalKind = modalKind;
  modalTitle.textContent = title;
  modalBody.innerHTML = '';

  if (typeof contentNodeOrHtml === 'string') {
    modalBody.innerHTML = contentNodeOrHtml;
  } else {
    modalBody.appendChild(contentNodeOrHtml);
  }

  modalOverlay.hidden = false;
  renderNavigationState();
}

function closeModal() {
  if (activeModalKind === 'otp-auth' || activeModalKind === 'google-auth') {
    invalidateAuthAttempts();
  }
  activeModalKind = '';
  modalOverlay.hidden = true;
  modalBody.innerHTML = '';
  renderNavigationState();
}

function closeEmojiPanel() {
  if (!emojiPanel) return;
  emojiPanel.hidden = true;
  emojiButton.classList.remove('active');
}

function closeTransientPanels() {
  closeEmojiPanel();
}

function setMobileSearchVisible(visible) {
  if (!chatView) return;
  chatView.classList.toggle('mobile-search-visible', Boolean(visible));
}

function closeTransientUiForSessionEnd() {
  closeTransientPanels();
  cancelVoiceNoteRecording();
  closeModal();
}

function completeAuthenticatedSession(email, payload = {}, authGuard = null) {
  if (authGuard && !isAuthAttemptCurrent(authGuard)) return false;

  const normalizedPayload = normalizeAuthPayload(payload, '');
  const resolvedEmail = normalizedPayload.user?.email || normalizeStorageIdentity(email);

  if (shouldRequireGoogleGmailAuth()) {
    const validation = validateGoogleGmailAuthPayload(normalizedPayload, resolvedEmail);
    if (!validation.ok) {
      loginFeedback.textContent = validation.message;
      return false;
    }
  }

  if (CHATER_CONFIG.backendBaseUrl && !normalizedPayload?.accessToken && !normalizedPayload?.refreshToken && !normalizedPayload?.sessionVerified) {
    loginFeedback.textContent = 'memoriaBACKEND no confirmó credenciales ni cookie de sesión Google/Gmail. Inténtalo nuevamente.';
    return false;
  }

  invalidateAuthAttempts();
  persistAuthTokens({ ...normalizedPayload, sessionVerified: true });
  setSessionEmail(resolvedEmail);
  advanceSessionRuntime(resolvedEmail);
  activateSessionState(resolvedEmail, true);
  loginFeedback.textContent = '';
  closeModal();
  renderShell();
  return true;
}

function openOtpModal(email, authGuard) {
  const form = document.createElement('form');
  form.innerHTML = `
    <p class="modal-copy">ChatER ya no usa códigos OTP. Para continuar debes iniciar sesión con una cuenta Gmail validada por Google en memoriaBACKEND.</p>
    <p class="form-feedback" data-feedback role="status" aria-live="polite"></p>
    <button class="primary-button" type="submit">Continuar con Google</button>
  `;

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (authGuard && !isAuthAttemptCurrent(authGuard)) return;

    const feedback = form.querySelector('[data-feedback]');
    const submitButton = form.querySelector('button[type="submit"]');
    feedback.textContent = 'Abriendo autenticación Google/Gmail...';
    submitButton.disabled = true;

    try {
      await startGoogleGmailLogin({ fallbackEmail: email, authGuard });
    } catch (error) {
      feedback.textContent = error?.message || 'No se pudo abrir Google/Gmail desde memoriaBACKEND.';
      submitButton.disabled = false;
    }
  });

  setModal('Acceso Google/Gmail', form, 'google-auth');
  form.querySelector('button[type="submit"]')?.focus();
}

function renderShell() {
  renderBrandLogos();
  const email = getSessionEmail();

  if (email && CHATER_CONFIG.backendBaseUrl && !hasBackendSessionCredentials()) {
    requireFreshBackendLogin(email, 'Tu sesión anterior necesita validarse con Google/Gmail en memoriaBACKEND.');
    loginView.hidden = false;
    chatView.hidden = true;
    loginForm.querySelector('button[type="submit"]')?.focus();
    return;
  }

  if (email && shouldRequireGoogleGmailAuth() && !isAllowedGmailAddress(email)) {
    requireFreshBackendLogin(email, 'ChatER solo permite cuentas Gmail verificadas por Google.');
    loginView.hidden = false;
    chatView.hidden = true;
    loginForm.querySelector('button[type="submit"]')?.focus();
    return;
  }

  loginView.hidden = Boolean(email);
  chatView.hidden = !email;

  if (!email) {
    loginForm.querySelector('button[type="submit"]')?.focus();
    return;
  }

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
    openNewChatModal();
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
    openArchivedChatsModal();
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
  setMobileSearchVisible(false);
  const sectionChanged = activeSection !== section;
  if (sectionChanged) {
    stopTypingNow();
    if (searchInput) searchInput.value = '';
  }
  activeSection = section;
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
    return;
  }

  if (activeSection === 'tools') {
    closeTransientPanels();
    renderToolsList();
    setComposerEnabled(false);
    renderToolsPanel();
    return;
  }

  renderChatList(searchInput.value);
  renderConversation();
}

async function startConversationFromSearch(email = '') {
  const normalizedEmail = normalizeStorageIdentity(email);
  if (!isValidEmailAddress(normalizedEmail)) {
    openNewChatModal();
    return;
  }

  const conversation = getOrCreateConversationByEmail(normalizedEmail);
  activeConversationId = conversation.id;
  activeSection = 'chats';
  if (searchInput) searchInput.value = '';

  if (conversation.archived) {
    await setConversationArchived(conversation, false, { keepActive: true });
  }

  renderCurrentSection();
  chatView.classList.add('chat-open');
  hydrateConversationMessages(conversation.id);
  showToast(`Chat listo para ${normalizedEmail}.`);
}

function renderChatList(filter = '') {
  const normalizedFilter = filter.trim().toLowerCase();
  const visibleConversations = getVisibleConversations();
  const filteredConversations = visibleConversations.filter((conversation) => {
    return [conversation.name, conversation.email, conversation.messages.at(-1)?.text]
      .filter(Boolean)
      .some((value) => value.toLowerCase().includes(normalizedFilter));
  });

  chatList.innerHTML = '';

  if (!normalizedFilter) {
    chatList.appendChild(createArchivedChatsShortcut());
  }

  if (!filteredConversations.length) {
    const searchTerm = filter.trim();
    const canCreateFromEmail = Boolean(searchTerm && isValidEmailAddress(searchTerm));
    const archivedHint = getArchivedConversations().length ? 'También puedes revisar Archivados si buscas una conversación guardada.' : '';
    const emptyCopy = searchTerm
      ? `No hay coincidencias para “${escapeHTML(searchTerm)}”. ${archivedHint}`.trim()
      : (getArchivedConversations().length ? 'Revisa Archivados o usa el botón + para iniciar un chat por correo electrónico.' : 'Usa el botón + para iniciar un chat por correo electrónico.');
    chatList.insertAdjacentHTML('beforeend', `
      <div class="empty-state list-empty">
        <strong>${searchTerm ? 'Sin resultados' : 'No hay conversaciones activas'}</strong>
        <span>${emptyCopy}</span>
        ${canCreateFromEmail ? `<button class="primary-button inline-empty-action" type="button" data-create-chat-from-search="${escapeHTML(normalizeStorageIdentity(searchTerm))}">Crear chat con ${escapeHTML(normalizeStorageIdentity(searchTerm))}</button>` : ''}
        ${searchTerm && !canCreateFromEmail ? '<button class="secondary-button inline-empty-action" type="button" data-open-new-chat-from-search>Nuevo chat por correo</button>' : ''}
      </div>
    `);
    return;
  }

  filteredConversations.forEach((conversation) => {
    const lastMessage = conversation.messages.at(-1);
    const button = document.createElement('button');
    button.className = `chat-item ${conversation.id === activeConversationId ? 'active' : ''} ${conversation.pinned ? 'pinned' : ''}`;
    button.type = 'button';
    button.setAttribute('aria-label', `Abrir conversación con ${conversation.name}`);

    const avatar = createAvatarElement(conversation);
    const content = document.createElement('div');
    content.className = 'chat-item-content';
    content.innerHTML = `
      <p class="chat-item-name">${escapeHTML(conversation.name)}</p>
      <p class="chat-item-preview">${escapeHTML(lastMessage ? lastMessage.text : 'Sin mensajes todavía')}</p>
    `;

    const meta = document.createElement('span');
    meta.className = 'chat-item-time';
    meta.innerHTML = `${lastMessage ? `<span>${escapeHTML(lastMessage.time)}</span>` : ''}${conversation.pinned ? '<span class="pinned-badge" aria-label="Chat fijado" title="Chat fijado">📌</span>' : ''}${conversation.unread ? `<strong class="unread-badge">${conversation.unread}</strong>` : ''}`;

    button.append(avatar, content, meta);
    button.addEventListener('click', () => {
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

    chatList.appendChild(button);
  });
}

function createArchivedChatsShortcut() {
  const archivedCount = getArchivedConversations().length;
  const archivedUnread = getArchivedConversations().reduce((total, conversation) => total + Number(conversation.unread || 0), 0);
  const button = document.createElement('button');
  button.className = 'archive-shortcut';
  button.type = 'button';
  button.setAttribute('aria-label', 'Abrir conversaciones archivadas');
  button.innerHTML = `
    <span class="archive-shortcut-icon" aria-hidden="true">▣</span>
    <span class="archive-shortcut-label">Archivados</span>
    <span class="archive-shortcut-count">${archivedUnread || archivedCount}</span>
  `;
  button.addEventListener('click', openArchivedChatsModal);
  return button;
}

function renderStatesList() {
  const normalizedFilter = searchInput.value.trim().toLowerCase();
  const states = getActiveStates().filter((state) => {
    return [state.name, state.preview, getStateExpiryLabel(state), state.mediaSyncStatus].some((value) => String(value).toLowerCase().includes(normalizedFilter));
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
  const normalizedFilter = searchInput.value.trim().toLowerCase();
  const calls = appState.calls.filter((call) => {
    return [call.name, call.preview, call.type, call.status].some((value) => String(value).toLowerCase().includes(normalizedFilter));
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
    maxBytes: Math.max(1, Number(CHATER_CONFIG.r2xImageMaxBytes || 256000)),
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
  const maxBytes = maxByteCandidates.length ? Math.round(Math.min(...maxByteCandidates)) : defaultPolicy.maxBytes;

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
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('No se pudo convertir la imagen a WebP.'));
    }, 'image/webp', quality);
  });
}

async function loadImageSourceForCanvas(file) {
  if (typeof createImageBitmap === 'function') {
    return createImageBitmap(file);
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    return await new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('El navegador no pudo leer la imagen seleccionada.'));
      image.src = objectUrl;
    });
  } finally {
    URL.revokeObjectURL(objectUrl);
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

async function convertImageFileToTemporaryWebp(file, options = {}) {
  const maxBytes = Math.max(1, Number(options.maxBytes || CHATER_CONFIG.r2xImageMaxBytes || 256000));
  const maxDimension = Math.max(320, Number(options.maxDimension || 1600));
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
      canvas.width = targetWidth;
      canvas.height = targetHeight;
      context.clearRect(0, 0, targetWidth, targetHeight);
      context.drawImage(imageSource, 0, 0, targetWidth, targetHeight);

      const blob = await canvasToWebpBlob(canvas, quality);
      if (blob.size <= maxBytes) {
        const webpFile = typeof File === 'function'
          ? new File([blob], buildTemporaryWebpFilename(file.name), { type: 'image/webp', lastModified: Date.now() })
          : Object.assign(blob, { name: buildTemporaryWebpFilename(file.name) });
        return {
          file: webpFile,
          width: targetWidth,
          height: targetHeight,
          originalWidth,
          originalHeight,
          sha256: await calculateBlobSha256(blob),
          originalFileName: file.name || '',
          originalMimeType: file.type || ''
        };
      }

      if (quality > 0.55) {
        quality = Math.max(0.55, quality - 0.08);
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

  const converted = await convertImageFileToTemporaryWebp(file, {
    maxBytes: policy.maxBytes,
    maxDimension: policy.maxDimension
  });

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
      originalMimeType: converted.originalMimeType
    }, `${clientMutationId}:r2x-intent`);

    preparedUpload = normalizeR2xImageUploadPreparation(intentPayload);
    if (!preparedUpload.uploadUrl || !preparedUpload.imageId) {
      throw createR2xPolicyUnavailableError('memoriaBACKEND no devolvió una intención válida de imagen temporal.');
    }

    await uploadMediaFileToSignedUrl(converted.file, preparedUpload);

    const confirmationPayload = await apiClient.confirmR2xImage(preparedUpload.imageId, {
      entityType: options.entityType || 'mensaje',
      entityId: options.entityId || clientMutationId,
      conversationId: options.conversationId || ''
    }, `${clientMutationId}:r2x-confirm`);

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
    originalMimeType: converted.originalMimeType
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
  activeStatus.textContent = conversation.blocked
    ? 'Contacto bloqueado · No recibirás ni enviarás mensajes aquí'
    : (conversation.archived ? `${conversation.status || 'Archivado'} · En Archivados` : conversation.status);
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
  setComposerEnabled(!conversation.archived && !conversation.blocked);

  messagesContainer.innerHTML = '';
  conversation.messages.forEach((message) => {
    messagesContainer.appendChild(createMessageElement(message));
  });

  messagesContainer.scrollTop = messagesContainer.scrollHeight;
  hydrateConversationMessages(conversation.id);
}

function shouldHydrateConversationMessages(conversation) {
  if (!CHATER_CONFIG.backendBaseUrl || !getSessionEmail() || !conversation?.id) return false;
  if (conversation.messagesHydrated) return false;
  if (messageHistoryHydration.inFlight.has(conversation.id)) return false;

  const lastErrorAt = conversation.messagesHistoryLastErrorAt ? Date.parse(conversation.messagesHistoryLastErrorAt) : 0;
  if (lastErrorAt && Date.now() - lastErrorAt < messageHistoryHydration.retryAfterMs) return false;

  return true;
}

async function hydrateConversationMessages(conversationId) {
  const sessionGuard = captureSessionGuard();
  const conversation = appState.conversations.find((item) => item.id === conversationId);
  if (!shouldHydrateConversationMessages(conversation)) return;

  messageHistoryHydration.inFlight.add(conversation.id);
  const previousStatus = conversation.status;
  if (activeConversationId === conversation.id && activeSection === 'chats') {
    activeStatus.textContent = 'Cargando historial...';
  }

  try {
    const payload = await apiClient.getMessages(conversation.id, {
      limit: 50,
      before: conversation.messagesHistoryCursor || ''
    });

    if (!isSessionGuardCurrent(sessionGuard)) return;

    if (!payload?.offlineDemo) {
      const remoteMessages = extractArrayFromPayload(payload, ['messages', 'items']).map(normalizeMessageFromApi);
      if (remoteMessages.length) {
        conversation.messages = mergeMessagesByIdentity(remoteMessages, conversation.messages);
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
    messageHistoryHydration.inFlight.delete(conversation.id);
  }
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
  messageElement.querySelector('.message-text').textContent = message.text;

  const extra = messageElement.querySelector('.message-extra');
  renderMessageAttachment(extra, message, mediaKind);

  return messageElement;
}

function renderMessageAttachment(container, message = {}, mediaKind = getMessageMediaKind(message)) {
  if (!container) return;
  const mediaSrc = normalizeMessageMediaSource(message.mediaPreviewDataUrl || message.mediaUrl || '');
  const mediaName = message.mediaName || message.attachmentName || 'Adjunto';
  const mediaSize = message.mediaSizeBytes || message.attachmentSize || 0;
  const shouldShowAttachment = Boolean(mediaSrc || mediaName || message.attachmentName);
  if (!shouldShowAttachment || mediaKind === 'none') return;

  if (mediaKind === 'image' && mediaSrc) {
    const figure = createMessageMediaShell(message, mediaName, mediaSize, 'image');
    const image = document.createElement('img');
    image.alt = '';
    image.loading = 'lazy';
    image.src = mediaSrc;
    image.onerror = () => renderMessageMediaFallback(figure, message, mediaKind, mediaName, mediaSize);
    figure.prepend(image);
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

  const chip = document.createElement('span');
  chip.className = `attachment-chip attachment-chip-${mediaKind || 'file'}`;
  chip.title = mediaName;
  chip.textContent = `${getMessageMediaIcon(mediaKind)} ${mediaName}${mediaSize ? ` · ${formatFileSize(mediaSize)}` : ''}`;
  container.appendChild(chip);
}

function createMessageMediaShell(message = {}, mediaName = 'Adjunto', mediaSize = 0, mediaKind = 'file') {
  const figure = document.createElement('figure');
  figure.className = `message-media message-media-${mediaKind}`;
  const caption = document.createElement('figcaption');
  caption.textContent = `${getMessageMediaIcon(mediaKind)} ${mediaName}${mediaSize ? ` · ${formatFileSize(mediaSize)}` : ''}${message.status ? ` · ${getMessageMediaStatusLabel(message.status)}` : ''}`;
  figure.appendChild(caption);
  return figure;
}

function renderMessageMediaFallback(figure, message = {}, mediaKind = 'file', mediaName = 'Adjunto', mediaSize = 0) {
  if (!figure) return;
  const captionText = `${getMessageMediaIcon(mediaKind)} ${mediaName}${mediaSize ? ` · ${formatFileSize(mediaSize)}` : ''}${message.status ? ` · ${getMessageMediaStatusLabel(message.status)}` : ''}`;
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
  return normalized.replace(/-/g, ' ');
}

function normalizeMessageMediaSource(value = '') {
  const source = String(value || '').trim();
  if (!source) return '';
  if (/^(data:(image|video|audio)\/|blob:|https?:\/\/|\.\/|\/)/i.test(source)) return source;
  return '';
}

async function createLocalMessageMediaPreview(file) {
  if (!file) return '';
  const mediaKind = getMessageMediaKind({ attachmentMimeType: file.type, attachmentName: file.name });
  if (!['image', 'video', 'audio'].includes(mediaKind)) return '';
  if (Number(file.size || 0) > CHATER_CONFIG.messageMediaPreviewMaxBytes) return '';

  try {
    return await readFileAsDataUrl(file);
  } catch (error) {
    return '';
  }
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

async function sendMessage(text) {
  const sessionGuard = captureSessionGuard();
  const conversation = getActiveConversation();
  if (!conversation) return;
  if (conversation.blocked) {
    showToast('Desbloquea este contacto para enviar mensajes.');
    return;
  }

  const clientMessageId = generateClientMutationId();
  const outgoing = {
    id: clientMessageId,
    clientMutationId: clientMessageId,
    type: 'outgoing',
    text,
    time: getCurrentTime(),
    status: 'local'
  };

  conversation.messages.push(outgoing);
  conversation.status = 'Enviando...';
  persistState();
  renderChatList(searchInput.value);
  renderConversation();
  sendStremeEvent({ type: 'typing.stop', chatId: conversation.id });

  try {
    const payload = await apiClient.sendMessage(conversation.id, text, clientMessageId);
    if (!isSessionGuardCurrent(sessionGuard)) return;
    if (payload?.offlineDemo) {
      outgoing.status = 'local';
      conversation.status = 'Guardado localmente';
    } else {
      markQueuedMessageSynced(conversation.id, clientMessageId, payload);
    }
  } catch (error) {
    if (!isSessionGuardCurrent(sessionGuard)) return;
    outgoing.status = 'pending';
    conversation.status = 'Pendiente de sincronizar';
    enqueueBackendOperation({
      type: 'sendMessage',
      dedupeKey: `message:${clientMessageId}`,
      payload: { conversationId: conversation.id, text, clientMessageId }
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
    const lastMessage = conversation.messages.at(-1);
    const copy = document.createElement('span');
    copy.innerHTML = `<strong>${conversation.pinned ? '<span class="pinned-badge archived-pin" aria-label="Chat fijado" title="Chat fijado">📌</span>' : ''}${escapeHTML(conversation.name)}</strong><small>${escapeHTML(lastMessage?.text || conversation.email || 'Sin mensajes todavía')}</small>`;
    main.append(avatar, copy);
    container.appendChild(row);
  });

  container.addEventListener('click', async (event) => {
    const actionButton = event.target.closest('[data-action][data-conversation-id]');
    if (!actionButton) return;
    const conversation = appState.conversations.find((item) => item.id === actionButton.dataset.conversationId);
    if (!conversation) return;

    if (actionButton.dataset.action === 'open') {
      activeConversationId = conversation.id;
      activeSection = 'chats';
      closeModal();
      renderCurrentSection();
      chatView.classList.add('chat-open');
      hydrateConversationMessages(conversation.id);
      return;
    }

    if (actionButton.dataset.action === 'restore') {
      await setConversationArchived(conversation, false, { keepActive: true });
      activeConversationId = conversation.id;
      activeSection = 'chats';
      closeModal();
      renderCurrentSection();
      chatView.classList.add('chat-open');
    }
  });

  setModal('Archivados', container, 'archived');
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
      <div><strong>Último mensaje</strong><span>${escapeHTML(lastMessage ? `${lastMessage.time || 'sin hora'} · ${lastMessage.text || lastMessage.attachmentName || 'mensaje'}` : 'Sin mensajes')}</span></div>
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
    const query = input.value.trim().toLowerCase();
    const matches = conversation.messages
      .map((message, index) => ({ message, index }))
      .filter(({ message }) => {
        if (!query) return false;
        return [message.text, message.attachmentName, message.status, message.time]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(query));
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

async function toggleActiveConversationArchive() {
  const conversation = getActiveConversation();
  if (!conversation) return;
  await setConversationArchived(conversation, !conversation.archived);
}

async function setConversationArchived(conversation, archived, options = {}) {
  if (!conversation) return;

  const sessionGuard = captureSessionGuard();
  const clientMutationId = generateClientMutationId();
  const previousArchived = Boolean(conversation.archived);
  conversation.archived = Boolean(archived);
  conversation.archiveSyncStatus = CHATER_CONFIG.backendBaseUrl ? 'syncing' : 'local';
  conversation.status = archived ? 'Archivado' : 'Restaurado';

  if (archived && activeConversationId === conversation.id && !options.keepActive) {
    activeConversationId = getFirstVisibleConversationId(conversation.id);
    chatView.classList.remove('chat-open');
  }

  persistState();
  renderCurrentSection();
  showToast(archived ? 'Chat archivado.' : 'Chat restaurado.');

  if (!CHATER_CONFIG.backendBaseUrl) return;

  const patch = { archived: Boolean(archived), clientMutationId };
  try {
    await apiClient.updateConversation(conversation.id, patch);
    if (!isSessionGuardCurrent(sessionGuard)) return;
    markQueuedConversationPatchSynced(conversation.id, patch);
  } catch (error) {
    if (!isSessionGuardCurrent(sessionGuard)) return;
    const stillSameArchiveState = Boolean(conversation.archived) === Boolean(archived);
    conversation.archiveSyncStatus = stillSameArchiveState ? 'pending' : conversation.archiveSyncStatus;
    if (!stillSameArchiveState) conversation.archived = previousArchived;
    enqueueBackendOperation({
      type: 'updateConversation',
      dedupeKey: `conversation-archive:${conversation.id}:${clientMutationId}`,
      payload: { conversationId: conversation.id, patch }
    });
    persistState();
    renderCurrentSection();
  }
}

function openNewChatModal() {
  closeTransientPanels();
  const form = document.createElement('form');
  form.innerHTML = `
    <label for="newChatName">Nombre visible</label>
    <input id="newChatName" type="text" placeholder="Ej. María Gómez" required />
    <label for="newChatEmail">Correo electrónico</label>
    <input id="newChatEmail" type="email" placeholder="contacto@correo.com" required />
    <p class="form-feedback" data-feedback role="status" aria-live="polite"></p>
    <button class="primary-button" type="submit">Crear chat</button>
  `;

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const sessionGuard = captureSessionGuard();
    const name = form.querySelector('#newChatName').value.trim();
    const email = form.querySelector('#newChatEmail').value.trim().toLowerCase();
    const feedback = form.querySelector('[data-feedback]');
    if (!name || !email) return;

    const existingConversation = appState.conversations.find((conversation) => String(conversation.email || '').toLowerCase() === email);
    if (existingConversation) {
      if (existingConversation.archived) {
        await setConversationArchived(existingConversation, false, { keepActive: true });
      }
      activeConversationId = existingConversation.id;
      activeSection = 'chats';
      closeModal();
      renderCurrentSection();
      chatView.classList.add('chat-open');
      showToast('Ya existía un chat con ese correo. Se abrió la conversación.');
      return;
    }

    const conversation = {
      id: `chat-${Date.now()}`,
      name,
      email,
      avatar: getInitials(name),
      avatarImage: '',
      status: 'Nuevo chat',
      section: 'chats',
      archived: false,
      unread: 0,
      messages: [{ id: generateClientMutationId(), type: 'system', text: `Chat creado con ${email}.`, time: getCurrentTime() }],
      messagesHydrated: true,
      messagesHistoryCursor: '',
      messagesHistoryLastErrorAt: '',
      lastReadAt: new Date().toISOString(),
      readSyncedAt: '',
      lastReadSyncStatus: 'local'
    };

    appState.conversations.unshift(conversation);
    activeConversationId = conversation.id;
    activeSection = 'chats';
    persistState();
    closeModal();
    renderCurrentSection();
    chatView.classList.add('chat-open');

    const createConversationMutationId = generateClientMutationId();

    try {
      const payload = await apiClient.createConversation({ name, email, clientMutationId: createConversationMutationId });
      if (!isSessionGuardCurrent(sessionGuard)) return;
      if (payload?.offlineDemo) {
        conversation.status = 'Guardado localmente';
      } else {
        const remoteConversationId = extractEntityId(payload, ['chat', 'conversation']) || conversation.id;
        markQueuedConversationSynced(conversation.id, payload);
        await syncContactRelation({ name, email, conversationId: remoteConversationId, clientMutationId: createConversationMutationId }, { enqueueOnFailure: true });
      }
    } catch (error) {
      if (!isSessionGuardCurrent(sessionGuard)) return;
      conversation.status = 'Pendiente de sincronizar';
      enqueueBackendOperation({
        type: 'createConversation',
        dedupeKey: `conversation:${conversation.id}`,
        payload: {
          localConversationId: conversation.id,
          contact: { name, email, clientMutationId: createConversationMutationId }
        }
      });
      showToast('Chat creado localmente y en cola de sincronización.');
    } finally {
      if (isSessionGuardCurrent(sessionGuard)) {
        persistState();
        renderConversation();
      }
    }
  });

  setModal('Nuevo chat por correo', form);
  form.querySelector('#newChatName').focus();
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
  if (pwaStatus?.versionCheckInFlight) return 'Verificando actualización';
  if (pwaStatus?.updateWaiting) return 'Actualización lista';
  if (pwaStatus?.serviceWorker) return pwaStatus?.lastKnownVersion ? `Instalable activo · versión ${pwaStatus.lastKnownVersion}` : 'Instalable activo';
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
  return rows.filter((tool) => [tool.title, tool.description, tool.id].some((value) => String(value).toLowerCase().includes(normalizedFilter)));
}

function renderToolsList() {
  const normalizedFilter = searchInput.value.trim().toLowerCase();
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
          <p>${escapeHTML(getPwaStatusLabel())}. ChatER puede actualizarse por service worker cuando Render.com publique cambios.</p>
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
  { label: 'Autenticación Google/Gmail', tokens: ['AUTENTICACIONx', '/auth', '/auth/firebase/session', '/login.js', 'google'] },
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
      <div><strong>Sesión</strong><span>${getAccessToken() ? 'Token Google/Gmail temporal de pestaña' : (isBackendSessionRecentlyVerified() ? 'Cookie Google/Gmail verificada' : 'Pendiente de Google/Gmail')}</span></div>
      <div><strong>Sin polling</strong><span>Los eventos nuevos se reciben por WebSocket o SSE streme cuando está configurado.</span></div>
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
  if (permission === 'default') {
    permission = await Notification.requestPermission();
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

  const normalizedFilter = String(filterText || '').trim().toLowerCase();
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
      searchText: `${emoji} ${category.id} ${category.label} ${emojiSearchAliases[emoji] || ''}`.toLowerCase()
    })))
    .filter((item) => item.searchText.includes(normalizedFilter))
    .map((item) => item.emoji);
}

function renderTokenPicker(title, items = [], normalizedFilter = '', mode = '') {
  const container = document.createElement('div');
  const filteredItems = items.filter((item) => [item.label, item.token].some((value) => String(value).toLowerCase().includes(normalizedFilter)));

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

function selectComposerMediaAttachment(options = {}) {
  closeEmojiPanel();
  const conversation = getActiveConversation();
  if (activeSection !== 'chats' || !conversation || messageInput.disabled) return;

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
  });
  input.click();
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
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
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

async function sendMediaAttachment(conversation, file, options = {}) {
  const sessionGuard = captureSessionGuard();
  const clientMessageId = generateClientMutationId();
  const mediaKind = getMessageMediaKind({ attachmentMimeType: file.type, attachmentName: file.name });
  const localPreviewDataUrl = await createLocalMessageMediaPreview(file);
  const caption = options.caption || (mediaKind === 'image' ? 'Imagen adjunta' : (mediaKind === 'audio' ? 'Audio adjunto' : (mediaKind === 'video' ? 'Video adjunto' : 'Archivo adjunto')));
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
    mediaSyncStatus: CHATER_CONFIG.backendBaseUrl ? 'uploading' : 'local',
    time: getCurrentTime(),
    status: CHATER_CONFIG.backendBaseUrl ? 'uploading' : 'local'
  };

  conversation.messages.push(outgoing);
  conversation.status = CHATER_CONFIG.backendBaseUrl ? 'Subiendo adjunto...' : 'Adjunto guardado localmente';
  persistState();
  renderChatList(searchInput.value);
  renderConversation();

  if (!CHATER_CONFIG.backendBaseUrl) {
    showToast('Adjunto guardado localmente. Conecta memoriaBACKEND para subir archivos reales.');
    return;
  }

  let preparedUpload = null;
  let uploadFile = file;

  try {
    const mediaMutationId = generateClientMutationId();

    if (shouldUseR2xTemporaryImageApi(file)) {
      try {
        const r2xPreparation = await prepareR2xTemporaryImageForBackend(file, {
          context: 'chat-message',
          entityType: 'mensaje',
          entityId: clientMessageId,
          conversationId: conversation.id,
          clientMutationId: mediaMutationId
        });
        if (!isSessionGuardCurrent(sessionGuard)) return;
        uploadFile = r2xPreparation.file;
        preparedUpload = r2xPreparation.preparedUpload;
        outgoing.mediaName = uploadFile.name;
        outgoing.mediaSizeBytes = uploadFile.size;
        outgoing.attachmentMimeType = uploadFile.type || 'image/webp';
      } catch (error) {
        if (!isR2xPolicyUnavailableError(error)) throw error;
        console.warn('ImagenesCloudflareR2x no está disponible para adjuntos de imagen; se usa MEDIAfirmadaX como respaldo canónico.', error);
      }
    }

    if (!preparedUpload) {
      const preparationPayload = await apiClient.prepareMediaUpload(file, mediaMutationId);
      if (!isSessionGuardCurrent(sessionGuard)) return;
      preparedUpload = normalizeMediaUploadPreparation(preparationPayload);

      if (!preparedUpload.uploadUrl && !preparedUpload.mediaId) {
        throw new Error('memoriaBACKEND no devolvió uploadUrl ni mediaId para el adjunto.');
      }

      if (preparedUpload.uploadUrl) {
        await uploadMediaFileToSignedUrl(file, preparedUpload);
        if (!isSessionGuardCurrent(sessionGuard)) return;
      }

      preparedUpload = await completeMediaFirmadaUploadForBackend(preparedUpload, file, {
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
      provider: preparedUpload.provider || 'media-firmada'
    });
    outgoing.mediaUrl = preparedUpload.publicUrl || outgoing.mediaUrl || '';
    outgoing.mediaSyncStatus = 'creating-media-message';
    outgoing.status = 'creating-media-message';
    conversation.status = 'Registrando adjunto...';
    persistState();
    renderConversation();

    const messagePayload = await apiClient.createMediaMessage(conversation.id, mediaMessagePayload);
    if (!isSessionGuardCurrent(sessionGuard)) return;
    markQueuedMessageSynced(conversation.id, clientMessageId, messagePayload);
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
        provider: preparedUpload.provider || 'media-firmada'
      });
      enqueueBackendOperation({
        type: 'createMediaMessage',
        dedupeKey: `media-message:${clientMessageId}`,
        payload: { conversationId: conversation.id, clientMessageId, mediaMessagePayload }
      });
      conversation.status = 'Mensaje de adjunto pendiente de sincronizar';
      showToast('El archivo subió, pero el mensaje quedó en cola de sincronización.');
    } else {
      showToast('No se pudo completar el adjunto. Selecciona el archivo nuevamente para reintentar.');
    }
  } finally {
    if (isSessionGuardCurrent(sessionGuard)) {
      persistState();
      renderChatList(searchInput.value);
      renderConversation();
    }
  }
}

function normalizeMediaUploadPreparation(payload = {}) {
  const upload = extractNestedObject(payload, ['upload', 'media', 'file', 'asset']) || {};
  const data = payload?.data && typeof payload.data === 'object' ? payload.data : {};
  const headers = upload.headers || data.headers || payload.headers || {};
  const fields = upload.fields || data.fields || payload.fields || {};
  const uploadUrl = upload.uploadUrl || upload.signedUrl || upload.url || data.uploadUrl || data.signedUrl || data.url || payload.uploadUrl || payload.signedUrl || '';
  const method = String(upload.method || data.method || payload.method || (Object.keys(fields).length ? 'POST' : 'PUT')).toUpperCase();
  const mediaId = String(upload.mediaId || upload.id || upload.fileId || data.mediaId || data.id || payload.mediaId || payload.fileId || '').trim();

  return {
    uploadUrl,
    method,
    headers: headers && typeof headers === 'object' ? headers : {},
    fields: fields && typeof fields === 'object' ? fields : {},
    mediaId,
    publicUrl: upload.publicUrl || upload.readUrl || data.publicUrl || data.readUrl || payload.publicUrl || '',
    provider: upload.provider || data.provider || payload.provider || 'media-firmada',
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
    size: file.size,
    sizeBytes: file.size,
    status: 'uploaded',
    uploaded: true
  }, `${clientMutationId}:media-confirm`);

  completedUpload = normalizeMediaReadPayload(confirmPayload, completedUpload);

  if (!completedUpload.publicUrl) {
    try {
      const readPayload = await apiClient.getMediaReadUrl(completedUpload.mediaId, {
        entityType,
        entityId,
        conversationId
      });
      completedUpload = normalizeMediaReadPayload(readPayload, completedUpload);
    } catch (error) {
      console.warn('El archivo quedó confirmado en MEDIAfirmadaX, pero memoriaBACKEND no devolvió URL de lectura inmediata.', error);
    }
  }

  return completedUpload;
}

async function uploadMediaFileToSignedUrl(file, preparedUpload) {
  try {
    if (Object.keys(preparedUpload.fields || {}).length) {
      const formData = new FormData();
      Object.entries(preparedUpload.fields).forEach(([key, value]) => formData.append(key, value));
      formData.append('file', file);
      const response = await fetchWithTimeout(preparedUpload.uploadUrl, {
        method: preparedUpload.method || 'POST',
        body: formData
      }, CHATER_CONFIG.mediaUploadTimeoutMs);
      if (!response.ok) throw new Error(`Subida de adjunto respondió ${response.status}`);
      return;
    }

    const headers = { ...(preparedUpload.headers || {}) };
    if (!Object.keys(headers).some((key) => key.toLowerCase() === 'content-type')) {
      headers['Content-Type'] = file.type || 'application/octet-stream';
    }

    const response = await fetchWithTimeout(preparedUpload.uploadUrl, {
      method: preparedUpload.method || 'PUT',
      headers,
      body: file
    }, CHATER_CONFIG.mediaUploadTimeoutMs);

    if (!response.ok) throw new Error(`Subida de adjunto respondió ${response.status}`);
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
    clientMutationId: clientMessageId,
    clientTime: new Date().toISOString()
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
    <input id="statusMediaInput" type="file" accept="image/*,video/*" />
    <div class="status-media-preview" data-status-media-preview aria-live="polite"></div>

    <p class="modal-copy">El estado se mostrará durante 24 horas. Puedes publicarlo solo con texto o agregar una imagen/video para que se vea como una historia visual.</p>
    <p class="form-feedback" data-feedback role="status" aria-live="polite"></p>
    <button class="primary-button" type="submit">Publicar estado</button>
  `;

  const mediaInput = form.querySelector('#statusMediaInput');
  const mediaPreview = form.querySelector('[data-status-media-preview]');
  const feedback = form.querySelector('[data-feedback]');
  renderStatusMediaPickerPreview(mediaPreview);

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

async function startCall(type, conversationOverride = null) {
  closeEmojiPanel();
  const sessionGuard = captureSessionGuard();
  const conversation = conversationOverride || getActiveConversation();
  if (!conversation || (activeSection !== 'chats' && !conversationOverride)) return;
  const label = type === 'video' ? 'videollamada' : 'llamada de voz';
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
      <p class="modal-copy">Crea primero un chat por correo electrónico para iniciar llamadas desde ChatER.</p>
      <button class="primary-button" type="button" data-action="new-chat">Crear chat</button>
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
  const existingConversation = appState.conversations.find((conversation) => normalizeStorageIdentity(conversation.email || conversation.contactEmail || '') === normalizedEmail);
  if (existingConversation) return existingConversation;

  const displayName = normalizedEmail.split('@')[0] || 'Contacto';
  const conversation = {
    id: `chat-${normalizedEmail}`,
    name: displayName,
    email: normalizedEmail,
    avatar: getInitials(displayName),
    avatarImage: '',
    status: 'Creado desde teclado de llamadas',
    section: 'chats',
    unread: 0,
    messages: []
  };

  appState.conversations.unshift(conversation);
  persistState();

  if (CHATER_CONFIG.backendBaseUrl) {
    const createConversationMutationId = generateClientMutationId();
    enqueueBackendOperation({
      type: 'createConversation',
      dedupeKey: `conversation:${normalizedEmail}`,
      payload: {
        localConversationId: conversation.id,
        contact: { name: displayName, email: normalizedEmail, clientMutationId: createConversationMutationId }
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

function mergeConversationsById(remoteConversations = [], localConversations = []) {
  const conversationsById = new Map();

  localConversations.filter(Boolean).forEach((conversation) => {
    if (conversation.id) conversationsById.set(String(conversation.id), { ...conversation });
  });

  remoteConversations.filter(Boolean).forEach((remoteConversation) => {
    const id = String(remoteConversation.id || '');
    const localConversation = conversationsById.get(id);
    if (!id || !localConversation) {
      if (id) conversationsById.set(id, { ...remoteConversation });
      return;
    }

    conversationsById.set(id, {
      ...localConversation,
      ...remoteConversation,
      messages: mergeMessagesByIdentity(remoteConversation.messages, localConversation.messages),
      messagesHydrated: Boolean(remoteConversation.messagesHydrated || localConversation.messagesHydrated),
      messagesHistoryCursor: remoteConversation.messagesHistoryCursor || localConversation.messagesHistoryCursor || '',
      messagesHistoryLastErrorAt: localConversation.messagesHistoryLastErrorAt || ''
    });
  });

  const orderedConversations = [];
  const seen = new Set();
  [...remoteConversations, ...localConversations].filter(Boolean).forEach((conversation) => {
    const id = String(conversation.id || '');
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
    const raw = source.message || source;
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

function updateExistingMessageFromRealtime(existingMessage, normalizedMessage) {
  if (!existingMessage || !normalizedMessage) return;
  existingMessage.id = normalizedMessage.id || existingMessage.id;
  existingMessage.clientMutationId = normalizedMessage.clientMutationId || existingMessage.clientMutationId || '';
  existingMessage.text = normalizedMessage.text || existingMessage.text || '';
  existingMessage.time = normalizedMessage.time || existingMessage.time || getCurrentTime();
  existingMessage.status = normalizedMessage.status || existingMessage.status || 'synced';
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
    mergedMessages.push({ ...message });
  });

  return mergedMessages;
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
  const participants = normalizeConversationParticipantsForApi(raw.participants || raw.participantList || raw.members, raw.contactEmail || raw.email, raw.displayName || raw.name);
  const participant = getConversationDisplayParticipant(participants);
  const selfEmail = normalizeStorageIdentity(getSessionEmail());
  const rawEmail = normalizeStorageIdentity(raw.contactEmail || raw.email || '');
  const email = rawEmail && rawEmail !== selfEmail ? rawEmail : (participant?.email || rawEmail || '');
  const name = raw.displayName || raw.name || participant?.displayName || participant?.name || email || 'Chat sin nombre';
  const hasEmbeddedMessages = Array.isArray(raw.messages) && raw.messages.length > 0;
  const messages = hasEmbeddedMessages ? raw.messages.map(normalizeMessageFromApi) : [];
  if (!messages.length && raw.lastMessage) {
    messages.push(normalizeMessageFromApi(raw.lastMessage));
  }

  return {
    id: String(raw.id || raw.chatId || raw.conversationId || `chat-${email || Date.now()}`),
    name,
    email,
    avatar: raw.avatar || getInitials(name),
    avatarImage: normalizeAssetImagePath(raw.avatarImage || raw.avatarAsset),
    status: raw.statusLabel || raw.status || raw.presence || 'Sincronizado',
    section: 'chats',
    archived: Boolean(raw.archived || raw.isArchived),
    pinned: Boolean(raw.pinned || raw.isPinned),
    participants,
    pinSyncStatus: raw.pinSyncStatus || '',
    pinSyncedAt: raw.pinSyncedAt || '',
    archiveSyncStatus: raw.archiveSyncStatus || '',
    archiveSyncedAt: raw.archiveSyncedAt || '',
    blocked: Boolean(raw.blocked || raw.isBlocked),
    blockSyncStatus: raw.blockSyncStatus || '',
    blockSyncedAt: raw.blockSyncedAt || '',
    reportSyncStatus: raw.reportSyncStatus || '',
    reportSyncedAt: raw.reportSyncedAt || '',
    lastReportReason: raw.lastReportReason || '',
    unread: Number(raw.unread || raw.unreadCount || 0),
    messages,
    messagesHydrated: Boolean(hasEmbeddedMessages || raw.messagesHydrated || raw.historyLoaded),
    messagesHistoryCursor: raw.messagesCursor || raw.nextCursor || raw.nextMessagesCursor || ''
  };
}

function normalizeMessageFromApi(raw = {}) {
  const mediaObject = getFirstMediaObject(raw);
  const isOutgoing = raw.type === 'outgoing' || raw.direction === 'outgoing' || raw.isMine || raw.sender?.isMe;
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
    status: raw.status || 'synced',
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
    createdAt
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

function buildStremeUrl(transport = resolveStremeTransport()) {
  const effectiveRealtimeUrl = getEffectiveRealtimeUrl();
  try {
    const url = new URL(effectiveRealtimeUrl, window.location.origin);
    const token = getAccessToken();
    const lastEventId = readStorageItem(getStremeLastEventStorageKey(), '');

    if (transport === 'websocket') {
      if (url.protocol === 'http:') url.protocol = 'ws:';
      if (url.protocol === 'https:') url.protocol = 'wss:';
    }

    if (transport === 'sse') {
      if (url.protocol === 'ws:') url.protocol = 'http:';
      if (url.protocol === 'wss:') url.protocol = 'https:';
    }

    applyStremeUrlScopeParams(url);

    if (token) url.searchParams.set('token', token);
    if (lastEventId) url.searchParams.set('lastEventId', lastEventId);
    return url.toString();
  } catch (error) {
    return effectiveRealtimeUrl;
  }
}

function applyStremeUrlScopeParams(url) {
  if (!url?.searchParams) return;

  const siteId = getMemoriaSiteId();
  if (siteId && !url.searchParams.has('s')) {
    url.searchParams.set('s', siteId);
  }

  if (!url.searchParams.has('canal') && !url.searchParams.has('channel')) {
    url.searchParams.set('canal', getDefaultStremeChannel());
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
  if (typeof EventSource !== 'undefined' && stremeEventSource?.readyState === EventSource.OPEN) return 'Conectado por SSE';
  return `Configurado por ${getStremeTransportLabel()}, esperando conexión`;
}

function connectStremeRealtime() {
  if (stremeSocket || stremeEventSource || !getEffectiveRealtimeUrl() || !getSessionEmail()) return;

  stremeManualDisconnect = false;
  stremeSessionGuard = captureSessionGuard();
  const transport = resolveStremeTransport();
  stremeActiveTransport = transport;

  if (transport === 'websocket') {
    connectStremeWebSocket();
    return;
  }

  if (transport === 'sse') {
    connectStremeEventSource();
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

function connectStremeEventSource() {
  const connectionGuard = stremeSessionGuard || captureSessionGuard();

  if (typeof EventSource === 'undefined') {
    if (isSessionGuardCurrent(connectionGuard)) {
      console.warn('Este navegador no soporta EventSource para streme.');
      scheduleStremeReconnect();
    }
    return;
  }

  try {
    stremeEventSource = new EventSource(buildStremeUrl('sse'), { withCredentials: true });
    stremeEventSource.addEventListener('open', () => {
      if (!isSessionGuardCurrent(connectionGuard)) return;
      stremeReconnectAttempts = 0;
      sendPresenceHeartbeat('online');
      if (activeConversationId) {
        sendStremeEvent({ type: 'chat.opened', chatId: activeConversationId });
      }
    });
    const handleSsePayload = (event) => {
      if (!isSessionGuardCurrent(connectionGuard)) return;
      if (event.lastEventId) {
        persistStremeLastEventId(event.lastEventId, { source: 'sse-event' });
      }
      if (event.data) {
        handleRawStremeMessage(event.data);
      }
    };

    const handleSseControl = (event) => {
      if (!isSessionGuardCurrent(connectionGuard)) return;
      if (event.lastEventId) {
        persistStremeLastEventId(event.lastEventId, { source: 'sse-event' });
      }
    };

    stremeEventSource.addEventListener('message', handleSsePayload);
    stremeEventSource.addEventListener('streme-event', handleSsePayload);
    stremeEventSource.addEventListener('streme-message', handleSsePayload);
    stremeEventSource.addEventListener('streme-ready', handleSseControl);
    stremeEventSource.addEventListener('streme-heartbeat', handleSseControl);
    stremeEventSource.addEventListener('error', () => {
      if (!isSessionGuardCurrent(connectionGuard)) return;
      stremeEventSource?.close();
      stremeEventSource = null;
      if (!stremeManualDisconnect) scheduleStremeReconnect();
    });
  } catch (error) {
    if (!isSessionGuardCurrent(connectionGuard)) return;
    stremeEventSource = null;
    scheduleStremeReconnect();
  }
}

function handleRawStremeMessage(rawMessage) {
  if (stremeSessionGuard && !isSessionGuardCurrent(stremeSessionGuard)) return;
  try {
    const parsedMessage = JSON.parse(rawMessage);
    persistStremeLastEventId(getStremeEventIdCandidate(parsedMessage), { source: 'streme-payload' });
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
    'streme.typing.started': 'typing.started',
    'streme.typing.stopped': 'typing.stopped',
    'streme.typing.start': 'typing.start',
    'streme.typing.stop': 'typing.stop',
    'streme.presence.changed': 'presence.changed',
    'streme.call.incoming': 'call.incoming',
    'streme.state.created': 'state.created'
  };
  if (aliases[normalizedType]) return aliases[normalizedType];
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

function scheduleStremeReconnect() {
  if (!getEffectiveRealtimeUrl() || stremeManualDisconnect) return;
  clearTimeout(stremeReconnectTimer);
  const delay = Math.min(30000, 1000 * (2 ** stremeReconnectAttempts));
  stremeReconnectAttempts += 1;
  stremeReconnectTimer = setTimeout(connectStremeRealtime, delay);
}

function disconnectStremeRealtime() {
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
  stremeActiveTransport = 'none';
  stremeSessionGuard = null;
}

function createStremeClientEvent(payload) {
  return {
    ...payload,
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

  return apiClient.publishStremeEvent(clientEvent).catch((error) => {
    console.warn(options.onErrorMessage || 'No se pudo publicar un evento durable en STREMEx. Se deja en cola de sincronización.', error);
    enqueueBackendOperation({
      type: 'publishStremeEvent',
      dedupeKey,
      payload: { event: clientEvent }
    });
    return null;
  });
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

  if (normalizedPayload.type === 'message.deleted') {
    deleteRealtimeMessage(normalizedPayload.data);
  }

  if (['typing.started', 'typing.stopped', 'typing.start', 'typing.stop'].includes(normalizedPayload.type)) {
    updateTypingStatus(normalizedPayload.data || normalizedPayload, ['typing.started', 'typing.start'].includes(normalizedPayload.type));
  }

  if (normalizedPayload.type === 'presence.changed') {
    updatePresenceStatus(normalizedPayload.data);
  }

  if (normalizedPayload.type === 'call.incoming') {
    registerIncomingCall(normalizedPayload.data);
  }

  if (normalizedPayload.type === 'state.created') {
    registerRealtimeState(normalizedPayload.data);
  }
}

function receiveRealtimeMessage(data = {}) {
  const message = data.message || data;
  const conversationId = data.chatId || data.conversationId || message.chatId || message.conversationId;
  const conversation = appState.conversations.find((item) => item.id === conversationId);
  if (!conversation) return;

  const normalizedMessage = normalizeMessageFromApi({ ...message, chatId: conversationId });
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
    if (normalizedMessage.type !== 'outgoing') {
      if (conversation.id === activeConversationId) {
        markConversationRead(conversation, { force: true });
      } else {
        conversation.unread += 1;
      }
    }
  }

  conversation.status = normalizedMessage.type === 'outgoing' ? 'Entregado' : 'En línea';
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
  existingMessage.status = message.status || existingMessage.status || 'updated';
  existingMessage.clientMutationId = message.clientMutationId || existingMessage.clientMutationId || '';
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

function updateTypingStatus(data = {}, isTyping) {
  const conversation = appState.conversations.find((item) => item.id === data.chatId || item.id === data.conversationId);
  if (!conversation) return;
  conversation.status = isTyping ? 'Escribiendo...' : 'En línea';
  persistState();
  renderCurrentSection();
}

function updatePresenceStatus(data = {}) {
  const conversation = appState.conversations.find((item) => item.email === data.email || item.id === data.chatId || item.id === data.conversationId);
  if (!conversation) return;
  conversation.status = data.status === 'online' ? 'En línea' : 'No disponible';
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
  sendStremeEvent({ type: isTyping ? 'typing.start' : 'typing.stop', chatId: conversationId });
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
  }, 1400);
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
}

async function logoutCurrentSession() {
  disconnectStremeRealtime();
  try {
    await apiClient.logout();
  } catch (error) {
    // El cierre local no debe fallar si memoriaBACKEND no está disponible.
  } finally {
    clearSession();
    closeModal();
    renderShell();
  }
}

loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();

  const authGuard = captureAuthAttempt('google-gmail');
  const submitButton = loginForm.querySelector('button[type="submit"]');
  loginFeedback.textContent = 'Preparando acceso con Google...';
  submitButton.disabled = true;
  submitButton.textContent = 'Abriendo Google...';

  try {
    const restored = await restoreGoogleGmailSessionFromBackend({ silent: true, authGuard });
    if (restored || getSessionEmail()) return;

    await startGoogleGmailLogin({ authGuard });
  } catch (error) {
    if (!isAuthAttemptCurrent(authGuard)) return;
    loginFeedback.textContent = error?.message || 'No se pudo abrir la autenticación Google/Gmail de memoriaBACKEND.';
  } finally {
    if (isAuthAttemptCurrent(authGuard)) {
      submitButton.disabled = false;
      submitButton.textContent = 'Continuar con Google';
    }
  }
});

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
    openNewChatModal();
    return;
  }

  const button = event.target.closest('[data-tool]');
  if (!button || activeSection !== 'tools') return;
  await handleToolAction(button.dataset.tool);
});

messagesContainer.addEventListener('click', async (event) => {
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
conversationMenuButton?.addEventListener('click', openConversationMenuModal);
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
  }
});

applyAutomaticTheme();
setInterval(applyAutomaticTheme, 60 * 1000);
setInterval(() => {
  if (pruneExpiredStates() && !chatView.hidden) {
    renderCurrentSection();
  }
}, STATE_EXPIRY_SWEEP_INTERVAL_MS);
renderEmojiPanel();
updateComposerActionState();
registerMemoriaBackendLoginListeners();
registerClientTelemetryListeners();
registerStaticSiteOpening();
bootstrapGoogleGmailSession();
