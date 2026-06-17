-- ─────────────────────────────────────────────────────────────────────────────
-- Carbo Ops — limpa as travas do controle em stock_transfers e abre a RLS
-- (mesmo padrão do estoque). Por ora aberto a qualquer autenticado; restringe a
-- gestor depois (carbo_is_gestor já existe).
-- ─────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Employees can create transfers"     ON public.stock_transfers;
DROP POLICY IF EXISTS "Employees can update transfers"     ON public.stock_transfers;
DROP POLICY IF EXISTS "Admins can create transfers"        ON public.stock_transfers;
DROP POLICY IF EXISTS "Admins can update transfers"        ON public.stock_transfers;
DROP POLICY IF EXISTS "Transfers viewable by authenticated" ON public.stock_transfers;
DROP POLICY IF EXISTS "Transfers viewable by employees"    ON public.stock_transfers;
DROP POLICY IF EXISTS "Stock transfers viewable by authorized" ON public.stock_transfers;
DROP POLICY IF EXISTS stock_transfers_ops_all              ON public.stock_transfers;

CREATE POLICY stock_transfers_ops_all ON public.stock_transfers
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);
