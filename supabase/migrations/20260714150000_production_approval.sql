-- ─────────────────────────────────────────────────────────────────────────────
-- Prazos de fábrica (PPF/PPE) + aprovação de LIBERAÇÃO DE FABRICAÇÃO.
-- Espelha a alçada de desconto: config singleton + trigger autoritativo +
-- RPC gestor-gated + RLS. Nasce DESLIGADA → vendas abaixo do mínimo são só
-- sinalizadas (auto-aprovadas), nada trava, nada entra em fila até o gestor ligar.
--
-- O vendedor escolhe a data de entrega combinada (agreed_delivery_date). O sistema
-- calcula PARA TRÁS, em dias úteis (seg–sex; feriados não tratados ainda):
--   PPE (expedir até) = último dia útil <= entrega
--   PPF (fabricar até) = PPE − ship_offset_days dias úteis   (⟹ PPE = PPF + 1)
--   runway = dias úteis de hoje (dia 0, não conta) até o PPF
--   abaixo do mínimo = runway < min_business_days (default 3)
-- ─────────────────────────────────────────────────────────────────────────────

-- 1) Colunas em carboze_orders (aditivas, defaults constantes)
ALTER TABLE public.carboze_orders
  ADD COLUMN IF NOT EXISTS agreed_delivery_date          date,
  ADD COLUMN IF NOT EXISTS ppf_date                      date,
  ADD COLUMN IF NOT EXISTS ppe_date                      date,
  ADD COLUMN IF NOT EXISTS delivery_lead_business_days   int,
  ADD COLUMN IF NOT EXISTS delivery_below_minimum        boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS production_approval_status    text NOT NULL DEFAULT 'auto_approved', -- auto_approved|pending|approved|rejected
  ADD COLUMN IF NOT EXISTS production_requested_by       uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS production_approver_id        uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS production_approved_at        timestamptz,
  ADD COLUMN IF NOT EXISTS production_approver_notes     text;

-- 2) Config singleton (mín. dias úteis + offset do PPE). Desligada por padrão.
CREATE TABLE IF NOT EXISTS public.prazo_config (
  id                boolean PRIMARY KEY DEFAULT true,
  enabled           boolean NOT NULL DEFAULT false,   -- liga o GATE de aprovação
  min_business_days int     NOT NULL DEFAULT 3,       -- mínimo p/ fabricar
  ship_offset_days  int     NOT NULL DEFAULT 1,       -- PPE = PPF + N dias úteis
  CONSTRAINT prazo_config_singleton CHECK (id)
);
INSERT INTO public.prazo_config (id) VALUES (true) ON CONFLICT (id) DO NOTHING;

-- 3) Dias úteis: anda N dias úteis (N<0 = pra trás), pulando fim de semana.
CREATE OR REPLACE FUNCTION public.carbo_add_business_days(p_from date, p_days int)
RETURNS date LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE d date := p_from; step int; remaining int := abs(p_days);
BEGIN
  IF p_days = 0 THEN
    WHILE EXTRACT(dow FROM d) IN (0, 6) LOOP d := d + 1; END LOOP;  -- rola pro próximo útil
    RETURN d;
  END IF;
  step := CASE WHEN p_days > 0 THEN 1 ELSE -1 END;
  WHILE remaining > 0 LOOP
    d := d + step;
    IF EXTRACT(dow FROM d) NOT IN (0, 6) THEN remaining := remaining - 1; END IF;
  END LOOP;
  RETURN d;
END $$;

-- Conta dias úteis ESTRITAMENTE depois de p_from até p_to (inclusive). hoje = dia 0.
CREATE OR REPLACE FUNCTION public.carbo_count_business_days(p_from date, p_to date)
RETURNS int LANGUAGE sql IMMUTABLE AS $$
  SELECT count(*)::int
    FROM generate_series(p_from + 1, p_to, interval '1 day') g
   WHERE EXTRACT(dow FROM g) NOT IN (0, 6);
$$;

