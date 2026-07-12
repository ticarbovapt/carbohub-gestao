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

/** Gera um fechamento de comissão + snapshot da MEMÓRIA DE CÁLCULO (as NFs que
 *  compõem a base). Assim o fechamento fica auditável e reconciliável. */
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
      const { data: stmt, error } = await db.from("commission_statements").insert({
        vendedor_id: s.vendedor_id,
        vendedor_name: s.vendedor_name,
        period_start: s.period_start,
        period_end: s.period_end,
        base_sales: s.base_sales,
        sales_count: s.sales_count,
        rate_pct: s.rate_pct,
        amount_due,
        created_by: u?.user?.id ?? null,
      }).select("id").single();
      if (error) throw error;

      // Memória de cálculo: congela os pedidos faturados que formaram a base.
      const { data: det } = await db.rpc("crm_comissao_detalhe", {
        p_vendedor: s.vendedor_id, p_from: s.period_start, p_to: s.period_end,
      });
      const items = ((det ?? []) as any[]).map((o) => ({
        statement_id: stmt.id,
        order_id: o.order_id,
        order_number: o.order_number,
        customer_name: o.customer_name,
        total: o.total,
        sale_date: o.sale_date,
      }));
      if (items.length) await db.from("commission_statement_items").insert(items);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["commission_statements"] });
      toast.success("Comissão gerada! Confira em Pagamentos.");
    },
    onError: (e: Error) => toast.error("Erro ao gerar comissão: " + e.message),
  });
}

// ── Regras de % de comissão (por vendedor / padrão) ───────────────────────────
export interface CommissionRule {
  id: string; vendedor_id: string | null; vendedor_name: string | null; rate_pct: number; active: boolean;
}
export function useCommissionRules() {
  return useQuery({
    queryKey: ["commission_rules"],
    queryFn: async (): Promise<CommissionRule[]> => {
      const { data, error } = await db.from("commission_rules").select("*").eq("active", true);
      if (error) throw error;
      return (data ?? []) as CommissionRule[];
    },
  });
}
export function useUpsertCommissionRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (r: { vendedor_id: string | null; vendedor_name?: string | null; rate_pct: number }) => {
      const { data: u } = await supabase.auth.getUser();
      const payload = { vendedor_name: r.vendedor_name ?? null, rate_pct: r.rate_pct, active: true, updated_at: new Date().toISOString() };
      if (r.vendedor_id) {
        const { error } = await db.from("commission_rules").upsert(
          { vendedor_id: r.vendedor_id, created_by: u?.user?.id ?? null, ...payload }, { onConflict: "vendedor_id" });
        if (error) throw error;
      } else {
        // Regra PADRÃO: atualiza se já existe, senão cria (evita onConflict por expressão).
        const { data: ex } = await db.from("commission_rules").select("id").is("vendedor_id", null).maybeSingle();
        if (ex?.id) {
          const { error } = await db.from("commission_rules").update(payload).eq("id", ex.id);
          if (error) throw error;
        } else {
          const { error } = await db.from("commission_rules").insert({ vendedor_id: null, created_by: u?.user?.id ?? null, ...payload });
          if (error) throw error;
        }
      }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["commission_rules"] }); toast.success("Regra salva."); },
    onError: (e: Error) => toast.error("Erro ao salvar regra: " + e.message),
  });
}

// ── Memória de cálculo de um fechamento ───────────────────────────────────────
export interface StatementItem { id: string; order_number: string | null; customer_name: string | null; total: number; sale_date: string | null; }
export function useStatementItems(statementId: string | null) {
  return useQuery({
    queryKey: ["commission_items", statementId],
    enabled: !!statementId,
    queryFn: async (): Promise<StatementItem[]> => {
      const { data, error } = await db.from("commission_statement_items").select("*").eq("statement_id", statementId).order("sale_date", { ascending: true });
      if (error) throw error;
      return (data ?? []) as StatementItem[];
    },
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
