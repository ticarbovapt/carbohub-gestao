-- ─────────────────────────────────────────────────────────────────────────────
-- Carbo Chat — Fase 0 (backend). Chat interno cross-system (CRM/Ops/Finanças/Admin).
-- Tabelas chat_*, RLS (só internos), helpers SECURITY DEFINER p/ evitar recursão,
-- RPCs (não-lidas, marcar lido, get-or-create DM), bucket de mídia e Realtime.
-- Ver docs/CARBO-CHAT.md.
-- ─────────────────────────────────────────────────────────────────────────────

-- ============================ TABELAS ============================

CREATE TABLE IF NOT EXISTS public.chat_channels (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type         text NOT NULL CHECK (type IN ('group','dm')),
  name         text,                       -- null em dm
  description  text,
  is_private   boolean NOT NULL DEFAULT true,
  avatar_url   text,
  created_by   uuid REFERENCES public.profiles(id),
  created_at   timestamptz NOT NULL DEFAULT now(),
  archived_at  timestamptz
);

CREATE TABLE IF NOT EXISTS public.chat_channel_members (
  channel_id   uuid NOT NULL REFERENCES public.chat_channels(id) ON DELETE CASCADE,
  user_id      uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role         text NOT NULL DEFAULT 'member' CHECK (role IN ('owner','admin','member')),
  joined_at    timestamptz NOT NULL DEFAULT now(),
  last_read_at timestamptz NOT NULL DEFAULT now(),
  muted        boolean NOT NULL DEFAULT false,
  PRIMARY KEY (channel_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_chat_members_user ON public.chat_channel_members(user_id);

CREATE TABLE IF NOT EXISTS public.chat_messages (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id   uuid NOT NULL REFERENCES public.chat_channels(id) ON DELETE CASCADE,
  sender_id    uuid REFERENCES public.profiles(id),
  kind         text NOT NULL DEFAULT 'text' CHECK (kind IN ('text','image','video','audio','file','system')),
  body         text,
  reply_to_id  uuid REFERENCES public.chat_messages(id) ON DELETE SET NULL,
  mentions     uuid[] NOT NULL DEFAULT '{}',
  metadata     jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at   timestamptz NOT NULL DEFAULT now(),
  edited_at    timestamptz,
  deleted_at   timestamptz
);
CREATE INDEX IF NOT EXISTS idx_chat_messages_channel ON public.chat_messages(channel_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.chat_attachments (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id     uuid NOT NULL REFERENCES public.chat_messages(id) ON DELETE CASCADE,
  storage_path   text NOT NULL,
  mime_type      text,
  size_bytes     bigint,
  width          int,
  height         int,
  duration_ms    int,
  thumbnail_path text
);
CREATE INDEX IF NOT EXISTS idx_chat_attachments_msg ON public.chat_attachments(message_id);

CREATE TABLE IF NOT EXISTS public.chat_reactions (
  message_id uuid NOT NULL REFERENCES public.chat_messages(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  emoji      text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (message_id, user_id, emoji)
);

-- ============================ HELPERS (definer, sem recursão de RLS) ============================

CREATE OR REPLACE FUNCTION public.chat_is_member(p_channel uuid, p_uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.chat_channel_members m
                 WHERE m.channel_id = p_channel AND m.user_id = p_uid);
$$;

CREATE OR REPLACE FUNCTION public.chat_is_admin(p_channel uuid, p_uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.chat_channel_members m
                 WHERE m.channel_id = p_channel AND m.user_id = p_uid AND m.role IN ('owner','admin'));
$$;

-- Extrai o channel_id do path do storage ({channel_id}/{message_id}/arquivo), com guarda.
CREATE OR REPLACE FUNCTION public.chat_path_channel(p_name text)
RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN split_part(p_name, '/', 1) ~ '^[0-9a-fA-F-]{36}$'
              THEN split_part(p_name, '/', 1)::uuid END;
$$;

-- ============================ RLS ============================

ALTER TABLE public.chat_channels        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_channel_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_attachments     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_reactions       ENABLE ROW LEVEL SECURITY;

-- canais
DROP POLICY IF EXISTS chat_channels_select ON public.chat_channels;
CREATE POLICY chat_channels_select ON public.chat_channels FOR SELECT USING (
  public.is_employee(auth.uid()) AND (
    public.chat_is_member(id, auth.uid())
    OR (type = 'group' AND is_private = false AND archived_at IS NULL)
  )
);
DROP POLICY IF EXISTS chat_channels_insert ON public.chat_channels;
CREATE POLICY chat_channels_insert ON public.chat_channels FOR INSERT WITH CHECK (
  public.is_employee(auth.uid()) AND created_by = auth.uid()
);
DROP POLICY IF EXISTS chat_channels_update ON public.chat_channels;
CREATE POLICY chat_channels_update ON public.chat_channels FOR UPDATE USING (
  created_by = auth.uid() OR public.chat_is_admin(id, auth.uid()) OR public.is_gestor(auth.uid())
);
DROP POLICY IF EXISTS chat_channels_delete ON public.chat_channels;
CREATE POLICY chat_channels_delete ON public.chat_channels FOR DELETE USING (
  created_by = auth.uid() OR public.is_gestor(auth.uid())
);

-- membros
DROP POLICY IF EXISTS chat_members_select ON public.chat_channel_members;
CREATE POLICY chat_members_select ON public.chat_channel_members FOR SELECT USING (
  public.is_employee(auth.uid()) AND public.chat_is_member(channel_id, auth.uid())
);
DROP POLICY IF EXISTS chat_members_insert ON public.chat_channel_members;
CREATE POLICY chat_members_insert ON public.chat_channel_members FOR INSERT WITH CHECK (
  public.is_employee(auth.uid()) AND (
    user_id = auth.uid()                                   -- entrar você mesmo
    OR public.chat_is_admin(channel_id, auth.uid())        -- admin adiciona
    OR EXISTS (SELECT 1 FROM public.chat_channels c        -- criador montando o canal
               WHERE c.id = channel_id AND c.created_by = auth.uid())
  )
);
DROP POLICY IF EXISTS chat_members_update ON public.chat_channel_members;
CREATE POLICY chat_members_update ON public.chat_channel_members FOR UPDATE USING (
  user_id = auth.uid() OR public.chat_is_admin(channel_id, auth.uid())
);
DROP POLICY IF EXISTS chat_members_delete ON public.chat_channel_members;
CREATE POLICY chat_members_delete ON public.chat_channel_members FOR DELETE USING (
  user_id = auth.uid() OR public.chat_is_admin(channel_id, auth.uid())
);

-- mensagens
DROP POLICY IF EXISTS chat_messages_select ON public.chat_messages;
CREATE POLICY chat_messages_select ON public.chat_messages FOR SELECT USING (
  public.chat_is_member(channel_id, auth.uid())
);
DROP POLICY IF EXISTS chat_messages_insert ON public.chat_messages;
CREATE POLICY chat_messages_insert ON public.chat_messages FOR INSERT WITH CHECK (
  sender_id = auth.uid() AND public.chat_is_member(channel_id, auth.uid())
);
DROP POLICY IF EXISTS chat_messages_update ON public.chat_messages;
CREATE POLICY chat_messages_update ON public.chat_messages FOR UPDATE USING (
  sender_id = auth.uid() OR public.is_gestor(auth.uid())
);
DROP POLICY IF EXISTS chat_messages_delete ON public.chat_messages;
CREATE POLICY chat_messages_delete ON public.chat_messages FOR DELETE USING (
  sender_id = auth.uid() OR public.is_gestor(auth.uid())
);

-- anexos (herdam acesso da mensagem)
DROP POLICY IF EXISTS chat_attachments_select ON public.chat_attachments;
CREATE POLICY chat_attachments_select ON public.chat_attachments FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.chat_messages m
          WHERE m.id = message_id AND public.chat_is_member(m.channel_id, auth.uid()))
);
DROP POLICY IF EXISTS chat_attachments_insert ON public.chat_attachments;
CREATE POLICY chat_attachments_insert ON public.chat_attachments FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM public.chat_messages m
          WHERE m.id = message_id AND m.sender_id = auth.uid())
);

