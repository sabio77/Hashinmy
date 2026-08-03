import { readFileSync } from 'node:fs';
import { P2PTabCoordinator, classifyTabStateRelay } from '../src/js/p2p-tab-coordinator.js';

const followerStateMessage = {
  senderTabId: 'tab_follower',
  sentAt: 200,
  payload: {
    state: { spaces: [{ spaceId: 'space_stale', authorizationState: 'confirmed' }] },
    authoritative: false
  }
};
const leaderStateMessage = {
  senderTabId: 'tab_leader_new',
  leaderToken: 'leader_term_new',
  sentAt: 300,
  payload: {
    state: { spaces: [{ spaceId: 'space_current', authorizationState: 'confirmed' }] },
    authoritative: true
  }
};

const leaderDecision = classifyTabStateRelay(followerStateMessage, {
  recipientIsLeader: true,
  activeLeaderTabId: 'tab_leader_new',
  activeLeaderToken: 'leader_term_new',
  activeLeaderMessageAt: 300
});
if (leaderDecision.action !== 'reconcile') {
  throw new Error('La pestaña líder aceptó directamente un estado completo enviado por una seguidora.');
}
const followerDecision = classifyTabStateRelay(followerStateMessage, {
  recipientIsLeader: false,
  activeLeaderTabId: 'tab_leader_new',
  activeLeaderToken: 'leader_term_new',
  activeLeaderMessageAt: 300
});
if (followerDecision.action !== 'ignore') {
  throw new Error('Una pestaña seguidora propagó como autoritativo el estado no verificado de otra seguidora.');
}
const currentLeaderDecision = classifyTabStateRelay(leaderStateMessage, {
  recipientIsLeader: false,
  activeLeaderTabId: 'tab_leader_new',
  activeLeaderToken: 'leader_term_new',
  activeLeaderMessageAt: 300
});
if (currentLeaderDecision.action !== 'apply') {
  throw new Error('La pestaña seguidora rechazó el estado emitido por el líder vigente.');
}
const staleLeaderDecision = classifyTabStateRelay({
  ...leaderStateMessage,
  senderTabId: 'tab_leader_old',
  leaderToken: 'leader_term_old',
  sentAt: 9999999999999
}, {
  recipientIsLeader: false,
  activeLeaderTabId: 'tab_leader_new',
  activeLeaderToken: 'leader_term_new',
  activeLeaderMessageAt: 300
});
if (staleLeaderDecision.action !== 'request' || staleLeaderDecision.reason !== 'leader_term_mismatch') {
  throw new Error('Un mensaje atrasado del líder anterior con reloj futuro pudo recuperar autoridad.');
}
const promotedLeaderDecision = classifyTabStateRelay({
  ...leaderStateMessage,
  senderTabId: 'tab_leader_promoted',
  leaderToken: 'leader_term_promoted',
  sentAt: 100,
  payload: {
    ...leaderStateMessage.payload,
    responseToRequestId: 'tab_state_request_1'
  }
}, {
  recipientIsLeader: false,
  activeLeaderTabId: 'tab_leader_old',
  activeLeaderToken: 'leader_term_old',
  activeLeaderMessageAt: 9999999999999,
  pendingStateRequestId: 'tab_state_request_1'
});
if (promotedLeaderDecision.action !== 'apply'
  || promotedLeaderDecision.reason !== 'requested_leader_state'
  || promotedLeaderDecision.leaderTabId !== 'tab_leader_promoted'
  || promotedLeaderDecision.leaderToken !== 'leader_term_promoted') {
  throw new Error('Una respuesta correlacionada del nuevo líder quedó bloqueada por el reloj del líder anterior.');
}
const crossedLeaderResponseDecision = classifyTabStateRelay({
  ...leaderStateMessage,
  senderTabId: 'tab_leader_old',
  leaderToken: 'leader_term_old',
  payload: {
    ...leaderStateMessage.payload,
    responseToRequestId: 'tab_state_request_targeted'
  }
}, {
  recipientIsLeader: false,
  activeLeaderTabId: 'tab_leader_old',
  activeLeaderToken: 'leader_term_old',
  activeLeaderMessageAt: 300,
  pendingStateRequestId: 'tab_state_request_targeted',
  pendingExpectedLeaderTabId: 'tab_leader_promoted',
  pendingExpectedLeaderToken: 'leader_term_promoted'
});
if (crossedLeaderResponseDecision.action !== 'request'
  || crossedLeaderResponseDecision.reason !== 'requested_leader_mismatch'
  || crossedLeaderResponseDecision.expectedLeaderTabId !== 'tab_leader_promoted'
  || crossedLeaderResponseDecision.expectedLeaderToken !== 'leader_term_promoted') {
  throw new Error('Una respuesta correlacionada de un término distinto pudo satisfacer la solicitud dirigida al nuevo líder.');
}

