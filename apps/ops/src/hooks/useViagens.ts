import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// ─────────────────────────────────────────────────────────────────────────────
// Viagens corporativas (ops_viagens) — tabela interna do Carbo Ops.
//  Fluxo simples: pendente → aprovado/reprovado. Prestação de contas embutida.
//  RLS: authenticated.
// ─────────────────────────────────────────────────────────────────────────────

const db = supabase as unknown as {
  from: (t: string) => any;
  auth: { getUser: () => Promise<{ data: { user: { id: string } | null } }> };
};

export type ViagemStatus = "pendente" | "aprovado" | "reprovado" | "em_andamento" | "concluido" | "cancelado";
export type PcStatus = "aberta" | "enviada" | "aprovada" | "reprovada" | "encerrada";

export interface Viagem {
  id: string;
  solicitante: string;
  destino: string;
  objetivo: string;
  centro_custo: string | null;
  data_ida: string | null;
  data_volta: string | null;
  valor_estimado: number;
  adiantamento: number;
  status: ViagemStatus;
  motivo_reprovacao: string | null;
  pc_status: PcStatus | null;
  pc_total: number;
  pc_notas: string | null;
  created_by: string | null;
}

export function useViagens() {
  return useQuery({
    queryKey: ["ops", "viagens"],
    queryFn: async (): Promise<Viagem[]> => {
      const res = await db.from("ops_viagens").select("*").order("created_at", { ascending: false });
      if (res.error) throw res.error;
      return (res.data ?? []).map((v: any) => ({
        id: v.id,
        solicitante: v.solicitante ?? "—",
        destino: v.destino ?? "—",
        objetivo: v.objetivo ?? "",
        centro_custo: v.centro_custo ?? null,
        data_ida: v.data_ida ? String(v.data_ida).slice(0, 10) : null,
        data_volta: v.data_volta ? String(v.data_volta).slice(0, 10) : null,
        valor_estimado: Number(v.valor_estimado) || 0,
        adiantamento: Number(v.adiantamento) || 0,
        status: (v.status ?? "pendente") as ViagemStatus,
        motivo_reprovacao: v.motivo_reprovacao ?? null,
        pc_status: (v.pc_status ?? null) as PcStatus | null,
        pc_total: Number(v.pc_total) || 0,
        pc_notas: v.pc_notas ?? null,
        created_by: v.created_by ?? null,
      }));
    },
  });
}

export function useCurrentUserId() {
  return useQuery({
    queryKey: ["ops", "current-user-id"],
    queryFn: async (): Promise<string | null> => {
      const { data } = await db.auth.getUser();
      return data?.user?.id ?? null;
    },
    staleTime: 5 * 60 * 1000,
  });
}

export interface CreateViagemInput {
  solicitante: string;
  destino: string;
  objetivo: string;
  centroCusto: string;
  dataIda: string;
  dataVolta: string;
  valorEstimado: number;
}

export function useViagemMutations() {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ["ops", "viagens"] });

  const create = useMutation({
    mutationFn: async (p: CreateViagemInput) => {
      if (!p.solicitante.trim()) throw new Error("Informe o solicitante.");
      if (!p.destino.trim()) throw new Error("Informe o destino.");
      const { data: auth } = await db.auth.getUser();
      const res = await db.from("ops_viagens").insert({
        solicitante: p.solicitante.trim(),
        destino: p.destino.trim(),
        objetivo: p.objetivo.trim() || null,
        centro_custo: p.centroCusto || null,
        data_ida: p.dataIda || null,
        data_volta: p.dataVolta || null,
        valor_estimado: Number(p.valorEstimado) || 0,
        status: "pendente",
        created_by: auth?.user?.id ?? null,
      });
      if (res.error) throw res.error;
    },
    onSuccess: invalidate,
  });

  const approve = useMutation({
    mutationFn: async (id: string) => {
      const res = await db.from("ops_viagens").update({ status: "aprovado", updated_at: new Date().toISOString() }).eq("id", id);
      if (res.error) throw res.error;
    },
    onSuccess: invalidate,
  });

  const reject = useMutation({
    mutationFn: async (p: { id: string; motivo: string }) => {
      const res = await db.from("ops_viagens").update({ status: "reprovado", motivo_reprovacao: p.motivo.trim() || null, updated_at: new Date().toISOString() }).eq("id", p.id);
      if (res.error) throw res.error;
    },
    onSuccess: invalidate,
  });

  const savePC = useMutation({
    mutationFn: async (p: { id: string; pcStatus: PcStatus; pcTotal: number; pcNotas: string }) => {
      const res = await db.from("ops_viagens").update({
        pc_status: p.pcStatus,
        pc_total: Number(p.pcTotal) || 0,
        pc_notas: p.pcNotas.trim() || null,
        updated_at: new Date().toISOString(),
      }).eq("id", p.id);
      if (res.error) throw res.error;
    },
    onSuccess: invalidate,
  });

  return { create, approve, reject, savePC };
}
