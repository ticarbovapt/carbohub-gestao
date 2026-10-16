-- =====================================================================
-- AUDITORIA (só leitura): por que o Dashboard Comercial e a Vendas Online
-- discordam sobre o on-line (16/10/2026).
--
-- Mesmo período (01/06 a 16/10), dois números:
--   Dashboard Comercial  "CarboZé on-line"  1.419 pedidos  R$ 197k
--   Vendas Online        Comparativo        1.673 vendas   R$ 206.086
--
-- As duas leem fontes DIFERENTES:
--   Dashboard  carbo_vendas_metrica — o pedido FATURADO no Bling, com NF
--              válida (conta_metrica), canal = segmento 'online'.
--              Data = data_efetiva (faturamento).
--   Vendas On. ecommerce_orders — o que a PLATAFORMA diz (paid/shipped/
--              delivered). Data = ordered_at (compra).
-- Diferença por si só não é defeito. Defeito é venda que conta no lugar
-- errado (on-line contando como "Comercial Expansão"), ou que conta sem ter
-- acontecido (cancelada na loja e faturada no Bling). Estes blocos separam
-- uma coisa da outra, venda por venda.
-- =====================================================================

-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║ A — o Dashboard por ORIGEM: conta Bling, loja, canal, se conta     ║
-- ╚═══════════════════════════════════════════════════════════════════╝
with v as (
  select v.*,
         case when v.external_ref like 'bling2-%' then 'bling2'
              when v.external_ref like 'bling-%'  then 'bling1'
              else 'sistema' end as conta
    from public.carbo_vendas_metrica v
   where v.data_efetiva between date '2026-06-01' and date '2026-10-16'
)
select v.conta,
       coalesce(bo2.loja_id::text, bo1.raw_data -> 'loja' ->> 'id')                  as loja_id,
       coalesce(l2.nome, l1.nome)                                                    as loja,
       coalesce(bo2.numero_loja, bo1.numero_loja) like 'PAYT\_%'                     as payt,
       v.segmento, v.conta_metrica, v.motivo_fora,
       count(*)                as pedidos,
       round(sum(v.total), 2)  as valor
  from v
  left join public.bling2_orders bo2 on v.conta = 'bling2' and bo2.bling_id::text = substr(v.external_ref, 8)
  left join public.bling_orders  bo1 on v.conta = 'bling1' and bo1.bling_id::text = substr(v.external_ref, 7)
  left join public.bling2_lojas  l2  on l2.bling_id = bo2.loja_id
  left join public.bling_lojas   l1  on (bo1.raw_data -> 'loja' ->> 'id') ~ '^[0-9]+$'
                                    and l1.bling_id = (bo1.raw_data -> 'loja' ->> 'id')::bigint
 group by 1, 2, 3, 4, 5, 6, 7
 order by 1, valor desc;

-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║ B — a Vendas Online por plataforma (a mesma conta da tela)         ║
-- ╚═══════════════════════════════════════════════════════════════════╝
with e as (
  select platform,
         case when platform = 'payt' and nullif(btrim(platform_order_number), '') is not null
              then platform_order_number
              else public.ecommerce_pedido_raiz(platform, order_id) end as pedido,
         status, total
    from public.ecommerce_orders
   where ordered_at >= timestamptz '2026-06-01 00:00:00-03'
     and ordered_at <= timestamptz '2026-10-16 23:59:59.999-03'
), p as (
  select platform, pedido,
         bool_or(public.ecommerce_status_e_venda(status))                        as venda,
         sum(total) filter (where public.ecommerce_status_e_venda(status))       as valor
    from e group by 1, 2
)
select platform,
       count(*)                          as recebidos,
       count(*) filter (where venda)     as vendas,
       round(sum(valor), 2)              as faturamento
  from p group by 1
 order by faturamento desc nulls last;

-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║ C — cada VENDA da plataforma: onde ela está no Dashboard?          ║
-- ╚═══════════════════════════════════════════════════════════════════╝
-- Elo com o Bling = o MESMO da Esteira: numero_loja = platform_order_number,
-- e na PayT a transação dentro de PAYT_<seller>_<transação>.
with linhas as (
  select platform, order_id, platform_order_number as pon, status, total,
         split_part(order_id, '-', 1) as tx
    from public.ecommerce_orders
   where ordered_at >= timestamptz '2026-06-01 00:00:00-03'
     and ordered_at <= timestamptz '2026-10-16 23:59:59.999-03'
), compras as (
  select platform,
         case when platform = 'payt' then pon
              else public.ecommerce_pedido_raiz(platform, order_id) end as pedido,
         max(pon)                                                        as pon,
         array_agg(distinct tx)                                          as txs,
         sum(total) filter (where public.ecommerce_status_e_venda(status)) as valor
    from linhas group by 1, 2
  having bool_or(public.ecommerce_status_e_venda(status))
), b as (
  select 'bling2-' || bling_id as ref, numero_loja from public.bling2_orders where numero_loja is not null
  union all
  select 'bling-'  || bling_id,        numero_loja from public.bling_orders  where numero_loja is not null
), casado as (
  select c.*,
         (select b.ref from b
           where (c.platform <> 'payt' and b.numero_loja = c.pon)
              or (c.platform = 'payt' and b.numero_loja like 'PAYT\_%'
                  and split_part(b.numero_loja, '_', 3) = any (c.txs))
           limit 1) as ref
    from compras c
)
select c.platform,
       case when c.ref is null            then '1. sem pedido no Bling'
            when v.external_ref is null   then '2. no Bling, não virou pedido no sistema'
            when v.conta_metrica and v.segmento = 'online' then '3. conta como ON-LINE'
            when v.conta_metrica          then '4. CONTA, mas FORA do on-line (segmento ' || coalesce(v.segmento, 'nulo') || ')'
            else '5. não conta: ' || coalesce(v.motivo_fora, '?') end as situacao,
       count(*)                as compras,
       round(sum(c.valor), 2)  as valor_plataforma,
       round(sum(v.total), 2)  as valor_bling
  from casado c
  left join public.carbo_vendas_metrica v on v.external_ref = c.ref
 group by 1, 2
 order by 1, 2;

-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║ D — o que o Dashboard conta como ON-LINE: a plataforma confirma?   ║
-- ╚═══════════════════════════════════════════════════════════════════╝
-- Faturamento contado de venda CANCELADA na loja aparece aqui.
with v as (
  select v.external_ref, v.total
    from public.carbo_vendas_metrica v
   where v.conta_metrica and v.segmento = 'online'
     and v.data_efetiva between date '2026-06-01' and date '2026-10-16'
), b as (
  select 'bling2-' || bling_id as ref, numero_loja from public.bling2_orders
  union all
  select 'bling-'  || bling_id,        numero_loja from public.bling_orders
), vb as (
  select v.*, b.numero_loja from v left join b on b.ref = v.external_ref
), st as (
  select vb.*,
         (select string_agg(distinct e.platform || ':' || e.status, ', ' order by e.platform || ':' || e.status)
            from public.ecommerce_orders e
           where (vb.numero_loja like 'PAYT\_%' and e.platform = 'payt'
                  and split_part(e.order_id, '-', 1) = split_part(vb.numero_loja, '_', 3))
              or (vb.numero_loja not like 'PAYT\_%' and e.platform_order_number = vb.numero_loja)) as status_plataforma
    from vb
)
select coalesce(status_plataforma, '(sem linha na plataforma)') as status_plataforma,
       count(*)               as pedidos,
       round(sum(total), 2)   as valor
  from st
 group by 1
 order by valor desc;
