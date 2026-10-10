-- =====================================================================
-- AUDITORIA DE SEGURANÇA DOS 8 APPS (10/10/2026) — SÓ MEDE, NÃO ALTERA NADA.
--
-- A auditoria leu as 627 migrações; a produção pode ser diferente (já foi:
-- `carbo_user_roles` nunca chegou lá). Estes blocos perguntam ao BANCO VIVO
-- o que o repositório sugere. Cada bloco é UMA consulta — o SQL Editor mostra
-- só o resultado da última de um bloco.
-- =====================================================================

-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║ A — funções que rodam como DONO e que QUALQUER UM chama (anon)     ║
-- ╚═══════════════════════════════════════════════════════════════════╝
-- `anon` = sem login, só com a chave pública que está no JavaScript de
-- todo app. Função SECURITY DEFINER passa por cima da RLS. Cada linha é uma
-- porta aberta para a internet, salvo se a função se guardar por dentro.
select p.proname as funcao, pg_get_function_identity_arguments(p.oid) as argumentos,
       (pg_get_functiondef(p.oid) ~* 'auth\.uid\(\)|carbo_e_time_interno|is_admin|is_gestor|carbo_is_gestor|crm_is_gestor|has_role') as se_guarda
from pg_proc p
where p.pronamespace = 'public'::regnamespace
  and p.prosecdef
  and p.prokind = 'f'
  and p.prorettype <> 'trigger'::regtype
  and has_function_privilege('anon', p.oid, 'execute')
order by se_guarda, p.proname;

-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║ B — views que rodam como DONO (sem security_invoker) e são lidas    ║
-- ╚═══════════════════════════════════════════════════════════════════╝
-- View sem `security_invoker` ignora a RLS das tabelas. Só é segura se se
-- guardar no próprio WHERE.
select c.relname as view,
       coalesce(array_to_string(c.reloptions, ','), '') as opcoes,
       has_table_privilege('anon', c.oid, 'select')          as anon_le,
       has_table_privilege('authenticated', c.oid, 'select') as logado_le,
       (pg_get_viewdef(c.oid) ~* 'auth\.uid\(\)|carbo_e_time_interno|carbo_pode_ver_caixa') as se_guarda
from pg_class c
where c.relnamespace = 'public'::regnamespace and c.relkind = 'v'
  and coalesce(array_to_string(c.reloptions, ','), '') not ilike '%security_invoker=true%'
  and (has_table_privilege('anon', c.oid, 'select') or has_table_privilege('authenticated', c.oid, 'select'))
order by se_guarda, c.relname;

-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║ C — regras de tabela ABERTAS (qualquer logado, ou sem login)        ║
-- ╚═══════════════════════════════════════════════════════════════════╝
-- `true`, `is_employee` (= "tem linha em profiles", inclui lojista e
-- licenciado) e `auth.role() = 'authenticated'` deixam o PORTAL entrar.
select tablename as tabela, policyname as regra, cmd as operacao, roles::text as para,
       qual as quem_le, with_check as quem_grava
from pg_policies
where schemaname = 'public'
  and (qual = 'true' or with_check = 'true'
       or qual ilike '%is_employee(%' or with_check ilike '%is_employee(%'
       or qual ilike '%''authenticated''%' or with_check ilike '%''authenticated''%')
order by tabela, operacao;

-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║ D — tabelas SEM RLS ligada que logado ou anon alcança               ║
-- ╚═══════════════════════════════════════════════════════════════════╝
select c.relname as tabela,
       has_table_privilege('anon', c.oid, 'select')          as anon_le,
       has_table_privilege('authenticated', c.oid, 'select') as logado_le,
       has_table_privilege('authenticated', c.oid, 'update') as logado_altera
from pg_class c
where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
  and not c.relrowsecurity
  and (has_table_privilege('anon', c.oid, 'select') or has_table_privilege('authenticated', c.oid, 'select'))
order by c.relname;

-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║ E — quem PERDERIA acesso quando a porta virar "só a flag"           ║
-- ╚═══════════════════════════════════════════════════════════════════╝
-- Hoje Ops, Finanças e Marketing deixam entrar head/CEO/TI/command sem a
-- flag; o Sales deixa entrar com a flag de PORTAL e head/CEO/TI/command.
-- Cada linha é alguém que entra hoje por esses atalhos — ganha a flag no
-- Admin ANTES de a porta fechar, ou perde o app.
with p as (
  select pr.id, pr.full_name, pr.department::text as dep, pr.funcao,
         pr.secondary_department::text as dep2, pr.secondary_funcao as fun2,
         coalesce(pr.allowed_interfaces, '{}') as fl
    from public.profiles pr
   where coalesce(pr.status, '') not in ('deleted','rejected')
), x as (
  select *, (dep in ('command','ti_suporte') or dep2 in ('command','ti_suporte')
             or funcao in ('head','ceo','command') or fun2 in ('head','ceo','command')) as atalho
    from p
)
select full_name, dep as departamento, funcao, fl as interfaces,
       array_remove(array[
         case when atalho and not ('carbo_ops_app' = any(fl))  then 'Ops' end,
         case when atalho and not ('carbo_financas' = any(fl)) then 'Finanças' end,
         case when atalho and not ('carbo_mkt' = any(fl))      then 'Marketing' end,
         case when not ('carbo_crm' = any(fl))
               and (atalho or 'portal_pdv' = any(fl) or 'portal_licenciado' = any(fl)) then 'Sales' end
       ], null) as perderia
from x
where cardinality(array_remove(array[
         case when atalho and not ('carbo_ops_app' = any(fl))  then 1 end,
         case when atalho and not ('carbo_financas' = any(fl)) then 1 end,
         case when atalho and not ('carbo_mkt' = any(fl))      then 1 end,
         case when not ('carbo_crm' = any(fl))
               and (atalho or 'portal_pdv' = any(fl) or 'portal_licenciado' = any(fl)) then 1 end
       ], null)) > 0
order by full_name;

-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║ F — o tamanho do furo nos PEDIDOS e nos tokens do Bling             ║
-- ╚═══════════════════════════════════════════════════════════════════╝
-- contas de portal (sem interface interna) que hoje leem e alteram TODOS os
-- pedidos; quantos pedidos; e quem lê o token do Bling 1.
select
  (select count(*) from public.profiles pr
    where not public.carbo_interface_e_interna(pr.allowed_interfaces)
      and exists (select 1 from unnest(pr.allowed_interfaces) i where i in ('portal_pdv','portal_licenciado'))) as contas_portal_com_linha,
  (select count(*) from public.profiles pr where not public.carbo_interface_e_interna(pr.allowed_interfaces)) as perfis_nao_internos,
  (select count(*) from public.carboze_orders) as pedidos,
  (select string_agg(policyname || ': ' || coalesce(qual, '-'), ' | ') from pg_policies
    where schemaname = 'public' and tablename = 'bling_integration') as regra_token_bling1,
  (select string_agg(policyname || ': ' || coalesce(qual, '-'), ' | ') from pg_policies
    where schemaname = 'public' and tablename = 'carboze_orders' and cmd in ('DELETE','ALL')) as quem_apaga_pedido;
