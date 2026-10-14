-- =====================================================================
-- PRÉ-VENDAS: gestor vê TUDO, colaborador só o PRÓPRIO (14/10/2026).
--
-- Pedido do dono do processo: "qualquer gestor com a flag para ver o sistema
-- consegue ver tudo, todos os cards, todos os usuários; o colaborador só
-- consegue ver o próprio".
--
-- O colaborador JÁ era só o próprio, no banco: a policy de crm_sales_leads e
-- as RPCs carbo_prevendas_vendas/_repasses deixam passar `created_by` /
-- `assigned_to` = eu. O que divergia era o GESTOR:
--   tela  → isManager(fnMap) = a flag "gestor" da função no Admin
--   banco → crm_is_gestor()  = head / command / ti_suporte (regra antiga)
-- Um gerente marcado como gestor no Admin via a tela "de gestor" com os
-- cards de um colaborador — e o filtro de vendedor só com ele mesmo.
--
-- A regra nova, num lugar só: `carbo_prevendas_gestor()` =
--   carbo_is_gestor(eu)  (a MESMA flag que a tela usa)
--   E tem o app (carbo_tem_app(['carbo_prevendas']), que aceita admin).
-- Ela é SOMADA (OR) ao que existe — ninguém perde nada — e nos cards ela só
-- vale para os funis do Pré-Vendas (f14, f15): o Sales NÃO muda.
--
-- ⚠️ O texto das funções é trocado a partir do BANCO (pg_get_functiondef),
-- nunca da migração que as criou, e cada troca ABORTA se o trecho esperado
-- não aparecer exatamente como previsto. Tudo vai antes para backup.
-- =====================================================================

-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 0 (a) — a regra de gestor que o banco usa HOJE (só leitura)  ║
-- ╚═══════════════════════════════════════════════════════════════════╝
-- ESPERADO: o texto de crm_is_gestor (head/command/ti_suporte).
select pg_get_functiondef('public.crm_is_gestor()'::regprocedure) as crm_is_gestor_hoje;

-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 0 (b) — as regras vivas de crm_sales_leads (só leitura)      ║
-- ╚═══════════════════════════════════════════════════════════════════╝
-- ESPERADO: SELECT com `deleted_at is null and (created_by … or crm_is_gestor()
-- … or fila do repasse)` e UPDATE parecido. Se aparecer outra regra de
-- SELECT/UPDATE aberta (true, carbo_e_time_interno()), me mande ANTES do
-- BLOCO 1: regras somam com OU, e aí o colaborador já estaria vendo tudo.
select policyname as regra, cmd as operacao, roles::text as papeis, qual as quem_le, with_check as quem_grava
from pg_policies
where schemaname = 'public' and tablename = 'crm_sales_leads'
order by cmd, policyname;

-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 0 (c) — quem vira GESTOR no Pré-Vendas (só leitura)          ║
-- ╚═══════════════════════════════════════════════════════════════════╝
-- Todo mundo com a flag do app. `gestor_depois = true` passa a ver todos os
-- cards, vendas e resultados do Pré-Vendas; `false` vê só o próprio.
select p.full_name, p.department::text as departamento, p.funcao,
       public.carbo_is_gestor(p.id)
         or public.has_role(p.id, 'admin'::app_role) as gestor_depois
from public.profiles p
where coalesce(p.allowed_interfaces, '{}') && array['carbo_prevendas']
  and coalesce(p.status, '') not in ('deleted', 'rejected')
order by 4 desc, 1;

-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 1 — a regra e a troca                                        ║
-- ╚═══════════════════════════════════════════════════════════════════╝
create or replace function public.carbo_prevendas_gestor()
returns boolean
language sql stable security definer set search_path = public as $$
  select auth.uid() is not null
     and public.carbo_is_gestor(auth.uid())
     and public.carbo_tem_app(array['carbo_prevendas']);
