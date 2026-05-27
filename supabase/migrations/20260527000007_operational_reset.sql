-- ============================================================
-- RESET OPERACIONAL — limpeza total para entrada em produção
-- ============================================================
-- Remove todos os dados operacionais de teste sem tocar em
-- cadastros de configuração (SKUs, BOM, produtos, armazéns,
-- políticas de estoque, usuários, etc.).
--
-- Ordem garantida para respeitar FKs:
--   1. production_orders  (cascade → production_confirmation →
--                           production_confirmation_item,
--                           production_order_material)
--   2. inventory_lot      (cascade → inventory_lot_consumption)
--   3. stock_movements
--   4. stock_transfers
--   5. warehouse_stock    (DELETE rows — código insere na primeira entrada)
--   6. mrp_products       (zera current_stock_qty legado)
--   7. flow_audit_logs    (logs dos ajustes de teste)
-- ============================================================

-- 1. Ordens de produção (cascades para confirmation, confirmation_item, order_material)
DELETE FROM public.production_orders;

-- 2. Lotes de inventário (cascades para inventory_lot_consumption)
DELETE FROM public.inventory_lot;

-- 3. Movimentos de estoque (entradas / saídas / ajustes de teste)
DELETE FROM public.stock_movements;

-- 4. Transferências entre hubs
DELETE FROM public.stock_transfers;

-- 5. Estoque por hub — apaga todas as linhas; nova entrada via UI cria row limpa
DELETE FROM public.warehouse_stock;

-- 6. Campo legado de estoque global (fonte de verdade é warehouse_stock agora)
UPDATE public.mrp_products
SET current_stock_qty = 0,
    stock_updated_at  = CURRENT_DATE
WHERE current_stock_qty <> 0;

-- 7. Logs de auditoria gerados durante os testes
DELETE FROM public.flow_audit_logs;
