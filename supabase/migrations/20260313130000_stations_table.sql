-- ============================================================
-- TABLE: stations (Estações QR Code)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.stations (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  location text,
  department_type department_type NOT NULL,
  qr_code text NOT NULL UNIQUE,
  checklist_template_id uuid REFERENCES public.checklist_templates(id),
  sensor_id text,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.stations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "stations_admin_all" ON public.stations FOR ALL
  USING (is_admin(auth.uid()) OR is_ceo(auth.uid()));

CREATE POLICY "stations_gestor_all" ON public.stations FOR ALL
  USING (is_gestor(auth.uid()));

CREATE POLICY "stations_operador_select" ON public.stations FOR SELECT
  USING (has_carbo_role(auth.uid(), 'operador'));

CREATE TRIGGER trg_stations_updated_at
  BEFORE UPDATE ON public.stations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_stations_department ON public.stations(department_type);
CREATE INDEX IF NOT EXISTS idx_stations_qr_code ON public.stations(qr_code);
