-- =====================================================================
-- AUDITORIA 10/10/2026 — RODADA 2b (cont.): "gestor" de QUALQUER área
-- gravava comissão e finanças de funcionário.
--
-- Medido (20261079, BLOCO 0): as regras de GRAVAÇÃO de commission_* e de
-- leitura+gravação de employee_finance usam `carbo_is_gestor(auth.uid())`, e
-- `carbo_is_gestor` (pg_get_functiondef, 10/10/2026) é "tem função de nível
-- gestor em QUALQUER departamento" — não olha a área. Gestor do Marketing ou do
-- Ops gravava pagamento de comissão e lia salário pelo banco, sem o app.
--
-- Troca: `carbo_is_gestor(auth.uid())` → `(carbo_is_gestor(auth.uid()) AND
-- carbo_tem_app(ARRAY['carbo_financas']))` DENTRO dessas regras. Só estreita:
-- quem já podia continua podendo se tiver o Finanças (ou for admin, que
-- `carbo_tem_app` aceita). ⚠️ NÃO mexe em `carbo_is_gestor` em si — ela governa
-- telas de vários apps (`isGestor`), e mudá-la mudaria o resto do sistema.
-- =====================================================================

-- BLOCO 0 — quem PERDE a gravação: gestor de alguma área, sem o Finanças e
-- sem ser admin. ESPERADO: quem aparecer aqui deixa de lançar comissão e de ver
-- finanças de funcionário. Se alguém precisa, marque o Finanças no Admin antes.
select p.full_name, p.department::text as departamento, p.funcao, p.allowed_interfaces
from public.profiles p
where coalesce(p.status,'') not in ('deleted','rejected')
  and public.carbo_is_gestor(p.id)
  and not (coalesce(p.allowed_interfaces,'{}') && array['carbo_financas'])
  and not public.has_role(p.id, 'admin'::app_role)
order by 2, 1;

-- BLOCO 1 — a troca
do $$
declare r record; v_qual text; v_check text; v_n int := 0;
  v_de  constant text := 'carbo_is_gestor(auth.uid())';
  v_por constant text := '(carbo_is_gestor(auth.uid()) AND public.carbo_tem_app(ARRAY[''carbo_financas''::text]))';
begin
  for r in
    select * from pg_policies
     where schemaname = 'public'
       and tablename in ('commission_payments','commission_rules','commission_statement_items',
                         'commission_statements','employee_finance')
       and (coalesce(qual,'') || coalesce(with_check,'')) like '%' || v_de || '%'
       and (coalesce(qual,'') || coalesce(with_check,'')) not like '%carbo_tem_app(%'
  loop
    insert into public.carbo_backup_policies(tabela, regra, operacao, papeis, quem_le, quem_grava)
    values (r.tablename, r.policyname, r.cmd, r.roles::text, r.qual, r.with_check);
    v_qual  := replace(r.qual, v_de, v_por);
    v_check := replace(r.with_check, v_de, v_por);
    if v_qual is not null and v_check is not null then
      execute format('alter policy %I on public.%I using (%s) with check (%s)', r.policyname, r.tablename, v_qual, v_check);
    elsif v_qual is not null then
      execute format('alter policy %I on public.%I using (%s)', r.policyname, r.tablename, v_qual);
    else
      execute format('alter policy %I on public.%I with check (%s)', r.policyname, r.tablename, v_check);
    end if;
    v_n := v_n + 1;
  end loop;
  raise notice 'regras de gestor restritas ao Finanças: %', v_n;
end $$;

-- CONFERÊNCIA — ESPERADO: gestor_de_qualquer_area = 0 · gestor_do_financas = 6.
select
  (select count(*) from pg_policies where schemaname = 'public'
     and tablename in ('commission_payments','commission_rules','commission_statement_items',
                       'commission_statements','employee_finance')
     and (coalesce(qual,'') || coalesce(with_check,'')) like '%carbo_is_gestor(auth.uid())%'
     and (coalesce(qual,'') || coalesce(with_check,'')) not like '%carbo_tem_app(%') as gestor_de_qualquer_area,
  (select count(*) from pg_policies where schemaname = 'public'
     and tablename in ('commission_payments','commission_rules','commission_statement_items',
                       'commission_statements','employee_finance')
     and (coalesce(qual,'') || coalesce(with_check,'')) like '%carbo_is_gestor(auth.uid()) AND%carbo_tem_app(%') as gestor_do_financas;
