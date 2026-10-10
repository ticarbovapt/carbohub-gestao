-- =====================================================================
-- AUDITORIA 10/10/2026 — RODADA 2 (o que vaza DENTRO do time). SÓ MEDE.
--
-- Uma linha por TABELA (não por regra): o SQL Editor corta perto de 100
-- linhas, e a mesma tabela costuma ter DUAS regras abertas — fechar uma só
-- não fecha nada, porque regras de leitura somam com OU.
-- =====================================================================

-- BLOCO A — tabelas com alguma regra que deixa QUALQUER logado entrar.
-- `aberta_para` = o que essa regra abre (leitura, escrita, tudo).
-- `linhas` dá o tamanho do que está exposto.
select p.tablename as tabela,
       string_agg(distinct p.cmd, ',' order by p.cmd)                       as aberta_para,
       count(*)                                                             as regras_abertas,
       (select c.reltuples::bigint from pg_class c
         where c.oid = ('public.' || quote_ident(p.tablename))::regclass)   as linhas
from pg_policies p
where p.schemaname = 'public'
  and p.roles::text not like '%service_role%'
  and (   coalesce(p.qual, p.with_check) = 'true'
       or coalesce(p.qual, '') || coalesce(p.with_check, '') ilike '%is_employee(%'
       or coalesce(p.qual, '') || coalesce(p.with_check, '') ilike '%''authenticated''%'
       or coalesce(p.qual, p.with_check) = '(auth.uid() IS NOT NULL)')
  and p.tablename !~ '^(carbo_status_aviso|carbo_status_sonda)$'
group by p.tablename
order by p.tablename;
