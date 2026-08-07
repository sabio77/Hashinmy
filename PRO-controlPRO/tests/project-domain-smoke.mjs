import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import {
  absoluteMoneyValue,
  localDateValue,
  buildConcurrentSafePatch,
  buildProjectPanelScopes,
  calculateProjectMetrics,
  MAX_MONEY_VALUE,
  moneyValue,
  hasPermission,
  individualRecordAccess,
  INDIVIDUAL_EDIT_WINDOW_MS,
  legacyPortfolioProjectsForInvitation,
  normalizeCollaborationRole,
  operationAuthorship,
  rolePermissions,
  sharedOwnerPanelId,
  normalizeCollaborationPermissions,
  normalizeProjectInput,
  normalizeProjectFilterText,
  projectMatchesFilter,
  normalizePurchaseInput,
  normalizeIncomeInput,
  normalizeProjectionInput,
  normalizeProjectionLinkInput,
  projectRecord,
  resolveProjectionActuals,
  resolvePurchaseProjectionLinks,
  sumMoneyValues
} from '../src/js/project-domain.js';

const sharedOwnerA = {
  userId: 'owner_a',
  profile: { displayName: 'Cuenta A', email: 'owner-a@example.com' }
};
const sharedOwnerB = {
  userId: 'owner_b',
  profile: { displayName: 'Cuenta B', email: 'owner-b@example.com' }
};
const authorizedProjects = [
  {
    space: { spaceId: 'project_a_1', ownerUserId: 'owner_a', governanceSpaceId: 'portfolio_a', members: [sharedOwnerA] },
    project: { name: 'Proyecto A1', portfolioSpaceId: 'portfolio_a', portfolioOwnerUserId: 'owner_a' }
  },
  {
    space: { spaceId: 'project_a_2', ownerUserId: 'owner_a', governanceSpaceId: 'portfolio_a', members: [sharedOwnerA] },
    project: { name: 'Proyecto A2', portfolioSpaceId: 'portfolio_a', portfolioOwnerUserId: 'owner_a' }
  },
  {
    space: { spaceId: 'project_b_1', ownerUserId: 'owner_b', governanceSpaceId: 'portfolio_b', members: [sharedOwnerB] },
    project: { name: 'Proyecto B1', portfolioSpaceId: 'portfolio_b', portfolioOwnerUserId: 'owner_b' }
  }
];
const guestPanels = buildProjectPanelScopes({
  spaces: [],
  projects: authorizedProjects,
  currentUserId: 'guest',
  activePanelId: '',
  portfolioResourceType: 'admin.portfolio'
});
const panelA = guestPanels.find((panel) => panel.id === 'portfolio_a');
const panelB = guestPanels.find((panel) => panel.id === 'portfolio_b');
assert.equal(panelA?.type, 'shared-portfolio', 'Una invitación de proyecto debe materializar el panel virtual de su propietario.');
assert.deepEqual(panelA?.projects.map((entry) => entry.space.spaceId), ['project_a_1', 'project_a_2'], 'El panel virtual debe agrupar únicamente los proyectos autorizados del mismo panel.');
assert.equal(panelA?.ownerProfile?.displayName, 'Cuenta A', 'El panel virtual debe identificar al propietario usando el miembro autorizado del proyecto.');
assert.deepEqual(panelB?.projects.map((entry) => entry.space.spaceId), ['project_b_1'], 'Los proyectos de propietarios distintos no deben mezclarse.');
assert.equal(guestPanels.some((panel) => panel.id === '__shared_projects_panel__'), false, 'Los proyectos con identidad de panel conocida no deben caer en un contenedor genérico.');

