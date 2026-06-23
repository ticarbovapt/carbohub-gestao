-- ─────────────────────────────────────────────────────────────────────────────
-- Carbo Ops — leitura das tabelas Bling para a tela de Integrações (consumo).
-- Aditivo: NÃO remove as policies existentes (controle continua igual). Só
-- adiciona SELECT para usuários autenticados nas tabelas de DADOS/LOG do Bling.
-- A bling_integration (tokens) NÃO é exposta — status vem da edge function.
-- Escrita continua pelas edge functions (service_role).
-- ─────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS bling_products_ops_read ON public.bling_products;
CREATE POLICY bling_products_ops_read ON public.bling_products
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS bling_contacts_ops_read ON public.bling_contacts;
CREATE POLICY bling_contacts_ops_read ON public.bling_contacts
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS bling_orders_ops_read ON public.bling_orders;
CREATE POLICY bling_orders_ops_read ON public.bling_orders
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS bling_sync_log_ops_read ON public.bling_sync_log;
CREATE POLICY bling_sync_log_ops_read ON public.bling_sync_log
  FOR SELECT TO authenticated USING (true);
