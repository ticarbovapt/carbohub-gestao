-- ─────────────────────────────────────────────────────────────────────────────
-- Carbo Chat — "visto por último" (last seen).
-- O "online" e o "digitando" vêm do Realtime Presence/Broadcast (sem banco).
-- Aqui só o timestamp persistido pra mostrar quando a pessoa está OFFLINE.
-- Reusa a tabela chat_presence (do push). Heartbeat app-wide via ChatAlerts.
-- ─────────────────────────────────────────────────────────────────────────────

-- Heartbeat: só avança o last_seen. NÃO mexe em active_channel_id/origin
-- (pra não interferir na lógica de push "está com o canal aberto").
CREATE OR REPLACE FUNCTION public.chat_touch_last_seen()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RETURN; END IF;
  INSERT INTO public.chat_presence (user_id, last_seen_at)
  VALUES (auth.uid(), now())
  ON CONFLICT (user_id) DO UPDATE SET last_seen_at = now();
END; $$;

GRANT EXECUTE ON FUNCTION public.chat_touch_last_seen() TO authenticated;

-- chat_user_info passa a devolver last_seen_at (o header do DM já usa esse RPC).
CREATE OR REPLACE FUNCTION public.chat_user_info(p_id uuid)
RETURNS TABLE (id uuid, full_name text, avatar_url text, department text, funcao text, email text, username text, last_seen_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.id,
         COALESCE(NULLIF(btrim(p.full_name), ''), p.username, p.email, 'Sem nome') AS full_name,
         p.avatar_url, p.department, p.funcao, p.email, p.username,
         pr.last_seen_at
  FROM public.profiles p
  LEFT JOIN public.chat_presence pr ON pr.user_id = p.id
  WHERE public.is_employee(auth.uid()) AND p.id = p_id;
$$;
GRANT EXECUTE ON FUNCTION public.chat_user_info(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