const afterSingleRevocation = buildProjectPanelScopes({
  spaces: [],
  projects: authorizedProjects.filter((entry) => entry.space.spaceId !== 'project_a_1'),
  currentUserId: 'guest'
});
assert.deepEqual(afterSingleRevocation.find((panel) => panel.id === 'portfolio_a')?.projects.map((entry) => entry.space.spaceId), ['project_a_2'], 'Revocar un proyecto debe retirarlo del panel sin afectar otros accesos vigentes.');
const afterFullRevocation = buildProjectPanelScopes({
  spaces: [],
  projects: authorizedProjects.filter((entry) => entry.space.ownerUserId !== 'owner_a'),
  currentUserId: 'guest'
});
assert.equal(afterFullRevocation.some((panel) => panel.id === 'portfolio_a'), false, 'Al revocar todos los proyectos de un panel debe desaparecer también la vinculación visual completa.');
assert.equal(sharedOwnerPanelId(' owner_legacy '), '__shared_owner_panel__:owner_legacy', 'Los proyectos legacy sin governanceSpaceId deben conservar una agrupación estable por propietario.');

const portfolioForLegacyRecovery = {
  spaceId: 'portfolio_legacy',
  resourceType: 'admin.portfolio',
  ownerUserId: 'owner_a'
};
const legacyProjects = [
  {
    space: { spaceId: 'legacy_blank', resourceType: 'admin.project', ownerUserId: 'owner_a', governanceSpaceId: '' },
    project: { name: 'Proyecto anterior', portfolioSpaceId: '', portfolioOwnerUserId: 'owner_a' }
  },
  {
    space: { spaceId: 'legacy_persisted', resourceType: 'admin.project', ownerUserId: 'owner_a', governanceSpaceId: '' },
    project: { name: 'Proyecto anterior enlazado', portfolioSpaceId: 'portfolio_legacy', portfolioOwnerUserId: 'owner_a' }
  },
  {
    space: { spaceId: 'governed', resourceType: 'admin.project', ownerUserId: 'owner_a', governanceSpaceId: 'portfolio_legacy' },
    project: { name: 'Proyecto nuevo', portfolioSpaceId: 'portfolio_legacy', portfolioOwnerUserId: 'owner_a' }
  },
  {
    space: { spaceId: 'other_portfolio', resourceType: 'admin.project', ownerUserId: 'owner_a', governanceSpaceId: 'portfolio_other' },
    project: { name: 'Proyecto de otro panel', portfolioSpaceId: 'portfolio_other', portfolioOwnerUserId: 'owner_a' }
  },
  {
    space: { spaceId: 'other_owner', resourceType: 'admin.project', ownerUserId: 'owner_b', governanceSpaceId: '' },
    project: { name: 'Proyecto ajeno', portfolioSpaceId: '', portfolioOwnerUserId: 'owner_b' }
  }
];
assert.deepEqual(
  legacyPortfolioProjectsForInvitation(legacyProjects, portfolioForLegacyRecovery).map((entry) => entry.space.spaceId),
  ['legacy_blank', 'legacy_persisted'],
  'La compatibilidad debe seleccionar solo proyectos anteriores del mismo propietario que el backend todavía no gobierna.'
);

const acceptedPortfolioPanels = buildProjectPanelScopes({
  spaces: [{
    spaceId: 'portfolio_a',
    resourceType: 'admin.portfolio',
    ownerUserId: 'owner_a',
    members: [sharedOwnerA, { userId: 'guest', role: 'member', permissions: ['read'], accessScope: 'portfolio' }]
  }],
  projects: authorizedProjects.slice(0, 2),
  currentUserId: 'guest'
});
assert.equal(acceptedPortfolioPanels.filter((panel) => panel.id === 'portfolio_a').length, 1, 'Aceptar el panel completo debe reutilizar la misma identidad y no duplicar el panel virtual.');
assert.equal(acceptedPortfolioPanels.find((panel) => panel.id === 'portfolio_a')?.type, 'portfolio', 'La membresía real del panel debe sustituir transparentemente la vista virtual.');

const missingProject = projectRecord({ spaceId: 'space_missing', title: 'Espacio compartido' }, []);
assert.equal(missingProject.loaded, false, 'Un espacio sin entidad raíz debe identificarse como incompleto.');

