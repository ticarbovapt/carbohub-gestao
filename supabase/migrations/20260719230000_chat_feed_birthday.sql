-- ─────────────────────────────────────────────────────────────────────────────
-- Carbo Chat — Mural: aniversariantes viram POST fixo e comentável + suporte a
-- comunicados no feed (estes continuam vindo dos canais announcement — o público
-- já é respeitado pela participação no canal).
--
-- Aniversário: um post tipo 'aniversario' por pessoa/dia (data vem de
-- employee_finance.birth_date — a mesma tabela da tela Funcionários do Finanças).
-- Materializado de forma idempotente (dedup_key) quando o mural abre; fica o dia
-- todo e o pessoal comenta/reage como em qualquer post.
--
-- Aditivo.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1) Permite o novo tipo 'aniversario'.
ALTER TABLE public.chat_feed_posts DROP CONSTRAINT IF EXISTS chat_feed_posts_tipo_check;
ALTER TABLE public.chat_feed_posts DROP CONSTRAINT IF EXISTS chat_feed_posts_tipo_chk;
ALTER TABLE public.chat_feed_posts
  ADD CONSTRAINT chat_feed_posts_tipo_chk CHECK (tipo IN ('kudos','aviso','aniversario'));

-- 2) Chave de deduplicação (só usada por posts automáticos, ex.: aniversário do
-- dia). NULL nos posts normais (vários NULLs não conflitam num índice único).
ALTER TABLE public.chat_feed_posts ADD COLUMN IF NOT EXISTS dedup_key text;
CREATE UNIQUE INDEX IF NOT EXISTS chat_feed_posts_dedup_uidx ON public.chat_feed_posts(dedup_key);

-- 3) Materializa os aniversariantes de HOJE (idempotente). Autor = a própria
-- pessoa (aparece o avatar dela); corpo já parabeniza e convida a comentar.
CREATE OR REPLACE FUNCTION public.chat_feed_ensure_birthdays()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
BEGIN
  IF NOT public.is_employee(auth.uid()) THEN RETURN; END IF;
  INSERT INTO public.chat_feed_posts (tipo, author_id, body, dedup_key)
  SELECT 'aniversario', p.id,
         '🎂 Hoje é aniversário de ' || COALESCE(p.full_name, 'um colega') || '! Deixe seu parabéns 🎉',
         'bday:' || p.id || ':' || to_char(v_hoje, 'YYYY-MM-DD')
  FROM public.employee_finance ef
  JOIN public.profiles p ON p.id = ef.user_id
  WHERE ef.birth_date IS NOT NULL
    AND public.is_employee(p.id)
    AND EXTRACT(MONTH FROM ef.birth_date) = EXTRACT(MONTH FROM v_hoje)
    AND EXTRACT(DAY   FROM ef.birth_date) = EXTRACT(DAY   FROM v_hoje)
  ON CONFLICT (dedup_key) DO NOTHING;
END;
$$;

GRANT EXECUTE ON FUNCTION public.chat_feed_ensure_birthdays() TO authenticated;
