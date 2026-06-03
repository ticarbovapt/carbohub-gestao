-- P3: Wrap production confirmation stock movements in a DB function so that
-- warehouse_stock debits/credits are atomic. The front-end hook calls this
-- RPC for the stock-movement part, then handles the confirmation record
-- separately (idempotent upsert is fine there).
--
-- The RPC receives JSON arrays and handles:
--   • Debit mrp_products.current_stock_qty and warehouse_stock for each input material
--   • Credit mrp_products.current_stock_qty and warehouse_stock for the finished product
--
-- Returns VOID (throws on any error so the caller can surface a clean message).

CREATE OR REPLACE FUNCTION public.apply_production_stock_movements(
  p_production_order_id  uuid,
  p_order_number         text,
  p_user_id              uuid,

  -- Material consumptions: [{product_id, actual_quantity, warehouse_id}]
  p_materials            jsonb,

  -- Finished good: {product_id, good_quantity, warehouse_id}  (NULL if quality rejected)
  p_finished             jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_mat    jsonb;
  v_prod_id uuid;
  v_qty    numeric;
  v_wh_id  uuid;
  v_ws_id  uuid;
  v_ws_qty numeric;
  v_cur_stock numeric;
BEGIN
  -- ── Debit consumed materials ─────────────────────────────────────────────
  FOR v_mat IN SELECT * FROM jsonb_array_elements(p_materials) LOOP
    v_prod_id := (v_mat->>'product_id')::uuid;
    v_qty     := (v_mat->>'actual_quantity')::numeric;
    v_wh_id   := (v_mat->>'warehouse_id')::uuid;

    IF v_qty IS NULL OR v_qty <= 0 THEN CONTINUE; END IF;

    -- stock_movements entry
    INSERT INTO public.stock_movements (
      product_id, tipo, quantidade, origem, origem_id, warehouse_id, observacoes, created_by
    ) VALUES (
      v_prod_id, 'saida', v_qty, 'OP', p_production_order_id,
      v_wh_id,
      'Consumo OP - ' || COALESCE(v_mat->>'product_name', v_prod_id::text),
      p_user_id
    );

    -- mrp_products consolidated stock
    UPDATE public.mrp_products
    SET
      current_stock_qty = GREATEST(0, current_stock_qty - v_qty),
      stock_updated_at  = CURRENT_DATE
    WHERE id = v_prod_id;

    -- warehouse_stock
    IF v_wh_id IS NOT NULL THEN
      SELECT id, quantity INTO v_ws_id, v_ws_qty
      FROM public.warehouse_stock
      WHERE product_id = v_prod_id AND warehouse_id = v_wh_id;

      IF FOUND THEN
        UPDATE public.warehouse_stock
        SET quantity = GREATEST(0, v_ws_qty - v_qty), updated_at = now()
        WHERE id = v_ws_id;
      END IF;
    END IF;
  END LOOP;

  -- ── Credit finished goods ─────────────────────────────────────────────────
  IF p_finished IS NOT NULL AND (p_finished->>'good_quantity')::numeric > 0 THEN
    v_prod_id := (p_finished->>'product_id')::uuid;
    v_qty     := (p_finished->>'good_quantity')::numeric;
    v_wh_id   := (p_finished->>'warehouse_id')::uuid;

    -- stock_movements entry
    INSERT INTO public.stock_movements (
      product_id, tipo, quantidade, origem, origem_id, warehouse_id, observacoes, created_by
    ) VALUES (
      v_prod_id, 'entrada', v_qty, 'OP', p_production_order_id,
      v_wh_id,
      'Produção concluída - ' || COALESCE(p_finished->>'product_name', v_prod_id::text),
      p_user_id
    );

    -- mrp_products consolidated stock
    UPDATE public.mrp_products
    SET
      current_stock_qty = current_stock_qty + v_qty,
      stock_updated_at  = CURRENT_DATE
    WHERE id = v_prod_id;

    -- warehouse_stock
    IF v_wh_id IS NOT NULL THEN
      SELECT id, quantity INTO v_ws_id, v_ws_qty
      FROM public.warehouse_stock
      WHERE product_id = v_prod_id AND warehouse_id = v_wh_id;

      IF FOUND THEN
        UPDATE public.warehouse_stock
        SET quantity = v_ws_qty + v_qty, updated_at = now()
        WHERE id = v_ws_id;
      ELSE
        INSERT INTO public.warehouse_stock (product_id, warehouse_id, quantity)
        VALUES (v_prod_id, v_wh_id, v_qty);
      END IF;
    END IF;
  END IF;
END;
$$;
