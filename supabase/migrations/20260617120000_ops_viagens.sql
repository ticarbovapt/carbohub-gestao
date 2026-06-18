-- ─────────────────────────────────────────────────────────────────────────────
-- Carbo Ops — Viagens corporativas & Prestação de Contas. Tabela INTERNA do app.
-- Fluxo simples (sem aprovação multi-nível legada): pendente → aprovado/reprovado.
-- RLS limpa: apenas authenticated (gating gestor/membro fica na camada de app).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.ops_viagens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  solicitante text NOT NULL,
  destino text NOT NULL,
  objetivo text,
  centro_custo text,
  data_ida date,
  data_volta date,
  valor_estimado numeric NOT NULL DEFAULT 0,
  adiantamento numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pendente'
    CHECK (status IN ('pendente','aprovado','reprovado','em_andamento','concluido','cancelado')),
  motivo_reprovacao text,
  -- Prestação de contas (null = não iniciada)
  pc_status text CHECK (pc_status IN ('aberta','enviada','aprovada','reprovada','encerrada')),
  pc_total numeric NOT NULL DEFAULT 0,
  pc_notas text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ops_viagens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ops_viagens_authenticated ON public.ops_viagens;
CREATE POLICY ops_viagens_authenticated ON public.ops_viagens
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_ops_viagens_status ON public.ops_viagens(status);
CREATE INDEX IF NOT EXISTS idx_ops_viagens_created_by ON public.ops_viagens(created_by);
