-- ─────────────────────────────────────────────────────────────────────────────
-- Carbo Chat — Métricas de ADOÇÃO (painel do Admin).
--
-- Mede a migração WhatsApp → sistema SÓ com AGREGADOS (contagens por setor/
-- período, listas de pendências de onboarding). NENHUMA função lê o conteúdo
-- (`body`) das mensagens — privacidade preservada.
--
-- Acesso: cada RPC é SECURITY DEFINER e começa com um guard que exige a flag
-- `carbo_admin` em profiles.allowed_interfaces (mesma porta de entrada do app
-- Admin — admin/ti_suporte). Sem a flag → exceção.
--
-- Aditivo: só cria índices e funções novas. Nada é alterado/removido.
-- ─────────────────────────────────────────────────────────────────────────────

-- ============================ ÍNDICES ============================
-- Volume/ativos por remetente e por tempo sem varrer a tabela inteira.
CREATE INDEX IF NOT EXISTS idx_chat_messages_sender_created
  ON public.chat_messages (sender_id, created_at);
-- Volume por período ignorando apagadas (índice parcial enxuto).
CREATE INDEX IF NOT EXISTS idx_chat_messages_created
  ON public.chat_messages (created_at) WHERE deleted_at IS NULL;

-- ============================ GUARD ============================
-- true se o chamador pode ver métricas de adoção (entra no Carbo Admin).
CREATE OR REPLACE FUNCTION public.chat_adoption_can_view(p_uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = p_uid
      AND COALESCE(allowed_interfaces, '{}') @> ARRAY['carbo_admin']
  );
$$;

-- ============================ 1) OVERVIEW (cartões) ============================
-- Um único row com os números-chave para os cartões do topo do painel.
CREATE OR REPLACE FUNCTION public.chat_adoption_overview()
RETURNS TABLE (
  funcionarios          int,   -- total de internos (universo)
  ativos_hoje           int,
  ativos_7d             int,
  ativos_30d            int,
  msgs_hoje             int,
  msgs_7d               int,
  msgs_30d              int,
  grupos_ativos         int,   -- grupos não-arquivados com >=1 msg em 30d
  dms_ativas            int,   -- DMs com >=1 msg em 30d
  com_push              int,   -- pessoas com assinatura de push
  sem_push              int    -- internos sem push (correr atrás)
) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.chat_adoption_can_view(auth.uid()) THEN
    RAISE EXCEPTION 'sem permissão';
  END IF;

  RETURN QUERY
  WITH universo AS (
    SELECT id FROM public.profiles p WHERE public.is_employee(p.id)
  ),
  msg AS (
    SELECT sender_id, created_at, channel_id
    FROM public.chat_messages
    WHERE deleted_at IS NULL AND kind <> 'system' AND sender_id IS NOT NULL
      AND created_at >= now() - interval '30 days'
  ),
  push AS (
    SELECT DISTINCT user_id FROM public.chat_push_subscriptions
  )
  SELECT
    (SELECT count(*)::int FROM universo),
    (SELECT count(DISTINCT sender_id)::int FROM msg WHERE created_at >= date_trunc('day', now())),
    (SELECT count(DISTINCT sender_id)::int FROM msg WHERE created_at >= now() - interval '7 days'),
    (SELECT count(DISTINCT sender_id)::int FROM msg),
    (SELECT count(*)::int FROM msg WHERE created_at >= date_trunc('day', now())),
    (SELECT count(*)::int FROM msg WHERE created_at >= now() - interval '7 days'),
    (SELECT count(*)::int FROM msg),
    (SELECT count(DISTINCT m.channel_id)::int FROM msg m
       JOIN public.chat_channels c ON c.id = m.channel_id
       WHERE c.type = 'group' AND c.archived_at IS NULL),
    (SELECT count(DISTINCT m.channel_id)::int FROM msg m
       JOIN public.chat_channels c ON c.id = m.channel_id
       WHERE c.type = 'dm'),
    (SELECT count(*)::int FROM push WHERE user_id IN (SELECT id FROM universo)),
    (SELECT count(*)::int FROM universo WHERE id NOT IN (SELECT user_id FROM push));
END;
$$;

