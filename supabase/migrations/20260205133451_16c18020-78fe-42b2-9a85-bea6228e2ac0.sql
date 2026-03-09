-- Fix subscription_plans public exposure
DROP POLICY IF EXISTS "Anyone can view active plans" ON public.subscription_plans;

CREATE POLICY "Authenticated users can view active plans" 
ON public.subscription_plans 
FOR SELECT 
USING (auth.uid() IS NOT NULL AND is_active = true);

-- Fix os_stage_access public exposure
DROP POLICY IF EXISTS "Anyone can read stage access" ON public.os_stage_access;

CREATE POLICY "Authenticated users can read stage access" 
ON public.os_stage_access 
FOR SELECT 
USING (auth.uid() IS NOT NULL);