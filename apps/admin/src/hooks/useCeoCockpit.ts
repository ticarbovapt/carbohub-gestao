// ─────────────────────────────────────────────────────────────────────────────
// Cockpit Estratégico — blocos espelhados do CeoDashboard do carbohub-controle
// (src/components/dashboard/CeoDashboard.tsx). SOMENTE LEITURA.
// Fontes (schema public, banco compartilhado):
//   carboze_orders_secure (fallback carboze_orders) → vendas
//   service_orders   → OP por departamento, gargalos, conquistas
//   machines         → gargalos (has_active_alert) e ruptura
//   licensees        → conquistas (novos no mês)
//   licensee_gamification → ranking de parceiros
//   machine_consumption_history → consumo p/ previsão de ruptura
// ─────────────────────────────────────────────────────────────────────────────
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// Tabelas fora dos tipos gerados do Admin → cliente "solto".
const db = supabase as unknown as {
  from: (t: string) => any;
  auth: typeof supabase.auth;
};

export type SalesPeriod = "semanas" | "meses" | "periodo";

// Lê de carboze_orders_secure; se a view não existir/negar, cai p/ carboze_orders.
async function fetchOrders(cols: string, apply: (q: any) => any) {
  let res = await apply(db.from("carboze_orders_secure").select(cols));
  if (res.error) res = await apply(db.from("carboze_orders").select(cols));
  return res.error ? [] : (res.data ?? []);
}

/** Performance de Vendas — agrupado por semana (8 sem), mês (6m) ou período. */
export function useCeoSales(period: SalesPeriod, from: string, to: string) {
  return useQuery({
    queryKey: ["admin-ceo-sales", period, from, to],
    queryFn: async () => {
      const now = new Date();
      let start: Date;
      if (period === "semanas") { start = new Date(now); start.setDate(now.getDate() - 56); }
      else if (period === "meses") { start = new Date(now.getFullYear(), now.getMonth() - 5, 1); }
      else { start = from ? new Date(from + "T00:00:00") : (() => { const d = new Date(now); d.setDate(now.getDate() - 30); return d; })(); }

      const rows = await fetchOrders("total, created_at", (q: any) => {
        let query = q.gte("created_at", start.toISOString()).order("created_at", { ascending: true });
        if (period === "periodo" && to) query = query.lte("created_at", to + "T23:59:59");
        return query;
      });

      const grouped: Record<string, { vendas: number; receita: number }> = {};
      for (const order of rows as { total: number | null; created_at: string }[]) {
        const date = new Date(order.created_at);
        let key: string;
        if (period === "meses") {
          key = date.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" });
        } else {
          const weekStart = new Date(date);
          weekStart.setDate(date.getDate() - date.getDay());
          key = weekStart.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
        }
        (grouped[key] ??= { vendas: 0, receita: 0 }).vendas++;
        grouped[key].receita += Number(order.total || 0);
      }
      return Object.entries(grouped).map(([name, v]) => ({ name, ...v }));
    },
  });
}

/** OP por Departamento (pizza) — service_orders ativas/draft. */
export function useOsByDepartment() {
  return useQuery({
    queryKey: ["admin-ceo-os-by-department"],
    queryFn: async () => {
      const { data, error } = await db.from("service_orders")
        .select("current_department").in("status", ["active", "draft"]);
      if (error) throw error;
      const counts: Record<string, number> = {};
      for (const os of (data ?? []) as { current_department: string | null }[]) {
        const dept = os.current_department || "outros";
        counts[dept] = (counts[dept] || 0) + 1;
      }
      const deptNames: Record<string, string> = {
        venda: "Vendas", preparacao: "Preparação", expedicao: "Expedição",
        operacao: "Operação", pos_venda: "Pós-Venda", administrativo: "Administrativo",
      };
      return Object.entries(counts).map(([key, value]) => ({ name: deptNames[key] || key, value }));
    },
  });
}

