import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const currentFile = fileURLToPath(import.meta.url);
const root = path.resolve(path.dirname(currentFile), '..');
const source = fs.readFileSync(path.join(root, 'src', 'js', 'p2p-client.js'), 'utf8');

const fenceStart = source.indexOf('  async fenceBootstrapResponses(sessionContext = this.captureSessionContext())');
const fetchStart = source.indexOf('  async fetchBootstrap(requestSnapshots = false)', fenceStart);
const methodEnd = source.indexOf('\n  async start(user = {})', fetchStart);
assert.ok(fenceStart >= 0 && fetchStart > fenceStart && methodEnd > fetchStart, 'No se encontraron las barreras de bootstrap para validar concurrencia.');
const methodsSource = source.slice(fenceStart, methodEnd);

const criticalFencePatterns = [
  /event\.eventType === 'p2p\.delivery\.gap'\) \{\s+await this\.fenceBootstrapResponses\(sessionContext\)/,
  /event\.eventType === 'p2p\.space\.deleted'\) \{\s+await this\.fenceBootstrapResponses\(sessionContext\)/,
  /event\.eventType === 'p2p\.membership\.revoked'\) \{\s+await this\.fenceBootstrapResponses\(sessionContext\)/,
  /event\.eventType === 'p2p\.membership\.changed'\) \{\s+await this\.fenceBootstrapResponses\(sessionContext\)/,
  /event\.eventType\?\.startsWith\('p2p\.invitation\.'\)\) \{\s+await this\.fenceBootstrapResponses\(sessionContext\)/,
  /apiPost\('\/api\/p2p\/spaces\/create'[\s\S]*?await this\.fenceBootstrapResponses\(sessionContext\)[\s\S]*?saveSpaces/,
  /apiPost\('\/api\/p2p\/invitations\/create'[\s\S]*?await this\.fenceBootstrapResponses\(sessionContext\)[\s\S]*?saveControlStateAtomically/,
  /apiPost\('\/api\/p2p\/invitations\/respond'[\s\S]*?await this\.fenceBootstrapResponses\(sessionContext\)[\s\S]*?saveControlStateAtomically/,
  /apiPost\('\/api\/p2p\/access\/leave'[\s\S]*?await this\.fenceBootstrapResponses\(sessionContext\)[\s\S]*?purgeLocalSpace/,
  /apiPost\('\/api\/p2p\/access\/delete'[\s\S]*?await this\.fenceBootstrapResponses\(sessionContext\)[\s\S]*?purgeLocalSpace/,
  /apiPost\('\/api\/p2p\/access\/revoke'[\s\S]*?await this\.fenceBootstrapResponses\(sessionContext\)[\s\S]*?refreshBootstrap/,
  /apiPost\('\/api\/p2p\/access\/permissions'[\s\S]*?await this\.fenceBootstrapResponses\(sessionContext\)[\s\S]*?refreshBootstrap/,
  /apiPost\('\/api\/p2p\/access\/transfer'[\s\S]*?await this\.fenceBootstrapResponses\(sessionContext\)[\s\S]*?refreshBootstrap/,
  /apiPost\('\/api\/p2p\/crypto\/key-activate'[\s\S]*?await this\.fenceBootstrapResponses\(sessionContext\)[\s\S]*?rememberAuthoritativeSpace/
];
for (const pattern of criticalFencePatterns) {
  assert.match(source, pattern, 'Una mutación crítica puede quedar expuesta a un bootstrap iniciado antes de su commit autoritativo.');
}

const harness = `
const requests = [];
async function listSpaces() { return []; }
async function listStateRevisions() { return {}; }
function apiPost(path, body) {
  return new Promise((resolve, reject) => requests.push({ path, body, resolve, reject }));
}
class TestClient {
  constructor() {
    this.bootstrapRequestSequence = 0;
    this.bootstrapAppliedSequence = 0;
    this.bootstrapMinimumApplicableSequence = 0;
    this.bootstrapApplyQueue = Promise.resolve();
    this.bootstrapState = { marker: 'initial' };
    this.applied = [];
    this.applyWaiter = null;
    this.onApplyStart = null;
  }
  get device() { return { deviceId: 'device_bootstrap_0001' }; }
  captureSessionContext() { return { deviceId: 'device_bootstrap_0001' }; }
  assertSessionContext() { return true; }
  async completedLifecycleReceipts() { return []; }
  async applyBootstrapData(data) {
    if (this.onApplyStart) this.onApplyStart();
    if (this.applyWaiter) await this.applyWaiter;
    this.applied.push(data.marker);
    this.bootstrapState = data;
    return data;
  }
${methodsSource}
}
export { TestClient, requests };
`;

async function flushMicrotasks() {
  await new Promise((resolve) => setImmediate(resolve));
}

async function loadHarness() {
  return import(`data:text/javascript;base64,${Buffer.from(harness).toString('base64')}#${Math.random()}`);
}

{
  const module = await loadHarness();
  const client = new module.TestClient();
  const first = client.fetchBootstrap(false);
  await flushMicrotasks();
  const second = client.fetchBootstrap(false);
  await flushMicrotasks();
  assert.equal(module.requests.length, 2, 'No se iniciaron las dos lecturas concurrentes esperadas.');

  module.requests[0].resolve({ marker: 'first-valid' });
  const firstState = await first;
  assert.equal(
    firstState.marker,
    'first-valid',
    'Una segunda solicitud apenas iniciada invalidó una respuesta anterior válida antes de saber si podía completarse.'
  );
  assert.deepEqual(client.applied, ['first-valid'], 'La primera respuesta válida no se aplicó al estado local.');

  module.requests[1].reject(new Error('segunda lectura fallida'));
  await assert.rejects(second, /segunda lectura fallida/);
  assert.equal(client.bootstrapState.marker, 'first-valid', 'La falla posterior restauró o dejó activo un bootstrap obsoleto.');
}

{
  const module = await loadHarness();
  const client = new module.TestClient();
  const first = client.fetchBootstrap(false);
  await flushMicrotasks();
  const second = client.fetchBootstrap(false);
  await flushMicrotasks();

  module.requests[1].resolve({ marker: 'newer-success' });
  const secondState = await second;
  assert.equal(secondState.marker, 'newer-success');

  module.requests[0].resolve({ marker: 'older-late' });
  const firstState = await first;
  assert.equal(
    firstState.marker,
    'newer-success',
    'Una respuesta anterior tardía reemplazó el bootstrap posterior ya aplicado.'
  );
  assert.deepEqual(client.applied, ['newer-success'], 'Se aplicó una respuesta obsoleta después del bootstrap más nuevo.');
  assert.equal(client.bootstrapAppliedSequence, 2, 'La secuencia aplicada no conserva la lectura autoritativa más reciente.');
}

{
  const module = await loadHarness();
  const client = new module.TestClient();
  const stale = client.fetchBootstrap(false);
  await flushMicrotasks();

  await client.fenceBootstrapResponses();
  client.bootstrapState = { marker: 'revoked-locally' };

  const authoritativeRefresh = client.fetchBootstrap(false);
  await flushMicrotasks();
  module.requests[1].reject(new Error('bootstrap posterior no disponible'));
  await assert.rejects(authoritativeRefresh, /bootstrap posterior no disponible/);

  module.requests[0].resolve({ marker: 'space-before-revocation' });
  const staleResult = await stale;
  assert.equal(staleResult.marker, 'revoked-locally', 'Una respuesta anterior al cerco resucitó el espacio revocado.');
  assert.equal(client.bootstrapState.marker, 'revoked-locally', 'El fallo de la lectura posterior permitió restaurar permisos obsoletos.');
  assert.deepEqual(client.applied, [], 'El bootstrap anterior al cambio autoritativo alcanzó el almacenamiento local.');
}

{
  const module = await loadHarness();
  const client = new module.TestClient();
  let releaseApply;
  let signalApplyStart;
  let fenceResolved = false;
  const applyStarted = new Promise((resolve) => { signalApplyStart = resolve; });
  client.applyWaiter = new Promise((resolve) => { releaseApply = resolve; });
  client.onApplyStart = signalApplyStart;

  const inFlight = client.fetchBootstrap(false);
  await flushMicrotasks();
  module.requests[0].resolve({ marker: 'already-applying' });
  await applyStarted;

  const fence = client.fenceBootstrapResponses().then(() => { fenceResolved = true; });
  await flushMicrotasks();
  assert.equal(fenceResolved, false, 'El cerco no esperó un bootstrap que ya había comenzado a modificar el estado.');

  releaseApply();
  await inFlight;
  await fence;
  client.bootstrapState = { marker: 'mutation-after-fence' };
  assert.equal(client.bootstrapState.marker, 'mutation-after-fence');
  assert.deepEqual(client.applied, ['already-applying'], 'La prueba no ejercitó la aplicación que ya había cruzado la barrera.');
}

console.log('OK: los bootstrap concurrentes conservan respuestas válidas, descartan estados anteriores a mutaciones autoritativas y esperan aplicaciones ya iniciadas antes de purgar o reemplazar datos locales.');
