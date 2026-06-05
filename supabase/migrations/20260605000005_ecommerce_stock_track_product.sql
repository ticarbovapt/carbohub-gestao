-- ============================================================================
-- Reconciliação de estoque do e-commerce: agora rastreia também QUAL produto
-- foi baixado em cada pedido.
--
-- Motivo: a versão anterior guardava só "quantas unidades" o pedido baixou
-- (stock_deducted_units), mas não DE QUAL produto. Se o mapeamento do SKU
-- trocava o produto de destino (ex.: kit → sachê individual), a baixa antiga
-- ficava órfã no produto errado e nunca era devolvida.
--
-- Agora cada pedido guarda (stock_deducted_units, stock_deducted_product_id).
-- A cada mudança o trigger:
--   1) DEVOLVE a baixa anterior ao produto de antes (se havia);
--   2) APLICA a baixa atual ao produto de agora (mapeamento vigente).
-- Idempotente e correto mesmo quando o produto de destino muda.
--
-- Estados que consomem: 'paid', 'shipped', 'delivered'. 'pending'/'cancelled' não.
-- ============================================================================

ALTER TABLE ecommerce_orders
  ADD COLUMN IF NOT EXISTS stock_deducted_product_id uuid;

CREATE OR REPLACE FUNCTION handle_ecommerce_order_sp_stock()
RETURNS TRIGGER AS $$
DECLARE
  v_new_product   uuid;
  v_units_per_kit numeric;
  v_warehouse_id  uuid;
  v_consumes      boolean;
  v_desired       numeric;   -- quanto este pedido DEVE baixar agora (produto atual)
  v_old_product   uuid;      -- de qual produto baixou da última vez
  v_old_units     numeric;   -- quanto baixou da última vez
BEGIN
  SELECT id INTO v_warehouse_id FROM warehouses WHERE code = 'HUB-SP' AND is_active = true LIMIT 1;

  -- Produto + multiplicador ATUAIS do SKU (específico da plataforma vence o genérico).
  IF NEW.product_sku IS NOT NULL THEN
    SELECT sm.product_id, sm.units_per_kit
      INTO v_new_product, v_units_per_kit
    FROM sku_product_mappings sm
    WHERE sm.platform_sku = NEW.product_sku
      AND sm.is_active = true
      AND (sm.platform = NEW.platform OR sm.platform IS NULL)
    ORDER BY (sm.platform = NEW.platform) DESC NULLS LAST
    LIMIT 1;
  END IF;

  v_consumes := (NEW.status IN ('paid', 'shipped', 'delivered'));

  IF v_consumes AND v_new_product IS NOT NULL AND COALESCE(NEW.quantity, 0) <> 0 THEN
    v_desired := NEW.quantity * COALESCE(v_units_per_kit, 1);
  ELSE
    v_desired := 0;
  END IF;

  v_old_product := CASE WHEN TG_OP = 'UPDATE' THEN OLD.stock_deducted_product_id ELSE NULL END;
  v_old_units   := CASE WHEN TG_OP = 'UPDATE' THEN COALESCE(OLD.stock_deducted_units, 0) ELSE 0 END;

  IF v_warehouse_id IS NOT NULL THEN
    -- 1) Devolve a baixa anterior ao produto de antes.
    IF v_old_product IS NOT NULL AND v_old_units <> 0 THEN
      UPDATE warehouse_stock
        SET quantity = quantity + v_old_units, updated_at = NOW()
      WHERE warehouse_id = v_warehouse_id AND product_id = v_old_product;
    END IF;

    -- 2) Aplica a baixa atual ao produto de agora.
    IF v_desired <> 0 AND v_new_product IS NOT NULL THEN
      UPDATE warehouse_stock
        SET quantity = GREATEST(0, quantity - v_desired), updated_at = NOW()
      WHERE warehouse_id = v_warehouse_id AND product_id = v_new_product;
    END IF;
  END IF;

  NEW.stock_deducted_units      := v_desired;
  NEW.stock_deducted_product_id := CASE WHEN v_desired <> 0 THEN v_new_product ELSE NULL END;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Garante que o trigger é BEFORE (precisa gravar as colunas de rastreio em NEW).
DROP TRIGGER IF EXISTS ecommerce_order_sp_stock_trigger ON ecommerce_orders;
CREATE TRIGGER ecommerce_order_sp_stock_trigger
BEFORE INSERT OR UPDATE ON ecommerce_orders
FOR EACH ROW EXECUTE FUNCTION handle_ecommerce_order_sp_stock();
