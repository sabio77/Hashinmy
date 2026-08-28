import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const clientPath = path.resolve(here, '../src/js/p2p-client.js');
const source = fs.readFileSync(clientPath, 'utf8');

const constantsStart = source.indexOf('const RETRY_BASE_MS = 1200;');
const constantsEnd = source.indexOf('const SERVER_RETRY_FALLBACK_MS = 5000;');
const helpersStart = source.indexOf('export function realtimeStableConnectionMs');
const helpersEnd = source.indexOf('const INVITATION_SOURCE_CREATE_MAX_ATTEMPTS = 3;');
assert.ok(constantsStart >= 0 && constantsEnd > constantsStart, 'No se encontró la política de tiempos SSE.');
assert.ok(helpersStart >= 0 && helpersEnd > helpersStart, 'No se encontraron los helpers de backoff SSE.');

const constantsSource = source.slice(constantsStart, constantsEnd);
const helpersSource = source.slice(helpersStart, helpersEnd)
  .replace('export function realtimeStableConnectionMs', 'function realtimeStableConnectionMs')
  .replace('export function realtimeReconnectRetryCount', 'function realtimeReconnectRetryCount')
  .replace('export function realtimeReconnectDelay', 'function realtimeReconnectDelay')
  .replace('export function realtimeReconnectAllowed', 'function realtimeReconnectAllowed');
const moduleSource = `${constantsSource}\n${helpersSource}\nexport { realtimeStableConnectionMs, realtimeReconnectRetryCount, realtimeReconnectDelay, realtimeReconnectAllowed };`;
const moduleUrl = `data:text/javascript;base64,${Buffer.from(moduleSource).toString('base64')}`;
const { realtimeStableConnectionMs, realtimeReconnectRetryCount, realtimeReconnectDelay, realtimeReconnectAllowed } = await import(moduleUrl);

assert.equal(realtimeStableConnectionMs(25_000), 75_000, 'El heartbeat por defecto dejó de requerir tres ciclos para estabilizar SSE.');
assert.equal(realtimeStableConnectionMs(15_000), 45_000, 'El heartbeat mínimo no ajusta la ventana estable de SSE.');
assert.equal(realtimeStableConnectionMs(120_000), 360_000, 'El heartbeat máximo no ajusta la ventana estable de SSE.');
assert.equal(realtimeStableConnectionMs(5_000), 45_000, 'Un heartbeat inválidamente bajo puede reducir demasiado la penalización.');
assert.equal(realtimeStableConnectionMs(300_000), 360_000, 'Un heartbeat inválidamente alto puede alargar sin límite la estabilización.');
assert.equal(realtimeReconnectRetryCount(4, 10_000), 4, 'Una conexión corta perdió la penalización acumulada.');
assert.equal(realtimeReconnectRetryCount(4, 74_999), 4, 'La penalización se reinició antes de tres heartbeats completos.');
assert.equal(realtimeReconnectRetryCount(4, 75_000), 0, 'Una conexión estable no reinició el backoff.');
const slowHeartbeatStableMs = realtimeStableConnectionMs(120_000);
assert.equal(realtimeReconnectRetryCount(4, 75_000, slowHeartbeatStableMs), 4, 'Un heartbeat lento borra la penalización antes de completar tres ciclos del servidor.');
assert.equal(realtimeReconnectRetryCount(4, 359_999, slowHeartbeatStableMs), 4, 'La penalización se reinició antes de tres heartbeats configurados por el backend.');
assert.equal(realtimeReconnectRetryCount(4, 360_000, slowHeartbeatStableMs), 0, 'Tres heartbeats configurados por el backend no estabilizan la reconexión.');

const firstLow = realtimeReconnectDelay(0, 0);
const firstHigh = realtimeReconnectDelay(0, 1);
assert.ok(firstLow >= 900 && firstLow < 1200, 'El jitter inferior del primer reintento quedó fuera de una ventana segura.');
assert.ok(firstHigh > 1200 && firstHigh <= 1500, 'El jitter superior del primer reintento quedó fuera de una ventana segura.');
assert.notEqual(firstLow, firstHigh, 'La reconexión SSE continúa sin jitter efectivo.');

const secondLow = realtimeReconnectDelay(1, 0);
const thirdLow = realtimeReconnectDelay(2, 0);
assert.ok(secondLow > firstLow, 'El segundo fallo ya no aumenta el backoff.');
assert.ok(thirdLow > secondLow, 'El tercer fallo ya no aumenta el backoff exponencial.');
assert.ok(realtimeReconnectDelay(100, 1) <= 30_000, 'El backoff puede superar el máximo de 30 segundos.');
assert.equal(realtimeReconnectAllowed(9), true, 'El presupuesto SSE se agotó antes del décimo intento permitido.');
assert.equal(realtimeReconnectAllowed(10), false, 'El SSE puede seguir reconectando indefinidamente después de agotar su presupuesto.');
assert.ok(source.includes("reconnect=${this.retryCount > 0 ? '1' : '0'}"), 'La apertura SSE no informa si corresponde a una reconexión para telemetría de consumo.');

const readyStart = source.indexOf("source.addEventListener('p2p_ready'");
const readyEnd = source.indexOf("source.addEventListener('p2p_gap'", readyStart);
const readyBlock = source.slice(readyStart, readyEnd);
assert.ok(readyBlock.includes('this.realtimeReadyAt = Date.now()'), 'p2p_ready no registra la duración real de la conexión.');
assert.ok(!readyBlock.includes('this.retryCount = 0'), 'p2p_ready todavía borra la penalización de una conexión corta.');

const reconnectStart = source.indexOf('\n  scheduleReconnect() {');
const reconnectEnd = source.indexOf('\n  clearAtomicTransportBatchTimer()', reconnectStart);
const reconnectBlock = source.slice(reconnectStart, reconnectEnd);
assert.ok(reconnectBlock.includes('this.realtimeStableConnectionMs'), 'scheduleReconnect no usa la ventana estable derivada del heartbeat real del backend.');
assert.ok(reconnectBlock.includes('realtimeReconnectRetryCount('), 'scheduleReconnect no distingue conexión corta de conexión estable.');
assert.ok(reconnectBlock.includes('realtimeReconnectDelay(this.retryCount)'), 'scheduleReconnect no usa el jitter centralizado.');
assert.ok(reconnectBlock.includes('!realtimeReconnectAllowed(this.retryCount)'), 'scheduleReconnect no corta el ciclo automático al agotar el presupuesto.');
assert.ok(reconnectBlock.includes("reason: 'retry-budget-exhausted'"), 'El agotamiento del presupuesto SSE no queda observable para la interfaz/telemetría.');
assert.ok(
  reconnectBlock.includes('if (this.isRetryableTransportError(error)) this.scheduleReconnect();'),
  'El temporizador SSE vuelve a reconectar incluso después de un error HTTP definitivo de apertura.'
);

console.log('p2p-realtime-backoff-smoke: ok');
