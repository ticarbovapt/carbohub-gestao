-- ============================================================
-- CarboHub — OS CarboVAPT Descarbonização
-- Migration: 20260407_os_carbovapt.sql
-- ============================================================

-- 1. Novo ENUM para stages da Descarbonização CarboVAPT
DO $$ BEGIN
  CREATE TYPE os_stage_type AS ENUM (
    'nova',
    'qualificacao',
    'agendamento',
    'confirmada',
    'em_execucao',
    'pos_servico',
    'concluida',
    'cancelada'
  );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- 2. Novas colunas em service_orders para fluxo CarboVAPT
ALTER TABLE service_orders
  ADD COLUMN IF NOT EXISTS os_stage         os_stage_type DEFAULT 'nova',
  ADD COLUMN IF NOT EXISTS service_type     text CHECK (service_type IN ('b2c', 'b2b', 'frota')),
  ADD COLUMN IF NOT EXISTS technician_id    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS vehicle_plate    text,
  ADD COLUMN IF NOT EXISTS vehicle_model    text,
  ADD COLUMN IF NOT EXISTS scheduled_at     timestamptz,
  ADD COLUMN IF NOT EXISTS executed_at      timestamptz,
  ADD COLUMN IF NOT EXISTS cancelled_reason text,
  ADD COLUMN IF NOT EXISTS customer_name    text;  -- fallback quando não há customer_id

-- 3. Sequence + trigger para numeração automática de OS
CREATE SEQUENCE IF NOT EXISTS os_number_seq START 1;

CREATE OR REPLACE FUNCTION generate_os_number()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.os_number IS NULL OR NEW.os_number = '' THEN
    NEW.os_number := 'OS-' || to_char(NOW(), 'YYYY') || '-' ||
      LPAD(nextval('os_number_seq')::text, 5, '0');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_os_number ON service_orders;
CREATE TRIGGER trg_os_number
  BEFORE INSERT ON service_orders
  FOR EACH ROW EXECUTE FUNCTION generate_os_number();

-- 4. Indexes para performance
CREATE INDEX IF NOT EXISTS idx_service_orders_os_stage
  ON service_orders (os_stage);
CREATE INDEX IF NOT EXISTS idx_service_orders_scheduled
  ON service_orders (scheduled_at);
CREATE INDEX IF NOT EXISTS idx_service_orders_service_type
  ON service_orders (service_type);

-- 5. Garantir RLS
ALTER TABLE service_orders ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'service_orders' AND policyname = 'auth_users_can_select_os'
  ) THEN
    CREATE POLICY "auth_users_can_select_os"
      ON service_orders FOR SELECT TO authenticated USING (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'service_orders' AND policyname = 'auth_users_can_insert_os'
  ) THEN
    CREATE POLICY "auth_users_can_insert_os"
      ON service_orders FOR INSERT TO authenticated WITH CHECK (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'service_orders' AND policyname = 'auth_users_can_update_os'
  ) THEN
    CREATE POLICY "auth_users_can_update_os"
      ON service_orders FOR UPDATE TO authenticated USING (true);
  END IF;
END $$;
