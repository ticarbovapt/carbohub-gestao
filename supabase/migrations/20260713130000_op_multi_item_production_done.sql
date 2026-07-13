-- Pedido multi-item vira UMA OP por produto. Com isso, o pedido só está
-- "produzido" quando TODAS as suas OPs concluírem — antes bastava uma.
-- Reescreve op_conclude (marca production_done condicional) e op_reverse_all
-- (desmarca quando uma OP deixa de estar concluída). Mesma lógica de estoque.

-- ── Conclusão: production_done só se não sobrar OP aberta do pedido ──────────
CREATE OR REPLACE FUNCTION public.op_conclude(
  p_op_id uuid, p_good numeric, p_rejected numeric, p_consumption jsonb
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_pid uuid; v_src uuid;
  it jsonb; ins uuid; actual numeric; deducted numeric; theo numeric; un text; loss numeric; adj numeric;
BEGIN
  UPDATE public.production_orders
    SET good_quantity = p_good, rejected_quantity = p_rejected,
        op_status = 'concluida', finished_at = now(), product_credited = true
    WHERE id = p_op_id AND op_status <> 'concluida'
    RETURNING product_id, source_order_id INTO v_pid, v_src;
  IF NOT FOUND THEN RETURN; END IF;

  IF p_consumption IS NOT NULL THEN
    FOR it IN SELECT jsonb_array_elements(p_consumption) LOOP
      ins := nullif(it->>'insumo_id', '')::uuid;
      IF ins IS NULL THEN CONTINUE; END IF;
      actual := coalesce((it->>'actual_qty')::numeric, 0);
      theo   := coalesce((it->>'theoretical_qty')::numeric, 0);
      un     := it->>'unit';
      loss   := greatest(0, actual - theo);
      SELECT -coalesce(sum(delta), 0) INTO deducted
        FROM public.op_stock_ledger WHERE op_id = p_op_id AND product_id = ins;
      INSERT INTO public.op_material_loss (op_id, insumo_id, theoretical_qty, actual_qty, loss_qty, unit)
        VALUES (p_op_id, ins, theo, actual, loss, un);
      adj := deducted - actual;
      PERFORM public.op_apply_delta(p_op_id, ins, adj, 'conclusao_ajuste');
    END LOOP;
  END IF;

  IF v_pid IS NOT NULL AND p_good > 0 THEN
    PERFORM public.op_apply_delta(p_op_id, v_pid, p_good, 'conclusao_produto');
  END IF;

  -- Pós-venda: só marca "produzido" quando NÃO sobra OP aberta do pedido
  -- (cancelada não conta como aberta). Esta OP já está 'concluida' acima.
  IF v_src IS NOT NULL THEN
    UPDATE public.carboze_orders
      SET stock_credited = true,
          production_done = NOT EXISTS (
            SELECT 1 FROM public.production_orders
            WHERE source_order_id = v_src
              AND op_status NOT IN ('concluida', 'cancelada')
          ),
          updated_at = now()
      WHERE id = v_src;
  END IF;
END $$;

-- ── Reversão: se uma OP deixa de estar concluída, o pedido não está 100% ────
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

  -- Pós-venda: esta OP saiu de concluída → o pedido volta a "não produzido".
  UPDATE public.carboze_orders c
    SET production_done = false, updated_at = now()
    FROM public.production_orders po
    WHERE po.id = p_op_id AND po.source_order_id = c.id;
END $$;

GRANT EXECUTE ON FUNCTION public.op_conclude(uuid, numeric, numeric, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.op_reverse_all(uuid) TO authenticated;
