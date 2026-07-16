-- ─────────────────────────────────────────────────────────────────────────────
-- Diretório do Carbo Chat v2: mostra TODOS os internos com conta real.
--  • Exclui org_only (membros do organograma SEM conta de auth — não recebem msg).
--  • Usa username/e-mail quando full_name é nulo (não some ninguém, ex.: TI).
--  • Busca por nome OU username.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.chat_directory(p_search text DEFAULT NULL)
RETURNS TABLE (id uuid, full_name text, avatar_url text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.id,
         COALESCE(NULLIF(btrim(p.full_name), ''), p.username, p.email, 'Sem nome') AS full_name,
         p.avatar_url
  FROM public.profiles p
  WHERE p.id <> auth.uid()
    AND public.is_employee(auth.uid())
    AND COALESCE(p.org_only, false) = false
    AND (
      p_search IS NULL OR p_search = ''
      OR COALESCE(p.full_name, '') ILIKE '%' || p_search || '%'
      OR COALESCE(p.username, '')  ILIKE '%' || p_search || '%'
      OR COALESCE(p.email, '')     ILIKE '%' || p_search || '%'
    )
  ORDER BY 2
  LIMIT 100;
$$;

GRANT EXECUTE ON FUNCTION public.chat_directory(text) TO authenticated;

NOTIFY pgrst, 'reload schema';
