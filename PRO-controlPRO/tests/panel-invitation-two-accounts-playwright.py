#!/usr/bin/env python3
"""Prueba real en Chromium de paneles invitados con dos cuentas aisladas."""

from __future__ import annotations

import os
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
CHROMIUM = os.environ.get("PLAYWRIGHT_CHROMIUM_EXECUTABLE", "/usr/bin/chromium")

SCENARIO_JS = r"""
({ currentUserId, role, permissions, projectCount }) => {
  const D = window.ProjectDomain;
  const ownerUserId = 'account_owner';
  const guestUserId = 'account_guest';
  const portfolioSpaceId = 'portfolio_main';
  const unrelatedPortfolioId = 'portfolio_unrelated';
  const rolePermissions = D.rolePermissions(role, permissions);

  const portfolio = {
    spaceId: portfolioSpaceId,
    resourceType: 'admin.portfolio',
    ownerUserId,
    authorizationState: 'confirmed',
    members: [
      { userId: ownerUserId, role: 'owner', accessScope: 'portfolio', permissions: D.rolePermissions('owner', []), profile: { email: 'owner@example.com', displayName: 'Propietario' } },
      { userId: guestUserId, role, accessScope: 'portfolio', permissions: rolePermissions, profile: { email: 'guest@example.com', displayName: 'Invitado' } }
    ]
  };

  const projects = [];
  const spaces = [portfolio];
  for (let index = 1; index <= projectCount; index += 1) {
    const spaceId = `project_${index}`;
    const space = {
      spaceId,
      resourceType: 'admin.project',
      permissionProfile: D.ADMIN_PROJECT_PERMISSION_PROFILE,
      governanceSpaceId: portfolioSpaceId,
      ownerUserId,
      authorizationState: 'confirmed',
      members: [
        { userId: ownerUserId, role: 'owner', accessScope: 'portfolio', permissions: D.rolePermissions('owner', []) },
        { userId: guestUserId, role, accessScope: 'portfolio', permissions: rolePermissions }
      ]
    };
    const project = {
      id: D.PROJECT_ENTITY_ID,
      loaded: true,
      name: `Proyecto ${index}`,
      description: `Información administrativa ${index}`,
      address: `Dirección ${index}`,
      initialBudget: 1000 * index,
      portfolioSpaceId,
      portfolioOwnerUserId: ownerUserId,
      isTrashed: false
    };
    const purchases = [{ id: `purchase_${index}`, amount: 100 * index, createdByUserId: ownerUserId }];
    const incomes = [{ id: `income_${index}`, amount: 50 * index, createdByUserId: ownerUserId }];
    const projections = [{ id: `projection_${index}`, projectedAmount: 80 * index, actualAmount: 100 * index, status: 'completed', createdByUserId: ownerUserId }];
    spaces.push(space);
    projects.push({
      space,
      project,
      purchases,
      incomes,
      projections,
      metrics: D.calculateProjectMetrics(project, purchases, incomes, projections)
    });
  }

  const unrelatedSpace = {
    spaceId: 'project_unrelated',
    resourceType: 'admin.project',
    governanceSpaceId: unrelatedPortfolioId,
    ownerUserId: 'other_owner',
    authorizationState: 'confirmed',
    members: [{ userId: guestUserId, role: 'member', accessScope: 'project', permissions: ['read'] }]
  };
  spaces.push(unrelatedSpace);
  projects.push({
    space: unrelatedSpace,
    project: { id: D.PROJECT_ENTITY_ID, loaded: true, name: 'No mezclar', initialBudget: 9999, isTrashed: false },
    purchases: [], incomes: [], projections: [],
    metrics: D.calculateProjectMetrics({ initialBudget: 9999 }, [], [], [])
  });

  const scopes = D.buildProjectPanelScopes({
    spaces,
    projects,
    currentUserId,
    portfolioResourceType: 'admin.portfolio',
    personalPanelId: '__personal_panel__',
    sharedProjectsPanelId: '__shared_projects_panel__'
  });
  const targetPanel = scopes.find((scope) => scope.id === portfolioSpaceId);
  const unrelatedPanel = scopes.find((scope) => scope.id === unrelatedPortfolioId);
  const first = targetPanel?.projects?.[0] || null;

  return {
    targetCount: targetPanel?.projects?.length ?? -1,
    targetIds: (targetPanel?.projects || []).map((entry) => entry.space.spaceId),
    unrelatedCount: unrelatedPanel?.projects?.length ?? 0,
    panelOwned: targetPanel?.owned === true,
    firstProjectName: first?.project?.name || '',
    firstTotalCapital: first?.metrics?.totalCapital ?? null,
    firstTotalPurchases: first?.metrics?.totalPurchases ?? null,
    firstProjectionVariance: first?.metrics?.projectionVariance ?? null,
    canRead: D.hasPermission(first?.space || {}, currentUserId, 'read'),
    canAdd: D.hasPermission(first?.space || {}, currentUserId, 'add'),
    canDelete: D.hasPermission(first?.space || {}, currentUserId, 'delete'),
    canProjection: D.hasPermission(first?.space || {}, currentUserId, 'projection'),
    canDeleteProject: D.hasPermission(first?.space || {}, currentUserId, 'delete_project'),
    canManageAccess: D.hasPermission(first?.space || {}, currentUserId, 'manage_access')
  };
}
"""



