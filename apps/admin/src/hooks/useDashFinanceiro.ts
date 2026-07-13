// ─────────────────────────────────────────────────────────────────────────────
// Dashboard ESPELHADO (Fase 1 / KPI-level) — Financeiro (Compras).
//
// Espelha o essencial de src/components/purchasing/PurchasingDashboard.tsx +
// src/hooks/usePurchasing.ts (usePurchasingKPIs) do controle.
//
// Fontes (schema public):
//   purchase_payables → id, status ("programado"/"pago"), amount, due_date, supplier_name
//   purchase_orders   → id, status, total_value, supplier_name
//   purchase_requests → id, status ("aguardando_aprovacao")
// OC aberta = status ∈ {gerada, enviada_fornecedor}. Conta atrasada = programado & vencida.
// ─────────────────────────────────────────────────────────────────────────────
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface PayableRow { status: string | null; amount: number | null; due_date: string | null; }
interface OrderRow { status: string | null; total_value: number | null; supplier_name: string | null; }
interface RequestRow { status: string | null; }

export interface FinanceiroData {
  totalAPagar: number;
  contasAtrasadas: number;
  ocAbertas: number;
  rcPendentes: number;
  fornecedores: { supplier: string; total: number }[]; // top-8 por valor comprometido
}

export function useDashFinanceiro() {
  return useQuery({
    queryKey: ["dash-financeiro-overview"],
    queryFn: async (): Promise<FinanceiroData> => {
      const [payRes, ordRes, reqRes] = await Promise.all([
        supabase.from("purchase_payables" as never).select("status, amount, due_date"),
        supabase.from("purchase_orders" as never).select("status, total_value, supplier_name"),
        supabase.from("purchase_requests" as never).select("status"),
      ]);
      if (payRes.error) throw new Error(payRes.error.message);
      if (ordRes.error) throw new Error(ordRes.error.message);
      if (reqRes.error) throw new Error(reqRes.error.message);

      const payables = (payRes.data ?? []) as PayableRow[];
      const orders = (ordRes.data ?? []) as OrderRow[];
      const requests = (reqRes.data ?? []) as RequestRow[];

      const today = new Date().toISOString().slice(0, 10);

      const totalAPagar = payables
        .filter((p) => p.status === "programado")
        .reduce((s, p) => s + Number(p.amount ?? 0), 0);
      const contasAtrasadas = payables
        .filter((p) => p.status === "programado" && (p.due_date ?? "") < today).length;
      const ocAbertas = orders
        .filter((o) => o.status === "gerada" || o.status === "enviada_fornecedor").length;
      const rcPendentes = requests
        .filter((r) => r.status === "aguardando_aprovacao").length;

      // Custo comprometido por fornecedor (exclui OC canceladas) — top 8.
      const bySupplier = new Map<string, number>();
      for (const o of orders) {
        if (o.status === "cancelada") continue;
        const name = (o.supplier_name || "").trim() || "—";
        bySupplier.set(name, (bySupplier.get(name) ?? 0) + Number(o.total_value ?? 0));
      }
      const fornecedores = Array.from(bySupplier.entries())
        .map(([supplier, total]) => ({ supplier, total }))
        .filter((f) => f.total > 0)
        .sort((a, b) => b.total - a.total)
        .slice(0, 8);

      return { totalAPagar, contasAtrasadas, ocAbertas, rcPendentes, fornecedores };
    },
  });
}
