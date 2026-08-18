import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const currentFile = fileURLToPath(import.meta.url);
const root = path.resolve(path.dirname(currentFile), '..');
const clientSource = fs.readFileSync(path.join(root, 'src', 'js', 'p2p-client.js'), 'utf8');
const appSource = fs.readFileSync(path.join(root, 'src', 'js', 'app.js'), 'utf8');
const auditSource = fs.readFileSync(path.join(root, 'src', 'js', 'p2p-invitation-audit.js'), 'utf8');

assert.match(clientSource, /INCOMPLETE_INVITATION_RECOVERY_MAX_ATTEMPTS\s*=\s*3/,
  'El watchdog no fija exactamente 3 intentos.');
assert.match(clientSource, /for \(let attempt = 1; attempt <= INCOMPLETE_INVITATION_RECOVERY_MAX_ATTEMPTS/,
  'El flujo no ejecuta los 3 intentos de forma automática.');
assert.match(clientSource, /requestMaxAttempts:\s*1/,
  'Cada ciclo del watchdog vuelve a ejecutar los 3 reintentos HTTP internos y amplifica un 5xx persistente.');
assert.match(clientSource, /apiPost\('\/api\/p2p\/bootstrap', bootstrapRequest, \{ maxAttempts: requestMaxAttempts \}\)/,
  'El bootstrap no propaga el límite de intentos al cliente HTTP.');
assert.match(clientSource, /fetchBootstrap\(snapshotMode, \{ auditTraceId, auditSource, requestMaxAttempts \}\)/,
  'refreshBootstrap pierde el límite de intentos solicitado por el watchdog.');
assert.match(clientSource, /ignoreCooldown:\s*true/,
  'Los reintentos terminales siguen bloqueados por el cooldown ordinario y no serían intentos reales.');
assert.match(clientSource, /projectRootLoaded/,
  'No se verifica la raíz admin.project\/project después de cada intento.');
assert.match(clientSource, /\/api\/p2p\/invitations\/recovery-cleanup/,
  'El frontend no solicita la limpieza terminal al backend.');
assert.match(clientSource, /const cleanupSpaceIds = unresolvedSpaceIds\.filter/,
  'La limpieza no separa los espacios recuperables de los espacios propios protegidos.');
assert.match(clientSource, /protectedOwnedSpaceIds/,
  'El watchdog no protege explícitamente paneles o proyectos cuyo propietario es la cuenta actual.');
assert.match(clientSource, /spaceIds:\s*cleanupSpaceIds/,
  'La limpieza no puede retirar una membresía huérfana segura cuando el documento de invitación ya desapareció.');
assert.match(clientSource, /cleanup-skipped-owner/,
  'El frontend no corta la limpieza destructiva cuando todos los espacios sin raíz pertenecen al propietario.');
assert.match(clientSource, /frontend\.incomplete-recovery\.exhausted/,
  'Falta la auditoría terminal con el diagnóstico del fallo.');
assert.match(clientSource, /p2p:invitation-recovery-discarded/,
  'La UI no recibe una señal explícita cuando se descarta la autorización incompleta.');
assert.match(appSource, /invitationRecovery\?\.discarded === true/,
  'La interfaz no diferencia una recuperación exitosa de una limpieza terminal.');
assert.match(appSource, /después de 3 intentos/,
  'La interfaz de producción no comunica el resultado terminal de forma clara.');
assert.match(auditSource, /\[XXXinvXXX\]\[P2P_INVITATION_AUDIT\]/,
  'Los logs frontend no contienen XXXinvXXX.');

console.log('OK: watchdog frontend realiza 3 intentos reales, audita, limpia y comunica el descarte sin dejar el panel indefinidamente en sincronización.');
