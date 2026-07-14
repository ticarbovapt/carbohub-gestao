// Tela mãe (fonte de dados): as linhas cruas de carboze_orders que alimentam
// TODOS os gráficos do Dashboard Comercial. Mesma base, mesmos filtros.
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const db = supabase as unknown as { from: (t: string) => any };

export interface ComercialFonteFilters { vendedorId?: string | null; from?: string; to?: string; segmento?: string }

export interface ComercialOrderRow {
  id: string;
  order_number: string | null;
  created_at: string | null;
  customer_name: string | null;
  vendedor_name: string | null;
  vendedor_id: string | null;
  segmento: string | null;
  status: string | null;
  total: number | null;
  excluir_metricas: boolean | null;
  external_ref: string | null;
  // derivados (mesmas regras dos hooks do dashboard):
  contaPedido: boolean;   // status NOT IN (quote, cancelled) — entra nos KPIs/gráficos
  contaMetrica: boolean;  // contaPedido && excluir_metricas !== true — entra na análise por canal
}

export interface ComercialFonteData {
  rows: ComercialOrderRow[];
  totalRows: number;      // total após filtros
  totalPedidos: number;   // que contam como pedido
  totalBRL: number;       // soma dos que contam pedido
  ticketMedio: number;
  excluidos: number;      // contam pedido mas excluídos das métricas
}

const isPedido = (s: string | null) => s !== "quote" && s !== "cancelled";

export function useComercialOrders(filters: ComercialFonteFilters = {}) {
  const { vendedorId, from, to, segmento } = filters;
  return useQuery({
    queryKey: ["comercial-fonte", vendedorId ?? "all", from ?? "", to ?? "", segmento ?? "all"],
    queryFn: async (): Promise<ComercialFonteData> => {
      const { data, error } = await db
        .from("carboze_orders")
        .select("id, order_number, created_at, customer_name, vendedor_name, vendedor_id, segmento, status, total, excluir_metricas, external_ref")
        .order("created_at", { ascending: false })
        .limit(5000);
      if (error) throw error;

      const fromTs = from ? new Date(from + "T00:00:00").getTime() : null;
      const toTs = to ? new Date(to + "T23:59:59").getTime() : null;

      const rows: ComercialOrderRow[] = ((data ?? []) as any[])
        .filter((o) => {
          if (vendedorId && o.vendedor_id !== vendedorId) return false;
          if (segmento && segmento !== "all") {
            if (segmento === "none" ? o.segmento != null : o.segmento !== segmento) return false;
          }
          if (fromTs || toTs) {
            const t = new Date(o.created_at ?? "").getTime();
            if (fromTs && t < fromTs) return false;
            if (toTs && t > toTs) return false;
          }
          return true;
        })
        .map((o) => {
          const contaPedido = isPedido(o.status);
          return {
            ...o,
            total: Number(o.total) || 0,
            contaPedido,
            contaMetrica: contaPedido && o.excluir_metricas !== true,
          } as ComercialOrderRow;
        });

      const pedidos = rows.filter((r) => r.contaPedido);
      const totalBRL = pedidos.reduce((s, r) => s + (r.total || 0), 0);
      return {
        rows,
        totalRows: rows.length,
        totalPedidos: pedidos.length,
        totalBRL,
        ticketMedio: pedidos.length ? totalBRL / pedidos.length : 0,
        excluidos: pedidos.filter((r) => !r.contaMetrica).length,
      };
    },
  });
}
