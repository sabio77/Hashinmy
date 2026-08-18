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
  createInvitationAuditTraceId,
  invitationAuditEntitySummary,
  invitationAuditError,
  invitationAuditLog,
  invitationRejectLog,
  maskInvitationAuditEmail,
  XXXsenXXX
} from './p2p-invitation-audit.js';
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
  normalizeProjectFilterText,
  normalizeProjectionInput,
  normalizeProjectionLinkInput,
  normalizePurchaseInput,
  projectMatchesFilter,
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
  selectedPanelOwnerUserId: '',
  renderSequence: 0,
  p2pState: { spaces: [], invitations: { received: [], sent: [] }, devices: [], replicaHealth: {}, lifecycleTransactions: [] },
  projects: new Map(),
  pendingProjectCreation: null,
  editingRecord: null,
  pendingAccessAction: null,
  pendingDeviceRetirement: null,
  actionMenuContext: null,
  pendingActionMenuAction: null,
  storageDurability: null,
  storageRequestPromise: null,
  concurrentConflictOperations: new Map(),
  sessionTransitionSequence: 0,
  pendingInvitationId: readInvitationIntent(window.location),
  invitationRefreshSequence: 0,
  missingProjectRecoveryActive: false,
  missingProjectRecoveryAt: new Map(),
  missingProjectRecoveryAuditContext: {},
  projectFilterQuery: '',
  inviteContext: null,
  panelResponseInProgress: false,
  panelAccessOwnerUserId: '',
  navigationSessionId: ''
};

const MISSING_PROJECT_RECOVERY_COOLDOWN_MS = 60 * 1000;
const APP_NAVIGATION_HISTORY_KEY = '__semillaP2PNavigation';
let navigationSessionSequence = 0;

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
  dashboardHeadingEyebrow: byId('dashboard-heading-eyebrow'), dashboardHeadingTitle: byId('dashboard-heading-title'), dashboardHeadingDescription: byId('dashboard-heading-description'),
  backToPanelsButton: byId('back-to-panels-button'), panelContextBar: byId('panel-context-bar'), panelContextOwner: byId('panel-context-owner'), panelContextActions: byId('panel-context-actions'),
  portfolioMetrics: byId('portfolio-metrics'), projectList: byId('project-list'), projectFilterToolbar: byId('project-filter-toolbar'), projectFilterInput: byId('project-filter-input'), projectFilterClear: byId('project-filter-clear'), projectFilterSummary: byId('project-filter-summary'), newProjectButton: byId('new-project-button'), backButton: byId('back-to-dashboard-button'),
  projectName: byId('project-name'), projectDescription: byId('project-description'), projectAddress: byId('project-address'), projectMemberSummary: byId('project-member-summary'), projectReplicaHealth: byId('project-replica-health'),
  projectMetrics: byId('project-metrics'), budgetProgressValue: byId('budget-progress-value'), budgetProgressLabel: byId('budget-progress-label'),
  inviteCollaboratorButton: byId('invite-collaborator-button'), manageAccessButton: byId('manage-access-button'), editProjectButton: byId('edit-project-button'), addPurchaseButton: byId('add-purchase-button'), addIncomeButton: byId('add-income-button'), addProjectionButton: byId('add-projection-button'),
  purchaseList: byId('purchase-list'), projectionList: byId('projection-list'), incomeList: byId('income-list'), purchaseCount: byId('purchase-count'), projectionCount: byId('projection-count'), incomeCount: byId('income-count'),
  projectDialog: byId('project-dialog'), projectForm: byId('project-form'), projectFormMode: byId('project-form-mode'), projectDialogTitle: byId('project-dialog-title'), projectNameInput: byId('project-name-input'), projectDescriptionInput: byId('project-description-input'), projectAddressInput: byId('project-address-input'), projectBudgetInput: byId('project-budget-input'), projectFormStatus: byId('project-form-status'), projectSubmitButton: byId('project-submit-button'),
  recordDialog: byId('record-dialog'), recordForm: byId('record-form'), recordTypeInput: byId('record-type-input'), recordDialogEyebrow: byId('record-dialog-eyebrow'), recordDialogTitle: byId('record-dialog-title'), recordDescriptionInput: byId('record-description-input'), recordInvoiceInput: byId('record-invoice-input'), recordAmountInput: byId('record-amount-input'), recordDateInput: byId('record-date-input'), recordProjectionInput: byId('record-projection-input'), invoiceField: byId('invoice-field'), projectionLinkField: byId('projection-link-field'), recordDateLabel: byId('record-date-label'), recordAmountLabel: byId('record-amount-label'), recordFormStatus: byId('record-form-status'), recordSubmitButton: byId('record-submit-button'),
  inviteDialog: byId('invite-dialog'), inviteForm: byId('invite-form'), inviteDialogTitle: byId('invite-dialog-title'), inviteDialogDescription: byId('invite-dialog-description'), inviteEmailInput: byId('invite-email-input'), inviteStatus: byId('invite-status'), inviteSubmitButton: byId('invite-submit-button'), invitationsDialog: byId('invitations-dialog'),
  panelAccessDialog: byId('panel-access-dialog'), panelAccessList: byId('panel-access-list'), panelAccessStatus: byId('panel-access-status'),
  accessDialog: byId('access-dialog'), accessMemberList: byId('access-member-list'), accessStatus: byId('access-status'), accessOwnerActions: byId('access-owner-actions'), deleteProjectButton: byId('delete-project-button'), accessConfirmPanel: byId('access-confirm-panel'), accessConfirmMessage: byId('access-confirm-message'), accessConfirmButton: byId('access-confirm-button'), accessConfirmCancel: byId('access-confirm-cancel'),
  trashButton: byId('trash-button'), trashCount: byId('trash-count'), trashDialog: byId('trash-dialog'), trashList: byId('trash-list'), trashStatus: byId('trash-status'),
  actionMenuDialog: byId('action-menu-dialog'), actionMenuTitle: byId('action-menu-title'), actionMenuContext: byId('action-menu-context'), actionMenuList: byId('action-menu-list'), actionMenuStatus: byId('action-menu-status'), actionMenuConfirmPanel: byId('action-menu-confirm-panel'), actionMenuConfirmTitle: byId('action-menu-confirm-title'), actionMenuConfirmMessage: byId('action-menu-confirm-message'), actionMenuConfirmButton: byId('action-menu-confirm-button'), actionMenuConfirmCancel: byId('action-menu-confirm-cancel')
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
function spaceUserCan(space = null, permission = '') { return Boolean(space && !isAuthorizationUnconfirmed(space) && state.user && hasPermission(space, state.user.userId, permission)); }
function userCan(permission) { return spaceUserCan(selectedSpace(), permission); }
function isSpaceOwner(space = null) { return Boolean(space && !isAuthorizationUnconfirmed(space) && state.user?.userId && space.ownerUserId === state.user.userId); }
function replicaHealthForSpace(spaceId = '') {
  const cleanSpaceId = String(spaceId || '').trim();
  const health = state.p2pState.replicaHealth?.[cleanSpaceId];
  return health && typeof health === 'object' ? health : { spaceId: cleanSpaceId, state: 'unknown', registeredReplicas: 0, confirmedReplicas: 0, pendingReplicas: 0 };
}
function replicaHealthPresentation(spaceId = '') {
  const cleanSpaceId = String(spaceId || '').trim();
  const health = replicaHealthForSpace(cleanSpaceId);
  const preferredState = String(health.displayState || health.state || '');
  const freshnessState = ['healthy', 'degraded', 'single', 'unavailable', 'unknown'].includes(preferredState) ? preferredState : 'unknown';
  // La card cuenta existencia de copias por separado de su frescura. Una copia puede
  // estar presente y todavía reconciliando una revisión/ACK; en ese caso debe seguir
  // contando como copia física sin presentarse falsamente como "al día".
  // Si el proyecto ya fue hidratado desde IndexedDB y está visible en esta instalación,
  // esa propia card es evidencia local de al menos una copia aunque el reporte agregado
  // de Redis/SSE todavía esté convergiendo. Así una instalación que está mostrando el
  // proyecto nunca puede caer visualmente en 0/N por una carrera de metadatos.
  const confirmed = Math.max(0, Number(health.availableReplicas ?? health.confirmedReplicas ?? 0));
  const localProjectLoaded = Boolean(cleanSpaceId && state.projects?.has?.(cleanSpaceId));
  const currentVisibleCopy = localProjectLoaded
    || (health.currentDeviceRegistered === true && health.currentDeviceOnline === true)
    ? 1
    : 0;
  const present = Math.max(
    confirmed,
    currentVisibleCopy,
    Math.max(0, Number(health.presentReplicas ?? 0))
  );
  const registered = Math.max(present, Math.max(0, Number(health.registeredReplicas || 0)));
  // El color representa cobertura de copias físicas; la frescura/ACK continúa informada
  // por separado. Por eso N/N siempre se pinta completo (verde) aunque alguna copia aún
  // esté terminando de confirmar su revisión, sin ocultar ese dato en el texto/tooltip.
  const coverageState = health.truncated === true
    ? 'unknown'
    : registered > 0 && present >= registered
      ? 'healthy'
      : present <= 0
        ? 'unavailable'
        : present === 1
          ? 'single'
          : 'degraded';
  const labels = {
    healthy: t('replicas.healthy', 'Réplicas al día'),
    degraded: t('replicas.degraded', 'Réplicas pendientes'),
    single: t('replicas.single', 'Una sola copia'),
    unavailable: t('replicas.unavailable', 'Sin copia confirmada'),
    unknown: t('replicas.unknown', 'Cobertura por confirmar')
  };
  const summary = t('replicas.summary', '{present}/{registered} copias')
    .replace('{present}', String(present))
    .replace('{registered}', String(registered));
  const freshness = t('replicas.freshness', '{confirmed}/{registered} al día')
    .replace('{confirmed}', String(confirmed))
    .replace('{registered}', String(registered));
  const detail = t('replicas.detail', '{label}. {summary}. {freshness}. Los datos siguen almacenados únicamente en los dispositivos autorizados.')
    .replace('{label}', labels[freshnessState])
    .replace('{summary}', summary)
    .replace('{freshness}', freshness);
  return { health, state: coverageState, freshnessState, label: labels[freshnessState], summary, freshness, detail };
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
  [elements.projectSubmitButton, elements.recordSubmitButton, elements.inviteSubmitButton, elements.deleteProjectButton, elements.accessConfirmButton, elements.deviceConfirmButton, elements.actionMenuConfirmButton].forEach((button) => { if (button) button.disabled = state.p2pBusy; });
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
  state.selectedPanelOwnerUserId = '';
  state.p2pState = { spaces: [], invitations: { received: [], sent: [] }, devices: [], replicaHealth: {}, lifecycleTransactions: [] };
  state.projects.clear();
  state.pendingProjectCreation = null;
  state.editingRecord = null;
  state.pendingAccessAction = null;
  state.pendingDeviceRetirement = null;
  state.actionMenuContext = null;
  state.pendingActionMenuAction = null;
  state.concurrentConflictOperations.clear();
  state.missingProjectRecoveryActive = false;
  state.missingProjectRecoveryAt.clear();
  state.projectFilterQuery = '';
  state.inviteContext = null;
  state.panelResponseInProgress = false;
  state.panelAccessOwnerUserId = '';
  state.navigationSessionId = '';
  clearCurrentNavigationHistoryState();
  if (elements.projectFilterInput) elements.projectFilterInput.value = '';
  state.invitationRefreshSequence += 1;
  state.storageDurability = null;
  state.storageRequestPromise = null;
  setP2PBusy(false);
  [elements.projectDialog, elements.recordDialog, elements.inviteDialog, elements.invitationsDialog, elements.devicesDialog, elements.panelAccessDialog, elements.accessDialog, elements.actionMenuDialog, elements.trashDialog]
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
  state.navigationSessionId = `${Date.now().toString(36)}-${++navigationSessionSequence}`;
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
  const trashedPurchases = entitiesByType(entities, PURCHASE_ENTITY_TYPE, { onlyTrashed: true });
  const trashedIncomes = entitiesByType(entities, INCOME_ENTITY_TYPE, { onlyTrashed: true });
  const trashedProjections = entitiesByType(entities, PROJECTION_ENTITY_TYPE, { onlyTrashed: true });
  return {
    space,
    project,
    purchases,
    incomes,
    projections,
    projectionLinks,
    trash: {
      purchases: trashedPurchases,
      incomes: trashedIncomes,
      projections: trashedProjections
    },
    strictProjectionLinks,
    metrics: calculateProjectMetrics(project, purchases, incomes, projections)
  };
}

