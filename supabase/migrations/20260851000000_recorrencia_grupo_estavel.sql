-- O contrato de recorrência ganha identidade própria
--
-- Estava assim: o contrato era identificado por coalesce(parent_order_id, id) —
-- ou seja, pela LINHA do pedido-pai. Apagar a parcela 1 dispara o
-- ON DELETE SET NULL da FK, os filhos perdem o parent_order_id e cada um vira um
-- "contrato" de uma parcela só. Aconteceu de verdade: um contrato mensal de 3
-- entregas apareceu como 2 contratos separados depois que a 1ª foi excluída.
--
-- Identidade de contrato não pode depender de uma linha que alguém pode apagar.
-- Agora todas as parcelas — inclusive a primeira — carregam o mesmo
-- recurrence_group_id. Apagar qualquer parcela não desmonta o resto.

ALTER TABLE public.carboze_orders
  ADD COLUMN IF NOT EXISTS recurrence_group_id uuid;

COMMENT ON COLUMN public.carboze_orders.recurrence_group_id IS
  'Identidade do contrato de recorrência. Igual em todas as parcelas e estável '
  'mesmo que a parcela 1 seja excluída.';

CREATE INDEX IF NOT EXISTS idx_carboze_orders_recurrence_group
  ON public.carboze_orders (recurrence_group_id)
  WHERE recurrence_group_id IS NOT NULL;

-- ── Backfill 1: cadeias intactas ────────────────────────────────────────────
UPDATE public.carboze_orders o
SET recurrence_group_id = coalesce(o.parent_order_id, o.id)
WHERE o.recurrence_total IS NOT NULL
  AND o.recurrence_group_id IS NULL
  AND (o.parent_order_id IS NOT NULL OR EXISTS (
        SELECT 1 FROM public.carboze_orders f WHERE f.parent_order_id = o.id));

-- ── Backfill 2: órfãos, cujo pai já foi apagado ─────────────────────────────
-- Sem parent_order_id não há como saber com certeza quem era do mesmo contrato.
-- A heurística usa o que a RPC grava idêntico em todas as parcelas de uma
-- criação: mesmo cliente, mesma periodicidade, mesmo total de parcelas e mesmo
-- instante de criação (elas nascem no mesmo INSERT, dentro do mesmo segundo).
-- É reconstrução de dado perdido, então fica explícita em vez de escondida.
WITH orfaos AS (
  SELECT o.id,
         first_value(o.id) OVER (
           PARTITION BY o.customer_name, o.recurrence_period, o.recurrence_total,
                        date_trunc('second', o.created_at)
           ORDER BY o.recurrence_index
         ) AS grupo
  FROM public.carboze_orders o
  WHERE o.recurrence_total IS NOT NULL
    AND o.recurrence_group_id IS NULL
    AND o.parent_order_id IS NULL
)
UPDATE public.carboze_orders o
SET recurrence_group_id = orfaos.grupo
FROM orfaos
WHERE orfaos.id = o.id;

-- ── A RPC passa a gravar o grupo ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.carboze_criar_recorrencia(
  p_parent_id uuid, p_period text, p_total integer
)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_step integer; v_parent public.carboze_orders; v_base date;
  v_i integer; v_criadas integer := 0; v_grupo uuid;
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
  v_grupo := gen_random_uuid();   -- identidade do CONTRATO, não de uma linha

  UPDATE public.carboze_orders SET
    order_type = 'recorrente', is_recurring = true, recurrence_period = p_period,
    recurrence_index = 1, recurrence_total = p_total, scheduled_month = v_base,
    recurrence_group_id = v_grupo
  WHERE id = p_parent_id;

  FOR v_i IN 2..p_total LOOP
    INSERT INTO public.carboze_orders
    SELECT (jsonb_populate_record(NULL::public.carboze_orders,
      to_jsonb(v_parent) || jsonb_build_object(
        'id', gen_random_uuid(), 'order_number', '', 'status', 'agendado',
        'parent_order_id', p_parent_id, 'recurrence_group_id', v_grupo,
        'order_type', 'recorrente', 'is_recurring', true,
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
        'fulfillment_stage', 'agendado'
      ))).*;
    v_criadas := v_criadas + 1;
  END LOOP;

  RETURN v_criadas;
END $$;

-- ── A agenda passa a usar o grupo estável ───────────────────────────────────
CREATE OR REPLACE VIEW public.carboze_recorrencia_agenda AS
SELECT
  o.id, o.order_number, o.customer_name, o.vendedor_name, o.total, o.status,
  o.scheduled_month, o.recurrence_period, o.recurrence_index, o.recurrence_total,
  coalesce(o.recurrence_group_id, o.parent_order_id, o.id) AS contrato_id,
  CASE
    WHEN o.status <> 'agendado'                                       THEN 'ativada'
    WHEN o.scheduled_month <= date_trunc('month', current_date)::date THEN 'ATRASADA'
    ELSE 'futura'
  END AS situacao
FROM public.carboze_orders o
WHERE o.recurrence_total IS NOT NULL
ORDER BY coalesce(o.recurrence_group_id, o.parent_order_id, o.id), o.recurrence_index;

GRANT SELECT ON public.carboze_recorrencia_agenda TO authenticated;

NOTIFY pgrst, 'reload schema';
