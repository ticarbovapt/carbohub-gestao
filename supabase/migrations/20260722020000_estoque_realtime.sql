-- ─────────────────────────────────────────────────────────────────────────────
-- Realtime de estoque — a tela /suprimentos (e afins) do Carbo Ops precisa
-- refletir AO VIVO quando outro usuário mexe no estoque, seja por produção
-- (baixa de OP) ou alteração manual, sem depender de F5.
--
-- Adiciona as tabelas-fonte à publicação supabase_realtime (idempotente). O
-- front assina postgres_changes nessas tabelas e invalida o cache do react-query
-- (ver apps/ops/src/hooks/useStock.ts → useStockLive).
--   • warehouse_stock  = saldo por hub (fonte de verdade)
--   • stock_movements  = entradas/saídas
--   • stock_transfers  = remessas entre hubs
--   • ops_stock_min    = política de mínimo por hub
--   • mrp_products     = catálogo/custo/mínimo global
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'warehouse_stock', 'stock_movements', 'stock_transfers', 'ops_stock_min', 'mrp_products'
  ] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;
