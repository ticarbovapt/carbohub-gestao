-- ============================================================
-- Sprint A — Área Licenciados: Foundation Tables
-- CarboHub 2026-04-07
-- Rodar no Supabase SQL Editor
-- ============================================================

-- 1. CLIENTES DOS LICENCIADOS
-- ============================================================
CREATE TABLE IF NOT EXISTS descarb_clients (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  licensee_id     uuid NOT NULL REFERENCES licensees(id) ON DELETE CASCADE,
  name            text NOT NULL,
  federal_code    text,
  phone           text,
  email           text,
  city            text,
  state           char(2),
  notes           text,
  created_by      uuid REFERENCES auth.users(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_descarb_clients_licensee ON descarb_clients(licensee_id);
ALTER TABLE descarb_clients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "descarb_clients_select" ON descarb_clients FOR SELECT
  USING (auth.role() = 'authenticated');
CREATE POLICY "descarb_clients_insert" ON descarb_clients FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = auth.uid()
    AND role IN ('admin','manager','operator')
  ));
CREATE POLICY "descarb_clients_update" ON descarb_clients FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = auth.uid()
    AND role IN ('admin','manager')
  ));

-- 2. VEÍCULOS
-- ============================================================
CREATE TABLE IF NOT EXISTS descarb_vehicles (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id       uuid REFERENCES descarb_clients(id) ON DELETE SET NULL,
  licensee_id     uuid NOT NULL REFERENCES licensees(id) ON DELETE CASCADE,
  license_plate   text NOT NULL,
  brand           text,
  model           text,
  year            int,
  fuel_type       text NOT NULL DEFAULT 'flex'
    CHECK (fuel_type IN ('flex','diesel','gasolina','gnv','eletrico')),
  kilometer       numeric(10,0),
  created_by      uuid REFERENCES auth.users(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_descarb_vehicles_licensee ON descarb_vehicles(licensee_id);
CREATE INDEX IF NOT EXISTS idx_descarb_vehicles_plate    ON descarb_vehicles(license_plate);
ALTER TABLE descarb_vehicles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "descarb_vehicles_select" ON descarb_vehicles FOR SELECT
  USING (auth.role() = 'authenticated');
CREATE POLICY "descarb_vehicles_insert" ON descarb_vehicles FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = auth.uid()
    AND role IN ('admin','manager','operator')
  ));
CREATE POLICY "descarb_vehicles_update" ON descarb_vehicles FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = auth.uid()
    AND role IN ('admin','manager')
  ));

-- 3. ATENDIMENTOS DE DESCARBONIZAÇÃO
-- ============================================================
CREATE TABLE IF NOT EXISTS descarb_sales (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  licensee_id         uuid NOT NULL REFERENCES licensees(id) ON DELETE RESTRICT,
  machine_id          uuid REFERENCES machines(id) ON DELETE SET NULL,
  client_id           uuid REFERENCES descarb_clients(id) ON DELETE SET NULL,
  vehicle_id          uuid REFERENCES descarb_vehicles(id) ON DELETE SET NULL,
  modality            text NOT NULL
    CHECK (modality IN ('P','M','G','G+')),
  reagent_type        text NOT NULL DEFAULT 'flex'
    CHECK (reagent_type IN ('flex','diesel','normal')),
  reagent_qty_used    numeric(8,3) NOT NULL DEFAULT 0,
  payment_type        text NOT NULL DEFAULT 'money'
    CHECK (payment_type IN ('credits','money','card','pix','invoice','indicator','carboflix')),
  total_value         numeric(10,2) NOT NULL DEFAULT 0,
  discount            numeric(10,2) NOT NULL DEFAULT 0,
  is_pre_sale         boolean NOT NULL DEFAULT false,
  pre_sale_status     text
    CHECK (pre_sale_status IS NULL OR pre_sale_status IN ('NOT','UNDONE','DONE')),
  preferred_date      date,
  executed_at         timestamptz,
  carboflix_cert_num  text,
  certificate_issued  boolean NOT NULL DEFAULT false,
  notes               text,
  created_by          uuid REFERENCES auth.users(id),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_descarb_sales_licensee ON descarb_sales(licensee_id);
CREATE INDEX IF NOT EXISTS idx_descarb_sales_date     ON descarb_sales(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_descarb_sales_vehicle  ON descarb_sales(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_descarb_sales_modality ON descarb_sales(modality);

CREATE OR REPLACE FUNCTION update_descarb_sales_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;
DROP TRIGGER IF EXISTS descarb_sales_updated_at ON descarb_sales;
CREATE TRIGGER descarb_sales_updated_at
  BEFORE UPDATE ON descarb_sales
  FOR EACH ROW EXECUTE FUNCTION update_descarb_sales_updated_at();

ALTER TABLE descarb_sales ENABLE ROW LEVEL SECURITY;
CREATE POLICY "descarb_sales_select" ON descarb_sales FOR SELECT
  USING (auth.role() = 'authenticated');
CREATE POLICY "descarb_sales_insert" ON descarb_sales FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = auth.uid()
    AND role IN ('admin','manager','operator')
  ));
CREATE POLICY "descarb_sales_update" ON descarb_sales FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = auth.uid()
    AND role IN ('admin','manager')
  ));

