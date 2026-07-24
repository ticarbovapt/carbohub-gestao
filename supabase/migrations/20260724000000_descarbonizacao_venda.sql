-- Descarbonização (serviço) na venda: previsão de execução + vínculo com a OS +
-- base de comissão de serviço (sem NF). NÃO altera o cálculo de comissão de
-- produto (crm_comissao_agregado/crm_comissao_detalhe permanecem intactas).

-- 1) Colunas em carboze_orders ------------------------------------------------
alter table public.carboze_orders
  add column if not exists execution_date date,
  add column if not exists descarb_os_id  uuid;

comment on column public.carboze_orders.execution_date is
  'Previsão de execução da descarbonização (itens kind=service em items[]).';
comment on column public.carboze_orders.descarb_os_id is
  'OS de descarbonização criada a partir desta venda (licenciados.service_orders.id).';

-- 2) Base de comissão de descarbonização --------------------------------------
-- Agrega os itens kind=service de carboze_orders.items[], por vendedor/período,
-- SEM exigir bling_nf_id (serviço não gera NF): conta já ao gerar a venda.
create or replace function public.crm_comissao_descarb(p_from date, p_to date)
returns table (vendedor_id uuid, vendedor_name text, total numeric, qtd bigint)
language sql
stable
security definer
set search_path = public
as $$
  select o.vendedor_id,
         max(o.vendedor_name)                        as vendedor_name,
         coalesce(sum((it->>'total')::numeric), 0)   as total,
         count(*)                                    as qtd
  from public.carboze_orders o
  cross join lateral jsonb_array_elements(coalesce(o.items, '[]'::jsonb)) it
  where o.vendedor_id is not null
    and it->>'kind' = 'service'
    and o.status not in ('quote', 'cancelled')
    and coalesce(o.excluir_metricas, false) = false
    and coalesce(o.sale_date, o.created_at::date) between p_from and p_to
  group by o.vendedor_id;
$$;

grant execute on function public.crm_comissao_descarb(date, date) to authenticated;
