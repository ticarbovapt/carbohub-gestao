-- ─────────────────────────────────────────────────────────────────────────────
-- Carbo Chat — texto do push mais limpo (estilo WhatsApp).
--  • DM:    título = quem enviou;        corpo = mensagem.
--  • Grupo: título = nome do grupo;      corpo = "Fulano: mensagem".
-- Só muda o TEXTO enviado à Edge Function (campos sender/preview do payload);
-- a função e a notificação in-app seguem inalteradas. (O "from <App>" que o
-- iPhone mostra é atribuição automática do iOS — não vem daqui.)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.chat_notify_on_message()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_sender     text;
  v_preview    text;
  v_all        boolean;
  v_recipients uuid[];
  v_cfg        public.chat_push_config%ROWTYPE;
  v_ctype      text;
  v_cname      text;
  v_push_title text;
  v_push_body  text;
BEGIN
  IF NEW.sender_id IS NULL THEN RETURN NEW; END IF;
  v_all := COALESCE((NEW.metadata ->> 'mention_all')::boolean, false);

  SELECT COALESCE(full_name, username, 'Alguém') INTO v_sender
  FROM public.profiles WHERE id = NEW.sender_id;

  SELECT c.type, c.name INTO v_ctype, v_cname
  FROM public.chat_channels c WHERE c.id = NEW.channel_id;

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

  -- Destinatários do push (mesma regra do in-app).
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

  -- Texto do push (estilo WhatsApp).
  IF v_ctype = 'dm' THEN
    v_push_title := v_sender;
    v_push_body  := v_preview;
  ELSE
    v_push_title := COALESCE(NULLIF(v_cname, ''), 'Grupo');
    v_push_body  := v_sender || ': ' || v_preview;
  END IF;

  IF v_recipients IS NOT NULL THEN
    SELECT * INTO v_cfg FROM public.chat_push_config WHERE id LIMIT 1;
    IF FOUND AND v_cfg.function_url IS NOT NULL THEN
      BEGIN
        PERFORM net.http_post(
          url     := v_cfg.function_url,
          headers := jsonb_build_object('Content-Type','application/json','x-chat-push-secret', v_cfg.shared_secret),
          body    := jsonb_build_object('message_id', NEW.id, 'channel_id', NEW.channel_id,
                     'sender', v_push_title, 'preview', v_push_body, 'recipients', to_jsonb(v_recipients))
        );
      EXCEPTION WHEN OTHERS THEN NULL;
      END;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

NOTIFY pgrst, 'reload schema';
