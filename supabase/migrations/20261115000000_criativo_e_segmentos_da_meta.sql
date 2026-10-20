-- ═══════════════════════════════════════════════════════════════════════════
-- 20261115 — Anúncios da Meta: a MINIATURA do criativo e QUEM compra, ONDE
--
-- Pedido do dono do processo em 20/10/2026 ("gostei desses acima ai"):
--   · a miniatura do criativo de cada anúncio;
--   · o resultado por idade, gênero, posicionamento (Feed, Stories, Reels) e
--     região.
--
-- Os dois exigem chamadas NOVAS à Meta, feitas pelo `meta-ads-sync` depois do
-- insight principal, numa tentativa própria (falhar ali não desfaz o gasto).
--
--   meta_ads_criativos   um anúncio por linha: miniatura, imagem, texto, status
--   meta_ads_segmentos   dia × dimensão × segmento, nível de CONTA
--   carbo_meta_ads_segmentos(de, ate, conta)   a tela lê (jsonb, agregado)
--
-- ⚠️ A URL da miniatura é ASSINADA pela Meta e vence em dias. Ela é relida a
-- cada rodada do cron (3×/dia); anúncio que saiu da conta fica com a última
-- URL, que pode não abrir — a tela mostra um ícone no lugar.
-- ⚠️ A Meta MODELA parte das conversões por segmento (iOS, consentimento de
-- cookie): a soma das compras por idade não precisa fechar com o total.
-- ⚠️ Sem policy de escrita: só a service role (o `meta-ads-sync`) grava.
--
-- Cada letra é UM bloco. Rode o A ANTES de o deploy terminar ou depois — tanto
-- faz: sem as tabelas, os extras do sync falham com aviso no log e o gasto
-- continua sendo gravado.
-- ═══════════════════════════════════════════════════════════════════════════


-- (A) As tabelas, a RLS e a função. ESPERADO: "Success. No rows returned".
create table if not exists public.meta_ads_criativos (
  ad_id          text primary key,
  act_id         text not null references public.meta_ads_accounts(act_id) on delete cascade,
  nome           text,
  status         text,          -- ACTIVE, PAUSED, CAMPAIGN_PAUSED, ADSET_PAUSED…
  thumbnail_url  text,
  image_url      text,
  tipo           text,          -- VIDEO, PHOTO, SHARE…
  titulo         text,
  texto          text,
  atualizado_em  timestamptz not null default now()
);
create index if not exists meta_ads_criativos_act_idx on public.meta_ads_criativos (act_id);

create table if not exists public.meta_ads_segmentos (
  dia            date not null,
  act_id         text not null references public.meta_ads_accounts(act_id) on delete cascade,
  dimensao       text not null check (dimensao in ('idade_genero', 'posicionamento', 'regiao')),
  chave1         text not null,   -- idade · plataforma · região
  chave2         text not null default '',  -- gênero · posição · (vazio)
  spend          numeric(14,2) not null default 0,
  impressions    bigint        not null default 0,
  link_clicks    bigint        not null default 0,
  compras        integer       not null default 0,
  valor          numeric(14,2) not null default 0,
  raw            jsonb not null,
  sincronizado_em timestamptz not null default now(),
  primary key (dia, act_id, dimensao, chave1, chave2)
);
create index if not exists meta_ads_segmentos_act_dia_idx on public.meta_ads_segmentos (act_id, dimensao, dia);

alter table public.meta_ads_criativos enable row level security;
alter table public.meta_ads_segmentos enable row level security;

drop policy if exists meta_ads_criativos_le on public.meta_ads_criativos;
create policy meta_ads_criativos_le on public.meta_ads_criativos
  for select to authenticated using ((select public.carbo_e_time_interno()));

drop policy if exists meta_ads_segmentos_le on public.meta_ads_segmentos;
create policy meta_ads_segmentos_le on public.meta_ads_segmentos
  for select to authenticated using ((select public.carbo_e_time_interno()));

grant select on public.meta_ads_criativos, public.meta_ads_segmentos to authenticated;

