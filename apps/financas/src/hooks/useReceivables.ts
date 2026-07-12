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
