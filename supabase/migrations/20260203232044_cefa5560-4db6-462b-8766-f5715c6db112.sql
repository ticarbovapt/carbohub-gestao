-- Add RLS policies to carboze_orders_secure view
-- Views inherit RLS from base tables, but we need to enable RLS on the view itself

-- First, let's create a proper policy for the secure view that inherits the same access as the base table
-- Views in PostgreSQL inherit RLS from their base tables automatically when security_invoker is set
-- Let's ensure the view works correctly by granting access

-- Drop and recreate the view with security_invoker = true to inherit base table RLS
DROP VIEW IF EXISTS public.carboze_orders_secure;

CREATE VIEW public.carboze_orders_secure 
WITH (security_invoker = true)
AS
SELECT
  id,
  order_number,
  licensee_id,
  status,
  items,
  subtotal,
  discount,
  shipping_cost,
  total,
  has_commission,
  commission_rate,
  commission_amount,
  commission_paid_at,
  notes,
  internal_notes,
  invoice_number,
  invoiced_at,
  confirmed_at,
  shipped_at,
  delivered_at,
  cancelled_at,
  cancellation_reason,
  tracking_code,
  tracking_url,
  created_at,
  updated_at,
  created_by,
  -- Mask sensitive customer data for non-admins
  CASE 
    WHEN public.is_admin(auth.uid()) THEN customer_name
    ELSE regexp_replace(customer_name, '^(.{2}).*(.{2})$', '\1***\2')
  END AS customer_name,
  CASE 
    WHEN public.is_admin(auth.uid()) THEN customer_email
    ELSE regexp_replace(customer_email, '^(.{2}).*(@.*)$', '\1***\2')
  END AS customer_email,
  CASE 
    WHEN public.is_admin(auth.uid()) THEN customer_phone
    ELSE CASE WHEN customer_phone IS NOT NULL THEN '****-****' ELSE NULL END
  END AS customer_phone,
  CASE 
    WHEN public.is_admin(auth.uid()) THEN delivery_address
    ELSE CASE WHEN delivery_address IS NOT NULL THEN '****' ELSE NULL END
  END AS delivery_address,
  delivery_city,
  delivery_state,
  CASE 
    WHEN public.is_admin(auth.uid()) THEN delivery_zip
    ELSE CASE WHEN delivery_zip IS NOT NULL THEN '*****-***' ELSE NULL END
  END AS delivery_zip
FROM public.carboze_orders;

-- Grant access to authenticated users (RLS will handle row-level filtering)
GRANT SELECT ON public.carboze_orders_secure TO authenticated;

COMMENT ON VIEW public.carboze_orders_secure IS 'Secure view for orders that masks PII for non-admin users. Uses security_invoker to inherit RLS from base table.';