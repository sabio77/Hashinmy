import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const clientSource = fs.readFileSync(path.join(root, 'src/js/p2p-client.js'), 'utf8');
const appSource = fs.readFileSync(path.join(root, 'src/js/app.js'), 'utf8');

const authorizationIndex = clientSource.indexOf(
  'const authorizationPromoted = await this.confirmRecoveredReplicaAuthorization(event.spaceId, sessionContext);'
);
const snapshotCompleteIndex = clientSource.lastIndexOf("dispatch('p2p:snapshot-complete'", authorizationIndex);
const refreshIndex = clientSource.indexOf("source: 'snapshot-complete'", authorizationIndex);
const nextOperationIndex = clientSource.indexOf("dispatch('p2p:operation'", authorizationIndex);

assert.ok(snapshotCompleteIndex >= 0, 'Debe existir el evento que confirma la finalización del snapshot.');
assert.ok(
  authorizationIndex > snapshotCompleteIndex,
  'La finalización del snapshot debe comprobar primero si promovió una autorización pendiente.'
);
assert.ok(
  refreshIndex > authorizationIndex,
  'Cuando el espacio ya estaba autorizado, el snapshot debe emitir p2p:state para que la interfaz reconstruya sus cards.'
);
assert.ok(
  nextOperationIndex < 0 || refreshIndex < nextOperationIndex,
  'El refresco del snapshot debe ejecutarse dentro de la rama snapshot.complete, antes del despacho ordinario de operaciones.'
);
assert.match(
  clientSource.slice(authorizationIndex, refreshIndex + 120),
  /if \(!authorizationPromoted\) \{[\s\S]*?dispatch\('p2p:state', \{[\s\S]*?source: 'snapshot-complete'/,
  'No debe emitirse un segundo estado cuando la promoción de autorización ya notificó a la interfaz.'
);
assert.match(
  appSource,
  /window\.addEventListener\('p2p:state',[\s\S]*?applyP2PState\(nextState\)/,
  'La interfaz debe reaccionar al estado emitido y volver a cargar los proyectos desde IndexedDB.'
);
assert.match(
  appSource,
  /async function refreshProjects\(\)[\s\S]*?semillaP2P\.listEntities\(space\.spaceId\)[\s\S]*?state\.projects = new Map/,
  'La actualización de estado debe reconstruir el mapa visible con las raíces de proyecto recién recuperadas.'
);

console.log('OK: un snapshot completo por backend vuelve a renderizar inmediatamente las cards del panel invitado sin requerir recarga ni otro evento.');
