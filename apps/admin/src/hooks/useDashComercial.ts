// ─────────────────────────────────────────────────────────────────────────────
// Dashboard ESPELHADO — Comercial (Admin, visão de gestor "todos vendedores").
//
// Porta FIEL de apps/crm/src/pages/DashboardComercial.tsx (+ hooks useVendas /
// useMetas). Lê `carboze_orders` (schema public, mesmo schema do client do Admin)
// e agrega no cliente EXATAMENTE como o CRM. A linha de meta vem das metas REAIS
// configuradas (RPC crm_metas_resolvidas_ano), somadas por mês sobre TODOS os
// vendedores — o Admin é uma visão-gestor de todos, sem filtro de vendedor.
//
// Status: "pedido" = carboze_orders com status NOT IN ('quote','cancelled')
//   (mapeamento do CRM: quote↔orcamento, cancelled↔cancelado, demais→pedido).
// ─────────────────────────────────────────────────────────────────────────────
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const MES_ABBR = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const monthLabel = (d: Date) => `${MES_ABBR[d.getMonth()]}/${String(d.getFullYear()).slice(2)}`;
const pct = (cur: number, prev: number) => (prev > 0 ? ((cur - prev) / prev) * 100 : null);

export interface MonthRow {
  mes: string;
  faturado: number;
  pedidos: number;
  ticketMedio: number;
}

/** Ponto do Crescimento Anual — real (faturado do mês) vs meta configurada. */
export interface AnnualGrowthPoint {
  label: string;
  meta: number | null;
  real: number | null;
}

/** KPIs agregados sobre o conjunto de pedidos filtrado. */
export interface ComercialKpis {
  totalVendas: number;
  totalBRL: number;
  maiorVenda: number;
  maiorCliente: string;
  topCliente: string;
  topQtd: number;
  ticketMedio: number;
}

/** Crescimento M/M e vs Janeiro — porta FIEL do CRM (growth useMemo). */
export interface ComercialGrowth {
  mom: {
    brl: number | null; qty: number | null;
    curLabel: string; prevLabel: string;
    cur: MonthRow; prev: MonthRow;
  };
  vsJan: {
    brl: number | null; qty: number | null;
    curLabel: string; janLabel: string;
    cur: MonthRow; jan: MonthRow;
  };
}

export interface ComercialData {
  totalBRL: number;
  totalVendas: number;
  ticketMedio: number;
  maiorVenda: number;
  maiorCliente: string;
  topCliente: string;
  topQtd: number;
  monthly: MonthRow[];
  annualGrowth: AnnualGrowthPoint[];
  kpis: ComercialKpis;
  growth: ComercialGrowth;
}

interface CarbozeOrderRow {
  total: number | null;
  status: string | null;
  created_at: string | null;
  customer_name: string | null;
  vendedor_id: string | null;
  segmento: string | null;
}

export interface ComercialFilters { from?: string; to?: string; segmento?: string }

// Mapeamento de status do CRM (useVendas.toCrmStatus): quote→orcamento,
// cancelled→cancelado, demais→pedido. "pedido" ⇔ status NOT IN (quote,cancelled).
const isPedido = (s: string | null) => s !== "quote" && s !== "cancelled";

type MetaRow = { vendedor_id: string; mes: number; target_amount: number };

