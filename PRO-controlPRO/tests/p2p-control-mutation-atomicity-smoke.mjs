import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const currentFile = fileURLToPath(import.meta.url);
const root = path.resolve(path.dirname(currentFile), '..');
const storageSource = fs.readFileSync(path.join(root, 'src', 'js', 'p2p-storage.js'), 'utf8');
const clientSource = fs.readFileSync(path.join(root, 'src', 'js', 'p2p-client.js'), 'utf8');

const helperStart = storageSource.indexOf('export async function saveControlStateAtomically(');
const helperEnd = storageSource.indexOf('\nexport async function listSpaces()', helperStart);
assert.ok(helperStart >= 0 && helperEnd > helperStart, 'No se encontró el commit atómico incremental del estado de control.');
const helperSource = storageSource.slice(helperStart, helperEnd);
assert.match(
  helperSource,
  /withStores\(\s*\[STORES\.spaces, STORES\.invitations\],\s*'readwrite'/,
  'Proyecto e invitación no comparten una única transacción IndexedDB de escritura.'
);
assert.match(helperSource, /stores\[STORES\.spaces\]\.put\(space\)/);
assert.match(helperSource, /stores\[STORES\.invitations\]\.put\(invitation\)/);

const executableHelper = helperSource.replace('export async function', 'async function');
const helperHarness = `
const STORES = Object.freeze({ spaces: 'spaces', invitations: 'invitations' });
let committedState = { spaces: new Map(), invitations: new Map() };
let failingInvitationId = '';
function cleanSpaceId(value = '') { return String(value || '').trim(); }
function cloneState(source) {
  return {
    spaces: new Map(Array.from(source.spaces.entries(), ([key, value]) => [key, structuredClone(value)])),
    invitations: new Map(Array.from(source.invitations.entries(), ([key, value]) => [key, structuredClone(value)]))
  };
}
function requestToPromise(request) {
  return Promise.resolve().then(() => {
    if (request.storeName === STORES.invitations && request.value.invitationId === failingInvitationId) {
      throw new Error('fallo simulado al guardar la invitación');
    }
    const key = request.storeName === STORES.spaces ? request.value.spaceId : request.value.invitationId;
    request.target.set(key, structuredClone(request.value));
    return key;
  });
}
async function withStores(storeNames, mode, callback) {
  if (mode !== 'readwrite') throw new Error('modo inesperado');
  if (storeNames.join(',') !== [STORES.spaces, STORES.invitations].join(',')) throw new Error('stores inesperados');
  const staged = cloneState(committedState);
  const stores = {
    [STORES.spaces]: { put: (value) => ({ storeName: STORES.spaces, value, target: staged.spaces }) },
    [STORES.invitations]: { put: (value) => ({ storeName: STORES.invitations, value, target: staged.invitations }) }
  };
  const result = await callback(stores);
  committedState = staged;
  return result;
}
${executableHelper}
function setFailingInvitationId(value = '') { failingInvitationId = value; }
function getState() { return cloneState(committedState); }
export { saveControlStateAtomically, setFailingInvitationId, getState };
`;
const helperModule = await import(`data:text/javascript;base64,${Buffer.from(helperHarness).toString('base64')}#control-state`);

await helperModule.saveControlStateAtomically({
  spaces: [{ spaceId: 'space_ok', role: 'owner' }],
  invitations: [{ invitationId: 'inv_ok', spaceId: 'space_ok', status: 'pending' }]
});
let state = helperModule.getState();
assert.equal(state.spaces.get('space_ok')?.role, 'owner');
assert.equal(state.invitations.get('inv_ok')?.status, 'pending');

helperModule.setFailingInvitationId('inv_fail');
await assert.rejects(
  helperModule.saveControlStateAtomically({
    spaces: [{ spaceId: 'space_must_rollback', role: 'member' }],
    invitations: [{ invitationId: 'inv_fail', spaceId: 'space_must_rollback', status: 'accepted' }]
  }),
  /fallo simulado/
);
state = helperModule.getState();
assert.equal(state.spaces.has('space_must_rollback'), false, 'El proyecto quedó persistido aunque falló la invitación del mismo commit.');
assert.equal(state.invitations.has('inv_fail'), false, 'La invitación fallida apareció parcialmente en el estado durable.');
assert.equal(state.spaces.has('space_ok'), true, 'El aborto dañó estado previamente confirmado.');

assert.match(clientSource, /replaceBootstrapControlState,\s*saveControlStateAtomically,/);
const realtimeStart = clientSource.indexOf("    } else if (event.eventType?.startsWith('p2p.invitation.')) {");
const realtimeEnd = clientSource.indexOf('\n    } else {', realtimeStart);
assert.ok(realtimeStart >= 0 && realtimeEnd > realtimeStart, 'No se encontró la aplicación realtime de invitaciones.');
const realtimeMethod = clientSource.slice(realtimeStart, realtimeEnd);
assert.match(realtimeMethod, /await saveControlStateAtomically\((?:\{|committedControlState)/);
assert.doesNotMatch(realtimeMethod, /saveInvitations|saveSpaces|Promise\.all/);

const inviteStart = clientSource.indexOf('  async invite(email = \'\', options = {})');
const inviteEnd = clientSource.indexOf('\n  async respondToInvitation(', inviteStart);
assert.ok(inviteStart >= 0 && inviteEnd > inviteStart, 'No se encontró invite().');
const inviteMethod = clientSource.slice(inviteStart, inviteEnd);
assert.match(inviteMethod, /await saveControlStateAtomically\((?:\{|committedControlState)/);
assert.doesNotMatch(inviteMethod, /Promise\.all\(\[\s*data\.invitation/);

const responseStart = inviteEnd + 1;
const responseEnd = clientSource.indexOf('\n  async leave(', responseStart);
assert.ok(responseEnd > responseStart, 'No se encontró respondToInvitation().');
const responseMethod = clientSource.slice(responseStart, responseEnd);
assert.match(responseMethod, /await saveControlStateAtomically\((?:\{|committedControlState)/);
assert.doesNotMatch(responseMethod, /Promise\.all\(\[\s*data\.invitation/);

const atomicCallCount = (clientSource.match(/await saveControlStateAtomically\((?:\{|committedControlState)/g) || []).length;
assert.ok(atomicCallCount >= 3, 'Algún camino de invitación todavía persiste proyecto e invitación por separado.');

console.log('OK: invitación y proyecto se guardan en un único commit incremental tanto en acciones locales como en eventos realtime; una falla revierte ambos.');
