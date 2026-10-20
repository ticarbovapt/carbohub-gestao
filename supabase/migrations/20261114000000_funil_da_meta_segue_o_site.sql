-- ═══════════════════════════════════════════════════════════════════════════
-- 20261114 — O funil da Meta segue o caminho REAL do site
--
-- O BLOCO A da `20261113` (20/10/2026, últimos 30 dias) desmentiu o funil de
-- loja clássico que eu tinha montado:
--
--   landing_page_view   37.168
--   initiate_checkout    7.261   ← MAIOR que o carrinho
--   view_content         5.348   ← e que "viu o produto"
--   add_to_cart          1.998
--   add_payment_info     1.439   ← etapa que eu NÃO lia
--   purchase               765
--
-- A página da PayT leva DIRETO ao checkout, sem carrinho: a sequência
-- produto → carrinho → checkout mostraria "363% seguiram". O funil passa a
-- ser cliques → página → checkout → pagamento → compra, e "viu o produto" e
-- "carrinho" aparecem À PARTE na tela, como eventos que nem todo caminho
-- dispara (a Nuvemshop dispara, a página da PayT não).
--
-- Só muda o corpo da função (mesma assinatura, `create or replace`): soma
-- `pagamento` ao `funil`. ESPERADO: "Success. No rows returned".
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.carbo_meta_ads_painel(p_de date, p_ate date, p_act text default null)
returns jsonb
language sql stable set search_path = public as $$
  -- ⚠️ SECURITY INVOKER de propósito: a RLS de `meta_ads_insights_daily` e de
  -- `ecommerce_orders` (time interno) continua valendo para quem chama.
  with
  janela as (
    select p_de as de, p_ate as ate,
           p_de - (p_ate - p_de + 1) as ant_de,
           p_de - 1                  as ant_ate
  ),
  base as (
    select i.dia, i.ad_id, i.ad_name, i.campaign_name, i.adset_name,
           i.spend, i.impressions, i.link_clicks, i.meta_compras, i.meta_valor_compras,
           i.raw->>'objective' as objetivo,
           public.carbo_meta_acao(i.raw->'actions', array['landing_page_view','omni_landing_page_view']) as pagina,
           public.carbo_meta_acao(i.raw->'actions', array['omni_view_content','offsite_conversion.fb_pixel_view_content','view_content']) as produto,
           public.carbo_meta_acao(i.raw->'actions', array['omni_add_to_cart','offsite_conversion.fb_pixel_add_to_cart','add_to_cart']) as carrinho,
           public.carbo_meta_acao(i.raw->'actions', array['omni_initiated_checkout','offsite_conversion.fb_pixel_initiate_checkout','initiate_checkout']) as checkout,
           public.carbo_meta_acao(i.raw->'actions', array['add_payment_info','offsite_conversion.fb_pixel_add_payment_info']) as pagamento
      from public.meta_ads_insights_daily i, janela j
     where i.dia between j.ant_de and j.ate
       and (p_act is null or i.act_id = p_act)
  ),
  atual    as (select b.* from base b, janela j where b.dia between j.de and j.ate),
  anterior as (select b.* from base b, janela j where b.dia between j.ant_de and j.ant_ate),
  -- A loja PRÓPRIA (para onde o anúncio leva). Dia de Brasília, só venda.
  loja as (
    select (o.ordered_at at time zone 'America/Sao_Paulo')::date as dia,
           o.total,
           case when o.platform = 'payt' and nullif(btrim(o.platform_order_number), '') is not null
                then 'carrinho:' || o.platform_order_number
                else o.platform || ':' || public.ecommerce_pedido_raiz(o.platform, o.order_id) end as pedido
      from public.ecommerce_orders o, janela j
     where o.platform in ('nuvemshop', 'payt')
       and public.ecommerce_status_e_venda(o.status)
       and o.ordered_at >= (j.ant_de::timestamp at time zone 'America/Sao_Paulo')
       and o.ordered_at <  ((j.ate + 1)::timestamp at time zone 'America/Sao_Paulo')
  )
  select jsonb_build_object(
    'periodo',  (select jsonb_build_object('de', de, 'ate', ate, 'ant_de', ant_de, 'ant_ate', ant_ate) from janela),
    'atual', (select jsonb_build_object(
        'spend', coalesce(sum(spend), 0), 'impressions', coalesce(sum(impressions), 0),
        'link_clicks', coalesce(sum(link_clicks), 0), 'compras', coalesce(sum(meta_compras), 0),
        'valor', coalesce(sum(meta_valor_compras), 0)) from atual),
    'anterior', (select jsonb_build_object(
        'spend', coalesce(sum(spend), 0), 'impressions', coalesce(sum(impressions), 0),
        'link_clicks', coalesce(sum(link_clicks), 0), 'compras', coalesce(sum(meta_compras), 0),
        'valor', coalesce(sum(meta_valor_compras), 0), 'linhas', count(*)) from anterior),
    'funil', (select jsonb_build_object(
        'impressoes', coalesce(sum(impressions), 0), 'cliques', coalesce(sum(link_clicks), 0),
        'pagina', coalesce(sum(pagina), 0), 'produto', coalesce(sum(produto), 0),
        'carrinho', coalesce(sum(carrinho), 0), 'checkout', coalesce(sum(checkout), 0),
        'pagamento', coalesce(sum(pagamento), 0),
        'compras', coalesce(sum(meta_compras), 0)) from atual),
    'loja', jsonb_build_object(
        'faturamento',          (select coalesce(sum(l.total), 0) from loja l, janela j where l.dia between j.de and j.ate),
        'pedidos',              (select count(distinct l.pedido) from loja l, janela j where l.dia between j.de and j.ate),
        'faturamento_anterior', (select coalesce(sum(l.total), 0) from loja l, janela j where l.dia between j.ant_de and j.ant_ate),
        'serie', (select coalesce(jsonb_agg(jsonb_build_object('dia', s.dia, 'faturamento', s.fat) order by s.dia), '[]'::jsonb)
                    from (select l.dia, sum(l.total) as fat from loja l, janela j
                           where l.dia between j.de and j.ate group by l.dia) s)),
    'anuncios', (select coalesce(jsonb_agg(x.a order by (x.a->>'spend')::numeric desc), '[]'::jsonb)
                   from (select jsonb_build_object(
                           'ad_id', ad_id, 'nome', max(ad_name), 'campanha', max(campaign_name),
                           'conjunto', max(adset_name), 'objetivo', max(objetivo),
                           'spend', sum(spend), 'impressions', sum(impressions),
                           'link_clicks', sum(link_clicks), 'compras', sum(meta_compras),
                           'valor', sum(meta_valor_compras), 'carrinho', sum(carrinho),
                           'dias', count(distinct dia), 'ultimo_dia', max(dia)) as a
                           from atual group by ad_id) x)
  )
