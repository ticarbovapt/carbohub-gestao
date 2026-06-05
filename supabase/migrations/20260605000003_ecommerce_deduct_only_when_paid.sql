-- ============================================================================
-- Dedução de estoque do e-commerce: SÓ quando o pedido está PAGO.
--
-- Antes: deduzia assim que o pedido entrava (qualquer status != cancelado).
-- Agora: deduz apenas quando o pedido está num estado que consome estoque
-- (pago/enviado/entregue) e estorna se sair desse estado (cancelado/estornado).
--
-- Estados que consomem estoque: 'paid', 'shipped', 'delivered'
-- Estados que NÃO consomem: 'pending' (aguardando pagamento), 'cancelled'
--
-- Vale para todas as plataformas (ML/Amazon/Nuvemshop) — a normalização de
-- status de cada uma já mapeia "pago" para 'shipped'/'delivered'.
-- ============================================================================

CREATE OR REPLACE FUNCTION handle_ecommerce_order_sp_stock()
RETURNS TRIGGER AS $$
DECLARE
  v_product_id    uuid;
  v_units_per_kit numeric;
  v_warehouse_id  uuid;
  v_ws_id         uuid;
  v_current_qty   numeric;
  v_deduct_qty    numeric;
  v_old_consumes  boolean;
  v_new_consumes  boolean;
BEGIN
  IF NEW.product_sku IS NULL OR COALESCE(NEW.quantity, 0) = 0 THEN
    RETURN NEW;
  END IF;

  -- Mapeamento SKU → produto + multiplicador (kit). Específico da plataforma vence o genérico.
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

  -- Estoque do HUB-SP (CD SP LogHouse)
  SELECT id INTO v_warehouse_id FROM warehouses WHERE code = 'HUB-SP' AND is_active = true LIMIT 1;
  IF v_warehouse_id IS NULL THEN RETURN NEW; END IF;

  SELECT id, quantity INTO v_ws_id, v_current_qty
  FROM warehouse_stock
  WHERE warehouse_id = v_warehouse_id AND product_id = v_product_id;

  IF v_ws_id IS NULL THEN RETURN NEW; END IF;

  -- Estado atual consome estoque? (pago / enviado / entregue)
  v_new_consumes := (NEW.status IN ('paid', 'shipped', 'delivered'));

  IF TG_OP = 'INSERT' THEN
    -- Só deduz se já entrar pago/enviado/entregue. Pedido 'pending' não mexe.
    IF v_new_consumes THEN
      UPDATE warehouse_stock
        SET quantity = GREATEST(0, v_current_qty - v_deduct_qty), updated_at = NOW()
      WHERE id = v_ws_id;
    END IF;

  ELSIF TG_OP = 'UPDATE' THEN
    v_old_consumes := (OLD.status IN ('paid', 'shipped', 'delivered'));

    IF (NOT v_old_consumes) AND v_new_consumes THEN
      -- Pagamento confirmado (pending → pago): deduz agora
      UPDATE warehouse_stock
        SET quantity = GREATEST(0, v_current_qty - v_deduct_qty), updated_at = NOW()
      WHERE id = v_ws_id;

    ELSIF v_old_consumes AND (NOT v_new_consumes) THEN
      -- Saiu do estado pago (cancelado/estornado): devolve ao estoque
      UPDATE warehouse_stock
        SET quantity = v_current_qty + v_deduct_qty, updated_at = NOW()
      WHERE id = v_ws_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- O trigger (AFTER INSERT OR UPDATE OF status) já aponta para esta função.
