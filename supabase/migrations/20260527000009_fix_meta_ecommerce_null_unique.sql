-- Fix: a constraint UNIQUE(month, platform) não detecta conflito quando
-- platform IS NULL porque NULL != NULL no PostgreSQL.
-- Solução: trocar pela constraint por um índice único com COALESCE.

-- Remove constraint original
ALTER TABLE public.meta_ecommerce
  DROP CONSTRAINT IF EXISTS meta_ecommerce_month_platform_key;

-- Cria índice único que trata NULL como valor fixo '__total__'
-- Garante que só existe 1 linha de meta total por mês
CREATE UNIQUE INDEX IF NOT EXISTS meta_ecommerce_month_platform_uniq
  ON public.meta_ecommerce (month, COALESCE(platform, '__total__'));

-- Apaga eventuais duplicatas de meta total que tenham sido criadas
-- (mantém só a linha mais recente de cada mês com platform IS NULL)
DELETE FROM public.meta_ecommerce a
USING public.meta_ecommerce b
WHERE a.platform IS NULL
  AND b.platform IS NULL
  AND a.month = b.month
  AND a.updated_at < b.updated_at;
