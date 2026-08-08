import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const currentFile = fileURLToPath(import.meta.url);
const root = path.resolve(path.dirname(currentFile), '..');
const clientSource = fs.readFileSync(path.join(root, 'src', 'js', 'p2p-client.js'), 'utf8');
const appSource = fs.readFileSync(path.join(root, 'src', 'js', 'app.js'), 'utf8');

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

assert.match(responseMethod, /const recoverySpaceIds = normalizeSnapshotSpaceIds\(\[acceptedSpaceId, \.\.\.participationRootIds\]\)/, 'Aceptar un panel no agrupa el panel y todos sus proyectos mínimos en una sola recuperación dirigida.');
assert.match(responseMethod, /portfolioHead\?\.replicaRevisionCode/, 'La app debe validar la fuente preferente contra la versión de datos que un dispositivo puede demostrar por ACK.');
assert.match(responseMethod, /preferredSnapshotPanelRevisionCode/, 'La app ignora el código de revisión que certifica al invitador como fuente vigente.');
assert.match(responseMethod, /preferredSnapshotSourceUserIdsBySpace/, 'La recuperación no propaga la fuente preferente por cada proyecto del panel.');
assert.match(responseMethod, /recoverMissingProjectRoots\(recoverySpaceIds/, 'La app sigue recuperando solo el panel y deja las cards hijas esperando reconciliaciones posteriores.');
assert.match(responseMethod, /primeReplicaRecoveryKeys\(recoverySpaceIds, sessionContext\)/, 'Aceptar un panel no solicita de forma anticipada las claves de todos los proyectos antes de recibir sus snapshots.');

assert.match(responseMethod, /preferredSnapshotSourceInvitationId/, 'Aceptar un panel no conserva la invitación como prueba servidor-side de la instalación que certificó la cabeza vigente.');

const inviteStart = clientSource.indexOf("  async buildPortfolioSnapshotSourceClaim(spaceId = ''");
const inviteEnd = clientSource.indexOf('\n  async respondToInvitation', inviteStart);
assert.ok(inviteStart >= 0 && inviteEnd > inviteStart, 'No se encontró la certificación local previa a invitar un panel.');
const inviteSource = clientSource.slice(inviteStart, inviteEnd);
assert.match(inviteSource, /requestedAccessScope === 'portfolio'[\s\S]*refreshBootstrap\(\{ requestSnapshots: false \}\)/, 'La invitación certifica contra una cabeza de panel potencialmente obsoleta en caché.');
assert.match(inviteSource, /head\.replicaRevisionCode/, 'La instalación invitadora no certifica el código alfanumérico de réplica del panel.');
assert.match(inviteSource, /listStateRevisions\(spaceIds\)/, 'La certificación no compara la cabeza del panel contra las revisiones realmente aplicadas en esta instalación.');
assert.match(inviteSource, /listOutbox\(\)/, 'La certificación puede declarar vigente una instalación que aún tiene cambios locales pendientes de publicar.');
assert.match(inviteSource, /hasCanonicalProjectRootEntity\(entities\)/, 'La certificación puede declarar vigente una instalación sin la raíz canónica de uno de los proyectos.');
assert.match(inviteSource, /snapshotSourceClaim,/, 'La invitación no transporta la certificación local mínima hacia memoriaBACKEND.');

const attachStart = clientSource.indexOf("  async attachProjectsToPortfolio(portfolioSpaceId = '', projectSpaceIds = [])");
const attachEnd = clientSource.indexOf('\n\n  async respondToInvitation(', attachStart);
assert.ok(attachStart >= 0 && attachEnd > attachStart, 'No se encontró la migración cliente de proyectos anteriores al panel.');
const attachSource = clientSource.slice(attachStart, attachEnd);
assert.match(attachSource, /apiPost\('\/api\/p2p\/portfolios\/attach-projects'/, 'La app no persiste la gobernanza de proyectos standalone en memoriaBACKEND.');
assert.match(attachSource, /index \+= 100/, 'La migración debe respetar lotes acotados para paneles grandes.');
assert.match(attachSource, /refreshBootstrap\(\{ requestSnapshots: false \}\)/, 'Después de migrar proyectos la app debe releer la cabeza autoritativa antes de invitar.');

const migrationStart = appSource.indexOf('async function reconcileOwnedPortfolioProjectGovernance(');
const migrationEnd = appSource.indexOf('\nfunction projectBelongsToPortfolio', migrationStart);
assert.ok(migrationStart >= 0 && migrationEnd > migrationStart, 'No se encontró la reparación de gobernanza para proyectos existentes.');
const migrationSource = appSource.slice(migrationStart, migrationEnd);
assert.match(migrationSource, /candidates\.length === 1/, 'La reparación automática no debe adivinar panel cuando el propietario administra varios paneles.');
assert.match(migrationSource, /semillaP2P\.attachProjectsToPortfolio/, 'La reparación visual no está conectada a la gobernanza autoritativa del backend.');

const portfolioInviteStart = appSource.indexOf("async function inviteAcrossPortfolio(email = '', grant = {})");
const portfolioInviteEnd = appSource.indexOf('\nfunction invitationTargetSpace', portfolioInviteStart);
assert.ok(portfolioInviteStart >= 0 && portfolioInviteEnd > portfolioInviteStart, 'No se encontró el flujo de invitación de panel.');
const portfolioInviteSource = appSource.slice(portfolioInviteStart, portfolioInviteEnd);
assert.match(portfolioInviteSource, /semillaP2P\.createSpace\(\{[\s\S]*?resourceType: PORTFOLIO_RESOURCE_TYPE,[\s\S]*?accessScope: 'portfolio'/, 'El primer panel no se prepara con alcance portfolio antes de vincular proyectos existentes.');
assert.match(portfolioInviteSource, /await reconcileOwnedPortfolioProjectGovernance\(portfolioSpace, legacyProjectSpaceIds\)/, 'La invitación puede publicarse antes de que los proyectos existentes pertenezcan realmente al panel.');
assert.ok(
  portfolioInviteSource.indexOf('await reconcileOwnedPortfolioProjectGovernance(portfolioSpace, legacyProjectSpaceIds)')
    < portfolioInviteSource.indexOf('await upsertSpaceAccessByEmail'),
  'La gobernanza de proyectos debe quedar lista antes de crear o actualizar la participación del invitado.'
);
assert.match(appSource, /queueMicrotask\(\(\) => reconcileOwnedPortfolioProjectGovernance\(\)/, 'Una invitación ya aceptada no se autorrepara cuando el propietario vuelve a abrir la versión actualizada.');

const fetchBootstrapStart = clientSource.indexOf('  async fetchBootstrap(requestSnapshots = false)');
const fetchBootstrapEnd = clientSource.indexOf('\n  async start(', fetchBootstrapStart);
const fetchBootstrapSource = clientSource.slice(fetchBootstrapStart, fetchBootstrapEnd);
assert.match(fetchBootstrapSource, /preferredSnapshotSourceInvitationId/, 'La recuperación dirigida no devuelve al backend la invitación aceptada para resolver allí la fuente certificada.');

const snapshotRootHelperStart = clientSource.indexOf('export function hasCanonicalProjectRootEntity(');
const snapshotRootHelperEnd = clientSource.indexOf('\n\nexport function canonicalLocalSnapshotEntities', snapshotRootHelperStart);
assert.ok(snapshotRootHelperStart >= 0 && snapshotRootHelperEnd > snapshotRootHelperStart, 'No se encontró la validación de raíz canónica de proyecto.');
const snapshotRootHelperSource = clientSource.slice(snapshotRootHelperStart, snapshotRootHelperEnd);
const snapshotRootHelperModule = await import(`data:text/javascript;base64,${Buffer.from(`${snapshotRootHelperSource}`).toString('base64')}#canonical-project-root`);
assert.equal(snapshotRootHelperModule.hasCanonicalProjectRootEntity([{
  entityType: 'admin.project',
  entityId: 'project',
  value: { name: 'Proyecto válido' },
  deleted: false
}]), true, 'Una raíz de proyecto válida fue rechazada.');
assert.equal(snapshotRootHelperModule.hasCanonicalProjectRootEntity([{
  entityType: 'admin.project',
  entityId: 'project',
  value: {},
  deleted: false
}]), false, 'Una raíz sin nombre fue aceptada como proyecto completamente hidratado.');

const completeStart = clientSource.indexOf('  async applyDecryptedOperationEvent(event = {}');
const completeEnd = clientSource.indexOf('\n  async applyDecryptedOperationEventBatch(', completeStart);
const completeMethod = clientSource.slice(completeStart, completeEnd);
assert.match(completeMethod, /canonical_project_root_missing/, 'Un snapshot incompleto puede confirmarse aunque no haya recuperado la raíz canónica del proyecto.');
assert.match(completeMethod, /rememberRejectedSnapshotSource\(event\.spaceId, event\.sourceDeviceId\)/, 'La app no excluye la réplica que entregó un proyecto sin raíz canónica.');

console.log('OK: manifiesto mínimo, claves anticipadas, fuente vigente y raíz canónica de proyectos protegidos.');
