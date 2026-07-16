-- ─────────────────────────────────────────────────────────────────────────────
-- Diretório do Carbo Chat v2: MESMA fonte da tela de Usuários do Admin —
-- a tabela public.profiles, sem recorte. A tela do Admin lê profiles direto e
-- vê todos porque gestor tem RLS ampla; o usuário comum é limitado por escopo,
-- por isso a RPC é SECURITY DEFINER (devolve todos os cadastrados no sistema).
--  • Usa username/e-mail quando full_name é nulo (não some ninguém, ex.: TI).
--  • Busca por nome / username / e-mail.
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
    AND (
      p_search IS NULL OR p_search = ''
      OR COALESCE(p.full_name, '') ILIKE '%' || p_search || '%'
      OR COALESCE(p.username, '')  ILIKE '%' || p_search || '%'
      OR COALESCE(p.email, '')     ILIKE '%' || p_search || '%'
    )
  ORDER BY 2
  LIMIT 200;
$$;

GRANT EXECUTE ON FUNCTION public.chat_directory(text) TO authenticated;

NOTIFY pgrst, 'reload schema';
