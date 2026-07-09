-- ─────────────────────────────────────────────────────────────────────────────
-- Flag "Produzido" no pedido do pós-venda.
-- Quando a OP vinculada (source_order_id) é CONCLUÍDA no kanban de produção, o
-- pedido recebe production_done = true. O card NÃO se move sozinho — mostra o
-- selo "Produzido" em "Criar Ordem de Produção" e alguém move para "Em Separação".
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.carboze_orders
  ADD COLUMN IF NOT EXISTS production_done boolean NOT NULL DEFAULT false;
