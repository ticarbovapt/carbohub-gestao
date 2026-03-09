-- Remove the public access policy
DROP POLICY IF EXISTS "Anyone can view active services" ON public.service_catalog;

-- Create new policy requiring authentication
CREATE POLICY "Authenticated users can view active services" 
ON public.service_catalog 
FOR SELECT 
USING (auth.uid() IS NOT NULL AND is_active = true);