-- ============================================================================
-- Produto × frete por pedido, das duas contas Bling (só leitura)
--
-- Frete = o que está NO PEDIDO do Bling (o que foi cobrado do cliente), não o
-- custo da etiqueta paga à transportadora.
--   Bling 2: `raw_detalhe->transporte->frete` (detalhe do pedido); na falta,
--            total − produtos + desconto (`bling2_frete_do_pedido`, 20260865) —
--            a LISTAGEM do Bling não devolve `totalFrete`.
--   Bling 1: só existe a listagem, então sempre a mesma dedução.
-- PayT chega com loja 0 (a da venda direta); quem a distingue é o
-- `numero_loja = 'PAYT_…'`, a mesma regra da Esteira.
-- Cancelado (situação 12) fica de fora. Período: edite `de` e `ate`.
-- O SQL Editor mostra só a última consulta: rode um bloco por vez.
-- ============================================================================

-- ── BLOCO 1 — resumo por conta ──────────────────────────────────────────────
with periodo as (select date '2026-06-01' as de, current_date as ate),
pedidos as (
  select 'Bling 2 (filial)' as conta,
         left(o.data, 10)::date as dia,
         coalesce(nullif(o.total_produtos, 0), nullif(o.raw_detalhe->>'totalProdutos', '')::numeric, 0) as produtos,
         coalesce(nullif(nullif(o.raw_detalhe->'transporte'->>'frete', '')::numeric, 0),
                  public.bling2_frete_do_pedido(o.total, o.total_produtos, o.total_desconto, o.total_frete)) as frete
    from public.bling2_orders o
   where coalesce(o.situacao_id, 0) <> 12 and o.data ~ '^20\d{2}-\d{2}-\d{2}'
  union all
  select 'Bling 1 (matriz)',
         left(o.data, 10)::date,
         coalesce(o.total_produtos, 0),
         public.bling2_frete_do_pedido(o.total, o.total_produtos, o.total_desconto, o.total_frete)
    from public.bling_orders o
   where coalesce(o.situacao_id, 0) <> 12 and o.data ~ '^20\d{2}-\d{2}-\d{2}'
)
select conta,
       count(*)                                                   as pedidos,
       round(sum(produtos), 2)                                    as valor_produtos,
       round(sum(frete), 2)                                       as valor_frete,
       round(avg(frete), 2)                                       as frete_medio_por_envio,
       round(avg(frete) filter (where frete > 0), 2)              as frete_medio_quando_cobrado,
       count(*) filter (where frete = 0)                          as envios_frete_zero,
       round(100.0 * count(*) filter (where frete = 0) / nullif(count(*), 0), 1) as pct_frete_zero,
       round(100.0 * sum(frete) / nullif(sum(produtos), 0), 2)    as frete_pct_do_produto
  from pedidos, periodo
 where dia between periodo.de and periodo.ate
 group by rollup(conta)
 order by conta nulls last;


-- ── BLOCO 2 — por mês ───────────────────────────────────────────────────────
with periodo as (select date '2026-06-01' as de, current_date as ate),
pedidos as (
  select 'Bling 2 (filial)' as conta,
         left(o.data, 10)::date as dia,
         coalesce(nullif(o.total_produtos, 0), nullif(o.raw_detalhe->>'totalProdutos', '')::numeric, 0) as produtos,
         coalesce(nullif(nullif(o.raw_detalhe->'transporte'->>'frete', '')::numeric, 0),
                  public.bling2_frete_do_pedido(o.total, o.total_produtos, o.total_desconto, o.total_frete)) as frete
    from public.bling2_orders o
   where coalesce(o.situacao_id, 0) <> 12 and o.data ~ '^20\d{2}-\d{2}-\d{2}'
  union all
  select 'Bling 1 (matriz)',
         left(o.data, 10)::date,
         coalesce(o.total_produtos, 0),
         public.bling2_frete_do_pedido(o.total, o.total_produtos, o.total_desconto, o.total_frete)
    from public.bling_orders o
   where coalesce(o.situacao_id, 0) <> 12 and o.data ~ '^20\d{2}-\d{2}-\d{2}'
)
select to_char(date_trunc('month', dia), 'YYYY-MM')               as mes,
       count(*)                                                   as pedidos,
       round(sum(produtos), 2)                                    as valor_produtos,
       round(sum(frete), 2)                                       as valor_frete,
       round(avg(frete), 2)                                       as frete_medio_por_envio,
       round(avg(frete) filter (where frete > 0), 2)              as frete_medio_quando_cobrado,
       round(100.0 * sum(frete) / nullif(sum(produtos), 0), 2)    as frete_pct_do_produto
  from pedidos, periodo
 where dia between periodo.de and periodo.ate
 group by 1
 order by 1 desc;


