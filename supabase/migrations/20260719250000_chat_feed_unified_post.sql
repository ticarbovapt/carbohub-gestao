-- ─────────────────────────────────────────────────────────────────────────────
-- Carbo Chat — Mural: post unificado. Reconhecimento (kudos) e mensagem/aviso
-- passam a ter AS MESMAS funcionalidades (texto + marcar pessoas + imagem +
-- público). Muda só o 'tipo' (rótulo/intenção). Qualquer interno posta os dois.
--
-- Aditivo: adiciona 1 RPC (as antigas continuam existindo).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.chat_feed_create_post(
  p_tipo        text,
  p_body        text,
  p_image_path  text DEFAULT NULL,
  p_targets     uuid[] DEFAULT '{}',
  p_audience    text DEFAULT 'all',
  p_departments text[] DEFAULT '{}',
  p_users       uuid[] DEFAULT '{}'
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_id uuid;
  v_tipo text := COALESCE(p_tipo, 'aviso');
  v_aud  text := COALESCE(p_audience, 'all');
BEGIN
  IF v_uid IS NULL OR NOT public.is_employee(v_uid) THEN RAISE EXCEPTION 'sem permissão'; END IF;
  IF v_tipo NOT IN ('kudos','aviso') THEN RAISE EXCEPTION 'tipo inválido'; END IF;
  IF v_aud NOT IN ('all','departments','users') THEN RAISE EXCEPTION 'público inválido'; END IF;
  IF (p_body IS NULL OR btrim(p_body) = '') AND p_image_path IS NULL THEN
    RAISE EXCEPTION 'escreva algo ou anexe uma imagem';
  END IF;
  IF v_aud = 'departments' AND COALESCE(array_length(p_departments,1),0) = 0 THEN v_aud := 'all'; END IF;
  IF v_aud = 'users'       AND COALESCE(array_length(p_users,1),0)       = 0 THEN v_aud := 'all'; END IF;

  INSERT INTO public.chat_feed_posts (tipo, author_id, body, image_path, target_ids, audience, audience_departments, audience_users)
  VALUES (v_tipo, v_uid, NULLIF(btrim(COALESCE(p_body,'')), ''), p_image_path, COALESCE(p_targets,'{}'),
          v_aud, COALESCE(p_departments,'{}'), COALESCE(p_users,'{}'))
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.chat_feed_create_post(text,text,text,uuid[],text,text[],uuid[]) TO authenticated;
