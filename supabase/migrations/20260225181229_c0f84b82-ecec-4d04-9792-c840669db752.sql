
-- ============================================================
-- PART 1: Add safety_stock_qty to mrp_products
-- ============================================================
ALTER TABLE public.mrp_products
ADD COLUMN IF NOT EXISTS safety_stock_qty integer NOT NULL DEFAULT 0;

-- ============================================================
-- PART 2: production_orders table for auto OPs
-- ============================================================
CREATE TABLE IF NOT EXISTS public.production_orders (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  op_number text NOT NULL,
  product_id uuid NOT NULL REFERENCES public.mrp_products(id),
  product_code text NOT NULL,
  quantity integer NOT NULL DEFAULT 0,
  source text NOT NULL DEFAULT 'manual',
  type text NOT NULL DEFAULT 'manual',
  status text NOT NULL DEFAULT 'pending',
  created_by uuid,
  resolved_at timestamptz,
  resolved_by uuid,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.production_orders ENABLE ROW LEVEL SECURITY;

-- RLS: Admin/CEO can manage
CREATE POLICY "production_orders_admin_all"
  ON public.production_orders FOR ALL
  USING (is_admin(auth.uid()) OR is_ceo(auth.uid()));

-- RLS: Gestor can view
CREATE POLICY "production_orders_gestor_select"
  ON public.production_orders FOR SELECT
  USING (is_gestor(auth.uid()));

-- OP number generator
CREATE OR REPLACE FUNCTION public.generate_op_number()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  year_prefix TEXT;
  next_seq INTEGER;
BEGIN
  year_prefix := to_char(now(), 'YYYY');
  SELECT COALESCE(MAX(
    CAST(SUBSTRING(op_number FROM 'OP-\d{4}-(\d+)') AS INTEGER)
  ), 0) + 1
  INTO next_seq
  FROM public.production_orders
  WHERE op_number LIKE 'OP-' || year_prefix || '-%';
  NEW.op_number := 'OP-' || year_prefix || '-' || LPAD(next_seq::TEXT, 5, '0');
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_generate_op_number
  BEFORE INSERT ON public.production_orders
  FOR EACH ROW
  WHEN (NEW.op_number IS NULL OR NEW.op_number = '')
  EXECUTE FUNCTION public.generate_op_number();

-- Updated_at trigger
CREATE TRIGGER trg_production_orders_updated_at
  BEFORE UPDATE ON public.production_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- PART 3: Auto-OP creation function
-- ============================================================
CREATE OR REPLACE FUNCTION public.create_auto_op_if_needed()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing_count integer;
  v_deficit integer;
BEGIN
  -- Only check when stock decreases
  IF NEW.current_stock_qty >= NEW.safety_stock_qty OR NEW.safety_stock_qty <= 0 THEN
    RETURN NEW;
  END IF;

  -- Check for existing open auto OP for this product
  SELECT COUNT(*) INTO v_existing_count
  FROM public.production_orders
  WHERE product_id = NEW.id
    AND source = 'safety_stock'
    AND status IN ('pending', 'in_progress');

  IF v_existing_count > 0 THEN
    RETURN NEW; -- idempotent
  END IF;

  -- Calculate deficit: produce enough to reach 2x safety stock
  v_deficit := (NEW.safety_stock_qty * 2) - NEW.current_stock_qty;
  IF v_deficit <= 0 THEN v_deficit := NEW.safety_stock_qty; END IF;

  INSERT INTO public.production_orders (
    op_number, product_id, product_code, quantity,
    source, type, status, notes
  ) VALUES (
    '', NEW.id, NEW.product_code, v_deficit,
    'safety_stock', 'auto_replenishment', 'pending',
    format('OP automática: estoque atual (%s) abaixo do nível de segurança (%s)', NEW.current_stock_qty, NEW.safety_stock_qty)
  );

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_auto_op_on_stock_change
  AFTER UPDATE OF current_stock_qty ON public.mrp_products
  FOR EACH ROW
  EXECUTE FUNCTION public.create_auto_op_if_needed();
