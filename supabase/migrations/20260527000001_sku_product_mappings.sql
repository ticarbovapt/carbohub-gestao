-- Tabela de mapeamento: SKU da plataforma → produto do estoque + fator de dedução
CREATE TABLE sku_product_mappings (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  platform        text,       -- 'mercadolivre' | 'amazon' | 'lp' | NULL = todas as plataformas
  platform_sku    text        NOT NULL,
  product_id      uuid        NOT NULL REFERENCES mrp_products(id) ON DELETE CASCADE,
  units_per_kit   numeric     NOT NULL DEFAULT 1 CHECK (units_per_kit > 0),
  description     text,       -- ex: "Kit 10 sachês 10ml"
  is_active       boolean     NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT NOW(),
  updated_at      timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sku_mappings_sku_platform ON sku_product_mappings (platform_sku, platform);

ALTER TABLE sku_product_mappings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth users manage sku mappings"
  ON sku_product_mappings FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- Substitui o trigger anterior para usar a tabela de mapeamento
CREATE OR REPLACE FUNCTION handle_ecommerce_order_sp_stock()
RETURNS TRIGGER AS $$
DECLARE
  v_product_id    uuid;
  v_units_per_kit numeric;
  v_warehouse_id  uuid;
  v_ws_id         uuid;
  v_current_qty   numeric;
  v_deduct_qty    numeric;
BEGIN
  IF NEW.product_sku IS NULL OR COALESCE(NEW.quantity, 0) = 0 THEN
    RETURN NEW;
  END IF;

  -- Busca mapeamento: prioriza o específico da plataforma, cai para genérico (platform IS NULL)
  SELECT sm.product_id, sm.units_per_kit
    INTO v_product_id, v_units_per_kit
  FROM sku_product_mappings sm
  WHERE sm.platform_sku = NEW.product_sku
    AND sm.is_active = true
    AND (sm.platform = NEW.platform OR sm.platform IS NULL)
  ORDER BY (sm.platform = NEW.platform) DESC NULLS LAST
  LIMIT 1;

  IF v_product_id IS NULL THEN RETURN NEW; END IF;

  v_deduct_qty := NEW.quantity * v_units_per_kit;

  -- Warehouse HUB-SP
  SELECT id INTO v_warehouse_id FROM warehouses WHERE code = 'HUB-SP' AND is_active = true LIMIT 1;
  IF v_warehouse_id IS NULL THEN RETURN NEW; END IF;

  SELECT id, quantity INTO v_ws_id, v_current_qty
  FROM warehouse_stock
  WHERE warehouse_id = v_warehouse_id AND product_id = v_product_id;

  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'cancelled' AND v_ws_id IS NOT NULL THEN
      UPDATE warehouse_stock
        SET quantity = GREATEST(0, v_current_qty - v_deduct_qty), updated_at = NOW()
      WHERE id = v_ws_id;
    END IF;

  ELSIF TG_OP = 'UPDATE' THEN
    -- Ativa → cancelada: estorna
    IF OLD.status <> 'cancelled' AND NEW.status = 'cancelled' AND v_ws_id IS NOT NULL THEN
      UPDATE warehouse_stock
        SET quantity = v_current_qty + v_deduct_qty, updated_at = NOW()
      WHERE id = v_ws_id;

    -- Cancelada → ativa: deduz novamente
    ELSIF OLD.status = 'cancelled' AND NEW.status <> 'cancelled' AND v_ws_id IS NOT NULL THEN
      UPDATE warehouse_stock
        SET quantity = GREATEST(0, v_current_qty - v_deduct_qty), updated_at = NOW()
      WHERE id = v_ws_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS ecommerce_order_sp_stock_trigger ON ecommerce_orders;
CREATE TRIGGER ecommerce_order_sp_stock_trigger
AFTER INSERT OR UPDATE OF status ON ecommerce_orders
FOR EACH ROW EXECUTE FUNCTION handle_ecommerce_order_sp_stock();
