-- =============================================================
-- Migration: Catálogo de Produtos → vínculo com Pedidos (RV)
-- Adiciona sku_id em carboze_orders e SKU do Sachê 10ml
-- =============================================================

-- 1. Novo SKU: CarboZé Sachê 10ml
INSERT INTO sku (code, name, description, category, unit, packaging_ml, is_active, safety_stock_qty, target_coverage_days)
VALUES ('SKU-CZSC10', 'CarboZé Sachê 10ml', 'CarboZé em sachê individual de 10ml', 'produto_final', 'un', 10, true, 100, 30)
ON CONFLICT (code) DO NOTHING;

-- 2. Adicionar sku_id na tabela de pedidos (referência ao catálogo)
ALTER TABLE carboze_orders
  ADD COLUMN IF NOT EXISTS sku_id UUID REFERENCES sku(id);

-- 3. Atualizar constraint de linha para incluir sachê
ALTER TABLE carboze_orders DROP CONSTRAINT IF EXISTS carboze_orders_linha_check;
ALTER TABLE carboze_orders
  ADD CONSTRAINT carboze_orders_linha_check
  CHECK (linha IN ('carboze_100ml', 'carboze_1l', 'carboze_sache_10ml', 'carbopro', 'carbovapt'));

-- 4. Índice para performance de consultas por produto
CREATE INDEX IF NOT EXISTS idx_carboze_orders_sku ON carboze_orders(sku_id);

-- 5. Atualizar a view segura para incluir sku_id
-- (A view usa SELECT * então já inclui automaticamente, mas vamos
--  garantir que o JOIN com sku funcione para nome do produto)

-- 6. Popular sku_id retroativamente baseado no campo linha (pedidos existentes)
UPDATE carboze_orders SET sku_id = (SELECT id FROM sku WHERE code = 'SKU-CZ100')
  WHERE linha = 'carboze_100ml' AND sku_id IS NULL;

UPDATE carboze_orders SET sku_id = (SELECT id FROM sku WHERE code = 'SKU-CZ1L')
  WHERE linha = 'carboze_1l' AND sku_id IS NULL;

UPDATE carboze_orders SET sku_id = (SELECT id FROM sku WHERE code = 'SKU-CZSC10')
  WHERE linha = 'carboze_sache_10ml' AND sku_id IS NULL;

UPDATE carboze_orders SET sku_id = (SELECT id FROM sku WHERE code = 'SKU-CP100')
  WHERE linha = 'carbopro' AND sku_id IS NULL;

UPDATE carboze_orders SET sku_id = (SELECT id FROM sku WHERE code = 'SKU-VAPT70')
  WHERE linha = 'carbovapt' AND sku_id IS NULL;
