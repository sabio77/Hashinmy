import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import {
  absoluteMoneyValue,
  localDateValue,
  buildConcurrentSafePatch,
  calculateProjectMetrics,
  MAX_MONEY_VALUE,
  moneyValue,
  hasPermission,
  normalizeCollaborationPermissions,
  normalizeProjectInput,
  normalizePurchaseInput,
  normalizeIncomeInput,
  normalizeProjectionInput,
  normalizeProjectionLinkInput,
  projectRecord,
  resolveProjectionActuals,
  resolvePurchaseProjectionLinks,
  sumMoneyValues
} from '../src/js/project-domain.js';

const missingProject = projectRecord({ spaceId: 'space_missing', title: 'Espacio compartido' }, []);
assert.equal(missingProject.loaded, false, 'Un espacio sin entidad raíz debe identificarse como incompleto.');

const project = normalizeProjectInput({ name: 'Obra Norte', initialBudget: '$100.000.000' });
assert.equal(project.initialBudget, 100000000);
assert.equal(project.name, 'Obra Norte');
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
assert.equal(appSource.includes('elements.editProjectButton.disabled = !isSelectedProjectOwner()'), true);
assert.equal(/mode === 'edit' && !isSelectedProjectOwner\(\)/.test(appSource), true);
assert.equal((appSource.match(/project\.ownerEditOnly/g) || []).length >= 2, true);
assert.equal(appSource.includes('money(absoluteMoneyValue(record.varianceAmount || 0))'), true, 'La etiqueta de variación debe usar la operación monetaria compatible con BigInt.');
assert.equal(appSource.includes('const today = localDateValue()'), true, 'El formulario debe usar el día calendario local del dispositivo.');
assert.equal(appSource.includes('new Date().toISOString().slice(0, 10)'), false, 'La interfaz no debe volver a derivar fechas administrativas desde UTC.');
assert.equal(appSource.includes('Math.abs(record.varianceAmount || 0)'), false, 'Math.abs no admite BigInt y no debe reaparecer en la ruta de renderizado monetario.');
assert.equal(appSource.includes('state.projects = new Map(entries.filter(([, data]) => data.project.loaded))'), true, 'La interfaz no debe materializar cards de espacios sin proyecto raíz.');
assert.equal(appSource.includes('recoverMissingProjectCards(missingProjectSpaceIds)'), true, 'Los espacios incompletos deben intentar recuperar una réplica antes de permanecer ocultos.');

const indexSource = await fs.readFile(path.resolve(path.dirname(currentFile), '../index.html'), 'utf8');
assert.equal(/id="project-budget-input"[^>]*max="9007199254740991"/.test(indexSource), true);
assert.equal(/id="record-amount-input"[^>]*max="9007199254740991"/.test(indexSource), true);

console.log('OK: dominio administrativo, raíz presupuestal exclusiva del propietario, vínculos de proyección autorizables, UI restringida, métricas exactas incluso en agregados superiores al entero seguro, permisos y parches concurrentes validados.');
