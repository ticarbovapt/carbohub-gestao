-- Novos status de produção: Envase e Rotulagem como etapas próprias do kanban de OP.
-- ADD VALUE não pode ser usado na mesma transação em que os valores são referenciados,
-- por isso fica isolado neste arquivo (rodar antes da migration de movimentos).
ALTER TYPE public.op_status ADD VALUE IF NOT EXISTS 'envase' AFTER 'em_producao';
ALTER TYPE public.op_status ADD VALUE IF NOT EXISTS 'rotulagem' AFTER 'envase';
