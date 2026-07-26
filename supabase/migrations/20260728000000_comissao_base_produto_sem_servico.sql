-- ─────────────────────────────────────────────────────────────────────────────
-- FASE 1 — Comissão: tirar a descarbonização da base de PRODUTO.
--
-- O defeito: crm_comissao_agregado soma o.total, e o.total inclui os itens de
-- serviço (kind='service'). Como crm_comissao_descarb já soma esses mesmos itens
-- por fora, um pedido MISTO (carbozé/carbopró + descarbonização) que recebe NF
-- comissiona a parte de descarbonização DUAS VEZES — uma no % de produto, outra
-- no % de descarbonização.
--
-- Venda só de serviço nunca teve o problema: não recebe NF, então nunca entrou
-- em crm_comissao_agregado. O erro só aparece no pedido misto faturado.
--
-- A conta: produto = o.total − Σ(itens kind='service').
-- Subtrair (em vez de somar os itens de produto) preserva o significado de
-- o.total, que é a fonte de verdade do valor do pedido — se um dia sum(itens)
-- divergir de total por arredondamento ou por pedido legado, o valor cobrado
-- do cliente continua mandando.
--
-- crm_metas_board recebe a MESMA correção. A migration 20260715160000 alinhou
-- meta e comissão de propósito ("Meta.realizado == Comissionamento.base"); sem
-- mexer nas duas, esse alinhamento quebraria agora.
--
-- ⚠️ Isto NÃO decide se descarbonização deve contar na meta do vendedor. Hoje
--    não conta (meta exige NF, e serviço não tem NF) — a correção só remove a
--    inclusão ACIDENTAL que acontecia no pedido misto. Se a decisão for que
--    descarbonização entra na meta, é outra migration.
--
-- Nada é destrutivo: só redefine duas funções.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Helper: quanto de um pedido é serviço (descarbonização) ──────────────────
-- Usa o 'total' da linha (já líquido do desconto de linha, é o que o /vender
-- grava). Cai no bruto − desconto se algum item antigo não tiver 'total'.
create or replace function public.carboze_valor_servico(p_items jsonb)
returns numeric
language sql
immutable
as $$
  select coalesce(sum(
    coalesce(
      nullif(it->>'total', '')::numeric,
      coalesce(nullif(it->>'quantity',   '')::numeric, 0)
        * coalesce(nullif(it->>'unit_price', '')::numeric, 0)
        - coalesce(nullif(it->>'discount_amount', '')::numeric, 0)
    )
  ), 0)
  from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) it
  where it->>'kind' = 'service';
$$;

comment on function public.carboze_valor_servico(jsonb) is
  'Parte do pedido que é descarbonização (itens kind=service). Usada para tirar o serviço da base de comissão/meta de PRODUTO, já que ele comissiona por fora (crm_comissao_descarb).';

-- ── 1) Base de comissão de PRODUTO ───────────────────────────────────────────
create or replace function public.crm_comissao_agregado(p_from date, p_to date)
returns table (vendedor_id uuid, vendedor_name text, total numeric, qtd bigint)
language sql stable security definer set search_path = public as $$
  with base as (
    select o.vendedor_id,
           o.vendedor_name,
           greatest(o.total - public.carboze_valor_servico(o.items), 0) as valor_produto
    from public.carboze_orders o
    where o.vendedor_id is not null
      and o.bling_nf_id is not null
      and o.status not in ('quote', 'cancelled')
      and coalesce(o.excluir_metricas, false) = false
      and coalesce(o.sale_date, o.created_at::date) between p_from and p_to
  )
  select b.vendedor_id,
         max(b.vendedor_name)                 as vendedor_name,
         coalesce(sum(b.valor_produto), 0)::numeric as total,
         count(*)::bigint                     as qtd
  from base b
  -- Pedido cujo valor de produto zerou (era 100% serviço) não é venda de
  -- produto: sai da base e não infla a contagem.
  where b.valor_produto > 0
  group by b.vendedor_id;
$$;

grant execute on function public.crm_comissao_agregado(date, date) to authenticated;

-- ── 2) Realizado das METAS — mesmo critério ──────────────────────────────────
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
  -- Pedidos faturados no ano, já com o serviço descontado (uma passada só).
  faturado as (
    select o.vendedor_id,
           coalesce(o.sale_date, o.created_at::date) as dt,
           greatest(o.total - public.carboze_valor_servico(o.items), 0) as valor
    from public.carboze_orders o
    where o.vendedor_id is not null
      and o.bling_nf_id is not null
      and o.status not in ('quote','cancelled')
      and coalesce(o.excluir_metricas,false) = false
  ),
  month_agg as (
    select f.vendedor_id, coalesce(sum(f.valor),0)::numeric as total, count(*)::bigint as qtd
    from faturado f
    where f.valor > 0 and f.dt >= p_month_from::date and f.dt < p_month_to::date
    group by f.vendedor_id
  ),
  prev_agg as (
    select f.vendedor_id, coalesce(sum(f.valor),0)::numeric as total
    from faturado f
    where f.valor > 0 and f.dt >= p_prev_from::date and f.dt < p_prev_to::date
    group by f.vendedor_id
  ),
  week_agg as (
    select f.vendedor_id, coalesce(sum(f.valor),0)::numeric as total
    from faturado f
    where f.valor > 0 and f.dt >= p_week_from::date and f.dt < p_week_to::date
    group by f.vendedor_id
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
    case when g.is_gestor then r.week_amount   end,
    case when g.is_gestor then r.actual_qty    end,
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
