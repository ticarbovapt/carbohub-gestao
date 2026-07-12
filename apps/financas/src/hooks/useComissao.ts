import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

// ─────────────────────────────────────────────────────────────────────────────
// Comissionamento (Carbo Finanças). Base = vendas FATURADAS (com NF) do vendedor
// no período (RPC crm_comissao_agregado). O financeiro digita o % → gera um
// fechamento (commission_statements). O pagamento (total/parcial) fica em
// commission_payments; um trigger mantém amount_paid/status do fechamento.
// ─────────────────────────────────────────────────────────────────────────────
const db = supabase as unknown as {
  from: (t: string) => any;
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: any; error: any }>;
};

export interface ComissaoAgregado {
  vendedor_id: string;
  vendedor_name: string | null;
  total: number;   // vendas faturadas no período
  qtd: number;
}

/** Total faturado por vendedor no período (base pra calcular a comissão). */
export function useComissaoAgregado(from: string, to: string, enabled = true) {
  return useQuery({
    queryKey: ["comissao_agregado", from, to],
    enabled: enabled && !!from && !!to,
    queryFn: async (): Promise<ComissaoAgregado[]> => {
      const { data, error } = await db.rpc("crm_comissao_agregado", { p_from: from, p_to: to });
      if (error) throw error;
      return ((data ?? []) as any[]).map((r) => ({
        vendedor_id: r.vendedor_id,
        vendedor_name: r.vendedor_name ?? null,
        total: Number(r.total || 0),
        qtd: Number(r.qtd || 0),
      }));
    },
  });
}

export interface CommissionStatement {
  id: string;
  vendedor_id: string;
  vendedor_name: string | null;
  period_start: string;
  period_end: string;
  base_sales: number;
  sales_count: number;
  rate_pct: number;
  amount_due: number;
  amount_paid: number;
  status: "aberto" | "parcial" | "pago";
  notes: string | null;
  created_at: string;
}

/** Fechamentos de comissão já gerados (todos, mais recentes primeiro). */
export function useCommissionStatements() {
  return useQuery({
    queryKey: ["commission_statements"],
    queryFn: async (): Promise<CommissionStatement[]> => {
      const { data, error } = await db
        .from("commission_statements")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as CommissionStatement[];
    },
  });
}

/** Gera um fechamento de comissão (o financeiro conferiu os valores e o %). */
export function useCreateStatement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (s: {
      vendedor_id: string; vendedor_name: string | null;
      period_start: string; period_end: string;
      base_sales: number; sales_count: number; rate_pct: number;
    }) => {
      const { data: u } = await supabase.auth.getUser();
      const amount_due = Math.round(s.base_sales * (s.rate_pct / 100) * 100) / 100;
      const { error } = await db.from("commission_statements").insert({
        vendedor_id: s.vendedor_id,
        vendedor_name: s.vendedor_name,
        period_start: s.period_start,
        period_end: s.period_end,
        base_sales: s.base_sales,
        sales_count: s.sales_count,
        rate_pct: s.rate_pct,
        amount_due,
        created_by: u?.user?.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["commission_statements"] });
      toast.success("Comissão gerada! Confira em Pagamentos.");
    },
    onError: (e: Error) => toast.error("Erro ao gerar comissão: " + e.message),
  });
}

export interface CommissionPayment {
  id: string;
  statement_id: string;
  amount: number;
  paid_at: string;
  method: string | null;
  notes: string | null;
}

/** Pagamentos de um fechamento (histórico). */
export function useStatementPayments(statementId: string | null) {
  return useQuery({
    queryKey: ["commission_payments", statementId],
    enabled: !!statementId,
    queryFn: async (): Promise<CommissionPayment[]> => {
      const { data, error } = await db
        .from("commission_payments")
        .select("*")
        .eq("statement_id", statementId)
        .order("paid_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as CommissionPayment[];
    },
  });
}

/** Registra um pagamento (total ou parcial) — o trigger atualiza saldo/status. */
export function useAddPayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: { statement_id: string; amount: number; method?: string; notes?: string }) => {
      const { data: u } = await supabase.auth.getUser();
      const { error } = await db.from("commission_payments").insert({
        statement_id: p.statement_id,
        amount: p.amount,
        method: p.method ?? null,
        notes: p.notes ?? null,
        paid_by: u?.user?.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["commission_statements"] });
      qc.invalidateQueries({ queryKey: ["commission_payments", vars.statement_id] });
      toast.success("Pagamento registrado!");
    },
    onError: (e: Error) => toast.error("Erro ao registrar pagamento: " + e.message),
  });
}
