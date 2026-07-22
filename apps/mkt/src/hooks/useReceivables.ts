import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

const db = supabase as unknown as { from: (t: string) => any; rpc: (fn: string, args?: any) => any };

export type ReceivableStatus = "programado" | "recebido" | "atrasado" | "cancelado";

export interface Receivable {
  id: string;
  source: string;               // interno | bling
  bling_numero: string | null;
  customer_name: string | null;
  order_id: string | null;
  amount: number;
  currency: string;
  due_date: string;
  status: ReceivableStatus;
  received_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export const RECEIVABLE_STATUS_LABELS: Record<ReceivableStatus, string> = {
  programado: "A receber",
  recebido: "Recebido",
  atrasado: "Atrasado",
  cancelado: "Cancelado",
};

// Recebíveis EM ABERTO (aging) — poucas linhas, opcional filtro por origem.
export function useReceivablesOpen(source?: string) {
  return useQuery({
    queryKey: ["receivables-open", source ?? "all"],
    queryFn: async () => {
      let q = db.from("receivables").select("id, amount, due_date, status, source")
        .neq("status", "recebido").neq("status", "cancelado");
      if (source && source !== "all") q = q.eq("source", source);
      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as any[];
    },
  });
}

// Lista paginada no servidor (mesmo padrão de Contas a Pagar).
export function useReceivablesPaged(params: {
  source: string; status: string; from: string; to: string; page: number; pageSize: number;
}) {
  return useQuery({
    queryKey: ["receivables-paged", params],
    queryFn: async () => {
      const today = new Date().toISOString().slice(0, 10);
      let q = db.from("receivables").select("*", { count: "exact" });
      if (params.source !== "all") q = q.eq("source", params.source);
      if (params.status === "recebido") q = q.eq("status", "recebido");
      else if (params.status === "cancelado") q = q.eq("status", "cancelado");
      else if (params.status === "atrasado") q = q.neq("status", "recebido").neq("status", "cancelado").lt("due_date", today);
      else if (params.status === "programado") q = q.neq("status", "recebido").neq("status", "cancelado").gte("due_date", today);
      if (params.from) q = q.gte("due_date", params.from);
      if (params.to) q = q.lte("due_date", params.to);
      const fromIdx = params.page * params.pageSize;
      q = q.order("due_date", { ascending: true }).range(fromIdx, fromIdx + params.pageSize - 1);
      const { data, error, count } = await q;
      if (error) throw error;
      return { rows: (data || []) as Receivable[], count: count || 0 };
    },
  });
}

function invalidate(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ["receivables-paged"] });
  qc.invalidateQueries({ queryKey: ["receivables-open"] });
  ["fin-rec-aging", "fin-cashflow", "fin-rec-customers", "fin-rec-ontime"].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
}

export function useUpdateReceivableStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status, received_at }: { id: string; status: ReceivableStatus; received_at?: string }) => {
      const { data: u } = await supabase.auth.getUser();
      const updates: any = { status, updated_at: new Date().toISOString() };
      if (status === "recebido") {
        updates.received_at = received_at ? new Date(received_at + "T12:00:00").toISOString() : new Date().toISOString();
        updates.received_by = u?.user?.id ?? null;
      } else {
        updates.received_at = null; updates.received_by = null;
      }
      const { error } = await db.from("receivables").update(updates).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { invalidate(qc); toast({ title: "Recebível atualizado" }); },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });
}

export function useCreateReceivable() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (values: Partial<Receivable>) => {
      const { data: u } = await supabase.auth.getUser();
      const { error } = await db.from("receivables").insert({
        source: "interno",
        customer_name: values.customer_name || null,
        amount: values.amount ?? 0,
        currency: values.currency || "BRL",
        due_date: values.due_date,
        status: "programado",
        notes: values.notes || null,
        order_id: values.order_id || null,
        created_by: u?.user?.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => { invalidate(qc); toast({ title: "Recebível criado" }); },
    onError: (e: any) => toast({ title: "Erro ao criar recebível", description: e.message, variant: "destructive" }),
  });
}

