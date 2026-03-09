
-- 1. Add last_login_at to profiles if not exists
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMP WITH TIME ZONE;

CREATE INDEX IF NOT EXISTS idx_profiles_last_login_at 
ON public.profiles(last_login_at DESC NULLS LAST);

-- 2. Secure RPC to record login (SECURITY DEFINER so user can update own record)
CREATE OR REPLACE FUNCTION public.record_user_login()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.profiles 
  SET last_login_at = now() 
  WHERE id = auth.uid();
END;
$$;

-- 3. RPC to get last login summary for dashboard (Admin/CEO only)
CREATE OR REPLACE FUNCTION public.get_last_login_summary()
RETURNS TABLE (
  user_id uuid,
  full_name text,
  department text,
  role text,
  last_login_at timestamptz,
  user_area text,
  region text,
  orders_last_30_days bigint,
  last_replenishment_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only CEO and admin can call this
  IF NOT (is_ceo(auth.uid()) OR is_admin(auth.uid())) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  RETURN QUERY
  -- Internal users (Carbo Controle)
  SELECT 
    p.id as user_id,
    p.full_name,
    p.department::text,
    COALESCE(
      (SELECT ur.role::text FROM user_roles ur WHERE ur.user_id = p.id LIMIT 1),
      (SELECT cr.role::text FROM carbo_user_roles cr WHERE cr.user_id = p.id LIMIT 1),
      'operador'
    ) as role,
    p.last_login_at,
    'internal'::text as user_area,
    NULL::text as region,
    0::bigint as orders_last_30_days,
    NULL::timestamptz as last_replenishment_at
  FROM profiles p
  WHERE p.status = 'approved'
    AND NOT EXISTS (SELECT 1 FROM licensee_users lu WHERE lu.user_id = p.id)
    AND NOT EXISTS (SELECT 1 FROM pdv_users pu WHERE pu.user_id = p.id)

  UNION ALL

  -- Licensee users
  SELECT 
    p.id as user_id,
    l.name as full_name,
    COALESCE(l.address_state, 'N/A') as department,
    'licensee'::text as role,
    p.last_login_at,
    'licensee'::text as user_area,
    COALESCE(l.address_state, 'N/A') as region,
    COALESCE((
      SELECT COUNT(*)::bigint 
      FROM licensee_requests lr 
      WHERE lr.licensee_id = lu.licensee_id 
        AND lr.created_at >= NOW() - INTERVAL '30 days'
    ), 0) as orders_last_30_days,
    NULL::timestamptz as last_replenishment_at
  FROM licensee_users lu
  JOIN profiles p ON p.id = lu.user_id
  JOIN licensees l ON l.id = lu.licensee_id
  WHERE lu.is_primary = true

  UNION ALL

  -- PDV users
  SELECT 
    p.id as user_id,
    pdv.name as full_name,
    COALESCE(pdv.address_state, 'N/A') as department,
    'pdv'::text as role,
    p.last_login_at,
    'produtos'::text as user_area,
    COALESCE(pdv.address_state, 'N/A') as region,
    0::bigint as orders_last_30_days,
    pdv.last_replenishment_at as last_replenishment_at
  FROM pdv_users pu
  JOIN profiles p ON p.id = pu.user_id
  JOIN pdvs pdv ON pdv.id = pu.pdv_id

  ORDER BY last_login_at DESC NULLS LAST;
END;
$$;

-- 4. CarboVAPT payment tables (minimal, only if not exists)
CREATE TABLE IF NOT EXISTS public.carbovapt_requests (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  licensee_id uuid NOT NULL,
  modality text NOT NULL CHECK (modality IN ('P', 'M', 'G', 'G+')),
  request_status text NOT NULL DEFAULT 'draft' CHECK (request_status IN ('draft', 'awaiting_payment', 'confirmed', 'cancelled')),
  region text,
  preferred_date date,
  time_window_start time,
  time_window_end time,
  notes text,
  confirmed_terms boolean NOT NULL DEFAULT false,
  credit_cost integer,
  amount_brl numeric,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.carbovapt_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Licensees can manage own requests" ON public.carbovapt_requests
  FOR ALL USING (
    licensee_id = get_user_licensee_id(auth.uid()) OR
    is_ceo(auth.uid()) OR
    is_gestor(auth.uid())
  );

CREATE TABLE IF NOT EXISTS public.carbovapt_payments (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  request_id uuid NOT NULL REFERENCES public.carbovapt_requests(id),
  payment_method text NOT NULL DEFAULT 'pix' CHECK (payment_method IN ('pix', 'card_online')),
  payment_status text NOT NULL DEFAULT 'pending' CHECK (payment_status IN ('pending', 'paid', 'failed')),
  external_payment_id text,
  external_event_id text UNIQUE, -- idempotency key
  amount numeric NOT NULL DEFAULT 0,
  pix_qr_code text,
  pix_copy_paste text,
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.carbovapt_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Licensees can view own payments" ON public.carbovapt_payments
  FOR SELECT USING (
    request_id IN (
      SELECT id FROM carbovapt_requests 
      WHERE licensee_id = get_user_licensee_id(auth.uid())
    ) OR
    is_ceo(auth.uid()) OR
    is_gestor(auth.uid())
  );

CREATE POLICY "System can insert payments" ON public.carbovapt_payments
  FOR INSERT WITH CHECK (
    request_id IN (
      SELECT id FROM carbovapt_requests 
      WHERE licensee_id = get_user_licensee_id(auth.uid())
    ) OR
    is_ceo(auth.uid())
  );

-- Trigger to auto-update updated_at
CREATE OR REPLACE FUNCTION public.update_carbovapt_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER carbovapt_requests_updated_at
  BEFORE UPDATE ON public.carbovapt_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_carbovapt_updated_at();

CREATE TRIGGER carbovapt_payments_updated_at
  BEFORE UPDATE ON public.carbovapt_payments
  FOR EACH ROW EXECUTE FUNCTION public.update_carbovapt_updated_at();
