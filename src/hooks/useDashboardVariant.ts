/**
 * useDashboardVariant — define qual dashboard renderizar para o usuário atual.
 *
 * O sistema NÃO usa mais os papéis de gestor/operador como telas distintas.
 * Só existem duas visões de home:
 *   - "ceo"     → visão executiva completa (CeoDashboard) — CEO/head/TI
 *   - "default" → dashboard geral real (DefaultDashboard) — todo o restante
 */

import { useAuth } from "@/contexts/AuthContext";
import { ENFORCEMENT_ACTIVE } from "./useFunctionAccess";

export type DashboardVariant = "ceo" | "default";

export function useDashboardVariant(): DashboardVariant {
  const { isCeo, isAdmin, isMasterAdmin, profile } = useAuth();

  if (ENFORCEMENT_ACTIVE) {
    if (isMasterAdmin) return "ceo";

    const dept      = profile?.department           ?? null;
    const funcao    = profile?.funcao               ?? null;
    const secDept   = profile?.secondary_department ?? null;
    const secFuncao = profile?.secondary_funcao     ?? null;

    // TI/head é superusuário — vê o dashboard de CEO (papel primário ou secundário).
    const isTiHead =
      (dept === "ti_suporte" && funcao === "head") ||
      (secDept === "ti_suporte" && secFuncao === "head");
    if (isTiHead) return "ceo";

    // Visão executiva para liderança máxima; todo o restante usa o dashboard geral.
    const isExec = (f: string | null) =>
      f === "ceo" || f === "head" || f === "assistente_executiva";
    if (isExec(funcao) || isExec(secFuncao)) return "ceo";

    return "default";
  }

  // Legacy (carbo_roles): só distingue CEO/admin; o resto cai no geral.
  if (isCeo || isAdmin || isMasterAdmin) return "ceo";
  return "default";
}
