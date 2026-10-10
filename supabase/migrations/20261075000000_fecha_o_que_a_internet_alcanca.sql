-- =====================================================================
-- AUDITORIA 10/10/2026 — RODADA 1: fecha o que a INTERNET alcança.
--
-- Medido no banco vivo (20261074, blocos A–F):
--   · `carboze_orders` tinha "Service role full access" = ALL · {public} ·
--     true — vale para TODO papel, inclusive `anon` (sem login, só com a chave
--     pública que está no JavaScript de todo app): os 1.798 pedidos liam-se,
--     alteravam-se e apagavam-se pela internet.
--   · `notifications` e `notification_log` aceitavam gravação de `anon`.
--   · ~100 funções SECURITY DEFINER executáveis por `anon`, sem guarda.
--   · token do Bling 1 legível por qualquer conta com perfil.
--   · a matriz de telas do controle reescrevível sem login.
--
-- ⚠️ REGRA DESTA RODADA: para quem é do TIME, NADA muda. Quem lia todos os
-- pedidos continua lendo; quem gravava continua gravando. Sai a internet
-- (anon) e a conta que não é do time. Fechar por app/por gestor DENTRO do
-- time é a rodada 2 — ela muda o que as telas mostram e pede medição própria.
-- ⚠️ Toda permissão tirada fica guardada em `carbo_backup_grants`, para
-- desfazer uma linha se algo quebrar.
-- =====================================================================

-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 0 (a) — as regras VIVAS de `carboze_orders`                  ║
-- ╚═══════════════════════════════════════════════════════════════════╝
-- ESPERADO: entre elas, "Service role full access" com roles {public} e
-- qual = true. É ela que o BLOCO 1 troca.
select policyname as regra, cmd as operacao, roles::text as para, qual as quem_le, with_check as quem_grava
from pg_policies where schemaname = 'public' and tablename = 'carboze_orders'
order by cmd, policyname;

-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 0 (b) — `anon` tem permissão de TABELA nestas?               ║
-- ╚═══════════════════════════════════════════════════════════════════╝
-- `true` em `anon_le`/`anon_grava` + a regra {public} true = aberto à internet.
select t as tabela,
       has_table_privilege('anon', ('public.' || t)::regclass, 'select') as anon_le,
       has_table_privilege('anon', ('public.' || t)::regclass, 'insert') as anon_grava,
       has_table_privilege('anon', ('public.' || t)::regclass, 'delete') as anon_apaga
from unnest(array['carboze_orders','notifications','notification_log','bling_integration',
                  'function_screen_access','department_functions','role_matrix_config']) t
where to_regclass('public.' || t) is not null;

-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 1 — pedidos, notificações, matriz de telas                   ║
-- ╚═══════════════════════════════════════════════════════════════════╝
create table if not exists public.carbo_backup_grants (
  feito_em  timestamptz not null default now(),
  objeto    text not null,
  papel     text not null,
  privilegio text not null
);
alter table public.carbo_backup_grants enable row level security;  -- sem policy: só o dono lê

