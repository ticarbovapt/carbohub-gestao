-- ─────────────────────────────────────────────────────────────────────────────
-- Carbo Chat — Mural/Home (feed). Dá motivo de abrir o app todo dia.
--
-- Feed social próprio (kudos/avisos) + destaques derivados de profiles/
-- employee_finance (aniversariantes, novos membros) + comunicados oficiais já
-- existentes (surfacados, não recriados).
--
-- Kudos: qualquer interno elogia colegas. Aviso: só quem passa em
-- chat_can_announce (gestor/RH). Reações e comentários simples. Ao vivo pelo
-- ChatAlerts (tabelas publicadas no Realtime).
--
-- Aditivo. Não toca no chat/comunicado existentes.
-- ─────────────────────────────────────────────────────────────────────────────

-- ============================ TABELAS ============================
CREATE TABLE IF NOT EXISTS public.chat_feed_posts (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo        text NOT NULL DEFAULT 'kudos' CHECK (tipo IN ('kudos','aviso')),
  author_id   uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  target_ids  uuid[] NOT NULL DEFAULT '{}',   -- colegas reconhecidos/mencionados
  body        text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz
);
CREATE INDEX IF NOT EXISTS idx_chat_feed_posts_created ON public.chat_feed_posts(created_at DESC) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.chat_feed_comments (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id     uuid NOT NULL REFERENCES public.chat_feed_posts(id) ON DELETE CASCADE,
  author_id   uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  body        text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz
);
CREATE INDEX IF NOT EXISTS idx_chat_feed_comments_post ON public.chat_feed_comments(post_id, created_at);

CREATE TABLE IF NOT EXISTS public.chat_feed_reactions (
  post_id    uuid NOT NULL REFERENCES public.chat_feed_posts(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  emoji      text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, user_id, emoji)
);

-- ============================ RLS ============================
ALTER TABLE public.chat_feed_posts    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_feed_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_feed_reactions ENABLE ROW LEVEL SECURITY;

-- Leitura: qualquer interno.
DROP POLICY IF EXISTS chat_feed_posts_select ON public.chat_feed_posts;
CREATE POLICY chat_feed_posts_select ON public.chat_feed_posts FOR SELECT
  USING (public.is_employee(auth.uid()));
DROP POLICY IF EXISTS chat_feed_comments_select ON public.chat_feed_comments;
CREATE POLICY chat_feed_comments_select ON public.chat_feed_comments FOR SELECT
  USING (public.is_employee(auth.uid()));
DROP POLICY IF EXISTS chat_feed_reactions_select ON public.chat_feed_reactions;
CREATE POLICY chat_feed_reactions_select ON public.chat_feed_reactions FOR SELECT
  USING (public.is_employee(auth.uid()));

-- Reações: qualquer interno gerencia as suas.
DROP POLICY IF EXISTS chat_feed_reactions_write ON public.chat_feed_reactions;
CREATE POLICY chat_feed_reactions_write ON public.chat_feed_reactions FOR ALL
  USING (auth.uid() = user_id AND public.is_employee(auth.uid()))
  WITH CHECK (auth.uid() = user_id AND public.is_employee(auth.uid()));
-- Posts/comentários: escrita só via RPC (definer). Sem policy de INSERT direto.

-- ============================ RPCs ============================

-- Destaques do dia: aniversariantes de HOJE (só nome/dia/mês/depto — nunca ano
-- nem dado financeiro) + novos membros (últimos 7 dias).
CREATE OR REPLACE FUNCTION public.chat_feed_highlights()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_bdays jsonb;
  v_news jsonb;
BEGIN
  IF NOT public.is_employee(auth.uid()) THEN RAISE EXCEPTION 'sem permissão'; END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', p.id, 'full_name', p.full_name, 'avatar_url', p.avatar_url,
           'department', p.department::text) ORDER BY p.full_name), '[]'::jsonb)
    INTO v_bdays
  FROM public.employee_finance ef
  JOIN public.profiles p ON p.id = ef.user_id
  WHERE ef.birth_date IS NOT NULL
    AND public.is_employee(p.id)
    AND EXTRACT(MONTH FROM ef.birth_date) = EXTRACT(MONTH FROM v_hoje)
    AND EXTRACT(DAY   FROM ef.birth_date) = EXTRACT(DAY   FROM v_hoje);

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', p.id, 'full_name', p.full_name, 'avatar_url', p.avatar_url,
           'department', p.department::text, 'created_at', p.created_at) ORDER BY p.created_at DESC), '[]'::jsonb)
    INTO v_news
  FROM public.profiles p
  WHERE public.is_employee(p.id)
    AND p.created_at >= now() - interval '7 days';

  RETURN jsonb_build_object('aniversariantes', v_bdays, 'novos_membros', v_news);
