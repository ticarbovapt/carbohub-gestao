-- ═══════════════════════════════════════════════════════════════════════════
-- 20261100 — Os avisos que NÃO saem: medição (SÓ LEITURA, nada muda dado)
--
-- A `20261099` consertou a TELA (49 s → 0,3 s). O BLOCO 5 dela mostrou que os
-- avisos de serviço chegam em ~98% — mas também quatro coisas a explicar:
--
--   1. 9 respostas `500 fila: statement timeout` hoje, 13:11–14:23 UTC.
--      Minuto com a fila em timeout é minuto em que NENHUM aviso da Meta sai.
--   2. 116 `confirmado` "esperando: pedido", o mais antigo de 23/08.
--      Suspeita: pedido da MATRIZ (Bling 1, bling_id negativo). O código CZ
--      (`carbo_gerar_codigos_pedido`) só é gerado para `bling2_orders` — então
--      card da matriz espera um código que NUNCA vai existir.
--   3. 195 `etiqueta` "esperando: rastreio", o mais antigo de 24/08.
--      Suspeita: boa parte é linha VELHA de card que já andou.
--   4. ⚠️ A suspeita mais grave: o `whatsapp-meta` lê só 150 linhas da fila
--      por rodada (`LEITURA`), e linha segurada ocupa vaga. O próprio código
--      avisa: "se um dia houver mais de 130 linhas seguradas ao mesmo tempo, o
--      defeito volta". Hoje são 327 pendentes. Se a maioria estiver na fila,
--      aviso NOVO pode não entrar nas 150 — e não sai, sem erro nenhum.
--
-- Cada letra é UM bloco (o SQL Editor mostra só o último resultado).
-- ═══════════════════════════════════════════════════════════════════════════


-- (A) A fila está sendo ESPREMIDA? Quantas linhas a fila da Meta tem agora, e
--     quantas delas já estão seguradas (pendente). Se `linhas_na_fila` passar
--     de 150 e `ja_seguradas` for a maioria, aviso novo está ficando de fora.
select f.etapa,
       count(*)                                        as linhas_na_fila,
       count(*) filter (where v.bling_id is not null)  as ja_seguradas,
       count(*) filter (where v.bling_id is null)      as novas
from public.carbo_msg_fila f
left join public.carbo_msg_envios v
       on v.bling_id = f.bling_id and v.etapa = f.etapa and v.status = 'pendente'
where f.canal_envio = 'meta'
group by rollup (f.etapa)
order by f.etapa nulls last;


-- (B) Os pendentes, um a um por motivo: o card ainda está naquela etapa, já
--     andou, ou saiu da esteira? E está na fila AGORA? Separa "esperando de
--     verdade" de "linha velha que ninguém limpou".
select v.etapa,
       v.motivo,
       case when v.bling_id < 0 then 'matriz (Bling 1)' else 'filial (Bling 2)' end as conta,
       count(*)                                                           as pedidos,
       count(*) filter (where e.bling_id is null)                         as fora_da_esteira,
       count(*) filter (where e.etapa = v.etapa)                          as card_ainda_nessa_etapa,
       count(*) filter (where e.bling_id is not null
                          and e.etapa is distinct from v.etapa)           as card_ja_andou,
       count(*) filter (where f.bling_id is not null)                     as na_fila_agora,
       min(v.detectado_em)                                                as mais_antigo
from public.carbo_msg_envios v
left join public.bling2_esteira e on e.bling_id = v.bling_id
left join (select bling_id, etapa from public.carbo_msg_fila where canal_envio = 'meta') f
       on f.bling_id = v.bling_id and f.etapa = v.etapa
where v.status = 'pendente'
  and v.etapa in ('confirmado','nf_emitida','etiqueta','em_transito','saiu_entrega','entregue')
group by 1, 2, 3
order by pedidos desc;


