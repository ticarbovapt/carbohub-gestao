-- ─────────────────────────────────────────────────────────────────────────────
-- Carbo Marketing — Espelhar cartão (C3).
--
-- Um "espelho" é uma linha de cartão que aponta para um ORIGINAL via mirror_of.
-- Ele tem list_id/board_id/position próprios (posição no quadro destino), mas o
-- CONTEÚDO (título, descrição, etiquetas, checklists, membros) é resolvido do
-- original ao vivo — edição só acontece no original. ON DELETE CASCADE: apagar
-- o original apaga os espelhos órfãos.
--
-- Mesma tabela mkt_cards → RLS e Realtime já valem (nada a recriar).
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.mkt_cards
  ADD COLUMN IF NOT EXISTS mirror_of uuid REFERENCES public.mkt_cards(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_mkt_cards_mirror_of ON public.mkt_cards(mirror_of) WHERE mirror_of IS NOT NULL;
