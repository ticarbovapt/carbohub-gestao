-- Mapa da Conquista · Vendas por estado — conferência (SÓ LEITURA).
-- A função `carbo_mapa_vendas` RECUSA no SQL Editor (sem usuário logado não há
-- app Admin) — está certo. Estes blocos refazem a conta pela tabela, para
-- comparar com a tela no mesmo período.

-- BLOCO A — pedidos por região e canal (troque as datas pelas da tela).
-- Tem de bater com os cartões de região em "Pedidos" (B2B e On-line).
select case when uf in ('AC','AM','AP','PA','RO','RR','TO') then 'Norte'
            when uf in ('AL','BA','CE','MA','PB','PE','PI','RN','SE') then 'Nordeste'
            when uf in ('DF','GO','MS','MT') then 'Centro-Oeste'
            when uf in ('ES','MG','RJ','SP') then 'Sudeste'
            when uf in ('PR','RS','SC') then 'Sul' end as regiao,
       count(*) filter (where not online) as pedidos_b2b,
       count(*) filter (where online)     as pedidos_online,
       round(sum(total) filter (where not online), 2) as valor_b2b,
       round(sum(total) filter (where online), 2)     as valor_online
  from (select upper(coalesce(nullif(trim(o.delivery_state), ''), nullif(trim(o.billing_state), ''))) as uf,
               coalesce(o.segmento, '') = 'online' as online, coalesce(o.total, 0) as total,
               public.carbo_cidade_canonica(
                 coalesce(nullif(trim(o.delivery_city), ''), nullif(trim(o.billing_city), '')),
                 coalesce(nullif(trim(o.delivery_state), ''), nullif(trim(o.billing_state), ''))) as cidade
          from public.carboze_orders o
         where o.status::text not in ('quote', 'cancelled')
           and coalesce(o.excluir_metricas, false) = false
           and coalesce(o.sale_date, o.created_at::date) between date '2026-11-01' and date '2026-11-26') x
 where cidade is not null and uf ~ '^[A-Z]{2}$'
 group by 1 order by 1;

-- BLOCO B — itens que a tela vai marcar "sem cadastro" (últimos 90 dias).
-- Esperado: poucas linhas. Cada uma conta 1 unidade por item na tela; o
-- código é o que se cadastra em Ops → Suprimentos → Mapeamento SKU.
select coalesce(nullif(trim(it->>'product_code'), ''), '(sem código)') as codigo,
       min(coalesce(it->>'name', it->>'product_name')) as exemplo_nome,
       count(*) as itens,
       count(*) filter (where o.segmento = 'online') as no_online
  from public.carboze_orders o
  cross join lateral jsonb_array_elements(case when jsonb_typeof(o.items) = 'array' then o.items else '[]'::jsonb end) it
 where o.status::text not in ('quote', 'cancelled')
   and coalesce(o.sale_date, o.created_at::date) >= current_date - 90
   and coalesce(it->>'kind', '') <> 'service'
   and not exists (select 1 from public.mrp_products m
                    where (it->>'product_id') ~* '^[0-9a-f-]{36}$' and m.id = (it->>'product_id')::uuid)
   and not exists (select 1 from public.sku_product_mappings s
                    where coalesce(s.is_active, true) and s.platform_sku = nullif(trim(it->>'product_code'), ''))
   and not exists (select 1 from public.mrp_products m
                    where m.product_code = nullif(trim(it->>'product_code'), ''))
 group by 1 order by itens desc
 limit 50;
