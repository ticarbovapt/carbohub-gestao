-- Adiciona novo status ao enum op_status
-- Deve rodar antes de usar o novo status no código

ALTER TYPE public.op_status ADD VALUE IF NOT EXISTS 'qualidade_aprovada' AFTER 'aguardando_qualidade';
