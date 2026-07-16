-- ─────────────────────────────────────────────────────────────────────────────
-- Lista de conversas estilo WhatsApp: por canal do usuário, traz o outro (DM),
-- a ÚLTIMA mensagem (texto/tipo/hora/remetente), não-lidas e ordena por atividade.
-- SECURITY DEFINER porque resolve nomes (RLS de profiles esconderia o outro).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.chat_conversations()
RETURNS TABLE (
  channel_id uuid, type text, name text, is_private boolean, channel_avatar text,
  other_id uuid, other_name text, other_avatar text,
  last_body text, last_kind text, last_at timestamptz, last_sender_id uuid, last_sender_name text,
  unread bigint, last_activity timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH my AS (
    SELECT m.channel_id, m.last_read_at
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
         COALESCE(lm.created_at, ch.created_at)
  FROM ch
  LEFT JOIN last_msg lm ON lm.channel_id = ch.id
  LEFT JOIN unread u   ON u.channel_id = ch.id
  LEFT JOIN other o    ON o.channel_id = ch.id
  LEFT JOIN public.profiles op ON op.id = o.user_id
  LEFT JOIN public.profiles sp ON sp.id = lm.sender_id
  ORDER BY COALESCE(lm.created_at, ch.created_at) DESC;
$$;

GRANT EXECUTE ON FUNCTION public.chat_conversations() TO authenticated;

NOTIFY pgrst, 'reload schema';
