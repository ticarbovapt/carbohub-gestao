-- ─────────────────────────────────────────────────────────────────────────────
-- Separação (Pós-venda/Logística): volumes e peso bruto informados ao mover o
-- card para "Separado". Ficam no próprio pedido (o "card") e serão usados na
-- emissão da etiqueta de transporte. Colunas aditivas, nullable.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.carboze_orders
  ADD COLUMN IF NOT EXISTS shipment_volumes    integer,
  ADD COLUMN IF NOT EXISTS shipment_weight_kg  numeric(10,3);

COMMENT ON COLUMN public.carboze_orders.shipment_volumes   IS 'Qtd de volumes da remessa (informado na separação; usado na etiqueta).';
COMMENT ON COLUMN public.carboze_orders.shipment_weight_kg IS 'Peso bruto em kg da remessa (informado na separação; usado na etiqueta).';

NOTIFY pgrst, 'reload schema';
