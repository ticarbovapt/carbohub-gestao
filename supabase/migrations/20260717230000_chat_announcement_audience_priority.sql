-- ─────────────────────────────────────────────────────────────────────────────
-- Carbo Chat — Comunicado: público (todos/departamento/pessoas) + prioridade.
--  • chat_create_announcement_audience: resolve o público no servidor.
--  • chat_departments: lista de departamentos (pro seletor).
--  • chat_conversations: devolve needs_ack e ordena comunicados não confirmados
--    no topo (prioridade), mesmo mutado/arquivado.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.chat_departments()
RETURNS TABLE (dep text) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT dep FROM (
    SELECT department::text AS dep FROM public.profiles WHERE public.is_employee(id)
    UNION
    SELECT secondary_department::text AS dep FROM public.profiles WHERE public.is_employee(id)
  ) t WHERE dep IS NOT NULL ORDER BY dep;
$$;
GRANT EXECUTE ON FUNCTION public.chat_departments() TO authenticated;

-- Cria o comunicado resolvendo o público no servidor.
--  p_audience: 'all' | 'departments' | 'users'
CREATE OR REPLACE FUNCTION public.chat_create_announcement_audience(
  p_name text, p_audience text, p_departments text[] DEFAULT '{}', p_user_ids uuid[] DEFAULT '{}'
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  IF NOT public.chat_can_announce() THEN
    RAISE EXCEPTION 'Sem permissão para publicar comunicado' USING ERRCODE = '42501';
  END IF;
  INSERT INTO public.chat_channels (type, name, is_private, is_announcement, created_by)
  VALUES ('group', btrim(p_name), true, true, auth.uid())
  RETURNING id INTO v_id;

  INSERT INTO public.chat_channel_members (channel_id, user_id, role)
  VALUES (v_id, auth.uid(), 'owner');

  IF p_audience = 'all' THEN
    INSERT INTO public.chat_channel_members (channel_id, user_id, role)
    SELECT v_id, p.id, 'member' FROM public.profiles p
    WHERE public.is_employee(p.id) AND p.id <> auth.uid()
    ON CONFLICT DO NOTHING;
  ELSIF p_audience = 'departments' THEN
    INSERT INTO public.chat_channel_members (channel_id, user_id, role)
    SELECT v_id, p.id, 'member' FROM public.profiles p
    WHERE public.is_employee(p.id) AND p.id <> auth.uid()
      AND (p.department::text = ANY (p_departments) OR p.secondary_department::text = ANY (p_departments))
    ON CONFLICT DO NOTHING;
  ELSE
    INSERT INTO public.chat_channel_members (channel_id, user_id, role)
    SELECT v_id, u, 'member' FROM unnest(COALESCE(p_user_ids, '{}')) AS u
    WHERE u <> auth.uid()
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN v_id;
END; $$;
GRANT EXECUTE ON FUNCTION public.chat_create_announcement_audience(text, text, text[], uuid[]) TO authenticated;

-- chat_conversations com needs_ack + prioridade (não confirmado no topo).
DROP FUNCTION IF EXISTS public.chat_conversations();
CREATE OR REPLACE FUNCTION public.chat_conversations()
RETURNS TABLE (
  channel_id uuid, type text, name text, is_private boolean, channel_avatar text,
  other_id uuid, other_name text, other_avatar text,
  last_body text, last_kind text, last_at timestamptz, last_sender_id uuid, last_sender_name text,
  unread bigint, last_activity timestamptz, muted boolean, pinned boolean, archived boolean,
  is_announcement boolean, needs_ack boolean
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH my AS (
    SELECT m.channel_id, m.last_read_at, m.muted, m.pinned, m.archived
    FROM public.chat_channel_members m WHERE m.user_id = auth.uid()
  ),
  ch AS (
    SELECT c.* FROM public.chat_channels c JOIN my ON my.channel_id = c.id
    WHERE c.archived_at IS NULL
  ),
  last_msg AS (
    SELECT DISTINCT ON (msg.channel_id) msg.channel_id, msg.body, msg.kind, msg.created_at, msg.sender_id
    FROM public.chat_messages msg JOIN my ON my.channel_id = msg.channel_id
    WHERE msg.deleted_at IS NULL ORDER BY msg.channel_id, msg.created_at DESC
  ),
  unread AS (
    SELECT my.channel_id, COUNT(msg.*) AS cnt FROM my
    LEFT JOIN public.chat_messages msg ON msg.channel_id = my.channel_id
     AND msg.created_at > my.last_read_at AND msg.sender_id IS DISTINCT FROM auth.uid() AND msg.deleted_at IS NULL
    GROUP BY my.channel_id
  ),
  other AS (
    SELECT mm.channel_id, mm.user_id FROM public.chat_channel_members mm
    JOIN ch ON ch.id = mm.channel_id AND ch.type = 'dm' WHERE mm.user_id <> auth.uid()
  ),
  ack AS (
    SELECT ch.id AS channel_id,
      (ch.is_announcement AND EXISTS (
        SELECT 1 FROM public.chat_messages mm
        LEFT JOIN public.chat_acks a ON a.message_id = mm.id AND a.user_id = auth.uid()
        WHERE mm.channel_id = ch.id AND mm.deleted_at IS NULL
          AND mm.sender_id IS DISTINCT FROM auth.uid() AND a.user_id IS NULL
      )) AS needs_ack
    FROM ch
  )
  SELECT ch.id, ch.type, ch.name, ch.is_private, ch.avatar_url, op.id,
         COALESCE(NULLIF(btrim(op.full_name), ''), op.username, op.email), op.avatar_url,
         lm.body, lm.kind, lm.created_at, lm.sender_id,
         COALESCE(NULLIF(btrim(sp.full_name), ''), sp.username, sp.email),
         COALESCE(u.cnt, 0), COALESCE(lm.created_at, ch.created_at),
         my.muted, my.pinned, my.archived, ch.is_announcement, COALESCE(ak.needs_ack, false)
  FROM ch JOIN my ON my.channel_id = ch.id
  LEFT JOIN last_msg lm ON lm.channel_id = ch.id
  LEFT JOIN unread u ON u.channel_id = ch.id
  LEFT JOIN other o ON o.channel_id = ch.id
  LEFT JOIN ack ak ON ak.channel_id = ch.id
  LEFT JOIN public.profiles op ON op.id = o.user_id
  LEFT JOIN public.profiles sp ON sp.id = lm.sender_id
  ORDER BY COALESCE(ak.needs_ack, false) DESC, my.pinned DESC, COALESCE(lm.created_at, ch.created_at) DESC;
$$;

NOTIFY pgrst, 'reload schema';
