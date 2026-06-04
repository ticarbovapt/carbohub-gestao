-- ============================================================================
-- Auditoria automática de mudanças (rede de proteção)
--
-- Enquanto o controle fino de escopo não é feito tela a tela, garantimos
-- RASTRO de quem criou / editou / apagou registros importantes — direto no
-- banco (pega até quem tentar contornar pela API, não só pela tela).
--
-- Grava em order_audit_logs (já existe): user_id, role, action, table_name,
-- record_id, before_data, after_data, created_at. A tabela é imutável
-- (sem UPDATE/DELETE) e só liderança lê.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_audit_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid  uuid := auth.uid();
  v_role text;
BEGIN
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

-- Anexa o trigger às tabelas de negócio importantes (idempotente).
DO $audit$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'carboze_orders',     -- vendas/pedidos
    'service_orders',     -- OS descarbonização
    'purchase_requests',  -- RC
    'purchase_orders',    -- OC
    'purchase_payables',  -- contas a pagar
    'licensees',          -- licenciados
    'production_orders',  -- OP
    'machines',           -- máquinas
    'pdvs',               -- lojas
    'profiles'            -- contas de usuário
  ] LOOP
    IF to_regclass('public.'||t) IS NOT NULL THEN
      EXECUTE format('DROP TRIGGER IF EXISTS trg_audit_%1$s ON public.%1$I', t);
      EXECUTE format(
        'CREATE TRIGGER trg_audit_%1$s AFTER INSERT OR UPDATE OR DELETE ON public.%1$I '
        'FOR EACH ROW EXECUTE FUNCTION public.fn_audit_changes()', t);
    END IF;
  END LOOP;
END $audit$;

-- ============================================================================
-- CONSULTA (liderança): últimos eventos de auditoria
--   SELECT a.created_at, p.full_name AS quem, a.role, a.action, a.table_name,
--          a.record_id
--   FROM order_audit_logs a
--   LEFT JOIN profiles p ON p.id = a.user_id
--   ORDER BY a.created_at DESC
--   LIMIT 100;
--
-- Ver quem APAGOU algo:
--   SELECT created_at, user_id, table_name, record_id, before_data
--   FROM order_audit_logs WHERE action = 'DELETE' ORDER BY created_at DESC;
-- ============================================================================
