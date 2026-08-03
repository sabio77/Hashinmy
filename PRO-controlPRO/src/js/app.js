import { P2P_APPLICATION_ID, scopedStorageKey } from './application-scope.js';
import {
  apiGet,
  apiPost,
  clearSessionToken,
  createSessionChangedError,
  getSessionToken,
  isSessionChangedError,
  setSessionToken,
  subscribeSessionTokenChanges
} from './api.js';
import { getFirebaseWebConfigError, signInWithGooglePopup, signOutFirebaseSession } from './firebase-auth.js';
import { semillaP2P } from './p2p-client.js';
import { canRetireDevice, compactDeviceId, normalizeDeviceList } from './device-management.js';
import {
  listPendingSpaceCreations,
  removePendingSpaceCreation,
  savePendingSpaceCreation
} from './p2p-storage.js';
import {
  completeSpaceCreationIntent,
  normalizeSpaceCreationIntent
} from './p2p-space-creation-intent.js';
import {
  clearInvitationIntentFromUrl,
  findPendingInvitation,
  invitationIntentFromServiceWorkerMessage,
  normalizeInvitationIntentId,
  readInvitationIntent,
  resolveCanonicalInvitationDecision
} from './p2p-invitation-intent.js';
import {
  inspectStorageDurability,
  requestPersistentStorage,
  formatStorageBytes
} from './p2p-durability.js';
import {
  PROJECT_ENTITY_TYPE,
  PROJECT_ENTITY_ID,
  PURCHASE_ENTITY_TYPE,
  INCOME_ENTITY_TYPE,
  PROJECTION_ENTITY_TYPE,
  PROJECTION_LINK_ENTITY_TYPE,
  ADMIN_PROJECT_PERMISSION_PROFILE,
  absoluteMoneyValue,
  localDateValue,
  buildConcurrentSafePatch,
  calculateProjectMetrics,
  createLocalId,
  entitiesByType,
  hasPermission,
  normalizeCollaborationPermissions,
  normalizeIncomeInput,
  normalizeProjectInput,
  normalizeProjectionInput,
  normalizeProjectionLinkInput,
  normalizePurchaseInput,
  projectRecord,
  resolveProjectionActuals,
  resolvePurchaseProjectionLinks,
  sumMoneyValues
} from './project-domain.js';

const CACHED_USER_STORAGE_KEY = scopedStorageKey('semilla_authenticated_user');
const state = {
  firebaseWebConfig: null,
  user: null,
  busy: false,
  p2pBusy: false,
  selectedSpaceId: '',
  renderSequence: 0,
  p2pState: { spaces: [], invitations: { received: [], sent: [] }, devices: [], replicaHealth: {} },
  projects: new Map(),
  pendingProjectCreation: null,
  editingRecord: null,
  pendingAccessAction: null,
  pendingDeviceRetirement: null,
  storageDurability: null,
  storageRequestPromise: null,
  concurrentConflictOperations: new Map(),
  sessionTransitionSequence: 0,
  pendingInvitationId: readInvitationIntent(window.location),
  invitationRefreshSequence: 0
};

let externalSessionQueue = Promise.resolve();

const byId = (id) => document.getElementById(id);
const elements = {
  authCard: byId('auth-card'), workspace: byId('app-workspace'), loginButton: byId('google-login-button'), logoutButton: byId('logout-button'),
  authStatus: byId('auth-status'), userIdentity: byId('user-identity'), connectionStatus: byId('p2p-connection-status'),
  storageDurabilityBanner: byId('storage-durability-banner'), storageDurabilityMessage: byId('storage-durability-message'), protectStorageButton: byId('protect-storage-button'),
  enablePushButton: byId('enable-push-button'), invitationsButton: byId('invitations-button'), invitationCount: byId('invitation-count'), invitationList: byId('invitation-list'),
  devicesButton: byId('devices-button'), devicesDialog: byId('devices-dialog'), deviceList: byId('device-list'), deviceStatus: byId('device-status'), deviceConfirmPanel: byId('device-confirm-panel'), deviceConfirmMessage: byId('device-confirm-message'), deviceConfirmButton: byId('device-confirm-button'), deviceConfirmCancel: byId('device-confirm-cancel'),
  localNetworkButton: byId('local-network-button'), localNetworkDialog: byId('local-network-dialog'), localNetworkState: byId('local-network-state'), localNetworkInput: byId('local-network-input'), localNetworkOutput: byId('local-network-output'), localNetworkCreateOffer: byId('local-network-create-offer'), localNetworkAcceptOffer: byId('local-network-accept-offer'), localNetworkCompleteAnswer: byId('local-network-complete-answer'), localNetworkCopy: byId('local-network-copy'), localNetworkPeers: byId('local-network-peers'), localNetworkStatus: byId('local-network-status'),
  dashboardView: byId('dashboard-view'), projectView: byId('project-view'), dashboardStatus: byId('dashboard-status'), projectStatus: byId('project-status'),
  portfolioMetrics: byId('portfolio-metrics'), projectList: byId('project-list'), newProjectButton: byId('new-project-button'), backButton: byId('back-to-dashboard-button'),
  projectName: byId('project-name'), projectDescription: byId('project-description'), projectAddress: byId('project-address'), projectMemberSummary: byId('project-member-summary'), projectReplicaHealth: byId('project-replica-health'),
  projectMetrics: byId('project-metrics'), budgetProgressValue: byId('budget-progress-value'), budgetProgressLabel: byId('budget-progress-label'),
  inviteCollaboratorButton: byId('invite-collaborator-button'), manageAccessButton: byId('manage-access-button'), editProjectButton: byId('edit-project-button'), addPurchaseButton: byId('add-purchase-button'), addIncomeButton: byId('add-income-button'), addProjectionButton: byId('add-projection-button'),
  purchaseList: byId('purchase-list'), projectionList: byId('projection-list'), incomeList: byId('income-list'), purchaseCount: byId('purchase-count'), projectionCount: byId('projection-count'), incomeCount: byId('income-count'),
  projectDialog: byId('project-dialog'), projectForm: byId('project-form'), projectFormMode: byId('project-form-mode'), projectDialogTitle: byId('project-dialog-title'), projectNameInput: byId('project-name-input'), projectDescriptionInput: byId('project-description-input'), projectAddressInput: byId('project-address-input'), projectBudgetInput: byId('project-budget-input'), projectFormStatus: byId('project-form-status'), projectSubmitButton: byId('project-submit-button'),
  recordDialog: byId('record-dialog'), recordForm: byId('record-form'), recordTypeInput: byId('record-type-input'), recordDialogEyebrow: byId('record-dialog-eyebrow'), recordDialogTitle: byId('record-dialog-title'), recordDescriptionInput: byId('record-description-input'), recordInvoiceInput: byId('record-invoice-input'), recordAmountInput: byId('record-amount-input'), recordDateInput: byId('record-date-input'), recordProjectionInput: byId('record-projection-input'), invoiceField: byId('invoice-field'), projectionLinkField: byId('projection-link-field'), recordDateLabel: byId('record-date-label'), recordAmountLabel: byId('record-amount-label'), recordFormStatus: byId('record-form-status'), recordSubmitButton: byId('record-submit-button'),
  inviteDialog: byId('invite-dialog'), inviteForm: byId('invite-form'), inviteEmailInput: byId('invite-email-input'), inviteStatus: byId('invite-status'), inviteSubmitButton: byId('invite-submit-button'), invitationsDialog: byId('invitations-dialog'),
  accessDialog: byId('access-dialog'), accessMemberList: byId('access-member-list'), accessStatus: byId('access-status'), accessOwnerActions: byId('access-owner-actions'), deleteProjectButton: byId('delete-project-button'), accessConfirmPanel: byId('access-confirm-panel'), accessConfirmMessage: byId('access-confirm-message'), accessConfirmButton: byId('access-confirm-button'), accessConfirmCancel: byId('access-confirm-cancel')
};

