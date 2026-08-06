-- ═══════════════════════════════════════════════════════════════════════════
-- Bling 2 → carboze_orders: endereço de ENTREGA, transportadora e rastreio
--
-- Com o detalhe do pedido preservado em `raw_detalhe`, o bloco `transporte`
-- passou a estar disponível — e ele traz o que faltava para o follow-up e para
-- a logística do online:
--
--   transporte.etiqueta          → endereço de ENTREGA (nome, logradouro,
--                                  número, complemento, bairro, município, uf, cep)
--   transporte.contato.nome      → transportadora ("Correios")
--   transporte.volumes[].servico → serviço ("Mini Envios")
--   transporte.volumes[].codigoRastreamento → rastreio
--   transporte.quantidadeVolumes → volumes
--   transporte.pesoBruto         → peso
--
-- ── Por que sobrescrever o endereço ───────────────────────────────────────
--
-- A ponte preenchia o endereço com o do CADASTRO do contato. No marketplace
-- esses dois quase nunca coincidem: quem compra manda entregar no trabalho, na
-- casa da mãe, num ponto de retirada. Para follow-up e para conferir entrega,
-- o que vale é a etiqueta — é para lá que a mercadoria foi.
--
-- ⚠️ O backfill sobrescreve o endereço SÓ dos pedidos criados pela ponte
-- (`source_file = 'bling2_bridge'`) e só quando a etiqueta tem município.
-- Pedido digitado por gente nunca é tocado.
-- ═══════════════════════════════════════════════════════════════════════════


