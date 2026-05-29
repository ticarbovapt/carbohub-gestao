-- Add sale_date: separates "when the sale happened" from "when it was registered"
-- NULL = use created_at as fallback (fully retrocompatible)
ALTER TABLE public.carboze_orders
  ADD COLUMN IF NOT EXISTS sale_date date,
  ADD COLUMN IF NOT EXISTS nf_access_key text,
  ADD COLUMN IF NOT EXISTS bling_nf_id bigint;

COMMENT ON COLUMN public.carboze_orders.sale_date IS
  'Actual date of the sale. When set by a head/command member, overrides created_at for meta calculations.';
COMMENT ON COLUMN public.carboze_orders.nf_access_key IS
  '44-digit NF-e access key from Bling, linked via order_number in NF observation field.';
COMMENT ON COLUMN public.carboze_orders.bling_nf_id IS
  'Bling internal NF ID, used for direct API queries and automatic NF↔order matching.';
