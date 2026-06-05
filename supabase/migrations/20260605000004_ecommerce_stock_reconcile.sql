-- ============================================================================
-- Dedução de estoque do e-commerce — versão RECONCILIAÇÃO (idempotente).
--
-- Problema da versão anterior: o estoque era movido por "transições" de status
-- (baixa quando entra pago, devolução quando sai). Como a baixa e a devolução
-- podiam usar fórmulas/mapeamentos diferentes (ou o mapeamento nem existir na
-- hora da baixa), o estorno às vezes DEVOLVIA mais do que tinha tirado →
-- estoque fantasma (ex.: CarboZé 100ml subiu +15).
--
-- Solução: cada pedido guarda em `stock_deducted_units` QUANTAS unidades ele já
-- removeu do estoque. A cada INSERT/UPDATE o trigger calcula quanto ESTE pedido
-- DEVERIA estar deduzindo (dado o status atual) e aplica só a DIFERENÇA.
-- Resultado: re-sync, cancelamento, mudança de status — nunca duplica nem infla.
--
-- Estados que consomem estoque: 'paid', 'shipped', 'delivered'.
-- 'pending' e 'cancelled' não consomem (estoque volta ao que era).
-- (Nuvemshop pago-mas-por-embalar chega como 'pending' → não consome ainda.)
-- ============================================================================

-- 1) Coluna de rastreio: quanto este pedido já tirou do estoque hoje.
ALTER TABLE ecommerce_orders
  ADD COLUMN IF NOT EXISTS stock_deducted_units numeric NOT NULL DEFAULT 0;

-- 2) Trigger BEFORE (precisa gravar NEW.stock_deducted_units).
CREATE OR REPLACE FUNCTION handle_ecommerce_order_sp_stock()
RETURNS TRIGGER AS $$
DECLARE
  v_product_id    uuid;
  v_units_per_kit numeric;
  v_warehouse_id  uuid;
  v_ws_id         uuid;
  v_consumes      boolean;
  v_desired       numeric;   -- quanto este pedido DEVE estar deduzindo agora
  v_already       numeric;   -- quanto ele já estava deduzindo antes
  v_delta         numeric;   -- diferença a aplicar no estoque
BEGIN
  v_already := CASE WHEN TG_OP = 'UPDATE' THEN COALESCE(OLD.stock_deducted_units, 0) ELSE 0 END;

  -- Resolve produto + multiplicador pelo SKU (específico da plataforma vence o genérico).
  IF NEW.product_sku IS NOT NULL THEN
    SELECT sm.product_id, sm.units_per_kit
      INTO v_product_id, v_units_per_kit
    FROM sku_product_mappings sm
    WHERE sm.platform_sku = NEW.product_sku
      AND sm.is_active = true
      AND (sm.platform = NEW.platform OR sm.platform IS NULL)
    ORDER BY (sm.platform = NEW.platform) DESC NULLS LAST
    LIMIT 1;
  END IF;

  v_consumes := (NEW.status IN ('paid', 'shipped', 'delivered'));

  -- Quanto este pedido deveria estar segurando no estoque dado o status atual.
  IF v_consumes AND v_product_id IS NOT NULL AND COALESCE(NEW.quantity, 0) <> 0 THEN
    v_desired := NEW.quantity * COALESCE(v_units_per_kit, 1);
  ELSE
    v_desired := 0;
  END IF;

  -- Grava no próprio pedido o estado atual de dedução.
  NEW.stock_deducted_units := v_desired;

  v_delta := v_desired - v_already;  -- >0 tira mais do estoque, <0 devolve

  IF v_delta <> 0 AND v_product_id IS NOT NULL THEN
    SELECT id INTO v_warehouse_id FROM warehouses WHERE code = 'HUB-SP' AND is_active = true LIMIT 1;
    IF v_warehouse_id IS NOT NULL THEN
      SELECT id INTO v_ws_id
      FROM warehouse_stock
      WHERE warehouse_id = v_warehouse_id AND product_id = v_product_id;

      IF v_ws_id IS NOT NULL THEN
        UPDATE warehouse_stock
          SET quantity = GREATEST(0, quantity - v_delta), updated_at = NOW()
        WHERE id = v_ws_id;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3) Religa o trigger como BEFORE (qualquer INSERT/UPDATE, não só de status).
DROP TRIGGER IF EXISTS ecommerce_order_sp_stock_trigger ON ecommerce_orders;
CREATE TRIGGER ecommerce_order_sp_stock_trigger
BEFORE INSERT OR UPDATE ON ecommerce_orders
FOR EACH ROW EXECUTE FUNCTION handle_ecommerce_order_sp_stock();

-- 4) Backfill: marca em cada pedido EXISTENTE quanto ele já está deduzindo hoje,
--    SEM mexer no estoque (assume que o warehouse_stock atual já reflete essas
--    baixas). Assim o trigger novo não vai re-deduzir retroativamente.
--    Depois deste backfill, ajuste manualmente o warehouse_stock dos 2 produtos
--    afetados para o valor real do LogHouse (a fonte de verdade).
UPDATE ecommerce_orders o
SET stock_deducted_units = CASE
  WHEN o.status IN ('paid', 'shipped', 'delivered') THEN
    o.quantity * COALESCE((
      SELECT sm.units_per_kit
      FROM sku_product_mappings sm
      WHERE sm.platform_sku = o.product_sku
        AND sm.is_active = true
        AND (sm.platform = o.platform OR sm.platform IS NULL)
      ORDER BY (sm.platform = o.platform) DESC NULLS LAST
      LIMIT 1
    ), 0)
  ELSE 0
END;
