-- ============================================================
-- SEEDS: 4 SKUs finais + BOMs ativas
-- PRD: carboops_prd_arquitetura_processo.md
-- ============================================================

-- Ensure mrp_products for insumos exist (idempotent)
INSERT INTO public.mrp_products (id, product_code, name, category, is_active, safety_stock_qty, current_stock_qty)
VALUES
  ('a0000001-0001-0001-0001-000000000001', 'INS-GARR-100ML', 'Garrafa 100ml Boca 24', 'insumo', true, 500, 0),
  ('a0000001-0001-0001-0001-000000000002', 'INS-TAMPA-B24', 'Tampa Boca 24', 'insumo', true, 500, 0),
  ('a0000001-0001-0001-0001-000000000003', 'INS-ROT-CZ', 'Rótulo CarboZé', 'insumo', true, 500, 0),
  ('a0000001-0001-0001-0001-000000000004', 'INS-ROT-CP', 'Rótulo CarboPRO', 'insumo', true, 500, 0),
  ('a0000001-0001-0001-0001-000000000005', 'INS-LIQ-CARBO', 'Líquido CARBO (ml)', 'insumo', true, 200000, 0),
  ('a0000001-0001-0001-0001-000000000006', 'INS-GARR-1L', 'Garrafa 1L com Tampa', 'insumo', true, 200, 0),
  ('a0000001-0001-0001-0001-000000000007', 'INS-ROT-CZ1L', 'Rótulo CarboZé 1 Litro', 'insumo', true, 200, 0),
  ('a0000001-0001-0001-0001-000000000008', 'INS-GARR-REAG', 'Garrafa Reagente Branca com Tampa', 'insumo', true, 300, 0),
  ('a0000001-0001-0001-0001-000000000009', 'INS-ROT-VAPT', 'Rótulo Reagente CarboVapt', 'insumo', true, 300, 0)
ON CONFLICT (product_code) DO NOTHING;

-- SKU 1: CarboZé 100ml
INSERT INTO public.sku (id, code, name, description, category, unit, packaging_ml, safety_stock_qty, target_coverage_days)
VALUES (
  'b0000001-0001-0001-0001-000000000001',
  'SKU-CZ100', 'CarboZé 100ml',
  'Garrafa 100ml de líquido CARBO com rótulo CarboZé',
  'produto_final', 'un', 100, 100, 30
) ON CONFLICT (code) DO NOTHING;

-- SKU 2: CarboPRO 100ml
INSERT INTO public.sku (id, code, name, description, category, unit, packaging_ml, safety_stock_qty, target_coverage_days)
VALUES (
  'b0000001-0001-0001-0001-000000000002',
  'SKU-CP100', 'CarboPRO 100ml',
  'Garrafa 100ml de líquido CARBO com rótulo CarboPRO',
  'produto_final', 'un', 100, 100, 30
) ON CONFLICT (code) DO NOTHING;

-- SKU 3: CarboZé 1L
INSERT INTO public.sku (id, code, name, description, category, unit, packaging_ml, safety_stock_qty, target_coverage_days)
VALUES (
  'b0000001-0001-0001-0001-000000000003',
  'SKU-CZ1L', 'CarboZé 1 Litro',
  'Garrafa 1L de líquido CARBO com rótulo CarboZé 1 Litro',
  'produto_final', 'un', 1000, 50, 30
) ON CONFLICT (code) DO NOTHING;

-- SKU 4: Reagente CarboVapt 70ml
INSERT INTO public.sku (id, code, name, description, category, unit, packaging_ml, safety_stock_qty, target_coverage_days)
VALUES (
  'b0000001-0001-0001-0001-000000000004',
  'SKU-VAPT70', 'Reagente CarboVapt 70ml',
  'Garrafa reagente branca 70ml de líquido CARBO com rótulo CarboVapt',
  'produto_final', 'un', 70, 80, 30
) ON CONFLICT (code) DO NOTHING;

-- ============================================================
-- BOMs ativas (versão 1)
-- ============================================================

-- BOM: CarboZé 100ml
INSERT INTO public.sku_bom (id, sku_id, version, is_active, items)
VALUES (
  'c0000001-0001-0001-0001-000000000001',
  'b0000001-0001-0001-0001-000000000001', 1, true,
  '[
    {"product_id":"a0000001-0001-0001-0001-000000000001","quantity_per_unit":1,"unit":"un","is_critical":true,"name":"Garrafa 100ml Boca 24"},
    {"product_id":"a0000001-0001-0001-0001-000000000002","quantity_per_unit":1,"unit":"un","is_critical":true,"name":"Tampa Boca 24"},
    {"product_id":"a0000001-0001-0001-0001-000000000003","quantity_per_unit":1,"unit":"un","is_critical":true,"name":"Rótulo CarboZé"},
    {"product_id":"a0000001-0001-0001-0001-000000000005","quantity_per_unit":100,"unit":"ml","is_critical":true,"name":"Líquido CARBO"}
  ]'::jsonb
) ON CONFLICT (sku_id, version) DO NOTHING;

