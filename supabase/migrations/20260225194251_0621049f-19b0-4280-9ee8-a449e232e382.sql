
-- Fix search_path warnings
CREATE OR REPLACE FUNCTION public.validate_stock_transfer_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.status NOT IN ('suggested', 'approved', 'executed', 'cancelled') THEN
    RAISE EXCEPTION 'Invalid transfer status: %', NEW.status;
  END IF;
  RETURN NEW;
END;
$$;
