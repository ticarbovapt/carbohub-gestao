-- ─────────────────────────────────────────────────────────────────────────────
-- Carbo Ops — abre purchase_receivings (Recebimento) removendo travas legadas.
-- Aberto a autenticado por ora (Recebimento → NF → Contas a Pagar).
-- ─────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Receiving viewable by authorized" ON public.purchase_receivings;
DROP POLICY IF EXISTS "Receiving insertable by gestors"  ON public.purchase_receivings;
DROP POLICY IF EXISTS "Receiving updatable by gestors"   ON public.purchase_receivings;
DROP POLICY IF EXISTS "Receiving deletable by admin"     ON public.purchase_receivings;
DROP POLICY IF EXISTS purchase_receivings_ops_all        ON public.purchase_receivings;
CREATE POLICY purchase_receivings_ops_all ON public.purchase_receivings
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
