-- =====================================================================
-- AUDITORIA 10/10/2026 — RODADA 1, complemento.
--
-- A conferência da 20261075 voltou limpa (pedidos_abertos_a_todos = 0), mas o
-- BLOCO 0 (a) mostrou uma regra que ela não tocava:
--   "Authenticated users can view orders"  SELECT · {public} · auth.uid() IS NOT NULL
-- Qualquer conta LOGADA — inclusive lojista e licenciado, que usam a MESMA
-- `profiles` — lia os 1.798 pedidos. A conferência não pegou porque procurava
-- `qual = 'true'`, e esta regra diz a mesma coisa com outras palavras.
--
-- Quem perde o quê ao tirá-la: NINGUÉM do time — `carboze_orders_time_interno`
-- (20261075) já dá a mesma leitura a todo interno. Portal de PDV e licenciado
-- continuam com as regras ESCOPADAS ("PDV users can view related orders" e
-- `carboze_orders_select_scoped`), que só mostram o que é deles.
-- =====================================================================

-- BLOCO A — as funções que continuam abertas a `anon` (só leitura).
-- São as que alguma REGRA de tabela/view chama. `se_guarda = false` + nome que
-- devolve DADO (não true/false) é o que interessa.
select p.proname as funcao, pg_get_function_identity_arguments(p.oid) as argumentos,
       pg_get_function_result(p.oid) as devolve,
       (pg_get_functiondef(p.oid) ~* 'auth\.uid\(\)|carbo_e_time_interno|is_admin|has_role') as se_guarda
from pg_proc p
where p.pronamespace = 'public'::regnamespace and p.prosecdef and p.prokind = 'f'
  and p.prorettype <> 'trigger'::regtype
  and has_function_privilege('anon', p.oid, 'execute')
order by (pg_get_function_result(p.oid) = 'boolean') desc, p.proname;

-- BLOCO B — tira a leitura de "qualquer logado".
do $$
begin
  if exists (select 1 from pg_policies where schemaname='public' and tablename='carboze_orders'
              and policyname='Authenticated users can view orders') then
    insert into public.carbo_backup_grants(objeto, papel, privilegio)
    values ('policy "Authenticated users can view orders" on carboze_orders: auth.uid() IS NOT NULL', 'public', 'select');
    execute 'drop policy "Authenticated users can view orders" on public.carboze_orders';
  end if;
end $$;

-- CONFERÊNCIA — ESPERADO: regras_de_qualquer_logado = 0.
select count(*) as regras_de_qualquer_logado
from pg_policies
where schemaname = 'public' and tablename = 'carboze_orders' and cmd in ('SELECT','ALL')
  and (qual = 'true' or qual ilike '%auth.uid() IS NOT NULL)' and qual not ilike '%AND%')
  and roles::text not like '%service_role%';
