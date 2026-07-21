-- Override manual da "Origem" exibida nos Dados Comerciais.
-- Hoje a Origem é DERIVADA de external_ref (bling-* = Bling; senão Manual).
-- Editar external_ref é arriscado (índice UNIQUE = dedup do webhook do Bling),
-- então guardamos um override separado. NULL = derivar de external_ref (padrão).

alter table public.carboze_orders
  add column if not exists origem_override text;

alter table public.carboze_orders
  drop constraint if exists carboze_orders_origem_override_check;

alter table public.carboze_orders
  add constraint carboze_orders_origem_override_check
  check (origem_override is null or origem_override in ('manual', 'bling'));

comment on column public.carboze_orders.origem_override is
  'Override manual da Origem exibida (manual/bling). NULL = derivar de external_ref. NÃO altera external_ref (preserva a dedup do Bling).';
