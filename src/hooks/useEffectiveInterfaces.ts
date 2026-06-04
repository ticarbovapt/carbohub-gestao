/**
 * useEffectiveInterfaces — retorna os portais que o usuário pode acessar.
 *
 * Derivado do department (Role Matrix): qualquer usuário com departamento
 * interno tem "carbo_ops". Acesso a portais licenciado/PDV é controlado via
 * function_screen_access.
 */

import { useAuth } from "@/contexts/AuthContext";

export function useEffectiveInterfaces(): string[] {
  const { profile } = useAuth();
  if (!profile?.department) return [];
  return ["carbo_ops"];
}
