-- Add data_scope to department_functions
ALTER TABLE public.department_functions
  ADD COLUMN IF NOT EXISTS data_scope text NOT NULL DEFAULT 'proprio'
  CHECK (data_scope IN ('proprio', 'equipe', 'departamento', 'global'));

-- Backfill sensible defaults based on hierarchy_order
UPDATE public.department_functions SET data_scope = 'global'       WHERE hierarchy_order = 1;
UPDATE public.department_functions SET data_scope = 'departamento' WHERE hierarchy_order = 2;
UPDATE public.department_functions SET data_scope = 'departamento' WHERE hierarchy_order = 3;
UPDATE public.department_functions SET data_scope = 'equipe'       WHERE hierarchy_order = 4;
UPDATE public.department_functions SET data_scope = 'proprio'      WHERE hierarchy_order >= 5;
