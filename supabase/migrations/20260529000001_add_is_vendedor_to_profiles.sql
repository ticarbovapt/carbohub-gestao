-- Add is_vendedor flag to profiles
-- Controls who appears in sales systems (metas, order assignment)
-- Can only be set by heads and command dept members (enforced in app layer)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_vendedor boolean NOT NULL DEFAULT false;
