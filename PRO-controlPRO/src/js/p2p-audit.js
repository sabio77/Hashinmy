let auditEnabled = false;
const invitationFlows = new Map();
const completedFlows = new Set();
const uiMinimalFlows = new Set();
const uiCompleteFlows = new Set();

const PREFIX = '[P2P_AUDITORIA]';

function clean(value = '', max = 220) {
  return String(value ?? '').trim().slice(0, max);
}

function normalizeError(error = null) {
  if (!error) return null;
  return {
    name: clean(error.name || 'Error', 80),
    message: clean(error.message || String(error), 600),
    code: clean(error.code || '', 100),
    status: Math.max(0, Number(error.status || error.statusCode || 0)) || undefined,
    retryAfterSeconds: Math.max(0, Number(error.retryAfterSeconds || 0)) || undefined
  };
}

function safeValue(value, depth = 0, key = '') {
  if (depth > 4) return '[depth-limit]';
  if (value === null || value === undefined) return value;
  if (value instanceof Error) return normalizeError(value);
  if (typeof value === 'boolean' || typeof value === 'number') return value;
  if (typeof value === 'string') return clean(value, /message|error/i.test(key) ? 700 : 320);
  if (Array.isArray(value)) return value.slice(0, 50).map((item) => safeValue(item, depth + 1, key));
  if (typeof value === 'object') {
    const result = {};
    for (const [childKey, childValue] of Object.entries(value).slice(0, 70)) {
      if (/token|secret|credential|private|payload|cipher|keymaterial|envelope/i.test(childKey)) {
        result[childKey] = '[redacted]';
        continue;
      }
      result[childKey] = safeValue(childValue, depth + 1, childKey);
    }
    return result;
  }
  return clean(String(value), 300);
}

function resolveTraceId(context = {}) {
  return clean(context.invitationId || context.traceId || context.requestId || context.clientRequestId || '', 180);
}

export function configureP2PAudit(enabled, context = {}) {
  const next = enabled === true;
  const changed = next !== auditEnabled;
  auditEnabled = next;
  if (auditEnabled && changed) {
    auditP2P('frontend.audit.enabled', { ...context, enabled: true });
  }
  return auditEnabled;
}

export function isP2PAuditEnabled() {
  return auditEnabled;
}

export function auditP2P(stage = '', context = {}, level = 'info') {
  if (!auditEnabled) return false;
  const cleanStage = clean(stage || 'evento', 120).replace(/[^a-zA-Z0-9._:-]/g, '_');
  const record = safeValue({
    at: new Date().toISOString(),
    stage: cleanStage,
    traceId: resolveTraceId(context),
    ...context
  });
  const method = level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'info';
  console[method](`${PREFIX}[${cleanStage}]`, record);
  return true;
}

export function auditP2PError(stage = '', error = null, context = {}) {
  return auditP2P(stage, { ...context, error: normalizeError(error) }, 'error');
}

export function trackInvitationRecovery(invitationId = '', spaceIds = [], context = {}) {
  const cleanInvitationId = clean(invitationId, 180);
  if (!cleanInvitationId) return null;
  const expected = Array.from(new Set((Array.isArray(spaceIds) ? spaceIds : [])
    .map((spaceId) => clean(spaceId, 140))
    .filter(Boolean)));
  const previous = invitationFlows.get(cleanInvitationId) || null;
  const existing = previous || {
    invitationId: cleanInvitationId,
    expected: new Set(),
    recovered: new Set(),
    context: {},
    startedAt: new Date().toISOString()
  };
  const addedSpaceIds = expected.filter((spaceId) => !existing.expected.has(spaceId));
  expected.forEach((spaceId) => existing.expected.add(spaceId));
  existing.context = { ...existing.context, ...safeValue(context || {}) };
  invitationFlows.set(cleanInvitationId, existing);
  if (!previous || addedSpaceIds.length) {
    completedFlows.delete(cleanInvitationId);
    uiMinimalFlows.delete(cleanInvitationId);
    uiCompleteFlows.delete(cleanInvitationId);
    auditP2P('frontend.recovery.tracked', {
      invitationId: cleanInvitationId,
      expectedSpaceIds: [...existing.expected],
      expectedCount: existing.expected.size,
      addedSpaceIds,
      ...existing.context
    });
  }
  return existing;
}

function emitUiCompleteIfReady(invitationId, flow, context = {}) {
  if (!flow?.ui || !completedFlows.has(invitationId) || uiCompleteFlows.has(invitationId)) return false;
  const portfolioSpaceId = clean(flow.context?.portfolioSpaceId, 140);
  const expectedProjects = [...flow.expected].filter((spaceId) => spaceId !== portfolioSpaceId);
  const loaded = flow.ui.loaded || new Set();
  if (!expectedProjects.every((spaceId) => loaded.has(spaceId))) return false;
  uiCompleteFlows.add(invitationId);
  auditP2P('frontend.ui.panel-rendered-complete', {
    invitationId,
    portfolioSpaceId,
    expectedProjectCount: expectedProjects.length,
    recognizedProjectCount: flow.ui.recognized?.size || 0,
    loadedProjectCount: loaded.size,
    visibleProjectCount: flow.ui.visible?.size || 0,
    panelType: flow.ui.panelType || '',
    ...flow.context,
    ...context
  });
  return true;
}

