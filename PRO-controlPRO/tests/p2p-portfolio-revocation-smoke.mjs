import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = fs.readFileSync(path.join(root, 'src/js/p2p-client.js'), 'utf8');
const methodMatch = source.match(/async revoke\(spaceId = '', userId = ''\) \{[\s\S]*?\n  \}\n\n  async updatePermissions/);
assert.ok(methodMatch, 'Debe existir el flujo cliente reutilizable de revocación.');
const method = methodMatch[0];

assert.match(method, /Array\.isArray\(data\.rotationSpaceIds\)/, 'La PWA debe consumir todos los espacios que el backend ordena rotar.');
assert.match(method, /new Set\(\[[\s\S]*?data\.rotationSpaceIds[\s\S]*?cleanSpaceId/, 'La rotación debe deduplicar la cascada e incluir el espacio solicitado.');
assert.match(method, /for \(const rotationSpaceId of rotationSpaceIds\)/, 'Cada proyecto revocado del panel debe procesar su propia rotación.');
assert.match(method, /ensureCurrentSpaceKey\(rotationSpaceId, \{ requireAuthority: true \}\)/, 'Cada rotación debe exigir autoridad vigente después de refrescar el bootstrap.');
assert.match(method, /dispatch\('p2p:key-rotation-pending', \{ spaceId: rotationSpaceId, error \}\)/, 'Un fallo de una rotación debe señalar exactamente el espacio pendiente.');
assert.match(method, /data\.keyRotations = rotations/, 'La respuesta debe conservar el estado individual de todas las rotaciones.');
assert.match(method, /const primaryRotation = rotations\.find/, 'El resultado principal debe copiarse sin alterar el estado individual de la cascada.');
assert.match(method, /completed: rotations\.every\(\(rotation\) => rotation\.completed !== false\)/, 'El estado agregado solo puede completarse cuando todas las rotaciones terminan.');
assert.doesNotMatch(method, /data\.keyRotation = rotations\.find[\s\S]*?data\.keyRotation\.completed =/, 'El agregado no debe mutar por referencia el resultado individual del proyecto principal.');


const leaveMethodMatch = source.match(/async leave\(spaceId = ''\) \{[\s\S]*?\n  \}\n\n  async startProjectLifecycle/);
assert.ok(leaveMethodMatch, 'Debe existir el flujo cliente reutilizable para abandonar espacios.');
const leaveMethod = leaveMethodMatch[0];

assert.match(leaveMethod, /Array\.isArray\(data\.revokedSpaceIds\)/, 'El abandono de un panel debe consumir toda la cascada revocada por el backend.');
assert.match(leaveMethod, /new Set\(\[[\s\S]*?data\.revokedSpaceIds[\s\S]*?cleanSpaceId/, 'La purga local debe deduplicar la cascada e incluir siempre el panel solicitado.');
assert.match(leaveMethod, /for \(const revokedSpaceId of revokedSpaceIds\)/, 'Cada proyecto retirado del panel debe purgarse localmente en el dispositivo que abandona.');
assert.match(leaveMethod, /purgeLocalSpace\(revokedSpaceId\)[\s\S]*?purgeSpaceCrypto\(revokedSpaceId\)/, 'La purga debe retirar tanto los datos administrativos como las claves locales de cada espacio revocado.');
assert.match(leaveMethod, /removeSpaceFromBootstrapState\(revokedSpaceId\)/, 'Todos los espacios revocados deben salir inmediatamente del estado visible aun si el refresco de red falla.');
assert.match(leaveMethod, /updateRecoveryRequirements\(\{[\s\S]*?retainSpaceIds: this\.readableSpaceIds\(\)/, 'Los requisitos de recuperación deben descartar espacios que dejaron de ser legibles.');
assert.match(leaveMethod, /dispatch\('p2p:access-revoked', \{[\s\S]*?spaceIds: revokedSpaceIds/, 'Las demás pestañas y la interfaz deben recibir la lista completa de espacios retirados.');

console.log('OK: la revocación de panel rota de forma independiente todas las claves afectadas y conserva un resultado agregado fiable.');
