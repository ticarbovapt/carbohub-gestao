/**
 * useActionPermissions — permission hooks for every action-level check in the app.
 *
 * ALL hooks follow the same transition pattern:
 *   ENFORCEMENT_ACTIVE = false  →  legacy role-based fallback (zero behavior change)
 *   ENFORCEMENT_ACTIVE = true   →  delegates to useCanSeeScreen(screenId), which reads
 *                                   function_screen_access for the current user's dept+funcao
 *
 * To activate the new system: flip ENFORCEMENT_ACTIVE = true in useFunctionAccess.ts.
 * No other change is needed here.
 *
 * Future (after access_level is added to function_screen_access):
 *   Replace useCanSeeScreen() with useCanEditScreen() / useCanManageScreen() per hook.
 */

import { useAuth } from "@/contexts/AuthContext";
import { useCanSeeScreen, ENFORCEMENT_ACTIVE } from "./useFunctionAccess";

// ── Orders ────────────────────────────────────────────────────────────────────

/** Create, edit or delete orders. */
export function useCanManageOrders(): boolean {
  const can = useCanSeeScreen("orders");
  const { isAdmin, isManager, isCeo, isMasterAdmin, isAnyGestor } = useAuth();
  if (ENFORCEMENT_ACTIVE) return can;
  return isAdmin || isManager || isCeo || isMasterAdmin || isAnyGestor;
}

// ── Team ──────────────────────────────────────────────────────────────────────

/** Edit existing team member data (name, dept, function, etc.). */
export function useCanEditTeamMembers(): boolean {
  const can = useCanSeeScreen("team");
  const { isAdmin, isCeo, isMasterAdmin } = useAuth();
  if (ENFORCEMENT_ACTIVE) return can;
  return isAdmin || isCeo || isMasterAdmin;
}

/**
 * Gestão completa de equipe: criar contas, editar qualquer colaborador,
 * resetar senhas, configurar acessos.
 * Apenas head (qualquer dept), command ou TI/suporte.
 */
export function useCanManageAllTeam(): boolean {
  const { isSuporte, isCeo, profile } = useAuth();
  const isHead =
    profile?.funcao === "head" ||
    profile?.secondary_funcao === "head";
  const isCommand =
    profile?.department === "command" ||
    profile?.secondary_department === "command";
  return isSuporte || isCeo || isHead || isCommand;
}

/** Create new team member accounts. */
export function useCanAddTeamMember(): boolean {
  const can = useCanSeeScreen("team");
  const { isAdmin } = useAuth();
  if (ENFORCEMENT_ACTIVE) return can;
  return isAdmin;
}

// ── Production ────────────────────────────────────────────────────────────────

/** Create, edit or manage production orders. */
export function useCanManageProduction(): boolean {
  const can = useCanSeeScreen("production-orders");
  const { isAdmin, isManager } = useAuth();
  if (ENFORCEMENT_ACTIVE) return can;
  return isAdmin || isManager;
}

// ── Purchasing / Suppliers ────────────────────────────────────────────────────

/** Approve or reject purchase requests. */
export function useCanApprovePurchases(): boolean {
  const can = useCanSeeScreen("purchasing");
  const { isCeo, isAnyGestor } = useAuth();
  if (ENFORCEMENT_ACTIVE) return can;
  return isCeo || isAnyGestor;
}

/** Create, edit or delete suppliers. */
export function useCanManageSuppliers(): boolean {
  const can = useCanSeeScreen("mrp-suppliers");
  const { isAdmin, isCeo, isAnyGestor } = useAuth();
  if (ENFORCEMENT_ACTIVE) return can;
  return isAdmin || isCeo || isAnyGestor;
}

// ── Stock / Suprimentos ───────────────────────────────────────────────────────

/** Edit stock overview, approve supply requests. */
export function useCanManageStock(): boolean {
  const can = useCanSeeScreen("suprimentos");
  const { isMasterAdmin, isAdmin, isGestorCompras } = useAuth();
  if (ENFORCEMENT_ACTIVE) return can;
  return isMasterAdmin || isAdmin || isGestorCompras;
}

/** Action buttons on stock movement entries (gestor-level). */
export function useCanManageStockMovements(): boolean {
  const can = useCanSeeScreen("suprimentos");
  const { isCeo, isAnyGestor } = useAuth();
  if (ENFORCEMENT_ACTIVE) return can;
  return isCeo || isAnyGestor;
}

// ── Financial / Viagens ───────────────────────────────────────────────────────

/** Approve or reject expense/travel reports. */
export function useCanApproveExpenses(): boolean {
  const can = useCanSeeScreen("viagens");
  const { isAnyGestor, isAdmin, isCeo, isMasterAdmin } = useAuth();
  if (ENFORCEMENT_ACTIVE) return can;
  return isAnyGestor || isAdmin || isCeo || isMasterAdmin;
}

// ── Machines ──────────────────────────────────────────────────────────────────

