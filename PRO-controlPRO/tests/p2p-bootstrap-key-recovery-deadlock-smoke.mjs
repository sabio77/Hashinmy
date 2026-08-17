import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const currentFile = fileURLToPath(import.meta.url);
const root = path.resolve(path.dirname(currentFile), '..');
const clientPath = path.join(root, 'src', 'js', 'p2p-client.js');
const source = await fs.readFile(clientPath, 'utf8');

function extractMethod(startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.ok(start >= 0 && end > start, `No se pudo aislar ${startMarker.trim()}`);
  return source.slice(start, end).trim();
}

const applyBootstrapSource = extractMethod(
  '  async applyBootstrapData(data = {}, context = {}) {',
  '\n  mergeReplicaHealth('
);

assert.match(
  applyBootstrapSource,
  /recoverAcceptedInvitationBootstrap\([\s\S]*?deferKeyWait:\s*true[\s\S]*?auditTraceId/,
  'El bootstrap volvió a esperar una clave por SSE antes de abrir el stream.'
);
assert.match(
  applyBootstrapSource,
  /ensureCurrentSpaceKey\(space\.spaceId,\s*\{\s*requestIfMissing:\s*false\s*\}\)/,
  'applyBootstrapData volvió a permitir una recuperación de clave que puede invocar refreshBootstrap() recursivamente.'
);
assert.doesNotMatch(
  applyBootstrapSource,
  /ensureCurrentSpaceKey\(space\.spaceId\)\.catch/,
  'El bootstrap conserva la llamada peligrosa a ensureCurrentSpaceKey() con recuperación recursiva habilitada.'
);

const recoverSource = extractMethod(
  "  async recoverAcceptedInvitationBootstrap(space = null, receivedInvitations = [], sessionContext = this.captureSessionContext(), options = {}) {",
  '\n  async createSpace('
);
const recoverAcceptedInvitationBootstrap = eval(`({${recoverSource}}).recoverAcceptedInvitationBootstrap`);

let waitCalls = 0;
let requestCalls = 0;
const auditEntries = [];
const hasSpaceKey = async () => false;
const invitationAuditLog = (stage, detail) => auditEntries.push({ stage, detail });
const createInvitationAuditTraceId = () => 'audit_deadlock_test';

const client = {
  captureSessionContext() {
    return { deviceId: 'dev_deadlock_test', userId: 'user_owner', generation: 1 };
  },
  assertSessionContext() { return true; },
  isSessionContextChangedError() { return false; },
  async requestSpaceKey() {
    requestCalls += 1;
    return true;
  },
  async requestSpaceKeyAndWait() {
    waitCalls += 1;
    throw new Error('Durante bootstrap no debe esperarse una respuesta SSE.');
  }
};

const space = {
  spaceId: 'space_owner_without_invitation',
  ownerUserId: 'user_owner',
  encryptionVersion: 1,
  activeEncryptionKeyId: 'key_owner_active'
};

const result = await recoverAcceptedInvitationBootstrap.call(
  client,
  space,
  [],
  client.captureSessionContext(),
  { deferKeyWait: true, auditTraceId: 'audit_deadlock_test' }
);

assert.equal(waitCalls, 0, 'La recuperación diferida bloqueó esperando una clave antes de abrir SSE.');
assert.equal(requestCalls, 1, 'La recuperación diferida no dejó encolada la solicitud de clave para el stream.');
assert.equal(result.recovered, false);
assert.equal(result.keyRequested, true);
assert.equal(result.reason, 'accepted-invitation-missing-key-requested');
assert.equal(
  auditEntries.at(-1)?.stage,
  'frontend.recovery.key-requested',
  'La auditoría sigue clasificando como skipped una recuperación cuya solicitud de clave quedó encolada.'
);
assert.equal(
  auditEntries.at(-1)?.detail?.keyWaitDeferred,
  true,
  'La auditoría no distingue que la espera de clave fue diferida deliberadamente.'
);

console.log('OK: el bootstrap no espera SSE ni reentra en refreshBootstrap al recuperar claves faltantes; la solicitud queda encolada y el stream puede abrir sin dejar la interfaz en Conectando… indefinidamente.');
