/**
 * useActionPermissions — hooks de permissão por ação.
 *
 * Fonte única: Role Matrix (function_screen_access via useCanSeeScreen), que lê
 * department + funcao do usuário. O sistema legado de papéis (admin/gestor/
 * operador/ceo) foi aposentado — não há mais fallback por role aqui.
 */

import { useAuth } from "@/contexts/AuthContext";
import { useCanSeeScreen } from "./useFunctionAccess";

// ── Orders ────────────────────────────────────────────────────────────────────

/** Create, edit or delete orders. */
export function useCanManageOrders(): boolean {
  return useCanSeeScreen("orders");
}

// ── Team ──────────────────────────────────────────────────────────────────────

/** Edit existing team member data (name, dept, function, etc.). */
export function useCanEditTeamMembers(): boolean {
  return useCanSeeScreen("team");
}

/**
 * Gestão completa de equipe: criar contas, editar qualquer colaborador,
 * resetar senhas, configurar acessos. Apenas head (qualquer dept), command
 * ou TI/suporte (superusuário).
 */
export function useCanManageAllTeam(): boolean {
  const { profile } = useAuth();
  const isTiHead =
    (profile?.department === "ti_suporte" && profile?.funcao === "head") ||
    (profile?.secondary_department === "ti_suporte" && profile?.secondary_funcao === "head");
  const isHead =
    profile?.funcao === "head" || profile?.secondary_funcao === "head" || profile?.funcao === "ceo";
  const isCommand =
    profile?.department === "command" || profile?.secondary_department === "command";
  return isTiHead || isHead || isCommand;
}

/** Create new team member accounts. */
export function useCanAddTeamMember(): boolean {
  return useCanSeeScreen("team");
}

// ── Production ────────────────────────────────────────────────────────────────

/** Create, edit or manage production orders. */
export function useCanManageProduction(): boolean {
  return useCanSeeScreen("production-orders");
}

// ── Purchasing / Suppliers ────────────────────────────────────────────────────

/** Approve or reject purchase requests. */
export function useCanApprovePurchases(): boolean {
  return useCanSeeScreen("purchasing");
}

/** Create, edit or delete suppliers. */
export function useCanManageSuppliers(): boolean {
  return useCanSeeScreen("mrp-suppliers");
}

// ── Stock / Suprimentos ───────────────────────────────────────────────────────

/** Edit stock overview, approve supply requests. */
export function useCanManageStock(): boolean {
  return useCanSeeScreen("suprimentos");
}

/** Action buttons on stock movement entries. */
export function useCanManageStockMovements(): boolean {
  return useCanSeeScreen("suprimentos");
}

// ── Financial / Viagens ───────────────────────────────────────────────────────

/** Approve or reject expense/travel reports. */
export function useCanApproveExpenses(): boolean {
  return useCanSeeScreen("viagens");
}

// ── Machines ──────────────────────────────────────────────────────────────────

/** Create, edit or delete machines. */
export function useCanManageMachines(): boolean {
  return useCanSeeScreen("machines");
}

// ── Scheduling ────────────────────────────────────────────────────────────────

/** Create, edit or delete calendar events. */
export function useCanManageScheduling(): boolean {
  return useCanSeeScreen("scheduling");
}

// ── Licensees ─────────────────────────────────────────────────────────────────

/** Edit licensee data, reset passwords, manage licensee accounts. */
export function useCanManageLicensees(): boolean {
  return useCanSeeScreen("licensees");
}

/** Create new licensees. */
export function useCanCreateLicensee(): boolean {
  return useCanSeeScreen("licensees");
}

// ── SKUs / Lots ───────────────────────────────────────────────────────────────

/** Create, edit or delete SKUs. */
export function useCanManageSkus(): boolean {
  return useCanSeeScreen("skus");
}

/** Create, edit or delete lots. */
export function useCanManageLots(): boolean {
  return useCanSeeScreen("lots");
}

