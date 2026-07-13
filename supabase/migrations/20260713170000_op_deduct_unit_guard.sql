-- Correção 🔴 (pré-existente): unidade incompatível deduzia o NÚMERO CRU.
-- Se a BOM está em ml e o estoque em un, carbo_convert_unit retorna NULL e o
-- código antigo deduzia o valor bruto (500 ml viravam 500 "un"), corrompendo o
-- saldo em silêncio. Agora ABORTA com erro claro — o operador ajusta a ficha.
-- Falta de estoque continua permitida (modelo "negativo visível + log").

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
    SELECT mb.insumo_id, mb.quantity_per_unit AS qpu, mb.unit AS bom_unit, p.stock_unit, p.category, p.name
      FROM public.mrp_bom mb JOIN public.mrp_products p ON p.id = mb.insumo_id
      WHERE mb.product_id = v_pid
  LOOP
    IF v_route = 'zero' AND b.category = 'Semi-acabado' THEN
      semi_needed := b.qpu * v_qty;
      FOR sub IN
        SELECT mb2.insumo_id, mb2.quantity_per_unit AS qpu, mb2.unit AS bom_unit, p2.stock_unit, p2.name
          FROM public.mrp_bom mb2 JOIN public.mrp_products p2 ON p2.id = mb2.insumo_id
          WHERE mb2.product_id = b.insumo_id
      LOOP
        sub_su := coalesce(nullif(sub.stock_unit, ''), sub.bom_unit, 'un');
        sub_needed := public.carbo_convert_unit(sub.qpu * semi_needed, coalesce(sub.bom_unit, sub_su), sub_su);
        IF sub_needed IS NULL THEN
          RAISE EXCEPTION 'Unidade incompatível no insumo "%": ficha em % e estoque em %. Ajuste a ficha antes de separar.',
            sub.name, coalesce(sub.bom_unit, '?'), sub_su;
        END IF;
        PERFORM public.op_apply_delta(p_op_id, sub.insumo_id, -sub_needed, 'separacao');
      END LOOP;
    ELSE
      su := coalesce(nullif(b.stock_unit, ''), b.bom_unit, 'un');
      needed := public.carbo_convert_unit(b.qpu * v_qty, coalesce(b.bom_unit, su), su);
      IF needed IS NULL THEN
        RAISE EXCEPTION 'Unidade incompatível no insumo "%": ficha em % e estoque em %. Ajuste a ficha antes de separar.',
          b.name, coalesce(b.bom_unit, '?'), su;
      END IF;
      PERFORM public.op_apply_delta(p_op_id, b.insumo_id, -needed, 'separacao');
    END IF;
  END LOOP;
END $$;

GRANT EXECUTE ON FUNCTION public.op_deduct_materials(uuid) TO authenticated;