-- ── BLOCO 3 — por canal (loja do Bling) ─────────────────────────────────────
with periodo as (select date '2026-06-01' as de, current_date as ate),
pedidos as (
  select 'Bling 2' as conta,
         case when o.numero_loja like 'PAYT\_%' then 'PayT'
              else coalesce(l.nome, case when coalesce(o.loja_id, 0) = 0 then 'Venda direta' else 'Loja ' || o.loja_id end) end as canal,
         left(o.data, 10)::date as dia,
         coalesce(nullif(o.total_produtos, 0), nullif(o.raw_detalhe->>'totalProdutos', '')::numeric, 0) as produtos,
         coalesce(nullif(nullif(o.raw_detalhe->'transporte'->>'frete', '')::numeric, 0),
                  public.bling2_frete_do_pedido(o.total, o.total_produtos, o.total_desconto, o.total_frete)) as frete
    from public.bling2_orders o
    left join public.bling2_lojas l on l.bling_id = o.loja_id
   where coalesce(o.situacao_id, 0) <> 12 and o.data ~ '^20\d{2}-\d{2}-\d{2}'
  union all
  select 'Bling 1',
         case when o.numero_loja like 'PAYT\_%' then 'PayT'
              else coalesce(l.nome, case when coalesce(o.raw_data->'loja'->>'id', '0') = '0' then 'Venda direta' else 'Loja ' || (o.raw_data->'loja'->>'id') end) end,
         left(o.data, 10)::date,
         coalesce(o.total_produtos, 0),
         public.bling2_frete_do_pedido(o.total, o.total_produtos, o.total_desconto, o.total_frete)
    from public.bling_orders o
    left join public.bling_lojas l on l.bling_id::text = o.raw_data->'loja'->>'id'
   where coalesce(o.situacao_id, 0) <> 12 and o.data ~ '^20\d{2}-\d{2}-\d{2}'
)
select conta, canal,
       count(*)                                                   as pedidos,
       round(sum(produtos), 2)                                    as valor_produtos,
       round(sum(frete), 2)                                       as valor_frete,
       round(avg(frete), 2)                                       as frete_medio_por_envio,
       round(avg(frete) filter (where frete > 0), 2)              as frete_medio_quando_cobrado,
       round(100.0 * count(*) filter (where frete = 0) / nullif(count(*), 0), 1) as pct_frete_zero
  from pedidos, periodo
 where dia between periodo.de and periodo.ate
 group by 1, 2
 order by valor_produtos desc;


-- ── BLOCO 4 — pedido a pedido ───────────────────────────────────────────────
with periodo as (select date '2026-06-01' as de, current_date as ate),
pedidos as (
  select 'Bling 2' as conta, o.numero, o.numero_loja,
         case when o.numero_loja like 'PAYT\_%' then 'PayT'
              else coalesce(l.nome, case when coalesce(o.loja_id, 0) = 0 then 'Venda direta' else 'Loja ' || o.loja_id end) end as canal,
         left(o.data, 10)::date as dia, o.contato_nome as cliente,
         coalesce(nullif(o.total_produtos, 0), nullif(o.raw_detalhe->>'totalProdutos', '')::numeric, 0) as produtos,
         coalesce(nullif(nullif(o.raw_detalhe->'transporte'->>'frete', '')::numeric, 0),
                  public.bling2_frete_do_pedido(o.total, o.total_produtos, o.total_desconto, o.total_frete)) as frete,
         o.total
    from public.bling2_orders o
    left join public.bling2_lojas l on l.bling_id = o.loja_id
   where coalesce(o.situacao_id, 0) <> 12 and o.data ~ '^20\d{2}-\d{2}-\d{2}'
  union all
  select 'Bling 1', o.numero, o.numero_loja,
         case when o.numero_loja like 'PAYT\_%' then 'PayT'
              else coalesce(l.nome, case when coalesce(o.raw_data->'loja'->>'id', '0') = '0' then 'Venda direta' else 'Loja ' || (o.raw_data->'loja'->>'id') end) end,
         left(o.data, 10)::date, o.contato_nome,
         coalesce(o.total_produtos, 0),
         public.bling2_frete_do_pedido(o.total, o.total_produtos, o.total_desconto, o.total_frete),
         o.total
    from public.bling_orders o
    left join public.bling_lojas l on l.bling_id::text = o.raw_data->'loja'->>'id'
   where coalesce(o.situacao_id, 0) <> 12 and o.data ~ '^20\d{2}-\d{2}-\d{2}'
)
select conta, dia, numero, numero_loja, canal, cliente,
       produtos as valor_produtos, frete as valor_frete, total
  from pedidos, periodo
 where dia between periodo.de and periodo.ate
 order by dia desc, conta, numero;
