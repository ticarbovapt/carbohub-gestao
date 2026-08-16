-- ═══════════════════════════════════════════════════════════════════════════
-- O histórico mensal passa a contar PEDIDO, e a chamar de faturamento só o
-- que foi pago
--
-- ── O que estava errado ───────────────────────────────────────────────────
--
-- A `ecommerce_monthly_summary` nasceu em 20260526 e nunca foi revisitada. Duas
-- coisas que o resto do painel corrigiu passaram por cima dela:
--
--   COUNT(*)              AS total_orders    -- conta ITEM, não pedido
--   ROUND(SUM(total), 2)  AS total_revenue   -- inclui cancelado E pendente
--
-- A primeira é a lição da 20260855: `ecommerce_orders` grava uma linha por
-- ITEM (`order_id = '<pedido>-<item>'`), então `count(*)` conta itens. Um
-- pedido de dois produtos virava duas vendas — a loja dizia 4 no dia e o painel
-- dizia 8. A view diária foi corrigida; a mensal ficou para trás.
--
-- A segunda é a lição da 20260841: pagamento pendente não é venda. Um PIX
-- gerado e nunca pago somava no faturamento do mês, e pedido cancelado
-- continuava lá depois de cancelado.
--
-- ⚠️ Nenhuma das duas dá erro. As duas dão um número MAIOR — que é o pior modo
-- de falhar num painel, porque ninguém desconfia de um resultado bom.
--
-- ── A terceira, que só apareceu ao ler com calma ──────────────────────────
--
-- O agrupamento usa o mês de Brasília (`AT TIME ZONE 'America/Sao_Paulo'`) e o
-- filtro usa instante UTC. Dois relógios na mesma consulta:
--
--   ... AND ordered_at < (p_to + INTERVAL '1 month')::timestamptz
--
-- `2026-09-01 00:00 UTC` é `2026-08-31 21:00` em Brasília. Venda das 21h às
-- 23h59 do ÚLTIMO dia do intervalo escolhido ficava de fora — sempre, e sempre
-- só no mês da ponta. Agora os dois lados contam pelo mesmo relógio.
--
-- ── Mudança de significado, declarada ─────────────────────────────────────
--
-- `total_revenue` passa a ser FATURAMENTO (paid|shipped|delivered), alinhado com
-- o `totalRevenue` do caminho diário. O que saiu dele não sumiu: virou
-- `pending_revenue` e `cancelled_revenue`, colunas próprias, para a tela poder
-- mostrar os três em vez de escondê-los dentro de um.
--
-- ⚠️ Por isso é DROP + CREATE: mudar o RETURNS TABLE de uma função não é
-- `create or replace`. E a assinatura antiga precisa cair explicitamente,
-- senão fica uma sobrecarga e o PostgREST devolve PGRST203 (ambíguo) sem
-- ninguém entender por quê.
-- ═══════════════════════════════════════════════════════════════════════════

drop function if exists public.ecommerce_monthly_summary(text[], date, date);

