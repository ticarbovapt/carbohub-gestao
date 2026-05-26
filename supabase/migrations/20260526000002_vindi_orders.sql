-- vindi_orders: cobranças normalizadas vindas do Vindi
CREATE TABLE IF NOT EXISTS vindi_orders (
  id             uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  charge_id      text NOT NULL UNIQUE,
  bill_id        text,
  product_id     text,
  product_name   text,
  amount         numeric(10,2) NOT NULL DEFAULT 0,
  status         text NOT NULL DEFAULT 'pending',  -- paid | pending | canceled | fraud
  payment_method text,                              -- credit_card | bank_slip | pix
  installments   int  NOT NULL DEFAULT 1,
  customer_email text,
  customer_name  text,
  paid_at        timestamptz,
  created_at     timestamptz NOT NULL,
  synced_at      timestamptz DEFAULT now(),
  raw            jsonb
);

CREATE INDEX IF NOT EXISTS idx_vindi_orders_created_at  ON vindi_orders (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_vindi_orders_status      ON vindi_orders (status);
CREATE INDEX IF NOT EXISTS idx_vindi_orders_product     ON vindi_orders (product_id);
CREATE INDEX IF NOT EXISTS idx_vindi_orders_paid_at     ON vindi_orders (paid_at DESC);

ALTER TABLE vindi_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated read vindi orders"  ON vindi_orders FOR SELECT TO authenticated USING (true);
CREATE POLICY "service write vindi orders"       ON vindi_orders FOR ALL    TO service_role  USING (true);

ALTER PUBLICATION supabase_realtime ADD TABLE vindi_orders;

-- Cron job: sincroniza Vindi a cada 15 minutos
-- Execute no SQL Editor após deploy das functions:
-- SELECT cron.schedule(
--   'vindi-sync-15min',
--   '*/15 * * * *',
--   $$SELECT net.http_post(
--     url := 'https://wpkfirmapxevzpxjovjr.supabase.co/functions/v1/vindi-sync',
--     headers := '{"Content-Type":"application/json"}'::jsonb,
--     body := '{}'::jsonb
--   )$$
-- );
