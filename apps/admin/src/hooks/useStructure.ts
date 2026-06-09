import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface CarboDepartment {
  id: string;
  key: string;
  label: string;
  sigla: string;
  color: string;
  sort_order: number;
}

/** Departamentos (carbo_departments) — fonte da verdade no banco. */
export function useDepartments() {
  return useQuery({
    queryKey: ["admin", "departments"],
    queryFn: async (): Promise<CarboDepartment[]> => {
      const { data, error } = await supabase
        .from("carbo_departments")
        .select("id, key, label, sigla, color, sort_order")
        .eq("is_active", true)
        .order("sort_order");
      if (error) throw error;
      return (data ?? []) as CarboDepartment[];
    },
  });
}

export function useCreateDepartment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: { label: string; sigla: string; color: string }) => {
      const key = slugifyKey(p.label);
      if (!key) throw new Error("Nome inválido");
      const { data: last } = await supabase
        .from("carbo_departments")
        .select("sort_order").order("sort_order", { ascending: false }).limit(1);
      const nextOrder = ((last?.[0]?.sort_order as number) ?? 0) + 1;
      const { error } = await supabase.from("carbo_departments").upsert({
        key,
        label: p.label.trim(),
        sigla: p.sigla.trim().toUpperCase().slice(0, 4),
        color: p.color,
        sort_order: nextOrder,
        is_active: true,
      }, { onConflict: "key" });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "departments"] }),
  });
}

export function useUpdateDepartment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: { id: string; label?: string; sigla?: string; color?: string }) => {
      const updates: Record<string, unknown> = {};
      if (p.label !== undefined) updates.label = p.label.trim();
      if (p.sigla !== undefined) updates.sigla = p.sigla.trim().toUpperCase().slice(0, 4);
      if (p.color !== undefined) updates.color = p.color;
      const { error } = await supabase.from("carbo_departments").update(updates).eq("id", p.id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "departments"] }),
  });
}

/** Soft delete — não apaga a chave (usuários antigos continuam válidos). */
export function useDeleteDepartment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("carbo_departments").update({ is_active: false }).eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "departments"] }),
  });
}

/** Editar função existente (renomear label e/ou trocar o nível). */
export function useUpdateFunction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: { id: string; label?: string; accessLevel?: "gestor" | "colaborador" }) => {
      const updates: Record<string, unknown> = {};
      if (p.label !== undefined) updates.label = p.label.trim();
      if (p.accessLevel !== undefined) updates.access_level = p.accessLevel;
      const { error } = await supabase.from("carbo_functions").update(updates).eq("id", p.id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "dept-functions"] }),
  });
}

/** label → key estável (sem acento, minúsculo, _). */
function slugifyKey(label: string): string {
  return label
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}
