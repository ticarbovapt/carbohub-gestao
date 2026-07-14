-- Correção da re-auditoria (garantias, sem mudar o fluxo):
--  • R1: corrida MVCC no production_done quando 2 OPs do mesmo pedido concluem
--    ao mesmo tempo (multiusuário ao vivo) — o pedido nunca ficava "produzido".
--    Serializa por pedido com advisory lock de transação: quem roda por último
--    espera o commit do primeiro e enxerga tudo concluído.
--  • Item 5: OP cancelada NÃO trava mais o selo. "Produzido" = existe alguma OP
--    concluída E não sobra nenhuma OP ABERTA (aberta = nem concluída nem
--    cancelada). Assim, cancelar um item não impede o pedido de seguir.

CREATE OR REPLACE FUNCTION public.op_sync_production_done(p_order_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_done boolean;
BEGIN
  IF p_order_id IS NULL THEN RETURN; END IF;

  -- Trava por pedido (dura até o fim da transação). Duas conclusões simultâneas
  -- do mesmo pedido rodam em sequência; a segunda já vê a primeira commitada.
  PERFORM pg_advisory_xact_lock(hashtext(p_order_id::text));

  SELECT
    EXISTS (SELECT 1 FROM public.production_orders
              WHERE source_order_id = p_order_id AND op_status = 'concluida')
    AND NOT EXISTS (SELECT 1 FROM public.production_orders
              WHERE source_order_id = p_order_id AND op_status NOT IN ('concluida', 'cancelada'))
    INTO v_done;

  UPDATE public.carboze_orders
    SET production_done = v_done, updated_at = now()
    WHERE id = p_order_id AND production_done IS DISTINCT FROM v_done;
END $$;

GRANT EXECUTE ON FUNCTION public.op_sync_production_done(uuid) TO authenticated;