END;
$$;

-- Comunicados oficiais recentes que a pessoa recebe (reaproveita o que existe).
CREATE OR REPLACE FUNCTION public.chat_recent_announcements(p_limit int DEFAULT 5)
RETURNS TABLE (
  message_id uuid, channel_id uuid, channel_name text,
  body text, created_at timestamptz, sender_name text
) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_employee(auth.uid()) THEN RAISE EXCEPTION 'sem permissão'; END IF;
  p_limit := greatest(1, least(coalesce(p_limit, 5), 20));
  RETURN QUERY
  SELECT m.id, m.channel_id, c.name, m.body, m.created_at, pr.full_name
  FROM public.chat_messages m
  JOIN public.chat_channels c ON c.id = m.channel_id AND c.is_announcement
  JOIN public.chat_channel_members mem ON mem.channel_id = c.id AND mem.user_id = auth.uid()
  LEFT JOIN public.profiles pr ON pr.id = m.sender_id
  WHERE m.deleted_at IS NULL AND m.kind <> 'system'
  ORDER BY m.created_at DESC
  LIMIT p_limit;
END;
$$;

-- Criar kudos (qualquer interno).
CREATE OR REPLACE FUNCTION public.chat_feed_create_kudos(p_body text, p_targets uuid[] DEFAULT '{}')
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid(); v_id uuid;
BEGIN
  IF v_uid IS NULL OR NOT public.is_employee(v_uid) THEN RAISE EXCEPTION 'sem permissão'; END IF;
  IF p_body IS NULL OR btrim(p_body) = '' THEN RAISE EXCEPTION 'texto vazio'; END IF;
  INSERT INTO public.chat_feed_posts (tipo, author_id, target_ids, body)
  VALUES ('kudos', v_uid, COALESCE(p_targets, '{}'), btrim(p_body))
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- Criar aviso (só gestor/RH).
CREATE OR REPLACE FUNCTION public.chat_feed_create_aviso(p_body text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid(); v_id uuid;
BEGIN
  IF v_uid IS NULL OR NOT public.is_employee(v_uid) THEN RAISE EXCEPTION 'sem permissão'; END IF;
  IF NOT public.chat_can_announce() THEN RAISE EXCEPTION 'só gestor/RH publica aviso'; END IF;
  IF p_body IS NULL OR btrim(p_body) = '' THEN RAISE EXCEPTION 'texto vazio'; END IF;
  INSERT INTO public.chat_feed_posts (tipo, author_id, body)
  VALUES ('aviso', v_uid, btrim(p_body))
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- Apagar post próprio (ou admin/gestor).
CREATE OR REPLACE FUNCTION public.chat_feed_delete_post(p_post uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid(); v_author uuid;
BEGIN
  SELECT author_id INTO v_author FROM public.chat_feed_posts WHERE id = p_post;
  IF v_author IS NULL THEN RAISE EXCEPTION 'post inexistente'; END IF;
  IF v_author <> v_uid AND NOT public.is_gestor(v_uid) THEN RAISE EXCEPTION 'sem permissão'; END IF;
  UPDATE public.chat_feed_posts SET deleted_at = now() WHERE id = p_post;
END;
$$;

-- Reagir (toggle): p_on = true adiciona, false remove.
CREATE OR REPLACE FUNCTION public.chat_feed_react(p_post uuid, p_emoji text, p_on boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL OR NOT public.is_employee(v_uid) THEN RAISE EXCEPTION 'sem permissão'; END IF;
  IF p_on THEN
    INSERT INTO public.chat_feed_reactions (post_id, user_id, emoji)
    VALUES (p_post, v_uid, p_emoji) ON CONFLICT DO NOTHING;
  ELSE
    DELETE FROM public.chat_feed_reactions WHERE post_id = p_post AND user_id = v_uid AND emoji = p_emoji;
  END IF;
END;
$$;

-- Comentar.
CREATE OR REPLACE FUNCTION public.chat_feed_comment(p_post uuid, p_body text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid(); v_id uuid;
BEGIN
  IF v_uid IS NULL OR NOT public.is_employee(v_uid) THEN RAISE EXCEPTION 'sem permissão'; END IF;
  IF p_body IS NULL OR btrim(p_body) = '' THEN RAISE EXCEPTION 'texto vazio'; END IF;
  PERFORM 1 FROM public.chat_feed_posts WHERE id = p_post AND deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'post inexistente'; END IF;
  INSERT INTO public.chat_feed_comments (post_id, author_id, body)
  VALUES (p_post, v_uid, btrim(p_body)) RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- Lista os comentários de um post.
CREATE OR REPLACE FUNCTION public.chat_feed_comments(p_post uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_res jsonb;
BEGIN
  IF NOT public.is_employee(auth.uid()) THEN RAISE EXCEPTION 'sem permissão'; END IF;
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', c.id, 'body', c.body, 'created_at', c.created_at,
    'author', jsonb_build_object('id', p.id, 'full_name', p.full_name, 'avatar_url', p.avatar_url)
  ) ORDER BY c.created_at), '[]'::jsonb) INTO v_res
  FROM public.chat_feed_comments c JOIN public.profiles p ON p.id = c.author_id
  WHERE c.post_id = p_post AND c.deleted_at IS NULL;
  RETURN v_res;
END;
$$;

-- Feed paginado (posts + autor + alvos + reações + nº comentários).
CREATE OR REPLACE FUNCTION public.chat_feed_list(p_limit int DEFAULT 20, p_before timestamptz DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid(); v_res jsonb;
BEGIN
  IF NOT public.is_employee(v_uid) THEN RAISE EXCEPTION 'sem permissão'; END IF;
  p_limit := greatest(1, least(coalesce(p_limit, 20), 50));

  SELECT COALESCE(jsonb_agg(row ORDER BY (row->>'created_at') DESC), '[]'::jsonb) INTO v_res FROM (
    SELECT jsonb_build_object(
      'id', fp.id,
      'tipo', fp.tipo,
      'body', fp.body,
      'created_at', fp.created_at,
      'author', jsonb_build_object('id', ap.id, 'full_name', ap.full_name, 'avatar_url', ap.avatar_url),
      'targets', (
        SELECT COALESCE(jsonb_agg(jsonb_build_object('id', tp.id, 'full_name', tp.full_name, 'avatar_url', tp.avatar_url)), '[]'::jsonb)
        FROM public.profiles tp WHERE tp.id = ANY(fp.target_ids)
      ),
      'reactions', (
        SELECT COALESCE(jsonb_agg(jsonb_build_object('emoji', e.emoji, 'count', e.n, 'mine', e.mine)), '[]'::jsonb)
        FROM (
          SELECT r.emoji, count(*)::int AS n, bool_or(r.user_id = v_uid) AS mine
          FROM public.chat_feed_reactions r WHERE r.post_id = fp.id GROUP BY r.emoji
        ) e
      ),
      'comment_count', (SELECT count(*)::int FROM public.chat_feed_comments c WHERE c.post_id = fp.id AND c.deleted_at IS NULL),
      'can_delete', (fp.author_id = v_uid OR public.is_gestor(v_uid))
    ) AS row
    FROM public.chat_feed_posts fp
    JOIN public.profiles ap ON ap.id = fp.author_id
    WHERE fp.deleted_at IS NULL
      AND (p_before IS NULL OR fp.created_at < p_before)
    ORDER BY fp.created_at DESC
    LIMIT p_limit
  ) s;
  RETURN v_res;
END;
$$;

-- ── Realtime: publica as tabelas do feed (guardado) ──
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['chat_feed_posts','chat_feed_comments','chat_feed_reactions'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;

-- ── Permissões ──
GRANT EXECUTE ON FUNCTION public.chat_feed_highlights()                 TO authenticated;
GRANT EXECUTE ON FUNCTION public.chat_recent_announcements(int)         TO authenticated;
GRANT EXECUTE ON FUNCTION public.chat_feed_create_kudos(text,uuid[])    TO authenticated;
GRANT EXECUTE ON FUNCTION public.chat_feed_create_aviso(text)           TO authenticated;
GRANT EXECUTE ON FUNCTION public.chat_feed_delete_post(uuid)            TO authenticated;
GRANT EXECUTE ON FUNCTION public.chat_feed_react(uuid,text,boolean)     TO authenticated;
GRANT EXECUTE ON FUNCTION public.chat_feed_comment(uuid,text)           TO authenticated;
GRANT EXECUTE ON FUNCTION public.chat_feed_comments(uuid)               TO authenticated;
GRANT EXECUTE ON FUNCTION public.chat_feed_list(int,timestamptz)        TO authenticated;
