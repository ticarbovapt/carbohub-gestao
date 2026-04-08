-- Sprint I: Licensee Product Stock + Production Orders
-- Licenciados Mood1 (CarboVapt + Produtos) controlam seu estoque de produtos

-- ── 1. Adicionar campo licensee_mode em licensees ─────────────────────────────
ALTER TABLE licensees
  ADD COLUMN IF NOT EXISTS licensee_mode text NOT NULL DEFAULT 'mood2'
    CHECK (licensee_mode IN ('mood1', 'mood2'));

COMMENT ON COLUMN licensees.licensee_mode IS 'mood1 = CarboVapt + Produtos; mood2 = CarboVapt apenas';

-- ── 2. Tabela de estoque por licenciado × produto ────────────────────────────
CREATE TABLE IF NOT EXISTS licensee_product_stock (
  id                uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  licensee_id       uuid NOT NULL REFERENCES licensees(id) ON DELETE CASCADE,
  product_id        uuid NOT NULL REFERENCES pdv_products(id) ON DELETE RESTRICT,
  qty_current       numeric NOT NULL DEFAULT 0 CHECK (qty_current >= 0),
  qty_min_threshold numeric NOT NULL DEFAULT 5 CHECK (qty_min_threshold >= 0),
  qty_max_capacity  numeric NOT NULL DEFAULT 100 CHECK (qty_max_capacity > 0),
  last_updated      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (licensee_id, product_id)
);

-- Computed alert column via trigger (GENERATED ALWAYS AS doesn't support cross-row)
ALTER TABLE licensee_product_stock
  ADD COLUMN IF NOT EXISTS has_alert boolean NOT NULL DEFAULT false;

-- Trigger to auto-set has_alert
CREATE OR REPLACE FUNCTION fn_licensee_product_alert()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.has_alert := NEW.qty_current <= NEW.qty_min_threshold;
  NEW.last_updated := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_licensee_product_alert ON licensee_product_stock;
CREATE TRIGGER trg_licensee_product_alert
  BEFORE INSERT OR UPDATE ON licensee_product_stock
  FOR EACH ROW EXECUTE FUNCTION fn_licensee_product_alert();

-- ── 3. Histórico de movimentações ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS licensee_stock_movements (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  licensee_id uuid NOT NULL REFERENCES licensees(id) ON DELETE CASCADE,
  product_id  uuid NOT NULL REFERENCES pdv_products(id) ON DELETE RESTRICT,
  tipo        text NOT NULL CHECK (tipo IN ('entrada', 'reposicao', 'ajuste', 'perda', 'venda')),
  qty         numeric NOT NULL,
  qty_before  numeric,
  qty_after   numeric,
  notes       text,
  created_by  uuid REFERENCES auth.users(id),
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- ── 4. Ordens de produção disparadas por estoque mínimo ──────────────────────
CREATE TABLE IF NOT EXISTS production_orders (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  licensee_id   uuid REFERENCES licensees(id) ON DELETE SET NULL,
  product_id    uuid NOT NULL REFERENCES pdv_products(id) ON DELETE RESTRICT,
  qty_requested numeric NOT NULL CHECK (qty_requested > 0),
  status        text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'in_production', 'shipped', 'delivered', 'cancelled')),
  notes         text,
  created_by    uuid REFERENCES auth.users(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- ── 5. RLS ───────────────────────────────────────────────────────────────────
ALTER TABLE licensee_product_stock   ENABLE ROW LEVEL SECURITY;
ALTER TABLE licensee_stock_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE production_orders        ENABLE ROW LEVEL SECURITY;

-- licensee_product_stock: admin ou o próprio licenciado
CREATE POLICY "licensee_stock_select" ON licensee_product_stock
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin')
    OR EXISTS (SELECT 1 FROM licensee_users WHERE user_id = auth.uid() AND licensee_id = licensee_product_stock.licensee_id)
  );

CREATE POLICY "licensee_stock_write" ON licensee_product_stock
  FOR ALL USING (
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin')
    OR EXISTS (SELECT 1 FROM licensee_users WHERE user_id = auth.uid() AND licensee_id = licensee_product_stock.licensee_id)
  );

-- licensee_stock_movements: mesma lógica
CREATE POLICY "licensee_movements_select" ON licensee_stock_movements
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin')
    OR EXISTS (SELECT 1 FROM licensee_users WHERE user_id = auth.uid() AND licensee_id = licensee_stock_movements.licensee_id)
  );

CREATE POLICY "licensee_movements_insert" ON licensee_stock_movements
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin')
    OR EXISTS (SELECT 1 FROM licensee_users WHERE user_id = auth.uid() AND licensee_id = licensee_stock_movements.licensee_id)
  );

-- production_orders: admin vê tudo; licenciado vê/cria seus próprios
CREATE POLICY "prod_orders_select" ON production_orders
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin')
    OR EXISTS (SELECT 1 FROM licensee_users WHERE user_id = auth.uid() AND licensee_id = production_orders.licensee_id)
  );

CREATE POLICY "prod_orders_insert" ON production_orders
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin')
    OR EXISTS (SELECT 1 FROM licensee_users WHERE user_id = auth.uid() AND licensee_id = production_orders.licensee_id)
  );

CREATE POLICY "prod_orders_update" ON production_orders
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin')
  );