-- BOM: CarboPRO 100ml
INSERT INTO public.sku_bom (id, sku_id, version, is_active, items)
VALUES (
  'c0000001-0001-0001-0001-000000000002',
  'b0000001-0001-0001-0001-000000000002', 1, true,
  '[
    {"product_id":"a0000001-0001-0001-0001-000000000001","quantity_per_unit":1,"unit":"un","is_critical":true,"name":"Garrafa 100ml Boca 24"},
    {"product_id":"a0000001-0001-0001-0001-000000000002","quantity_per_unit":1,"unit":"un","is_critical":true,"name":"Tampa Boca 24"},
    {"product_id":"a0000001-0001-0001-0001-000000000004","quantity_per_unit":1,"unit":"un","is_critical":true,"name":"Rótulo CarboPRO"},
    {"product_id":"a0000001-0001-0001-0001-000000000005","quantity_per_unit":100,"unit":"ml","is_critical":true,"name":"Líquido CARBO"}
  ]'::jsonb
) ON CONFLICT (sku_id, version) DO NOTHING;

-- BOM: CarboZé 1L
INSERT INTO public.sku_bom (id, sku_id, version, is_active, items)
VALUES (
  'c0000001-0001-0001-0001-000000000003',
  'b0000001-0001-0001-0001-000000000003', 1, true,
  '[
    {"product_id":"a0000001-0001-0001-0001-000000000006","quantity_per_unit":1,"unit":"un","is_critical":true,"name":"Garrafa 1L com Tampa"},
    {"product_id":"a0000001-0001-0001-0001-000000000007","quantity_per_unit":1,"unit":"un","is_critical":true,"name":"Rótulo CarboZé 1 Litro"},
    {"product_id":"a0000001-0001-0001-0001-000000000005","quantity_per_unit":1000,"unit":"ml","is_critical":true,"name":"Líquido CARBO"}
  ]'::jsonb
) ON CONFLICT (sku_id, version) DO NOTHING;

-- BOM: Reagente CarboVapt 70ml
INSERT INTO public.sku_bom (id, sku_id, version, is_active, items)
VALUES (
  'c0000001-0001-0001-0001-000000000004',
  'b0000001-0001-0001-0001-000000000004', 1, true,
  '[
    {"product_id":"a0000001-0001-0001-0001-000000000008","quantity_per_unit":1,"unit":"un","is_critical":true,"name":"Garrafa Reagente Branca com Tampa"},
    {"product_id":"a0000001-0001-0001-0001-000000000009","quantity_per_unit":1,"unit":"un","is_critical":true,"name":"Rótulo Reagente CarboVapt"},
    {"product_id":"a0000001-0001-0001-0001-000000000005","quantity_per_unit":70,"unit":"ml","is_critical":true,"name":"Líquido CARBO"}
  ]'::jsonb
) ON CONFLICT (sku_id, version) DO NOTHING;

-- ============================================================
-- Replenishment policies for key insumos
-- ============================================================

INSERT INTO public.replenishment_policy (product_id, safety_stock_qty, min_coverage_days, lead_time_days, weekly_capacity)
VALUES
  ('a0000001-0001-0001-0001-000000000001', 500, 30, 30, 5000),  -- Garrafas 100ml
  ('a0000001-0001-0001-0001-000000000002', 500, 30, 30, 5000),  -- Tampas
  ('a0000001-0001-0001-0001-000000000003', 500, 30, 30, NULL),  -- Rótulos CZ
  ('a0000001-0001-0001-0001-000000000004', 500, 30, 30, NULL),  -- Rótulos CP
  ('a0000001-0001-0001-0001-000000000005', 200000, 15, 15, 200000),  -- Líquido CARBO (ml)
  ('a0000001-0001-0001-0001-000000000006', 200, 30, 30, NULL),  -- Garrafas 1L
  ('a0000001-0001-0001-0001-000000000007', 200, 30, 30, NULL),  -- Rótulos CZ 1L
  ('a0000001-0001-0001-0001-000000000008', 300, 30, 30, NULL),  -- Garrafas reagente
  ('a0000001-0001-0001-0001-000000000009', 300, 30, 30, NULL)   -- Rótulos CarboVapt
ON CONFLICT (product_id) DO NOTHING;
