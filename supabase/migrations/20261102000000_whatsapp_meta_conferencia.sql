-- ═══════════════════════════════════════════════════════════════════════════
-- 20261102 — Conferência do envio pela Meta depois do #796 e #797 (SÓ LEITURA)
--
-- ⚠️ A (J) da `20261101` somava `"enviados"` de QUATRO funções (whatsapp-meta,
-- kanban-n8n, whatsapp-agendadas e carbo-push — os múltiplos de 5 eram o push
-- do celular). Aqui só entra o que é do `whatsapp-meta`: a resposta dele é a
-- única com `"nao_contatar"`, e o timeout dele começa com `fila:`.
-- ═══════════════════════════════════════════════════════════════════════════


-- ⚠️ A resposta é JSON INDENTADO (`"enviados": 3`, com espaço): a 1ª versão
--    deste regex não tinha o `\s*` e somou ZERO a manhã inteira.
-- (M) O whatsapp-meta de 15 em 15 min, nas últimas 4 h (Brasília).
--     ESPERADO depois do deploy: `fila_timeout` zerado e `rodou` ~15 por faixa.
select to_char(date_trunc('hour', created at time zone 'America/Sao_Paulo')
               + floor(extract(minute from created) / 15) * interval '15 minutes',
               'DD/MM HH24:MI')                                                  as faixa,
       count(*) filter (where content::text like '%"nao_contatar"%')            as rodou,
       coalesce(sum((substring(content::text from '"enviados":\s*(\d+)'))::int)
                filter (where content::text like '%"nao_contatar"%'), 0)        as avisos_enviados,
       count(*) filter (where content::text like '%nada a avisar pela Meta%')   as fila_vazia,
       count(*) filter (where content::text ilike '%fila:%timeout%')           as fila_timeout
from net._http_response
where created >= now() - interval '4 hours'
group by 1
order by 1;


-- (N) "confirmado" de HOJE: quantos saíram e quantos ficaram presos esperando
--     o código. ESPERADO depois do deploy: `esperando_codigo` parando de crescer.
select count(*) filter (where status in ('enviado','entregue','lido')) as sairam,
       count(*) filter (where status = 'pendente' and motivo like 'esperando:%pedido%') as esperando_codigo,
       max(detectado_em) filter (where status = 'pendente' and motivo like 'esperando:%pedido%') as ultimo_preso
from public.carbo_msg_envios
where etapa = 'confirmado'
  and detectado_em >= date_trunc('day', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo';
