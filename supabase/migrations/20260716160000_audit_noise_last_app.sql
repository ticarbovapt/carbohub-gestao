-- ─────────────────────────────────────────────────────────────────────────────
-- Ruído de auditoria: last_app / last_app_at.
-- record_app_access() grava profiles.last_app + last_app_at a CADA acesso a um
-- app (ping de presença). Esses campos não estavam na lista de ruído do
-- fn_audit_changes, então cada acesso gerava um "UPDATE em profiles" na
-- auditoria, inundando o feed sem nenhuma alteração real. Passa a ignorá-los
-- (como já ignora last_login_at/updated_at) e limpa os registros já criados.
-- ─────────────────────────────────────────────────────────────────────────────

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
    'synced_at', 'last_synced_at', 'search_vector',
    'last_app', 'last_app_at'
  ];
BEGIN
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

  SELECT COALESCE(p.funcao, p.department::text) INTO v_role
  FROM public.profiles p WHERE p.id = v_uid;

  BEGIN
    INSERT INTO public.order_audit_logs
      (user_id, role, action, table_name, record_id, before_data, after_data)
    VALUES (
      v_uid, v_role, TG_OP, TG_TABLE_NAME,
      (to_jsonb(COALESCE(NEW, OLD)) ->> 'id')::uuid,
      CASE WHEN TG_OP IN ('UPDATE','DELETE') THEN to_jsonb(OLD) END,
      CASE WHEN TG_OP IN ('INSERT','UPDATE') THEN to_jsonb(NEW) END
    );
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Limpa os UPDATEs já gravados cujo único campo alterado é ruído (inclui last_app).
DELETE FROM public.order_audit_logs a
WHERE a.action = 'UPDATE'
  AND a.before_data IS NOT NULL
  AND a.after_data  IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM jsonb_each(a.before_data) o
    JOIN jsonb_each(a.after_data)  n ON n.key = o.key
    WHERE o.value IS DISTINCT FROM n.value
      AND o.key <> ALL (ARRAY[
        'last_login_at', 'updated_at', 'last_seen_at', 'last_active_at',
        'synced_at', 'last_synced_at', 'search_vector',
        'last_app', 'last_app_at'
      ])
  );

NOTIFY pgrst, 'reload schema';