-- reações
DROP POLICY IF EXISTS chat_reactions_select ON public.chat_reactions;
CREATE POLICY chat_reactions_select ON public.chat_reactions FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.chat_messages m
          WHERE m.id = message_id AND public.chat_is_member(m.channel_id, auth.uid()))
);
DROP POLICY IF EXISTS chat_reactions_write ON public.chat_reactions;
CREATE POLICY chat_reactions_write ON public.chat_reactions FOR ALL USING (
  user_id = auth.uid()
) WITH CHECK (
  user_id = auth.uid() AND EXISTS (SELECT 1 FROM public.chat_messages m
          WHERE m.id = message_id AND public.chat_is_member(m.channel_id, auth.uid()))
);

-- ============================ RPCs ============================

-- Não-lidas por canal do usuário atual (alimenta o badge).
CREATE OR REPLACE FUNCTION public.chat_unread_counts()
RETURNS TABLE (channel_id uuid, unread bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT m.channel_id, COUNT(msg.*)::bigint
  FROM public.chat_channel_members m
  LEFT JOIN public.chat_messages msg
    ON msg.channel_id = m.channel_id
   AND msg.created_at > m.last_read_at
   AND msg.sender_id IS DISTINCT FROM m.user_id
   AND msg.deleted_at IS NULL
  WHERE m.user_id = auth.uid()
  GROUP BY m.channel_id;
$$;

-- Marca um canal como lido.
CREATE OR REPLACE FUNCTION public.chat_mark_read(p_channel uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.chat_channel_members SET last_read_at = now()
  WHERE channel_id = p_channel AND user_id = auth.uid();
$$;

-- Abre (ou reaproveita) a DM entre o usuário atual e outro interno.
CREATE OR REPLACE FUNCTION public.chat_get_or_create_dm(p_other uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_me uuid := auth.uid(); v_id uuid;
BEGIN
  IF NOT public.is_employee(v_me) OR NOT public.is_employee(p_other) THEN
    RAISE EXCEPTION 'Chat é somente para usuários internos.' USING ERRCODE = '42501';
  END IF;
  IF p_other = v_me THEN RAISE EXCEPTION 'DM consigo mesmo não é permitida.'; END IF;

  SELECT c.id INTO v_id
  FROM public.chat_channels c
  WHERE c.type = 'dm'
    AND EXISTS (SELECT 1 FROM public.chat_channel_members a WHERE a.channel_id = c.id AND a.user_id = v_me)
    AND EXISTS (SELECT 1 FROM public.chat_channel_members b WHERE b.channel_id = c.id AND b.user_id = p_other)
    AND (SELECT COUNT(*) FROM public.chat_channel_members mm WHERE mm.channel_id = c.id) = 2
  LIMIT 1;

  IF v_id IS NOT NULL THEN RETURN v_id; END IF;

  INSERT INTO public.chat_channels(type, created_by) VALUES ('dm', v_me) RETURNING id INTO v_id;
  INSERT INTO public.chat_channel_members(channel_id, user_id, role)
  VALUES (v_id, v_me, 'owner'), (v_id, p_other, 'member');
  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.chat_unread_counts()             TO authenticated;
GRANT EXECUTE ON FUNCTION public.chat_mark_read(uuid)             TO authenticated;
GRANT EXECUTE ON FUNCTION public.chat_get_or_create_dm(uuid)      TO authenticated;

-- ============================ STORAGE (mídia) ============================

INSERT INTO storage.buckets (id, name, public)
VALUES ('chat-media', 'chat-media', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "chat-media read" ON storage.objects;
CREATE POLICY "chat-media read" ON storage.objects FOR SELECT TO authenticated USING (
  bucket_id = 'chat-media' AND public.is_employee(auth.uid())
  AND public.chat_is_member(public.chat_path_channel(name), auth.uid())
);
DROP POLICY IF EXISTS "chat-media write" ON storage.objects;
CREATE POLICY "chat-media write" ON storage.objects FOR INSERT TO authenticated WITH CHECK (
  bucket_id = 'chat-media' AND public.is_employee(auth.uid())
  AND public.chat_is_member(public.chat_path_channel(name), auth.uid())
);

-- ============================ REALTIME ============================

ALTER TABLE public.chat_messages        REPLICA IDENTITY FULL;
ALTER TABLE public.chat_channel_members REPLICA IDENTITY FULL;
ALTER TABLE public.chat_channels        REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables
                 WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='chat_messages') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables
                 WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='chat_channel_members') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_channel_members;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables
                 WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='chat_channels') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_channels;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
