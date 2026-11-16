-- Limpa do histórico do Supabase as 91 versões que não têm arquivo no gestao (16/11/2026)
--
-- O baseline (baseline_historico_migracoes.sql) mostrou que o histórico já tinha 91
-- versões fora da lista do repositório: 6 são as migrações antigas de prefixo só com
-- data (hoje renomeadas para 14 dígitos) e 85 foram aplicadas por fora do repositório
-- (painel do Supabase / assistente / MCP), de 04/05 a 04/11/2026, sem arquivo em nenhum
-- dos 4 repos. A integração GitHub recusa deploy com versão "só no histórico".
--
-- Só mexe no REGISTRO do histórico — o banco em si não muda. As 91 linhas são copiadas
-- para public.carbo_backup_historico_migracoes antes de sair (volta: insert ... select).

create temp table _so_historico as
  select unnest(string_to_array('20260325,20260405,20260406,20260407,20260408,20260427,20260504140646,20260504153745,20260504170840,20260505112147,20260505152115,20260505171523,20260506130911,20260506131356,20260506155812,20260506164652,20260506173447,20260507113309,20260507135444,20260507162150,20260507162839,20260507163923,20260507164821,20260507175549,20260507175620,20260511111816,20260511160845,20260514125343,20260520185037,20260520185054,20260520185131,20260520185140,20260521121621,20260521160459,20260526142503,20260618165616,20260630114833,20260630115236,20260630120711,20260630133114,20260630135953,20260630141121,20260630142516,20260703192606,20260713150059,20260713150124,20260713150233,20260713150327,20260713150622,20260713150810,20260713213703,20260714110555,20260714114920,20260714201317,20260714204703,20260714205402,20260715114001,20260715132643,20260715133152,20260715133917,20260716143416,20260716143449,20260716171616,20260716191914,20260721133426,20260721133452,20260722174149,20260722174334,20260722180136,20260722180204,20260722183552,20260722184903,20260722190625,20260722191014,20260722191313,20260722201300,20260723112527,20260724185657,20260824190744,20260903113823,20260903113843,20260903113934,20261006183459,20261006183550,20261006183727,20261006194307,20261027183259,20261030130709,20261030131545,20261104171710,20261104172221', ',')) as version;

create table if not exists public.carbo_backup_historico_migracoes (
  version    text,
  statements text[],
  name       text,
  salvo_em   timestamptz not null default now()
);
alter table public.carbo_backup_historico_migracoes enable row level security;
revoke all on public.carbo_backup_historico_migracoes from anon, authenticated;

insert into public.carbo_backup_historico_migracoes (version, statements, name)
select h.version, h.statements, h.name
  from supabase_migrations.schema_migrations h
 where h.version in (select version from _so_historico)
   and not exists (select 1 from public.carbo_backup_historico_migracoes b where b.version = h.version);

delete from supabase_migrations.schema_migrations
 where version in (select version from _so_historico);

select (select count(*) from supabase_migrations.schema_migrations)        as linhas_no_historico,
       (select count(*) from public.carbo_backup_historico_migracoes)      as guardadas_no_backup;
