-- ============================================================
-- Sprint G — PDV Sistema Completo
-- Tabelas: pdv_products, pdv_product_stock, pdv_sellers,
--          pdv_sales, pdv_stock_movements
-- Rodar no Supabase SQL Editor
-- ============================================================

-- 1. Produtos disponíveis para venda nos PDVs
CREATE TABLE IF NOT EXISTS pdv_products (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sku_code      text NOT NULL,
  name          text NOT NULL,
  short_name    text,
  description   text,
  price_default numeric(10,2) NOT NULL DEFAULT 0,
  unit          text NOT NULL DEFAULT 'un',
  image_url     text,
  is_active     boolean NOT NULL DEFAULT true,
  sort_order    int NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- Seeds: 3 produtos
INSERT INTO pdv_products (sku_code, name, short_name, price_default, sort_order) VALUES
  ('CARBOZE-100ML',     'CarboZé 100ml',       'CarboZé 100',  0, 1),
  ('CARBOPRO-100ML',    'CarboPRO 100ml',       'CarboPRO',     0, 2),
  ('CARBOZE-SACHE-10ML','CarboZé Sachê 10ml',   'Sachê 10ml',   0, 3)
ON CONFLICT DO NOTHING;

-- 2. Estoque de cada produto em cada PDV
CREATE TABLE IF NOT EXISTS pdv_product_stock (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pdv_id           uuid NOT NULL REFERENCES pdvs(id) ON DELETE CASCADE,
  product_id       uuid NOT NULL REFERENCES pdv_products(id) ON DELETE CASCADE,
  qty_current      numeric(10,3) NOT NULL DEFAULT 0,
  qty_min_threshold numeric(10,3) NOT NULL DEFAULT 5,
  qty_max_capacity numeric(10,3) NOT NULL DEFAULT 100,
  has_alert        boolean NOT NULL DEFAULT false,
  last_updated     timestamptz NOT NULL DEFAULT now(),
  UNIQUE(pdv_id, product_id)
);

-- Trigger: atualiza has_alert automaticamente
CREATE OR REPLACE FUNCTION update_pdv_product_alert()
RETURNS TRIGGER AS $$
BEGIN
  NEW.has_alert := NEW.qty_current <= NEW.qty_min_threshold;
  NEW.last_updated := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_pdv_product_alert ON pdv_product_stock;
CREATE TRIGGER trg_pdv_product_alert
  BEFORE INSERT OR UPDATE ON pdv_product_stock
  FOR EACH ROW EXECUTE FUNCTION update_pdv_product_alert();

-- 3. Vendedores internos do PDV (funcionários da loja)
CREATE TABLE IF NOT EXISTS pdv_sellers (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pdv_id           uuid NOT NULL REFERENCES pdvs(id) ON DELETE CASCADE,
  user_id          uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  name             text NOT NULL,
  email            text,
  phone            text,
  is_active        boolean NOT NULL DEFAULT true,
  is_manager       boolean NOT NULL DEFAULT false,
  commission_rate  numeric(5,2) NOT NULL DEFAULT 0,
  rv_vendedor_name text,  -- vendedor externo RV Grupo Carbo
  notes            text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  created_by       uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_pdv_sellers_pdv_id ON pdv_sellers(pdv_id);
CREATE INDEX IF NOT EXISTS idx_pdv_sellers_user_id ON pdv_sellers(user_id);

-- 4. Registro de vendas POS
CREATE TABLE IF NOT EXISTS pdv_sales (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pdv_id           uuid NOT NULL REFERENCES pdvs(id) ON DELETE RESTRICT,
  seller_id        uuid REFERENCES pdv_sellers(id) ON DELETE SET NULL,
  rv_vendedor_name text,
  -- items: [{product_id, product_name, qty, unit_price, subtotal}]
  items            jsonb NOT NULL DEFAULT '[]',
  subtotal         numeric(10,2) NOT NULL DEFAULT 0,
  discount         numeric(10,2) NOT NULL DEFAULT 0,
  total            numeric(10,2) NOT NULL DEFAULT 0,
  payment_type     text NOT NULL DEFAULT 'cash',
  customer_name    text,
  customer_phone   text,
  notes            text,
  commission_amount numeric(10,2) NOT NULL DEFAULT 0,
  is_voided        boolean NOT NULL DEFAULT false,
  voided_reason    text,
  voided_at        timestamptz,
  voided_by        uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  created_by       uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_pdv_sales_pdv_id    ON pdv_sales(pdv_id);
CREATE INDEX IF NOT EXISTS idx_pdv_sales_seller_id ON pdv_sales(seller_id);
CREATE INDEX IF NOT EXISTS idx_pdv_sales_created   ON pdv_sales(created_at DESC);

-- 5. Movimentações de estoque PDV
CREATE TABLE IF NOT EXISTS pdv_stock_movements (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pdv_id     uuid NOT NULL REFERENCES pdvs(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES pdv_products(id) ON DELETE CASCADE,
  tipo       text NOT NULL CHECK (tipo IN ('venda','reposicao','ajuste','perda','entrada')),
  qty        numeric(10,3) NOT NULL,   -- negativo = saída, positivo = entrada
  qty_before numeric(10,3),
  qty_after  numeric(10,3),
  sale_id    uuid REFERENCES pdv_sales(id) ON DELETE SET NULL,
  notes      text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_pdv_stock_mov_pdv ON pdv_stock_movements(pdv_id, created_at DESC);

-- ============================================================
-- RLS
-- ============================================================

ALTER TABLE pdv_products       ENABLE ROW LEVEL SECURITY;
ALTER TABLE pdv_product_stock  ENABLE ROW LEVEL SECURITY;
ALTER TABLE pdv_sellers        ENABLE ROW LEVEL SECURITY;
ALTER TABLE pdv_sales          ENABLE ROW LEVEL SECURITY;
ALTER TABLE pdv_stock_movements ENABLE ROW LEVEL SECURITY;

-- pdv_products: todos autenticados podem ver; só admins/gestores editam
CREATE POLICY "pdv_products_select_all"   ON pdv_products FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "pdv_products_admin_all"    ON pdv_products FOR ALL    USING (is_manager_or_admin(auth.uid()));

-- pdv_product_stock
CREATE POLICY "pdv_stock_admin_all"       ON pdv_product_stock FOR ALL    USING (is_manager_or_admin(auth.uid()));
CREATE POLICY "pdv_stock_user_own"        ON pdv_product_stock FOR SELECT USING (pdv_id = get_user_pdv_id(auth.uid()));

-- pdv_sellers: admin vê tudo; manager gerencia seu PDV; vendedor vê só si
CREATE POLICY "pdv_sellers_admin_all"     ON pdv_sellers FOR ALL    USING (is_manager_or_admin(auth.uid()));
CREATE POLICY "pdv_sellers_pdv_manager"   ON pdv_sellers FOR ALL
  USING (
    pdv_id = get_user_pdv_id(auth.uid()) AND
    EXISTS (SELECT 1 FROM pdv_sellers ps2 WHERE ps2.user_id = auth.uid() AND ps2.is_manager = true AND ps2.pdv_id = pdv_sellers.pdv_id)
  );
CREATE POLICY "pdv_sellers_own_record"    ON pdv_sellers FOR SELECT USING (user_id = auth.uid());

-- pdv_sales: admin vê tudo; manager vê todas do seu PDV; vendedor só as suas
CREATE POLICY "pdv_sales_admin_all"       ON pdv_sales FOR ALL    USING (is_manager_or_admin(auth.uid()));
CREATE POLICY "pdv_sales_manager_pdv"     ON pdv_sales FOR SELECT
  USING (
    pdv_id = get_user_pdv_id(auth.uid()) AND
    EXISTS (SELECT 1 FROM pdv_sellers ps WHERE ps.user_id = auth.uid() AND ps.is_manager = true AND ps.pdv_id = pdv_sales.pdv_id)
  );
CREATE POLICY "pdv_sales_seller_own"      ON pdv_sales FOR SELECT
  USING (seller_id IN (SELECT id FROM pdv_sellers WHERE user_id = auth.uid()));
CREATE POLICY "pdv_sales_seller_insert"   ON pdv_sales FOR INSERT
  WITH CHECK (pdv_id = get_user_pdv_id(auth.uid()));
CREATE POLICY "pdv_sales_seller_update"   ON pdv_sales FOR UPDATE
  USING (pdv_id = get_user_pdv_id(auth.uid()));

-- pdv_stock_movements
CREATE POLICY "pdv_mov_admin_all"         ON pdv_stock_movements FOR ALL    USING (is_manager_or_admin(auth.uid()));
CREATE POLICY "pdv_mov_user_own_pdv"      ON pdv_stock_movements FOR SELECT USING (pdv_id = get_user_pdv_id(auth.uid()));
CREATE POLICY "pdv_mov_insert_own_pdv"    ON pdv_stock_movements FOR INSERT WITH CHECK (pdv_id = get_user_pdv_id(auth.uid()));

-- ============================================================
-- Verificação
-- ============================================================
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('pdv_products','pdv_product_stock','pdv_sellers','pdv_sales','pdv_stock_movements')
ORDER BY table_name;
