-- Custo unitário do produto no catálogo MRP — base para calcular o valor
-- mobilizado em estoque (custo_unitario × estoque_total), usado no Carbo Ops
-- (captura no cadastro/edição) e espelhado read-only no Carbo Admin
-- (Dashboards → Estoque & Custos).

alter table public.mrp_products
  add column if not exists unit_cost numeric(12,2) not null default 0;

comment on column public.mrp_products.unit_cost is
  'Custo unitário do produto (R$). Base para o valor mobilizado em estoque (unit_cost × estoque em warehouse_stock). Editável em Carbo Ops (Produtos MRP); somente leitura no Carbo Admin.';

-- Mesma RLS já aberta a autenticado da mrp_products_ops_all (ver
-- 20260617040000_ops_catalog_rls.sql) cobre esta coluna — nada a mudar aqui.
