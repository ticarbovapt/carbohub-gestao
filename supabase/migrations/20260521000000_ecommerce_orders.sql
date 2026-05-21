-- ecommerce_orders: stores normalized orders from all external platforms
CREATE TABLE IF NOT EXISTS ecommerce_orders (
  id           uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  platform     text NOT NULL CHECK (platform IN ('mercadolivre', 'amazon', 'tiktok', 'shopee')),
  order_id     text NOT NULL,
  product_sku  text,
  product_name text,
  quantity     int  NOT NULL DEFAULT 1,    -- pedidos (order line qty, usually 1)
  units_real   int  NOT NULL DEFAULT 1,    -- unidades reais (quantity × units_per_pack from SKU catalog)
  unit_price   numeric(10,2) NOT NULL DEFAULT 0,
  total        numeric(10,2) NOT NULL DEFAULT 0,
  status       text NOT NULL DEFAULT 'pending', -- pending | shipped | delivered | cancelled
  ordered_at   timestamptz NOT NULL,
  synced_at    timestamptz DEFAULT now(),
  sync_source  text DEFAULT 'webhook',      -- 'webhook' | 'cron'
  raw          jsonb,                        -- full original payload for audit
  CONSTRAINT uq_ecommerce_order UNIQUE (platform, order_id)
);

ALTER TABLE ecommerce_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated_read" ON ecommerce_orders FOR SELECT TO authenticated USING (true);
CREATE POLICY "service_write"      ON ecommerce_orders FOR ALL   TO service_role  USING (true);

ALTER PUBLICATION supabase_realtime ADD TABLE ecommerce_orders;

-- PATH 1 — Raw summary view (dead-simple, no business logic)
-- This is the baseline. The system logic (Path 2) must match this.
CREATE OR REPLACE VIEW ecommerce_raw_summary AS
SELECT
  platform,
  ordered_at::date                                          AS day,
  COUNT(*)                                                  AS total_orders,
  COALESCE(SUM(quantity),    0)::int                        AS total_quantity,
  COALESCE(SUM(units_real),  0)::int                        AS total_units_real,
  COALESCE(SUM(total),       0)::numeric                    AS total_revenue,
  COUNT(*) FILTER (WHERE status = 'cancelled')::int         AS cancelled_orders,
  COUNT(*) FILTER (WHERE status = 'pending')::int           AS pending_orders,
  COUNT(*) FILTER (WHERE status = 'shipped')::int           AS shipped_orders,
  COUNT(*) FILTER (WHERE status = 'delivered')::int         AS delivered_orders
FROM ecommerce_orders
GROUP BY platform, ordered_at::date;

GRANT SELECT ON ecommerce_raw_summary TO authenticated;
