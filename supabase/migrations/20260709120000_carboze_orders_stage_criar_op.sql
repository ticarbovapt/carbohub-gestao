-- ─────────────────────────────────────────────────────────────────────────────
-- Pós-venda (Carbo Ops): novo estágio "criar_op" entre "Pedido Recebido"
-- (separacao_pendente) e "Em Separação" (separando).
-- Fluxo: quando o pedido chega e o produto NÃO tem em estoque, ele vai para
-- "Criar Ordem de Produção" (criar_op) — de onde nasce uma OP em production_orders.
-- Se tem estoque, segue direto para "Em Separação".
-- Só ajusta o CHECK (a coluna já existe). Rótulos ("Pedido Recebido") são no front.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.carboze_orders
  DROP CONSTRAINT IF EXISTS carboze_orders_fulfillment_stage_check;

ALTER TABLE public.carboze_orders
  ADD CONSTRAINT carboze_orders_fulfillment_stage_check
  CHECK (fulfillment_stage IN (
    'nova_venda', 'separacao_pendente', 'criar_op', 'separando', 'separado',
    'em_transporte', 'entregue', 'cancelado'
  ));
