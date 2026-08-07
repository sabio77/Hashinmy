import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = fs.readFileSync(path.join(root, 'src/js/p2p-client.js'), 'utf8');
const methodMatch = source.match(/async revoke\(spaceId = '', userId = '', options = \{\}\) \{[\s\S]*?\n  \}\n\n  async updatePermissions/);
assert.match(source, /invalidRetainedSpaceIds/, 'El contrato realtime debe validar la lista de accesos directos retenidos antes de usarla para impedir purgas.');
assert.ok(methodMatch, 'Debe existir el flujo cliente reutilizable de revocación.');
const method = methodMatch[0];

assert.match(method, /Array\.isArray\(data\.rotationSpaceIds\)/, 'La PWA debe consumir todos los espacios que el backend ordena rotar.');
assert.match(method, /const directGrantOnly = options\.directGrantOnly === true/, 'El flujo debe distinguir una revocación efectiva de una limpieza de grant directo.');
assert.match(method, /const rotationCandidates = \[[\s\S]*?data\.rotationSpaceIds[\s\S]*?\.\.\.\(!directGrantOnly \? \[cleanSpaceId\] : \[\]\)/, 'La revocación efectiva debe incluir el espacio solicitado, mientras una limpieza de grant directo no debe forzar rotación.');
assert.match(method, /new Set\(rotationCandidates/, 'La rotación debe deduplicar la cascada antes de procesarla.');
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

const realtimeStart = source.indexOf("    } else if (event.eventType === 'p2p.membership.revoked') {");
const realtimeEnd = source.indexOf("    } else if (event.eventType === 'p2p.membership.changed') {", realtimeStart);
assert.ok(realtimeStart >= 0 && realtimeEnd > realtimeStart, 'Debe existir la revocación realtime reutilizable.');
const realtimeRevocation = source.slice(realtimeStart, realtimeEnd);
assert.match(realtimeRevocation, /resourceType[^\n]*admin\.portfolio/, 'La revocación realtime debe reconocer cuando la raíz retirada es un panel.');
assert.match(realtimeRevocation, /governanceSpaceId[^\n]*revokedSpaceId/, 'La revocación del panel debe identificar proyectos hijos ya conocidos localmente.');
assert.match(realtimeRevocation, /currentMember\?\.accessScope[^\n]*portfolio/, 'La cascada local solo debe purgar membresías heredadas y conservar accesos directos vigentes al mismo proyecto.');
assert.match(realtimeRevocation, /retainedSpaceIds/, 'La revocación realtime debe respetar la lista autoritativa de proyectos cuyo acceso directo sigue vigente.');
assert.match(realtimeRevocation, /!retainedSpaceIds\.has\(childSpaceId\)/, 'Un proyecto restaurado a grant directo no debe purgarse por una vista local obsoleta que todavía lo marque como heredado.');
assert.match(realtimeRevocation, /for \(const spaceId of revokedSpaceIds\)/, 'La purga realtime debe abarcar la raíz y todos sus proyectos hijos heredados conocidos.');
assert.match(realtimeRevocation, /purgeLocalSpace\(spaceId\)[\s\S]*?purgeSpaceCrypto\(spaceId\)/, 'La cascada realtime debe retirar datos y claves antes de refrescar el bootstrap.');
assert.match(realtimeRevocation, /spaceIds: \[\.\.\.revokedSpaceIds\]/, 'La interfaz debe recibir inmediatamente la cascada completa que pudo inferirse localmente.');

console.log('OK: la revocación de panel rota claves, cerca reaceptaciones concurrentes y purga en tiempo real la cascada conocida.');
