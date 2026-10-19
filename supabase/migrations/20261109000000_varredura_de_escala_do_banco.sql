-- ═══════════════════════════════════════════════════════════════════════════
-- 20261109 — Varredura de ESCALA do banco (SÓ LEITURA)
--
-- Pedido do dono do processo em 19/10/2026: *"o app tem que compreender que
-- ele é feito para escalar … não podemos criar gargalos"*. O código foi varrido
-- pelo teto de 1.000 (`20261108` + `@carbo/shell`); esta é a metade do banco,
-- com as quatro famílias de gargalo que este repo já pagou:
--
--   J  tamanho e linhas         o que já é grande, e o que é LOG
--   K  leitura da tabela inteira consulta sem índice que cresce com a tabela
--   L  RLS com função SOLTA      roda uma vez POR LINHA (a Esteira de 6,9 s, 20261083)
--   M  FK sem índice             apagar/juntar pelo pai varre o filho inteiro
--
-- ⚠️ Nada aqui altera nada. Cada letra é UM bloco (o SQL Editor mostra só o
-- último resultado). Me mande os quatro.
-- ⚠️ Os contadores de K são desde o último reinício do banco (a troca para
-- Medium reiniciou em 19/10): rodar daqui a alguns dias dá números melhores.
-- ═══════════════════════════════════════════════════════════════════════════


-- (J) As 30 maiores tabelas dos schemas do sistema, com linhas estimadas.
select n.nspname || '.' || c.relname                          as tabela,
       pg_size_pretty(pg_total_relation_size(c.oid))          as tamanho,
       c.reltuples::bigint                                    as linhas_estimadas
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where c.relkind in ('r', 'p', 'm')
  and n.nspname in ('public', 'licenciados', 'produtos', 'commercial', 'cron', 'net')
order by pg_total_relation_size(c.oid) desc
limit 30;


-- (K) Tabelas com mais de 1.000 linhas que são LIDAS POR INTEIRO com
--     frequência: muitas varreduras sequenciais, cada uma lendo a tabela toda.
--     `linhas_por_varredura` perto de `linhas` = sem índice para aquele filtro.
--     Hoje é rápido porque é pequeno; com o volume crescendo, cada uma dessas
--     cresce junto.
select s.schemaname || '.' || s.relname                        as tabela,
       s.n_live_tup                                            as linhas,
       s.seq_scan                                              as varreduras,
       (s.seq_tup_read / greatest(s.seq_scan, 1))::bigint      as linhas_por_varredura,
       coalesce(s.idx_scan, 0)                                 as usos_de_indice,
       round(100.0 * s.seq_scan / greatest(s.seq_scan + coalesce(s.idx_scan, 0), 1), 1) as pct_sem_indice
from pg_stat_user_tables s
where s.n_live_tup > 1000
  and s.seq_scan > 50
order by s.seq_tup_read desc
limit 30;


-- (L) Regras de RLS com função de "quem está logado" SOLTA, sem `(select …)`.
--     Solta, ela roda uma vez POR LINHA lida — foi isso que levou a Esteira de
--     0,3 s a 6,9 s (`20261083`). Embrulhada, roda uma vez por consulta.
--     `soltas` > 0 = regra a embrulhar. ESPERADO: o que a 20261083 não pegou.
with p as (
  select schemaname, tablename, policyname, cmd,
         coalesce(qual, '') || ' ' || coalesce(with_check, '') as expr
  from pg_policies
  where schemaname in ('public', 'licenciados', 'produtos', 'commercial')
),
f as (
  select p.*, fn
  from p, unnest(array[
    'carbo_e_time_interno', 'carbo_tem_app', 'carbo_is_gestor', 'crm_is_gestor',
    'has_role', 'is_employee', 'carbo_prevendas_gestor', 'auth.uid', 'auth.jwt',
    'auth.role', 'is_admin', 'is_carbo_admin', 'managed_posto_ids'
  ]) as fn
)
select schemaname || '.' || tablename as tabela, policyname as regra, cmd,
       string_agg(fn, ', ' order by fn) as funcoes_soltas
from f
where regexp_count(expr, replace(fn, '.', '\.') || '\(') >
      regexp_count(expr, 'SELECT\s+' || replace(fn, '.', '\.') || '\(', 1, 'i')
group by 1, 2, 3
order by 1, 2;


-- (M) Chave estrangeira SEM índice na coluna de quem aponta, em tabela que já
--     tem mais de 1.000 linhas. Cada `delete`/`join` pelo pai lê o filho todo.
with fk as (
  select con.conrelid, con.conname, con.conkey,
         con.conrelid::regclass::text as tabela,
         con.confrelid::regclass::text as aponta_para
  from pg_constraint con
  join pg_namespace n on n.oid = con.connamespace
  where con.contype = 'f'
    and n.nspname in ('public', 'licenciados', 'produtos', 'commercial')
)
select fk.tabela, fk.conname as fk, fk.aponta_para,
       (select string_agg(a.attname, ', ' order by a.attnum)
          from pg_attribute a
         where a.attrelid = fk.conrelid and a.attnum = any(fk.conkey)) as colunas,
       c.reltuples::bigint as linhas
from fk
join pg_class c on c.oid = fk.conrelid
where c.reltuples > 1000
  and not exists (
    select 1 from pg_index i
    where i.indrelid = fk.conrelid
      and (i.indkey::int2[])[0:cardinality(fk.conkey) - 1] @> fk.conkey
  )
order by c.reltuples desc;
