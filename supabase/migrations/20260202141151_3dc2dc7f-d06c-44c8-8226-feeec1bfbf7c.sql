-- Add approval status to profiles
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pending' 
CHECK (status IN ('pending', 'approved', 'rejected'));

-- Add requested_role to profiles for pending approval
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS requested_role TEXT DEFAULT 'operator' 
CHECK (requested_role IN ('manager', 'operator'));

-- Update RLS policies on profiles to allow managers/admins to view all
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can view profiles" ON public.profiles;

-- Users can view their own profile, managers/admins can view all
CREATE POLICY "Users can view profiles" 
ON public.profiles 
FOR SELECT 
USING (
  auth.uid() = id 
  OR public.is_manager_or_admin(auth.uid())
);

-- Allow admins to update any profile (for approvals)
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;

CREATE POLICY "Users can update profiles" 
ON public.profiles 
FOR UPDATE 
USING (
  auth.uid() = id 
  OR public.has_role(auth.uid(), 'admin')
);

-- Update managers/admins role check to include viewing roles
DROP POLICY IF EXISTS "Users can view own roles" ON public.user_roles;

CREATE POLICY "Users can view roles" 
ON public.user_roles 
FOR SELECT 
USING (
  auth.uid() = user_id 
  OR public.is_manager_or_admin(auth.uid())
);