-- (C) Os `confirmado` esperando o código: de que conta e de que canal, e
--     quantos JÁ têm código hoje (deviam ter saído). `tem_codigo_agora` > 0 é
--     o gerador de código atrasado; matriz com zero é o buraco de desenho.
select case when v.bling_id < 0 then 'matriz (Bling 1)' else 'filial (Bling 2)' end as conta,
       e.canal,
       count(*)                                        as pedidos,
       count(*) filter (where c.bling_id is not null)  as tem_codigo_agora,
       count(*) filter (where e.pedido_loja is not null) as tem_numero_da_loja,
       min(v.detectado_em) as mais_antigo,
       max(v.detectado_em) as mais_recente
from public.carbo_msg_envios v
left join public.bling2_esteira e on e.bling_id = v.bling_id
left join public.carbo_pedido_codigo c on c.bling_id = v.bling_id
where v.status = 'pendente' and v.etapa = 'confirmado'
group by 1, 2
order by pedidos desc;


-- (D) Aviso que MORREU no meio do envio: a função grava "envio iniciado"
--     ANTES de chamar a Meta e troca pelo desfecho depois. Linha que ficou
--     assim = a função caiu no meio (timeout), e ninguém sabe se o cliente
--     recebeu. ESPERADO: zero ou quase.
select etapa, count(*) as vezes, min(detectado_em) as primeira, max(detectado_em) as ultima
from public.carbo_msg_envios
where status = 'erro' and motivo = 'envio iniciado'
group by etapa
order by vezes desc;


-- (E) Os timeouts da fila HORA A HORA, nos últimos 3 dias (hora de Brasília).
--     A suspeita: eles coincidem com a tela de Conversas antiga aberta (a
--     consulta de 49 s, repetida a cada aviso que mudava de status). Se pararem
--     depois que a `20261099` entrou, era isso.
select to_char(date_trunc('hour', created at time zone 'America/Sao_Paulo'), 'DD/MM HH24"h"') as hora,
       count(*) as timeouts_da_fila
from net._http_response
where created >= now() - interval '3 days'
  and content::text ilike '%fila:%timeout%'
group by date_trunc('hour', created at time zone 'America/Sao_Paulo')
order by 1;


-- (F) Avisos de serviço que SAÍRAM, hora a hora, nas últimas 48 h (Brasília).
--     Buraco no meio do dia (hora com zero onde as vizinhas têm dezenas) é
--     tempo em que nada saiu. Compare com (E).
select to_char(date_trunc('hour', enviado_em at time zone 'America/Sao_Paulo'), 'DD/MM HH24"h"') as hora,
       count(*) filter (where status in ('enviado','entregue','lido')) as sairam,
       count(*) filter (where status in ('erro','falhou'))             as falharam
from public.carbo_msg_envios
where enviado_em >= now() - interval '48 hours'
  and canal = 'meta'
  and etapa in ('confirmado','nf_emitida','etiqueta','em_transito','saiu_entrega','entregue')
group by date_trunc('hour', enviado_em at time zone 'America/Sao_Paulo')
order by 1;


-- (G) De QUAL job vêm os "Timeout of 5000 ms" (DNS) das :00/:15/:30/:45.
--     Casa cada timeout com o job que rodou nos 15 s antes dele. O job que
--     aparece em quase todos é o culpado. Só mostra o NOME da função e o HOST —
--     nunca o comando (ele carrega o segredo).
with t as (
  select created
  from net._http_response
  where created >= now() - interval '24 hours'
    and coalesce(error_msg, '') ilike '%timeout%'
)
select j.jobname,
       j.schedule,
       substring(j.command from 'functions/v1/([A-Za-z0-9_-]+)') as funcao,
       substring(j.command from 'https?://([^/''"]+)')           as host,
       count(distinct t.created)                                 as timeouts_que_coincidem,
       (select count(*) from t)                                  as timeouts_no_total
from t
join cron.job_run_details d on d.start_time between t.created - interval '15 seconds' and t.created
join cron.job j on j.jobid = d.jobid
where j.command ilike '%http%'
group by 1, 2, 3, 4
order by timeouts_que_coincidem desc
limit 10;


-- (H) Quanto custa a leitura que a função faz DE VERDADE (não o count).
--     Anote o "Execution Time". O limite do PostgREST é 8 s.
explain (analyze, buffers)
select * from public.carbo_msg_fila
where canal_envio = 'meta'
order by prioridade
limit 150;
