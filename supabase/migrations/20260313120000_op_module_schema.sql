-- ============================================================
-- MIGRATION: OP Module Schema (Ordem de Produção)
-- PRD: carboops_prd_arquitetura_processo.md
-- ============================================================

-- ============================================================
-- PART 1: ENUM TYPES
-- ============================================================

DO $$ BEGIN
  CREATE TYPE op_status AS ENUM (
    'rascunho','planejada','aguardando_separacao','separada',
    'aguardando_liberacao','liberada_producao','em_producao',
    'aguardando_confirmacao','confirmada','aguardando_qualidade',
    'liberada','concluida','bloqueada','cancelada'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE demand_source AS ENUM ('venda','recorrencia','safety_stock','pcp_manual');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE lot_status AS ENUM (
    'criado','recebido','em_quarentena','amostrado',
    'aprovado','bloqueado','reprovado','encerrado'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE quality_result AS ENUM ('aprovada','bloqueada','reprovada','pendente');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE quality_entity_type AS ENUM ('lot','production_order');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE suggestion_status AS ENUM ('pendente','aprovada','convertida_em_rc','descartada');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================
-- PART 2: TABLE — sku
-- ============================================================

CREATE TABLE IF NOT EXISTS public.sku (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  category text,
  unit text NOT NULL DEFAULT 'un',
  packaging_ml integer,
  is_active boolean NOT NULL DEFAULT true,
  safety_stock_qty integer NOT NULL DEFAULT 0,
  target_coverage_days integer NOT NULL DEFAULT 30,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.sku ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sku_admin_all" ON public.sku FOR ALL
  USING (is_admin(auth.uid()) OR is_ceo(auth.uid()));

CREATE POLICY "sku_gestor_all" ON public.sku FOR ALL
  USING (is_gestor(auth.uid()));

CREATE POLICY "sku_operador_select" ON public.sku FOR SELECT
  USING (has_carbo_role(auth.uid(), 'operador'));

CREATE TRIGGER trg_sku_updated_at
  BEFORE UPDATE ON public.sku
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- PART 3: TABLE — sku_bom
-- ============================================================

CREATE TABLE IF NOT EXISTS public.sku_bom (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  sku_id uuid NOT NULL REFERENCES public.sku(id) ON DELETE CASCADE,
  version integer NOT NULL DEFAULT 1,
  is_active boolean NOT NULL DEFAULT true,
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- items format: [{"product_id":"uuid","quantity_per_unit":1.0,"unit":"un","is_critical":true}]
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(sku_id, version)
);

ALTER TABLE public.sku_bom ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sku_bom_admin_all" ON public.sku_bom FOR ALL
  USING (is_admin(auth.uid()) OR is_ceo(auth.uid()));

CREATE POLICY "sku_bom_gestor_all" ON public.sku_bom FOR ALL
  USING (is_gestor(auth.uid()));

CREATE POLICY "sku_bom_operador_select" ON public.sku_bom FOR SELECT
  USING (has_carbo_role(auth.uid(), 'operador'));

CREATE TRIGGER trg_sku_bom_updated_at
  BEFORE UPDATE ON public.sku_bom
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- PART 4: TABLE — inventory_lot (lotes de reagente 200L)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.inventory_lot (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  lot_code text NOT NULL UNIQUE,
  product_id uuid NOT NULL REFERENCES public.mrp_products(id),
  initial_volume_ml numeric NOT NULL DEFAULT 200000,
  available_volume_ml numeric NOT NULL DEFAULT 200000,
  status lot_status NOT NULL DEFAULT 'criado',
  supplier_id uuid REFERENCES public.suppliers(id),
  received_at timestamptz,
  released_at timestamptz,
  expired_at timestamptz,
  quality_responsible_id uuid REFERENCES auth.users(id),
  expected_samples integer NOT NULL DEFAULT 3,
  collected_samples integer NOT NULL DEFAULT 0,
  notes text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.inventory_lot ENABLE ROW LEVEL SECURITY;

CREATE POLICY "inventory_lot_admin_all" ON public.inventory_lot FOR ALL
  USING (is_admin(auth.uid()) OR is_ceo(auth.uid()));

CREATE POLICY "inventory_lot_gestor_all" ON public.inventory_lot FOR ALL
  USING (is_gestor(auth.uid()));

CREATE POLICY "inventory_lot_operador_select" ON public.inventory_lot FOR SELECT
  USING (has_carbo_role(auth.uid(), 'operador'));

-- Auto-numbering: LOT-YYYY-#####
CREATE OR REPLACE FUNCTION public.generate_lot_code()
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
    CAST(SUBSTRING(lot_code FROM 'LOT-\d{4}-(\d+)') AS INTEGER)
  ), 0) + 1
  INTO next_seq
  FROM public.inventory_lot
  WHERE lot_code LIKE 'LOT-' || year_prefix || '-%';
  NEW.lot_code := 'LOT-' || year_prefix || '-' || LPAD(next_seq::TEXT, 5, '0');
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_generate_lot_code
  BEFORE INSERT ON public.inventory_lot
  FOR EACH ROW
  WHEN (NEW.lot_code IS NULL OR NEW.lot_code = '')
  EXECUTE FUNCTION public.generate_lot_code();

CREATE TRIGGER trg_inventory_lot_updated_at
  BEFORE UPDATE ON public.inventory_lot
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- PART 5: TABLE — inventory_lot_consumption
-- ============================================================

CREATE TABLE IF NOT EXISTS public.inventory_lot_consumption (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  lot_id uuid NOT NULL REFERENCES public.inventory_lot(id) ON DELETE CASCADE,
  production_order_id uuid NOT NULL REFERENCES public.production_orders(id) ON DELETE CASCADE,
  volume_consumed_ml numeric NOT NULL,
  consumed_at timestamptz NOT NULL DEFAULT now(),
  consumed_by uuid REFERENCES auth.users(id)
);

ALTER TABLE public.inventory_lot_consumption ENABLE ROW LEVEL SECURITY;

CREATE POLICY "lot_consumption_admin_all" ON public.inventory_lot_consumption FOR ALL
  USING (is_admin(auth.uid()) OR is_ceo(auth.uid()));

CREATE POLICY "lot_consumption_gestor_all" ON public.inventory_lot_consumption FOR ALL
  USING (is_gestor(auth.uid()));

CREATE POLICY "lot_consumption_operador_select" ON public.inventory_lot_consumption FOR SELECT
  USING (has_carbo_role(auth.uid(), 'operador'));

-- ============================================================
-- PART 6: EXTEND production_orders
-- ============================================================

-- Add new columns
ALTER TABLE public.production_orders
  ADD COLUMN IF NOT EXISTS sku_id uuid REFERENCES public.sku(id),
  ADD COLUMN IF NOT EXISTS planned_quantity integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS good_quantity integer,
  ADD COLUMN IF NOT EXISTS rejected_quantity integer,
  ADD COLUMN IF NOT EXISTS linked_order_ids uuid[],
  ADD COLUMN IF NOT EXISTS demand_source demand_source,
  ADD COLUMN IF NOT EXISTS need_date timestamptz,
  ADD COLUMN IF NOT EXISTS priority integer NOT NULL DEFAULT 3 CHECK (priority BETWEEN 1 AND 5),
  ADD COLUMN IF NOT EXISTS suggested_lot_id uuid REFERENCES public.inventory_lot(id),
  ADD COLUMN IF NOT EXISTS confirmed_lot_id uuid REFERENCES public.inventory_lot(id),
  ADD COLUMN IF NOT EXISTS pcp_responsible_id uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS operator_id uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS started_at timestamptz,
  ADD COLUMN IF NOT EXISTS finished_at timestamptz,
  ADD COLUMN IF NOT EXISTS quality_result quality_result DEFAULT 'pendente',
  ADD COLUMN IF NOT EXISTS destination_warehouse_id uuid REFERENCES public.warehouses(id),
  ADD COLUMN IF NOT EXISTS deviation_notes text,
  ADD COLUMN IF NOT EXISTS op_status op_status NOT NULL DEFAULT 'rascunho';

-- Migrate existing status values to op_status
-- (existing rows have text status 'pending'/'in_progress'/'completed'/'cancelled')
UPDATE public.production_orders SET op_status = 'planejada' WHERE status = 'pending' AND op_status = 'rascunho';
UPDATE public.production_orders SET op_status = 'em_producao' WHERE status = 'in_progress' AND op_status = 'rascunho';
UPDATE public.production_orders SET op_status = 'concluida' WHERE status = 'completed' AND op_status = 'rascunho';
UPDATE public.production_orders SET op_status = 'cancelada' WHERE status = 'cancelled' AND op_status = 'rascunho';

-- Sync planned_quantity from quantity for existing rows
UPDATE public.production_orders SET planned_quantity = quantity WHERE planned_quantity = 0 AND quantity > 0;

-- Map existing source to demand_source
UPDATE public.production_orders SET demand_source = 'safety_stock' WHERE source = 'safety_stock' AND demand_source IS NULL;
UPDATE public.production_orders SET demand_source = 'pcp_manual' WHERE source = 'manual' AND demand_source IS NULL;

-- Create index on op_status for workflow queries
CREATE INDEX IF NOT EXISTS idx_production_orders_op_status ON public.production_orders(op_status);
CREATE INDEX IF NOT EXISTS idx_production_orders_sku_id ON public.production_orders(sku_id);
CREATE INDEX IF NOT EXISTS idx_production_orders_need_date ON public.production_orders(need_date);

-- Add RLS for operador: can view OPs assigned to them
DROP POLICY IF EXISTS "production_orders_operador_select" ON public.production_orders;
CREATE POLICY "production_orders_operador_select"
  ON public.production_orders FOR SELECT
  USING (
    has_carbo_role(auth.uid(), 'operador')
    AND (operator_id = auth.uid() OR pcp_responsible_id = auth.uid())
  );

-- Add RLS for operador: can update OPs assigned to them
DROP POLICY IF EXISTS "production_orders_operador_update" ON public.production_orders;
CREATE POLICY "production_orders_operador_update"
  ON public.production_orders FOR UPDATE
  USING (
    has_carbo_role(auth.uid(), 'operador')
    AND operator_id = auth.uid()
  );

-- Gestor can do everything (not just select)
DROP POLICY IF EXISTS "production_orders_gestor_select" ON public.production_orders;
CREATE POLICY "production_orders_gestor_all"
  ON public.production_orders FOR ALL
  USING (is_gestor(auth.uid()));

-- ============================================================
-- PART 7: TABLE — production_order_material
-- ============================================================

CREATE TABLE IF NOT EXISTS public.production_order_material (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  production_order_id uuid NOT NULL REFERENCES public.production_orders(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.mrp_products(id),
  theoretical_quantity numeric NOT NULL DEFAULT 0,
  separated_quantity numeric NOT NULL DEFAULT 0,
  is_separated boolean NOT NULL DEFAULT false,
  separated_at timestamptz,
  separated_by uuid REFERENCES auth.users(id),
  is_critical boolean NOT NULL DEFAULT false,
  warehouse_id uuid REFERENCES public.warehouses(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.production_order_material ENABLE ROW LEVEL SECURITY;

CREATE POLICY "po_material_admin_all" ON public.production_order_material FOR ALL
  USING (is_admin(auth.uid()) OR is_ceo(auth.uid()));

CREATE POLICY "po_material_gestor_all" ON public.production_order_material FOR ALL
  USING (is_gestor(auth.uid()));

CREATE POLICY "po_material_operador_select" ON public.production_order_material FOR SELECT
  USING (has_carbo_role(auth.uid(), 'operador'));

CREATE INDEX IF NOT EXISTS idx_po_material_order_id ON public.production_order_material(production_order_id);

CREATE TRIGGER trg_po_material_updated_at
  BEFORE UPDATE ON public.production_order_material
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- PART 8: TABLE — production_confirmation
-- ============================================================

CREATE TABLE IF NOT EXISTS public.production_confirmation (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  production_order_id uuid NOT NULL UNIQUE REFERENCES public.production_orders(id) ON DELETE CASCADE,
  good_quantity integer NOT NULL DEFAULT 0,
  rejected_quantity integer NOT NULL DEFAULT 0,
  rejection_reason text,
  deviation_notes text,
  bom_adherence_pct numeric,
  yield_pct numeric,
  confirmed_by uuid REFERENCES auth.users(id),
  confirmed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.production_confirmation ENABLE ROW LEVEL SECURITY;

CREATE POLICY "po_confirm_admin_all" ON public.production_confirmation FOR ALL
  USING (is_admin(auth.uid()) OR is_ceo(auth.uid()));

CREATE POLICY "po_confirm_gestor_all" ON public.production_confirmation FOR ALL
  USING (is_gestor(auth.uid()));

CREATE POLICY "po_confirm_operador_insert" ON public.production_confirmation FOR INSERT
  WITH CHECK (has_carbo_role(auth.uid(), 'operador'));

CREATE POLICY "po_confirm_operador_select" ON public.production_confirmation FOR SELECT
  USING (has_carbo_role(auth.uid(), 'operador'));

-- ============================================================
-- PART 9: TABLE — production_confirmation_item
-- ============================================================

CREATE TABLE IF NOT EXISTS public.production_confirmation_item (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  confirmation_id uuid NOT NULL REFERENCES public.production_confirmation(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.mrp_products(id),
  theoretical_quantity numeric NOT NULL DEFAULT 0,
  actual_quantity numeric NOT NULL DEFAULT 0,
  loss_quantity numeric NOT NULL DEFAULT 0,
  loss_reason text,
  lot_id uuid REFERENCES public.inventory_lot(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.production_confirmation_item ENABLE ROW LEVEL SECURITY;

CREATE POLICY "po_confirm_item_admin_all" ON public.production_confirmation_item FOR ALL
  USING (is_admin(auth.uid()) OR is_ceo(auth.uid()));

CREATE POLICY "po_confirm_item_gestor_all" ON public.production_confirmation_item FOR ALL
  USING (is_gestor(auth.uid()));

CREATE POLICY "po_confirm_item_operador_insert" ON public.production_confirmation_item FOR INSERT
  WITH CHECK (has_carbo_role(auth.uid(), 'operador'));

CREATE POLICY "po_confirm_item_operador_select" ON public.production_confirmation_item FOR SELECT
  USING (has_carbo_role(auth.uid(), 'operador'));

CREATE INDEX IF NOT EXISTS idx_po_confirm_item_confirm_id ON public.production_confirmation_item(confirmation_id);

-- ============================================================
-- PART 10: TABLE — quality_check
-- ============================================================

CREATE TABLE IF NOT EXISTS public.quality_check (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  entity_type quality_entity_type NOT NULL,
  entity_id uuid NOT NULL,
  checklist_items jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- format: [{"item":"Verificar rótulo","checked":false,"notes":""}]
  result quality_result NOT NULL DEFAULT 'pendente',
  checked_by uuid REFERENCES auth.users(id),
  checked_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.quality_check ENABLE ROW LEVEL SECURITY;

CREATE POLICY "quality_check_admin_all" ON public.quality_check FOR ALL
  USING (is_admin(auth.uid()) OR is_ceo(auth.uid()));

CREATE POLICY "quality_check_gestor_all" ON public.quality_check FOR ALL
  USING (is_gestor(auth.uid()));

CREATE POLICY "quality_check_operador_select" ON public.quality_check FOR SELECT
  USING (has_carbo_role(auth.uid(), 'operador'));

CREATE INDEX IF NOT EXISTS idx_quality_check_entity ON public.quality_check(entity_type, entity_id);

-- ============================================================
-- PART 11: TABLE — replenishment_policy
-- ============================================================

CREATE TABLE IF NOT EXISTS public.replenishment_policy (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id uuid NOT NULL UNIQUE REFERENCES public.mrp_products(id),
  safety_stock_qty integer NOT NULL DEFAULT 0,
  min_coverage_days integer NOT NULL DEFAULT 30,
  lead_time_days integer NOT NULL DEFAULT 30,
  weekly_capacity integer,
  purchase_multiple integer DEFAULT 1,
  supplier_id uuid REFERENCES public.suppliers(id),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.replenishment_policy ENABLE ROW LEVEL SECURITY;

CREATE POLICY "replenishment_policy_admin_all" ON public.replenishment_policy FOR ALL
  USING (is_admin(auth.uid()) OR is_ceo(auth.uid()));

CREATE POLICY "replenishment_policy_gestor_all" ON public.replenishment_policy FOR ALL
  USING (is_gestor(auth.uid()));

CREATE POLICY "replenishment_policy_operador_select" ON public.replenishment_policy FOR SELECT
  USING (has_carbo_role(auth.uid(), 'operador'));

CREATE TRIGGER trg_replenishment_policy_updated_at
  BEFORE UPDATE ON public.replenishment_policy
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- PART 12: TABLE — replenishment_suggestion
-- ============================================================

CREATE TABLE IF NOT EXISTS public.replenishment_suggestion (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id uuid NOT NULL REFERENCES public.mrp_products(id),
  suggested_quantity integer NOT NULL,
  reason text,
  current_stock integer NOT NULL DEFAULT 0,
  reserved_stock integer NOT NULL DEFAULT 0,
  projected_stock integer NOT NULL DEFAULT 0,
  days_until_rupture integer,
  status suggestion_status NOT NULL DEFAULT 'pendente',
  approved_by uuid REFERENCES auth.users(id),
  approved_at timestamptz,
  rc_id uuid REFERENCES public.rc_requests(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.replenishment_suggestion ENABLE ROW LEVEL SECURITY;

CREATE POLICY "replenishment_suggestion_admin_all" ON public.replenishment_suggestion FOR ALL
  USING (is_admin(auth.uid()) OR is_ceo(auth.uid()));

CREATE POLICY "replenishment_suggestion_gestor_all" ON public.replenishment_suggestion FOR ALL
  USING (is_gestor(auth.uid()));

CREATE POLICY "replenishment_suggestion_operador_select" ON public.replenishment_suggestion FOR SELECT
  USING (has_carbo_role(auth.uid(), 'operador'));

CREATE INDEX IF NOT EXISTS idx_replenishment_suggestion_product ON public.replenishment_suggestion(product_id);
CREATE INDEX IF NOT EXISTS idx_replenishment_suggestion_status ON public.replenishment_suggestion(status);
