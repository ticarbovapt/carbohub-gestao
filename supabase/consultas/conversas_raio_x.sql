-- ─────────────────────────────────────────────────────────────────────────────
-- Raio-x de CONVERSAS (WhatsApp) — SÓ LEITURA. Nada aqui altera dado.
-- Rode UM bloco por vez no SQL Editor (ele mostra só o resultado da última
-- consulta do bloco) e cole o resultado no chat.
-- ─────────────────────────────────────────────────────────────────────────────

-- BLOCO 1 — Volume por dia, número e direção (30 dias)
select (ocorrido_em at time zone 'America/Sao_Paulo')::date as dia, numero_id, direcao,
       count(*) as msgs, count(distinct wa_id) as conversas
  from public.carbo_wa_mensagens
 where ocorrido_em >= now() - interval '30 days'
 group by 1, 2, 3 order by 1 desc, 2, 3;

-- BLOCO 2 — Tamanho das tabelas
select c.relname, c.reltuples::bigint as linhas, pg_size_pretty(pg_total_relation_size(c.oid)) as total
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relkind = 'r'
   and (c.relname like 'carbo_wa_%' or c.relname in ('carbo_msg_envios', 'notifications'))
 order by pg_total_relation_size(c.oid) desc;

-- BLOCO 3 — Mensagem de cliente PERDIDA: o webhook gravou a chave e a mensagem
-- não existe. ESPERADO: 0. Qualquer número aqui é mensagem que só está no
-- celular do cliente.
select count(*) as inbound_perdido
  from public.carbo_wa_eventos e
 where e.chave like 'inbound:%' and e.recebido_em >= now() - interval '60 days'
   and not exists (select 1 from public.carbo_wa_mensagens m
                    where m.wamid = substring(e.chave from 9));

-- BLOCO 4 — Status perdido nas nossas respostas (a "mensagem amarela")
select count(*) filter (where status is null) as sem_status,
       count(*) filter (where status = 'enviado' and ocorrido_em < now() - interval '1 day') as parou_em_enviado,
       count(*) filter (where tipo = 'audio' and (status is null or status = 'enviado')) as audio_sem_confirmacao,
       count(*) as total
  from public.carbo_wa_mensagens
 where direcao = 'saida' and enviado_por is not null
   and ocorrido_em between now() - interval '14 days' and now() - interval '1 hour';

-- BLOCO 5 — Agendadas: a definição VIVA da fila, e por qual número saíram
select pg_get_viewdef('public.carbo_wa_agendadas_fila');

select a.numero_id as caixa, m.numero_id as saiu_por, count(*)
  from public.carbo_wa_agendadas a
  join public.carbo_wa_mensagens m on m.wamid = a.wamid
 where a.status = 'enviado'
 group by 1, 2;

-- BLOCO 6 — Tempo da caixa e da conversa COMO A ATENDENTE (troque NOME pelo
-- começo do nome dela). O `rollback` no fim garante que nada fica.
begin;
select set_config('request.jwt.claims', json_build_object('sub',
  (select id::text from public.profiles where full_name ilike 'NOME%' limit 1),
  'role', 'authenticated')::text, true);
set local role authenticated;
explain (analyze, buffers) select public.carbo_wa_caixa('1255756280958635', 30);
rollback;

-- BLOCO 7 — Tamanho das leituras inteiras que a lista faz a cada recarga
select n.phone_number_id as numero_id, n.rotulo,
  (select count(*) from public.carbo_wa_contatos c where c.numero_id = n.phone_number_id) as contatos,
  (select count(*) from public.carbo_wa_atendimento a where a.numero_id = n.phone_number_id) as atendimentos,
  (select count(*) from public.carbo_wa_conversa_tag t where t.numero_id = n.phone_number_id) as etiquetas
  from public.carbo_wa_numeros n;

-- BLOCO 8 — Tempo acumulado das consultas da tela (pg_stat_statements)
select calls, round(total_exec_time) as total_ms, round(mean_exec_time) as media_ms,
       round(max_exec_time) as max_ms, left(query, 140) as q
  from pg_stat_statements
 where query ilike any (array['%carbo_wa_caixa%', '%carbo_wa_nomes_por_fone%',
       '%carbo_wa_conversa_mensagens%', '%carbo_wa_contatos%', '%carbo_wa_atendimento%'])
 order by total_exec_time desc limit 20;

-- BLOCO 9 — Avisos de mensagem recebida por dia (quantos e para quantos)
select created_at::date as dia, count(*), count(distinct user_id) as pessoas
  from public.notifications
 where type = 'wa_inbound' and created_at >= now() - interval '30 days'
 group by 1 order by 1 desc;

-- BLOCO 10 — Templates presos fora de APPROVED
select meta_template_nome, meta_status, meta_status_em
  from public.carbo_msg_templates
 where meta_status is distinct from 'APPROVED'
 order by meta_status_em desc nulls last;
