-- ─────────────────────────────────────────────────────────────────────────────
-- Reações ao vivo + @todos (menciona todos do grupo, ignora silenciado).
-- Atualiza o trigger de notificação:
--  • DM: notifica o outro (respeita silenciado).
--  • Grupo @todos (metadata.mention_all): notifica TODOS, mesmo silenciados.
--  • Grupo menção normal: só os mencionados que não silenciaram.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.chat_notify_on_message()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_sender  text;
  v_preview text;
  v_all     boolean;
BEGIN
  IF NEW.sender_id IS NULL THEN RETURN NEW; END IF;
  v_all := COALESCE((NEW.metadata ->> 'mention_all')::boolean, false);

  SELECT COALESCE(full_name, username, 'Alguém') INTO v_sender
  FROM public.profiles WHERE id = NEW.sender_id;

  v_preview := left(COALESCE(NULLIF(NEW.body, ''),
    CASE NEW.kind WHEN 'image' THEN '📷 Imagem' WHEN 'audio' THEN '🎤 Áudio'
                  WHEN 'video' THEN '🎬 Vídeo' WHEN 'file' THEN '📎 Arquivo'
                  ELSE 'Nova mensagem' END), 140);

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
      OR (c.type = 'group' AND v_all)                                                        -- @todos ignora silenciado
      OR (c.type = 'group' AND NOT v_all AND m.user_id = ANY (NEW.mentions) AND m.muted = false)
    );

  RETURN NEW;
END;
$$;

-- Reações em tempo real
ALTER TABLE public.chat_reactions REPLICA IDENTITY FULL;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables
                 WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'chat_reactions') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_reactions;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
