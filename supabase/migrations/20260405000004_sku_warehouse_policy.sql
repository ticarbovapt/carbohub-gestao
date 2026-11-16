-- =============================================================
-- Migration: Safety Stock por SKU por Warehouse
-- Permite configurar estoque mínimo diferente por produto/hub
-- Ex: CarboZé 100ml = 1500 em Natal, 3000 em SP
-- =============================================================

-- 1. Tabela de política de estoque por SKU por warehouse
CREATE TABLE IF NOT EXISTS sku_warehouse_policy (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sku_id UUID NOT NULL REFERENCES sku(id) ON DELETE CASCADE,
  warehouse_id UUID NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
  safety_stock_qty INTEGER NOT NULL DEFAULT 0,
  min_coverage_days INTEGER NOT NULL DEFAULT 30,
  is_active BOOLEAN NOT NULL DEFAULT true,
  updated_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(sku_id, warehouse_id)
);

-- 2. Tabela de necessidade de insumos calculada (cache para dashboard)
CREATE TABLE IF NOT EXISTS insumo_requirement (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sku_id UUID NOT NULL REFERENCES sku(id) ON DELETE CASCADE,
  warehouse_id UUID NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES mrp_products(id) ON DELETE CASCADE,
  required_qty NUMERIC(12,2) NOT NULL DEFAULT 0,
  current_stock_qty INTEGER NOT NULL DEFAULT 0,
  deficit NUMERIC(12,2) NOT NULL DEFAULT 0,
  last_calculated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(sku_id, warehouse_id, product_id)
);

-- 3. Índices
CREATE INDEX IF NOT EXISTS idx_sku_warehouse_policy_sku ON sku_warehouse_policy(sku_id);
CREATE INDEX IF NOT EXISTS idx_sku_warehouse_policy_warehouse ON sku_warehouse_policy(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_insumo_requirement_deficit ON insumo_requirement(deficit) WHERE deficit > 0;

-- 4. RLS
ALTER TABLE sku_warehouse_policy ENABLE ROW LEVEL SECURITY;
ALTER TABLE insumo_requirement ENABLE ROW LEVEL SECURITY;

-- Leitura para todos autenticados
CREATE POLICY "sku_warehouse_policy_select" ON sku_warehouse_policy
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "insumo_requirement_select" ON insumo_requirement
  FOR SELECT USING (auth.role() = 'authenticated');

-- Escrita somente para admins/gestores
CREATE POLICY "sku_warehouse_policy_manage" ON sku_warehouse_policy
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM carbo_user_roles
      WHERE user_id = auth.uid()
      AND role IN ('master_admin', 'ceo', 'gestor_adm', 'gestor_ops')
    )
  );

CREATE POLICY "insumo_requirement_manage" ON insumo_requirement
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM carbo_user_roles
      WHERE user_id = auth.uid()
      AND role IN ('master_admin', 'ceo', 'gestor_adm', 'gestor_ops')
    )
  );

-- 5. Function: recalcular necessidade de insumos a partir do BOM
--    Chamada após atualizar sku_warehouse_policy ou sku_bom
CREATE OR REPLACE FUNCTION recalculate_insumo_requirements(
  p_sku_id UUID DEFAULT NULL,
  p_warehouse_id UUID DEFAULT NULL
)
RETURNS void AS $$
BEGIN
  -- Limpar e recalcular
  DELETE FROM insumo_requirement
  WHERE (p_sku_id IS NULL OR sku_id = p_sku_id)
    AND (p_warehouse_id IS NULL OR warehouse_id = p_warehouse_id);

  INSERT INTO insumo_requirement (sku_id, warehouse_id, product_id, required_qty, current_stock_qty, deficit, last_calculated_at)
  SELECT
    swp.sku_id,
    swp.warehouse_id,
    (item->>'product_id')::UUID AS product_id,
    -- Quantidade necessária = safety_stock * qty_per_unit do BOM
    swp.safety_stock_qty * COALESCE((item->>'quantity_per_unit')::NUMERIC, 1) AS required_qty,
    -- Estoque atual do insumo neste warehouse
    COALESCE(ws.quantity, 0) AS current_stock_qty,
    -- Déficit
    GREATEST(
      swp.safety_stock_qty * COALESCE((item->>'quantity_per_unit')::NUMERIC, 1) - COALESCE(ws.quantity, 0),
      0
    ) AS deficit,
    now()
  FROM sku_warehouse_policy swp
  JOIN sku_bom bom ON bom.sku_id = swp.sku_id AND bom.is_active = true
  CROSS JOIN LATERAL jsonb_array_elements(bom.items) AS item
  LEFT JOIN warehouse_stock ws
    ON ws.warehouse_id = swp.warehouse_id
    AND ws.product_id = (item->>'product_id')::UUID
  WHERE swp.is_active = true
    AND (p_sku_id IS NULL OR swp.sku_id = p_sku_id)
    AND (p_warehouse_id IS NULL OR swp.warehouse_id = p_warehouse_id);
END;
$$ LANGUAGE plpgsql;

-- 6. Trigger: recalcular quando safety stock muda
CREATE OR REPLACE FUNCTION trg_recalc_on_policy_change()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM recalculate_insumo_requirements(NEW.sku_id, NEW.warehouse_id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_recalc_insumo_on_policy ON sku_warehouse_policy;
CREATE TRIGGER trg_recalc_insumo_on_policy
  AFTER INSERT OR UPDATE ON sku_warehouse_policy
  FOR EACH ROW
  EXECUTE FUNCTION trg_recalc_on_policy_change();
