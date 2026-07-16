-- ─────────────────────────────────────────────────────────────────────────────
-- Fixar comentário/atividade no topo da timeline do lead (estilo Bitrix).
-- O item fixado sobe para uma faixa "Fixados" e permanece na sequência normal.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.crm_sales_lead_activities
  ADD COLUMN IF NOT EXISTS pinned boolean NOT NULL DEFAULT false;

NOTIFY pgrst, 'reload schema';
