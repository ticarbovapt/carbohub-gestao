-- ─────────────────────────────────────────────────────────────────────────────
-- Ajuste: excluir venda também EXCLUI a OP, mas NÃO mexe no estoque.
--
-- Decisão do negócio: devolver estoque na exclusão é arriscado (pode estornar
-- errado). Então a exclusão:
--   • mantém o log auditável de sempre (quem excluiu, quando, snapshot, motivo);
--   • EXCLUI a(s) OP(s) geradas pelo pedido (some da produção). Os movimentos
--     de estoque JÁ APLICADOS (baixa da separação, insumos consumidos, produto
--     creditado) PERMANECEM no warehouse_stock — nada é revertido.
--
-- Observação técnica: op_stock_ledger e op_material_loss têm ON DELETE CASCADE,
-- então apagar a OP remove o LEDGER dela, mas o warehouse_stock (estoque físico)
-- não é alterado — que é justamente o comportamento desejado. O trigger de
-- auditoria de produção registra a exclusão da OP.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.carboze_order_delete(p_id uuid, p_reason text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_row  public.carboze_orders;
  v_name text;
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

  -- Log ANTES de apagar (snapshot completo: quem, quando, motivo, linha inteira).
  INSERT INTO public.carboze_order_deletions (
    order_id, order_number, customer_name, vendedor_id, vendedor_name, total, status,
    order_snapshot, reason, deleted_by, deleted_by_name
  ) VALUES (
    v_row.id, v_row.order_number, v_row.customer_name, v_row.vendedor_id, v_row.vendedor_name,
    v_row.total, v_row.status, to_jsonb(v_row), p_reason, auth.uid(), v_name
  );

  -- Exclui a(s) OP(s) do pedido — SEM reverter estoque. O CASCADE limpa o ledger
  -- da OP, mas o warehouse_stock (baixas/produção já aplicadas) NÃO é alterado.
  DELETE FROM public.production_orders WHERE source_order_id = p_id;

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
