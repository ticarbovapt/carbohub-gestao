-- Cria as parcelas de uma recorrência, tudo ou nada
--
-- O vendedor preenche UM mês (itens, quantidades, valor) e marca a
-- periodicidade. Esta função replica esse pedido N-1 vezes, uma por período,
-- com status 'agendado'.
--
-- Por que RPC e não N inserts no cliente: se o navegador cair entre o 3º e o 4º
-- insert, ficaria um contrato pela metade — parcelas faltando, sem ninguém
-- saber. Aqui é uma transação só: ou o contrato inteiro existe, ou nada existe
-- e o pedido segue sendo uma venda avulsa normal.
--
-- A cópia é feita por to_jsonb/jsonb_populate_record de propósito: carboze_orders
-- tem dezenas de colunas e listá-las à mão significaria que toda coluna nova
-- nasceria fora da recorrência, calada. Assim a parcela herda tudo do pai e só
-- o que precisa mudar é sobrescrito abaixo.

CREATE OR REPLACE FUNCTION public.carboze_criar_recorrencia(
  p_parent_id uuid,
  p_period    text,
  p_total     integer
)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_step   integer;
  v_parent public.carboze_orders;
  v_base   date;
  v_i      integer;
  v_criadas integer := 0;
BEGIN
  v_step := public.carbo_recurrence_step(p_period);
  IF v_step IS NULL THEN
    RAISE EXCEPTION 'Periodicidade inválida: %', p_period;
  END IF;
  IF p_total IS NULL OR p_total < 2 OR p_total > 60 THEN
    RAISE EXCEPTION 'Número de parcelas deve estar entre 2 e 60 (recebido: %)', p_total;
  END IF;

  SELECT * INTO v_parent FROM public.carboze_orders WHERE id = p_parent_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pedido % não encontrado', p_parent_id;
  END IF;

  -- Recorrência só nasce de venda de verdade. Orçamento vira recorrência
  -- quando for aprovado, não antes.
  IF v_parent.status <> 'pending' THEN
    RAISE EXCEPTION 'Só um pedido novo (pending) pode virar recorrência; este está em %',
      v_parent.status;
  END IF;
  IF v_parent.recurrence_total IS NOT NULL THEN
    RAISE EXCEPTION 'Pedido % já é uma recorrência', v_parent.order_number;
  END IF;

  v_base := date_trunc('month', coalesce(v_parent.sale_date, current_date))::date;

  -- O pai é a parcela 1 e já está ativo.
  UPDATE public.carboze_orders SET
    order_type        = 'recorrente',
    is_recurring      = true,
    recurrence_period = p_period,
    recurrence_index  = 1,
    recurrence_total  = p_total,
    scheduled_month   = v_base
  WHERE id = p_parent_id;

  -- As demais nascem 'agendado': existem, aparecem na agenda, mas não são venda.
  FOR v_i IN 2..p_total LOOP
    INSERT INTO public.carboze_orders
    SELECT (jsonb_populate_record(
      NULL::public.carboze_orders,
      to_jsonb(v_parent)
      || jsonb_build_object(
           'id',                gen_random_uuid(),
           'order_number',      '',            -- trigger gera o número
           'status',            'agendado',
           'parent_order_id',   p_parent_id,
           'order_type',        'recorrente',
           'is_recurring',      true,
           'recurrence_period', p_period,
           'recurrence_index',  v_i,
           'recurrence_total',  p_total,
           'scheduled_month',   (v_base + make_interval(months => (v_i - 1) * v_step))::date,
           -- sale_date acompanha o mês da parcela: é por ele que as telas de
           -- faturamento agrupam o mês.
           'sale_date',         (v_base + make_interval(months => (v_i - 1) * v_step))::date,
           'agreed_delivery_date',
             CASE WHEN v_parent.agreed_delivery_date IS NULL THEN NULL
                  ELSE (v_parent.agreed_delivery_date
                        + make_interval(months => (v_i - 1) * v_step))::date END,
           -- Marcos do pai não se herdam: esta parcela ainda não aconteceu.
           'created_at',        now(),
           'updated_at',        now(),
           'confirmed_at',      NULL,
           'invoiced_at',       NULL,
           'invoice_number',    NULL,
           'shipped_at',        NULL,
           'delivered_at',      NULL,
           'cancelled_at',      NULL,
           'tracking_code',     NULL,
           'tracking_url',      NULL,
           'nf_access_key',     NULL,
           'bling_nf_id',       NULL,
           'created_op_id',     NULL,
           'created_os_id',     NULL,
           'commission_paid_at', NULL,
           'fulfillment_stage', 'nova_venda'
         )
    )).*;
    v_criadas := v_criadas + 1;
  END LOOP;

  RETURN v_criadas;
END $$;

COMMENT ON FUNCTION public.carboze_criar_recorrencia IS
  'Replica um pedido em N parcelas de recorrência (a 1ª é o próprio pedido). '
  'Atômica: ou o contrato inteiro existe, ou nenhuma parcela é criada.';

REVOKE ALL ON FUNCTION public.carboze_criar_recorrencia(uuid, text, integer) FROM public;
GRANT EXECUTE ON FUNCTION public.carboze_criar_recorrencia(uuid, text, integer) TO authenticated;

NOTIFY pgrst, 'reload schema';
