-- ─────────────────────────────────────────────────────────────────────────────
-- Exclusão de venda (carboze_orders) por GESTOR, com log auditável e SILENCIOSO.
--
-- • Só gestor (carbo_is_gestor) pode excluir — validado no banco (não só no front).
-- • Toda exclusão grava um registro em carboze_order_deletions ANTES de apagar:
--   quem apagou, quando, e um snapshot completo da venda (jsonb) — rastreável.
-- • A tabela de log tem RLS ligado e ZERO policy → ninguém a lê pela API
--   (nem gestor). Só quem tem acesso ao SQL/service role enxerga. "Ninguém
--   precisa saber que existe, salvo em sistema."
-- • Numeração: generate_order_number usa MAX(seq)+1 do mês, então apagar uma
--   venda libera o número naturalmente e as próximas seguem a sequência.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1) Tabela de auditoria (invisível pela API) ────────────────────────────────
CREATE TABLE IF NOT EXISTS public.carboze_order_deletions (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id       uuid NOT NULL,
  order_number   text,
  customer_name  text,
  vendedor_id    uuid,
  vendedor_name  text,
  total          numeric,
  status         text,
  order_snapshot jsonb NOT NULL,          -- linha inteira da venda, pra rastreabilidade total
  reason         text,
  deleted_by     uuid NOT NULL DEFAULT auth.uid(),
  deleted_by_name text,
  deleted_at     timestamptz NOT NULL DEFAULT now()
);

-- RLS ligado + nenhuma policy = ninguém acessa via PostgREST (função abaixo é
-- SECURITY DEFINER e insere ignorando RLS).
ALTER TABLE public.carboze_order_deletions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.carboze_order_deletions FROM anon, authenticated;

-- 2) Função de exclusão auditada ─────────────────────────────────────────────
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

  -- Log ANTES de apagar (snapshot completo).
  INSERT INTO public.carboze_order_deletions (
    order_id, order_number, customer_name, vendedor_id, vendedor_name, total, status,
    order_snapshot, reason, deleted_by, deleted_by_name
  ) VALUES (
    v_row.id, v_row.order_number, v_row.customer_name, v_row.vendedor_id, v_row.vendedor_name,
    v_row.total, v_row.status, to_jsonb(v_row), p_reason, auth.uid(), v_name
  );

  -- Solta referências opcionais que bloqueariam o DELETE (ledgers/comissões).
  -- (Itens do pedido têm ON DELETE CASCADE e somem sozinhos.)
  BEGIN UPDATE public.credit_transactions   SET order_id = NULL         WHERE order_id = p_id;         EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN UPDATE public.licensee_requests     SET carboze_order_id = NULL WHERE carboze_order_id = p_id; EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN UPDATE public.licensee_commissions  SET carboze_order_id = NULL WHERE carboze_order_id = p_id; EXCEPTION WHEN undefined_table THEN NULL; END;

  DELETE FROM public.carboze_orders WHERE id = p_id;
END; $$;

-- Só usuário autenticado executa (a própria função barra quem não é gestor).
REVOKE ALL  ON FUNCTION public.carboze_order_delete(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.carboze_order_delete(uuid, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
