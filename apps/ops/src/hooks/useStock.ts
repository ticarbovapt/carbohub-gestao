import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { ProdEstoque } from "@/components/estoque/stockData";

// ─────────────────────────────────────────────────────────────────────────────
// Estoque por hub (Carbo Ops) — LEITURA do banco compartilhado.
//  • Produtos = mrp_products (ativos).
//  • Saldo por hub = warehouse_stock ⋈ warehouses (fonte de verdade).
//  • Status do card = estoque mínimo (safety_stock_qty); sem giro/cobertura.
//  RLS: warehouse_stock/warehouses liberam SELECT p/ autenticado; mrp_products
//  p/ admin/CEO/gestor.
// ─────────────────────────────────────────────────────────────────────────────

const db = supabase as unknown as { from: (t: string) => any };

// código do warehouse (banco) → id do hub usado na UI (stockData.HUBS)
const CODE_TO_HUB: Record<string, string> = {
  "HUB-RN": "rn",
  "HUB-SP": "sp",
  "HUB-SP-VENDAS": "spv",
  "CD-BLING": "bling",
  "HUB-BLING": "bling",
};

export function useStock() {
  return useQuery({
    queryKey: ["ops", "stock"],
    queryFn: async (): Promise<ProdEstoque[]> => {
      const [products, stock, mins] = await Promise.all([
        db
          .from("mrp_products")
          .select("id, product_code, name, category, stock_unit, safety_stock_qty")
          .eq("is_active", true)
          .order("product_code"),
        db.from("warehouse_stock").select("product_id, quantity, warehouse:warehouses(code)"),
        db.from("ops_stock_min").select("product_id, min_qty, warehouse:warehouses(code)"),
      ]);

      if (products.error) throw products.error;
      if (stock.error) throw stock.error;
      if (mins.error) throw mins.error;

      // product_id → { hubId: quantidade }
      const hubsByProduct = new Map<string, Record<string, number>>();
      for (const row of stock.data ?? []) {
        const code = row.warehouse?.code as string | undefined;
        const hubId = code ? CODE_TO_HUB[code] : undefined;
        if (!hubId) continue;
        const rec = hubsByProduct.get(row.product_id) ?? {};
        rec[hubId] = (rec[hubId] ?? 0) + (Number(row.quantity) || 0);
        hubsByProduct.set(row.product_id, rec);
      }

      // product_id → { hubId: mínimo (override) }
      const minsByProduct = new Map<string, Record<string, number>>();
      for (const row of mins.data ?? []) {
        const code = row.warehouse?.code as string | undefined;
        const hubId = code ? CODE_TO_HUB[code] : undefined;
        if (!hubId) continue;
        const rec = minsByProduct.get(row.product_id) ?? {};
        rec[hubId] = Number(row.min_qty) || 0;
        minsByProduct.set(row.product_id, rec);
      }

      return (products.data ?? []).map((p: Record<string, unknown>) => ({
        id: p.id as string,
        product_code: (p.product_code as string) ?? "",
        name: (p.name as string) ?? "",
        category: (p.category as string) ?? "Outro",
        stock_unit: (p.stock_unit as string) ?? "un",
        safety_stock_qty: Number(p.safety_stock_qty) || 0,
        hubs: hubsByProduct.get(p.id as string) ?? {},
        mins: minsByProduct.get(p.id as string) ?? {},
      }));
    },
  });
}