const clientSource = readFileSync(new URL('../src/js/p2p-client.js', import.meta.url), 'utf8');
for (const required of [
  'authoritative: this.realtimeLeader === true',
  'scheduleTabStateReconciliation(payload, sessionContext)',
  "stage: 'tab-state-reconciliation'",
  'classifyTabStateRelay(message',
  'pendingStateRequestId: this.pendingTabStateRequestId',
  'pendingExpectedLeaderTabId: this.pendingTabStateLeaderTabId',
  'pendingExpectedLeaderToken: this.pendingTabStateLeaderToken',
  'targetLeaderTabId: this.pendingTabStateLeaderTabId',
  'targetLeaderToken: this.pendingTabStateLeaderToken',
  'TAB_STATE_REQUEST_TARGETED_RETRY_LIMIT',
  'schedulePendingTabStateRequestRetry(cleanRequestId)',
  "this.requestTabState('leader-term-mismatch', {",
  "expectedLeaderTabId: decision.expectedLeaderTabId || ''",
  "expectedLeaderToken: decision.expectedLeaderToken || ''",
  'responseToRequestId'
]) {
  if (!clientSource.includes(required)) {
    throw new Error(`La integración multiventana perdió el cerco de autoridad requerido: ${required}`);
  }
}

class MemoryStorage {
  constructor() { this.values = new Map(); }
  getItem(key) { return this.values.has(key) ? this.values.get(key) : null; }
  setItem(key, value) { this.values.set(key, String(value)); }
  removeItem(key) { this.values.delete(key); }
}

class BlockedStorage {
  getItem() { throw new Error('storage blocked'); }
  setItem() { throw new Error('storage blocked'); }
  removeItem() { throw new Error('storage blocked'); }
}

class RacingStorage extends MemoryStorage {
  constructor() {
    super();
    this.staleReadsRemaining = 2;
  }
  getItem(key) {
    if (String(key).startsWith('semilla_p2p_realtime_leader:') && this.staleReadsRemaining > 0) {
      this.staleReadsRemaining -= 1;
      return null;
    }
    return super.getItem(key);
  }
}

function createBarrier(participants = 2) {
  let waiting = 0;
  let release = null;
  const promise = new Promise((resolve) => { release = resolve; });
  return async () => {
    waiting += 1;
    if (waiting >= participants) release();
    await promise;
  };
}

class FakeWindow {
  constructor(localStorage, sessionStorage) {
    this.localStorage = localStorage;
    this.sessionStorage = sessionStorage;
    this.listeners = new Map();
  }
  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) || new Set();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }
  removeEventListener(type, listener) { this.listeners.get(type)?.delete(listener); }
  setTimeout() { return 1; }
  clearTimeout() {}
}

class FakeLockManager {
  constructor() { this.held = new Set(); }
  request(name, options, callback) {
    if (options?.ifAvailable && this.held.has(name)) return Promise.resolve(callback(null));
    this.held.add(name);
    return Promise.resolve(callback({ name })).finally(() => this.held.delete(name));
  }
}

const channelGroups = new Map();
class FakeBroadcastChannel {
  constructor(name) {
    this.name = name;
    this.onmessage = null;
    const group = channelGroups.get(name) || new Set();
    group.add(this);
    channelGroups.set(name, group);
  }
  postMessage(message) {
    for (const channel of channelGroups.get(this.name) || []) {
      if (channel === this) continue;
      queueMicrotask(() => channel.onmessage?.({ data: structuredClone(message) }));
    }
  }
  close() {
    channelGroups.get(this.name)?.delete(this);
  }
}

