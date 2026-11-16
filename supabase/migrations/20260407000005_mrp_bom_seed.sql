-- ============================================================
-- Seed BOM — Produtos Finais CarboHub
-- Rodar APÓS 20260407_mrp_bom.sql
-- ============================================================

INSERT INTO mrp_bom (product_id, insumo_id, quantity_per_unit, unit, is_critical, notes)

-- === CARBOZE-100ML: Estabilizador 100ml ===
SELECT
  (SELECT id FROM mrp_products WHERE product_code = 'CARBOZE-100ML'),
  (SELECT id FROM mrp_products WHERE product_code = 'ESTABILIZADOR100'),
  1, 'un', true, 'Base estabilizadora 100ml'
WHERE EXISTS (SELECT 1 FROM mrp_products WHERE product_code = 'CARBOZE-100ML')
  AND EXISTS (SELECT 1 FROM mrp_products WHERE product_code = 'ESTABILIZADOR100')

-- === CARBOZE-100ML: Garrafa 100ml ===
UNION ALL SELECT
  (SELECT id FROM mrp_products WHERE product_code = 'CARBOZE-100ML'),
  (SELECT id FROM mrp_products WHERE product_code = 'INS-GARR-100ML'),
  1, 'un', true, 'Garrafa 100ml Boca 24'
WHERE EXISTS (SELECT 1 FROM mrp_products WHERE product_code = 'CARBOZE-100ML')
  AND EXISTS (SELECT 1 FROM mrp_products WHERE product_code = 'INS-GARR-100ML')

-- === CARBOPRO-100ML: Estabilizador 100ml ===
UNION ALL SELECT
  (SELECT id FROM mrp_products WHERE product_code = 'CARBOPRO-100ML'),
  (SELECT id FROM mrp_products WHERE product_code = 'ESTABILIZADOR100'),
  1, 'un', true, 'Base estabilizadora 100ml'
WHERE EXISTS (SELECT 1 FROM mrp_products WHERE product_code = 'CARBOPRO-100ML')
  AND EXISTS (SELECT 1 FROM mrp_products WHERE product_code = 'ESTABILIZADOR100')

-- === CARBOPRO-100ML: Garrafa 100ml ===
UNION ALL SELECT
  (SELECT id FROM mrp_products WHERE product_code = 'CARBOPRO-100ML'),
  (SELECT id FROM mrp_products WHERE product_code = 'INS-GARR-100ML'),
  1, 'un', true, 'Garrafa 100ml Boca 24'
WHERE EXISTS (SELECT 1 FROM mrp_products WHERE product_code = 'CARBOPRO-100ML')
  AND EXISTS (SELECT 1 FROM mrp_products WHERE product_code = 'INS-GARR-100ML')

-- === CARBOPRO-100ML: Rótulo CarboPRO ===
UNION ALL SELECT
  (SELECT id FROM mrp_products WHERE product_code = 'CARBOPRO-100ML'),
  (SELECT id FROM mrp_products WHERE product_code = 'INS-ROT-CP'),
  1, 'un', true, 'Rótulo CarboPRO'
WHERE EXISTS (SELECT 1 FROM mrp_products WHERE product_code = 'CARBOPRO-100ML')
  AND EXISTS (SELECT 1 FROM mrp_products WHERE product_code = 'INS-ROT-CP')

-- === CARBOZE-1L: Estabilizador 100ml (10 unidades = 1L) ===
UNION ALL SELECT
  (SELECT id FROM mrp_products WHERE product_code = 'CARBOZE-1L'),
  (SELECT id FROM mrp_products WHERE product_code = 'ESTABILIZADOR100'),
  10, 'un', true, '10x Estabilizador 100ml compõem 1L'
WHERE EXISTS (SELECT 1 FROM mrp_products WHERE product_code = 'CARBOZE-1L')
  AND EXISTS (SELECT 1 FROM mrp_products WHERE product_code = 'ESTABILIZADOR100')

-- === CARBOZE-1L: Garrafa 1L com Tampa ===
UNION ALL SELECT
  (SELECT id FROM mrp_products WHERE product_code = 'CARBOZE-1L'),
  (SELECT id FROM mrp_products WHERE product_code = 'INS-GARR-1L'),
  1, 'un', true, 'Garrafa 1L com Tampa'
WHERE EXISTS (SELECT 1 FROM mrp_products WHERE product_code = 'CARBOZE-1L')
  AND EXISTS (SELECT 1 FROM mrp_products WHERE product_code = 'INS-GARR-1L')

ON CONFLICT (product_id, insumo_id) DO NOTHING;
