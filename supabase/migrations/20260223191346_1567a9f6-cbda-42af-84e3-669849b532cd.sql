
-- =============================================
-- PART D: Add product_code to carboze_orders
-- =============================================
ALTER TABLE public.carboze_orders 
ADD COLUMN IF NOT EXISTS product_code text NOT NULL DEFAULT 'CARBOZE';

-- Use trigger validation instead of CHECK constraint
CREATE OR REPLACE FUNCTION public.validate_product_code()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.product_code NOT IN ('CARBOZE', 'CARBOVAPT', 'OUTROS') THEN
    RAISE EXCEPTION 'product_code must be CARBOZE, CARBOVAPT or OUTROS';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER trg_validate_product_code
BEFORE INSERT OR UPDATE ON public.carboze_orders
FOR EACH ROW
EXECUTE FUNCTION public.validate_product_code();

-- =============================================
-- PART E: MRP Products table
-- =============================================
CREATE TABLE IF NOT EXISTS public.mrp_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_code text UNIQUE NOT NULL,
  name text NOT NULL,
  category text,
  packaging_size_ml numeric NULL,
  packaging_size_g numeric NULL,
  package_qty integer NULL,
  min_order_qty integer NULL,
  dimensions_cm jsonb NULL,
  weight_kg numeric NULL,
  notes text NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.mrp_products ENABLE ROW LEVEL SECURITY;

-- Admin + CEO can do everything
CREATE POLICY "mrp_products_admin_select" ON public.mrp_products
  FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()) OR public.is_ceo(auth.uid()));

CREATE POLICY "mrp_products_admin_insert" ON public.mrp_products
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin(auth.uid()) OR public.is_ceo(auth.uid()));

CREATE POLICY "mrp_products_admin_update" ON public.mrp_products
  FOR UPDATE TO authenticated
  USING (public.is_admin(auth.uid()) OR public.is_ceo(auth.uid()));

CREATE POLICY "mrp_products_admin_delete" ON public.mrp_products
  FOR DELETE TO authenticated
  USING (public.is_admin(auth.uid()) OR public.is_ceo(auth.uid()));

-- Gestores can read
CREATE POLICY "mrp_products_gestor_select" ON public.mrp_products
  FOR SELECT TO authenticated
  USING (public.is_gestor(auth.uid()));

-- Updated_at trigger
CREATE TRIGGER update_mrp_products_updated_at
BEFORE UPDATE ON public.mrp_products
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- =============================================
-- PART F: MRP Suppliers table
-- =============================================
CREATE TABLE IF NOT EXISTS public.mrp_suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cnpj text UNIQUE NOT NULL,
  legal_name text,
  trade_name text,
  status text NOT NULL DEFAULT 'active',
  address jsonb,
  phones jsonb,
  emails jsonb,
  category text,
  raw jsonb,
  notes text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.mrp_suppliers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "mrp_suppliers_admin_select" ON public.mrp_suppliers
  FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()) OR public.is_ceo(auth.uid()));

CREATE POLICY "mrp_suppliers_admin_insert" ON public.mrp_suppliers
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin(auth.uid()) OR public.is_ceo(auth.uid()));

CREATE POLICY "mrp_suppliers_admin_update" ON public.mrp_suppliers
  FOR UPDATE TO authenticated
  USING (public.is_admin(auth.uid()) OR public.is_ceo(auth.uid()));

CREATE POLICY "mrp_suppliers_admin_delete" ON public.mrp_suppliers
  FOR DELETE TO authenticated
  USING (public.is_admin(auth.uid()) OR public.is_ceo(auth.uid()));

CREATE POLICY "mrp_suppliers_gestor_select" ON public.mrp_suppliers
  FOR SELECT TO authenticated
  USING (public.is_gestor(auth.uid()));

CREATE TRIGGER update_mrp_suppliers_updated_at
BEFORE UPDATE ON public.mrp_suppliers
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- =============================================
-- PART G: Governance pending_actions table
-- =============================================
CREATE TABLE IF NOT EXISTS public.pending_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requested_by uuid NOT NULL REFERENCES auth.users(id),
  action_type text NOT NULL,
  resource_type text NOT NULL,
  resource_id uuid,
  payload jsonb NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'pending',
  resolved_by uuid REFERENCES auth.users(id),
  resolved_at timestamptz,
  resolution_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.pending_actions ENABLE ROW LEVEL SECURITY;

-- Users can see their own requests
CREATE POLICY "pending_actions_own_select" ON public.pending_actions
  FOR SELECT TO authenticated
  USING (requested_by = auth.uid());

-- Users can create requests
CREATE POLICY "pending_actions_insert" ON public.pending_actions
  FOR INSERT TO authenticated
  WITH CHECK (requested_by = auth.uid());

-- Admin/CEO can see all and resolve
CREATE POLICY "pending_actions_admin_select" ON public.pending_actions
  FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()) OR public.is_ceo(auth.uid()));

CREATE POLICY "pending_actions_admin_update" ON public.pending_actions
  FOR UPDATE TO authenticated
  USING (public.is_admin(auth.uid()) OR public.is_ceo(auth.uid()));

CREATE TRIGGER update_pending_actions_updated_at
BEFORE UPDATE ON public.pending_actions
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
