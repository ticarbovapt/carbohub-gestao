-- ============================================================================
-- Auditoria: ignorar updates que só mexem em campos de ruído.
--
-- Logins atualizam profiles.last_login_at a cada acesso, enchendo a auditoria
-- de eventos "Editou" irrelevantes que escondem alterações de verdade.
-- Passamos a NÃO gravar um UPDATE cujos únicos campos alterados estejam na
-- lista de ruído. INSERT e DELETE seguem sempre auditados.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_audit_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid          uuid := auth.uid();
  v_role         text;
  v_real_changes int;
  v_noise        text[] := ARRAY[
    'last_login_at', 'updated_at', 'last_seen_at', 'last_active_at',
    'synced_at', 'last_synced_at', 'search_vector'
  ];
BEGIN
  -- Em UPDATE, conta quantos campos relevantes (fora da lista de ruído)
  -- realmente mudaram. Se nenhum, não registra nada.
  IF TG_OP = 'UPDATE' THEN
    SELECT COUNT(*) INTO v_real_changes
    FROM jsonb_each(to_jsonb(OLD)) o
    JOIN jsonb_each(to_jsonb(NEW)) n ON n.key = o.key
    WHERE o.value IS DISTINCT FROM n.value
      AND o.key <> ALL (v_noise);

    IF v_real_changes = 0 THEN
      RETURN COALESCE(NEW, OLD);
    END IF;
  END IF;

  -- Contexto de quem fez (função/departamento do perfil)
  SELECT COALESCE(p.funcao, p.department::text) INTO v_role
  FROM public.profiles p WHERE p.id = v_uid;

  -- Auditoria NUNCA pode bloquear a operação de negócio.
  BEGIN
    INSERT INTO public.order_audit_logs
      (user_id, role, action, table_name, record_id, before_data, after_data)
    VALUES (
      v_uid,
      v_role,
      TG_OP,
      TG_TABLE_NAME,
      (to_jsonb(COALESCE(NEW, OLD)) ->> 'id')::uuid,
      CASE WHEN TG_OP IN ('UPDATE','DELETE') THEN to_jsonb(OLD) END,
      CASE WHEN TG_OP IN ('INSERT','UPDATE') THEN to_jsonb(NEW) END
    );
  EXCEPTION WHEN OTHERS THEN
    NULL; -- falha de auditoria não derruba a operação
  END;

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Opcional: limpar os logs antigos que só registraram último login.
-- Remove eventos UPDATE em profiles cujo before/after diferem apenas em last_login_at.
DELETE FROM public.order_audit_logs a
WHERE a.action = 'UPDATE'
  AND a.table_name = 'profiles'
  AND a.before_data IS NOT NULL
  AND a.after_data  IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM jsonb_each(a.before_data) o
    JOIN jsonb_each(a.after_data)  n ON n.key = o.key
    WHERE o.value IS DISTINCT FROM n.value
      AND o.key <> ALL (ARRAY[
        'last_login_at', 'updated_at', 'last_seen_at', 'last_active_at',
        'synced_at', 'last_synced_at', 'search_vector'
      ])
  );
