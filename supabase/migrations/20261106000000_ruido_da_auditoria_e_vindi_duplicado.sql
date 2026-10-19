-- ═══════════════════════════════════════════════════════════════════════════
-- 20261106 — O ruído da auditoria e o vindi-sync duplicado
--
-- Medido em 19/10/2026 (`20261105`, blocos B, D e E):
--
--   · As falhas de cron de 19/10 foram TODAS `job startup timeout`, nos
--     mesmos instantes (09:43, 10:13, 11:24, 12:01, 12:15): o pg_cron não
--     conseguiu nem COMEÇAR o job, porque o banco (Micro, 1 GB) estava sem
--     fôlego. Nesses minutos o whatsapp-meta não rodou — não foi timeout da
--     fila, foi o job que nunca saiu. Depois da troca para Medium o esperado
--     é zero; o bloco H confere.
--   · `order_audit_logs`: 48.103 linhas AUTOMÁTICAS de `carboze_orders`,
--     266 MB, 97% dos últimos 90 dias. O feito por PESSOA é 10 MB. O peso é
--     de quem grava sozinho (cron, ponte, sync), e cada linha leva o pedido
--     INTEIRO duas vezes (antes e depois).
--   · `vindi-sync-15min` (*/15) e `vindi-sync-hourly` (0 * * * *) chamam a
--     MESMA função com o MESMO corpo `{}`. No minuto :00 os dois rodam juntos;
--     o de hora em hora não faz nada que o de 15 min não faça.
--
-- Cada letra é UM bloco (o SQL Editor mostra só o último resultado).
-- ═══════════════════════════════════════════════════════════════════════════


-- (F) Quantas linhas automáticas de pedido a auditoria grava POR DIA, nos
--     últimos 14 dias. Um salto num dia aponta o job que começou ali (o
--     `carbo-status-pela-plataforma` entrou em 16/10).
select (created_at at time zone 'America/Sao_Paulo')::date           as dia,
       count(*)                                                       as linhas,
       count(*) filter (where action = 'UPDATE')                      as updates,
       pg_size_pretty(sum(pg_column_size(before_data) + pg_column_size(after_data))) as peso
from public.order_audit_logs
where table_name = 'carboze_orders' and user_id is null
  and created_at > now() - interval '14 days'
group by 1
order by 1;


-- (G) QUAIS COLUNAS mudam nesses updates automáticos (últimos 7 dias). É
--     isto que decide o conserto: coluna que só o sync mexe (carimbo,
--     situação espelhada) pode entrar na lista de ruído do gatilho — e aí a
--     auditoria para de gravar a linha inteira por causa dela.
with ult as (
  select before_data as b, after_data as a
  from public.order_audit_logs
  where table_name = 'carboze_orders' and user_id is null and action = 'UPDATE'
    and created_at > now() - interval '7 days'
)
select k.key   as coluna,
       count(*) as vezes_mudou
from ult, lateral jsonb_each(ult.a) k
where k.value is distinct from (ult.b -> k.key)
group by 1
order by 2 desc
limit 25;


-- (H) Falhas de cron DEPOIS da faxina (o log começou do zero no bloco C da
--     `20261105`). ESPERADO na Medium: nenhuma linha. `job startup timeout`
--     de novo = o banco voltou a ficar sem fôlego.
select j.jobname, d.status, left(d.return_message, 120) as mensagem, count(*) as vezes,
       to_char(max(d.start_time) at time zone 'America/Sao_Paulo', 'DD/MM HH24:MI') as ultima
from cron.job_run_details d
left join cron.job j on j.jobid = d.jobid
where d.status <> 'succeeded'
group by 1, 2, 3
order by vezes desc;


-- (I) Desliga o `vindi-sync-hourly` (o de 15 min continua e cobre o :00).
--     ⚠️ Não guardo o comando dele em tabela: ele carrega o X-Cron-Secret, e
--     tabela nova no `public` nasce legível pelo PostgREST. Para religar, é
--     o comando do `vindi-sync-15min` com o horário '0 * * * *'.
select cron.unschedule('vindi-sync-hourly');

select jobname, schedule, active
from cron.job where jobname like 'vindi-sync%';
