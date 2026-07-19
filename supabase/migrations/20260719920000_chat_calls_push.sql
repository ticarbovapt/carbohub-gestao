-- ─────────────────────────────────────────────────────────────────────────────
-- Carbo Chat — C1.1: push de chamada recebida (app fechado).
--
-- Quando uma call_session entra 'ringing', dispara um Web Push pro destinatário
-- reaproveitando a MESMA Edge Function chat-push (via pg_net + chat_push_config).
-- A notificação abre /chat?c=<canal>; ao abrir, o catch-up do CallProvider mostra
-- o modal de atender se a chamada ainda estiver tocando.
--
-- A chat-push já pula quem está com o canal ativo (então não duplica com o modal
-- in-app). Aditivo: só um trigger novo em call_sessions; não toca no push do chat.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.call_notify_on_ring()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_cfg    public.chat_push_config%ROWTYPE;
  v_caller text;
BEGIN
  IF NEW.status <> 'ringing' OR NEW.callee_id IS NULL THEN RETURN NEW; END IF;

  SELECT COALESCE(NULLIF(btrim(full_name), ''), 'Alguém') INTO v_caller
  FROM public.profiles WHERE id = NEW.started_by;

  SELECT * INTO v_cfg FROM public.chat_push_config WHERE id LIMIT 1;
  IF FOUND AND v_cfg.function_url IS NOT NULL THEN
    BEGIN
      PERFORM net.http_post(
        url     := v_cfg.function_url,
        headers := jsonb_build_object('Content-Type','application/json','x-chat-push-secret', v_cfg.shared_secret),
        body    := jsonb_build_object('channel_id', NEW.channel_id,
                   'sender', v_caller, 'preview', '📞 Chamada de voz',
                   'recipients', jsonb_build_array(NEW.callee_id))
      );
    EXCEPTION WHEN OTHERS THEN NULL;  -- push nunca trava a criação da chamada
    END;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS call_notify_ring ON public.call_sessions;
CREATE TRIGGER call_notify_ring AFTER INSERT ON public.call_sessions
  FOR EACH ROW EXECUTE FUNCTION public.call_notify_on_ring();
