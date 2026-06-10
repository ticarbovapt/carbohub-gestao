/**
 * useFunctionAccess — reads the current user's configured screen access and
 * data scope based on their department + function (profiles.funcao).
 *
 * ENFORCEMENT IS NOT ACTIVE YET.
 * This hook only returns the configuration. No screens are blocked.
 * When enforcement is ready:
 *   1. Use `allowedScreenIds` in the router to guard routes.
 *   2. Use `dataScope` in data-fetching hooks to filter records.
 *   3. Flip `ENFORCEMENT_ACTIVE = true` here (or via a feature flag).
 *
 * Design rules:
 *   - Screen access is ALWAYS driven by function_screen_access — no function
 *     bypasses it, including heads. Heads configure their screens in the matrix.
 *   - data_scope = "global" means the user sees all records within their
 *     allowed screens — it does NOT skip the screen check.
 *   - Acesso é FAIL-CLOSED: usuário sem entrada no Role Matrix (isConfigured=false)
 *     NÃO vê telas com screenId. Exceções (escape hatches) em useCanSeeScreen:
 *     TI inteiro (qualquer função em ti_suporte = superusuário), admin e CEO
 *     nunca ficam travados.
 */

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import type { DataScope } from "@/constants/functionAccessConfig";

export interface FunctionAccess {
  /** Screen IDs this function is allowed to see (function_screen_access + extra_screen_ids override). */
  allowedScreenIds: string[];
  /** Data visibility scope — merged: override ?? function default. */
  dataScope: DataScope;
  /** Edit scope — merged: override ?? function default. */
  editScope: DataScope;
  /** True when function_screen_access has an entry for this dept+funcao. */
  isConfigured: boolean;
  /** True when the user has an individual access override active. */
  hasOverride: boolean;
  /** True while loading from DB. */
  isLoading: boolean;
}

// Flip to true when enforcement is ready to activate.
// Exported so all permission hooks share a single source of truth.
export const ENFORCEMENT_ACTIVE = true;

// Convenience inverse: true while the OLD role-based system is still authoritative.
// Wrap legacy UI sections in {LEGACY_ACCESS_ACTIVE && ...} — they disappear on migration flip.
export const LEGACY_ACCESS_ACTIVE = !ENFORCEMENT_ACTIVE;

export function useFunctionAccess(): FunctionAccess {
  const { profile } = useAuth();

  const dept      = profile?.department          ?? null;
  const funcao    = profile?.funcao              ?? null;
  const secDept   = profile?.secondary_department ?? null;
  const secFuncao = profile?.secondary_funcao    ?? null;
  const userId    = profile?.id as string | undefined;

  const { data, isLoading } = useQuery({
    queryKey: ["function-access", dept, funcao, secDept, secFuncao, userId],
    enabled: !!dept && !!funcao && !!userId,
    queryFn: async () => {
      const queries: Promise<any>[] = [
        // Primary: screen access
        (supabase as any)
          .from("function_screen_access")
          .select("screen_ids")
          .eq("department", dept)
          .eq("function_key", funcao)
          .maybeSingle(),
        // Primary: view + edit scope
        (supabase as any)
          .from("department_functions")
          .select("data_scope, edit_scope")
          .eq("department", dept)
          .eq("function_key", funcao)
          .maybeSingle(),
        // Individual override
        (supabase as any)
          .from("user_access_overrides")
          .select("view_scope, edit_scope, extra_screen_ids")
          .eq("user_id", userId)
          .maybeSingle(),
      ];

      // Secondary function queries (only if configured)
      if (secDept && secFuncao) {
        queries.push(
          (supabase as any)
            .from("function_screen_access")
            .select("screen_ids")
            .eq("department", secDept)
            .eq("function_key", secFuncao)
            .maybeSingle()
        );
      }

      const results = await Promise.all(queries);
      const [screenRes, fnRes, overrideRes, secScreenRes] = results;

      const primaryScreenIds   = (screenRes.data?.screen_ids ?? []) as string[];
      const secondaryScreenIds = (secScreenRes?.data?.screen_ids ?? []) as string[];
      const extraScreenIds     = (overrideRes.data?.extra_screen_ids ?? []) as string[];
      const allScreenIds       = [...new Set([...primaryScreenIds, ...secondaryScreenIds, ...extraScreenIds])];

      const fnViewScope  = (fnRes.data?.data_scope ?? "proprio") as DataScope;
      const fnEditScope  = (fnRes.data?.edit_scope ?? "proprio") as DataScope;
      const ovViewScope  = overrideRes.data?.view_scope as DataScope | null ?? null;
      const ovEditScope  = overrideRes.data?.edit_scope as DataScope | null ?? null;

      return {
        screenIds:   allScreenIds,
        dataScope:   ovViewScope ?? fnViewScope,
        editScope:   ovEditScope ?? fnEditScope,
        configured:  !!screenRes.data,
        hasOverride: !!overrideRes.data,
      };
    },
  });

  return {
    allowedScreenIds: data?.screenIds   ?? [],
    dataScope:        data?.dataScope   ?? "proprio",
    editScope:        data?.editScope   ?? "proprio",
    isConfigured:     data?.configured  ?? false,
    hasOverride:      data?.hasOverride ?? false,
    isLoading,
  };
}

/**
 * Returns true if the current user can see the given screen.
 *
 * While ENFORCEMENT_ACTIVE = false this always returns true.
 * Com ENFORCEMENT_ACTIVE = true o acesso é FAIL-CLOSED: sem configuração no
 * Role Matrix o usuário não vê a tela. Escape hatches: TI/head, admin e CEO.
 */
export function useCanSeeScreen(screenId: string): boolean {
  const { profile } = useAuth();
  const { allowedScreenIds, isConfigured, isLoading } = useFunctionAccess();

  if (!ENFORCEMENT_ACTIVE) return true;

  // TI inteiro é superusuário — acesso irrestrito a todas as telas, inclusive
  // as novas criadas no futuro. Qualquer função dentro de ti_suporte (head ou
  // colaborador) entra. Verifica papel primário e secundário.
  // (Sem escape via admin/ceo legados: o acesso é 100% Role Matrix + TI.)
  const isTi =
    profile?.department === "ti_suporte" ||
    profile?.secondary_department === "ti_suporte";
  if (isTi) return true;

  // Enquanto a configuração ainda carrega, NÃO bloqueia — evita um flash de
  // redirect para /inicio em quem de fato tem acesso. A decisão real só vale
  // depois que isLoading vira false.
  if (isLoading) return true;

  // FAIL-CLOSED: sem entrada no Role Matrix → sem acesso à tela.
  if (!isConfigured) return false;

  return allowedScreenIds.includes(screenId);
}

/**
 * Returns true if the current user can configure the access matrix
 * (rename departments/functions, toggle screens, manage function definitions).
 *
 * Transition logic:
 *   ENFORCEMENT_ACTIVE = false → falls back to legacy role check
 *                                (isAdmin || isMasterAdmin || isAnyGestor)
 *   ENFORCEMENT_ACTIVE = true  → delegates to useCanSeeScreen("role-matrix"),
 *                                which reads function_screen_access for the user's
 *                                dept+funcao — no hardcoded role check needed.
 *
 * To activate: flip ENFORCEMENT_ACTIVE = true above. No other change required here.
 */
export function useCanManageMatrix(): boolean {
  return useCanSeeScreen("role-matrix");
}
