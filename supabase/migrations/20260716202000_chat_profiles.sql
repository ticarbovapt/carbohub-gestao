-- ─────────────────────────────────────────────────────────────────────────────
-- Resolve nome/avatar de vários perfis por id, para o chat. A RLS de profiles
-- limita o que o usuário comum vê (por escopo), então o nome do outro na DM e o
-- remetente das mensagens saíam vazios ("Conversa" / "—"). Esta RPC definer
-- devolve os perfis pedidos, para qualquer interno.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.chat_profiles(p_ids uuid[])
RETURNS TABLE (id uuid, full_name text, avatar_url text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.id,
         COALESCE(NULLIF(btrim(p.full_name), ''), p.username, p.email, 'Sem nome') AS full_name,
         p.avatar_url
  FROM public.profiles p
  WHERE public.is_employee(auth.uid())
    AND p.id = ANY (p_ids);
$$;

GRANT EXECUTE ON FUNCTION public.chat_profiles(uuid[]) TO authenticated;

NOTIFY pgrst, 'reload schema';
