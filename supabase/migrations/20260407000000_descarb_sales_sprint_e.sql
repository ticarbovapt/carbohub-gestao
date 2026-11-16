-- ============================================================
-- Sprint E — descarb_sales: operador, indicador, starts, restart
-- Rodar no Supabase SQL Editor
-- ============================================================

ALTER TABLE descarb_sales
  ADD COLUMN IF NOT EXISTS operador_name    text,
  ADD COLUMN IF NOT EXISTS indicador_name   text,
  ADD COLUMN IF NOT EXISTS machine_starts_used int NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS had_restart      boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS restart_reason   text;

-- Atualiza MODALITY labels para consistência com as imagens de marketing
COMMENT ON COLUMN descarb_sales.machine_starts_used IS 'Quantidade de starts de máquina consumidos neste atendimento (inclui restarts)';
COMMENT ON COLUMN descarb_sales.had_restart IS 'Se houve interrupção e reinício do processo neste atendimento';
COMMENT ON COLUMN descarb_sales.restart_reason IS 'Motivo do reinício quando had_restart = true';
COMMENT ON COLUMN descarb_sales.operador_name IS 'Nome do operador que realizou o atendimento';
COMMENT ON COLUMN descarb_sales.indicador_name IS 'Nome de quem indicou o cliente (marketing/captação)';

-- Verificação
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'descarb_sales'
  AND column_name IN ('operador_name','indicador_name','machine_starts_used','had_restart','restart_reason')
ORDER BY column_name;