-- Resolve PPF/PPE/runway/abaixo-do-mínimo a partir de hoje + entrega + config.
CREATE OR REPLACE FUNCTION public.carbo_compute_prazos(p_today date, p_delivery date)
RETURNS TABLE(ppf date, ppe date, available int, below_min boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_min int; v_offset int; v_ppe date; v_ppf date;
BEGIN
  SELECT min_business_days, ship_offset_days INTO v_min, v_offset FROM public.prazo_config WHERE id;
  v_min := coalesce(v_min, 3); v_offset := coalesce(v_offset, 1);
  -- PPE = último dia útil <= entrega
  v_ppe := p_delivery;
  WHILE EXTRACT(dow FROM v_ppe) IN (0, 6) LOOP v_ppe := v_ppe - 1; END LOOP;
  -- PPF = PPE − offset dias úteis
  v_ppf := public.carbo_add_business_days(v_ppe, -v_offset);
  -- clamp: nunca no passado
  IF v_ppf < p_today THEN v_ppf := p_today; END IF;
  IF v_ppe < p_today THEN v_ppe := p_today; END IF;
  ppf := v_ppf; ppe := v_ppe;
  available := public.carbo_count_business_days(p_today, v_ppf);
  below_min := available < v_min;
  RETURN NEXT;
END $$;

-- 4) Trigger: calcula prazos e status de forma autoritativa no INSERT.
CREATE OR REPLACE FUNCTION public.carbo_set_production_approval()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; v_enabled boolean;
BEGIN
  IF NEW.agreed_delivery_date IS NULL THEN
    NEW.ppf_date := NULL; NEW.ppe_date := NULL;
    NEW.delivery_lead_business_days := NULL;
    NEW.delivery_below_minimum := false;
    NEW.production_approval_status := 'auto_approved';
    RETURN NEW;
  END IF;
  SELECT * INTO r FROM public.carbo_compute_prazos(current_date, NEW.agreed_delivery_date);
  NEW.ppf_date := r.ppf;
  NEW.ppe_date := r.ppe;
  NEW.delivery_lead_business_days := r.available;
  NEW.delivery_below_minimum := r.below_min;
  NEW.production_requested_by := coalesce(NEW.production_requested_by, NEW.vendedor_id);
  SELECT enabled INTO v_enabled FROM public.prazo_config WHERE id;
  IF r.below_min AND coalesce(v_enabled, false) THEN
    NEW.production_approval_status := 'pending';
  ELSE
    NEW.production_approval_status := 'auto_approved';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_carbo_set_production_approval ON public.carboze_orders;
CREATE TRIGGER trg_carbo_set_production_approval
BEFORE INSERT ON public.carboze_orders
FOR EACH ROW EXECUTE FUNCTION public.carbo_set_production_approval();

-- 5) Decisão do gestor (liberar/recusar fabricação) — gestor-gated.
CREATE OR REPLACE FUNCTION public.carbo_decide_production(p_order_id uuid, p_decision text, p_notes text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_decision NOT IN ('approved', 'rejected') THEN
    RAISE EXCEPTION 'Decisão inválida (use approved|rejected)';
  END IF;
  IF NOT public.carbo_is_gestor(auth.uid()) THEN
    RAISE EXCEPTION 'Sem permissão para liberar fabricação';
  END IF;
  UPDATE public.carboze_orders
    SET production_approval_status = p_decision,
        production_approver_id     = auth.uid(),
        production_approved_at      = now(),
        production_approver_notes   = p_notes
    WHERE id = p_order_id AND production_approval_status = 'pending';
END $$;

-- 6) RLS: qualquer autenticado LÊ a config (a /vender precisa); só gestor edita.
ALTER TABLE public.prazo_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "prazo config read"   ON public.prazo_config;
DROP POLICY IF EXISTS "prazo config manage" ON public.prazo_config;
CREATE POLICY "prazo config read"   ON public.prazo_config FOR SELECT TO authenticated USING (true);
CREATE POLICY "prazo config manage" ON public.prazo_config FOR ALL TO authenticated
  USING (public.carbo_is_gestor(auth.uid())) WITH CHECK (public.carbo_is_gestor(auth.uid()));

GRANT EXECUTE ON FUNCTION public.carbo_add_business_days(date, int)   TO authenticated;
GRANT EXECUTE ON FUNCTION public.carbo_count_business_days(date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.carbo_compute_prazos(date, date)      TO authenticated;
GRANT EXECUTE ON FUNCTION public.carbo_decide_production(uuid, text, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
