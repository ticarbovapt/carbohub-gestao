CREATE TABLE IF NOT EXISTS platform_commission_rates (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  platform   text NOT NULL,
  rate       numeric(6,4) NOT NULL CHECK (rate >= 0 AND rate <= 1),
  valid_from date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_commission_rates_platform_date
  ON platform_commission_rates (platform, valid_from DESC);

ALTER TABLE platform_commission_rates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated read commission rates"
  ON platform_commission_rates FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "authenticated insert commission rates"
  ON platform_commission_rates FOR INSERT
  TO authenticated WITH CHECK (true);
