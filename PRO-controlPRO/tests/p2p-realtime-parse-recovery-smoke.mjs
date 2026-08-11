import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const currentFile = fileURLToPath(import.meta.url);
const root = path.resolve(path.dirname(currentFile), '..');
const source = fs.readFileSync(path.join(root, 'src', 'js', 'p2p-client.js'), 'utf8');

const methodStart = source.indexOf('  abortRealtimeForReplay(');
const methodEnd = source.indexOf('\n  async openRealtime()', methodStart);
assert.ok(methodStart >= 0 && methodEnd > methodStart, 'No se encontró la recuperación tipada ante payload SSE inválido.');
const methodSource = source.slice(methodStart, methodEnd);

const harness = `
const dispatched = [];
function dispatch(name, detail = {}) { dispatched.push({ name, detail }); }
class TestClient {
  constructor() {
    this.atomicBatchAssemblyTimer = 77;
    this.pendingAtomicEventBatches = new Map([['space_1|batch_1', { events: [{}] }]]);
    this.eventPipelineBlocked = false;
    this.timerClears = 0;
    this.reconnects = 0;
  }
  clearAtomicTransportBatchTimer() {
    this.atomicBatchAssemblyTimer = 0;
    this.timerClears += 1;
  }
  scheduleReconnect() { this.reconnects += 1; }
${methodSource}
}
export { TestClient, dispatched };
`;
const module = await import(`data:text/javascript;base64,${Buffer.from(harness).toString('base64')}`);
const client = new module.TestClient();
const error = new Error('payload inválido');
error.code = 'P2P_REALTIME_EVENT_INVALID_JSON';
client.abortRealtimeForReplay(error, 'event-parse');

assert.equal(client.eventPipelineBlocked, true, 'El stream inválido no bloqueó el avance del cursor.');
assert.equal(client.pendingAtomicEventBatches.size, 0, 'La recuperación conservó un lote parcial incompatible con el replay.');
assert.equal(client.atomicBatchAssemblyTimer, 0, 'La recuperación dejó activo el vencimiento del lote anterior.');
assert.equal(client.timerClears, 1, 'La recuperación no limpió exactamente una vez el temporizador pendiente.');
assert.equal(client.reconnects, 1, 'La recuperación no cerró y reabrió el stream desde el cursor durable.');
assert.equal(module.dispatched.length, 1, 'La falla de protocolo no produjo una única señal observable.');
assert.equal(module.dispatched[0].detail.stage, 'event-parse');
assert.equal(module.dispatched[0].detail.error.code, 'P2P_REALTIME_EVENT_INVALID_JSON');

const eventListenerStart = source.indexOf("source.addEventListener('p2p_event'");
const eventListenerEnd = source.indexOf('      source.onerror', eventListenerStart);
assert.ok(eventListenerStart >= 0 && eventListenerEnd > eventListenerStart, 'No se encontró el listener de eventos SSE.');
const eventListener = source.slice(eventListenerStart, eventListenerEnd);
assert.match(eventListener, /P2P_REALTIME_EVENT_INVALID_JSON/);
assert.match(eventListener, /this\.abortRealtimeForReplay\(/);
assert.match(eventListener, /'event-parse'/);
assert.match(eventListener, /'event-envelope'/);
assert.doesNotMatch(
  eventListener,
  /dispatch\('p2p:error', \{ error, stage: 'event-parse' \}\)/,
  'El JSON inválido volvió a quedar reducido a logging sin bloquear la tubería.'
);

const gapListenerStart = source.indexOf("source.addEventListener('p2p_gap'");
const gapListenerEnd = source.indexOf("source.addEventListener('p2p_event'", gapListenerStart);
assert.ok(gapListenerStart >= 0 && gapListenerEnd > gapListenerStart, 'No se encontró el listener de brechas SSE.');
const gapListener = source.slice(gapListenerStart, gapListenerEnd);
assert.match(gapListener, /P2P_REALTIME_GAP_INVALID_JSON/);
assert.match(gapListener, /this\.abortRealtimeForReplay\(/);
assert.match(gapListener, /'delivery-gap-parse'/);
assert.match(gapListener, /'delivery-gap-envelope'/);

console.log('OK: un payload SSE inválido bloquea la tubería, limpia lotes parciales y fuerza replay desde el último cursor durable sin confirmar el evento omitido.');
