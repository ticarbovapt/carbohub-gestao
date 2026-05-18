/**
 * useUserAccessOverride — leitura e gerenciamento de overrides individuais de acesso.
 *
 * Overrides permitem dar a uma pessoa específica mais acesso do que o padrão
 * da sua função, sem afetar todos os outros com a mesma função.
 *
 * Quem pode conceder: admin (qualquer pessoa) ou head do mesmo departamento.
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import type { DataScope } from "@/constants/functionAccessConfig";

export interface UserAccessOverride {
  user_id: string;
  view_scope: DataScope | null;   // null = usa padrão da função
  edit_scope: DataScope | null;   // null = usa padrão da função
  extra_screen_ids: string[];
  granted_by: string | null;
  updated_at: string;
}

/** Lê o override de um usuário específico. */
export function useUserAccessOverride(userId: string | null) {
  return useQuery({
    queryKey: ["user-access-override", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("user_access_overrides")
        .select("*")
        .eq("user_id", userId)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as UserAccessOverride | null;
    },
  });
}

/** Salva (upsert) o override de um usuário. Passa null nos campos para remover. */
export function useUpsertUserAccessOverride() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (values: {
      userId: string;
      viewScope: DataScope | null;
      editScope: DataScope | null;
      extraScreenIds: string[];
    }) => {
      const hasAnyOverride =
        values.viewScope !== null ||
        values.editScope !== null ||
        values.extraScreenIds.length > 0;

      if (!hasAnyOverride) {
        // Sem override: remove a linha se existir
        const { error } = await (supabase as any)
          .from("user_access_overrides")
          .delete()
          .eq("user_id", values.userId);
        if (error) throw error;
        return;
      }

      const { error } = await (supabase as any)
        .from("user_access_overrides")
        .upsert({
          user_id:          values.userId,
          view_scope:       values.viewScope,
          edit_scope:       values.editScope,
          extra_screen_ids: values.extraScreenIds,
          granted_by:       user?.id ?? null,
          updated_at:       new Date().toISOString(),
        }, { onConflict: "user_id" });
      if (error) throw error;
    },
    onSuccess: (_, v) => {
      qc.invalidateQueries({ queryKey: ["user-access-override", v.userId] });
      qc.invalidateQueries({ queryKey: ["function-access"] });
      toast.success("Override de acesso salvo!");
    },
    onError: (e: any) => toast.error("Erro ao salvar override: " + e.message),
  });
}

/** Remove completamente o override de um usuário (volta ao padrão da função). */
export function useClearUserAccessOverride() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await (supabase as any)
        .from("user_access_overrides")
        .delete()
        .eq("user_id", userId);
      if (error) throw error;
    },
    onSuccess: (_, userId) => {
      qc.invalidateQueries({ queryKey: ["user-access-override", userId] });
      qc.invalidateQueries({ queryKey: ["function-access"] });
      toast.success("Override removido — acesso voltou ao padrão da função.");
    },
    onError: (e: any) => toast.error("Erro ao remover override: " + e.message),
  });
}

/**
 * Verifica se o usuário atual pode conceder overrides ao alvo.
 * Admin: pode para qualquer pessoa.
 * Head: pode para membros do mesmo departamento.
 */
export function useCanGrantOverride(targetDepartment: string | null): boolean {
  const { isAdmin, profile } = useAuth();
  if (isAdmin) return true;
  const funcao = profile?.funcao     ?? null;
  const dept   = profile?.department ?? null;
  return funcao === "head" && !!targetDepartment && dept === targetDepartment;
}