-- 4. ESTOQUE DE REAGENTES POR LICENCIADO
-- ============================================================
CREATE TABLE IF NOT EXISTS licensee_reagent_stock (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  licensee_id     uuid NOT NULL UNIQUE REFERENCES licensees(id) ON DELETE CASCADE,
  qty_normal      numeric(10,3) NOT NULL DEFAULT 0,
  qty_flex        numeric(10,3) NOT NULL DEFAULT 0,
  qty_diesel      numeric(10,3) NOT NULL DEFAULT 0,
  min_qty_alert   numeric(10,3) NOT NULL DEFAULT 5,
  updated_at      timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE licensee_reagent_stock ENABLE ROW LEVEL SECURITY;
CREATE POLICY "reagent_stock_select" ON licensee_reagent_stock FOR SELECT
  USING (auth.role() = 'authenticated');
CREATE POLICY "reagent_stock_insert" ON licensee_reagent_stock FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = auth.uid()
    AND role IN ('admin','manager')
  ));
CREATE POLICY "reagent_stock_update" ON licensee_reagent_stock FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = auth.uid()
    AND role IN ('admin','manager')
  ));

-- 5. MOVIMENTAÇÕES DE REAGENTE
-- ============================================================
CREATE TABLE IF NOT EXISTS reagent_movements (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  licensee_id     uuid NOT NULL REFERENCES licensees(id) ON DELETE CASCADE,
  descarb_sale_id uuid REFERENCES descarb_sales(id) ON DELETE SET NULL,
  tipo            text NOT NULL
    CHECK (tipo IN ('consumo','reposicao','ajuste')),
  reagent_type    text NOT NULL
    CHECK (reagent_type IN ('flex','diesel','normal')),
  quantidade      numeric(10,3) NOT NULL,
  saldo_apos      numeric(10,3),
  motivo          text,
  created_by      uuid REFERENCES auth.users(id),
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_reagent_movements_licensee ON reagent_movements(licensee_id);
CREATE INDEX IF NOT EXISTS idx_reagent_movements_date     ON reagent_movements(created_at DESC);
ALTER TABLE reagent_movements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "reagent_movements_select" ON reagent_movements FOR SELECT
  USING (auth.role() = 'authenticated');
CREATE POLICY "reagent_movements_insert" ON reagent_movements FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = auth.uid()
    AND role IN ('admin','manager','operator')
  ));

-- 6. ESTOQUE DE PRODUTOS POR LICENCIADO (CarboZé, CarboPRO, etc)
-- ============================================================
CREATE TABLE IF NOT EXISTS licensee_product_stock (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  licensee_id     uuid NOT NULL REFERENCES licensees(id) ON DELETE CASCADE,
  mrp_product_id  uuid NOT NULL REFERENCES mrp_products(id) ON DELETE RESTRICT,
  quantity        numeric(10,2) NOT NULL DEFAULT 0,
  min_qty_alert   numeric(10,2) NOT NULL DEFAULT 10,
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT licensee_product_stock_unique UNIQUE (licensee_id, mrp_product_id)
);
CREATE INDEX IF NOT EXISTS idx_licensee_product_stock_licensee ON licensee_product_stock(licensee_id);
ALTER TABLE licensee_product_stock ENABLE ROW LEVEL SECURITY;
CREATE POLICY "licensee_product_stock_select" ON licensee_product_stock FOR SELECT
  USING (auth.role() = 'authenticated');
CREATE POLICY "licensee_product_stock_insert" ON licensee_product_stock FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = auth.uid()
    AND role IN ('admin','manager')
  ));
CREATE POLICY "licensee_product_stock_update" ON licensee_product_stock FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = auth.uid()
    AND role IN ('admin','manager')
  ));

-- 7. CENTRAL DE ALERTAS CARBOOPS
-- ============================================================
CREATE TABLE IF NOT EXISTS ops_alerts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo            text NOT NULL,
  -- tipos sugeridos: reagent_low, product_low, new_sale, replenishment_request,
  --                  commission_pending, machine_alert, pre_sale_expired, inactivity_alert
  licensee_id     uuid REFERENCES licensees(id) ON DELETE CASCADE,
  machine_id      uuid REFERENCES machines(id) ON DELETE SET NULL,
  titulo          text NOT NULL,
  descricao       text,
  prioridade      text NOT NULL DEFAULT 'medium'
    CHECK (prioridade IN ('low','medium','high','critical')),
  status          text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open','in_progress','resolved','dismissed')),
  source_table    text,
  source_id       uuid,
  assigned_to     uuid REFERENCES auth.users(id),
  resolved_at     timestamptz,
  resolved_by     uuid REFERENCES auth.users(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ops_alerts_status     ON ops_alerts(status);
CREATE INDEX IF NOT EXISTS idx_ops_alerts_prioridade ON ops_alerts(prioridade);
CREATE INDEX IF NOT EXISTS idx_ops_alerts_licensee   ON ops_alerts(licensee_id);
CREATE INDEX IF NOT EXISTS idx_ops_alerts_created    ON ops_alerts(created_at DESC);

CREATE OR REPLACE FUNCTION update_ops_alerts_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;
DROP TRIGGER IF EXISTS ops_alerts_updated_at ON ops_alerts;
CREATE TRIGGER ops_alerts_updated_at
  BEFORE UPDATE ON ops_alerts
  FOR EACH ROW EXECUTE FUNCTION update_ops_alerts_updated_at();

ALTER TABLE ops_alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ops_alerts_select" ON ops_alerts FOR SELECT
  USING (auth.role() = 'authenticated');
CREATE POLICY "ops_alerts_insert" ON ops_alerts FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "ops_alerts_update" ON ops_alerts FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = auth.uid()
    AND role IN ('admin','manager')
  ));
