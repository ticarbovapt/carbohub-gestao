-- ============================================================
-- Bling ERP Integration Tables
-- 5 tabelas: integration, products, contacts, orders, sync_log
-- ============================================================

-- 1. bling_integration — OAuth tokens
CREATE TABLE IF NOT EXISTS public.bling_integration (
  id            uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  access_token  text        NOT NULL,
  refresh_token text        NOT NULL,
  token_type    text        NOT NULL DEFAULT 'Bearer',
  expires_at    timestamptz NOT NULL,
  scope         text        DEFAULT '',
  connected_by  uuid        REFERENCES auth.users(id),
  is_active     boolean     NOT NULL DEFAULT true,
  connected_at  timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS update_bling_integration_updated_at ON public.bling_integration;
CREATE TRIGGER update_bling_integration_updated_at
  BEFORE UPDATE ON public.bling_integration
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 2. bling_products — Produtos sincronizados
CREATE TABLE IF NOT EXISTS public.bling_products (
  id               uuid    NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  bling_id         bigint  NOT NULL UNIQUE,
  nome             text    NOT NULL DEFAULT '',
  codigo           text,
  preco            numeric(12,2) DEFAULT 0,
  tipo             text,
  situacao         text,
  formato          text,
  unidade          text,
  peso_liquido     numeric(10,4),
  peso_bruto       numeric(10,4),
  gtin             text,
  gtin_embalagem   text,
  raw_data         jsonb   DEFAULT '{}',
  synced_at        timestamptz NOT NULL DEFAULT now(),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS update_bling_products_updated_at ON public.bling_products;
CREATE TRIGGER update_bling_products_updated_at
  BEFORE UPDATE ON public.bling_products
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_bling_products_codigo ON public.bling_products(codigo);
CREATE INDEX IF NOT EXISTS idx_bling_products_situacao ON public.bling_products(situacao);

-- 3. bling_contacts — Contatos sincronizados
CREATE TABLE IF NOT EXISTS public.bling_contacts (
  id            uuid    NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  bling_id      bigint  NOT NULL UNIQUE,
  nome          text    NOT NULL DEFAULT '',
  fantasia      text,
  tipo_pessoa   text,
  cpf_cnpj      text,
  ie            text,
  email         text,
  telefone      text,
  celular       text,
  tipo_contato  text,
  situacao      text,
  is_supplier   boolean DEFAULT false,
  is_client     boolean DEFAULT false,
  raw_data      jsonb   DEFAULT '{}',
  synced_at     timestamptz NOT NULL DEFAULT now(),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS update_bling_contacts_updated_at ON public.bling_contacts;
CREATE TRIGGER update_bling_contacts_updated_at
  BEFORE UPDATE ON public.bling_contacts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_bling_contacts_cpf_cnpj ON public.bling_contacts(cpf_cnpj);
CREATE INDEX IF NOT EXISTS idx_bling_contacts_tipo ON public.bling_contacts(is_supplier, is_client);

-- 4. bling_orders — Pedidos de venda sincronizados
CREATE TABLE IF NOT EXISTS public.bling_orders (
  id               uuid    NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  bling_id         bigint  NOT NULL UNIQUE,
  numero           text,
  numero_loja      text,
  data             text,
  data_saida       text,
  data_prevista    text,
  total_produtos   numeric(12,2) DEFAULT 0,
  total_desconto   numeric(12,2) DEFAULT 0,
  total_frete      numeric(12,2) DEFAULT 0,
  total            numeric(12,2) DEFAULT 0,
  situacao_id      bigint,
  situacao_valor   text,
  contato_id       bigint,
  contato_nome     text,
  observacoes      text,
  items            jsonb,
  raw_data         jsonb   DEFAULT '{}',
  synced_at        timestamptz NOT NULL DEFAULT now(),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS update_bling_orders_updated_at ON public.bling_orders;
CREATE TRIGGER update_bling_orders_updated_at
  BEFORE UPDATE ON public.bling_orders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_bling_orders_numero ON public.bling_orders(numero);
CREATE INDEX IF NOT EXISTS idx_bling_orders_data ON public.bling_orders(data);
CREATE INDEX IF NOT EXISTS idx_bling_orders_contato ON public.bling_orders(contato_id);

-- 5. bling_sync_log — Histórico de sincronizações
CREATE TABLE IF NOT EXISTS public.bling_sync_log (
  id              uuid    NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  entity_type     text    NOT NULL,  -- 'products', 'contacts', 'orders'
  status          text    NOT NULL DEFAULT 'running',  -- 'running', 'completed', 'failed'
  records_synced  integer DEFAULT 0,
  records_failed  integer DEFAULT 0,
  error_message   text,
  triggered_by    uuid    REFERENCES auth.users(id),
  started_at      timestamptz NOT NULL DEFAULT now(),
  finished_at     timestamptz
);

CREATE INDEX IF NOT EXISTS idx_bling_sync_log_entity ON public.bling_sync_log(entity_type);
CREATE INDEX IF NOT EXISTS idx_bling_sync_log_started ON public.bling_sync_log(started_at DESC);

-- ============================================================
-- RLS Policies
-- ============================================================

ALTER TABLE public.bling_integration ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bling_products    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bling_contacts    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bling_orders      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bling_sync_log    ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (idempotent re-run)
DROP POLICY IF EXISTS "bling_integration_admin_all" ON public.bling_integration;
DROP POLICY IF EXISTS "bling_products_read" ON public.bling_products;
DROP POLICY IF EXISTS "bling_products_admin_write" ON public.bling_products;
DROP POLICY IF EXISTS "bling_contacts_read" ON public.bling_contacts;
DROP POLICY IF EXISTS "bling_contacts_admin_write" ON public.bling_contacts;
DROP POLICY IF EXISTS "bling_orders_read" ON public.bling_orders;
DROP POLICY IF EXISTS "bling_orders_admin_write" ON public.bling_orders;
DROP POLICY IF EXISTS "bling_sync_log_read" ON public.bling_sync_log;
DROP POLICY IF EXISTS "bling_sync_log_admin_write" ON public.bling_sync_log;

-- bling_integration: somente admin/ceo podem ler/gerenciar tokens
CREATE POLICY "bling_integration_admin_all"
  ON public.bling_integration FOR ALL
  USING (public.is_admin(auth.uid()) OR public.is_ceo(auth.uid()));

-- bling_products: admin/ceo/gestor podem ler; edge functions usam service_role
CREATE POLICY "bling_products_read"
  ON public.bling_products FOR SELECT
  USING (
    public.is_admin(auth.uid()) OR
    public.is_ceo(auth.uid()) OR
    public.is_gestor(auth.uid())
  );

CREATE POLICY "bling_products_admin_write"
  ON public.bling_products FOR ALL
  USING (public.is_admin(auth.uid()) OR public.is_ceo(auth.uid()));

-- bling_contacts: admin/ceo/gestor podem ler
CREATE POLICY "bling_contacts_read"
  ON public.bling_contacts FOR SELECT
  USING (
    public.is_admin(auth.uid()) OR
    public.is_ceo(auth.uid()) OR
    public.is_gestor(auth.uid())
  );

CREATE POLICY "bling_contacts_admin_write"
  ON public.bling_contacts FOR ALL
  USING (public.is_admin(auth.uid()) OR public.is_ceo(auth.uid()));

-- bling_orders: admin/ceo/gestor podem ler
CREATE POLICY "bling_orders_read"
  ON public.bling_orders FOR SELECT
  USING (
    public.is_admin(auth.uid()) OR
    public.is_ceo(auth.uid()) OR
    public.is_gestor(auth.uid())
  );

CREATE POLICY "bling_orders_admin_write"
  ON public.bling_orders FOR ALL
  USING (public.is_admin(auth.uid()) OR public.is_ceo(auth.uid()));

-- bling_sync_log: admin/ceo podem ler histórico
CREATE POLICY "bling_sync_log_read"
  ON public.bling_sync_log FOR SELECT
  USING (
    public.is_admin(auth.uid()) OR
    public.is_ceo(auth.uid()) OR
    public.is_gestor(auth.uid())
  );

CREATE POLICY "bling_sync_log_admin_write"
  ON public.bling_sync_log FOR ALL
  USING (public.is_admin(auth.uid()) OR public.is_ceo(auth.uid()));
