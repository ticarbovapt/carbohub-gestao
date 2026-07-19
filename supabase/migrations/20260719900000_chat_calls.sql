-- ─────────────────────────────────────────────────────────────────────────────
-- Carbo Chat — C1: chamada de VOZ 1:1 na DM.
--
-- Mídia = LiveKit (@carbo/call + call-token, já existentes). Sinalização
-- (tocar/aceitar/recusar/cancelar) = tabela call_sessions + Realtime. Sala
-- LiveKit = 'call_'<session_id>. Ao encerrar/recusar/perder, grava um evento no
-- chat (chat_messages kind='call') com sender_id NULL → NÃO dispara push (o
-- trigger chat_notify_on_message sai cedo quando sender_id é NULL). Intocado.
--
-- Aditivo.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1) Novo kind 'call' pra registrar o evento no fluxo do chat.
ALTER TABLE public.chat_messages DROP CONSTRAINT IF EXISTS chat_messages_kind_check;
ALTER TABLE public.chat_messages
  ADD CONSTRAINT chat_messages_kind_check
  CHECK (kind IN ('text','image','video','audio','file','system','call'));

-- 2) Sessões de chamada.
CREATE TABLE IF NOT EXISTS public.call_sessions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id  uuid NOT NULL REFERENCES public.chat_channels(id) ON DELETE CASCADE,
  tipo        text NOT NULL DEFAULT 'audio' CHECK (tipo IN ('audio','video')),
  escopo      text NOT NULL DEFAULT 'dm'    CHECK (escopo IN ('dm','group')),
  started_by  uuid NOT NULL REFERENCES public.profiles(id),
  callee_id   uuid REFERENCES public.profiles(id),
  started_at  timestamptz NOT NULL DEFAULT now(),
  answered_at timestamptz,
  ended_at    timestamptz,
  status      text NOT NULL DEFAULT 'ringing' CHECK (status IN ('ringing','ongoing','ended','missed','declined'))
);
CREATE INDEX IF NOT EXISTS idx_call_sessions_channel ON public.call_sessions(channel_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_call_sessions_callee_ring ON public.call_sessions(callee_id) WHERE status = 'ringing';

ALTER TABLE public.call_sessions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS call_sessions_select ON public.call_sessions;
CREATE POLICY call_sessions_select ON public.call_sessions FOR SELECT
  USING (public.is_employee(auth.uid()) AND public.chat_is_member(channel_id, auth.uid()));
-- Escrita só via RPC (definer).

-- Helper: grava o evento 'call' no chat (sender_id NULL = sem push).
CREATE OR REPLACE FUNCTION public.call_post_event(
  p_channel uuid, p_body text, p_status text, p_duration_s int
) RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO public.chat_messages (channel_id, sender_id, kind, body, metadata)
  VALUES (p_channel, NULL, 'call', p_body,
          jsonb_build_object('tipo','audio','escopo','dm','status',p_status,'duration_s',p_duration_s));
$$;

-- 3) Iniciar chamada (só DM). Devolve session_id + nome da sala LiveKit.
CREATE OR REPLACE FUNCTION public.call_start(p_channel uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid(); v_type text; v_other uuid; v_id uuid;
BEGIN
  IF v_uid IS NULL OR NOT public.is_employee(v_uid) THEN RAISE EXCEPTION 'sem permissão'; END IF;
  IF NOT public.chat_is_member(p_channel, v_uid) THEN RAISE EXCEPTION 'não é membro do canal'; END IF;
  SELECT type INTO v_type FROM public.chat_channels WHERE id = p_channel;
  IF v_type <> 'dm' THEN RAISE EXCEPTION 'C1 só faz chamada em DM'; END IF;
  SELECT user_id INTO v_other FROM public.chat_channel_members
    WHERE channel_id = p_channel AND user_id <> v_uid LIMIT 1;
  IF v_other IS NULL THEN RAISE EXCEPTION 'sem destinatário'; END IF;

  INSERT INTO public.call_sessions (channel_id, tipo, escopo, started_by, callee_id, status)
  VALUES (p_channel, 'audio', 'dm', v_uid, v_other, 'ringing')
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('session_id', v_id, 'room', 'call_' || v_id, 'callee_id', v_other);
END;
$$;

-- 4) Aceitar (só o destinatário; só se ainda tocando).
CREATE OR REPLACE FUNCTION public.call_accept(p_session uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid(); v_row public.call_sessions%ROWTYPE;
BEGIN
  UPDATE public.call_sessions SET status = 'ongoing', answered_at = now()
   WHERE id = p_session AND status = 'ringing' AND callee_id = v_uid
   RETURNING * INTO v_row;
  IF NOT FOUND THEN RAISE EXCEPTION 'chamada indisponível'; END IF;
  RETURN jsonb_build_object('session_id', v_row.id, 'room', 'call_' || v_row.id);
END;
$$;

-- 5) Recusar (destinatário) → declined + evento "recusada".
CREATE OR REPLACE FUNCTION public.call_decline(p_session uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid(); v_row public.call_sessions%ROWTYPE;
BEGIN
  UPDATE public.call_sessions SET status = 'declined', ended_at = now()
   WHERE id = p_session AND status = 'ringing' AND callee_id = v_uid
   RETURNING * INTO v_row;
  IF NOT FOUND THEN RETURN; END IF;
  PERFORM public.call_post_event(v_row.channel_id, 'Chamada de voz recusada', 'declined', 0);
END;
$$;

-- 6) Cancelar antes de atender (quem ligou) → missed + evento "perdida".
CREATE OR REPLACE FUNCTION public.call_cancel(p_session uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid(); v_row public.call_sessions%ROWTYPE;
BEGIN
  UPDATE public.call_sessions SET status = 'missed', ended_at = now()
   WHERE id = p_session AND status = 'ringing' AND (started_by = v_uid OR callee_id = v_uid)
   RETURNING * INTO v_row;
  IF NOT FOUND THEN RETURN; END IF;
  PERFORM public.call_post_event(v_row.channel_id, 'Chamada de voz perdida', 'missed', 0);
END;
$$;

-- 7) Encerrar chamada em andamento → ended + evento "· N min".
CREATE OR REPLACE FUNCTION public.call_end(p_session uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid(); v_row public.call_sessions%ROWTYPE;
  v_dur int; v_label text;
BEGIN
  -- Só encerra quem participa e só se estava em andamento (idempotente).
  UPDATE public.call_sessions SET status = 'ended', ended_at = now()
   WHERE id = p_session AND status = 'ongoing' AND (started_by = v_uid OR callee_id = v_uid)
   RETURNING * INTO v_row;
  IF NOT FOUND THEN RETURN; END IF;

  v_dur := GREATEST(0, EXTRACT(EPOCH FROM (v_row.ended_at - COALESCE(v_row.answered_at, v_row.started_at)))::int);
  v_label := CASE WHEN v_dur < 60 THEN v_dur || 's' ELSE (v_dur / 60) || ' min' END;
  PERFORM public.call_post_event(v_row.channel_id, 'Chamada de voz · ' || v_label, 'completed', v_dur);
END;
$$;

-- 8) Realtime: publica call_sessions (guardado).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'call_sessions') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.call_sessions;
  END IF;
END $$;
ALTER TABLE public.call_sessions REPLICA IDENTITY FULL;

-- 9) Permissões.
GRANT EXECUTE ON FUNCTION public.call_start(uuid)   TO authenticated;
GRANT EXECUTE ON FUNCTION public.call_accept(uuid)  TO authenticated;
GRANT EXECUTE ON FUNCTION public.call_decline(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.call_cancel(uuid)  TO authenticated;
GRANT EXECUTE ON FUNCTION public.call_end(uuid)     TO authenticated;
