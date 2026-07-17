-- ─────────────────────────────────────────────────────────────────────────────
-- Carbo Chat — CANAIS PÚBLICOS (descobríveis) além dos grupos privados.
--  • Canal público: listável e LEGÍVEL por qualquer interno mesmo sem ser membro.
--  • Para POSTAR / receber notificação: precisa ENTRAR (virar member).
--  • DMs e grupos privados: RLS inalterada.
--  • Fecha um furo pré-existente: self-join passa a valer SÓ em canal público.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1) Colunas novas ------------------------------------------------------------
ALTER TABLE public.chat_channels ADD COLUMN IF NOT EXISTS visibility text NOT NULL DEFAULT 'private';
ALTER TABLE public.chat_channels ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE public.chat_channels ADD COLUMN IF NOT EXISTS topic text;
ALTER TABLE public.chat_channels DROP CONSTRAINT IF EXISTS chat_channels_visibility_chk;
ALTER TABLE public.chat_channels ADD CONSTRAINT chat_channels_visibility_chk CHECK (visibility IN ('public','private'));

-- Backfill preservando o comportamento atual: grupo hoje is_private=false já era
-- listável a todos → vira 'public'; o resto → 'private'. (is_private continua em
-- sincronia com visibility p/ nada que ainda o leia quebrar.)
UPDATE public.chat_channels
  SET visibility = CASE WHEN type = 'group' AND is_private = false THEN 'public' ELSE 'private' END;
UPDATE public.chat_channels SET is_private = (visibility = 'private');

CREATE INDEX IF NOT EXISTS idx_chat_channels_public
  ON public.chat_channels (visibility, type) WHERE visibility = 'public' AND archived_at IS NULL;

-- 2) RLS ----------------------------------------------------------------------
-- Canais: enxerga se é membro OU se é canal público (qualquer interno).
DROP POLICY IF EXISTS chat_channels_select ON public.chat_channels;
CREATE POLICY chat_channels_select ON public.chat_channels FOR SELECT USING (
  public.is_employee(auth.uid()) AND (
    public.chat_is_member(id, auth.uid())
    OR (type = 'group' AND visibility = 'public' AND archived_at IS NULL)
  )
);

-- Mensagens: membro OU histórico de canal público (leitura). DM/privado igual.
DROP POLICY IF EXISTS chat_messages_select ON public.chat_messages;
CREATE POLICY chat_messages_select ON public.chat_messages FOR SELECT USING (
  public.chat_is_member(channel_id, auth.uid())
  OR (public.is_employee(auth.uid()) AND EXISTS (
        SELECT 1 FROM public.chat_channels c
        WHERE c.id = channel_id AND c.type = 'group'
          AND c.visibility = 'public' AND c.archived_at IS NULL))
);
-- INSERT de mensagem inalterado (postar exige ser membro) → não recriar aqui.

-- Anexos/reações: leitura espelha a da mensagem (inclui histórico público).
DROP POLICY IF EXISTS chat_attachments_select ON public.chat_attachments;
CREATE POLICY chat_attachments_select ON public.chat_attachments FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.chat_messages m
    JOIN public.chat_channels c ON c.id = m.channel_id
    WHERE m.id = message_id AND (
      public.chat_is_member(m.channel_id, auth.uid())
      OR (public.is_employee(auth.uid()) AND c.type = 'group' AND c.visibility = 'public' AND c.archived_at IS NULL)
    )
  )
);
DROP POLICY IF EXISTS chat_reactions_select ON public.chat_reactions;
CREATE POLICY chat_reactions_select ON public.chat_reactions FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.chat_messages m
    JOIN public.chat_channels c ON c.id = m.channel_id
    WHERE m.id = message_id AND (
      public.chat_is_member(m.channel_id, auth.uid())
      OR (public.is_employee(auth.uid()) AND c.type = 'group' AND c.visibility = 'public' AND c.archived_at IS NULL)
    )
  )
);

-- Membros: self-join agora SÓ em canal público (fecha o furo de entrar em
-- qualquer canal). Admin adiciona; criador monta. SELECT segue estrito (não é
-- recriado aqui) → não vaza a lista de quem está num canal que você não entrou.
DROP POLICY IF EXISTS chat_members_insert ON public.chat_channel_members;
CREATE POLICY chat_members_insert ON public.chat_channel_members FOR INSERT WITH CHECK (
  public.is_employee(auth.uid()) AND (
    (user_id = auth.uid() AND EXISTS (
        SELECT 1 FROM public.chat_channels c
        WHERE c.id = channel_id AND c.type = 'group'
          AND c.visibility = 'public' AND c.archived_at IS NULL))
    OR public.chat_is_admin(channel_id, auth.uid())
    OR EXISTS (SELECT 1 FROM public.chat_channels c
               WHERE c.id = channel_id AND c.created_by = auth.uid())
  )
);

