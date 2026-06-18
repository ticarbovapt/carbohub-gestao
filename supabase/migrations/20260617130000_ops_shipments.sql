-- ─────────────────────────────────────────────────────────────────────────────
-- Carbo Ops — Remessas / Logística (ops_shipments). Tabela INTERNA do app.
-- Rastreio operacional: separação → transporte → entrega. RLS limpa (authenticated).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.ops_shipments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number text NOT NULL,
  customer text NOT NULL,
  destination text,
  carrier_name text,
  tracking_code text,
  status text NOT NULL DEFAULT 'separacao_pendente'
    CHECK (status IN ('separacao_pendente','separando','separado','em_transporte','entregue','cancelado')),
  items integer NOT NULL DEFAULT 0,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ops_shipments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ops_shipments_authenticated ON public.ops_shipments;
CREATE POLICY ops_shipments_authenticated ON public.ops_shipments
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_ops_shipments_status ON public.ops_shipments(status);