do $$
declare r record;
begin
  -- PEDIDOS: a regra "do servidor" vira do servidor de verdade, e o time
  -- interno ganha a MESMA abertura que tinha por ela (nada muda na tela).
  if exists (select 1 from pg_policies where schemaname='public' and tablename='carboze_orders' and policyname='Service role full access') then
    execute 'alter policy "Service role full access" on public.carboze_orders to service_role';
  end if;
  drop policy if exists "carboze_orders_time_interno" on public.carboze_orders;
  create policy "carboze_orders_time_interno" on public.carboze_orders
    for all to authenticated
    using (public.carbo_e_time_interno()) with check (public.carbo_e_time_interno());
  -- `is_employee` = "tem linha em profiles": apagar pedido não é para isso.
  -- Quem apaga continua sendo o time (regra acima) e o gestor ("Managers…").
  drop policy if exists "Employees can delete orders" on public.carboze_orders;
  drop policy if exists "Employees can insert orders" on public.carboze_orders;

  -- NOTIFICAÇÕES: o controle grava pelo navegador (logado). Quem não está
  -- logado não grava mais. Gatilhos e funções do servidor não passam por aqui.
  if exists (select 1 from pg_policies where schemaname='public' and tablename='notifications' and policyname='service insert') then
    execute 'alter policy "service insert" on public.notifications to authenticated with check (public.carbo_e_time_interno())';
  end if;
  if to_regclass('public.notification_log') is not null then
    drop policy if exists "Service role can insert notifications" on public.notification_log;
    drop policy if exists "Service role can update notifications" on public.notification_log;
    create policy "notification_log_service" on public.notification_log for all to service_role using (true) with check (true);
  end if;

  -- MATRIZ DE TELAS (controle): lê quem está logado; grava só admin.
  for r in select tablename, policyname from pg_policies
            where schemaname='public' and tablename in ('function_screen_access','department_functions','role_matrix_config') loop
    execute format('drop policy %I on public.%I', r.policyname, r.tablename);
  end loop;
  if to_regclass('public.function_screen_access') is not null then
    create policy "fsa_le" on public.function_screen_access for select to authenticated using (true);
    create policy "fsa_admin" on public.function_screen_access for all to authenticated
      using (public.has_role(auth.uid(), 'admin'::app_role)) with check (public.has_role(auth.uid(), 'admin'::app_role));
  end if;
  if to_regclass('public.department_functions') is not null then
    create policy "df_le" on public.department_functions for select to authenticated using (true);
    create policy "df_admin" on public.department_functions for all to authenticated
      using (public.has_role(auth.uid(), 'admin'::app_role)) with check (public.has_role(auth.uid(), 'admin'::app_role));
  end if;
  if to_regclass('public.role_matrix_config') is not null then
    create policy "rmc_le" on public.role_matrix_config for select to authenticated using (true);
    create policy "rmc_admin" on public.role_matrix_config for all to authenticated
      using (public.has_role(auth.uid(), 'admin'::app_role)) with check (public.has_role(auth.uid(), 'admin'::app_role));
  end if;
end $$;

-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 2 — funções e views que a INTERNET chama                      ║
-- ╚═══════════════════════════════════════════════════════════════════╝
-- Tira o EXECUTE do `anon` de toda função SECURITY DEFINER do public, MENOS:
--   · `get_user_email_by_username` — a tela de LOGIN a usa antes de existir
--     sessão (medido no código dos 5 repositórios: é a única);
--   · as funções que alguma REGRA de tabela/view chama (is_employee,
--     chat_is_member…): sem EXECUTE, uma consulta anônima a uma tabela
--     pública (status, NPS, cadastro VIP) quebraria em vez de voltar vazia.
-- `authenticated` NÃO muda: os apps logados continuam chamando tudo. Fechar
-- funções para o time é a rodada 2.
do $$
declare r record; v_n int := 0;
begin
  for r in
    select p.oid, p.proname, pg_get_function_identity_arguments(p.oid) as args
      from pg_proc p
     where p.pronamespace = 'public'::regnamespace
       and p.prosecdef and p.prokind = 'f'
       and p.prorettype <> 'trigger'::regtype
       and has_function_privilege('anon', p.oid, 'execute')
       and p.proname <> 'get_user_email_by_username'
       and not exists (select 1 from pg_policies pp
                        where coalesce(pp.qual,'') || ' ' || coalesce(pp.with_check,'') ~ ('\m' || p.proname || '\('))
       and not exists (select 1 from pg_class v
                        where v.relkind in ('v','m') and v.relnamespace = 'public'::regnamespace
                          and pg_get_viewdef(v.oid) ~ ('\m' || p.proname || '\('))
  loop
    insert into public.carbo_backup_grants(objeto, papel, privilegio)
    values (format('function public.%I(%s)', r.proname, r.args), 'anon', 'execute');
    -- ⚠️ Primeiro o GRANT explícito ao time logado e ao servidor: função antiga
    -- pode estar chegando a eles só pelo PUBLIC, e tirar o PUBLIC sem isto
    -- quebraria os apps logados — calado, com "permission denied".
    execute format('grant execute on function public.%I(%s) to authenticated, service_role', r.proname, r.args);
    execute format('revoke execute on function public.%I(%s) from anon, public', r.proname, r.args);
    v_n := v_n + 1;
  end loop;
  raise notice 'funções fechadas para anon: %', v_n;
