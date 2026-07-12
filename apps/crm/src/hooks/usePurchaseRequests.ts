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

/** Minhas requisições (escopo próprio do solicitante). */
export function useMyPurchaseRequests() {
  return useQuery({
    queryKey: ["ops", "my-purchase-requests"],
    queryFn: async (): Promise<PurchaseRequest[]> => {
      const { data: u } = await supabase.auth.getUser();
      const uid = u?.user?.id;
      let q = db.from("purchase_requests").select("*").order("created_at", { ascending: false }).limit(100);
      if (uid) q = q.eq("requested_by", uid);
      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as PurchaseRequest[];
    },
  });
}

export interface CreatePRInput {
  cost_center: string;
  purchase_type: string;
  suggested_supplier?: string | null;
  escopo?: string;               // "setor" | "individual"
  motivo?: string | null;        // categoria (individual)
  priority?: string | null;
  needed_by?: string | null;
  reference_url?: string | null; // link do produto
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
          requested_by: u?.user?.id ?? null,
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
