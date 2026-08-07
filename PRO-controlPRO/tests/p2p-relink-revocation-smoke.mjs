
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = fs.readFileSync(path.join(root, 'src/js/p2p-client.js'), 'utf8');

assert.match(source, /hasSuperseded[\s\S]*?typeof data\.superseded !== 'boolean'/, 'El cliente debe rechazar sobres de revocación con superseded mal tipado.');

const start = source.indexOf("    } else if (event.eventType === 'p2p.membership.revoked') {");
const end = source.indexOf("    } else if (event.eventType === 'p2p.membership.changed') {", start);
assert.ok(start >= 0 && end > start, 'Debe existir el manejador realtime de revocación.');
const branch = source.slice(start, end);
const supersededIndex = branch.indexOf('event.data?.superseded === true');
const supersededDispatchIndex = branch.indexOf("dispatch('p2p:access-revocation-superseded'");
const purgeBranchIndex = branch.indexOf('} else if (revokedUserId && revokedUserId === currentUserId && event.spaceId)');
const purgeIndex = branch.indexOf('purgeLocalSpace(spaceId)');
const refreshIndex = branch.lastIndexOf('await this.refreshBootstrap({ requestSnapshots: false })');

assert.ok(supersededIndex >= 0, 'El cliente debe reconocer una revocación que el backend marcó como superada.');
assert.ok(supersededDispatchIndex > supersededIndex, 'La interfaz debe recibir una señal observable de revinculación reconciliada.');
assert.ok(purgeBranchIndex > supersededDispatchIndex, 'La rama superada debe resolverse antes de entrar a la purga real.');
assert.ok(purgeIndex > purgeBranchIndex, 'Solo una revocación vigente puede purgar la réplica y sus claves.');
assert.ok(refreshIndex > purgeIndex, 'Después de cualquiera de las dos rutas debe refrescarse el bootstrap autoritativo una sola vez.');
assert.equal((branch.match(/await this\.refreshBootstrap\(\{ requestSnapshots: false \}\)/g) || []).length, 1, 'La revinculación no debe duplicar llamadas de bootstrap.');

console.log('OK: el cliente ignora purgas causadas por revocaciones superadas y converge con un único bootstrap autoritativo.');