-- ============================ 2) SÉRIE DIÁRIA (tendência) ============================
-- Série por dia (últimos p_days) para o gráfico de tendência.
CREATE OR REPLACE FUNCTION public.chat_active_users_series(p_days int DEFAULT 30)
RETURNS TABLE (
  dia              date,
  usuarios_ativos  int,
  mensagens        int
) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.chat_adoption_can_view(auth.uid()) THEN
    RAISE EXCEPTION 'sem permissão';
  END IF;

  p_days := greatest(1, least(coalesce(p_days, 30), 180));

  RETURN QUERY
  WITH dias AS (
    SELECT generate_series(
      date_trunc('day', now())::date - (p_days - 1),
      date_trunc('day', now())::date,
      interval '1 day'
    )::date AS d
  ),
  m AS (
    SELECT date_trunc('day', created_at)::date AS d, sender_id
    FROM public.chat_messages
    WHERE deleted_at IS NULL AND kind <> 'system' AND sender_id IS NOT NULL
      AND created_at >= date_trunc('day', now()) - (p_days - 1)
  )
  SELECT dias.d,
         (SELECT count(DISTINCT m.sender_id)::int FROM m WHERE m.d = dias.d),
         (SELECT count(*)::int FROM m WHERE m.d = dias.d)
  FROM dias
  ORDER BY dias.d;
END;
$$;

-- ============================ 3) VOLUME POR DEPARTAMENTO ============================
-- Mensagens e pessoas ativas por setor no intervalo [p_from, p_to] (inclusive).
CREATE OR REPLACE FUNCTION public.chat_volume_by_department(
  p_from date DEFAULT (now() - interval '30 days')::date,
  p_to   date DEFAULT now()::date
)
RETURNS TABLE (
  departamento     text,
  mensagens        int,
  usuarios_ativos  int
) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.chat_adoption_can_view(auth.uid()) THEN
    RAISE EXCEPTION 'sem permissão';
  END IF;

  RETURN QUERY
  SELECT COALESCE(p.department::text, 'Sem setor') AS departamento,
         count(*)::int,
         count(DISTINCT m.sender_id)::int
  FROM public.chat_messages m
  JOIN public.profiles p ON p.id = m.sender_id
  WHERE m.deleted_at IS NULL AND m.kind <> 'system' AND m.sender_id IS NOT NULL
    AND m.created_at >= p_from
    AND m.created_at < (p_to + 1)      -- fim inclusivo
  GROUP BY COALESCE(p.department::text, 'Sem setor')
  ORDER BY 2 DESC;
END;
$$;

-- ============================ 4) PENDÊNCIAS DE ONBOARDING ============================
-- Lista por pessoa: tem push? já usou app instalado? última atividade.
-- (Sem push / nunca usou = correr atrás.)
CREATE OR REPLACE FUNCTION public.chat_onboarding_pendencies()
RETURNS TABLE (
  user_id          uuid,
  full_name        text,
  departamento     text,
  tem_push         boolean,
  usou_app         boolean,      -- teve presença com origin de subdomínio de app
  ultima_atividade timestamptz   -- max(última msg, última presença)
) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.chat_adoption_can_view(auth.uid()) THEN
    RAISE EXCEPTION 'sem permissão';
  END IF;

  RETURN QUERY
  SELECT p.id,
         p.full_name,
         COALESCE(p.department::text, 'Sem setor'),
         EXISTS (SELECT 1 FROM public.chat_push_subscriptions s WHERE s.user_id = p.id),
         EXISTS (SELECT 1 FROM public.chat_presence pr WHERE pr.user_id = p.id AND pr.origin IS NOT NULL),
         GREATEST(
           (SELECT max(created_at) FROM public.chat_messages mm WHERE mm.sender_id = p.id AND mm.deleted_at IS NULL),
           (SELECT max(last_seen_at) FROM public.chat_presence pr WHERE pr.user_id = p.id)
         )
  FROM public.profiles p
  WHERE public.is_employee(p.id)
  ORDER BY
    (EXISTS (SELECT 1 FROM public.chat_push_subscriptions s WHERE s.user_id = p.id)) ASC,  -- sem push primeiro
    p.full_name;
END;
$$;

