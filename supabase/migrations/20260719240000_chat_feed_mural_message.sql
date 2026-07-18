-- ─────────────────────────────────────────────────────────────────────────────
-- Carbo Chat — Mural: mensagem/aviso que QUALQUER interno pode postar (com foto)
-- e com PÚBLICO que limita quem vê (Todos / Por departamento / Escolher pessoas).
--
-- Não cria grupo nem pede "Li e estou ciente" (isso continua sendo o Comunicado
-- Oficial, à parte). É um post no feed, tipo 'aviso', com audiência.
--
-- Aditivo.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1) Colunas de imagem + audiência.
ALTER TABLE public.chat_feed_posts
  ADD COLUMN IF NOT EXISTS image_path           text,
  ADD COLUMN IF NOT EXISTS audience             text NOT NULL DEFAULT 'all',
  ADD COLUMN IF NOT EXISTS audience_departments text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS audience_users       uuid[] NOT NULL DEFAULT '{}';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chat_feed_posts_audience_chk') THEN
    ALTER TABLE public.chat_feed_posts
      ADD CONSTRAINT chat_feed_posts_audience_chk CHECK (audience IN ('all','departments','users'));
  END IF;
END $$;

-- 2) Visibilidade: autor sempre vê; 'all' todos; 'users' os escolhidos;
--    'departments' quem é do depto (principal ou secundário).
CREATE OR REPLACE FUNCTION public.chat_feed_visible(
  p_author uuid, p_audience text, p_depts text[], p_users uuid[], p_uid uuid
) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    p_uid = p_author
    OR COALESCE(p_audience, 'all') = 'all'
    OR (p_audience = 'users' AND p_uid = ANY(p_users))
    OR (p_audience = 'departments' AND EXISTS (
          SELECT 1 FROM public.profiles pr WHERE pr.id = p_uid
            AND (pr.department::text = ANY(p_depts) OR pr.secondary_department::text = ANY(p_depts))
       ));
$$;

-- 3) RLS de leitura passa a respeitar a audiência.
DROP POLICY IF EXISTS chat_feed_posts_select ON public.chat_feed_posts;
CREATE POLICY chat_feed_posts_select ON public.chat_feed_posts FOR SELECT
  USING (public.is_employee(auth.uid())
         AND public.chat_feed_visible(author_id, audience, audience_departments, audience_users, auth.uid()));

-- 4) Criar mensagem/aviso no mural (qualquer interno). Foto opcional; público.
CREATE OR REPLACE FUNCTION public.chat_feed_create_message(
  p_body        text,
  p_image_path  text DEFAULT NULL,
  p_audience    text DEFAULT 'all',
  p_departments text[] DEFAULT '{}',
  p_users       uuid[] DEFAULT '{}'
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid(); v_id uuid; v_aud text := COALESCE(p_audience, 'all');
BEGIN
  IF v_uid IS NULL OR NOT public.is_employee(v_uid) THEN RAISE EXCEPTION 'sem permissão'; END IF;
  IF v_aud NOT IN ('all','departments','users') THEN RAISE EXCEPTION 'público inválido'; END IF;
  IF (p_body IS NULL OR btrim(p_body) = '') AND p_image_path IS NULL THEN
    RAISE EXCEPTION 'escreva algo ou anexe uma imagem';
  END IF;
  -- Público sem alvo vira 'all' (evita post invisível).
  IF v_aud = 'departments' AND COALESCE(array_length(p_departments,1),0) = 0 THEN v_aud := 'all'; END IF;
  IF v_aud = 'users'       AND COALESCE(array_length(p_users,1),0)       = 0 THEN v_aud := 'all'; END IF;

  INSERT INTO public.chat_feed_posts (tipo, author_id, body, image_path, audience, audience_departments, audience_users)
  VALUES ('aviso', v_uid, NULLIF(btrim(COALESCE(p_body,'')), ''), p_image_path, v_aud,
          COALESCE(p_departments,'{}'), COALESCE(p_users,'{}'))
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- 5) Feed passa a filtrar por audiência (a RPC é definer → RLS não se aplica
--    sozinha) e a devolver a imagem + rótulo de público.
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
      'image_path', fp.image_path,
      'audience', fp.audience,
      'audience_departments', to_jsonb(fp.audience_departments),
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
      AND public.chat_feed_visible(fp.author_id, fp.audience, fp.audience_departments, fp.audience_users, v_uid)
    ORDER BY fp.created_at DESC
    LIMIT p_limit
  ) s;
  RETURN v_res;
END;
$$;

GRANT EXECUTE ON FUNCTION public.chat_feed_visible(uuid,text,text[],uuid[],uuid)              TO authenticated;
GRANT EXECUTE ON FUNCTION public.chat_feed_create_message(text,text,text,text[],uuid[])       TO authenticated;
GRANT EXECUTE ON FUNCTION public.chat_feed_list(int,timestamptz)                              TO authenticated;
