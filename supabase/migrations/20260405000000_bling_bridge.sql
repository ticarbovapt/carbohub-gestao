-- ================================================================
-- Migration: Bling → carboze_orders bridge support
-- 1. UNIQUE index on external_ref (enables upsert from Bling)
-- 2. bling_orders RLS: allow admin/gestor to read
-- ================================================================

-- Allow upsert with external_ref as conflict target
CREATE UNIQUE INDEX IF NOT EXISTS idx_carboze_orders_external_ref
  ON carboze_orders (external_ref)
  WHERE external_ref IS NOT NULL;

-- Ensure bling_orders SELECT is open to admin users (service role bypasses anyway)
ALTER TABLE public.bling_orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view bling orders" ON public.bling_orders;
CREATE POLICY "Admins can view bling orders"
  ON public.bling_orders FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND is_manager_or_admin(auth.uid())
  );

-- Same for bling_products and bling_contacts
ALTER TABLE public.bling_products ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins can view bling products" ON public.bling_products;
CREATE POLICY "Admins can view bling products"
  ON public.bling_products FOR SELECT
  USING (auth.uid() IS NOT NULL AND is_manager_or_admin(auth.uid()));

ALTER TABLE public.bling_contacts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins can view bling contacts" ON public.bling_contacts;
CREATE POLICY "Admins can view bling contacts"
  ON public.bling_contacts FOR SELECT
  USING (auth.uid() IS NOT NULL AND is_manager_or_admin(auth.uid()));

ALTER TABLE public.bling_sync_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins can view bling sync log" ON public.bling_sync_log;
CREATE POLICY "Admins can view bling sync log"
  ON public.bling_sync_log FOR SELECT
  USING (auth.uid() IS NOT NULL AND is_manager_or_admin(auth.uid()));

-- Count of bridged Bling orders visible in CarboHub dashboard
CREATE OR REPLACE VIEW public.bling_bridge_stats AS
SELECT
  COUNT(*) FILTER (WHERE co.external_ref IS NOT NULL AND co.source_file = 'bling_sync') AS bridged_orders,
  COUNT(*) FILTER (WHERE co.status = 'delivered' AND co.source_file = 'bling_sync') AS delivered_orders,
  COALESCE(SUM(co.total) FILTER (WHERE co.source_file = 'bling_sync'), 0) AS bridged_revenue
FROM carboze_orders co;