SNAPSHOT_REFRESH_JS = r"""
({ projectCount }) => {
  const D = window.ProjectDomain;
  const currentUserId = 'account_guest';
  const ownerUserId = 'account_owner';
  const portfolioSpaceId = 'portfolio_main';
  const permissions = D.rolePermissions('manager', []);
  const portfolio = {
    spaceId: portfolioSpaceId,
    resourceType: 'admin.portfolio',
    ownerUserId,
    authorizationState: 'confirmed',
    members: [
      { userId: ownerUserId, role: 'owner', permissions: D.rolePermissions('owner', []) },
      { userId: currentUserId, role: 'manager', permissions }
    ]
  };
  const projectSpaces = Array.from({ length: projectCount }, (_, offset) => ({
    spaceId: `snapshot_project_${offset + 1}`,
    resourceType: 'admin.project',
    permissionProfile: D.ADMIN_PROJECT_PERMISSION_PROFILE,
    governanceSpaceId: portfolioSpaceId,
    ownerUserId,
    authorizationState: 'confirmed',
    members: [
      { userId: ownerUserId, role: 'owner', permissions: D.rolePermissions('owner', []) },
      { userId: currentUserId, role: 'manager', permissions }
    ]
  }));
  const state = { spaces: [portfolio, ...projectSpaces], projects: [] };
  const render = () => {
    const scopes = D.buildProjectPanelScopes({
      spaces: state.spaces,
      projects: state.projects,
      currentUserId,
      portfolioResourceType: 'admin.portfolio',
      personalPanelId: '__personal_panel__',
      sharedProjectsPanelId: '__shared_projects_panel__'
    });
    const count = scopes.find((scope) => scope.id === portfolioSpaceId)?.projects?.length ?? -1;
    document.querySelector('#result').textContent = String(count);
    return count;
  };
  const listener = () => render();
  window.addEventListener('p2p:state', listener, { once: true });
  const before = render();
  state.projects = projectSpaces.map((space, offset) => ({
    space,
    project: {
      id: D.PROJECT_ENTITY_ID,
      loaded: true,
      name: `Proyecto snapshot ${offset + 1}`,
      initialBudget: 1000,
      portfolioSpaceId,
      portfolioOwnerUserId: ownerUserId,
      isTrashed: false
    },
    purchases: [],
    incomes: [],
    projections: [],
    metrics: D.calculateProjectMetrics({ initialBudget: 1000 }, [], [], [])
  }));
  window.dispatchEvent(new CustomEvent('p2p:state', {
    detail: { state: { spaces: state.spaces }, source: 'snapshot-complete' }
  }));
  const after = Number(document.querySelector('#result').textContent);
  return { before, after };
}
"""


def expected_permissions(role: str, permissions: list[str]) -> tuple[bool, bool, bool, bool, bool]:
    if role == "manager":
        return True, True, True, True, True
    if role == "admin":
        return True, True, True, False, True
    if role == "individual":
        return True, True, True, False, False
    return (
        "add" in permissions,
        "delete" in permissions,
        "projection" in permissions,
        False,
        False,
    )