const project = normalizeProjectInput({ name: 'Obra Norte', initialBudget: '$100.000.000' });
assert.equal(project.initialBudget, 100000000);
assert.equal(project.name, 'Obra Norte');
const portfolioProject = normalizeProjectInput({
  name: 'Obra compartida',
  initialBudget: 5000000,
  portfolioSpaceId: 'portfolio_space_1',
  portfolioOwnerUserId: 'owner_1'
});
assert.equal(portfolioProject.portfolioSpaceId, 'portfolio_space_1', 'Cada proyecto debe conservar el espacio de panel que gobierna su acceso global.');
assert.equal(portfolioProject.portfolioOwnerUserId, 'owner_1', 'La asociación heredada por propietario debe persistirse para compatibilidad y recuperación.');
assert.equal(normalizeProjectFilterText('  Dirección ÁRBOL #12  '), 'direccion arbol 12', 'El filtro debe ignorar mayúsculas, tildes y símbolos.');
assert.equal(projectMatchesFilter({ name: 'مشروع البناء', description: 'مخزن مركزي', address: 'عمان' }, 'البناء مخزن'), true, 'El filtro debe conservar alfabetos no latinos admitidos por la interfaz multidioma.');
assert.equal(projectMatchesFilter({ name: 'Obra Norte', description: 'Remodelación comercial', address: 'Carrera 7 Bogotá' }, 'nort remo'), true, 'Las palabras parciales coincidentes deben buscarse en todos los campos.');
assert.equal(projectMatchesFilter({ name: 'Obra Norte', description: 'Remodelación comercial', address: 'Carrera 7 Bogotá' }, 'bogota comercial'), true, 'El filtro debe aceptar varias palabras aunque pertenezcan a campos diferentes.');
assert.equal(projectMatchesFilter({ name: 'Obra Norte', description: 'Remodelación comercial', address: 'Carrera 7 Bogotá' }, 'bogota industrial'), false, 'Todas las palabras escritas deben coincidir para evitar resultados irrelevantes.');
assert.equal(moneyValue('1e6'), 1000000, 'La notación científica de un input number no debe degradarse a 16.');
assert.equal(moneyValue('1.25e6'), 1250000, 'La notación científica decimal debe conservar su magnitud.');
assert.equal(moneyValue('1,25e6'), 1250000, 'La notación científica con coma decimal debe conservar su magnitud.');
assert.equal(moneyValue('9.007.199.254.740.991'), MAX_MONEY_VALUE, 'El mayor entero seguro debe conservarse exactamente.');
assert.equal(moneyValue('9007199254740992'), 0, 'Un importe fuera del rango entero seguro debe rechazarse sin redondeo silencioso.');
assert.equal(moneyValue('$1e6'), 0, 'Una notación científica contaminada no debe degradarse a otro importe.');
assert.equal(moneyValue('1.2.3'), 0, 'Un importe con separadores decimales mal formados debe rechazarse.');
assert.equal(moneyValue('-1000'), 0, 'Los importes negativos deben seguir rechazándose.');

const previousTimezone = process.env.TZ;
const NativeDate = globalThis.Date;
process.env.TZ = 'America/Bogota';
try {
  const eveningInColombia = new NativeDate('2026-08-01T01:15:00.000Z');
  assert.equal(eveningInColombia.toISOString().slice(0, 10), '2026-08-01', 'La referencia UTC debe demostrar el salto de día que originaba la regresión.');
  assert.equal(localDateValue(eveningInColombia), '2026-07-31', 'La fecha administrativa debe conservar el día calendario local del dispositivo.');
  assert.equal(localDateValue('fecha-invalida'), '', 'Una fecha inválida no debe materializar un valor administrativo falso.');

  globalThis.Date = class FixedAdministrativeDate extends NativeDate {
    constructor(...args) {
      super(...(args.length ? args : ['2026-08-01T01:15:00.000Z']));
    }
    static now() { return new NativeDate('2026-08-01T01:15:00.000Z').getTime(); }
  };
  assert.equal(normalizePurchaseInput({ description: 'Compra', amount: 1000 }).purchasedAt, '2026-07-31', 'La compra sin fecha explícita debe usar el día local.');
  assert.equal(normalizeIncomeInput({ description: 'Ingreso', amount: 1000 }).receivedAt, '2026-07-31', 'El ingreso sin fecha explícita debe usar el día local.');
} finally {
  globalThis.Date = NativeDate;
  if (previousTimezone === undefined) delete process.env.TZ;
  else process.env.TZ = previousTimezone;
}

