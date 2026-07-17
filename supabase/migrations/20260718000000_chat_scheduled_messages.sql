-- ─────────────────────────────────────────────────────────────────────────────
-- Carbo Chat — Agendar mensagem ("enviar depois"), DM e grupo.
--   • chat_scheduled_messages: fila de agendadas do usuário.
--   • Slots de 5 min: trigger arredonda send_at e nunca aceita passado.
--   • chat_dispatch_scheduled(): cron a cada 1 min; lote 100 + SKIP LOCKED;
--     insere em chat_messages (mesmo caminho → mesmo trigger de notificação/push).
--   • Idempotente: transição de status por linha, sem enviar duas vezes.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.chat_scheduled_messages (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id       uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  channel_id      uuid NOT NULL REFERENCES public.chat_channels(id) ON DELETE CASCADE,
  kind            text NOT NULL DEFAULT 'text' CHECK (kind IN ('text','image','video','audio','file')),
  body            text,
  mentions        uuid[] NOT NULL DEFAULT '{}',
  metadata        jsonb NOT NULL DEFAULT '{}'::jsonb,   -- { mention_all?, attachments: [{storage_path,mime_type,size_bytes,duration_ms}] }
  send_at         timestamptz NOT NULL,                 -- já arredondado a 5 min
  status          text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sending','sent','failed','canceled')),
  attempts        int NOT NULL DEFAULT 0,
  last_error      text,
  sent_message_id uuid REFERENCES public.chat_messages(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_chat_sched_due ON public.chat_scheduled_messages (status, send_at);
CREATE INDEX IF NOT EXISTS idx_chat_sched_author ON public.chat_scheduled_messages (author_id, status, send_at);

-- ── Arredondamento a 5 min + trava de passado (backend garante, não só a UI) ──
CREATE OR REPLACE FUNCTION public.chat_round_send_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v timestamptz;
BEGIN
  -- Só mexe no send_at quando ele é definido/alterado pelo usuário (status pending).
  IF TG_OP = 'INSERT' OR NEW.send_at IS DISTINCT FROM OLD.send_at THEN
    v := to_timestamp(round(extract(epoch FROM NEW.send_at) / 300.0) * 300);
    IF v <= now() THEN
      v := to_timestamp(ceil(extract(epoch FROM now()) / 300.0) * 300);  -- próximo slot
    END IF;
    NEW.send_at := v;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_chat_round_send_at ON public.chat_scheduled_messages;
CREATE TRIGGER trg_chat_round_send_at
  BEFORE INSERT OR UPDATE ON public.chat_scheduled_messages
  FOR EACH ROW EXECUTE FUNCTION public.chat_round_send_at();

-- ── RLS: cada um só as próprias; editar/cancelar só enquanto 'pending' ────────
ALTER TABLE public.chat_scheduled_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS chat_sched_select ON public.chat_scheduled_messages;
CREATE POLICY chat_sched_select ON public.chat_scheduled_messages
  FOR SELECT USING (author_id = auth.uid());

DROP POLICY IF EXISTS chat_sched_insert ON public.chat_scheduled_messages;
CREATE POLICY chat_sched_insert ON public.chat_scheduled_messages
  FOR INSERT WITH CHECK (
    author_id = auth.uid()
    AND public.is_employee(auth.uid())
    AND public.chat_is_member(channel_id, auth.uid())
  );

DROP POLICY IF EXISTS chat_sched_update ON public.chat_scheduled_messages;
CREATE POLICY chat_sched_update ON public.chat_scheduled_messages
  FOR UPDATE USING (author_id = auth.uid() AND status = 'pending')
  WITH CHECK (author_id = auth.uid());

DROP POLICY IF EXISTS chat_sched_delete ON public.chat_scheduled_messages;
CREATE POLICY chat_sched_delete ON public.chat_scheduled_messages
  FOR DELETE USING (author_id = auth.uid());

-- ── Disparo: lote 100, SKIP LOCKED, por linha, idempotente ───────────────────
CREATE OR REPLACE FUNCTION public.chat_dispatch_scheduled()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r         record;
  v_att     jsonb;
  v_msg_id  uuid;
  v_meta    jsonb;
  v_sent    int := 0;
  v_pending int;
BEGIN
  FOR r IN
    SELECT * FROM public.chat_scheduled_messages
    WHERE status = 'pending' AND send_at <= now()
    ORDER BY send_at
    LIMIT 100
    FOR UPDATE SKIP LOCKED
  LOOP
    BEGIN
      -- metadata da mensagem: preserva mention_all (o trigger de notify usa isso).
      v_meta := CASE WHEN COALESCE((r.metadata ->> 'mention_all')::boolean, false)
                     THEN jsonb_build_object('mention_all', true) ELSE '{}'::jsonb END;

      INSERT INTO public.chat_messages (channel_id, sender_id, kind, body, mentions, metadata)
      VALUES (r.channel_id, r.author_id, r.kind,
              NULLIF(btrim(COALESCE(r.body, '')), ''),
              COALESCE(r.mentions, '{}'), v_meta)
      RETURNING id INTO v_msg_id;

      -- anexos (arquivos já no bucket, enviados no momento do agendamento)
      IF r.metadata ? 'attachments' AND jsonb_typeof(r.metadata->'attachments') = 'array' THEN
        FOR v_att IN SELECT jsonb_array_elements(r.metadata->'attachments') LOOP
          INSERT INTO public.chat_attachments (message_id, storage_path, mime_type, size_bytes, duration_ms)
          VALUES (v_msg_id, v_att->>'storage_path', v_att->>'mime_type',
                  NULLIF(v_att->>'size_bytes','')::bigint, NULLIF(v_att->>'duration_ms','')::int);
        END LOOP;
        -- "toque" pro Realtime recarregar já com os anexos (igual ao envio normal)
        UPDATE public.chat_messages
          SET metadata = jsonb_build_object('attachments', jsonb_array_length(r.metadata->'attachments'))
          WHERE id = v_msg_id;
      END IF;

      UPDATE public.chat_scheduled_messages
        SET status = 'sent', sent_message_id = v_msg_id, updated_at = now()
        WHERE id = r.id;
      v_sent := v_sent + 1;

    EXCEPTION WHEN OTHERS THEN
      -- rollback do subbloco: a inserção da mensagem é desfeita → sem envio duplo.
      UPDATE public.chat_scheduled_messages
        SET status     = CASE WHEN attempts + 1 >= 5 THEN 'failed' ELSE 'pending' END,
            attempts   = attempts + 1,
            last_error = left(SQLERRM, 500),
            updated_at = now()
        WHERE id = r.id;
    END;
  END LOOP;

  SELECT count(*) INTO v_pending
    FROM public.chat_scheduled_messages WHERE status = 'pending' AND send_at <= now();
  IF v_pending > 200 THEN
    RAISE WARNING 'chat_dispatch_scheduled: backlog pendente vencido = %', v_pending;
  END IF;

  RETURN v_sent;
END $$;

REVOKE ALL ON FUNCTION public.chat_dispatch_scheduled() FROM public, authenticated, anon;

-- ── Cron a cada 1 min (pontualidade mesmo com slots de 5 em 5) ────────────────
-- OBS.: NÃO usar CREATE EXTENSION pg_cron via SQL no Supabase (o script interno
-- da extensão falha por privilégios). Habilite o pg_cron no painel:
--   Database > Extensions > pg_cron (toggle). Depois este bloco agenda sozinho.
-- Se o pg_cron ainda não estiver ligado, a migration NÃO falha — só avisa.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'chat-dispatch-scheduled') THEN
      PERFORM cron.unschedule('chat-dispatch-scheduled');
    END IF;
    PERFORM cron.schedule('chat-dispatch-scheduled', '* * * * *', 'SELECT public.chat_dispatch_scheduled();');
  ELSE
    RAISE NOTICE 'pg_cron não habilitado — ative em Database > Extensions e rode o agendamento à parte.';
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
