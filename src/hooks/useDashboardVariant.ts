/**
 * useDashboardVariant — define qual dashboard renderizar para o usuário atual.
 *
 * Só existem duas visões de home, derivadas de department + funcao (Role Matrix):
 *   - "ceo"     → visão executiva (CeoDashboard) — diretoria / TI head
 *   - "default" → dashboard geral real (DefaultDashboard) — todo o restante
 */

import { useAuth } from "@/contexts/AuthContext";

export type DashboardVariant = "ceo" | "default";

export function useDashboardVariant(): DashboardVariant {
  const { profile } = useAuth();

  const dept      = profile?.department           ?? null;
  const funcao    = profile?.funcao               ?? null;
  const secDept   = profile?.secondary_department ?? null;
  const secFuncao = profile?.secondary_funcao     ?? null;

  // TI/head é superusuário — vê o dashboard executivo.
  const isTiHead =
    (dept === "ti_suporte" && funcao === "head") ||
    (secDept === "ti_suporte" && secFuncao === "head");
  if (isTiHead) return "ceo";

  // Diretoria (CEO/head/assistente executiva) vê o executivo; o resto, o geral.
  const isExec = (f: string | null) =>
    f === "ceo" || f === "head" || f === "assistente_executiva";
  if (isExec(funcao) || isExec(secFuncao)) return "ceo";

  return "default";
}
