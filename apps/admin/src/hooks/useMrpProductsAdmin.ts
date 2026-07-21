import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// ─────────────────────────────────────────────────────────────────────────────
// Catálogo MRP (Carbo Ops) — cópia própria do Admin, SOMENTE LEITURA.
//  • Produtos = mrp_products (mesma tabela do "controle"/Ops; nada é recadastrado
//    aqui — este app não tem mutations para esta tela, é monitoramento/gestão).
//  • Estoque por hub = warehouse_stock ⋈ warehouses (fonte de verdade; nunca usar
//    mrp_products.current_stock_qty como fallback de exibição — ver CLAUDE.md).
//  RLS: mrp_products e warehouse_stock já são legíveis por qualquer autenticado.
//  Cada app é autossuficiente (CLAUDE.md) — por isso este hook não importa de
//  apps/ops, mesmo repetindo a lógica.
// ─────────────────────────────────────────────────────────────────────────────

const db = supabase as unknown as { from: (t: string) => any };

export interface HubStock {
  warehouse_name: string;
  quantity: number;
}

export interface MrpProductAdmin {
  id: string;
  name: string;
  product_code: string;
  category: string;
  safety_stock_qty: number;
  stock_unit: string;
  unit_cost: number;   // custo unitário (R$) — base do valor mobilizado em estoque
  notes: string | null;
  hubs: HubStock[];
}

export function useMrpProductsAdmin() {
  return useQuery({
    queryKey: ["admin", "mrp-products-readonly"],
    queryFn: async (): Promise<MrpProductAdmin[]> => {
      const [products, stock] = await Promise.all([
        db
          .from("mrp_products")
          .select("id, name, product_code, category, safety_stock_qty, stock_unit, unit_cost, notes")
          .eq("is_active", true)
          .order("product_code"),
        db
          .from("warehouse_stock")
          .select("product_id, quantity, warehouse:warehouses(code, name, is_active)"),
      ]);

      if (products.error) throw products.error;
      if (stock.error) throw stock.error;

      // Estoque por produto → lista de hubs (ignora hubs inativos).
      const byProduct = new Map<string, HubStock[]>();
      for (const row of stock.data ?? []) {
        const wh = row.warehouse;
        if (wh?.is_active === false) continue;
        const arr = byProduct.get(row.product_id) ?? [];
        arr.push({ warehouse_name: wh?.code ?? wh?.name ?? "—", quantity: Number(row.quantity) || 0 });
        byProduct.set(row.product_id, arr);
      }

      return (products.data ?? []).map((p: Record<string, unknown>) => ({
        id: p.id as string,
        name: (p.name as string) ?? "",
        product_code: (p.product_code as string) ?? "",
        category: (p.category as string) ?? "Outro",
        safety_stock_qty: Number(p.safety_stock_qty) || 0,
        stock_unit: (p.stock_unit as string) ?? "un",
        unit_cost: Number(p.unit_cost) || 0,
        notes: (p.notes as string) ?? null,
        hubs: byProduct.get(p.id as string) ?? [],
      }));
    },
  });
}
