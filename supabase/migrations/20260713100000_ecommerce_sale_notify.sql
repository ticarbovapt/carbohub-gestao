-- Notificação de NOVA VENDA online (ML / Amazon / Nuvemshop) pra todo mundo
-- flagado como carbo_admin. Cai no sininho + toast + som de moedinha em qualquer
-- app que a pessoa estiver logada (admin, sales/crm, ops, finance) — todos leem
-- a mesma tabela public.notifications.

-- ecommerce_orders e notifications já estão na publicação supabase_realtime
-- (a primeira desde a criação da tabela; a segunda desde a migração do Financeiro).
-- Deixo o guard aqui por segurança, idempotente.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['ecommerce_orders','notifications'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;

-- Fan-out: uma notificação pra cada usuário com carbo_admin liberado no Admin.
CREATE OR REPLACE FUNCTION public.notify_admin_users(
  p_type text, p_title text, p_body text, p_ref_type text, p_ref_id uuid
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.notifications (user_id, type, title, body, reference_type, reference_id, is_read)
  SELECT p.id, p_type, p_title, p_body, p_ref_type, p_ref_id, false
  FROM public.profiles p
  WHERE p.allowed_interfaces IS NOT NULL
    AND 'carbo_admin' = ANY (SELECT lower(x) FROM unnest(p.allowed_interfaces) x);
END $$;
GRANT EXECUTE ON FUNCTION public.notify_admin_users(text, text, text, text, uuid) TO authenticated;

-- Gatilho: nova linha em ecommerce_orders = nova venda.
--  • Só ML / Amazon / Nuvemshop (as plataformas ativas hoje).
--  • Ignora cancelada.
--  • Guarda de 12h no ordered_at: evita tempestade de notificação quando um
--    sync puxa histórico antigo — só avisa vendas recém-feitas. (Ajuste o
--    intervalo se o sync rodar com folga maior.)
CREATE OR REPLACE FUNCTION public.trg_ecommerce_sale_notify()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE plat_label text; plat_abbr text;
BEGIN
  IF NEW.platform NOT IN ('mercadolivre', 'amazon', 'nuvemshop') THEN RETURN NEW; END IF;
  IF NEW.status = 'cancelled' THEN RETURN NEW; END IF;
  IF NEW.ordered_at < now() - interval '12 hours' THEN RETURN NEW; END IF;

  plat_label := CASE NEW.platform
    WHEN 'mercadolivre' THEN 'Mercado Livre'
    WHEN 'amazon'       THEN 'Amazon'
    WHEN 'nuvemshop'    THEN 'Nuvemshop' END;
  plat_abbr := CASE NEW.platform
    WHEN 'mercadolivre' THEN 'ML'
    WHEN 'amazon'       THEN 'AMZ'
    WHEN 'nuvemshop'    THEN 'NS' END;

  PERFORM public.notify_admin_users(
    'ecommerce_sale',
    '🛒 Nova venda · ' || plat_abbr,
    plat_label
      || ' · ' || to_char(coalesce(NEW.total, 0), 'FML999G999G990D00')
      || ' · ' || coalesce(NEW.quantity, 0) || ' un.'
      || coalesce(' · ' || nullif(NEW.product_name, ''), ''),
    'ecommerce_order', NEW.id);
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_ecommerce_sale_notify ON public.ecommerce_orders;
CREATE TRIGGER trg_ecommerce_sale_notify
AFTER INSERT ON public.ecommerce_orders
FOR EACH ROW EXECUTE FUNCTION public.trg_ecommerce_sale_notify();
