-- Etapa 'agendado' no pós-venda + parcela nasce parada
--
-- Sem isto, a parcela de recorrência apareceria no quadro do pós-venda em
-- "Nova Venda", lado a lado com venda de verdade — a Logística separaria um
-- pedido de dezembro em agosto. Ela ganha coluna própria, no início do quadro,
-- de onde não sai por arrasto: sai sozinha quando o mês dela chega.
--
-- A lista de etapas é do packages/posvenda (fonte única, consumida por Ops e
-- Sales). Este CHECK precisa bater com ela — etapa no pacote sem migração aqui
-- vira erro de constraint na hora de mover o card.

ALTER TABLE public.carboze_orders
  DROP CONSTRAINT IF EXISTS carboze_orders_fulfillment_stage_check;

ALTER TABLE public.carboze_orders
  ADD CONSTRAINT carboze_orders_fulfillment_stage_check
  CHECK (fulfillment_stage IN (
    'agendado',
    'nova_venda', 'separacao_pendente', 'criar_op', 'separando', 'separado',
    'gerar_nf', 'nf_finalizada', 'emitir_etiqueta',
    'em_transporte', 'entregue', 'cancelado'
  ));

-- ── A parcela nasce parada ───────────────────────────────────────────────────
-- Substitui o 'nova_venda' que a 20260846 gravava.
CREATE OR REPLACE FUNCTION public.carboze_criar_recorrencia(
  p_parent_id uuid, p_period text, p_total integer
)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_step integer; v_parent public.carboze_orders; v_base date;
  v_i integer; v_criadas integer := 0;
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

  v_base := date_trunc('month', coalesce(v_parent.sale_date, current_date))::date;

  UPDATE public.carboze_orders SET
    order_type = 'recorrente', is_recurring = true, recurrence_period = p_period,
    recurrence_index = 1, recurrence_total = p_total, scheduled_month = v_base
  WHERE id = p_parent_id;

  FOR v_i IN 2..p_total LOOP
    INSERT INTO public.carboze_orders
    SELECT (jsonb_populate_record(NULL::public.carboze_orders,
      to_jsonb(v_parent) || jsonb_build_object(
        'id', gen_random_uuid(), 'order_number', '', 'status', 'agendado',
        'parent_order_id', p_parent_id, 'order_type', 'recorrente', 'is_recurring', true,
        'recurrence_period', p_period, 'recurrence_index', v_i, 'recurrence_total', p_total,
        'scheduled_month', (v_base + make_interval(months => (v_i-1)*v_step))::date,
        'sale_date',       (v_base + make_interval(months => (v_i-1)*v_step))::date,
        'agreed_delivery_date', CASE WHEN v_parent.agreed_delivery_date IS NULL THEN NULL
          ELSE (v_parent.agreed_delivery_date + make_interval(months => (v_i-1)*v_step))::date END,
        'created_at', now(), 'updated_at', now(),
        'confirmed_at', NULL, 'invoiced_at', NULL, 'invoice_number', NULL,
        'shipped_at', NULL, 'delivered_at', NULL, 'cancelled_at', NULL,
        'tracking_code', NULL, 'tracking_url', NULL, 'nf_access_key', NULL,
        'bling_nf_id', NULL, 'created_op_id', NULL, 'created_os_id', NULL,
        'commission_paid_at', NULL,
        'fulfillment_stage', 'agendado'   -- ← card parado no quadro
      ))).*;
    v_criadas := v_criadas + 1;
  END LOOP;

  RETURN v_criadas;
END $$;

-- ── Ao ativar, o card entra na fila de trabalho ──────────────────────────────
CREATE OR REPLACE FUNCTION public.carboze_ativar_parcelas_devidas()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_count integer := 0; r_order record; r_prazo record;
BEGIN
  FOR r_order IN
    SELECT id, agreed_delivery_date FROM public.carboze_orders
    WHERE status = 'agendado' AND scheduled_month IS NOT NULL
      AND scheduled_month <= date_trunc('month', current_date)::date
    FOR UPDATE
  LOOP
    IF r_order.agreed_delivery_date IS NOT NULL THEN
      SELECT * INTO r_prazo
      FROM public.carbo_compute_prazos(current_date, r_order.agreed_delivery_date);
      UPDATE public.carboze_orders SET
        status = 'pending',
        fulfillment_stage = 'nova_venda',   -- sai da coluna parada
        ppf_date = r_prazo.ppf, ppe_date = r_prazo.ppe,
        delivery_lead_business_days = r_prazo.available,
        delivery_below_minimum = r_prazo.below_min,
        production_approval_status = CASE
          WHEN r_prazo.below_min AND coalesce((SELECT enabled FROM public.prazo_config WHERE id), false)
          THEN 'pending' ELSE 'auto_approved' END
      WHERE id = r_order.id;
    ELSE
      UPDATE public.carboze_orders
      SET status = 'pending', fulfillment_stage = 'nova_venda'
      WHERE id = r_order.id;
    END IF;
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END $$;

NOTIFY pgrst, 'reload schema';
