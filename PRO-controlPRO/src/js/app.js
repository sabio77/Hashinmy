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
  autoAcceptablePortfolioProjectInvitations,
  findPendingInvitation,
  invitationGovernanceSpaceId,
  invitationIntentFromServiceWorkerMessage,
  normalizeInvitationIntentId,
  readInvitationIntent,
  relatedPortfolioProjectInvitations,
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
  buildProjectPanelScopes,
  createLocalId,
  entitiesByType,
  hasPermission,
  individualRecordAccess,
  memberForUser,
  normalizeCollaborationPermissions,
  normalizeCollaborationRole,
  operationAuthorship,
  rolePermissions,
  normalizeIncomeInput,
  normalizeProjectInput,
  normalizeProjectFilterText,
  normalizeProjectionInput,
  normalizeProjectionLinkInput,
  normalizePurchaseInput,
  projectMatchesFilter,
  projectRecord,
  roleLabel,
  resolveProjectionActuals,
  resolvePurchaseProjectionLinks,
  sharedOwnerPanelId,
  sumMoneyValues
} from './project-domain.js';

const CACHED_USER_STORAGE_KEY = scopedStorageKey('semilla_authenticated_user');
const ACTIVE_PANEL_STORAGE_KEY = scopedStorageKey('admin_active_panel');
const PERSONAL_PANEL_ID = '__personal_panel__';
const SHARED_PROJECTS_PANEL_ID = '__shared_projects_panel__';
const state = {
  firebaseWebConfig: null,
  user: null,
  busy: false,
  p2pBusy: false,
  selectedSpaceId: '',
  activePanelId: '',
  pendingPanelId: '',
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
  projectFilterQuery: '',
  inviteScope: 'project',
  portfolioInviteAccepting: false,
  accessScopeContext: 'project',
  portfolioReconciliationActive: false
};

const MISSING_PROJECT_RECOVERY_COOLDOWN_MS = 60 * 1000;
const PORTFOLIO_RESOURCE_TYPE = 'admin.portfolio';
const PROJECT_RESOURCE_TYPE = 'admin.project';

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
  panelSwitcher: byId('panel-switcher'), panelList: byId('panel-list'), activePanelSummary: byId('active-panel-summary'),
  portfolioMetrics: byId('portfolio-metrics'), projectList: byId('project-list'), projectFilterInput: byId('project-filter-input'), projectFilterClear: byId('project-filter-clear'), projectFilterSummary: byId('project-filter-summary'), managePortfolioAccessButton: byId('manage-portfolio-access-button'), invitePortfolioButton: byId('invite-portfolio-button'), newProjectButton: byId('new-project-button'), backButton: byId('back-to-dashboard-button'),
  projectName: byId('project-name'), projectDescription: byId('project-description'), projectAddress: byId('project-address'), projectMemberSummary: byId('project-member-summary'), projectReplicaHealth: byId('project-replica-health'),
  projectMetrics: byId('project-metrics'), budgetProgressValue: byId('budget-progress-value'), budgetProgressLabel: byId('budget-progress-label'),
  inviteCollaboratorButton: byId('invite-collaborator-button'), manageAccessButton: byId('manage-access-button'), editProjectButton: byId('edit-project-button'), addPurchaseButton: byId('add-purchase-button'), addIncomeButton: byId('add-income-button'), addProjectionButton: byId('add-projection-button'),
  purchaseList: byId('purchase-list'), projectionList: byId('projection-list'), incomeList: byId('income-list'), purchaseCount: byId('purchase-count'), projectionCount: byId('projection-count'), incomeCount: byId('income-count'),
  projectDialog: byId('project-dialog'), projectForm: byId('project-form'), projectFormMode: byId('project-form-mode'), projectDialogTitle: byId('project-dialog-title'), projectNameInput: byId('project-name-input'), projectDescriptionInput: byId('project-description-input'), projectAddressInput: byId('project-address-input'), projectBudgetInput: byId('project-budget-input'), projectFormStatus: byId('project-form-status'), projectSubmitButton: byId('project-submit-button'),
  recordDialog: byId('record-dialog'), recordForm: byId('record-form'), recordTypeInput: byId('record-type-input'), recordDialogEyebrow: byId('record-dialog-eyebrow'), recordDialogTitle: byId('record-dialog-title'), recordDescriptionInput: byId('record-description-input'), recordInvoiceInput: byId('record-invoice-input'), recordAmountInput: byId('record-amount-input'), recordDateInput: byId('record-date-input'), recordProjectionInput: byId('record-projection-input'), invoiceField: byId('invoice-field'), projectionLinkField: byId('projection-link-field'), recordDateLabel: byId('record-date-label'), recordAmountLabel: byId('record-amount-label'), recordFormStatus: byId('record-form-status'), recordSubmitButton: byId('record-submit-button'),
  inviteDialog: byId('invite-dialog'), inviteForm: byId('invite-form'), inviteDialogTitle: byId('invite-dialog-title'), inviteScopeMessage: byId('invite-scope-message'), inviteRoleSelect: byId('invite-role-select'), invitePermissionFieldset: byId('invite-permission-fieldset'), inviteEmailInput: byId('invite-email-input'), inviteStatus: byId('invite-status'), inviteSubmitButton: byId('invite-submit-button'), invitationsDialog: byId('invitations-dialog'),
  accessDialog: byId('access-dialog'), accessDialogTitle: byId('access-dialog-title'), accessDialogDescription: byId('access-dialog-description'), accessMemberList: byId('access-member-list'), accessStatus: byId('access-status'), accessOwnerActions: byId('access-owner-actions'), deleteProjectButton: byId('delete-project-button'), accessConfirmPanel: byId('access-confirm-panel'), accessConfirmMessage: byId('access-confirm-message'), accessConfirmButton: byId('access-confirm-button'), accessConfirmCancel: byId('access-confirm-cancel'),
  trashButton: byId('trash-button'), trashCount: byId('trash-count'), trashDialog: byId('trash-dialog'), trashList: byId('trash-list'), trashStatus: byId('trash-status'),
  actionMenuDialog: byId('action-menu-dialog'), actionMenuTitle: byId('action-menu-title'), actionMenuContext: byId('action-menu-context'), actionMenuList: byId('action-menu-list'), actionMenuStatus: byId('action-menu-status'), actionMenuConfirmPanel: byId('action-menu-confirm-panel'), actionMenuConfirmTitle: byId('action-menu-confirm-title'), actionMenuConfirmMessage: byId('action-menu-confirm-message'), actionMenuConfirmButton: byId('action-menu-confirm-button'), actionMenuConfirmCancel: byId('action-menu-confirm-cancel')
};

