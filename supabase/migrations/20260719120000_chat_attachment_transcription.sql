-- ─────────────────────────────────────────────────────────────────────────────
-- Carbo Chat — Transcrição de áudios (PT-BR), sob demanda e no dispositivo.
--
-- A transcrição roda no NAVEGADOR (Whisper via transformers.js, custo zero) e é
-- gravada aqui para ficar em cache: transcreve-se UMA vez e todos leem. Só o
-- TEXTO é guardado — o áudio nunca sai do dispositivo de quem transcreve.
--
-- Estados: none (ninguém pediu) → pending (alguém está transcrevendo) →
-- done (texto pronto) | failed (não foi possível).
--
-- Aditivo: adiciona 2 colunas em chat_attachments + 1 RPC. Nada é alterado no
-- envio/gravação de áudio.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.chat_attachments
  ADD COLUMN IF NOT EXISTS transcription        text,
  ADD COLUMN IF NOT EXISTS transcription_status text NOT NULL DEFAULT 'none';

-- CHECK idempotente (só cria se ainda não existir).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chat_attachments_transcription_status_chk') THEN
    ALTER TABLE public.chat_attachments
      ADD CONSTRAINT chat_attachments_transcription_status_chk
      CHECK (transcription_status IN ('none','pending','done','failed'));
  END IF;
END $$;

-- Grava a transcrição (ou o estado) de um anexo. Só membro do canal escreve.
-- "Toca" a mensagem-pai (edited_at) → o UPDATE em chat_messages já escutado pelo
-- ChatAlerts atualiza o balão ao vivo para todos os membros.
CREATE OR REPLACE FUNCTION public.chat_set_transcription(
  p_attachment uuid,
  p_text       text,
  p_status     text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_channel uuid;
  v_msg uuid;
BEGIN
  IF v_uid IS NULL OR NOT public.is_employee(v_uid) THEN RAISE EXCEPTION 'sem permissão'; END IF;
  IF p_status NOT IN ('none','pending','done','failed') THEN RAISE EXCEPTION 'status inválido'; END IF;

  SELECT m.channel_id, m.id INTO v_channel, v_msg
  FROM public.chat_attachments a
  JOIN public.chat_messages m ON m.id = a.message_id
  WHERE a.id = p_attachment;
  IF v_channel IS NULL THEN RAISE EXCEPTION 'anexo inexistente'; END IF;
  IF NOT public.chat_is_member(v_channel, v_uid) THEN RAISE EXCEPTION 'não é membro do canal'; END IF;

  UPDATE public.chat_attachments
    SET transcription = CASE WHEN p_status = 'done' THEN p_text ELSE transcription END,
        transcription_status = p_status
  WHERE id = p_attachment;

  UPDATE public.chat_messages SET edited_at = now() WHERE id = v_msg;
END;
$$;

GRANT EXECUTE ON FUNCTION public.chat_set_transcription(uuid,text,text) TO authenticated;
