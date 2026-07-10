-- ─────────────────────────────────────────────────────────────────────────────
-- Perdas de insumo na produção. Ao concluir a OP, informa-se quanto de CADA
-- insumo foi realmente usado; a perda = usado − teórico (BOM × boas produzidas).
-- Também reconcilia o estoque pro consumo REAL (no separado deduzimos o teórico
-- do planejado; aqui ajustamos pela diferença) e credita o produto final.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.op_material_loss (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  op_id           uuid NOT NULL REFERENCES public.production_orders(id) ON DELETE CASCADE,
  insumo_id       uuid NOT NULL REFERENCES public.mrp_products(id),
  theoretical_qty numeric NOT NULL DEFAULT 0, -- BOM × boas (esperado)
  actual_qty      numeric NOT NULL DEFAULT 0, -- informado na conclusão
  loss_qty        numeric NOT NULL DEFAULT 0, -- max(0, actual − theoretical)
  unit            text,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_op_material_loss_insumo ON public.op_material_loss(insumo_id);
CREATE INDEX IF NOT EXISTS idx_op_material_loss_op ON public.op_material_loss(op_id);

ALTER TABLE public.op_material_loss ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS op_material_loss_all ON public.op_material_loss;
CREATE POLICY op_material_loss_all ON public.op_material_loss
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Conclui a OP: grava boas/refugo, credita o produto final, registra perdas de
-- insumo e reconcilia o estoque pro consumo real. Idempotente (só age se a OP
-- ainda não estava concluída).
CREATE OR REPLACE FUNCTION public.op_conclude(
  p_op_id uuid, p_good numeric, p_rejected numeric, p_consumption jsonb
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  wh uuid; v_pid uuid; v_src uuid; v_deducted boolean; v_credited boolean; v_wasdone boolean;
  it jsonb; ins uuid; actual numeric; ded numeric; theo numeric; un text; loss numeric;
BEGIN
  SELECT (op_status = 'concluida'), product_id, source_order_id,
         coalesce(materials_deducted, false), coalesce(product_credited, false)
    INTO v_wasdone, v_pid, v_src, v_deducted, v_credited
    FROM public.production_orders WHERE id = p_op_id;

  UPDATE public.production_orders
    SET good_quantity = p_good, rejected_quantity = p_rejected,
        op_status = 'concluida', finished_at = now(), product_credited = true
    WHERE id = p_op_id;

  SELECT id INTO wh FROM public.warehouses WHERE code = 'HUB-RN' LIMIT 1;

  -- Crédito do produto final (uma única vez).
  IF NOT v_wasdone AND NOT v_credited THEN
    IF v_src IS NOT NULL THEN
      PERFORM public.pos_venda_credit_stock(v_src);
    ELSIF v_pid IS NOT NULL AND p_good > 0 AND wh IS NOT NULL THEN
      INSERT INTO public.warehouse_stock (warehouse_id, product_id, quantity)
      VALUES (wh, v_pid, p_good)
      ON CONFLICT (warehouse_id, product_id)
      DO UPDATE SET quantity = public.warehouse_stock.quantity + p_good, updated_at = now();
    END IF;
  END IF;

  -- Consumo real → perdas + reconciliação de estoque (só na 1ª conclusão).
  IF NOT v_wasdone AND wh IS NOT NULL AND p_consumption IS NOT NULL THEN
    FOR it IN SELECT jsonb_array_elements(p_consumption) LOOP
      ins := nullif(it->>'insumo_id', '')::uuid;
      IF ins IS NULL THEN CONTINUE; END IF;
      actual := coalesce((it->>'actual_qty')::numeric, 0);
      theo   := coalesce((it->>'theoretical_qty')::numeric, 0);
      -- deduzido no separado = teórico do planejado (só conta se realmente deduziu).
      ded := CASE WHEN v_deducted THEN coalesce((it->>'deducted_qty')::numeric, 0) ELSE 0 END;
      un  := it->>'unit';
      loss := greatest(0, actual - theo);
      INSERT INTO public.op_material_loss (op_id, insumo_id, theoretical_qty, actual_qty, loss_qty, unit)
        VALUES (p_op_id, ins, theo, actual, loss, un);
      IF actual - ded <> 0 THEN
        UPDATE public.warehouse_stock
          SET quantity = quantity - (actual - ded), updated_at = now()
          WHERE warehouse_id = wh AND product_id = ins;
      END IF;
    END LOOP;
  END IF;
END $$;

GRANT EXECUTE ON FUNCTION public.op_conclude(uuid, numeric, numeric, jsonb) TO authenticated;