const localStorage = new MemoryStorage();
const clonedSessionStorage = new MemoryStorage();
const locks = new FakeLockManager();
const messagesA = [];
const messagesB = [];
const leadershipA = [];
const leadershipB = [];
const common = {
  localStorageRef: localStorage,
  BroadcastChannelRef: FakeBroadcastChannel,
  navigatorRef: { locks },
  setTimeoutRef: () => 1,
  clearTimeoutRef: () => {}
};
const coordinatorA = new P2PTabCoordinator({
  ...common,
  windowRef: new FakeWindow(localStorage, clonedSessionStorage)
});
const coordinatorB = new P2PTabCoordinator({
  ...common,
  windowRef: new FakeWindow(localStorage, clonedSessionStorage)
});
if (coordinatorA.tabId === coordinatorB.tabId) {
  throw new Error('Dos documentos con sessionStorage clonado heredaron la misma identidad de ventana.');
}

const leaderA = await coordinatorA.start({
  userId: 'usr_1',
  deviceId: 'dev_123456789012',
  onMessage: (message) => messagesA.push(message),
  onLeadershipChange: (leader) => leadershipA.push(leader)
});
const leaderB = await coordinatorB.start({
  userId: 'usr_1',
  deviceId: 'dev_123456789012',
  onMessage: (message) => messagesB.push(message),
  onLeadershipChange: (leader) => leadershipB.push(leader)
});
if (!leaderA || leaderB || !coordinatorA.isLeader() || coordinatorB.isLeader()) {
  throw new Error('Dos ventanas de la misma instalación pudieron asumir simultáneamente el stream P2P.');
}
if (!coordinatorA.leadershipToken || coordinatorB.leadershipToken) {
  throw new Error('El término de liderazgo no quedó ligado exclusivamente a la ventana líder.');
}
const firstLeadershipToken = coordinatorA.leadershipToken;

coordinatorA.broadcast('state', { state: { spaces: [{ spaceId: 'space_1' }] } });
await new Promise((resolve) => setTimeout(resolve, 0));
const relayedStates = messagesB.filter((message) => message.type === 'state');
if (relayedStates.length !== 1) {
  throw new Error('La ventana seguidora no recibió la actualización local de estado del líder.');
}
if (relayedStates[0].leaderToken !== firstLeadershipToken) {
  throw new Error('El estado multiventana no quedó cercado por el término del líder emisor.');
}
if (messagesA.some((message) => message.type === 'state')) {
  throw new Error('La coordinación devolvió al emisor su propio mensaje y puede producir bucles.');
}

await coordinatorA.stop();
await new Promise((resolve) => setTimeout(resolve, 0));
const promoted = await coordinatorB.requestLeadership();
if (!promoted || !coordinatorB.isLeader()) {
  throw new Error('La ventana seguidora no tomó el stream después del cierre del líder.');
}
if (!coordinatorB.leadershipToken || coordinatorB.leadershipToken === firstLeadershipToken) {
  throw new Error('El relevo reutilizó el término del líder anterior y no puede cercar mensajes demorados.');
}
if (!leadershipA.includes(true) || !leadershipA.includes(false) || !leadershipB.includes(true)) {
  throw new Error('Los cambios de liderazgo no se notificaron de forma determinista.');
}
await coordinatorB.stop();

const fallbackStorage = new MemoryStorage();
const fallbackA = new P2PTabCoordinator({
  windowRef: new FakeWindow(fallbackStorage, new MemoryStorage()),
  localStorageRef: fallbackStorage,
  navigatorRef: {},
  BroadcastChannelRef: FakeBroadcastChannel,
  waitRef: async () => {},
  setTimeoutRef: () => 1,
  clearTimeoutRef: () => {}
});
const fallbackB = new P2PTabCoordinator({
  windowRef: new FakeWindow(fallbackStorage, new MemoryStorage()),
  localStorageRef: fallbackStorage,
  navigatorRef: {},
  BroadcastChannelRef: FakeBroadcastChannel,
  waitRef: async () => {},
  setTimeoutRef: () => 1,
  clearTimeoutRef: () => {}
});
if (!await fallbackA.start({ userId: 'usr_2', deviceId: 'dev_abcdefghijkl' })) {
  throw new Error('El fallback sin Web Locks no pudo adquirir el lease inicial.');
}
if (await fallbackB.start({ userId: 'usr_2', deviceId: 'dev_abcdefghijkl' })) {
  throw new Error('El fallback local permitió dos líderes simultáneos.');
}
await fallbackA.stop();
if (!await fallbackB.requestLeadership()) {
  throw new Error('El fallback local no recuperó el liderazgo liberado.');
}
await fallbackB.stop();

