-- ─────────────────────────────────────────────────────────────────────────────
-- Carbo Chat — Status pessoal + controle de PUSH (Não perturbe / horário de
-- silêncio). O silêncio SEGURA o PUSH (não a mensagem): a notificação in-app
-- continua igual; só o push é retido. @todos e menção direta FURAM o silêncio
-- quando a pessoa permite (urgent_bypass, ligado por padrão).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.chat_user_status (
  user_id       uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  emoji         text,
  texto         text,
  availability  text NOT NULL DEFAULT 'disponivel'
                CHECK (availability IN ('disponivel','em_reuniao','em_campo','ausente','ferias')),
  expira_em     timestamptz,               -- opcional: status volta a "disponível" ao vencer
  dnd           boolean NOT NULL DEFAULT false,
  quiet_inicio  time,                       -- horário de silêncio (fuso do usuário)
  quiet_fim     time,
  timezone      text NOT NULL DEFAULT 'America/Sao_Paulo',
  urgent_bypass boolean NOT NULL DEFAULT true,  -- deixar @todos/menção furar o silêncio
  updated_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.chat_user_status ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS chat_status_select ON public.chat_user_status;
CREATE POLICY chat_status_select ON public.chat_user_status
  FOR SELECT USING (public.is_employee(auth.uid()));
DROP POLICY IF EXISTS chat_status_write ON public.chat_user_status;
CREATE POLICY chat_status_write ON public.chat_user_status
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- Silêncio agora? DND ligado OU dentro da janela de silêncio no fuso da pessoa.
CREATE OR REPLACE FUNCTION public.chat_is_quiet(p_uid uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE s public.chat_user_status%ROWTYPE; v_now time; v_tz text;
BEGIN
  SELECT * INTO s FROM public.chat_user_status WHERE user_id = p_uid;
  IF NOT FOUND THEN RETURN false; END IF;
  IF s.dnd THEN RETURN true; END IF;
  IF s.quiet_inicio IS NULL OR s.quiet_fim IS NULL OR s.quiet_inicio = s.quiet_fim THEN RETURN false; END IF;
  v_tz := COALESCE(NULLIF(s.timezone, ''), 'America/Sao_Paulo');
  v_now := (now() AT TIME ZONE v_tz)::time;
  IF s.quiet_inicio < s.quiet_fim THEN
    RETURN v_now >= s.quiet_inicio AND v_now < s.quiet_fim;      -- janela no mesmo dia
  ELSE
    RETURN v_now >= s.quiet_inicio OR v_now < s.quiet_fim;       -- vira a meia-noite (ex.: 22:00–07:00)
  END IF;
END $$;

-- Status efetivo de várias pessoas (expira_em vencido → limpa). Para lista/painel.
CREATE OR REPLACE FUNCTION public.chat_statuses(p_ids uuid[])
RETURNS TABLE (user_id uuid, emoji text, texto text, availability text, dnd boolean, expira_em timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT s.user_id,
    CASE WHEN s.expira_em IS NOT NULL AND s.expira_em <= now() THEN NULL ELSE NULLIF(s.emoji, '') END,
    CASE WHEN s.expira_em IS NOT NULL AND s.expira_em <= now() THEN NULL ELSE NULLIF(s.texto, '') END,
    CASE WHEN s.expira_em IS NOT NULL AND s.expira_em <= now() THEN 'disponivel' ELSE COALESCE(s.availability, 'disponivel') END,
    s.dnd, s.expira_em
  FROM public.chat_user_status s
  WHERE s.user_id = ANY (p_ids) AND public.is_employee(auth.uid());
$$;
GRANT EXECUTE ON FUNCTION public.chat_statuses(uuid[]) TO authenticated;

-- ── Push com respeito ao silêncio (in-app INALTERADA) ────────────────────────
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

  -- Notificação in-app (INALTERADA — nada é retido aqui).
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

  -- Destinatários do PUSH = mesma regra do in-app, MENOS quem está em silêncio
  -- (DND/quiet), a não ser que seja @todos/menção direta e a pessoa permita furo.
  SELECT array_agg(m.user_id) INTO v_recipients
  FROM public.chat_channel_members m
  JOIN public.chat_channels c ON c.id = NEW.channel_id
  LEFT JOIN public.chat_user_status s ON s.user_id = m.user_id
  WHERE m.channel_id = NEW.channel_id
    AND m.user_id <> NEW.sender_id
    AND (
      (c.type = 'dm' AND m.muted = false)
      OR (c.type = 'group' AND v_all)
      OR (c.type = 'group' AND NOT v_all AND m.user_id = ANY (NEW.mentions) AND m.muted = false)
    )
    AND (
      NOT public.chat_is_quiet(m.user_id)
      OR (COALESCE(s.urgent_bypass, true) AND (v_all OR m.user_id = ANY (NEW.mentions)))
    );

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
