-- ─────────────────────────────────────────────────────────────────────────────
-- Carbo Chat — Fase 3: notificações. Trigger AFTER INSERT em chat_messages:
--  • DM  → notifica o outro participante de toda mensagem.
--  • Grupo → notifica só os @mencionados (NEW.mentions).
-- Respeita "mutado" e nunca notifica o próprio autor. Escreve na tabela
-- public.notifications (a que todos os sininhos já leem).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.chat_notify_on_message()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_sender  text;
  v_preview text;
BEGIN
  IF NEW.sender_id IS NULL THEN RETURN NEW; END IF;

  SELECT COALESCE(full_name, username, 'Alguém') INTO v_sender
  FROM public.profiles WHERE id = NEW.sender_id;

  v_preview := left(COALESCE(NULLIF(NEW.body, ''),
    CASE NEW.kind WHEN 'image' THEN '📷 Imagem' WHEN 'audio' THEN '🎤 Áudio'
                  WHEN 'video' THEN '🎬 Vídeo' WHEN 'file' THEN '📎 Arquivo'
                  ELSE 'Nova mensagem' END), 140);

  INSERT INTO public.notifications (user_id, type, title, body, reference_type, reference_id, is_read)
  SELECT m.user_id,
         'chat_message',
         CASE WHEN c.type = 'dm' THEN v_sender ELSE v_sender || ' mencionou você' END,
         v_preview,
         'chat', NEW.channel_id, false
  FROM public.chat_channel_members m
  JOIN public.chat_channels c ON c.id = NEW.channel_id
  WHERE m.channel_id = NEW.channel_id
    AND m.user_id <> NEW.sender_id
    AND m.muted = false
    AND (
      c.type = 'dm'
      OR (c.type = 'group' AND m.user_id = ANY (NEW.mentions))
    );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_chat_notify ON public.chat_messages;
CREATE TRIGGER trg_chat_notify
  AFTER INSERT ON public.chat_messages
  FOR EACH ROW EXECUTE FUNCTION public.chat_notify_on_message();

NOTIFY pgrst, 'reload schema';
