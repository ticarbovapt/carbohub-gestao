-- ─────────────────────────────────────────────────────────────────────────────
-- Carbo Chat — Comunicado Oficial (canal somente-leitura publicado por admin/RH).
-- Reusa chat_channels (flag is_announcement) + chat_channel_members (role).
-- "Li e estou ciente" = chat_acks. Lembrete de quem não confirmou = push (reusa
-- a Edge chat-push) + notificação in-app, agendado por pg_cron (fora daqui).
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.chat_channels
  ADD COLUMN IF NOT EXISTS is_announcement boolean NOT NULL DEFAULT false;

-- ── Quem pode criar/publicar comunicado: gestor OU departamento RH ────────────
CREATE OR REPLACE FUNCTION public.chat_can_announce()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_gestor(auth.uid())
      OR EXISTS (SELECT 1 FROM public.profiles p
                 WHERE p.id = auth.uid() AND upper(btrim(coalesce(p.department, ''))) = 'RH');
$$;
GRANT EXECUTE ON FUNCTION public.chat_can_announce() TO authenticated;

-- ── Somente-leitura: em canal announcement só publica owner/admin ─────────────
DROP POLICY IF EXISTS chat_messages_insert ON public.chat_messages;
CREATE POLICY chat_messages_insert ON public.chat_messages FOR INSERT WITH CHECK (
  sender_id = auth.uid() AND public.chat_is_member(channel_id, auth.uid())
  AND (
    NOT EXISTS (SELECT 1 FROM public.chat_channels c WHERE c.id = channel_id AND c.is_announcement)
    OR public.chat_is_admin(channel_id, auth.uid())
  )
);