-- ── 1. A ponte passa a nascer com os dados de entrega ─────────────────────
create or replace function public.bling2_bridge_pedidos_faturados()
returns table (criados integer, cancelados integer)
language plpgsql security definer set search_path = public as $$
declare v_criados integer := 0; v_cancelados integer := 0;
begin
  with novos as (
    select
      bo.bling_id, bo.numero, bo.data,
      bo.total, bo.total_produtos, bo.total_frete, bo.total_desconto,
      bo.contato_nome, bo.observacoes, bo.loja_id, bo.items,
      c.cpf_cnpj, c.ie, c.email,
      coalesce(c.telefone, c.celular)     as fone,
      c.raw_data -> 'endereco' -> 'geral' as end_cadastro,
      -- Bloco de transporte do detalhe. Nulo enquanto o pedido não passou pela
      -- fase order_details — e aí os campos de entrega ficam como estavam.
      bo.raw_detalhe -> 'transporte'                    as transp,
      bo.raw_detalhe -> 'transporte' -> 'etiqueta'      as etiqueta,
      bo.raw_detalhe -> 'transporte' -> 'volumes' -> 0  as volume1,
      case
        when bo.loja_id is not null and bo.loja_id <> 0
             and coalesce(l.ignorar, false) = false then 'online'
        else null
      end                                 as segmento
    from public.bling2_orders bo
    left join public.bling2_contacts c on c.bling_id = bo.contato_id
    left join public.bling2_lojas    l on l.bling_id = bo.loja_id
    where bo.situacao_id = 9
      and not exists (
        select 1 from public.carboze_orders o
        where o.external_ref = 'bling2-' || bo.bling_id
      )
  ), inseridos as (
    insert into public.carboze_orders (
      order_number, customer_name, cnpj, customer_ie, customer_email, customer_phone,
      delivery_address, delivery_neighborhood, delivery_city, delivery_state, delivery_zip,
      shipment_carrier, shipment_volumes, shipment_weight_kg, tracking_code,
      items, subtotal, shipping_cost, discount, total,
      status, fulfillment_stage, segmento, external_ref, notes, source_file,
      sale_date, created_at
    )
    select
      'BLING2-' || coalesce(nullif(n.numero, ''), n.bling_id::text),
      coalesce(nullif(n.contato_nome, ''), 'Cliente Bling 2'),
      n.cpf_cnpj, n.ie, n.email, n.fone,
      -- Endereço: etiqueta (para onde foi) e, na falta dela, o do cadastro.
      coalesce(
        nullif(trim(concat_ws(', ',
          nullif(n.etiqueta ->> 'endereco', ''),
          nullif(n.etiqueta ->> 'numero', ''))), ''),
        nullif(trim(concat_ws(', ',
          nullif(coalesce(n.end_cadastro ->> 'endereco', n.end_cadastro ->> 'logradouro'), ''),
          nullif(n.end_cadastro ->> 'numero', ''))), '')
      ),
      coalesce(nullif(n.etiqueta ->> 'bairro', ''), nullif(n.end_cadastro ->> 'bairro', '')),
      coalesce(nullif(n.etiqueta ->> 'municipio', ''),
               nullif(coalesce(n.end_cadastro ->> 'municipio', n.end_cadastro ->> 'cidade'), '')),
      upper(left(coalesce(nullif(n.etiqueta ->> 'uf', ''), n.end_cadastro ->> 'uf', ''), 2)),
      nullif(regexp_replace(
        coalesce(nullif(n.etiqueta ->> 'cep', ''), n.end_cadastro ->> 'cep', ''),
        '\D', '', 'g'), ''),
      -- Transportadora + serviço ("Correios · Mini Envios"): o serviço é o que
      -- explica o prazo, e sem ele "Correios" sozinho não diz nada.
      nullif(trim(concat_ws(' · ',
        nullif(n.transp -> 'contato' ->> 'nome', ''),
        nullif(n.volume1 ->> 'servico', ''))), ''),
      (n.transp ->> 'quantidadeVolumes')::numeric::integer,
      (n.transp ->> 'pesoBruto')::numeric,
      -- O Bling manda '' quando a etiqueta ainda não foi postada.
      nullif(n.volume1 ->> 'codigoRastreamento', ''),
      coalesce((
        select jsonb_agg(jsonb_build_object(
          'name',         coalesce(nullif(it ->> 'descricao', ''), it -> 'produto' ->> 'nome', 'Produto'),
          'product_code', coalesce(it ->> 'codigo', it -> 'produto' ->> 'codigo', ''),
          'quantity',     coalesce((it ->> 'quantidade')::numeric, 1),
          'unit_price',   coalesce((it ->> 'valor')::numeric, 0),
          'total',        coalesce((it ->> 'quantidade')::numeric, 1)
                          * coalesce((it ->> 'valor')::numeric, 0)
        ))
        from jsonb_array_elements(case when jsonb_typeof(n.items) = 'array'
                                       then n.items else '[]'::jsonb end) it
      ), '[]'::jsonb),
      coalesce(n.total_produtos, 0), coalesce(n.total_frete, 0), coalesce(n.total_desconto, 0),
      coalesce(n.total, 0),
      'delivered'::public.order_status,
      'entregue',
      n.segmento,
      'bling2-' || n.bling_id,
      nullif(n.observacoes, ''),
      'bling2_bridge',
      nullif(n.data, '')::date,
      coalesce(nullif(n.data, '')::date::timestamptz, now())
    from novos n
    returning 1
  )
  select count(*) into v_criados from inseridos;

  -- Cancelamento anda numa direção só: nada aqui tira um pedido de 'cancelled'.
  with cancelados as (
    update public.carboze_orders o
    set status = 'cancelled', fulfillment_stage = 'cancelado', updated_at = now()
    from public.bling2_orders bo
    where o.external_ref = 'bling2-' || bo.bling_id
      and bo.situacao_id = 12
      and o.status <> 'cancelled'
    returning 1
  )
  select count(*) into v_cancelados from cancelados;

  return query select v_criados, v_cancelados;
end $$;


