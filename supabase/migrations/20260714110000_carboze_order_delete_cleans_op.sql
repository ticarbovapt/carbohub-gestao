-- ─────────────────────────────────────────────────────────────────────────────
-- Exclusão de venda agora LIMPA o rastro operacional (sem deixar resíduo).
--
-- Antes: apagar a venda só removia o "papel" (linha + itens + histórico +
-- embarque via cascade). O que ficava pendurado:
--   • a baixa de estoque da separação (HUB-RN) continuava deduzida;
--   • a(s) OP(s) geradas ficavam órfãs em Ordens de Produção (source_order_id
--     virava NULL) e seus movimentos de insumo/produto seguiam no ledger.
--
-- Agora, antes de apagar a venda, a função:
--   1) ESTORNA a baixa da separação (pos_venda_restore_stock) → credita o
--      HUB-RN de volta;
--   2) para cada OP do pedido: REVERTE o ledger (op_reverse_all desfaz insumos
--      consumidos e produto creditado) e EXCLUI a OP (o trigger de auditoria
--      registra a exclusão da OP).
--
-- Resultado: excluir uma venda de teste devolve o estoque ao estado anterior e
-- remove a OP — nada fica pendurado. Continua gestor-only e com snapshot no log.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.carboze_order_delete(p_id uuid, p_reason text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_row  public.carboze_orders;
  v_name text;
  v_op   uuid;
BEGIN
  -- Só gestor pode excluir (mesmo com chamada direta à API).
  IF NOT public.carbo_is_gestor(auth.uid()) THEN
    RAISE EXCEPTION 'Apenas gestor pode excluir vendas';
  END IF;

  SELECT * INTO v_row FROM public.carboze_orders WHERE id = p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Venda não encontrada';
  END IF;

  SELECT full_name INTO v_name FROM public.profiles WHERE id = auth.uid();

  -- Log ANTES de apagar (snapshot completo).
  INSERT INTO public.carboze_order_deletions (
    order_id, order_number, customer_name, vendedor_id, vendedor_name, total, status,
    order_snapshot, reason, deleted_by, deleted_by_name
  ) VALUES (
    v_row.id, v_row.order_number, v_row.customer_name, v_row.vendedor_id, v_row.vendedor_name,
    v_row.total, v_row.status, to_jsonb(v_row), p_reason, auth.uid(), v_name
  );

  -- 1) Estorna a baixa de estoque da separação (credita o HUB-RN de volta).
  BEGIN PERFORM public.pos_venda_restore_stock(p_id); EXCEPTION WHEN undefined_function THEN NULL; END;

  -- 2) Reverte o ledger e EXCLUI cada OP gerada por este pedido (nada fica
  --    pendurado na produção nem no estoque de insumos/produto).
  FOR v_op IN SELECT id FROM public.production_orders WHERE source_order_id = p_id LOOP
    BEGIN PERFORM public.op_reverse_all(v_op); EXCEPTION WHEN undefined_function THEN NULL; END;
    DELETE FROM public.production_orders WHERE id = v_op;
  END LOOP;

  -- Solta referências opcionais que bloqueariam o DELETE (ledgers/comissões).
  -- (Itens do pedido têm ON DELETE CASCADE e somem sozinhos.)
  BEGIN UPDATE public.credit_transactions   SET order_id = NULL         WHERE order_id = p_id;         EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN UPDATE public.licensee_requests     SET carboze_order_id = NULL WHERE carboze_order_id = p_id; EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN UPDATE public.licensee_commissions  SET carboze_order_id = NULL WHERE carboze_order_id = p_id; EXCEPTION WHEN undefined_table THEN NULL; END;

  DELETE FROM public.carboze_orders WHERE id = p_id;
END; $$;

REVOKE ALL  ON FUNCTION public.carboze_order_delete(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.carboze_order_delete(uuid, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
