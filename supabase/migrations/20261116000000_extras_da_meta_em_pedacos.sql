-- ═══════════════════════════════════════════════════════════════════════════
-- 20261116 — Extras da Meta (criativo e segmentos) pedidos em PEDAÇOS
--
-- A 1ª rodada da `20261115` voltou com
--   "criativo/segmentos: Graph respondeu: Please reduce the amount of data
--    you're asking for, then retry your request"
-- A Meta recusa a PÁGINA por tamanho: 200 anúncios com o criativo expandido e
-- 90 dias × região num pedido só. O `meta-ads-sync` agora:
--   · pede 50 anúncios por página e divide sozinho se a Meta reclamar;
--   · pede os segmentos em janelas de 15 dias;
--   · trata criativos e cada dimensão como partes INDEPENDENTES, e grava uma
--     linha `:extras` sempre — ok ou com a lista do que falhou, pelo nome.
--
-- Nada muda no banco. Os dois blocos abaixo são a releitura e a conferência.
-- ═══════════════════════════════════════════════════════════════════════════


-- (A) DEPOIS do deploy do `meta-ads-sync` (o Actions do merge terminar):
--     relê 90 dias, com os extras. ⚠️ Segredo copiado do job `meta-ads-sync-3x`
--     (`%L`, nunca impresso). ESPERADO: "Success. No rows returned".
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


-- (B) CONFERÊNCIA, ~3 min depois do (A). ESPERADO: `extras_ok = true`,
--     `extras_erro` nulo, `criativos` > 0, e as três dimensões com linhas
--     começando perto de `dia_mais_antigo`. `extras_ok` nulo = a rodada ainda
--     não terminou (espere e rode de novo). `false` = o texto de `extras_erro`
--     diz QUAL parte falhou — me mande.
select (select min(dia) from public.meta_ads_insights_daily)                       as dia_mais_antigo,
       (select count(*) from public.meta_ads_criativos)                            as criativos,
       (select count(*) from public.meta_ads_criativos where thumbnail_url is not null) as com_miniatura,
       (select count(*) || ' desde ' || min(dia) from public.meta_ads_segmentos where dimensao = 'idade_genero')   as idade_genero,
       (select count(*) || ' desde ' || min(dia) from public.meta_ads_segmentos where dimensao = 'posicionamento') as posicionamento,
       (select count(*) || ' desde ' || min(dia) from public.meta_ads_segmentos where dimensao = 'regiao')         as regiao,
       x.ok                 as extras_ok,
       left(x.erro, 400)    as extras_erro,
       to_char(x.rodou_em at time zone 'America/Sao_Paulo', 'HH24:MI') as extras_as
  from (select null::int) z
  left join lateral (
    select ok, erro, rodou_em from public.meta_ads_sync_log
     where origem like '%:extras' and rodou_em > now() - interval '30 minutes'
     order by rodou_em desc limit 1) x on true;
