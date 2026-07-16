-- ─────────────────────────────────────────────────────────────────────────────
-- Metas (crm_metas_board): REALIZADO passa a medir a MESMA coisa que a base do
-- Comissionamento (crm_comissao_agregado) — "faturado" = venda com NF vinculada.
--
-- Antes o realizado contava TODA venda (status != quote/cancelled, por created_at),
-- inclusive as ainda SEM NF — então o placar não batia com o comissionamento
-- (ex.: uma venda pendente sem NF inflava a meta mas não a comissão).
--
-- Agora as três janelas (mês, mês anterior, semana) usam o critério da comissão:
--   • bling_nf_id IS NOT NULL   (só faturado)
--   • status not in (quote, cancelled)  · excluir_metricas = false
--   • data por coalesce(sale_date, created_at)  (data efetiva da venda)
-- Assim Meta.realizado == Comissionamento.base para o mesmo período/vendedor.
-- (Reforça a importância de linkar as NFs: venda entregue sem bling_nf_id fica
--  fora das duas — reconciliar a NF faz as duas subirem juntas.)
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.crm_metas_board(
  p_ano         int,
  p_mes         int,
  p_month_from  timestamptz,
  p_month_to    timestamptz,
  p_prev_from   timestamptz,
  p_prev_to     timestamptz,
  p_week_from   timestamptz,
  p_week_to     timestamptz,
  p_semanas     int
)
returns table (
  vendedor_id           uuid,
  full_name             text,
  avatar_url            text,
  department            text,
  secondary_department  text,
  target_amount         numeric,
  actual_amount         numeric,
  prev_amount           numeric,
  week_amount           numeric,
  actual_qty            bigint,
  pct_amount            numeric,
  pct_week              numeric,
  team_target           numeric,
  team_actual           numeric,
  team_pct              numeric
)
language sql stable security definer set search_path = public as $$
  with g as (
    select public.carbo_is_gestor(auth.uid()) as is_gestor
  ),
  vend as (
    select p.id, p.full_name, p.avatar_url, p.department, p.secondary_department
    from public.profiles p
    where coalesce(p.is_vendedor, false) = true
  ),
  meta as (
    select vendedor_id, target_amount from public.crm_metas_resolvidas(p_ano, p_mes)
  ),
  month_agg as (
    select o.vendedor_id, coalesce(sum(o.total),0)::numeric as total, count(*)::bigint as qtd
    from public.carboze_orders o
    where o.vendedor_id is not null
      and o.bling_nf_id is not null
      and o.status not in ('quote','cancelled')
      and coalesce(o.excluir_metricas,false) = false
      and coalesce(o.sale_date, o.created_at::date) >= p_month_from::date
      and coalesce(o.sale_date, o.created_at::date) <  p_month_to::date
    group by o.vendedor_id
  ),
  prev_agg as (
    select o.vendedor_id, coalesce(sum(o.total),0)::numeric as total
    from public.carboze_orders o
    where o.vendedor_id is not null
      and o.bling_nf_id is not null
      and o.status not in ('quote','cancelled')
      and coalesce(o.excluir_metricas,false) = false
      and coalesce(o.sale_date, o.created_at::date) >= p_prev_from::date
      and coalesce(o.sale_date, o.created_at::date) <  p_prev_to::date
    group by o.vendedor_id
  ),
  week_agg as (
    select o.vendedor_id, coalesce(sum(o.total),0)::numeric as total
    from public.carboze_orders o
    where o.vendedor_id is not null
      and o.bling_nf_id is not null
      and o.status not in ('quote','cancelled')
      and coalesce(o.excluir_metricas,false) = false
      and coalesce(o.sale_date, o.created_at::date) >= p_week_from::date
      and coalesce(o.sale_date, o.created_at::date) <  p_week_to::date
    group by o.vendedor_id
  ),
  rows as (
    select
      v.id, v.full_name, v.avatar_url, v.department, v.secondary_department,
      coalesce(m.target_amount,0)::numeric  as target_amount,
      coalesce(ma.total,0)::numeric         as actual_amount,
      coalesce(ma.qtd,0)::bigint            as actual_qty,
      coalesce(pa.total,0)::numeric         as prev_amount,
      coalesce(wa.total,0)::numeric         as week_amount
    from vend v
    left join meta m       on m.vendedor_id  = v.id
    left join month_agg ma on ma.vendedor_id = v.id
    left join prev_agg  pa on pa.vendedor_id = v.id
    left join week_agg  wa on wa.vendedor_id = v.id
  ),
  team as (
    select coalesce(sum(target_amount),0)::numeric as tt,
           coalesce(sum(actual_amount),0)::numeric as ta
    from rows
  )
  select
    r.id, r.full_name, r.avatar_url, r.department, r.secondary_department,
    case when g.is_gestor then r.target_amount end,
    case when g.is_gestor then r.actual_amount end,
    case when g.is_gestor then r.prev_amount   end,
    case when g.is_gestor then r.week_amount    end,
    case when g.is_gestor then r.actual_qty     end,
    case when r.target_amount > 0 then round((r.actual_amount / r.target_amount) * 100, 1) else 0 end,
    case when r.target_amount > 0 and p_semanas > 0
         then round((r.week_amount * p_semanas / r.target_amount) * 100, 1)
         else null end,
    case when g.is_gestor then t.tt end,
    case when g.is_gestor then t.ta end,
    case when t.tt > 0 then round((t.ta / t.tt) * 100, 1) else 0 end
  from rows r cross join team t cross join g
  order by r.full_name;
$$;

revoke all on function public.crm_metas_board(int,int,timestamptz,timestamptz,timestamptz,timestamptz,timestamptz,timestamptz,int) from public, anon;
grant execute on function public.crm_metas_board(int,int,timestamptz,timestamptz,timestamptz,timestamptz,timestamptz,timestamptz,int) to authenticated;

notify pgrst, 'reload schema';
