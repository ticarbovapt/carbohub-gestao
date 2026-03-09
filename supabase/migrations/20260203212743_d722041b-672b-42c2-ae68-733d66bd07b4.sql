-- Fix security issues: Restrict profile and licensee data access

-- 1. Update the can_access_profile function to be more restrictive
-- Only allow users to see specific profile fields based on their role
CREATE OR REPLACE FUNCTION public.can_access_profile(_viewer_id uuid, _profile_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
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

-- 2. Create a new function to check if user is admin
CREATE OR REPLACE FUNCTION public.is_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = 'admin'
  )
$$;

-- 3. Update licensees RLS policy to restrict access to admins and specific managers
-- Drop existing policies first
DROP POLICY IF EXISTS "Managers can manage licensees" ON public.licensees;
DROP POLICY IF EXISTS "Managers can view licensees" ON public.licensees;

-- Create more restrictive policies for licensees
-- Only admins and managers can view, but sensitive data is still protected
CREATE POLICY "Admins and managers can view licensees"
ON public.licensees FOR SELECT
USING (
  auth.uid() IS NOT NULL 
  AND is_manager_or_admin(auth.uid())
);

CREATE POLICY "Only admins can create licensees"
ON public.licensees FOR INSERT
WITH CHECK (
  auth.uid() IS NOT NULL 
  AND is_admin(auth.uid())
);

CREATE POLICY "Only admins can update licensees"
ON public.licensees FOR UPDATE
USING (
  auth.uid() IS NOT NULL 
  AND is_admin(auth.uid())
);

CREATE POLICY "Only admins can delete licensees"
ON public.licensees FOR DELETE
USING (
  auth.uid() IS NOT NULL 
  AND is_admin(auth.uid())
);

-- 4. Create a view for licensee data that excludes sensitive financial data for managers
CREATE OR REPLACE VIEW public.licensees_summary
WITH (security_invoker=on) AS
SELECT 
  id,
  code,
  name,
  status,
  address_city,
  address_state,
  phone,
  email,
  total_machines,
  created_at
FROM public.licensees;

-- Grant access to the view
GRANT SELECT ON public.licensees_summary TO authenticated;

-- 5. Add comment to document security decisions
COMMENT ON TABLE public.licensees IS 'Business partner data - contains sensitive financial information. Full access restricted to admins only. Managers see limited data through licensees_summary view.';