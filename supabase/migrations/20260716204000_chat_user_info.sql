-- ─────────────────────────────────────────────────────────────────────────────
-- Dados do contato para o painel do chat (nome, foto, departamento, função,
-- e-mail). RPC definer porque a RLS de profiles limita o que o usuário comum vê.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.chat_user_info(p_id uuid)
RETURNS TABLE (id uuid, full_name text, avatar_url text, department text, funcao text, email text, username text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.id,
         COALESCE(NULLIF(btrim(p.full_name), ''), p.username, p.email, 'Sem nome') AS full_name,
         p.avatar_url, p.department, p.funcao, p.email, p.username
  FROM public.profiles p
  WHERE public.is_employee(auth.uid()) AND p.id = p_id;
$$;

GRANT EXECUTE ON FUNCTION public.chat_user_info(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
