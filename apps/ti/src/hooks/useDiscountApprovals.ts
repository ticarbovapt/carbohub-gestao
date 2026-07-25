import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

// Aprovações de desconto (alçada). Fila = vendas com desconto aplicado, filtradas
// por status de aprovação. Config = faixas (% → quem aprova) + switch mestre.
// Tabelas novas não estão nos tipos gerados → cliente sem tipo.
const db = supabase as unknown as {
  from: (t: string) => any;
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: any; error: any }>;
};

export type ApprovalStatus = "auto_approved" | "pending" | "approved" | "rejected";
export type DiscountAuthority = "auto" | "gestor" | "ceo";

export interface DiscountApproval {
  id: string;
  order_number: string | null;
  customer_name: string | null;
  vendedor_name: string | null;
  subtotal: number;
  discount: number;
  discount_percent: number;
  total: number;
  discount_reason: string | null;
  discount_approval_status: ApprovalStatus;
  discount_approval_tier: DiscountAuthority | "none";
  discount_approver_id: string | null;
  discount_approver_name: string | null;   // resolvido de profiles (quem aprovou/recusou)
  discount_approver_notes: string | null;
  discount_approved_at: string | null;
  created_at: string;
  status: string; // status do pedido (quote/pending/…)
}

const SELECT =
  "id, order_number, customer_name, vendedor_name, subtotal, discount, discount_percent, total, " +
  "discount_reason, discount_approval_status, discount_approval_tier, discount_approver_id, discount_approver_notes, " +
  "discount_approved_at, created_at, status";

/** Fila de descontos (só vendas com desconto > 0). filter: 'pending'|'approved'|'rejected'|'all'. */
export function useDiscountApprovals(filter: "pending" | "approved" | "rejected" | "all" = "pending") {
  return useQuery({
    queryKey: ["discount_approvals", filter],
    refetchInterval: 30_000,
    queryFn: async (): Promise<DiscountApproval[]> => {
      let q = db.from("carboze_orders").select(SELECT).gt("discount_percent", 0);
      if (filter !== "all") q = q.eq("discount_approval_status", filter);
      const { data, error } = await q.order("created_at", { ascending: false }).limit(200);
      if (error) throw error;
      const rows = (data ?? []) as DiscountApproval[];
      // Resolve o nome de quem aprovou/recusou (quem = qual gestor decidiu).
      const ids = [...new Set(rows.map((r) => r.discount_approver_id).filter(Boolean))] as string[];
      let names: Record<string, string> = {};
      if (ids.length) {
        const prof = await db.from("profiles").select("id, full_name").in("id", ids);
        for (const p of (prof.data ?? []) as { id: string; full_name: string | null }[]) {
          names[p.id] = p.full_name ?? "—";
        }
      }
      return rows.map((r) => ({ ...r, discount_approver_name: r.discount_approver_id ? names[r.discount_approver_id] ?? "—" : null }));
    },
  });
}

/** Aprova/recusa um desconto (RPC gestor-gated no banco). */
export function useDecideDiscount() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (p: { orderId: string; decision: "approved" | "rejected"; notes?: string }) => {
      const { error } = await db.rpc("carbo_decide_discount", {
        p_order_id: p.orderId, p_decision: p.decision, p_notes: p.notes ?? null,
      });
      if (error) throw error;
    },
    onSuccess: (_d, p) => {
      qc.invalidateQueries({ queryKey: ["discount_approvals"] });
      toast({ title: p.decision === "approved" ? "Desconto aprovado" : "Desconto recusado" });
    },
    onError: (e: any) => toast({ title: "Erro", description: e?.message ?? "Tente de novo", variant: "destructive" }),
  });
}

// ── Config da alçada ──────────────────────────────────────────────────────────
export interface TierRow {
  id?: string;
  min_percent: number;
  max_percent: number | null;
  authority: DiscountAuthority;
  label: string | null;
  sort_order: number;
}

export interface AlcadaConfig {
  enabled: boolean;
  tiers: TierRow[];
}

export function useDiscountTiersAdmin() {
  return useQuery({
    queryKey: ["discount_tiers_admin"],
    queryFn: async (): Promise<AlcadaConfig> => {
      const cfg = await db.from("discount_approval_config").select("enabled").maybeSingle();
      const rows = await db
        .from("discount_approval_tiers")
        .select("id, min_percent, max_percent, authority, label, sort_order")
        .order("sort_order", { ascending: true });
      const tiers = ((rows.data ?? []) as any[]).map((t) => ({
        id: t.id,
        min_percent: Number(t.min_percent),
        max_percent: t.max_percent == null ? null : Number(t.max_percent),
        authority: t.authority as DiscountAuthority,
        label: t.label ?? null,
        sort_order: t.sort_order ?? 0,
      })) as TierRow[];
      return { enabled: Boolean(cfg.data?.enabled), tiers };
    },
  });
}

/** Salva a config: liga/desliga a alçada e reescreve as faixas. */
export function useSaveDiscountTiers() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (cfg: AlcadaConfig) => {
      const up = await db.from("discount_approval_config").update({ enabled: cfg.enabled }).eq("id", true);
      if (up.error) throw up.error;
      // Reescreve as faixas (apaga todas e insere as atuais).
      const del = await db.from("discount_approval_tiers").delete().gte("min_percent", -1);
      if (del.error) throw del.error;
      if (cfg.tiers.length) {
        const rows = cfg.tiers.map((t, i) => ({
          min_percent: t.min_percent, max_percent: t.max_percent,
          authority: t.authority, label: t.label, sort_order: i,
        }));
        const ins = await db.from("discount_approval_tiers").insert(rows);
        if (ins.error) throw ins.error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["discount_tiers_admin"] });
      qc.invalidateQueries({ queryKey: ["discount_tiers_public"] });
      toast({ title: "Configuração da alçada salva" });
    },
    onError: (e: any) => toast({ title: "Erro ao salvar", description: e?.message ?? "Tente de novo", variant: "destructive" }),
  });
}
