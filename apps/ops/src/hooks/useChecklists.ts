import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// ─────────────────────────────────────────────────────────────────────────────
// Checklists operacionais (ops_checklists) — tabela interna do Carbo Ops.
//  Etapas ficam num array JSONB [{ nome, concluida }]. RLS: authenticated.
// ─────────────────────────────────────────────────────────────────────────────

const db = supabase as unknown as {
  from: (t: string) => any;
  auth: { getUser: () => Promise<{ data: { user: { id: string } | null } }> };
};

export interface Etapa { nome: string; concluida: boolean; }
export interface Checklist {
  id: string;
  nome: string;
  departamento: string;
  etapas: Etapa[];
}

export function useChecklists() {
  return useQuery({
    queryKey: ["ops", "checklists"],
    queryFn: async (): Promise<Checklist[]> => {
      const res = await db
        .from("ops_checklists")
        .select("id, nome, departamento, etapas")
        .order("created_at", { ascending: false });
      if (res.error) throw res.error;
      return (res.data ?? []).map((r: any) => ({
        id: r.id,
        nome: r.nome,
        departamento: r.departamento,
        etapas: Array.isArray(r.etapas) ? r.etapas : [],
      }));
    },
  });
}

export function useChecklistMutations() {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ["ops", "checklists"] });

  const create = useMutation({
    mutationFn: async (p: { nome: string; departamento: string; etapas: string[] }) => {
      if (!p.nome.trim()) throw new Error("Informe o nome do checklist.");
      if (!p.departamento) throw new Error("Selecione o departamento.");
      const etapas = p.etapas.map((s) => s.trim()).filter(Boolean).map((nome) => ({ nome, concluida: false }));
      if (etapas.length === 0) throw new Error("Adicione ao menos uma etapa.");
      const { data: auth } = await db.auth.getUser();
      const res = await db.from("ops_checklists").insert({
        nome: p.nome.trim(),
        departamento: p.departamento,
        etapas,
        created_by: auth?.user?.id ?? null,
      });
      if (res.error) throw res.error;
    },
    onSuccess: invalidate,
  });

  const saveEtapas = useMutation({
    mutationFn: async (p: { id: string; etapas: Etapa[] }) => {
      const res = await db.from("ops_checklists")
        .update({ etapas: p.etapas, updated_at: new Date().toISOString() })
        .eq("id", p.id);
      if (res.error) throw res.error;
    },
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const res = await db.from("ops_checklists").delete().eq("id", id);
      if (res.error) throw res.error;
    },
    onSuccess: invalidate,
  });

  return { create, saveEtapas, remove };
}
