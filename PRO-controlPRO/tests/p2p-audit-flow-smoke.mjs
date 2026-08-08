import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const source = await fs.readFile(new URL('../src/js/p2p-audit.js', import.meta.url), 'utf8');
const moduleUrl = `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const audit = await import(moduleUrl);

const entries = [];
const originalInfo = console.info;
const originalWarn = console.warn;
const originalError = console.error;
console.info = (...args) => entries.push({ level: 'info', args });
console.warn = (...args) => entries.push({ level: 'warn', args });
console.error = (...args) => entries.push({ level: 'error', args });

try {
  audit.configureP2PAudit(true, { userId: 'user_1', deviceId: 'device_1' });
  audit.trackInvitationRecovery('inv_1', ['panel_1', 'project_1'], {
    portfolioSpaceId: 'panel_1',
    expectedProjectCount: 1
  });
  audit.auditPanelRender('panel_1', ['project_1'], ['project_1'], {
    panelType: 'portfolio',
    visibleSpaceIds: ['project_1']
  });
  assert(entries.some((entry) => String(entry.args[0]).includes('frontend.ui.project-cards-recognized')), 'Debe registrar que la UI ya reconoció las cards mínimas del panel.');
  assert(!entries.some((entry) => String(entry.args[0]).includes('frontend.ui.panel-rendered-complete')), 'La UI no debe anunciar carga completa antes de confirmar todas las réplicas.');
  audit.markInvitationSpaceRecovered('panel_1', { source: 'snapshot.complete' });
  assert(!entries.some((entry) => String(entry.args[0]).includes('frontend.panel.ready')), 'No debe cerrar mientras falte un proyecto.');
  audit.markInvitationSpaceRecovered('project_1', { source: 'snapshot.complete' });
  const readyAfterFirstCompletion = entries.filter((entry) => String(entry.args[0]).includes('frontend.panel.ready')).length;
  assert.equal(readyAfterFirstCompletion, 1, 'Debe registrar panel.ready exactamente una vez al completar todas las réplicas esperadas.');
  assert.equal(entries.filter((entry) => String(entry.args[0]).includes('frontend.ui.panel-rendered-complete')).length, 1, 'Debe cerrar también la auditoría de render cuando la UI ya tenía todas las cards cargadas.');
  audit.reconcileInvitationRecoveryFromState({
    invitations: { received: [{ invitationId: 'inv_1', status: 'accepted', spaceId: 'panel_1', resourceType: 'admin.portfolio', accessScope: 'portfolio' }] },
    spaces: [{ spaceId: 'panel_1', authorizationState: 'confirmed' }, { spaceId: 'project_1', authorizationState: 'confirmed' }],
    portfolioHeads: { panel_1: { managedSpaceIds: ['project_1'], projectCount: 1, replicaRevisionCode: 'rev_1' } }
  });
  assert.equal(
    entries.filter((entry) => String(entry.args[0]).includes('frontend.panel.ready')).length,
    1,
    'Un bootstrap repetido no debe volver a anunciar como recién completado un panel ya listo.'
  );

  const beforeDisabled = entries.length;
  audit.configureP2PAudit(false);
  audit.auditP2P('frontend.no-debe-imprimirse', { invitationId: 'inv_2' });
  assert.equal(entries.length, beforeDisabled, 'La auditoría desactivada no debe imprimir nuevos eventos.');
} finally {
  console.info = originalInfo;
  console.warn = originalWarn;
  console.error = originalError;
}

console.log('OK: auditoría frontend correlaciona invitación, réplicas y cierre completo del panel.');
