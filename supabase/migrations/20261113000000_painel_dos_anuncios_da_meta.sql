-- ═══════════════════════════════════════════════════════════════════════════
-- 20261113 — Anúncios da Meta: o painel ganha funil, comparação, loja real e
--            destaque por anúncio
--
-- Pedido do dono do processo em 20/10/2026, no primeiro dia da tela com
-- número: *"não tem mais coisa para mostrar? achei tão simples isso ai"*.
--
-- Tudo aqui sai do que JÁ está gravado — nenhuma chamada nova à Meta:
--   · o FUNIL (página → produto → carrinho → checkout) mora em `raw->'actions'`,
--     que o `meta-ads-sync` guarda inteiro desde o primeiro dia;
--   · a LOJA REAL é `ecommerce_orders` (Nuvemshop + PayT, só linha que é venda);
--   · o período ANTERIOR é a mesma conta, deslocada.
--
-- `carbo_meta_ads_painel(de, ate, conta)` devolve tudo num `jsonb` só:
--   ⚠️ jsonb, nunca `setof` — o teto de 1.000 do PostgREST vale para RPC;
--   ⚠️ TOTAL agregado no BANCO (regra de escala de 19/10/2026), nunca baixado.
--
-- ⚠️ "Vendas (Meta)" continua sendo a ATRIBUIÇÃO da Meta. O que entra ao lado é
-- o faturamento REAL da loja própria no mesmo período — o MER (faturamento ÷
-- investimento) não atribui nada a ninguém, e é por isso que ele não mente.
--
-- Cada letra é UM bloco (o SQL Editor mostra só o último resultado).
-- ═══════════════════════════════════════════════════════════════════════════


-- (A) MEDIR: que tipos de ação a Meta mandou nos últimos 30 dias. É daqui que
--     sai o funil. ESPERADO: entre outros, `landing_page_view`,
--     `omni_view_content`, `omni_add_to_cart`, `omni_initiated_checkout` e
--     `omni_purchase`. Se os de carrinho/checkout NÃO aparecerem, o pixel do
--     site não manda esses eventos — o funil mostra "—" nessas etapas, e a
--     correção é no pixel, não aqui.
select a->>'action_type'                  as tipo,
       count(*)                           as linhas,
       round(sum((a->>'value')::numeric)) as total
  from public.meta_ads_insights_daily i,
       jsonb_array_elements(case when jsonb_typeof(i.raw->'actions') = 'array'
                                 then i.raw->'actions' else '[]'::jsonb end) a
 where i.dia >= current_date - 30
 group by 1
 order by 3 desc;


-- (B) As duas funções. ESPERADO: "Success. No rows returned".
create or replace function public.carbo_meta_acao(p_acoes jsonb, p_tipos text[])
returns numeric
language sql immutable parallel safe set search_path = public as $$
  -- O PRIMEIRO tipo que existir na linha, nunca a soma: `omni_*` já vem
  -- deduplicado entre site e app, e o evento cru do pixel conta a mesma ação de
  -- novo. É a regra do `primeiraAcao` do `meta-ads-sync`, para as outras etapas.
  select coalesce((
    select (a->>'value')::numeric
      from jsonb_array_elements(case when jsonb_typeof(p_acoes) = 'array'
                                     then p_acoes else '[]'::jsonb end) a
      join unnest(p_tipos) with ordinality t(tipo, ordem) on t.tipo = a->>'action_type'
     order by t.ordem
     limit 1), 0)
$$;

revoke execute on function public.carbo_meta_acao(jsonb, text[]) from public, anon;
grant  execute on function public.carbo_meta_acao(jsonb, text[]) to authenticated, service_role;


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
           public.carbo_meta_acao(i.raw->'actions', array['omni_initiated_checkout','offsite_conversion.fb_pixel_initiate_checkout','initiate_checkout']) as checkout
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


-- (C) CONFERÊNCIA: o painel dos últimos 30 dias. ESPERADO: uma linha com
--     `investimento` igual ao card "Investimento" da tela em "Últimos 30 dias",
--     `faturamento_loja` > 0 e `anuncios` > 0.
--     ⚠️ Rodado no SQL Editor, ele passa pela RLS como dono e por isso lê tudo;
--     na tela, lê o mesmo para quem é do time interno.
select (p->'atual'->>'spend')::numeric          as investimento,
       (p->'loja'->>'faturamento')::numeric     as faturamento_loja,
       (p->'loja'->>'pedidos')::int             as pedidos_loja,
       (p->'funil'->>'carrinho')::numeric       as carrinhos,
       (p->'funil'->>'checkout')::numeric       as checkouts,
       jsonb_array_length(p->'anuncios')        as anuncios
  from (select public.carbo_meta_ads_painel(current_date - 29, current_date, null) as p) x;


-- (D) UMA leitura de 90 dias, agora, para existir "período anterior".
--     A conta foi ligada lendo 30 dias, e o cron relê só 30 — sem isto, a
--     comparação dos cards fica em "sem base no período anterior". O que é
--     mais velho que 30 dias fica gravado e não muda mais (a Meta só reatribui
--     dentro de 7 dias), então isto não precisa se repetir.
--     ⚠️ Rode DEPOIS do deploy do `meta-ads-sync` (o push na main), senão a
--     leitura sai sem o `objective` das campanhas e o "Investindo e sem venda"
--     não consegue separar engajamento de venda nesses dias.
--     ⚠️ O segredo é COPIADO do job `meta-ads-sync-3x` (`%L`, nunca impresso).
--     ESPERADO: uma linha com `request_id` (um número). A leitura leva ~1 min;
--     depois, a tela em "Últimos 30 dias" mostra a comparação.
do $ler$
declare v_secret text;
begin
  select (regexp_match(command, 'X-Cron-Secret''\s*,\s*''([^'']+)'''))[1]
    into v_secret from cron.job where jobname = 'meta-ads-sync-3x' limit 1;
  if v_secret is null or btrim(v_secret) = '' then
    raise exception 'Nao consegui ler o X-Cron-Secret do job meta-ads-sync-3x — nada foi disparado.';
  end if;
  execute format(
    'select net.http_post(url := %L, headers := jsonb_build_object(%L, %L, %L, %L), body := %L::jsonb, timeout_milliseconds := 120000)',
    'https://wpkfirmapxevzpxjovjr.supabase.co/functions/v1/meta-ads-sync',
    'Content-Type', 'application/json', 'X-Cron-Secret', v_secret,
    '{"dias":90,"source":"manual"}');
end $ler$;

select count(*) as linhas_gravadas, min(dia) as dia_mais_antigo, max(dia) as dia_mais_recente
  from public.meta_ads_insights_daily;
