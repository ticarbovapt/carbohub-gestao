-- Drop existing policies on customers table
DROP POLICY IF EXISTS "Managers can manage customers" ON public.customers;
DROP POLICY IF EXISTS "Customers viewable by managers and admins" ON public.customers;

-- Create new policies with explicit authentication check
CREATE POLICY "Customers viewable by authenticated managers and admins"
ON public.customers
FOR SELECT
USING (auth.uid() IS NOT NULL AND is_manager_or_admin(auth.uid()));

CREATE POLICY "Authenticated managers can insert customers"
ON public.customers
FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL AND is_manager_or_admin(auth.uid()));

CREATE POLICY "Authenticated managers can update customers"
ON public.customers
FOR UPDATE
USING (auth.uid() IS NOT NULL AND is_manager_or_admin(auth.uid()));

CREATE POLICY "Authenticated managers can delete customers"
ON public.customers
FOR DELETE
USING (auth.uid() IS NOT NULL AND is_manager_or_admin(auth.uid()));