create function public.ecommerce_monthly_summary(
  p_platforms text[],
  p_from      date,
  p_to        date
)
returns table (
  platform          text,
  month_str         text,
  -- Pedidos DISTINTOS que chegaram, em qualquer status.
  total_orders      bigint,
  -- Destes, os que viraram venda. É o número que a tela mostra grande.
  sale_orders       bigint,
  total_units       bigint,
  sale_units        bigint,
  -- ⚠️ Agora é só o pago. Ver o cabeçalho.
  total_revenue     numeric,
  pending_revenue   numeric,
  cancelled_revenue numeric,
  cancelled_orders  bigint,
  pending_orders    bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with base as (
    select
      o.platform,
      to_char(date_trunc('month', o.ordered_at at time zone 'America/Sao_Paulo'),
              'YYYY-MM')                                        as month_str,
      public.ecommerce_pedido_raiz(o.platform, o.order_id)       as pedido,
      o.status,
      o.units_real,
      o.total
    from public.ecommerce_orders o
    where o.platform = any(p_platforms)
      -- ⚠️ MESMO relógio do agrupamento. Comparar instante UTC contra um mês
      -- de Brasília cortava as últimas 3 horas do último dia do intervalo.
      and (o.ordered_at at time zone 'America/Sao_Paulo') >= p_from
      and (o.ordered_at at time zone 'America/Sao_Paulo') <  (p_to + interval '1 month')
  )
  select
    b.platform,
    b.month_str,
    -- ⚠️ DISTINCT no pedido, não count(*): a tabela tem uma linha por item.
    count(distinct b.pedido)                                              as total_orders,
    count(distinct b.pedido) filter (where public.ecommerce_status_e_venda(b.status))
                                                                          as sale_orders,
    -- Unidades e receita seguem somando linha a linha — isso sempre esteve
    -- certo, o errado era só a contagem de pedidos.
    coalesce(sum(b.units_real), 0)::bigint                                as total_units,
    coalesce(sum(b.units_real) filter (where public.ecommerce_status_e_venda(b.status)), 0)::bigint
                                                                          as sale_units,
    round(coalesce(sum(b.total) filter (where public.ecommerce_status_e_venda(b.status)), 0)::numeric, 2)
                                                                          as total_revenue,
    round(coalesce(sum(b.total) filter (
      where not public.ecommerce_status_e_venda(b.status)
        and b.status is distinct from 'cancelled'), 0)::numeric, 2)       as pending_revenue,
    round(coalesce(sum(b.total) filter (where b.status = 'cancelled'), 0)::numeric, 2)
                                                                          as cancelled_revenue,
    count(distinct b.pedido) filter (where b.status = 'cancelled')        as cancelled_orders,
    count(distinct b.pedido) filter (where b.status = 'pending')          as pending_orders
  from base b
  group by b.platform, b.month_str
  order by b.month_str, b.platform;
$$;

comment on function public.ecommerce_monthly_summary is
  'Resumo mensal do e-commerce. Contagens = PEDIDOS distintos (a tabela tem uma linha por ITEM); receita soma linha a linha. ⚠️ total_revenue é FATURAMENTO (paid|shipped|delivered) — pendente e cancelado saíram para colunas próprias. Mês e filtro usam o mesmo relógio (America/Sao_Paulo).';

grant execute on function public.ecommerce_monthly_summary(text[], date, date) to authenticated;


-- ═══════════════════════════════════════════════════════════════════════════
-- Conferência
-- ═══════════════════════════════════════════════════════════════════════════

-- (a) O tamanho do erro que existia. `pedidos_antes` é o que a tela mostrava;
--     `pedidos_agora` é o número certo; `vendas` é o que virou venda de fato.
--     A diferença entre as duas primeiras é pedido de mais de um item; entre a
--     segunda e a terceira, pedido não pago ou cancelado.
select platform,
       to_char(date_trunc('month', ordered_at at time zone 'America/Sao_Paulo'), 'YYYY-MM') as mes,
       count(*)                                                        as pedidos_antes,
       count(distinct public.ecommerce_pedido_raiz(platform, order_id)) as pedidos_agora,
       count(distinct public.ecommerce_pedido_raiz(platform, order_id))
         filter (where public.ecommerce_status_e_venda(status))         as vendas
from public.ecommerce_orders
where ordered_at > now() - interval '120 days'
group by 1, 2 order by 2 desc, 1;

-- (b) E o do faturamento: quanto do "total" era dinheiro que não entrou.
select to_char(date_trunc('month', ordered_at at time zone 'America/Sao_Paulo'), 'YYYY-MM') as mes,
       round(sum(total)::numeric, 2)                                                as mostrava_antes,
       round(sum(total) filter (where public.ecommerce_status_e_venda(status))::numeric, 2) as faturamento_real,
       round(sum(total) filter (where status = 'pending')::numeric, 2)              as a_receber,
       round(sum(total) filter (where status = 'cancelled')::numeric, 2)            as cancelado
from public.ecommerce_orders
where ordered_at > now() - interval '120 days'
group by 1 order by 1 desc;

-- (c) A função respondendo. Compare com (a) e (b).
select * from public.ecommerce_monthly_summary(
  array['mercadolivre','amazon','nuvemshop'],
  (date_trunc('month', now()) - interval '3 months')::date,
  date_trunc('month', now())::date
) order by month_str desc, platform;
