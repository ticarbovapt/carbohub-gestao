-- ─────────────────────────────────────────────────────────────────────────────
-- Carbo Marketing — cor de lista (C4a). Cabeçalho da lista com cor da mesma
-- paleta do fundo dos quadros (chaves de BOARD_BG). Mesma tabela mkt_lists →
-- RLS e Realtime já valem.
-- (Recolher lista é preferência pessoal, guardada em localStorage — sem banco.)
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.mkt_lists ADD COLUMN IF NOT EXISTS color text;
