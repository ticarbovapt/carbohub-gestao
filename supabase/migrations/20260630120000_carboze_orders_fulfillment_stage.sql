-- ─────────────────────────────────────────────────────────────────────────────
-- Pós-venda: jornada de cada venda (carboze_orders) no kanban operacional.
-- Estágios: nova_venda → separacao_pendente → separando → separado →
--           em_transporte → entregue (+ cancelado).
-- Vendas manuais (Carbo Sales/Ops) nascem em 'nova_venda'. Os pedidos já
-- existentes recebem um estágio coerente com o status atual (backfill).
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.carboze_orders
  ADD COLUMN IF NOT EXISTS fulfillment_stage text NOT NULL DEFAULT 'nova_venda'
    CHECK (fulfillment_stage IN (
      'nova_venda', 'separacao_pendente', 'separando', 'separado',
      'em_transporte', 'entregue', 'cancelado'
    ));

-- Backfill: mapeia o status atual para um estágio coerente (só uma vez).
UPDATE public.carboze_orders SET fulfillment_stage =
  CASE status
    WHEN 'delivered' THEN 'entregue'
    WHEN 'shipped'   THEN 'em_transporte'
    WHEN 'invoiced'  THEN 'separado'
    WHEN 'confirmed' THEN 'separacao_pendente'
    WHEN 'cancelled' THEN 'cancelado'
    ELSE 'nova_venda'
  END
WHERE fulfillment_stage = 'nova_venda';

CREATE INDEX IF NOT EXISTS idx_carboze_orders_fulfillment
  ON public.carboze_orders(fulfillment_stage);
