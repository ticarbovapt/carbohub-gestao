-- Fix profiles table RLS - restrict to own profile + managers/admins
DROP POLICY IF EXISTS "Users can view profiles" ON public.profiles;

CREATE POLICY "Users can view own profile or managers can view all"
ON public.profiles
FOR SELECT
USING (
  auth.uid() = id OR is_manager_or_admin(auth.uid())
);

-- Fix customers table RLS - restrict to managers/admins only
DROP POLICY IF EXISTS "Customers viewable by authenticated" ON public.customers;

CREATE POLICY "Customers viewable by managers and admins"
ON public.customers
FOR SELECT
USING (is_manager_or_admin(auth.uid()));