const projection = normalizeProjectionInput({ description: 'Acero', projectedAmount: '12.500.000' });
assert.equal(projection.projectedAmount, 12500000);
assert.equal(projection.status, 'pending');


const resolved = resolveProjectionActuals(
  [{ id: 'projection_1', description: 'Acero', projectedAmount: 12000000 }],
  [
    { id: 'purchase_1', projectionId: 'projection_1', amount: 7000000 },
    { id: 'purchase_2', projectionId: 'projection_1', amount: 6500000 }
  ]
);
assert.equal(resolved[0].status, 'completed');
assert.equal(resolved[0].actualAmount, 13500000);
assert.deepEqual(resolved[0].actualPurchaseIds, ['purchase_1', 'purchase_2']);
assert.equal(resolved[0].varianceAmount, 1500000);
assert.equal(resolved[0].varianceStatus, 'over');

const underBudget = resolveProjectionActuals(
  [{ id: 'projection_2', projectedAmount: 5000000 }],
  [{ id: 'purchase_3', projectionId: 'projection_2', amount: 4200000 }]
)[0];
assert.equal(underBudget.varianceAmount, -800000);
assert.equal(underBudget.varianceStatus, 'under');

const exactBudget = resolveProjectionActuals(
  [{ id: 'projection_3', projectedAmount: 2500000 }],
  [{ id: 'purchase_4', projectionId: 'projection_3', amount: 2500000 }]
)[0];
assert.equal(exactBudget.varianceAmount, 0);
assert.equal(exactBudget.varianceStatus, 'exact');

const pendingBudget = resolveProjectionActuals([{ id: 'projection_4', projectedAmount: 1000000 }], [])[0];
assert.equal(pendingBudget.varianceAmount, 0);
assert.equal(pendingBudget.varianceStatus, 'pending');

const forgedLegacyPurchase = [{ id: 'purchase_secure', projectionId: 'projection_secure', amount: 900000 }];
const strictWithoutLink = resolveProjectionActuals(
  [{ id: 'projection_secure', projectedAmount: 1000000 }],
  forgedLegacyPurchase,
  [],
  { strictLinks: true }
)[0];
assert.equal(strictWithoutLink.status, 'pending');
assert.equal(strictWithoutLink.actualAmount, 0);

const secureLink = normalizeProjectionLinkInput({
  purchaseId: 'purchase_secure',
  projectionId: 'projection_secure'
});
const strictWithLink = resolveProjectionActuals(
  [{ id: 'projection_secure', projectedAmount: 1000000 }],
  forgedLegacyPurchase,
  [{ id: 'purchase_secure', ...secureLink }],
  { strictLinks: true }
)[0];
assert.equal(strictWithLink.status, 'completed');
assert.equal(strictWithLink.actualAmount, 900000);
assert.equal(strictWithLink.varianceStatus, 'under');

const unlinkedPurchases = resolvePurchaseProjectionLinks(
  forgedLegacyPurchase,
  [{ id: 'purchase_secure', purchaseId: 'purchase_secure', projectionId: '', active: false }],
  { strictLinks: true }
);
assert.equal(unlinkedPurchases[0].projectionId, '');
assert.equal(unlinkedPurchases[0].projectionLink.active, false);

const metrics = calculateProjectMetrics(
  project,
  [{ amount: 30000000 }, { amount: 5000000 }],
  [{ amount: 10000000 }],
  [
    { projectedAmount: 12000000, actualAmount: 13500000, status: 'completed' },
    { projectedAmount: 8000000, status: 'pending' }
  ]
);
assert.equal(metrics.totalCapital, 110000000);
assert.equal(metrics.totalPurchases, 35000000);
assert.equal(metrics.availableCapital, 75000000);
assert.equal(metrics.projectedPending, 8000000);
assert.equal(metrics.projectionVariance, 1500000);
assert.equal(metrics.projectedAvailable, 67000000);

