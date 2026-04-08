-- ============================================================
-- M14 — BOM Restructure
--
-- ANTES:
--   CARBOZE-100ML  → ESTABILIZADOR100 + INS-GARR-100ML + INS-ROT-CZ
--   CARBOPRO-100ML → ESTABILIZADOR100 + INS-GARR-100ML + INS-ROT-CP
--   ESTABILIZADOR100 → (sem sub-BOM)
--
-- DEPOIS:
--   ESTABILIZADOR100 → INS-GARR-100ML + INS-TAMPA-24 + INS-LIQ-CARBO
--   CARBOZE-100ML    → ESTABILIZADOR100 + INS-ROT-CZ
--   CARBOPRO-100ML   → ESTABILIZADOR100 + INS-ROT-CP
--   CARBOZE-1L       → ESTABILIZADOR100 (×10) + INS-GARR-1L  (sem alteração)
-- ============================================================

-- ── 1. NOVOS INSUMOS/EMBALAGENS ──────────────────────────────────────────────
INSERT INTO mrp_products (product_code, name, category, unit, stock_qty, min_stock_qty)
VALUES
  ('INS-TAMPA-24',  'Tampa Boca 24',  'Embalagem', 'un', 0, 500),
  ('INS-LIQ-CARBO', 'Líquido Carbo',  'Insumo',    'L',  0, 10),
  ('INS-ROT-CZ',    'Rótulo CarboZé', 'Embalagem', 'un', 0, 500)
ON CONFLICT (product_code) DO NOTHING;

-- ── 2. BOM DO ESTABILIZADOR 100ml ─────────────────────────────────────────────
-- Garrafa + Tampa + Líquido
INSERT INTO mrp_bom (product_id, insumo_id, quantity_per_unit, unit, is_critical, notes)

SELECT
  (SELECT id FROM mrp_products WHERE product_code = 'ESTABILIZADOR100'),
  (SELECT id FROM mrp_products WHERE product_code = 'INS-GARR-100ML'),
  1, 'un', true, 'Garrafa 100ml Boca 24'
WHERE EXISTS (SELECT 1 FROM mrp_products WHERE product_code = 'ESTABILIZADOR100')
  AND EXISTS (SELECT 1 FROM mrp_products WHERE product_code = 'INS-GARR-100ML')

UNION ALL SELECT
  (SELECT id FROM mrp_products WHERE product_code = 'ESTABILIZADOR100'),
  (SELECT id FROM mrp_products WHERE product_code = 'INS-TAMPA-24'),
  1, 'un', true, 'Tampa Boca 24'
WHERE EXISTS (SELECT 1 FROM mrp_products WHERE product_code = 'ESTABILIZADOR100')
  AND EXISTS (SELECT 1 FROM mrp_products WHERE product_code = 'INS-TAMPA-24')

UNION ALL SELECT
  (SELECT id FROM mrp_products WHERE product_code = 'ESTABILIZADOR100'),
  (SELECT id FROM mrp_products WHERE product_code = 'INS-LIQ-CARBO'),
  1, 'L', true, 'Líquido Carbo (concentrado)'
WHERE EXISTS (SELECT 1 FROM mrp_products WHERE product_code = 'ESTABILIZADOR100')
  AND EXISTS (SELECT 1 FROM mrp_products WHERE product_code = 'INS-LIQ-CARBO')

ON CONFLICT (product_id, insumo_id) DO NOTHING;

-- ── 3. REMOVER garrafa 100ml do BOM direto de CARBOZE-100ML e CARBOPRO-100ML ──
--    A garrafa agora está no sub-BOM do Estabilizador; não deve aparecer nos
--    produtos finais para evitar dupla contagem na explosão de BOM.
DELETE FROM mrp_bom
WHERE product_id = (SELECT id FROM mrp_products WHERE product_code = 'CARBOZE-100ML')
  AND insumo_id  = (SELECT id FROM mrp_products WHERE product_code = 'INS-GARR-100ML');

DELETE FROM mrp_bom
WHERE product_id = (SELECT id FROM mrp_products WHERE product_code = 'CARBOPRO-100ML')
  AND insumo_id  = (SELECT id FROM mrp_products WHERE product_code = 'INS-GARR-100ML');

-- ── 4. GARANTIR rótulos nos produtos finais (upsert seguro) ───────────────────
-- CarboZé 100ml → Rótulo CarboZé
INSERT INTO mrp_bom (product_id, insumo_id, quantity_per_unit, unit, is_critical, notes)
SELECT
  (SELECT id FROM mrp_products WHERE product_code = 'CARBOZE-100ML'),
  (SELECT id FROM mrp_products WHERE product_code = 'INS-ROT-CZ'),
  1, 'un', true, 'Rótulo CarboZé'
WHERE EXISTS (SELECT 1 FROM mrp_products WHERE product_code = 'CARBOZE-100ML')
  AND EXISTS (SELECT 1 FROM mrp_products WHERE product_code = 'INS-ROT-CZ')
ON CONFLICT (product_id, insumo_id) DO NOTHING;

-- CarboPRO 100ml → Rótulo CarboPRO (já deve existir; ON CONFLICT protege)
INSERT INTO mrp_bom (product_id, insumo_id, quantity_per_unit, unit, is_critical, notes)
SELECT
  (SELECT id FROM mrp_products WHERE product_code = 'CARBOPRO-100ML'),
  (SELECT id FROM mrp_products WHERE product_code = 'INS-ROT-CP'),
  1, 'un', true, 'Rótulo CarboPRO'
WHERE EXISTS (SELECT 1 FROM mrp_products WHERE product_code = 'CARBOPRO-100ML')
  AND EXISTS (SELECT 1 FROM mrp_products WHERE product_code = 'INS-ROT-CP')
ON CONFLICT (product_id, insumo_id) DO NOTHING;

-- ── 5. VERIFICAÇÃO FINAL ──────────────────────────────────────────────────────
SELECT
  p.product_code                              AS produto_code,
  p.name                                      AS produto_nome,
  i.product_code                              AS insumo_code,
  i.name                                      AS insumo_nome,
  b.quantity_per_unit                         AS qtd,
  b.unit,
  CASE WHEN b.is_critical THEN '✓' ELSE '' END AS critico
FROM mrp_bom b
JOIN mrp_products p ON p.id = b.product_id
JOIN mrp_products i ON i.id = b.insumo_id
WHERE p.product_code IN (
  'ESTABILIZADOR100',
  'CARBOZE-100ML',
  'CARBOPRO-100ML',
  'CARBOZE-1L'
)
ORDER BY p.product_code, i.product_code;