// ── Order-to-cash: gerar título a receber de pedido faturado ──────────────────
export interface InvoicedOrder {
  id: string; order_number: string | null; customer_name: string | null;
  total: number; sale_date: string | null; payment_terms: string | null; created_at: string;
}

/** Pedidos FATURADOS que ainda não têm título a receber vinculado (order_id). */
export function useInvoicedOrdersNoReceivable() {
  return useQuery({
    queryKey: ["invoiced-no-receivable"],
    queryFn: async (): Promise<InvoicedOrder[]> => {
      const { data: recs, error: e1 } = await db.from("receivables").select("order_id").not("order_id", "is", null);
      if (e1) throw e1;
      const linked = new Set((recs ?? []).map((r: any) => r.order_id));
      const { data: orders, error } = await db
        .from("carboze_orders_secure")
        .select("*")
        .eq("status", "invoiced")
        .order("created_at", { ascending: false })
        .limit(300);
      if (error) throw error;
      return ((orders ?? []) as any[])
        .filter((o) => !linked.has(o.id))
        .map((o) => ({ id: o.id, order_number: o.order_number ?? null, customer_name: o.customer_name ?? null, total: Number(o.total || 0), sale_date: o.sale_date ?? null, payment_terms: o.payment_terms ?? null, created_at: o.created_at }));
    },
  });
}

export function useGenerateReceivablesFromOrders() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (items: { order_id: string; customer_name: string | null; amount: number; due_date: string }[]) => {
      const { data: u } = await supabase.auth.getUser();
      const rows = items.map((i) => ({
        source: "interno", customer_name: i.customer_name, order_id: i.order_id,
        amount: i.amount, currency: "BRL", due_date: i.due_date, status: "programado", created_by: u?.user?.id ?? null,
      }));
      if (rows.length) { const { error } = await db.from("receivables").insert(rows); if (error) throw error; }
    },
    onSuccess: () => { invalidate(qc); qc.invalidateQueries({ queryKey: ["invoiced-no-receivable"] }); toast({ title: "Títulos a receber gerados" }); },
    onError: (e: any) => toast({ title: "Erro ao gerar títulos", description: e.message, variant: "destructive" }),
  });
}

// ── Dashboards ────────────────────────────────────────────────────────────────
export function useFinReceivablesAging(source: string) {
  return useQuery({
    queryKey: ["fin-rec-aging", source],
    queryFn: async () => {
      const { data, error } = await db.rpc("fin_receivables_aging", { p_source: source });
      if (error) throw error;
      return (data ?? []) as { bucket: string; qtd: number; total: number }[];
    },
  });
}

export function useFinCashflow(source: string, weeks = 8) {
  return useQuery({
    queryKey: ["fin-cashflow", source, weeks],
    queryFn: async () => {
      const { data, error } = await db.rpc("fin_cashflow_weekly", { p_source: source, p_weeks: weeks });
      if (error) throw error;
      return (data ?? []) as { semana: string; entrada: number; saida: number }[];
    },
  });
}

export function useFinTopCustomers(source: string, from?: string, to?: string, limit = 8) {
  return useQuery({
    queryKey: ["fin-rec-customers", source, from, to, limit],
    queryFn: async () => {
      const { data, error } = await db.rpc("fin_receivables_top_customers", { p_source: source, p_from: from ?? null, p_to: to ?? null, p_limit: limit });
      if (error) throw error;
      return (data ?? []) as { customer_name: string; total: number; qtd: number }[];
    },
  });
}

export function useFinReceivablesOnTime(source: string, from?: string, to?: string) {
  return useQuery({
    queryKey: ["fin-rec-ontime", source, from, to],
    queryFn: async () => {
      const { data, error } = await db.rpc("fin_receivables_on_time", { p_source: source, p_from: from ?? null, p_to: to ?? null });
      if (error) throw error;
      return ((data ?? [])[0] ?? null) as { recebidos: number; no_prazo: number; atrasados: number; pct_no_prazo: number | null } | null;
    },
  });
}