function t(key, fallback) { return window.AppI18n?.t?.(key, fallback) || fallback; }
function setStatus(element, message = '', status = '') { if (!element) return; element.textContent = message; status ? element.dataset.state = status : delete element.dataset.state; }
function getCachedUser() { try { const value = JSON.parse(localStorage.getItem(CACHED_USER_STORAGE_KEY) || 'null'); return value?.userId ? value : null; } catch { return null; } }
function setCachedUser(user = null) { try { user?.userId ? localStorage.setItem(CACHED_USER_STORAGE_KEY, JSON.stringify({ userId: user.userId, email: user.email || '', displayName: user.displayName || '', photoUrl: user.photoUrl || '' })) : localStorage.removeItem(CACHED_USER_STORAGE_KEY); } catch {} }
function money(amount = 0) { const exactAmount = typeof amount === 'bigint' ? amount : Number(amount || 0); return new Intl.NumberFormat(document.documentElement.lang || 'es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(exactAmount); }
function shortDate(value = '') { const date = value ? new Date(value.length <= 10 ? `${value}T12:00:00` : value) : null; return date && Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat(document.documentElement.lang || 'es-CO', { dateStyle: 'medium' }).format(date) : ''; }
function shortDateTime(value = '') { const date = value ? new Date(value) : null; return date && Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat(document.documentElement.lang || 'es-CO', { dateStyle: 'medium', timeStyle: 'short' }).format(date) : ''; }
function openDialog(dialog) { if (!dialog) return; if (typeof dialog.showModal === 'function') dialog.showModal(); else dialog.setAttribute('open', ''); }
function closeDialog(dialog) { if (!dialog) return; if (typeof dialog.close === 'function') dialog.close(); else dialog.removeAttribute('open'); }
function selectedProjectData() { return state.projects.get(state.selectedSpaceId) || null; }
function selectedSpace() { return state.p2pState.spaces.find((space) => space.spaceId === state.selectedSpaceId) || null; }
function isAuthorizationUnconfirmed(space = null) { return space?.authorizationState === 'unconfirmed'; }
function isReplicaRecoveryPending(space = null) { return isAuthorizationUnconfirmed(space) && space?.authorizationPendingReason === 'replica_recovery'; }
function isSelectedProjectOwner() {
  const space = selectedSpace();
  return Boolean(space && !isAuthorizationUnconfirmed(space) && state.user?.userId && space.ownerUserId === state.user.userId);
}
function userCan(permission) { const space = selectedSpace(); return Boolean(space && !isAuthorizationUnconfirmed(space) && state.user && hasPermission(space, state.user.userId, permission)); }
function replicaHealthForSpace(spaceId = '') {
  const cleanSpaceId = String(spaceId || '').trim();
  const health = state.p2pState.replicaHealth?.[cleanSpaceId];
  return health && typeof health === 'object' ? health : { spaceId: cleanSpaceId, state: 'unknown', registeredReplicas: 0, confirmedReplicas: 0, pendingReplicas: 0 };
}
function replicaHealthPresentation(spaceId = '') {
  const health = replicaHealthForSpace(spaceId);
  const stateName = ['healthy', 'degraded', 'single', 'unavailable', 'unknown'].includes(health.state) ? health.state : 'unknown';
  const confirmed = Math.max(0, Number(health.confirmedReplicas || 0));
  const registered = Math.max(0, Number(health.registeredReplicas || 0));
  const labels = {
    healthy: t('replicas.healthy', 'Réplicas al día'),
    degraded: t('replicas.degraded', 'Réplicas pendientes'),
    single: t('replicas.single', 'Una sola copia'),
    unavailable: t('replicas.unavailable', 'Sin copia confirmada'),
    unknown: t('replicas.unknown', 'Cobertura por confirmar')
  };
  const summary = t('replicas.summary', '{confirmed}/{registered} copias al día')
    .replace('{confirmed}', String(confirmed))
    .replace('{registered}', String(registered));
  const detail = t('replicas.detail', '{label}. {summary}. Los datos siguen almacenados únicamente en los dispositivos autorizados.')
    .replace('{label}', labels[stateName])
    .replace('{summary}', summary);
  return { health, state: stateName, label: labels[stateName], summary, detail };
}
function replicaHealthBadge(spaceId = '', compact = false) {
  const presentation = replicaHealthPresentation(spaceId);
  const badge = document.createElement('span');
  badge.className = 'replica-health-badge';
  badge.dataset.state = presentation.state;
  badge.textContent = compact ? presentation.summary : `${presentation.label} · ${presentation.summary}`;
  badge.title = presentation.detail;
  badge.setAttribute('aria-label', presentation.detail);
  return badge;
}
function concurrentConflictMessage(type = 'patch') {
  if (type === 'reference-required') {
    return t('p2p.referenceRequirementRejected', 'El vínculo no se aplicó porque la proyección fue eliminada o dejó de estar disponible. La compra se conservó sin esa relación.');
  }
  if (type === 'reference') {
    return t('p2p.referenceDeletePreserved', 'La proyección se conservó porque ya existe una compra real vinculada. Desvincula o elimina esa compra antes de borrar la proyección.');
  }
  if (type === 'delete') {
    return t('p2p.concurrentDeletePreserved', 'Otro colaborador modificó este registro antes de la eliminación. El registro actualizado se conservó para evitar pérdida de información.');
  }
  return t('p2p.concurrentChangesPreserved', 'Otro colaborador cambió el mismo registro. Se conservaron sus campos y se aplicaron únicamente tus cambios no conflictivos.');
}
function operationIdFromPublishResult(result = {}) { return String(result?.event?.operation?.operationId || '').trim(); }
function setOperationSavedStatus(result = {}, message = '') {
  const operationId = operationIdFromPublishResult(result);
  const conflictType = operationId ? state.concurrentConflictOperations.get(operationId) : '';
  if (operationId && conflictType) {
    state.concurrentConflictOperations.delete(operationId);
    setStatus(elements.projectStatus, concurrentConflictMessage(conflictType), 'warning');
    return;
  }
  setStatus(elements.projectStatus, message, 'success');
}

function setBusy(value) { state.busy = Boolean(value); if (elements.loginButton) elements.loginButton.disabled = state.busy; if (elements.logoutButton) elements.logoutButton.disabled = state.busy; }
function setP2PBusy(value) {
  state.p2pBusy = Boolean(value);
  [elements.projectSubmitButton, elements.recordSubmitButton, elements.inviteSubmitButton, elements.deleteProjectButton, elements.accessConfirmButton, elements.deviceConfirmButton].forEach((button) => { if (button) button.disabled = state.p2pBusy; });
  elements.accessMemberList?.querySelectorAll('button, input').forEach((control) => {
    control.disabled = state.p2pBusy || control.dataset.permissionLocked === 'true';
  });
  elements.deviceList?.querySelectorAll('button').forEach((control) => { control.disabled = state.p2pBusy || control.dataset.deviceRetirable !== 'true'; });
}
function setConnectionState(connectionState = 'connecting') {
  const labels = { connected: t('p2p.connected', 'Sincronización activa'), 'local-connected': t('localNetwork.connectedShort', 'Conectado por Wi‑Fi'), disconnected: t('p2p.disconnected', 'Reconectando…'), connecting: t('p2p.connecting', 'Conectando…'), error: t('p2p.connectionError', 'Sin conexión al stream') };
  if (!elements.connectionStatus) return;
  elements.connectionStatus.dataset.state = connectionState;
  elements.connectionStatus.textContent = labels[connectionState] || labels.connecting;
}
function deviceDisplayName(device = {}) {
  return device.name || device.platform || t('devices.defaultName', 'Dispositivo');
}

function clearDeviceConfirmation() {
  state.pendingDeviceRetirement = null;
  elements.deviceConfirmPanel?.classList.add('hidden');
  if (elements.deviceConfirmMessage) elements.deviceConfirmMessage.textContent = '';
}

function renderDevices() {
  if (!elements.deviceList) return;
  const currentDeviceId = String(semillaP2P.deviceId || '').trim();
  const devices = normalizeDeviceList(state.p2pState.devices, currentDeviceId);
  const currentDeviceRegistered = devices.some((device) => device.current);
  elements.deviceList.replaceChildren();
  if (!devices.length) {
    const empty = document.createElement('p');
    empty.className = 'empty-state compact-empty-state';
    empty.textContent = t('devices.empty', 'No hay instalaciones registradas para mostrar.');
    elements.deviceList.append(empty);
    clearDeviceConfirmation();
    return;
  }

  for (const device of devices) {
    const item = document.createElement('article');
    item.className = 'device-item';
    item.dataset.current = device.current ? 'true' : 'false';

    const summary = document.createElement('div');
    summary.className = 'device-summary';
    const heading = document.createElement('div');
    heading.className = 'device-heading';
    const name = document.createElement('h3');
    name.textContent = deviceDisplayName(device);
    heading.append(name);
    if (device.current) {
      const badge = document.createElement('span');
      badge.className = 'device-current-badge';
      badge.textContent = t('devices.current', 'Este dispositivo');
      heading.append(badge);
    }
    const metadata = document.createElement('p');
    const parts = [device.platform, device.appMode].filter(Boolean);
    const lastSeen = shortDateTime(device.lastSeenAt || device.updatedAt);
    if (lastSeen) parts.push(t('devices.lastSeen', 'Última actividad: {date}').replace('{date}', lastSeen));
    metadata.textContent = parts.join(' · ') || t('devices.unknownDetails', 'Detalles no disponibles');
    const identifier = document.createElement('small');
    identifier.className = 'device-identifier';
    identifier.textContent = t('devices.idLabel', 'ID: {id}').replace('{id}', compactDeviceId(device.deviceId));
    identifier.title = device.deviceId;
    summary.append(heading, metadata, identifier);

    const action = document.createElement('button');
    action.type = 'button';
    action.className = 'button button-danger button-compact';
    action.dataset.deviceRetire = device.deviceId;
    const retirable = canRetireDevice(device, currentDeviceId, devices.length, currentDeviceRegistered);
    action.dataset.deviceCurrent = device.current ? 'true' : 'false';
    action.dataset.deviceRetirable = retirable ? 'true' : 'false';
    action.textContent = device.current ? t('devices.current', 'Este dispositivo') : t('devices.retire', 'Retirar');
    action.disabled = state.p2pBusy || !retirable;
    if (device.current) action.setAttribute('aria-disabled', 'true');
    item.append(summary, action);
    elements.deviceList.append(item);
  }

  if (state.pendingDeviceRetirement && !devices.some((device) => device.deviceId === state.pendingDeviceRetirement.deviceId)) {
    clearDeviceConfirmation();
  }
}

function openDeviceManagement() {
  clearDeviceConfirmation();
  setStatus(elements.deviceStatus, '');
  renderDevices();
  openDialog(elements.devicesDialog);
}

function prepareDeviceRetirement(deviceId = '') {
  if (state.p2pBusy) return;
  const currentDeviceId = String(semillaP2P.deviceId || '').trim();
  const devices = normalizeDeviceList(state.p2pState.devices, currentDeviceId);
  const currentDeviceRegistered = devices.some((candidate) => candidate.current);
  const device = devices.find((candidate) => candidate.deviceId === String(deviceId || '').trim());
  if (!device || !canRetireDevice(device, currentDeviceId, devices.length, currentDeviceRegistered)) {
    setStatus(elements.deviceStatus, t('devices.noAlternative', 'Esta instalación no puede retirarse desde el dispositivo actual.'), 'warning');
    return;
  }
  state.pendingDeviceRetirement = device;
  elements.deviceConfirmMessage.textContent = t('devices.retireConfirm', 'Se retirará {name}. Solo continúa si ya no necesitas los cambios locales que pudieran seguir pendientes en esa instalación.').replace('{name}', deviceDisplayName(device));
  elements.deviceConfirmPanel.classList.remove('hidden');
  elements.deviceConfirmButton?.focus();
}

async function executeDeviceRetirement() {
  const device = state.pendingDeviceRetirement;
  if (!device || state.p2pBusy) return;
  setP2PBusy(true);
  setStatus(elements.deviceStatus, t('devices.retiring', 'Comprobando réplicas y retirando el dispositivo…'));
  try {
    await semillaP2P.retireDevice(device.deviceId);
    applyP2PState(semillaP2P.bootstrapState);
    clearDeviceConfirmation();
    renderDevices();
    setStatus(elements.deviceStatus, t('devices.retireSuccess', 'El dispositivo fue retirado de forma segura.'), 'success');
  } catch (error) {
    setStatus(elements.deviceStatus, error?.message || t('devices.retireError', 'No se pudo retirar el dispositivo.'), 'error');
  } finally {
    setP2PBusy(false);
    renderDevices();
  }
}

function renderStorageDurability() {
  const health = state.storageDurability;
  const banner = elements.storageDurabilityBanner;
  if (!banner) return;
  const healthy = Boolean(health?.persisted) && !health?.lowSpace;
  banner.classList.toggle('hidden', !health || healthy);
  if (!health || healthy) return;

  let message = '';
  let visualState = 'warning';
  if (health.lowSpace) {
    const remaining = formatStorageBytes(health.remainingBytes, document.documentElement.lang || 'es-CO');
    message = t(
      'storage.lowSpace',
      'Queda poco espacio local. Libera almacenamiento antes de continuar para evitar que un cambio quede sin guardar.'
    ).replace('{remaining}', remaining || t('storage.unknownSpace', 'espacio limitado'));
    visualState = 'danger';
  } else if (health.status === 'best-effort') {
    message = t(
      'storage.bestEffort',
      'Este dispositivo todavía puede limpiar automáticamente la copia local. Protégela y mantén otra réplica sincronizada.'
    );
  } else {
    message = t(
      'storage.unsupported',
      'Este navegador no permite proteger la copia local contra limpieza automática. Mantén el proyecto sincronizado en otro dispositivo.'
    );
  }

  banner.dataset.state = visualState;
  if (elements.storageDurabilityMessage) elements.storageDurabilityMessage.textContent = message;
  if (elements.protectStorageButton) {
    const canRequest = Boolean(health.persistSupported) && !health.lowSpace;
    elements.protectStorageButton.classList.toggle('hidden', !canRequest);
    elements.protectStorageButton.disabled = Boolean(state.storageRequestPromise);
  }
}

async function refreshStorageDurability(options = {}) {
  const health = options.request === true
    ? await requestPersistentStorage()
    : await inspectStorageDurability();
  state.storageDurability = health;
  renderStorageDurability();

  if (options.announce === true) {
    if (health.persisted && !health.lowSpace) {
      setStatus(
        elements.dashboardStatus,
        t('storage.protected', 'La copia local quedó protegida contra limpieza automática del navegador.'),
        'success'
      );
    } else if (health.error) {
      setStatus(
        elements.dashboardStatus,
        t('storage.requestError', 'No fue posible comprobar la protección del almacenamiento local.'),
        'error'
      );
    } else if (!health.persistSupported) {
      setStatus(
        elements.dashboardStatus,
        t('storage.unsupportedShort', 'Este navegador no ofrece protección persistente; conserva otra réplica sincronizada.'),
        'error'
      );
    } else {
      setStatus(
        elements.dashboardStatus,
        t('storage.notGranted', 'El navegador no concedió protección persistente. La copia seguirá funcionando, pero puede limpiarse bajo presión de espacio.'),
        'error'
      );
    }
  }
  return health;
}

function requestStorageProtection(options = {}) {
  if (state.storageRequestPromise) return state.storageRequestPromise;
  const pending = refreshStorageDurability({ request: true, announce: options.announce === true })
    .catch((error) => {
      state.storageDurability = {
        supported: false,
        persistSupported: false,
        estimateSupported: false,
        persisted: false,
        lowSpace: false,
        status: 'unsupported',
        error
      };
      renderStorageDurability();
      if (options.announce === true) {
        setStatus(
          elements.dashboardStatus,
          t('storage.requestError', 'No fue posible comprobar la protección del almacenamiento local.'),
          'error'
        );
      }
      return state.storageDurability;
    })
    .finally(() => {
      if (state.storageRequestPromise === pending) state.storageRequestPromise = null;
      renderStorageDurability();
    });
  state.storageRequestPromise = pending;
  renderStorageDurability();
  return pending;
}
function resetUserScopedInterface() {
  state.renderSequence += 1;
  state.selectedSpaceId = '';
  state.p2pState = { spaces: [], invitations: { received: [], sent: [] }, devices: [], replicaHealth: {} };
  state.projects.clear();
  state.pendingProjectCreation = null;
  state.editingRecord = null;
  state.pendingAccessAction = null;
  state.pendingDeviceRetirement = null;
  state.concurrentConflictOperations.clear();
  state.invitationRefreshSequence += 1;
  state.storageDurability = null;
  state.storageRequestPromise = null;
  setP2PBusy(false);
  [elements.projectDialog, elements.recordDialog, elements.inviteDialog, elements.invitationsDialog, elements.devicesDialog, elements.accessDialog]
    .forEach((dialog) => closeDialog(dialog));
  elements.projectView?.classList.add('hidden');
  elements.dashboardView?.classList.remove('hidden');
  elements.storageDurabilityBanner?.classList.add('hidden');
  setStatus(elements.dashboardStatus, '');
  setStatus(elements.projectStatus, '');
  renderInvitations();
  renderDevices();
  renderDashboard();
}

function showAuth(message = '') {
  state.user = null;
  resetUserScopedInterface();
  elements.authCard?.classList.remove('hidden');
  elements.workspace?.classList.add('hidden');
  setStatus(elements.authStatus, message, message ? 'error' : '');
}

function showWorkspace(user = {}, options = {}) {
  state.user = user;
  if (options.persist !== false) setCachedUser(user);
  elements.authCard?.classList.add('hidden');
  elements.workspace?.classList.remove('hidden');
  elements.userIdentity.textContent = user.displayName || user.email || '';
  setStatus(elements.authStatus, '');
  setConnectionState('connecting');
  renderStorageDurability();
  window.AppAssetLoader?.hydrate(document);
}

function metricCard(label, value, tone = '') {
  const card = document.createElement('article'); card.className = 'metric-card'; if (tone) card.dataset.tone = tone;
  const caption = document.createElement('span'); caption.textContent = label;
  const number = document.createElement('strong'); number.textContent = value;
  card.append(caption, number); return card;
}

function resolvedProjectData(space, entities) {
  const project = projectRecord(space, entities);
  const rawPurchases = entitiesByType(entities, PURCHASE_ENTITY_TYPE);
  const incomes = entitiesByType(entities, INCOME_ENTITY_TYPE);
  const rawProjections = entitiesByType(entities, PROJECTION_ENTITY_TYPE);
  const projectionLinks = entitiesByType(entities, PROJECTION_LINK_ENTITY_TYPE);
  const strictProjectionLinks = space?.permissionProfile === ADMIN_PROJECT_PERMISSION_PROFILE;
  const purchases = resolvePurchaseProjectionLinks(rawPurchases, projectionLinks, { strictLinks: strictProjectionLinks });
  const projections = resolveProjectionActuals(rawProjections, rawPurchases, projectionLinks, { strictLinks: strictProjectionLinks });
  return {
    space,
    project,
    purchases,
    incomes,
    projections,
    projectionLinks,
    strictProjectionLinks,
    metrics: calculateProjectMetrics(project, purchases, incomes, projections)
  };
}

async function refreshProjects() {
  const renderSequence = ++state.renderSequence;
  const spaces = Array.isArray(state.p2pState.spaces) ? state.p2pState.spaces : [];
  const entries = await Promise.all(spaces.map(async (space) => {
    const entities = await semillaP2P.listEntities(space.spaceId).catch(() => []);
    return [space.spaceId, resolvedProjectData(space, entities)];
  }));
  if (renderSequence !== state.renderSequence) return;
  state.projects = new Map(entries);
  if (state.selectedSpaceId && !state.projects.has(state.selectedSpaceId)) showDashboard();
  renderDashboard();
  if (state.selectedSpaceId) renderProject();
}

function renderPortfolioMetrics() {
  elements.portfolioMetrics.replaceChildren();
  const projects = [...state.projects.values()];
  const totalCapital = sumMoneyValues(projects, (item) => item.metrics.totalCapital);
  const totalPurchases = sumMoneyValues(projects, (item) => item.metrics.totalPurchases);
  const available = sumMoneyValues(projects, (item) => item.metrics.availableCapital);
  elements.portfolioMetrics.append(
    metricCard(t('dashboard.totalProjects', 'Proyectos'), String(projects.length)),
    metricCard(t('dashboard.totalCapital', 'Capital total'), money(totalCapital)),
    metricCard(t('dashboard.totalExpenses', 'Gastos reales'), money(totalPurchases)),
    metricCard(t('dashboard.totalAvailable', 'Disponible'), money(available), available < 0 ? 'negative' : 'positive')
  );
}

function renderDashboard() {
  renderPortfolioMetrics();
  elements.projectList.replaceChildren();
  const projects = [...state.projects.values()].sort((a, b) => String(b.project.updatedAt || '').localeCompare(String(a.project.updatedAt || '')));
  if (!projects.length) {
    const empty = document.createElement('div'); empty.className = 'empty-state';
    empty.innerHTML = `<strong>${t('dashboard.emptyTitle', 'Aún no hay proyectos')}</strong><p>${t('dashboard.emptyDescription', 'Usa el botón + para crear el primero. Después podrás invitar participantes y registrar movimientos.')}</p>`;
    elements.projectList.append(empty); return;
  }
  for (const data of projects) {
    const card = document.createElement('button'); card.type = 'button'; card.className = 'project-card'; card.dataset.spaceId = data.space.spaceId;
    const authorizationUnconfirmed = isAuthorizationUnconfirmed(data.space);
    const replicaRecoveryPending = isReplicaRecoveryPending(data.space);
    if (authorizationUnconfirmed) card.dataset.authorization = 'unconfirmed';
    const header = document.createElement('div'); header.className = 'project-card-header';
    const titleWrap = document.createElement('div'); const title = document.createElement('h3'); title.textContent = data.project.name; const address = document.createElement('p'); address.textContent = data.project.address || t('project.noAddress', 'Sin dirección'); titleWrap.append(title, address);
    if (authorizationUnconfirmed) { const recovery = document.createElement('span'); recovery.className = 'authorization-badge'; recovery.textContent = replicaRecoveryPending ? t('p2p.replicaRecoveryBadge', 'Sincronizando') : t('p2p.authorizationUnconfirmedBadge', 'Copia local'); recovery.title = replicaRecoveryPending ? t('p2p.replicaRecovery', 'La invitación ya fue aceptada. Esta copia permanece en solo lectura hasta recibir y validar el estado compartido completo.') : t('p2p.authorizationUnconfirmed', 'La autorización no pudo confirmarse. La copia local se conserva en modo de solo lectura.'); titleWrap.append(recovery); }
    const cardSignals = document.createElement('div'); cardSignals.className = 'project-card-signals';
    cardSignals.append(replicaHealthBadge(data.space.spaceId, true));
    const members = document.createElement('span'); members.className = 'count-badge'; members.textContent = String(data.space.members?.length || 1); members.title = t('project.participants', 'Participantes'); cardSignals.append(members); header.append(titleWrap, cardSignals);
    const description = document.createElement('p'); description.textContent = data.project.description || t('project.noDescription', 'Sin descripción');
    const metrics = document.createElement('div'); metrics.className = 'project-card-metrics';
    metrics.innerHTML = `<div><span>${t('project.available', 'Disponible')}</span><strong>${money(data.metrics.availableCapital)}</strong></div><div><span>${t('project.expenses', 'Gastos')}</span><strong>${money(data.metrics.totalPurchases)}</strong></div>`;
    card.append(header, description, metrics); elements.projectList.append(card);
  }
}

function queueInvitationIntent(invitationId = '') {
  const normalized = normalizeInvitationIntentId(invitationId);
  if (!normalized) return false;
  state.pendingInvitationId = normalized;
  return true;
}

function revealPendingInvitationIntent() {
  const invitation = findPendingInvitation(
    state.p2pState.invitations?.received || [],
    state.pendingInvitationId
  );
  if (!invitation || !state.user) return false;

  if (!elements.invitationsDialog?.open) openDialog(elements.invitationsDialog);
  const acceptButton = [...elements.invitationList.querySelectorAll('button[data-invitation-id][data-decision="accept"]')]
    .find((button) => button.dataset.invitationId === invitation.invitationId);
  window.requestAnimationFrame(() => acceptButton?.focus({ preventScroll: true }));
  clearInvitationIntentFromUrl();
  state.pendingInvitationId = '';
  return true;
}

async function refreshInvitationIntent(invitationId = '') {
  if (!queueInvitationIntent(invitationId)) return false;
  if (revealPendingInvitationIntent()) return true;
  if (!state.user || !getSessionToken()) return false;

  const refreshSequence = ++state.invitationRefreshSequence;
  try {
    await semillaP2P.refreshBootstrap({ requestSnapshots: false });
    if (refreshSequence !== state.invitationRefreshSequence) return false;
    return revealPendingInvitationIntent();
  } catch (error) {
    if (!isSessionChangedError(error) && refreshSequence === state.invitationRefreshSequence) {
      setStatus(
        elements.dashboardStatus,
        error?.message || t('invite.refreshError', 'La invitación llegó, pero no se pudo actualizar la lista. Se reintentará al recuperar conexión.'),
        'error'
      );
    }
    return false;
  }
}

function renderInvitations() {
  const pending = (state.p2pState.invitations?.received || []).filter((invitation) => invitation.status === 'pending');
  elements.invitationCount.textContent = String(pending.length); elements.invitationCount.hidden = pending.length === 0; elements.invitationList.replaceChildren();
  if (!pending.length) { const empty = document.createElement('div'); empty.className = 'empty-state'; empty.textContent = t('invite.none', 'No tienes invitaciones pendientes.'); elements.invitationList.append(empty); return; }
  for (const invitation of pending) {
    const item = document.createElement('article'); item.className = 'invitation-item';
    const content = document.createElement('div'); const title = document.createElement('h3'); title.textContent = invitation.title || t('project.defaultName', 'Proyecto compartido'); const sender = document.createElement('p'); sender.textContent = invitation.inviter?.displayName || invitation.inviter?.email || t('invite.someone', 'Un colaborador'); content.append(title, sender);
    const actions = document.createElement('div'); actions.className = 'invitation-actions';
    for (const [decision, label, className] of [['reject', t('invite.reject', 'Rechazar'), 'button button-ghost button-compact'], ['accept', t('invite.accept', 'Aceptar'), 'button button-primary button-compact']]) { const button = document.createElement('button'); button.type = 'button'; button.className = className; button.dataset.invitationId = invitation.invitationId; button.dataset.decision = decision; button.textContent = label; actions.append(button); }
    item.append(content, actions); elements.invitationList.append(item);
  }
  revealPendingInvitationIntent();
}

function memberLabel(member = {}) { return member.profile?.displayName || member.profile?.email || (member.userId === state.user?.userId ? t('project.you', 'Tú') : t('project.participant', 'Participante')); }
function renderMembers(data) { elements.projectMemberSummary.replaceChildren(); for (const member of data.space.members || []) { const chip = document.createElement('span'); chip.className = 'member-chip'; chip.textContent = memberLabel(member); chip.title = (member.permissions || []).join(', '); elements.projectMemberSummary.append(chip); } }
function permissionSummary(member = {}) {
  if (member.role === 'owner') return t('access.fullControl', 'Control total');
  const labels = {
    read: t('invite.read', 'Lectura'),
    add: t('invite.add', 'Agregar y editar'),
    delete: t('invite.delete', 'Eliminar'),
    projection: t('invite.projection', 'Proyecciones'),
    invite: t('project.invite', 'Invitar'),
    write: t('access.legacyWrite', 'Edición heredada')
  };
  return (member.permissions || []).map((permission) => labels[permission] || permission).join(' · ') || t('access.readOnly', 'Solo lectura');
}
function accessActionButton(action, userId, label, dangerous = false) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = dangerous ? 'button button-danger button-compact' : 'button button-ghost button-compact';
  button.dataset.accessAction = action;
  button.dataset.userId = userId;
  button.textContent = label;
  button.disabled = state.p2pBusy;
  return button;
}
function memberHasPermission(member = {}, permission = '') {
  const permissions = Array.isArray(member.permissions) ? member.permissions : [];
  if (permission === 'read') return true;
  return permissions.includes(permission) || (permissions.includes('write') && ['add', 'delete', 'projection'].includes(permission));
}
function accessPermissionEditor(member = {}) {
  const form = document.createElement('form');
  form.className = 'access-permission-editor hidden';
  form.dataset.permissionUserId = member.userId;

  const heading = document.createElement('div');
  heading.className = 'access-permission-heading';
  const title = document.createElement('strong');
  title.textContent = t('access.permissionsTitle', 'Permisos del participante');
  const hint = document.createElement('small');
  hint.textContent = t('access.permissionsHint', 'Lectura permanece activa mientras el participante conserve acceso.');
  heading.append(title, hint);

  const options = document.createElement('div');
  options.className = 'access-permission-options';
  const permissionLabels = {
    read: t('invite.read', 'Lectura'),
    add: t('invite.add', 'Agregar'),
    delete: t('invite.delete', 'Eliminar'),
    projection: t('invite.projection', 'Proyecciones')
  };
  for (const permission of ['read', 'add', 'delete', 'projection']) {
    const label = document.createElement('label');
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.name = 'permissions';
    checkbox.value = permission;
    checkbox.checked = memberHasPermission(member, permission);
    if (permission === 'read') {
      checkbox.disabled = true;
      checkbox.dataset.permissionLocked = 'true';
    }
    const text = document.createElement('span');
    text.textContent = permissionLabels[permission];
    label.append(checkbox, text);
    options.append(label);
  }

  const actions = document.createElement('div');
  actions.className = 'access-permission-actions';
  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.className = 'button button-ghost button-compact';
  cancel.dataset.permissionCancel = member.userId;
  cancel.textContent = t('access.cancelPermissions', 'Cancelar');
  const submit = document.createElement('button');
  submit.type = 'submit';
  submit.className = 'button button-primary button-compact';
  submit.textContent = t('access.savePermissions', 'Guardar permisos');
  actions.append(cancel, submit);
  form.append(heading, options, actions);
  return form;
}
function togglePermissionEditor(userId = '', forceOpen = null) {
  if (!elements.accessMemberList || state.p2pBusy) return;
  const cleanUserId = String(userId || '');
  const target = Array.from(elements.accessMemberList.querySelectorAll('form[data-permission-user-id]'))
    .find((editor) => editor.dataset.permissionUserId === cleanUserId);
  if (!target) return;
  const shouldOpen = forceOpen === null ? target.classList.contains('hidden') : Boolean(forceOpen);
  elements.accessMemberList.querySelectorAll('.access-permission-editor').forEach((editor) => editor.classList.add('hidden'));
  target.classList.toggle('hidden', !shouldOpen);
  if (shouldOpen) target.querySelector('input:not(:disabled)')?.focus();
}
async function submitPermissionUpdate(event) {
  event.preventDefault();
  const form = event.target.closest('form[data-permission-user-id]');
  const data = selectedProjectData();
  const targetUserId = String(form?.dataset.permissionUserId || '').trim();
  if (!data || !targetUserId || state.p2pBusy) return;
  const permissions = ['read', ...Array.from(form.querySelectorAll('input[name="permissions"]:checked:not([value="read"])')).map((input) => input.value)];
  setP2PBusy(true);
  setStatus(elements.accessStatus, t('access.permissionsSaving', 'Guardando permisos…'));
  try {
    const result = await semillaP2P.updatePermissions(data.space.spaceId, targetUserId, permissions);
    applyP2PState(semillaP2P.bootstrapState);
    await refreshProjects();
    renderProject();
    renderAccessManagement();
    setStatus(
      elements.accessStatus,
      result?.unchanged
        ? t('access.permissionsUnchanged', 'Los permisos ya estaban configurados de esa forma.')
        : t('access.permissionsUpdated', 'Los permisos se actualizaron en todos los dispositivos.'),
      'success'
    );
  } catch (error) {
    setStatus(elements.accessStatus, error?.message || t('access.permissionsError', 'No se pudieron actualizar los permisos.'), 'error');
  } finally {
    setP2PBusy(false);
    renderAccessManagement();
  }
}

function clearAccessConfirmation() {
  state.pendingAccessAction = null;
  elements.accessConfirmPanel?.classList.add('hidden');
  if (elements.accessConfirmMessage) elements.accessConfirmMessage.textContent = '';
  if (elements.accessConfirmButton) {
    elements.accessConfirmButton.classList.add('button-danger');
    elements.accessConfirmButton.classList.remove('button-primary');
  }
}
function renderAccessManagement() {
  const data = selectedProjectData();
  if (!elements.accessMemberList) return;
  elements.accessMemberList.replaceChildren();
  elements.accessOwnerActions?.classList.add('hidden');
  if (!data || !state.user) return;
  const isOwner = data.space.ownerUserId === state.user.userId;
  elements.accessOwnerActions?.classList.toggle('hidden', !isOwner || isAuthorizationUnconfirmed(data.space));
  for (const member of data.space.members || []) {
    const item = document.createElement('article'); item.className = 'access-member';
    const content = document.createElement('div');
    const title = document.createElement('h3'); title.textContent = memberLabel(member);
    const role = document.createElement('span'); role.className = 'access-role'; role.textContent = member.role === 'owner' ? t('access.owner', 'Propietario') : t('access.member', 'Participante'); title.append(role);
    const profileEmail = String(member.profile?.email || '').trim();
    const details = document.createElement('p'); details.textContent = [profileEmail && profileEmail !== memberLabel(member) ? profileEmail : '', permissionSummary(member)].filter(Boolean).join(' · ');
    content.append(title, details);
    const actions = document.createElement('div'); actions.className = 'access-member-actions';
    if (isOwner && member.userId !== state.user.userId) {
      actions.append(
        accessActionButton('permissions', member.userId, t('access.editPermissions', 'Editar permisos')),
        accessActionButton('transfer', member.userId, t('access.transfer', 'Transferir propiedad')),
        accessActionButton('revoke', member.userId, t('access.revoke', 'Revocar acceso'), true)
      );
    } else if (!isOwner && member.userId === state.user.userId) {
      actions.append(accessActionButton('leave', member.userId, t('access.leave', 'Abandonar proyecto'), true));
    }
    item.append(content, actions);
    if (isOwner && member.userId !== state.user.userId) item.append(accessPermissionEditor(member));
    elements.accessMemberList.append(item);
  }
  if (!elements.accessMemberList.children.length) elements.accessMemberList.append(emptyRecord(t('access.noMembers', 'No hay participantes disponibles.')));
}
function openAccessManagement() {
  if (!selectedProjectData()) return;
  clearAccessConfirmation();
  setStatus(elements.accessStatus, '');
  renderAccessManagement();
  openDialog(elements.accessDialog);
}
function prepareAccessAction(action = '', userId = '') {
  const data = selectedProjectData();
  if (!data || state.p2pBusy) return;
  const isProjectDeletion = action === 'delete-project';
  const member = isProjectDeletion ? null : (data.space.members || []).find((candidate) => candidate?.userId === userId);
  if (!isProjectDeletion && !member) return;
  if (isProjectDeletion && (data.space.ownerUserId !== state.user?.userId || isAuthorizationUnconfirmed(data.space))) return;
  const label = member ? memberLabel(member) : data.project?.name || t('project.defaultName', 'Proyecto compartido');
  const messages = {
    revoke: t('access.revokeConfirm', '{name} perderá el acceso y las claves futuras del proyecto.').replace('{name}', label),
    transfer: t('access.transferConfirm', '{name} será el nuevo propietario. Debe haber abierto y sincronizado completamente este proyecto en al menos uno de sus dispositivos. Tú conservarás acceso como participante.').replace('{name}', label),
    leave: t('access.leaveConfirm', 'Perderás acceso y la copia local de este proyecto se eliminará de este dispositivo.'),
    'delete-project': t('access.deleteConfirm', 'Esta acción eliminará {name}, revocará el acceso y retirará las copias sincronizadas cuando cada dispositivo se conecte. No se puede deshacer.').replace('{name}', label)
  };
  if (!messages[action]) return;
  state.pendingAccessAction = { action, userId, spaceId: data.space.spaceId, label };
  elements.accessConfirmMessage.textContent = messages[action];
  elements.accessConfirmButton.textContent = action === 'transfer'
    ? t('access.transferConfirmButton', 'Transferir')
    : action === 'leave'
      ? t('access.leaveConfirmButton', 'Abandonar')
      : action === 'delete-project'
        ? t('access.deleteConfirmButton', 'Eliminar definitivamente')
        : t('access.revokeConfirmButton', 'Revocar');
  elements.accessConfirmButton.classList.toggle('button-danger', action !== 'transfer');
  elements.accessConfirmButton.classList.toggle('button-primary', action === 'transfer');
  elements.accessConfirmPanel.classList.remove('hidden');
  elements.accessConfirmButton.focus();
}
async function executeAccessAction() {
  const pending = state.pendingAccessAction;
  if (!pending || state.p2pBusy) return;
  setP2PBusy(true); setStatus(elements.accessStatus, t('access.processing', 'Aplicando cambio de acceso…'));
  try {
    let result = null;
    if (pending.action === 'revoke') result = await semillaP2P.revoke(pending.spaceId, pending.userId);
    if (pending.action === 'transfer') result = await semillaP2P.transfer(pending.spaceId, pending.userId);
    if (pending.action === 'leave') result = await semillaP2P.leave(pending.spaceId);
    if (pending.action === 'delete-project') result = await semillaP2P.deleteSpace(pending.spaceId);
    applyP2PState(semillaP2P.bootstrapState);
    clearAccessConfirmation();
    if (pending.action === 'leave' || pending.action === 'delete-project') {
      closeDialog(elements.accessDialog); showDashboard();
      setStatus(
        elements.dashboardStatus,
        pending.action === 'delete-project'
          ? t('access.deletedSuccess', 'El proyecto fue eliminado y se inició la retirada de sus copias sincronizadas.')
          : t('access.leftSuccess', 'Abandonaste el proyecto y su copia local fue retirada.'),
        'success'
      );
      return;
    }
    await refreshProjects(); renderProject(); renderAccessManagement();
    if (pending.action === 'revoke' && result?.keyRotation?.completed === false) {
      setStatus(elements.accessStatus, t('access.revokedRotationPending', 'El acceso fue revocado, pero la rotación de clave quedó pendiente. Reconecta este dispositivo antes de seguir agregando información sensible.'), 'warning');
    } else {
      const message = pending.action === 'transfer'
        ? t('access.transferredSuccess', 'La propiedad fue transferida correctamente.')
        : t('access.revokedSuccess', 'El acceso fue revocado y las claves del proyecto fueron renovadas.');
      setStatus(elements.accessStatus, message, 'success');
    }
  } catch (error) {
    const message = error?.code === 'P2P_OWNERSHIP_TARGET_REPLICA_REQUIRED'
      ? t('access.transferReplicaRequired', 'El nuevo propietario debe abrir y sincronizar completamente el proyecto en al menos uno de sus dispositivos antes de recibir la propiedad.')
      : error?.message || t('access.error', 'No se pudo completar el cambio de acceso.');
    setStatus(elements.accessStatus, message, 'error');
  } finally { setP2PBusy(false); renderAccessManagement(); }
}
function emptyRecord(text) { const empty = document.createElement('div'); empty.className = 'empty-state'; empty.textContent = text; return empty; }
function actionButton(action, type, id, label) { const button = document.createElement('button'); button.type = 'button'; button.className = 'mini-button'; button.dataset.recordAction = action; button.dataset.recordType = type; button.dataset.entityId = id; button.textContent = label; return button; }
function projectionVarianceLabel(record = {}) {
  if (record.varianceStatus === 'over') return `${t('projection.overBudget', 'Sobre presupuesto')}: ${money(absoluteMoneyValue(record.varianceAmount || 0))}`;
  if (record.varianceStatus === 'under') return `${t('projection.underBudget', 'Por debajo')}: ${money(absoluteMoneyValue(record.varianceAmount || 0))}`;
  if (record.varianceStatus === 'exact') return `${t('projection.onBudget', 'En presupuesto')}: ${money(0)}`;
  return '';
}
function renderRecordList(container, records, type) {
  container.replaceChildren(); if (!records.length) { container.append(emptyRecord(t('project.noRecords', 'Sin registros.'))); return; }
  for (const record of records) {
    const item = document.createElement('article'); item.className = 'record-item';
    const content = document.createElement('div'); const title = document.createElement('h4'); title.textContent = record.description || t('record.untitled', 'Sin descripción'); const detail = document.createElement('p');
    if (type === 'purchase') detail.textContent = [record.invoiceNumber ? `${t('record.invoiceShort', 'Factura')}: ${record.invoiceNumber}` : '', shortDate(record.purchasedAt)].filter(Boolean).join(' · ');
    if (type === 'income') detail.textContent = shortDate(record.receivedAt);
    if (type === 'projection') detail.textContent = record.status === 'completed' ? t('projection.completed', 'Compra realizada') : [t('projection.pending', 'Pendiente'), shortDate(record.expectedAt)].filter(Boolean).join(' · ');
    content.append(title, detail);
    const canEdit = userCan(type === 'projection' ? 'projection' : 'add');
    const canDelete = userCan('delete') && (type !== 'projection' || userCan('projection'));
    if (canEdit || canDelete) {
      const actions = document.createElement('div'); actions.className = 'record-actions';
      if (canEdit) actions.append(actionButton('edit', type, record.id, t('common.edit', 'Editar')));
      if (canDelete) {
        const deleteButton = actionButton('delete', type, record.id, t('common.delete', 'Eliminar'));
        if (type === 'projection' && (record.actualPurchaseIds || []).length) {
          deleteButton.disabled = true;
          deleteButton.title = t('projection.deleteLinkedHint', 'Esta proyección conserva compras reales vinculadas.');
        }
        actions.append(deleteButton);
      }
      content.append(actions);
    }
    const amount = document.createElement('div'); amount.className = 'record-amount';
    if (type === 'projection') {
      amount.textContent = money(record.projectedAmount);
      const actual = document.createElement('small');
      actual.textContent = record.status === 'completed' ? `${t('projection.real', 'Real')}: ${money(record.actualAmount)}` : t('projection.estimated', 'Estimado');
      amount.append(actual);
      const varianceLabel = projectionVarianceLabel(record);
      if (varianceLabel) {
        const variance = document.createElement('span');
        variance.className = `record-variance ${record.varianceStatus === 'over' ? 'negative' : 'positive'}`;
        variance.textContent = varianceLabel;
        amount.append(variance);
      }
    }
    else amount.textContent = money(record.amount);
    item.append(content, amount); container.append(item);
  }
}

function renderProject() {
  const data = selectedProjectData(); if (!data) return;
  elements.projectName.textContent = data.project.name; elements.projectDescription.textContent = data.project.description || t('project.noDescription', 'Sin descripción'); elements.projectAddress.textContent = data.project.address || t('project.noAddress', 'Sin dirección');
  renderMembers(data);
  if (elements.projectReplicaHealth) {
    const presentation = replicaHealthPresentation(data.space.spaceId);
    elements.projectReplicaHealth.dataset.state = presentation.state;
    elements.projectReplicaHealth.textContent = `${presentation.label} · ${presentation.summary}`;
    elements.projectReplicaHealth.title = presentation.detail;
    elements.projectReplicaHealth.setAttribute('aria-label', presentation.detail);
  }
  elements.projectMetrics.replaceChildren();
  const varianceTone = data.metrics.projectionVariance > 0 ? 'negative' : data.metrics.projectionVariance < 0 ? 'positive' : '';
  elements.projectMetrics.append(
    metricCard(t('project.totalCapital', 'Capital total'), money(data.metrics.totalCapital)),
    metricCard(t('project.available', 'Disponible'), money(data.metrics.availableCapital), data.metrics.availableCapital < 0 ? 'negative' : 'positive'),
    metricCard(t('project.expenses', 'Gastos reales'), money(data.metrics.totalPurchases)),
    metricCard(t('project.pendingProjection', 'Proyección pendiente'), money(data.metrics.projectedPending)),
    metricCard(t('project.variance', 'Variación proyectado/real'), money(data.metrics.projectionVariance), varianceTone)
  );
  elements.budgetProgressValue.style.width = `${Math.min(100, data.metrics.budgetUsage)}%`;
  elements.budgetProgressLabel.textContent = `${data.metrics.budgetUsage.toFixed(1)}% ${t('project.capitalUsed', 'del capital utilizado')} · ${t('project.afterProjection', 'Disponible tras proyecciones')}: ${money(data.metrics.projectedAvailable)}`;
  elements.purchaseCount.textContent = String(data.purchases.length); elements.projectionCount.textContent = String(data.projections.length); elements.incomeCount.textContent = String(data.incomes.length);
  renderRecordList(elements.purchaseList, data.purchases, 'purchase'); renderRecordList(elements.projectionList, data.projections, 'projection'); renderRecordList(elements.incomeList, data.incomes, 'income');
  const authorizationUnconfirmed = isAuthorizationUnconfirmed(data.space);
  const replicaRecoveryPending = isReplicaRecoveryPending(data.space);
  elements.inviteCollaboratorButton.disabled = authorizationUnconfirmed || (!userCan('invite') && data.space.ownerUserId !== state.user?.userId);
  elements.manageAccessButton.disabled = authorizationUnconfirmed || !(data.space.members || []).some((member) => member.userId === state.user?.userId);
  elements.editProjectButton.disabled = !isSelectedProjectOwner(); elements.addPurchaseButton.disabled = !userCan('add'); elements.addIncomeButton.disabled = !userCan('add'); elements.addProjectionButton.disabled = !userCan('projection');
  if (authorizationUnconfirmed) setStatus(elements.projectStatus, replicaRecoveryPending ? t('p2p.replicaRecovery', 'La invitación ya fue aceptada. Esta copia permanece en solo lectura hasta recibir y validar el estado compartido completo.') : t('p2p.authorizationUnconfirmed', 'La copia local fue conservada porque el backend no confirmó la membresía ni emitió una revocación explícita. Puedes consultar la información, pero la edición y la sincronización quedan bloqueadas hasta recuperar la autorización.'), 'warning');
}

function showDashboard() { state.selectedSpaceId = ''; clearAccessConfirmation(); elements.projectView.classList.add('hidden'); elements.dashboardView.classList.remove('hidden'); setStatus(elements.projectStatus, ''); }
function openProject(spaceId) {
  if (!state.projects.has(spaceId)) return;
  state.selectedSpaceId = spaceId;
  elements.dashboardView.classList.add('hidden');
  elements.projectView.classList.remove('hidden');
  renderProject();
  semillaP2P.refreshReplicaHealth([spaceId]).catch(() => null);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function applyP2PState(nextState = {}) {
  state.p2pState = {
    spaces: Array.isArray(nextState.spaces) ? nextState.spaces : [],
    invitations: {
      received: Array.isArray(nextState.invitations?.received) ? nextState.invitations.received : [],
      sent: Array.isArray(nextState.invitations?.sent) ? nextState.invitations.sent : []
    },
    devices: Array.isArray(nextState.devices) ? nextState.devices : [],
    replicaHealth: nextState.replicaHealth && typeof nextState.replicaHealth === 'object' ? nextState.replicaHealth : {}
  };
  renderInvitations(); if (elements.devicesDialog?.open) renderDevices(); refreshProjects().catch((error) => setStatus(elements.dashboardStatus, error?.message || t('dashboard.loadError', 'No se pudieron cargar los proyectos.'), 'error'));
}

async function loadPublicConfig() { if (state.firebaseWebConfig) return state.firebaseWebConfig; const data = await apiGet('/api/config'); if (String(data?.approvedApplication || '') !== P2P_APPLICATION_ID) { console.error('[semilla-auth] La aplicación aprobada por memoriaBACKEND no coincide con la carpeta pública.', { expected: P2P_APPLICATION_ID, received: data?.approvedApplication || '' }); throw new Error(t('auth.serviceUnavailable', 'El servicio de acceso no está disponible.')); } const config = data?.firebaseWebConfig || {}; const error = getFirebaseWebConfigError(config); if (error) { console.error('[semilla-auth]', error); throw new Error(t('auth.serviceUnavailable', 'El servicio de acceso no está disponible.')); } state.firebaseWebConfig = config; return config; }

function projectCreationAdapters() {
  return {
    saveIntent: async (intent) => {
      const saved = await savePendingSpaceCreation(intent);
      if (state.pendingProjectCreation?.requestId === saved.requestId) {
        state.pendingProjectCreation = { ...state.pendingProjectCreation, ...saved };
      }
      return saved;
    },
    removeIntent: removePendingSpaceCreation,
    createSpace: (options) => semillaP2P.createSpace(options),
    listEntities: (spaceId) => semillaP2P.listEntities(spaceId),
    putEntity: (spaceId, entityType, entityId, value, options) => semillaP2P.put(
      spaceId,
      entityType,
      entityId,
      value,
      options
    )
  };
}

function buildPendingProjectCreation(project = {}) {
  const current = state.pendingProjectCreation || {};
  return normalizeSpaceCreationIntent({
    requestId: current.requestId || createLocalId('space_request'),
    operationId: current.operationId || createLocalId('op_project_create'),
    resourceType: 'admin.project',
    permissionProfile: ADMIN_PROJECT_PERMISSION_PROFILE,
    entityType: PROJECT_ENTITY_TYPE,
    entityId: PROJECT_ENTITY_ID,
    spaceId: current.spaceId || '',
    value: project,
    createdAt: current.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });
}

async function recoverPendingProjectCreations() {
  const pending = (await listPendingSpaceCreations()).filter((intent) => (
    intent.resourceType === 'admin.project'
    && intent.entityType === PROJECT_ENTITY_TYPE
    && intent.entityId === PROJECT_ENTITY_ID
  ));
  if (!pending.length) return { recovered: 0, queued: 0, failed: 0 };

  let recovered = 0;
  let queued = 0;
  let failed = 0;
  for (const intent of pending) {
    try {
      const result = await completeSpaceCreationIntent(intent, projectCreationAdapters());
      recovered += 1;
      if (result.queued) queued += 1;
    } catch (error) {
      failed += 1;
      console.error('[SemillaP2P] No se pudo recuperar una creación de proyecto pendiente:', error);
    }
  }
  if (recovered) {
    await semillaP2P.refreshBootstrap({ requestSnapshots: false }).catch((error) => {
      if (isSessionChangedError(error)) throw error;
      console.info('[SemillaP2P] La creación quedó recuperada localmente; el bootstrap remoto se reintentará al volver la conexión.');
      return semillaP2P.bootstrapState;
    });
    applyP2PState(semillaP2P.bootstrapState);
    await refreshProjects();
  }
  return { recovered, queued, failed };
}

async function startP2P() {
  if (!state.user) return;
  try {
    setConnectionState('connecting');
    applyP2PState(await semillaP2P.start(state.user));
    const recovery = await recoverPendingProjectCreations();
    if (recovery.recovered) {
      setStatus(
        elements.dashboardStatus,
        recovery.queued
          ? t('project.recoveredQueued', 'Se recuperó la creación pendiente y quedó lista para sincronizarse.')
          : t('project.recovered', 'Se completó automáticamente una creación de proyecto interrumpida.'),
        'success'
      );
    } else if (recovery.failed) {
      setStatus(
        elements.dashboardStatus,
        t('project.recoveryPending', 'Existe una creación pendiente que se reanudará automáticamente cuando el servicio esté disponible.'),
        'warning'
      );
    }
  } catch (error) {
    console.error('[SemillaP2P]', error);
    setConnectionState('error');
    setStatus(elements.dashboardStatus, error?.message || t('p2p.startError', 'No se pudo iniciar la sincronización.'), 'error');
    if (isSessionChangedError(error)) throw error;
  } finally {
    await refreshStorageDurability().catch(() => null);
  }
}
async function restoreSession() {
  setBusy(true);
  setStatus(elements.authStatus, t('auth.checkingSession', 'Comprobando tu sesión...'));
  try {
    if (!getSessionToken()) {
      showAuth();
      return;
    }
    try {
      const data = await apiPost('/api/bootstrap', {});
      showWorkspace(data.user || {});
    } catch (error) {
      if (isSessionChangedError(error)) throw error;
      if (error?.status === 401) {
        const expiredToken = getSessionToken();
        await semillaP2P.detachPushSubscription({ browserFallback: true }).catch(() => null);
        if (!clearSessionToken(expiredToken)) throw createSessionChangedError();
        setCachedUser(null);
        throw error;
      }
      const cached = getCachedUser();
      if (!cached) throw error;
      showWorkspace(cached, { persist: false });
      setConnectionState('disconnected');
    }
    await startP2P();
  } catch (error) {
    if (!isSessionChangedError(error)) {
      showAuth(error?.message || t('auth.serviceUnavailable', 'El servicio de acceso no está disponible.'));
    }
  } finally {
    setBusy(false);
    document.documentElement.dataset.appReady = 'true';
  }
}

async function synchronizeExternalSession(expectedToken = '', transitionSequence = 0) {
  const token = String(expectedToken || '').trim();
  if (transitionSequence !== state.sessionTransitionSequence || getSessionToken() !== token) return false;

  setBusy(true);
  try {
    await semillaP2P.stop().catch(() => null);
    if (transitionSequence !== state.sessionTransitionSequence || getSessionToken() !== token) return false;

    resetUserScopedInterface();
    elements.authCard?.classList.remove('hidden');
    elements.workspace?.classList.add('hidden');
    if (!token) {
      setCachedUser(null);
      showAuth(t('auth.signedOut', 'Sesión cerrada correctamente.'));
      return true;
    }

    setStatus(elements.authStatus, t('auth.checkingSession', 'Comprobando tu sesión...'));
    const data = await apiPost('/api/bootstrap', {});
    if (transitionSequence !== state.sessionTransitionSequence || getSessionToken() !== token) return false;
    showWorkspace(data.user || {});
    await startP2P();
    if (transitionSequence !== state.sessionTransitionSequence || getSessionToken() !== token) return false;
    return true;
  } catch (error) {
    if (transitionSequence !== state.sessionTransitionSequence || getSessionToken() !== token || isSessionChangedError(error)) {
      return false;
    }
    if (error?.status === 401) {
      await semillaP2P.detachPushSubscription({ browserFallback: true }).catch(() => null);
      if (transitionSequence !== state.sessionTransitionSequence || getSessionToken() !== token) return false;
      if (clearSessionToken(token)) setCachedUser(null);
    }
    showAuth(error?.message || t('auth.serviceUnavailable', 'El servicio de acceso no está disponible.'));
    return false;
  } finally {
    if (transitionSequence === state.sessionTransitionSequence) setBusy(false);
  }
}

function queueExternalSessionSynchronization(token = getSessionToken()) {
  const transitionSequence = ++state.sessionTransitionSequence;
  const expectedToken = String(token || '').trim();
  externalSessionQueue = externalSessionQueue
    .catch(() => null)
    .then(() => synchronizeExternalSession(expectedToken, transitionSequence));
  return externalSessionQueue;
}

async function loginWithGoogle() {
  if (state.busy) return;
  setBusy(true);
  setStatus(elements.authStatus, t('auth.openingGoogle', 'Abriendo Google...'));
  try {
    const google = await signInWithGooglePopup(await loadPublicConfig());
    setStatus(elements.authStatus, t('auth.validatingAccess', 'Validando tu acceso...'));
    const data = await apiPost('/api/auth/google-login', { idToken: google.idToken });
    state.sessionTransitionSequence += 1;
    setSessionToken(data.sessionToken || '');
    resetUserScopedInterface();
    showWorkspace(data.user || {});
    await startP2P();
  } catch (error) {
    showAuth(error?.message || t('auth.loginError', 'No se pudo iniciar sesión con Google.'));
  } finally {
    setBusy(false);
  }
}
async function logout() {
  if (state.busy) return;
  const logoutToken = getSessionToken();
  state.sessionTransitionSequence += 1;
  setBusy(true);
  try {
    await semillaP2P.detachPushSubscription({ browserFallback: true }).catch(() => null);
    await semillaP2P.stop().catch(() => null);
    if (logoutToken && getSessionToken() === logoutToken) {
      await apiPost('/api/auth/logout', {}).catch(() => null);
    }
    if (getSessionToken() === logoutToken) {
      await signOutFirebaseSession(state.firebaseWebConfig || {}).catch(() => null);
    }
  } finally {
    if (clearSessionToken(logoutToken)) {
      setCachedUser(null);
      showAuth(t('auth.signedOut', 'Sesión cerrada correctamente.'));
      setBusy(false);
    } else {
      setBusy(false);
      queueExternalSessionSynchronization(getSessionToken());
    }
  }
}

function openProjectForm(mode = 'create') {
  if (mode === 'edit' && !isSelectedProjectOwner()) {
    setStatus(elements.projectStatus, t('project.ownerEditOnly', 'Solo el propietario puede modificar la información base y el presupuesto del proyecto.'), 'error');
    return;
  }
  const data = selectedProjectData(); elements.projectForm.reset(); elements.projectFormMode.value = mode; setStatus(elements.projectFormStatus, '');
  state.pendingProjectCreation = mode === 'create' ? { requestId: createLocalId('space_request'), operationId: createLocalId('op_project_create'), spaceId: '', createdAt: new Date().toISOString() } : null;
  if (mode === 'edit' && data) { elements.projectDialogTitle.textContent = t('project.editTitle', 'Editar proyecto'); elements.projectNameInput.value = data.project.name; elements.projectDescriptionInput.value = data.project.description; elements.projectAddressInput.value = data.project.address; elements.projectBudgetInput.value = String(data.project.initialBudget); }
  else { elements.projectDialogTitle.textContent = t('project.createTitle', 'Crear proyecto'); }
  openDialog(elements.projectDialog); elements.projectNameInput.focus();
}
async function submitProject(event) {
  event.preventDefault(); if (state.p2pBusy) return; const mode = elements.projectFormMode.value;
  if (mode === 'edit' && !isSelectedProjectOwner()) {
    closeDialog(elements.projectDialog);
    setStatus(elements.projectStatus, t('project.ownerEditOnly', 'Solo el propietario puede modificar la información base y el presupuesto del proyecto.'), 'error');
    return;
  }
  const existing = selectedProjectData(); const project = normalizeProjectInput({ name: elements.projectNameInput.value, description: elements.projectDescriptionInput.value, address: elements.projectAddressInput.value, initialBudget: elements.projectBudgetInput.value, createdAt: mode === 'edit' ? existing?.project.createdAt : '' });
  if (!project.name || !project.initialBudget) { setStatus(elements.projectFormStatus, t('project.required', 'Ingresa un nombre y un presupuesto mayor que cero.'), 'error'); return; }
  setP2PBusy(true); setStatus(elements.projectFormStatus, t('common.saving', 'Guardando…'));
  let spaceId = state.selectedSpaceId;
  let publishResult = null;
  try {
    if (mode === 'create') {
      const intent = buildPendingProjectCreation(project);
      if (!intent) throw new Error(t('project.createError', 'No se pudo preparar la creación recuperable del proyecto.'));
      state.pendingProjectCreation = intent;
      const completion = await completeSpaceCreationIntent(intent, projectCreationAdapters());
      spaceId = completion.spaceId;
      publishResult = completion.publishResult;
      state.pendingProjectCreation = null;
    }
    if (mode === 'edit' && existing?.project) {
      const conditional = buildConcurrentSafePatch(
        existing.project,
        project,
        ['name', 'description', 'address', 'initialBudget']
      );
      if (!conditional.changed) {
        closeDialog(elements.projectDialog);
        setStatus(elements.projectStatus, t('common.noChanges', 'No hay cambios por guardar.'));
        return;
      }
      publishResult = await semillaP2P.patch(spaceId, PROJECT_ENTITY_TYPE, PROJECT_ENTITY_ID, conditional.patch, {
        expected: conditional.expected
      });
    } else if (mode !== 'create') {
      publishResult = await semillaP2P.put(spaceId, PROJECT_ENTITY_TYPE, PROJECT_ENTITY_ID, project);
    }
    state.pendingProjectCreation = null;
    await semillaP2P.refreshBootstrap({ requestSnapshots: false }); applyP2PState(semillaP2P.bootstrapState); await refreshProjects(); closeDialog(elements.projectDialog); openProject(spaceId); setOperationSavedStatus(publishResult, t('project.saved', 'Proyecto guardado y sincronizado.'));
  } catch (error) {
    if (error?.p2pQueued && spaceId) {
      const pendingRequestId = state.pendingProjectCreation?.requestId || '';
      state.pendingProjectCreation = null;
      if (pendingRequestId) await removePendingSpaceCreation(pendingRequestId).catch(() => null);
      await refreshProjects(); closeDialog(elements.projectDialog); openProject(spaceId);
      setStatus(elements.projectStatus, t('p2p.queuedOffline', 'El cambio quedó guardado localmente y se enviará al recuperar conexión.'), 'success');
    } else setStatus(elements.projectFormStatus, error?.message || t('project.saveError', 'No se pudo guardar el proyecto.'), 'error');
  }
  finally { setP2PBusy(false); }
}

function recordByType(type = '', entityId = '') {
  const data = selectedProjectData();
  const collections = { purchase: data?.purchases, income: data?.incomes, projection: data?.projections };
  return (collections[type] || []).find((record) => record.id === entityId) || null;
}

function openRecordForm(type, record = null) {
  const permission = type === 'projection' ? 'projection' : 'add'; if (!userCan(permission)) { setStatus(elements.projectStatus, t('permissions.denied', 'Tus permisos no permiten realizar esta acción.'), 'error'); return; }
  elements.recordForm.reset(); state.editingRecord = record ? { type, id: record.id } : null; elements.recordTypeInput.value = type; setStatus(elements.recordFormStatus, ''); const today = localDateValue(); elements.recordDateInput.value = today;
  const config = {
    purchase: { eyebrow: t('record.expenseEyebrow', 'Gasto real'), title: record ? t('record.purchaseEditTitle', 'Editar compra') : t('record.purchaseTitle', 'Agregar compra'), amount: t('record.invoiceValue', 'Valor de factura'), date: t('record.purchaseDate', 'Fecha de compra') },
    income: { eyebrow: t('record.capitalEyebrow', 'Capital adicional'), title: record ? t('record.incomeEditTitle', 'Editar ingreso') : t('record.incomeTitle', 'Agregar ingreso'), amount: t('record.incomeValue', 'Valor recibido'), date: t('record.incomeDate', 'Fecha de ingreso') },
    projection: { eyebrow: t('record.planningEyebrow', 'Compra pendiente'), title: record ? t('record.projectionEditTitle', 'Editar proyección') : t('record.projectionTitle', 'Agregar proyección'), amount: t('record.projectedValue', 'Valor proyectado'), date: t('record.expectedDate', 'Fecha estimada') }
  }[type];
  elements.recordDialogEyebrow.textContent = config.eyebrow; elements.recordDialogTitle.textContent = config.title; elements.recordAmountLabel.textContent = config.amount; elements.recordDateLabel.textContent = config.date;
  const canManageProjectionLink = type === 'purchase' && userCan('projection');
  elements.invoiceField.classList.toggle('hidden', type !== 'purchase');
  elements.projectionLinkField.classList.toggle('hidden', !canManageProjectionLink);
  if (type === 'purchase') {
    elements.recordProjectionInput.replaceChildren();
    const empty = document.createElement('option');
    empty.value = '';
    empty.textContent = t('record.noProjection', 'Sin proyección vinculada');
    elements.recordProjectionInput.append(empty);
    if (canManageProjectionLink) {
      for (const projection of selectedProjectData()?.projections.filter((item) => item.status !== 'completed' || item.id === record?.projectionId) || []) {
        const option = document.createElement('option');
        option.value = projection.id;
        option.textContent = `${projection.description} · ${money(projection.projectedAmount)}`;
        elements.recordProjectionInput.append(option);
      }
    }
  }
  if (record) {
    elements.recordDescriptionInput.value = record.description || '';
    elements.recordAmountInput.value = String(type === 'projection' ? record.projectedAmount || 0 : record.amount || 0);
    elements.recordDateInput.value = record.purchasedAt || record.receivedAt || record.expectedAt || today;
    elements.recordInvoiceInput.value = record.invoiceNumber || '';
    elements.recordProjectionInput.value = record.projectionId || '';
  }
  openDialog(elements.recordDialog); elements.recordDescriptionInput.focus();
}

async function submitRecord(event) {
  event.preventDefault();
  if (state.p2pBusy || !state.selectedSpaceId) return;
  const type = elements.recordTypeInput.value;
  const projectData = selectedProjectData();
  const strictProjectionLinks = projectData?.strictProjectionLinks === true;
  const canManageProjectionLink = type === 'purchase' && userCan('projection');
  const requestedProjectionId = canManageProjectionLink ? elements.recordProjectionInput.value : '';
  const input = {
    description: elements.recordDescriptionInput.value,
    amount: elements.recordAmountInput.value,
    invoiceNumber: elements.recordInvoiceInput.value,
    projectionId: strictProjectionLinks ? '' : requestedProjectionId,
    purchasedAt: elements.recordDateInput.value,
    receivedAt: elements.recordDateInput.value,
    projectedAmount: elements.recordAmountInput.value,
    expectedAt: elements.recordDateInput.value
  };
  let entityType;
  let value;
  let id;
  const existing = state.editingRecord?.type === type ? recordByType(type, state.editingRecord.id) : null;
  if (type === 'purchase') {
    entityType = PURCHASE_ENTITY_TYPE;
    value = normalizePurchaseInput({ ...input, createdAt: existing?.createdAt });
    id = existing?.id || createLocalId('purchase');
  }
  if (type === 'income') {
    entityType = INCOME_ENTITY_TYPE;
    value = normalizeIncomeInput({ ...input, createdAt: existing?.createdAt });
    id = existing?.id || createLocalId('income');
  }
  if (type === 'projection') {
    entityType = PROJECTION_ENTITY_TYPE;
    value = normalizeProjectionInput({ ...input, createdAt: existing?.createdAt });
    id = existing?.id || createLocalId('projection');
  }
  if (!value?.description || !(value.amount || value.projectedAmount)) {
    setStatus(elements.recordFormStatus, t('record.required', 'Ingresa una descripción y un valor mayor que cero.'), 'error');
    return;
  }

  const projectionLinkChanged = Boolean(
    type === 'purchase'
    && strictProjectionLinks
    && canManageProjectionLink
    && String(existing?.projectionId || '') !== String(requestedProjectionId || '')
  );
  const projectionLink = projectionLinkChanged
    ? normalizeProjectionLinkInput({
      purchaseId: id,
      projectionId: requestedProjectionId,
      active: Boolean(requestedProjectionId),
      createdAt: existing?.projectionLink?.createdAt
    })
    : null;

  setP2PBusy(true);
  setStatus(elements.recordFormStatus, t('common.saving', 'Guardando…'));
  try {
    const publishResults = [];
    let queued = false;
    const publishOrQueue = async (operation) => {
      try {
        const result = await operation();
        if (result) publishResults.push(result);
        return result;
      } catch (error) {
        if (!error?.p2pQueued) throw error;
        queued = true;
        return { queued: true };
      }
    };

    let recordChanged = !existing;
    let recordOperation = null;
    let recordOperationId = '';
    if (existing) {
      const fieldsByType = {
        purchase: strictProjectionLinks
          ? ['description', 'invoiceNumber', 'amount', 'purchasedAt']
          : ['description', 'invoiceNumber', 'amount', 'projectionId', 'purchasedAt'],
        income: ['description', 'amount', 'receivedAt'],
        projection: ['description', 'projectedAmount', 'expectedAt']
      };
      const conditional = buildConcurrentSafePatch(existing, value, fieldsByType[type] || []);
      recordChanged = conditional.changed;
      if (recordChanged) {
        recordOperationId = createLocalId('op');
        recordOperation = {
          operationId: recordOperationId,
          type: 'entity.patch',
          entityType,
          entityId: id,
          payload: {
            patch: conditional.patch,
            expected: conditional.expected,
            conflictPolicy: 'preserve-remote'
          }
        };
      }
    } else {
      recordOperationId = createLocalId('op');
      recordOperation = {
        operationId: recordOperationId,
        type: 'entity.put',
        entityType,
        entityId: id,
        payload: { value }
      };
    }

    let projectionLinkOperation = null;
    if (projectionLinkChanged && projectionLink) {
      projectionLinkOperation = {
        operationId: createLocalId('op'),
        type: 'entity.put',
        entityType: PROJECTION_LINK_ENTITY_TYPE,
        entityId: id,
        payload: {
          value: projectionLink,
          ...(projectionLink.active ? {
            referenceRequirements: [{
              entityType: PROJECTION_ENTITY_TYPE,
              entityId: projectionLink.projectionId
            }]
          } : {})
        }
      };
    }

    if (!recordChanged && !projectionLinkChanged) {
      state.editingRecord = null;
      closeDialog(elements.recordDialog);
      setStatus(elements.projectStatus, t('common.noChanges', 'No hay cambios por guardar.'));
      return;
    }

    let projectionLinkError = null;
    if (recordOperation && projectionLinkOperation) {
      try {
        const batchResult = await semillaP2P.publishBatch(
          state.selectedSpaceId,
          [{ operation: recordOperation }, { operation: projectionLinkOperation }]
        );
        publishResults.push(batchResult);
        queued = Boolean(batchResult?.queued);
      } catch (error) {
        const rejectedOperations = Array.isArray(error?.rejectedOperations) ? error.rejectedOperations : [];
        const recordRejected = rejectedOperations.some((entry) => (
          String(entry?.operationId || '') === recordOperationId && entry?.cancelled !== true
        ));
        if (!error?.p2pBatchPartial || recordRejected) throw error;
        projectionLinkError = error;
      }
    } else {
      if (recordOperation) {
        await publishOrQueue(() => semillaP2P.publish(state.selectedSpaceId, recordOperation));
      }
      if (projectionLinkOperation) {
        try {
          await publishOrQueue(() => semillaP2P.publish(state.selectedSpaceId, projectionLinkOperation));
        } catch (error) {
          if (!recordChanged) throw error;
          projectionLinkError = error;
        }
      }
    }

    state.editingRecord = null;
    closeDialog(elements.recordDialog);
    await refreshProjects();
    renderProject();
    if (projectionLinkError) {
      setStatus(
        elements.projectStatus,
        t('record.purchaseSavedLinkError', 'La compra se guardó, pero no pudo actualizarse su vínculo con la proyección.'),
        'warning'
      );
    } else if (queued) {
      setStatus(elements.projectStatus, t('p2p.queuedOffline', 'El registro quedó en la cola local.'), 'success');
    } else {
      setOperationSavedStatus(publishResults[publishResults.length - 1] || {}, t('record.saved', 'Registro guardado y sincronizado.'));
    }
  } catch (error) {
    setStatus(elements.recordFormStatus, error?.message || t('record.saveError', 'No se pudo guardar el registro.'), 'error');
  } finally {
    setP2PBusy(false);
  }
}

async function handleRecordAction(event) {
  const button = event.target.closest('[data-record-action][data-record-type][data-entity-id]'); if (!button || state.p2pBusy) return;
  const type = button.dataset.recordType; const record = recordByType(type, button.dataset.entityId); const projectData = selectedProjectData();
  if (button.dataset.recordAction === 'edit') { if (record) openRecordForm(type, record); return; }
  if (button.dataset.recordAction !== 'delete') return;
  if (!userCan('delete') || (type === 'projection' && !userCan('projection'))) {
    setStatus(elements.projectStatus, type === 'projection'
      ? t('permissions.projectionDeleteDenied', 'Necesitas permisos de proyección y eliminación para borrar una proyección.')
      : t('permissions.deleteDenied', 'No tienes permiso para eliminar registros.'), 'error');
    return;
  }
  const entityTypes = { purchase: PURCHASE_ENTITY_TYPE, income: INCOME_ENTITY_TYPE, projection: PROJECTION_ENTITY_TYPE }; const entityType = entityTypes[type]; if (!entityType) return;
  if (!record?._entity?.value) return;
  if (type === 'projection' && (record.actualPurchaseIds || []).length) {
    setStatus(elements.projectStatus, t('projection.deleteLinkedError', 'No se puede eliminar una proyección con compras reales vinculadas. Desvincula o elimina esas compras primero.'), 'warning');
    return;
  }
  setP2PBusy(true);
  try {
    let queued = false;
    if (type === 'projection' && projectData?.strictProjectionLinks) {
      const activePurchaseIds = new Set((projectData.purchases || []).map((purchase) => String(purchase.id || '')).filter(Boolean));
      const orphanLinks = (projectData.projectionLinks || []).filter((link) => (
        link?.active !== false
        && String(link?.projectionId || '') === String(button.dataset.entityId || '')
        && !activePurchaseIds.has(String(link?.purchaseId || link?.id || ''))
      ));
      for (const link of orphanLinks) {
        try {
          await semillaP2P.delete(state.selectedSpaceId, PROJECTION_LINK_ENTITY_TYPE, link.id, {
            expected: link._entity?.value || link
          });
        } catch (error) {
          if (!error?.p2pQueued) throw error;
          queued = true;
        }
      }
    }
    const result = await semillaP2P.delete(state.selectedSpaceId, entityType, button.dataset.entityId, {
      expected: record._entity.value,
      ...(type === 'purchase' && projectData?.strictProjectionLinks && record.projectionLink ? {
        dependentDeletes: [{
          entityType: PROJECTION_LINK_ENTITY_TYPE,
          entityId: button.dataset.entityId,
          relation: 'admin.purchase-projection-link-v1'
        }]
      } : {}),
      ...(type === 'projection' ? {
        referenceGuards: projectData?.strictProjectionLinks
          ? [{ entityType: PROJECTION_LINK_ENTITY_TYPE, field: 'projectionId', equals: button.dataset.entityId }]
          : [{ entityType: PURCHASE_ENTITY_TYPE, field: 'projectionId', equals: button.dataset.entityId }]
      } : {})
    });
    await refreshProjects();
    renderProject();
    if (queued) setStatus(elements.projectStatus, t('p2p.queuedOffline', 'El registro quedó en la cola local.'), 'success');
    else setOperationSavedStatus(result, t('record.deleted', 'Registro eliminado y sincronizado.'));
  } catch (error) {
    if (error?.p2pQueued) {
      await refreshProjects();
      renderProject();
      setStatus(elements.projectStatus, t('p2p.queuedOffline', 'El registro quedó en la cola local.'), 'success');
    } else {
      setStatus(elements.projectStatus, error?.message || t('record.deleteError', 'No se pudo eliminar el registro.'), 'error');
    }
  } finally { setP2PBusy(false); }
}

function openInviteForm() { if (!selectedProjectData()) return; elements.inviteForm.reset(); const read = elements.inviteForm.querySelector('input[value="read"]'); if (read) read.checked = true; const add = elements.inviteForm.querySelector('input[value="add"]'); if (add) add.checked = true; const projection = elements.inviteForm.querySelector('input[value="projection"]'); if (projection) projection.checked = true; setStatus(elements.inviteStatus, ''); openDialog(elements.inviteDialog); elements.inviteEmailInput.focus(); }
async function submitInvitation(event) {
  event.preventDefault(); if (state.p2pBusy) return; const data = selectedProjectData(); const email = String(elements.inviteEmailInput.value || '').trim(); const permissions = normalizeCollaborationPermissions([...elements.inviteForm.querySelectorAll('input[name="permission"]:checked')].map((input) => input.value)); if (!data || !email) return;
  setP2PBusy(true); setStatus(elements.inviteStatus, t('invite.sending', 'Enviando invitación…'));
  try { const result = await semillaP2P.invite(email, { spaceId: data.space.spaceId, resourceType: 'admin.project', permissions }); applyP2PState(semillaP2P.bootstrapState); closeDialog(elements.inviteDialog); setStatus(elements.projectStatus, result.reused ? t('invite.alreadyPending', 'La invitación ya estaba pendiente.') : t('invite.sent', 'Invitación enviada correctamente.'), 'success'); }
  catch (error) { setStatus(elements.inviteStatus, error?.message || t('invite.error', 'No se pudo enviar la invitación.'), 'error'); }
  finally { setP2PBusy(false); }
}
async function respondInvitation(event) { const button = event.target.closest('button[data-invitation-id]'); if (!button || state.p2pBusy) return; setP2PBusy(true); try { const result = await semillaP2P.respondToInvitation(button.dataset.invitationId, button.dataset.decision); const canonicalDecision = resolveCanonicalInvitationDecision(result?.invitation, button.dataset.decision); const accessRevoked = result?.accessRevoked === true; const replicaPending = result?.replicaPending === true; applyP2PState(semillaP2P.bootstrapState); if (!(state.p2pState.invitations.received || []).some((item) => item.status === 'pending')) closeDialog(elements.invitationsDialog); const message = accessRevoked ? t('invite.acceptedAccessRevoked', 'La invitación fue aceptada, pero el acceso fue revocado antes de completar la sincronización.') : replicaPending ? t('invite.acceptedSyncing', 'Invitación aceptada. Estamos recuperando la copia compartida antes de habilitar la edición.') : canonicalDecision === 'accept' ? t('invite.accepted', 'Invitación aceptada.') : t('invite.rejected', 'Invitación rechazada.'); setStatus(elements.dashboardStatus, message, accessRevoked || replicaPending ? 'warning' : 'success'); } catch (error) { setStatus(elements.dashboardStatus, error?.message || t('invite.responseError', 'No se pudo responder la invitación.'), 'error'); } finally { setP2PBusy(false); } }
function renderLocalNetworkStatus(detail = null) {
  const status = detail?.status || semillaP2P.getLocalNetworkStatus();
  if (elements.localNetworkButton) elements.localNetworkButton.hidden = status.enabled !== true;
  if (!elements.localNetworkState || !elements.localNetworkPeers) return;
  const peers = Array.isArray(status.peers) ? status.peers : [];
  const stateName = status.connected ? 'connected' : detail?.state === 'unavailable' ? 'unavailable' : status.supported === false ? 'unsupported' : 'ready';
  const labels = {
    connected: t('localNetwork.connected', 'Conexión local activa'),
    ready: t('localNetwork.ready', 'Lista para emparejar'),
    unsupported: t('localNetwork.unsupported', 'WebRTC no está disponible en este navegador'),
    unavailable: t('localNetwork.moduleMissing', 'El bloque opcional de red local no está instalado')
  };
  elements.localNetworkState.dataset.state = stateName;
  elements.localNetworkState.textContent = peers.length
    ? `${labels.connected} · ${peers.length}`
    : labels[stateName] || labels.ready;
  elements.localNetworkPeers.replaceChildren();
  if (!peers.length) {
    const empty = document.createElement('p');
    empty.className = 'empty-state compact-empty-state';
    empty.textContent = t('localNetwork.noPeers', 'Todavía no hay otro dispositivo conectado.');
    elements.localNetworkPeers.append(empty);
    return;
  }
  peers.forEach((peer) => {
    const item = document.createElement('div');
    item.className = 'local-network-peer';
    const title = document.createElement('strong');
    title.textContent = peer.deviceName || peer.displayName || t('devices.defaultName', 'Dispositivo');
    const meta = document.createElement('span');
    meta.textContent = peer.email || peer.deviceId || '';
    item.append(title, meta);
    elements.localNetworkPeers.append(item);
  });
}

function openLocalNetworkDialog() {
  renderLocalNetworkStatus();
  setStatus(elements.localNetworkStatus, '');
  openDialog(elements.localNetworkDialog);
}

async function createLocalNetworkOffer() {
  setStatus(elements.localNetworkStatus, t('localNetwork.creating', 'Preparando invitación local…'));
  try {
    const code = await semillaP2P.createLocalNetworkOffer();
    elements.localNetworkOutput.value = code;
    setStatus(elements.localNetworkStatus, t('localNetwork.offerReady', 'Comparte este código con el segundo dispositivo.'), 'success');
  } catch (error) {
    setStatus(elements.localNetworkStatus, error?.message || t('localNetwork.error', 'No se pudo preparar la conexión local.'), 'error');
  }
}

async function acceptLocalNetworkOffer() {
  const code = String(elements.localNetworkInput?.value || '').trim();
  if (!code) return setStatus(elements.localNetworkStatus, t('localNetwork.codeRequired', 'Pega primero el código recibido.'), 'warning');
  setStatus(elements.localNetworkStatus, t('localNetwork.accepting', 'Creando respuesta local…'));
  try {
    const answer = await semillaP2P.acceptLocalNetworkOffer(code);
    elements.localNetworkOutput.value = answer;
    setStatus(elements.localNetworkStatus, t('localNetwork.answerReady', 'Devuelve este código al primer dispositivo.'), 'success');
  } catch (error) {
    setStatus(elements.localNetworkStatus, error?.message || t('localNetwork.error', 'No se pudo preparar la conexión local.'), 'error');
  }
}

async function completeLocalNetworkAnswer() {
  const code = String(elements.localNetworkInput?.value || '').trim();
  if (!code) return setStatus(elements.localNetworkStatus, t('localNetwork.codeRequired', 'Pega primero el código recibido.'), 'warning');
  setStatus(elements.localNetworkStatus, t('localNetwork.completing', 'Completando conexión local…'));
  try {
    await semillaP2P.completeLocalNetworkAnswer(code);
    setStatus(elements.localNetworkStatus, t('localNetwork.waitingChannel', 'Respuesta aceptada. Esperando que se abra el canal directo…'), 'success');
  } catch (error) {
    setStatus(elements.localNetworkStatus, error?.message || t('localNetwork.error', 'No se pudo preparar la conexión local.'), 'error');
  }
}

async function copyLocalNetworkCode() {
  const code = String(elements.localNetworkOutput?.value || '').trim();
  if (!code) return setStatus(elements.localNetworkStatus, t('localNetwork.nothingToCopy', 'Primero genera un código para compartir.'), 'warning');
  try {
    await navigator.clipboard.writeText(code);
    setStatus(elements.localNetworkStatus, t('localNetwork.copied', 'Código copiado.'), 'success');
  } catch {
    elements.localNetworkOutput.focus();
    elements.localNetworkOutput.select();
    setStatus(elements.localNetworkStatus, t('localNetwork.selectCopy', 'Selecciona y copia manualmente el código.'), 'warning');
  }
}

async function enablePush() { elements.enablePushButton.disabled = true; try { await semillaP2P.enablePushNotifications(); elements.enablePushButton.textContent = t('p2p.notificationsEnabled', 'Notificaciones activas'); setStatus(elements.dashboardStatus, t('p2p.notificationsEnabledMessage', 'Recibirás invitaciones aunque la aplicación no esté abierta.'), 'success'); } catch (error) { setStatus(elements.dashboardStatus, error?.message || t('p2p.notificationsError', 'No se pudieron activar las notificaciones.'), 'error'); elements.enablePushButton.disabled = false; } }

window.addEventListener('p2p:connection', (event) => setConnectionState(event.detail?.state || 'connecting'));
window.addEventListener('p2p:local-network', (event) => renderLocalNetworkStatus(event.detail || {}));
window.addEventListener('p2p:operation-local-network-published', (event) => {
  const delivered = Math.max(0, Number(event.detail?.delivered || 0));
  if (delivered > 0) setStatus(elements.projectStatus, t('localNetwork.changeShared', 'Cambio guardado y enviado por la red local.'), 'success');
});
window.addEventListener('p2p:state', (event) => {
  const nextState = event.detail?.state || {};
  if (event.detail?.replicaHealthOnly === true) {
    state.p2pState.replicaHealth = nextState.replicaHealth && typeof nextState.replicaHealth === 'object'
      ? nextState.replicaHealth
      : {};
    renderDashboard();
    if (state.selectedSpaceId) renderProject();
    return;
  }
  applyP2PState(nextState);
});
window.addEventListener('p2p:invitation', () => applyP2PState(semillaP2P.bootstrapState));
window.addEventListener('p2p:operation', (event) => {
  const operationEvent = event.detail?.event || {};
  const spaceId = operationEvent.spaceId || '';
  if (!spaceId || !state.p2pState.spaces.some((space) => space.spaceId === spaceId)) return;
  const conflicts = Array.isArray(event.detail?.result?.conflicts) ? event.detail.result.conflicts : [];
  const ownOperation = operationEvent.sourceDeviceId === semillaP2P.deviceId
    && operationEvent.actorUserId === state.user?.userId;
  const ownConflict = conflicts.length > 0 && ownOperation;
  const conflictType = conflicts.some((conflict) => conflict?.field === '__reference_required__')
    ? 'reference-required'
    : conflicts.some((conflict) => conflict?.field === '__reference__')
      ? 'reference'
      : conflicts.some((conflict) => conflict?.field === '__entity__') ? 'delete' : 'patch';
  const operationId = String(operationEvent.operation?.operationId || '').trim();
  if (ownConflict && operationId) {
    state.concurrentConflictOperations.set(operationId, conflictType);
    window.setTimeout(() => state.concurrentConflictOperations.delete(operationId), 60000);
  }
  refreshProjects().then(() => {
    if (spaceId !== state.selectedSpaceId) return;
    renderProject();
    if (ownConflict) {
      setStatus(elements.projectStatus, concurrentConflictMessage(conflictType), 'warning');
    } else if (!ownOperation && !operationEvent.optimistic) {
      setStatus(elements.projectStatus, t('p2p.remoteUpdateApplied', 'Cambio remoto aplicado en esta copia.'), 'success');
    }
  }).catch(() => null);
});
window.addEventListener('p2p:access-revoked', (event) => {
  const revokedSpaceIds = Array.from(new Set((Array.isArray(event.detail?.spaceIds) ? event.detail.spaceIds : [])
    .map((spaceId) => String(spaceId || '').trim())
    .filter(Boolean)));
  const wasSelected = Boolean(state.selectedSpaceId && revokedSpaceIds.includes(state.selectedSpaceId));
  applyP2PState(semillaP2P.bootstrapState);
  if (wasSelected) {
    closeDialog(elements.accessDialog);
    closeDialog(elements.inviteDialog);
    closeDialog(elements.projectDialog);
    closeDialog(elements.recordDialog);
    showDashboard();
  }
});
window.addEventListener('p2p:space-deleted', (event) => {
  const deletedSpaceId = String(event.detail?.spaceId || '').trim();
  const wasSelected = deletedSpaceId && deletedSpaceId === state.selectedSpaceId;
  applyP2PState(semillaP2P.bootstrapState);
  if (wasSelected) {
    closeDialog(elements.accessDialog);
    closeDialog(elements.inviteDialog);
    closeDialog(elements.projectDialog);
    closeDialog(elements.recordDialog);
    showDashboard();
  }
  if (event.detail?.source === 'realtime') {
    setStatus(elements.dashboardStatus, t('access.deletedRemote', 'El propietario eliminó un proyecto compartido. Su copia local fue retirada de este dispositivo.'), 'success');
  }
});
window.addEventListener('p2p:authorization-unconfirmed', () => { applyP2PState(semillaP2P.bootstrapState); setStatus(elements.dashboardStatus, t('p2p.authorizationUnconfirmedDashboard', 'Se conservaron proyectos locales cuya autorización no pudo confirmarse. Permanecen disponibles en modo de solo lectura para evitar pérdida de datos.'), 'warning'); });
window.addEventListener('p2p:replica-recovery-pending', () => { applyP2PState(semillaP2P.bootstrapState); setStatus(elements.dashboardStatus, t('p2p.replicaRecoveryDashboard', 'La invitación fue aceptada. El proyecto permanecerá en solo lectura hasta recuperar y validar su copia completa.'), 'warning'); });
window.addEventListener('p2p:replica-recovery-confirmed', () => { applyP2PState(semillaP2P.bootstrapState); setStatus(elements.dashboardStatus, t('p2p.replicaRecoveryConfirmed', 'La copia compartida quedó sincronizada. Ya puedes trabajar en el proyecto.'), 'success'); });
window.addEventListener('p2p:error', () => setConnectionState('error'));
navigator.serviceWorker?.addEventListener('message', (event) => {
  const invitationId = invitationIntentFromServiceWorkerMessage(event.data || {});
  if (invitationId) refreshInvitationIntent(invitationId);
});

window.addEventListener('p2p:storage-risk', (event) => {
  refreshStorageDurability().catch(() => null);
  const reason = String(event.detail?.reason || '');
  const message = reason === 'quota-exceeded'
    ? t('storage.writeFailed', 'No se pudo guardar un cambio porque el dispositivo se quedó sin espacio disponible.')
    : t('storage.lifecycleChanged', 'El almacenamiento local cambió. La aplicación volvió a comprobar la seguridad de la copia.');
  setStatus(elements.dashboardStatus, message, reason === 'quota-exceeded' ? 'error' : '');
});

renderLocalNetworkStatus();

elements.loginButton?.addEventListener('click', loginWithGoogle); elements.logoutButton?.addEventListener('click', logout); elements.enablePushButton?.addEventListener('click', enablePush);
elements.devicesButton?.addEventListener('click', openDeviceManagement);
elements.localNetworkButton?.addEventListener('click', openLocalNetworkDialog);
elements.localNetworkCreateOffer?.addEventListener('click', createLocalNetworkOffer);
elements.localNetworkAcceptOffer?.addEventListener('click', acceptLocalNetworkOffer);
elements.localNetworkCompleteAnswer?.addEventListener('click', completeLocalNetworkAnswer);
elements.localNetworkCopy?.addEventListener('click', copyLocalNetworkCode);
elements.deviceList?.addEventListener('click', (event) => { const button = event.target.closest('button[data-device-retire]'); if (button) prepareDeviceRetirement(button.dataset.deviceRetire); });
elements.deviceConfirmButton?.addEventListener('click', executeDeviceRetirement); elements.deviceConfirmCancel?.addEventListener('click', clearDeviceConfirmation);
elements.protectStorageButton?.addEventListener('click', () => requestStorageProtection({ announce: true }));
elements.newProjectButton?.addEventListener('click', () => { requestStorageProtection(); openProjectForm('create'); }); elements.projectForm?.addEventListener('submit', submitProject); elements.editProjectButton?.addEventListener('click', () => openProjectForm('edit'));
elements.projectList?.addEventListener('click', (event) => { const card = event.target.closest('[data-space-id]'); if (card) openProject(card.dataset.spaceId); }); elements.backButton?.addEventListener('click', showDashboard);
elements.addPurchaseButton?.addEventListener('click', () => openRecordForm('purchase')); elements.addIncomeButton?.addEventListener('click', () => openRecordForm('income')); elements.addProjectionButton?.addEventListener('click', () => openRecordForm('projection')); elements.recordForm?.addEventListener('submit', submitRecord);
[elements.purchaseList, elements.projectionList, elements.incomeList].forEach((list) => list?.addEventListener('click', handleRecordAction));
elements.inviteCollaboratorButton?.addEventListener('click', openInviteForm); elements.inviteForm?.addEventListener('submit', submitInvitation); elements.invitationsButton?.addEventListener('click', () => openDialog(elements.invitationsDialog)); elements.invitationList?.addEventListener('click', respondInvitation);
elements.manageAccessButton?.addEventListener('click', openAccessManagement);
elements.accessMemberList?.addEventListener('click', (event) => {
  const cancel = event.target.closest('button[data-permission-cancel]');
  if (cancel) { togglePermissionEditor(cancel.dataset.permissionCancel, false); return; }
  const button = event.target.closest('button[data-access-action]');
  if (!button) return;
  if (button.dataset.accessAction === 'permissions') { togglePermissionEditor(button.dataset.userId); return; }
  prepareAccessAction(button.dataset.accessAction, button.dataset.userId);
});
elements.accessMemberList?.addEventListener('submit', submitPermissionUpdate);
elements.deleteProjectButton?.addEventListener('click', () => prepareAccessAction('delete-project'));
elements.accessConfirmButton?.addEventListener('click', executeAccessAction); elements.accessConfirmCancel?.addEventListener('click', clearAccessConfirmation);
document.addEventListener('click', (event) => { const button = event.target.closest('[data-close-dialog]'); if (button) closeDialog(byId(button.dataset.closeDialog)); });
document.addEventListener('app-language-ready', () => { renderInvitations(); renderDevices(); renderDashboard(); renderStorageDurability(); if (state.selectedSpaceId) { renderProject(); if (elements.accessDialog?.open) renderAccessManagement(); } setConnectionState(elements.connectionStatus?.dataset.state || 'connecting'); window.AppAssetLoader?.hydrate(document); });

subscribeSessionTokenChanges(({ token }) => {
  queueExternalSessionSynchronization(token);
});
window.addEventListener('online', () => {
  if (!state.user && getSessionToken()) queueExternalSessionSynchronization(getSessionToken());
});

restoreSession();
