
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  completeSpaceCreationIntent,
  normalizeSpaceCreationIntent,
  normalizeSpaceCreationIntents
} from '../src/js/p2p-space-creation-intent.js';


const currentFile = fileURLToPath(import.meta.url);
const appRoot = path.resolve(path.dirname(currentFile), '..');
const [clientSource, appSource, storageSource, serverSource] = await Promise.all([
  fs.readFile(path.join(appRoot, 'src/js/p2p-client.js'), 'utf8'),
  fs.readFile(path.join(appRoot, 'src/js/app.js'), 'utf8'),
  fs.readFile(path.join(appRoot, 'src/js/p2p-storage.js'), 'utf8'),
  fs.readFile(path.resolve(appRoot, '../memoriaBACKEND/server.js'), 'utf8')
]);
if (!/put\(spaceId, entityType, entityId, value, options = \{\}\)[\s\S]*const \{ operationId, (?:referenceRequirements, )?\.\.\.publishOptions \}/.test(clientSource)
  || !/operationId: String\(operationId \|\| ''\)\.trim\(\) \|\| undefined/.test(clientSource)) {
  throw new Error('SemillaP2P.put no conserva el operationId estable requerido por la recuperación.');
}
if (!appSource.includes('completeSpaceCreationIntent(intent, projectCreationAdapters())')
  || !appSource.includes('recoverPendingProjectCreations()')
  || !appSource.includes('permissionProfile: ADMIN_PROJECT_PERMISSION_PROFILE')) {
  throw new Error('La interfaz no conectó el commit recuperable y el perfil estricto al alta y al arranque de la cuenta.');
}
if (!clientSource.includes("permissionProfile: String(options.permissionProfile || '').trim().toLowerCase()")
  || !serverSource.includes("permissionProfile: req.body?.permissionProfile || ''")) {
  throw new Error('El perfil de permisos no atraviesa completamente PWA -> API -> memoriaBACKEND.');
}
if (!storageSource.includes('export async function savePendingSpaceCreation')
  || !storageSource.includes('export async function removePendingSpaceCreation')) {
  throw new Error('IndexedDB no expone el ciclo durable del intent de creación.');
}

const baseIntent = normalizeSpaceCreationIntent({
  requestId: 'space_request_1',
  operationId: 'op_project_create_1',
  resourceType: 'admin.project',
  permissionProfile: 'admin-project-v1',
  entityType: 'admin.project',
  entityId: 'project',
  value: { name: 'Proyecto recuperable', initialBudget: 1000000 },
  createdAt: '2026-07-30T12:00:00.000Z',
  updatedAt: '2026-07-30T12:00:00.000Z'
});
if (!baseIntent || baseIntent.spaceId || baseIntent.operationId !== 'op_project_create_1' || baseIntent.permissionProfile !== 'admin-project-v1') {
  throw new Error('La intención de creación no conservó sus identidades estables.');
}

const deduplicated = normalizeSpaceCreationIntents([
  baseIntent,
  { ...baseIntent, spaceId: 'space_1', updatedAt: '2026-07-30T12:01:00.000Z' },
  { requestId: '', operationId: '' }
]);
if (deduplicated.length !== 1 || deduplicated[0].spaceId !== 'space_1') {
  throw new Error('Las intenciones persistidas no se deduplicaron por requestId usando su versión más reciente.');
}

let persisted = null;
let removeCalls = 0;
let createCalls = 0;
let putCalls = 0;
let failAfterSpaceResolution = true;
const adapters = {
  async saveIntent(intent) {
    persisted = { ...intent };
    return persisted;
  },
  async removeIntent(requestId) {
    if (persisted?.requestId === requestId) persisted = null;
    removeCalls += 1;
  },
  async createSpace({ requestId, permissionProfile }) {
    createCalls += 1;
    if (requestId !== baseIntent.requestId) throw new Error('Cambió el requestId durante el reintento.');
    if (permissionProfile !== 'admin-project-v1') throw new Error('No se conservó el perfil estricto de permisos durante la creación.');
    return { space: { spaceId: 'space_1' } };
  },
  async listEntities() {
    if (failAfterSpaceResolution) {
      failAfterSpaceResolution = false;
      throw new Error('cierre simulado después de crear el espacio');
    }
    return [];
  },
  async putEntity(spaceId, entityType, entityId, value, options) {
    putCalls += 1;
    if (spaceId !== 'space_1'
      || entityType !== 'admin.project'
      || entityId !== 'project'
      || value.name !== 'Proyecto recuperable'
      || options.operationId !== 'op_project_create_1') {
      throw new Error('La recuperación cambió la intención funcional o su operationId.');
    }
    return { event: { operation: { operationId: options.operationId } } };
  }
};

await completeSpaceCreationIntent(baseIntent, adapters).then(
  () => { throw new Error('El primer intento debía interrumpirse después de resolver el espacio.'); },
  () => null
);
if (persisted?.spaceId !== 'space_1' || removeCalls !== 0 || createCalls !== 1) {
  throw new Error('El fallo intermedio no conservó el spaceId necesario para reanudar sin crear otro espacio.');
}

const completed = await completeSpaceCreationIntent(persisted, adapters);
if (completed.spaceId !== 'space_1' || createCalls !== 1 || putCalls !== 1 || removeCalls !== 1 || persisted !== null) {
  throw new Error('La reanudación no completó exactamente una vez el proyecto ni limpió la intención.');
}

let queuedRemoved = false;
const queued = await completeSpaceCreationIntent({ ...baseIntent, requestId: 'space_request_2', operationId: 'op_2', spaceId: 'space_2' }, {
  saveIntent: async (intent) => intent,
  removeIntent: async () => { queuedRemoved = true; },
  createSpace: async () => { throw new Error('No debía crear otro espacio.'); },
  listEntities: async () => [],
  putEntity: async () => {
    const error = new Error('offline');
    error.p2pQueued = true;
    throw error;
  }
});
if (!queued.queued || !queuedRemoved) {
  throw new Error('Una operación ya protegida por outbox no liberó la intención de creación redundante.');
}

let existingPutCalls = 0;
const existing = await completeSpaceCreationIntent({ ...baseIntent, requestId: 'space_request_3', operationId: 'op_3', spaceId: 'space_3' }, {
  saveIntent: async (intent) => intent,
  removeIntent: async () => true,
  createSpace: async () => { throw new Error('No debía crear otro espacio.'); },
  listEntities: async () => [{ entityType: 'admin.project', entityId: 'project', deleted: false }],
  putEntity: async () => { existingPutCalls += 1; }
});
if (!existing.existing || existingPutCalls !== 0) {
  throw new Error('Una entidad ya confirmada volvió a publicarse innecesariamente.');
}

console.log('OK: creación de espacios recuperable, perfil estricto, requestId/operationId estables, reanudación tras cierre y transferencia al outbox validadas.');
