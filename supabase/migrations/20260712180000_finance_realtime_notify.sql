-- Tempo real no Financeiro: badges ao vivo + notificação (sininho/toast/som)
-- pra todo mundo com acesso ao Financeiro quando chega algo novo pra tratar.

-- 1) Habilita Realtime (postgres_changes) nas tabelas que o app assina.
--    purchase_requests e purchase_payables já estão na publicação.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['purchase_orders','receivables','notifications'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;

-- 2) Fan-out: cria uma notificação pra cada usuário com carbo_financas liberado.
CREATE OR REPLACE FUNCTION public.notify_finance_users(
  p_type text, p_title text, p_body text, p_ref_type text, p_ref_id uuid
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.notifications (user_id, type, title, body, reference_type, reference_id, is_read)
  SELECT p.id, p_type, p_title, p_body, p_ref_type, p_ref_id, false
  FROM public.profiles p
  WHERE p.allowed_interfaces IS NOT NULL
    AND 'carbo_financas' = ANY (SELECT lower(x) FROM unnest(p.allowed_interfaces) x);
END $$;

-- 3) Gatilhos dos eventos "chegou algo novo pra tratar".
CREATE OR REPLACE FUNCTION public.trg_finance_rc_pending()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'aguardando_aprovacao'
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'aguardando_aprovacao') THEN
    PERFORM public.notify_finance_users(
      'finance_rc_pendente',
      'Nova requisição pra aprovar',
      coalesce(NEW.rc_number, 'RC') || ' · ' || to_char(coalesce(NEW.estimated_value, 0), 'FML999G999G990D00'),
      'purchase_request', NEW.id);
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_finance_rc_pending ON public.purchase_requests;
CREATE TRIGGER trg_finance_rc_pending
AFTER INSERT OR UPDATE OF status ON public.purchase_requests
FOR EACH ROW EXECUTE FUNCTION public.trg_finance_rc_pending();

CREATE OR REPLACE FUNCTION public.trg_finance_oc_new()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.notify_finance_users(
    'finance_oc_nova',
    'Nova ordem de compra',
    coalesce(NEW.oc_number, 'OC') || ' · ' || coalesce(NEW.supplier_name, ''),
    'purchase_order', NEW.id);
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_finance_oc_new ON public.purchase_orders;
CREATE TRIGGER trg_finance_oc_new
AFTER INSERT ON public.purchase_orders
FOR EACH ROW EXECUTE FUNCTION public.trg_finance_oc_new();

GRANT EXECUTE ON FUNCTION public.notify_finance_users(text, text, text, text, uuid) TO authenticated;
