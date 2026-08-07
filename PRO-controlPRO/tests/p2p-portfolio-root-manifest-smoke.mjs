import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const currentFile = fileURLToPath(import.meta.url);
const root = path.resolve(path.dirname(currentFile), '..');
const clientSource = fs.readFileSync(path.join(root, 'src', 'js', 'p2p-client.js'), 'utf8');

const helperStart = clientSource.indexOf('function realtimeProtocolError(');
const helperEnd = clientSource.indexOf('\nexport function assertCanonicalControlEnvelope', helperStart);
assert.ok(helperStart >= 0 && helperEnd > helperStart, 'No se encontró la validación del manifiesto mínimo de participación.');
const helperSource = clientSource.slice(helperStart, helperEnd)
  .replace('export function mergeParticipationRootManifest', 'function mergeParticipationRootManifest');
const helperModule = await import(`data:text/javascript;base64,${Buffer.from(`${helperSource}\nexport { mergeParticipationRootManifest };`).toString('base64')}#portfolio-root-manifest`);

const owner = {
  userId: 'user_owner',
  role: 'owner',
  permissions: ['read', 'add', 'delete', 'projection', 'invite', 'write'],
  accessScope: 'portfolio'
};
const guest = {
  userId: 'user_guest',
  role: 'member',
  permissions: ['read', 'projection'],
  accessScope: 'portfolio'
};
const portfolio = {
  spaceId: 'space_portfolio',
  ownerUserId: owner.userId,
  resourceType: 'admin.portfolio',
  members: [owner, guest]
};
const projectRoot = {
  spaceId: 'space_project_1',
  ownerUserId: owner.userId,
  resourceType: 'admin.project',
  governanceSpaceId: portfolio.spaceId,
  members: [owner, guest]
};

const merged = helperModule.mergeParticipationRootManifest([portfolio], [projectRoot], guest.userId);
assert.deepEqual(merged.rootSpaceIds, [projectRoot.spaceId], 'El panel aceptado no reconoció inmediatamente su raíz de proyecto.');
assert.equal(merged.spaces.length, 2);
assert.equal(merged.spaces[1].spaceId, projectRoot.spaceId);

const deduplicated = helperModule.mergeParticipationRootManifest([portfolio, projectRoot], [projectRoot], guest.userId);
assert.deepEqual(deduplicated.rootSpaceIds, [], 'Una raíz ya autoritativa se volvió a montar como provisional.');
assert.equal(deduplicated.spaces.length, 2);

assert.throws(
  () => helperModule.mergeParticipationRootManifest([portfolio], [{ ...projectRoot, ownerUserId: 'user_other' }], guest.userId),
  (error) => error?.code === 'P2P_PARTICIPATION_ROOT_MANIFEST_INVALID',
  'El cliente aceptó una raíz cuyo propietario no coincide con el panel gobernante.'
);
assert.throws(
  () => helperModule.mergeParticipationRootManifest([portfolio], [{ ...projectRoot, governanceSpaceId: 'space_other_portfolio' }], guest.userId),
  (error) => error?.code === 'P2P_PARTICIPATION_ROOT_MANIFEST_INVALID',
  'El cliente aceptó una raíz gobernada por otro panel.'
);
assert.throws(
  () => helperModule.mergeParticipationRootManifest([portfolio], [{ ...projectRoot, members: [owner] }], guest.userId),
  (error) => error?.code === 'P2P_PARTICIPATION_ROOT_MANIFEST_INVALID',
  'El cliente aceptó una raíz mínima sin grant legible para el participante.'
);

const bootstrapStart = clientSource.indexOf('  async applyBootstrapData(');
const bootstrapEnd = clientSource.indexOf('\n  mergeReplicaHealth(', bootstrapStart);
assert.ok(bootstrapStart >= 0 && bootstrapEnd > bootstrapStart, 'No se encontró la aplicación del bootstrap P2P.');
const bootstrapMethod = clientSource.slice(bootstrapStart, bootstrapEnd);
assert.match(bootstrapMethod, /mergeParticipationRootManifest\(/, 'El bootstrap ignora el manifiesto mínimo de raíces.');
assert.match(bootstrapMethod, /participationRootSpaceIds\.has\(spaceId\)/, 'Las raíces mínimas no quedan marcadas para recuperación de réplica.');
assert.match(
  bootstrapMethod,
  /revokedSpaceIds\.has\(governanceSpaceId\)[\s\S]*?!authoritativeSpaceIds\.has\(localSpaceId\)[\s\S]*?revokedSpaceIds\.add\(localSpaceId\)/,
  'Revocar un panel no purga una raíz hija provisional que ya no tiene autorización autoritativa.'
);
assert.match(
  bootstrapMethod,
  /!authoritativeSpaceIds\.has\(localSpaceId\)/,
  'La cascada de revocación no protege proyectos que el backend todavía autoriza directamente.'
);

const responseStart = clientSource.indexOf("  async respondToInvitation(invitationId = '', decision = 'accept')");
const responseEnd = clientSource.indexOf('\n  async leave(', responseStart);
assert.ok(responseStart >= 0 && responseEnd > responseStart, 'No se encontró la aceptación local de invitaciones.');
const responseMethod = clientSource.slice(responseStart, responseEnd);
assert.match(responseMethod, /mergeParticipationRootManifest\(/, 'Aceptar un panel no monta sus raíces mínimas en el mismo commit de control.');
assert.match(responseMethod, /data\.participationRoots = committedControlState\.spaces\.filter/, 'La interfaz no recibe las raíces mínimas ya persistidas.');
assert.match(responseMethod, /authorizationState: canonicalDecision === 'accept' \? 'unconfirmed' : 'confirmed'/, 'Las raíces mínimas se están confirmando antes de recuperar la réplica real.');

console.log('OK: manifiesto mínimo de proyectos validado, recuperación incremental y cascada de revocación protegida.');