const racingStorage = new RacingStorage();
const racingBarrier = createBarrier(2);
const racingA = new P2PTabCoordinator({
  windowRef: new FakeWindow(racingStorage, new MemoryStorage()),
  localStorageRef: racingStorage,
  navigatorRef: {},
  BroadcastChannelRef: FakeBroadcastChannel,
  waitRef: racingBarrier,
  setTimeoutRef: () => 1,
  clearTimeoutRef: () => {}
});
const racingB = new P2PTabCoordinator({
  windowRef: new FakeWindow(racingStorage, new MemoryStorage()),
  localStorageRef: racingStorage,
  navigatorRef: {},
  BroadcastChannelRef: FakeBroadcastChannel,
  waitRef: racingBarrier,
  setTimeoutRef: () => 1,
  clearTimeoutRef: () => {}
});
const racingResults = await Promise.all([
  racingA.start({ userId: 'usr_race', deviceId: 'dev_fallback_race' }),
  racingB.start({ userId: 'usr_race', deviceId: 'dev_fallback_race' })
]);
await new Promise((resolve) => setTimeout(resolve, 0));
const racingLeaders = [racingA, racingB].filter((coordinator) => coordinator.isLeader());
if (racingResults.filter(Boolean).length !== 1 || racingLeaders.length !== 1) {
  throw new Error('Una carrera simultánea de localStorage dejó más de una pestaña como líder P2P.');
}
const racingLease = JSON.parse(racingStorage.getItem(racingA.leaseKey) || '{}');
if (!racingLease.leaseToken || racingLease.tabId !== racingLeaders[0].tabId) {
  throw new Error('El fallback no cercó al líder ganador con una identidad de lease verificable.');
}
await Promise.all([racingA.stop(), racingB.stop()]);

const blockedStorage = new BlockedStorage();
const blockedA = new P2PTabCoordinator({
  windowRef: new FakeWindow(blockedStorage, new MemoryStorage()),
  localStorageRef: blockedStorage,
  navigatorRef: {},
  BroadcastChannelRef: FakeBroadcastChannel,
  waitRef: async () => {},
  setTimeoutRef: () => 1,
  clearTimeoutRef: () => {}
});
const blockedB = new P2PTabCoordinator({
  windowRef: new FakeWindow(blockedStorage, new MemoryStorage()),
  localStorageRef: blockedStorage,
  navigatorRef: {},
  BroadcastChannelRef: FakeBroadcastChannel,
  waitRef: async () => {},
  setTimeoutRef: () => 1,
  clearTimeoutRef: () => {}
});
await blockedA.start({ userId: 'usr_blocked', deviceId: 'dev_storage_blocked' });
await blockedB.start({ userId: 'usr_blocked', deviceId: 'dev_storage_blocked' });
await new Promise((resolve) => setTimeout(resolve, 0));
if ([blockedA, blockedB].filter((coordinator) => coordinator.isLeader()).length !== 1) {
  throw new Error('BroadcastChannel no resolvió el doble liderazgo cuando localStorage estaba bloqueado.');
}
await Promise.all([blockedA.stop(), blockedB.stop()]);

const mixedStorage = new MemoryStorage();
const mixedStorageLeader = new P2PTabCoordinator({
  windowRef: new FakeWindow(mixedStorage, new MemoryStorage()),
  localStorageRef: mixedStorage,
  navigatorRef: {},
  BroadcastChannelRef: FakeBroadcastChannel,
  waitRef: async () => {},
  setTimeoutRef: () => 1,
  clearTimeoutRef: () => {}
});
const mixedBlockedCandidate = new P2PTabCoordinator({
  windowRef: new FakeWindow(blockedStorage, new MemoryStorage()),
  localStorageRef: blockedStorage,
  navigatorRef: {},
  BroadcastChannelRef: FakeBroadcastChannel,
  waitRef: async () => {},
  setTimeoutRef: () => 1,
  clearTimeoutRef: () => {}
});
await mixedStorageLeader.start({ userId: 'usr_mixed', deviceId: 'dev_mixed_storage' });
await mixedBlockedCandidate.start({ userId: 'usr_mixed', deviceId: 'dev_mixed_storage' });
await new Promise((resolve) => setTimeout(resolve, 0));
if (!mixedStorageLeader.isLeader() || mixedBlockedCandidate.isLeader()) {
  throw new Error('Una candidata sin storage desplazó o duplicó a un líder respaldado por lease verificable.');
}
await Promise.all([mixedStorageLeader.stop(), mixedBlockedCandidate.stop()]);

