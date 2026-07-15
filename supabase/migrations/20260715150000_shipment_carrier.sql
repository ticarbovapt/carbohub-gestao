-- ─────────────────────────────────────────────────────────────────────────────
-- Expedição: transportadora que fará o envio. Informada ao mover o card de
-- "Separado" para "Gerar Nota Fiscal" (junto de volumes/peso) e impressa na
-- etiqueta. Coluna aditiva, nullable.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.carboze_orders
  ADD COLUMN IF NOT EXISTS shipment_carrier text;

COMMENT ON COLUMN public.carboze_orders.shipment_carrier IS 'Transportadora do envio (informada na expedição; aparece na etiqueta).';

NOTIFY pgrst, 'reload schema';
