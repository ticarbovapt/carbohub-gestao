-- ─────────────────────────────────────────────────────────────────────────────
-- Data de aniversário do funcionário — alimenta a aba "Aniversariantes" da tela
-- de Funcionários (destaque do mês atual + alerta quando falta <7 dias).
-- Coluna aditiva, nullable — nenhum backfill necessário.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.employee_finance
  ADD COLUMN IF NOT EXISTS birth_date date;

COMMENT ON COLUMN public.employee_finance.birth_date IS 'Data de nascimento/aniversário do funcionário (usada para aniversariantes do mês).';

NOTIFY pgrst, 'reload schema';
