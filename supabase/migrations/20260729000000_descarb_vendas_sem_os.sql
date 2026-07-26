-- ─────────────────────────────────────────────────────────────────────────────
-- FASE 4 — Reconciliação: vendas de descarbonização que ficaram SEM OS.
--
-- Hoje, se a criação da OS falha, o /vender mostra um toast e segue. O toast
-- some, a venda fica registrada e o serviço nunca é executado — sem que nada
-- na tela denuncie. Foi assim que o D13 (guarda de permissão em
-- os_upsert_customer) pôde ficar quebrado sem ninguém perceber.
--
-- Esta RPC é o que alimenta o aviso em Descarbonização › OS: toda venda com
-- item kind=service e descarb_os_id nulo.
--
-- Depende de public.carboze_valor_servico(jsonb), criada na FASE 1.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.crm_descarb_vendas_sem_os(p_dias int default 365)
returns table (
  order_id       uuid,
  order_number   text,
  customer_name  text,
  vendedor_id    uuid,
  vendedor_name  text,
  valor_descarb  numeric,
  sale_date      date,
  execution_date date
)
language sql
stable
security definer
set search_path = public
as $$
  select o.id,
         o.order_number,
         o.customer_name,
         o.vendedor_id,
         o.vendedor_name,
         public.carboze_valor_servico(o.items)     as valor_descarb,
         coalesce(o.sale_date, o.created_at::date) as sale_date,
         o.execution_date
    from public.carboze_orders o
   where o.status not in ('quote', 'cancelled')
     and o.descarb_os_id is null
     and public.carboze_valor_servico(o.items) > 0
     and coalesce(o.sale_date, o.created_at::date) >= (current_date - p_dias)
   order by coalesce(o.sale_date, o.created_at::date) desc;
$$;

comment on function public.crm_descarb_vendas_sem_os(int) is
  'Vendas com descarbonização que não têm OS vinculada. Alimenta o aviso de reconciliação em Descarbonização › OS.';

revoke all on function public.crm_descarb_vendas_sem_os(int) from public, anon;
grant execute on function public.crm_descarb_vendas_sem_os(int) to authenticated;

notify pgrst, 'reload schema';

-- ── Conferência ──────────────────────────────────────────────────────────────
-- select * from public.crm_descarb_vendas_sem_os(365);
--   → vazio = todas as vendas de descarbonização têm OS.
