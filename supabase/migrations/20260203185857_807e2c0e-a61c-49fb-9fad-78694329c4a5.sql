-- Create a helper function to check if user can access a profile based on department
CREATE OR REPLACE FUNCTION public.can_access_profile(_viewer_id uuid, _profile_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    -- User can always see their own profile
    _viewer_id = _profile_id
    OR
    -- Admins can see all profiles
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _viewer_id AND role = 'admin')
    OR
    -- Managers can see profiles in their department or profiles they created
    (
      EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _viewer_id AND role = 'manager')
      AND (
        -- Same department
        EXISTS (
          SELECT 1 FROM public.profiles viewer, public.profiles target
          WHERE viewer.id = _viewer_id 
            AND target.id = _profile_id
            AND viewer.department = target.department
            AND viewer.department IS NOT NULL
        )
        OR
        -- Created by this manager
        EXISTS (
          SELECT 1 FROM public.profiles 
          WHERE id = _profile_id AND created_by_manager = _viewer_id
        )
      )
    )
    OR
    -- Operators can only see profiles in their own department
    (
      EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _viewer_id AND role = 'operator')
      AND EXISTS (
        SELECT 1 FROM public.profiles viewer, public.profiles target
        WHERE viewer.id = _viewer_id 
          AND target.id = _profile_id
          AND viewer.department = target.department
          AND viewer.department IS NOT NULL
      )
    )
$$;

-- Drop the old policy
DROP POLICY IF EXISTS "Users can view profiles based on role" ON public.profiles;

-- Create new stricter policy with explicit auth check and department-based access
CREATE POLICY "Users can view profiles with department restrictions"
ON public.profiles
FOR SELECT
USING (
  auth.uid() IS NOT NULL 
  AND public.can_access_profile(auth.uid(), id)
);

-- Also update the INSERT policy to require authentication explicitly
DROP POLICY IF EXISTS "Users can insert profiles" ON public.profiles;
CREATE POLICY "Authenticated users can insert profiles"
ON public.profiles
FOR INSERT
WITH CHECK (
  auth.uid() IS NOT NULL 
  AND ((auth.uid() = id) OR is_manager_or_admin(auth.uid()))
);

-- Update the UPDATE policy to require authentication explicitly
DROP POLICY IF EXISTS "Users can update profiles" ON public.profiles;
CREATE POLICY "Authenticated users can update profiles"
ON public.profiles
FOR UPDATE
USING (
  auth.uid() IS NOT NULL 
  AND ((auth.uid() = id) OR has_role(auth.uid(), 'admin'::app_role))
);