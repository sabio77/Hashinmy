import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const currentFile = fileURLToPath(import.meta.url);
const clientPath = path.resolve(path.dirname(currentFile), '../src/js/p2p-client.js');
const clientSource = await fs.readFile(clientPath, 'utf8');

function extractMethod(startMarker, endMarker) {
  const start = clientSource.indexOf(startMarker);
  const end = clientSource.indexOf(endMarker, start + startMarker.length);
  if (start < 0 || end <= start) {
    throw new Error(`No se pudo aislar el método ${startMarker.trim()} para la prueba.`);
  }
  return clientSource.slice(start, end).trim();
}

const distributeMethodSource = extractMethod(
  "  async distributeSpaceKey(spaceId = '', keyId = '') {",
  "\n  async stageInvitationKeyForRecipient("
);
const createSpaceMethodSource = extractMethod(
  '  async createSpace(options = {}) {',
  "\n  async invite("
);

let apiPost = async () => ({});
let createSpaceKeyEnvelopes = async () => [];
let saveSpaces = async () => {};
let ensureSpaceKey = async () => ({ keyId: 'key_initial' });
const dispatched = [];
const dispatch = (name, detail = {}) => dispatched.push({ name, detail });

const distributeSpaceKey = eval(`({${distributeMethodSource}}).distributeSpaceKey`);
const createSpace = eval(`({${createSpaceMethodSource}}).createSpace`);

const envelopeCalls = [];
apiPost = async (endpoint, payload = {}) => {
  if (endpoint === '/api/p2p/crypto/space-devices') {
    return {
      space: { activeEncryptionKeyId: 'key_initial' },
      devices: [
        { deviceId: 'dev_source' },
        { deviceId: 'dev_one' },
        { deviceId: 'dev_two' },
        { deviceId: 'dev_three' }
      ]
    };
  }
  if (endpoint === '/api/p2p/crypto/key-envelope') {
    envelopeCalls.push(payload.targetDeviceId);
    if (payload.targetDeviceId === 'dev_two') {
      const error = new Error('fallo transitorio simulado');
      error.code = 'P2P_TEST_TRANSIENT_FAILURE';
      error.status = 503;
      throw error;
    }
    return { deliveredToDevices: 1 };
  }
  throw new Error(`Endpoint inesperado: ${endpoint}`);
};
createSpaceKeyEnvelopes = async (_spaceId, recipients, options = {}) => recipients.map((recipient) => ({
  recipientDeviceId: recipient.deviceId,
  keyId: options.keyId
}));

const distributionClient = {
  deviceId: 'dev_source',
  assertSpaceAuthorizationConfirmed() { return true; }
};
const partialDistribution = await distributeSpaceKey.call(distributionClient, 'space_initial', 'key_initial');
if (envelopeCalls.length !== 3
  || !envelopeCalls.includes('dev_one')
  || !envelopeCalls.includes('dev_two')
  || !envelopeCalls.includes('dev_three')) {
  throw new Error('Un fallo individual detuvo la distribución y dejó dispositivos autorizados sin intento de entrega.');
}
if (partialDistribution.complete
  || partialDistribution.delivered !== 2
  || partialDistribution.failed !== 1
  || partialDistribution.failedDeviceIds[0] !== 'dev_two'
  || partialDistribution.failures[0]?.code !== 'P2P_TEST_TRANSIENT_FAILURE') {
  throw new Error('La distribución parcial no informó con precisión qué dispositivo quedó pendiente.');
}

const order = [];
apiPost = async (endpoint) => {
  if (endpoint !== '/api/p2p/spaces/create') throw new Error(`Endpoint inesperado durante createSpace: ${endpoint}`);
  order.push('create');
  return {
    space: {
      spaceId: 'space_initial',
      encryptionVersion: 1,
      activeEncryptionKeyId: '',
      authorizationState: 'confirmed'
    }
  };
};
saveSpaces = async () => { order.push('save'); };
ensureSpaceKey = async () => {
  order.push('ensure-key');
  return { keyId: 'key_initial' };
};

function creationClient(distribution) {
  return {
    captureSessionContext() { return { userId: 'usr_owner', deviceId: 'dev_source', generation: 1 }; },
    assertSessionContext() { return true; },
    async fenceBootstrapResponses() { order.push('fence'); },
    rememberAuthoritativeSpace(space) { order.push('remember'); return space; },
    async activateAuthoritativeSpaceKey(spaceId, keyId) {
      order.push('activate');
      return {
        space: {
          spaceId,
          encryptionVersion: 1,
          activeEncryptionKeyId: keyId,
          encryptionKeyEpoch: 1,
          authorizationState: 'confirmed'
        }
      };
    },
    async distributeSpaceKey() {
      order.push('distribute');
      return structuredClone(distribution);
    },
    async refreshBootstrap() { order.push('refresh'); return {}; }
  };
}

let pendingError = null;
try {
  await createSpace.call(creationClient({
    recipients: 2,
    envelopes: 2,
    delivered: 1,
    failed: 1,
    failedDeviceIds: ['dev_two'],
    failures: [{ recipientDeviceId: 'dev_two', code: 'P2P_TEST_TRANSIENT_FAILURE', status: 503 }],
    complete: false
  }), { resourceType: 'admin.project', requestId: 'space_request_test' });
} catch (error) {
  pendingError = error;
}
if (pendingError?.code !== 'P2P_INITIAL_KEY_DISTRIBUTION_PENDING'
  || pendingError?.retryable !== true
  || order.includes('refresh')) {
  throw new Error('La creación permitió continuar aunque la clave inicial no llegó a todos los dispositivos autorizados.');
}
if (!dispatched.some((entry) => entry.name === 'p2p:key-distribution-pending'
  && entry.detail?.stage === 'space-create')) {
  throw new Error('La distribución inicial incompleta no emitió su señal recuperable.');
}

order.length = 0;
dispatched.length = 0;
const completed = await createSpace.call(creationClient({
  recipients: 2,
  envelopes: 2,
  delivered: 2,
  failed: 0,
  failedDeviceIds: [],
  failures: [],
  complete: true
}), { resourceType: 'admin.project', requestId: 'space_request_test' });
const distributionIndex = order.indexOf('distribute');
const refreshIndex = order.indexOf('refresh');
if (completed.keyDistribution?.complete !== true
  || distributionIndex < 0
  || refreshIndex < 0
  || distributionIndex > refreshIndex) {
  throw new Error('La clave inicial no se distribuyó antes de completar el alta y habilitar la publicación de la entidad del proyecto.');
}

console.log('OK: la clave del proyecto se distribuye a todas las réplicas existentes antes de publicar datos, sin abortar los demás intentos por un fallo individual.');
