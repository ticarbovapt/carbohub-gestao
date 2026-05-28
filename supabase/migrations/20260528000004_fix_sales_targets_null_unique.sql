-- Fix: PostgreSQL treats NULL != NULL, so the unique constraint on
-- (vendedor_id, month, linha) allows duplicate rows when linha IS NULL.
-- Replace with a partial unique index using COALESCE to handle NULLs.

-- 1. Remove duplicate rows — keep the one with highest target_amount
--    (or latest created_at if tied)
DELETE FROM public.sales_targets
WHERE id IN (
  SELECT id FROM (
    SELECT id,
           ROW_NUMBER() OVER (
             PARTITION BY vendedor_id, month, COALESCE(linha, '')
             ORDER BY target_amount DESC, created_at DESC
           ) AS rn
    FROM public.sales_targets
  ) ranked
  WHERE rn > 1
);

-- 2. Drop the old constraint (if it exists as a named constraint)
ALTER TABLE public.sales_targets
  DROP CONSTRAINT IF EXISTS sales_targets_vendedor_id_month_linha_key;

-- 3. Create a proper unique index that treats NULL as a real value via COALESCE
CREATE UNIQUE INDEX IF NOT EXISTS sales_targets_vendedor_month_linha_uq
  ON public.sales_targets (vendedor_id, month, COALESCE(linha, ''));
