import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

// ─────────────────────────────────────────────────────────────────────────────
// Requisição de Compra (purchase_requests) — tabela COMPARTILHADA. A requisição
// criada aqui no Ops aparece na aba "Requisições" do Carbo Finanças, que cuida
// do resto (aprovação, OC, recebimento, NF, contas a pagar).
// ─────────────────────────────────────────────────────────────────────────────

const db = supabase as unknown as { from: (t: string) => any };

export interface ReqItem {
  descricao: string;
  quantidade: number;
  unidade: string;
  valor_unitario: number;
}

export interface PurchaseRequest {
  id: string;
  rc_number: string;
  /** De quem é a necessidade. Pode ser um colega, quando a RC foi aberta em nome dele. */
  requested_by?: string;
  /** Quem clicou em criar. Difere de requested_by na RC aberta em nome de outro. */
  created_by?: string | null;
  cost_center: string;
  purchase_type: string;
  suggested_supplier: string | null;
  estimated_value: number;
  justification: string;
  operational_impact: string | null;
  items: ReqItem[];
  status: string;
  created_at: string;
}

/** Minhas requisições PAGINADAS (server-side: .range() + contagem exata). */
export function useMyPurchaseRequestsPaged(page: number, pageSize: number) {
  return useQuery({
    queryKey: ["ops", "my-purchase-requests", "paged", page, pageSize],
    queryFn: async (): Promise<{ rows: PurchaseRequest[]; total: number }> => {
      const { data: u } = await supabase.auth.getUser();
      const uid = u?.user?.id;
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;
      let q = db.from("purchase_requests")
        .select("*", { count: "exact" })
        .order("created_at", { ascending: false })
        .range(from, to);
      // ⚠️ requested_by OU created_by. Só por requested_by, a RC que eu abri em
      // nome de um colega SUMIRIA desta lista no instante em que fosse criada —
      // quem lançou perderia o rastro do próprio trabalho.
      if (uid) q = q.or(`requested_by.eq.${uid},created_by.eq.${uid}`);
      const { data, error, count } = await q;
      if (error) throw error;
      return { rows: (data || []) as PurchaseRequest[], total: count ?? 0 };
    },
    // Mantém a página anterior visível enquanto a nova carrega (sem "piscar").
    placeholderData: (prev) => prev,
  });
}

export interface CreatePRInput {
  /** Solicitante escolhido. Vazio/ausente = a RC é de quem está logado. */
  requested_by?: string;
  cost_center: string;
  purchase_type: string;
  escopo?: string;               // "setor" | "individual"
  motivo?: string | null;        // motivo estruturado / categoria
  priority?: string | null;      // "normal" | "alta" | "critica"
  needed_by?: string | null;     // data necessária (YYYY-MM-DD)
  reference_url?: string | null; // link do produto (individual)
  suggested_supplier?: string | null;
  estimated_value: number;
  justification?: string | null;
  operational_impact?: string | null;
  items: ReqItem[];
  status?: string; // "rascunho" | "aguardando_aprovacao"
}

export function useCreatePurchaseRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: CreatePRInput) => {
      const { data: u } = await supabase.auth.getUser();
      const { data, error } = await db
        .from("purchase_requests")
        .insert({
          rc_number: "TEMP", // numeração final gerada no fluxo do Finanças
          // De QUEM é a necessidade (pode ser um colega) …
          requested_by: v.requested_by || (u?.user?.id ?? null),
          // … e quem CLICOU, sempre. Sem esta linha, abrir em nome de outro
          // apagaria o autor do registro — o oposto de auditoria.
          created_by: u?.user?.id ?? null,
          cost_center: v.cost_center,
          purchase_type: v.purchase_type,
          escopo: v.escopo || "individual",
          motivo: v.motivo || null,
          priority: v.priority || null,
          needed_by: v.needed_by || null,
          reference_url: v.reference_url || null,
          suggested_supplier: v.suggested_supplier || null,
          estimated_value: v.estimated_value,
          justification: v.justification || null,
          operational_impact: v.operational_impact || null,
          items: v.items,
          status: v.status || "rascunho",
        })
        .select("id")
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ["ops", "my-purchase-requests"] });
      toast.success(v.status === "rascunho" ? "Rascunho salvo!" : "Requisição enviada para aprovação!");
    },
    onError: (e: Error) => toast.error("Erro ao criar requisição: " + e.message),
  });
}
