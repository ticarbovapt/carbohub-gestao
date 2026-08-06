-- ═══════════════════════════════════════════════════════════════════════════
-- Bling 2: nota cancelada não é venda
--
-- ── O furo ────────────────────────────────────────────────────────────────
--
-- A ponte usava só a situação do PEDIDO (`situacao_id = 9`, Atendido). Só que
-- cancelar a NF no Bling NÃO cancela o pedido — ele segue "Atendido" para
-- sempre. É a mesma armadilha que já custou caro no `bling-sync`, onde venda
-- cancelada ressuscitava a cada rodada.
--
-- Resultado: um cliente com 12 pedidos importados tinha 11 notas CANCELADAS.
-- R$ 1.090 de faturamento que não existe, num cliente só.
--
-- ── O vínculo, que existe e é exato ───────────────────────────────────────
--
-- O detalhe do pedido traz `notaFiscal: { id }` — presente nos 176. É o id da
-- NF em `bling2_nfe`. Nada de casar por valor+data, que neste caso erraria
-- feio: o mesmo cliente tem duas notas de R$ 88,98 no mesmo dia.
--
-- ⚠️ Este vínculo é a razão de a coluna ser GERADA e não preenchida por
-- backfill: ela acompanha o `raw_detalhe` sozinha, sem depender de ninguém
-- lembrar de rodar nada quando um pedido novo chega.
--
-- ── O que esta migração NÃO conserta sozinha ──────────────────────────────
--
-- O endpoint `/nfe` do Bling não devolve nota cancelada — ela some da
-- listagem. Por isso o espelho congelou em "Emitida DANFE" para as notas que
-- foram canceladas depois, e hoje `bling2_nfe` tem ZERO linhas 'Cancelada'
-- enquanto a tela do Bling mostra várias.
--
-- Ou seja: a regra abaixo passa a valer imediatamente, mas só derruba o que o
-- espelho JÁ SABE ser inválido. O grosso só sai depois que as situações forem
-- reconsultadas (entidade `nfe_recheck` do bling2-sync, que usa `/nfe/{id}` —
-- esse funciona para nota cancelada).
--
-- Como a checagem roda no cron a cada meia hora, o conserto acontece sozinho
-- conforme as situações chegam. Nada precisa ser rodado de novo à mão.
-- ═══════════════════════════════════════════════════════════════════════════


-- ── 1. O vínculo NF ↔ pedido, como coluna ─────────────────────────────────
alter table public.bling2_orders
  add column if not exists nf_bling_id bigint
  generated always as (((raw_detalhe -> 'notaFiscal' ->> 'id'))::bigint) stored;

comment on column public.bling2_orders.nf_bling_id is
  'Id da NF em bling2_nfe, extraído de raw_detalhe->notaFiscal->id. Coluna GERADA: acompanha o detalhe sozinha.';

create index if not exists idx_bling2_orders_nf on public.bling2_orders (nf_bling_id);


-- ── 2. O que conta como nota válida ───────────────────────────────────────
--
-- Lista BRANCA, pelo mesmo motivo de sempre: situação nova que o Bling venha a
-- inventar NÃO entra no faturamento até alguém decidir que ela vale. Lista
-- negra deixaria o desconhecido virar receita calada.
--
-- 'Pendente' fica de fora de propósito: nota que ainda não foi autorizada não
-- é faturamento — é intenção.
create or replace function public.bling2_nf_e_valida(p_situacao text)
returns boolean language sql immutable set search_path = public as $$
  select coalesce(p_situacao, '') in ('Autorizada', 'Emitida DANFE', 'Registrada')
$$;

comment on function public.bling2_nf_e_valida is
  'Lista BRANCA das situações de NF que contam como faturamento no Bling 2. Situação desconhecida NÃO conta.';


-- ── 3. A ponte passa a exigir nota válida ─────────────────────────────────
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
      nf.bling_id                                       as nf_id,
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
      -- ⭐ A nota manda. Pedido "Atendido" com NF cancelada não é venda.
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
      invoice_number, nf_access_key, bling_nf_id,
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
      -- Agora a nota vem junto: número, chave e id. Antes ficavam nulos porque
      -- não havia vínculo conhecido.
      n.nf_numero, n.nf_chave, n.nf_id,
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

  -- ── Cancelamento, numa direção só ───────────────────────────────────────
  --
  -- Duas origens, mesma consequência:
  --   • pedido cancelado no Bling (situação 12);
  --   • NOTA cancelada/rejeitada/denegada — o pedido continua "Atendido" lá,
  --     mas sem nota válida não há faturamento.
  --
  -- Roda a cada meia hora junto com a ponte, então conforme as situações das
  -- notas forem reconsultadas, o conserto acontece sozinho.
  --
  -- Nada aqui tira um pedido de 'cancelled'. Cancelamento não se desfaz.
  with cancelados as (
    update public.carboze_orders o
    set status = 'cancelled', fulfillment_stage = 'cancelado', updated_at = now()
    from public.bling2_orders bo
    left join public.bling2_nfe nf on nf.bling_id = bo.nf_bling_id
    where o.external_ref = 'bling2-' || bo.bling_id
      and o.status <> 'cancelled'
      and (
        bo.situacao_id = 12
        -- Nota conhecida e inválida. `nf.situacao is null` (nota que o espelho
        -- ainda não viu) NÃO derruba o pedido: ausência de informação não é
        -- prova de cancelamento.
        or (nf.situacao is not null and not public.bling2_nf_e_valida(nf.situacao))
      )
    returning 1
  )
  select count(*) into v_cancelados from cancelados;

  return query select v_criados, v_cancelados;
end $$;


-- ═══════════════════════════════════════════════════════════════════════════
-- Conferência
-- ═══════════════════════════════════════════════════════════════════════════

-- (a) Aplica a regra agora. `cancelados` = o que o espelho JÁ sabe ser inválido.
select * from public.bling2_bridge_pedidos_faturados();

-- (b) O tamanho do que ainda está por descobrir: pedidos importados cuja nota
--     está com situação possivelmente velha. Enquanto o recheck não roda, este
--     número é o teto do faturamento fantasma.
select nf.situacao,
       count(*)        as pedidos_importados,
       sum(o.total)    as valor,
       max(nf.synced_at) as nota_vista_pela_ultima_vez
from public.carboze_orders o
join public.bling2_orders bo on ('bling2-' || bo.bling_id) = o.external_ref
left join public.bling2_nfe nf on nf.bling_id = bo.nf_bling_id
where o.source_file = 'bling2_bridge' and o.status <> 'cancelled'
group by 1
order by 3 desc nulls last;

-- (c) Pedido importado SEM nota vinculada no espelho (não deveria existir
--     depois desta migração, mas os que entraram antes podem estar assim).
select o.order_number, o.customer_name, o.total, bo.nf_bling_id
from public.carboze_orders o
join public.bling2_orders bo on ('bling2-' || bo.bling_id) = o.external_ref
left join public.bling2_nfe nf on nf.bling_id = bo.nf_bling_id
where o.source_file = 'bling2_bridge' and nf.id is null
order by o.total desc;
