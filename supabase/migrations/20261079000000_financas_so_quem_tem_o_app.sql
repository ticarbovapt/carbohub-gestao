-- =====================================================================
-- AUDITORIA 10/10/2026 — RODADA 2b: dados de FINANÇAS só para quem tem o app.
--
-- Decisão do dono do processo (10/10/2026): "só quem tem o app". Depois da
-- 20261078 essas tabelas eram `carbo_e_time_interno()` — qualquer interno
-- (atendimento, marketing, pré-vendas…) lia contas a pagar, comissões e
-- finanças de funcionário pelo PostgREST, sem tela nenhuma.
--
-- Quem usa cada tabela foi MEDIDO no código (`.from("…")` dos oito apps, da
-- raiz e das edge functions):
--   receivables, payment_methods, commission_*, employee_finance → Finanças
--   purchase_payables  → Finanças, Ops (app) e a raiz/controle (carbo_ops)
--   comissao_faixas, vendedor_comissao → a raiz (/sales-targets) e Finanças
-- (`apps/mkt` tem hooks de finanças SEM rota — código morto, não conta.)
-- Edge functions usam service role e as RPCs de comissão são SECURITY
-- DEFINER: nenhuma das duas passa por aqui.
--
-- A troca é `carbo_e_time_interno()` → `carbo_tem_app(array[...])` DENTRO da
-- regra existente, então ela só ESTREITA: um `user_id = auth.uid() OR …`
-- continua deixando cada um ver a própria linha.
-- ⚠️ Admin (`has_role admin`) passa sempre.
-- ⚠️ ATENÇÃO à porta dos apps: hoje head/CEO/TI entram no Finanças SEM a
-- flag. Quem entra assim passa a ver as telas VAZIAS — é o caso que a
-- revisão da lista de 11 pessoas resolve (dar a flag ou não).
-- =====================================================================

-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 0 — as regras VIVAS dessas tabelas (só leitura)              ║
-- ╚═══════════════════════════════════════════════════════════════════╝
-- ESPERADO: as regras trocadas pela 20261078 aparecem com
-- carbo_e_time_interno(). Regra com OUTRA abertura (ex.: `has_role` de outro
-- papel) não é tocada pelo BLOCO 1 — se houver, me mande.
select tablename as tabela, policyname as regra, cmd as operacao, qual as quem_le, with_check as quem_grava
from pg_policies
where schemaname = 'public'
  and tablename in ('receivables','payment_methods','commission_statements','commission_statement_items',
                    'commission_payments','commission_rules','employee_finance','purchase_payables',
                    'comissao_faixas','vendedor_comissao')
order by 1, 3, 2;

-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 0 (b) — quem PERDE a leitura (só leitura)                    ║
-- ╚═══════════════════════════════════════════════════════════════════╝
-- Interno, ativo, sem nenhuma das flags e sem ser admin. Não é "quem perde
-- uma tela" (esses não têm o app) — é quem hoje conseguiria puxar pelo banco.
-- Serve para você ver se alguém da lista PRECISA de Finanças e não tem a flag.
select p.full_name, p.department::text as departamento, p.funcao, p.allowed_interfaces
from public.profiles p
where public.carbo_interface_e_interna(p.allowed_interfaces)
  and coalesce(p.status,'') not in ('deleted','rejected')
  and not (coalesce(p.allowed_interfaces,'{}') && array['carbo_financas'])
  and not public.has_role(p.id, 'admin'::app_role)
  and (p.department::text in ('financeiro','command','ti_suporte') or p.funcao in ('head','ceo','command'))
order by 2, 1;

-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 1 — a troca                                                  ║
-- ╚═══════════════════════════════════════════════════════════════════╝
create or replace function public.carbo_tem_app(p_flags text[])
returns boolean
language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and (
           exists (select 1 from public.profiles pr
                    where pr.id = auth.uid()
                      and coalesce(pr.status,'') not in ('deleted','rejected')
                      and coalesce(pr.allowed_interfaces,'{}') && p_flags)
        or public.has_role(auth.uid(), 'admin'::app_role));
$$;
-- ⚠️ Função nova nasce executável por anon (default privileges): fecha aqui.
-- `anon` fica SEM execute; as regras dessas tabelas não servem a anon.
grant execute on function public.carbo_tem_app(text[]) to authenticated, service_role;
revoke execute on function public.carbo_tem_app(text[]) from anon, public;

do $$
declare
  r record; v_flags text; v_qual text; v_check text; v_n int := 0;
begin
  for r in
    select * from pg_policies
     where schemaname = 'public'
       and tablename in ('receivables','payment_methods','commission_statements','commission_statement_items',
                         'commission_payments','commission_rules','employee_finance','purchase_payables',
                         'comissao_faixas','vendedor_comissao')
       and (coalesce(qual,'') || coalesce(with_check,'')) like '%carbo_e_time_interno()%'
  loop
    v_flags := case
      when r.tablename = 'purchase_payables' then 'array[''carbo_financas'',''carbo_ops_app'',''carbo_ops'']'
      when r.tablename in ('comissao_faixas','vendedor_comissao') then 'array[''carbo_financas'',''carbo_ops'']'
      else 'array[''carbo_financas'']' end;

    insert into public.carbo_backup_policies(tabela, regra, operacao, papeis, quem_le, quem_grava)
    values (r.tablename, r.policyname, r.cmd, r.roles::text, r.qual, r.with_check);

    v_qual  := replace(r.qual,       'carbo_e_time_interno()', format('public.carbo_tem_app(%s)', v_flags));
    v_check := replace(r.with_check, 'carbo_e_time_interno()', format('public.carbo_tem_app(%s)', v_flags));

    if v_qual is not null and v_check is not null then
      execute format('alter policy %I on public.%I using (%s) with check (%s)', r.policyname, r.tablename, v_qual, v_check);
    elsif v_qual is not null then
      execute format('alter policy %I on public.%I using (%s)', r.policyname, r.tablename, v_qual);
    else
      execute format('alter policy %I on public.%I with check (%s)', r.policyname, r.tablename, v_check);
    end if;
    v_n := v_n + 1;
  end loop;
  raise notice 'regras de finanças restritas: %', v_n;
end $$;

-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║ CONFERÊNCIA                                                        ║
-- ╚═══════════════════════════════════════════════════════════════════╝
-- ESPERADO: ainda_do_time_todo = 0 · com_flag = o número do notice.
select
  (select count(*) from pg_policies
    where schemaname = 'public'
      and tablename in ('receivables','payment_methods','commission_statements','commission_statement_items',
                        'commission_payments','commission_rules','employee_finance','purchase_payables',
                        'comissao_faixas','vendedor_comissao')
      and (coalesce(qual,'') || coalesce(with_check,'')) like '%carbo_e_time_interno()%') as ainda_do_time_todo,
  (select count(*) from pg_policies
    where schemaname = 'public'
      and (coalesce(qual,'') || coalesce(with_check,'')) like '%carbo_tem_app(%')         as com_flag,
  has_function_privilege('anon', 'public.carbo_tem_app(text[])', 'execute')            as anon_executa;
