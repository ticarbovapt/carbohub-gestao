-- Adiciona 'online' (vendas On-line) à segmentação de carboze_orders.
-- Valores: consumo = B2B, revenda = Ponto de Venda (PDV), online = On-line. NULL = não classificado.

ALTER TABLE public.carboze_orders
  DROP CONSTRAINT IF EXISTS carboze_orders_segmento_check;

ALTER TABLE public.carboze_orders
  ADD CONSTRAINT carboze_orders_segmento_check
  CHECK (segmento IN ('consumo', 'revenda', 'online'));

COMMENT ON COLUMN public.carboze_orders.segmento IS
  'Segmentação da venda: consumo = B2B, revenda = Ponto de Venda (PDV), online = venda On-line. NULL = não classificado.';