-- ── Criar comunicado (gated). Criador = owner; publicadores extras = admin ─────
CREATE OR REPLACE FUNCTION public.chat_create_announcement(
  p_name text, p_member_ids uuid[], p_admin_ids uuid[] DEFAULT '{}'
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid; v_admins uuid[] := COALESCE(p_admin_ids, '{}');
BEGIN
  IF NOT public.chat_can_announce() THEN
    RAISE EXCEPTION 'Sem permissão para publicar comunicado' USING ERRCODE = '42501';
  END IF;
  INSERT INTO public.chat_channels (type, name, is_private, is_announcement, created_by)
  VALUES ('group', btrim(p_name), true, true, auth.uid())
  RETURNING id INTO v_id;

  -- criador = owner
  INSERT INTO public.chat_channel_members (channel_id, user_id, role)
  VALUES (v_id, auth.uid(), 'owner');
  -- publicadores extras = admin
  INSERT INTO public.chat_channel_members (channel_id, user_id, role)
  SELECT v_id, u, 'admin' FROM unnest(v_admins) AS u
  WHERE u <> auth.uid()
  ON CONFLICT DO NOTHING;
  -- demais = member (somente leitura)
  INSERT INTO public.chat_channel_members (channel_id, user_id, role)
  SELECT v_id, u, 'member' FROM unnest(COALESCE(p_member_ids, '{}')) AS u
  WHERE u <> auth.uid() AND NOT (u = ANY (v_admins))
  ON CONFLICT DO NOTHING;

  RETURN v_id;
END; $$;
GRANT EXECUTE ON FUNCTION public.chat_create_announcement(text, uuid[], uuid[]) TO authenticated;

-- ── Confirmações "Li e estou ciente" ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.chat_acks (
  message_id uuid NOT NULL REFERENCES public.chat_messages(id) ON DELETE CASCADE,
  channel_id uuid NOT NULL REFERENCES public.chat_channels(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  acked_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (message_id, user_id)
);
CREATE INDEX IF NOT EXISTS chat_acks_channel_idx ON public.chat_acks (channel_id);
ALTER TABLE public.chat_acks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS chat_acks_select ON public.chat_acks;
CREATE POLICY chat_acks_select ON public.chat_acks FOR SELECT USING (
  user_id = auth.uid() OR public.chat_is_admin(channel_id, auth.uid())
);
DROP POLICY IF EXISTS chat_acks_insert ON public.chat_acks;
CREATE POLICY chat_acks_insert ON public.chat_acks FOR INSERT WITH CHECK (
  user_id = auth.uid() AND public.chat_is_member(channel_id, auth.uid())
);

ALTER TABLE public.chat_acks REPLICA IDENTITY FULL;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables
                 WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='chat_acks') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_acks;
  END IF;
END $$;

-- dedupe de lembretes
CREATE TABLE IF NOT EXISTS public.chat_ack_reminders (
  message_id uuid NOT NULL REFERENCES public.chat_messages(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL,
  sent_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (message_id, user_id)
);
ALTER TABLE public.chat_ack_reminders ENABLE ROW LEVEL SECURITY; -- sem policy: só definer

-- Confirmar leitura
CREATE OR REPLACE FUNCTION public.chat_ack_message(p_message uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.chat_acks (message_id, channel_id, user_id)
  SELECT m.id, m.channel_id, auth.uid()
  FROM public.chat_messages m
  JOIN public.chat_channels c ON c.id = m.channel_id
  WHERE m.id = p_message AND c.is_announcement AND m.deleted_at IS NULL
    AND public.chat_is_member(m.channel_id, auth.uid())
    AND m.sender_id IS DISTINCT FROM auth.uid()
  ON CONFLICT DO NOTHING;
END; $$;
GRANT EXECUTE ON FUNCTION public.chat_ack_message(uuid) TO authenticated;

-- Painel do publicador: quem confirmou / quem falta (por mensagem)
CREATE OR REPLACE FUNCTION public.chat_announcement_status(p_message uuid)
RETURNS TABLE (user_id uuid, full_name text, avatar_url text, acked boolean, acked_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_channel uuid; v_sender uuid;
BEGIN
  SELECT channel_id, sender_id INTO v_channel, v_sender FROM public.chat_messages WHERE id = p_message;
  IF v_channel IS NULL OR NOT public.chat_is_admin(v_channel, auth.uid()) THEN RETURN; END IF;
  RETURN QUERY
  SELECT mm.user_id,
         COALESCE(NULLIF(btrim(p.full_name), ''), p.username, p.email, 'Sem nome'),
         p.avatar_url,
         (a.user_id IS NOT NULL), a.acked_at
  FROM public.chat_channel_members mm
  JOIN public.profiles p ON p.id = mm.user_id
  LEFT JOIN public.chat_acks a ON a.message_id = p_message AND a.user_id = mm.user_id
  WHERE mm.channel_id = v_channel AND mm.user_id <> v_sender
  ORDER BY (a.user_id IS NOT NULL), p.full_name;
END; $$;
GRANT EXECUTE ON FUNCTION public.chat_announcement_status(uuid) TO authenticated;

-- Lembrete: push + in-app pra quem não confirmou depois de p_hours (dedupe).
CREATE OR REPLACE FUNCTION public.chat_announcement_remind(p_hours int DEFAULT 12)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; v_cfg public.chat_push_config%ROWTYPE; v_n int := 0;
BEGIN
  CREATE TEMP TABLE _pending ON COMMIT DROP AS
  SELECT m.id AS message_id, m.channel_id, mm.user_id,
         left(COALESCE(NULLIF(m.body, ''), 'Comunicado'), 120) AS preview
  FROM public.chat_messages m
  JOIN public.chat_channels c ON c.id = m.channel_id AND c.is_announcement
  JOIN public.chat_channel_members mm ON mm.channel_id = m.channel_id AND mm.user_id <> m.sender_id
  LEFT JOIN public.chat_acks a ON a.message_id = m.id AND a.user_id = mm.user_id
  LEFT JOIN public.chat_ack_reminders rr ON rr.message_id = m.id AND rr.user_id = mm.user_id
  WHERE m.deleted_at IS NULL
    AND m.created_at < now() - make_interval(hours => p_hours)
    AND a.user_id IS NULL AND rr.user_id IS NULL;

  SELECT count(*) INTO v_n FROM _pending;
  IF v_n = 0 THEN RETURN 0; END IF;

  INSERT INTO public.notifications (user_id, type, title, body, reference_type, reference_id, is_read)
  SELECT user_id, 'announcement_reminder', 'Comunicado oficial pendente',
         'Confirme a leitura: ' || preview, 'chat', channel_id, false
  FROM _pending;

  INSERT INTO public.chat_ack_reminders (message_id, user_id)
  SELECT message_id, user_id FROM _pending ON CONFLICT DO NOTHING;

  SELECT * INTO v_cfg FROM public.chat_push_config WHERE id LIMIT 1;
  IF FOUND AND v_cfg.function_url IS NOT NULL THEN
    FOR r IN
      SELECT message_id, channel_id, max(preview) AS preview, array_agg(user_id) AS recips
      FROM _pending GROUP BY message_id, channel_id
    LOOP
      BEGIN
        PERFORM net.http_post(
          url := v_cfg.function_url,
          headers := jsonb_build_object('Content-Type','application/json','x-chat-push-secret', v_cfg.shared_secret),
          body := jsonb_build_object('message_id', r.message_id, 'channel_id', r.channel_id,
                  'sender', 'Comunicado oficial', 'preview', 'Confirme a leitura: ' || r.preview,
                  'recipients', to_jsonb(r.recips))
        );
      EXCEPTION WHEN OTHERS THEN NULL; END;
    END LOOP;
  END IF;

  RETURN v_n;
END; $$;
GRANT EXECUTE ON FUNCTION public.chat_announcement_remind(int) TO authenticated;

-- ── chat_conversations passa a devolver is_announcement (DROP + recria) ───────
DROP FUNCTION IF EXISTS public.chat_conversations();
CREATE OR REPLACE FUNCTION public.chat_conversations()
RETURNS TABLE (
  channel_id uuid, type text, name text, is_private boolean, channel_avatar text,
  other_id uuid, other_name text, other_avatar text,
  last_body text, last_kind text, last_at timestamptz, last_sender_id uuid, last_sender_name text,
  unread bigint, last_activity timestamptz, muted boolean, pinned boolean, archived boolean,
  is_announcement boolean
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH my AS (
    SELECT m.channel_id, m.last_read_at, m.muted, m.pinned, m.archived
    FROM public.chat_channel_members m
    WHERE m.user_id = auth.uid()
  ),
  ch AS (
    SELECT c.* FROM public.chat_channels c
    JOIN my ON my.channel_id = c.id
    WHERE c.archived_at IS NULL
  ),
  last_msg AS (
    SELECT DISTINCT ON (msg.channel_id)
           msg.channel_id, msg.body, msg.kind, msg.created_at, msg.sender_id
    FROM public.chat_messages msg
    JOIN my ON my.channel_id = msg.channel_id
    WHERE msg.deleted_at IS NULL
    ORDER BY msg.channel_id, msg.created_at DESC
  ),
  unread AS (
    SELECT my.channel_id, COUNT(msg.*) AS cnt
    FROM my
    LEFT JOIN public.chat_messages msg
      ON msg.channel_id = my.channel_id
     AND msg.created_at > my.last_read_at
     AND msg.sender_id IS DISTINCT FROM auth.uid()
     AND msg.deleted_at IS NULL
    GROUP BY my.channel_id
  ),
  other AS (
    SELECT mm.channel_id, mm.user_id
    FROM public.chat_channel_members mm
    JOIN ch ON ch.id = mm.channel_id AND ch.type = 'dm'
    WHERE mm.user_id <> auth.uid()
  )
  SELECT ch.id, ch.type, ch.name, ch.is_private, ch.avatar_url,
         op.id,
         COALESCE(NULLIF(btrim(op.full_name), ''), op.username, op.email),
         op.avatar_url,
         lm.body, lm.kind, lm.created_at, lm.sender_id,
         COALESCE(NULLIF(btrim(sp.full_name), ''), sp.username, sp.email),
         COALESCE(u.cnt, 0),
         COALESCE(lm.created_at, ch.created_at),
         my.muted, my.pinned, my.archived, ch.is_announcement
  FROM ch
  JOIN my ON my.channel_id = ch.id
  LEFT JOIN last_msg lm ON lm.channel_id = ch.id
  LEFT JOIN unread u   ON u.channel_id = ch.id
  LEFT JOIN other o    ON o.channel_id = ch.id
  LEFT JOIN public.profiles op ON op.id = o.user_id
  LEFT JOIN public.profiles sp ON sp.id = lm.sender_id
  ORDER BY my.pinned DESC, COALESCE(lm.created_at, ch.created_at) DESC;
$$;

NOTIFY pgrst, 'reload schema';

-- ── PÓS-DEPLOY (rodar 1x, precisa de pg_cron habilitado) ─────────────────────
--   CREATE EXTENSION IF NOT EXISTS pg_cron;
--   SELECT cron.schedule('carbo-chat-ack-remind', '0 * * * *',
--     $$ SELECT public.chat_announcement_remind(12) $$);