async function recoverMissingProjectCards(spaceIds = [], auditContext = state.missingProjectRecoveryAuditContext || {}) {
  if (state.missingProjectRecoveryActive || !state.user || !getSessionToken()) return false;
  const now = Date.now();
  const candidates = Array.from(new Set((Array.isArray(spaceIds) ? spaceIds : [])
    .map((spaceId) => String(spaceId || '').trim())
    .filter(Boolean)))
    .filter((spaceId) => now - Number(state.missingProjectRecoveryAt.get(spaceId) || 0) >= MISSING_PROJECT_RECOVERY_COOLDOWN_MS);
  if (!candidates.length) return false;

  invitationAuditLog('frontend.ui.missing-project-recovery.begin', {
    auditTraceId: String(auditContext?.auditTraceId || '').trim(),
    auditSource: String(auditContext?.source || '').trim(),
    candidates,
    ...XXXsenXXX({ bootstrapState: state.p2pState, account: state.user })
  });
  state.missingProjectRecoveryActive = true;
  candidates.forEach((spaceId) => state.missingProjectRecoveryAt.set(spaceId, now));
  setStatus(
    elements.dashboardStatus,
    candidates.length === 1
      ? t('p2p.missingProjectSearching', 'Buscando una copia válida del proyecto compartido…')
      : t('p2p.missingProjectsSearching', 'Buscando copias válidas de los proyectos compartidos incompletos…'),
    'warning'
  );

  try {
    const recoveryState = await semillaP2P.recoverMissingProjectRoots(candidates, auditContext);
    const requestedRecoverySpaceIds = new Set((recoveryState?.snapshotRequests || [])
      .map((request) => String(request?.spaceId || '').trim())
      .filter(Boolean));
    const invitationRecovery = recoveryState?.invitationRecovery && typeof recoveryState.invitationRecovery === 'object'
      ? recoveryState.invitationRecovery
      : null;
    const discardedSpaceIds = new Set((invitationRecovery?.removedSpaceIds || []).map((spaceId) => String(spaceId || '').trim()).filter(Boolean));
    const unresolved = [];
    const recoveryAudit = [];
    for (const spaceId of candidates) {
      const space = state.p2pState.spaces.find((candidate) => candidate?.spaceId === spaceId) || null;
      if (!space) continue;
      let entities = [];
      try {
        entities = await semillaP2P.listEntities(spaceId);
      } catch (error) {
        invitationAuditLog('frontend.ui.missing-project-recovery.storage-error', {
          auditTraceId: String(auditContext?.auditTraceId || '').trim(),
          spaceId,
          error: invitationAuditError(error),
          ...XXXsenXXX({ space, error })
        });
      }
      const loaded = projectRecord(space, entities).loaded;
      recoveryAudit.push({ spaceId, loaded, entitySummary: invitationAuditEntitySummary(entities), rawAudit: { space, entities } });
      if (!loaded) unresolved.push(spaceId);
    }
    invitationAuditLog('frontend.ui.missing-project-recovery.result', {
      auditTraceId: String(auditContext?.auditTraceId || '').trim(),
      auditSource: String(auditContext?.source || '').trim(),
      candidates,
      requestedSnapshotSpaceIds: [...requestedRecoverySpaceIds],
      unresolved,
      spaces: recoveryAudit.map(({ rawAudit, ...summary }) => summary),
      invitationRecovery: invitationRecovery ? {
        completed: invitationRecovery.completed === true,
        discarded: invitationRecovery.discarded === true,
        cleanupPending: invitationRecovery.cleanupPending === true,
        attemptsUsed: Number(invitationRecovery.attemptsUsed || 0),
        removedSpaceIds: [...discardedSpaceIds],
        cleanupInvitationIds: Array.isArray(invitationRecovery.cleanupInvitationIds) ? invitationRecovery.cleanupInvitationIds : []
      } : null,
      ...XXXsenXXX({ recoveryState, spaces: recoveryAudit.map((item) => item.rawAudit) })
    });
    if (invitationRecovery?.discarded === true) {
      setStatus(
        elements.dashboardStatus,
        discardedSpaceIds.size === 1
          ? t('p2p.invitationRecoveryDiscarded', 'No fue posible reconstruir la invitación después de 3 intentos. La autorización incompleta se eliminó automáticamente para evitar dejar datos residuales.')
          : t('p2p.invitationRecoveriesDiscarded', 'No fue posible reconstruir las invitaciones después de 3 intentos. Las autorizaciones incompletas se eliminaron automáticamente para evitar dejar datos residuales.'),
        'warning'
      );
      return false;
    }
    if (invitationRecovery?.cleanupPending === true) {
      setStatus(
        elements.dashboardStatus,
        t('p2p.invitationRecoveryCleanupPending', 'La invitación agotó 3 intentos de recuperación. La limpieza automática se reintentará cuando el servicio vuelva a estar disponible.'),
        'warning'
      );
      return false;
    }
    if (unresolved.length) {
      const pendingRecoveryCount = unresolved.filter((spaceId) => requestedRecoverySpaceIds.has(spaceId)).length;
      setStatus(
        elements.dashboardStatus,
        pendingRecoveryCount > 0
          ? pendingRecoveryCount === 1
            ? t('p2p.missingProjectRecoveryPending', 'El espacio compartido incompleto se ocultó mientras otra réplica envía una copia válida.')
            : t('p2p.missingProjectsRecoveryPending', 'Los espacios compartidos incompletos se ocultaron mientras otras réplicas envían copias válidas.')
          : unresolved.length === 1
            ? t('p2p.missingProjectHidden', 'Se retiró de la vista un espacio compartido incompleto porque no existe una copia recuperable en este momento.')
            : t('p2p.missingProjectsHidden', 'Se retiraron de la vista los espacios compartidos incompletos que no tienen una copia recuperable en este momento.'),
        'warning'
      );
    } else {
      setStatus(
        elements.dashboardStatus,
        candidates.length === 1
          ? t('p2p.missingProjectRecovered', 'El proyecto compartido fue recuperado y volvió a estar disponible.')
          : t('p2p.missingProjectsRecovered', 'Los proyectos compartidos fueron recuperados y volvieron a estar disponibles.'),
        'success'
      );
    }
    return unresolved.length === 0;
  } catch (error) {
    invitationAuditLog('frontend.ui.missing-project-recovery.error', {
      auditTraceId: String(auditContext?.auditTraceId || '').trim(),
      auditSource: String(auditContext?.source || '').trim(),
      candidates,
      error: invitationAuditError(error),
      ...XXXsenXXX({ error, bootstrapState: state.p2pState })
    });
    setStatus(
      elements.dashboardStatus,
      error?.message || t('p2p.missingProjectDeferred', 'El espacio compartido incompleto se ocultó. Volverá a mostrarse cuando una réplica válida pueda recuperarlo.'),
      'warning'
    );
    return false;
  } finally {
    state.missingProjectRecoveryActive = false;
  }
}

async function refreshProjects(auditContext = {}) {
  state.missingProjectRecoveryAuditContext = auditContext && typeof auditContext === 'object' ? auditContext : {};
  const renderSequence = ++state.renderSequence;
  const spaces = Array.isArray(state.p2pState.spaces) ? state.p2pState.spaces : [];
  const hydrationAudit = [];
  const entries = await Promise.all(spaces.map(async (space) => {
    let entities = [];
    try {
      entities = await semillaP2P.listEntities(space.spaceId);
    } catch (error) {
      invitationAuditLog('frontend.ui.project-hydration.storage-error', {
        auditTraceId: String(auditContext?.auditTraceId || '').trim(),
        auditSource: String(auditContext?.source || '').trim(),
        spaceId: String(space?.spaceId || '').trim(),
        error: invitationAuditError(error),
        ...XXXsenXXX({ space, error })
      });
    }
    const data = resolvedProjectData(space, entities);
    hydrationAudit.push({
      spaceId: String(space?.spaceId || '').trim(),
      ownerUserId: panelOwnerUserId(space),
      authorizationState: String(space?.authorizationState || '').trim(),
      authorizationPendingReason: String(space?.authorizationPendingReason || '').trim(),
      projectRootLoaded: data.project.loaded,
      projectRootEntityPresent: Boolean(data.project._entity),
      projectRootValuePresent: Boolean(data.project._entity?.value && typeof data.project._entity.value === 'object'),
      projectRoot: data.project.loaded ? {
        name: data.project.name,
        description: data.project.description,
        address: data.project.address,
        initialBudget: data.project.initialBudget,
        createdAt: data.project.createdAt,
        updatedAt: data.project.updatedAt
      } : null,
      entities: invitationAuditEntitySummary(entities),
      rawAudit: { space, entities, resolvedProjectData: data }
    });
    return [space.spaceId, data];
  }));
  invitationAuditLog('frontend.ui.project-hydration', {
    auditTraceId: String(auditContext?.auditTraceId || '').trim(),
    auditSource: String(auditContext?.source || '').trim(),
    userId: String(state.user?.userId || '').trim(),
    spaceCount: spaces.length,
    spaces: hydrationAudit.map(({ rawAudit, ...summary }) => summary),
    ...XXXsenXXX({
      account: state.user,
      bootstrapSpaces: spaces,
      hydratedSpaces: hydrationAudit.map((item) => item.rawAudit)
    })
  });
  if (renderSequence !== state.renderSequence) return;
  const missingProjectSpaceIds = entries
    .filter(([, data]) => !data.project.loaded)
    .map(([spaceId]) => spaceId);
  invitationAuditLog('frontend.ui.project-root-check', {
    auditTraceId: String(auditContext?.auditTraceId || '').trim(),
    auditSource: String(auditContext?.source || '').trim(),
    userId: String(state.user?.userId || '').trim(),
    expectedSpaceIds: spaces.map((space) => String(space?.spaceId || '').trim()).filter(Boolean),
    loadedSpaceIds: entries.filter(([, data]) => data.project.loaded).map(([spaceId]) => spaceId),
    missingProjectSpaceIds,
    missingCount: missingProjectSpaceIds.length
  });
  state.projects = new Map(entries.filter(([, data]) => data.project.loaded));
  const selected = state.selectedSpaceId ? state.projects.get(state.selectedSpaceId) : null;
  if (state.selectedSpaceId && (!selected || selected.project.isTrashed)) showDashboard();
  renderDashboard(auditContext);
  renderTrash();
  if (state.selectedSpaceId) renderProject();
  synchronizeNavigationHistory('replace');
  if (missingProjectSpaceIds.length) recoverMissingProjectCards(missingProjectSpaceIds).catch(() => null);
}

