
-- 1) Add unique constraint on user_id (1 user = 1 PDV)
-- First check if it exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'pdv_users_user_id_key' 
    AND conrelid = 'public.pdv_users'::regclass
  ) THEN
    ALTER TABLE public.pdv_users ADD CONSTRAINT pdv_users_user_id_key UNIQUE (user_id);
  END IF;
END$$;

-- 2) Index on pdv_id for fast lookups
CREATE INDEX IF NOT EXISTS idx_pdv_users_pdv_id ON public.pdv_users(pdv_id);

-- 3) Allow PDV users to UPDATE only operational fields on their own PDV
CREATE POLICY "PDV users can update own PDV stock"
ON public.pdvs
FOR UPDATE
TO authenticated
USING (
  id IN (SELECT pdv_id FROM public.pdv_users WHERE user_id = auth.uid())
)
WITH CHECK (
  id IN (SELECT pdv_id FROM public.pdv_users WHERE user_id = auth.uid())
);

-- 4) Allow PDV users to INSERT replenishment history for their own PDV
CREATE POLICY "PDV users can insert replenishment history"
ON public.pdv_replenishment_history
FOR INSERT
TO authenticated
WITH CHECK (
  pdv_id IN (SELECT pdv_id FROM public.pdv_users WHERE user_id = auth.uid())
);
