
-- Table for inter-hub stock transfers
CREATE TABLE public.stock_transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.mrp_products(id),
  product_code text NOT NULL,
  from_hub uuid NOT NULL REFERENCES public.warehouses(id),
  to_hub uuid NOT NULL REFERENCES public.warehouses(id),
  quantity integer NOT NULL CHECK (quantity > 0),
  status text NOT NULL DEFAULT 'suggested',
  approved_by uuid REFERENCES auth.users(id),
  approved_at timestamptz,
  executed_by uuid REFERENCES auth.users(id),
  executed_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Index for fast lookups
CREATE INDEX idx_stock_transfers_product_code ON public.stock_transfers(product_code);
CREATE INDEX idx_stock_transfers_status ON public.stock_transfers(status);
CREATE INDEX idx_stock_transfers_product_id ON public.stock_transfers(product_id);

-- Enable RLS
ALTER TABLE public.stock_transfers ENABLE ROW LEVEL SECURITY;

-- All authenticated users can view transfers
CREATE POLICY "Authenticated users can view transfers"
ON public.stock_transfers FOR SELECT
TO authenticated
USING (true);

-- Only admin/ceo can insert (suggested transfers can also be created by trigger)
CREATE POLICY "Admins can create transfers"
ON public.stock_transfers FOR INSERT
TO authenticated
WITH CHECK (
  public.is_admin(auth.uid()) OR public.is_ceo(auth.uid())
);

-- Only admin/ceo can update (approve/execute)
CREATE POLICY "Admins can update transfers"
ON public.stock_transfers FOR UPDATE
TO authenticated
USING (
  public.is_admin(auth.uid()) OR public.is_ceo(auth.uid())
);

-- Trigger for updated_at
CREATE TRIGGER update_stock_transfers_updated_at
BEFORE UPDATE ON public.stock_transfers
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Validation trigger for status
CREATE OR REPLACE FUNCTION public.validate_stock_transfer_status()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.status NOT IN ('suggested', 'approved', 'executed', 'cancelled') THEN
    RAISE EXCEPTION 'Invalid transfer status: %', NEW.status;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validate_stock_transfer_status
BEFORE INSERT OR UPDATE ON public.stock_transfers
FOR EACH ROW
EXECUTE FUNCTION public.validate_stock_transfer_status();

-- Function to suggest transfers before creating OP
-- This replaces direct OP creation when inter-hub balancing is possible
CREATE OR REPLACE FUNCTION public.suggest_hub_transfer_before_op()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_hub RECORD;
  v_deficit_hub RECORD;
  v_surplus_hub RECORD;
  v_hub_count integer;
  v_hub_target integer;
  v_transfer_qty integer;
  v_has_pending_transfer boolean;
BEGIN
  -- Only check when stock decreases below safety
  IF NEW.current_stock_qty >= NEW.safety_stock_qty OR NEW.safety_stock_qty <= 0 THEN
    RETURN NEW;
  END IF;

  -- Count active warehouses
  SELECT COUNT(*) INTO v_hub_count FROM public.warehouses WHERE is_active = true;
  IF v_hub_count < 2 THEN
    RETURN NEW; -- Can't transfer with < 2 hubs
  END IF;

  v_hub_target := CEIL(NEW.safety_stock_qty::numeric / v_hub_count);

  -- Check if there's already a pending transfer for this product
  SELECT EXISTS (
    SELECT 1 FROM public.stock_transfers
    WHERE product_id = NEW.id AND status IN ('suggested', 'approved')
  ) INTO v_has_pending_transfer;

  IF v_has_pending_transfer THEN
    RETURN NEW;
  END IF;

  -- Find deficit hub (lowest stock below target)
  SELECT ws.warehouse_id, ws.quantity INTO v_deficit_hub
  FROM public.warehouse_stock ws
  WHERE ws.product_id = NEW.id AND ws.quantity < v_hub_target
  ORDER BY ws.quantity ASC
  LIMIT 1;

  -- Find surplus hub (highest stock above target)
  SELECT ws.warehouse_id, ws.quantity INTO v_surplus_hub
  FROM public.warehouse_stock ws
  WHERE ws.product_id = NEW.id AND ws.quantity > v_hub_target
  ORDER BY ws.quantity DESC
  LIMIT 1;

  IF v_deficit_hub IS NOT NULL AND v_surplus_hub IS NOT NULL THEN
    v_transfer_qty := LEAST(
      v_surplus_hub.quantity - v_hub_target,
      v_hub_target - v_deficit_hub.quantity
    );

    IF v_transfer_qty > 0 THEN
      INSERT INTO public.stock_transfers (
        product_id, product_code, from_hub, to_hub, quantity, status, notes
      ) VALUES (
        NEW.id, NEW.product_code, v_surplus_hub.warehouse_id, v_deficit_hub.warehouse_id,
        v_transfer_qty, 'suggested',
        format('Sugestão automática: Hub com %s un excedentes → Hub com déficit de %s un', 
               v_surplus_hub.quantity - v_hub_target, v_hub_target - v_deficit_hub.quantity)
      );
      -- Don't create OP yet, transfer suggested first
      RETURN NEW;
    END IF;
  END IF;

  -- If no transfer possible, let the existing create_auto_op_if_needed handle it
  RETURN NEW;
END;
$$;

-- Add trigger BEFORE the existing auto OP trigger
CREATE TRIGGER trg_suggest_hub_transfer
BEFORE UPDATE OF current_stock_qty ON public.mrp_products
FOR EACH ROW
EXECUTE FUNCTION public.suggest_hub_transfer_before_op();
