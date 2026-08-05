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


LEGACY_INVITATION_FLOW_JS = r"""
({ role, permissions, projectCount, directMembership }) => {
  const D = window.ProjectDomain;
  const I = window.InvitationIntent;
  const ownerUserId = 'account_owner';
  const guestUserId = 'account_guest';
  const portfolioSpaceId = 'portfolio_created_after_projects';
  const effectivePermissions = D.rolePermissions(role, permissions);
  const ownerPermissions = D.rolePermissions('owner', []);
  const projects = Array.from({ length: projectCount }, (_, offset) => {
    const index = offset + 1;
    const space = {
      spaceId: `legacy_project_${index}`,
      resourceType: 'admin.project',
      permissionProfile: D.ADMIN_PROJECT_PERMISSION_PROFILE,
      governanceSpaceId: '',
      ownerUserId,
      authorizationState: 'confirmed',
      members: [{ userId: ownerUserId, role: 'owner', permissions: ownerPermissions }]
    };
    return {
      space,
      project: {
        id: D.PROJECT_ENTITY_ID,
        loaded: true,
        name: `Proyecto anterior ${index}`,
        description: `Creado antes del panel ${index}`,
        address: `Dirección legacy ${index}`,
        initialBudget: 2000 * index,
        portfolioSpaceId: '',
        portfolioOwnerUserId: ownerUserId,
        isTrashed: false
      },
      purchases: [{ id: `legacy_purchase_${index}`, amount: 250 * index, createdByUserId: ownerUserId }],
      incomes: [{ id: `legacy_income_${index}`, amount: 100 * index, createdByUserId: ownerUserId }],
      projections: [{ id: `legacy_projection_${index}`, projectedAmount: 220 * index, actualAmount: 250 * index, status: 'completed', createdByUserId: ownerUserId }]
    };
  }).map((entry) => ({
    ...entry,
    metrics: D.calculateProjectMetrics(entry.project, entry.purchases, entry.incomes, entry.projections)
  }));

  const portfolio = {
    spaceId: portfolioSpaceId,
    resourceType: 'admin.portfolio',
    ownerUserId,
    authorizationState: 'confirmed',
    members: [
      { userId: ownerUserId, role: 'owner', accessScope: 'portfolio', permissions: ownerPermissions },
      { userId: guestUserId, role, accessScope: 'portfolio', permissions: effectivePermissions }
    ]
  };
  const legacyTargets = D.legacyPortfolioProjectsForInvitation(projects, portfolio);
  const portfolioInvitation = {
    invitationId: 'inv_portfolio',
    spaceId: portfolioSpaceId,
    resourceType: 'admin.portfolio',
    inviterUserId: ownerUserId,
    recipientUserId: guestUserId,
    role,
    permissions: effectivePermissions,
    accessScope: 'portfolio',
    status: 'pending'
  };
  const projectInvitations = directMembership ? [] : legacyTargets.map((entry, offset) => ({
    invitationId: `inv_legacy_${offset + 1}`,
    spaceId: entry.space.spaceId,
    resourceType: 'admin.project',
    governanceSpaceId: '',
    inviterUserId: ownerUserId,
    recipientUserId: guestUserId,
    role,
    permissions: effectivePermissions,
    accessScope: 'portfolio',
    status: 'pending'
  }));
  const related = I.relatedPortfolioProjectInvitations(
    [portfolioInvitation, ...projectInvitations],
    portfolioInvitation,
    { portfolioResourceType: 'admin.portfolio' }
  );
  const acceptedIds = new Set(directMembership ? legacyTargets.map((entry) => entry.space.spaceId) : related.map((entry) => entry.spaceId));
  const acceptedProjects = projects.map((entry) => ({
    ...entry,
    space: acceptedIds.has(entry.space.spaceId)
      ? {
          ...entry.space,
          members: [
            ...entry.space.members,
            { userId: guestUserId, role, permissions: effectivePermissions, accessScope: 'portfolio' }
          ]
        }
      : entry.space
  }));
  const scopes = D.buildProjectPanelScopes({
    spaces: [portfolio, ...acceptedProjects.map((entry) => entry.space)],
    projects: acceptedProjects.filter((entry) => acceptedIds.has(entry.space.spaceId)),
    currentUserId: guestUserId,
    portfolioResourceType: 'admin.portfolio',
    personalPanelId: '__personal_panel__',
    sharedProjectsPanelId: '__shared_projects_panel__'
  });
  const panel = scopes.find((scope) => scope.id === portfolioSpaceId);
  const first = panel?.projects?.[0] || null;
  return {
    legacyTargetIds: legacyTargets.map((entry) => entry.space.spaceId),
    relatedInvitationIds: related.map((entry) => entry.spaceId),
    projectCount: panel?.projects?.length ?? -1,
    firstProjectName: first?.project?.name || '',
    firstCapital: first?.metrics?.totalCapital ?? null,
    firstExpenses: first?.metrics?.totalPurchases ?? null,
    canRead: D.hasPermission(first?.space || {}, guestUserId, 'read'),
    canAdd: D.hasPermission(first?.space || {}, guestUserId, 'add'),
    canDelete: D.hasPermission(first?.space || {}, guestUserId, 'delete'),
    canProjection: D.hasPermission(first?.space || {}, guestUserId, 'projection'),
    canDeleteProject: D.hasPermission(first?.space || {}, guestUserId, 'delete_project'),
    canManageAccess: D.hasPermission(first?.space || {}, guestUserId, 'manage_access')
  };
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
        invitation_source = (ROOT / "src/js/p2p-invitation-intent.js").read_text(encoding="utf-8")
        for page, account in ((owner_page, "account_owner"), (guest_page, "account_guest")):
            page.set_content("<!doctype html><html lang='es'><body><main id='result'></main></body></html>")
            page.evaluate(
                """async ({ source, invitationSource, account }) => {
                  const moduleUrl = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
                  const invitationModuleUrl = URL.createObjectURL(new Blob([invitationSource], { type: 'text/javascript' }));
                  try {
                    window.ProjectDomain = await import(moduleUrl);
                    window.InvitationIntent = await import(invitationModuleUrl);
                    window.__testAccount = account;
                    window.__panelHarnessReady = true;
                  } finally {
                    URL.revokeObjectURL(moduleUrl);
                    URL.revokeObjectURL(invitationModuleUrl);
                  }
                }""",
                {"source": domain_source, "invitationSource": invitation_source, "account": account},
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

                for direct_membership in (False, True):
                    legacy = guest_page.evaluate(
                        LEGACY_INVITATION_FLOW_JS,
                        {
                            "role": role,
                            "permissions": permissions,
                            "projectCount": project_count,
                            "directMembership": direct_membership,
                        },
                    )
                    expected_ids = [f"legacy_project_{index}" for index in range(1, project_count + 1)]
                    assert legacy["legacyTargetIds"] == expected_ids, (role, project_count, direct_membership, legacy)
                    assert legacy["projectCount"] == project_count, (role, project_count, direct_membership, legacy)
                    if direct_membership:
                        assert legacy["relatedInvitationIds"] == []
                    else:
                        assert legacy["relatedInvitationIds"] == expected_ids
                    if project_count:
                        assert legacy["firstProjectName"] == "Proyecto anterior 1"
                        assert legacy["firstCapital"] == 2100
                        assert legacy["firstExpenses"] == 250
                        assert legacy["canRead"] is True
                        can_add, can_delete, can_projection, can_delete_project, can_manage = expected_permissions(role, permissions)
                        assert legacy["canAdd"] is can_add, (role, permissions, legacy)
                        assert legacy["canDelete"] is can_delete, (role, permissions, legacy)
                        assert legacy["canProjection"] is can_projection, (role, permissions, legacy)
                        assert legacy["canDeleteProject"] is can_delete_project, (role, permissions, legacy)
                        assert legacy["canManageAccess"] is can_manage, (role, permissions, legacy)

        snapshot_refresh = guest_page.evaluate(SNAPSHOT_REFRESH_JS, {"projectCount": 2})
        assert snapshot_refresh == {"before": 0, "after": 2}, snapshot_refresh
        assert guest_page.locator("#result").text_content() == "2"

        source = (ROOT / "src/js/p2p-client.js").read_text(encoding="utf-8")
        assert_snapshot_refresh(source)

        owner_context.close()
        guest_context.close()
        browser.close()

    print("OK: Playwright validó dos cuentas aisladas, roles Gerente/Admin/Individual/Personalizado, permisos lectura/agregar/eliminar/proyección, 0/1/2/5 proyectos, paneles gobernados y legacy, aceptación por invitaciones o membresía directa, datos administrativos, aislamiento y refresco tras snapshot.")


if __name__ == "__main__":
    main()