function renderPortfolioMetrics(projectsOverride = null) {
  elements.portfolioMetrics.replaceChildren();
  const projects = Array.isArray(projectsOverride)
    ? projectsOverride.filter((item) => !item.project.isTrashed)
    : [...state.projects.values()].filter((item) => !item.project.isTrashed);
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

function contextMenuButton(context = {}, label = '') {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'context-menu-button';
  button.dataset.actionMenuScope = context.scope || '';
  button.dataset.spaceId = context.spaceId || '';
  if (context.type) button.dataset.recordType = context.type;
  if (context.entityId) button.dataset.entityId = context.entityId;
  button.setAttribute('aria-label', label || t('actions.openMenu', 'Abrir opciones'));
  button.title = label || t('actions.openMenu', 'Abrir opciones');
  button.innerHTML = '<span aria-hidden="true">⋮</span>';
  return button;
}

function activeProjectLifecycle(spaceId = '') {
  const cleanSpaceId = String(spaceId || '').trim();
  if (!cleanSpaceId) return null;
  return (state.p2pState.lifecycleTransactions || []).find((transaction) => (
    transaction?.role === 'source'
    && String(transaction.spaceId || '').trim() === cleanSpaceId
    && ['waiting', 'ready', 'failed', 'completion-pending'].includes(String(transaction.status || '').trim())
  )) || null;
}

function lifecycleProgressPresentation(transaction = null) {
  if (!transaction) return null;
  const action = String(transaction.action || '').trim();
  const completed = Math.max(0, Number(transaction.completed || 0));
  const total = Math.max(0, Number(transaction.total || 0));
  const remaining = Math.max(0, Number(transaction.remaining ?? Math.max(0, total - completed)));
  const percentage = total > 0 ? Math.min(100, (completed / total) * 100) : 100;
  const title = action === 'purge'
    ? t('lifecycle.purgeTitle', 'Eliminación permanente en curso')
    : action === 'restore'
      ? t('lifecycle.restoreTitle', 'Restauración del proyecto en curso')
      : t('lifecycle.trashTitle', 'Envío a papelera en curso');
  const summary = total > 0
    ? t('lifecycle.deviceProgress', '{completed} de {total} dispositivos completados · {remaining} pendientes')
      .replace('{completed}', String(completed))
      .replace('{total}', String(total))
      .replace('{remaining}', String(remaining))
    : t('lifecycle.noRemoteDevices', 'No hay otros dispositivos pendientes · aplicando en este dispositivo');
  return { action, completed, total, remaining, percentage, title, summary };
}

function lifecycleProgressNode(transaction = null, options = {}) {
  const presentation = lifecycleProgressPresentation(transaction);
  if (!presentation) return null;
  const container = document.createElement('div');
  container.className = options.compact === true ? 'project-lifecycle-progress is-compact' : 'project-lifecycle-progress';
  container.dataset.action = presentation.action;
  const heading = document.createElement('div'); heading.className = 'project-lifecycle-heading';
  const title = document.createElement('strong'); title.textContent = presentation.title;
  const count = document.createElement('span'); count.textContent = `${presentation.completed}/${presentation.total}`;
  heading.append(title, count);
  const track = document.createElement('div'); track.className = 'project-lifecycle-track'; track.setAttribute('aria-hidden', 'true');
  const fill = document.createElement('span'); fill.style.width = `${presentation.percentage}%`; track.append(fill);
  const detail = document.createElement('p'); detail.textContent = presentation.summary;
  container.append(heading, track, detail);
  return container;
}

function lifecycleStatusMessage(transaction = null) {
  const presentation = lifecycleProgressPresentation(transaction);
  return presentation
    ? `${presentation.title}. ${presentation.summary}. ${t('lifecycle.sourceLast', 'Este dispositivo se actualizará al final, después de confirmar las demás copias.')}`
    : '';
}

function panelOwnerUserId(space = {}) {
  return String(space.ownerUserId || (space.members || []).find((member) => member?.role === 'owner')?.userId || '').trim();
}

function panelOwnerProfile(ownerUserId = '', projects = []) {
  const cleanOwnerUserId = String(ownerUserId || '').trim();
  if (!cleanOwnerUserId) return null;
  if (cleanOwnerUserId === String(state.user?.userId || '').trim()) return state.user || null;
  for (const data of projects) {
    const member = (data.space?.members || []).find((candidate) => String(candidate?.userId || '').trim() === cleanOwnerUserId);
    if (member?.profile) return member.profile;
  }
  const invitation = (state.p2pState.invitations?.received || []).find((candidate) => (
    String(candidate?.inviterUserId || '').trim() === cleanOwnerUserId
    && candidate?.inviter
  ));
  return invitation?.inviter || null;
}

function panelOwnerLabel(ownerUserId = '', projects = []) {
  const profile = panelOwnerProfile(ownerUserId, projects);
  return String(profile?.displayName || profile?.email || '').trim();
}

function panelDisplayName(ownerUserId = '', projects = []) {
  if (ownerUserId && ownerUserId === state.user?.userId) return t('panel.ownName', 'Mi panel');
  const label = panelOwnerLabel(ownerUserId, projects);
  return label
    ? t('panel.sharedName', 'Panel de {owner}').replace('{owner}', label)
    : t('panel.sharedFallback', 'Panel compartido');
}

function safePanelPhotoUrl(profile = null) {
  const candidate = String(profile?.photoUrl || '').trim();
  if (!candidate) return '';
  try {
    const url = new URL(candidate, window.location.href);
    return ['https:', 'http:'].includes(url.protocol) ? url.href : '';
  } catch {
    return '';
  }
}

function panelAvatarNode(ownerUserId = '', projects = [], options = {}) {
  const profile = panelOwnerProfile(ownerUserId, projects);
  const label = panelOwnerLabel(ownerUserId, projects) || panelDisplayName(ownerUserId, projects);
  const avatar = document.createElement('span');
  avatar.className = options.compact === true ? 'panel-owner-avatar is-compact' : 'panel-owner-avatar';
  avatar.setAttribute('aria-hidden', 'true');
  const fallback = document.createElement('span');
  fallback.className = 'panel-owner-avatar-fallback';
  fallback.textContent = String(label || '?').trim().slice(0, 1).toUpperCase() || '?';
  avatar.append(fallback);
  const photoUrl = safePanelPhotoUrl(profile);
  if (photoUrl) {
    const image = document.createElement('img');
    image.alt = '';
    image.loading = 'lazy';
    image.decoding = 'async';
    image.referrerPolicy = 'no-referrer';
    image.src = photoUrl;
    image.addEventListener('load', () => avatar.dataset.imageState = 'loaded', { once: true });
    image.addEventListener('error', () => image.remove(), { once: true });
    avatar.prepend(image);
  }
  return avatar;
}

function panelOwnerIdsWithAccess() {
  const ownerIds = new Set();
  const ownUserId = String(state.user?.userId || '').trim();
  if (ownUserId) ownerIds.add(ownUserId);
  for (const space of state.p2pState.spaces || []) {
    const ownerUserId = panelOwnerUserId(space);
    if (ownerUserId) ownerIds.add(ownerUserId);
  }
  for (const data of state.projects.values()) {
    const ownerUserId = panelOwnerUserId(data.space);
    if (ownerUserId) ownerIds.add(ownerUserId);
  }
  return [...ownerIds];
}

function panelDirectoryRequired() {
  const ownUserId = String(state.user?.userId || '').trim();
  return Boolean(ownUserId && panelOwnerIdsWithAccess().some((ownerUserId) => ownerUserId !== ownUserId));
}

function projectsForPanel(ownerUserId = '', options = {}) {
  return [...state.projects.values()].filter((data) => (
    panelOwnerUserId(data.space) === ownerUserId
    && (options.includeTrashed === true || !data.project.isTrashed)
  ));
}

function partiallyAcceptedPanelInvitationForOwner(ownerUserId = '') {
  const groups = new Map();
  for (const invitation of state.p2pState.invitations?.received || []) {
    const groupId = String(invitation?.invitationGroupId || '').trim();
    if (String(invitation?.invitationScope || '').toLowerCase() !== 'panel' || !groupId) continue;
    if (String(invitation?.inviterUserId || '').trim() !== ownerUserId) continue;
    if (!groups.has(groupId)) groups.set(groupId, new Set());
    groups.get(groupId).add(String(invitation?.status || '').trim().toLowerCase());
  }
  return [...groups.values()].some((statuses) => statuses.has('accepted') && statuses.has('pending'));
}

function panelIsComplete(ownerUserId = '') {
  if (!ownerUserId) return false;
  if (partiallyAcceptedPanelInvitationForOwner(ownerUserId)) return false;
  const authoritative = (state.p2pState.spaces || []).filter((space) => panelOwnerUserId(space) === ownerUserId);
  if (!authoritative.length) return false;
  return authoritative.every((space) => state.projects.has(space.spaceId));
}

function createProjectCard(data) {
  const card = document.createElement('article'); card.className = 'project-card';
  const lifecycleTransaction = activeProjectLifecycle(data.space.spaceId);
  const openButton = document.createElement('button'); openButton.type = 'button'; openButton.className = 'project-card-main'; openButton.dataset.openProject = data.space.spaceId;
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
  openButton.append(header, description, metrics);
  if (lifecycleTransaction) {
    card.dataset.lifecycle = lifecycleTransaction.action;
    openButton.disabled = true;
    const progress = lifecycleProgressNode(lifecycleTransaction);
    if (progress) openButton.append(progress);
  }
  const menu = contextMenuButton({ scope: 'project', spaceId: data.space.spaceId }, t('actions.projectMenu', 'Opciones del proyecto'));
  menu.disabled = Boolean(lifecycleTransaction && String(lifecycleTransaction.action || '').trim() !== 'trash');
  card.append(openButton, menu);
  return card;
}

function panelActionButtons(ownerUserId = '') {
  const buttons = [];
  if (ownerUserId === state.user?.userId) {
    const invite = document.createElement('button'); invite.type = 'button'; invite.className = 'button button-secondary button-compact panel-action-button'; invite.dataset.panelAction = 'invite'; invite.dataset.panelOwnerUserId = ownerUserId; invite.textContent = t('panel.invite', 'Invitar panel');
    const manage = document.createElement('button'); manage.type = 'button'; manage.className = 'button button-ghost button-compact panel-action-button'; manage.dataset.panelAction = 'manage'; manage.dataset.panelOwnerUserId = ownerUserId; manage.textContent = t('panel.manage', 'Participantes');
    buttons.push(invite, manage);
  } else {
    const leave = document.createElement('button'); leave.type = 'button'; leave.className = 'button button-ghost button-compact panel-action-button'; leave.dataset.panelAction = 'leave'; leave.dataset.panelOwnerUserId = ownerUserId; leave.textContent = t('panel.leave', 'Abandonar panel');
    buttons.push(leave);
  }
  return buttons;
}

function createPanelCard(ownerUserId = '', projects = []) {
  const panel = document.createElement('article'); panel.className = 'portfolio-panel-card'; panel.dataset.panelOwnerUserId = ownerUserId;
  const openButton = document.createElement('button'); openButton.type = 'button'; openButton.className = 'portfolio-panel-open'; openButton.dataset.openPanel = ownerUserId;
  openButton.setAttribute('aria-label', t('panel.open', 'Abrir {panel}').replace('{panel}', panelDisplayName(ownerUserId, projects)));
  const avatar = panelAvatarNode(ownerUserId, projects);
  const identity = document.createElement('span'); identity.className = 'portfolio-panel-identity';
  const eyebrow = document.createElement('span'); eyebrow.className = 'eyebrow'; eyebrow.textContent = ownerUserId === state.user?.userId ? t('panel.owned', 'Propio') : t('panel.invited', 'Invitado');
  const title = document.createElement('strong'); title.className = 'portfolio-panel-title'; title.textContent = panelDisplayName(ownerUserId, projects);
  const summary = document.createElement('span'); summary.className = 'portfolio-panel-summary'; summary.textContent = t('panel.projectCount', '{count} proyectos').replace('{count}', String(projects.length));
  identity.append(eyebrow, title, summary);
  const arrow = document.createElement('span'); arrow.className = 'portfolio-panel-arrow'; arrow.setAttribute('aria-hidden', 'true'); arrow.textContent = '→';
  openButton.append(avatar, identity, arrow);
  const actions = document.createElement('div'); actions.className = 'portfolio-panel-actions'; actions.append(...panelActionButtons(ownerUserId));
  panel.append(openButton, actions);
  return panel;
}

function configureDashboardChrome(mode = 'panel-projects', ownerUserId = '', projects = []) {
  const isDirectory = mode === 'panel-directory';
  const isOwnPanel = ownerUserId === state.user?.userId;
  elements.dashboardView.dataset.dashboardMode = mode;
  elements.portfolioMetrics.hidden = isDirectory;
  if (elements.projectFilterToolbar) elements.projectFilterToolbar.hidden = isDirectory;
  elements.newProjectButton.hidden = isDirectory || !isOwnPanel;
  elements.panelContextBar?.classList.toggle('hidden', isDirectory);
  if (elements.dashboardHeadingEyebrow) elements.dashboardHeadingEyebrow.textContent = isDirectory
    ? t('panel.directoryEyebrow', 'Espacios compartidos')
    : isOwnPanel ? t('panel.owned', 'Propio') : t('panel.invited', 'Invitado');
  if (elements.dashboardHeadingTitle) elements.dashboardHeadingTitle.textContent = isDirectory
    ? t('panel.directoryTitle', 'Tus paneles')
    : panelDisplayName(ownerUserId, projects);
  if (elements.dashboardHeadingDescription) elements.dashboardHeadingDescription.textContent = isDirectory
    ? t('panel.directoryDescription', 'Elige un panel para ver únicamente los proyectos que tienes autorizados en él.')
    : t('panel.projectCount', '{count} proyectos').replace('{count}', String(projects.length));
  if (isDirectory) return;

  if (elements.backToPanelsButton) elements.backToPanelsButton.hidden = !panelDirectoryRequired();
  if (elements.panelContextOwner) {
    elements.panelContextOwner.replaceChildren();
    const identity = document.createElement('span'); identity.className = 'panel-context-identity';
    const label = document.createElement('strong'); label.textContent = panelDisplayName(ownerUserId, projects);
    const owner = document.createElement('span'); owner.textContent = panelOwnerLabel(ownerUserId, projects) || (isOwnPanel ? (state.user?.email || '') : t('panel.sharedFallback', 'Panel compartido'));
    identity.append(label, owner);
    elements.panelContextOwner.append(panelAvatarNode(ownerUserId, projects, { compact: true }), identity);
  }
  if (elements.panelContextActions) {
    elements.panelContextActions.replaceChildren(...panelActionButtons(ownerUserId));
  }
}

function panelVisibilityAudit(ownerIds = []) {
  return ownerIds.map((ownerUserId) => {
    const authoritativeSpaces = (state.p2pState.spaces || []).filter((space) => panelOwnerUserId(space) === ownerUserId);
    const loadedProjects = projectsForPanel(ownerUserId);
    const missingSpaceIds = authoritativeSpaces.map((space) => String(space?.spaceId || '').trim()).filter((spaceId) => spaceId && !state.projects.has(spaceId));
    return {
      ownerUserId,
      authoritativeSpaceIds: authoritativeSpaces.map((space) => String(space?.spaceId || '').trim()).filter(Boolean),
      loadedSpaceIds: loadedProjects.map((data) => String(data?.space?.spaceId || '').trim()).filter(Boolean),
      missingSpaceIds,
      partiallyAccepted: partiallyAcceptedPanelInvitationForOwner(ownerUserId),
      complete: ownerUserId === state.user?.userId ? missingSpaceIds.length === 0 : panelIsComplete(ownerUserId)
    };
  });
}

function renderPanelDirectory(ownerIds = []) {
  configureDashboardChrome('panel-directory');
  elements.projectList.replaceChildren();
  const ownUserId = String(state.user?.userId || '').trim();
  const orderedOwnerIds = [...ownerIds].sort((a, b) => {
    if (a === ownUserId) return -1;
    if (b === ownUserId) return 1;
    return panelDisplayName(a, projectsForPanel(a)).localeCompare(panelDisplayName(b, projectsForPanel(b)), document.documentElement.lang || 'es');
  });
  let hiddenPanels = 0;
  for (const ownerUserId of orderedOwnerIds) {
    if (ownerUserId !== ownUserId && !panelIsComplete(ownerUserId)) { hiddenPanels += 1; continue; }
    elements.projectList.append(createPanelCard(ownerUserId, projectsForPanel(ownerUserId)));
  }
  if (hiddenPanels > 0) {
    const syncing = document.createElement('div'); syncing.className = 'panel-directory-syncing';
    syncing.innerHTML = `<strong>${t('panel.syncingTitle', 'Sincronizando paneles')}</strong><p>${t('panel.syncingCount', '{count} paneles compartidos todavía se están sincronizando.').replace('{count}', String(hiddenPanels))}</p>`;
    elements.projectList.append(syncing);
  }
}

function renderSelectedPanel(ownerUserId = '') {
  const panelProjects = projectsForPanel(ownerUserId)
    .sort((a, b) => String(b.project.updatedAt || '').localeCompare(String(a.project.updatedAt || '')));
  configureDashboardChrome('panel-projects', ownerUserId, panelProjects);
  renderPortfolioMetrics(panelProjects);
  elements.projectList.replaceChildren();
  const normalizedFilter = normalizeProjectFilterText(state.projectFilterQuery);
  const projects = normalizedFilter
    ? panelProjects.filter((item) => projectMatchesFilter(item.project, normalizedFilter))
    : panelProjects;
  if (elements.projectFilterInput && elements.projectFilterInput.value !== state.projectFilterQuery) elements.projectFilterInput.value = state.projectFilterQuery;
  if (elements.projectFilterClear) elements.projectFilterClear.hidden = !normalizedFilter;
  if (elements.projectFilterSummary) {
    elements.projectFilterSummary.hidden = !normalizedFilter;
    elements.projectFilterSummary.textContent = normalizedFilter
      ? t('dashboard.filterResults', '{shown} de {total} proyectos coinciden').replace('{shown}', String(projects.length)).replace('{total}', String(panelProjects.length))
      : '';
  }
  if (!panelProjects.length) {
    const empty = document.createElement('div'); empty.className = 'empty-state';
    empty.innerHTML = `<strong>${t('dashboard.emptyTitle', 'Aún no hay proyectos')}</strong><p>${t('dashboard.emptyDescription', 'Usa el botón + para crear el primero. Después podrás invitar participantes y registrar movimientos.')}</p>`;
    elements.projectList.append(empty); return;
  }
  if (!projects.length) {
    const empty = document.createElement('div'); empty.className = 'empty-state';
    empty.innerHTML = `<strong>${t('dashboard.filterNoResultsTitle', 'No hay proyectos coincidentes')}</strong><p>${t('dashboard.filterNoResultsDescription', 'Prueba con otra palabra del nombre, la descripción o la dirección.')}</p>`;
    elements.projectList.append(empty); return;
  }
  projects.forEach((data) => elements.projectList.append(createProjectCard(data)));
}

function renderDashboard(auditContext = {}) {
  if (!state.user?.userId) {
    elements.projectList.replaceChildren();
    elements.portfolioMetrics.replaceChildren();
    elements.panelContextBar?.classList.add('hidden');
    delete elements.dashboardView.dataset.dashboardMode;
    return;
  }
  const ownerIds = panelOwnerIdsWithAccess();
  const ownUserId = String(state.user.userId || '').trim();
  const directoryRequired = panelDirectoryRequired();
  if (!directoryRequired) state.selectedPanelOwnerUserId = ownUserId;
  if (state.selectedPanelOwnerUserId && !ownerIds.includes(state.selectedPanelOwnerUserId)) state.selectedPanelOwnerUserId = directoryRequired ? '' : ownUserId;
  if (state.selectedPanelOwnerUserId && state.selectedPanelOwnerUserId !== ownUserId && !panelIsComplete(state.selectedPanelOwnerUserId)) state.selectedPanelOwnerUserId = '';

  invitationAuditLog('frontend.ui.panel-visibility', {
    auditTraceId: String(auditContext?.auditTraceId || '').trim(),
    auditSource: String(auditContext?.source || '').trim(),
    userId: ownUserId,
    selectedPanelOwnerUserId: state.selectedPanelOwnerUserId,
    directoryRequired,
    panels: panelVisibilityAudit(ownerIds),
    ...XXXsenXXX({
      account: state.user,
      bootstrapSpaces: state.p2pState.spaces || [],
      loadedProjects: [...state.projects.values()],
      receivedInvitations: state.p2pState.invitations?.received || []
    })
  });

  if (directoryRequired && !state.selectedPanelOwnerUserId) renderPanelDirectory(ownerIds);
  else renderSelectedPanel(state.selectedPanelOwnerUserId || ownUserId);
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
  const acceptButton = [...elements.invitationList.querySelectorAll('button[data-decision="accept"]')]
    .find((button) => String(button.dataset.invitationIds || button.dataset.invitationId || '').split(',').includes(invitation.invitationId));
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
  const received = Array.isArray(state.p2pState.invitations?.received) ? state.p2pState.invitations.received : [];
  const pending = received.filter((invitation) => invitation.status === 'pending');
  const completePanelGroups = new Map();
  for (const invitation of received) {
    const groupId = String(invitation.invitationGroupId || '').trim();
    const isPanel = String(invitation.invitationScope || '').toLowerCase() === 'panel' && groupId;
    if (!isPanel) continue;
    const key = `${String(invitation.inviterUserId || '').trim()}:${groupId}`;
    if (!completePanelGroups.has(key)) completePanelGroups.set(key, []);
    const records = completePanelGroups.get(key);
    const invitationId = String(invitation.invitationId || '').trim();
    if (!records.some((candidate) => String(candidate?.invitationId || '').trim() === invitationId)) records.push(invitation);
  }

  const groups = [];
  const renderedPanelGroups = new Set();
  for (const invitation of pending) {
    const groupId = String(invitation.invitationGroupId || '').trim();
    const isPanel = String(invitation.invitationScope || '').toLowerCase() === 'panel' && groupId;
    if (!isPanel) { groups.push({ type: 'project', invitations: [invitation], allInvitations: [invitation] }); continue; }
    const key = `${String(invitation.inviterUserId || '').trim()}:${groupId}`;
    if (renderedPanelGroups.has(key)) continue;
    renderedPanelGroups.add(key);
    const allInvitations = completePanelGroups.get(key) || [invitation];
    groups.push({
      type: 'panel',
      groupId,
      invitations: allInvitations.filter((candidate) => candidate?.status === 'pending'),
      allInvitations
    });
  }

  elements.invitationCount.textContent = String(groups.length); elements.invitationCount.hidden = groups.length === 0; elements.invitationList.replaceChildren();
  if (!groups.length) { const empty = document.createElement('div'); empty.className = 'empty-state'; empty.textContent = t('invite.none', 'No tienes invitaciones pendientes.'); elements.invitationList.append(empty); return; }
  for (const group of groups) {
    const invitation = group.invitations[0] || group.allInvitations?.[0];
    const groupInvitations = group.type === 'panel' ? (group.allInvitations || group.invitations) : group.invitations;
    const ids = groupInvitations.map((item) => item.invitationId).filter(Boolean);
    const declaredExpectedCounts = Array.from(new Set(groupInvitations
      .map((item) => Math.max(0, Math.floor(Number(item?.invitationGroupExpectedCount || 0))))
      .filter((count) => count > 0)));
    const expectedCount = declaredExpectedCounts.length === 1 ? declaredExpectedCounts[0] : 0;
    const groupManifestConflict = declaredExpectedCounts.length > 1;
    const groupComplete = group.type !== 'panel'
      || (!groupManifestConflict && (!expectedCount || ids.length === expectedCount));
    const displayCount = group.type === 'panel' ? (expectedCount || ids.length) : 1;
    const item = document.createElement('article'); item.className = 'invitation-item';
    if (group.type === 'panel') item.dataset.groupState = groupComplete ? 'ready' : 'preparing';
    const content = document.createElement('div'); const title = document.createElement('h3');
    title.textContent = group.type === 'panel'
      ? t('panel.invitationTitle', 'Panel compartido · {count} proyectos').replace('{count}', String(displayCount))
      : invitation.title || t('project.defaultName', 'Proyecto compartido');
    const sender = document.createElement('p');
    const senderLabel = invitation.inviter?.displayName || invitation.inviter?.email || t('invite.someone', 'Un colaborador');
    sender.textContent = group.type === 'panel' && !groupComplete
      ? `${senderLabel} · ${t('p2p.replicaRecoveryBadge', 'Sincronizando')}`
      : senderLabel;
    content.append(title, sender);
    const actions = document.createElement('div'); actions.className = 'invitation-actions';
    for (const [decision, label, className] of [['reject', t('invite.reject', 'Rechazar'), 'button button-ghost button-compact'], ['accept', t('invite.accept', 'Aceptar'), 'button button-primary button-compact']]) {
      const button = document.createElement('button'); button.type = 'button'; button.className = className; button.dataset.invitationId = invitation.invitationId; button.dataset.invitationIds = ids.join(','); button.dataset.invitationGroupId = group.type === 'panel' ? group.groupId : ''; button.dataset.decision = decision; button.textContent = label;
      if (group.type === 'panel' && !groupComplete && decision !== 'reject') {
        button.disabled = true;
        button.title = t('panel.syncingDescription', 'Los paneles aparecen únicamente cuando todos sus proyectos autorizados están disponibles y validados en este dispositivo.');
      }
      if (decision === 'reject') {
        button.title = t('invite.rejectCleanup', 'Rechaza la invitación y limpia cualquier vinculación incompleta para poder recibir una nueva invitación.');
      }
      actions.append(button);
    }
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
    'delete-project': t('access.deleteConfirm', '{name} y todos sus registros dejarán de aparecer en las vistas activas. Podrás restaurarlo desde la papelera.').replace('{name}', label)
  };
  if (!messages[action]) return;
  state.pendingAccessAction = { action, userId, spaceId: data.space.spaceId, label };
  elements.accessConfirmMessage.textContent = messages[action];
  elements.accessConfirmButton.textContent = action === 'transfer'
    ? t('access.transferConfirmButton', 'Transferir')
    : action === 'leave'
      ? t('access.leaveConfirmButton', 'Abandonar')
      : action === 'delete-project'
        ? t('access.deleteConfirmButton', 'Mover a papelera')
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
    if (pending.action === 'delete-project') {
      const data = state.projects.get(pending.spaceId);
      if (!data?.project?._entity?.value) throw new Error(t('trash.projectUnavailable', 'No se encontró la versión actual del proyecto.'));
      result = await semillaP2P.trashProjectAfterReplicas(pending.spaceId, { expected: data.project._entity.value });
    }
    applyP2PState(semillaP2P.bootstrapState);
    clearAccessConfirmation();
    if (pending.action === 'leave') {
      await refreshProjects();
      closeDialog(elements.accessDialog); showDashboard();
      setStatus(elements.dashboardStatus, t('access.leftSuccess', 'Abandonaste el proyecto y su copia local fue retirada.'), 'success');
      return;
    }
    if (pending.action === 'delete-project') {
      await refreshProjects();
      closeDialog(elements.accessDialog); showDashboard();
      const transaction = result?.lifecycle || activeProjectLifecycle(pending.spaceId);
      setStatus(
        elements.dashboardStatus,
        result?.queued
          ? t('lifecycle.queuedOffline', 'La acción quedó guardada. Se enviará al recuperar conexión y este dispositivo se actualizará al final.')
          : transaction
            ? lifecycleStatusMessage(transaction)
            : t('lifecycle.queued', 'La acción quedó pendiente. Se aplicará en este dispositivo después de confirmar las demás copias.'),
        'warning'
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
    if (pending.action === 'delete-project' && error?.p2pQueued) {
      applyP2PState(semillaP2P.bootstrapState);
      await refreshProjects();
      clearAccessConfirmation();
      closeDialog(elements.accessDialog); showDashboard();
      setStatus(
        elements.dashboardStatus,
        Number(error?.p2pLocalDelivered || 0) > 0
          ? t('lifecycle.localNetworkStarted', 'La acción se envió por la red local. Este dispositivo se actualizará cuando las demás copias confirmen.')
          : t('lifecycle.queuedOffline', 'La acción quedó guardada. Se enviará al recuperar conexión y este dispositivo se actualizará al final.'),
        'warning'
      );
      return;
    }
    const message = error?.code === 'P2P_OWNERSHIP_TARGET_REPLICA_REQUIRED'
      ? t('access.transferReplicaRequired', 'El nuevo propietario debe abrir y sincronizar completamente el proyecto en al menos uno de sus dispositivos antes de recibir la propiedad.')
      : error?.message || t('access.error', 'No se pudo completar el cambio de acceso.');
    setStatus(elements.accessStatus, message, 'error');
  } finally { setP2PBusy(false); renderAccessManagement(); }
}
function emptyRecord(text) { const empty = document.createElement('div'); empty.className = 'empty-state'; empty.textContent = text; return empty; }
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
    } else amount.textContent = money(record.amount);
    const canEdit = userCan(type === 'projection' ? 'projection' : 'add');
    const canDelete = userCan('delete') && (type !== 'projection' || userCan('projection'));
    const menu = contextMenuButton(
      { scope: 'record', spaceId: state.selectedSpaceId, type, entityId: record.id },
      t('actions.recordMenu', 'Opciones del registro')
    );
    menu.disabled = !canEdit && !canDelete;
    if (type === 'projection' && (record.actualPurchaseIds || []).length) menu.dataset.linkedPurchases = 'true';
    item.append(content, amount, menu); container.append(item);
  }
}

