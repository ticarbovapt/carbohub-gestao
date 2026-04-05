-- =============================================================
-- Migration: Campos do módulo RV (Registro de Venda)
-- Adiciona vendedor, tipo de fluxo, e tracking de OP/OS geradas
-- =============================================================

-- 1. Novos campos na tabela carboze_orders
ALTER TABLE carboze_orders
  ADD COLUMN IF NOT EXISTS vendedor_id UUID REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS vendedor_name TEXT,
  ADD COLUMN IF NOT EXISTS rv_flow_type TEXT DEFAULT 'standard'
    CHECK (rv_flow_type IN ('standard', 'service', 'bonus_only')),
  ADD COLUMN IF NOT EXISTS created_op_id UUID REFERENCES production_orders(id),
  ADD COLUMN IF NOT EXISTS created_os_id UUID REFERENCES service_orders(id),
  ADD COLUMN IF NOT EXISTS linha TEXT
    CHECK (linha IN ('carboze_100ml', 'carboze_1l', 'carbopro', 'carbovapt')),
  ADD COLUMN IF NOT EXISTS modalidade TEXT
    CHECK (modalidade IN ('poc', 'eventual', 'recorrente', 'licenciado'));

-- 2. Índices para performance
CREATE INDEX IF NOT EXISTS idx_carboze_orders_vendedor ON carboze_orders(vendedor_id);
CREATE INDEX IF NOT EXISTS idx_carboze_orders_flow_type ON carboze_orders(rv_flow_type);
CREATE INDEX IF NOT EXISTS idx_carboze_orders_linha ON carboze_orders(linha);

-- 3. Tabela de metas de vendas por vendedor
CREATE TABLE IF NOT EXISTS sales_targets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendedor_id UUID NOT NULL REFERENCES profiles(id),
  month DATE NOT NULL, -- primeiro dia do mês (ex: 2026-04-01)
  target_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  target_qty INTEGER NOT NULL DEFAULT 0,
  linha TEXT, -- null = meta geral, ou filtro por linha
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(vendedor_id, month, linha)
);

-- 4. Tabela b2b_leads (para o Funil B2B funcionar)
CREATE TABLE IF NOT EXISTS b2b_leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cnpj TEXT,
  legal_name TEXT,
  trade_name TEXT,
  contact_name TEXT,
  contact_phone TEXT,
  contact_email TEXT,
  business_vertical TEXT,
  business_model TEXT,
  city TEXT,
  state TEXT,
  address TEXT,
  latitude DECIMAL(10,7),
  longitude DECIMAL(10,7),
  validation_checklist JSONB DEFAULT '[]',
  validation_score INTEGER DEFAULT 0,
  status TEXT DEFAULT 'novo' CHECK (status IN ('novo', 'qualificado', 'em_negociacao', 'ganho', 'perdido')),
  notes TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 5. RLS para b2b_leads
ALTER TABLE b2b_leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "b2b_leads_select" ON b2b_leads
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "b2b_leads_insert" ON b2b_leads
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "b2b_leads_update" ON b2b_leads
  FOR UPDATE USING (auth.role() = 'authenticated');

-- 6. RLS para sales_targets
ALTER TABLE sales_targets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sales_targets_select" ON sales_targets
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "sales_targets_manage" ON sales_targets
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM carbo_user_roles
      WHERE user_id = auth.uid()
      AND role IN ('master_admin', 'ceo', 'gestor_adm')
    )
  );

-- 7. Function: auto-gerar OP a partir de RV confirmado (tipo produto)
CREATE OR REPLACE FUNCTION generate_op_from_rv()
RETURNS TRIGGER AS $$
DECLARE
  new_op_id UUID;
  order_items JSONB;
  prod_items JSONB;
  total_qty INTEGER := 0;
  item JSONB;
BEGIN
  -- Só dispara quando status muda para 'confirmed'
  IF NEW.status != 'confirmed' OR OLD.status = 'confirmed' THEN
    RETURN NEW;
  END IF;

  -- Só para fluxo de produto (standard)
  IF NEW.rv_flow_type != 'standard' THEN
    RETURN NEW;
  END IF;

  -- Já tem OP gerada? Não duplicar
  IF NEW.created_op_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Extrair itens (excluindo bonificações)
  order_items := NEW.items::JSONB;
  prod_items := '[]'::JSONB;

  FOR item IN SELECT * FROM jsonb_array_elements(order_items)
  LOOP
    IF NOT (item->>'has_bonus')::BOOLEAN THEN
      prod_items := prod_items || jsonb_build_array(item);
      total_qty := total_qty + COALESCE((item->>'quantity')::INTEGER, 0);
    END IF;
  END LOOP;

  -- Sem itens produtivos? Não gerar OP
  IF total_qty = 0 THEN
    RETURN NEW;
  END IF;

  -- Criar OP
  INSERT INTO production_orders (
    op_number,
    status,
    demand_source,
    linked_order_ids,
    priority,
    need_date,
    quantity,
    notes,
    created_by
  ) VALUES (
    'OP-' || LPAD(nextval('production_orders_op_number_seq')::TEXT, 5, '0'),
    'planejada',
    'venda',
    ARRAY[NEW.id],
    'normal',
    COALESCE(NEW.next_delivery_date::DATE, CURRENT_DATE + INTERVAL '7 days'),
    total_qty,
    'Auto-gerada a partir de RV ' || NEW.order_number,
    NEW.created_by
  ) RETURNING id INTO new_op_id;

  -- Salvar referência na RV
  NEW.created_op_id := new_op_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 8. Function: auto-gerar OS a partir de RV confirmado (tipo serviço)
CREATE OR REPLACE FUNCTION generate_os_from_rv()
RETURNS TRIGGER AS $$
DECLARE
  new_os_id UUID;
BEGIN
  -- Só dispara quando status muda para 'confirmed'
  IF NEW.status != 'confirmed' OR OLD.status = 'confirmed' THEN
    RETURN NEW;
  END IF;

  -- Só para fluxo de serviço
  IF NEW.rv_flow_type != 'service' THEN
    RETURN NEW;
  END IF;

  -- Já tem OS gerada?
  IF NEW.created_os_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Criar OS
  INSERT INTO service_orders (
    title,
    description,
    status,
    priority,
    created_by
  ) VALUES (
    'OS CarboVapt — ' || NEW.customer_name,
    'Auto-gerada a partir de RV ' || NEW.order_number || '. Modalidade: ' || COALESCE(NEW.modalidade, 'eventual'),
    'active',
    'normal',
    NEW.created_by
  ) RETURNING id INTO new_os_id;

  -- Salvar referência na RV
  NEW.created_os_id := new_os_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 9. Triggers
DROP TRIGGER IF EXISTS trg_generate_op_from_rv ON carboze_orders;
CREATE TRIGGER trg_generate_op_from_rv
  BEFORE UPDATE ON carboze_orders
  FOR EACH ROW
  EXECUTE FUNCTION generate_op_from_rv();

DROP TRIGGER IF EXISTS trg_generate_os_from_rv ON carboze_orders;
CREATE TRIGGER trg_generate_os_from_rv
  BEFORE UPDATE ON carboze_orders
  FOR EACH ROW
  EXECUTE FUNCTION generate_os_from_rv();