// ── Sales Targets ─────────────────────────────────────────────────────────────

/** Edit sales targets and goals. */
export function useCanManageSalesTargets(): boolean {
  return useCanSeeScreen("sales-targets");
}

// ── MRP Products / BOM ────────────────────────────────────────────────────────

/** Edit MRP products, SKU BOM, and supplier relationships. */
export function useCanManageMrpProducts(): boolean {
  return useCanSeeScreen("mrp-products");
}

// ── Bugs ──────────────────────────────────────────────────────────────────────

/** Manage bug reports (change status, assign, delete). */
export function useCanManageBugs(): boolean {
  return useCanSeeScreen("bugs");
}

// ── Alerts ────────────────────────────────────────────────────────────────────

/** Receive real-time machine alert notifications. */
export function useCanReceiveAlerts(): boolean {
  return useCanSeeScreen("ops-alerts");
}

// ── Navigation / Menu ─────────────────────────────────────────────────────────

/** Access the operational area. Qualquer usuário interno autenticado entra;
 *  o Role Matrix controla o que cada um vê dentro do sistema. */
export function useCanAccessOps(): boolean {
  const { user } = useAuth();
  return !!user;
}

/** See admin-only menu items (system config, pipeline, webhooks). */
export function useCanSeeAdminMenu(): boolean {
  return useCanSeeScreen("admin");
}

/** See finance-restricted menu items. */
export function useCanSeeFinanceMenu(): boolean {
  return useCanSeeScreen("financeiro");
}

// ── Financeiro ────────────────────────────────────────────────────────────────

/** View financial dashboard KPIs and charts. */
export function useCanViewFinanceiroDashboard(): boolean {
  return useCanSeeScreen("financeiro");
}

// ── Logistics ─────────────────────────────────────────────────────────────────

/** Manage logistics, carriers, and delivery actions. */
export function useCanManageLogistics(): boolean {
  return useCanSeeScreen("logistics");
}

/** View logistics KPI dashboard. */
export function useCanViewLogisticsDashboard(): boolean {
  return useCanSeeScreen("dashboard-logistica");
}

// ── Dashboards ────────────────────────────────────────────────────────────────

/** View strategic dashboard. */
export function useCanViewStrategicDashboard(): boolean {
  return useCanSeeScreen("dashboard-estrategico");
}

// ── Licensee portal (internal staff access) ───────────────────────────────────

/** Access the licensee portal management view as internal staff. */
export function useCanViewLicenseeArea(): boolean {
  return useCanSeeScreen("licensees");
}

// ── PDV admin ─────────────────────────────────────────────────────────────────

/** Access PDV management as internal admin. */
export function useCanManagePDVAdmin(): boolean {
  return useCanSeeScreen("pdv-dashboard");
}

// ── OS management ─────────────────────────────────────────────────────────────

/** Perform management actions on OS (advance stage, assign, etc.). */
export function useCanManageOSActions(): boolean {
  return useCanSeeScreen("os");
}

// ── Governance ────────────────────────────────────────────────────────────────

/** Access the governance page. */
export function useCanAccessGovernance(): boolean {
  return useCanSeeScreen("governance");
}

// ── Portals / Area Switcher ───────────────────────────────────────────────────

/** Acesso a todos os portais (licenciado + PDV) como staff interno.
 *  Liberado para superusuário TI/head, head ou command. */
export function useCanAccessAllPortals(): boolean {
  const { profile } = useAuth();
  const isTiHead =
    (profile?.department === "ti_suporte" && profile?.funcao === "head") ||
    (profile?.secondary_department === "ti_suporte" && profile?.secondary_funcao === "head");
  const isHead =
    profile?.funcao === "head" || profile?.secondary_funcao === "head" || profile?.funcao === "ceo";
  const isCommand =
    profile?.department === "command" || profile?.secondary_department === "command";
  return isTiHead || isHead || isCommand;
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