function renderProject() {
  const data = selectedProjectData(); if (!data || data.project.isTrashed) { showDashboard(); return; }
  const lifecycleTransaction = activeProjectLifecycle(data.space.spaceId);
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
  const lifecycleLocked = Boolean(lifecycleTransaction);
  elements.inviteCollaboratorButton.disabled = lifecycleLocked || elements.inviteCollaboratorButton.disabled;
  elements.manageAccessButton.disabled = lifecycleLocked || elements.manageAccessButton.disabled;
  elements.editProjectButton.disabled = !isSelectedProjectOwner(); elements.addPurchaseButton.disabled = !userCan('add'); elements.addIncomeButton.disabled = !userCan('add'); elements.addProjectionButton.disabled = !userCan('projection');
  if (lifecycleLocked) [elements.editProjectButton, elements.addPurchaseButton, elements.addIncomeButton, elements.addProjectionButton].forEach((button) => { button.disabled = true; });
  if (lifecycleTransaction) setStatus(elements.projectStatus, lifecycleStatusMessage(lifecycleTransaction), 'warning');
  else if (authorizationUnconfirmed) setStatus(elements.projectStatus, replicaRecoveryPending ? t('p2p.replicaRecovery', 'La invitación ya fue aceptada. Esta copia permanece en solo lectura hasta recibir y validar el estado compartido completo.') : t('p2p.authorizationUnconfirmed', 'La copia local fue conservada porque el backend no confirmó la membresía ni emitió una revocación explícita. Puedes consultar la información, pero la edición y la sincronización quedan bloqueadas hasta recuperar la autorización.'), 'warning');
}

function rawAppNavigationHistoryState(historyState = window.history?.state) {
  const navigation = historyState && typeof historyState === 'object'
    ? historyState[APP_NAVIGATION_HISTORY_KEY]
    : null;
  if (!navigation || typeof navigation !== 'object') return null;
  if (navigation.version !== 1 || navigation.applicationId !== P2P_APPLICATION_ID) return null;
  return navigation;
}

function currentSessionNavigationHistoryState(historyState = window.history?.state) {
  const navigation = rawAppNavigationHistoryState(historyState);
  const userId = String(state.user?.userId || '').trim();
  if (!navigation || !userId || !state.navigationSessionId) return null;
  if (navigation.sessionId !== state.navigationSessionId || navigation.userId !== userId) return null;
  return navigation;
}

function currentNavigationDescriptor() {
  const userId = String(state.user?.userId || '').trim();
  if (!userId || !state.navigationSessionId) return null;
  if (state.selectedSpaceId) {
    const data = state.projects.get(state.selectedSpaceId);
    if (data && !data.project.isTrashed) {
      return {
        version: 1,
        applicationId: P2P_APPLICATION_ID,
        sessionId: state.navigationSessionId,
        userId,
        level: 'project',
        hasDirectoryParent: panelDirectoryRequired(),
        panelOwnerUserId: panelOwnerUserId(data.space) || state.selectedPanelOwnerUserId || userId,
        spaceId: state.selectedSpaceId
      };
    }
  }
  if (panelDirectoryRequired() && !state.selectedPanelOwnerUserId) {
    return {
      version: 1,
      applicationId: P2P_APPLICATION_ID,
      sessionId: state.navigationSessionId,
      userId,
      level: 'directory',
      hasDirectoryParent: false,
      panelOwnerUserId: '',
      spaceId: ''
    };
  }
  return {
    version: 1,
    applicationId: P2P_APPLICATION_ID,
    sessionId: state.navigationSessionId,
    userId,
    level: 'panel',
    hasDirectoryParent: panelDirectoryRequired(),
    panelOwnerUserId: state.selectedPanelOwnerUserId || userId,
    spaceId: ''
  };
}

