-- ─────────────────────────────────────────────────────────────────────────────
-- Movimentação real de estoque (HUB-RN) no ciclo da Ordem de Produção:
--   • OP SEPARADA   → DEDUZ os insumos da ficha (mrp_bom × qtd planejada).
--   • OP CONCLUÍDA  → CREDITA o Produto Final produzido (só p/ OP que NÃO veio do
--     pós-venda; a de pós-venda credita via pos_venda_credit_stock com os itens).
-- Idempotente: flags materials_deducted / product_credited garantem baixa/crédito
-- uma única vez (flip atômico no UPDATE ... WHERE flag = false).
-- Converte unidade da BOM → unidade de estoque do insumo (ml↔L, g↔kg).
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.production_orders
  ADD COLUMN IF NOT EXISTS materials_deducted boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS product_credited  boolean NOT NULL DEFAULT false;

-- Conversão de unidade por dimensão (espelha apps/ops/src/lib/units.ts).
-- Retorna NULL se as unidades forem de dimensões diferentes/desconhecidas.
CREATE OR REPLACE FUNCTION public.carbo_convert_unit(p_qty numeric, p_from text, p_to text)
RETURNS numeric LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  f text := lower(trim(coalesce(p_from, '')));
  t text := lower(trim(coalesce(p_to, '')));
  fb numeric; tb numeric; fd text; td text;
BEGIN
  CASE f
    WHEN 'ml' THEN fb := 0.001; fd := 'vol';
    WHEN 'l'  THEN fb := 1;     fd := 'vol';
    WHEN 'g'  THEN fb := 0.001; fd := 'mass';
    WHEN 'kg' THEN fb := 1;     fd := 'mass';
    WHEN 'un' THEN fb := 1;     fd := 'count';
    ELSE fb := NULL; fd := NULL;
  END CASE;
  CASE t
    WHEN 'ml' THEN tb := 0.001; td := 'vol';
    WHEN 'l'  THEN tb := 1;     td := 'vol';
    WHEN 'g'  THEN tb := 0.001; td := 'mass';
    WHEN 'kg' THEN tb := 1;     td := 'mass';
    WHEN 'un' THEN tb := 1;     td := 'count';
    ELSE tb := NULL; td := NULL;
  END CASE;
  IF fb IS NULL OR tb IS NULL OR fd <> td THEN RETURN NULL; END IF;
  RETURN (p_qty * fb) / tb;
END $$;

-- Deduz os insumos do HUB-RN pela ficha técnica (mrp_bom) × quantidade planejada.
CREATE OR REPLACE FUNCTION public.op_deduct_materials(p_op_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE wh uuid; v_pid uuid; v_qty numeric; b record; needed numeric; su text;
BEGIN
  UPDATE public.production_orders
    SET materials_deducted = true
    WHERE id = p_op_id AND materials_deducted = false AND product_id IS NOT NULL;
  IF NOT FOUND THEN RETURN; END IF;  -- já deduzido ou sem produto vinculado

  SELECT product_id, coalesce(planned_quantity, quantity, 0)
    INTO v_pid, v_qty FROM public.production_orders WHERE id = p_op_id;
  IF v_pid IS NULL OR v_qty <= 0 THEN RETURN; END IF;

  SELECT id INTO wh FROM public.warehouses WHERE code = 'HUB-RN' LIMIT 1;
  IF wh IS NULL THEN RETURN; END IF;

  FOR b IN
    SELECT mb.insumo_id, mb.quantity_per_unit AS qpu, mb.unit AS bom_unit, p.stock_unit
      FROM public.mrp_bom mb
      JOIN public.mrp_products p ON p.id = mb.insumo_id
      WHERE mb.product_id = v_pid
  LOOP
    su := coalesce(nullif(b.stock_unit, ''), b.bom_unit, 'un');
    needed := public.carbo_convert_unit(b.qpu * v_qty, coalesce(b.bom_unit, su), su);
    IF needed IS NULL THEN needed := b.qpu * v_qty; END IF;  -- mesma unidade / incompatível
    IF needed > 0 THEN
      UPDATE public.warehouse_stock
        SET quantity = quantity - needed, updated_at = now()
        WHERE warehouse_id = wh AND product_id = b.insumo_id;
    END IF;
  END LOOP;
END $$;

-- Credita o Produto Final produzido no HUB-RN ao concluir a OP.
-- OPs de pós-venda são ignoradas aqui (o crédito vem de pos_venda_credit_stock).
CREATE OR REPLACE FUNCTION public.op_credit_product(p_op_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE wh uuid; v_pid uuid; v_qty numeric; v_src uuid;
BEGIN
  UPDATE public.production_orders
    SET product_credited = true
    WHERE id = p_op_id AND product_credited = false AND product_id IS NOT NULL;
  IF NOT FOUND THEN RETURN; END IF;

  SELECT product_id, coalesce(good_quantity, planned_quantity, quantity, 0), source_order_id
    INTO v_pid, v_qty, v_src FROM public.production_orders WHERE id = p_op_id;
  IF v_src IS NOT NULL THEN RETURN; END IF;      -- pós-venda credita pelos itens do pedido
  IF v_pid IS NULL OR v_qty <= 0 THEN RETURN; END IF;

  SELECT id INTO wh FROM public.warehouses WHERE code = 'HUB-RN' LIMIT 1;
  IF wh IS NULL THEN RETURN; END IF;

  INSERT INTO public.warehouse_stock (warehouse_id, product_id, quantity)
  VALUES (wh, v_pid, v_qty)
  ON CONFLICT (warehouse_id, product_id)
  DO UPDATE SET quantity = public.warehouse_stock.quantity + v_qty, updated_at = now();
END $$;

GRANT EXECUTE ON FUNCTION public.carbo_convert_unit(numeric, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.op_deduct_materials(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.op_credit_product(uuid) TO authenticated;
