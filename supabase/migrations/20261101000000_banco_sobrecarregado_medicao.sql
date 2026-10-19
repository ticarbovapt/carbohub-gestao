-- ═══════════════════════════════════════════════════════════════════════════
-- 20261101 — O banco está sobrecarregado AGORA? (SÓ LEITURA)
--
-- A `20261100` mediu, em 19/10/2026:
--   · a fila da Meta levou 25,9 s (uma hora antes: 0,77 s), com 11,8 s só de
--     PLANEJAMENTO — sinal de banco sem CPU, não de consulta ruim;
--   · 09h: zero avisos · 10h: 143 de uma vez · 11h: 2 — a fila travou e
--     soltou o represado;
--   · os pendentes NÃO estão espremendo a leitura (34 na fila, limite 150).
-- Suspeita: abas abertas com a tela de Conversas ANTIGA (consulta de 49 s) +
-- 34 regravações por minuto em `carbo_msg_envios`, cada uma um evento de
-- Realtime que fazia essas abas recarregarem.
--
-- Cada letra é UM bloco (o SQL Editor mostra só o último resultado).
-- ═══════════════════════════════════════════════════════════════════════════


-- (I) O que está rodando AGORA, agrupado pela forma da consulta. Muitas cópias
--     da mesma consulta de `carbo_wa_conversas` com dezenas de segundos =
--     abas antigas abertas.
select left(regexp_replace(query, '\s+', ' ', 'g'), 140) as consulta,
       count(*)                                         as copias,
       max(now() - query_start)                         as a_mais_lenta_ha,
       string_agg(distinct coalesce(wait_event_type, 'CPU'), ', ') as esperando
from pg_stat_activity
where state <> 'idle'
  and pid <> pg_backend_pid()
  and backend_type = 'client backend'
group by 1
order by copias desc, a_mais_lenta_ha desc
limit 20;


-- (J) O envio do WhatsApp, de 15 em 15 min, nas últimas 4 h (Brasília).
--     `rodou` com `avisos_enviados` > 0 = saiu; `fila_timeout` = travou.
select to_char(date_trunc('hour', created at time zone 'America/Sao_Paulo')
               + floor(extract(minute from created) / 15) * interval '15 minutes',
               'DD/MM HH24:MI')                                             as faixa,
       count(*) filter (where content::text like '%"enviados"%')           as rodou,
       coalesce(sum((substring(content::text from '"enviados":(\d+)'))::int), 0) as avisos_enviados,
       count(*) filter (where content::text ilike '%fila:%timeout%')      as fila_timeout,
       count(*) filter (where content::text like '%nada a avisar pela Meta%') as fila_vazia
from net._http_response
where created >= now() - interval '4 hours'
group by 1
order by 1;


-- (K) Os 12 `entregue` "aguardando 180 min" desde 10/09: já passaram dos
--     180 min há semanas e continuam na fila. `fone_fila` nulo ou `atraso_min`
--     estranho explicam; os dois normais = a função não chega até eles.
select v.bling_id, v.detectado_em, now() - v.detectado_em as parado_ha,
       v.telefone, f.telefone as fone_fila, f.atraso_min, f.prioridade
from public.carbo_msg_envios v
left join public.carbo_msg_fila f on f.bling_id = v.bling_id and f.etapa = v.etapa
where v.status = 'pendente' and v.etapa = 'entregue'
order by v.detectado_em;


-- (L) Os 116 `confirmado` que nunca saíram: quanto o código CZ demorou depois
--     de a função tentar mandar, e se o aviso SEGUINTE (NF) chegou.
select case
         when c.criado_em <= v.detectado_em                 then '1. código já existia'
         when c.criado_em - v.detectado_em < interval '5 min'  then '2. até 5 min'
         when c.criado_em - v.detectado_em < interval '1 hour' then '3. 5 a 60 min'
         else '4. mais de 1 h'
       end                                                  as demora_do_codigo,
       count(*)                                             as pedidos,
       count(*) filter (where n.status in ('enviado','entregue','lido')) as nf_avisada
from public.carbo_msg_envios v
join public.carbo_pedido_codigo c on c.bling_id = v.bling_id
left join public.carbo_msg_envios n on n.bling_id = v.bling_id and n.etapa = 'nf_emitida'
where v.status = 'pendente' and v.etapa = 'confirmado'
group by 1
order by 1;