export function auditPanelRender(panelSpaceId = '', recognizedSpaceIds = [], loadedSpaceIds = [], context = {}) {
  if (!auditEnabled) return [];
  const cleanPanelSpaceId = clean(panelSpaceId, 140);
  const recognized = new Set((Array.isArray(recognizedSpaceIds) ? recognizedSpaceIds : []).map((spaceId) => clean(spaceId, 140)).filter(Boolean));
  const loaded = new Set((Array.isArray(loadedSpaceIds) ? loadedSpaceIds : []).map((spaceId) => clean(spaceId, 140)).filter(Boolean));
  const visible = new Set((Array.isArray(context.visibleSpaceIds) ? context.visibleSpaceIds : []).map((spaceId) => clean(spaceId, 140)).filter(Boolean));
  const matched = [];
  for (const [invitationId, flow] of invitationFlows.entries()) {
    const portfolioSpaceId = clean(flow.context?.portfolioSpaceId, 140);
    const expectedProjects = [...flow.expected].filter((spaceId) => spaceId !== portfolioSpaceId);
    const panelMatches = portfolioSpaceId
      ? cleanPanelSpaceId === portfolioSpaceId
      : expectedProjects.length > 0 && expectedProjects.some((spaceId) => recognized.has(spaceId));
    if (!panelMatches) continue;
    const allRecognized = expectedProjects.every((spaceId) => recognized.has(spaceId));
    flow.ui = {
      panelSpaceId: cleanPanelSpaceId,
      panelType: clean(context.panelType, 80),
      recognized,
      loaded,
      visible
    };
    if (allRecognized && !uiMinimalFlows.has(invitationId)) {
      uiMinimalFlows.add(invitationId);
      auditP2P('frontend.ui.project-cards-recognized', {
        invitationId,
        portfolioSpaceId,
        expectedProjectCount: expectedProjects.length,
        recognizedProjectCount: recognized.size,
        loadedProjectCount: loaded.size,
        visibleProjectCount: visible.size,
        panelType: flow.ui.panelType,
        ...flow.context
      });
    }
    emitUiCompleteIfReady(invitationId, flow, { source: 'dashboard-render' });
    matched.push(invitationId);
  }
  return matched;
}

export function markInvitationSpaceRecovered(spaceId = '', context = {}) {
  const cleanSpaceId = clean(spaceId, 140);
  if (!cleanSpaceId) return [];
  const completed = [];
  for (const [invitationId, flow] of invitationFlows.entries()) {
    if (!flow.expected.has(cleanSpaceId)) continue;
    const wasRecovered = flow.recovered.has(cleanSpaceId);
    flow.recovered.add(cleanSpaceId);
    const pending = [...flow.expected].filter((candidate) => !flow.recovered.has(candidate));
    if (!wasRecovered) auditP2P('frontend.recovery.space-ready', {
      invitationId,
      spaceId: cleanSpaceId,
      recoveredCount: flow.recovered.size,
      expectedCount: flow.expected.size,
      pendingSpaceIds: pending,
      ...flow.context,
      ...context
    });
    if (!pending.length && !completedFlows.has(invitationId)) {
      completedFlows.add(invitationId);
      completed.push(invitationId);
      auditP2P('frontend.panel.ready', {
        invitationId,
        recoveredSpaceIds: [...flow.recovered],
        expectedCount: flow.expected.size,
        startedAt: flow.startedAt,
        completedAt: new Date().toISOString(),
        ...flow.context,
        ...context
      });
      emitUiCompleteIfReady(invitationId, flow, { source: context.source || 'replica-complete' });
    }
  }
  return completed;
}

export function reconcileInvitationRecoveryFromState(state = {}) {
  const received = Array.isArray(state?.invitations?.received) ? state.invitations.received : [];
  const spaces = Array.isArray(state?.spaces) ? state.spaces : [];
  const heads = state?.portfolioHeads && typeof state.portfolioHeads === 'object' ? state.portfolioHeads : {};
  const spacesById = new Map(spaces.map((space) => [clean(space?.spaceId, 140), space]).filter(([spaceId]) => Boolean(spaceId)));

  for (const invitation of received) {
    if (clean(invitation?.status, 30).toLowerCase() !== 'accepted') continue;
    const invitationId = clean(invitation?.invitationId, 180);
    const rootSpaceId = clean(invitation?.spaceId, 140);
    if (!invitationId || !rootSpaceId) continue;
    const portfolio = clean(invitation?.resourceType, 80).toLowerCase() === 'admin.portfolio'
      && clean(invitation?.accessScope, 30).toLowerCase() === 'portfolio';
    const head = portfolio ? heads[rootSpaceId] : null;
    const expected = Array.from(new Set([
      rootSpaceId,
      ...(portfolio && Array.isArray(head?.managedSpaceIds) ? head.managedSpaceIds.map((spaceId) => clean(spaceId, 140)) : [])
    ].filter(Boolean)));
    const flow = trackInvitationRecovery(invitationId, expected, {
      portfolioSpaceId: portfolio ? rootSpaceId : '',
      resourceType: clean(invitation?.resourceType, 80),
      expectedProjectCount: portfolio ? Math.max(0, Number(head?.projectCount || expected.length - 1)) : 0,
      replicaRevisionCode: clean(head?.replicaRevisionCode, 180)
    });
    if (!flow) continue;
    for (const spaceId of expected) {
      const space = spacesById.get(spaceId);
      if (!space) continue;
      const pending = space.authorizationState === 'unconfirmed'
        && space.authorizationPendingReason === 'replica_recovery';
      if (!pending) markInvitationSpaceRecovered(spaceId, { source: 'bootstrap-state-reconcile' });
    }
  }
}
