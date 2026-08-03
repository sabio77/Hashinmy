const DEFAULT_LEASE_TTL_MS = 9000;
const DEFAULT_HEARTBEAT_MS = 2500;
const DEFAULT_ELECTION_MS = 3000;
const DEFAULT_FALLBACK_SETTLE_MS = 60;

function safeText(value = '', maxLength = 180) {
  return String(value ?? '').replace(/[^a-zA-Z0-9._:-]/g, '_').slice(0, maxLength);
}

function randomId(prefix = 'tab') {
  const cryptoRef = globalThis.crypto;
  const random = cryptoRef?.randomUUID?.().replace(/-/g, '')
    || `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
  return `${prefix}_${random}`;
}

function safeJsonParse(value = '', fallback = null) {
  try {
    return JSON.parse(String(value || ''));
  } catch {
    return fallback;
  }
}

function nonNegativeInteger(value = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : 0;
}

export function classifyTabStateRelay(message = {}, context = {}) {
  const payload = message?.payload && typeof message.payload === 'object' ? message.payload : {};
  const state = payload.state && typeof payload.state === 'object' ? payload.state : null;
  const senderTabId = safeText(message?.senderTabId || '', 180);
  const activeLeaderTabId = safeText(context?.activeLeaderTabId || '', 180);
  const activeLeaderToken = safeText(context?.activeLeaderToken || '', 220);
  const activeLeaderMessageAt = Math.max(0, Number(context?.activeLeaderMessageAt || 0));
  const messageSentAt = Math.max(0, Number(message?.sentAt || 0));
  const recipientIsLeader = context?.recipientIsLeader === true;
  const authoritative = payload.authoritative === true;
  const leaderToken = safeText(message?.leaderToken || payload.leaderToken || '', 220);
  const responseToRequestId = safeText(payload.responseToRequestId || '', 220);
  const pendingStateRequestId = safeText(context?.pendingStateRequestId || '', 220);
  const pendingExpectedLeaderTabId = safeText(context?.pendingExpectedLeaderTabId || '', 180);
  const pendingExpectedLeaderToken = safeText(context?.pendingExpectedLeaderToken || '', 220);
  const responseMatchesPendingRequest = Boolean(
    pendingStateRequestId && responseToRequestId === pendingStateRequestId
  );
  const requestedLeaderMatches = (
    (!pendingExpectedLeaderTabId || senderTabId === pendingExpectedLeaderTabId)
    && (!pendingExpectedLeaderToken || leaderToken === pendingExpectedLeaderToken)
  );
  const requestedResponse = responseMatchesPendingRequest && requestedLeaderMatches;

  if (!state || !senderTabId || !messageSentAt) {
    return {
      action: 'ignore',
      reason: 'invalid_state_message',
      leaderTabId: activeLeaderTabId,
      leaderToken: activeLeaderToken,
      leaderMessageAt: activeLeaderMessageAt
    };
  }
  if (recipientIsLeader) {
    return authoritative
      ? { action: 'ignore', reason: 'competing_leader_state', leaderTabId: activeLeaderTabId, leaderToken: activeLeaderToken, leaderMessageAt: activeLeaderMessageAt }
      : { action: 'reconcile', reason: 'follower_state_invalidated', leaderTabId: activeLeaderTabId, leaderToken: activeLeaderToken, leaderMessageAt: activeLeaderMessageAt };
  }
  if (!authoritative) {
    return { action: 'ignore', reason: 'non_authoritative_state', leaderTabId: activeLeaderTabId, leaderToken: activeLeaderToken, leaderMessageAt: activeLeaderMessageAt };
  }

  // Una respuesta correlacionada solo puede establecer autoridad si pertenece
  // al líder y al término que originaron la solicitud. Sin este cerco, dos
  // anuncios cruzados podían permitir que una respuesta atrasada de un término
  // anterior satisficiera el requestId nuevo y aplicara temporalmente estado viejo.
  if (responseMatchesPendingRequest && !requestedLeaderMatches) {
    return {
      action: 'request',
      reason: 'requested_leader_mismatch',
      leaderTabId: activeLeaderTabId,
      leaderToken: activeLeaderToken,
      leaderMessageAt: activeLeaderMessageAt,
      expectedLeaderTabId: pendingExpectedLeaderTabId,
      expectedLeaderToken: pendingExpectedLeaderToken
    };
  }
  if (requestedResponse) {
    return {
      action: 'apply',
      reason: 'requested_leader_state',
      leaderTabId: senderTabId,
      leaderToken,
      leaderMessageAt: messageSentAt,
      responseToRequestId
    };
  }

  // Una vez conocido un término de liderazgo, únicamente ese término puede
  // publicar estados espontáneos. Un mensaje atrasado del líder anterior no
  // recupera autoridad aunque su sentAt parezca estar en el futuro.
  if (activeLeaderToken) {
    if (!leaderToken || leaderToken !== activeLeaderToken || senderTabId !== activeLeaderTabId) {
      return {
        action: 'request',
        reason: 'leader_term_mismatch',
        leaderTabId: activeLeaderTabId,
        leaderToken: activeLeaderToken,
        leaderMessageAt: activeLeaderMessageAt
      };
    }
    return {
      action: 'apply',
      reason: 'authoritative_leader_term',
      leaderTabId: senderTabId,
      leaderToken,
      leaderMessageAt: messageSentAt
    };
  }

  // Compatibilidad de despliegue con una pestaña antigua que todavía no emite
  // término. Solo esta ruta heredada usa sentAt; en cuanto aparece un término,
  // el cerco anterior sustituye completamente al reloj.
  if (leaderToken) {
    return {
      action: 'apply',
      reason: 'authoritative_leader_term',
      leaderTabId: senderTabId,
      leaderToken,
      leaderMessageAt: messageSentAt
    };
  }
  if (activeLeaderTabId && activeLeaderTabId !== senderTabId && messageSentAt <= activeLeaderMessageAt) {
    return { action: 'ignore', reason: 'stale_leader_state', leaderTabId: activeLeaderTabId, leaderToken: '', leaderMessageAt: activeLeaderMessageAt };
  }
  return {
    action: 'apply',
    reason: 'legacy_authoritative_leader_state',
    leaderTabId: senderTabId,
    leaderToken: '',
    leaderMessageAt: Math.max(activeLeaderMessageAt, messageSentAt)
  };
}

function createTabId() {
  // sessionStorage puede clonarse al duplicar una pestaña. La identidad debe
  // pertenecer al documento vivo para que dos ventanas nunca se ignoren entre sí.
  return randomId('tab');
}

export class P2PTabCoordinator {
  constructor(options = {}) {
    this.windowRef = options.windowRef || globalThis.window || null;
    this.navigatorRef = options.navigatorRef || globalThis.navigator || null;
    this.localStorageRef = options.localStorageRef || this.windowRef?.localStorage || null;
    this.BroadcastChannelRef = options.BroadcastChannelRef || globalThis.BroadcastChannel || null;
    this.now = options.now || (() => Date.now());
    const performanceRef = options.performanceRef || this.windowRef?.performance || globalThis.performance || null;
    // La vida útil de un lease se mide únicamente dentro de este documento. No
    // se comparan relojes de pared entre pestañas, que pueden cambiar o divergir.
    this.monotonicNow = options.monotonicNow || (() => {
      const value = Number(performanceRef?.now?.());
      return Number.isFinite(value) ? value : Date.now();
    });
    this.setTimeoutRef = options.setTimeoutRef || this.windowRef?.setTimeout?.bind(this.windowRef) || globalThis.setTimeout;
    this.clearTimeoutRef = options.clearTimeoutRef || this.windowRef?.clearTimeout?.bind(this.windowRef) || globalThis.clearTimeout;
    this.waitRef = options.waitRef || ((delayMs) => new Promise((resolve) => this.setTimeoutRef(resolve, delayMs)));
    this.leaseTtlMs = Math.max(3000, Number(options.leaseTtlMs || DEFAULT_LEASE_TTL_MS));
    this.heartbeatMs = Math.max(1000, Math.min(this.leaseTtlMs / 2, Number(options.heartbeatMs || DEFAULT_HEARTBEAT_MS)));
    this.electionMs = Math.max(1000, Number(options.electionMs || DEFAULT_ELECTION_MS));
    this.fallbackSettleMs = Math.min(500, Math.max(0, Number(
      options.fallbackSettleMs ?? DEFAULT_FALLBACK_SETTLE_MS
    )));
    this.tabId = createTabId();
    this.generation = 0;
    this.started = false;
    this.suspended = false;
    this.leader = false;
    this.leadershipToken = '';
    this.usingWebLocks = false;
    this.webLockRequestActive = false;
    this.webLockTask = Promise.resolve();
    this.releaseWebLock = null;
    this.fallbackAcquirePromise = null;
    this.fallbackLeaseToken = '';
    this.fallbackStorageActive = false;
    this.fallbackHeartbeatSeq = 0;
    this.fallbackLeaseObservedSignature = '';
    this.fallbackLeaseObservedAt = null;
    this.channel = null;
    this.scope = '';
    this.lockName = '';
    this.leaseKey = '';
    this.messageKey = '';
    this.heartbeatTimer = 0;
    this.electionTimer = 0;
    this.onMessage = null;
    this.onLeadershipChange = null;
    this.leadershipQueue = Promise.resolve();
    this.boundStorage = (event) => this.handleStorageEvent(event);
    this.boundPageHide = (event) => {
      if (event?.persisted === true) {
        this.suspendForPageCache().catch(() => null);
        return;
      }
      this.stop().catch(() => null);
    };
    this.boundPageShow = (event) => {
      if (event?.persisted !== true) return;
      this.resumeFromPageCache().catch(() => null);
    };
  }

  isLeader() {
    return Boolean(this.started && !this.suspended && this.leader);
  }

  async start(options = {}) {
    await this.stop();
    const userId = safeText(options.userId || '', 180);
    const deviceId = safeText(options.deviceId || '', 180);
    const applicationId = safeText(options.applicationId || 'root', 180) || 'root';
    if (!userId || !deviceId) throw new Error('Falta la identidad necesaria para coordinar las ventanas P2P.');

    this.scope = applicationId === 'root'
      ? `${userId}:${deviceId}`
      : `${applicationId}:${userId}:${deviceId}`;
    this.lockName = `semilla-p2p-realtime:${this.scope}`;
    this.leaseKey = `semilla_p2p_realtime_leader:${this.scope}`;
    this.messageKey = `semilla_p2p_tab_message:${this.scope}`;
    this.onMessage = typeof options.onMessage === 'function' ? options.onMessage : null;
    this.onLeadershipChange = typeof options.onLeadershipChange === 'function' ? options.onLeadershipChange : null;
    this.resetFallbackLeaseObservation();
    this.fallbackHeartbeatSeq = 0;
    this.generation += 1;
    this.started = true;
    this.suspended = false;
    this.openChannel();
    this.windowRef?.addEventListener?.('storage', this.boundStorage);
    this.windowRef?.addEventListener?.('pagehide', this.boundPageHide);
    this.windowRef?.addEventListener?.('pageshow', this.boundPageShow);

    const acquired = await this.tryAcquireLeadership();
    this.scheduleElection();
    if (!acquired) this.broadcast('state-request', {});
    return this.isLeader();
  }

  async stop() {
    if (!this.started && !this.webLockRequestActive && !this.fallbackAcquirePromise && !this.channel) return;
    const wasLeader = this.leader;
    const pendingWebLock = this.webLockTask;
    const pendingFallback = this.fallbackAcquirePromise;
    this.generation += 1;
    this.started = false;
    this.suspended = false;
    this.clearTimers();
    this.windowRef?.removeEventListener?.('storage', this.boundStorage);
    this.windowRef?.removeEventListener?.('pagehide', this.boundPageHide);
    this.windowRef?.removeEventListener?.('pageshow', this.boundPageShow);

    if (this.releaseWebLock) {
      const release = this.releaseWebLock;
      this.releaseWebLock = null;
      release();
    }
    if (!this.usingWebLocks) this.releaseFallbackLease();
    this.usingWebLocks = false;
    this.webLockRequestActive = false;
    this.webLockTask = Promise.resolve();
    this.fallbackAcquirePromise = null;
    this.fallbackLeaseToken = '';
    this.fallbackStorageActive = false;
    this.fallbackHeartbeatSeq = 0;
    this.resetFallbackLeaseObservation();
    this.setLeader(false, { notify: wasLeader });

    try {
      this.channel?.close?.();
    } catch {}
    this.channel = null;
    this.scope = '';
    this.lockName = '';
    this.leaseKey = '';
    this.messageKey = '';
    this.onMessage = null;
    this.onLeadershipChange = null;
    await Promise.all([
      this.leadershipQueue.catch(() => null),
      pendingWebLock?.catch?.(() => null) || Promise.resolve(),
      pendingFallback?.catch?.(() => null) || Promise.resolve()
    ]);
  }

  async suspendForPageCache() {
    if (!this.started || this.suspended) return false;
    this.suspended = true;
    this.clearTimers();
    const usedWebLocks = this.usingWebLocks;
    const pendingWebLock = this.webLockTask;
    const pendingFallback = this.fallbackAcquirePromise;
    if (this.releaseWebLock) {
      const release = this.releaseWebLock;
      this.releaseWebLock = null;
      release();
    }
    if (!usedWebLocks) this.releaseFallbackLease();
    this.setLeader(false, { notify: true });
    if (usedWebLocks) await pendingWebLock.catch(() => null);
    if (pendingFallback) await pendingFallback.catch(() => null);
    if (!this.started || !this.suspended) return false;
    this.usingWebLocks = false;
    this.webLockRequestActive = false;
    return true;
  }

  async resumeFromPageCache() {
    if (!this.started) return false;
    if (!this.suspended) return this.isLeader();
    const pendingWebLock = this.webLockTask;
    this.suspended = false;
    await pendingWebLock.catch(() => null);
    if (!this.started || this.suspended) return false;
    this.usingWebLocks = false;
    this.webLockRequestActive = false;
    const acquired = await this.tryAcquireLeadership();
    if (!this.started || this.suspended) return false;
    this.scheduleElection();
    if (!acquired) this.broadcast('state-request', {});
    return this.isLeader();
  }

  async requestLeadership() {
    if (!this.started || this.suspended) return false;
    return this.tryAcquireLeadership();
  }

  broadcast(type = '', payload = {}) {
    if (!this.started || this.suspended || !type) return false;
    const message = {
      scope: this.scope,
      senderTabId: this.tabId,
      type: String(type),
      payload,
      leaderToken: this.isLeader() ? this.leadershipToken : '',
      sentAt: this.now()
    };
    if (this.channel) {
      try {
        this.channel.postMessage(message);
        return true;
      } catch {}
    }
    try {
      this.localStorageRef?.setItem?.(this.messageKey, JSON.stringify({ ...message, nonce: randomId('msg') }));
      this.localStorageRef?.removeItem?.(this.messageKey);
      return true;
    } catch {
      return false;
    }
  }

  openChannel() {
    if (!this.BroadcastChannelRef) return;
    try {
      this.channel = new this.BroadcastChannelRef(`semilla-p2p-tabs:${this.scope}`);
      this.channel.onmessage = (event) => this.receiveMessage(event?.data);
    } catch {
      this.channel = null;
    }
  }

  receiveMessage(message = null) {
    if (!this.started || this.suspended || !message || message.scope !== this.scope || message.senderTabId === this.tabId) return;
    try {
      if (message.type === 'leader-active') this.resolveFallbackLeaderConflict(message);
      this.onMessage?.(message);
    } catch (error) {
      console.error('[SemillaP2P] No se pudo procesar la coordinación entre ventanas:', error);
    }
  }

  handleStorageEvent(event = {}) {
    if (!this.started || this.suspended) return;
    if (event.key === this.messageKey && event.newValue) {
      this.receiveMessage(safeJsonParse(event.newValue, null));
      return;
    }
    if (event.key !== this.leaseKey || this.usingWebLocks) return;
    const lease = safeJsonParse(event.newValue || '', null);
    this.observeFallbackLease(lease, { force: true });
    if (this.leader && !this.ownsFallbackLease(lease)) {
      this.fallbackLeaseToken = '';
      this.setLeader(false);
    }
    if (!lease) this.tryAcquireLeadership().catch(() => null);
  }

  async tryAcquireLeadership() {
    if (!this.started || this.suspended) return false;
    const locks = this.navigatorRef?.locks;
    if (locks && typeof locks.request === 'function') return this.tryAcquireWebLock(locks);
    return this.tryAcquireFallbackLease();
  }

  async tryAcquireWebLock(locks) {
    if (this.isLeader()) return true;
    if (this.suspended) return false;
    if (this.webLockRequestActive) return false;
    const generation = this.generation;
    this.webLockRequestActive = true;
    this.usingWebLocks = true;

    let resolveAttempt;
    const attempted = new Promise((resolve) => { resolveAttempt = resolve; });
    let lockTask;
    lockTask = Promise.resolve(locks.request(this.lockName, { mode: 'exclusive', ifAvailable: true }, async (lock) => {
      if (!this.started || this.suspended || generation !== this.generation || !lock) {
        this.setLeader(false);
        resolveAttempt(false);
        return;
      }
      this.setLeader(true);
      resolveAttempt(true);
      await new Promise((resolve) => { this.releaseWebLock = resolve; });
      this.releaseWebLock = null;
      if (generation === this.generation) this.setLeader(false);
    })).catch((error) => {
      resolveAttempt(false);
      if (this.started) console.error('[SemillaP2P] Falló el bloqueo de ventana líder:', error);
    }).finally(() => {
      if (this.webLockTask === lockTask) this.webLockTask = Promise.resolve();
      if (generation !== this.generation) return;
      this.webLockRequestActive = false;
      if (this.started && !this.suspended && !this.leader) this.scheduleElection();
    });
    this.webLockTask = lockTask;
    return attempted;
  }

  async waitForFallbackSettlement() {
    if (this.fallbackSettleMs <= 0) {
      await Promise.resolve();
      return;
    }
    await this.waitRef(this.fallbackSettleMs);
  }

  tryAcquireFallbackLease() {
    if (!this.started || this.suspended) return Promise.resolve(false);
    if (this.fallbackAcquirePromise) return this.fallbackAcquirePromise;
    const task = this.performFallbackLeaseAcquisition();
    this.fallbackAcquirePromise = task;
    return task.finally(() => {
      if (this.fallbackAcquirePromise === task) this.fallbackAcquirePromise = null;
    });
  }

  async performFallbackLeaseAcquisition() {
    if (!this.started || this.suspended) return false;
    const generation = this.generation;
    if (!this.localStorageRef) {
      this.fallbackStorageActive = false;
      // BroadcastChannel permite arbitrar de forma determinista incluso cuando
      // el navegador bloquea localStorage. Sin ambos mecanismos no existe una
      // exclusión entre documentos; el lease del backend sigue cercando el SSE.
      this.setLeader(true);
      if (this.channel) await this.waitForFallbackSettlement();
      if (!this.started || this.suspended || generation !== this.generation) return false;
      return this.isLeader();
    }

    const now = this.now();
    const current = this.readFallbackLease();
    if (current && !this.ownsFallbackLease(current) && this.isFallbackLeaseFresh(current)) {
      this.fallbackStorageActive = true;
      this.fallbackLeaseToken = '';
      this.setLeader(false);
      return false;
    }

    const leaseToken = randomId('lease');
    const candidate = {
      tabId: this.tabId,
      leaseToken,
      heartbeatSeq: 1,
      claimedAt: now,
      // Compatibilidad informativa para clientes anteriores. La versión actual
      // decide vigencia con heartbeatSeq y edad monotónica local.
      expiresAt: now + this.leaseTtlMs
    };
    try {
      this.localStorageRef.setItem(this.leaseKey, JSON.stringify(candidate));
      this.observeFallbackLease(candidate, { force: true });
      this.fallbackStorageActive = true;
      await this.waitForFallbackSettlement();
      if (!this.started || this.suspended || generation !== this.generation) {
        this.releaseFallbackCandidate(leaseToken);
        return false;
      }
      const confirmed = this.readFallbackLease();
      const acquired = confirmed?.tabId === this.tabId
        && confirmed?.leaseToken === leaseToken;
      this.fallbackLeaseToken = acquired ? leaseToken : '';
      this.fallbackHeartbeatSeq = acquired ? Math.max(1, nonNegativeInteger(confirmed?.heartbeatSeq || 1)) : 0;
      this.setLeader(acquired);
      if (acquired) this.scheduleHeartbeat();
      return acquired;
    } catch {
      this.fallbackStorageActive = false;
      this.fallbackLeaseToken = '';
      // Si localStorage falla después de abrir BroadcastChannel, se conserva
      // una elección determinista entre pares antes de activar el stream.
      this.setLeader(true);
      if (this.channel) await this.waitForFallbackSettlement();
      if (!this.started || this.suspended || generation !== this.generation) return false;
      return this.isLeader();
    }
  }

  fallbackLeaseSignature(lease = null) {
    if (!lease || typeof lease !== 'object') return '';
    const tabId = safeText(lease.tabId || '', 180);
    if (!tabId) return '';
    return [
      tabId,
      safeText(lease.leaseToken || '', 220),
      nonNegativeInteger(lease.heartbeatSeq || 0),
      String(lease.claimedAt ?? ''),
      String(lease.expiresAt ?? '')
    ].join('|');
  }

  resetFallbackLeaseObservation() {
    this.fallbackLeaseObservedSignature = '';
    this.fallbackLeaseObservedAt = null;
  }

  observeFallbackLease(lease = null, options = {}) {
    const signature = this.fallbackLeaseSignature(lease);
    if (!signature) {
      this.resetFallbackLeaseObservation();
      return { signature: '', ageMs: Infinity };
    }
    const observedNow = Number(this.monotonicNow());
    const safeObservedNow = Number.isFinite(observedNow) ? observedNow : Date.now();
    const clockMovedBackward = this.fallbackLeaseObservedAt !== null
      && safeObservedNow < this.fallbackLeaseObservedAt;
    if (options.force === true
      || signature !== this.fallbackLeaseObservedSignature
      || this.fallbackLeaseObservedAt === null
      || clockMovedBackward) {
      this.fallbackLeaseObservedSignature = signature;
      this.fallbackLeaseObservedAt = safeObservedNow;
    }
    return {
      signature,
      ageMs: Math.max(0, safeObservedNow - Number(this.fallbackLeaseObservedAt || 0))
    };
  }

  isFallbackLeaseFresh(lease = null) {
    if (!lease) return false;
    if (this.ownsFallbackLease(lease)) return true;
    return this.observeFallbackLease(lease).ageMs < this.leaseTtlMs;
  }

  readFallbackLease() {
    try {
      const lease = safeJsonParse(this.localStorageRef?.getItem?.(this.leaseKey) || '', null);
      this.observeFallbackLease(lease);
      return lease;
    } catch {
      return null;
    }
  }

  ownsFallbackLease(lease = this.readFallbackLease()) {
    if (!lease || lease.tabId !== this.tabId) return false;
    const storedToken = String(lease.leaseToken || '');
    return this.fallbackLeaseToken
      ? storedToken === this.fallbackLeaseToken
      : Boolean(storedToken);
  }

  releaseFallbackCandidate(leaseToken = '') {
    try {
      const current = this.readFallbackLease();
      if (current?.tabId === this.tabId && current?.leaseToken === leaseToken) {
        this.localStorageRef?.removeItem?.(this.leaseKey);
        this.resetFallbackLeaseObservation();
      }
    } catch {}
  }

  releaseFallbackLease() {
    try {
      const current = this.readFallbackLease();
      if (this.ownsFallbackLease(current)) this.localStorageRef?.removeItem?.(this.leaseKey);
    } catch {}
    this.fallbackLeaseToken = '';
    this.fallbackHeartbeatSeq = 0;
    this.resetFallbackLeaseObservation();
  }

  resolveFallbackLeaderConflict(message = {}) {
    if (!this.leader || this.usingWebLocks) return;
    const senderTabId = safeText(message.senderTabId || message.payload?.tabId || '', 180);
    const senderStorageBacked = message.payload?.storageBacked === true;
    if (!senderTabId || senderTabId === this.tabId) return;

    if (this.fallbackStorageActive) {
      const lease = this.readFallbackLease();
      if (!this.ownsFallbackLease(lease)) {
        this.fallbackLeaseToken = '';
        this.setLeader(false);
      } else if (!senderStorageBacked && message.payload?.arbitration !== true) {
        this.broadcast('leader-active', {
          tabId: this.tabId,
          leaseToken: this.fallbackLeaseToken,
          storageBacked: true,
          arbitration: true
        });
      }
      return;
    }

    if (senderStorageBacked) {
      this.setLeader(false);
      return;
    }

    // Sin almacenamiento compartido, todas las pestañas usan el mismo criterio
    // estable: la identidad lexicográficamente menor conserva el liderazgo.
    if (senderTabId < this.tabId) {
      this.setLeader(false);
      return;
    }
    this.broadcast('leader-active', {
      tabId: this.tabId,
      leaseToken: '',
      storageBacked: false,
      arbitration: true
    });
  }

  renewFallbackLease() {
    const current = this.readFallbackLease();
    if (!this.ownsFallbackLease(current)) return false;
    const nextHeartbeatSeq = Math.max(
      nonNegativeInteger(current?.heartbeatSeq || 0),
      nonNegativeInteger(this.fallbackHeartbeatSeq || 0)
    ) + 1;
    const renewed = {
      tabId: this.tabId,
      leaseToken: this.fallbackLeaseToken,
      heartbeatSeq: nextHeartbeatSeq,
      claimedAt: Number(current?.claimedAt || this.now()),
      expiresAt: this.now() + this.leaseTtlMs
    };
    try {
      this.localStorageRef?.setItem?.(this.leaseKey, JSON.stringify(renewed));
      this.fallbackHeartbeatSeq = nextHeartbeatSeq;
      this.observeFallbackLease(renewed, { force: true });
      return true;
    } catch {
      return false;
    }
  }

  scheduleHeartbeat() {
    if (!this.started || this.suspended || this.usingWebLocks || !this.leader || this.heartbeatTimer) return;
    const generation = this.generation;
    this.heartbeatTimer = this.setTimeoutRef(() => {
      this.heartbeatTimer = 0;
      if (!this.started || this.suspended || generation !== this.generation || this.usingWebLocks || !this.leader) return;
      if (!this.renewFallbackLease()) {
        this.fallbackLeaseToken = '';
        this.setLeader(false);
        this.scheduleElection();
        return;
      }
      this.scheduleHeartbeat();
    }, this.heartbeatMs);
  }

  scheduleElection() {
    if (!this.started || this.suspended || this.leader || this.electionTimer) return;
    const generation = this.generation;
    this.electionTimer = this.setTimeoutRef(() => {
      this.electionTimer = 0;
      if (!this.started || this.suspended || generation !== this.generation) return;
      this.tryAcquireLeadership().catch(() => null).finally(() => {
        if (this.started && !this.suspended && generation === this.generation && !this.leader) this.scheduleElection();
      });
    }, this.electionMs);
  }

  clearTimers() {
    if (this.heartbeatTimer) this.clearTimeoutRef(this.heartbeatTimer);
    if (this.electionTimer) this.clearTimeoutRef(this.electionTimer);
    this.heartbeatTimer = 0;
    this.electionTimer = 0;
  }

  setLeader(value, options = {}) {
    const next = Boolean(value && this.started && !this.suspended);
    const wasLeader = this.leader;
    if (wasLeader === next && options.notify !== true) return;
    if (next && !wasLeader) {
      this.leadershipToken = this.fallbackLeaseToken || randomId('leader');
    } else if (!next) {
      this.leadershipToken = '';
      this.fallbackHeartbeatSeq = 0;
    }
    this.leader = next;
    if (next && this.electionTimer) {
      this.clearTimeoutRef(this.electionTimer);
      this.electionTimer = 0;
    }
    if (!next && this.heartbeatTimer) {
      this.clearTimeoutRef(this.heartbeatTimer);
      this.heartbeatTimer = 0;
    }
    if (next) this.broadcast('leader-active', {
      tabId: this.tabId,
      leaseToken: this.usingWebLocks ? '' : this.fallbackLeaseToken,
      storageBacked: !this.usingWebLocks && this.fallbackStorageActive,
      leadershipToken: this.leadershipToken
    });
    else if (this.started) this.scheduleElection();
    const callback = this.onLeadershipChange;
    if (!callback) return;
    this.leadershipQueue = this.leadershipQueue
      .then(() => callback(next))
      .catch((error) => console.error('[SemillaP2P] Falló el cambio de ventana líder:', error));
  }
}

export default P2PTabCoordinator;
