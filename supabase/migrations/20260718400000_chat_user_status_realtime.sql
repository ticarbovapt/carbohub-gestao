-- Carbo Chat — status ao vivo: publica chat_user_status no Realtime para que a
-- mudança de status de alguém apareça na hora para os outros. (RLS já restringe
-- a leitura a internos; o Realtime respeita a RLS.)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'chat_user_status'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_user_status;
  END IF;
END $$;
