-- ─────────────────────────────────────────────────────────────────────────────
-- Carbo Chat — criar grupo via RPC definer (evita impasse de RLS).
-- Criar um grupo PRIVADO pelo cliente falha porque, no instante de inserir os
-- membros, a política de chat_channel_members consulta chat_channels — que pela
-- RLS de SELECT ainda não é visível (você não é membro). A RPC definer resolve.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.chat_create_group(
  p_name text, p_member_ids uuid[], p_is_private boolean DEFAULT true
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  IF NOT public.is_employee(auth.uid()) THEN
    RAISE EXCEPTION 'Chat é somente para usuários internos.' USING ERRCODE = '42501';
  END IF;
  INSERT INTO public.chat_channels (type, name, is_private, created_by)
  VALUES ('group', btrim(p_name), COALESCE(p_is_private, true), auth.uid())
  RETURNING id INTO v_id;

  INSERT INTO public.chat_channel_members (channel_id, user_id, role)
  VALUES (v_id, auth.uid(), 'owner');

  INSERT INTO public.chat_channel_members (channel_id, user_id, role)
  SELECT v_id, u, 'member' FROM unnest(COALESCE(p_member_ids, '{}')) AS u
  WHERE u <> auth.uid()
  ON CONFLICT DO NOTHING;

  RETURN v_id;
END; $$;
GRANT EXECUTE ON FUNCTION public.chat_create_group(text, uuid[], boolean) TO authenticated;

NOTIFY pgrst, 'reload schema';
