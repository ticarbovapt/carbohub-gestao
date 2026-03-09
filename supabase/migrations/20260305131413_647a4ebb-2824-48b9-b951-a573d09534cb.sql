
-- Fix search_path warnings on the two new functions

CREATE OR REPLACE FUNCTION public.is_manager_of(_viewer_id uuid, _target_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = _target_user_id
      AND manager_user_id = _viewer_id
  )
$$;

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
SET search_path = 'public'
AS $$
BEGIN
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
