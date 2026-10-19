-- ═══════════════════════════════════════════════════════════════════════════
-- 20261105 — O log do cron, a faxina diária e o que pesa na auditoria
--
-- 19/10/2026: o banco estava numa Micro (1 GB de RAM, 90% usada, com swap) e
-- foi para Medium (4 GB). Na mesma medição, ~1,1 GB dos 1,4 GB do banco eram
-- LOG, não dado:
--
--   cron.job_run_details    713 MB   nunca foi limpo — 42 jobs, seis por minuto
--   order_audit_logs        381 MB   linha inteira antes/depois a cada mudança
--
-- ⚠️ `cron.job_run_details` é o "succeeded" que este repo já aprendeu a não
-- levar a sério (o sucesso dele é ter POSTADO). O desfecho real das funções
-- chamadas por cron está em `net._http_response`, que o pg_net já limpa sozinho.
-- Guardar 7 dias dele basta para qualquer diagnóstico que já fizemos aqui.
--
-- ⚠️ `order_audit_logs` NÃO é apagado aqui. Ele é a ferramenta de investigação
-- (foi ele que provou as parcelas travadas da `20261059`), e quanto tempo
-- guardar é decisão do dono do processo. O bloco D só MEDE o que pesa.
--
-- Cada letra é UM bloco (o SQL Editor mostra só o último resultado).
-- ═══════════════════════════════════════════════════════════════════════════


-- (A) MEDIR o log do cron antes de mexer: tamanho, linhas e a mais antiga.
select pg_size_pretty(pg_total_relation_size('cron.job_run_details')) as tamanho,
       count(*)                                                       as linhas,
       min(start_time)                                                as mais_antiga,
       count(*) filter (where start_time > now() - interval '1 day')  as ultimas_24h
from cron.job_run_details;


-- (B) As falhas de cron das últimas 24 h, agrupadas por job e mensagem.
--     ESPERADO: concentradas no horário da troca para Medium (reinícios do
--     banco). Falha espalhada pelo dia, num job só, é defeito de verdade.
select j.jobname,
       left(d.return_message, 120)                                     as mensagem,
       count(*)                                                        as vezes,
       to_char(min(d.start_time) at time zone 'America/Sao_Paulo', 'DD/MM HH24:MI') as primeira,
       to_char(max(d.start_time) at time zone 'America/Sao_Paulo', 'DD/MM HH24:MI') as ultima
from cron.job_run_details d
left join cron.job j on j.jobid = d.jobid
where d.status = 'failed'
  and d.start_time > now() - interval '1 day'
group by 1, 2
order by vezes desc;


-- (C) A FAXINA. Apaga o histórico de EXECUÇÕES do cron — os AGENDAMENTOS
--     (`cron.job`) não são tocados, nada para de rodar.
--     ⚠️ TRUNCATE e não DELETE: apagar ~713 MB linha a linha geraria um
--     volume enorme de WAL, e o Realtime decodifica TODO o WAL (19,6% do
--     tempo do banco já é ele). TRUNCATE libera o espaço na hora e não gera.
--     Se o Supabase recusar o TRUNCATE por permissão, o bloco cai no DELETE
--     dos anteriores a 7 dias e diz isso.
--     E agenda a faxina diária: 03:37 de Brasília (minuto ímpar; o :41 é do
--     ml-estoque-full), guardando 7 dias. Rodar de novo não duplica o job.
do $$
begin
  begin
    truncate cron.job_run_details;
    raise notice 'log do cron: TRUNCATE feito';
  exception when insufficient_privilege then
    delete from cron.job_run_details where end_time < now() - interval '7 days';
    raise notice 'log do cron: sem permissão para TRUNCATE — apagados só os anteriores a 7 dias';
  end;

  perform cron.unschedule(jobid) from cron.job where jobname = 'cron-log-faxina-diaria';
  perform cron.schedule(
    'cron-log-faxina-diaria',
    '37 6 * * *',
    $faxina$delete from cron.job_run_details where end_time < now() - interval '7 days'$faxina$
  );
end $$;

select jobid, jobname, schedule, active
from cron.job where jobname = 'cron-log-faxina-diaria';


-- (D) O que pesa na auditoria: por tabela, AUTOMÁTICO (user_id nulo = cron,
--     sync, gatilho) contra feito por PESSOA, e quanto é dos últimos 90 dias.
--     Se o grosso for automático de uma tabela só, o caminho é parar de
--     gravar esse ruído — não apagar o histórico de quem mexeu à mão.
select table_name,
       case when user_id is null then 'automatico' else 'pessoa' end as quem,
       count(*)                                                       as linhas,
       count(*) filter (where created_at > now() - interval '90 days') as ultimos_90d,
       pg_size_pretty(sum(pg_column_size(before_data) + pg_column_size(after_data))) as peso_json,
       min(created_at)::date                                          as desde
from public.order_audit_logs
group by 1, 2
order by sum(pg_column_size(before_data) + pg_column_size(after_data)) desc nulls last
limit 20;


-- (E) Os jobs ativos, com a FUNÇÃO que cada um chama e o corpo — SEM o
--     segredo (o `X-Cron-Secret` está no comando em texto puro; aqui sai só o
--     nome da função e o body, com qualquer chave "secret" mascarada).
--     Serve para decidir quais jobs são duplicados: mesma função + mesmo
--     corpo em dois jobs é o mesmo trabalho feito duas vezes.
select j.jobid, j.jobname, j.schedule,
       substring(j.command from 'functions/v1/([a-zA-Z0-9_-]+)') as funcao,
       left(regexp_replace(
              coalesce(substring(j.command from 'body\s*:=\s*''([^'']*)'''), ''),
              '"[^"]*secret[^"]*"\s*:\s*"[^"]*"', '"secret":"***"', 'gi'), 120) as corpo,
       case when j.command ~ 'functions/v1/' then null
            when j.command ~* 'secret'      then '(tem segredo no comando — omitido)'
            else left(regexp_replace(j.command, '\s+', ' ', 'g'), 120) end as sql_direto
from cron.job j
where j.active
order by funcao nulls last, j.jobname;
