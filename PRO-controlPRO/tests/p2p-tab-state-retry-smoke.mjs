import { webcrypto } from 'node:crypto';

class MemoryStorage {
  constructor() { this.values = new Map(); }
  getItem(key) { return this.values.has(key) ? this.values.get(key) : null; }
  setItem(key, value) { this.values.set(key, String(value)); }
  removeItem(key) { this.values.delete(key); }
}

const timers = new Map();
const scheduledDelays = [];
let nextTimerId = 1;
const localStorage = new MemoryStorage();
localStorage.setItem('semilla_google_session_token', 'session_retry_test');

globalThis.CustomEvent = class CustomEvent {
  constructor(type, options = {}) {
    this.type = type;
    this.detail = options.detail;
  }
};
globalThis.window = {
  crypto: webcrypto,
  localStorage,
  location: { hostname: 'localhost' },
  performance: { now: () => 1 },
  setTimeout(callback, delay) {
    const id = nextTimerId++;
    timers.set(id, callback);
    scheduledDelays.push(Number(delay));
    return id;
  },
  clearTimeout(id) { timers.delete(id); },
  addEventListener() {},
  removeEventListener() {},
  dispatchEvent() { return true; },
  matchMedia() { return { matches: false }; }
};
Object.defineProperty(globalThis, 'navigator', {
  configurable: true,
  value: {
    platform: 'Test',
    userAgentData: { platform: 'Test' },
    language: 'es-CO'
  }
});

const { semillaP2P } = await import('../src/js/p2p-client.js');
const broadcasts = [];
semillaP2P.started = true;
semillaP2P.manualClose = false;
semillaP2P.sessionGeneration = 7;
semillaP2P.user = { userId: 'usr_retry' };
semillaP2P.deviceId = 'dev_retry';
semillaP2P.realtimeLeader = false;
semillaP2P.tabCoordinator = {
  isLeader: () => false,
  broadcast(type, payload) {
    broadcasts.push({ type, payload: structuredClone(payload) });
    return true;
  }
};

function runOnlyTimer() {
  if (timers.size !== 1) throw new Error(`Se esperaba un único temporizador de recuperación y existen ${timers.size}.`);
  const [[id, callback]] = timers.entries();
  timers.delete(id);
  callback();
}

const requestId = semillaP2P.requestTabState('leader-announced', {
  expectedLeaderTabId: 'tab_old',
  expectedLeaderToken: 'term_old'
});
if (!requestId || broadcasts.length !== 1) {
  throw new Error('La solicitud inicial de estado no se emitió ni quedó correlacionada.');
}
if (broadcasts[0].payload.targetLeaderTabId !== 'tab_old'
  || broadcasts[0].payload.targetLeaderToken !== 'term_old'
  || broadcasts[0].payload.attempt !== 1) {
  throw new Error('La solicitud inicial perdió el destino cercado del líder anunciado.');
}
if (scheduledDelays[0] !== 1500) {
  throw new Error('La primera retransmisión local no usa la espera base esperada.');
}

runOnlyTimer();
runOnlyTimer();
if (broadcasts[1].payload.targetLeaderTabId !== 'tab_old'
  || broadcasts[2].payload.targetLeaderToken !== 'term_old') {
  throw new Error('La recuperación retiró el cerco del líder antes de superar el TTL normal del lease.');
}
if (scheduledDelays[1] !== 3000 || scheduledDelays[2] !== 6000) {
  throw new Error('La retransmisión local no aplica espera exponencial acotada.');
}

runOnlyTimer();
const discoveryRetry = broadcasts[3];
if (discoveryRetry.payload.targetLeaderTabId || discoveryRetry.payload.targetLeaderToken) {
  throw new Error('La recuperación no redescubrió al líder después de perder también su anuncio.');
}
if (discoveryRetry.payload.requestId !== requestId || discoveryRetry.payload.attempt !== 4) {
  throw new Error('La retransmisión de descubrimiento perdió la correlación idempotente de la solicitud.');
}

semillaP2P.handleTabMessage({
  type: 'state',
  senderTabId: 'tab_new',
  leaderToken: 'term_new',
  sentAt: Date.now(),
  payload: {
    state: { spaces: [{ spaceId: 'space_current' }], invitations: { received: [], sent: [] } },
    authoritative: true,
    responseToRequestId: requestId
  }
}, semillaP2P.captureSessionContext());

if (semillaP2P.pendingTabStateRequestId || semillaP2P.tabStateRequestTimer || timers.size) {
  throw new Error('La respuesta válida del líder nuevo no canceló todas las retransmisiones pendientes.');
}
if (semillaP2P.activeLeaderTabId !== 'tab_new' || semillaP2P.activeLeaderToken !== 'term_new') {
  throw new Error('La respuesta recuperada no estableció el término vigente como autoridad local.');
}

console.log('OK: las solicitudes de estado entre pestañas se retransmiten con backoff, conservan el cerco inicial, redescubren al líder tras el TTL y se cancelan al recibir respuesta.');
