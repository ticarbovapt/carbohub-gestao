-- Atualiza o trigger para ter fallback por product_code do mrp_products.
-- Ordem de resolução:
--   1. sku_product_mappings com platform específica
--   2. sku_product_mappings genérica (platform IS NULL)
--   3. product_code direto no mrp_products (units_per_kit = 1, automático sem configuração)

CREATE OR REPLACE FUNCTION handle_ecommerce_order_sp_stock()
RETURNS TRIGGER AS $$
DECLARE
  v_product_id    uuid;
  v_units_per_kit numeric := 1;
  v_warehouse_id  uuid;
  v_ws_id         uuid;
  v_current_qty   numeric;
  v_deduct_qty    numeric;
BEGIN
  IF NEW.product_sku IS NULL OR COALESCE(NEW.quantity, 0) = 0 THEN
    RETURN NEW;
  END IF;

  -- 1. Busca mapeamento explícito (plataforma específica > genérico)
  SELECT sm.product_id, sm.units_per_kit
    INTO v_product_id, v_units_per_kit
  FROM sku_product_mappings sm
  WHERE sm.platform_sku = NEW.product_sku
    AND sm.is_active = true
    AND (sm.platform = NEW.platform OR sm.platform IS NULL)
  ORDER BY (sm.platform = NEW.platform) DESC NULLS LAST
  LIMIT 1;

  -- 2. Fallback: product_code direto (sem necessidade de configuração se o SKU bater)
  IF v_product_id IS NULL THEN
    SELECT id INTO v_product_id
    FROM mrp_products
    WHERE product_code = NEW.product_sku AND is_active = true
    LIMIT 1;
    v_units_per_kit := 1;
  END IF;

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
    IF OLD.status <> 'cancelled' AND NEW.status = 'cancelled' AND v_ws_id IS NOT NULL THEN
      UPDATE warehouse_stock
        SET quantity = v_current_qty + v_deduct_qty, updated_at = NOW()
      WHERE id = v_ws_id;
    ELSIF OLD.status = 'cancelled' AND NEW.status <> 'cancelled' AND v_ws_id IS NOT NULL THEN
      UPDATE warehouse_stock
        SET quantity = GREATEST(0, v_current_qty - v_deduct_qty), updated_at = NOW()
      WHERE id = v_ws_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
