-- carbo_all_profiles v2 — inclui avatar (foto que o usuário cadastra no sistema)
-- e o setor (departamento), pra tela de Funcionários mostrar a foto e filtrar por
-- setor. DROP + CREATE porque a assinatura de retorno mudou.
DROP FUNCTION IF EXISTS public.carbo_all_profiles();
CREATE FUNCTION public.carbo_all_profiles()
RETURNS TABLE (
  id UUID, full_name TEXT, username TEXT, email TEXT,
  avatar_url TEXT, department TEXT, secondary_department TEXT
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.id, p.full_name, p.username, p.email, p.avatar_url,
         p.department::text, p.secondary_department::text
  FROM public.profiles p
  ORDER BY p.full_name NULLS LAST;
$$;
GRANT EXECUTE ON FUNCTION public.carbo_all_profiles() TO authenticated;
