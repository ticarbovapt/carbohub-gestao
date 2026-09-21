-- ═══════════════════════════════════════════════════════════════════════════
-- A coluna "Pago" para de reivindicar o que JÁ ESTÁ na esteira
--
-- Visto na tela em 21/09/2026, logo depois da `20260990`: os MESMOS pedidos do
-- ML Full aparecendo em "Pago" (14) e em "Confirmado" (5). O contador do topo
-- somava os dois.
--
-- Eu tinha previsto isso e deixado como "a gente decide depois". Errado: o
-- mesmo pedido em duas colunas não é pendência, é a tela mentindo — e a tela é
-- usada para decidir o que precisa de ação.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- ⚠️ O PRINCÍPIO: "SAI DE PAGO" E "ENTRA NA ESTEIRA" SÃO A MESMA CONDIÇÃO
--
-- `ecommerce_aguardando_bling` significa "a plataforma tem o pedido e o Bling
-- ainda não". Ela é o complemento da esteira, e complemento só funciona se as
-- duas usarem a MESMA régua.
--
-- Escrevendo uma expressão parecida-mas-diferente, elas divergem de dois jeitos
-- e os dois são ruins:
--
--   condição de Pago mais FROUXA   → pedido nas DUAS colunas (o bug de hoje)
--   condição de Pago mais APERTADA → pedido em NENHUMA, e some do painel
--
-- Por isso o `not exists` novo é cópia literal do `join` do ramo 1 da
-- `20260990`: `bling_lojas` com `e_online is true` e `not ignorar`.
--
-- ⚠️ E ele NÃO herda o `situacao_id in (9,12)` do teste do Bling 2 — é
-- exatamente o filtro que esconderia os pedidos do Full, que estão em 15 ("Em
-- andamento") na conta 1. Copiar aquela linha aqui recriaria o bug com outra
-- roupa: a esteira mostrando o card e o "Pago" continuando a reivindicá-lo.
--
-- ⚠️ RODE EM BLOCOS.
-- ═══════════════════════════════════════════════════════════════════════════


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 1 — a view                                                      ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
-- Corpo lido de `pg_get_viewdef` em 21/09/2026, com DUAS alterações, ambas
-- marcadas no lugar: o rótulo do canal novo e o segundo `not exists`.

create or replace view public.ecommerce_aguardando_bling
with (security_invoker = true) as
with transacoes_do_pedido as (
  select e.platform,
         e.platform_order_number,
         array_agg(distinct split_part(e.order_id, '-', 1)) as transacoes
    from public.ecommerce_orders e
   where e.platform_order_number is not null
     and e.ordered_at > now() - interval '30 days'
   group by e.platform, e.platform_order_number
),
pedido as (
  select e.platform,
         e.platform_order_number,
         min(e.ordered_at)      as ordered_at,
         sum(e.total)           as total,
         sum(e.quantity)        as itens,
         max(e.cliente_nome)    as cliente,
         max(e.cliente_fone)    as cliente_fone,
         max(e.cliente_email)   as cliente_email,
         max(case lower(e.status)
               when 'delivered' then 3 when 'shipped' then 2
               when 'paid' then 1 else 0 end) as avanco,
         string_agg(distinct e.product_name, ' · ') as produtos
    from public.ecommerce_orders e
   where e.platform_order_number is not null
     and public.ecommerce_status_e_venda(e.status)
     and e.ordered_at > now() - interval '30 days'
   group by e.platform, e.platform_order_number
)
select
  p.platform,
  p.platform_order_number as pedido_loja,
  case p.platform
    when 'nuvemshop'         then 'Loja Nuvemshop'
    when 'mercadolivre'      then 'Mercado Livre'
    -- ⬅ NOVO. Sem esta linha o canal caía no `initcap` e aparecia na tela como
    -- "Mercadolivre_full" — nome de coluna de banco na cara do operador. E o
    -- rótulo precisa ser o MESMO da esteira ('ML Full', de `bling_lojas.nome`),
    -- senão o mesmo canal tem dois nomes em duas colunas da mesma tela.
    when 'mercadolivre_full' then 'ML Full'
    when 'amazon'            then 'Amazon'
    when 'payt'              then 'PayT'
    when 'shopee'            then 'Shopee'
    else initcap(p.platform)
  end as canal,
  (p.ordered_at at time zone 'America/Sao_Paulo')::date as data_pedido,
  p.ordered_at,
  p.total,
  p.itens,
  p.produtos,
  p.cliente,
  p.cliente_fone,
  p.cliente_email,
  (extract(epoch from now() - p.ordered_at))::bigint / 60 as minutos_parado
from pedido p
left join transacoes_do_pedido t
       on t.platform = p.platform
      and t.platform_order_number = p.platform_order_number
where p.avanco >= 1
  -- Já está no Bling 2 (filial)? Então não está esperando. Inalterado.
  and not exists (
    select 1 from public.bling2_orders bo
    where bo.situacao_id = any (array[9::bigint, 12::bigint])
      and (bo.numero_loja = p.platform_order_number
           or (bo.numero_loja like 'PAYT!_%' escape '!'
               and split_part(bo.numero_loja, '_', 3)
                     = any (coalesce(t.transacoes, '{}'::text[]))))
  )
  -- ⬅ NOVO. Já está no Bling 1 (matriz), em loja ON-LINE? Também não está
  -- esperando — e desde a `20260990` ele aparece na esteira.
  --
  -- ⚠️ A condição da loja é CÓPIA LITERAL do `join` do ramo 1 da `20260990`.
  -- Não é zelo: é o que garante que "sai de Pago" e "entra na esteira" sejam a
  -- MESMA pergunta. Expressão parecida-mas-diferente faz o pedido aparecer nas
  -- duas colunas (o bug de hoje) ou em nenhuma (pior, porque some).
  --
  -- ⚠️ E NÃO há `situacao_id in (9,12)` aqui: na conta 1 os pedidos do Full
  -- estão em 15 ("Em andamento"), e aquele filtro recriaria o bug.
  and not exists (
    select 1
      from public.bling_orders b1
      join public.bling_lojas bl
        on (b1.raw_data -> 'loja' ->> 'id') ~ '^[0-9]+$'
       and bl.bling_id = (b1.raw_data -> 'loja' ->> 'id')::bigint
     where bl.e_online is true
       and not coalesce(bl.ignorar, false)
       and b1.numero_loja = p.platform_order_number
  );

comment on view public.ecommerce_aguardando_bling is
  'Pedido que a plataforma tem e o Bling ainda nao — a coluna "Pago" da Esteira. E o COMPLEMENTO da bling2_esteira, e por isso a condicao de "ja esta no Bling" tem de ser a MESMA das duas views: mais frouxa aqui poe o pedido nas duas colunas, mais apertada o faz sumir do painel. Checa as DUAS contas; a da matriz usa a mesma condicao de loja on-line do ramo 1 da 20260990, e NAO filtra situacao_id (o ML Full fica em 15, nao em 9).';

grant select on public.ecommerce_aguardando_bling to authenticated;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 2 — CONFERÊNCIA                                                 ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

-- (a) ⚠️ A pergunta do bug: algum pedido em "Pago" E na esteira ao mesmo tempo?
--     ESPERADO: ZERO. Qualquer linha significa que as duas condições ainda
--     divergem — e é o mesmo card contado duas vezes.
select a.platform, a.pedido_loja, a.total, e.etapa
from public.ecommerce_aguardando_bling a
join public.bling2_esteira e on e.pedido_loja = a.pedido_loja
order by a.pedido_loja;

-- (b) O que sobrou em "Pago", por canal. O ML Full deve ter SUMIDO daqui (os
--     que já estão no Bling 1) e continuar na esteira.
select platform, count(*) as cards, min(ordered_at) as mais_antigo
from public.ecommerce_aguardando_bling
group by 1
order by 2 desc;

-- (c) O ML Full continua na esteira, inteiro? Esperado: as mesmas etapas de
--     antes (10 confirmado · 7 em_transito · 4 entregue, medido em 21/09).
select canal, etapa, count(*) as cards
from public.bling2_esteira
where canal = 'ML Full'
group by 1, 2
order by 3 desc;

-- (d) A view manteve o security_invoker? Esperado: {security_invoker=true}.
select relname, reloptions from pg_class where relname = 'ecommerce_aguardando_bling';

-- (e) ⚠️ Os outros canais não perderam nada? Compare com o que a coluna "Pago"
--     mostrava antes desta migração. Se algum canal que tinha cards ficou em
--     zero, o segundo `not exists` está pegando mais do que devia.
select platform, count(*) as cards from public.ecommerce_aguardando_bling
group by 1 order by 1;
