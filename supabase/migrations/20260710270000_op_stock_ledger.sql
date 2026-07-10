-- ═════════════════════════════════════════════════════════════════════════════
-- LOTE 1 — Integridade de estoque da produção (ledger de movimentos por OP).
--
-- Problema-raiz: dedução/estorno/conclusão recalculavam pela BOM/quantidade/rota
-- ATUAIS, então editar a ficha/quantidade entre separar e concluir/estornar
-- corrompia o estoque; deduções em UPDATE puro sumiam quando o insumo não tinha
-- linha; conclusão não era atômica (duplo clique creditava 2×); voltar OP
-- concluída não descreditava o produto; conclusão de pós-venda creditava a
-- quantidade do PEDIDO em vez das BOAS.
--
-- Solução: TODO movimento de estoque de uma OP passa por op_apply_delta, que
-- (a) faz UPSERT em warehouse_stock (nunca perde baixa por falta de linha) e
-- (b) grava a linha no ledger. Estornar/excluir a OP soma o ledger e aplica o
-- inverso — reverte EXATAMENTE o que foi movido, imune a mudança de ficha.
-- ═════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.op_stock_ledger (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  op_id       uuid NOT NULL REFERENCES public.production_orders(id) ON DELETE CASCADE,
  product_id  uuid NOT NULL REFERENCES public.mrp_products(id),
  warehouse_id uuid NOT NULL REFERENCES public.warehouses(id),
  delta       numeric NOT NULL,            -- +credita / −deduz
  reason      text,                        -- 'separacao' | 'conclusao_ajuste' | 'conclusao_produto'
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_op_stock_ledger_op ON public.op_stock_ledger(op_id);
ALTER TABLE public.op_stock_ledger ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS op_stock_ledger_all ON public.op_stock_ledger;
CREATE POLICY op_stock_ledger_all ON public.op_stock_ledger
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Aplica um delta de estoque no HUB-RN e registra no ledger. Upsert garante que
-- a baixa não some se o insumo ainda não tem linha (fica negativo — visível).
CREATE OR REPLACE FUNCTION public.op_apply_delta(
  p_op_id uuid, p_product_id uuid, p_delta numeric, p_reason text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE wh uuid;
BEGIN
  IF p_product_id IS NULL OR p_delta = 0 THEN RETURN; END IF;
  SELECT id INTO wh FROM public.warehouses WHERE code = 'HUB-RN' LIMIT 1;
  IF wh IS NULL THEN RETURN; END IF;
  INSERT INTO public.warehouse_stock (warehouse_id, product_id, quantity)
  VALUES (wh, p_product_id, p_delta)
  ON CONFLICT (warehouse_id, product_id)
  DO UPDATE SET quantity = public.warehouse_stock.quantity + p_delta, updated_at = now();
  INSERT INTO public.op_stock_ledger (op_id, product_id, warehouse_id, delta, reason)
  VALUES (p_op_id, p_product_id, wh, p_delta, p_reason);
END $$;

-- Reverte TODOS os movimentos de estoque de uma OP (soma o ledger e aplica o
-- inverso), zera o ledger e reseta as flags de dedução/crédito. Usado ao voltar
-- a OP no kanban (qualquer etapa → antes da separação) e ao excluir a OP.
CREATE OR REPLACE FUNCTION public.op_reverse_all(p_op_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT product_id, warehouse_id, sum(delta) AS d
      FROM public.op_stock_ledger WHERE op_id = p_op_id
      GROUP BY product_id, warehouse_id HAVING sum(delta) <> 0
  LOOP
    UPDATE public.warehouse_stock
      SET quantity = quantity - r.d, updated_at = now()
      WHERE warehouse_id = r.warehouse_id AND product_id = r.product_id;
  END LOOP;
  DELETE FROM public.op_stock_ledger WHERE op_id = p_op_id;
  DELETE FROM public.op_material_loss WHERE op_id = p_op_id;
  UPDATE public.production_orders
    SET materials_deducted = false, product_credited = false, production_route = NULL
    WHERE id = p_op_id;
END $$;

-- ── Dedução na separação (agora via ledger) ─────────────────────────────────
CREATE OR REPLACE FUNCTION public.op_deduct_materials(p_op_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_pid uuid; v_qty numeric; v_route text;
  b record; sub record; needed numeric; su text; semi_needed numeric; sub_needed numeric; sub_su text;
BEGIN
  UPDATE public.production_orders
    SET materials_deducted = true
    WHERE id = p_op_id AND materials_deducted = false AND product_id IS NOT NULL;
  IF NOT FOUND THEN RETURN; END IF;

  SELECT product_id, coalesce(planned_quantity, quantity, 0), production_route
    INTO v_pid, v_qty, v_route FROM public.production_orders WHERE id = p_op_id;
  IF v_pid IS NULL OR v_qty <= 0 THEN RETURN; END IF;

  FOR b IN
    SELECT mb.insumo_id, mb.quantity_per_unit AS qpu, mb.unit AS bom_unit, p.stock_unit, p.category
      FROM public.mrp_bom mb JOIN public.mrp_products p ON p.id = mb.insumo_id
      WHERE mb.product_id = v_pid
  LOOP
    IF v_route = 'zero' AND b.category = 'Semi-acabado' THEN
      semi_needed := b.qpu * v_qty;
      FOR sub IN
        SELECT mb2.insumo_id, mb2.quantity_per_unit AS qpu, mb2.unit AS bom_unit, p2.stock_unit
          FROM public.mrp_bom mb2 JOIN public.mrp_products p2 ON p2.id = mb2.insumo_id
          WHERE mb2.product_id = b.insumo_id
      LOOP
        sub_su := coalesce(nullif(sub.stock_unit, ''), sub.bom_unit, 'un');
        sub_needed := public.carbo_convert_unit(sub.qpu * semi_needed, coalesce(sub.bom_unit, sub_su), sub_su);
        IF sub_needed IS NULL THEN sub_needed := sub.qpu * semi_needed; END IF;
        PERFORM public.op_apply_delta(p_op_id, sub.insumo_id, -sub_needed, 'separacao');
      END LOOP;
    ELSE
      su := coalesce(nullif(b.stock_unit, ''), b.bom_unit, 'un');
      needed := public.carbo_convert_unit(b.qpu * v_qty, coalesce(b.bom_unit, su), su);
      IF needed IS NULL THEN needed := b.qpu * v_qty; END IF;
      PERFORM public.op_apply_delta(p_op_id, b.insumo_id, -needed, 'separacao');
    END IF;
  END LOOP;
END $$;

-- ── Conclusão (atômica, credita as BOAS, reconcilia pelo ledger) ────────────
CREATE OR REPLACE FUNCTION public.op_conclude(
  p_op_id uuid, p_good numeric, p_rejected numeric, p_consumption jsonb
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_pid uuid; v_src uuid;
  it jsonb; ins uuid; actual numeric; deducted numeric; theo numeric; un text; loss numeric; adj numeric;
BEGIN
  -- Trava atômica: só age se ainda não estava concluída (evita duplo crédito).
  UPDATE public.production_orders
    SET good_quantity = p_good, rejected_quantity = p_rejected,
        op_status = 'concluida', finished_at = now(), product_credited = true
    WHERE id = p_op_id AND op_status <> 'concluida'
    RETURNING product_id, source_order_id INTO v_pid, v_src;
  IF NOT FOUND THEN RETURN; END IF;

  -- Consumo real por insumo → perdas + reconciliação (usa o QUE FOI DEDUZIDO,
  -- lido do ledger; imune a mudança de ficha entre separar e concluir).
  IF p_consumption IS NOT NULL THEN
    FOR it IN SELECT jsonb_array_elements(p_consumption) LOOP
      ins := nullif(it->>'insumo_id', '')::uuid;
      IF ins IS NULL THEN CONTINUE; END IF;
      actual := coalesce((it->>'actual_qty')::numeric, 0);
      theo   := coalesce((it->>'theoretical_qty')::numeric, 0);
      un     := it->>'unit';
      loss   := greatest(0, actual - theo);
      -- quanto já saiu na separação (ledger negativo) → deducted = −soma.
      SELECT -coalesce(sum(delta), 0) INTO deducted
        FROM public.op_stock_ledger WHERE op_id = p_op_id AND product_id = ins;
      INSERT INTO public.op_material_loss (op_id, insumo_id, theoretical_qty, actual_qty, loss_qty, unit)
        VALUES (p_op_id, ins, theo, actual, loss, un);
      -- estoque final do insumo deve ficar −actual; já está −deducted → ajusta.
      adj := deducted - actual;  -- se actual>deducted, negativo (deduz mais)
      PERFORM public.op_apply_delta(p_op_id, ins, adj, 'conclusao_ajuste');
    END LOOP;
  END IF;

  -- Crédito do produto final = BOAS (não a quantidade do pedido).
  IF v_pid IS NOT NULL AND p_good > 0 THEN
    PERFORM public.op_apply_delta(p_op_id, v_pid, p_good, 'conclusao_produto');
  END IF;

  -- Pós-venda: marca o pedido como produzido e bloqueia o crédito por itens
  -- (stock_credited=true) — o produto já entrou pelas BOAS acima.
  IF v_src IS NOT NULL THEN
    UPDATE public.carboze_orders
      SET production_done = true, stock_credited = true, updated_at = now()
      WHERE id = v_src;
  END IF;
END $$;

GRANT EXECUTE ON FUNCTION public.op_apply_delta(uuid, uuid, numeric, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.op_reverse_all(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.op_deduct_materials(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.op_conclude(uuid, numeric, numeric, jsonb) TO authenticated;
