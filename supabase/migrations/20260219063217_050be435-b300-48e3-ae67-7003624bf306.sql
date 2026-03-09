
-- Expand the requested_role check constraint to allow 'MasterAdmin'
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_requested_role_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_requested_role_check
  CHECK (requested_role = ANY (ARRAY['manager'::text, 'operator'::text, 'MasterAdmin'::text, 'admin'::text]));
