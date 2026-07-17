-- ─────────────────────────────────────────────────────────────────────────────
-- Carbo Chat — editar e apagar a PRÓPRIA mensagem.
-- Usa as colunas que já existem: chat_messages.edited_at / deleted_at.
-- RPCs autor-only (mais preciso que a RLS de UPDATE, que também deixa gestor).
-- Apagar = soft-delete (tombstone "Esta mensagem foi apagada"), não remove a linha.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.chat_edit_message(p_id uuid, p_body text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF btrim(COALESCE(p_body, '')) = '' THEN
    RAISE EXCEPTION 'mensagem vazia' USING ERRCODE = '22023';
  END IF;
  UPDATE public.chat_messages
     SET body = p_body, edited_at = now()
   WHERE id = p_id
     AND sender_id = auth.uid()
     AND deleted_at IS NULL;
END; $$;

CREATE OR REPLACE FUNCTION public.chat_delete_message(p_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.chat_messages
     SET deleted_at = now(), body = NULL, mentions = '{}'
   WHERE id = p_id
     AND sender_id = auth.uid()
     AND deleted_at IS NULL;
  -- some a mídia da bolha e da galeria (linhas de anexo).
  DELETE FROM public.chat_attachments a
   USING public.chat_messages m
   WHERE a.message_id = p_id AND m.id = p_id AND m.sender_id = auth.uid();
END; $$;

GRANT EXECUTE ON FUNCTION public.chat_edit_message(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.chat_delete_message(uuid)      TO authenticated;

NOTIFY pgrst, 'reload schema';
