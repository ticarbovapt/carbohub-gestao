
-- ================================================
-- 1) Add strategic columns to carboze_orders
-- ================================================
ALTER TABLE public.carboze_orders
  ADD COLUMN IF NOT EXISTS cnpj text,
  ADD COLUMN IF NOT EXISTS legal_name text,
  ADD COLUMN IF NOT EXISTS trade_name text,
  ADD COLUMN IF NOT EXISTS cnae text,
  ADD COLUMN IF NOT EXISTS situacao_cadastral text,
  ADD COLUMN IF NOT EXISTS point_type text,
  ADD COLUMN IF NOT EXISTS latitude double precision,
  ADD COLUMN IF NOT EXISTS longitude double precision,
  ADD COLUMN IF NOT EXISTS avg_monthly_vehicles integer,
  ADD COLUMN IF NOT EXISTS works_with_diesel boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS works_with_fleets boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS internal_classification text DEFAULT 'lead',
  ADD COLUMN IF NOT EXISTS aceite_assinado boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS aceite_pdf_url text;

-- ================================================
-- 2) Create immutable order_audit_logs table
-- ================================================
CREATE TABLE IF NOT EXISTS public.order_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id),
  role text,
  action text NOT NULL,
  table_name text NOT NULL,
  record_id uuid,
  before_data jsonb,
  after_data jsonb,
  ip_address text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.order_audit_logs ENABLE ROW LEVEL SECURITY;

-- Only authenticated users can INSERT (no update/delete ever)
CREATE POLICY "Authenticated users can insert audit logs"
  ON public.order_audit_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Only admin/CEO can read audit logs
CREATE POLICY "Admins and CEO can read audit logs"
  ON public.order_audit_logs
  FOR SELECT
  TO authenticated
  USING (
    public.is_admin(auth.uid()) OR public.is_ceo(auth.uid())
  );

-- Explicitly deny UPDATE and DELETE by not creating policies for them
-- RLS is enabled so no UPDATE/DELETE is possible

-- ================================================
-- 3) Validation trigger for point_type
-- ================================================
CREATE OR REPLACE FUNCTION public.validate_order_point_type()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.point_type IS NOT NULL AND NEW.point_type NOT IN ('posto', 'oficina', 'frota', 'pdv', 'licenciado') THEN
    RAISE EXCEPTION 'Tipo de ponto inválido: %', NEW.point_type;
  END IF;
  IF NEW.internal_classification IS NOT NULL AND NEW.internal_classification NOT IN ('lead', 'pdv', 'licenciado') THEN
    RAISE EXCEPTION 'Classificação interna inválida: %', NEW.internal_classification;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER validate_order_strategic_fields
  BEFORE INSERT OR UPDATE ON public.carboze_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_order_point_type();

-- ================================================
-- 4) Storage bucket for acceptance terms PDFs
-- ================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('order-acceptance-terms', 'order-acceptance-terms', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Authenticated users can upload acceptance terms"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'order-acceptance-terms');

CREATE POLICY "Authenticated users can read acceptance terms"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (bucket_id = 'order-acceptance-terms');
