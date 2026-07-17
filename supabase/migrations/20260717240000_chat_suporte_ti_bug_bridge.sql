-- ─────────────────────────────────────────────────────────────────────────────
-- Carbo Chat — Grupo "Suporte TI" (system_key) + ponte bugs/sugestões → grupo.
--   • chat_channels.system_key: marca canais de sistema (à prova de renome).
--   • Garante o grupo "Suporte TI" com TODOS os funcionários (gestor = admin).
--   • Trigger em carbo_bug_reports posta MENSAGEM DO SISTEMA no grupo:
--       novo bug/sugestão   → 🐞/💡 …
--       resolvido           → ✅ …
--       recusado (declined) → 🚫 … (+ motivo/admin_notes)
--     São mensagens do sistema (sender_id NULL) → NÃO geram push nem toast
--     (o trigger de push já ignora sender_id NULL; o ChatAlerts ignora kind
--     'system'). Serve de histórico no grupo, sem tocar o telefone de ninguém.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1) Coluna de chave de sistema + unicidade (um canal por chave).
ALTER TABLE public.chat_channels ADD COLUMN IF NOT EXISTS system_key text;
CREATE UNIQUE INDEX IF NOT EXISTS uq_chat_channels_system_key
  ON public.chat_channels (system_key) WHERE system_key IS NOT NULL;

-- 2) Garante o grupo "Suporte TI" com todos os funcionários.
DO $$
DECLARE
  v_id    uuid;
  v_owner uuid;
BEGIN
  -- Já existe canal marcado?
  SELECT id INTO v_id FROM public.chat_channels WHERE system_key = 'suporte_ti' LIMIT 1;

  -- Senão, reaproveita um grupo já criado com esse nome (evita duplicar).
  IF v_id IS NULL THEN
    SELECT id INTO v_id FROM public.chat_channels
    WHERE type = 'group' AND name = 'Suporte TI' AND archived_at IS NULL
    ORDER BY created_at LIMIT 1;
  END IF;

  -- Senão, cria do zero (dono = primeiro gestor).
  IF v_id IS NULL THEN
    SELECT p.id INTO v_owner FROM public.profiles p
    WHERE public.is_employee(p.id) AND public.carbo_is_gestor(p.id)
    ORDER BY p.created_at LIMIT 1;

    INSERT INTO public.chat_channels (type, name, description, is_private, created_by)
    VALUES ('group', 'Suporte TI',
            'Peça ajuda ao TI aqui. Bugs e sugestões registrados aparecem neste grupo.',
            false, v_owner)
    RETURNING id INTO v_id;
  END IF;

  -- Marca a chave de sistema.
  UPDATE public.chat_channels SET system_key = 'suporte_ti' WHERE id = v_id;

  -- Membros = todos os funcionários (gestor entra como admin).
  INSERT INTO public.chat_channel_members (channel_id, user_id, role)
  SELECT v_id, p.id, CASE WHEN public.carbo_is_gestor(p.id) THEN 'admin' ELSE 'member' END
  FROM public.profiles p
  WHERE public.is_employee(p.id)
  ON CONFLICT (channel_id, user_id) DO NOTHING;
END $$;

-- 3) Posta mensagem do sistema no grupo Suporte TI.
CREATE OR REPLACE FUNCTION public.chat_suporte_ti_post(p_body text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_channel uuid;
BEGIN
  SELECT id INTO v_channel FROM public.chat_channels WHERE system_key = 'suporte_ti' LIMIT 1;
  IF v_channel IS NULL THEN RETURN; END IF;   -- grupo ainda não criado → ignora
  INSERT INTO public.chat_messages (channel_id, sender_id, kind, body)
  VALUES (v_channel, NULL, 'system', p_body);
END $$;

-- 4a) Novo bug/sugestão → posta no grupo.
CREATE OR REPLACE FUNCTION public.carbo_bug_post_to_chat_ins()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.chat_suporte_ti_post(
    CASE WHEN NEW.kind = 'sugestao' THEN '💡 Nova sugestão: ' ELSE '🐞 Novo bug: ' END
    || NEW.title
    || COALESCE(' — ' || NULLIF(btrim(NEW.reporter_name), ''), '')
  );
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_carbo_bug_post_chat_ins ON public.carbo_bug_reports;
CREATE TRIGGER trg_carbo_bug_post_chat_ins
  AFTER INSERT ON public.carbo_bug_reports
  FOR EACH ROW EXECUTE FUNCTION public.carbo_bug_post_to_chat_ins();

-- 4b) Resolvido / recusado → posta no grupo com QUEM agiu + motivo/obs.
--     Formato: "<prefixo>: <título> — <quem agiu> — <obs/motivo>".
CREATE OR REPLACE FUNCTION public.carbo_bug_post_to_chat_upd()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_actor text;
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status IN ('resolved','declined') THEN
    SELECT COALESCE(NULLIF(btrim(full_name), ''), username, email, 'Alguém')
      INTO v_actor FROM public.profiles WHERE id = auth.uid();
    PERFORM public.chat_suporte_ti_post(
      CASE WHEN NEW.status = 'resolved' THEN '✅ Resolvido: ' ELSE '🚫 Recusado: ' END
      || NEW.title
      || ' — ' || COALESCE(v_actor, 'Alguém')
      || COALESCE(' — ' || NULLIF(btrim(NEW.admin_notes), ''), '')
    );
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_carbo_bug_post_chat_upd ON public.carbo_bug_reports;
CREATE TRIGGER trg_carbo_bug_post_chat_upd
  AFTER UPDATE ON public.carbo_bug_reports
  FOR EACH ROW EXECUTE FUNCTION public.carbo_bug_post_to_chat_upd();

NOTIFY pgrst, 'reload schema';
