-- Fix licensees_summary view to use security_invoker
DROP VIEW IF EXISTS public.licensees_summary;

CREATE VIEW public.licensees_summary 
WITH (security_invoker = true)
AS
SELECT 
  id,
  code,
  name,
  email,
  phone,
  address_city,
  address_state,
  status,
  total_machines,
  created_at
FROM public.licensees;

-- Grant access to authenticated users (RLS will handle row-level filtering)
GRANT SELECT ON public.licensees_summary TO authenticated;

COMMENT ON VIEW public.licensees_summary IS 'Summary view for licensees that inherits RLS from base table via security_invoker.';