-- ============================ 5) INATIVOS (X dias) ============================
-- Quem nunca entrou ou parou há mais de p_days dias (mín. 1, máx. 365).
CREATE OR REPLACE FUNCTION public.chat_inactive_users(p_days int DEFAULT 7)
RETURNS TABLE (
  user_id       uuid,
  full_name     text,
  departamento  text,
  ultima_msg    timestamptz,
  ultima_ativid timestamptz,
  dias_inativo  int           -- null = nunca teve atividade
) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_cut timestamptz;
BEGIN
  IF NOT public.chat_adoption_can_view(auth.uid()) THEN
    RAISE EXCEPTION 'sem permissão';
  END IF;

  p_days := greatest(1, least(coalesce(p_days, 7), 365));
  v_cut := now() - make_interval(days => p_days);

  RETURN QUERY
  WITH ativ AS (
    SELECT p.id, p.full_name, COALESCE(p.department::text, 'Sem setor') AS dep,
           (SELECT max(created_at) FROM public.chat_messages mm WHERE mm.sender_id = p.id AND mm.deleted_at IS NULL) AS um,
           GREATEST(
             (SELECT max(created_at) FROM public.chat_messages mm WHERE mm.sender_id = p.id AND mm.deleted_at IS NULL),
             (SELECT max(last_seen_at) FROM public.chat_presence pr WHERE pr.user_id = p.id)
           ) AS ua
    FROM public.profiles p
    WHERE public.is_employee(p.id)
  )
  SELECT ativ.id, ativ.full_name, ativ.dep, ativ.um, ativ.ua,
         CASE WHEN ativ.ua IS NULL THEN NULL
              ELSE EXTRACT(day FROM (now() - ativ.ua))::int END
  FROM ativ
  WHERE ativ.ua IS NULL OR ativ.ua < v_cut
  ORDER BY ativ.ua ASC NULLS FIRST;
END;
$$;

-- ============================ 6) ESTATÍSTICAS DE CANAIS ============================
-- Grupos vs DMs, média de membros por grupo, canais ativos.
CREATE OR REPLACE FUNCTION public.chat_channel_stats()
RETURNS TABLE (
  grupos_total       int,
  grupos_ativos_30d  int,
  dms_total          int,
  dms_ativas_30d     int,
  media_membros      numeric  -- média de membros por grupo (1 casa)
) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.chat_adoption_can_view(auth.uid()) THEN
    RAISE EXCEPTION 'sem permissão';
  END IF;

  RETURN QUERY
  WITH ativos AS (
    SELECT DISTINCT channel_id FROM public.chat_messages
    WHERE deleted_at IS NULL AND kind <> 'system'
      AND created_at >= now() - interval '30 days'
  )
  SELECT
    (SELECT count(*)::int FROM public.chat_channels WHERE type = 'group' AND archived_at IS NULL),
    (SELECT count(*)::int FROM public.chat_channels c
       WHERE c.type = 'group' AND c.archived_at IS NULL AND c.id IN (SELECT channel_id FROM ativos)),
    (SELECT count(*)::int FROM public.chat_channels WHERE type = 'dm'),
    (SELECT count(*)::int FROM public.chat_channels c
       WHERE c.type = 'dm' AND c.id IN (SELECT channel_id FROM ativos)),
    (SELECT round(avg(cnt), 1) FROM (
       SELECT count(*)::numeric AS cnt
       FROM public.chat_channel_members m
       JOIN public.chat_channels c ON c.id = m.channel_id
       WHERE c.type = 'group' AND c.archived_at IS NULL
       GROUP BY m.channel_id
    ) g);
END;
$$;

-- ── Permissões (o guard interno faz o controle fino; exposição a autenticados) ──
GRANT EXECUTE ON FUNCTION public.chat_adoption_overview()            TO authenticated;
GRANT EXECUTE ON FUNCTION public.chat_active_users_series(int)       TO authenticated;
GRANT EXECUTE ON FUNCTION public.chat_volume_by_department(date,date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.chat_onboarding_pendencies()        TO authenticated;
GRANT EXECUTE ON FUNCTION public.chat_inactive_users(int)           TO authenticated;
GRANT EXECUTE ON FUNCTION public.chat_channel_stats()               TO authenticated;
