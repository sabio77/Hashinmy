import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const appSource = fs.readFileSync(path.join(root, 'src/js/app.js'), 'utf8');

const helperStart = appSource.indexOf('function stableCollaborationRequestId(');
const helperEnd = appSource.indexOf('\nfunction memberMatchesGrant(', helperStart);
assert.ok(helperStart >= 0 && helperEnd > helperStart, 'No se encontró el identificador estable para reintentos de invitación.');
const helperSource = appSource.slice(helperStart, helperEnd);

const moduleSource = `
const P2P_APPLICATION_ID = 'control-proyectos';
const state = { user: { userId: 'owner_1' } };
function normalizeCollaborationRole(value = '') {
  const role = String(value || '').trim().toLowerCase();
  return ['manager', 'admin', 'individual', 'member'].includes(role) ? role : 'member';
}
function rolePermissions(role = 'member', permissions = []) {
  return role === 'manager'
    ? ['read', 'add', 'delete', 'projection', 'invite']
    : permissions;
}
function normalizeCollaborationPermissions(values = []) {
  const set = new Set((Array.isArray(values) ? values : []).map((value) => String(value || '').trim().toLowerCase()));
  set.add('read');
  return ['read', 'add', 'delete', 'projection', 'invite'].filter((permission) => set.has(permission));
}
${helperSource}
export { stableCollaborationRequestId };
`;
const { stableCollaborationRequestId } = await import(
  `data:text/javascript;base64,${Buffer.from(moduleSource).toString('base64')}#panel-invitation-retry-guard`
);

const grant = { role: 'member', permissions: ['projection', 'read', 'add'] };
const first = stableCollaborationRequestId('portfolio', 'Guest@Example.com', grant, 'new');
const second = stableCollaborationRequestId('portfolio', 'guest@example.com', {
  role: 'member',
  permissions: ['add', 'read', 'projection']
}, 'new');
assert.equal(first, second, 'El mismo reintento cambió de identidad por mayúsculas u orden de permisos.');
assert.notEqual(
  first,
  stableCollaborationRequestId('portfolio', 'other@example.com', grant, 'new'),
  'Dos destinatarios distintos comparten el mismo identificador idempotente.'
);
assert.notEqual(
  first,
  stableCollaborationRequestId('portfolio', 'guest@example.com', grant, 'space_panel'),
  'La creación inicial y la invitación a un panel ya existente no deben compartir identidad.'
);
assert.ok(first.length <= 180, 'El identificador estable excede el contrato del backend.');

const inviteStart = appSource.indexOf('async function inviteAcrossPortfolio(');
const inviteEnd = appSource.indexOf('\nfunction invitationTargetSpace(', inviteStart);
assert.ok(inviteStart >= 0 && inviteEnd > inviteStart, 'No se encontró el flujo de invitación de panel.');
const inviteSource = appSource.slice(inviteStart, inviteEnd);
assert.match(
  inviteSource,
  /const portfolioRequestId = stableCollaborationRequestId\([\s\S]*portfolioSpace\?\.spaceId \|\| 'new'[\s\S]*\);/,
  'La identidad del reintento no diferencia creación inicial y panel existente.'
);
assert.equal(
  (inviteSource.match(/requestId: portfolioRequestId/g) || []).length,
  2,
  'Las dos rutas de invitación del panel no reutilizan la misma identidad estable.'
);
assert.doesNotMatch(
  inviteSource,
  /createLocalId\('portfolio_invite_request'\)/,
  'Un reintento del panel todavía puede crear otra solicitud paralela con identidad aleatoria.'
);

console.log('OK: los reintentos de invitación de panel usan una identidad estable y no crean solicitudes paralelas por cada clic o reconexión.');
