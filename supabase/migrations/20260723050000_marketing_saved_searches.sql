-- ─────────────────────────────────────────────────────────────────────────────
-- Carbo Marketing — Buscas salvas (C4b). Filtro salvo por usuário: dentro de um
-- quadro (scope='board') ou entre quadros (scope='all').
--
-- RLS POR DONO: busca salva é pessoal — o usuário só vê/gerencia as próprias
-- (mais restrito que o resto do módulo, de propósito). Sem realtime.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.mkt_saved_searches (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name       text NOT NULL,
  scope      text NOT NULL CHECK (scope IN ('board','all')),
  board_id   uuid REFERENCES public.mkt_boards(id) ON DELETE CASCADE,  -- quando scope='board'
  criteria   jsonb NOT NULL DEFAULT '{}'::jsonb,  -- {text, labelIds[], memberId, dueFrom, dueTo}
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_mkt_saved_searches_user ON public.mkt_saved_searches(user_id);

ALTER TABLE public.mkt_saved_searches ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS mkt_saved_searches_own ON public.mkt_saved_searches;
CREATE POLICY mkt_saved_searches_own ON public.mkt_saved_searches
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
