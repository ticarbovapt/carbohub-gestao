-- ═══════════════════════════════════════════════════════════════════════════
-- 20261103 — Quem consome o banco (SÓ LEITURA)
--
-- A fila da Meta estoura o limite de 8 s em rajadas (19/10/2026: 6 timeouts
-- às 11h15 e 6 entre 12h00 e 12h07), e com a fila em timeout nenhum aviso sai
-- naquele minuto. O plano das 11h mostrou 11,8 s só de PLANEJAMENTO: o banco
-- estava sem CPU. Esta consulta diz quem gasta o tempo dele.
--
-- ⚠️ `pg_stat_statements` é ACUMULADO desde o último reset: mostra o peso de
-- cada consulta no período, não só agora.
-- ═══════════════════════════════════════════════════════════════════════════

-- (O) As 15 consultas que mais gastaram tempo de banco.
select left(regexp_replace(query, '\s+', ' ', 'g'), 140)                   as consulta,
       calls                                                                as vezes,
       round((total_exec_time / 1000)::numeric)                             as total_s,
       round(mean_exec_time::numeric)                                       as media_ms,
       round((100 * total_exec_time / sum(total_exec_time) over ())::numeric, 1) as pct_do_banco
from pg_stat_statements
order by total_exec_time desc
limit 15;
