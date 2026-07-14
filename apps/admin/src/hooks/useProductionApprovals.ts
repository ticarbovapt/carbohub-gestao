import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

// Aprovações de FABRICAÇÃO (prazo abaixo do mínimo). Espelha useDiscountApprovals.
// Tabelas/colunas novas não estão nos tipos gerados → cliente sem tipo.
const db = supabase as unknown as {
  from: (t: string) => any;
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: any; error: any }>;
};

export type ApprovalStatus = "auto_approved" | "pending" | "approved" | "rejected";

export interface ProductionApproval {
  id: string;
  order_number: string | null;
  customer_name: string | null;
  vendedor_name: string | null;
  agreed_delivery_date: string | null;
  ppf_date: string | null;
  ppe_date: string | null;
  delivery_lead_business_days: number | null;
  delivery_below_minimum: boolean;
  production_approval_status: ApprovalStatus;
  production_approver_id: string | null;
  production_approver_name: string | null;
  production_approver_notes: string | null;
  production_approved_at: string | null;
  created_at: string;
  status: string;
}

const SELECT =
  "id, order_number, customer_name, vendedor_name, agreed_delivery_date, ppf_date, ppe_date, " +
  "delivery_lead_business_days, delivery_below_minimum, production_approval_status, production_approver_id, " +
  "production_approver_notes, production_approved_at, created_at, status";

/** Fila de fabricação (só vendas com prazo definido; a fila real é a abaixo do mínimo). */
export function useProductionApprovals(filter: "pending" | "approved" | "rejected" | "all" = "pending") {
  return useQuery({
    queryKey: ["production_approvals", filter],
    refetchInterval: 30_000,
    queryFn: async (): Promise<ProductionApproval[]> => {
      let q = db.from("carboze_orders").select(SELECT).not("agreed_delivery_date", "is", null);
      if (filter === "all") q = q.eq("delivery_below_minimum", true);
      else q = q.eq("production_approval_status", filter);
      const { data, error } = await q.order("created_at", { ascending: false }).limit(200);
      if (error) throw error;
      const rows = (data ?? []) as ProductionApproval[];
      const ids = [...new Set(rows.map((r) => r.production_approver_id).filter(Boolean))] as string[];
      const names: Record<string, string> = {};
      if (ids.length) {
        const prof = await db.from("profiles").select("id, full_name").in("id", ids);
        for (const p of (prof.data ?? []) as { id: string; full_name: string | null }[]) names[p.id] = p.full_name ?? "—";
      }
      return rows.map((r) => ({ ...r, production_approver_name: r.production_approver_id ? names[r.production_approver_id] ?? "—" : null }));
    },
  });
}

/** Libera/recusa a fabricação (RPC gestor-gated). */
export function useDecideProduction() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (p: { orderId: string; decision: "approved" | "rejected"; notes?: string }) => {
      const { error } = await db.rpc("carbo_decide_production", {
        p_order_id: p.orderId, p_decision: p.decision, p_notes: p.notes ?? null,
      });
      if (error) throw error;
    },
    onSuccess: (_d, p) => {
      qc.invalidateQueries({ queryKey: ["production_approvals"] });
      toast({ title: p.decision === "approved" ? "Fabricação liberada" : "Fabricação recusada" });
    },
    onError: (e: any) => toast({ title: "Erro", description: e?.message ?? "Tente de novo", variant: "destructive" }),
  });
}

// ── Config de prazos ──────────────────────────────────────────────────────────
export interface PrazoConfigAdmin {
  enabled: boolean;
  min_business_days: number;
  ship_offset_days: number;
}

export function useProductionConfigAdmin() {
  return useQuery({
    queryKey: ["prazo_config_admin"],
    queryFn: async (): Promise<PrazoConfigAdmin> => {
      const { data } = await db.from("prazo_config").select("enabled, min_business_days, ship_offset_days").maybeSingle();
      return {
        enabled: Boolean(data?.enabled),
        min_business_days: Number(data?.min_business_days ?? 3),
        ship_offset_days: Number(data?.ship_offset_days ?? 1),
      };
    },
  });
}

export function useSaveProductionConfig() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (cfg: PrazoConfigAdmin) => {
      const { error } = await db.from("prazo_config")
        .update({ enabled: cfg.enabled, min_business_days: cfg.min_business_days, ship_offset_days: cfg.ship_offset_days })
        .eq("id", true);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["prazo_config_admin"] });
      qc.invalidateQueries({ queryKey: ["prazo_config_public"] });
      toast({ title: "Configuração de prazos salva" });
    },
    onError: (e: any) => toast({ title: "Erro ao salvar", description: e?.message ?? "Tente de novo", variant: "destructive" }),
  });
}
