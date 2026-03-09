
-- 1) MRP PRODUCTS: campos de estoque
ALTER TABLE public.mrp_products
  ADD COLUMN IF NOT EXISTS current_stock_qty integer NOT NULL DEFAULT 0;

ALTER TABLE public.mrp_products
  ADD COLUMN IF NOT EXISTS stock_updated_at date;

ALTER TABLE public.mrp_products
  ADD COLUMN IF NOT EXISTS stock_unit text NOT NULL DEFAULT 'un';

-- Unique constraint for upsert
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'mrp_products_product_code_key') THEN
    ALTER TABLE public.mrp_products ADD CONSTRAINT mrp_products_product_code_key UNIQUE (product_code);
  END IF;
END $$;

-- 2) ORDERS: colunas de governança/import
ALTER TABLE public.carboze_orders
  ADD COLUMN IF NOT EXISTS is_test boolean NOT NULL DEFAULT false;

ALTER TABLE public.carboze_orders
  ADD COLUMN IF NOT EXISTS source_file text;

ALTER TABLE public.carboze_orders
  ADD COLUMN IF NOT EXISTS external_ref text;

CREATE INDEX IF NOT EXISTS idx_carboze_orders_external_ref ON public.carboze_orders(external_ref);
CREATE INDEX IF NOT EXISTS idx_carboze_orders_source_file ON public.carboze_orders(source_file);

-- 3) Atualizar trigger validate_product_code para aceitar códigos com sufixo
CREATE OR REPLACE FUNCTION public.validate_product_code()
  RETURNS trigger
  LANGUAGE plpgsql
  SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.product_code NOT SIMILAR TO '(CARBOZE|CARBOVAPT|OUTROS)(%)?'  THEN
    RAISE EXCEPTION 'product_code must start with CARBOZE, CARBOVAPT or OUTROS';
  END IF;
  RETURN NEW;
END;
$function$;

-- 4) IMPORT RUNS (auditoria)
CREATE TABLE IF NOT EXISTS public.import_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  filename text NOT NULL,
  imported_by uuid,
  imported_at timestamptz NOT NULL DEFAULT now(),
  rows_imported integer NOT NULL DEFAULT 0,
  notes text
);

ALTER TABLE public.import_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage import_runs"
  ON public.import_runs FOR ALL
  USING (public.is_admin(auth.uid()) OR public.is_ceo(auth.uid()));
