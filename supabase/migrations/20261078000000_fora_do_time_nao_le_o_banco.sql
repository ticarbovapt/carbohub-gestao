-- =====================================================================
-- AUDITORIA 10/10/2026 — RODADA 2a: quem é de FORA da empresa sai das
-- tabelas internas.
--
-- Medido (20261077): ~175 tabelas com regra "qualquer logado" (`true`,
-- `auth.uid() IS NOT NULL`, `auth.role() = 'authenticated'`) ou "tem linha em
-- profiles" (`is_employee`). O login é UM SÓ para o ecossistema: lojista,
-- frentista, staff do microdistribuidor e licenciado são `authenticated` como
-- qualquer funcionário — e liam contatos do Bling, pedidos do e-commerce com
-- telefone, comissões; e ALTERAVAM carteira de licenciado, máquinas, MRP,
-- fornecedores, contas a pagar.
--
-- A troca é no TEXTO da regra, e só ESTREITA:
--   true                         → carbo_e_time_interno()
--   auth.uid() IS NOT NULL       → carbo_e_time_interno()
--   auth.role() = 'authenticated'→ carbo_e_time_interno()
--   is_employee(auth.uid())      → carbo_e_time_interno()
-- Dentro de expressão maior (`x AND is_employee(...)`) troca só o pedaço, então
-- uma regra composta nunca fica MAIS aberta do que era.
--
-- ⚠️ Para o time interno NADA muda: 0 (f) da 20261073 voltou vazio — não há
-- funcionário sem interface interna. Quem sai é conta de portal.
-- ⚠️ NÃO entram:
--   · carbo_bug_reports, carbo_departments, carbo_functions, notifications —
--     o Portal de Vendas e o md as usam (medido no código do carbohub-produtos);
--   · regra de INSERT de formulário público (nps_responses, vip_registrations,
--     flamme_leads, b2b_leads) — quem escreve ali pode não ter login;
--   · tarja de status (aberta a anon de propósito);
--   · regra que já é só do service_role.
-- ⚠️ `roles` NÃO muda: `carbo_e_time_interno()` devolve false para anon (e anon
-- ainda tem EXECUTE nela), então consulta anônima volta VAZIA em vez de erro.
-- ⚠️ Cada regra trocada vai INTEIRA para `carbo_backup_policies` antes.
-- =====================================================================

-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 0 — usuários de portal ANTIGO do controle que perderiam algo  ║
-- ╚═══════════════════════════════════════════════════════════════════╝
-- `licensee_users` e `pdv_users` ligam login a licenciado/PDV no controle.
-- ESPERADO: zero linhas, ou só contas que você sabe que não usam mais o
-- controle. Linha de quem usa hoje = me mande ANTES do BLOCO 1.
select 'licensee_users' as origem, u.email, u.last_sign_in_at::date as ultimo_login
from public.licensee_users lu join auth.users u on u.id = lu.user_id
where not public.carbo_interface_e_interna(
        coalesce((select p.allowed_interfaces from public.profiles p where p.id = lu.user_id), '{}'))
union all
select 'pdv_users', u.email, u.last_sign_in_at::date
from public.pdv_users pu join auth.users u on u.id = pu.user_id
where not public.carbo_interface_e_interna(
        coalesce((select p.allowed_interfaces from public.profiles p where p.id = pu.user_id), '{}'))
order by 3 desc nulls last;

-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 1 — a troca                                                  ║
-- ╚═══════════════════════════════════════════════════════════════════╝
create table if not exists public.carbo_backup_policies (
  feito_em   timestamptz not null default now(),
  tabela     text not null,
  regra      text not null,
  operacao   text not null,
  papeis     text not null,
  quem_le    text,
  quem_grava text
);
alter table public.carbo_backup_policies enable row level security;  -- sem policy: só o dono lê

do $$
declare
  r record; v_qual text; v_check text; v_n int := 0;
  -- só ESTREITA: cada padrão vira a regra do time interno
  f_troca constant text := '(^true$)|(auth\.uid\(\) IS NOT NULL)|(auth\.role\(\) = ''authenticated''::text)|(is_employee\(auth\.uid\(\)\))';
begin
  for r in
    select * from pg_policies p
     where p.schemaname = 'public'
       and p.roles::text not like '%service_role%'
       and p.tablename not in ('carbo_bug_reports','carbo_departments','carbo_functions','notifications',
                               'carbo_status_aviso','carbo_status_sonda',
                               'carbo_backup_grants','carbo_backup_policies')
       and not (p.tablename in ('nps_responses','vip_registrations','flamme_leads','b2b_leads') and p.cmd = 'INSERT')
       and (coalesce(p.qual,'') ~ f_troca or coalesce(p.with_check,'') ~ f_troca)
  loop
    insert into public.carbo_backup_policies(tabela, regra, operacao, papeis, quem_le, quem_grava)
    values (r.tablename, r.policyname, r.cmd, r.roles::text, r.qual, r.with_check);

    v_qual  := case when r.qual is null then null
                    when r.qual = 'true' then 'public.carbo_e_time_interno()'
                    else regexp_replace(r.qual,
                           '(auth\.uid\(\) IS NOT NULL)|(auth\.role\(\) = ''authenticated''::text)|(is_employee\(auth\.uid\(\)\))',
                           'public.carbo_e_time_interno()', 'g') end;
    v_check := case when r.with_check is null then null
                    when r.with_check = 'true' then 'public.carbo_e_time_interno()'
                    else regexp_replace(r.with_check,
                           '(auth\.uid\(\) IS NOT NULL)|(auth\.role\(\) = ''authenticated''::text)|(is_employee\(auth\.uid\(\)\))',
                           'public.carbo_e_time_interno()', 'g') end;

    if v_qual is not null and v_check is not null then
      execute format('alter policy %I on public.%I using (%s) with check (%s)', r.policyname, r.tablename, v_qual, v_check);
    elsif v_qual is not null then
      execute format('alter policy %I on public.%I using (%s)', r.policyname, r.tablename, v_qual);
    else
      execute format('alter policy %I on public.%I with check (%s)', r.policyname, r.tablename, v_check);
    end if;
    v_n := v_n + 1;
  end loop;
  raise notice 'regras trocadas: %', v_n;
end $$;

-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║ CONFERÊNCIA                                                        ║
-- ╚═══════════════════════════════════════════════════════════════════╝
-- ESPERADO: regras_ainda_abertas = só as das exceções (4 tabelas do portal,
-- tarja e os INSERT de formulário); regras_trocadas = o número do notice.
select
  (select count(*) from pg_policies p
    where p.schemaname = 'public' and p.roles::text not like '%service_role%'
      and (coalesce(p.qual,'') || ' ' || coalesce(p.with_check,'')) ~
          '(^true |^true$| true$)|(auth\.uid\(\) IS NOT NULL)|(auth\.role\(\) = ''authenticated''::text)|(is_employee\(auth\.uid\(\)\))') as regras_ainda_abertas,
  (select string_agg(distinct p.tablename, ', ') from pg_policies p
    where p.schemaname = 'public' and p.roles::text not like '%service_role%'
      and (coalesce(p.qual,'') || ' ' || coalesce(p.with_check,'')) ~
          '(^true |^true$| true$)|(auth\.uid\(\) IS NOT NULL)|(auth\.role\(\) = ''authenticated''::text)|(is_employee\(auth\.uid\(\)\))') as quais_tabelas,
  (select count(*) from public.carbo_backup_policies) as regras_trocadas;