$$;

revoke execute on function public.carbo_meta_ads_painel(date, date, text) from public, anon;
grant  execute on function public.carbo_meta_ads_painel(date, date, text) to authenticated;


-- CONFERÊNCIA. ESPERADO: `pagamento` perto de 1.439 (o do BLOCO A) e
-- `checkout` perto de 7.261.
select (p->'funil'->>'checkout')::numeric  as checkout,
       (p->'funil'->>'pagamento')::numeric as pagamento,
       (p->'funil'->>'compras')::numeric   as compras
  from (select public.carbo_meta_ads_painel(current_date - 29, current_date, null) as p) x;


-- ═══════════════════════════════════════════════════════════════════════════
-- Diagnóstico da leitura de 90 dias (BLOCO D da 20261113). A conferência E
-- voltou com o dia mais antigo em 21/09 — os mesmos 30 dias de antes.
-- ═══════════════════════════════════════════════════════════════════════════

-- (L) As últimas rodadas do sync. ESPERADO: uma linha `manual` com `desde`
--     perto de 22/07. Se a mais recente `manual` tiver `desde` 21/09, a leitura
--     de 90 dias não chegou à função (veja o M). Se tiver `desde` 22/07 com
--     `ok = true`, a Meta simplesmente não tem gasto antes de 21/09 nessa conta.
select to_char(rodou_em at time zone 'America/Sao_Paulo', 'DD/MM HH24:MI:SS') as quando,
       origem, desde, ate, linhas, ok, left(erro, 150) as erro, duracao_ms
  from public.meta_ads_sync_log
 order by rodou_em desc
 limit 6;

-- (M) O que a função respondeu às chamadas recentes. ESPERADO: status 200 com
--     `"dias":90` na janela. 401 = segredo; 5xx/timeout = a leitura passou do
--     tempo (aí ela se repete em lotes menores).
select to_char(created at time zone 'America/Sao_Paulo', 'DD/MM HH24:MI:SS') as quando,
       status_code, timed_out, left(coalesce(content, error_msg), 300) as resposta
  from net._http_response
 where content like '%"janela"%' or content like '%meta%' or error_msg is not null
 order by created desc
 limit 5;
