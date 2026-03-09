
-- Restrict base table SELECT to admins/CEO only
DROP POLICY IF EXISTS "Managers can view orders" ON public.carboze_orders;

CREATE POLICY "Only admins can view full orders"
ON public.carboze_orders FOR SELECT
USING (
  auth.uid() IS NOT NULL 
  AND (is_admin(auth.uid()) OR is_ceo(auth.uid()))
);

-- Allow managers to SELECT from base table ONLY for writes (they need it for insert/update returning)
-- The ALL policy already covers managers for insert/update/delete, keep it

-- Create RLS policy on the secure view so managers can read masked data
-- Views with security_invoker use the caller's permissions, but the base table now blocks managers
-- So we need to allow managers to read via a different approach

-- Actually, since the view uses security_invoker=false by default, it runs as the view owner (postgres)
-- which bypasses RLS. Let's verify and ensure managers can query the view.
-- The view already exists without security_invoker, so it bypasses RLS on the base table.
-- We just need to ensure the Managers can still do INSERT/UPDATE/DELETE on the base table.

-- Ensure the ALL policy for managers covers INSERT/UPDATE/DELETE but not SELECT
DROP POLICY IF EXISTS "Managers can manage orders" ON public.carboze_orders;

CREATE POLICY "Managers can insert orders"
ON public.carboze_orders FOR INSERT
WITH CHECK (
  auth.uid() IS NOT NULL 
  AND is_manager_or_admin(auth.uid())
);

CREATE POLICY "Managers can update orders"
ON public.carboze_orders FOR UPDATE
USING (
  auth.uid() IS NOT NULL 
  AND is_manager_or_admin(auth.uid())
);

CREATE POLICY "Managers can delete orders"
ON public.carboze_orders FOR DELETE
USING (
  auth.uid() IS NOT NULL 
  AND is_manager_or_admin(auth.uid())
);