function sameNavigationDescriptor(left = null, right = null) {
  if (!left || !right) return false;
  return left.version === right.version
    && left.applicationId === right.applicationId
    && left.sessionId === right.sessionId
    && left.userId === right.userId
    && left.level === right.level
    && left.hasDirectoryParent === right.hasDirectoryParent
    && left.panelOwnerUserId === right.panelOwnerUserId
    && left.spaceId === right.spaceId;
}

function synchronizeNavigationHistory(mode = 'replace') {
  const navigation = currentNavigationDescriptor();
  if (!navigation || !window.history) return false;
  const current = currentSessionNavigationHistoryState(window.history.state);
  if (sameNavigationDescriptor(current, navigation)) return true;
  const historyState = window.history.state && typeof window.history.state === 'object'
    ? { ...window.history.state }
    : {};
  historyState[APP_NAVIGATION_HISTORY_KEY] = navigation;
  try {
    if (mode === 'push' && typeof window.history.pushState === 'function') {
      window.history.pushState(historyState, '');
    } else if (typeof window.history.replaceState === 'function') {
      window.history.replaceState(historyState, '');
    } else {
      return false;
    }
    return true;
  } catch (error) {
    console.info('[SemillaP2P] El navegador no permitió registrar la navegación interna:', error);
    return false;
  }
}

function clearCurrentNavigationHistoryState() {
  if (!window.history || typeof window.history.replaceState !== 'function') return;
  const historyState = window.history.state && typeof window.history.state === 'object'
    ? { ...window.history.state }
    : null;
  if (!historyState || !(APP_NAVIGATION_HISTORY_KEY in historyState)) return;
  delete historyState[APP_NAVIGATION_HISTORY_KEY];
  try { window.history.replaceState(historyState, ''); } catch {}
}

function ensurePanelDirectoryHistoryParent(navigation = null) {
  if (!navigation || navigation.level !== 'panel' || navigation.hasDirectoryParent === true || !panelDirectoryRequired()) return false;
  if (!window.history || typeof window.history.replaceState !== 'function' || typeof window.history.pushState !== 'function') return false;
  const panelNavigation = currentNavigationDescriptor();
  if (!panelNavigation || panelNavigation.level !== 'panel') return false;
  const baseHistoryState = window.history.state && typeof window.history.state === 'object'
    ? { ...window.history.state }
    : {};
  const directoryNavigation = {
    ...panelNavigation,
    level: 'directory',
    hasDirectoryParent: false,
    panelOwnerUserId: '',
    spaceId: ''
  };
  try {
    window.history.replaceState({ ...baseHistoryState, [APP_NAVIGATION_HISTORY_KEY]: directoryNavigation }, '');
    window.history.pushState({ ...baseHistoryState, [APP_NAVIGATION_HISTORY_KEY]: { ...panelNavigation, hasDirectoryParent: true } }, '');
    return true;
  } catch (error) {
    console.info('[SemillaP2P] No se pudo reparar la jerarquía de navegación del panel:', error);
    return false;
  }
}

function showDashboard(options = {}) {
  state.selectedSpaceId = '';
  clearAccessConfirmation();
  elements.projectView.classList.add('hidden');
  elements.dashboardView.classList.remove('hidden');
  setStatus(elements.projectStatus, '');
  renderDashboard();
  if (options.historyMode !== 'none') synchronizeNavigationHistory(options.historyMode || 'replace');
}

function openPanel(ownerUserId = '', options = {}) {
  const cleanOwnerUserId = String(ownerUserId || '').trim();
  if (!cleanOwnerUserId || !panelOwnerIdsWithAccess().includes(cleanOwnerUserId)) return false;
  if (cleanOwnerUserId !== state.user?.userId && !panelIsComplete(cleanOwnerUserId)) return false;
  state.selectedPanelOwnerUserId = cleanOwnerUserId;
  state.projectFilterQuery = '';
  if (elements.projectFilterInput) elements.projectFilterInput.value = '';
  showDashboard({ historyMode: 'none' });
  if (options.historyMode !== 'none') synchronizeNavigationHistory(options.historyMode || 'push');
  window.scrollTo({ top: 0, behavior: 'smooth' });
  return true;
}

function showPanelDirectory(options = {}) {
  if (!panelDirectoryRequired()) return false;
  state.selectedPanelOwnerUserId = '';
  state.projectFilterQuery = '';
  if (elements.projectFilterInput) elements.projectFilterInput.value = '';
  showDashboard({ historyMode: 'none' });
  if (options.historyMode !== 'none') synchronizeNavigationHistory(options.historyMode || 'replace');
  window.scrollTo({ top: 0, behavior: 'smooth' });
  return true;
}

function openProject(spaceId, options = {}) {
  const data = state.projects.get(spaceId);
  if (!data || data.project.isTrashed) return false;
  state.selectedSpaceId = spaceId;
  state.selectedPanelOwnerUserId = panelOwnerUserId(data.space) || state.selectedPanelOwnerUserId;
  elements.dashboardView.classList.add('hidden');
  elements.projectView.classList.remove('hidden');
  renderProject();
  if (options.historyMode !== 'none') synchronizeNavigationHistory(options.historyMode || 'push');
  semillaP2P.refreshReplicaHealth([spaceId]).catch(() => null);
  window.scrollTo({ top: 0, behavior: 'smooth' });
  return true;
}

function restoreNavigationHistoryState(navigation = null) {
  if (!navigation) return false;
  const ownerUserId = String(navigation.panelOwnerUserId || '').trim();
  if (navigation.level === 'project') {
    const data = state.projects.get(String(navigation.spaceId || '').trim());
    if (data && !data.project.isTrashed) return openProject(data.space.spaceId, { historyMode: 'none' });
  } else if (navigation.level === 'panel') {
    if (ownerUserId && panelOwnerIdsWithAccess().includes(ownerUserId) && (ownerUserId === state.user?.userId || panelIsComplete(ownerUserId))) {
      state.selectedPanelOwnerUserId = ownerUserId;
      state.projectFilterQuery = '';
      if (elements.projectFilterInput) elements.projectFilterInput.value = '';
      showDashboard({ historyMode: 'none' });
      ensurePanelDirectoryHistoryParent(navigation);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return true;
    }
  } else if (navigation.level === 'directory' && panelDirectoryRequired()) {
    return showPanelDirectory({ historyMode: 'none' });
  }

  state.selectedPanelOwnerUserId = panelDirectoryRequired() ? '' : String(state.user?.userId || '').trim();
  state.projectFilterQuery = '';
  if (elements.projectFilterInput) elements.projectFilterInput.value = '';
  showDashboard({ historyMode: 'none' });
  synchronizeNavigationHistory('replace');
  return false;
}

function requestAppNavigationBack(fallback) {
  const navigation = currentSessionNavigationHistoryState(window.history?.state);
  if (navigation && ['project', 'panel'].includes(navigation.level) && typeof window.history?.back === 'function') {
    window.history.back();
    return;
  }
  fallback?.();
}

function handleAppNavigationPopState(event) {
  const rawNavigation = rawAppNavigationHistoryState(event.state);
  if (!rawNavigation) return;
  const navigation = currentSessionNavigationHistoryState(event.state);
  if (!navigation) {
    if (typeof window.history?.back === 'function') window.history.back();
    return;
  }
  if (navigation.level === 'directory' && !panelDirectoryRequired()) {
    if (typeof window.history?.back === 'function') window.history.back();
    return;
  }
  const activeNavigation = currentNavigationDescriptor();
  if (sameNavigationDescriptor(activeNavigation, navigation)) {
    if (typeof window.history?.back === 'function') window.history.back();
    return;
  }
  restoreNavigationHistoryState(navigation);
}

