-- ═══════════════════════════════════════════════════════════════════════════
-- 20261104 — Quem monta a fila, e o que o Realtime escuta (SÓ LEITURA)
--
-- A (O) da `20261103` mostrou a fila como a consulta mais cara do banco
-- (27,7%) e o Realtime em segundo (19,6%). A fila era montada por TRÊS
-- caminhos: o `whatsapp-meta` (precisa), o `kanban-n8n` (nada mais sai pela
-- Evolution desde 05/10 — lia à toa) e o contador "na fila" de cada aba aberta
-- da tela Mensagens ao cliente (de minuto em minuto, por aba).
--
-- ⚠️ Nenhum dos dois blocos LÊ a fila — medir não pode somar carga a ela.
-- ═══════════════════════════════════════════════════════════════════════════


-- (P) Cada FORMA de leitura da fila: quantas vezes, quanto custou.
--     Leitura com `LIMIT` = as funções; com `count(*)` = o contador da tela.
--     ESPERADO depois do deploy: `vezes` crescendo mais devagar (rode de novo
--     em uma hora e compare).
select left(regexp_replace(query, '\s+', ' ', 'g'), 160)  as consulta,
       calls                                               as vezes,
       round((total_exec_time / 1000)::numeric)            as total_s,
       round(mean_exec_time::numeric)                      as media_ms,
       round(max_exec_time::numeric)                       as pior_ms
from pg_stat_statements
where query ilike '%carbo_msg_fila%'
order by total_exec_time desc
limit 10;


-- (Q) As tabelas que o Realtime escuta, com quantas linhas são regravadas.
--     Cada UPDATE nelas é um evento lido pelo Realtime, mesmo sem mudar nada.
--     Tabela de sync (bling2_*) com milhões de `regravadas` aqui é custo de
--     Realtime sem ninguém ouvindo.
select pt.schemaname || '.' || pt.tablename           as tabela,
       s.n_tup_ins                                     as inseridas,
       s.n_tup_upd                                     as regravadas,
       s.n_tup_del                                     as apagadas
from pg_publication_tables pt
left join pg_stat_user_tables s
       on s.schemaname = pt.schemaname and s.relname = pt.tablename
where pt.pubname = 'supabase_realtime'
order by coalesce(s.n_tup_upd, 0) + coalesce(s.n_tup_ins, 0) desc;
