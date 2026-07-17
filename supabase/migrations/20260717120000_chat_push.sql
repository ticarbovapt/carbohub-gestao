-- ─────────────────────────────────────────────────────────────────────────────
-- Carbo Chat — Push com o app FECHADO (Web Push / VAPID).
--
-- Canal ADICIONAL à notificação in-app (notifications + toast), que continua
-- intacta. Reaproveita EXATAMENTE a lógica de destinatários do trigger
-- chat_notify_on_message (DM avisa o outro; grupo avisa mencionados; @todos fura
-- silêncio; respeita mutado; nunca o autor).
--
-- Entrega: 1 push por pessoa, no ÚLTIMO app que ela usou (chat_presence.origin).
-- O envio real e o "não mandar se está com o canal aberto" ficam na Edge
-- Function `chat-push`, chamada aqui via pg_net (assíncrono → nunca trava o
-- INSERT da mensagem).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE EXTENSION IF NOT EXISTS pg_net;

-- ── Assinaturas de push (uma por navegador+origin+device; endpoint é único) ───
CREATE TABLE IF NOT EXISTS public.chat_push_subscriptions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint     text NOT NULL UNIQUE,               -- chave de dedup (global)
  p256dh       text NOT NULL,
  auth         text NOT NULL,
  origin       text,                               -- ex.: https://ops.carbohub.com.br
  device       text,                               -- dica de UA (só p/ humano)
  created_at   timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS chat_push_subs_user_idx
  ON public.chat_push_subscriptions (user_id, last_seen_at DESC);

ALTER TABLE public.chat_push_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS chat_push_subs_own_select ON public.chat_push_subscriptions;
CREATE POLICY chat_push_subs_own_select ON public.chat_push_subscriptions
  FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS chat_push_subs_own_write ON public.chat_push_subscriptions;
