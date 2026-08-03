const PROTOCOL_VERSION = 1;
const SIGNAL_PREFIX = 'P2PSIN1.';
const CHANNEL_LABEL = 'semilla-p2p-sin-backend-v1';
const DEFAULT_ICE_GATHER_TIMEOUT_MS = 12000;
const DEFAULT_MESSAGE_LIMIT_BYTES = 256 * 1024;
const DEFAULT_CHUNK_BYTES = 12 * 1024;
const DEFAULT_ASSEMBLY_TTL_MS = 30000;
const DEFAULT_SIGNAL_TTL_MS = 10 * 60 * 1000;
const DEFAULT_SEND_BUFFER_LIMIT_BYTES = 512 * 1024;
const DEFAULT_SEND_BUFFER_WAIT_MS = 5000;
const DEFAULT_DISCONNECT_GRACE_MS = 15000;
const MAX_CONNECTIONS = 8;
const MAX_PENDING_ASSEMBLIES = 48;
const MAX_SEEN_MESSAGES = 2048;

function clean(value = '', max = 240) {
  return String(value || '').trim().slice(0, max);
}

function randomId(prefix = 'local') {
  const value = globalThis.crypto?.randomUUID?.().replace(/-/g, '')
    || `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
  return `${prefix}_${value}`;
}

function utf8Bytes(value = '') {
  return new TextEncoder().encode(String(value || ''));
}

function base64UrlEncodeBytes(bytes) {
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlDecodeBytes(value = '') {
  const normalized = String(value || '').replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

export function encodeP2PSinSignal(payload = {}) {
  const json = JSON.stringify(payload);
  return SIGNAL_PREFIX + base64UrlEncodeBytes(utf8Bytes(json));
}

export function decodeP2PSinSignal(code = '') {
  const normalized = clean(code, 2_000_000).replace(/\s+/g, '');
  if (!normalized.startsWith(SIGNAL_PREFIX)) throw new Error('El código de red local no pertenece a esta semilla.');
  let payload;
  try {
    payload = JSON.parse(new TextDecoder().decode(base64UrlDecodeBytes(normalized.slice(SIGNAL_PREFIX.length))));
  } catch {
    throw new Error('El código de red local está incompleto o dañado.');
  }
  if (!payload || typeof payload !== 'object' || Number(payload.version) !== PROTOCOL_VERSION) {
    throw new Error('El código de red local usa una versión incompatible.');
  }
  return payload;
}

export function validateP2PSinScope(payload = {}, expected = {}) {
  const origin = clean(payload.origin, 500);
  const applicationId = clean(payload.applicationId, 240);
  const expectedOrigin = clean(expected.origin, 500);
  const expectedApplicationId = clean(expected.applicationId, 240);
  if (!origin || !applicationId || origin !== expectedOrigin || applicationId !== expectedApplicationId) {
    const error = new Error('El código pertenece a otro dominio o a otra aplicación del mismo dominio.');
    error.code = 'P2P_SIN_SCOPE_MISMATCH';
    throw error;
  }
  return true;
}


export function validateP2PSinSignalFreshness(payload = {}, options = {}) {
  const nowMs = Number(options.nowMs || Date.now());
  const maxAgeMs = Math.max(30_000, Number(options.maxAgeMs || DEFAULT_SIGNAL_TTL_MS));
  const createdAtMs = Date.parse(String(payload.createdAt || ''));
  if (!Number.isFinite(createdAtMs) || createdAtMs <= 0 || createdAtMs > nowMs + 60_000 || nowMs - createdAtMs > maxAgeMs) {
    const error = new Error('El código de red local venció. Genera uno nuevo para evitar reutilizar una sesión anterior.');
    error.code = 'P2P_SIN_SIGNAL_EXPIRED';
    throw error;
  }
  return true;
}

function waitForWritableChannel(channel, limitBytes = DEFAULT_SEND_BUFFER_LIMIT_BYTES, timeoutMs = DEFAULT_SEND_BUFFER_WAIT_MS) {
  if (!channel || channel.readyState !== 'open') return Promise.resolve(false);
  if (!Number.isFinite(Number(channel.bufferedAmount)) || Number(channel.bufferedAmount) <= limitBytes) return Promise.resolve(true);
  if (typeof channel.addEventListener !== 'function') return Promise.resolve(false);
  return new Promise((resolve) => {
    let settled = false;
    const previousThreshold = Number(channel.bufferedAmountLowThreshold || 0);
    const finish = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      channel.removeEventListener?.('bufferedamountlow', onLow);
      try { channel.bufferedAmountLowThreshold = previousThreshold; } catch {}
      resolve(value);
    };
    const onLow = () => finish(channel.readyState === 'open');
    try { channel.bufferedAmountLowThreshold = Math.max(64 * 1024, Math.floor(limitBytes / 2)); } catch {}
    channel.addEventListener('bufferedamountlow', onLow, { once: true });
    const timer = setTimeout(() => finish(false), Math.max(500, Number(timeoutMs || DEFAULT_SEND_BUFFER_WAIT_MS)));
  });
}

function normalizeIdentity(identity = {}) {
  const normalized = {
    userId: clean(identity.userId, 240),
    email: clean(identity.email, 320).toLowerCase(),
    displayName: clean(identity.displayName, 240),
    deviceId: clean(identity.deviceId, 240),
    deviceName: clean(identity.deviceName, 240)
  };
  if (!normalized.userId || !normalized.deviceId) throw new Error('Falta la identidad local necesaria para abrir la conexión directa.');
  return normalized;
}

function waitForIceGatheringComplete(connection, timeoutMs = DEFAULT_ICE_GATHER_TIMEOUT_MS) {
  if (connection.iceGatheringState === 'complete') return Promise.resolve();
  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      connection.removeEventListener?.('icegatheringstatechange', onChange);
      clearTimeout(timer);
      resolve();
    };
    const onChange = () => {
      if (connection.iceGatheringState === 'complete') finish();
    };
    connection.addEventListener?.('icegatheringstatechange', onChange);
    const timer = setTimeout(finish, Math.max(1000, Number(timeoutMs || DEFAULT_ICE_GATHER_TIMEOUT_MS)));
  });
}

function normalizeDescription(description = {}) {
  const type = clean(description.type, 24);
  const sdp = String(description.sdp || '');
  if (!['offer', 'answer'].includes(type) || !sdp || sdp.length > 1_000_000) throw new Error('La descripción WebRTC no es válida.');
  return { type, sdp };
}

function safeJsonParse(value = '') {
  try { return JSON.parse(String(value || '')); } catch { return null; }
}

export class P2PSinBackendTransport {
  constructor(options = {}) {
    this.origin = clean(options.origin || globalThis.location?.origin, 500);
    this.applicationId = clean(options.applicationId, 240);
    this.RTCPeerConnectionRef = options.RTCPeerConnectionRef || globalThis.RTCPeerConnection || null;
    this.iceGatherTimeoutMs = Math.max(1000, Number(options.iceGatherTimeoutMs || DEFAULT_ICE_GATHER_TIMEOUT_MS));
    this.maxMessageBytes = Math.max(32 * 1024, Number(options.maxMessageBytes || DEFAULT_MESSAGE_LIMIT_BYTES));
    this.chunkBytes = Math.max(4096, Math.min(32 * 1024, Number(options.chunkBytes || DEFAULT_CHUNK_BYTES)));
    this.assemblyTtlMs = Math.max(5000, Number(options.assemblyTtlMs || DEFAULT_ASSEMBLY_TTL_MS));
    this.signalTtlMs = Math.max(30_000, Number(options.signalTtlMs || DEFAULT_SIGNAL_TTL_MS));
    this.sendBufferLimitBytes = Math.max(64 * 1024, Number(options.sendBufferLimitBytes || DEFAULT_SEND_BUFFER_LIMIT_BYTES));
    this.sendBufferWaitMs = Math.max(500, Number(options.sendBufferWaitMs || DEFAULT_SEND_BUFFER_WAIT_MS));
    this.disconnectGraceMs = Math.max(1000, Number(options.disconnectGraceMs || DEFAULT_DISCONNECT_GRACE_MS));
    this.setTimeoutRef = typeof options.setTimeoutRef === 'function' ? options.setTimeoutRef : globalThis.setTimeout.bind(globalThis);
    this.clearTimeoutRef = typeof options.clearTimeoutRef === 'function' ? options.clearTimeoutRef : globalThis.clearTimeout.bind(globalThis);
    this.identity = null;
    this.started = false;
    this.connections = new Map();
    this.channels = new Map();
    this.pendingSignals = new Map();
    this.pendingAssemblies = new Map();
    this.seenMessages = new Map();
    this.onPayload = typeof options.onPayload === 'function' ? options.onPayload : () => null;
    this.onState = typeof options.onState === 'function' ? options.onState : () => null;
    if (!this.origin || !this.applicationId) throw new Error('Falta el alcance del dominio y la aplicación para P2P_sin_.');
  }

  supported() {
    return typeof this.RTCPeerConnectionRef === 'function';
  }

  start(identity = {}) {
    this.identity = normalizeIdentity(identity);
    this.started = true;
    this.emitState('ready', { supported: this.supported(), peers: this.connectedPeers() });
    return this.status();
  }

  async stop() {
    this.started = false;
    for (const entry of this.connections.values()) {
      this.clearDisconnectTimer(entry);
      entry.closed = true;
      try { entry.channel?.close?.(); } catch {}
      try { entry.connection?.close?.(); } catch {}
    }
    this.connections.clear();
    this.channels.clear();
    this.pendingSignals.clear();
    this.pendingAssemblies.clear();
    this.seenMessages.clear();
    this.emitState('stopped', { peers: [] });
  }

  status() {
    return {
      supported: this.supported(),
      started: this.started,
      connected: this.channels.size > 0,
      peers: this.connectedPeers()
    };
  }

  connectedPeers() {
    return Array.from(this.channels.values()).map((entry) => ({
      sessionId: entry.sessionId,
      userId: clean(entry.peer?.userId, 240),
      email: clean(entry.peer?.email, 320),
      displayName: clean(entry.peer?.displayName, 240),
      deviceId: clean(entry.peer?.deviceId, 240),
      deviceName: clean(entry.peer?.deviceName, 240),
      connectedAt: entry.connectedAt
    }));
  }

  assertReady() {
    if (!this.started || !this.identity) throw new Error('La red local todavía no está preparada para esta cuenta.');
    if (!this.supported()) {
      const error = new Error('Este navegador no permite conexiones WebRTC directas.');
      error.code = 'P2P_SIN_UNSUPPORTED';
      throw error;
    }
  }

  createConnection(sessionId, role, pairNonce) {
    for (const [candidateId, candidate] of this.connections.entries()) {
      const state = clean(candidate?.connection?.connectionState || candidate?.connection?.iceConnectionState, 40);
      if (['failed', 'closed'].includes(state)) {
        this.channels.delete(candidateId);
        this.connections.delete(candidateId);
      }
    }
    if (this.connections.has(sessionId)) throw new Error('La sesión de red local ya está abierta en este dispositivo.');
    if (this.connections.size >= MAX_CONNECTIONS) {
      const error = new Error('Se alcanzó el máximo de conexiones locales simultáneas. Cierra una conexión antes de crear otra.');
      error.code = 'P2P_SIN_CONNECTION_LIMIT';
      throw error;
    }
    const connection = new this.RTCPeerConnectionRef({ iceServers: [], iceTransportPolicy: 'all' });
    const entry = {
      sessionId,
      role,
      pairNonce,
      connection,
      channel: null,
      peer: null,
      connectedAt: '',
      helloReceived: false,
      closed: false,
      disconnectTimer: null,
      lastConnectionState: ''
    };
    this.connections.set(sessionId, entry);
    connection.addEventListener?.('connectionstatechange', () => this.handleConnectionState(entry));
    connection.addEventListener?.('iceconnectionstatechange', () => this.handleConnectionState(entry));
    connection.addEventListener?.('datachannel', (event) => this.bindChannel(entry, event.channel));
    return entry;
  }

  connectionState(entry) {
    const connectionState = clean(entry?.connection?.connectionState, 40);
    const iceState = clean(entry?.connection?.iceConnectionState, 40);
    if (connectionState === 'closed' || iceState === 'closed') return 'closed';
    if (connectionState === 'failed' || iceState === 'failed') return 'failed';
    if (connectionState === 'connected' || iceState === 'connected' || iceState === 'completed') return 'connected';
    if (connectionState === 'disconnected' || iceState === 'disconnected') return 'disconnected';
    return connectionState || iceState || 'new';
  }

  clearDisconnectTimer(entry) {
    if (!entry?.disconnectTimer) return;
    try { this.clearTimeoutRef(entry.disconnectTimer); } catch {}
    entry.disconnectTimer = null;
  }

  dropConnection(entry, state = 'closed') {
    if (!entry || entry.closed) return false;
    entry.closed = true;
    this.clearDisconnectTimer(entry);
    this.channels.delete(entry.sessionId);
    this.connections.delete(entry.sessionId);
    this.pendingSignals.delete(entry.sessionId);
    try { entry.channel?.close?.(); } catch {}
    try { entry.connection?.close?.(); } catch {}
    this.emitState(state, { sessionId: entry.sessionId, peers: this.connectedPeers() });
    return true;
  }

  handleConnectionState(entry) {
    if (!entry || entry.closed) return;
    const state = this.connectionState(entry);
    if (state === entry.lastConnectionState && state !== 'connected') return;
    entry.lastConnectionState = state;

    if (state === 'connected') {
      this.clearDisconnectTimer(entry);
      if (entry.helloReceived && entry.channel?.readyState === 'open') {
        const wasConnected = this.channels.has(entry.sessionId);
        this.channels.set(entry.sessionId, entry);
        this.pendingSignals.delete(entry.sessionId);
        if (!wasConnected) {
          this.emitState('connected', {
            sessionId: entry.sessionId,
            peer: entry.peer,
            peers: this.connectedPeers(),
            reconnected: Boolean(entry.connectedAt)
          });
        }
      }
      return;
    }

    if (state === 'disconnected') {
      this.channels.delete(entry.sessionId);
      if (!entry.disconnectTimer) {
        entry.disconnectTimer = this.setTimeoutRef(() => {
          entry.disconnectTimer = null;
          if (!entry.closed && this.connectionState(entry) === 'disconnected') this.dropConnection(entry, 'disconnected');
        }, this.disconnectGraceMs);
      }
      this.emitState('reconnecting', { sessionId: entry.sessionId, peer: entry.peer, peers: this.connectedPeers() });
      return;
    }

    if (state === 'failed' || state === 'closed') this.dropConnection(entry, state);
  }

  bindChannel(entry, channel) {
    if (!channel || channel.label !== CHANNEL_LABEL) {
      try { channel?.close?.(); } catch {}
      return;
    }
    entry.channel = channel;
    channel.binaryType = 'arraybuffer';
    channel.addEventListener?.('open', () => {
      this.sendFrame(channel, {
        type: 'hello',
        version: PROTOCOL_VERSION,
        sessionId: entry.sessionId,
        pairNonce: entry.pairNonce,
        origin: this.origin,
        applicationId: this.applicationId,
        identity: this.identity
      });
    });
    channel.addEventListener?.('message', (event) => this.handleFrame(entry, event.data));
    channel.addEventListener?.('close', () => {
      if (!entry.closed) this.dropConnection(entry, 'disconnected');
    });
    channel.addEventListener?.('error', () => {
      this.emitState('error', { sessionId: entry.sessionId, peers: this.connectedPeers() });
    });
  }

  sendFrame(channel, frame) {
    if (!channel || channel.readyState !== 'open') return false;
    const json = JSON.stringify(frame);
    if (utf8Bytes(json).byteLength > this.chunkBytes * 2) return false;
    channel.send(json);
    return true;
  }

  handleFrame(entry, raw) {
    const frame = safeJsonParse(typeof raw === 'string' ? raw : new TextDecoder().decode(raw));
    if (!frame || Number(frame.version) !== PROTOCOL_VERSION) return;
    if (frame.type === 'hello') {
      try {
        validateP2PSinScope(frame, this);
        if (clean(frame.sessionId, 240) !== entry.sessionId || clean(frame.pairNonce, 500) !== entry.pairNonce) throw new Error('La conexión local no coincide con el emparejamiento iniciado.');
        entry.peer = normalizeIdentity(frame.identity || {});
        entry.helloReceived = true;
        entry.connectedAt = entry.connectedAt || new Date().toISOString();
        this.clearDisconnectTimer(entry);
        this.channels.set(entry.sessionId, entry);
        this.pendingSignals.delete(entry.sessionId);
        this.emitState('connected', { sessionId: entry.sessionId, peer: entry.peer, peers: this.connectedPeers(), reconnected: false });
      } catch {
        try { entry.channel?.close?.(); } catch {}
      }
      return;
    }
    if (!entry.helloReceived) return;
    if (frame.type === 'chunk') this.handleChunk(entry, frame);
  }

  handleChunk(entry, frame = {}) {
    const messageId = clean(frame.messageId, 240);
    const index = Number(frame.index);
    const total = Number(frame.total);
    const data = String(frame.data || '');
    if (!messageId || !Number.isInteger(index) || !Number.isInteger(total) || index < 0 || total < 1 || index >= total || total > 512 || !data) return;
    if (this.seenMessages.has(messageId)) return;
    this.cleanupAssemblies();
    const key = `${entry.sessionId}:${messageId}`;
    let assembly = this.pendingAssemblies.get(key);
    if (!assembly) {
      if (this.pendingAssemblies.size >= MAX_PENDING_ASSEMBLIES) return;
      assembly = { messageId, total, chunks: new Array(total), bytes: 0, createdAt: Date.now() };
      this.pendingAssemblies.set(key, assembly);
    }
    if (assembly.total !== total || assembly.chunks[index]) return;
    assembly.chunks[index] = data;
    assembly.bytes += data.length;
    if (assembly.bytes > Math.ceil(this.maxMessageBytes * 1.5)) {
      this.pendingAssemblies.delete(key);
      return;
    }
    if (assembly.chunks.some((chunk) => !chunk)) return;
    this.pendingAssemblies.delete(key);
    let envelope;
    try {
      const bytes = base64UrlDecodeBytes(assembly.chunks.join(''));
      if (bytes.byteLength > this.maxMessageBytes) return;
      envelope = JSON.parse(new TextDecoder().decode(bytes));
    } catch { return; }
    if (!envelope || envelope.type !== 'payload' || clean(envelope.messageId, 240) !== messageId) return;
    try { validateP2PSinScope(envelope, this); } catch { return; }
    if (clean(envelope.sessionId, 240) !== entry.sessionId) return;
    this.rememberMessage(messageId);
    Promise.resolve(this.onPayload({
      messageId,
      body: envelope.body,
      sentAt: envelope.sentAt,
      peer: entry.peer,
      sessionId: entry.sessionId
    })).catch((error) => {
      this.emitState('payload-error', { error, sessionId: entry.sessionId, peer: entry.peer, peers: this.connectedPeers() });
    });
  }

  cleanupAssemblies() {
    const cutoff = Date.now() - this.assemblyTtlMs;
    for (const [key, value] of this.pendingAssemblies.entries()) {
      if (Number(value?.createdAt || 0) < cutoff) this.pendingAssemblies.delete(key);
    }
  }

  rememberMessage(messageId) {
    this.seenMessages.set(messageId, Date.now());
    while (this.seenMessages.size > MAX_SEEN_MESSAGES) this.seenMessages.delete(this.seenMessages.keys().next().value);
  }

  async createOffer() {
    this.assertReady();
    const sessionId = randomId('lan');
    const pairNonce = randomId('nonce');
    const entry = this.createConnection(sessionId, 'offerer', pairNonce);
    const channel = entry.connection.createDataChannel(CHANNEL_LABEL, { ordered: true });
    this.bindChannel(entry, channel);
    await entry.connection.setLocalDescription(await entry.connection.createOffer());
    await waitForIceGatheringComplete(entry.connection, this.iceGatherTimeoutMs);
    const payload = {
      version: PROTOCOL_VERSION,
      type: 'offer',
      sessionId,
      pairNonce,
      origin: this.origin,
      applicationId: this.applicationId,
      identity: this.identity,
      description: normalizeDescription(entry.connection.localDescription),
      createdAt: new Date().toISOString()
    };
    this.pendingSignals.set(sessionId, { role: 'offerer', pairNonce, createdAt: Date.now() });
    return encodeP2PSinSignal(payload);
  }

  async acceptOffer(code = '') {
    this.assertReady();
    const payload = decodeP2PSinSignal(code);
    validateP2PSinScope(payload, this);
    validateP2PSinSignalFreshness(payload, { maxAgeMs: this.signalTtlMs });
    if (payload.type !== 'offer') throw new Error('Se esperaba un código de invitación de red local.');
    const sessionId = clean(payload.sessionId, 240);
    const pairNonce = clean(payload.pairNonce, 500);
    if (!sessionId || !pairNonce) throw new Error('El código de invitación local está incompleto.');
    if (normalizeDescription(payload.description).type !== 'offer') throw new Error('La invitación local no contiene una oferta WebRTC válida.');
    const entry = this.createConnection(sessionId, 'answerer', pairNonce);
    entry.peer = normalizeIdentity(payload.identity || {});
    await entry.connection.setRemoteDescription(normalizeDescription(payload.description));
    await entry.connection.setLocalDescription(await entry.connection.createAnswer());
    await waitForIceGatheringComplete(entry.connection, this.iceGatherTimeoutMs);
    this.pendingSignals.set(sessionId, { role: 'answerer', pairNonce, createdAt: Date.now() });
    return encodeP2PSinSignal({
      version: PROTOCOL_VERSION,
      type: 'answer',
      sessionId,
      pairNonce,
      origin: this.origin,
      applicationId: this.applicationId,
      identity: this.identity,
      description: normalizeDescription(entry.connection.localDescription),
      createdAt: new Date().toISOString()
    });
  }

  async completeAnswer(code = '') {
    this.assertReady();
    const payload = decodeP2PSinSignal(code);
    validateP2PSinScope(payload, this);
    validateP2PSinSignalFreshness(payload, { maxAgeMs: this.signalTtlMs });
    if (payload.type !== 'answer') throw new Error('Se esperaba un código de respuesta de red local.');
    if (normalizeDescription(payload.description).type !== 'answer') throw new Error('La respuesta local no contiene una descripción WebRTC válida.');
    const sessionId = clean(payload.sessionId, 240);
    const entry = this.connections.get(sessionId);
    if (!entry || entry.role !== 'offerer') throw new Error('La invitación local original ya no está disponible en este dispositivo.');
    if (clean(payload.pairNonce, 500) !== entry.pairNonce) throw new Error('La respuesta no corresponde a la invitación local creada.');
    entry.peer = normalizeIdentity(payload.identity || {});
    await entry.connection.setRemoteDescription(normalizeDescription(payload.description));
    return { sessionId, peer: entry.peer };
  }

  async sendBodyToEntries(body = {}, entries = []) {
    this.assertReady();
    const baseEnvelope = {
      type: 'payload',
      version: PROTOCOL_VERSION,
      messageId: randomId('msg'),
      sessionId: '',
      origin: this.origin,
      applicationId: this.applicationId,
      sentAt: new Date().toISOString(),
      body
    };
    const candidateBytes = utf8Bytes(JSON.stringify(baseEnvelope));
    if (candidateBytes.byteLength > this.maxMessageBytes) {
      const error = new Error('El cambio supera el tamaño permitido para la sincronización directa por red local.');
      error.code = 'P2P_SIN_MESSAGE_TOO_LARGE';
      throw error;
    }
    let delivered = 0;
    for (const entry of Array.from(entries || [])) {
      if (!entry?.channel || entry.channel.readyState !== 'open') continue;
      const envelope = { ...baseEnvelope, sessionId: entry.sessionId };
      const encoded = base64UrlEncodeBytes(utf8Bytes(JSON.stringify(envelope)));
      const total = Math.ceil(encoded.length / this.chunkBytes);
      let complete = true;
      for (let index = 0; index < total; index += 1) {
        const writable = await waitForWritableChannel(entry.channel, this.sendBufferLimitBytes, this.sendBufferWaitMs);
        if (!writable) {
          complete = false;
          break;
        }
        const frame = {
          type: 'chunk',
          version: PROTOCOL_VERSION,
          messageId: envelope.messageId,
          index,
          total,
          data: encoded.slice(index * this.chunkBytes, (index + 1) * this.chunkBytes)
        };
        if (!this.sendFrame(entry.channel, frame)) {
          complete = false;
          break;
        }
      }
      if (complete) delivered += 1;
    }
    return { delivered, peers: this.connectedPeers() };
  }

  async sendTo(sessionId = '', body = {}) {
    const cleanSessionId = clean(sessionId, 240);
    const entry = cleanSessionId ? this.channels.get(cleanSessionId) : null;
    if (!entry) return { delivered: 0, peers: this.connectedPeers() };
    return this.sendBodyToEntries(body, [entry]);
  }

  async broadcast(body = {}) {
    return this.sendBodyToEntries(body, this.channels.values());
  }

  emitState(state, detail = {}) {
    try { this.onState({ state, ...detail, status: this.status() }); } catch {}
  }
}

export const P2P_SIN_PROTOCOL_VERSION = PROTOCOL_VERSION;
