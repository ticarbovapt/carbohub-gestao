-- ============================================================
-- Migration: mrp_bom
-- BOM (Bill of Materials) de Produtos Finais do MRP
-- Cada linha define um insumo necessário para produzir
-- 1 unidade de um "Produto Final" da tabela mrp_products.
-- ============================================================

CREATE TABLE IF NOT EXISTS mrp_bom (
  id                uuid         PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Produto Final que está sendo descrito
  product_id        uuid         NOT NULL
    REFERENCES mrp_products(id) ON DELETE CASCADE,

  -- Insumo/embalagem consumido na produção
  insumo_id         uuid         NOT NULL
    REFERENCES mrp_products(id) ON DELETE RESTRICT,

  -- Quantidade por unidade produzida
  quantity_per_unit numeric(12,4) NOT NULL DEFAULT 1,
  unit              text          NOT NULL DEFAULT 'un',

  -- Insumo crítico: ausência trava a produção
  is_critical       boolean       NOT NULL DEFAULT false,

  notes             text,
  created_by        uuid REFERENCES auth.users(id),
  created_at        timestamptz   NOT NULL DEFAULT now(),
  updated_at        timestamptz   NOT NULL DEFAULT now(),

  -- Evita duplicidade de insumo no mesmo produto
  CONSTRAINT mrp_bom_unique UNIQUE (product_id, insumo_id),

  -- Insumo não pode ser o próprio produto
  CONSTRAINT mrp_bom_no_self CHECK (product_id <> insumo_id)
);

-- ── Índices ──────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_mrp_bom_product ON mrp_bom(product_id);
CREATE INDEX IF NOT EXISTS idx_mrp_bom_insumo  ON mrp_bom(insumo_id);

-- ── updated_at automático ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_mrp_bom_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS mrp_bom_updated_at ON mrp_bom;
CREATE TRIGGER mrp_bom_updated_at
  BEFORE UPDATE ON mrp_bom
  FOR EACH ROW EXECUTE FUNCTION update_mrp_bom_updated_at();

-- ── RLS ──────────────────────────────────────────────────────────────────────
ALTER TABLE mrp_bom ENABLE ROW LEVEL SECURITY;

-- Qualquer autenticado pode visualizar
CREATE POLICY "mrp_bom_select"
  ON mrp_bom FOR SELECT
  USING (auth.role() = 'authenticated');

-- Apenas admin/manager podem inserir
CREATE POLICY "mrp_bom_insert"
  ON mrp_bom FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
        AND role IN ('admin', 'manager')
    )
  );

-- Apenas admin/manager podem atualizar
CREATE POLICY "mrp_bom_update"
  ON mrp_bom FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
        AND role IN ('admin', 'manager')
    )
  );

-- Apenas admin/manager podem excluir
CREATE POLICY "mrp_bom_delete"
  ON mrp_bom FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
        AND role IN ('admin', 'manager')
    )
  );
