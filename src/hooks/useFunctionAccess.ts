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
  /** Screen IDs this function is allowed to see (from function_screen_access). */
  allowedScreenIds: string[];
  /** Data visibility scope within allowed screens. */
  dataScope: DataScope;
  /** True when function_screen_access has an entry for this dept+funcao. */
  isConfigured: boolean;
  /** True while loading from DB. */
  isLoading: boolean;
}

// Flip to true when enforcement is ready to activate.
const ENFORCEMENT_ACTIVE = false; // eslint-disable-line @typescript-eslint/no-unused-vars

export function useFunctionAccess(): FunctionAccess {
  const { profile, isMasterAdmin, isSuporte } = useAuth();

  const dept   = (profile as any)?.department as string | null;
  const funcao = profile?.funcao as string | null;

  const { data, isLoading } = useQuery({
    queryKey: ["function-access", dept, funcao],
    enabled: !!dept && !!funcao,
    queryFn: async () => {
      // Screen access entry
      const { data: screenRow } = await (supabase as any)
        .from("function_screen_access")
        .select("screen_ids")
        .eq("department", dept)
        .eq("function_key", funcao)
        .maybeSingle();

      // Data scope from department_functions
      const { data: fnRow } = await (supabase as any)
        .from("department_functions")
        .select("data_scope")
        .eq("department", dept)
        .eq("function_key", funcao)
        .maybeSingle();

      return {
        screenIds:  (screenRow?.screen_ids ?? []) as string[],
        dataScope:  (fnRow?.data_scope ?? "proprio") as DataScope,
        configured: !!screenRow,
      };
    },
  });

  // MasterAdmin and TI/Suporte always bypass — full access.
  if (isMasterAdmin || isSuporte) {
    return { allowedScreenIds: [], dataScope: "global", isConfigured: true, isLoading: false };
  }

  return {
    allowedScreenIds: data?.screenIds ?? [],
    dataScope:        data?.dataScope ?? "proprio",
    isConfigured:     data?.configured ?? false,
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

  if (!ENFORCEMENT_ACTIVE)       return true;
  if (isMasterAdmin || isSuporte) return true;
  if (!isConfigured)             return true; // not yet configured → don't block
  return allowedScreenIds.includes(screenId);
}
