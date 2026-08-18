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
assert.match(clientSource, /ignoreCooldown:\s*true,[\s\S]*requestMaxAttempts:\s*1/,
  'La recuperación directa dentro del watchdog conserva sus 3 reintentos HTTP internos y puede amplificar 3 ciclos hasta 9 solicitudes.');
assert.match(clientSource, /apiPost\('\/api\/p2p\/invitations\/respond',[\s\S]*\{ maxAttempts: requestMaxAttempts \}\)/,
  'recoverAcceptedInvitationBootstrap no permite acotar sus reintentos HTTP cuando lo ejecuta un watchdog externo.');
assert.match(clientSource, /frontend\.incomplete-recovery\.retry-scheduled/,
  'El watchdog no audita la espera entre intentos.');
assert.match(clientSource, /retryAfterSeconds[\s\S]*serverRecoveryDelayMilliseconds/,
  'El watchdog ignora Retry-After/rate-limit y puede consumir los 3 intentos antes de que el backend permita reintentar.');
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
assert.match(clientSource, /loaded && this\.isSpaceReplicaRecoveryPending\(spaceId\)/,
  'El watchdog ignora una card naranja cuya raíz ya está cargada pero la réplica sigue pendiente.');
assert.match(clientSource, /await this\.reconcileSnapshotRecovery\(sessionContext\)/,
  'La recuperación de una card naranja no reconcilia el watermark antes de intentar confirmarla.');
assert.match(clientSource, /await this\.confirmRecoveredReplicaAuthorization\(spaceId, sessionContext\)/,
  'Una réplica completa no se promociona dentro del watchdog y puede seguir en Sincronizando.');
assert.match(clientSource, /const converged = loaded && !replicaRecoveryPending/,
  'El watchdog considera éxito solo por tener la raíz y no exige terminar replica_recovery.');
assert.match(appSource, /invitationRecovery\?\.discarded === true/,
  'La interfaz no diferencia una recuperación exitosa de una limpieza terminal.');
assert.match(appSource, /pendingReplicaProjectSpaceIds/,
  'Las cards ya hidratadas que siguen en replica_recovery no entran al watchdog visual.');
assert.match(appSource, /data\.project\.loaded && isReplicaRecoveryPending\(data\.space\)/,
  'La detección de Sincronizando no distingue explícitamente una réplica pendiente con datos cargados.');
assert.match(appSource, /recoveryProjectSpaceIds/,
  'La interfaz no unifica raíces faltantes y cards naranjas en el mismo flujo acotado de recuperación.');
assert.match(appSource, /terminalInvitationRecoverySpaceIds:\s*new Set\(\)/,
  'La interfaz no conserva una cuarentena terminal para impedir que una card agotada siga visible en Sincronizando.');
assert.match(appSource, /terminalizeUnresolved[\s\S]*attemptsUsed[\s\S]*>= 3[\s\S]*terminalInvitationRecoverySpaceIds\.add\(spaceId\)/,
  'Después de 3 intentos fallidos una réplica invitada no sale del estado visual Sincronizando mientras se completa la limpieza.');
assert.match(appSource, /data\.project\.loaded && !state\.terminalInvitationRecoverySpaceIds\.has\(spaceId\)/,
  'refreshProjects vuelve a renderizar una card terminal en naranja después de un evento P2P.');
assert.match(appSource, /selectedProjectTerminalized[\s\S]*showDashboard\(\{ historyMode: 'replace' \}\)/,
  'Una card que agota la recuperación mientras está abierta deja la vista del proyecto activa sin un espacio seleccionable.');
assert.match(appSource, /panelHasTerminalInvitationRecovery[\s\S]*!panelHasTerminalInvitationRecovery\(ownerUserId\)[\s\S]*hiddenPanels \+= 1/,
  'El directorio sigue mostrando “Sincronizando paneles” indefinidamente para una recuperación terminal en espera de limpieza.');
assert.match(appSource, /missingProjectRecoveryPendingSpaceIds:\s*new Set\(\)/,
  'La interfaz no conserva una cola para cards que entren en recuperación mientras otro watchdog está activo.');
assert.match(appSource, /frontend\.ui\.missing-project-recovery\.queued/,
  'Una recuperación concurrente se sigue descartando en silencio en vez de quedar encolada.');
assert.match(appSource, /scheduleMissingProjectRecoveryDrain/,
  'La cola de recuperación no tiene un drenaje propio después del cooldown o de una limpieza temporalmente fallida.');
assert.match(appSource, /retryAfterCurrentRun/,
  'Los fallos transitorios no se vuelven a encolar de forma explícita y pueden dejar la card sin otro intento.');
assert.match(appSource, /state\.panelResponseInProgress = true;/,
  'Una invitación individual no cerca los estados intermedios y el watchdog puede competir con escrow/bootstrap antes de terminar la aceptación.');
assert.doesNotMatch(appSource, /state\.panelResponseInProgress = isPanelGroup;/,
  'La protección contra recuperación concurrente sigue limitada solo a invitaciones de panel.');
assert.match(appSource, /missingProjectRecoveryPendingSpaceIds\.size\)\s*\{[\s\S]*scheduleMissingProjectRecoveryDrain/,
  'La reconexión online no despierta una recuperación que quedó pendiente durante una caída de red.');
assert.match(appSource, /p2p:invitation-recovery-discarded/,
  'La interfaz no refresca inmediatamente el directorio después de una limpieza terminal.');
assert.match(appSource, /después de 3 intentos/,
  'La interfaz de producción no comunica el resultado terminal de forma clara.');
assert.match(auditSource, /\[XXXinvXXX\]\[P2P_INVITATION_AUDIT\]/,
  'Los logs frontend no contienen XXXinvXXX.');

console.log('OK: watchdog frontend realiza 3 intentos reales, audita, limpia y comunica el descarte sin dejar el panel indefinidamente en sincronización.');