/** KPIs + séries mensais + crescimento anual (real vs meta), portado do CRM. */
export function useDashComercial(vendedorId: string | null = null, months = 12, filters: ComercialFilters = {}) {
  const { from, to, segmento } = filters;
  return useQuery({
    queryKey: ["dash-comercial-overview", vendedorId ?? "all", months, from ?? "", to ?? "", segmento ?? "all"],
    queryFn: async (): Promise<ComercialData> => {
      const year = new Date().getFullYear();

      // ── Pedidos (carboze_orders) — mesma base do CRM (useVendas), todos os vendedores.
      const { data: ordersData, error: ordersErr } = await supabase
        .from("carboze_orders" as never)
        .select("total, status, created_at, customer_name, vendedor_id, segmento")
        .order("created_at", { ascending: false });
      if (ordersErr) throw new Error(ordersErr.message);

      const fromTs = from ? new Date(from + "T00:00:00").getTime() : null;
      const toTs = to ? new Date(to + "T23:59:59").getTime() : null;
      const rows = (ordersData ?? []) as unknown as CarbozeOrderRow[];
      // "pedido" (status efetivo) + filtros: vendedor, período, canal.
      const pedidos = rows.filter((v) => {
        if (!isPedido(v.status)) return false;
        if (vendedorId && v.vendedor_id !== vendedorId) return false;
        if (segmento && segmento !== "all") {
          if (segmento === "none" ? v.segmento != null : v.segmento !== segmento) return false;
        }
        if (fromTs || toTs) {
          const t = new Date(v.created_at ?? "").getTime();
          if (fromTs && t < fromTs) return false;
          if (toTs && t > toTs) return false;
        }
        return true;
      });

      // ── Metas reais configuradas (RPC crm_metas_resolvidas_ano) — soma TODOS os vendedores.
      const { data: metasData, error: metasErr } = await (
        supabase as unknown as {
          rpc: (fn: string, args?: any) => Promise<{ data: any; error: any }>;
        }
      ).rpc("crm_metas_resolvidas_ano", { p_ano: year });
      if (metasErr) throw new Error(metasErr.message);
      const metasAno = ((metasData ?? []) as MetaRow[]).map((r) => ({
        vendedor_id: r.vendedor_id,
        mes: Number(r.mes),
        target_amount: Number(r.target_amount) || 0,
      }));

      // ── monthlyData — últimos 9 meses (faturado + pedidos + ticket médio). Verbatim CRM.
      const now = new Date();
      const buckets = new Map<string, { faturado: number; pedidos: number }>();
      for (const v of pedidos) {
        const d = new Date(v.created_at ?? "");
        const key = `${d.getFullYear()}-${d.getMonth()}`;
        const b = buckets.get(key) ?? { faturado: 0, pedidos: 0 };
        b.faturado += Number(v.total) || 0;
        b.pedidos += 1;
        buckets.set(key, b);
      }
      const monthly: MonthRow[] = [];
      for (let i = months - 1; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const b = buckets.get(`${d.getFullYear()}-${d.getMonth()}`) ?? { faturado: 0, pedidos: 0 };
        monthly.push({
          mes: monthLabel(d),
          faturado: b.faturado,
          pedidos: b.pedidos,
          ticketMedio: b.pedidos > 0 ? Math.round(b.faturado / b.pedidos) : 0,
        });
      }

      // ── KPIs (sobre o conjunto de pedidos). Verbatim CRM.
      const totalBRL = pedidos.reduce((s, v) => s + (Number(v.total) || 0), 0);
      const totalVendas = pedidos.length;
      let maiorVenda = 0, maiorCliente = "—";
      const byCliente = new Map<string, number>();
      for (const v of pedidos) {
        const t = Number(v.total) || 0;
        if (t > maiorVenda) { maiorVenda = t; maiorCliente = v.customer_name || "—"; }
        const c = v.customer_name || "—";
        byCliente.set(c, (byCliente.get(c) ?? 0) + 1);
      }
      let topCliente = "—", topQtd = 0;
      for (const [c, q] of byCliente) if (q > topQtd) { topQtd = q; topCliente = c; }
      const ticketMedio = totalVendas > 0 ? totalBRL / totalVendas : 0;

      // ── metaPorMes — Admin = gestor: vendedor selecionado → só a meta dele;
      //    "todos" → soma do time (TODOS os vendedores). Mirror do CRM (metaPorMes).
      const metaPorMes = new Map<number, number>();
      for (const r of metasAno) {
        if (vendedorId && r.vendedor_id !== vendedorId) continue;
        metaPorMes.set(r.mes, (metaPorMes.get(r.mes) ?? 0) + Number(r.target_amount || 0));
      }

      // ── annualGrowthData — 12 meses do ano: real (faturado do mês) vs meta configurada. Verbatim CRM.
      const annualGrowth: AnnualGrowthPoint[] = Array.from({ length: 12 }, (_, i) => {
        const d = new Date(year, i, 1);
        const label = monthLabel(d);
        const real = monthly.find((m) => m.mes === label)?.faturado ?? null;
        const meta = metaPorMes.get(i + 1) ?? 0;
        return { label, meta: meta > 0 ? meta : null, real: real && real > 0 ? real : null };
      });

      // ── growth — Crescimento M/M e vs Janeiro. Verbatim CRM (growth useMemo).
      const cur = monthly[monthly.length - 1] ?? { mes: "", faturado: 0, pedidos: 0, ticketMedio: 0 };
      const prev = monthly[monthly.length - 2] ?? { mes: "", faturado: 0, pedidos: 0, ticketMedio: 0 };
      const janLbl = monthLabel(new Date(year, 0, 1));
      const jan = monthly.find((m) => m.mes === janLbl) ?? { mes: janLbl, faturado: 0, pedidos: 0, ticketMedio: 0 };
      const growth: ComercialGrowth = {
        mom: { brl: pct(cur.faturado, prev.faturado), qty: pct(cur.pedidos, prev.pedidos), curLabel: cur.mes, prevLabel: prev.mes, cur, prev },
        vsJan: { brl: pct(cur.faturado, jan.faturado), qty: pct(cur.pedidos, jan.pedidos), curLabel: cur.mes, janLabel: jan.mes, cur, jan },
      };

      const kpis: ComercialKpis = {
        totalVendas, totalBRL, maiorVenda, maiorCliente, topCliente, topQtd, ticketMedio,
      };

      return {
        totalBRL, totalVendas, ticketMedio, maiorVenda, maiorCliente, topCliente, topQtd,
        monthly, annualGrowth, kpis, growth,
      };
    },
  });
}
