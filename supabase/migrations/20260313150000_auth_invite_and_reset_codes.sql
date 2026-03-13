-- ============================================================
-- Auth Redesign: Invite Token + Password Reset Codes
-- ============================================================

-- 1. Add invite_token columns to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS invite_token TEXT,
  ADD COLUMN IF NOT EXISTS invite_token_expires_at TIMESTAMPTZ;

-- Index for fast token lookup
CREATE INDEX IF NOT EXISTS idx_profiles_invite_token
  ON public.profiles(invite_token) WHERE invite_token IS NOT NULL;

-- 2. Create password_reset_codes table (replaces manager-approval reset)
CREATE TABLE IF NOT EXISTS public.password_reset_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  code TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '15 minutes'),
  used BOOLEAN NOT NULL DEFAULT false,
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for looking up active codes
CREATE INDEX IF NOT EXISTS idx_reset_codes_email_active
  ON public.password_reset_codes(email, used) WHERE used = false;

-- RLS
ALTER TABLE public.password_reset_codes ENABLE ROW LEVEL SECURITY;

-- Only service_role can manage reset codes (edge functions)
CREATE POLICY "Service role manages reset codes"
  ON public.password_reset_codes
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- 3. Helper function: generate 6-digit reset code
CREATE OR REPLACE FUNCTION public.generate_reset_code()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN lpad(floor(random() * 1000000)::integer::text, 6, '0');
END;
$$;

-- 4. Helper function: generate secure invite token
CREATE OR REPLACE FUNCTION public.generate_invite_token()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN encode(gen_random_bytes(32), 'hex');
END;
$$;
