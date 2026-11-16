-- ============================================================
-- M13 — Seed MRP Products + BOM (Produtos Finais CarboHub)
-- Rodar no Supabase SQL Editor
-- Seguro para rodar múltiplas vezes (ON CONFLICT DO NOTHING)
-- ============================================================

-- ── 1. PRODUTOS FINAIS ────────────────────────────────────────
INSERT INTO mrp_products (product_code, name, category, packaging_size_ml, notes, is_active)
VALUES
  ('CARBOZE-100ML',  'CarboZé 100ml',   'Produto Final', 100,  'Estabilizador de combustão para carros flex — frasco 100ml',  true),
  ('CARBOPRO-100ML', 'CarboPRO 100ml',  'Produto Final', 100,  'Estabilizador premium com rótulo CarboPRO — frasco 100ml',    true),
  ('CARBOZE-1L',     'CarboZé 1L',      'Produto Final', 1000, 'Estabilizador de combustão para carros flex — frasco 1L',     true)
ON CONFLICT (product_code) DO NOTHING;

-- ── 2. INSUMOS ────────────────────────────────────────────────
INSERT INTO mrp_products (product_code, name, category, packaging_size_ml, notes, is_active)
VALUES
  ('ESTABILIZADOR100', 'Estabilizador Base 100ml', 'Insumo', 100, 'Base química estabilizadora — unidade de 100ml', true)
ON CONFLICT (product_code) DO NOTHING;

-- ── 3. EMBALAGENS ─────────────────────────────────────────────
INSERT INTO mrp_products (product_code, name, category, notes, is_active)
VALUES
  ('INS-GARR-100ML', 'Garrafa 100ml Boca 24',  'Embalagem', 'Frasco plástico 100ml boca 24mm',          true),
  ('INS-GARR-1L',    'Garrafa 1L com Tampa',    'Embalagem', 'Frasco plástico 1L com tampa rosca',       true),
  ('INS-ROT-CP',     'Rótulo CarboPRO',         'Embalagem', 'Rótulo adesivo para frasco CarboPRO 100ml', true)
ON CONFLICT (product_code) DO NOTHING;

-- ── 4. BOM — pré-popular após produtos inseridos ──────────────
INSERT INTO mrp_bom (product_id, insumo_id, quantity_per_unit, unit, is_critical, notes)

-- CARBOZE-100ML ← Estabilizador
SELECT
  (SELECT id FROM mrp_products WHERE product_code = 'CARBOZE-100ML'),
  (SELECT id FROM mrp_products WHERE product_code = 'ESTABILIZADOR100'),
  1, 'un', true, 'Base estabilizadora 100ml'
WHERE EXISTS (SELECT 1 FROM mrp_products WHERE product_code = 'CARBOZE-100ML')
  AND EXISTS (SELECT 1 FROM mrp_products WHERE product_code = 'ESTABILIZADOR100')

-- CARBOZE-100ML ← Garrafa 100ml
UNION ALL SELECT
  (SELECT id FROM mrp_products WHERE product_code = 'CARBOZE-100ML'),
  (SELECT id FROM mrp_products WHERE product_code = 'INS-GARR-100ML'),
  1, 'un', true, 'Garrafa 100ml Boca 24'
WHERE EXISTS (SELECT 1 FROM mrp_products WHERE product_code = 'CARBOZE-100ML')
  AND EXISTS (SELECT 1 FROM mrp_products WHERE product_code = 'INS-GARR-100ML')

-- CARBOPRO-100ML ← Estabilizador
UNION ALL SELECT
  (SELECT id FROM mrp_products WHERE product_code = 'CARBOPRO-100ML'),
  (SELECT id FROM mrp_products WHERE product_code = 'ESTABILIZADOR100'),
  1, 'un', true, 'Base estabilizadora 100ml'
WHERE EXISTS (SELECT 1 FROM mrp_products WHERE product_code = 'CARBOPRO-100ML')
  AND EXISTS (SELECT 1 FROM mrp_products WHERE product_code = 'ESTABILIZADOR100')

-- CARBOPRO-100ML ← Garrafa 100ml
UNION ALL SELECT
  (SELECT id FROM mrp_products WHERE product_code = 'CARBOPRO-100ML'),
  (SELECT id FROM mrp_products WHERE product_code = 'INS-GARR-100ML'),
  1, 'un', true, 'Garrafa 100ml Boca 24'
WHERE EXISTS (SELECT 1 FROM mrp_products WHERE product_code = 'CARBOPRO-100ML')
  AND EXISTS (SELECT 1 FROM mrp_products WHERE product_code = 'INS-GARR-100ML')

-- CARBOPRO-100ML ← Rótulo
UNION ALL SELECT
  (SELECT id FROM mrp_products WHERE product_code = 'CARBOPRO-100ML'),
  (SELECT id FROM mrp_products WHERE product_code = 'INS-ROT-CP'),
  1, 'un', true, 'Rótulo CarboPRO'
WHERE EXISTS (SELECT 1 FROM mrp_products WHERE product_code = 'CARBOPRO-100ML')
  AND EXISTS (SELECT 1 FROM mrp_products WHERE product_code = 'INS-ROT-CP')

-- CARBOZE-1L ← Estabilizador x10
UNION ALL SELECT
  (SELECT id FROM mrp_products WHERE product_code = 'CARBOZE-1L'),
  (SELECT id FROM mrp_products WHERE product_code = 'ESTABILIZADOR100'),
  10, 'un', true, '10x Estabilizador 100ml compõem 1L'
WHERE EXISTS (SELECT 1 FROM mrp_products WHERE product_code = 'CARBOZE-1L')
  AND EXISTS (SELECT 1 FROM mrp_products WHERE product_code = 'ESTABILIZADOR100')

-- CARBOZE-1L ← Garrafa 1L
UNION ALL SELECT
  (SELECT id FROM mrp_products WHERE product_code = 'CARBOZE-1L'),
  (SELECT id FROM mrp_products WHERE product_code = 'INS-GARR-1L'),
  1, 'un', true, 'Garrafa 1L com Tampa'
WHERE EXISTS (SELECT 1 FROM mrp_products WHERE product_code = 'CARBOZE-1L')
  AND EXISTS (SELECT 1 FROM mrp_products WHERE product_code = 'INS-GARR-1L')

ON CONFLICT (product_id, insumo_id) DO NOTHING;

-- ── Verificação ───────────────────────────────────────────────
SELECT
  p.product_code,
  p.name,
  p.category,
  COUNT(b.id) AS bom_lines
FROM mrp_products p
LEFT JOIN mrp_bom b ON b.product_id = p.id
WHERE p.product_code IN ('CARBOZE-100ML','CARBOPRO-100ML','CARBOZE-1L',
                          'ESTABILIZADOR100','INS-GARR-100ML','INS-GARR-1L','INS-ROT-CP')
GROUP BY p.product_code, p.name, p.category
ORDER BY p.category DESC, p.product_code;