const leaseRecoveryStorage = new MemoryStorage();
const leaseRecovery = new P2PTabCoordinator({
  windowRef: new FakeWindow(leaseRecoveryStorage, new MemoryStorage()),
  localStorageRef: leaseRecoveryStorage,
  navigatorRef: {},
  BroadcastChannelRef: FakeBroadcastChannel,
  waitRef: async () => {},
  setTimeoutRef: () => 17,
  clearTimeoutRef: () => {}
});
await leaseRecovery.start({ userId: 'usr_3', deviceId: 'dev_lease_recovery' });
leaseRecovery.handleStorageEvent({
  key: leaseRecovery.leaseKey,
  newValue: JSON.stringify({ tabId: 'tab_competidora', expiresAt: Date.now() + 9000 })
});
if (leaseRecovery.isLeader() || leaseRecovery.electionTimer !== 17) {
  throw new Error('Una ventana desplazada no programó la recuperación del liderazgo tras vencer el lease competidor.');
}
await leaseRecovery.stop();

const clockSkewStorage = new MemoryStorage();
const clockSkewLeaseKey = 'semilla_p2p_realtime_leader:usr_clock_skew:dev_clock_skew';
clockSkewStorage.setItem(clockSkewLeaseKey, JSON.stringify({
  tabId: 'tab_dead_future_clock',
  leaseToken: 'lease_dead_future_clock',
  heartbeatSeq: 41,
  claimedAt: 9999999990000,
  expiresAt: 9999999999999
}));
let skewedWallClock = 1000;
let monotonicClock = 0;
const clockSkewCandidate = new P2PTabCoordinator({
  windowRef: new FakeWindow(clockSkewStorage, new MemoryStorage()),
  localStorageRef: clockSkewStorage,
  navigatorRef: {},
  BroadcastChannelRef: FakeBroadcastChannel,
  now: () => skewedWallClock,
  monotonicNow: () => monotonicClock,
  leaseTtlMs: 3000,
  waitRef: async () => {},
  setTimeoutRef: () => 1,
  clearTimeoutRef: () => {}
});
if (await clockSkewCandidate.start({ userId: 'usr_clock_skew', deviceId: 'dev_clock_skew' })) {
  throw new Error('Un lease futuro recién observado fue desplazado antes de agotar el TTL local monotónico.');
}
monotonicClock = 2999;
if (await clockSkewCandidate.requestLeadership()) {
  throw new Error('La ventana candidata ignoró un heartbeat todavía vigente según su reloj monotónico local.');
}
monotonicClock = 3001;
if (!await clockSkewCandidate.requestLeadership() || !clockSkewCandidate.isLeader()) {
  throw new Error('Un reloj de pared adelantado dejó bloqueado indefinidamente el relevo de un lease fallback abandonado.');
}
const leaseBeforeRollback = JSON.parse(clockSkewStorage.getItem(clockSkewLeaseKey) || '{}');
skewedWallClock = -500000;
if (!clockSkewCandidate.renewFallbackLease()) {
  throw new Error('El líder fallback no pudo renovar su lease después de un retroceso del reloj de pared.');
}
const leaseAfterRollback = JSON.parse(clockSkewStorage.getItem(clockSkewLeaseKey) || '{}');
if (Number(leaseAfterRollback.heartbeatSeq || 0) <= Number(leaseBeforeRollback.heartbeatSeq || 0)) {
  throw new Error('El heartbeat fallback continuó dependiendo exclusivamente de expiresAt y no avanzó una secuencia lógica.');
}
let followerMonotonicClock = 0;
const oppositeClockFollower = new P2PTabCoordinator({
  windowRef: new FakeWindow(clockSkewStorage, new MemoryStorage()),
  localStorageRef: clockSkewStorage,
  navigatorRef: {},
  BroadcastChannelRef: FakeBroadcastChannel,
  now: () => 9999999999999,
  monotonicNow: () => followerMonotonicClock,
  leaseTtlMs: 3000,
  waitRef: async () => {},
  setTimeoutRef: () => 1,
  clearTimeoutRef: () => {}
});
if (await oppositeClockFollower.start({ userId: 'usr_clock_skew', deviceId: 'dev_clock_skew' })) {
  throw new Error('Una ventana con reloj adelantado desplazó un lease activo cuyo expiresAt parecía estar en el pasado.');
}
followerMonotonicClock = 2500;
if (!clockSkewCandidate.renewFallbackLease()) {
  throw new Error('El líder no pudo emitir el heartbeat lógico necesario para conservar el lease activo.');
}
if (await oppositeClockFollower.requestLeadership()) {
  throw new Error('La candidata ignoró el avance de heartbeatSeq y robó un lease activo por divergencia del reloj de pared.');
}
await clockSkewCandidate.stop();
if (!await oppositeClockFollower.requestLeadership() || !oppositeClockFollower.isLeader()) {
  throw new Error('La candidata no recuperó inmediatamente el liderazgo después de la liberación explícita del lease.');
}
await oppositeClockFollower.stop();

