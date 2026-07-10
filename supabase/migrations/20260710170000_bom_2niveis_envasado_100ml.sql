-- ─────────────────────────────────────────────────────────────────────────────
-- BOM em 2 níveis para o 100ml (base do fluxo "só rotular").
--   • "Embalagem 100 mL com líq. Carbo" (EMB-LIQ100ML) vira SEMI-ACABADO (envasado
--     sem rótulo) com ficha própria: garrafa + líquido + tampa.
--   • CarboZé e CarboPRO passam a consumir 1 Envasado + 1 Rótulo (deixam de listar
--     garrafa/líquido/tampa diretamente — isso agora está dentro do Envasado).
-- Idempotente: apaga as fichas dos 3 produtos e reinsere o alvo.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- 1) Envasado vira Semi-acabado
UPDATE public.mrp_products
SET category = 'Semi-acabado', updated_at = now()
WHERE id = '5cf2c016-9ff3-46d5-946c-29a6780021b3';  -- EMB-LIQ100ML

-- 2) Limpa as fichas dos 3 produtos que vamos remontar
DELETE FROM public.mrp_bom
WHERE product_id IN (
  '5cf2c016-9ff3-46d5-946c-29a6780021b3', -- EMB-LIQ100ML (Envasado)
  '975db4da-3207-457a-af9c-47294e945982', -- CZ100  (CarboZé)
  '641e021d-3f9a-405b-9bd0-28abed382c7b'  -- CP100  (CarboPRO)
);

-- 3) Envasado 100ml (Semi-acabado) = garrafa + líquido + tampa
INSERT INTO public.mrp_bom (product_id, insumo_id, quantity_per_unit, unit, is_critical) VALUES
  ('5cf2c016-9ff3-46d5-946c-29a6780021b3','a0000001-0001-0001-0001-000000000001',  1, 'un', true),  -- Garrafa 100ml Boca 24
  ('5cf2c016-9ff3-46d5-946c-29a6780021b3','a0000001-0001-0001-0001-000000000005',100, 'ml', true),  -- Líquido CARBO
  ('5cf2c016-9ff3-46d5-946c-29a6780021b3','a0000001-0001-0001-0001-000000000002',  1, 'un', true);  -- Tampa Boca 24

-- 4) CarboZé 100ml = 1 Envasado + 1 Rótulo CarboZé
INSERT INTO public.mrp_bom (product_id, insumo_id, quantity_per_unit, unit, is_critical) VALUES
  ('975db4da-3207-457a-af9c-47294e945982','5cf2c016-9ff3-46d5-946c-29a6780021b3', 1, 'un', true),  -- Envasado 100ml
  ('975db4da-3207-457a-af9c-47294e945982','a0000001-0001-0001-0001-000000000003', 1, 'un', true);  -- Rótulo CarboZé

-- 5) CarboPRO 100ml = 1 Envasado + 1 Rótulo CarboPRO
INSERT INTO public.mrp_bom (product_id, insumo_id, quantity_per_unit, unit, is_critical) VALUES
  ('641e021d-3f9a-405b-9bd0-28abed382c7b','5cf2c016-9ff3-46d5-946c-29a6780021b3', 1, 'un', true),  -- Envasado 100ml
  ('641e021d-3f9a-405b-9bd0-28abed382c7b','a0000001-0001-0001-0001-000000000004', 1, 'un', false); -- Rótulo CarboPRO

COMMIT;