def assert_snapshot_refresh(source: str) -> None:
    authorization_index = source.find(
        "const authorizationPromoted = await this.confirmRecoveredReplicaAuthorization(event.spaceId, sessionContext);"
    )
    snapshot_index = source.rfind("dispatch('p2p:snapshot-complete'", 0, authorization_index)
    refresh_index = source.find("source: 'snapshot-complete'", authorization_index)
    next_operation_index = source.find("dispatch('p2p:operation'", authorization_index)
    assert snapshot_index >= 0
    assert authorization_index > snapshot_index
    assert refresh_index > authorization_index
    assert next_operation_index < 0 or refresh_index < next_operation_index
    local_block = source[authorization_index : refresh_index + 160]
    assert "if (!authorizationPromoted)" in local_block
    assert "dispatch('p2p:state'" in local_block


def main() -> None:
    if not Path(CHROMIUM).exists():
        raise RuntimeError(f"Chromium no está disponible en {CHROMIUM}")

    combinations = [
        ("manager", []),
        ("admin", []),
        ("individual", []),
        ("member", ["read"]),
        ("member", ["read", "add", "projection"]),
        ("member", ["read", "delete"]),
        ("member", ["read", "add", "delete", "projection"]),
    ]

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(executable_path=CHROMIUM, headless=True, args=["--no-sandbox"])
        owner_context = browser.new_context()
        guest_context = browser.new_context()
        owner_page = owner_context.new_page()
        guest_page = guest_context.new_page()
        domain_source = (ROOT / "src/js/project-domain.js").read_text(encoding="utf-8")
        for page, account in ((owner_page, "account_owner"), (guest_page, "account_guest")):
            page.set_content("<!doctype html><html lang='es'><body><main id='result'></main></body></html>")
            page.evaluate(
                """async ({ source, account }) => {
                  const moduleUrl = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
                  try {
                    window.ProjectDomain = await import(moduleUrl);
                    window.__testAccount = account;
                    window.__panelHarnessReady = true;
                  } finally {
                    URL.revokeObjectURL(moduleUrl);
                  }
                }""",
                {"source": domain_source, "account": account},
            )
            page.wait_for_function("window.__panelHarnessReady === true")

        for role, permissions in combinations:
            for project_count in (0, 1, 2, 5):
                owner = owner_page.evaluate(
                    SCENARIO_JS,
                    {"currentUserId": "account_owner", "role": role, "permissions": permissions, "projectCount": project_count},
                )
                guest = guest_page.evaluate(
                    SCENARIO_JS,
                    {"currentUserId": "account_guest", "role": role, "permissions": permissions, "projectCount": project_count},
                )
                assert owner["targetCount"] == project_count, (role, project_count, owner)
                assert guest["targetCount"] == project_count, (role, project_count, guest)
                assert owner["panelOwned"] is True
                assert guest["panelOwned"] is False
                assert guest["unrelatedCount"] == 1
                assert "project_unrelated" not in guest["targetIds"]
                if project_count:
                    assert guest["firstProjectName"] == "Proyecto 1"
                    assert guest["firstTotalCapital"] == 1050
                    assert guest["firstTotalPurchases"] == 100
                    assert guest["firstProjectionVariance"] == 20
                    assert guest["canRead"] is True
                    can_add, can_delete, can_projection, can_delete_project, can_manage = expected_permissions(role, permissions)
                    assert guest["canAdd"] is can_add, (role, permissions, guest)
                    assert guest["canDelete"] is can_delete, (role, permissions, guest)
                    assert guest["canProjection"] is can_projection, (role, permissions, guest)
                    assert guest["canDeleteProject"] is can_delete_project, (role, permissions, guest)
                    assert guest["canManageAccess"] is can_manage, (role, permissions, guest)

        snapshot_refresh = guest_page.evaluate(SNAPSHOT_REFRESH_JS, {"projectCount": 2})
        assert snapshot_refresh == {"before": 0, "after": 2}, snapshot_refresh
        assert guest_page.locator("#result").text_content() == "2"

        source = (ROOT / "src/js/p2p-client.js").read_text(encoding="utf-8")
        assert_snapshot_refresh(source)

        owner_context.close()
        guest_context.close()
        browser.close()

    print("OK: Playwright validó dos cuentas aisladas, roles Gerente/Admin/Individual/Personalizado, permisos lectura/agregar/eliminar/proyección, 0/1/2/5 proyectos, datos administrativos, aislamiento entre paneles y refresco tras snapshot.")


if __name__ == "__main__":
    main()