const bfcacheStorage = new MemoryStorage();
const bfcacheLocks = new FakeLockManager();
const bfcacheWindow = new FakeWindow(bfcacheStorage, new MemoryStorage());
const bfcacheLeadership = [];
const bfcacheCoordinator = new P2PTabCoordinator({
  windowRef: bfcacheWindow,
  localStorageRef: bfcacheStorage,
  navigatorRef: { locks: bfcacheLocks },
  BroadcastChannelRef: FakeBroadcastChannel,
  setTimeoutRef: () => 1,
  clearTimeoutRef: () => {}
});
const bfcacheCompanion = new P2PTabCoordinator({
  windowRef: new FakeWindow(bfcacheStorage, new MemoryStorage()),
  localStorageRef: bfcacheStorage,
  navigatorRef: { locks: bfcacheLocks },
  BroadcastChannelRef: FakeBroadcastChannel,
  setTimeoutRef: () => 1,
  clearTimeoutRef: () => {}
});
await bfcacheCoordinator.start({
  userId: 'usr_4',
  deviceId: 'dev_bfcache_safe',
  onLeadershipChange: (leader) => bfcacheLeadership.push(leader)
});
if (!bfcacheWindow.listeners.get('pagehide')?.has(bfcacheCoordinator.boundPageHide)
  || !bfcacheWindow.listeners.get('pageshow')?.has(bfcacheCoordinator.boundPageShow)) {
  throw new Error('La coordinación no registró el ciclo de suspensión y restauración de BFCache.');
}
bfcacheCoordinator.boundPageHide({ persisted: true });
await new Promise((resolve) => setTimeout(resolve, 0));
await bfcacheCoordinator.leadershipQueue;
if (!bfcacheCoordinator.started || !bfcacheCoordinator.suspended || bfcacheCoordinator.isLeader()) {
  throw new Error('Una página guardada en BFCache conservó el liderazgo realtime mientras estaba congelada.');
}
if (!bfcacheLeadership.includes(false)) {
  throw new Error('La suspensión BFCache no notificó al cliente para cerrar stream, ACK y outbox del líder congelado.');
}
if (!await bfcacheCompanion.start({ userId: 'usr_4', deviceId: 'dev_bfcache_safe' })) {
  throw new Error('Otra ventana no pudo asumir el liderazgo mientras la página principal estaba en BFCache.');
}
if (await bfcacheCoordinator.resumeFromPageCache()) {
  throw new Error('Una página restaurada desde BFCache ignoró al líder vigente y creó un liderazgo duplicado.');
}
if (bfcacheCoordinator.suspended || bfcacheCoordinator.isLeader()) {
  throw new Error('La página restaurada no quedó como seguidora activa del líder vigente.');
}
await bfcacheCompanion.stop();
if (!await bfcacheCoordinator.requestLeadership() || !bfcacheCoordinator.isLeader()) {
  throw new Error('La página restaurada no pudo recuperar el liderazgo después de quedar disponible.');
}
await bfcacheCoordinator.suspendForPageCache();
bfcacheCoordinator.boundPageShow({ persisted: true });
await new Promise((resolve) => setTimeout(resolve, 0));
if (!bfcacheCoordinator.isLeader() || bfcacheCoordinator.suspended) {
  throw new Error('El evento pageshow no revalidó el liderazgo después de restaurar la página desde BFCache.');
}
await bfcacheCoordinator.stop();

console.log('OK: liderazgo único por instalación, respuestas dirigidas por término, carrera fallback cercada, lease monotónico resistente a cambios de reloj, arbitraje sin storage, relevo automático, BFCache seguro y propagación local validados.');
