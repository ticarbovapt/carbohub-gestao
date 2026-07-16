-- ─────────────────────────────────────────────────────────────────────────────
-- Diretório do Carbo Chat: lista TODOS os usuários internos para iniciar DM /
-- montar grupo. A tabela profiles tem RLS de SELECT por escopo (departamento),
-- então ler direto só trazia parte das pessoas. Como todo mundo em profiles é
-- interno (externos não têm linha), uma RPC SECURITY DEFINER devolve todos.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.chat_directory(p_search text DEFAULT NULL)
RETURNS TABLE (id uuid, full_name text, avatar_url text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.id, p.full_name, p.avatar_url
  FROM public.profiles p
  WHERE p.id <> auth.uid()
    AND public.is_employee(auth.uid())        -- só internos podem listar
    AND p.full_name IS NOT NULL
    AND (p_search IS NULL OR p_search = '' OR p.full_name ILIKE '%' || p_search || '%')
  ORDER BY p.full_name
  LIMIT 50;
$$;

GRANT EXECUTE ON FUNCTION public.chat_directory(text) TO authenticated;

NOTIFY pgrst, 'reload schema';
