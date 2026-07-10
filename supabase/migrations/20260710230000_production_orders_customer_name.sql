-- Nome do cliente/empresa da OP criada manualmente (venda/recorrência de fora do
-- sistema). OPs vindas do pós-venda já resolvem o cliente pelo source_order_id;
-- esta coluna cobre as OPs manuais, pra padronizar a identificação no card.
ALTER TABLE public.production_orders
  ADD COLUMN IF NOT EXISTS customer_name text;
