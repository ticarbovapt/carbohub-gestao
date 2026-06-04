import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Dados REAIS para os dashboards de Gestor e Operador.
 * Substitui os números hardcoded que existiam nos componentes — agora tudo
 * vem do Supabase (carboze_orders, service_orders, production_orders,
 * rc_requests, purchase_orders/payables, bling_nfe).
 */

function monthStartISO() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
}

export interface GestorMetrics {
  vendasMes: number;
  faturamentoMes: number;
  aguardandoNF: number;
  osAbertas: number;
  rcPendentes: number;
  aPagar: number;
  pagamentosAtrasados: number;
  ocAbertas: number;
  totalComprometido: number;
}

export function useGestorDashboard() {
  return useQuery<GestorMetrics>({
    queryKey: ["gestor-dashboard-metrics"],
    queryFn: async () => {
      const start = monthStartISO();
      const todayStr = new Date().toISOString().split("T")[0];

      const [ordersRes, osRes, rcRes, payRes, ocRes] = await Promise.all([
        supabase.from("carboze_orders").select("total, status, bling_nf_id, created_at").gte("created_at", start),
        supabase.from("service_orders").select("id", { count: "exact", head: true }).in("status", ["active", "draft"]),
        supabase.from("rc_requests").select("status"),
        supabase.from("purchase_payables").select("status, amount, due_date"),
        supabase.from("purchase_orders").select("status, total_value"),
      ]);

      const orders = (ordersRes.data || []) as any[];
      const vendas = orders.filter((o) => o.status !== "cancelled" && o.status !== "quote");
      const payables = (payRes.data || []) as any[];
      const ocs = (ocRes.data || []) as any[];
      const rcs = (rcRes.data || []) as any[];

      return {
        vendasMes: vendas.length,
        faturamentoMes: vendas.reduce((s, o) => s + (Number(o.total) || 0), 0),
        aguardandoNF: orders.filter(
          (o) => ["confirmed", "invoiced", "shipped", "delivered"].includes(o.status) && o.bling_nf_id == null,
        ).length,
        osAbertas: osRes.count || 0,
        rcPendentes: rcs.filter((r) => r.status === "aguardando_aprovacao").length,
        aPagar: payables.filter((p) => p.status === "programado").reduce((s, p) => s + (Number(p.amount) || 0), 0),
        pagamentosAtrasados: payables.filter((p) => p.status === "programado" && p.due_date < todayStr).length,
        ocAbertas: ocs.filter((o) => ["gerada", "enviada_fornecedor"].includes(o.status)).length,
        totalComprometido: ocs.filter((o) => o.status !== "cancelada").reduce((s, o) => s + (Number(o.total_value) || 0), 0),
      };
    },
  });
}

export interface OperadorMetrics {
  osAbertas: number;
  osConcluidasHoje: number;
  opEmProducao: number;
  aFaturar: number;
  nfsSemVinculo: number;
  nfsVinculadas: number;
  recentOs: { id: string; label: string; status: string }[];
}

export function useOperadorDashboard() {
  return useQuery<OperadorMetrics>({
    queryKey: ["operador-dashboard-metrics"],
    queryFn: async () => {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const todayISO = todayStart.toISOString();

      const [osOpenRes, osTodayRes, opRes, aFaturarRes, nfRes, recentOsRes] = await Promise.all([
        supabase.from("service_orders").select("id", { count: "exact", head: true }).in("status", ["active", "draft"]),
        supabase.from("service_orders").select("id", { count: "exact", head: true }).eq("status", "completed").gte("updated_at", todayISO),
        supabase.from("production_orders").select("op_status"),
        supabase.from("carboze_orders").select("id", { count: "exact", head: true }).in("status", ["confirmed", "invoiced", "shipped", "delivered"]).is("bling_nf_id", null),
        supabase.from("bling_nfe").select("match_status"),
        supabase.from("service_orders").select("id, title, os_number, status").in("status", ["active", "draft"]).order("created_at", { ascending: false }).limit(6),
      ]);

      const ops = (opRes.data || []) as any[];
      const nfs = (nfRes.data || []) as any[];

      return {
        osAbertas: osOpenRes.count || 0,
        osConcluidasHoje: osTodayRes.count || 0,
        opEmProducao: ops.filter((o) => ["liberada_producao", "em_producao"].includes(o.op_status)).length,
        aFaturar: aFaturarRes.count || 0,
        nfsSemVinculo: nfs.filter((n) => ["no_code", "invalid_code"].includes(n.match_status)).length,
        nfsVinculadas: nfs.filter((n) => ["matched", "manual"].includes(n.match_status)).length,
        recentOs: (recentOsRes.data || []).map((o: any) => ({
          id: o.id,
          label: o.os_number || o.title || "OS",
          status: o.status,
        })),
      };
    },
  });
}
