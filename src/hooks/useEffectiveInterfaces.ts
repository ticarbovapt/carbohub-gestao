/**
 * useEffectiveInterfaces — returns the portals the current user can access.
 *
 * ENFORCEMENT_ACTIVE = false  →  reads profile.allowed_interfaces (legacy DB field).
 * ENFORCEMENT_ACTIVE = true   →  derives from department:
 *   - Any internal department → "carbo_ops" granted automatically.
 *   - Portal licenciado / PDV → controlled via function_screen_access (not stored here).
 *
 * When enforcement is active, the "Interfaces Liberadas" UI section in
 * AccessConfigDialog and AddMemberDialog is hidden (LEGACY_ACCESS_ACTIVE = false).
 * This hook is the single read-path for interface access checks.
 */

import { useAuth } from "@/contexts/AuthContext";
import { ENFORCEMENT_ACTIVE } from "./useFunctionAccess";

export function useEffectiveInterfaces(): string[] {
  const { profile } = useAuth();

  if (!ENFORCEMENT_ACTIVE) {
    return (profile as any)?.allowed_interfaces ?? [];
  }

  // Enforcement active: derive from department.
  // All internal-department users implicitly have carbo_ops.
  const dept = (profile as any)?.department as string | null;
  if (!dept) return [];
  return ["carbo_ops"];
}
