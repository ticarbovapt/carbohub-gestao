
-- Add CNPJ column to pdvs
ALTER TABLE public.pdvs ADD COLUMN IF NOT EXISTS cnpj text;

-- Unique index (only for non-null values)
CREATE UNIQUE INDEX IF NOT EXISTS uq_pdvs_cnpj ON public.pdvs(cnpj) WHERE cnpj IS NOT NULL;

-- Performance index
CREATE INDEX IF NOT EXISTS idx_pdvs_cnpj ON public.pdvs(cnpj);
