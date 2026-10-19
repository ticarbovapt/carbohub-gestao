-- ═══════════════════════════════════════════════════════════════════════════
-- 20261112 — Anúncios da Meta: o que falta para a tela ter número (SÓ LEITURA)
--
-- A tela `admin.carbohub.com.br/ecommerce/anuncios` (EcommerceAtribuicao.tsx)
-- mostra gasto, alcance, cliques e a venda que a META atribui a si mesma, por
-- campanha → conjunto → anúncio. Ela lê `meta_ads_diario`, que é view sobre
-- `meta_ads_insights_daily`, e essa tabela só é escrita pela edge function
-- `meta-ads-sync` (`20260972`).
--
-- Para existir número, QUATRO coisas têm de estar de pé, e cada uma falha
-- calada:
--   1. a função NO AR — e ela NÃO está na lista `dep` do
--      deploy-functions.yml, então o push em `main` nunca a subiu;
--   2. o secret `META_ADS_ACCESS_TOKEN` (token de System User com `ads_read`);
--   3. a conta de anúncio cadastrada em `meta_ads_accounts` (act_…);
--   4. o cron com o CRON_SECRET de verdade — a 20260972 trazia o texto
--      `TROQUE_PELO_CRON_SECRET`, e rodado sem editar dá 401 para sempre.
--
-- Dois blocos, um resultado cada. ⚠️ Nenhum imprime segredo: o B4 responde só
-- true/false.
-- ═══════════════════════════════════════════════════════════════════════════


-- (A) O que existe no banco e no cron.
--     ESPERADO se nunca foi ligado: tabelas true e jobs 0 — ou jobs com
--     `cron_com_segredo_de_exemplo = true`.
select to_regclass('public.meta_ads_accounts')       is not null as tabela_contas,
       to_regclass('public.meta_ads_insights_daily') is not null as tabela_gasto,
       to_regclass('public.meta_ads_sync_log')       is not null as tabela_log,
       (select count(*) from cron.job where jobname like 'meta-ads-sync%')            as jobs,
       (select string_agg(jobname || ' ' || schedule || case when active then '' else ' (inativo)' end, ' · ')
          from cron.job where jobname like 'meta-ads-sync%')                          as quais_jobs,
       coalesce((select bool_or(command like '%TROQUE_PELO_CRON_SECRET%')
                   from cron.job where jobname like 'meta-ads-sync%'), false)         as cron_com_segredo_de_exemplo;


-- (B) O que tem DENTRO. Só rode se o (A) disse `tabela_contas = true`.
--     `contas = 0` → nenhuma conta cadastrada (é o que a tela chama de
--     "Nenhuma conta de anúncio conectada").
--     `rodadas = 0` → a função nunca rodou com sucesso nem com erro: não está
--     no ar, ou o cron não chega nela.
--     `ultimo_erro` preenchido → ela rodou e a Meta (ou o token) recusou.
select (select count(*) from public.meta_ads_accounts)                                  as contas,
       (select string_agg(act_id || ' · ' || apelido || case when ativo then '' else ' (inativa)' end, '; ')
          from public.meta_ads_accounts)                                                as quais_contas,
       (select count(*) from public.meta_ads_insights_daily)                            as linhas_de_gasto,
       (select max(dia) from public.meta_ads_insights_daily)                            as ultimo_dia_com_gasto,
       (select count(*) from public.meta_ads_sync_log)                                  as rodadas,
       (select to_char(max(rodou_em) at time zone 'America/Sao_Paulo', 'DD/MM HH24:MI')
          from public.meta_ads_sync_log)                                                as ultima_rodada,
       (select left(erro, 200) from public.meta_ads_sync_log
         where not ok order by rodou_em desc limit 1)                                   as ultimo_erro;