$$;
grant execute on function public.carbo_prevendas_gestor() to authenticated, service_role;
revoke execute on function public.carbo_prevendas_gestor() from anon, public;

create table if not exists public.carbo_backup_funcoes (
  feito_em  timestamptz not null default now(),
  funcao    text not null,
  definicao text not null
);
alter table public.carbo_backup_funcoes enable row level security;  -- sem policy: só o dono lê

do $$
declare
  f text; v_def text; v_novo text;
  v_de  constant text := 'public.crm_is_gestor()';
  v_por constant text := '(public.crm_is_gestor() or public.carbo_prevendas_gestor())';
  r record; v_qual text; v_n int := 0;
begin
  -- 1) as três funções: vendas, resultados e a lista de usuários
  foreach f in array array['public.carbo_prevendas_vendas', 'public.carbo_prevendas_repasses',
                           'public.crm_list_vendedores']
  loop
    if (select count(*) from pg_proc
         where pronamespace = 'public'::regnamespace and 'public.' || proname = f) <> 1 then
      raise exception 'Esperava UMA função %, achei outra quantidade (sobrecarga?). Nada foi alterado.', f;
    end if;
    select pg_get_functiondef(p.oid) into v_def
      from pg_proc p where p.pronamespace = 'public'::regnamespace and 'public.' || p.proname = f;
    if v_def like '%carbo_prevendas_gestor%' then
      continue;  -- já trocada (rodar de novo não duplica)
    end if;
    if (length(v_def) - length(replace(v_def, v_de, ''))) / length(v_de) <> 1 then
      raise exception '% não tem exatamente UM % no texto vivo. Me mande o pg_get_functiondef dela. Nada foi alterado.', f, v_de;
    end if;
    insert into public.carbo_backup_funcoes(funcao, definicao) values (f, v_def);
    v_novo := replace(v_def, v_de, v_por);
    execute v_novo;   -- create or replace com a MESMA assinatura: os grants ficam
    v_n := v_n + 1;
  end loop;

  -- 2) as regras de SELECT e UPDATE dos cards — só nos funis do Pré-Vendas
  for r in
    select * from pg_policies
     where schemaname = 'public' and tablename = 'crm_sales_leads'
       and cmd in ('SELECT', 'UPDATE')
       and coalesce(qual, '') like '%crm_is_gestor()%'
       and coalesce(qual, '') not like '%carbo_prevendas_gestor%'
  loop
    insert into public.carbo_backup_policies(tabela, regra, operacao, papeis, quem_le, quem_grava)
    values (r.tablename, r.policyname, r.cmd, r.roles::text, r.qual, r.with_check);
    v_qual := format('(%s) or (%s funnel_type in (''f14'', ''f15'') and public.carbo_prevendas_gestor())',
                     r.qual, case when r.cmd = 'SELECT' then 'deleted_at is null and' else '' end);
    execute format('alter policy %I on public.crm_sales_leads using (%s)', r.policyname, v_qual);
    v_n := v_n + 1;
  end loop;

  raise notice 'trocas feitas: % (esperado 5 = 3 funções + 2 regras)', v_n;
end $$;

-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║ CONFERÊNCIA                                                        ║
-- ╚═══════════════════════════════════════════════════════════════════╝
-- ESPERADO: funcoes = 3 · regras = 2 · anon_executa = false.
select
  (select count(*) from pg_proc
    where pronamespace = 'public'::regnamespace
      and proname in ('carbo_prevendas_vendas', 'carbo_prevendas_repasses', 'crm_list_vendedores')
      and pg_get_functiondef(oid) like '%carbo_prevendas_gestor()%')                        as funcoes,
  (select count(*) from pg_policies
    where schemaname = 'public' and tablename = 'crm_sales_leads'
      and qual like '%carbo_prevendas_gestor()%')                                         as regras,
  has_function_privilege('anon', 'public.carbo_prevendas_gestor()', 'execute')            as anon_executa;
