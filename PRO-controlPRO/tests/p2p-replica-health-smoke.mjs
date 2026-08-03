import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const clientSource = fs.readFileSync(path.join(root, 'src/js/p2p-client.js'), 'utf8');
const appSource = fs.readFileSync(path.join(root, 'src/js/app.js'), 'utf8');
const htmlSource = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

const start = clientSource.indexOf('function normalizeReplicaHealthMap');
const end = clientSource.indexOf('function jsonByteLength', start);
assert.ok(start >= 0 && end > start, 'No se encontró el normalizador de cobertura P2P.');
const moduleUrl = `data:text/javascript;base64,${Buffer.from(`${clientSource.slice(start, end)}\nexport { normalizeReplicaHealthMap };`).toString('base64')}`;
const { normalizeReplicaHealthMap } = await import(moduleUrl);

assert.deepEqual(normalizeReplicaHealthMap({
  space_1: {
    state: 'healthy',
    currentStateRevision: '12',
    registeredReplicas: 2.9,
    confirmedReplicas: '2',
    pendingReplicas: -4,
    onlineReplicas: 'invalid'
  },
  invalid: null
}), {
  space_1: {
    spaceId: 'space_1',
    state: 'healthy',
    currentStateRevision: 12,
    memberAccounts: 0,
    registeredAccounts: 0,
    accountsWithoutDevice: 0,
    registeredReplicas: 2,
    confirmedReplicas: 2,
    pendingReplicas: 0,
    confirmedAccounts: 0,
    onlineReplicas: 0,
    lastConfirmedAt: '',
    truncated: false
  }
});

assert.match(clientSource, /listStateRevisions\(targetSpaceIds\)/, 'La consulta de salud no confirma la revisión local persistida.');
assert.match(clientSource, /deviceId: sessionContext\.deviceId[\s\S]*stateRevisions: localStateRevisions/, 'La cobertura no queda ligada al dispositivo autenticado.');
assert.match(clientSource, /replicaHealthOnly: true/, 'La actualización de cobertura vuelve a recargar todas las entidades.');

assert.match(clientSource, /pendingAckReplicaSpaceIds/, 'El ACK no conserva los espacios cuyo estado local debe confirmarse.');
assert.match(clientSource, /appliedStateRevisions\s*=\s*await listStateRevisions\(replicaSpaceIds\)/, 'El ACK no lee las revisiones realmente persistidas antes de declarar cobertura.');
assert.match(clientSource, /appliedStateRevisions[\s\S]*apiPost\('\/api\/p2p\/events\/ack'/, 'El ACK no envía la declaración de estado aplicado al backend.');
assert.match(clientSource, /replicaRevisionHints \|\| ackResult\.replicaRevisions/, 'El cliente no trata las revisiones del relay como hints compatibles.');
assert.match(clientSource, /replayed > 0\) this\.scheduleReplicaHealthRefresh\(\[event\.spaceId\]\)/, 'La reproducción de eventos cifrados diferidos no renueva la cobertura después de aplicarlos.');
assert.match(appSource, /replica-health-badge/, 'La interfaz no muestra el estado de las réplicas.');
assert.match(appSource, /event\.detail\?\.replicaHealthOnly === true/, 'La interfaz no separa cobertura de la carga funcional.');
assert.match(htmlSource, /id="project-replica-health"/, 'Falta el indicador de cobertura dentro del proyecto.');

for (const language of ['es', 'en', 'ar']) {
  const payload = JSON.parse(fs.readFileSync(path.join(root, `textX/app/${language}.json`), 'utf8'));
  for (const key of ['healthy', 'degraded', 'single', 'unavailable', 'unknown', 'summary', 'detail']) {
    assert.equal(typeof payload.replicas?.[key], 'string', `Falta replicas.${key} en ${language}.`);
  }
}

console.log('OK: normalización, ACK basado en estado aplicado, actualización liviana e indicadores ES/EN/AR validados.');
