
-- 1) Add missing columns to stock_transfers
ALTER TABLE public.stock_transfers
ADD COLUMN IF NOT EXISTS suggested_reason text,
ADD COLUMN IF NOT EXISTS requested_by uuid;

-- 2) Create op_suggestions table
CREATE TABLE IF NOT EXISTS public.op_suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_code text NOT NULL,
  product_id uuid REFERENCES public.mrp_products(id),
  hub_origin_id uuid NOT NULL REFERENCES public.warehouses(id),
  target_hub_id uuid REFERENCES public.warehouses(id),
  suggested_qty integer NOT NULL CHECK (suggested_qty > 0),
  status text NOT NULL DEFAULT 'suggested',
  reason text,
  approved_by uuid,
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Validation trigger for op_suggestions status
CREATE OR REPLACE FUNCTION public.validate_op_suggestion_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.status NOT IN ('suggested', 'approved', 'rejected', 'created') THEN
    RAISE EXCEPTION 'Invalid op_suggestion status: %', NEW.status;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validate_op_suggestion_status
BEFORE INSERT OR UPDATE ON public.op_suggestions
FOR EACH ROW EXECUTE FUNCTION public.validate_op_suggestion_status();

-- Update stock_transfers status validation to include 'rejected'
CREATE OR REPLACE FUNCTION public.validate_stock_transfer_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.status NOT IN ('suggested', 'approved', 'rejected', 'executed', 'cancelled') THEN
    RAISE EXCEPTION 'Invalid transfer status: %', NEW.status;
  END IF;
  RETURN NEW;
END;
$$;

-- Index
CREATE INDEX IF NOT EXISTS idx_op_suggestions_status ON public.op_suggestions(status);
CREATE INDEX IF NOT EXISTS idx_op_suggestions_product ON public.op_suggestions(product_code);

-- RLS
ALTER TABLE public.op_suggestions ENABLE ROW LEVEL SECURITY;

-- Read: Admin, CEO, or users with supply roles
CREATE POLICY "Supply roles can view op_suggestions"
ON public.op_suggestions FOR SELECT
USING (
  public.is_admin(auth.uid()) OR public.is_ceo(auth.uid())
  OR public.has_carbo_role(auth.uid(), 'gestor_compras')
);

-- Insert: system or admin
CREATE POLICY "Admin can insert op_suggestions"
ON public.op_suggestions FOR INSERT
WITH CHECK (
  public.is_admin(auth.uid()) OR public.is_ceo(auth.uid())
  OR public.has_carbo_role(auth.uid(), 'gestor_compras')
);

-- Update: admin/CEO/supply managers only
CREATE POLICY "Admin can update op_suggestions"
ON public.op_suggestions FOR UPDATE
USING (
  public.is_admin(auth.uid()) OR public.is_ceo(auth.uid())
  OR public.has_carbo_role(auth.uid(), 'gestor_compras')
);
