-- Adiciona segunda função/departamento em profiles
-- Nullable → zero impacto em quem não tem segunda função
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS secondary_department public.department_type NULL,
  ADD COLUMN IF NOT EXISTS secondary_funcao      text                   NULL;

COMMENT ON COLUMN public.profiles.secondary_department IS
  'Departamento secundário (dupla função). NULL = sem segunda função.';
COMMENT ON COLUMN public.profiles.secondary_funcao IS
  'Chave da função secundária dentro de secondary_department.';
