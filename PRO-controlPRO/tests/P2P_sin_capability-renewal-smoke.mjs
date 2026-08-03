import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../src/js/p2p-client.js', import.meta.url), 'utf8');
const start = source.indexOf('const LOCAL_CAPABILITY_REFRESH_MIN_LEAD_MS');
const end = source.indexOf('\nfunction createId', start);
assert.ok(start >= 0 && end > start, 'No se encontró el planificador de renovación de capacidades locales.');
const helperSource = source.slice(start, end)
  .replace('export function retryAfterMilliseconds', 'function retryAfterMilliseconds')
  .replace('export function planLocalCapabilityRefresh', 'function planLocalCapabilityRefresh');
const moduleUrl = `data:text/javascript;base64,${Buffer.from(`${helperSource}\nexport { planLocalCapabilityRefresh };`).toString('base64')}`;
const { planLocalCapabilityRefresh } = await import(moduleUrl);

const hour = 60 * 60 * 1000;
const day = 24 * hour;
const issuedAtMs = Date.parse('2026-08-01T00:00:00.000Z');
const longCapability = {
  payload: {
    issuedAt: new Date(issuedAtMs).toISOString(),
    expiresAt: new Date(issuedAtMs + 7 * day).toISOString()
  }
};
const longPlan = planLocalCapabilityRefresh(longCapability, { nowMs: issuedAtMs });
assert.equal(longPlan.valid, true);
assert.equal(longPlan.refreshAtMs, issuedAtMs + 7 * day - 6 * hour, 'Una capacidad semanal debe renovarse seis horas antes de vencer.');

const shortCapability = {
  payload: {
    issuedAt: new Date(issuedAtMs).toISOString(),
    expiresAt: new Date(issuedAtMs + hour).toISOString()
  }
};
const shortPlan = planLocalCapabilityRefresh(shortCapability, { nowMs: issuedAtMs });
assert.equal(shortPlan.refreshAtMs, issuedAtMs + 48 * 60 * 1000, 'Una capacidad de una hora debe renovarse al 80% de su vida útil.');

const overduePlan = planLocalCapabilityRefresh(shortCapability, { nowMs: issuedAtMs + 55 * 60 * 1000 });
assert.equal(overduePlan.valid, true);
assert.equal(overduePlan.delayMs, 1000, 'Una renovación atrasada pero todavía vigente debe ejecutarse de inmediato.');

const expiredPlan = planLocalCapabilityRefresh(shortCapability, { nowMs: issuedAtMs + hour });
assert.equal(expiredPlan.valid, false, 'Una capacidad ya vencida no debe programar llamadas inútiles.');

for (const expected of [
  'scheduleLocalCapabilityRefresh(options = {}, sessionContext = this.captureSessionContext())',
  'refreshLocalCapability(sessionContext = this.captureSessionContext())',
  "await this.refreshBootstrap({ requestSnapshots: false })",
  "this.scheduleServerRecovery(error, 'local-capability-refresh')",
  "state: 'waiting-for-network'",
  "state: 'renewed'",
  "state: 'retry-scheduled'",
  'this.clearLocalCapabilityRefreshTimer();',
  "if (this.realtimeLeader) this.scheduleLocalCapabilityRefresh({ reason: 'startup' }, sessionContext)"
]) {
  assert.ok(source.includes(expected), `Falta la protección de renovación local: ${expected}`);
}
assert.ok(
  /!this\.tabCoordinationReady[\s\S]*?!this\.realtimeLeader[\s\S]*?!getSessionToken\(\)/.test(source),
  'La renovación debe quedar limitada a la pestaña líder autenticada.'
);
assert.ok(!source.includes('setInterval('), 'La renovación de capacidades no debe introducir polling periódico.');

console.log('OK: la capacidad P2P_sin_ se renueva antes de vencer mediante un temporizador único, con liderazgo, backoff y recuperación por evento online.');
