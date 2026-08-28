-- ═══════════════════════════════════════════════════════════════════════════
-- O Histórico mensal passa a contar UNIDADE DO CLIENTE, não `units_real` cru
--
-- ── O defeito ─────────────────────────────────────────────────────────────
--
-- `ecommerce_monthly_summary` soma `ecommerce_orders.units_real`. Esse campo só
-- é multiplicado na ESCRITA, e só pela Nuvemshop (`enrichUnitsReal`, em
-- `supabase/functions/_shared/nuvemshop.ts`). Para Mercado Livre, Amazon e
-- Shopee ele nasce igual a `quantity` — então um kit de 5 frascos vendido pelo
-- ML contava 1 unidade, e o mesmo kit vendido na loja própria contava 5.
--
-- Era a QUARTA verdade sobre a mesma pergunta: a aba da plataforma multiplicava
-- pelo mapa, o Comparativo somava `units_real`, o Histórico somava `units_real`
-- e a escrita da Nuvemshop já tinha multiplicado. Nenhuma delas dava erro.
--
-- ── A regra, e por que ela é uma SEGUNDA função ───────────────────────────
--
-- `carbo_ecommerce_sku_resolve` responde "quantas unidades saem da
-- PRATELEIRA" — é a pergunta do estoque, e é ela que a dedução usa. A tela de
-- vendas faz outra pergunta: "quantas unidades o CLIENTE levou". As duas JÁ
-- divergem — o kit de sachês entrega 10 ao cliente e tira 1 kit da prateleira —
-- e é exatamente para isso que `display_units_per_pack` existe.
--
-- Duas perguntas, duas funções, MESMA precedência (específico da plataforma
-- vence o genérico). Uma função só obrigaria a próxima pessoa a escolher qual
-- das duas perguntas sacrificar, em silêncio.
--
-- ⚠️ E O DIA DE DIVERGIR JÁ CHEGOU — esta função lê `display_units_per_pack`
-- PRIMEIRO. Medido no HUB-SP em 28/08/2026:
--
--     SKU 120 → KIT-CARB-SACH-10ML   cliente leva 10 · prateleira perde 1
--     SKU 124 → CZ100                cliente leva  5 · prateleira perde 5
--
-- O kit de sachês entrega DEZ sachês e tira UM kit fechado, porque a LogHouse
-- guarda kits (saldo 1.253) e não sachês soltos (saldo 0). Ler
-- `unidades_por_venda` aqui faria essa venda aparecer como 1 unidade vendida
-- em vez de 10 — o erro que esta migração existe para consertar, invertido.
--
-- No CZ100 os dois valem 5 e a diferença some. Foi essa coincidência que me fez
-- tratar os dois como um campo só na 20260955; o sachê desmentiu.
--
-- ⚠️ PENDENTE, e é real: a tela de cadastro do Ops só EDITA
-- `unidades_por_venda`; `display_units_per_pack` é somente leitura lá. Ninguém
-- consegue corrigir pela interface o número que ESTA função usa. Até isso mudar,
-- display novo entra por SQL.
--
-- ⚠️ O espelho desta regra no front é `apps/admin/src/lib/skuUnidades.ts`,
-- como `pedidoRaiz()` é o espelho de `ecommerce_pedido_raiz()`. Mudou uma,
-- mude a outra.
--
-- ⚠️ `ecommerce_raw_summary` NÃO muda: ela é o Caminho 1, a conferência crua
-- do que está gravado. Aplicar a regra de negócio lá apagaria a única visão que
-- ainda enxerga `units_real` como ele está no banco — e é a divergência entre
-- os dois caminhos que denuncia mapeamento faltando.
--
-- ⚠️ RODE EM BLOCOS.
-- ═══════════════════════════════════════════════════════════════════════════


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 0 — o tamanho do erro, ANTES de mexer                           ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
--
-- `units_real_hoje` é o que o Histórico mostra; `unidades_do_cliente` é o que
-- ele passará a mostrar. A diferença é toda em kit vendido fora da Nuvemshop.

select o.platform,
       to_char(date_trunc('month', o.ordered_at at time zone 'America/Sao_Paulo'), 'YYYY-MM') as mes,
       sum(o.units_real)                                        as units_real_hoje,
       sum(o.quantity * coalesce(
             (select coalesce(m.display_units_per_pack, m.unidades_por_venda, m.units_per_kit, 1)
              from public.sku_product_mappings m
              where m.platform_sku = o.product_sku and m.is_active
                and (m.platform = o.platform or m.platform is null)
              order by (m.platform = o.platform) desc nulls last limit 1), 1))
                                                                as unidades_do_cliente,
       count(*) filter (where o.product_sku is null)            as linhas_sem_sku
from public.ecommerce_orders o
where o.ordered_at > now() - interval '180 days'
group by 1, 2 order by 2 desc, 1;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 1 — a pergunta da TELA, em uma função                           ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

