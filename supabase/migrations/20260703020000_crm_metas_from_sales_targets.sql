-- ─────────────────────────────────────────────────────────────────────────────
-- UNIFICA a fonte das metas: o Carbo Sales (tela Metas de Vendedores) passa a
-- ler EXATAMENTE o que o Carbo Admin (Configurar Metas) grava.
--
-- Antes:
--   Admin escrevia em  sales_targets (exceção do mês) + sales_target_defaults (padrão)
--   Sales lia de       crm_vendedor_metas + crm_vendedor_meta_default  ← tabelas
--                      diferentes → a meta configurada nunca aparecia no Sales.
--
-- Agora crm_metas_resolvidas(_ano) resolvem por prioridade:
--   1) EXCEÇÃO do mês       → sales_targets (month = 1º dia do mês, linha nula)  ['mes']
--   2) PADRÃO recorrente    → sales_target_defaults (linha nula)                ['padrao']
--   3) senão → 0                                                                ['none']
--
-- Só faturamento (R$). Considera a meta agregada (linha IS NULL); metas por linha
-- de produto não entram no total do ranking.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.crm_metas_resolvidas(p_ano int, p_mes int)
returns table (vendedor_id uuid, target_amount numeric, source text)
language sql stable security definer set search_path = public as $$
  select p.id,
         coalesce(ex.target_amount, df.target_amount, 0)::numeric,
         case when ex.target_amount is not null then 'mes'
              when df.target_amount is not null then 'padrao'
              else 'none' end
  from public.profiles p
  left join lateral (
    select t.target_amount
    from public.sales_targets t
    where t.vendedor_id = p.id
      and t.month = make_date(p_ano, p_mes, 1)
      and t.linha is null
    order by t.updated_at desc
    limit 1
  ) ex on true
  left join lateral (
    select d.target_amount
    from public.sales_target_defaults d
    where d.vendedor_id = p.id
      and d.linha is null
    order by d.updated_at desc
    limit 1
  ) df on true
  where coalesce(p.is_vendedor, false) = true;
$$;
revoke all on function public.crm_metas_resolvidas(int, int) from public, anon;
grant execute on function public.crm_metas_resolvidas(int, int) to authenticated;

-- Ano inteiro (12 meses) — usado na linha de meta do Dashboard Comercial.
create or replace function public.crm_metas_resolvidas_ano(p_ano int)
returns table (vendedor_id uuid, mes int, target_amount numeric, source text)
language sql stable security definer set search_path = public as $$
  select p.id, m.mes,
         coalesce(ex.target_amount, df.target_amount, 0)::numeric,
         case when ex.target_amount is not null then 'mes'
              when df.target_amount is not null then 'padrao'
              else 'none' end
  from public.profiles p
  cross join generate_series(1, 12) as m(mes)
  left join lateral (
    select t.target_amount
    from public.sales_targets t
    where t.vendedor_id = p.id
      and t.month = make_date(p_ano, m.mes, 1)
      and t.linha is null
    order by t.updated_at desc
    limit 1
  ) ex on true
  left join lateral (
    select d.target_amount
    from public.sales_target_defaults d
    where d.vendedor_id = p.id
      and d.linha is null
    order by d.updated_at desc
    limit 1
  ) df on true
  where coalesce(p.is_vendedor, false) = true;
$$;
revoke all on function public.crm_metas_resolvidas_ano(int) from public, anon;
grant execute on function public.crm_metas_resolvidas_ano(int) to authenticated;

notify pgrst, 'reload schema';
