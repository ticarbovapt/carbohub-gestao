-- Recorrência: parcelas materializadas na venda
--
-- Regra do negócio: ao vender, o vendedor escolhe a periodicidade (mensal,
-- bimestral, ...) e quantas parcelas. O sistema cria TODAS de uma vez, já
-- gravadas, para ninguém precisar recadastrar o pedido todo mês. Cada parcela
-- tem quantidade/valor próprios e editáveis — um mês pode precisar de mais e
-- outro de menos.
--
-- Modelo: 1 pedido-pai (a 1ª parcela, status normal) + N-1 filhos 'agendado',
-- ligados por parent_order_id (coluna que já existia).
--
-- ⚠️ Substitui a recorrência anterior (edge function process-recurring-orders),
-- que era do modelo oposto — criava a PRÓXIMA parcela só depois que a anterior
-- fosse entregue. Ela nunca rodou: nenhum código a chamava e nenhum cron a
-- agendava. Fica removida na mesma leva, porque dispara nos mesmos campos
-- (is_recurring + parent_order_id) e, se alguém a religasse, geraria parcelas
-- duplicadas em cima destas.

-- ── 1) Campos da parcela ─────────────────────────────────────────────────────
ALTER TABLE public.carboze_orders
  ADD COLUMN IF NOT EXISTS recurrence_period text,
  ADD COLUMN IF NOT EXISTS recurrence_index  integer,
  ADD COLUMN IF NOT EXISTS recurrence_total  integer,
  -- Primeiro dia do mês em que a parcela é devida. É a chave da ativação:
  -- ela é DERIVADA da data, não de um ponteiro que pode se perder.
  ADD COLUMN IF NOT EXISTS scheduled_month   date;

ALTER TABLE public.carboze_orders
  DROP CONSTRAINT IF EXISTS carboze_orders_recurrence_period_check;
ALTER TABLE public.carboze_orders
  ADD CONSTRAINT carboze_orders_recurrence_period_check
  CHECK (recurrence_period IS NULL OR recurrence_period IN
    ('mensal', 'bimestral', 'trimestral', 'semestral', 'anual'));

COMMENT ON COLUMN public.carboze_orders.scheduled_month IS
  'Mês devido da parcela (dia 1). Parcela agendada vira venda quando este mês chega.';

-- Índice da varredura diária: poucas linhas 'agendado' entre muitas.
CREATE INDEX IF NOT EXISTS idx_carboze_orders_agendadas
  ON public.carboze_orders (scheduled_month)
  WHERE status = 'agendado';

-- Meses em passos, por periodicidade.
CREATE OR REPLACE FUNCTION public.carbo_recurrence_step(p_period text)
RETURNS integer LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE lower(coalesce(p_period, ''))
           WHEN 'mensal'     THEN 1
           WHEN 'bimestral'  THEN 2
           WHEN 'trimestral' THEN 3
           WHEN 'semestral'  THEN 6
           WHEN 'anual'      THEN 12
         END
$$;
COMMENT ON FUNCTION public.carbo_recurrence_step IS
  'Meses entre parcelas. NULL para periodicidade desconhecida — o chamador deve recusar.';

-- ── 2) Ativação: idempotente e auto-recuperável ──────────────────────────────
-- De propósito NÃO é "vira a próxima": varre TODAS as parcelas cujo mês já
-- chegou. Se o cron falhar num dia, a execução seguinte pega o atrasado — nada
-- fica para trás. Rodar duas vezes no mesmo dia não faz efeito extra.
CREATE OR REPLACE FUNCTION public.carboze_ativar_parcelas_devidas()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_count integer := 0;
  r_order record;
  r_prazo record;
BEGIN
  FOR r_order IN
    SELECT id, agreed_delivery_date, vendedor_id, production_requested_by
    FROM public.carboze_orders
    WHERE status = 'agendado'
      AND scheduled_month IS NOT NULL
      AND scheduled_month <= date_trunc('month', current_date)::date
    FOR UPDATE
  LOOP
    -- Recalcula prazo/aprovação AGORA. O gatilho carbo_set_production_approval
    -- roda só no INSERT: uma parcela criada com 6 meses de antecedência teria
    -- nascido com folga enorme e auto-aprovada, e chegaria no mês dela já
    -- aprovada sem ninguém ter olhado o prazo real.
    IF r_order.agreed_delivery_date IS NOT NULL THEN
      SELECT * INTO r_prazo
      FROM public.carbo_compute_prazos(current_date, r_order.agreed_delivery_date);

      UPDATE public.carboze_orders SET
        status                       = 'pending',
        ppf_date                     = r_prazo.ppf,
        ppe_date                     = r_prazo.ppe,
        delivery_lead_business_days  = r_prazo.available,
        delivery_below_minimum       = r_prazo.below_min,
        production_approval_status   = CASE
          WHEN r_prazo.below_min AND coalesce(
            (SELECT enabled FROM public.prazo_config WHERE id), false)
          THEN 'pending' ELSE 'auto_approved' END
      WHERE id = r_order.id;
    ELSE
      UPDATE public.carboze_orders SET status = 'pending' WHERE id = r_order.id;
    END IF;

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END $$;

COMMENT ON FUNCTION public.carboze_ativar_parcelas_devidas IS
  'Ativa toda parcela de recorrência cujo mês chegou. Idempotente: pode rodar '
  'quantas vezes quiser e se recupera sozinha de execução perdida.';

REVOKE ALL ON FUNCTION public.carboze_ativar_parcelas_devidas() FROM public;
GRANT EXECUTE ON FUNCTION public.carboze_ativar_parcelas_devidas() TO authenticated;

-- ── 3) A agenda visível — para nenhuma parcela ser esquecida ─────────────────
-- O medo legítimo de materializar pedido no futuro é ele sumir de vista e
-- ninguém produzir. Esta view é o lugar onde se enxerga tudo, inclusive o que
-- deveria ter sido ativado e não foi.
CREATE OR REPLACE VIEW public.carboze_recorrencia_agenda AS
SELECT
  o.id,
  o.order_number,
  o.customer_name,
  o.vendedor_name,
  o.total,
  o.status,
  o.scheduled_month,
  o.recurrence_period,
  o.recurrence_index,
  o.recurrence_total,
  coalesce(o.parent_order_id, o.id) AS contrato_id,
  CASE
    WHEN o.status <> 'agendado'                                            THEN 'ativada'
    WHEN o.scheduled_month <= date_trunc('month', current_date)::date      THEN 'ATRASADA'
    ELSE 'futura'
  END AS situacao
FROM public.carboze_orders o
WHERE o.recurrence_total IS NOT NULL
ORDER BY coalesce(o.parent_order_id, o.id), o.recurrence_index;

GRANT SELECT ON public.carboze_recorrencia_agenda TO authenticated;

COMMENT ON VIEW public.carboze_recorrencia_agenda IS
  'Todas as parcelas de recorrência. situacao=ATRASADA significa que o mês '
  'chegou e a parcela não virou venda — se aparecer alguma, a ativação falhou.';

-- ── 4) Varredura diária ──────────────────────────────────────────────────────
-- SQL direto, sem HTTP: um passo a menos para falhar do que chamar edge function.
SELECT cron.unschedule('carboze-ativar-parcelas')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'carboze-ativar-parcelas');

SELECT cron.schedule(
  'carboze-ativar-parcelas',
  '10 3 * * *',
  $cmd$ SELECT public.carboze_ativar_parcelas_devidas(); $cmd$
);

NOTIFY pgrst, 'reload schema';
