-- ─────────────────────────────────────────────────────────────────────────────
-- Lote 3b (pós-venda) — integridade de estoque no fluxo de vendas manuais.
--
--  B8  pos_venda_deduct_stock agora RETORNA quantas linhas realmente deduziu
--      (itens com product_id vinculado). O front alerta quando deduz ZERO
--      (pedido sem vínculo de produto) em vez de dizer "estoque deduzido".
--
--  B9  pos_venda_restore_stock: ESTORNA o que foi deduzido quando o pedido
--      volta de "Separado" (ou é cancelado). Credita de volta os itens e
--      zera stock_deducted. Idempotente pelo flip do flag.
-- ─────────────────────────────────────────────────────────────────────────────

-- Muda o tipo de retorno → precisa dropar antes de recriar.
DROP FUNCTION IF EXISTS public.pos_venda_deduct_stock(uuid);

-- Deduz o estoque do HUB-RN com os itens do pedido (pedido separado).
-- Retorna o nº de linhas (itens com product_id) efetivamente deduzidas.
CREATE OR REPLACE FUNCTION public.pos_venda_deduct_stock(p_order_id uuid)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE wh uuid; it jsonb; pid uuid; qty int; n int := 0;
BEGIN
  UPDATE public.carboze_orders
    SET stock_deducted = true, updated_at = now()
    WHERE id = p_order_id AND stock_deducted = false;
  IF NOT FOUND THEN RETURN 0; END IF;  -- já deduzido

  SELECT id INTO wh FROM public.warehouses WHERE code = 'HUB-RN' LIMIT 1;
  IF wh IS NULL THEN RETURN 0; END IF;

  FOR it IN SELECT jsonb_array_elements(coalesce((SELECT items FROM public.carboze_orders WHERE id = p_order_id), '[]'::jsonb))
  LOOP
    pid := nullif(it->>'product_id', '')::uuid;
    qty := coalesce((it->>'quantity')::int, 0);
    IF pid IS NOT NULL AND qty > 0 THEN
      INSERT INTO public.warehouse_stock (warehouse_id, product_id, quantity)
      VALUES (wh, pid, -qty)
      ON CONFLICT (warehouse_id, product_id)
      DO UPDATE SET quantity = public.warehouse_stock.quantity - qty, updated_at = now();
      n := n + 1;
    END IF;
  END LOOP;
  RETURN n;
END $$;

-- Estorna a dedução: credita de volta os itens no HUB-RN e zera o flag.
-- Retorna o nº de linhas creditadas. Idempotente (só age se stock_deducted=true).
CREATE OR REPLACE FUNCTION public.pos_venda_restore_stock(p_order_id uuid)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE wh uuid; it jsonb; pid uuid; qty int; n int := 0;
BEGIN
  UPDATE public.carboze_orders
    SET stock_deducted = false, updated_at = now()
    WHERE id = p_order_id AND stock_deducted = true;
  IF NOT FOUND THEN RETURN 0; END IF;  -- não estava deduzido → nada a estornar

  SELECT id INTO wh FROM public.warehouses WHERE code = 'HUB-RN' LIMIT 1;
  IF wh IS NULL THEN RETURN 0; END IF;

  FOR it IN SELECT jsonb_array_elements(coalesce((SELECT items FROM public.carboze_orders WHERE id = p_order_id), '[]'::jsonb))
  LOOP
    pid := nullif(it->>'product_id', '')::uuid;
    qty := coalesce((it->>'quantity')::int, 0);
    IF pid IS NOT NULL AND qty > 0 THEN
      INSERT INTO public.warehouse_stock (warehouse_id, product_id, quantity)
      VALUES (wh, pid, qty)
      ON CONFLICT (warehouse_id, product_id)
      DO UPDATE SET quantity = public.warehouse_stock.quantity + qty, updated_at = now();
      n := n + 1;
    END IF;
  END LOOP;
  RETURN n;
END $$;

GRANT EXECUTE ON FUNCTION public.pos_venda_deduct_stock(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pos_venda_restore_stock(uuid) TO authenticated;
