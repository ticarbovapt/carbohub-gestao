-- ─────────────────────────────────────────────────────────────────────────────
-- Estorno de insumos: se uma OP separada VOLTA pra uma etapa anterior (ou é
-- cancelada), os insumos deduzidos do HUB-RN são CREDITADOS de volta e o flag
-- materials_deducted volta a false (permite nova separação depois).
-- Espelha op_deduct_materials (mesma explosão de semi-acabado por rota), somando.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.op_restore_materials(p_op_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  wh uuid; v_pid uuid; v_qty numeric; v_route text;
  b record; sub record; needed numeric; su text; semi_needed numeric; sub_needed numeric; sub_su text;
BEGIN
  UPDATE public.production_orders
    SET materials_deducted = false
    WHERE id = p_op_id AND materials_deducted = true AND product_id IS NOT NULL;
  IF NOT FOUND THEN RETURN; END IF;  -- não estava deduzido → nada a estornar

  SELECT product_id, coalesce(planned_quantity, quantity, 0), production_route
    INTO v_pid, v_qty, v_route FROM public.production_orders WHERE id = p_op_id;
  IF v_pid IS NULL OR v_qty <= 0 THEN RETURN; END IF;

  SELECT id INTO wh FROM public.warehouses WHERE code = 'HUB-RN' LIMIT 1;
  IF wh IS NULL THEN RETURN; END IF;

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
        IF sub_needed > 0 THEN
          UPDATE public.warehouse_stock SET quantity = quantity + sub_needed, updated_at = now()
            WHERE warehouse_id = wh AND product_id = sub.insumo_id;
        END IF;
      END LOOP;
    ELSE
      su := coalesce(nullif(b.stock_unit, ''), b.bom_unit, 'un');
      needed := public.carbo_convert_unit(b.qpu * v_qty, coalesce(b.bom_unit, su), su);
      IF needed IS NULL THEN needed := b.qpu * v_qty; END IF;
      IF needed > 0 THEN
        UPDATE public.warehouse_stock SET quantity = quantity + needed, updated_at = now()
          WHERE warehouse_id = wh AND product_id = b.insumo_id;
      END IF;
    END IF;
  END LOOP;
END $$;

GRANT EXECUTE ON FUNCTION public.op_restore_materials(uuid) TO authenticated;
