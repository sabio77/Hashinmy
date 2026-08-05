import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const currentFile = fileURLToPath(import.meta.url);
const root = path.resolve(path.dirname(currentFile), '..');
const domainSource = fs.readFileSync(path.join(root, 'src', 'js', 'project-domain.js'), 'utf8');
const clientSource = fs.readFileSync(path.join(root, 'src', 'js', 'p2p-client.js'), 'utf8');
const appSource = fs.readFileSync(path.join(root, 'src', 'js', 'app.js'), 'utf8');

const cleanTextStart = domainSource.indexOf('export function cleanText(');
const cleanTextEnd = domainSource.indexOf('\nexport function localDateValue', cleanTextStart);
const membershipStart = domainSource.indexOf('export function memberForUser(');
const membershipEnd = domainSource.indexOf('\nexport function individualRecordAccess', membershipStart);
const hydrationStart = domainSource.indexOf('export function sharedOwnerPanelId(');
const hydrationEnd = domainSource.indexOf('\nfunction projectOwnerProfile', hydrationStart);
assert.ok(cleanTextStart >= 0 && cleanTextEnd > cleanTextStart);
assert.ok(membershipStart >= 0 && membershipEnd > membershipStart);
assert.ok(hydrationStart >= 0 && hydrationEnd > hydrationStart);

const domainModuleSource = [
  "const PROJECT_ENTITY_TYPE = 'admin.project';",
  "const COLLABORATION_ROLES = Object.freeze(['manager', 'admin', 'individual', 'member']);",
  domainSource.slice(cleanTextStart, cleanTextEnd),
  domainSource.slice(membershipStart, membershipEnd),
  domainSource.slice(hydrationStart, hydrationEnd),
  'export { invitedPortfolioHydrationStatus };'
].join('\n').replaceAll('export function', 'function');
const domain = await import(`data:text/javascript;base64,${Buffer.from(domainModuleSource).toString('base64')}#panel-authority-domain`);

const clientStart = clientSource.indexOf('export function invitedReplicaRecoverySpaceIds(');
const clientEnd = clientSource.indexOf('\nfunction createId(', clientStart);
assert.ok(clientStart >= 0 && clientEnd > clientStart);
const clientModuleSource = `${clientSource.slice(clientStart, clientEnd).replaceAll('export function', 'function')}
export { invitedReplicaRecoverySpaceIds, normalizePortfolioHydrationManifests };`;
const client = await import(`data:text/javascript;base64,${Buffer.from(clientModuleSource).toString('base64')}#panel-authority-client`);

const panelId = 'portfolio_freshness';
const guestUserId = 'guest_user';
const member = { userId: guestUserId, permissions: ['read'], accessScope: 'portfolio' };
const spaces = [
  { spaceId: panelId, resourceType: 'admin.portfolio', ownerUserId: 'owner_user', members: [member], authorizationState: 'confirmed', projectInventoryRevision: 4 },
  { spaceId: 'project_a', resourceType: 'admin.project', governanceSpaceId: panelId, ownerUserId: 'owner_user', members: [member], authorizationState: 'confirmed' }
];
const manifest = [{ portfolioSpaceId: panelId, expectedProjectSpaceIds: ['project_a'], inventoryRevision: 4, complete: true }];

const cachedManifest = client.normalizePortfolioHydrationManifests(manifest, { authoritative: false });
assert.equal(cachedManifest[0].authoritative, false);
const cachedStatus = domain.invitedPortfolioHydrationStatus({
  spaces,
  panelId,
  currentUserId: guestUserId,
  portfolioHydration: cachedManifest,
  loadedProjectSpaceIds: ['project_a']
});
assert.equal(cachedStatus.ready, false, 'Una comparación persistida de una sesión anterior no puede mostrar el panel antes del bootstrap actual.');
assert.equal(cachedStatus.comparisonComplete, true);
assert.equal(cachedStatus.comparisonAuthoritative, false);
assert.equal(cachedStatus.reason, 'authoritative_comparison_stale');

const freshManifest = client.normalizePortfolioHydrationManifests(manifest, { authoritative: true });
assert.equal(freshManifest[0].authoritative, true);
const freshStatus = domain.invitedPortfolioHydrationStatus({
  spaces,
  panelId,
  currentUserId: guestUserId,
  portfolioHydration: freshManifest,
  loadedProjectSpaceIds: ['project_a']
});
assert.equal(freshStatus.ready, true);
assert.equal(freshStatus.comparisonAuthoritative, true);

const recoverySpaceIds = client.invitedReplicaRecoverySpaceIds({
  userId: guestUserId,
  spaces: [
    { spaceId: 'owned_project', ownerUserId: guestUserId, members: [member] },
    { spaceId: panelId, ownerUserId: 'owner_user', members: [member] },
    { spaceId: 'project_a', ownerUserId: 'owner_user', members: [member] },
    { spaceId: 'project_equal', ownerUserId: 'owner_user', members: [member] },
    { spaceId: 'project_requirement', ownerUserId: 'owner_user', members: [member] },
    { spaceId: 'project_without_read', ownerUserId: 'owner_user', members: [{ userId: guestUserId, permissions: ['add'] }] }
  ],
  backendStateRevisions: {
    [panelId]: 4,
    project_a: 8,
    project_equal: 3,
    project_requirement: 2,
    project_without_read: 9,
    owned_project: 7
  },
  localStateRevisions: {
    [panelId]: 3,
    project_a: 6,
    project_equal: 3,
    project_requirement: 2,
    project_without_read: 0,
    owned_project: 0
  },
  recoveryRequirements: { project_requirement: 5 }
});
assert.deepEqual(recoverySpaceIds, [panelId, 'project_a', 'project_requirement'].sort());

assert.match(clientSource, /storedPortfolioHydration, \{ authoritative: false \}/, 'El arranque local todavía confía en un inventario persistido potencialmente obsoleto.');
assert.match(clientSource, /\{ authoritative: true \}\s*\);/, 'El bootstrap remoto no marca expresamente la comparación como autoritativa.');
assert.match(clientSource, /const pendingReplicaSpaceIds = invitedReplicaRecoverySpaceIds\(/, 'El bootstrap no bloquea réplicas invitadas que ya existían pero quedaron detrás.');
assert.match(appSource, /comparisonAuthoritative: status\?\.comparisonAuthoritative === true/, 'El error de consola no permite distinguir una comparación antigua de una comparación fresca.');

console.log('OK: un panel invitado no usa inventarios cacheados como prueba actual y vuelve a ocultarse ante cualquier brecha de revisión autoritativa.');
