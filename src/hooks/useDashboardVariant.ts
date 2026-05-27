/**
 * useDashboardVariant — determines which dashboard component to render for the current user.
 *
 * ENFORCEMENT_ACTIVE = false  →  driven by carbo_roles (legacy: gestor_adm, gestor_fin, etc.)
 * ENFORCEMENT_ACTIVE = true   →  derived from profiles.funcao + profiles.department
 *
 * This hook is the single source of truth for dashboard routing.
 * Pages that render different dashboard components should use this instead of
 * checking isGestorAdm / isCeo / etc. directly.
 */

import { useAuth } from "@/contexts/AuthContext";
import { ENFORCEMENT_ACTIVE } from "./useFunctionAccess";

export type DashboardVariant =
  | "ceo"
  | "gestor_adm"
  | "gestor_fin"
  | "gestor_compras"
  | "operador_fiscal"
  | "operador"
  | "default";

export function useDashboardVariant(): DashboardVariant {
  const {
    isCeo, isAdmin, isMasterAdmin,
    isGestorAdm, isGestorFin, isGestorCompras,
    isOperadorFiscal, isAnyGestor, isManager,
    isAnyOperador, isOperador,
    profile,
  } = useAuth();

  if (ENFORCEMENT_ACTIVE) {
    if (isMasterAdmin) return "ceo";
    const dept      = profile?.department        ?? null;
    const funcao    = profile?.funcao            ?? null;
    const secDept   = profile?.secondary_department ?? null;
    const secFuncao = profile?.secondary_funcao     ?? null;

    // TI/head é superusuário — vê o dashboard de CEO independente do papel primário.
    // Verifica tanto papel primário quanto secundário.
    const isTiHead =
      (dept === "ti_suporte" && funcao === "head") ||
      (secDept === "ti_suporte" && secFuncao === "head");
    if (isTiHead) return "ceo";

    if (funcao === "ceo" || funcao === "head" || funcao === "assistente_executiva") return "ceo";
    if (funcao === "gerente" || funcao === "coordenador") {
      if (dept === "finance") return "gestor_fin";
      if (dept === "b2b")     return "gestor_compras";
      return "gestor_adm";
    }
    if (funcao === "supervisor") return "operador";
    if (funcao === "analista") {
      if (dept === "finance") return "operador_fiscal";
      return "operador";
    }
    if (funcao === "staff" || funcao === "vendedor_b2b" || funcao === "vendedor_b2c") return "operador";
    return "default";
  }

  // Legacy: carbo_roles-based
  if (isCeo || isAdmin || isMasterAdmin) return "ceo";
  if (isGestorAdm)   return "gestor_adm";
  if (isGestorFin)   return "gestor_fin";
  if (isGestorCompras) return "gestor_compras";
  if (isAnyGestor || isManager) return "gestor_adm";
  if (isOperadorFiscal) return "operador_fiscal";
  if (isAnyOperador || isOperador) return "operador";
  return "default";
}