-- 3) Diretório de canais públicos (respeita is_employee) -----------------------
CREATE OR REPLACE FUNCTION public.chat_public_channels(p_search text DEFAULT NULL)
RETURNS TABLE (
  channel_id uuid, name text, description text, topic text, avatar_url text,
  member_count bigint, is_member boolean, last_activity timestamptz
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT c.id, c.name, c.description, c.topic, c.avatar_url,
    (SELECT count(*) FROM public.chat_channel_members m WHERE m.channel_id = c.id),
    EXISTS (SELECT 1 FROM public.chat_channel_members m WHERE m.channel_id = c.id AND m.user_id = auth.uid()),
    GREATEST(c.created_at, COALESCE(
      (SELECT max(msg.created_at) FROM public.chat_messages msg
       WHERE msg.channel_id = c.id AND msg.deleted_at IS NULL), c.created_at))
  FROM public.chat_channels c
  WHERE c.type = 'group' AND c.visibility = 'public' AND c.archived_at IS NULL
    AND public.is_employee(auth.uid())
    AND (p_search IS NULL OR btrim(p_search) = ''
         OR c.name ILIKE '%'||p_search||'%'
         OR COALESCE(c.topic,'') ILIKE '%'||p_search||'%'
         OR COALESCE(c.description,'') ILIKE '%'||p_search||'%')
  ORDER BY (SELECT count(*) FROM public.chat_channel_members m WHERE m.channel_id = c.id) DESC, c.name;
$$;
GRANT EXECUTE ON FUNCTION public.chat_public_channels(text) TO authenticated;

-- 4) Entrar num canal público -------------------------------------------------
CREATE OR REPLACE FUNCTION public.chat_join_channel(p_channel uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_employee(auth.uid()) THEN
    RAISE EXCEPTION 'Chat é somente para usuários internos.' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.chat_channels c
                 WHERE c.id = p_channel AND c.type = 'group'
                   AND c.visibility = 'public' AND c.archived_at IS NULL) THEN
    RAISE EXCEPTION 'Canal não é público.' USING ERRCODE = '42501';
  END IF;
  INSERT INTO public.chat_channel_members (channel_id, user_id, role)
  VALUES (p_channel, auth.uid(), 'member')
  ON CONFLICT DO NOTHING;
END; $$;
GRANT EXECUTE ON FUNCTION public.chat_join_channel(uuid) TO authenticated;

-- 5) Criar grupo estendido (visibility/descrição/tópico) ----------------------
DROP FUNCTION IF EXISTS public.chat_create_group(text, uuid[], boolean);
CREATE OR REPLACE FUNCTION public.chat_create_group(
  p_name text, p_member_ids uuid[], p_is_private boolean DEFAULT true,
  p_visibility text DEFAULT NULL, p_description text DEFAULT NULL, p_topic text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid; v_vis text;
BEGIN
  IF NOT public.is_employee(auth.uid()) THEN
    RAISE EXCEPTION 'Chat é somente para usuários internos.' USING ERRCODE = '42501';
  END IF;
  v_vis := COALESCE(NULLIF(p_visibility, ''), CASE WHEN COALESCE(p_is_private, true) THEN 'private' ELSE 'public' END);
  IF v_vis NOT IN ('public','private') THEN v_vis := 'private'; END IF;

  INSERT INTO public.chat_channels (type, name, is_private, visibility, description, topic, created_by)
  VALUES ('group', btrim(p_name), (v_vis = 'private'), v_vis,
          NULLIF(btrim(COALESCE(p_description,'')),''), NULLIF(btrim(COALESCE(p_topic,'')),''), auth.uid())
  RETURNING id INTO v_id;

  INSERT INTO public.chat_channel_members (channel_id, user_id, role)
  VALUES (v_id, auth.uid(), 'owner');

  INSERT INTO public.chat_channel_members (channel_id, user_id, role)
  SELECT v_id, u, 'member' FROM unnest(COALESCE(p_member_ids, '{}')) AS u
  WHERE u <> auth.uid()
  ON CONFLICT DO NOTHING;

  RETURN v_id;
END; $$;
GRANT EXECUTE ON FUNCTION public.chat_create_group(text, uuid[], boolean, text, text, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
