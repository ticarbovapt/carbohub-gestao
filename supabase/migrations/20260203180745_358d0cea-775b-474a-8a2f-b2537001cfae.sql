-- Add new columns to profiles for hierarchical user creation
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS username TEXT UNIQUE,
ADD COLUMN IF NOT EXISTS password_must_change BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS created_by_manager UUID REFERENCES auth.users(id),
ADD COLUMN IF NOT EXISTS last_access TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS temp_password_sent_at TIMESTAMP WITH TIME ZONE;

-- Create index for username lookups
CREATE INDEX IF NOT EXISTS idx_profiles_username ON public.profiles(username);
CREATE INDEX IF NOT EXISTS idx_profiles_created_by_manager ON public.profiles(created_by_manager);

-- Create sequence table for username generation per department
CREATE TABLE IF NOT EXISTS public.department_username_sequences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  department_prefix TEXT NOT NULL UNIQUE,
  last_sequence INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on sequence table
ALTER TABLE public.department_username_sequences ENABLE ROW LEVEL SECURITY;

-- Only admins and managers can manage sequences
CREATE POLICY "Managers can view sequences"
  ON public.department_username_sequences
  FOR SELECT
  USING (is_manager_or_admin(auth.uid()));

CREATE POLICY "Managers can manage sequences"
  ON public.department_username_sequences
  FOR ALL
  USING (is_manager_or_admin(auth.uid()));

-- Insert initial department prefixes
INSERT INTO public.department_username_sequences (department_prefix, last_sequence)
VALUES 
  ('ven', 0),  -- venda
  ('pre', 0),  -- preparacao
  ('exp', 0),  -- expedicao
  ('ops', 0),  -- operacao
  ('pos', 0)   -- pos_venda
ON CONFLICT (department_prefix) DO NOTHING;

-- Create function to generate next username for a department
CREATE OR REPLACE FUNCTION public.generate_username(dept_prefix TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  next_seq INTEGER;
  new_username TEXT;
BEGIN
  -- Get and increment the sequence
  UPDATE public.department_username_sequences
  SET last_sequence = last_sequence + 1, updated_at = now()
  WHERE department_prefix = dept_prefix
  RETURNING last_sequence INTO next_seq;
  
  -- If no row found, insert new one
  IF next_seq IS NULL THEN
    INSERT INTO public.department_username_sequences (department_prefix, last_sequence)
    VALUES (dept_prefix, 1)
    RETURNING last_sequence INTO next_seq;
  END IF;
  
  -- Format username with zero-padded sequence
  new_username := dept_prefix || LPAD(next_seq::TEXT, 4, '0');
  
  RETURN new_username;
END;
$$;

-- Create function to generate secure temporary password
CREATE OR REPLACE FUNCTION public.generate_temp_password()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  chars TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  specials TEXT := '!@#$%';
  result TEXT := 'Carbo#';
  i INTEGER;
BEGIN
  -- Add 4 random characters
  FOR i IN 1..4 LOOP
    result := result || substr(chars, floor(random() * length(chars) + 1)::integer, 1);
  END LOOP;
  
  -- Add a random special character
  result := result || substr(specials, floor(random() * length(specials) + 1)::integer, 1);
  
  RETURN result;
END;
$$;

-- Update the profiles RLS to allow managers to create profiles for their team
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;

CREATE POLICY "Users can insert profiles"
  ON public.profiles
  FOR INSERT
  WITH CHECK (
    auth.uid() = id OR is_manager_or_admin(auth.uid())
  );

-- Allow managers to view users they created
DROP POLICY IF EXISTS "Users can view own profile or managers can view all" ON public.profiles;

CREATE POLICY "Users can view profiles based on role"
  ON public.profiles
  FOR SELECT
  USING (
    auth.uid() = id 
    OR is_manager_or_admin(auth.uid())
    OR created_by_manager = auth.uid()
  );