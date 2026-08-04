-- Cada parcela tem os SEUS prazos de fabricação e expedição
--
-- A parcela é criada copiando o pai (to_jsonb) e só o que precisa mudar é
-- sobrescrito. `agreed_delivery_date` era deslocado mês a mês, mas `ppf_date` e
-- `ppe_date` não — ficavam iguais aos do pai. Resultado: a parcela de setembro
-- dizia "fabricar até 07/08", data de agosto, um mês antes da própria entrega.
--
-- Passou despercebido porque nada mostrava esses campos até agora. A tela de
-- Vendas de Recorrência tem coluna "produzir até" e "enviar até" — aí aparece.
--
-- carbo_compute_prazos calcula PPE/PPF para trás a partir da data de entrega
-- (último dia útil <= entrega, menos o offset), então basta chamá-la com a data
-- de entrega já deslocada de cada parcela.

-- ── 1) A RPC passa a calcular os prazos de cada parcela ─────────────────────
CREATE OR REPLACE FUNCTION public.carboze_criar_recorrencia(
  p_parent_id uuid, p_period text, p_total integer
)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_step integer; v_parent public.carboze_orders; v_base date;
  v_i integer; v_criadas integer := 0; v_grupo uuid;
  v_entrega date; v_prazo record;
BEGIN
  v_step := public.carbo_recurrence_step(p_period);
  IF v_step IS NULL THEN RAISE EXCEPTION 'Periodicidade inválida: %', p_period; END IF;
  IF p_total IS NULL OR p_total < 2 OR p_total > 60 THEN
    RAISE EXCEPTION 'Número de parcelas deve estar entre 2 e 60 (recebido: %)', p_total;
  END IF;

  SELECT * INTO v_parent FROM public.carboze_orders WHERE id = p_parent_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pedido % não encontrado', p_parent_id; END IF;
  IF v_parent.status <> 'pending' THEN
    RAISE EXCEPTION 'Só um pedido novo (pending) pode virar recorrência; este está em %', v_parent.status;
  END IF;
  IF v_parent.recurrence_total IS NOT NULL THEN
    RAISE EXCEPTION 'Pedido % já é uma recorrência', v_parent.order_number;
  END IF;

  v_base  := date_trunc('month', coalesce(v_parent.sale_date, current_date))::date;
  v_grupo := gen_random_uuid();

  UPDATE public.carboze_orders SET
    order_type = 'recorrente', is_recurring = true, recurrence_period = p_period,
    recurrence_index = 1, recurrence_total = p_total, scheduled_month = v_base,
    recurrence_group_id = v_grupo
  WHERE id = p_parent_id;

  FOR v_i IN 2..p_total LOOP
    v_entrega := CASE WHEN v_parent.agreed_delivery_date IS NULL THEN NULL
                      ELSE (v_parent.agreed_delivery_date
                            + make_interval(months => (v_i - 1) * v_step))::date END;

    IF v_entrega IS NOT NULL THEN
      SELECT * INTO v_prazo FROM public.carbo_compute_prazos(current_date, v_entrega);
    ELSE
      v_prazo := NULL;
    END IF;

    INSERT INTO public.carboze_orders
    SELECT (jsonb_populate_record(NULL::public.carboze_orders,
      to_jsonb(v_parent) || jsonb_build_object(
        'id', gen_random_uuid(), 'order_number', '', 'status', 'agendado',
        'parent_order_id', p_parent_id, 'recurrence_group_id', v_grupo,
        'order_type', 'recorrente', 'is_recurring', true,
        'recurrence_period', p_period, 'recurrence_index', v_i, 'recurrence_total', p_total,
        'scheduled_month', (v_base + make_interval(months => (v_i-1)*v_step))::date,
        'sale_date',       (v_base + make_interval(months => (v_i-1)*v_step))::date,
        'agreed_delivery_date', v_entrega,
        -- Prazos DESTA parcela, não os do pai.
        'ppf_date', CASE WHEN v_entrega IS NULL THEN NULL ELSE v_prazo.ppf END,
        'ppe_date', CASE WHEN v_entrega IS NULL THEN NULL ELSE v_prazo.ppe END,
        'delivery_lead_business_days',
          CASE WHEN v_entrega IS NULL THEN NULL ELSE v_prazo.available END,
        'delivery_below_minimum',
          CASE WHEN v_entrega IS NULL THEN false ELSE v_prazo.below_min END,
        'created_at', now(), 'updated_at', now(),
        'confirmed_at', NULL, 'invoiced_at', NULL, 'invoice_number', NULL,
        'shipped_at', NULL, 'delivered_at', NULL, 'cancelled_at', NULL,
        'tracking_code', NULL, 'tracking_url', NULL, 'nf_access_key', NULL,
        'bling_nf_id', NULL, 'created_op_id', NULL, 'created_os_id', NULL,
        'commission_paid_at', NULL,
        'fulfillment_stage', 'agendado'
      ))).*;
    v_criadas := v_criadas + 1;
  END LOOP;

  RETURN v_criadas;
END $$;

-- ── 2) Conserta as parcelas que já nasceram com o prazo do pai ──────────────
-- Só as ainda agendadas: parcela já ativada teve o prazo recalculado na
-- ativação e não deve ser mexida.
-- O LATERAL precisa de uma subconsulta própria: em UPDATE ... FROM não se pode
-- referenciar a tabela alvo dentro do FROM ("there is an entry for table o, but
-- it cannot be referenced from this part of the query").
UPDATE public.carboze_orders o
SET ppf_date  = p.ppf,
    ppe_date  = p.ppe,
    delivery_lead_business_days = p.available,
    delivery_below_minimum      = p.below_min,
    updated_at = now()
FROM (
  SELECT x.id, c.ppf, c.ppe, c.available, c.below_min
  FROM public.carboze_orders x
  CROSS JOIN LATERAL public.carbo_compute_prazos(current_date, x.agreed_delivery_date) c
  WHERE x.status = 'agendado'
    AND x.agreed_delivery_date IS NOT NULL
) p
WHERE p.id = o.id
  AND (o.ppf_date IS DISTINCT FROM p.ppf OR o.ppe_date IS DISTINCT FROM p.ppe);

NOTIFY pgrst, 'reload schema';
