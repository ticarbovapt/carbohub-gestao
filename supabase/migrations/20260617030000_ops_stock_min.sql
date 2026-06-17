-- ─────────────────────────────────────────────────────────────────────────────
-- Carbo Ops — estoque mínimo (segurança) POR PRODUTO × HUB.
-- Tabela própria e limpa (mrp_products + warehouses), desacoplada da
-- sku_warehouse_policy do controle (que é por sku e usa carbo_user_roles).
-- Onde não houver linha, o app cai no mrp_products.safety_stock_qty (produto).
-- RLS aberta a autenticado por ora (restringe a gestor depois).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.ops_stock_min (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id   uuid NOT NULL REFERENCES public.mrp_products(id) ON DELETE CASCADE,
  warehouse_id uuid NOT NULL REFERENCES public.warehouses(id) ON DELETE CASCADE,
  min_qty      integer NOT NULL DEFAULT 0,
  updated_by   uuid REFERENCES auth.users(id),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_id, warehouse_id)
);

ALTER TABLE public.ops_stock_min ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ops_stock_min_all ON public.ops_stock_min;
CREATE POLICY ops_stock_min_all ON public.ops_stock_min
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);