const exactLargeMetrics = calculateProjectMetrics(
  { initialBudget: MAX_MONEY_VALUE },
  [{ amount: MAX_MONEY_VALUE }, { amount: MAX_MONEY_VALUE }],
  [{ amount: MAX_MONEY_VALUE }],
  [{ projectedAmount: MAX_MONEY_VALUE, status: 'pending' }]
);
assert.equal(exactLargeMetrics.totalCapital, BigInt(MAX_MONEY_VALUE) * 2n, 'El capital agregado debe conservar precisión más allá de Number.MAX_SAFE_INTEGER.');
assert.equal(exactLargeMetrics.totalPurchases, BigInt(MAX_MONEY_VALUE) * 2n, 'Las compras agregadas no deben redondearse silenciosamente.');
assert.equal(exactLargeMetrics.availableCapital, 0, 'Las restas exactas deben compactarse a number cuando vuelven al rango seguro.');
assert.equal(exactLargeMetrics.projectedAvailable, -MAX_MONEY_VALUE, 'Los saldos proyectados deben volver a number cuando permanecen dentro del rango seguro.');
assert.equal(Number.isFinite(exactLargeMetrics.budgetUsage), true, 'El porcentaje presupuestal debe seguir siendo finito con agregados grandes.');

const exactLargeProjection = resolveProjectionActuals(
  [{ id: 'projection_large', projectedAmount: MAX_MONEY_VALUE }],
  [
    { id: 'purchase_large_1', projectionId: 'projection_large', amount: MAX_MONEY_VALUE },
    { id: 'purchase_large_2', projectionId: 'projection_large', amount: MAX_MONEY_VALUE }
  ]
)[0];
assert.equal(exactLargeProjection.actualAmount, BigInt(MAX_MONEY_VALUE) * 2n, 'Una proyección con varias facturas debe sumar sin pérdida de precisión.');
assert.equal(exactLargeProjection.varianceAmount, MAX_MONEY_VALUE, 'La variación debe volver a number cuando permanece dentro del rango seguro.');
assert.equal(exactLargeProjection.varianceStatus, 'over');

const exactHugeProjection = resolveProjectionActuals(
  [{ id: 'projection_huge', projectedAmount: MAX_MONEY_VALUE }],
  [
    { id: 'purchase_huge_1', projectionId: 'projection_huge', amount: MAX_MONEY_VALUE },
    { id: 'purchase_huge_2', projectionId: 'projection_huge', amount: MAX_MONEY_VALUE },
    { id: 'purchase_huge_3', projectionId: 'projection_huge', amount: MAX_MONEY_VALUE }
  ]
)[0];
assert.equal(exactHugeProjection.varianceAmount, BigInt(MAX_MONEY_VALUE) * 2n, 'Una variación agregada puede superar el entero seguro sin perder precisión.');
assert.equal(absoluteMoneyValue(exactHugeProjection.varianceAmount), BigInt(MAX_MONEY_VALUE) * 2n, 'El valor absoluto monetario debe aceptar BigInt para que la interfaz no falle al mostrar sobrecostos grandes.');
assert.equal(absoluteMoneyValue(-MAX_MONEY_VALUE), MAX_MONEY_VALUE, 'El valor absoluto debe conservar el contrato number en resultados seguros.');
assert.equal(sumMoneyValues([{ available: -700 }, { available: 1200 }], (item) => item.available), 500, 'El consolidado debe conservar saldos negativos derivados en lugar de descartarlos.');

const space = { members: [{ userId: 'guest', role: 'member', permissions: ['read', 'add'] }] };
assert.equal(hasPermission(space, 'guest', 'read'), true);
assert.equal(hasPermission(space, 'guest', 'add'), true);
assert.equal(hasPermission(space, 'guest', 'delete'), false);
assert.deepEqual(normalizeCollaborationPermissions(['projection', 'delete']), ['read', 'delete', 'projection']);

