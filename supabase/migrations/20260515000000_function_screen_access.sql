CREATE TABLE IF NOT EXISTS public.function_screen_access (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  department text NOT NULL,
  function_key text NOT NULL,
  screen_ids text[] DEFAULT '{}',
  updated_at timestamptz DEFAULT now(),
  updated_by uuid,
  CONSTRAINT function_screen_access_unique UNIQUE (department, function_key)
);

ALTER TABLE public.function_screen_access ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage function screen access"
  ON public.function_screen_access
  FOR ALL
  USING (true)
  WITH CHECK (true);