create or replace function public.carbo_meta_ads_segmentos(p_de date, p_ate date, p_act text default null)
returns jsonb
language sql stable set search_path = public as $$
  -- ⚠️ SECURITY INVOKER: a RLS acima vale para quem chama.
  -- ⚠️ jsonb, nunca `setof` (o teto de 1.000 do PostgREST vale para RPC).
  select coalesce(jsonb_object_agg(d.dimensao, d.linhas), '{}'::jsonb)
    from (
      select s.dimensao,
             jsonb_agg(jsonb_build_object(
               'chave1', s.chave1, 'chave2', s.chave2,
               'spend', s.spend, 'impressions', s.impressions, 'link_clicks', s.link_clicks,
               'compras', s.compras, 'valor', s.valor) order by s.spend desc) as linhas
        from (
          select dimensao, chave1, chave2,
                 sum(spend) as spend, sum(impressions) as impressions, sum(link_clicks) as link_clicks,
                 sum(compras) as compras, sum(valor) as valor
            from public.meta_ads_segmentos
           where dia between p_de and p_ate
             and (p_act is null or act_id = p_act)
           group by dimensao, chave1, chave2
        ) s
       group by s.dimensao
    ) d
$$;

revoke execute on function public.carbo_meta_ads_segmentos(date, date, text) from public, anon;
grant  execute on function public.carbo_meta_ads_segmentos(date, date, text) to authenticated;


-- (B) DEPOIS do deploy do `meta-ads-sync` (alguns minutos após o merge):
--     uma leitura de 90 dias, que traz junto criativos e segmentos — e é a
--     mesma que dá o "período anterior" da comparação.
--     ⚠️ Segredo copiado do job `meta-ads-sync-3x` (`%L`, nunca impresso).
--     ESPERADO: "Success. No rows returned" — a leitura segue em segundo plano.
do $ler$
declare v_secret text;
begin
  select (regexp_match(command, 'X-Cron-Secret''\s*,\s*''([^'']+)'''))[1]
    into v_secret from cron.job where jobname = 'meta-ads-sync-3x' limit 1;
  if v_secret is null or btrim(v_secret) = '' then
    raise exception 'Nao consegui ler o X-Cron-Secret do job meta-ads-sync-3x — nada foi disparado.';
  end if;
  execute format(
    'select net.http_post(url := %L, headers := jsonb_build_object(%L, %L, %L, %L), body := %L::jsonb, timeout_milliseconds := 300000)',
    'https://wpkfirmapxevzpxjovjr.supabase.co/functions/v1/meta-ads-sync',
    'Content-Type', 'application/json', 'X-Cron-Secret', v_secret,
    '{"dias":90,"source":"manual"}');
end $ler$;


-- (C) CONFERÊNCIA, ~2 min depois do (B). ESPERADO: `dia_mais_antigo` perto de
--     90 dias atrás, `criativos` > 0, `com_miniatura` perto de `criativos`, e
--     as três dimensões com linhas. `extras_erro` preenchido = a Meta recusou
--     criativo ou segmento — me mande o texto.
select (select min(dia) from public.meta_ads_insights_daily)                       as dia_mais_antigo,
       (select count(*) from public.meta_ads_criativos)                            as criativos,
       (select count(*) from public.meta_ads_criativos where thumbnail_url is not null) as com_miniatura,
       (select count(*) from public.meta_ads_segmentos where dimensao = 'idade_genero')   as idade_genero,
       (select count(*) from public.meta_ads_segmentos where dimensao = 'posicionamento') as posicionamento,
       (select count(*) from public.meta_ads_segmentos where dimensao = 'regiao')         as regiao,
       (select left(erro, 250) from public.meta_ads_sync_log
         where origem like '%:extras' and rodou_em > now() - interval '30 minutes'
         order by rodou_em desc limit 1)                                            as extras_erro,
       (select string_agg(to_char(rodou_em at time zone 'America/Sao_Paulo', 'HH24:MI') || ' ' || origem
                          || ' ' || desde || ' ok=' || ok, ' | ' order by rodou_em desc)
          from (select * from public.meta_ads_sync_log order by rodou_em desc limit 4) l) as ultimas_rodadas;
