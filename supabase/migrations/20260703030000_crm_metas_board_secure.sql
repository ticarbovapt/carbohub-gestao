-- ─────────────────────────────────────────────────────────────────────────────
-- Quadro de metas do Carbo Sales com SEGURANÇA no banco.
--
-- Problema: as telas calculavam o % no navegador a partir dos valores em R$
-- (realizado/meta), então mesmo escondendo no front os R$ desciam pro cliente
-- e dava pra ver pelo devtools.
--
-- Solução: esta RPC calcula tudo no servidor e só devolve os R$ (meta, realizado,
-- mês anterior, semana, totais do time) para quem é GESTOR (carbo_is_gestor).
-- Para os demais, os campos em R$ voltam NULL — mas o % (mensal, semanal e do
-- time) sempre vem calculado, então o ranking por % continua funcionando sem
-- expor nenhum valor.
--
-- Fonte do realizado idêntica à crm_vendas_agregado (carboze_orders, status
-- != quote/cancelled, fora de excluir_metricas, por created_at nas janelas
-- passadas pelo front) → números batem com o que já era exibido.
-- Meta resolvida por crm_metas_resolvidas (sales_targets > sales_target_defaults).
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
  target_amount         numeric,   -- NULL p/ não-gestor
  actual_amount         numeric,   -- NULL p/ não-gestor
  prev_amount           numeric,   -- NULL p/ não-gestor
  week_amount           numeric,   -- NULL p/ não-gestor
  actual_qty            bigint,    -- NULL p/ não-gestor
  pct_amount            numeric,   -- sempre
  pct_week              numeric,   -- sempre (NULL se sem meta)
  team_target           numeric,   -- NULL p/ não-gestor
  team_actual           numeric,   -- NULL p/ não-gestor
  team_pct              numeric    -- sempre
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
      and o.status not in ('quote','cancelled')
      and coalesce(o.excluir_metricas,false) = false
      and o.created_at >= p_month_from and o.created_at < p_month_to
    group by o.vendedor_id
  ),
  prev_agg as (
    select o.vendedor_id, coalesce(sum(o.total),0)::numeric as total
    from public.carboze_orders o
    where o.vendedor_id is not null
      and o.status not in ('quote','cancelled')
      and coalesce(o.excluir_metricas,false) = false
      and o.created_at >= p_prev_from and o.created_at < p_prev_to
    group by o.vendedor_id
  ),
  week_agg as (
    select o.vendedor_id, coalesce(sum(o.total),0)::numeric as total
    from public.carboze_orders o
    where o.vendedor_id is not null
      and o.status not in ('quote','cancelled')
      and coalesce(o.excluir_metricas,false) = false
      and o.created_at >= p_week_from and o.created_at < p_week_to
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