function t(key, fallback) { return window.AppI18n?.t?.(key, fallback) || fallback; }
function setStatus(element, message = '', status = '') { if (!element) return; element.textContent = message; status ? element.dataset.state = status : delete element.dataset.state; }
function getCachedUser() { try { const value = JSON.parse(localStorage.getItem(CACHED_USER_STORAGE_KEY) || 'null'); return value?.userId ? value : null; } catch { return null; } }
function setCachedUser(user = null) { try { user?.userId ? localStorage.setItem(CACHED_USER_STORAGE_KEY, JSON.stringify({ userId: user.userId, email: user.email || '', displayName: user.displayName || '', photoUrl: user.photoUrl || '' })) : localStorage.removeItem(CACHED_USER_STORAGE_KEY); } catch {} }
function getCachedActivePanelId(userId = '') { try { const value = JSON.parse(localStorage.getItem(ACTIVE_PANEL_STORAGE_KEY) || 'null'); return value?.userId === String(userId || '') ? String(value.panelId || '') : ''; } catch { return ''; } }
function setActivePanelId(panelId = '', options = {}) { const normalized = String(panelId || '').trim(); state.activePanelId = normalized; if (options.persist === false || !state.user?.userId) return normalized; try { normalized ? localStorage.setItem(ACTIVE_PANEL_STORAGE_KEY, JSON.stringify({ userId: state.user.userId, panelId: normalized })) : localStorage.removeItem(ACTIVE_PANEL_STORAGE_KEY); } catch {} return normalized; }
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
function currentMember(space = null) { return state.user?.userId ? memberForUser(space || {}, state.user.userId) : null; }
function currentRole(space = null) { return normalizeCollaborationRole(currentMember(space)?.role || 'member'); }
function accessSpace() { return state.accessScopeContext === 'portfolio' ? primaryPortfolioSpace() : selectedSpace(); }
function accessProjectData() { return state.accessScopeContext === 'project' ? selectedProjectData() : null; }
function translatedRoleLabel(role = '') {
  const normalized = normalizeCollaborationRole(role);
  return t(`roles.${normalized}`, roleLabel(normalized));
}
function roleRank(role = '') { return ({ owner: 4, manager: 3, admin: 2, individual: 1, member: 1 })[normalizeCollaborationRole(role)] || 0; }
function canManageMember(space = null, member = null) {
  const actor = currentMember(space);
  if (!actor || !member || actor.userId === member.userId || !spaceUserCan(space, 'manage_access')) return false;
  return normalizeCollaborationRole(actor.role) === 'owner' || roleRank(actor.role) > roleRank(member.role);
}
function portfolioSpaces() {
  return (state.p2pState.spaces || []).filter((space) => space?.resourceType === PORTFOLIO_RESOURCE_TYPE && !isAuthorizationUnconfirmed(space));
}
function portfolioSpaceById(spaceId = '') {
  const cleanSpaceId = String(spaceId || '').trim();
  return portfolioSpaces().find((space) => String(space?.spaceId || '').trim() === cleanSpaceId) || null;
}
function primaryPortfolioSpace() {
  const panel = activePanelScope();
  return panel?.type === 'portfolio' ? panel.space : null;
}
function projectBelongsToPortfolio(data = null, portfolioSpace = null) {
  if (!data?.space || !portfolioSpace?.spaceId || data.space.resourceType === PORTFOLIO_RESOURCE_TYPE) return false;
  const projectPortfolioSpaceId = String(data.project?.portfolioSpaceId || '').trim();
  if (projectPortfolioSpaceId) return projectPortfolioSpaceId === String(portfolioSpace.spaceId || '').trim();
  const projectPortfolioOwnerUserId = String(data.project?.portfolioOwnerUserId || '').trim();
  const portfolioOwnerUserId = String(portfolioSpace.ownerUserId || '').trim();
  if (projectPortfolioOwnerUserId) return projectPortfolioOwnerUserId === portfolioOwnerUserId;
  return String(data.space.ownerUserId || '').trim() === portfolioOwnerUserId;
}
function portfolioOwnerProfile(portfolioSpace = null) {
  const ownerUserId = String(portfolioSpace?.ownerUserId || '').trim();
  return (portfolioSpace?.members || []).find((member) => String(member?.userId || '').trim() === ownerUserId)?.profile || null;
}
function panelScopes() {
  return buildProjectPanelScopes({
    spaces: state.p2pState.spaces,
    projects: [...state.projects.values()],
    currentUserId: state.user?.userId || '',
    activePanelId: state.activePanelId,
    portfolioResourceType: PORTFOLIO_RESOURCE_TYPE,
    personalPanelId: PERSONAL_PANEL_ID,
    sharedProjectsPanelId: SHARED_PROJECTS_PANEL_ID
  });
}
function activePanelScope() {
  const scopes = panelScopes();
  let active = scopes.find((scope) => scope.id === state.activePanelId)
    || scopes.find((scope) => scope.type === 'portfolio' && scope.owned)
    || scopes.find((scope) => scope.type === 'personal')
    || scopes[0]
    || null;
  if (active && state.activePanelId !== active.id) setActivePanelId(active.id);
  return active;
}
function activePanelProjects() { return activePanelScope()?.projects || []; }
function panelDisplayName(panel = null) {
  if (!panel || panel.type === 'personal' || panel.owned) return t('dashboard.personalPanel', 'Mi panel');
  if (panel.type === 'shared') return t('dashboard.sharedProjectsPanel', 'Proyectos compartidos');
  const profile = panel.ownerProfile || portfolioOwnerProfile(panel.space);
  const ownerName = profile?.displayName || profile?.email || t('dashboard.otherOwner', 'otro usuario');
  return t('dashboard.invitedPanel', 'Panel de {name}').replace('{name}', ownerName);
}
function panelTypeDescription(panel = null) {
  if (!panel || panel.type === 'personal' || panel.owned) return t('dashboard.personalPanelHint', 'Tus proyectos y participantes propios.');
  if (panel.type === 'shared') return t('dashboard.sharedProjectsHint', 'Proyectos a los que te invitaron de forma individual.');
  return t('dashboard.invitedPanelHint', 'Panel compartido al que perteneces como participante.');
}
function renderPanelSwitcher(activePanel = activePanelScope()) {
  if (!elements.panelList || !elements.panelSwitcher) return;
  const scopes = panelScopes();
  elements.panelSwitcher.hidden = false;
  elements.panelList.replaceChildren();
  for (const panel of scopes) {
    const card = document.createElement('article');
    card.className = 'panel-switcher-card';
    card.dataset.panelId = panel.id;
    if (panel.id === activePanel?.id) card.dataset.active = 'true';

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'panel-switcher-main';
    button.dataset.panelId = panel.id;
    button.setAttribute('aria-pressed', panel.id === activePanel?.id ? 'true' : 'false');
    const marker = document.createElement('span'); marker.className = 'panel-switcher-marker'; marker.setAttribute('aria-hidden', 'true'); marker.textContent = panel.type === 'shared' ? '↗' : panel.owned ? '◆' : '◇';
    const copy = document.createElement('span'); copy.className = 'panel-switcher-copy';
    const title = document.createElement('strong'); title.textContent = panelDisplayName(panel);
    const detail = document.createElement('small');
    const projectCount = panel.projects.filter((data) => !data.project.isTrashed).length;
    const countLabel = t(projectCount === 1 ? 'dashboard.panelProjectCountOne' : 'dashboard.panelProjectCountMany', projectCount === 1 ? '{count} proyecto' : '{count} proyectos').replace('{count}', String(projectCount));
    detail.textContent = `${countLabel} · ${panelTypeDescription(panel)}`;
    copy.append(title, detail); button.append(marker, copy); card.append(button);

    if (panel.type === 'portfolio' && !panel.owned && panel.space?.spaceId) {
      const menu = contextMenuButton(
        { scope: 'panel', spaceId: panel.space.spaceId, panelId: panel.id },
        t('actions.panelMenu', 'Opciones del panel')
      );
      menu.classList.add('panel-context-menu-button');
      card.append(menu);
    }
    elements.panelList.append(card);
  }
  if (elements.activePanelSummary) {
    elements.activePanelSummary.textContent = activePanel ? `${panelDisplayName(activePanel)} · ${panelTypeDescription(activePanel)}` : '';
  }
}
function portfolioProjectSpaces(portfolioSpace = primaryPortfolioSpace()) {
  if (!portfolioSpace?.spaceId) return [];
  return [...state.projects.values()]
    .filter((data) => projectBelongsToPortfolio(data, portfolioSpace))
    .map((data) => data.space);
}
function portfolioProjectsOwnedBy(portfolioSpace = null, userId = '') {
  const cleanUserId = String(userId || '').trim();
  if (!portfolioSpace?.spaceId || !cleanUserId) return [];
  return portfolioProjectSpaces(portfolioSpace).filter((space) => String(space?.ownerUserId || '').trim() === cleanUserId);
}
function canCreatePortfolioProject(portfolioSpace = primaryPortfolioSpace()) {
  if (['shared', 'shared-portfolio'].includes(activePanelScope()?.type)) return false;
  return !portfolioSpace || ['owner', 'manager', 'admin'].includes(currentRole(portfolioSpace));
}
function portfolioCollaborators(portfolioSpace = primaryPortfolioSpace()) {
  if (!portfolioSpace?.spaceId) return [];
  const cleanOwnerUserId = String(portfolioSpace.ownerUserId || '').trim();
  const cleanPortfolioSpaceId = String(portfolioSpace.spaceId || '').trim();
  const grants = new Map();

  if (spaceUserCan(portfolioSpace, 'manage_access') || portfolioSpace.ownerUserId === state.user?.userId) {
    for (const member of portfolioSpace.members || []) {
      if (!member?.userId || member.accessScope !== 'portfolio') continue;
      const email = String(member.profile?.email || '').trim().toLowerCase();
      if (!email) continue;
      const isPortfolioOwner = member.userId === cleanOwnerUserId;
      grants.set(email, {
        email,
        userId: member.userId,
        role: isPortfolioOwner ? 'manager' : normalizeCollaborationRole(member.role),
        permissions: isPortfolioOwner ? rolePermissions('manager', []) : rolePermissions(member.role, member.permissions),
        accessScope: 'portfolio',
        portfolioOwner: isPortfolioOwner
      });
    }
  }
  return [...grants.values()];
}
function memberByEmail(space = null, email = '') {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  return (space?.members || []).find((member) => String(member?.profile?.email || '').trim().toLowerCase() === normalizedEmail) || null;
}
function samePermissionSet(left = [], right = []) {
  const first = [...new Set((Array.isArray(left) ? left : []).map((value) => String(value || '').trim().toLowerCase()).filter(Boolean))].sort();
  const second = [...new Set((Array.isArray(right) ? right : []).map((value) => String(value || '').trim().toLowerCase()).filter(Boolean))].sort();
  return first.length === second.length && first.every((value, index) => value === second[index]);
}
function memberMatchesGrant(member = null, grant = {}) {
  if (!member) return false;
  if (normalizeCollaborationRole(member.role) === 'owner') return true;
  const role = normalizeCollaborationRole(grant.role || 'member');
  const expectedPermissions = normalizeCollaborationPermissions(grant.permissions || rolePermissions(role, []));
  return normalizeCollaborationRole(member.role) === role
    && member.accessScope === 'portfolio'
    && samePermissionSet(rolePermissions(member.role, member.permissions), rolePermissions(role, expectedPermissions));
}
function pendingInvitationMatches(space = null, email = '', grant = {}) {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  const role = normalizeCollaborationRole(grant.role || 'member');
  const permissions = normalizeCollaborationPermissions(grant.permissions || rolePermissions(role, []));
  return (state.p2pState.invitations?.sent || []).find((invitation) => (
    invitation?.status === 'pending'
    && String(invitation.spaceId || '').trim() === String(space?.spaceId || '').trim()
    && String(invitation.recipientEmail || '').trim().toLowerCase() === normalizedEmail
    && normalizeCollaborationRole(invitation.role) === role
    && invitation.accessScope === 'portfolio'
    && samePermissionSet(rolePermissions(invitation.role, invitation.permissions), rolePermissions(role, permissions))
  )) || null;
}
async function upsertSpaceAccessByEmail(space = null, email = '', grant = {}) {
  if (!space?.spaceId) throw new Error(t('invite.error', 'No se pudo enviar la invitación.'));
  const role = normalizeCollaborationRole(grant.role || 'member');
  const permissions = normalizeCollaborationPermissions(grant.permissions || rolePermissions(role, []));
  const accessScope = grant.accessScope === 'portfolio' ? 'portfolio' : 'project';
  const existingMember = memberByEmail(space, email);
  if (existingMember) {
    if (accessScope === 'portfolio' && memberMatchesGrant(existingMember, { role, permissions })) return { unchanged: true, member: existingMember, space };
    return semillaP2P.updatePermissions(space.spaceId, existingMember.userId, permissions, { role, accessScope });
  }
  const pending = accessScope === 'portfolio' ? pendingInvitationMatches(space, email, { role, permissions }) : null;
  if (pending) return { reused: true, invitation: pending, space };
  return semillaP2P.invite(email, {
    spaceId: space.spaceId,
    resourceType: space.resourceType || PROJECT_RESOURCE_TYPE,
    permissions,
    role,
    accessScope,
    requestId: createLocalId('invite_request')
  });
}
async function invitePortfolioCollaboratorsToProject(spaceId = '', collaborators = portfolioCollaborators()) {
  const cleanSpaceId = String(spaceId || '').trim();
  const space = (state.p2pState.spaces || []).find((candidate) => candidate?.spaceId === cleanSpaceId && candidate?.resourceType !== PORTFOLIO_RESOURCE_TYPE);
  if (!space || !spaceUserCan(space, 'invite') || !collaborators.length) return { total: collaborators.length, succeeded: 0, failed: 0 };
  const results = await Promise.allSettled(collaborators.map((grant) => upsertSpaceAccessByEmail(space, grant.email, { ...grant, accessScope: 'portfolio' })));
  return {
    total: results.length,
    succeeded: results.filter((result) => result.status === 'fulfilled').length,
    failed: results.filter((result) => result.status === 'rejected').length
  };
}
async function reconcilePortfolioAccess() {
  if (state.portfolioReconciliationActive || state.p2pBusy || !state.user?.userId || navigator.onLine === false) return { changed: 0, failed: 0 };
  const manageablePortfolios = portfolioSpaces().filter((space) => spaceUserCan(space, 'manage_access'));
  if (!manageablePortfolios.length) return { changed: 0, failed: 0 };
  state.portfolioReconciliationActive = true;
  let changed = 0;
  let failed = 0;
  try {
    for (const portfolioSpace of manageablePortfolios) {
      const collaborators = portfolioCollaborators(portfolioSpace);
      const projects = portfolioProjectSpaces(portfolioSpace).filter((space) => spaceUserCan(space, 'invite'));
      for (const projectSpace of projects) {
        for (const grant of collaborators) {
          const existing = memberByEmail(projectSpace, grant.email);
          if (normalizeCollaborationRole(existing?.role) === 'owner') continue;
          if (memberMatchesGrant(existing, grant) || pendingInvitationMatches(projectSpace, grant.email, grant)) continue;
          try {
            await upsertSpaceAccessByEmail(projectSpace, grant.email, { ...grant, accessScope: 'portfolio' });
            changed += 1;
          } catch {
            failed += 1;
          }
        }
      }
    }
    if (changed) {
      await semillaP2P.refreshBootstrap({ requestSnapshots: false }).catch(() => null);
      applyP2PState(semillaP2P.bootstrapState);
    }
    return { changed, failed };
  } finally {
    state.portfolioReconciliationActive = false;
  }
}
function individualVisibleRecord(space = null, record = {}) {
  const membership = currentMember(space);
  return normalizeCollaborationRole(membership?.role) !== 'individual' || record?.createdByUserId === state.user?.userId;
}
function recordAccessError(space = null, record = {}) {
  const access = individualRecordAccess(space || {}, state.user?.userId || '', record);
  if (!access.restricted || access.allowed) return '';
  return access.owner
    ? t('permissions.individualExpired', 'El plazo de una hora para editar o eliminar este registro ya terminó.')
    : t('permissions.individualOwnOnly', 'El rol Individual solo puede editar o eliminar registros creados por su propia cuenta.');
}
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
  const wasBusy = state.p2pBusy;
  state.p2pBusy = Boolean(value);
  [elements.projectSubmitButton, elements.recordSubmitButton, elements.inviteSubmitButton, elements.managePortfolioAccessButton, elements.invitePortfolioButton, elements.newProjectButton, elements.deleteProjectButton, elements.accessConfirmButton, elements.deviceConfirmButton, elements.actionMenuConfirmButton].forEach((button) => { if (button) button.disabled = state.p2pBusy; });
  [elements.inviteEmailInput, elements.inviteRoleSelect].forEach((control) => { if (control) control.disabled = state.p2pBusy; });
  elements.accessMemberList?.querySelectorAll('button, input, select').forEach((control) => {
    control.disabled = state.p2pBusy || control.dataset.permissionLocked === 'true';
  });
  elements.deviceList?.querySelectorAll('button').forEach((control) => { control.disabled = state.p2pBusy || control.dataset.deviceRetirable !== 'true'; });
  if (wasBusy && !state.p2pBusy && state.user?.userId) {
    queueMicrotask(() => reconcilePortfolioAccess().catch(() => null));
  }
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
  state.activePanelId = '';
  state.pendingPanelId = '';
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
  if (elements.projectFilterInput) elements.projectFilterInput.value = '';
  state.invitationRefreshSequence += 1;
  state.storageDurability = null;
  state.storageRequestPromise = null;
  setP2PBusy(false);
  [elements.projectDialog, elements.recordDialog, elements.inviteDialog, elements.invitationsDialog, elements.devicesDialog, elements.accessDialog, elements.actionMenuDialog, elements.trashDialog]
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
  state.activePanelId = getCachedActivePanelId(user.userId);
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
  const resolvedPurchases = resolvePurchaseProjectionLinks(rawPurchases, projectionLinks, { strictLinks: strictProjectionLinks });
  const resolvedProjections = resolveProjectionActuals(rawProjections, rawPurchases, projectionLinks, { strictLinks: strictProjectionLinks });
  const purchases = resolvedPurchases.filter((record) => individualVisibleRecord(space, record));
  const visibleIncomes = incomes.filter((record) => individualVisibleRecord(space, record));
  const projections = resolvedProjections.filter((record) => individualVisibleRecord(space, record));
  const visibleProjectionIds = new Set(projections.map((record) => record.id));
  const visiblePurchaseIds = new Set(purchases.map((record) => record.id));
  const visibleProjectionLinks = projectionLinks.filter((link) => visiblePurchaseIds.has(link.purchaseId || link.id) && (!link.projectionId || visibleProjectionIds.has(link.projectionId)));
  const trashedPurchases = entitiesByType(entities, PURCHASE_ENTITY_TYPE, { onlyTrashed: true }).filter((record) => individualVisibleRecord(space, record));
  const trashedIncomes = entitiesByType(entities, INCOME_ENTITY_TYPE, { onlyTrashed: true }).filter((record) => individualVisibleRecord(space, record));
  const trashedProjections = entitiesByType(entities, PROJECTION_ENTITY_TYPE, { onlyTrashed: true }).filter((record) => individualVisibleRecord(space, record));
  return {
    space,
    project,
    purchases,
    incomes: visibleIncomes,
    projections,
    projectionLinks: visibleProjectionLinks,
    trash: {
      purchases: trashedPurchases,
      incomes: trashedIncomes,
      projections: trashedProjections
    },
    strictProjectionLinks,
    metrics: calculateProjectMetrics(project, purchases, visibleIncomes, projections)
  };
}

