-- ─────────────────────────────────────────────────────────────────────────────
-- Carbo Chat — C2: chamada de voz em GRUPO (huddle). Reusa call_sessions
-- (escopo 'group') + LiveKit (sala 'call_'<session_id>). Sem limite de pessoas
-- por enquanto. Uma chamada ativa por canal (reentra na mesma).
--
-- Aditivo. Não toca na C1 (call_start/accept/decline/cancel/end seguem iguais).
-- ─────────────────────────────────────────────────────────────────────────────

-- 1) Participantes da chamada (join/leave; reentrar zera left_at).
CREATE TABLE IF NOT EXISTS public.call_participants (
  session_id uuid NOT NULL REFERENCES public.call_sessions(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  joined_at  timestamptz NOT NULL DEFAULT now(),
  left_at    timestamptz,
  PRIMARY KEY (session_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_call_participants_active ON public.call_participants(session_id) WHERE left_at IS NULL;

ALTER TABLE public.call_participants ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS call_participants_select ON public.call_participants;
CREATE POLICY call_participants_select ON public.call_participants FOR SELECT
  USING (public.is_employee(auth.uid()) AND EXISTS (
    SELECT 1 FROM public.call_sessions s
    WHERE s.id = session_id AND public.chat_is_member(s.channel_id, auth.uid())
  ));
-- Escrita só via RPC.

-- 2) Uma chamada de GRUPO ativa por canal (evita corrida ao iniciar).
CREATE UNIQUE INDEX IF NOT EXISTS call_sessions_one_group_active
  ON public.call_sessions(channel_id) WHERE status = 'ongoing' AND escopo = 'group';

-- Evento no chat ao encerrar (escopo group).
CREATE OR REPLACE FUNCTION public.call_post_event_group(
  p_channel uuid, p_body text, p_duration_s int, p_participants int
) RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO public.chat_messages (channel_id, sender_id, kind, body, metadata)
  VALUES (p_channel, NULL, 'call', p_body,
          jsonb_build_object('tipo','audio','escopo','group','status','completed',
                             'duration_s',p_duration_s,'participants',p_participants));
$$;

-- 3) Entrar (ou iniciar) a chamada de voz do grupo.
CREATE OR REPLACE FUNCTION public.group_call_join(p_channel uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid(); v_type text; v_session uuid; v_count int;
BEGIN
  IF v_uid IS NULL OR NOT public.is_employee(v_uid) THEN RAISE EXCEPTION 'sem permissão'; END IF;
  IF NOT public.chat_is_member(p_channel, v_uid) THEN RAISE EXCEPTION 'não é membro do canal'; END IF;
  SELECT type INTO v_type FROM public.chat_channels WHERE id = p_channel;
  IF v_type <> 'group' THEN RAISE EXCEPTION 'huddle só em grupo'; END IF;

  SELECT id INTO v_session FROM public.call_sessions
   WHERE channel_id = p_channel AND escopo = 'group' AND status = 'ongoing' LIMIT 1;
  IF v_session IS NULL THEN
    INSERT INTO public.call_sessions (channel_id, tipo, escopo, started_by, status)
    VALUES (p_channel, 'audio', 'group', v_uid, 'ongoing')
    ON CONFLICT (channel_id) WHERE status = 'ongoing' AND escopo = 'group' DO NOTHING
    RETURNING id INTO v_session;
    IF v_session IS NULL THEN
      SELECT id INTO v_session FROM public.call_sessions
       WHERE channel_id = p_channel AND escopo = 'group' AND status = 'ongoing' LIMIT 1;
    END IF;
  END IF;

  INSERT INTO public.call_participants (session_id, user_id, joined_at)
  VALUES (v_session, v_uid, now())
  ON CONFLICT (session_id, user_id) DO UPDATE SET left_at = NULL, joined_at = now();

  SELECT count(*) INTO v_count FROM public.call_participants WHERE session_id = v_session AND left_at IS NULL;
  RETURN jsonb_build_object('session_id', v_session, 'room', 'call_' || v_session, 'count', v_count);
END;
$$;

-- 4) Sair; se ninguém ativo sobrar, encerra e registra o evento.
CREATE OR REPLACE FUNCTION public.group_call_leave(p_session uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid(); v_row public.call_sessions%ROWTYPE; v_dur int; v_np int; v_label text;
BEGIN
  UPDATE public.call_participants SET left_at = now()
   WHERE session_id = p_session AND user_id = v_uid AND left_at IS NULL;

  IF NOT EXISTS (SELECT 1 FROM public.call_participants WHERE session_id = p_session AND left_at IS NULL) THEN
    UPDATE public.call_sessions SET status = 'ended', ended_at = now()
     WHERE id = p_session AND status = 'ongoing' RETURNING * INTO v_row;
    IF FOUND THEN
      v_dur := GREATEST(0, EXTRACT(EPOCH FROM (v_row.ended_at - v_row.started_at))::int);
      v_label := CASE WHEN v_dur < 60 THEN v_dur || 's' ELSE (v_dur / 60) || ' min' END;
      SELECT count(DISTINCT user_id) INTO v_np FROM public.call_participants WHERE session_id = p_session;
      PERFORM public.call_post_event_group(v_row.channel_id,
        'Chamada de voz em grupo · ' || v_label || ' · ' || v_np || ' participantes', v_dur, v_np);
    END IF;
  END IF;
END;
$$;

-- 5) Estado da chamada do canal (banner + painel).
CREATE OR REPLACE FUNCTION public.group_call_state(p_channel uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid(); v_session uuid; v_res jsonb;
BEGIN
  IF v_uid IS NULL OR NOT public.chat_is_member(p_channel, v_uid) THEN RETURN NULL; END IF;
  SELECT id INTO v_session FROM public.call_sessions
   WHERE channel_id = p_channel AND escopo = 'group' AND status = 'ongoing' LIMIT 1;
  IF v_session IS NULL THEN RETURN NULL; END IF;
  SELECT jsonb_build_object(
    'session_id', v_session,
    'room', 'call_' || v_session,
    'count', (SELECT count(*) FROM public.call_participants WHERE session_id = v_session AND left_at IS NULL),
    'participants', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('id', p.id, 'full_name', p.full_name, 'avatar_url', p.avatar_url) ORDER BY cp.joined_at), '[]'::jsonb)
      FROM public.call_participants cp JOIN public.profiles p ON p.id = cp.user_id
      WHERE cp.session_id = v_session AND cp.left_at IS NULL
    )
  ) INTO v_res;
  RETURN v_res;
END;
$$;

-- 6) Realtime.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'call_participants') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.call_participants;
  END IF;
END $$;
ALTER TABLE public.call_participants REPLICA IDENTITY FULL;

-- 7) Permissões.
GRANT EXECUTE ON FUNCTION public.group_call_join(uuid)  TO authenticated;
GRANT EXECUTE ON FUNCTION public.group_call_leave(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.group_call_state(uuid) TO authenticated;
