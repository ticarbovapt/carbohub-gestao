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
 * Design rules agreed before enforcement:
 *   - Screen access is ALWAYS driven by function_screen_access — no function
 *     bypasses it, including heads. Heads configure their screens in the matrix.
 *   - data_scope = "global" means the user sees all records within their
 *     allowed screens — it does NOT skip the screen check.
 *   - TI/Suporte (fullAccess flag) is the only role that bypasses screen checks.
 *   - Users without a configured funcao fall back to their app role
 *     (admin → all screens, manager/operator → no change until configured).
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
export const ENFORCEMENT_ACTIVE = false;

export function useFunctionAccess(): FunctionAccess {
  const { profile, isMasterAdmin, isSuporte } = useAuth();

  const dept   = (profile as any)?.department as string | null;
  const funcao = profile?.funcao as string | null;
  const userId = profile?.id as string | undefined;

  const { data, isLoading } = useQuery({
    queryKey: ["function-access", dept, funcao, userId],
    enabled: !!dept && !!funcao && !!userId,
    queryFn: async () => {
      const [screenRes, fnRes, overrideRes] = await Promise.all([
        // Screen access from function_screen_access
        (supabase as any)
          .from("function_screen_access")
          .select("screen_ids")
          .eq("department", dept)
          .eq("function_key", funcao)
          .maybeSingle(),
        // View + edit scope from department_functions
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
      ]);

      const functionScreenIds = (screenRes.data?.screen_ids ?? []) as string[];
      const extraScreenIds    = (overrideRes.data?.extra_screen_ids ?? []) as string[];
      const allScreenIds      = [...new Set([...functionScreenIds, ...extraScreenIds])];

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

  // MasterAdmin and TI/Suporte always bypass — full access.
  if (isMasterAdmin || isSuporte) {
    return { allowedScreenIds: [], dataScope: "global", editScope: "global", isConfigured: true, hasOverride: false, isLoading: false };
  }

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
 * After activation: checks allowedScreenIds (or fullAccess for TI/admin).
 */
export function useCanSeeScreen(screenId: string): boolean {
  const { allowedScreenIds, isConfigured } = useFunctionAccess();
  const { isMasterAdmin, isSuporte }       = useAuth();

  if (!ENFORCEMENT_ACTIVE)        return true;
  if (isMasterAdmin || isSuporte) return true;
  if (!isConfigured)              return true; // not yet configured → don't block
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
  const canSeeMatrix = useCanSeeScreen("role-matrix");
  const { isAdmin, isMasterAdmin, isAnyGestor } = useAuth();

  if (ENFORCEMENT_ACTIVE) return canSeeMatrix;

  // Legacy fallback: role-based until enforcement is on
  return isAdmin || isMasterAdmin || isAnyGestor;
}
