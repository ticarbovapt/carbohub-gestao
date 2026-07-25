// ─────────────────────────────────────────────────────────────────────────────
// Extras da Visão Geral do Comercial (Admin) — SOMENTE LEITURA.
// Mesma base do useDashComercial (carboze_orders, status "pedido"), respeitando
// o filtro de vendedor. Fornece Top Clientes e Últimos Pedidos.
// ─────────────────────────────────────────────────────────────────────────────
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const isPedido = (s: string | null) => s !== "quote" && s !== "cancelled";

interface OrderRow {
  total: number | null;
  status: string | null;
  created_at: string | null;
  customer_name: string | null;
  vendedor_id: string | null;
}

export interface TopCliente { name: string; receita: number; pedidos: number; }
export interface PedidoRecente {
  customer_name: string; vendedor_id: string | null; total: number; created_at: string | null; status: string | null;
}

export interface ComercialExtras {
  topClientes: TopCliente[];
  recentes: PedidoRecente[];
}

export function useComercialExtras(vendedorId: string | null = null) {
  return useQuery({
    queryKey: ["comercial-extras", vendedorId ?? "all"],
    queryFn: async (): Promise<ComercialExtras> => {
      const { data, error } = await supabase
        .from("carboze_orders" as never)
        .select("total, status, created_at, customer_name, vendedor_id")
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message);

      const rows = (data ?? []) as unknown as OrderRow[];
      const pedidos = rows.filter(
        (v) => isPedido(v.status) && (!vendedorId || v.vendedor_id === vendedorId)
      );

      // Top clientes por receita
      const byCliente = new Map<string, { receita: number; pedidos: number }>();
      for (const v of pedidos) {
        const name = (v.customer_name || "—").trim() || "—";
        const b = byCliente.get(name) ?? { receita: 0, pedidos: 0 };
        b.receita += Number(v.total || 0);
        b.pedidos += 1;
        byCliente.set(name, b);
      }
      const topClientes: TopCliente[] = Array.from(byCliente.entries())
        .map(([name, b]) => ({ name, ...b }))
        .sort((a, b) => b.receita - a.receita)
        .slice(0, 5);

      // Últimos pedidos (já ordenados desc por created_at)
      const recentes: PedidoRecente[] = pedidos.slice(0, 8).map((v) => ({
        customer_name: v.customer_name || "—",
        vendedor_id: v.vendedor_id,
        total: Number(v.total || 0),
        created_at: v.created_at,
        status: v.status,
      }));

      return { topClientes, recentes };
    },
  });
}
