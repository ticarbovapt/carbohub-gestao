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

    // Helper: converte um par (funcao, dept) em variant
    const variantFor = (f: string | null, d: string | null): DashboardVariant | null => {
      if (f === "ceo" || f === "head" || f === "assistente_executiva") return "ceo";
      if (f === "gerente" || f === "coordenador") {
        if (d === "finance") return "gestor_fin";
        if (d === "cgc")     return "gestor_compras";
        return "gestor_adm";
      }
      if (f === "supervisor") return "operador";
      if (f === "analista") return d === "finance" ? "operador_fiscal" : "operador";
      if (f === "staff" || f === "vendedor_b2b" || f === "vendedor_b2c") return "operador";
      return null;
    };

    // Hierarquia de privilege: ceo > gestor_* > operador_fiscal > operador > default
    const VARIANT_RANK: Record<DashboardVariant, number> = {
      ceo: 6, gestor_adm: 5, gestor_fin: 5, gestor_compras: 5,
      operador_fiscal: 3, operador: 2, default: 1,
    };

    const primary   = variantFor(funcao, dept)   ?? "default";
    const secondary = variantFor(secFuncao, secDept) ?? "default";

    // Retorna o variant de maior privilégio entre os dois papéis
    return VARIANT_RANK[primary] >= VARIANT_RANK[secondary] ? primary : secondary;
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
