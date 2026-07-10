import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// ─────────────────────────────────────────────────────────────────────────────
// Catálogo MRP (Carbo Ops) — LEITURA do banco compartilhado do ecossistema.
//  • Produtos = mrp_products (mesma tabela do "controle"; nada é recadastrado).
//  • Estoque por hub = warehouse_stock ⋈ warehouses (fonte de verdade; nunca usar
//    mrp_products.current_stock_qty como fallback de exibição — ver CLAUDE.md).
//  RLS: mrp_products libera SELECT p/ admin/CEO/gestor; warehouse_stock p/ qualquer
//  autenticado. Se a lista vier vazia p/ um perfil, é trava de RLS em mrp_products.
// ─────────────────────────────────────────────────────────────────────────────

const db = supabase as unknown as { from: (t: string) => any };

export interface HubStock {
  warehouse_name: string;
  quantity: number;
}

export interface MrpProduct {
  id: string;
  name: string;
  product_code: string;
  category: string;
  current_stock_qty: number;
  safety_stock_qty: number;   // legado (global) — NÃO usar p/ produção
  min_rn: number;             // estoque mínimo do HUB-RN (ops_stock_min) — fonte p/ produção
  stock_unit: string;
  notes: string | null;
  hubs: HubStock[];
  has_bom: boolean;   // tem ficha (mrp_bom) cadastrada — relevante p/ Produto Final
}

export function useMrpProducts() {
  return useQuery({
    queryKey: ["ops", "mrp-products"],
    queryFn: async (): Promise<MrpProduct[]> => {
      const [products, stock, bom, mins] = await Promise.all([
        db
          .from("mrp_products")
          .select("id, name, product_code, category, current_stock_qty, safety_stock_qty, stock_unit, notes")
          .eq("is_active", true)
          .order("product_code"),
        db
          .from("warehouse_stock")
          .select("product_id, quantity, warehouse:warehouses(code, name, is_active)"),
        db.from("mrp_bom").select("product_id"),
        // mínimo por hub — só interessa o HUB-RN (Natal) p/ produção.
        db.from("ops_stock_min").select("product_id, min_qty, warehouse:warehouses(code)"),
      ]);

      if (products.error) throw products.error;
      if (stock.error) throw stock.error;
      if (bom.error) throw bom.error;
      if (mins.error) throw mins.error;

      const withBom = new Set<string>((bom.data ?? []).map((b: { product_id: string }) => b.product_id));

      const minRnByProduct = new Map<string, number>();
      for (const row of mins.data ?? []) {
        if (row.warehouse?.code === "HUB-RN") minRnByProduct.set(row.product_id, Number(row.min_qty) || 0);
      }

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
        current_stock_qty: Number(p.current_stock_qty) || 0,
        safety_stock_qty: Number(p.safety_stock_qty) || 0,
        min_rn: minRnByProduct.get(p.id as string) ?? 0,
        stock_unit: (p.stock_unit as string) ?? "un",
        notes: (p.notes as string) ?? null,
        hubs: byProduct.get(p.id as string) ?? [],
        has_bom: withBom.has(p.id as string),
      }));
    },
  });
}
