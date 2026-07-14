-- Excluir uma venda (carboze_orders) falhava quando ela já tinha gerado um
-- embarque (ops_shipments) — a FK ops_shipments.order_id não tinha regra
-- ON DELETE, então o Postgres bloqueava (violates foreign key constraint
-- "ops_shipments_order_id_fkey"). Um embarque só existe por causa do pedido:
-- se o pedido é apagado, o embarque também deve ir. ON DELETE CASCADE.

ALTER TABLE public.ops_shipments
  DROP CONSTRAINT IF EXISTS ops_shipments_order_id_fkey;

ALTER TABLE public.ops_shipments
  ADD CONSTRAINT ops_shipments_order_id_fkey
  FOREIGN KEY (order_id) REFERENCES public.carboze_orders(id) ON DELETE CASCADE;
