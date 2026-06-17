-- ─────────────────────────────────────────────────────────────────────────────
-- Backfill: preenche warehouse_id em stock_movements antigos (que ficaram NULL)
-- inferindo o hub pela observação. Idempotente — só toca em linhas sem hub.
-- A partir de agora o Ops grava warehouse_id em toda movimentação.
-- ─────────────────────────────────────────────────────────────────────────────

UPDATE public.stock_movements sm SET warehouse_id = w.id
FROM public.warehouses w
WHERE sm.warehouse_id IS NULL AND w.code = 'HUB-SP-VENDAS'
  AND sm.observacoes ILIKE '%CD SP Vendas%';

UPDATE public.stock_movements sm SET warehouse_id = w.id
FROM public.warehouses w
WHERE sm.warehouse_id IS NULL AND w.code = 'HUB-SP'
  AND (sm.observacoes ILIKE '%LogHouse%' OR sm.observacoes ILIKE '%Loghouse%' OR sm.observacoes ILIKE '%HUB-SP%');

UPDATE public.stock_movements sm SET warehouse_id = w.id
FROM public.warehouses w
WHERE sm.warehouse_id IS NULL AND w.code = 'HUB-RN'
  AND (sm.observacoes ILIKE '%HUB-RN%' OR sm.observacoes ILIKE '%Hub Natal%');
