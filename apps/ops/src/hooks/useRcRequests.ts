import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// ─────────────────────────────────────────────────────────────────────────────
// Compras — Requisições (purchase_requests), o pipeline oficial:
//   purchase_requests → purchase_orders → recebimento → NF → contas a pagar.
//   Uma requisição = 1 linha com `items` (JSONB). rc_number é gerado por trigger.
//   RLS aberto a autenticado (migration do Ops).
// ─────────────────────────────────────────────────────────────────────────────

const db = supabase as unknown as {
  from: (t: string) => any;
  auth: { getUser: () => Promise<{ data: { user: { id: string } | null } }> };
};

export type RcStatus = "rascunho" | "aguardando_aprovacao" | "aprovada" | "rejeitada" | "cancelada";

export type PurchaseType = "estoque" | "uso_direto" | "investimento";
const PURCHASE_TYPE_LABELS: Record<PurchaseType, string> = {
  estoque: "Estoque", uso_direto: "Uso Direto", investimento: "Investimento",
};

export interface RcItem { descricao: string; quantidade: number; unidade: string; valor_unitario: number; }

export interface RcRow {
  id: string;
  rc_number: string;
  cost_center: string;
  tipo: string;
  valor: number;
  status: RcStatus;
  data: string; // YYYY-MM-DD
  items: RcItem[];
  suggested_supplier: string | null;
  has_oc: boolean;
}

export function useRcRequests() {
  return useQuery({
    queryKey: ["ops", "purchase-requests"],
    queryFn: async (): Promise<RcRow[]> => {
      const res = await db
        .from("purchase_requests")
        .select("id, rc_number, cost_center, purchase_type, estimated_value, status, created_at, items, suggested_supplier, purchase_orders(id)")
        .order("created_at", { ascending: false });
      if (res.error) throw res.error;
      return (res.data ?? []).map((r: Record<string, unknown>) => ({
        id: r.id as string,
        rc_number: (r.rc_number as string) ?? "—",
        cost_center: (r.cost_center as string) ?? "—",
        tipo: PURCHASE_TYPE_LABELS[(r.purchase_type as PurchaseType)] ?? String(r.purchase_type ?? "—"),
        valor: Number(r.estimated_value) || 0,
        status: ((r.status as string) ?? "rascunho") as RcStatus,
        data: String(r.created_at ?? "").slice(0, 10),
        items: Array.isArray(r.items) ? (r.items as RcItem[]) : [],
        suggested_supplier: (r.suggested_supplier as string) ?? null,
        has_oc: Array.isArray(r.purchase_orders) && r.purchase_orders.length > 0,
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

export interface CreateRcInput {
  costCenter: string;
  purchaseType: PurchaseType;
  suggestedSupplier: string;
  justificativa: string;
  operationalImpact: string;
  items: RcItemInput[];
  status: "rascunho" | "aguardando_aprovacao";
}

export function useRcMutations() {
  const qc = useQueryClient();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["ops", "purchase-requests"] });
    qc.invalidateQueries({ queryKey: ["ops", "purchase-orders"] });
  };

  const create = useMutation({
    mutationFn: async (p: CreateRcInput) => {
      if (!p.costCenter.trim()) throw new Error("Selecione o centro de custo.");
      if (!p.justificativa.trim()) throw new Error("Justificativa é obrigatória.");
      const items = p.items.filter((i) => i.descricao.trim() && i.quantidade > 0);
      if (items.length === 0) throw new Error("Adicione ao menos um item.");
      const { data: auth } = await db.auth.getUser();
      const estimated = items.reduce((s, i) => s + (Number(i.quantidade) || 0) * (Number(i.valor_unitario) || 0), 0);
      const res = await db.from("purchase_requests").insert({
        requested_by: auth?.user?.id ?? null,
        cost_center: p.costCenter,
        purchase_type: p.purchaseType,
        suggested_supplier: p.suggestedSupplier || null,
        justification: p.justificativa.trim(),
        operational_impact: p.operationalImpact.trim() || null,
        items: items.map((i) => ({ descricao: i.descricao.trim(), quantidade: i.quantidade, unidade: i.unidade || "un", valor_unitario: Number(i.valor_unitario) || 0 })),
        estimated_value: estimated,
        status: p.status,
      });
      if (res.error) throw res.error;
    },
    onSuccess: invalidate,
  });

  const approve = useMutation({
    mutationFn: async (id: string) => {
      const { data: auth } = await db.auth.getUser();
      const res = await db.from("purchase_requests")
        .update({ status: "aprovada", approved_by: auth?.user?.id ?? null, approved_at: new Date().toISOString() })
        .eq("id", id);
      if (res.error) throw res.error;
    },
    onSuccess: invalidate,
  });

  const reject = useMutation({
    mutationFn: async (id: string) => {
      const res = await db.from("purchase_requests")
        .update({ status: "rejeitada" })
        .eq("id", id);
      if (res.error) throw res.error;
    },
    onSuccess: invalidate,
  });

  return { create, approve, reject };
}