/** Create, edit or delete machines. */
export function useCanManageMachines(): boolean {
  const can = useCanSeeScreen("machines");
  const { isAdmin, isManager } = useAuth();
  if (ENFORCEMENT_ACTIVE) return can;
  return isAdmin || isManager;
}

// ── Scheduling ────────────────────────────────────────────────────────────────

/** Create, edit or delete calendar events. */
export function useCanManageScheduling(): boolean {
  const can = useCanSeeScreen("scheduling");
  const { isManager } = useAuth();
  if (ENFORCEMENT_ACTIVE) return can;
  return isManager;
}

// ── Licensees ─────────────────────────────────────────────────────────────────

/** Edit licensee data, reset passwords, manage licensee accounts (admin-only). */
export function useCanManageLicensees(): boolean {
  const can = useCanSeeScreen("licensees");
  const { isAdmin } = useAuth();
  if (ENFORCEMENT_ACTIVE) return can;
  return isAdmin;
}

/** Create new licensees (manager-level and above). */
export function useCanCreateLicensee(): boolean {
  const can = useCanSeeScreen("licensees");
  const { isManager } = useAuth();
  if (ENFORCEMENT_ACTIVE) return can;
  return isManager;
}

// ── SKUs / Lots ───────────────────────────────────────────────────────────────

/** Create, edit or delete SKUs. */
export function useCanManageSkus(): boolean {
  const can = useCanSeeScreen("skus");
  const { isAdmin, isManager } = useAuth();
  if (ENFORCEMENT_ACTIVE) return can;
  return isAdmin || isManager;
}

/** Create, edit or delete lots. */
export function useCanManageLots(): boolean {
  const can = useCanSeeScreen("lots");
  const { isAdmin, isManager } = useAuth();
  if (ENFORCEMENT_ACTIVE) return can;
  return isAdmin || isManager;
}

// ── Sales Targets ─────────────────────────────────────────────────────────────

/** Edit sales targets and goals. */
export function useCanManageSalesTargets(): boolean {
  const can = useCanSeeScreen("sales-targets");
  const { isMasterAdmin, isAdmin } = useAuth();
  if (ENFORCEMENT_ACTIVE) return can;
  return isMasterAdmin || isAdmin;
}

// ── MRP Products / BOM ────────────────────────────────────────────────────────

/** Edit MRP products, SKU BOM, and supplier relationships. */
export function useCanManageMrpProducts(): boolean {
  const can = useCanSeeScreen("mrp-products");
  const { isAdmin, isCeo, isMasterAdmin } = useAuth();
  if (ENFORCEMENT_ACTIVE) return can;
  return isAdmin || isCeo || isMasterAdmin;
}

// ── Bugs ──────────────────────────────────────────────────────────────────────

/** Manage bug reports (change status, assign, delete). */
export function useCanManageBugs(): boolean {
  const can = useCanSeeScreen("bugs");
  const { isAdmin, isSuporte } = useAuth();
  if (ENFORCEMENT_ACTIVE) return can;
  return isAdmin || isSuporte;
}

// ── Alerts ────────────────────────────────────────────────────────────────────

/** Receive real-time machine alert notifications. */
export function useCanReceiveAlerts(): boolean {
  const can = useCanSeeScreen("ops-alerts");
  const { isManager } = useAuth();
  if (ENFORCEMENT_ACTIVE) return can;
  return isManager;
}

// ── Navigation / Menu ─────────────────────────────────────────────────────────

/** Access the operational area (scheduling, OS, machines, etc.). */
export function useCanAccessOps(): boolean {
  const { user } = useAuth();
  // O hub /home é a porta de entrada do Carbo Controle.
  // Qualquer usuário autenticado com perfil interno pode entrar —
  // o Role Matrix controla o que cada um vê DENTRO do sistema.
  return !!user;
}

/** See admin-only menu items (system config, pipeline, webhooks). */
export function useCanSeeAdminMenu(): boolean {
  const can = useCanSeeScreen("admin");
  const { isMasterAdmin, isSuporte } = useAuth();
  if (ENFORCEMENT_ACTIVE) return can;
  return isMasterAdmin || isSuporte;
}

/** See finance-restricted menu items. */
export function useCanSeeFinanceMenu(): boolean {
  const can = useCanSeeScreen("financeiro");
  const { isMasterAdmin, isGestorFin } = useAuth();
  if (ENFORCEMENT_ACTIVE) return can;
  return isMasterAdmin || isGestorFin;
}

// ── Financeiro ────────────────────────────────────────────────────────────────

/** View financial dashboard KPIs and charts. */
export function useCanViewFinanceiroDashboard(): boolean {
  const can = useCanSeeScreen("financeiro");
  const { isCeo, isAnyGestor } = useAuth();
  if (ENFORCEMENT_ACTIVE) return can;
  return isCeo || isAnyGestor;
}

