-- ─────────────────────────────────────────────────────────────────────────────
-- Movimentação real de estoque (HUB-RN) no ciclo do pós-venda:
--   • Produção CONCLUÍDA  → CREDITA o estoque com os itens do pedido.
--   • Pedido SEPARADO     → DEDUZ o estoque com os itens do pedido.
-- Idempotente: flags stock_credited / stock_deducted garantem que cada pedido
-- credita/deduz UMA vez só (o flip do flag é atômico no UPDATE ... WHERE flag=false).
-- Só mexe em itens com product_id vinculado (vendas novas); item sem vínculo é ignorado.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.carboze_orders
  ADD COLUMN IF NOT EXISTS stock_credited boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS stock_deducted boolean NOT NULL DEFAULT false;

-- Credita o estoque do HUB-RN com os itens do pedido (produção concluída).
CREATE OR REPLACE FUNCTION public.pos_venda_credit_stock(p_order_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE wh uuid; it jsonb; pid uuid; qty int;
BEGIN
  UPDATE public.carboze_orders
    SET stock_credited = true, production_done = true, updated_at = now()
    WHERE id = p_order_id AND stock_credited = false;
  IF NOT FOUND THEN RETURN; END IF;  -- já creditado

  SELECT id INTO wh FROM public.warehouses WHERE code = 'HUB-RN' LIMIT 1;
  IF wh IS NULL THEN RETURN; END IF;

  FOR it IN SELECT jsonb_array_elements(coalesce((SELECT items FROM public.carboze_orders WHERE id = p_order_id), '[]'::jsonb))
  LOOP
    pid := nullif(it->>'product_id', '')::uuid;
    qty := coalesce((it->>'quantity')::int, 0);
    IF pid IS NOT NULL AND qty > 0 THEN
      INSERT INTO public.warehouse_stock (warehouse_id, product_id, quantity)
      VALUES (wh, pid, qty)
      ON CONFLICT (warehouse_id, product_id)
      DO UPDATE SET quantity = public.warehouse_stock.quantity + qty, updated_at = now();
    END IF;
  END LOOP;
END $$;

-- Deduz o estoque do HUB-RN com os itens do pedido (pedido separado).
CREATE OR REPLACE FUNCTION public.pos_venda_deduct_stock(p_order_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE wh uuid; it jsonb; pid uuid; qty int;
BEGIN
  UPDATE public.carboze_orders
    SET stock_deducted = true, updated_at = now()
    WHERE id = p_order_id AND stock_deducted = false;
  IF NOT FOUND THEN RETURN; END IF;  -- já deduzido

  SELECT id INTO wh FROM public.warehouses WHERE code = 'HUB-RN' LIMIT 1;
  IF wh IS NULL THEN RETURN; END IF;

  FOR it IN SELECT jsonb_array_elements(coalesce((SELECT items FROM public.carboze_orders WHERE id = p_order_id), '[]'::jsonb))
  LOOP
    pid := nullif(it->>'product_id', '')::uuid;
    qty := coalesce((it->>'quantity')::int, 0);
    IF pid IS NOT NULL AND qty > 0 THEN
      UPDATE public.warehouse_stock
        SET quantity = quantity - qty, updated_at = now()
        WHERE warehouse_id = wh AND product_id = pid;
    END IF;
  END LOOP;
END $$;

GRANT EXECUTE ON FUNCTION public.pos_venda_credit_stock(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pos_venda_deduct_stock(uuid) TO authenticated;