const roleSpace = {
  members: [
    { userId: 'owner', role: 'owner', permissions: [] },
    { userId: 'manager', role: 'manager', permissions: [] },
    { userId: 'admin', role: 'admin', permissions: [] },
    { userId: 'individual', role: 'individual', permissions: [] }
  ]
};
assert.equal(normalizeCollaborationRole('GERENTE'), 'member', 'Los roles se transportan con identificadores canónicos y no con etiquetas traducidas.');
assert.equal(normalizeCollaborationRole('manager'), 'manager');
assert.equal(hasPermission(roleSpace, 'manager', 'delete_project'), true, 'Gerente debe conservar control total, incluida la eliminación del proyecto.');
assert.equal(hasPermission(roleSpace, 'admin', 'edit_project'), true, 'Admin debe poder editar el proyecto.');
assert.equal(hasPermission(roleSpace, 'admin', 'manage_access'), true, 'Admin debe poder gestionar participantes.');
assert.equal(hasPermission(roleSpace, 'admin', 'delete_project'), false, 'Admin no puede eliminar proyectos.');
assert.equal(hasPermission(roleSpace, 'individual', 'add'), true, 'Individual puede crear registros propios.');
assert.equal(hasPermission(roleSpace, 'individual', 'delete_project'), false, 'Individual nunca puede eliminar proyectos.');
assert.deepEqual(rolePermissions('admin'), ['read', 'add', 'delete', 'projection', 'invite', 'write']);

const now = Date.parse('2026-08-04T18:00:00.000Z');
const ownRecentRecord = { createdByUserId: 'individual', createdAt: new Date(now - 30 * 60 * 1000).toISOString() };
const ownExpiredRecord = { createdByUserId: 'individual', createdAt: new Date(now - INDIVIDUAL_EDIT_WINDOW_MS - 1).toISOString() };
const foreignRecord = { createdByUserId: 'other-user', createdAt: new Date(now - 10 * 60 * 1000).toISOString() };
assert.deepEqual(individualRecordAccess(roleSpace, 'individual', ownRecentRecord, now), { restricted: true, owner: true, withinWindow: true, allowed: true });
assert.equal(individualRecordAccess(roleSpace, 'individual', ownExpiredRecord, now).allowed, false, 'Individual pierde edición y eliminación al cumplirse una hora.');
assert.equal(individualRecordAccess(roleSpace, 'individual', foreignRecord, now).allowed, false, 'Individual no puede operar registros de terceros.');
assert.deepEqual(operationAuthorship(ownRecentRecord, 'individual'), { ownerUserId: 'individual', createdAt: ownRecentRecord.createdAt });

const conditionalPatch = buildConcurrentSafePatch(
  { name: 'Obra Norte', address: 'Calle 1', initialBudget: 100000000, updatedAt: 'old' },
  { name: 'Obra Norte', address: 'Calle 2', initialBudget: 100000000, updatedAt: 'new' },
  ['name', 'address', 'initialBudget']
);
assert.equal(conditionalPatch.changed, true);
assert.deepEqual(conditionalPatch.changedFields, ['address']);
assert.deepEqual(conditionalPatch.expected, { address: 'Calle 1' });
assert.deepEqual(conditionalPatch.patch, { address: 'Calle 2', updatedAt: 'new' });

