
-- ============================================================
-- C1) Helper functions for RLS
-- ============================================================

-- Check if user is manager of another user
CREATE OR REPLACE FUNCTION public.is_manager_of(_viewer_id uuid, _target_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = _target_user_id
      AND manager_user_id = _viewer_id
  )
$$;

-- ============================================================
-- C2) Masked view for carboze_orders PII
-- ============================================================

-- Drop existing view if it exists to recreate
DROP VIEW IF EXISTS public.carboze_orders_masked;

CREATE VIEW public.carboze_orders_masked
WITH (security_invoker = true)
AS
SELECT
  id, order_number, order_type, product_code, status,
  customer_name,
  -- Mask email: show first 3 chars + domain
  CASE 
    WHEN customer_email IS NOT NULL AND customer_email LIKE '%@%' 
    THEN LEFT(customer_email, 3) || '***@' || SPLIT_PART(customer_email, '@', 2)
    ELSE NULL
  END AS customer_email,
  -- Mask phone: show last 4 digits
  CASE 
    WHEN customer_phone IS NOT NULL AND LENGTH(customer_phone) > 4 
    THEN '***' || RIGHT(customer_phone, 4)
    ELSE NULL
  END AS customer_phone,
  -- Partial address: city + state only
  delivery_city, delivery_state,
  NULL::text AS delivery_address,
  NULL::text AS delivery_zip,
  -- Non-PII fields
  cnpj, legal_name, trade_name,
  items, subtotal, discount, shipping_cost, total,
  notes, internal_notes, internal_classification,
  licensee_id, created_by, created_at, updated_at,
  confirmed_at, shipped_at, delivered_at, invoiced_at,
  cancelled_at, cancellation_reason,
  invoice_number, tracking_code, tracking_url,
  is_recurring, recurrence_interval_days,
  is_test, source_file, external_ref,
  has_commission, commission_rate, commission_amount, commission_paid_at,
  point_type, order_number AS aceite_ref,
  latitude, longitude
FROM public.carboze_orders;

-- ============================================================
-- C3) RPC for sensitive order data (admin/master_admin only)
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_carboze_order_sensitive(_order_id uuid)
RETURNS TABLE(
  customer_email text,
  customer_phone text,
  delivery_address text,
  delivery_zip text,
  cnpj text,
  delivery_city text,
  delivery_state text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Only admin or CEO can access full PII
  IF NOT (is_admin(auth.uid()) OR is_ceo(auth.uid())) THEN
    RAISE EXCEPTION 'Access denied: requires admin or CEO role';
  END IF;

  RETURN QUERY
  SELECT 
    co.customer_email,
    co.customer_phone,
    co.delivery_address,
    co.delivery_zip,
    co.cnpj,
    co.delivery_city,
    co.delivery_state
  FROM public.carboze_orders co
  WHERE co.id = _order_id;
END;
$$;