export interface CockpitAlert { title: string; description: string; severity: "high" | "medium" | "low"; }

/** Gargalos Identificados — SLA vencido, estoque baixo (máquinas), faturamento pendente. */
export function useCeoAlerts() {
  return useQuery({
    queryKey: ["admin-ceo-alerts"],
    queryFn: async (): Promise<CockpitAlert[]> => {
      const list: CockpitAlert[] = [];

      const { data: overdueOS } = await db.from("service_orders")
        .select("id").eq("status", "active").lt("sla_deadline", new Date().toISOString());
      if (overdueOS && overdueOS.length > 0)
        list.push({ title: "OP com SLA vencido", description: `${overdueOS.length} OP com prazo ultrapassado`, severity: "high" });

      const { data: lowStock } = await db.from("machines").select("id").eq("has_active_alert", true);
      if (lowStock && lowStock.length > 0)
        list.push({ title: "Estoque baixo", description: `${lowStock.length} máquinas com alerta de reposição`, severity: "medium" });

      const pending = await fetchOrders("id", (q: any) => q.eq("status", "confirmed").is("invoice_number", null));
      if (pending && pending.length > 0)
        list.push({ title: "Faturamento pendente", description: `${pending.length} pedidos aguardando NF`, severity: "low" });

      return list.length > 0 ? list : [{ title: "Sistema operando normalmente", description: "Nenhum gargalo identificado", severity: "low" }];
    },
  });
}

export interface CockpitAchievement { title: string; description: string; }

/** Conquistas Recentes — OP concluídas no mês, novos licenciados. */
export function useCeoAchievements() {
  return useQuery({
    queryKey: ["admin-ceo-achievements"],
    queryFn: async (): Promise<CockpitAchievement[]> => {
      const list: CockpitAchievement[] = [];
      const startOfMonth = new Date(new Date().setDate(1)).toISOString();

      const { data: completedOS } = await db.from("service_orders")
        .select("id").eq("status", "completed").gte("updated_at", startOfMonth);
      if (completedOS && completedOS.length > 0)
        list.push({ title: "OP concluídas no mês", description: `${completedOS.length} ordens finalizadas` });

      const { data: newLic } = await db.from("licensees").select("id").gte("created_at", startOfMonth);
      if (newLic && newLic.length > 0)
        list.push({ title: "Novos licenciados", description: `${newLic.length} licenciados cadastrados` });

      return list.length > 0 ? list : [{ title: "Metas em andamento", description: "Acompanhe o progresso das operações" }];
    },
  });
}

/** Ranking de Parceiros — top 5 por gamificação. */
export function usePartnerRanking() {
  return useQuery({
    queryKey: ["admin-ceo-partner-ranking"],
    queryFn: async () => {
      const { data } = await db.from("licensee_gamification")
        .select("licensee_id, total_score, level, total_orders, licensees:licensee_id(name, code)")
        .order("total_score", { ascending: false }).limit(5);
      return (data ?? []) as any[];
    },
  });
}

/** Dados de máquinas + consumo p/ a previsão de ruptura (StockRuptureAlert). */
export function useRuptureData() {
  const machines = useQuery({
    queryKey: ["admin-ceo-machines-rupture"],
    queryFn: async () => {
      const { data } = await db.from("machines")
        .select("id, machine_id, model, status, capacity, units_since_last_refill, licensees:licensee_id(name)")
        .eq("status", "operational");
      return (data ?? []) as any[];
    },
  });
  const consumption = useQuery({
    queryKey: ["admin-ceo-consumption-history"],
    queryFn: async () => {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const { data } = await db.from("machine_consumption_history")
        .select("machine_id, units_dispensed").gte("date", thirtyDaysAgo.toISOString().split("T")[0]);
      return (data ?? []) as any[];
    },
  });
  return { machines: machines.data ?? [], consumptionHistory: consumption.data ?? [] };
}
