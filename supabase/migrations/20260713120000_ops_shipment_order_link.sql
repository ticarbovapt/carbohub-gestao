-- Liga a remessa (ops_shipments) ao pedido (carboze_orders) por FK, para o Ops
-- criar a remessa automaticamente ao separar — sem redigitar cliente/destino/itens.
-- Índice único parcial garante 1 remessa por pedido (idempotência do auto-create).

ALTER TABLE public.ops_shipments
  ADD COLUMN IF NOT EXISTS order_id uuid REFERENCES public.carboze_orders(id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_ops_shipments_order_id
  ON public.ops_shipments(order_id) WHERE order_id IS NOT NULL;
