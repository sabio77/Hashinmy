import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const clientSource = readFileSync(fileURLToPath(new URL('../src/js/p2p-client.js', import.meta.url)), 'utf8');
const appSource = readFileSync(fileURLToPath(new URL('../src/js/app.js', import.meta.url)), 'utf8');

function methodSource(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.ok(start >= 0 && end > start, `No se encontró el bloque ${startMarker}`);
  return source.slice(start, end);
}

const waitMethod = methodSource(
  clientSource,
  '  async waitForReplicaRecoveries(',
  '\n  async confirmRecoveredReplicaAuthorization('
);
assert.match(waitMethod, /p2p:snapshot-complete/);
assert.match(waitMethod, /p2p:replica-recovery-confirmed/);
assert.match(waitMethod, /window\.addEventListener/);
assert.match(waitMethod, /missingSpaceIds/);
assert.match(waitMethod, /complete:\s*pendingSpaceIds\.length === 0 && missingSpaceIds\.length === 0/);
assert.doesNotMatch(waitMethod, /setInterval\s*\(/, 'La espera de la réplica no debe introducir polling.');

const prepareMethod = methodSource(
  clientSource,
  '  async prepareInvitationSource(',
  '\n  async createSpace('
);
assert.match(prepareMethod, /await this\.flushOutbox\(\)/, 'Antes de invitar debe vaciarse el outbox de la réplica fuente.');
assert.match(prepareMethod, /P2P_INVITATION_SOURCE_SYNC_PENDING/, 'Una fuente aún pendiente debe impedir crear una invitación que no pueda hidratarse inmediatamente.');
assert.match(prepareMethod, /listEntities\(cleanSpaceId\)/, 'La invitación también debe esperar a que desaparezcan entidades optimistas de la fuente.');
assert.doesNotMatch(prepareMethod, /refreshBootstrap\(/, 'La preparación por proyecto no debe añadir un bootstrap extra que penalice paneles grandes.');

const inviteMethod = methodSource(
  clientSource,
  "  async invite(email = '', options = {}) {",
  '\n  async respondToInvitation('
);
const prepareIndex = inviteMethod.indexOf('await this.prepareInvitationSource(requestedSpaceId, sessionContext)');
const createRequestIndex = inviteMethod.indexOf("apiPost('/api/p2p/invitations/create'");
assert.ok(prepareIndex >= 0 && createRequestIndex > prepareIndex, 'La invitación se crea antes de preparar la réplica fuente.');

const snapshotMethod = methodSource(
  clientSource,
  '  async sendSnapshot(requestEvent = {}) {',
  '\n  async ensurePushSubscriptionForCurrentVapidKey('
);
const snapshotFlushIndex = snapshotMethod.indexOf('await this.flushOutbox()');
const revisionIndex = snapshotMethod.indexOf('const localStateRevisions = await listStateRevisions([spaceId])');
assert.ok(snapshotFlushIndex >= 0 && revisionIndex > snapshotFlushIndex, 'El snapshot compara revisiones antes de confirmar cambios locales pendientes.');
assert.match(snapshotMethod, /item\?\.spaceId \|\| item\?\.request\?\.spaceId/, 'La detección de outbox debe cubrir todos los formatos persistidos.');

const respondMethod = methodSource(
  clientSource,
  "  async respondToInvitation(invitationId = '', decision = 'accept', options = {}) {",
  '\n  async leave('
);
assert.match(respondMethod, /options\.waitForReplica !== false/, 'La semilla debe esperar la entrega automáticamente por defecto para cualquier interfaz futura.');
assert.match(respondMethod, /await this\.waitForReplicaRecoveries\(\[acceptedSpaceId\]/, 'La aceptación genérica no enlaza la recuperación en vivo.');
assert.match(respondMethod, /await this\.requestSpaceKey[\s\S]*await this\.waitForReplicaRecoveries/, 'La clave del espacio debe solicitarse antes de esperar la hidratación de la réplica.');

const appRespondStart = appSource.indexOf('async function respondInvitation(event) {');
const appRespondEnd = appSource.indexOf('\nasync function ', appRespondStart + 20);
assert.ok(appRespondStart >= 0 && appRespondEnd > appRespondStart, 'No se encontró el flujo de respuesta agrupada del panel.');
const appRespondMethod = appSource.slice(appRespondStart, appRespondEnd);
assert.match(appRespondMethod, /respondToInvitation\(invitation\.invitationId, decision, \{ waitForReplica: false \}\)/, 'El panel debe diferir la espera individual para evitar una espera acumulativa por proyecto.');
assert.match(appRespondMethod, /waitForReplicaRecoveries\(\[\.\.\.acceptedSpaceIds\]/, 'El panel debe esperar una sola vez por todas las réplicas aceptadas.');
assert.match(appRespondMethod, /handoff\.missingSpaceIds\.length > 0/, 'Una omisión del bootstrap no puede habilitar la edición como si la réplica estuviera lista.');

console.log('OK: aceptación de invitaciones enlazada a handoff de réplica en vivo, sin polling ni esperas acumulativas por panel.');