const currentFile = fileURLToPath(import.meta.url);
const appSource = await fs.readFile(path.resolve(path.dirname(currentFile), '../src/js/app.js'), 'utf8');
assert.equal(appSource.includes("elements.projectionLinkField.classList.toggle('hidden', !canManageProjectionLink)"), true);
assert.equal(appSource.includes('permissionProfile: ADMIN_PROJECT_PERMISSION_PROFILE'), true);
assert.equal(appSource.includes('PROJECTION_LINK_ENTITY_TYPE'), true);
assert.equal(/referenceRequirements:\s*\[\{[\s\S]*entityType:\s*PROJECTION_ENTITY_TYPE[\s\S]*entityId:\s*projectionLink\.projectionId/.test(appSource), true);
assert.equal(/strictProjectionLinks[\s\S]*PROJECTION_LINK_ENTITY_TYPE, field: 'projectionId'/.test(appSource), true);
assert.equal(/dependentDeletes:\s*\[\{[\s\S]*entityType:\s*PROJECTION_LINK_ENTITY_TYPE[\s\S]*relation:\s*'admin\.purchase-projection-link-v1'/.test(appSource), true);
assert.equal(/orphanLinks[\s\S]*!activePurchaseIds\.has\(String\(link\?\.purchaseId/.test(appSource), true);
assert.equal(appSource.includes('function isSelectedProjectOwner()'), true);
assert.equal(appSource.includes("elements.editProjectButton.disabled = !userCan('edit_project')"), true, 'La edición del proyecto debe obedecer al rol efectivo.');
assert.equal(/mode === 'edit' && !userCan\('edit_project'\)/.test(appSource), true, 'El formulario debe validar la edición por rol antes de abrir y guardar.');
assert.equal((appSource.match(/permissions\.projectEditDenied/g) || []).length >= 2, true);
assert.equal(appSource.includes('money(absoluteMoneyValue(record.varianceAmount || 0))'), true, 'La etiqueta de variación debe usar la operación monetaria compatible con BigInt.');
assert.equal(appSource.includes('const today = localDateValue()'), true, 'El formulario debe usar el día calendario local del dispositivo.');
assert.equal(appSource.includes('new Date().toISOString().slice(0, 10)'), false, 'La interfaz no debe volver a derivar fechas administrativas desde UTC.');
assert.equal(appSource.includes('Math.abs(record.varianceAmount || 0)'), false, 'Math.abs no admite BigInt y no debe reaparecer en la ruta de renderizado monetario.');
assert.equal(appSource.includes('state.projects = new Map(entries.filter(([, data]) => data.project.loaded))'), true, 'La interfaz no debe materializar cards de espacios sin proyecto raíz.');
assert.equal(appSource.includes('recoverMissingProjectCards(missingProjectSpaceIds)'), true, 'Los espacios incompletos deben intentar recuperar una réplica antes de permanecer ocultos.');
assert.equal(appSource.includes('projectMatchesFilter(item.project, normalizedFilter)'), true, 'La lista debe aplicar el filtro local sin consultar memoriaBACKEND.');
assert.equal(appSource.includes("elements.projectFilterInput?.addEventListener('input'"), true, 'El filtro debe reaccionar mientras el usuario escribe.');
assert.equal(appSource.includes("const PORTFOLIO_RESOURCE_TYPE = 'admin.portfolio'"), true, 'La invitación global debe usar un espacio de cartera aislado de los proyectos.');
assert.equal(appSource.includes("accessScope: 'portfolio'"), true, 'El alcance global debe persistirse explícitamente.');
assert.equal(appSource.includes('inviteAcrossPortfolio(email'), true, 'El panel debe crear la invitación global.');
assert.equal(appSource.includes('inheritedOnAcceptance: true'), true, 'La interfaz debe delegar en memoriaBACKEND la herencia de proyectos al aceptar el panel.');
assert.equal(appSource.includes("const inheritedCollaborators = mode === 'create'"), false, 'La creación de proyectos no debe volver a generar invitaciones secundarias desde la interfaz.');
assert.equal(appSource.includes('? await invitePortfolioCollaboratorsToProject(spaceId'), false, 'Los proyectos futuros deben heredar participantes desde el backend, no mediante una cascada de invitaciones del navegador.');
assert.equal(appSource.includes('legacyPortfolioProjectsForInvitation('), true, 'La invitación global debe detectar proyectos anteriores que todavía no tienen gobernanza backend.');
assert.equal(appSource.includes('await inviteLegacyPortfolioProjects(email, portfolioSpace, grant)'), true, 'Solo los proyectos legacy deben recibir una concesión explícita de compatibilidad.');
assert.equal(/for \(const data of legacyProjects\)[\s\S]*upsertSpaceAccessByEmail\(data\.space, email/.test(appSource), true, 'La recuperación legacy debe ser determinista y conservar rol, permisos y alcance de panel.');
assert.equal(appSource.includes('function projectBelongsToPortfolio(data = null, portfolioSpace = null)'), true, 'La propagación global debe resolver explícitamente qué proyectos pertenecen a cada panel.');
assert.equal(appSource.includes("data.project?.portfolioSpaceId"), true, 'El aislamiento global debe priorizar el identificador persistido del panel.');
assert.equal(appSource.includes('async function reconcilePortfolioAccess()'), true, 'Las propagaciones parciales deben reconciliarse automáticamente al recuperar conectividad.');
assert.equal(appSource.includes('async function updatePortfolioMemberAccess('), true, 'Cambiar un rol global debe iniciar la propagación autoritativa desde el panel.');
assert.equal(appSource.includes('semillaP2P.updatePermissions(\n    portfolioSpace.spaceId'), true, 'Los permisos globales deben enviarse una sola vez al panel para que memoriaBACKEND los propague.');
assert.equal(appSource.includes('async function revokePortfolioMemberAccess('), true, 'Revocar un rol global debe retirar el vínculo autoritativo del panel.');
assert.equal(appSource.includes('semillaP2P.revoke(portfolioSpace.spaceId, member.userId)'), true, 'La revocación global debe usar la cascada completa del backend en una sola operación de interfaz.');
assert.equal(appSource.includes('function portfolioProjectsOwnedBy('), true, 'La administración global debe detectar proyectos cuya propiedad impide una revocación consistente.');
assert.equal(appSource.includes('access.portfolioOwnerRevokeBlocked'), true, 'No se debe retirar parcialmente a un participante que todavía sea propietario de proyectos asociados.');
assert.equal(appSource.includes("role: isPortfolioOwner ? 'manager'"), true, 'El propietario del panel debe heredar control en proyectos creados por un Gerente.');
assert.equal(appSource.includes("['owner', 'manager', 'admin'].includes(currentRole(portfolioSpace))"), true, 'Propietario, Gerente y Admin deben poder crear proyectos; Individual no debe hacerlo.');
assert.equal(appSource.includes("governanceSpaceId: project.portfolioSpaceId || ''"), true, 'La creación debe delegar la propiedad al panel sin convertir al Admin en propietario.');
assert.equal(appSource.includes("['owner', 'manager', 'admin'].includes(normalizeCollaborationRole(member?.role))"), true, 'Las invitaciones heredadas deben aceptar como emisores autorizados al propietario, Gerente y Admin del panel.');
assert.equal(appSource.includes("individualRecordAccess(space || {}, state.user?.userId || '', record)"), true, 'La interfaz debe aplicar la ventana Individual antes de editar o eliminar.');
assert.equal(appSource.includes('authorship: operationAuthorship'), true, 'Las operaciones deben transportar autoría verificable al backend.');

const indexSource = await fs.readFile(path.resolve(path.dirname(currentFile), '../index.html'), 'utf8');
assert.equal(/id="project-budget-input"[^>]*max="9007199254740991"/.test(indexSource), true);
assert.equal(indexSource.includes('id="project-filter-input"'), true, 'El panel debe incluir un input de filtro encima de la lista.');
assert.equal(indexSource.includes('aria-controls="project-list"'), true, 'El filtro debe declarar accesiblemente la lista que controla.');
assert.equal(indexSource.includes('id="manage-portfolio-access-button"'), true, 'El panel debe permitir administrar directamente los participantes globales.');
assert.equal(indexSource.includes('id="access-dialog-title"'), true, 'El diálogo de acceso debe adaptar su título al alcance panel o proyecto.');
assert.equal(/id="record-amount-input"[^>]*max="9007199254740991"/.test(indexSource), true);

console.log('OK: dominio administrativo, roles Gerente/Admin/Individual, invitación global, autoría temporal, vínculos de proyección, métricas exactas, permisos y parches concurrentes validados.');
assert.equal(appSource.includes('relatedPortfolioProjectInvitations('), true, 'Aceptar un panel debe incorporar en una sola operación sus proyectos heredados correlacionados.');
assert.equal(appSource.includes('autoAcceptablePortfolioProjectInvitations('), true, 'La aceptación automática debe recuperar proyectos heredados incluso para paneles legacy sin mezclar asociaciones ambiguas.');
assert.equal(appSource.includes('portfolioAuthorizations.push({'), true, 'Cada panel aceptado debe declarar por separado su rol y sus remitentes autorizados.');