-- ── 2. Preenche o que já entrou sem esses dados ───────────────────────────
--
-- Roda toda vez que a migração for executada, e é idempotente: só toca a linha
-- em que algo de fato muda. Serve também como conserto contínuo enquanto a
-- fase `order_details` vai drenando a fila (o detalhe chega em lotes de 60).
create or replace function public.bling2_bridge_completar_entrega()
returns integer language plpgsql security definer set search_path = public as $$
declare v_n integer;
begin
  with fonte as (
    select
      o.id,
      bo.raw_detalhe -> 'transporte'                   as transp,
      bo.raw_detalhe -> 'transporte' -> 'etiqueta'     as etiqueta,
      bo.raw_detalhe -> 'transporte' -> 'volumes' -> 0 as volume1
    from public.carboze_orders o
    join public.bling2_orders bo on ('bling2-' || bo.bling_id) = o.external_ref
    where o.source_file = 'bling2_bridge'
      and bo.raw_detalhe is not null
  ), calc as (
    select
      f.id,
      nullif(trim(concat_ws(', ',
        nullif(f.etiqueta ->> 'endereco', ''),
        nullif(f.etiqueta ->> 'numero', ''))), '')                       as endereco,
      nullif(f.etiqueta ->> 'bairro', '')                                as bairro,
      nullif(f.etiqueta ->> 'municipio', '')                             as municipio,
      upper(left(coalesce(f.etiqueta ->> 'uf', ''), 2))                  as uf,
      nullif(regexp_replace(coalesce(f.etiqueta ->> 'cep', ''), '\D', '', 'g'), '') as cep,
      nullif(trim(concat_ws(' · ',
        nullif(f.transp -> 'contato' ->> 'nome', ''),
        nullif(f.volume1 ->> 'servico', ''))), '')                       as transportadora,
      (f.transp ->> 'quantidadeVolumes')::numeric::integer               as volumes,
      (f.transp ->> 'pesoBruto')::numeric                                as peso,
      nullif(f.volume1 ->> 'codigoRastreamento', '')                     as rastreio
    from fonte f
  ), atualizados as (
    update public.carboze_orders o
    set
      -- Endereço só é trocado quando a etiqueta tem município — etiqueta vazia
      -- não pode apagar o endereço do cadastro que já estava lá.
      delivery_address      = case when c.municipio is not null then coalesce(c.endereco, o.delivery_address) else o.delivery_address end,
      delivery_neighborhood = case when c.municipio is not null then coalesce(c.bairro, o.delivery_neighborhood) else o.delivery_neighborhood end,
      delivery_city         = coalesce(c.municipio, o.delivery_city),
      delivery_state        = case when c.municipio is not null and c.uf <> '' then c.uf else o.delivery_state end,
      delivery_zip          = coalesce(c.cep, o.delivery_zip),
      -- Os de expedição só preenchem o que está vazio: se alguém do Ops digitou
      -- volume ou peso à mão, o que veio da mão vale mais.
      shipment_carrier      = coalesce(o.shipment_carrier, c.transportadora),
      shipment_volumes      = coalesce(o.shipment_volumes, c.volumes),
      shipment_weight_kg    = coalesce(o.shipment_weight_kg, c.peso),
      tracking_code         = coalesce(o.tracking_code, c.rastreio),
      updated_at            = now()
    from calc c
    where c.id = o.id
      and (
        (c.municipio is not null and (o.delivery_city   is distinct from c.municipio
                                   or o.delivery_address is distinct from c.endereco))
        or (o.shipment_carrier   is null and c.transportadora is not null)
        or (o.shipment_volumes   is null and c.volumes        is not null)
        or (o.shipment_weight_kg is null and c.peso           is not null)
        or (o.tracking_code      is null and c.rastreio       is not null)
      )
    returning 1
  )
  select count(*) into v_n from atualizados;
  return v_n;
end $$;

comment on function public.bling2_bridge_completar_entrega is
  'Preenche endereço de ENTREGA (etiqueta), transportadora, volumes, peso e rastreio nos pedidos vindos do Bling 2, a partir de bling2_orders.raw_detalhe. Idempotente.';


-- ── 3. O cron passa a rodar as duas ───────────────────────────────────────
do $$
declare j record;
begin
  for j in select jobid from cron.job where jobname = 'bling2-bridge' loop
    perform cron.unschedule(j.jobid);
  end loop;
end $$;

select cron.schedule(
  'bling2-bridge',
  '25,55 * * * *',
  $cmd$
  select public.bling2_bridge_pedidos_faturados();
  select public.bling2_bridge_completar_entrega();
  $cmd$
);


-- ═══════════════════════════════════════════════════════════════════════════
-- Conferência
-- ═══════════════════════════════════════════════════════════════════════════

-- Roda agora nos que já têm detalhe.
select public.bling2_bridge_completar_entrega() as pedidos_completados;

-- Cobertura: quanto do follow-up e da logística está preenchido.
select count(*)                                            as pedidos,
       count(*) filter (where customer_phone   is not null) as com_telefone,
       count(*) filter (where delivery_city    is not null) as com_cidade,
       count(*) filter (where shipment_carrier is not null) as com_transportadora,
       count(*) filter (where tracking_code    is not null) as com_rastreio
from public.carboze_orders
where source_file = 'bling2_bridge';

-- Amostra do que ficou.
select order_number, customer_name, delivery_city, delivery_state,
       shipment_carrier, shipment_volumes, shipment_weight_kg, tracking_code
from public.carboze_orders
where source_file = 'bling2_bridge' and shipment_carrier is not null
order by sale_date desc
limit 10;
