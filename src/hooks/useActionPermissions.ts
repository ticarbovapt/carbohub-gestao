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
  const can = useCanSeeScreen("os");
  const { isAdmin, isManager, isAnyGestor, isCeo, isAnyOperador } = useAuth();
  if (ENFORCEMENT_ACTIVE) return can;
  return isAdmin || isManager || isAnyGestor || isCeo || isAnyOperador;
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
