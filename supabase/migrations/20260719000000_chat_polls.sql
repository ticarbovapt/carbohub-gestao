-- ─────────────────────────────────────────────────────────────────────────────
-- Carbo Chat — Enquetes/votações dentro da conversa (DM ou grupo).
--
-- Uma enquete é uma mensagem kind='poll'. A configuração fica em chat_polls
-- (1:1 com a mensagem) e os votos em chat_poll_votes. RLS por participação no
-- canal (reusa chat_is_member). Voto/criação/fechamento só via RPC SECURITY
-- DEFINER. Resultados atualizam AO VIVO reaproveitando a assinatura existente
-- (ChatAlerts): o voto "toca" a mensagem-pai (edited_at) e as tabelas de poll
-- entram no supabase_realtime.
--
-- Aditivo: só cria tabelas/funções novas. Nada é alterado no chat existente.
-- ─────────────────────────────────────────────────────────────────────────────

-- ============================ TABELAS ============================
CREATE TABLE IF NOT EXISTS public.chat_polls (
  message_id  uuid PRIMARY KEY REFERENCES public.chat_messages(id) ON DELETE CASCADE,
  channel_id  uuid NOT NULL REFERENCES public.chat_channels(id) ON DELETE CASCADE,
  pergunta    text NOT NULL,
  opcoes      text[] NOT NULL,               -- texto das opções (ordem fixa; voto usa o índice)
  multipla    boolean NOT NULL DEFAULT false, -- escolha múltipla?
  anonima     boolean NOT NULL DEFAULT false, -- esconde quem votou?
  expira_em   timestamptz,                    -- prazo opcional
  fechada_em  timestamptz,                    -- congelada (autor/admin)
  created_by  uuid REFERENCES public.profiles(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chat_polls_opcoes_min CHECK (array_length(opcoes, 1) >= 2)
);
CREATE INDEX IF NOT EXISTS idx_chat_polls_channel ON public.chat_polls(channel_id);

CREATE TABLE IF NOT EXISTS public.chat_poll_votes (
  poll_id    uuid NOT NULL REFERENCES public.chat_polls(message_id) ON DELETE CASCADE,
  opcao_idx  int  NOT NULL,                  -- índice (0-based) em chat_polls.opcoes
  user_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (poll_id, opcao_idx, user_id)
);
CREATE INDEX IF NOT EXISTS idx_chat_poll_votes_poll ON public.chat_poll_votes(poll_id);

-- ============================ RLS (por participação no canal) ============================
ALTER TABLE public.chat_polls      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_poll_votes ENABLE ROW LEVEL SECURITY;

-- Leitura: membro do canal vê a config da enquete.
DROP POLICY IF EXISTS chat_polls_select ON public.chat_polls;
CREATE POLICY chat_polls_select ON public.chat_polls FOR SELECT
  USING (public.is_employee(auth.uid()) AND public.chat_is_member(channel_id, auth.uid()));

-- Leitura dos votos: membro do canal E (enquete NÃO anônima OU é o próprio voto).
-- Assim, numa enquete anônima ninguém consegue ler quem votou nem por query
-- direta. A contagem agregada é feita pela RPC chat_poll_get (definer).
DROP POLICY IF EXISTS chat_poll_votes_select ON public.chat_poll_votes;
CREATE POLICY chat_poll_votes_select ON public.chat_poll_votes FOR SELECT
  USING (public.is_employee(auth.uid()) AND EXISTS (
    SELECT 1 FROM public.chat_polls p
    WHERE p.message_id = poll_id
      AND public.chat_is_member(p.channel_id, auth.uid())
      AND (NOT p.anonima OR chat_poll_votes.user_id = auth.uid())
  ));
-- Escrita de voto: SÓ via RPC (definer). Sem policy de INSERT/UPDATE/DELETE direto.

-- ============================ RPCs ============================

-- Criar enquete: cria a mensagem kind='poll' + a config. Devolve o message_id.
CREATE OR REPLACE FUNCTION public.chat_poll_create(
  p_channel   uuid,
  p_pergunta  text,
  p_opcoes    text[],
  p_multipla  boolean DEFAULT false,
  p_anonima   boolean DEFAULT false,
  p_expira_em timestamptz DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_msg uuid;
  v_opts text[];
BEGIN
  IF v_uid IS NULL OR NOT public.is_employee(v_uid) THEN RAISE EXCEPTION 'sem permissão'; END IF;
  IF NOT public.chat_is_member(p_channel, v_uid) THEN RAISE EXCEPTION 'não é membro do canal'; END IF;

  -- Limpa opções vazias e apara; exige pergunta e >=2 opções.
  SELECT array_agg(t) INTO v_opts
  FROM (SELECT btrim(o) AS t FROM unnest(p_opcoes) AS o WHERE btrim(o) <> '') s;
  IF p_pergunta IS NULL OR btrim(p_pergunta) = '' THEN RAISE EXCEPTION 'pergunta vazia'; END IF;
  IF v_opts IS NULL OR array_length(v_opts, 1) < 2 THEN RAISE EXCEPTION 'informe ao menos 2 opções'; END IF;
  IF array_length(v_opts, 1) > 12 THEN RAISE EXCEPTION 'máximo de 12 opções'; END IF;

  INSERT INTO public.chat_messages (channel_id, sender_id, kind, body, metadata)
  VALUES (p_channel, v_uid, 'poll', btrim(p_pergunta), jsonb_build_object('poll', true))
  RETURNING id INTO v_msg;

  INSERT INTO public.chat_polls (message_id, channel_id, pergunta, opcoes, multipla, anonima, expira_em, created_by)
  VALUES (v_msg, p_channel, btrim(p_pergunta), v_opts, COALESCE(p_multipla, false), COALESCE(p_anonima, false), p_expira_em, v_uid);

  RETURN v_msg;
END;
$$;

-- Votar: substitui os votos anteriores do usuário nesta enquete pelo conjunto
-- p_opcoes (vazio = retira o voto). Respeita única/múltipla, aberta e prazo.
CREATE OR REPLACE FUNCTION public.chat_poll_vote(
  p_poll   uuid,
  p_opcoes int[]
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_poll public.chat_polls%ROWTYPE;
  v_n int;
  v_idx int;
BEGIN
  IF v_uid IS NULL OR NOT public.is_employee(v_uid) THEN RAISE EXCEPTION 'sem permissão'; END IF;
  SELECT * INTO v_poll FROM public.chat_polls WHERE message_id = p_poll;
  IF NOT FOUND THEN RAISE EXCEPTION 'enquete inexistente'; END IF;
  IF NOT public.chat_is_member(v_poll.channel_id, v_uid) THEN RAISE EXCEPTION 'não é membro do canal'; END IF;
  IF v_poll.fechada_em IS NOT NULL THEN RAISE EXCEPTION 'enquete encerrada'; END IF;
  IF v_poll.expira_em IS NOT NULL AND now() > v_poll.expira_em THEN RAISE EXCEPTION 'prazo encerrado'; END IF;

  v_n := COALESCE(array_length(v_poll.opcoes, 1), 0);
  -- Valida cada índice; escolha única aceita no máx. 1.
  IF p_opcoes IS NOT NULL THEN
    IF NOT v_poll.multipla AND array_length(p_opcoes, 1) > 1 THEN
      RAISE EXCEPTION 'esta enquete é de escolha única';
    END IF;
    FOREACH v_idx IN ARRAY p_opcoes LOOP
      IF v_idx < 0 OR v_idx >= v_n THEN RAISE EXCEPTION 'opção inválida'; END IF;
    END LOOP;
  END IF;

  -- Regrava o voto do usuário de forma atômica.
  DELETE FROM public.chat_poll_votes WHERE poll_id = p_poll AND user_id = v_uid;
  IF p_opcoes IS NOT NULL AND array_length(p_opcoes, 1) > 0 THEN
    INSERT INTO public.chat_poll_votes (poll_id, opcao_idx, user_id)
    SELECT p_poll, idx, v_uid FROM (SELECT DISTINCT unnest(p_opcoes) AS idx) s;
  END IF;

  -- "Toca" a mensagem-pai → dispara o handler UPDATE chat_messages já existente
  -- (ChatAlerts / useMessages) sem precisar de assinatura nova.
  UPDATE public.chat_messages SET edited_at = now() WHERE id = p_poll;
END;
$$;

-- Encerrar: autor da enquete OU admin/owner do canal. Congela o resultado.
CREATE OR REPLACE FUNCTION public.chat_poll_close(p_poll uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_poll public.chat_polls%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'sem sessão'; END IF;
  SELECT * INTO v_poll FROM public.chat_polls WHERE message_id = p_poll;
  IF NOT FOUND THEN RAISE EXCEPTION 'enquete inexistente'; END IF;
  IF v_poll.created_by <> v_uid AND NOT public.chat_is_admin(v_poll.channel_id, v_uid) THEN
    RAISE EXCEPTION 'só o autor ou um admin encerra';
  END IF;
  IF v_poll.fechada_em IS NULL THEN
    UPDATE public.chat_polls SET fechada_em = now() WHERE message_id = p_poll;
    UPDATE public.chat_messages SET edited_at = now() WHERE id = p_poll; -- reflete ao vivo
  END IF;
END;
$$;

-- Ler enquete + resultados. Devolve UM json (config, contagem por opção, meus
-- votos, total de votantes e — só se ABERTA visibilidade e NÃO anônima — quem
-- votou em cada opção). Nunca expõe votantes de enquete anônima.
CREATE OR REPLACE FUNCTION public.chat_poll_get(p_message_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_poll public.chat_polls%ROWTYPE;
  v_result jsonb;
  v_total int;
  v_mine int[];
BEGIN
  SELECT * INTO v_poll FROM public.chat_polls WHERE message_id = p_message_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF v_uid IS NULL OR NOT public.chat_is_member(v_poll.channel_id, v_uid) THEN
    RAISE EXCEPTION 'sem permissão';
  END IF;

  -- Total de votantes distintos.
  SELECT count(DISTINCT user_id)::int INTO v_total FROM public.chat_poll_votes WHERE poll_id = p_message_id;

  -- Meus votos (índices).
  SELECT COALESCE(array_agg(opcao_idx ORDER BY opcao_idx), '{}') INTO v_mine
  FROM public.chat_poll_votes WHERE poll_id = p_message_id AND user_id = v_uid;

  -- Resultado por opção: idx, texto, contagem e (se aplicável) votantes.
  SELECT jsonb_agg(row) INTO v_result FROM (
    SELECT jsonb_build_object(
      'idx', i - 1,
      'texto', v_poll.opcoes[i],
      'votos', (SELECT count(*)::int FROM public.chat_poll_votes v WHERE v.poll_id = p_message_id AND v.opcao_idx = i - 1),
      'votantes', CASE WHEN v_poll.anonima THEN NULL ELSE (
        SELECT COALESCE(jsonb_agg(jsonb_build_object('id', pr.id, 'full_name', pr.full_name, 'avatar_url', pr.avatar_url)), '[]'::jsonb)
        FROM public.chat_poll_votes v JOIN public.profiles pr ON pr.id = v.user_id
        WHERE v.poll_id = p_message_id AND v.opcao_idx = i - 1
      ) END
    ) AS row
    FROM generate_subscripts(v_poll.opcoes, 1) AS i
  ) s;

  RETURN jsonb_build_object(
    'message_id', v_poll.message_id,
    'channel_id', v_poll.channel_id,
    'pergunta', v_poll.pergunta,
    'multipla', v_poll.multipla,
    'anonima', v_poll.anonima,
    'expira_em', v_poll.expira_em,
    'fechada_em', v_poll.fechada_em,
    'created_by', v_poll.created_by,
    'total_votantes', v_total,
    'meus_votos', to_jsonb(v_mine),
    'opcoes', COALESCE(v_result, '[]'::jsonb)
  );
END;
$$;

-- ── Realtime ──
-- NÃO publicamos chat_poll_votes/chat_polls: broadcastar as linhas de voto
-- vazaria QUEM votou (inclusive em enquete anônima). Em vez disso, cada voto e
-- o fechamento "tocam" a mensagem-pai (edited_at) → o evento UPDATE em
-- chat_messages (já publicado e já escutado pelo ChatAlerts) dispara o refresh
-- das barras. Assim os resultados atualizam ao vivo sem expor os votantes.

-- ── Permissões ──
GRANT EXECUTE ON FUNCTION public.chat_poll_create(uuid,text,text[],boolean,boolean,timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.chat_poll_vote(uuid,int[])  TO authenticated;
GRANT EXECUTE ON FUNCTION public.chat_poll_close(uuid)       TO authenticated;
GRANT EXECUTE ON FUNCTION public.chat_poll_get(uuid)         TO authenticated;