CREATE POLICY chat_push_subs_own_write ON public.chat_push_subscriptions
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ── Presença: qual app (origin) a pessoa usou por último e que canal vê agora ──
CREATE TABLE IF NOT EXISTS public.chat_presence (
  user_id           uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  active_channel_id uuid,
  origin            text,
  last_seen_at      timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.chat_presence ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS chat_presence_own ON public.chat_presence;
CREATE POLICY chat_presence_own ON public.chat_presence
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ── Config (URL da Edge Function + segredo compartilhado) fora do código ──────
-- RLS ligada e SEM policy → ninguém do app lê; só funções SECURITY DEFINER.
CREATE TABLE IF NOT EXISTS public.chat_push_config (
  id            boolean PRIMARY KEY DEFAULT true CHECK (id),
  function_url  text NOT NULL,
  shared_secret text NOT NULL
);
ALTER TABLE public.chat_push_config ENABLE ROW LEVEL SECURITY;

-- ── RPCs do cliente ───────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.chat_save_push_subscription(
  p_endpoint text, p_p256dh text, p_auth text, p_origin text, p_device text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'sem sessão'; END IF;
  INSERT INTO public.chat_push_subscriptions (user_id, endpoint, p256dh, auth, origin, device, last_seen_at)
  VALUES (auth.uid(), p_endpoint, p_p256dh, p_auth, p_origin, p_device, now())
  ON CONFLICT (endpoint) DO UPDATE
    SET user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth,
        origin = excluded.origin, device = excluded.device, last_seen_at = now();
END; $$;

CREATE OR REPLACE FUNCTION public.chat_delete_push_subscription(p_endpoint text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  DELETE FROM public.chat_push_subscriptions
  WHERE endpoint = p_endpoint AND user_id = auth.uid();
END; $$;

-- Heartbeat: marca app aberto (origin) + canal em foco. Também "toca" a
-- subscription daquele origin p/ manter a recência do "último app usado".
CREATE OR REPLACE FUNCTION public.chat_presence_ping(p_channel_id uuid, p_origin text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RETURN; END IF;
  INSERT INTO public.chat_presence (user_id, active_channel_id, origin, last_seen_at)
  VALUES (auth.uid(), p_channel_id, p_origin, now())
  ON CONFLICT (user_id) DO UPDATE
    SET active_channel_id = excluded.active_channel_id, origin = excluded.origin, last_seen_at = now();
  UPDATE public.chat_push_subscriptions
    SET last_seen_at = now()
    WHERE user_id = auth.uid() AND origin = p_origin;
END; $$;

GRANT EXECUTE ON FUNCTION public.chat_save_push_subscription(text,text,text,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.chat_delete_push_subscription(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.chat_presence_ping(uuid,text) TO authenticated;

-- ── Trigger: mesma lógica de destinatários + dispara a Edge Function ──────────
CREATE OR REPLACE FUNCTION public.chat_notify_on_message()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_sender     text;
  v_preview    text;
  v_all        boolean;
  v_recipients uuid[];
  v_cfg        public.chat_push_config%ROWTYPE;
BEGIN
  IF NEW.sender_id IS NULL THEN RETURN NEW; END IF;
  v_all := COALESCE((NEW.metadata ->> 'mention_all')::boolean, false);

  SELECT COALESCE(full_name, username, 'Alguém') INTO v_sender
  FROM public.profiles WHERE id = NEW.sender_id;

  v_preview := left(COALESCE(NULLIF(NEW.body, ''),
    CASE NEW.kind WHEN 'image' THEN '📷 Imagem' WHEN 'audio' THEN '🎤 Áudio'
                  WHEN 'video' THEN '🎬 Vídeo' WHEN 'file' THEN '📎 Arquivo'
                  ELSE 'Nova mensagem' END), 140);

  -- Notificação in-app (INALTERADA).
  INSERT INTO public.notifications (user_id, type, title, body, reference_type, reference_id, is_read)
  SELECT m.user_id, 'chat_message',
         CASE WHEN c.type = 'dm' THEN v_sender
              WHEN v_all THEN v_sender || ' mencionou @todos'
              ELSE v_sender || ' mencionou você' END,
         v_preview, 'chat', NEW.channel_id, false
  FROM public.chat_channel_members m
  JOIN public.chat_channels c ON c.id = NEW.channel_id
  WHERE m.channel_id = NEW.channel_id
    AND m.user_id <> NEW.sender_id
    AND (
      (c.type = 'dm' AND m.muted = false)
      OR (c.type = 'group' AND v_all)
      OR (c.type = 'group' AND NOT v_all AND m.user_id = ANY (NEW.mentions) AND m.muted = false)
    );

  -- Mesmíssima regra → lista de destinatários para o push.
  SELECT array_agg(m.user_id) INTO v_recipients
  FROM public.chat_channel_members m
  JOIN public.chat_channels c ON c.id = NEW.channel_id
  WHERE m.channel_id = NEW.channel_id
    AND m.user_id <> NEW.sender_id
    AND (
      (c.type = 'dm' AND m.muted = false)
      OR (c.type = 'group' AND v_all)
      OR (c.type = 'group' AND NOT v_all AND m.user_id = ANY (NEW.mentions) AND m.muted = false)
    );

  -- Dispara a Edge Function (assíncrono; falha aqui nunca quebra a mensagem).
  IF v_recipients IS NOT NULL THEN
    SELECT * INTO v_cfg FROM public.chat_push_config WHERE id LIMIT 1;
    IF FOUND AND v_cfg.function_url IS NOT NULL THEN
      BEGIN
        PERFORM net.http_post(
          url     := v_cfg.function_url,
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'x-chat-push-secret', v_cfg.shared_secret
          ),
          body    := jsonb_build_object(
            'message_id', NEW.id,
            'channel_id', NEW.channel_id,
            'sender',     v_sender,
            'preview',    v_preview,
            'recipients', to_jsonb(v_recipients)
          )
        );
      EXCEPTION WHEN OTHERS THEN
        -- push é best-effort; ignora qualquer erro de rede/config.
        NULL;
      END;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_chat_notify ON public.chat_messages;
CREATE TRIGGER trg_chat_notify
  AFTER INSERT ON public.chat_messages
  FOR EACH ROW EXECUTE FUNCTION public.chat_notify_on_message();

NOTIFY pgrst, 'reload schema';

-- ── PÓS-DEPLOY (rodar UMA vez, com seus valores) ─────────────────────────────
--   INSERT INTO public.chat_push_config (id, function_url, shared_secret)
--   VALUES (true,
--     'https://wpkfirmapxevzpxjovjr.supabase.co/functions/v1/chat-push',
--     '<CHAT_PUSH_SHARED_SECRET — o mesmo secret setado na Edge Function>')
--   ON CONFLICT (id) DO UPDATE
--     SET function_url = excluded.function_url, shared_secret = excluded.shared_secret;
