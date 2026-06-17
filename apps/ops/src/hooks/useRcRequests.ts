import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// ─────────────────────────────────────────────────────────────────────────────
// Requisições de Compra (rc_requests) — ler + criar + aprovar/rejeitar.
//  rc_requests é 1 linha por item; uma requisição com vários itens vira N linhas.
//  RLS: rc_requests aberto a autenticado (migration do Ops).
// ─────────────────────────────────────────────────────────────────────────────

const db = supabase as unknown as {
  from: (t: string) => any;
  auth: { getUser: () => Promise<{ data: { user: { id: string } | null } }> };
};

export type RcStatus = "rascunho" | "aguardando_aprovacao" | "aprovada" | "rejeitada" | "cancelada";

const toPageStatus = (raw: string): RcStatus => {
  switch (raw) {
    case "rascunho": return "rascunho";
    case "aprovada": case "convertida_pc": return "aprovada";
    case "rejeitada": return "rejeitada";
    default: return "aguardando_aprovacao"; // em_cotacao / em_analise_ia / aguardando_aprovacao
  }
};

export interface RcRow {
  id: string;
  rc_number: string;
  cost_center: string;
  tipo: string;
  valor: number;
  status: RcStatus;
  data: string; // YYYY-MM-DD
}

export function useRcRequests() {
  return useQuery({
    queryKey: ["ops", "rc-requests"],
    queryFn: async (): Promise<RcRow[]> => {
      const res = await db
        .from("rc_requests")
        .select("id, produto_nome, centro_custo, valor_estimado, status, created_at")
        .order("created_at", { ascending: false });
      if (res.error) throw res.error;
      return (res.data ?? []).map((r: Record<string, unknown>) => ({
        id: r.id as string,
        rc_number: "RC-" + String(r.id).slice(0, 8).toUpperCase(),
        cost_center: (r.centro_custo as string) ?? "—",
        tipo: (r.produto_nome as string) ?? "—",
        valor: Number(r.valor_estimado) || 0,
        status: toPageStatus((r.status as string) ?? "aguardando_aprovacao"),
        data: String(r.created_at ?? "").slice(0, 10),
      }));
    },
  });
}

export interface RcItemInput {
  descricao: string;
  quantidade: number;
  unidade: string;
  valor_unitario: number;
}

export function useRcMutations() {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ["ops", "rc-requests"] });

  // Cria 1 rc_requests por item preenchido.
  const create = useMutation({
    mutationFn: async (p: { centroCusto: string; justificativa: string; items: RcItemInput[]; status: "rascunho" | "aguardando_aprovacao" }) => {
      if (!p.centroCusto.trim()) throw new Error("Selecione o centro de custo.");
      if (!p.justificativa.trim()) throw new Error("Justificativa é obrigatória.");
      const items = p.items.filter((i) => i.descricao.trim() && i.quantidade > 0);
      if (items.length === 0) throw new Error("Adicione ao menos um item.");
      const { data: auth } = await db.auth.getUser();
      const rows = items.map((i) => ({
        solicitante_id: auth?.user?.id ?? null,
        produto_nome: i.descricao.trim(),
        quantidade: i.quantidade,
        unidade: i.unidade || "un",
        valor_estimado: (Number(i.quantidade) || 0) * (Number(i.valor_unitario) || 0),
        justificativa: p.justificativa.trim(),
        centro_custo: p.centroCusto,
        status: p.status,
      }));
      const res = await db.from("rc_requests").insert(rows);
      if (res.error) throw res.error;
    },
    onSuccess: invalidate,
  });

  const approve = useMutation({
    mutationFn: async (id: string) => {
      const res = await db.from("rc_requests").update({ status: "aprovada", updated_at: new Date().toISOString() }).eq("id", id);
      if (res.error) throw res.error;
    },
    onSuccess: invalidate,
  });

  const reject = useMutation({
    mutationFn: async (id: string) => {
      const res = await db.from("rc_requests").update({ status: "rejeitada", updated_at: new Date().toISOString() }).eq("id", id);
      if (res.error) throw res.error;
    },
    onSuccess: invalidate,
  });

  return { create, approve, reject };
}
