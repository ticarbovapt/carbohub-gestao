// ─────────────────────────────────────────────────────────────────────────────
// Dashboard ESPELHADO (Fase 1 / KPI-level) — Comercial.
//
// Espelha o essencial de src/pages/dashboards/DashboardComercial.tsx do controle:
// lê `carboze_orders` (schema public, mesmo schema do client do Admin) e agrega
// no cliente. Sem filtros/vendedor/metas — só os números-chave + faturamento/mês.
//
// Fonte: public.carboze_orders
//   colunas: total, status, created_at, segmento, customer_name, excluir_metricas
//   segmento ∈ {consumo, revenda, online, null} · cancelado ∈ {cancelled, cancelado}
// ─────────────────────────────────────────────────────────────────────────────
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface CarbozeOrderRow {
  total: number | null;
  status: string | null;
  created_at: string | null;
  segmento: "consumo" | "revenda" | "online" | null;
}

export interface ComercialSegment {
  qtd: number;
  brl: number;
}
export interface ComercialData {
  totalBRL: number;
  totalVendas: number;
  ticketMedio: number;
  segmentos: {
    consumo: ComercialSegment;
    revenda: ComercialSegment;
    online: ComercialSegment;
    naoClassificado: ComercialSegment;
  };
  monthly: { key: string; faturado: number; pedidos: number }[];
}

const isCancelled = (s: string | null) => s === "cancelled" || s === "cancelado";

/** KPIs + segmentação + faturamento mensal dos últimos N meses (via carboze_orders). */
export function useDashComercial(months = 12) {
  return useQuery({
    queryKey: ["dash-comercial-overview", months],
    queryFn: async (): Promise<ComercialData> => {
      const now = new Date();
      const from = new Date(now.getFullYear(), now.getMonth() - (months - 1), 1);

      const { data, error } = await supabase
        .from("carboze_orders" as never)
        .select("total, status, created_at, segmento")
        .neq("excluir_metricas", true)
        .gte("created_at", from.toISOString())
        .order("created_at", { ascending: true });
      if (error) throw new Error(error.message);

      const rows = (data ?? []) as CarbozeOrderRow[];
      const active = rows.filter((o) => !isCancelled(o.status));

      const totalVendas = active.length;
      const totalBRL = active.reduce((s, o) => s + Number(o.total ?? 0), 0);
      const ticketMedio = totalVendas > 0 ? totalBRL / totalVendas : 0;

      const seg = {
        consumo: { qtd: 0, brl: 0 },
        revenda: { qtd: 0, brl: 0 },
        online: { qtd: 0, brl: 0 },
        naoClassificado: { qtd: 0, brl: 0 },
      };
      const monthMap: Record<string, { faturado: number; pedidos: number }> = {};

      for (const o of active) {
        const v = Number(o.total ?? 0);
        const bucket =
          o.segmento === "consumo" ? seg.consumo
          : o.segmento === "revenda" ? seg.revenda
          : o.segmento === "online" ? seg.online
          : seg.naoClassificado;
        bucket.qtd++;
        bucket.brl += v;

        if (o.created_at) {
          const key = o.created_at.slice(0, 7); // YYYY-MM
          (monthMap[key] ??= { faturado: 0, pedidos: 0 }).faturado += v;
          monthMap[key].pedidos++;
        }
      }

      const monthly = Object.entries(monthMap)
        .sort(([a], [b]) => a.localeCompare(b))
        .slice(-months)
        .map(([key, v]) => ({ key, ...v }));

      return { totalBRL, totalVendas, ticketMedio, segmentos: seg, monthly };
    },
  });
}
