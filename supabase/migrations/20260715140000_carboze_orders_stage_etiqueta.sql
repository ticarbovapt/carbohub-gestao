-- ─────────────────────────────────────────────────────────────────────────────
-- Pós-venda: nova etapa "Emitir Etiqueta" ENTRE "NF Finalizada" e "Em Transporte".
-- É onde o operador gera a etiqueta de transporte (PDF 10×15 cm, uma por volume)
-- antes de despachar. Apenas amplia o CHECK de fulfillment_stage.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.carboze_orders
  DROP CONSTRAINT IF EXISTS carboze_orders_fulfillment_stage_check;

ALTER TABLE public.carboze_orders
  ADD CONSTRAINT carboze_orders_fulfillment_stage_check
  CHECK (fulfillment_stage IN (
    'nova_venda', 'separacao_pendente', 'criar_op', 'separando', 'separado',
    'gerar_nf', 'nf_finalizada', 'emitir_etiqueta',
    'em_transporte', 'entregue', 'cancelado'
  ));

NOTIFY pgrst, 'reload schema';