async function recoverMissingProjectCards(spaceIds = []) {
  if (state.missingProjectRecoveryActive || !state.user || !getSessionToken()) return false;
  const now = Date.now();
  const candidates = Array.from(new Set((Array.isArray(spaceIds) ? spaceIds : [])
    .map((spaceId) => String(spaceId || '').trim())
    .filter(Boolean)))
    .filter((spaceId) => now - Number(state.missingProjectRecoveryAt.get(spaceId) || 0) >= MISSING_PROJECT_RECOVERY_COOLDOWN_MS);
  if (!candidates.length) return false;

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
    const recoveryState = await semillaP2P.recoverMissingProjectRoots(candidates);
    const requestedRecoverySpaceIds = new Set((recoveryState?.snapshotRequests || [])
      .map((request) => String(request?.spaceId || '').trim())
      .filter(Boolean));
    const unresolved = [];
    for (const spaceId of candidates) {
      const space = state.p2pState.spaces.find((candidate) => candidate?.spaceId === spaceId) || null;
      if (!space) continue;
      const entities = await semillaP2P.listEntities(spaceId).catch(() => []);
      if (!projectRecord(space, entities).loaded) unresolved.push(spaceId);
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

async function refreshProjects() {
  const renderSequence = ++state.renderSequence;
  const spaces = (Array.isArray(state.p2pState.spaces) ? state.p2pState.spaces : []).filter((space) => space?.resourceType !== PORTFOLIO_RESOURCE_TYPE);
  const entries = await Promise.all(spaces.map(async (space) => {
    const entities = await semillaP2P.listEntities(space.spaceId).catch(() => []);
    return [space.spaceId, resolvedProjectData(space, entities)];
  }));
  if (renderSequence !== state.renderSequence) return;
  const missingProjectSpaceIds = entries
    .filter(([, data]) => !data.project.loaded)
    .map(([spaceId]) => spaceId);
  state.projects = new Map(entries.filter(([, data]) => data.project.loaded));
  if (state.pendingPanelId && panelScopes().some((panel) => panel.id === state.pendingPanelId)) {
    setActivePanelId(state.pendingPanelId);
    state.pendingPanelId = '';
  }
  const selected = state.selectedSpaceId ? state.projects.get(state.selectedSpaceId) : null;
  if (state.selectedSpaceId && (!selected || selected.project.isTrashed)) showDashboard();
  renderDashboard();
  renderTrash();
  if (state.selectedSpaceId) renderProject();
  if (missingProjectSpaceIds.length) recoverMissingProjectCards(missingProjectSpaceIds).catch(() => null);
}

function renderPortfolioMetrics(projects = activePanelProjects()) {
  elements.portfolioMetrics.replaceChildren();
  projects = (Array.isArray(projects) ? projects : []).filter((item) => !item.project.isTrashed);
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
  if (context.panelId) button.dataset.panelId = context.panelId;
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
    && ['waiting', 'ready'].includes(String(transaction.status || '').trim())
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

function renderDashboard() {
  const panel = activePanelScope();
  renderPanelSwitcher(panel);
  const panelProjects = panel?.projects || [];
  renderPortfolioMetrics(panelProjects);
  const portfolioSpace = panel?.type === 'portfolio' ? panel.space : null;
  const canManagePortfolio = Boolean(portfolioSpace && spaceUserCan(portfolioSpace, 'manage_access'));
  const canInvitePortfolio = Boolean(portfolioSpace && spaceUserCan(portfolioSpace, 'invite'));
  const sharedOnlyPanel = ['shared', 'shared-portfolio'].includes(panel?.type);
  if (elements.managePortfolioAccessButton) elements.managePortfolioAccessButton.hidden = !canManagePortfolio;
  if (elements.invitePortfolioButton) elements.invitePortfolioButton.hidden = sharedOnlyPanel || Boolean(portfolioSpace && !canInvitePortfolio);
  if (elements.newProjectButton) elements.newProjectButton.hidden = !canCreatePortfolioProject(portfolioSpace);
  elements.projectList.replaceChildren();
  const allProjects = panelProjects
    .filter((item) => !item.project.isTrashed)
    .sort((a, b) => String(b.project.updatedAt || '').localeCompare(String(a.project.updatedAt || '')));
  const normalizedFilter = normalizeProjectFilterText(state.projectFilterQuery);
  const projects = normalizedFilter
    ? allProjects.filter((item) => projectMatchesFilter(item.project, normalizedFilter))
    : allProjects;
  if (elements.projectFilterInput && elements.projectFilterInput.value !== state.projectFilterQuery) {
    elements.projectFilterInput.value = state.projectFilterQuery;
  }
  if (elements.projectFilterClear) elements.projectFilterClear.hidden = !normalizedFilter;
  if (elements.projectFilterSummary) {
    elements.projectFilterSummary.hidden = !normalizedFilter;
    elements.projectFilterSummary.textContent = normalizedFilter
      ? t('dashboard.filterResults', '{shown} de {total} proyectos coinciden')
        .replace('{shown}', String(projects.length))
        .replace('{total}', String(allProjects.length))
      : '';
  }
  if (!allProjects.length) {
    const empty = document.createElement('div'); empty.className = 'empty-state';
    const emptyDescription = canCreatePortfolioProject(portfolioSpace)
      ? t('dashboard.emptyDescription', 'Usa el botón + para crear el primero. Después podrás invitar participantes y registrar movimientos.')
      : t('dashboard.emptyRestrictedDescription', 'Aún no hay proyectos disponibles para tu cuenta. Un Gerente o el propietario del panel puede crear el primero.');
    empty.innerHTML = `<strong>${t('dashboard.emptyTitle', 'Aún no hay proyectos')}</strong><p>${emptyDescription}</p>`;
    elements.projectList.append(empty); return;
  }
  if (!projects.length) {
    const empty = document.createElement('div'); empty.className = 'empty-state';
    empty.innerHTML = `<strong>${t('dashboard.filterNoResultsTitle', 'No hay proyectos coincidentes')}</strong><p>${t('dashboard.filterNoResultsDescription', 'Prueba con otra palabra del nombre, la descripción o la dirección.')}</p>`;
    elements.projectList.append(empty); return;
  }
  for (const data of projects) {
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
    menu.disabled = Boolean(lifecycleTransaction);
    card.append(openButton, menu);
    elements.projectList.append(card);
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
  const allPending = (state.p2pState.invitations?.received || []).filter((invitation) => invitation.status === 'pending');
  const inheritedInvitationIds = new Set(allPending
    .filter((invitation) => invitation.resourceType === PORTFOLIO_RESOURCE_TYPE)
    .flatMap((portfolioInvitation) => relatedPortfolioProjectInvitations(allPending, portfolioInvitation, {
      portfolioResourceType: PORTFOLIO_RESOURCE_TYPE
    }))
    .map((invitation) => String(invitation.invitationId || '').trim())
    .filter(Boolean));
  const pending = allPending.filter((invitation) => !inheritedInvitationIds.has(String(invitation.invitationId || '').trim()));
  elements.invitationCount.textContent = String(pending.length);
  elements.invitationCount.hidden = pending.length === 0;
  elements.invitationList.replaceChildren();
  if (!pending.length) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = t('invite.none', 'No tienes invitaciones pendientes.');
    elements.invitationList.append(empty);
    return;
  }
  for (const invitation of pending) {
    const item = document.createElement('article'); item.className = 'invitation-item';
    const content = document.createElement('div');
    const title = document.createElement('h3');
    title.textContent = invitation.resourceType === PORTFOLIO_RESOURCE_TYPE
      ? t('invite.portfolioTitle', 'Invitar a Control de proyectos')
      : invitation.title || t('project.defaultName', 'Proyecto compartido');
    const sender = document.createElement('p');
    sender.textContent = [
      invitation.inviter?.displayName || invitation.inviter?.email || t('invite.someone', 'Un colaborador'),
      translatedRoleLabel(invitation.role),
      invitation.accessScope === 'portfolio' ? t('access.portfolioScope', 'Todo el panel') : ''
    ].filter(Boolean).join(' · ');
    content.append(title, sender);
    const actions = document.createElement('div'); actions.className = 'invitation-actions';
    for (const [decision, label, className] of [['reject', t('invite.reject', 'Rechazar'), 'button button-ghost button-compact'], ['accept', t('invite.accept', 'Aceptar'), 'button button-primary button-compact']]) {
      const button = document.createElement('button');
      button.type = 'button'; button.className = className;
      button.dataset.invitationId = invitation.invitationId;
      button.dataset.decision = decision;
      button.textContent = label;
      actions.append(button);
    }
    item.append(content, actions);
    elements.invitationList.append(item);
  }
  revealPendingInvitationIntent();
}

async function autoAcceptInheritedPortfolioInvitations() {
  if (state.portfolioInviteAccepting || !state.user?.userId) return false;
  const portfolioAuthorizations = [];
  for (const space of portfolioSpaces()) {
    const membership = memberForUser(space, state.user.userId);
    const portfolioSpaceId = String(space.spaceId || '').trim();
    if (!membership || !portfolioSpaceId) continue;
    const authorizedInviterUserIds = [];
    const ownerUserId = String(space.ownerUserId || '').trim();
    if (ownerUserId) authorizedInviterUserIds.push(ownerUserId);
    for (const member of space.members || []) {
      if (['owner', 'manager', 'admin'].includes(normalizeCollaborationRole(member?.role)) && member?.userId) {
        authorizedInviterUserIds.push(String(member.userId).trim());
      }
    }
    portfolioAuthorizations.push({
      spaceId: portfolioSpaceId,
      role: normalizeCollaborationRole(membership.role),
      authorizedInviterUserIds
    });
  }
  if (!portfolioAuthorizations.length) return false;
  const pending = autoAcceptablePortfolioProjectInvitations(
    state.p2pState.invitations?.received || [],
    portfolioAuthorizations,
    { portfolioResourceType: PORTFOLIO_RESOURCE_TYPE }
  );
  if (!pending.length) return false;
  state.portfolioInviteAccepting = true;
  try {
    for (const invitation of pending) {
      await semillaP2P.respondToInvitation(invitation.invitationId, 'accept');
    }
    applyP2PState(semillaP2P.bootstrapState);
    return true;
  } finally {
    state.portfolioInviteAccepting = false;
  }
}

function memberLabel(member = {}) { return member.profile?.displayName || member.profile?.email || (member.userId === state.user?.userId ? t('project.you', 'Tú') : t('project.participant', 'Participante')); }
function renderMembers(data) { elements.projectMemberSummary.replaceChildren(); for (const member of data.space.members || []) { const chip = document.createElement('span'); chip.className = 'member-chip'; chip.textContent = memberLabel(member); chip.title = (member.permissions || []).join(', '); elements.projectMemberSummary.append(chip); } }
function roleHint(role = '') {
  const normalized = normalizeCollaborationRole(role);
  if (normalized === 'manager') return t('access.managerHint', 'Control total, incluida la eliminación de proyectos.');
  if (normalized === 'admin') return t('access.adminHint', 'Control administrativo sin permiso para eliminar proyectos.');
  if (normalized === 'individual') return t('access.individualHint', 'Puede ver sus propios registros y editarlos o eliminarlos únicamente durante la primera hora.');
  return t('access.customHint', 'Permisos configurados manualmente.');
}
function permissionSummary(member = {}) {
  const role = normalizeCollaborationRole(member.role);
  const scope = member.accessScope === 'portfolio' ? t('access.portfolioScope', 'Todo el panel') : t('access.projectScope', 'Solo este proyecto');
  if (['owner', 'manager', 'admin', 'individual'].includes(role)) return `${translatedRoleLabel(role)} · ${scope} · ${roleHint(role)}`;
  const labels = {
    read: t('invite.read', 'Lectura'),
    add: t('invite.add', 'Agregar y editar'),
    delete: t('invite.delete', 'Eliminar'),
    projection: t('invite.projection', 'Proyecciones'),
    invite: t('project.invite', 'Invitar'),
    write: t('access.legacyWrite', 'Edición heredada')
  };
  const permissions = rolePermissions(role, member.permissions);
  return `${translatedRoleLabel(role)} · ${scope} · ${permissions.map((permission) => labels[permission] || permission).join(' · ') || t('access.readOnly', 'Solo lectura')}`;
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
  const permissions = rolePermissions(member.role, member.permissions);
  if (permission === 'read') return true;
  return permissions.includes(permission) || (permissions.includes('write') && ['add', 'delete', 'projection'].includes(permission));
}
function roleOptionsForActor(space = null) {
  const actorRole = currentRole(space);
  if (actorRole === 'owner') return ['manager', 'admin', 'individual', 'member'];
  if (actorRole === 'manager') return ['manager', 'admin', 'individual', 'member'];
  if (actorRole === 'admin') return ['admin', 'individual', 'member'];
  return [];
}
function applyRolePresetToPermissionControls(container = null, role = 'member') {
  if (!container) return;
  const normalizedRole = normalizeCollaborationRole(role);
  const preset = normalizedRole !== 'member';
  const permissions = new Set(rolePermissions(normalizedRole, []));
  container.dataset.rolePreset = preset ? 'true' : 'false';
  container.dataset.roleHint = preset ? roleHint(normalizedRole) : '';
  container.querySelectorAll('input[name="permissions"], input[name="permission"]').forEach((checkbox) => {
    checkbox.checked = checkbox.value === 'read' || (preset ? permissions.has(checkbox.value) : checkbox.checked);
    checkbox.disabled = checkbox.value === 'read' || preset;
  });
}
function accessPermissionEditor(member = {}, space = null) {
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

  const roleControls = document.createElement('div');
  roleControls.className = 'access-role-controls';
  const roleLabelNode = document.createElement('label');
  roleLabelNode.textContent = t('access.role', 'Rol');
  const roleSelect = document.createElement('select');
  roleSelect.name = 'role';
  for (const role of roleOptionsForActor(space)) {
    const option = document.createElement('option'); option.value = role; option.textContent = translatedRoleLabel(role); roleSelect.append(option);
  }
  roleSelect.value = normalizeCollaborationRole(member.role);
  roleLabelNode.append(roleSelect);
  const scopeLabel = document.createElement('label');
  scopeLabel.textContent = t('access.scope', 'Alcance');
  const scopeSelect = document.createElement('select');
  scopeSelect.name = 'accessScope';
  for (const [value, label] of [['project', t('access.projectScope', 'Solo este proyecto')], ['portfolio', t('access.portfolioScope', 'Todo el panel')]]) {
    const option = document.createElement('option'); option.value = value; option.textContent = label; scopeSelect.append(option);
  }
  scopeSelect.value = member.accessScope === 'portfolio' ? 'portfolio' : 'project';
  scopeSelect.disabled = true;
  scopeLabel.append(scopeSelect);
  roleControls.append(roleLabelNode, scopeLabel);

  const options = document.createElement('div');
  options.className = 'access-permission-options';
  const permissionLabels = {
    read: t('invite.read', 'Lectura'),
    add: t('invite.add', 'Agregar'),
    delete: t('invite.delete', 'Eliminar'),
    projection: t('invite.projection', 'Proyecciones'),
    invite: t('invite.invite', 'Invitar')
  };
  for (const permission of ['read', 'add', 'delete', 'projection', 'invite']) {
    const label = document.createElement('label');
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox'; checkbox.name = 'permissions'; checkbox.value = permission;
    checkbox.checked = memberHasPermission(member, permission);
    if (permission === 'read') { checkbox.disabled = true; checkbox.dataset.permissionLocked = 'true'; }
    const text = document.createElement('span'); text.textContent = permissionLabels[permission];
    label.append(checkbox, text); options.append(label);
  }
  applyRolePresetToPermissionControls(options, roleSelect.value);
  roleSelect.addEventListener('change', () => applyRolePresetToPermissionControls(options, roleSelect.value));

  const actions = document.createElement('div');
  actions.className = 'access-permission-actions';
  const cancel = document.createElement('button');
  cancel.type = 'button'; cancel.className = 'button button-ghost button-compact';
  cancel.dataset.permissionCancel = member.userId; cancel.textContent = t('access.cancelPermissions', 'Cancelar');
  const submit = document.createElement('button');
  submit.type = 'submit'; submit.className = 'button button-primary button-compact'; submit.textContent = t('access.savePermissions', 'Guardar permisos');
  actions.append(cancel, submit);
  form.append(heading, roleControls, options, actions);
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
function portfolioForProjectSpace(space = null) {
  const data = space?.spaceId ? state.projects.get(space.spaceId) : null;
  const explicit = portfolioSpaceById(data?.project?.portfolioSpaceId || '');
  if (explicit) return explicit;
  const ownerUserId = String(data?.project?.portfolioOwnerUserId || space?.ownerUserId || '').trim();
  return portfolioSpaces().find((candidate) => String(candidate?.ownerUserId || '').trim() === ownerUserId) || null;
}
function accessPortfolioForMember(space = null, member = null) {
  if (state.accessScopeContext === 'portfolio') return space;
  return member?.accessScope === 'portfolio' ? portfolioForProjectSpace(space) : null;
}
async function updatePortfolioMemberAccess(portfolioSpace = null, member = null, permissions = [], options = {}) {
  if (!portfolioSpace?.spaceId || !member?.userId) throw new Error(t('access.portfolioUnavailable', 'No se pudo identificar el panel asociado a este participante.'));
  const ownedProjects = portfolioProjectsOwnedBy(portfolioSpace, member.userId);
  if (ownedProjects.length) {
    throw new Error(t('access.portfolioOwnerRoleBlocked', 'Antes de cambiar este rol, transfiere la propiedad de los proyectos que pertenecen a este participante.'));
  }
  if (!canManageMember(portfolioSpace, member)) {
    throw new Error(t('access.portfolioAuthorizationBlocked', 'Tu rol no permite administrar a este participante en el panel.'));
  }
  const result = await semillaP2P.updatePermissions(
    portfolioSpace.spaceId,
    member.userId,
    permissions,
    { ...options, accessScope: 'portfolio' }
  );
  const failed = Math.max(0, Number(result?.participationReconciliation?.failed || 0));
  return {
    results: [result],
    failed,
    updated: result?.updated === true || result?.unchanged === true ? 1 : 0,
    unchanged: result?.unchanged === true,
    participationReconciliation: result?.participationReconciliation || null
  };
}
async function revokePortfolioMemberAccess(portfolioSpace = null, member = null) {
  if (!portfolioSpace?.spaceId || !member?.userId) throw new Error(t('access.portfolioUnavailable', 'No se pudo identificar el panel asociado a este participante.'));
  const ownedProjects = portfolioProjectsOwnedBy(portfolioSpace, member.userId);
  if (ownedProjects.length) {
    throw new Error(t('access.portfolioOwnerRevokeBlocked', 'No se puede revocar el acceso global mientras este participante sea propietario de uno o más proyectos. Transfiere primero esas propiedades.'));
  }
  if (!canManageMember(portfolioSpace, member)) {
    throw new Error(t('access.portfolioAuthorizationBlocked', 'Tu rol no permite retirar a este participante del panel.'));
  }
  const portfolioResult = await semillaP2P.revoke(portfolioSpace.spaceId, member.userId);
  return {
    projectResults: [],
    failed: 0,
    portfolioRevoked: portfolioResult?.portfolioRevoked === true || portfolioResult?.removed === true || portfolioResult?.alreadyRemoved === true,
    portfolioResult,
    keyRotation: portfolioResult?.keyRotation || { completed: true }
  };
}
async function submitPermissionUpdate(event) {
  event.preventDefault();
  const form = event.target.closest('form[data-permission-user-id]');
  const space = accessSpace();
  const targetUserId = String(form?.dataset.permissionUserId || '').trim();
  const member = (space?.members || []).find((candidate) => candidate?.userId === targetUserId) || null;
  if (!space || !member || !targetUserId || state.p2pBusy) return;
  const role = normalizeCollaborationRole(form.querySelector('select[name="role"]')?.value || 'member');
  const permissions = role === 'member'
    ? normalizeCollaborationPermissions(['read', ...Array.from(form.querySelectorAll('input[name="permissions"]:checked:not([value="read"])')).map((input) => input.value)])
    : normalizeCollaborationPermissions(rolePermissions(role, []));
  const portfolioSpace = accessPortfolioForMember(space, member);
  setP2PBusy(true);
  setStatus(elements.accessStatus, portfolioSpace ? t('access.portfolioPermissionsSaving', 'Actualizando permisos en todo el panel…') : t('access.permissionsSaving', 'Guardando permisos…'));
  try {
    const result = portfolioSpace
      ? await updatePortfolioMemberAccess(portfolioSpace, member, permissions, { role })
      : await semillaP2P.updatePermissions(space.spaceId, targetUserId, permissions, { role, accessScope: 'project' });
    applyP2PState(semillaP2P.bootstrapState);
    await refreshProjects();
    renderProject();
    renderAccessManagement();
    if (portfolioSpace && result.failed) {
      setStatus(elements.accessStatus, t('access.portfolioPermissionsPartial', 'Los permisos se actualizaron parcialmente. La reconciliación automática completará los proyectos pendientes al recuperar conexión.'), 'warning');
    } else {
      setStatus(
        elements.accessStatus,
        result?.unchanged
          ? t('access.permissionsUnchanged', 'Los permisos ya estaban configurados de esa forma.')
          : portfolioSpace
            ? t('access.portfolioPermissionsUpdated', 'Los permisos se actualizaron en el panel y en todos sus proyectos.')
            : t('access.permissionsUpdated', 'Los permisos se actualizaron en todos los dispositivos.'),
        'success'
      );
    }
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
  const space = accessSpace();
  const data = accessProjectData();
  if (!elements.accessMemberList) return;
  elements.accessMemberList.replaceChildren();
  elements.accessOwnerActions?.classList.add('hidden');
  if (elements.accessDialogTitle) {
    elements.accessDialogTitle.textContent = state.accessScopeContext === 'portfolio'
      ? t('access.portfolioTitle', 'Participantes del panel')
      : t('access.title', 'Administrar acceso');
  }
  if (elements.accessDialogDescription) {
    elements.accessDialogDescription.textContent = state.accessScopeContext === 'portfolio'
      ? t('access.portfolioDescription', 'Los cambios realizados aquí se aplican al panel completo y a todos sus proyectos actuales y futuros.')
      : t('access.description', 'Gestiona participantes, permisos y propiedad del proyecto.');
  }
  if (!space || !state.user) return;
  const actorMember = currentMember(space);
  const actorRole = normalizeCollaborationRole(actorMember?.role);
  const canManageAccess = spaceUserCan(space, 'manage_access');
  const canDeleteProject = state.accessScopeContext === 'project' && spaceUserCan(space, 'delete_project');
  elements.accessOwnerActions?.classList.toggle('hidden', !canDeleteProject || isAuthorizationUnconfirmed(space));
  for (const member of space.members || []) {
    const item = document.createElement('article'); item.className = 'access-member';
    const content = document.createElement('div');
    const title = document.createElement('h3'); title.textContent = memberLabel(member);
    const role = document.createElement('span'); role.className = 'access-role'; role.textContent = translatedRoleLabel(member.role); title.append(role);
    if (member.accessScope === 'portfolio') {
      const scope = document.createElement('span'); scope.className = 'access-scope-badge'; scope.textContent = t('access.portfolioScope', 'Todo el panel'); title.append(scope);
    }
    const profileEmail = String(member.profile?.email || '').trim();
    const details = document.createElement('p'); details.textContent = [profileEmail && profileEmail !== memberLabel(member) ? profileEmail : '', permissionSummary(member)].filter(Boolean).join(' · ');
    content.append(title, details);
    const actions = document.createElement('div'); actions.className = 'access-member-actions';
    const manageable = canManageMember(space, member);
    if (manageable) {
      actions.append(accessActionButton('permissions', member.userId, t('access.editPermissions', 'Editar permisos')));
      if (state.accessScopeContext === 'project' && actorRole === 'owner') actions.append(accessActionButton('transfer', member.userId, t('access.transfer', 'Transferir propiedad')));
      actions.append(accessActionButton('revoke', member.userId, t('access.revoke', 'Revocar acceso'), true));
    } else if (state.accessScopeContext === 'project' && member.userId === state.user.userId && actorRole !== 'owner') {
      actions.append(accessActionButton('leave', member.userId, t('access.leave', 'Abandonar proyecto'), true));
    }
    item.append(content, actions);
    if (manageable && canManageAccess) item.append(accessPermissionEditor(member, space));
    elements.accessMemberList.append(item);
  }
  if (!elements.accessMemberList.children.length) elements.accessMemberList.append(emptyRecord(t('access.noMembers', 'No hay participantes disponibles.')));
}
function openAccessManagement(scope = 'project') {
  state.accessScopeContext = scope === 'portfolio' ? 'portfolio' : 'project';
  const space = accessSpace();
  if (!space || (state.accessScopeContext === 'portfolio' && !spaceUserCan(space, 'manage_access'))) return;
  clearAccessConfirmation();
  setStatus(elements.accessStatus, '');
  renderAccessManagement();
  openDialog(elements.accessDialog);
}
function prepareAccessAction(action = '', userId = '') {
  const space = accessSpace();
  const data = accessProjectData();
  if (!space || state.p2pBusy) return;
  const isProjectDeletion = action === 'delete-project';
  if (isProjectDeletion && state.accessScopeContext !== 'project') return;
  const member = isProjectDeletion ? null : (space.members || []).find((candidate) => candidate?.userId === userId);
  if (!isProjectDeletion && !member) return;
  if (['revoke', 'transfer'].includes(action) && !canManageMember(space, member)) return;
  if (action === 'transfer' && (state.accessScopeContext !== 'project' || currentRole(space) !== 'owner')) return;
  if (action === 'leave' && member?.userId !== state.user?.userId) return;
  if (action === 'leave' && state.accessScopeContext !== 'project') return;
  if (isProjectDeletion && !spaceUserCan(space, 'delete_project')) return;
  const portfolioSpace = member ? accessPortfolioForMember(space, member) : null;
  const label = member ? memberLabel(member) : data?.project?.name || t('project.defaultName', 'Proyecto compartido');
  const messages = {
    revoke: (portfolioSpace
      ? t('access.portfolioRevokeConfirm', '{name} perderá el acceso al panel completo y a todos sus proyectos actuales y futuros.')
      : t('access.revokeConfirm', '{name} perderá el acceso y las claves futuras del proyecto.')).replace('{name}', label),
    transfer: t('access.transferConfirm', '{name} será el nuevo propietario. Debe haber abierto y sincronizado completamente este proyecto en al menos uno de sus dispositivos. Tú conservarás acceso como participante.').replace('{name}', label),
    leave: t('access.leaveConfirm', 'Perderás acceso y la copia local de este proyecto se eliminará de este dispositivo.'),
    'delete-project': t('access.deleteConfirm', '{name} y todos sus registros dejarán de aparecer en las vistas activas. Podrás restaurarlo desde la papelera.').replace('{name}', label)
  };
  if (!messages[action]) return;
  state.pendingAccessAction = { action, userId, spaceId: space.spaceId, scope: state.accessScopeContext, portfolioSpaceId: portfolioSpace?.spaceId || '', label };
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
    if (pending.action === 'revoke') {
      const sourceSpace = (state.p2pState.spaces || []).find((space) => space?.spaceId === pending.spaceId) || accessSpace();
      const member = (sourceSpace?.members || []).find((candidate) => candidate?.userId === pending.userId) || null;
      const portfolioSpace = portfolioSpaceById(pending.portfolioSpaceId) || accessPortfolioForMember(sourceSpace, member);
      result = portfolioSpace
        ? await revokePortfolioMemberAccess(portfolioSpace, member)
        : await semillaP2P.revoke(pending.spaceId, pending.userId);
    }
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
    await refreshProjects();
    if (pending.scope === 'project') renderProject();
    renderAccessManagement();
    if (pending.action === 'revoke' && result?.failed) {
      setStatus(elements.accessStatus, t('access.portfolioRevokePartial', 'No se revocó el acceso al panel porque uno o más proyectos no pudieron actualizarse. Se conservará el acceso global hasta completar una revocación consistente.'), 'warning');
    } else if (pending.action === 'revoke' && result?.keyRotation?.completed === false) {
      setStatus(
        elements.accessStatus,
        pending.portfolioSpaceId
          ? t('access.portfolioRevokedRotationPending', 'El acceso global fue revocado, pero una o más rotaciones de clave quedaron pendientes. Reconecta antes de agregar información sensible.')
          : t('access.revokedRotationPending', 'El acceso fue revocado, pero la rotación de clave quedó pendiente. Reconecta este dispositivo antes de seguir agregando información sensible.'),
        'warning'
      );
    } else {
      const message = pending.action === 'transfer'
        ? t('access.transferredSuccess', 'La propiedad fue transferida correctamente.')
        : pending.portfolioSpaceId
          ? t('access.portfolioRevokedSuccess', 'El acceso al panel y a todos sus proyectos fue revocado correctamente.')
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
    const data = selectedProjectData();
    const canEdit = recordCanEdit(data?.space, type, record);
    const canDelete = recordCanDelete(data?.space, type, record);
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
  elements.inviteCollaboratorButton.disabled = authorizationUnconfirmed || !userCan('invite');
  elements.manageAccessButton.disabled = authorizationUnconfirmed || !(data.space.members || []).some((member) => member.userId === state.user?.userId);
  const lifecycleLocked = Boolean(lifecycleTransaction);
  elements.inviteCollaboratorButton.disabled = lifecycleLocked || elements.inviteCollaboratorButton.disabled;
  elements.manageAccessButton.disabled = lifecycleLocked || elements.manageAccessButton.disabled;
  elements.editProjectButton.disabled = !userCan('edit_project'); elements.addPurchaseButton.disabled = !userCan('add'); elements.addIncomeButton.disabled = !userCan('add'); elements.addProjectionButton.disabled = !userCan('projection');
  if (lifecycleLocked) [elements.editProjectButton, elements.addPurchaseButton, elements.addIncomeButton, elements.addProjectionButton].forEach((button) => { button.disabled = true; });
  if (lifecycleTransaction) setStatus(elements.projectStatus, lifecycleStatusMessage(lifecycleTransaction), 'warning');
  else if (authorizationUnconfirmed) setStatus(elements.projectStatus, replicaRecoveryPending ? t('p2p.replicaRecovery', 'La invitación ya fue aceptada. Esta copia permanece en solo lectura hasta recibir y validar el estado compartido completo.') : t('p2p.authorizationUnconfirmed', 'La copia local fue conservada porque el backend no confirmó la membresía ni emitió una revocación explícita. Puedes consultar la información, pero la edición y la sincronización quedan bloqueadas hasta recuperar la autorización.'), 'warning');
}

function showDashboard() { state.selectedSpaceId = ''; clearAccessConfirmation(); elements.projectView.classList.add('hidden'); elements.dashboardView.classList.remove('hidden'); setStatus(elements.projectStatus, ''); renderDashboard(); renderTrash(); }
function openProject(spaceId) {
  const data = state.projects.get(spaceId);
  if (!data || data.project.isTrashed) return;
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
    replicaHealth: nextState.replicaHealth && typeof nextState.replicaHealth === 'object' ? nextState.replicaHealth : {},
    lifecycleTransactions: Array.isArray(nextState.lifecycleTransactions) ? nextState.lifecycleTransactions : []
  };
  renderInvitations();
  if (elements.devicesDialog?.open) renderDevices();
  refreshProjects()
    .then(() => reconcilePortfolioAccess())
    .catch((error) => setStatus(elements.dashboardStatus, error?.message || t('dashboard.loadError', 'No se pudieron cargar los proyectos.'), 'error'));
  queueMicrotask(() => autoAcceptInheritedPortfolioInvitations().catch(() => false));
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
    governanceSpaceId: project.portfolioSpaceId || '',
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
  if (mode === 'create' && !canCreatePortfolioProject()) {
    setStatus(elements.dashboardStatus, t('permissions.projectCreateDenied', 'Tu rol no permite crear proyectos dentro de este panel.'), 'error');
    return;
  }
  if (mode === 'edit' && !userCan('edit_project')) {
    setStatus(elements.projectStatus, t('permissions.projectEditDenied', 'Tu rol no permite editar la información base de este proyecto.'), 'error');
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
  if (mode === 'create' && !canCreatePortfolioProject()) {
    closeDialog(elements.projectDialog);
    setStatus(elements.dashboardStatus, t('permissions.projectCreateDenied', 'Tu rol no permite crear proyectos dentro de este panel.'), 'error');
    return;
  }
  if (mode === 'edit' && !userCan('edit_project')) {
    closeDialog(elements.projectDialog);
    setStatus(elements.projectStatus, t('permissions.projectEditDenied', 'Tu rol no permite editar la información base de este proyecto.'), 'error');
    return;
  }
  const existing = selectedProjectData();
  const activePortfolioSpace = mode === 'create' && spaceUserCan(primaryPortfolioSpace(), 'manage_access') ? primaryPortfolioSpace() : null;
  const project = normalizeProjectInput({
    name: elements.projectNameInput.value,
    description: elements.projectDescriptionInput.value,
    address: elements.projectAddressInput.value,
    initialBudget: elements.projectBudgetInput.value,
    portfolioSpaceId: mode === 'edit' ? existing?.project.portfolioSpaceId : activePortfolioSpace?.spaceId,
    portfolioOwnerUserId: mode === 'edit' ? existing?.project.portfolioOwnerUserId : activePortfolioSpace?.ownerUserId,
    createdAt: mode === 'edit' ? existing?.project.createdAt : ''
  });
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
    await semillaP2P.refreshBootstrap({ requestSnapshots: false });
    applyP2PState(semillaP2P.bootstrapState);
    await refreshProjects();
    closeDialog(elements.projectDialog);
    openProject(spaceId);
    setOperationSavedStatus(publishResult, t('project.saved', 'Proyecto guardado y sincronizado.'));
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
  const accessError = record ? recordAccessError(selectedSpace(), record) : '';
  if (accessError) { setStatus(elements.projectStatus, accessError, 'error'); return; }
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
  const existingAccessError = existing ? recordAccessError(projectData?.space, existing) : '';
  if (existingAccessError) {
    setStatus(elements.recordFormStatus, existingAccessError, 'error');
    return;
  }
  if (type === 'purchase') {
    entityType = PURCHASE_ENTITY_TYPE;
    value = normalizePurchaseInput({ ...input, createdByUserId: existing?.createdByUserId || state.user?.userId, createdAt: existing?.createdAt });
    id = existing?.id || createLocalId('purchase');
  }
  if (type === 'income') {
    entityType = INCOME_ENTITY_TYPE;
    value = normalizeIncomeInput({ ...input, createdByUserId: existing?.createdByUserId || state.user?.userId, createdAt: existing?.createdAt });
    id = existing?.id || createLocalId('income');
  }
  if (type === 'projection') {
    entityType = PROJECTION_ENTITY_TYPE;
    value = normalizeProjectionInput({ ...input, createdByUserId: existing?.createdByUserId || state.user?.userId, createdAt: existing?.createdAt });
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
      createdByUserId: existing?.projectionLink?.createdByUserId || state.user?.userId,
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
          authorship: operationAuthorship(existing, state.user?.userId),
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
        authorship: operationAuthorship(value, state.user?.userId),
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
        authorship: operationAuthorship(projectionLink, state.user?.userId),
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

function recordCanEdit(space = null, type = '', record = null) {
  if (!spaceUserCan(space, type === 'projection' ? 'projection' : 'add')) return false;
  return !record || individualRecordAccess(space || {}, state.user?.userId || '', record).allowed;
}

function recordCanDelete(space = null, type = '', record = null) {
  if (!spaceUserCan(space, 'delete') || (type === 'projection' && !spaceUserCan(space, 'projection'))) return false;
  return !record || individualRecordAccess(space || {}, state.user?.userId || '', record).allowed;
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
    panelId: String(button.dataset.panelId || '').trim(),
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

function actionMenuPanel(context = null) {
  if (!context || context.scope !== 'panel') return null;
  return panelScopes().find((panel) => (
    panel.id === context.panelId
    || String(panel.space?.spaceId || '').trim() === String(context.spaceId || '').trim()
  )) || null;
}

function renderActionMenu() {
  const context = state.actionMenuContext;
  if (!context || !elements.actionMenuList) return;
  clearActionMenuConfirmation();
  setStatus(elements.actionMenuStatus, '');
  elements.actionMenuList.replaceChildren();
  const panel = actionMenuPanel(context);
  const data = context.scope === 'panel' ? null : state.projects.get(context.spaceId);
  if (context.scope === 'panel' && !panel) return;
  if (context.scope !== 'panel' && !data) return;
  const space = panel?.space || data?.space || null;
  const actions = [];

  if (context.scope === 'panel') {
    elements.actionMenuTitle.textContent = panelDisplayName(panel);
    elements.actionMenuContext.textContent = t('actions.panelContext', 'Acciones generales del panel compartido');
    if (!panel.owned && panel.type === 'portfolio' && !isAuthorizationUnconfirmed(space)) {
      if (spaceUserCan(space, 'invite')) actions.push(menuActionButton('invite-panel', '＋', t('actions.invitePanel', 'Invitar')));
      if (currentMember(space)) actions.push(menuActionButton('leave-panel', '↩', t('actions.leavePanel', 'Abandonar panel'), { danger: true }));
    }
  }

  if (context.scope === 'project') {
    elements.actionMenuTitle.textContent = data.project.name;
    elements.actionMenuContext.textContent = t('actions.projectContext', 'Acciones generales del proyecto');
    actions.push(menuActionButton('open-project', '↗', t('actions.openProject', 'Abrir proyecto')));
    if (spaceUserCan(space, 'edit_project')) actions.push(menuActionButton('edit-project', '✎', t('common.edit', 'Editar')));
    if (!isAuthorizationUnconfirmed(space) && spaceUserCan(space, 'invite')) actions.push(menuActionButton('invite-project', '＋', t('project.invite', 'Invitar')));
    if (!isAuthorizationUnconfirmed(space) && (space.members || []).some((member) => member.userId === state.user?.userId)) actions.push(menuActionButton('manage-access', '♙', t('access.manage', 'Participantes')));
    if (spaceUserCan(space, 'delete_project')) actions.push(menuActionButton('trash-project', '♲', t('trash.moveProject', 'Mover a papelera'), { danger: true }));
  }

  if (context.scope === 'record') {
    const record = actionMenuRecord(context);
    elements.actionMenuTitle.textContent = record?.description || recordTypeLabel(context.type);
    elements.actionMenuContext.textContent = recordTypeLabel(context.type);
    if (record && recordCanEdit(space, context.type, record)) actions.push(menuActionButton('edit-record', '✎', t('common.edit', 'Editar')));
    if (record && recordCanDelete(space, context.type, record)) actions.push(menuActionButton('trash-record', '♲', t('trash.moveRecord', 'Mover a papelera'), { danger: true }));
  }

  if (context.scope === 'trash-project') {
    elements.actionMenuTitle.textContent = data.project.name;
    elements.actionMenuContext.textContent = t('trash.projectContext', 'Proyecto completo en la papelera');
    if (spaceUserCan(space, 'delete_project')) {
      actions.push(menuActionButton('restore-project', '↶', t('trash.restore', 'Restaurar')));
      actions.push(menuActionButton('purge-project', '×', t('trash.deletePermanently', 'Eliminar permanentemente'), { danger: true }));
    }
  }

  if (context.scope === 'trash-record') {
    const record = actionMenuRecord(context);
    elements.actionMenuTitle.textContent = record?.description || recordTypeLabel(context.type);
    elements.actionMenuContext.textContent = `${recordTypeLabel(context.type)} · ${t('trash.inTrash', 'En la papelera')}`;
    if (record && recordCanDelete(space, context.type, record)) {
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
  const panel = context ? actionMenuPanel(context) : null;
  const data = context && context.scope !== 'panel' ? state.projects.get(context.spaceId) : null;
  const record = context ? actionMenuRecord(context) : null;
  if (!context || (context.scope === 'panel' ? !panel : !data)) return;
  const projectName = data?.project?.name || t('project.defaultName', 'Proyecto compartido');
  const recordName = record?.description || recordTypeLabel(context.type);
  const messages = {
    'leave-panel': t('actions.leavePanelConfirm', 'Perderás acceso al panel “{name}”, a sus proyectos heredados y a sus copias locales en este dispositivo.').replace('{name}', panelDisplayName(panel)),
    'trash-project': t('trash.confirmProject', 'El proyecto “{name}” y todos sus registros dejarán de aparecer en las vistas activas y en las métricas. Podrás restaurarlo desde la papelera.').replace('{name}', projectName),
    'trash-record': t('trash.confirmRecord', '“{name}” dejará de aparecer en el proyecto y dejará de afectar sus métricas. Podrás restaurarlo desde la papelera.').replace('{name}', recordName),
    'purge-project': t('trash.confirmPermanentProject', 'Se eliminarán permanentemente “{name}”, todos sus registros, el acceso de los participantes y las copias sincronizadas. Esta acción no se puede deshacer.').replace('{name}', projectName),
    'purge-record': t('trash.confirmPermanentRecord', 'Se eliminará permanentemente “{name}”. Ya no podrá restaurarse ni recuperarse desde otros dispositivos.').replace('{name}', recordName)
  };
  if (!messages[action]) return;
  state.pendingActionMenuAction = { action, context: { ...context } };
  elements.actionMenuConfirmMessage.textContent = messages[action];
  elements.actionMenuConfirmButton.textContent = action === 'leave-panel'
    ? t('actions.leavePanelConfirmButton', 'Abandonar panel')
    : action.startsWith('purge-')
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
        await semillaP2P.purge(context.spaceId, PROJECTION_LINK_ENTITY_TYPE, link.id, { expected: link._entity?.value || link, authorship: operationAuthorship(link, state.user?.userId) });
      } catch (error) {
        if (!error?.p2pQueued) throw error;
        queued = true;
      }
    }
  }
  const result = await semillaP2P.purge(context.spaceId, entityType, context.entityId, {
    expected: record._entity.value,
    authorship: operationAuthorship(record, state.user?.userId),
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
      if (!spaceUserCan(data.space, 'delete_project')) throw new Error(t('permissions.projectDeleteDenied', 'Tu rol no permite eliminar proyectos.'));
      if (action === 'trash-project') result = await semillaP2P.trashProjectAfterReplicas(context.spaceId, { expected: data.project._entity?.value || {} });
      if (action === 'restore-project') result = await semillaP2P.restore(context.spaceId, PROJECT_ENTITY_TYPE, PROJECT_ENTITY_ID, { expected: data.project._entity?.value || {} });
      if (action === 'purge-project') result = await semillaP2P.deleteProjectAfterReplicas(context.spaceId);
    } else {
      if (!recordCanDelete(data.space, context.type, record)) throw new Error(t('permissions.deleteDenied', 'No tienes permiso para eliminar registros.'));
      const entityType = RECORD_ENTITY_TYPES[context.type];
      if (!entityType || !record?._entity?.value) throw new Error(t('trash.recordUnavailable', 'No se encontró la versión actual del registro.'));
      if (context.type === 'projection' && (record.actualPurchaseIds || []).length && action !== 'restore-record') {
        throw new Error(t('projection.deleteLinkedError', 'No se puede eliminar una proyección con compras reales vinculadas. Desvincula o elimina esas compras primero.'));
      }
      if (action === 'trash-record') result = await semillaP2P.trash(context.spaceId, entityType, context.entityId, { expected: record._entity.value, authorship: operationAuthorship(record, state.user?.userId) });
      if (action === 'restore-record') result = await semillaP2P.restore(context.spaceId, entityType, context.entityId, { expected: record._entity.value, authorship: operationAuthorship(record, state.user?.userId) });
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
    const coordinatedProjectAction = isProjectAction && ['trash-project', 'purge-project'].includes(action);
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
      const isCoordinatedProjectAction = context?.scope?.includes('project') && ['trash-project', 'purge-project'].includes(action);
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

async function executePanelLeave(context = null) {
  const panel = actionMenuPanel(context);
  if (!panel?.space?.spaceId || panel.owned || state.p2pBusy) return;
  setP2PBusy(true);
  setStatus(elements.actionMenuStatus, t('actions.leavingPanel', 'Abandonando panel…'));
  try {
    await semillaP2P.leave(panel.space.spaceId);
    applyP2PState(semillaP2P.bootstrapState);
    clearActionMenuConfirmation();
    closeDialog(elements.actionMenuDialog);
    await refreshProjects();
    showDashboard();
    setStatus(elements.dashboardStatus, t('actions.leftPanelSuccess', 'Abandonaste el panel y sus copias locales fueron retiradas.'), 'success');
  } catch (error) {
    setStatus(elements.actionMenuStatus, error?.message || t('actions.leavePanelError', 'No se pudo abandonar el panel.'), 'error');
  } finally {
    setP2PBusy(false);
  }
}

async function executeActionMenuConfirmation() {
  const pending = state.pendingActionMenuAction;
  if (!pending) return;
  if (pending.action === 'leave-panel') {
    await executePanelLeave(pending.context);
    return;
  }
  await executeLifecycleAction(pending.action, pending.context);
}

async function handleActionMenuSelection(event) {
  const button = event.target.closest('button[data-menu-action]');
  if (!button || state.p2pBusy) return;
  const action = button.dataset.menuAction;
  const context = state.actionMenuContext;
  if (!context) return;
  if (['leave-panel', 'trash-project', 'trash-record', 'purge-project', 'purge-record'].includes(action)) {
    prepareActionMenuConfirmation(action);
    return;
  }
  if (action === 'restore-project' || action === 'restore-record') {
    await executeLifecycleAction(action, context);
    return;
  }
  closeDialog(elements.actionMenuDialog);
  if (action === 'invite-panel') {
    const panel = actionMenuPanel(context);
    if (panel?.space?.spaceId && spaceUserCan(panel.space, 'invite')) {
      setActivePanelId(panel.id);
      renderDashboard();
      openInviteForm('portfolio');
    }
  }
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
  const trashedRecord = context.scope === 'trash-record' ? actionMenuRecord(context) : null;
  const canAct = context.scope === 'trash-project' ? spaceUserCan(data.space, 'delete_project') : recordCanDelete(data.space, context.type, trashedRecord);
  menu.disabled = !canAct || Boolean(lifecycleTransaction);
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
  const ordered = [...activePanelProjects()].sort((left, right) => String(right.project.trashedAt || right.project.updatedAt || '').localeCompare(String(left.project.trashedAt || left.project.updatedAt || '')));
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

async function inviteAcrossPortfolio(email = '', grant = {}) {
  let portfolioSpace = primaryPortfolioSpace();
  let portfolioResult = null;
  if (portfolioSpace) {
    if (!spaceUserCan(portfolioSpace, 'invite')) throw new Error(t('permissions.denied', 'Tus permisos no permiten realizar esta acción.'));
    if (spaceUserCan(portfolioSpace, 'manage_access')) {
      portfolioResult = await upsertSpaceAccessByEmail(portfolioSpace, email, { ...grant, accessScope: 'portfolio' });
    } else {
      if (memberByEmail(portfolioSpace, email)) throw new Error(t('invite.alreadyMember', 'Esa cuenta ya participa en el panel.'));
      const pending = pendingInvitationMatches(portfolioSpace, email, grant);
      portfolioResult = pending
        ? { reused: true, invitation: pending, space: portfolioSpace }
        : await semillaP2P.invite(email, {
          spaceId: portfolioSpace.spaceId,
          resourceType: PORTFOLIO_RESOURCE_TYPE,
          permissions: grant.permissions,
          role: grant.role,
          accessScope: 'portfolio',
          requestId: createLocalId('portfolio_invite_request')
        });
    }
  } else {
    portfolioResult = await semillaP2P.invite(email, {
      resourceType: PORTFOLIO_RESOURCE_TYPE,
      permissions: grant.permissions,
      role: grant.role,
      accessScope: 'portfolio',
      requestId: createLocalId('portfolio_invite_request')
    });
    portfolioSpace = portfolioResult?.space || null;
    if (portfolioSpace?.spaceId) setActivePanelId(portfolioSpace.spaceId);
  }
  await semillaP2P.refreshBootstrap({ requestSnapshots: false }).catch(() => null);
  applyP2PState(semillaP2P.bootstrapState);
  await refreshProjects();
  return {
    portfolioResult,
    totalProjects: portfolioProjectSpaces(portfolioSpace).length,
    succeeded: 0,
    failed: 0,
    inheritedOnAcceptance: true
  };
}

function invitationTargetSpace(scope = state.inviteScope) {
  return scope === 'portfolio' ? primaryPortfolioSpace() : selectedSpace();
}
function inviteRolesForCurrentMember(space = null) {
  if (!space) return ['manager', 'admin', 'individual', 'member'];
  const role = currentRole(space);
  if (['owner', 'manager'].includes(role)) return ['manager', 'admin', 'individual', 'member'];
  if (role === 'admin') return ['admin', 'individual', 'member'];
  return ['member'];
}
function refreshInvitePermissionControls() {
  const role = normalizeCollaborationRole(elements.inviteRoleSelect?.value || 'member');
  applyRolePresetToPermissionControls(elements.invitePermissionFieldset, role);
  if (role !== 'member') return;
  const space = invitationTargetSpace();
  const actor = currentMember(space);
  const grantable = new Set(space ? rolePermissions(actor?.role, actor?.permissions) : ['read', 'add', 'delete', 'projection', 'invite']);
  if (grantable.has('write')) ['add', 'delete', 'projection'].forEach((permission) => grantable.add(permission));
  elements.invitePermissionFieldset?.querySelectorAll('input[name="permission"]').forEach((checkbox) => {
    if (checkbox.value === 'read') return;
    const allowed = grantable.has(checkbox.value);
    checkbox.disabled = !allowed;
    if (!allowed) checkbox.checked = false;
  });
}
function configureInviteRoleOptions(scope = state.inviteScope) {
  const allowed = new Set(inviteRolesForCurrentMember(invitationTargetSpace(scope)));
  let firstAllowed = '';
  elements.inviteRoleSelect?.querySelectorAll('option').forEach((option) => {
    const enabled = allowed.has(option.value);
    option.disabled = !enabled;
    option.hidden = !enabled;
    if (enabled && !firstAllowed) firstAllowed = option.value;
  });
  if (elements.inviteRoleSelect) elements.inviteRoleSelect.value = firstAllowed || 'member';
}
function openInviteForm(scope = 'project') {
  const normalizedScope = scope === 'portfolio' ? 'portfolio' : 'project';
  if (normalizedScope === 'project' && !selectedProjectData()) return;
  const targetSpace = normalizedScope === 'portfolio' ? primaryPortfolioSpace() : selectedSpace();
  if (targetSpace && !spaceUserCan(targetSpace, 'invite')) return;
  state.inviteScope = normalizedScope;
  elements.inviteForm.reset();
  configureInviteRoleOptions(normalizedScope);
  const defaults = new Set(['read', 'add', 'projection']);
  elements.inviteForm.querySelectorAll('input[name="permission"]').forEach((input) => { input.checked = defaults.has(input.value); });
  refreshInvitePermissionControls();
  if (elements.inviteDialogTitle) elements.inviteDialogTitle.textContent = normalizedScope === 'portfolio'
    ? t('invite.portfolioTitle', 'Invitar a Control de proyectos')
    : t('invite.title', 'Invitar participante');
  if (elements.inviteScopeMessage) elements.inviteScopeMessage.textContent = normalizedScope === 'portfolio'
    ? t('invite.portfolioScope', 'Esta invitación aplica al panel completo y a todos los proyectos actuales y futuros.')
    : t('invite.projectScope', 'Esta invitación aplica únicamente a este proyecto.');
  setStatus(elements.inviteStatus, '');
  openDialog(elements.inviteDialog);
  elements.inviteEmailInput.focus();
}
async function submitInvitation(event) {
  event.preventDefault();
  if (state.p2pBusy) return;
  const scope = state.inviteScope === 'portfolio' ? 'portfolio' : 'project';
  const data = selectedProjectData();
  const email = String(elements.inviteEmailInput.value || '').trim();
  const role = normalizeCollaborationRole(elements.inviteRoleSelect?.value || 'member');
  const selectedPermissions = [...elements.inviteForm.querySelectorAll('input[name="permission"]:checked')].map((input) => input.value);
  const permissions = normalizeCollaborationPermissions(role === 'member' ? selectedPermissions : rolePermissions(role, []));
  if (!email || (scope === 'project' && !data)) return;
  setP2PBusy(true);
  setStatus(elements.inviteStatus, scope === 'portfolio' ? t('invite.portfolioSending', 'Enviando invitación al panel…') : t('invite.sending', 'Enviando invitación…'));
  try {
    if (scope === 'portfolio') {
      const result = await inviteAcrossPortfolio(email, { role, permissions, accessScope: 'portfolio' });
      closeDialog(elements.inviteDialog);
      setStatus(
        elements.dashboardStatus,
        result.portfolioResult?.reused
          ? t('invite.alreadyPending', 'La invitación al panel ya estaba pendiente.')
          : t('invite.portfolioSent', 'Invitación al panel enviada. Al aceptarla, se habilitarán automáticamente los proyectos autorizados.'),
        'success'
      );
    } else {
      const result = await semillaP2P.invite(email, { spaceId: data.space.spaceId, resourceType: PROJECT_RESOURCE_TYPE, permissions, role, accessScope: 'project' });
      applyP2PState(semillaP2P.bootstrapState);
      closeDialog(elements.inviteDialog);
      setStatus(elements.projectStatus, result.reused ? t('invite.alreadyPending', 'La invitación ya estaba pendiente.') : t('invite.sent', 'Invitación enviada correctamente.'), 'success');
    }
  } catch (error) {
    setStatus(elements.inviteStatus, error?.message || t('invite.error', 'No se pudo enviar la invitación.'), 'error');
  } finally { setP2PBusy(false); }
}
async function respondInvitation(event) {
  const button = event.target.closest('button[data-invitation-id]');
  if (!button || state.p2pBusy) return;
  const invitationId = button.dataset.invitationId;
  const decision = button.dataset.decision;
  const invitation = (state.p2pState.invitations?.received || []).find((item) => item.invitationId === invitationId) || null;
  const related = invitation?.resourceType === PORTFOLIO_RESOURCE_TYPE
    ? relatedPortfolioProjectInvitations(state.p2pState.invitations?.received || [], invitation, {
      portfolioResourceType: PORTFOLIO_RESOURCE_TYPE
    })
    : [];
  setP2PBusy(true);
  setStatus(elements.dashboardStatus, invitation?.resourceType === PORTFOLIO_RESOURCE_TYPE && decision === 'accept' ? t('invite.portfolioAccepting', 'Aceptando acceso al panel y a sus proyectos…') : '');
  try {
    const result = await semillaP2P.respondToInvitation(invitationId, decision);
    const relatedResults = [];
    for (const item of related) {
      try { relatedResults.push(await semillaP2P.respondToInvitation(item.invitationId, decision)); }
      catch (error) { relatedResults.push({ error }); }
    }
    const canonicalDecision = resolveCanonicalInvitationDecision(result?.invitation, decision);
    const accessRevoked = result?.accessRevoked === true;
    const replicaPending = result?.replicaPending === true || relatedResults.some((entry) => entry?.replicaPending === true);
    if (canonicalDecision === 'accept' && !accessRevoked) {
      state.pendingPanelId = invitation?.resourceType === PORTFOLIO_RESOURCE_TYPE
        ? String(invitation.spaceId || '').trim()
        : String(invitation?.governanceSpaceId || '').trim()
          || sharedOwnerPanelId(result?.space?.ownerUserId || invitation?.inviterUserId || '')
          || SHARED_PROJECTS_PANEL_ID;
    }
    applyP2PState(semillaP2P.bootstrapState);
    showDashboard();
    if (!(state.p2pState.invitations.received || []).some((item) => item.status === 'pending')) closeDialog(elements.invitationsDialog);
    const message = accessRevoked
      ? t('invite.acceptedAccessRevoked', 'La invitación fue aceptada, pero el acceso fue revocado antes de completar la sincronización.')
      : invitation?.resourceType === PORTFOLIO_RESOURCE_TYPE && canonicalDecision === 'accept'
        ? t('invite.portfolioAccepted', 'Acceso al panel aceptado. Los proyectos compartidos se están incorporando automáticamente.')
        : replicaPending
          ? t('invite.acceptedSyncing', 'Invitación aceptada. Estamos recuperando la copia compartida antes de habilitar la edición.')
          : canonicalDecision === 'accept'
            ? t('invite.accepted', 'Invitación aceptada.')
            : t('invite.rejected', 'Invitación rechazada.');
    setStatus(elements.dashboardStatus, message, accessRevoked || replicaPending ? 'warning' : 'success');
  } catch (error) {
    setStatus(elements.dashboardStatus, error?.message || t('invite.responseError', 'No se pudo responder la invitación.'), 'error');
  } finally { setP2PBusy(false); }
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
  const message = transaction?.action === 'purge'
    ? t('lifecycle.purgeCompleted', 'Todos los dispositivos confirmaron la eliminación permanente del proyecto.')
    : t('lifecycle.trashCompleted', 'Todos los dispositivos confirmaron el envío del proyecto a la papelera.');
  setStatus(elements.trashDialog?.open ? elements.trashStatus : elements.dashboardStatus, message, 'success');
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
elements.managePortfolioAccessButton?.addEventListener('click', () => openAccessManagement('portfolio'));
elements.invitePortfolioButton?.addEventListener('click', () => openInviteForm('portfolio'));
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
elements.panelList?.addEventListener('click', (event) => {
  const menu = event.target.closest('button[data-action-menu-scope="panel"]');
  if (menu) { openActionMenu(actionMenuContextFromButton(menu)); return; }
  const button = event.target.closest('button[data-panel-id]');
  if (!button) return;
  setActivePanelId(button.dataset.panelId);
  state.projectFilterQuery = '';
  if (elements.projectFilterInput) elements.projectFilterInput.value = '';
  renderDashboard();
  renderTrash();
});
elements.projectList?.addEventListener('click', (event) => {
  const menu = event.target.closest('button[data-action-menu-scope]');
  if (menu) { openActionMenu(actionMenuContextFromButton(menu)); return; }
  const open = event.target.closest('button[data-open-project]');
  if (open) openProject(open.dataset.openProject);
});
elements.backButton?.addEventListener('click', showDashboard);
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
elements.inviteCollaboratorButton?.addEventListener('click', () => openInviteForm('project'));
elements.inviteRoleSelect?.addEventListener('change', refreshInvitePermissionControls); elements.inviteForm?.addEventListener('submit', submitInvitation); elements.invitationsButton?.addEventListener('click', () => openDialog(elements.invitationsDialog)); elements.invitationList?.addEventListener('click', respondInvitation);
elements.manageAccessButton?.addEventListener('click', () => openAccessManagement('project'));
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
elements.accessDialog?.addEventListener('close', () => { clearAccessConfirmation(); setStatus(elements.accessStatus, ''); });
elements.actionMenuDialog?.addEventListener('close', () => { state.actionMenuContext = null; clearActionMenuConfirmation(); setStatus(elements.actionMenuStatus, ''); });
document.addEventListener('app-language-ready', () => { renderInvitations(); renderDevices(); renderDashboard(); renderTrash(); renderStorageDurability(); if (state.selectedSpaceId) renderProject(); if (elements.accessDialog?.open) renderAccessManagement(); if (elements.actionMenuDialog?.open) renderActionMenu(); setConnectionState(elements.connectionStatus?.dataset.state || 'connecting'); window.AppAssetLoader?.hydrate(document); });

subscribeSessionTokenChanges(({ token }) => {
  queueExternalSessionSynchronization(token);
});
window.addEventListener('online', () => {
  if (!state.user && getSessionToken()) queueExternalSessionSynchronization(getSessionToken());
  if (state.user) reconcilePortfolioAccess().catch(() => null);
});

restoreSession();
