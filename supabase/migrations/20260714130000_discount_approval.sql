-- ─────────────────────────────────────────────────────────────────────────────
-- Desconto na venda + aprovação por ALÇADA (preparado, mas DESLIGADO por padrão).
--
-- Regra de negócio (exemplo do cliente): vendedor dá até X% sozinho; faixa
-- intermediária sobe pro superior; acima de Y% vai pro CEO. HOJE não há alçada:
-- a config nasce VAZIA/desligada → todo desconto é auto-aprovado. Ligar a alçada
-- depois é só inserir faixas + ligar o switch (sem migração, sem mexer no fluxo).
--
-- carboze_orders.discount (R$ absoluto) já existe e continua sendo a verdade do
-- dinheiro (total = subtotal - discount). As colunas novas guardam a INTENÇÃO
-- (tipo/percentual/motivo) e o ENVELOPE de aprovação.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1) Colunas de desconto/aprovação em carboze_orders (aditivas, default constante)
ALTER TABLE public.carboze_orders
  ADD COLUMN IF NOT EXISTS discount_type            text        DEFAULT 'none',   -- none | value | percent
  ADD COLUMN IF NOT EXISTS discount_percent         numeric(5,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS discount_reason          text,
  ADD COLUMN IF NOT EXISTS discount_approval_status text NOT NULL DEFAULT 'auto_approved', -- auto_approved|pending|approved|rejected
  ADD COLUMN IF NOT EXISTS discount_approval_tier   text        DEFAULT 'none',   -- none | gestor | ceo
  ADD COLUMN IF NOT EXISTS discount_requested_by    uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS discount_approver_id     uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS discount_approved_at     timestamptz,
  ADD COLUMN IF NOT EXISTS discount_approver_notes  text;

-- 2) Config da alçada: faixas (% → quem aprova) + switch mestre (singleton).
CREATE TABLE IF NOT EXISTS public.discount_approval_tiers (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  min_percent  numeric(5,2) NOT NULL,          -- limite inferior (inclusive)
  max_percent  numeric(5,2),                   -- limite superior (inclusive); NULL = ∞
  authority    text NOT NULL DEFAULT 'auto',   -- auto | gestor | ceo
  label        text,
  sort_order   int NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.discount_approval_config (
  id       boolean PRIMARY KEY DEFAULT true,   -- singleton
  enabled  boolean NOT NULL DEFAULT false,     -- alçada desligada por padrão
  CONSTRAINT discount_config_singleton CHECK (id)
);
INSERT INTO public.discount_approval_config (id, enabled) VALUES (true, false)
  ON CONFLICT (id) DO NOTHING;

-- 3) Resolve a faixa de um percentual → (tier, status). Config vazia/desligada
--    ⇒ sempre auto-aprovado. É a chave do "hoje sem alçada".
CREATE OR REPLACE FUNCTION public.carbo_resolve_discount_tier(p_percent numeric)
RETURNS TABLE(tier text, status text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_enabled boolean; v_auth text;
BEGIN
  SELECT enabled INTO v_enabled FROM public.discount_approval_config WHERE id;
  IF NOT coalesce(v_enabled, false) OR coalesce(p_percent, 0) <= 0 THEN
    tier := 'none'; status := 'auto_approved'; RETURN NEXT; RETURN;
  END IF;
  SELECT authority INTO v_auth FROM public.discount_approval_tiers
    WHERE p_percent >= min_percent AND (max_percent IS NULL OR p_percent <= max_percent)
    ORDER BY min_percent DESC LIMIT 1;
  IF v_auth IS NULL OR v_auth = 'auto' THEN
    tier := 'none'; status := 'auto_approved';
  ELSE
    tier := v_auth; status := 'pending';
  END IF;
  RETURN NEXT;
END $$;

-- 4) Trigger: ao inserir a venda, define tier/status de forma autoritativa
--    (o cliente não decide a própria aprovação). Sem desconto ⇒ auto-aprovado.
CREATE OR REPLACE FUNCTION public.carbo_set_discount_approval()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record;
BEGIN
  IF coalesce(NEW.discount_percent, 0) > 0 AND coalesce(NEW.discount_type, 'none') <> 'none' THEN
    SELECT * INTO r FROM public.carbo_resolve_discount_tier(NEW.discount_percent);
    NEW.discount_approval_tier   := r.tier;
    NEW.discount_approval_status := r.status;
  ELSE
    NEW.discount_approval_tier   := 'none';
    NEW.discount_approval_status := 'auto_approved';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_carbo_set_discount_approval ON public.carboze_orders;
CREATE TRIGGER trg_carbo_set_discount_approval
BEFORE INSERT ON public.carboze_orders
FOR EACH ROW EXECUTE FUNCTION public.carbo_set_discount_approval();

-- 5) Decisão do aprovador (gestor/CEO estão no Admin) — gestor-gated no banco.
CREATE OR REPLACE FUNCTION public.carbo_decide_discount(p_order_id uuid, p_decision text, p_notes text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_decision NOT IN ('approved', 'rejected') THEN
    RAISE EXCEPTION 'Decisão inválida (use approved|rejected)';
  END IF;
  IF NOT public.carbo_is_gestor(auth.uid()) THEN
    RAISE EXCEPTION 'Sem permissão para decidir desconto';
  END IF;
  UPDATE public.carboze_orders
    SET discount_approval_status = p_decision,
        discount_approver_id     = auth.uid(),
        discount_approved_at      = now(),
        discount_approver_notes   = p_notes
    WHERE id = p_order_id AND discount_approval_status = 'pending';
END $$;

-- 6) RLS: qualquer autenticado LÊ a config (a tela /vender precisa); só gestor edita.
ALTER TABLE public.discount_approval_tiers  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.discount_approval_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tiers read"   ON public.discount_approval_tiers;
DROP POLICY IF EXISTS "tiers manage" ON public.discount_approval_tiers;
CREATE POLICY "tiers read"   ON public.discount_approval_tiers FOR SELECT TO authenticated USING (true);
CREATE POLICY "tiers manage" ON public.discount_approval_tiers FOR ALL TO authenticated
  USING (public.carbo_is_gestor(auth.uid())) WITH CHECK (public.carbo_is_gestor(auth.uid()));

DROP POLICY IF EXISTS "config read"   ON public.discount_approval_config;
DROP POLICY IF EXISTS "config manage" ON public.discount_approval_config;
CREATE POLICY "config read"   ON public.discount_approval_config FOR SELECT TO authenticated USING (true);
CREATE POLICY "config manage" ON public.discount_approval_config FOR ALL TO authenticated
  USING (public.carbo_is_gestor(auth.uid())) WITH CHECK (public.carbo_is_gestor(auth.uid()));

GRANT EXECUTE ON FUNCTION public.carbo_resolve_discount_tier(numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.carbo_decide_discount(uuid, text, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