end $$;

-- As views que rodam como DONO e não se guardam passam a respeitar a regra
-- de quem consulta (`security_invoker`). `platform_connection_status` fica
-- como DONO de propósito (lê `ml_accounts`, que guarda credencial e não tem
-- leitura para ninguém) — dela só sai a internet.
do $$
declare v text;
begin
  foreach v in array array['bling_bridge_stats','carbo_competencia_suspeita','carboze_recorrencia_agenda',
                           'ecommerce_raw_summary','meta_ads_diario'] loop
    if to_regclass('public.' || v) is not null then
      execute format('alter view public.%I set (security_invoker = true)', v);
    end if;
  end loop;
  for v in select c.relname from pg_class c
            where c.relnamespace = 'public'::regnamespace and c.relkind in ('v','m')
              and has_table_privilege('anon', c.oid, 'select') loop
    insert into public.carbo_backup_grants(objeto, papel, privilegio) values ('view public.' || v, 'anon', 'select');
    execute format('revoke select on public.%I from anon', v);
  end loop;
end $$;

-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 3 — o token do Bling 1                                       ║
-- ╚═══════════════════════════════════════════════════════════════════╝
-- A tela de Integrações do Finanças lê só `expires_at`/`is_active` e marca
-- `is_active = false`; quem usa o token é a edge function, com a chave de
-- serviço. Então: o time lê as colunas de ESTADO, ninguém lê o TOKEN.
do $$
declare c text; v_cols text;
begin
  if to_regclass('public.bling_integration') is null then return; end if;
  drop policy if exists "Employees can manage bling_integration" on public.bling_integration;
  drop policy if exists "bling_integration_time_interno" on public.bling_integration;
  create policy "bling_integration_time_interno" on public.bling_integration
    for all to authenticated
    using (public.carbo_e_time_interno()) with check (public.carbo_e_time_interno());
  revoke select on public.bling_integration from anon, authenticated;
  select string_agg(quote_ident(column_name), ', ') into v_cols
    from information_schema.columns
   where table_schema = 'public' and table_name = 'bling_integration'
     and column_name !~* '(token|secret|code|senha|password)';
  if v_cols is not null then
    execute format('grant select (%s) on public.bling_integration to authenticated', v_cols);
  end if;
end $$;

-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║ CONFERÊNCIA                                                        ║
-- ╚═══════════════════════════════════════════════════════════════════╝
-- ESPERADO:
--   pedidos_abertos_a_todos = 0 · funcoes_anon_sem_guarda = poucas (só as
--   que alguma regra chama) · views_anon = 0 · token_legivel = false ·
--   matriz_aberta = 0 · notif_anon = 0
select
  (select count(*) from pg_policies where schemaname='public' and tablename='carboze_orders'
     and qual = 'true' and roles::text not like '%service_role%')                              as pedidos_abertos_a_todos,
  (select count(*) from pg_proc p where p.pronamespace='public'::regnamespace and p.prosecdef
     and p.prokind='f' and p.prorettype <> 'trigger'::regtype
     and has_function_privilege('anon', p.oid, 'execute'))                                      as funcoes_anon_restantes,
  (select count(*) from pg_class c where c.relnamespace='public'::regnamespace and c.relkind in ('v','m')
     and has_table_privilege('anon', c.oid, 'select'))                                          as views_anon,
  (select bool_or(has_column_privilege('authenticated', 'public.bling_integration', column_name, 'select'))
     from information_schema.columns where table_schema='public' and table_name='bling_integration'
      and column_name ~* 'token')                                                               as token_legivel,
  (select count(*) from pg_policies where schemaname='public'
     and tablename in ('function_screen_access','department_functions','role_matrix_config')
     and (with_check = 'true' or (cmd <> 'SELECT' and qual = 'true')))                         as matriz_aberta,
  (select count(*) from pg_policies where schemaname='public' and tablename in ('notifications','notification_log')
     and roles::text = '{public}' and coalesce(with_check, qual) = 'true')                      as notif_anon,
  (select count(*) from public.carbo_backup_grants)                                             as permissoes_guardadas;
