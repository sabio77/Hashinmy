import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const appSource = fs.readFileSync(path.join(root, 'src/js/app.js'), 'utf8');
const clientSource = fs.readFileSync(path.join(root, 'src/js/p2p-client.js'), 'utf8');

const cleanupStart = clientSource.indexOf('  async prepareInvitationCloneRecovery(spaceIds = []) {');
const cleanupEnd = clientSource.indexOf('\n  async recoverMissingProjectRoots(', cleanupStart);
assert.ok(cleanupStart >= 0 && cleanupEnd > cleanupStart, 'No se encontró la limpieza dirigida de la clonación.');
const cleanupSource = clientSource.slice(cleanupStart, cleanupEnd);
assert.match(cleanupSource, /apiPost\('\/api\/p2p\/snapshots\/reset'/, 'El cliente no cancela el lease remoto antes de iniciar una clonación nueva.');
assert.match(cleanupSource, /deviceId: this\.deviceId,[\s\S]*spaceIds: normalizedSpaceIds/, 'La limpieza remota no está ligada al dispositivo y espacios concretos.');
assert.match(cleanupSource, /this\.assertSessionContext\(cleanupSessionContext\)/, 'Una respuesta de limpieza de una sesión anterior puede aplicarse a otra cuenta.');
assert.match(cleanupSource, /invitation-clone-backend-cleanup-failed/, 'La falla de limpieza remota no deja diagnóstico y podría continuar silenciosamente con residuos.');

const preparationStart = appSource.indexOf('async function prepareInvitationCloneSpaces(');
const preparationEnd = appSource.indexOf('\nasync function prepareInvitationCloneAttempt(', preparationStart);
assert.ok(preparationStart >= 0 && preparationEnd > preparationStart, 'No se encontró la frontera de preparación del panel.');
const preparationSource = appSource.slice(preparationStart, preparationEnd);
assert.match(preparationSource, /const forceReset = options\.forceReset === true/);
assert.match(preparationSource, /const pendingSpaceIds = forceReset[\s\S]*\? requestedSpaceIds/, 'Un reintento explícito todavía reutiliza una preparación antigua.');

const recoveryStart = appSource.indexOf('async function recoverMissingProjectCards(');
const recoveryEnd = appSource.indexOf('\nasync function refreshProjects(', recoveryStart);
assert.ok(recoveryStart >= 0 && recoveryEnd > recoveryStart, 'No se encontró la recuperación de proyectos faltantes.');
const recoverySource = appSource.slice(recoveryStart, recoveryEnd);
assert.match(recoverySource, /prepareInvitationCloneSpaces\(candidates, \{[\s\S]*forceReset: true/, 'La recuperación no abre una frontera limpia para reemplazar el snapshot estancado.');

const responseStart = appSource.indexOf('async function respondInvitation(event) {');
const responseEnd = appSource.indexOf('\nfunction renderLocalNetworkStatus(', responseStart);
assert.ok(responseStart >= 0 && responseEnd > responseStart, 'No se encontró la respuesta manual de invitaciones.');
const responseSource = appSource.slice(responseStart, responseEnd);
assert.match(
  responseSource,
  /relatedInvitationsToRespond = invitation\?\.resourceType === PORTFOLIO_RESOURCE_TYPE && decision === 'accept'[\s\S]*\? \[\][\s\S]*: related/,
  'Aceptar el panel todavía responde en paralelo invitaciones hijas que el backend ya hereda y puede provocar 409.'
);
assert.match(responseSource, /for \(const item of relatedInvitationsToRespond\)/);

console.log('OK: la aceptación del panel reemplaza residuos remotos, reinicia recuperaciones estancadas y evita respuestas hijas concurrentes.');
