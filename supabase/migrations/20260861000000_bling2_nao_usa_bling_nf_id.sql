-- ═══════════════════════════════════════════════════════════════════════════
-- Bling 2 para de gravar em `bling_nf_id` — campo que é do Bling 1
--
-- ── O risco ───────────────────────────────────────────────────────────────
--
-- `carbo_vendas_metrica`, fonte ÚNICA de "esta venda conta", resolve a nota
-- assim:
--
--     left join public.bling_nfe n on n.bling_id = o.bling_nf_id
--
-- `bling_nfe` é o espelho do Bling **1**. A migração 20260859 fez a ponte
-- gravar ali o id da nota da conta **2** — outro universo de ids, atribuídos
-- por outra conta. Hoje não há colisão (verificado: zero), mas nada garante
-- isso amanhã, e uma colisão associaria a NOTA ERRADA: cancelada de uma
-- empresa derrubando venda da outra, ou o inverso.
--
-- ── Por que NÃO consertar a view ──────────────────────────────────────────
--
-- A tentação era ensinar a view a escolher o espelho pela origem do pedido.
-- Só que ela foi criada com `o.*`, e o Postgres congela a lista de colunas na
-- criação: `carboze_orders` ganhou colunas depois, então qualquer CREATE OR
-- REPLACE hoje falha com "cannot change name of view column". Reescrever 100+
-- colunas à mão para consertar 4 é risco desproporcional — uma coluna fora de
-- ordem e o faturamento inteiro passa a ler o campo errado.
--
-- ── A correção ────────────────────────────────────────────────────────────
--
-- O campo simplesmente não é do Bling 2. Deixando-o nulo:
--
--   • a colisão deixa de existir — não há o que colidir;
--   • a métrica segue correta: quem derruba pedido com nota cancelada é a
--     PONTE, que marca `cancelled`, e a view já exclui cancelado;
--   • número e chave continuam preenchidos (`invoice_number`, `nf_access_key`)
--     — são texto, não fazem join com nada;
--   • nenhuma view compartilhada é tocada.
--
-- O vínculo com a nota do Bling 2 continua existindo e é exato: está em
-- `bling2_orders.nf_bling_id` (coluna gerada), que é onde ele pertence.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. A ponte para de preencher o campo ──────────────────────────────────
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
      bo.raw_detalhe -> 'transporte'                    as transp,
      bo.raw_detalhe -> 'transporte' -> 'etiqueta'      as etiqueta,
      bo.raw_detalhe -> 'transporte' -> 'volumes' -> 0  as volume1,
      nf.numero                                         as nf_numero,
      nf.chave_acesso                                   as nf_chave,
      case
        when bo.loja_id is not null and bo.loja_id <> 0
             and coalesce(l.ignorar, false) = false then 'online'
        else null
      end                                 as segmento
    from public.bling2_orders bo
    left join public.bling2_contacts c on c.bling_id = bo.contato_id
    left join public.bling2_lojas    l on l.bling_id = bo.loja_id
    join      public.bling2_nfe     nf on nf.bling_id = bo.nf_bling_id
    where bo.situacao_id = 9
      and public.bling2_nf_e_valida(nf.situacao)
      and not exists (
        select 1 from public.carboze_orders o
        where o.external_ref = 'bling2-' || bo.bling_id
      )
  ), inseridos as (
    insert into public.carboze_orders (
      order_number, customer_name, cnpj, customer_ie, customer_email, customer_phone,
      delivery_address, delivery_neighborhood, delivery_city, delivery_state, delivery_zip,
      shipment_carrier, shipment_volumes, shipment_weight_kg, tracking_code,
      -- ⚠️ `bling_nf_id` NÃO entra: o campo é lido contra o espelho do Bling 1.
      -- Número e chave são texto e não fazem join com nada.
      invoice_number, nf_access_key,
      items, subtotal, shipping_cost, discount, total,
      status, fulfillment_stage, segmento, external_ref, notes, source_file,
      sale_date, created_at
    )
    select
      'BLING2-' || coalesce(nullif(n.numero, ''), n.bling_id::text),
      coalesce(nullif(n.contato_nome, ''), 'Cliente Bling 2'),
      n.cpf_cnpj, n.ie, n.email, n.fone,
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
      nullif(trim(concat_ws(' · ',
        nullif(n.transp -> 'contato' ->> 'nome', ''),
        nullif(n.volume1 ->> 'servico', ''))), ''),
      (n.transp ->> 'quantidadeVolumes')::numeric::integer,
      (n.transp ->> 'pesoBruto')::numeric,
      nullif(n.volume1 ->> 'codigoRastreamento', ''),
      n.nf_numero, n.nf_chave,
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

  with cancelados as (
    update public.carboze_orders o
    set status = 'cancelled', fulfillment_stage = 'cancelado', updated_at = now()
    from public.bling2_orders bo
    left join public.bling2_nfe nf on nf.bling_id = bo.nf_bling_id
    where o.external_ref = 'bling2-' || bo.bling_id
      and o.status <> 'cancelled'
      and (
        bo.situacao_id = 12
        or (nf.situacao is not null and not public.bling2_nf_e_valida(nf.situacao))
      )
    returning 1
  )
  select count(*) into v_cancelados from cancelados;

  return query select v_criados, v_cancelados;
end $$;


-- ── 2. Limpa o que já foi gravado ─────────────────────────────────────────
-- Só os da ponte do Bling 2. Pedido nativo e do Bling 1 não são tocados.
update public.carboze_orders
set bling_nf_id = null, updated_at = now()
where source_file = 'bling2_bridge' and bling_nf_id is not null;


-- ═══════════════════════════════════════════════════════════════════════════
-- Conferência
-- ═══════════════════════════════════════════════════════════════════════════

-- (a) Nenhum pedido do Bling 2 aponta mais para o espelho do Bling 1.
select count(*) as bling2_com_bling_nf_id
from public.carboze_orders
where source_file = 'bling2_bridge' and bling_nf_id is not null;

-- (b) O número e a chave da nota continuam lá.
select count(*)                                       as pedidos,
       count(invoice_number)                          as com_numero_nf,
       count(nf_access_key)                           as com_chave_nf
from public.carboze_orders
where source_file = 'bling2_bridge' and status <> 'cancelled';

-- (c) O faturamento não mudou — esta correção não mexe em valor nenhum.
select count(*) filter (where status <> 'cancelled')   as pedidos_reais,
       sum(total) filter (where status <> 'cancelled') as faturamento_real,
       count(*) filter (where status = 'cancelled')    as cancelados
from public.carboze_orders where source_file = 'bling2_bridge';
