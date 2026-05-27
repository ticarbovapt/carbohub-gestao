-- Trigger: vendas do e-commerce deduzem automaticamente do warehouse_stock do CD São Paulo.
-- Mapeamento: ecommerce_orders.product_sku → mrp_products.product_code → warehouse_stock[HUB-SP]
-- units_real = unidades físicas vendidas (já considera pack/multiplo)

CREATE OR REPLACE FUNCTION handle_ecommerce_order_sp_stock()
RETURNS TRIGGER AS $$
DECLARE
  v_product_id   uuid;
  v_warehouse_id uuid;
  v_ws_id        uuid;
  v_current_qty  numeric;
BEGIN
  -- Só processa ordens com SKU e unidades reais
  IF NEW.product_sku IS NULL OR COALESCE(NEW.units_real, 0) = 0 THEN
    RETURN NEW;
  END IF;

  -- Resolve produto pelo SKU
  SELECT id INTO v_product_id
  FROM mrp_products
  WHERE product_code = NEW.product_sku AND is_active = true
  LIMIT 1;

  IF v_product_id IS NULL THEN RETURN NEW; END IF;

  -- Resolve warehouse do HUB-SP
  SELECT id INTO v_warehouse_id
  FROM warehouses
  WHERE code = 'HUB-SP' AND is_active = true
  LIMIT 1;

  IF v_warehouse_id IS NULL THEN RETURN NEW; END IF;

  -- Linha de estoque
  SELECT id, quantity INTO v_ws_id, v_current_qty
  FROM warehouse_stock
  WHERE warehouse_id = v_warehouse_id AND product_id = v_product_id;

  IF TG_OP = 'INSERT' THEN
    -- Nova venda (não cancelada) → deduz
    IF NEW.status <> 'cancelled' AND v_ws_id IS NOT NULL THEN
      UPDATE warehouse_stock
      SET quantity   = GREATEST(0, v_current_qty - NEW.units_real),
          updated_at = NOW()
      WHERE id = v_ws_id;
    END IF;

  ELSIF TG_OP = 'UPDATE' THEN
    -- Venda ativa → cancelada: estorna
    IF OLD.status <> 'cancelled' AND NEW.status = 'cancelled' AND v_ws_id IS NOT NULL THEN
      UPDATE warehouse_stock
      SET quantity   = v_current_qty + OLD.units_real,
          updated_at = NOW()
      WHERE id = v_ws_id;

    -- Cancelada → reativada: deduz novamente
    ELSIF OLD.status = 'cancelled' AND NEW.status <> 'cancelled' AND v_ws_id IS NOT NULL THEN
      UPDATE warehouse_stock
      SET quantity   = GREATEST(0, v_current_qty - NEW.units_real),
          updated_at = NOW()
      WHERE id = v_ws_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Remove trigger antigo se existir
DROP TRIGGER IF EXISTS ecommerce_order_sp_stock_trigger ON ecommerce_orders;

CREATE TRIGGER ecommerce_order_sp_stock_trigger
AFTER INSERT OR UPDATE OF status ON ecommerce_orders
FOR EACH ROW EXECUTE FUNCTION handle_ecommerce_order_sp_stock();