// ── Logistics ─────────────────────────────────────────────────────────────────

/** Manage logistics, carriers, and delivery actions. */
export function useCanManageLogistics(): boolean {
  const can = useCanSeeScreen("logistics");
  const { isCeo, isAnyGestor } = useAuth();
  if (ENFORCEMENT_ACTIVE) return can;
  return isCeo || isAnyGestor;
}

/** View logistics KPI dashboard. */
export function useCanViewLogisticsDashboard(): boolean {
  const can = useCanSeeScreen("dashboard-logistica");
  const { isCeo, isAnyGestor } = useAuth();
  if (ENFORCEMENT_ACTIVE) return can;
  return isCeo || isAnyGestor;
}

// ── Dashboards ────────────────────────────────────────────────────────────────

/** View strategic dashboard (CEO / gestor view). */
export function useCanViewStrategicDashboard(): boolean {
  const can = useCanSeeScreen("dashboard-estrategico");
  const { isCeo, isAnyGestor, isAdmin } = useAuth();
  if (ENFORCEMENT_ACTIVE) return can;
  return isCeo || isAnyGestor || isAdmin;
}

// ── Licensee portal (internal staff access) ───────────────────────────────────

/** Access the licensee portal management view as internal staff. */
export function useCanViewLicenseeArea(): boolean {
  const can = useCanSeeScreen("licensees");
  const { isAdmin, isCeo, isMasterAdmin } = useAuth();
  if (ENFORCEMENT_ACTIVE) return can;
  return isAdmin || isCeo || isMasterAdmin;
}

// ── PDV admin ─────────────────────────────────────────────────────────────────

/** Access PDV management as internal admin. */
export function useCanManagePDVAdmin(): boolean {
  const can = useCanSeeScreen("pdv-dashboard");
  const { isAdmin, isCeo, isMasterAdmin } = useAuth();
  if (ENFORCEMENT_ACTIVE) return can;
  return isAdmin || isCeo || isMasterAdmin;
}

// ── OS management ─────────────────────────────────────────────────────────────

/** Perform management actions on OS (advance stage, assign, etc.). */
export function useCanManageOSActions(): boolean {
  const can = useCanSeeScreen("os");
  const { isManager, isAdmin } = useAuth();
  if (ENFORCEMENT_ACTIVE) return can;
  return isManager || isAdmin;
}

// ── Governance ────────────────────────────────────────────────────────────────

/** Access the governance page. */
export function useCanAccessGovernance(): boolean {
  const can = useCanSeeScreen("governance");
  const { isCeo, isMasterAdmin, isAdmin } = useAuth();
  if (ENFORCEMENT_ACTIVE) return can;
  return isCeo || isMasterAdmin || isAdmin;
}

// ── Portals / Area Switcher ───────────────────────────────────────────────────

/** Access all portals (licensee + PDV) as internal staff override.
 *  When enforcement is active, portal access is managed via function_screen_access. */
export function useCanAccessAllPortals(): boolean {
  const { isAdmin, isCeo, isMasterAdmin } = useAuth();
  if (ENFORCEMENT_ACTIVE) return isMasterAdmin;
  return isAdmin || isCeo || isMasterAdmin;
}

// ── Role display label ────────────────────────────────────────────────────────

const DEPT_SHORT: Record<string, string> = {
  command:    "Command",
  ops:        "OPS",
  b2b:        "Vendas",
  finance:    "Finance",
  growth:     "Growth",
  expansao:   "Expansão",
  ti_suporte: "TI",
};

const FUNCAO_LABEL: Record<string, string> = {
  ceo:                  "CEO",
  head:                 "Head",
  gerente:              "Gerente",
  coordenador:          "Coordenador",
  supervisor:           "Supervisor",
  analista:             "Analista",
  assistente_executiva: "Assistente Exec.",
  vendedor_b2b:         "Vendedor B2B",
  vendedor_b2c:         "Vendedor B2C",
  staff:                "Colaborador",
  colaborador:          "Colaborador",
};

function buildRoleLine(dept: string | null, funcao: string | null): string | null {
  if (!dept && !funcao) return null;
  const deptLabel   = dept   ? (DEPT_SHORT[dept]   ?? dept)   : null;
  const funcaoLabel = funcao ? (FUNCAO_LABEL[funcao] ?? funcao) : null;
  return [funcaoLabel, deptLabel].filter(Boolean).join(" ");
}

/** Returns 1 or 2 label lines for the current user's role, shown in the header. */
export function useRoleDisplayLabel(): string[] {
  const { profile } = useAuth();

  const primary   = buildRoleLine(profile?.department          ?? null, profile?.funcao           ?? null);
  const secondary = buildRoleLine(profile?.secondary_department ?? null, profile?.secondary_funcao ?? null);

  const lines = [primary, secondary].filter(Boolean) as string[];
  return lines.length > 0 ? lines : ["Membro da Equipe"];
}
