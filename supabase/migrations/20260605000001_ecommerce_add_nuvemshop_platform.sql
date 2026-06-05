-- Permite que pedidos da Nuvemshop sejam gravados em ecommerce_orders.
-- O CHECK original só aceitava mercadolivre/amazon/tiktok/shopee; sem isto,
-- a sincronização da Nuvemshop seria rejeitada pelo banco.
-- A dedução de estoque (trigger handle_ecommerce_order_sp_stock) já é
-- agnóstica de plataforma — passa a valer para a Nuvemshop automaticamente.

ALTER TABLE ecommerce_orders
  DROP CONSTRAINT IF EXISTS ecommerce_orders_platform_check;

ALTER TABLE ecommerce_orders
  ADD CONSTRAINT ecommerce_orders_platform_check
  CHECK (platform IN ('mercadolivre', 'amazon', 'tiktok', 'shopee', 'nuvemshop'));
