-- ─────────────────────────────────────────────────────────────────────────────
-- Vínculo OP ↔ pedido do pós-venda.
-- Quando um pedido (carboze_orders) sem estoque vai para "Criar Ordem de Produção",
-- nasce uma OP em production_orders com source_order_id = id do pedido. Isso permite:
--   • não duplicar OP para o mesmo pedido;
--   • a produção "conversar" de volta com o pós-venda (ao confirmar a OP, o card do
--     pedido avança de "Criar Ordem de Produção" para "Em Separação").
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.production_orders
  ADD COLUMN IF NOT EXISTS source_order_id uuid
    REFERENCES public.carboze_orders(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_production_orders_source_order
  ON public.production_orders(source_order_id);
