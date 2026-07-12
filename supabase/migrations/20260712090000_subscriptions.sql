-- Assinaturas / recorrências (ex: Claude, Supabase, Vercel do TI; e de outros
-- setores). Guarda o setor dono, o valor/ciclo, em qual cartão cai a cobrança
-- (ou se é manual — pra lembrar de pagar) e o próximo vencimento.
CREATE TABLE IF NOT EXISTS public.subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,                                  -- ex: "Claude Code", "Supabase Pro"
  departamento text,                                   -- setor dono (TI, Ops…)
  valor numeric NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'BRL',               -- BRL | USD
  ciclo text NOT NULL DEFAULT 'mensal',               -- mensal | trimestral | anual
  proximo_vencimento date,
  payment_method_id uuid REFERENCES public.payment_methods(id),
  cobranca text NOT NULL DEFAULT 'automatica',        -- automatica (cai no cartão) | manual (lembrar de pagar)
  status text NOT NULL DEFAULT 'ativa',               -- ativa | pausada | cancelada
  responsavel text,
  url text,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS subscriptions_all ON public.subscriptions;
CREATE POLICY subscriptions_all ON public.subscriptions
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON public.subscriptions (status);
CREATE INDEX IF NOT EXISTS idx_subscriptions_departamento ON public.subscriptions (departamento);
