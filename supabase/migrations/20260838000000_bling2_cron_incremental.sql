-- ═══════════════════════════════════════════════════════════════════════════
-- Bling 2 — rodada INCREMENTAL de 30 em 30 minutos
--
-- Motivo: as vendas on-line faturam sozinhas e emitem NF várias vezes por dia.
-- Com o cron só duas vezes ao dia, uma nota emitida às 09:00 só apareceria às
-- 14:30. Agora aparece em até meia hora.
--
-- ── Por que uma rodada NOVA, e não o `nfe` normal rodando mais vezes ───────
--
-- 1. O endpoint /nfe pagina o HISTÓRICO INTEIRO. Com 2 mil notas são 20
--    páginas a cada execução, para achar 3 notas novas. De 30 em 30 minutos
--    isso é 48× por dia, e piora a cada mês.
--
-- 2. Pior que o custo: o passo das "NFs que sumiram da lista" — o que detecta
--    nota CANCELADA, já que o Bling some com ela da listagem — compara
--    `synced_at` contra o início da rodada, sobre a tabela inteira. Numa
--    rodada curta, todo o histórico fica para trás e vira "sumida": 40
--    reconsultas por execução, para sempre, sem achar nada.
--
-- Por isso `nfe_recente` e `orders_recente` filtram por data na origem, têm
-- teto de páginas e NÃO fazem varredura de tabela cheia. O cancelamento
-- continua sendo detectado pela rodada completa diária, que segue de pé.
--
-- ── Os três jobs, e o que cada um cobre ───────────────────────────────────
--   bling2-sync-incremental  */30 * * * *   NF-e e pedidos dos últimos 7 dias
--   bling2-sync-rapido       30 11 * * *    cadastros (produtos, contatos…)
--   bling2-sync-pesado       30 17 * * *    varredura completa + cancelamentos
--
-- ⚠️ Depende do deploy de `bling2-sync` com as entidades `nfe_recente` e
-- `orders_recente`. Rodar isto antes do deploy só grava
-- "Entity desconhecida" no log — não quebra nada, mas não adianta.
-- ═══════════════════════════════════════════════════════════════════════════

-- ⚠️ Sem `create extension`: ver a nota em 20260837000000. Recriar dispara um
-- script interno do Supabase que falha com `2BP01: dependent privileges exist`.
do $$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    raise exception 'pg_cron não instalado.';
  end if;
end $$;

do $$
declare j record;
begin
  for j in
    select jobid from cron.job where jobname = 'bling2-sync-incremental'
  loop
    perform cron.unschedule(j.jobid);
  end loop;
end $$;

-- A cada 30 minutos, o dia inteiro. A rodada é barata por construção: uma
-- listagem filtrada por data (teto de 5 páginas) + no máximo 40 detalhes.
select cron.schedule(
  'bling2-sync-incremental',
  '*/30 * * * *',
  $cmd$
  select net.http_post(
    url     := 'https://wpkfirmapxevzpxjovjr.supabase.co/functions/v1/bling2-auto-sync',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'X-Cron-Secret', '73d61bd6-d915-4fda-bc25-5dba124d593d'
    ),
    body    := '{"source":"cron-incremental","fases":["orders_recente","nfe_recente"]}'::jsonb
  ) as request_id;
  $cmd$
);


-- ── Conferência ───────────────────────────────────────────────────────────

-- (a) Os três jobs do Bling 2 de pé (mais os dois do Bling 1, intocados)?
select jobname, schedule, active
from cron.job
where jobname like 'bling%'
order by jobname;

-- (b) Depois de uns 40 minutos: as rodadas incrementais estão rodando e
--     quanto trazem. `records_synced` alto e constante = o filtro de data não
--     está pegando (veja o aviso nos logs da function). Esperado: número
--     baixo, subindo só quando há venda.
select entity_type, status, records_synced, records_failed,
       started_at, finished_at
from public.bling2_sync_log
where entity_type in ('nfe_recente', 'orders_recente')
order by started_at desc
limit 20;

-- (c) A NF chegou mesmo? Últimas notas por data de emissão, com o atraso
--     entre emitir no Bling e aparecer aqui.
select numero, serie, data_emissao, situacao, valor_total,
       contato_nome, synced_at
from public.bling2_nfe
order by data_emissao desc nulls last, synced_at desc
limit 20;
