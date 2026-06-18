-- ─────────────────────────────────────────────────────────────────────────────
-- Carbo Ops — Checklists operacionais (Carbo Check). Tabela INTERNA do app novo.
-- Sem modelo de acesso legado (Role Matrix / is_gestor / carbo_roles): RLS simples
-- liberada a usuários autenticados. Gating gestor/membro fica para a camada de app.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.ops_checklists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  departamento text NOT NULL,
  nome text NOT NULL,
  etapas jsonb NOT NULL DEFAULT '[]'::jsonb,  -- [{ "nome": text, "concluida": bool }]
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ops_checklists ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ops_checklists_authenticated ON public.ops_checklists;
CREATE POLICY ops_checklists_authenticated ON public.ops_checklists
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_ops_checklists_departamento ON public.ops_checklists(departamento);