create or replace function public.carbo_ecommerce_unidades_exibidas(
  p_platform text, p_sku text
) returns numeric
language sql stable security definer set search_path = public as $$
  -- Mesma precedência da carbo_ecommerce_sku_resolve: o mapa da plataforma
  -- vence o mapa genérico. ⚠️ Sem SKU (a Shopee grava nulo) não há mapa e não
  -- há fator: devolve NULL, e quem chama decide — nunca 1 disfarçado de fato.
  select coalesce(m.display_units_per_pack, m.unidades_por_venda, m.units_per_kit)
  from public.sku_product_mappings m
  where p_sku is not null
    and m.platform_sku = p_sku
    and m.is_active
    and (m.platform = p_platform or m.platform is null)
  order by (m.platform = p_platform) desc nulls last
  limit 1
$$;

comment on function public.carbo_ecommerce_unidades_exibidas is
  'Quantas unidades o CLIENTE levou por pack daquele SKU — a pergunta das telas de venda. ⚠️ NULL = desconhecido (sem SKU ou sem mapa), nunca 1. Irmã da carbo_ecommerce_sku_resolve, que responde a pergunta do ESTOQUE (quantas saem da prateleira): as duas JA divergem: o kit de saches entrega 10 ao cliente (display) e tira 1 kit da prateleira (unidades_por_venda). Espelho no front: apps/admin/src/lib/skuUnidades.ts.';

grant execute on function public.carbo_ecommerce_unidades_exibidas(text, text) to authenticated;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 2 — o Histórico passa a usá-la                                  ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
--
-- ⚠️ `create or replace` basta: o RETURNS TABLE não muda. Só a conta de
-- `total_units` / `sale_units` muda — o resto é a 20260914, intacta.

create or replace function public.ecommerce_monthly_summary(
  p_platforms text[],
  p_from      date,
  p_to        date
)
returns table (
  platform          text,
  month_str         text,
  total_orders      bigint,
  sale_orders       bigint,
  total_units       bigint,
  sale_units        bigint,
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
      -- ⚠️ Fator conhecido multiplica `quantity`; NUNCA `units_real`. A
      -- Nuvemshop já multiplicou na escrita, e multiplicar de novo daria ×25
      -- num kit de 5. Sem fator, `units_real` é o melhor que existe.
      coalesce(o.quantity * public.carbo_ecommerce_unidades_exibidas(o.platform, o.product_sku),
               o.units_real,
               o.quantity)                                       as unidades,
      o.total
    from public.ecommerce_orders o
    where o.platform = any(p_platforms)
      and (o.ordered_at at time zone 'America/Sao_Paulo') >= p_from
      and (o.ordered_at at time zone 'America/Sao_Paulo') <  (p_to + interval '1 month')
  )
  select
    b.platform,
    b.month_str,
    count(distinct b.pedido)                                              as total_orders,
    count(distinct b.pedido) filter (where public.ecommerce_status_e_venda(b.status))
                                                                          as sale_orders,
    coalesce(sum(b.unidades), 0)::bigint                                  as total_units,
    coalesce(sum(b.unidades) filter (where public.ecommerce_status_e_venda(b.status)), 0)::bigint
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
  'Resumo mensal do e-commerce. Contagens = PEDIDOS distintos (a tabela tem uma linha por ITEM); receita soma linha a linha. total_revenue é FATURAMENTO (paid|shipped|delivered). ⚠️ Desde a 20260959 as unidades usam carbo_ecommerce_unidades_exibidas (quantity × fator do mapa), não units_real cru — que só a Nuvemshop multiplica na escrita e fazia o mesmo kit valer 5 na loja própria e 1 no Mercado Livre. Mês e filtro usam o mesmo relógio (America/Sao_Paulo).';

grant execute on function public.ecommerce_monthly_summary(text[], date, date) to authenticated;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 3 — conferência                                                 ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

-- (a) A função respondendo. Compare `total_units` com o BLOCO 0.
select * from public.ecommerce_monthly_summary(
  array['mercadolivre','amazon','nuvemshop','shopee'],
  (date_trunc('month', now()) - interval '3 months')::date,
  date_trunc('month', now())::date
) order by month_str desc, platform;

-- (b) ⭐ A LISTA DE TRABALHO: o que vende e não tem fator. Estas linhas contam
--     pelo número cru da plataforma — e aparecem na tela com "×?".
select o.platform, coalesce(o.product_sku, '(sem SKU)') as sku,
       max(o.product_name) as nome, count(*) as linhas, sum(o.quantity) as packs,
       max(o.ordered_at)::date as ultima_venda
from public.ecommerce_orders o
where o.ordered_at > now() - interval '90 days'
  and public.carbo_ecommerce_unidades_exibidas(o.platform, o.product_sku) is null
group by 1, 2 order by packs desc;
