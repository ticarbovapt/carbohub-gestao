
-- =============================================
-- REESTRUTURAÇÃO FINANCEIRO & SUPRIMENTOS
-- =============================================

-- 1) RC Requests (Requisições de Compra - novo fluxo)
CREATE TABLE public.rc_requests (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  solicitante_id uuid NOT NULL,
  produto_id uuid REFERENCES public.mrp_products(id),
  produto_nome text,
  quantidade numeric NOT NULL DEFAULT 1,
  unidade text NOT NULL DEFAULT 'un',
  justificativa text NOT NULL,
  centro_custo text NOT NULL DEFAULT 'Operações',
  valor_estimado numeric DEFAULT 0,
  status text NOT NULL DEFAULT 'rascunho',
  service_order_id uuid REFERENCES public.service_orders(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Status check via trigger
CREATE OR REPLACE FUNCTION public.validate_rc_status()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status NOT IN ('rascunho','em_cotacao','em_analise_ia','aguardando_aprovacao','aprovada','rejeitada','convertida_pc') THEN
    RAISE EXCEPTION 'Status RC inválido: %', NEW.status;
  END IF;
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER trg_validate_rc_status
BEFORE INSERT OR UPDATE ON public.rc_requests
FOR EACH ROW EXECUTE FUNCTION public.validate_rc_status();

ALTER TABLE public.rc_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "RC viewable by authorized" ON public.rc_requests
FOR SELECT USING (
  auth.uid() IS NOT NULL AND (
    solicitante_id = auth.uid() OR is_ceo(auth.uid()) OR is_gestor(auth.uid())
  )
);

CREATE POLICY "RC insertable by authenticated" ON public.rc_requests
FOR INSERT WITH CHECK (auth.uid() IS NOT NULL AND solicitante_id = auth.uid());

CREATE POLICY "RC updatable by gestors" ON public.rc_requests
FOR UPDATE USING (
  auth.uid() IS NOT NULL AND (
    solicitante_id = auth.uid() OR is_ceo(auth.uid()) OR is_gestor(auth.uid())
  )
);

CREATE POLICY "RC deletable by admin" ON public.rc_requests
FOR DELETE USING (is_ceo(auth.uid()) OR has_role(auth.uid(), 'admin'::app_role));

-- 2) RC Quotations (Cotações)
CREATE TABLE public.rc_quotations (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  rc_id uuid NOT NULL REFERENCES public.rc_requests(id) ON DELETE CASCADE,
  fornecedor_id uuid REFERENCES public.suppliers(id),
  fornecedor_nome text NOT NULL,
  preco numeric NOT NULL,
  prazo_entrega_dias integer NOT NULL DEFAULT 0,
  condicao_pagamento text,
  observacoes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.rc_quotations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Quotations viewable by authorized" ON public.rc_quotations
FOR SELECT USING (
  auth.uid() IS NOT NULL AND (
    is_ceo(auth.uid()) OR is_gestor(auth.uid()) OR
    EXISTS (SELECT 1 FROM rc_requests WHERE id = rc_id AND solicitante_id = auth.uid())
  )
);

CREATE POLICY "Quotations insertable by gestors" ON public.rc_quotations
FOR INSERT WITH CHECK (auth.uid() IS NOT NULL AND (is_ceo(auth.uid()) OR is_gestor(auth.uid())));

CREATE POLICY "Quotations updatable by gestors" ON public.rc_quotations
FOR UPDATE USING (auth.uid() IS NOT NULL AND (is_ceo(auth.uid()) OR is_gestor(auth.uid())));

CREATE POLICY "Quotations deletable by admin" ON public.rc_quotations
FOR DELETE USING (is_ceo(auth.uid()) OR has_role(auth.uid(), 'admin'::app_role));

-- 3) RC Analysis (Análise IA)
CREATE TABLE public.rc_analysis (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  rc_id uuid NOT NULL REFERENCES public.rc_requests(id) ON DELETE CASCADE,
  fornecedor_recomendado_id uuid REFERENCES public.suppliers(id),
  fornecedor_recomendado_nome text,
  score numeric NOT NULL DEFAULT 0,
  ranking jsonb NOT NULL DEFAULT '[]'::jsonb,
  justificativa text NOT NULL,
  criterios jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.rc_analysis ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Analysis viewable by authorized" ON public.rc_analysis
FOR SELECT USING (
  auth.uid() IS NOT NULL AND (
    is_ceo(auth.uid()) OR is_gestor(auth.uid()) OR
    EXISTS (SELECT 1 FROM rc_requests WHERE id = rc_id AND solicitante_id = auth.uid())
  )
);

CREATE POLICY "Analysis insertable by system" ON public.rc_analysis
FOR INSERT WITH CHECK (auth.uid() IS NOT NULL AND (is_ceo(auth.uid()) OR is_gestor(auth.uid())));

-- 4) Approval Logs
CREATE TABLE public.rc_approval_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  rc_id uuid NOT NULL REFERENCES public.rc_requests(id) ON DELETE CASCADE,
  approver_id uuid NOT NULL,
  action text NOT NULL, -- 'approved' | 'rejected'
  justificativa text,
  nivel integer NOT NULL DEFAULT 1, -- 1 = primeiro aprovador, 2 = segundo, etc.
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.rc_approval_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Approval logs viewable by authorized" ON public.rc_approval_logs
FOR SELECT USING (
  auth.uid() IS NOT NULL AND (is_ceo(auth.uid()) OR is_gestor(auth.uid()) OR approver_id = auth.uid())
);

CREATE POLICY "Approval logs insertable by gestors" ON public.rc_approval_logs
FOR INSERT WITH CHECK (auth.uid() IS NOT NULL AND (is_ceo(auth.uid()) OR is_gestor(auth.uid())));

-- 5) Stock Movements (Movimentações de Estoque)
CREATE TABLE public.stock_movements (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id uuid NOT NULL REFERENCES public.mrp_products(id),
  tipo text NOT NULL, -- 'entrada' | 'saida'
  quantidade numeric NOT NULL,
  origem text NOT NULL, -- 'PC' | 'OP' | 'ajuste'
  origem_id uuid,
  custo_unitario numeric DEFAULT 0,
  custo_medio_anterior numeric DEFAULT 0,
  custo_medio_novo numeric DEFAULT 0,
  observacoes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.validate_stock_movement()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.tipo NOT IN ('entrada', 'saida') THEN
    RAISE EXCEPTION 'Tipo de movimento inválido: %', NEW.tipo;
  END IF;
  IF NEW.origem NOT IN ('PC', 'OP', 'ajuste') THEN
    RAISE EXCEPTION 'Origem de movimento inválida: %', NEW.origem;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER trg_validate_stock_movement
BEFORE INSERT ON public.stock_movements
FOR EACH ROW EXECUTE FUNCTION public.validate_stock_movement();

ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Stock movements viewable by authorized" ON public.stock_movements
FOR SELECT USING (auth.uid() IS NOT NULL AND (is_ceo(auth.uid()) OR is_gestor(auth.uid())));

CREATE POLICY "Stock movements insertable by gestors" ON public.stock_movements
FOR INSERT WITH CHECK (auth.uid() IS NOT NULL AND (is_ceo(auth.uid()) OR is_gestor(auth.uid())));

-- Add rc_id to purchase_orders for linking
ALTER TABLE public.purchase_orders ADD COLUMN IF NOT EXISTS rc_id uuid REFERENCES public.rc_requests(id);

-- Add fornecedor_selecionado_id to rc_requests
ALTER TABLE public.rc_requests ADD COLUMN IF NOT EXISTS fornecedor_selecionado_id uuid REFERENCES public.suppliers(id);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_rc_requests_solicitante ON public.rc_requests(solicitante_id);
CREATE INDEX IF NOT EXISTS idx_rc_requests_status ON public.rc_requests(status);
CREATE INDEX IF NOT EXISTS idx_rc_quotations_rc ON public.rc_quotations(rc_id);
CREATE INDEX IF NOT EXISTS idx_rc_analysis_rc ON public.rc_analysis(rc_id);
CREATE INDEX IF NOT EXISTS idx_rc_approval_logs_rc ON public.rc_approval_logs(rc_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_product ON public.stock_movements(product_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_origem ON public.stock_movements(origem, origem_id);
