-- Zero out the legacy current_stock_qty field.
-- warehouse_stock (per-hub) is now the single source of truth for all stock displays.
-- current_stock_qty was a global total that no longer matches what is shown in the UI,
-- causing "ghost numbers" in the edit popup when no warehouse_stock row existed yet.
--
-- After this migration users can enter correct per-hub counts from a clean 0 baseline.
-- NOTE: OP confirmations now credit warehouse_stock directly, so finished goods
-- credited by recent OPs are already in warehouse_stock and are unaffected.

UPDATE mrp_products
SET
  current_stock_qty = 0,
  stock_updated_at  = CURRENT_DATE
WHERE current_stock_qty <> 0;