function applyP2PState(nextState = {}, auditContext = {}) {
  const directoryWasRequired = panelDirectoryRequired();
  state.p2pState = {
    spaces: Array.isArray(nextState.spaces) ? nextState.spaces : [],
    invitations: {
      received: Array.isArray(nextState.invitations?.received) ? nextState.invitations.received : [],
      sent: Array.isArray(nextState.invitations?.sent) ? nextState.invitations.sent : []
    },
    devices: Array.isArray(nextState.devices) ? nextState.devices : [],
    replicaHealth: nextState.replicaHealth && typeof nextState.replicaHealth === 'object' ? nextState.replicaHealth : {},
    lifecycleTransactions: Array.isArray(nextState.lifecycleTransactions) ? nextState.lifecycleTransactions : []
  };
  if (!directoryWasRequired && panelDirectoryRequired()) state.selectedPanelOwnerUserId = '';
  renderInvitations(); if (elements.devicesDialog?.open) renderDevices();
  if (!state.panelResponseInProgress) refreshProjects(auditContext).catch((error) => setStatus(elements.dashboardStatus, error?.message || t('dashboard.loadError', 'No se pudieron cargar los proyectos.'), 'error'));
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
    if (error?.code === 'BACKEND_NOT_CONFIGURED') {
      console.error('[semilla-auth] Falta APP_BACKEND_URL en src/js/runtime-config.js. Ejecuta el generador de release durante el build del Static Site.');
      showAuth(t('auth.backendNotConfigured', 'El servicio de acceso no está configurado para esta instalación. Contacta al administrador.'));
    } else {
      showAuth(error?.message || t('auth.loginError', 'No se pudo iniciar sesión con Google.'));
    }
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

function recordByType(type = '', entityId = '', options = {}) {
  const data = options.spaceId ? state.projects.get(options.spaceId) : selectedProjectData();
  const collections = options.trashed === true
    ? { purchase: data?.trash?.purchases, income: data?.trash?.incomes, projection: data?.trash?.projections }
    : { purchase: data?.purchases, income: data?.incomes, projection: data?.projections };
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

const RECORD_ENTITY_TYPES = Object.freeze({ purchase: PURCHASE_ENTITY_TYPE, income: INCOME_ENTITY_TYPE, projection: PROJECTION_ENTITY_TYPE });

function recordTypeLabel(type = '') {
  return {
    purchase: t('record.purchaseLabel', 'Compra'),
    income: t('record.incomeLabel', 'Ingreso'),
    projection: t('record.projectionLabel', 'Proyección')
  }[type] || t('record.genericLabel', 'Registro');
}

function recordCanEdit(space = null, type = '') {
  return spaceUserCan(space, type === 'projection' ? 'projection' : 'add');
}

function recordCanDelete(space = null, type = '') {
  return spaceUserCan(space, 'delete') && (type !== 'projection' || spaceUserCan(space, 'projection'));
}

function menuActionButton(action = '', icon = '', label = '', options = {}) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'action-menu-option';
  if (options.danger) button.classList.add('is-danger');
  button.dataset.menuAction = action;
  const iconNode = document.createElement('span'); iconNode.className = 'action-menu-icon'; iconNode.setAttribute('aria-hidden', 'true'); iconNode.textContent = icon;
  const labelNode = document.createElement('span'); labelNode.textContent = label;
  button.append(iconNode, labelNode);
  return button;
}

function clearActionMenuConfirmation() {
  state.pendingActionMenuAction = null;
  elements.actionMenuConfirmPanel?.classList.add('hidden');
  if (elements.actionMenuConfirmMessage) elements.actionMenuConfirmMessage.textContent = '';
  if (elements.actionMenuConfirmButton) elements.actionMenuConfirmButton.textContent = t('common.confirm', 'Confirmar');
}

function actionMenuContextFromButton(button = null) {
  if (!button) return null;
  const scope = String(button.dataset.actionMenuScope || '').trim();
  const spaceId = String(button.dataset.spaceId || '').trim();
  if (!scope || !spaceId) return null;
  return {
    scope,
    spaceId,
    type: String(button.dataset.recordType || '').trim(),
    entityId: String(button.dataset.entityId || '').trim()
  };
}

function actionMenuRecord(context = null) {
  if (!context?.type || !context?.entityId) return null;
  return recordByType(context.type, context.entityId, {
    spaceId: context.spaceId,
    trashed: context.scope === 'trash-record'
  });
}

function renderActionMenu() {
  const context = state.actionMenuContext;
  if (!context || !elements.actionMenuList) return;
  clearActionMenuConfirmation();
  setStatus(elements.actionMenuStatus, '');
  elements.actionMenuList.replaceChildren();
  const data = state.projects.get(context.spaceId);
  if (!data) return;
  const space = data.space;
  const actions = [];
  const lifecycleTransaction = activeProjectLifecycle(context.spaceId);

  if (lifecycleTransaction && String(lifecycleTransaction.action || '').trim() === 'trash' && isSpaceOwner(space)) {
    elements.actionMenuTitle.textContent = data.project.name;
    elements.actionMenuContext.textContent = t('lifecycle.recoveryContext', 'Envío a papelera pendiente de completar');
    actions.push(menuActionButton('retry-project-trash', '↻', t('lifecycle.retryAction', 'Reintentar')));
    actions.push(menuActionButton('cancel-project-trash', '↶', t('common.cancel', 'Cancelar')));
    elements.actionMenuList.append(...actions);
    return;
  }

  if (context.scope === 'project') {
    elements.actionMenuTitle.textContent = data.project.name;
    elements.actionMenuContext.textContent = t('actions.projectContext', 'Acciones generales del proyecto');
    actions.push(menuActionButton('open-project', '↗', t('actions.openProject', 'Abrir proyecto')));
    if (isSpaceOwner(space)) actions.push(menuActionButton('edit-project', '✎', t('common.edit', 'Editar')));
    if (!isAuthorizationUnconfirmed(space) && (isSpaceOwner(space) || spaceUserCan(space, 'invite'))) actions.push(menuActionButton('invite-project', '＋', t('project.invite', 'Invitar')));
    if (!isAuthorizationUnconfirmed(space) && (space.members || []).some((member) => member.userId === state.user?.userId)) actions.push(menuActionButton('manage-access', '♙', t('access.manage', 'Participantes')));
    if (isSpaceOwner(space)) actions.push(menuActionButton('trash-project', '♲', t('trash.moveProject', 'Mover a papelera'), { danger: true }));
  }

  if (context.scope === 'record') {
    const record = actionMenuRecord(context);
    elements.actionMenuTitle.textContent = record?.description || recordTypeLabel(context.type);
    elements.actionMenuContext.textContent = recordTypeLabel(context.type);
    if (record && recordCanEdit(space, context.type)) actions.push(menuActionButton('edit-record', '✎', t('common.edit', 'Editar')));
    if (record && recordCanDelete(space, context.type)) actions.push(menuActionButton('trash-record', '♲', t('trash.moveRecord', 'Mover a papelera'), { danger: true }));
  }

  if (context.scope === 'trash-project') {
    elements.actionMenuTitle.textContent = data.project.name;
    elements.actionMenuContext.textContent = t('trash.projectContext', 'Proyecto completo en la papelera');
    if (isSpaceOwner(space)) {
      actions.push(menuActionButton('restore-project', '↶', t('trash.restore', 'Restaurar')));
      actions.push(menuActionButton('purge-project', '×', t('trash.deletePermanently', 'Eliminar permanentemente'), { danger: true }));
    }
  }

  if (context.scope === 'trash-record') {
    const record = actionMenuRecord(context);
    elements.actionMenuTitle.textContent = record?.description || recordTypeLabel(context.type);
    elements.actionMenuContext.textContent = `${recordTypeLabel(context.type)} · ${t('trash.inTrash', 'En la papelera')}`;
    if (record && recordCanDelete(space, context.type)) {
      actions.push(menuActionButton('restore-record', '↶', t('trash.restore', 'Restaurar')));
      actions.push(menuActionButton('purge-record', '×', t('trash.deletePermanently', 'Eliminar permanentemente'), { danger: true }));
    }
  }

  if (!actions.length) elements.actionMenuList.append(emptyRecord(t('actions.noneAvailable', 'No hay acciones disponibles para tus permisos.')));
  else elements.actionMenuList.append(...actions);
}

function openActionMenu(context = null) {
  if (!context || state.p2pBusy) return;
  state.actionMenuContext = context;
  renderActionMenu();
  openDialog(elements.actionMenuDialog);
  elements.actionMenuList?.querySelector('button')?.focus();
}

function prepareActionMenuConfirmation(action = '') {
  const context = state.actionMenuContext;
  const data = context ? state.projects.get(context.spaceId) : null;
  const record = context ? actionMenuRecord(context) : null;
  if (!context || !data) return;
  const projectName = data.project.name || t('project.defaultName', 'Proyecto compartido');
  const recordName = record?.description || recordTypeLabel(context.type);
  const messages = {
    'trash-project': t('trash.confirmProject', 'El proyecto “{name}” y todos sus registros dejarán de aparecer en las vistas activas y en las métricas. Podrás restaurarlo desde la papelera.').replace('{name}', projectName),
    'trash-record': t('trash.confirmRecord', '“{name}” dejará de aparecer en el proyecto y dejará de afectar sus métricas. Podrás restaurarlo desde la papelera.').replace('{name}', recordName),
    'purge-project': t('trash.confirmPermanentProject', 'Se eliminarán permanentemente “{name}”, todos sus registros, el acceso de los participantes y las copias sincronizadas. Esta acción no se puede deshacer.').replace('{name}', projectName),
    'purge-record': t('trash.confirmPermanentRecord', 'Se eliminará permanentemente “{name}”. Ya no podrá restaurarse ni recuperarse desde otros dispositivos.').replace('{name}', recordName)
  };
  if (!messages[action]) return;
  state.pendingActionMenuAction = { action, context: { ...context } };
  elements.actionMenuConfirmMessage.textContent = messages[action];
  elements.actionMenuConfirmButton.textContent = action.startsWith('purge-')
    ? t('trash.deletePermanently', 'Eliminar permanentemente')
    : t('trash.moveToTrash', 'Mover a papelera');
  elements.actionMenuConfirmPanel.classList.remove('hidden');
  elements.actionMenuConfirmButton.focus();
}

async function purgeRecord(context = {}, record = null, data = null) {
  const entityType = RECORD_ENTITY_TYPES[context.type];
  if (!entityType || !record?._entity?.value || !data) throw new Error(t('trash.recordUnavailable', 'No se encontró la versión actual del registro.'));
  let queued = false;
  if (context.type === 'projection' && (record.actualPurchaseIds || []).length) {
    const error = new Error(t('projection.deleteLinkedError', 'No se puede eliminar una proyección con compras reales vinculadas. Desvincula o elimina esas compras primero.'));
    error.code = 'P2P_PROJECTION_LINKED';
    throw error;
  }
  if (context.type === 'projection' && data.strictProjectionLinks) {
    const activePurchaseIds = new Set((data.purchases || []).map((purchase) => String(purchase.id || '')).filter(Boolean));
    const orphanLinks = (data.projectionLinks || []).filter((link) => (
      link?.active !== false
      && String(link?.projectionId || '') === String(context.entityId || '')
      && !activePurchaseIds.has(String(link?.purchaseId || link?.id || ''))
    ));
    for (const link of orphanLinks) {
      try {
        await semillaP2P.purge(context.spaceId, PROJECTION_LINK_ENTITY_TYPE, link.id, { expected: link._entity?.value || link });
      } catch (error) {
        if (!error?.p2pQueued) throw error;
        queued = true;
      }
    }
  }
  const result = await semillaP2P.purge(context.spaceId, entityType, context.entityId, {
    expected: record._entity.value,
    ...(context.type === 'purchase' && data.strictProjectionLinks && record.projectionLink ? {
      dependentDeletes: [{ entityType: PROJECTION_LINK_ENTITY_TYPE, entityId: context.entityId, relation: 'admin.purchase-projection-link-v1' }]
    } : {}),
    ...(context.type === 'projection' ? {
      referenceGuards: data.strictProjectionLinks
        ? [{ entityType: PROJECTION_LINK_ENTITY_TYPE, field: 'projectionId', equals: context.entityId }]
        : [{ entityType: PURCHASE_ENTITY_TYPE, field: 'projectionId', equals: context.entityId }]
    } : {})
  });
  return { result, queued };
}

async function executeLifecycleAction(action = '', context = null) {
  const data = context ? state.projects.get(context.spaceId) : null;
  if (!context || !data || state.p2pBusy) return;
  const isProjectAction = action.endsWith('-project');
  const record = isProjectAction ? null : actionMenuRecord(context);
  setP2PBusy(true);
  setStatus(elements.actionMenuStatus, t('trash.processing', 'Aplicando cambio…'));
  try {
    let result = null;
    let queued = false;
    if (isProjectAction) {
      if (!isSpaceOwner(data.space)) throw new Error(t('permissions.ownerRequired', 'Solo el propietario puede realizar esta acción.'));
      if (action === 'trash-project') result = await semillaP2P.trashProjectAfterReplicas(context.spaceId, { expected: data.project._entity?.value || {} });
      if (action === 'restore-project') result = await semillaP2P.restoreProjectAfterReplicas(context.spaceId, { expected: data.project._entity?.value || {} });
      if (action === 'purge-project') result = await semillaP2P.deleteProjectAfterReplicas(context.spaceId);
    } else {
      if (!recordCanDelete(data.space, context.type)) throw new Error(t('permissions.deleteDenied', 'No tienes permiso para eliminar registros.'));
      const entityType = RECORD_ENTITY_TYPES[context.type];
      if (!entityType || !record?._entity?.value) throw new Error(t('trash.recordUnavailable', 'No se encontró la versión actual del registro.'));
      if (context.type === 'projection' && (record.actualPurchaseIds || []).length && action !== 'restore-record') {
        throw new Error(t('projection.deleteLinkedError', 'No se puede eliminar una proyección con compras reales vinculadas. Desvincula o elimina esas compras primero.'));
      }
      if (action === 'trash-record') result = await semillaP2P.trash(context.spaceId, entityType, context.entityId, { expected: record._entity.value });
      if (action === 'restore-record') result = await semillaP2P.restore(context.spaceId, entityType, context.entityId, { expected: record._entity.value });
      if (action === 'purge-record') {
        const purge = await purgeRecord(context, record, data);
        result = purge.result;
        queued = purge.queued;
      }
    }
    applyP2PState(semillaP2P.bootstrapState);
    await refreshProjects();
    clearActionMenuConfirmation();
    closeDialog(elements.actionMenuDialog);
    const coordinatedProjectAction = isProjectAction && ['trash-project', 'restore-project', 'purge-project'].includes(action);
    if (coordinatedProjectAction) {
      showDashboard();
      if (elements.trashDialog?.open) renderTrash();
      const transaction = result?.lifecycle || activeProjectLifecycle(context.spaceId);
      const target = elements.trashDialog?.open ? elements.trashStatus : elements.dashboardStatus;
      const pendingMessage = transaction
        ? lifecycleStatusMessage(transaction)
        : t('lifecycle.queued', 'La acción quedó pendiente. Se aplicará en este dispositivo después de confirmar las demás copias.');
      setStatus(target, queued || result?.queued ? t('lifecycle.queuedOffline', 'La acción quedó guardada. Se enviará al recuperar conexión y este dispositivo se actualizará al final.') : pendingMessage, 'warning');
      return;
    }
    if (isProjectAction && action !== 'restore-project') showDashboard();
    if (elements.trashDialog?.open) renderTrash();
    const message = action.startsWith('trash-')
      ? t('trash.movedSuccess', 'El elemento fue enviado a la papelera y dejó de afectar las vistas activas.')
      : action.startsWith('restore-')
        ? t('trash.restoredSuccess', 'El elemento fue restaurado correctamente.')
        : t('trash.purgedSuccess', 'El elemento fue eliminado permanentemente.');
    const target = elements.trashDialog?.open ? elements.trashStatus : elements.dashboardStatus;
    setStatus(target, queued || result?.queued ? t('p2p.queuedOffline', 'El cambio quedó guardado localmente y se enviará al recuperar conexión.') : message, 'success');
  } catch (error) {
    if (error?.p2pQueued) {
      applyP2PState(semillaP2P.bootstrapState);
      await refreshProjects();
      closeDialog(elements.actionMenuDialog);
      const isCoordinatedProjectAction = context?.scope?.includes('project') && ['trash-project', 'restore-project', 'purge-project'].includes(action);
      const message = isCoordinatedProjectAction
        ? Number(error?.p2pLocalDelivered || 0) > 0
          ? t('lifecycle.localNetworkStarted', 'La acción se envió por la red local. Este dispositivo se actualizará cuando las demás copias confirmen.')
          : t('lifecycle.queuedOffline', 'La acción quedó guardada. Se enviará al recuperar conexión y este dispositivo se actualizará al final.')
        : t('p2p.queuedOffline', 'El cambio quedó guardado localmente y se enviará al recuperar conexión.');
      setStatus(elements.trashDialog?.open ? elements.trashStatus : elements.dashboardStatus, message, isCoordinatedProjectAction ? 'warning' : 'success');
    } else {
      setStatus(elements.actionMenuStatus, error?.message || t('trash.actionError', 'No se pudo completar la acción.'), 'error');
    }
  } finally {
    setP2PBusy(false);
  }
}

async function executeProjectTrashRecovery(action = '', context = null) {
  const data = context ? state.projects.get(context.spaceId) : null;
  const transaction = context ? activeProjectLifecycle(context.spaceId) : null;
  if (!context || !data || !transaction || state.p2pBusy || String(transaction.action || '').trim() !== 'trash') return;
  if (!isSpaceOwner(data.space)) return;
  setP2PBusy(true);
  setStatus(elements.actionMenuStatus, action === 'cancel-project-trash'
    ? t('lifecycle.cancelling', 'Cancelando el envío a papelera…')
    : t('lifecycle.retrying', 'Revisando réplicas y reintentando…'));
  try {
    const result = action === 'cancel-project-trash'
      ? await semillaP2P.cancelProjectTrash(transaction.transactionId)
      : await semillaP2P.retryProjectLifecycle(transaction.transactionId);
    applyP2PState(semillaP2P.bootstrapState);
    await refreshProjects();
    closeDialog(elements.actionMenuDialog);
    showDashboard();
    if (elements.trashDialog?.open) renderTrash();
    const target = elements.trashDialog?.open ? elements.trashStatus : elements.dashboardStatus;
    if (action === 'cancel-project-trash') {
      const pending = result?.queued === true || result?.completed !== true;
      setStatus(
        target,
        pending
          ? t('lifecycle.cancelPending', 'El proyecto volvió al panel en este dispositivo. La restauración seguirá propagándose hasta deshacer la papelera en las demás copias.')
          : t('lifecycle.cancelCompleted', 'El envío a papelera fue cancelado y el proyecto quedó restaurado en las copias sincronizadas.'),
        pending ? 'warning' : 'success'
      );
    } else {
      const pending = result?.queued === true || result?.completed !== true;
      setStatus(
        target,
        pending
          ? t('lifecycle.retryPending', 'Se conservaron las réplicas que ya confirmaron la papelera y se reintentaron únicamente las pendientes. El dispositivo iniciador se actualizará al final.')
          : t('lifecycle.retryCompleted', 'El reintento confirmó las réplicas pendientes y completó el envío a papelera en este dispositivo.'),
        pending ? 'warning' : 'success'
      );
    }
  } catch (error) {
    setStatus(elements.actionMenuStatus, error?.message || t('lifecycle.recoveryError', 'No se pudo recuperar la acción de papelera.'), 'error');
  } finally {
    setP2PBusy(false);
    renderDashboard();
    if (elements.trashDialog?.open) renderTrash();
  }
}

async function executeActionMenuConfirmation() {
  const pending = state.pendingActionMenuAction;
  if (!pending) return;
  await executeLifecycleAction(pending.action, pending.context);
}

async function handleActionMenuSelection(event) {
  const button = event.target.closest('button[data-menu-action]');
  if (!button || state.p2pBusy) return;
  const action = button.dataset.menuAction;
  const context = state.actionMenuContext;
  if (!context) return;
  if (action === 'retry-project-trash' || action === 'cancel-project-trash') {
    await executeProjectTrashRecovery(action, context);
    return;
  }
  if (['trash-project', 'trash-record', 'purge-project', 'purge-record'].includes(action)) {
    prepareActionMenuConfirmation(action);
    return;
  }
  if (action === 'restore-project' || action === 'restore-record') {
    await executeLifecycleAction(action, context);
    return;
  }
  closeDialog(elements.actionMenuDialog);
  if (action === 'open-project') openProject(context.spaceId);
  if (action === 'edit-project') { openProject(context.spaceId); openProjectForm('edit'); }
  if (action === 'invite-project') { openProject(context.spaceId); openInviteForm(); }
  if (action === 'manage-access') { openProject(context.spaceId); openAccessManagement(); }
  if (action === 'edit-record') {
    openProject(context.spaceId);
    const record = recordByType(context.type, context.entityId);
    if (record) openRecordForm(context.type, record);
  }
}

function trashRecordDetail(type = '', record = {}) {
  if (type === 'purchase') return [record.invoiceNumber ? `${t('record.invoiceShort', 'Factura')}: ${record.invoiceNumber}` : '', money(record.amount)].filter(Boolean).join(' · ');
  if (type === 'income') return money(record.amount);
  return money(record.projectedAmount);
}

function renderTrashItem(data = null, context = null, titleText = '', detailText = '') {
  const item = document.createElement('article'); item.className = 'trash-item';
  const content = document.createElement('div');
  const title = document.createElement('h3'); title.textContent = titleText;
  const detail = document.createElement('p'); detail.textContent = [detailText, context.scope === 'trash-project' ? shortDateTime(data.project.trashedAt) : shortDateTime(actionMenuRecord(context)?.trashedAt)].filter(Boolean).join(' · ');
  content.append(title, detail);
  const menu = contextMenuButton(context, t('actions.trashMenu', 'Opciones del elemento en papelera'));
  const lifecycleTransaction = context.scope === 'trash-project' ? activeProjectLifecycle(data.space.spaceId) : null;
  const canAct = context.scope === 'trash-project' ? isSpaceOwner(data.space) : recordCanDelete(data.space, context.type);
  menu.disabled = !canAct || Boolean(lifecycleTransaction && String(lifecycleTransaction.action || '').trim() !== 'trash');
  item.append(content);
  if (lifecycleTransaction) {
    item.dataset.lifecycle = lifecycleTransaction.action;
    const progress = lifecycleProgressNode(lifecycleTransaction, { compact: true });
    if (progress) item.append(progress);
  }
  item.append(menu);
  return item;
}

function renderTrash() {
  if (!elements.trashList || !elements.trashCount) return;
  elements.trashList.replaceChildren();
  let count = 0;
  const ordered = [...state.projects.values()].sort((left, right) => String(right.project.trashedAt || right.project.updatedAt || '').localeCompare(String(left.project.trashedAt || left.project.updatedAt || '')));
  for (const data of ordered) {
    if (data.project.isTrashed) {
      count += 1;
      const section = document.createElement('section'); section.className = 'trash-section';
      const heading = document.createElement('h3'); heading.textContent = t('trash.projectsSection', 'Proyectos eliminados');
      section.append(heading, renderTrashItem(data, { scope: 'trash-project', spaceId: data.space.spaceId }, data.project.name, t('trash.completeProject', 'Proyecto completo')));
      elements.trashList.append(section);
      continue;
    }
    const records = [
      ...(data.trash?.purchases || []).map((record) => ({ type: 'purchase', record })),
      ...(data.trash?.projections || []).map((record) => ({ type: 'projection', record })),
      ...(data.trash?.incomes || []).map((record) => ({ type: 'income', record }))
    ].sort((left, right) => String(right.record.trashedAt || '').localeCompare(String(left.record.trashedAt || '')));
    if (!records.length) continue;
    count += records.length;
    const section = document.createElement('section'); section.className = 'trash-section';
    const heading = document.createElement('h3'); heading.textContent = data.project.name;
    section.append(heading);
    for (const entry of records) {
      const context = { scope: 'trash-record', spaceId: data.space.spaceId, type: entry.type, entityId: entry.record.id };
      section.append(renderTrashItem(data, context, entry.record.description || recordTypeLabel(entry.type), `${recordTypeLabel(entry.type)} · ${trashRecordDetail(entry.type, entry.record)}`));
    }
    elements.trashList.append(section);
  }
  elements.trashCount.textContent = String(count);
  elements.trashCount.hidden = count === 0;
  if (!count) elements.trashList.append(emptyRecord(t('trash.empty', 'La papelera está vacía.')));
}

function openTrashDialog() {
  renderTrash();
  setStatus(elements.trashStatus, '');
  openDialog(elements.trashDialog);
}

function openInviteForm(options = {}) {
  const scope = options?.scope === 'panel' ? 'panel' : 'project';
  if (scope === 'project' && !selectedProjectData()) return;
  const ownerUserId = String(options?.ownerUserId || state.user?.userId || '').trim();
  const panelProjects = scope === 'panel' ? projectsForPanel(ownerUserId) : [];
  if (scope === 'panel' && (!panelProjects.length || ownerUserId !== state.user?.userId)) return;
  state.inviteContext = scope === 'panel'
    ? { scope, ownerUserId, spaceIds: panelProjects.map((data) => data.space.spaceId), invitationGroupId: '' }
    : { scope, spaceId: selectedProjectData().space.spaceId };
  elements.inviteForm.reset();
  const read = elements.inviteForm.querySelector('input[value="read"]'); if (read) read.checked = true;
  const add = elements.inviteForm.querySelector('input[value="add"]'); if (add) add.checked = true;
  const projection = elements.inviteForm.querySelector('input[value="projection"]'); if (projection) projection.checked = true;
  if (elements.inviteDialogTitle) elements.inviteDialogTitle.textContent = scope === 'panel' ? t('panel.inviteTitle', 'Invitar al panel completo') : t('invite.title', 'Invitar participante');
  if (elements.inviteDialogDescription) elements.inviteDialogDescription.textContent = scope === 'panel'
    ? t('panel.inviteDescription', 'La persona recibirá una sola invitación visual y, al aceptarla, se incorporarán todos los proyectos actuales del panel con sus claves cifradas y permisos seleccionados.')
    : t('invite.projectDescription', 'Comparte únicamente este proyecto con los permisos seleccionados.');
  setStatus(elements.inviteStatus, ''); openDialog(elements.inviteDialog); elements.inviteEmailInput.focus();
}

async function submitInvitation(event) {
  event.preventDefault(); if (state.p2pBusy) return;
  const context = state.inviteContext || { scope: 'project', spaceId: selectedProjectData()?.space?.spaceId || '' };
  const data = context.scope === 'project' ? selectedProjectData() : null;
  const email = String(elements.inviteEmailInput.value || '').trim();
  const permissions = normalizeCollaborationPermissions([...elements.inviteForm.querySelectorAll('input[name="permission"]:checked')].map((input) => input.value));
  if (!email || (context.scope === 'project' && !data) || (context.scope === 'panel' && !context.spaceIds?.length)) return;
  setP2PBusy(true); setStatus(elements.inviteStatus, t('invite.sending', 'Enviando invitación…'));
  const auditTraceId = createInvitationAuditTraceId(context.scope === 'panel' ? 'ui_panel_invite' : 'ui_project_invite');
  invitationAuditLog('frontend.ui.invite-submit', {
    auditTraceId,
    scope: context.scope,
    recipientEmail: maskInvitationAuditEmail(email),
    spaceIds: context.scope === 'panel' ? [...(context.spaceIds || [])] : [data?.space?.spaceId].filter(Boolean),
    invitationGroupId: String(context.invitationGroupId || '').trim(),
    permissions,
    ...XXXsenXXX({ recipientEmail: email, inviteContext: context, selectedProject: data })
  });
  try {
    const result = context.scope === 'panel'
      ? await semillaP2P.invitePanel(email, { spaceIds: context.spaceIds, permissions, invitationGroupId: context.invitationGroupId || '', auditTraceId })
      : await semillaP2P.invite(email, { spaceId: data.space.spaceId, resourceType: 'admin.project', permissions, auditTraceId });
    invitationAuditLog('frontend.ui.invite-submit-complete', {
      auditTraceId,
      scope: context.scope,
      invitationGroupId: String(result?.invitationGroupId || result?.invitation?.invitationGroupId || '').trim(),
      invitationIds: context.scope === 'panel'
        ? (result?.invitations || []).map((invitation) => String(invitation?.invitationId || '').trim()).filter(Boolean)
        : [String(result?.invitation?.invitationId || '').trim()].filter(Boolean),
      spaceIds: context.scope === 'panel'
        ? (result?.spaceIds || context.spaceIds || []).map((spaceId) => String(spaceId || '').trim()).filter(Boolean)
        : [String(result?.space?.spaceId || result?.invitation?.spaceId || data?.space?.spaceId || '').trim()].filter(Boolean),
      reused: result?.reused === true,
      ...XXXsenXXX({ result, bootstrapState: semillaP2P.bootstrapState })
    });
    applyP2PState(semillaP2P.bootstrapState);
    closeDialog(elements.inviteDialog);
    state.inviteContext = null;
    const targetStatus = context.scope === 'panel' ? elements.dashboardStatus : elements.projectStatus;
    const message = context.scope === 'panel'
      ? (result.reused ? t('panel.inviteAlreadyPending', 'La invitación del panel ya estaba pendiente.') : t('panel.inviteSent', 'Invitación del panel enviada correctamente.'))
      : (result.reused ? t('invite.alreadyPending', 'La invitación ya estaba pendiente.') : t('invite.sent', 'Invitación enviada correctamente.'));
    setStatus(targetStatus, message, 'success');
  } catch (error) {
    invitationAuditLog('frontend.ui.invite-submit-error', {
      auditTraceId,
      scope: context.scope,
      invitationGroupId: String(error?.panelInvitationGroupId || context.invitationGroupId || '').trim(),
      error: invitationAuditError(error),
      ...XXXsenXXX({ recipientEmail: email, inviteContext: context, error })
    });
    if (context.scope === 'panel' && error?.panelInvitationGroupId) state.inviteContext.invitationGroupId = error.panelInvitationGroupId;
    setStatus(elements.inviteStatus, error?.message || t('invite.error', 'No se pudo enviar la invitación.'), 'error');
  } finally { setP2PBusy(false); }
}

async function respondInvitation(event) {
  const button = event.target.closest('button[data-invitation-id]'); if (!button || state.p2pBusy) return;
  const ids = Array.from(new Set(String(button.dataset.invitationIds || button.dataset.invitationId || '').split(',').map((value) => value.trim()).filter(Boolean)));
  const isPanelGroup = Boolean(button.dataset.invitationGroupId);
  const auditTraceId = createInvitationAuditTraceId(isPanelGroup ? 'ui_panel_response' : 'ui_project_response');
  invitationAuditLog('frontend.ui.response-click', {
    auditTraceId,
    invitationIds: ids,
    invitationGroupId: String(button.dataset.invitationGroupId || '').trim(),
    decision: String(button.dataset.decision || '').trim(),
    isPanelGroup
  });
  if (String(button.dataset.decision || '').trim().toLowerCase() === 'reject') {
    invitationRejectLog('frontend.ui.reject-click', {
      auditTraceId,
      invitationIds: ids,
      invitationGroupId: String(button.dataset.invitationGroupId || '').trim(),
      isPanelGroup
    });
  }
  setP2PBusy(true);
  state.panelResponseInProgress = isPanelGroup;
  try {
    const result = isPanelGroup
      ? await semillaP2P.respondToInvitationGroup(ids, button.dataset.decision, { auditTraceId })
      : await semillaP2P.respondToInvitation(ids[0], button.dataset.decision, { auditTraceId });
    const invitation = isPanelGroup ? result?.invitations?.[0] : result?.invitation;
    const canonicalDecision = resolveCanonicalInvitationDecision(invitation, button.dataset.decision);
    const accessRevoked = result?.accessRevoked === true;
    const replicaPending = result?.replicaPending === true;
    invitationAuditLog('frontend.ui.response-result', {
      auditTraceId,
      invitationIds: ids,
      invitationGroupId: String(button.dataset.invitationGroupId || result?.invitationGroupId || '').trim(),
      requestedDecision: String(button.dataset.decision || '').trim(),
      canonicalDecision,
      accessRevoked,
      replicaPending,
      bootstrapSpaceIds: (semillaP2P.bootstrapState?.spaces || []).map((space) => String(space?.spaceId || '').trim()).filter(Boolean),
      recoveryRequirements: semillaP2P.recoveryRequirements || {},
      ...XXXsenXXX({ result, bootstrapState: semillaP2P.bootstrapState, recoveryRequirements: semillaP2P.recoveryRequirements || {} })
    });
    state.panelResponseInProgress = false;
    applyP2PState(semillaP2P.bootstrapState, { auditTraceId, source: 'invitation-response' });
    if (!(state.p2pState.invitations.received || []).some((item) => item.status === 'pending')) closeDialog(elements.invitationsDialog);
    const message = accessRevoked ? t('invite.acceptedAccessRevoked', 'La invitación fue aceptada, pero el acceso fue revocado antes de completar la sincronización.') : replicaPending ? t('invite.acceptedSyncing', 'Invitación aceptada. Estamos recuperando la copia compartida antes de habilitar la edición.') : canonicalDecision === 'accept' ? (isPanelGroup ? t('panel.accepted', 'Panel aceptado y sincronizado.') : t('invite.accepted', 'Invitación aceptada.')) : (isPanelGroup ? t('panel.rejected', 'Invitación del panel rechazada.') : t('invite.rejected', 'Invitación rechazada.'));
    setStatus(elements.dashboardStatus, message, accessRevoked || replicaPending ? 'warning' : 'success');
    if (String(button.dataset.decision || '').trim().toLowerCase() === 'reject') {
      invitationRejectLog('frontend.ui.reject-complete', {
        auditTraceId,
        invitationIds: ids,
        invitationGroupId: String(button.dataset.invitationGroupId || result?.invitationGroupId || '').trim(),
        removedSpaceIds: Array.isArray(result?.removedSpaceIds) ? result.removedSpaceIds : [],
        alreadyCleaned: result?.alreadyCleaned === true
      });
    }
  } catch (error) {
    invitationAuditLog('frontend.ui.response-error', {
      auditTraceId,
      invitationIds: ids,
      invitationGroupId: String(button.dataset.invitationGroupId || '').trim(),
      decision: String(button.dataset.decision || '').trim(),
      error: invitationAuditError(error),
      bootstrapSpaceIds: (semillaP2P.bootstrapState?.spaces || []).map((space) => String(space?.spaceId || '').trim()).filter(Boolean),
      recoveryRequirements: semillaP2P.recoveryRequirements || {},
      ...XXXsenXXX({ error, bootstrapState: semillaP2P.bootstrapState, recoveryRequirements: semillaP2P.recoveryRequirements || {} })
    });
    if (String(button.dataset.decision || '').trim().toLowerCase() === 'reject') {
      invitationRejectLog('frontend.ui.reject-error', {
        auditTraceId,
        invitationIds: ids,
        invitationGroupId: String(button.dataset.invitationGroupId || '').trim(),
        error: invitationAuditError(error)
      });
    }
    state.panelResponseInProgress = false;
    applyP2PState(semillaP2P.bootstrapState, { auditTraceId, source: 'invitation-response-error' });
    setStatus(elements.dashboardStatus, error?.message || t('invite.responseError', 'No se pudo responder la invitación.'), 'error');
  } finally { state.panelResponseInProgress = false; setP2PBusy(false); }
}

function renderPanelAccess(ownerUserId = state.panelAccessOwnerUserId) {
  if (!elements.panelAccessList) return;
  const projects = projectsForPanel(ownerUserId);
  elements.panelAccessList.replaceChildren();
  const members = new Map();
  for (const data of projects) {
    for (const member of data.space.members || []) {
      if (!member?.userId || member.role === 'owner') continue;
      const current = members.get(member.userId) || { member, projectCount: 0 };
      current.projectCount += 1; current.member = current.member?.profile ? current.member : member; members.set(member.userId, current);
    }
  }
  if (!members.size) { elements.panelAccessList.append(emptyRecord(t('panel.noParticipants', 'Este panel no tiene participantes invitados.'))); return; }
  for (const [userId, entry] of members) {
    const row = document.createElement('article'); row.className = 'access-member';
    const info = document.createElement('div'); const title = document.createElement('h3'); title.textContent = memberLabel(entry.member); const detail = document.createElement('p'); detail.textContent = t('panel.participantProjects', 'Acceso a {count} proyectos').replace('{count}', String(entry.projectCount)); info.append(title, detail);
    const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'button button-danger button-compact'; remove.dataset.panelRevokeUserId = userId; remove.textContent = t('panel.removeParticipant', 'Quitar del panel');
    row.append(info, remove); elements.panelAccessList.append(row);
  }
}

function openPanelAccess(ownerUserId = '') {
  if (!ownerUserId || ownerUserId !== state.user?.userId) return;
  state.panelAccessOwnerUserId = ownerUserId;
  setStatus(elements.panelAccessStatus, ''); renderPanelAccess(ownerUserId); openDialog(elements.panelAccessDialog);
}

async function revokePanelParticipant(userId = '') {
  const ownerUserId = state.panelAccessOwnerUserId;
  const projects = projectsForPanel(ownerUserId);
  const targets = projects.filter((data) => (data.space.members || []).some((member) => member.userId === userId && member.role !== 'owner'));
  if (!targets.length || state.p2pBusy) return;
  setP2PBusy(true); setStatus(elements.panelAccessStatus, t('panel.removingParticipant', 'Retirando acceso del panel…'));
  try {
    for (const data of targets) await semillaP2P.revoke(data.space.spaceId, userId);
    applyP2PState(semillaP2P.bootstrapState); renderPanelAccess(ownerUserId);
    setStatus(elements.panelAccessStatus, t('panel.participantRemoved', 'El participante ya no tiene acceso a ningún proyecto de este panel.'), 'success');
  } catch (error) { applyP2PState(semillaP2P.bootstrapState); setStatus(elements.panelAccessStatus, error?.message || t('panel.removeError', 'No se pudo retirar el acceso completo del panel.'), 'error'); }
  finally { setP2PBusy(false); }
}

async function leavePanel(ownerUserId = '', button = null) {
  const projects = projectsForPanel(ownerUserId);
  if (!projects.length || ownerUserId === state.user?.userId || state.p2pBusy) return;
  if (button?.dataset.confirmArmed !== 'true') {
    if (button) { button.dataset.confirmArmed = 'true'; button.classList.remove('button-ghost'); button.classList.add('button-danger'); button.textContent = t('panel.leaveConfirm', 'Confirmar salida'); window.setTimeout(() => { if (!button.isConnected) return; delete button.dataset.confirmArmed; button.classList.remove('button-danger'); button.classList.add('button-ghost'); button.textContent = t('panel.leave', 'Abandonar panel'); }, 6000); }
    return;
  }
  setP2PBusy(true); setStatus(elements.dashboardStatus, t('panel.leaving', 'Abandonando panel…'));
  try {
    for (const data of projects) await semillaP2P.leave(data.space.spaceId);
    applyP2PState(semillaP2P.bootstrapState);
    setStatus(elements.dashboardStatus, t('panel.left', 'Has abandonado el panel y sus proyectos ya no están disponibles en esta cuenta.'), 'success');
  } catch (error) { applyP2PState(semillaP2P.bootstrapState); setStatus(elements.dashboardStatus, error?.message || t('panel.leaveError', 'No se pudo abandonar el panel completo.'), 'error'); }
  finally { setP2PBusy(false); }
}

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
window.addEventListener('p2p:lifecycle-progress', (event) => {
  const transaction = event.detail?.transaction || null;
  applyP2PState(semillaP2P.bootstrapState);
  renderDashboard();
  if (elements.trashDialog?.open) renderTrash();
  if (state.selectedSpaceId && transaction?.spaceId === state.selectedSpaceId) renderProject();
  const target = elements.trashDialog?.open ? elements.trashStatus : elements.dashboardStatus;
  if (transaction) setStatus(target, lifecycleStatusMessage(transaction), 'warning');
});
window.addEventListener('p2p:lifecycle-completed', (event) => {
  const transaction = event.detail?.transaction || null;
  applyP2PState(semillaP2P.bootstrapState);
  if (transaction?.spaceId === state.selectedSpaceId) showDashboard();
  if (elements.trashDialog?.open) renderTrash();
  const released = Math.max(0, Number(transaction?.released || 0));
  const completedAfterRetryExhaustion = transaction?.retryExhausted === true && released > 0;
  const message = completedAfterRetryExhaustion
    ? t('lifecycle.completedWithDeferredReplicas', `La acción se completó después de 3 intentos. ${released} ${released === 1 ? 'réplica no confirmó a tiempo y conservará' : 'réplicas no confirmaron a tiempo y conservarán'} la operación pendiente para sincronizarse al volver a estar disponibles.`)
    : transaction?.action === 'purge'
      ? t('lifecycle.purgeCompleted', 'Todos los dispositivos confirmaron la eliminación permanente del proyecto.')
      : transaction?.action === 'restore'
        ? t('lifecycle.restoreCompleted', 'Todos los dispositivos confirmaron la restauración del proyecto.')
        : t('lifecycle.trashCompleted', 'Todos los dispositivos confirmaron el envío del proyecto a la papelera.');
  setStatus(elements.trashDialog?.open ? elements.trashStatus : elements.dashboardStatus, message, 'success');
});
window.addEventListener('p2p:lifecycle-retry-exhausted', (event) => {
  const transaction = event.detail?.transaction || null;
  applyP2PState(semillaP2P.bootstrapState);
  renderDashboard();
  if (elements.trashDialog?.open) renderTrash();
  if (state.selectedSpaceId && transaction?.spaceId === state.selectedSpaceId) renderProject();
  const action = String(transaction?.action || '').trim();
  const localCommitApplied = event.detail?.localCommitApplied === true || transaction?.localCommitApplied === true;
  const message = localCommitApplied
    ? t('lifecycle.completionPending', 'La acción ya se aplicó en este dispositivo y en las réplicas, pero no se pudo cerrar su confirmación después de 3 intentos. No se repetirá indefinidamente; quedó registrada para reconciliarse en la próxima recuperación de conexión.')
    : action === 'restore'
      ? t('lifecycle.restoreRetryExhausted', 'No se pudo confirmar la restauración después de 3 intentos. El proyecto conserva el último estado confirmado y se registró la auditoría técnica.')
      : action === 'purge'
        ? t('lifecycle.purgeRetryExhausted', 'No se pudo confirmar la eliminación permanente después de 3 intentos. El proyecto conserva el último estado confirmado y se registró la auditoría técnica.')
        : t('lifecycle.trashRetryExhausted', 'No se pudo confirmar el envío a papelera después de 3 intentos. El proyecto conserva el último estado confirmado y se registró la auditoría técnica.');
  setStatus(elements.trashDialog?.open ? elements.trashStatus : elements.dashboardStatus, message, 'error');
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
window.addEventListener('p2p:error', (event) => {
  const stage = String(event.detail?.stage || '').trim();
  if (['recover', 'foreground-recover', 'realtime', 'realtime-ready-timeout'].includes(stage)) setConnectionState('disconnected');
});
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
elements.projectFilterInput?.addEventListener('input', (event) => {
  state.projectFilterQuery = String(event.currentTarget?.value || '').slice(0, 300);
  renderDashboard();
});
elements.projectFilterInput?.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape' || !state.projectFilterQuery) return;
  event.preventDefault();
  state.projectFilterQuery = '';
  elements.projectFilterInput.value = '';
  renderDashboard();
});
elements.projectFilterClear?.addEventListener('click', () => {
  state.projectFilterQuery = '';
  if (elements.projectFilterInput) {
    elements.projectFilterInput.value = '';
    elements.projectFilterInput.focus();
  }
  renderDashboard();
});
function handlePanelActionButton(panelAction) {
  if (!panelAction) return false;
  const ownerUserId = String(panelAction.dataset.panelOwnerUserId || '').trim();
  if (panelAction.dataset.panelAction === 'invite') openInviteForm({ scope: 'panel', ownerUserId });
  if (panelAction.dataset.panelAction === 'manage') openPanelAccess(ownerUserId);
  if (panelAction.dataset.panelAction === 'leave') leavePanel(ownerUserId, panelAction);
  return true;
}

elements.projectList?.addEventListener('click', (event) => {
  const panelAction = event.target.closest('button[data-panel-action]');
  if (handlePanelActionButton(panelAction)) return;
  const openPanelButton = event.target.closest('button[data-open-panel]');
  if (openPanelButton) { openPanel(openPanelButton.dataset.openPanel); return; }
  const menu = event.target.closest('button[data-action-menu-scope]');
  if (menu) { openActionMenu(actionMenuContextFromButton(menu)); return; }
  const open = event.target.closest('button[data-open-project]');
  if (open) openProject(open.dataset.openProject);
});
elements.panelContextActions?.addEventListener('click', (event) => handlePanelActionButton(event.target.closest('button[data-panel-action]')));
elements.backToPanelsButton?.addEventListener('click', () => requestAppNavigationBack(() => showPanelDirectory({ historyMode: 'replace' })));
elements.backButton?.addEventListener('click', () => requestAppNavigationBack(() => showDashboard({ historyMode: 'replace' })));
elements.addPurchaseButton?.addEventListener('click', () => openRecordForm('purchase')); elements.addIncomeButton?.addEventListener('click', () => openRecordForm('income')); elements.addProjectionButton?.addEventListener('click', () => openRecordForm('projection')); elements.recordForm?.addEventListener('submit', submitRecord);
[elements.purchaseList, elements.projectionList, elements.incomeList].forEach((list) => list?.addEventListener('click', (event) => {
  const menu = event.target.closest('button[data-action-menu-scope]');
  if (menu) openActionMenu(actionMenuContextFromButton(menu));
}));
elements.trashButton?.addEventListener('click', openTrashDialog);
elements.trashList?.addEventListener('click', (event) => {
  const menu = event.target.closest('button[data-action-menu-scope]');
  if (menu) openActionMenu(actionMenuContextFromButton(menu));
});
elements.actionMenuList?.addEventListener('click', handleActionMenuSelection);
elements.actionMenuConfirmButton?.addEventListener('click', executeActionMenuConfirmation);
elements.actionMenuConfirmCancel?.addEventListener('click', clearActionMenuConfirmation);
elements.inviteCollaboratorButton?.addEventListener('click', () => openInviteForm({ scope: 'project' })); elements.inviteForm?.addEventListener('submit', submitInvitation); elements.invitationsButton?.addEventListener('click', () => openDialog(elements.invitationsDialog)); elements.invitationList?.addEventListener('click', respondInvitation);
elements.panelAccessList?.addEventListener('click', (event) => { const button = event.target.closest('button[data-panel-revoke-user-id]'); if (button) revokePanelParticipant(button.dataset.panelRevokeUserId); });
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
elements.actionMenuDialog?.addEventListener('close', () => { state.actionMenuContext = null; clearActionMenuConfirmation(); setStatus(elements.actionMenuStatus, ''); });
document.addEventListener('app-language-ready', () => { renderInvitations(); renderDevices(); renderDashboard(); renderTrash(); renderStorageDurability(); if (state.selectedSpaceId) { renderProject(); if (elements.accessDialog?.open) renderAccessManagement(); } if (elements.actionMenuDialog?.open) renderActionMenu(); setConnectionState(elements.connectionStatus?.dataset.state || 'connecting'); window.AppAssetLoader?.hydrate(document); });

window.addEventListener('popstate', handleAppNavigationPopState);

subscribeSessionTokenChanges(({ token }) => {
  queueExternalSessionSynchronization(token);
});
window.addEventListener('online', () => {
  if (!state.user && getSessionToken()) queueExternalSessionSynchronization(getSessionToken());
});

restoreSession();
