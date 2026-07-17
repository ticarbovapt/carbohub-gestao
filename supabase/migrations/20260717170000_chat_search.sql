-- ─────────────────────────────────────────────────────────────────────────────
-- Carbo Chat — busca no servidor (full-text português) sobre chat_messages.body.
-- Coluna gerada tsvector + índice GIN. RPC definer que respeita a participação
-- (só canais do usuário) e paginação. Busca dentro de 1 canal ou global.
-- ─────────────────────────────────────────────────────────────────────────────

-- Índice full-text (português): coluna gerada + GIN.
ALTER TABLE public.chat_messages
  ADD COLUMN IF NOT EXISTS body_tsv tsvector
  GENERATED ALWAYS AS (to_tsvector('portuguese', coalesce(body, ''))) STORED;

CREATE INDEX IF NOT EXISTS chat_messages_body_tsv_idx
  ON public.chat_messages USING gin (body_tsv);

-- Busca. p_channel nulo = global; preenchido = dentro da conversa.
CREATE OR REPLACE FUNCTION public.chat_search(
  p_query text, p_channel uuid DEFAULT NULL, p_limit int DEFAULT 20, p_offset int DEFAULT 0
)
RETURNS TABLE (
  message_id uuid, channel_id uuid, channel_type text, channel_title text,
  body text, created_at timestamptz, sender_id uuid, sender_name text, rank real
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_terms text;
  v_query tsquery;
  v_lim   int := LEAST(GREATEST(COALESCE(p_limit, 20), 1), 50);
  v_off   int := GREATEST(COALESCE(p_offset, 0), 0);
BEGIN
  IF NOT public.is_employee(auth.uid()) THEN RETURN; END IF;

  -- tsquery de PREFIXO, sanitizada (cada palavra vira "palavra:*"), sem erro em
  -- input estranho: mantém só alfanuméricos, junta com AND.
  SELECT string_agg(tok || ':*', ' & ')
    INTO v_terms
  FROM (
    SELECT regexp_replace(w, '[^[:alnum:]]', '', 'g') AS tok
    FROM regexp_split_to_table(lower(coalesce(p_query, '')), '\s+') AS w
  ) s
  WHERE tok <> '';

  IF v_terms IS NULL OR v_terms = '' THEN RETURN; END IF;
  v_query := to_tsquery('portuguese', v_terms);

  RETURN QUERY
  SELECT m.id, m.channel_id, c.type::text,
         CASE WHEN c.type = 'group'
              THEN COALESCE(NULLIF(btrim(c.name), ''), 'Grupo')
              ELSE COALESCE(NULLIF(btrim(op.full_name), ''), op.username, op.email, 'Conversa') END,
         m.body, m.created_at, m.sender_id,
         COALESCE(NULLIF(btrim(sp.full_name), ''), sp.username, sp.email),
         ts_rank(m.body_tsv, v_query)
  FROM public.chat_messages m
  JOIN public.chat_channel_members mm ON mm.channel_id = m.channel_id AND mm.user_id = auth.uid()
  JOIN public.chat_channels c ON c.id = m.channel_id
  LEFT JOIN LATERAL (
    SELECT p.full_name, p.username, p.email
    FROM public.chat_channel_members mo
    JOIN public.profiles p ON p.id = mo.user_id
    WHERE mo.channel_id = m.channel_id AND mo.user_id <> auth.uid() AND c.type = 'dm'
    LIMIT 1
  ) op ON true
  LEFT JOIN public.profiles sp ON sp.id = m.sender_id
  WHERE m.deleted_at IS NULL
    AND m.body_tsv @@ v_query
    AND (p_channel IS NULL OR m.channel_id = p_channel)
  ORDER BY ts_rank(m.body_tsv, v_query) DESC, m.created_at DESC
  LIMIT v_lim OFFSET v_off;
END; $$;

GRANT EXECUTE ON FUNCTION public.chat_search(text, uuid, int, int) TO authenticated;

NOTIFY pgrst, 'reload schema';
