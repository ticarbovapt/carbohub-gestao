-- ═══════════════════════════════════════════════════════════════════════════
-- Lote (transferências entre hubs) — atomicidade + histórico.
--
--  A9  Registrar debitava o RN e SÓ DEPOIS inseria o stock_transfers em outra
--      chamada. Se o insert falhasse, o saldo sumia sem registro. Agora débito +
--      insert acontecem na MESMA função (transação única) → ou tudo, ou nada.
--
--  A10 register/confirm/estorno faziam get→set (valor ABSOLUTO): duas operações
--      concorrentes se sobrescreviam (lost update). Agora tudo é delta RELATIVO
--      (quantity = quantity ± x) com trava FOR UPDATE na conferência de saldo.
--
--  C10 Transferências mexiam em warehouse_stock mas NÃO gravavam stock_movements
--      → sumiam do histórico e dos KPIs. Agora cada perna gera um movimento
--      (saída no RN ao registrar, entrada no destino ao confirmar, entrada no RN
--      ao estornar), origem 'transferencia'.
-- ═══════════════════════════════════════════════════════════════════════════

-- Passa a aceitar 'transferencia' como origem de movimento (além de PC/OP/ajuste),
-- pra distinguir transferência de ajuste manual no histórico.
CREATE OR REPLACE FUNCTION public.validate_stock_movement()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.tipo NOT IN ('entrada', 'saida') THEN
    RAISE EXCEPTION 'Tipo de movimento inválido: %', NEW.tipo;
  END IF;
  IF NEW.origem NOT IN ('PC', 'OP', 'ajuste', 'transferencia') THEN
    RAISE EXCEPTION 'Origem de movimento inválida: %', NEW.origem;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- ─── Registrar envio RN → destino (débito + registro atômicos) ───────────────
CREATE OR REPLACE FUNCTION public.ops_transfer_register(
  p_product_id uuid, p_product_code text, p_to_code text,
  p_qty numeric, p_notes text, p_user uuid
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE from_id uuid; to_id uuid; cur numeric; tid uuid;
BEGIN
  IF p_qty IS NULL OR p_qty <= 0 THEN RAISE EXCEPTION 'Quantidade inválida.'; END IF;
  SELECT id INTO from_id FROM public.warehouses WHERE code = 'HUB-RN' LIMIT 1;
  SELECT id INTO to_id   FROM public.warehouses WHERE code = p_to_code LIMIT 1;
  IF from_id IS NULL THEN RAISE EXCEPTION 'Hub Natal (HUB-RN) não encontrado.'; END IF;
  IF to_id   IS NULL THEN RAISE EXCEPTION 'Destino não encontrado (%).', p_to_code; END IF;

  -- Trava a linha do RN e confere saldo (anti-concorrência).
  SELECT quantity INTO cur FROM public.warehouse_stock
    WHERE warehouse_id = from_id AND product_id = p_product_id FOR UPDATE;
  cur := coalesce(cur, 0);
  IF p_qty > cur THEN RAISE EXCEPTION 'Saldo insuficiente no Hub Natal (disponível: %).', cur; END IF;

  -- Débito relativo do RN.
  UPDATE public.warehouse_stock SET quantity = quantity - p_qty, updated_at = now()
    WHERE warehouse_id = from_id AND product_id = p_product_id;

  -- Registro da transferência (approved + pre_debited).
  INSERT INTO public.stock_transfers (
    product_id, product_code, from_hub, to_hub, quantity, status, pre_debited,
    approved_by, approved_at, notes
  ) VALUES (
    p_product_id, p_product_code, from_id, to_id, p_qty, 'approved', true,
    p_user, now(), p_notes
  ) RETURNING id INTO tid;

  -- Histórico: saída no RN.
  INSERT INTO public.stock_movements (product_id, warehouse_id, tipo, quantidade, origem, origem_id, observacoes, created_by)
    VALUES (p_product_id, from_id, 'saida', p_qty, 'transferencia', tid,
            concat('[HUB-RN → ', p_to_code, '] envio', CASE WHEN p_notes IS NOT NULL AND p_notes <> '' THEN ' · ' || p_notes ELSE '' END), p_user);

  RETURN tid;
END $$;

-- ─── Confirmar chegada (status approved→executed + crédito atômicos) ──────────
CREATE OR REPLACE FUNCTION public.ops_transfer_confirm(p_transfer_id uuid, p_user uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_to uuid; v_pid uuid; v_qty numeric; v_tocode text;
BEGIN
  -- Flip condicional (anti-duplo-crédito) já retornando os dados.
  UPDATE public.stock_transfers
    SET status = 'executed', executed_by = p_user, executed_at = now()
    WHERE id = p_transfer_id AND status = 'approved'
    RETURNING to_hub, product_id, quantity INTO v_to, v_pid, v_qty;
  IF NOT FOUND THEN RAISE EXCEPTION 'Envio já confirmado ou cancelado.'; END IF;

  -- Crédito relativo no destino.
  INSERT INTO public.warehouse_stock (warehouse_id, product_id, quantity)
    VALUES (v_to, v_pid, v_qty)
    ON CONFLICT (warehouse_id, product_id)
    DO UPDATE SET quantity = public.warehouse_stock.quantity + v_qty, updated_at = now();

  SELECT code INTO v_tocode FROM public.warehouses WHERE id = v_to;
  INSERT INTO public.stock_movements (product_id, warehouse_id, tipo, quantidade, origem, origem_id, observacoes, created_by)
    VALUES (v_pid, v_to, 'entrada', v_qty, 'transferencia', p_transfer_id,
            concat('[', coalesce(v_tocode, '?'), '] chegada de transferência'), p_user);
END $$;

-- ─── Estornar envio (status approved→cancelled + devolução ao RN atômicos) ────
CREATE OR REPLACE FUNCTION public.ops_transfer_estorno(p_transfer_id uuid, p_user uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_from uuid; v_pid uuid; v_qty numeric; v_pre boolean;
BEGIN
  UPDATE public.stock_transfers
    SET status = 'cancelled'
    WHERE id = p_transfer_id AND status = 'approved'
    RETURNING from_hub, product_id, quantity, pre_debited INTO v_from, v_pid, v_qty, v_pre;
  IF NOT FOUND THEN RAISE EXCEPTION 'Envio já confirmado ou cancelado.'; END IF;

  -- Devolve ao RN só se o saldo foi debitado na criação.
  IF v_pre THEN
    INSERT INTO public.warehouse_stock (warehouse_id, product_id, quantity)
      VALUES (v_from, v_pid, v_qty)
      ON CONFLICT (warehouse_id, product_id)
      DO UPDATE SET quantity = public.warehouse_stock.quantity + v_qty, updated_at = now();
    INSERT INTO public.stock_movements (product_id, warehouse_id, tipo, quantidade, origem, origem_id, observacoes, created_by)
      VALUES (v_pid, v_from, 'entrada', v_qty, 'transferencia', p_transfer_id,
              '[HUB-RN] estorno de envio', p_user);
  END IF;
END $$;

GRANT EXECUTE ON FUNCTION public.ops_transfer_register(uuid, text, text, numeric, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ops_transfer_confirm(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ops_transfer_estorno(uuid, uuid) TO authenticated;
