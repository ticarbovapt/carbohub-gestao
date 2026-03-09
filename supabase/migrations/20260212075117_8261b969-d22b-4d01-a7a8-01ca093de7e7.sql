
-- ===========================================
-- MÓDULO OPS FINANCEIRO & SUPRIMENTOS
-- ===========================================

-- 1. ENUMS
CREATE TYPE public.purchase_request_type AS ENUM ('estoque', 'uso_direto', 'investimento');
CREATE TYPE public.purchase_request_status AS ENUM ('rascunho', 'aguardando_aprovacao', 'aprovada', 'rejeitada', 'cancelada');
CREATE TYPE public.purchase_order_status AS ENUM ('gerada', 'enviada_fornecedor', 'parcialmente_recebida', 'recebida', 'cancelada');
CREATE TYPE public.receiving_status AS ENUM ('pendente', 'conferido_ok', 'conferido_divergencia');
CREATE TYPE public.payable_status AS ENUM ('programado', 'pago', 'atrasado', 'cancelado');

-- 2. TABELAS

-- 2.1 Configuração de Aprovação
CREATE TABLE public.purchase_approval_config (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    max_value NUMERIC NOT NULL,
    approver_role public.carbo_role NOT NULL,
    requires_ceo BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2.2 Requisição de Compra
CREATE TABLE public.purchase_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rc_number TEXT NOT NULL,
    service_order_id UUID REFERENCES public.service_orders(id),
    requested_by UUID NOT NULL,
    cost_center TEXT NOT NULL,
    purchase_type public.purchase_request_type NOT NULL DEFAULT 'uso_direto',
    suggested_supplier TEXT,
    estimated_value NUMERIC NOT NULL DEFAULT 0,
    justification TEXT NOT NULL,
    operational_impact TEXT,
    items JSONB NOT NULL DEFAULT '[]'::jsonb,
    status public.purchase_request_status NOT NULL DEFAULT 'rascunho',
    approved_by UUID,
    approved_at TIMESTAMPTZ,
    rejection_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2.3 Ordem de Compra
CREATE TABLE public.purchase_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    oc_number TEXT NOT NULL,
    purchase_request_id UUID NOT NULL REFERENCES public.purchase_requests(id),
    service_order_id UUID REFERENCES public.service_orders(id),
    supplier_name TEXT NOT NULL,
    supplier_document TEXT,
    supplier_contact TEXT,
    items JSONB NOT NULL DEFAULT '[]'::jsonb,
    total_value NUMERIC NOT NULL DEFAULT 0,
    payment_condition TEXT,
    expected_delivery DATE,
    status public.purchase_order_status NOT NULL DEFAULT 'gerada',
    generated_by UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2.4 Recebimento
CREATE TABLE public.purchase_receivings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    purchase_order_id UUID NOT NULL REFERENCES public.purchase_orders(id),
    received_by UUID NOT NULL,
    received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    items_received JSONB NOT NULL DEFAULT '[]'::jsonb,
    status public.receiving_status NOT NULL DEFAULT 'pendente',
    has_divergence BOOLEAN NOT NULL DEFAULT false,
    divergence_notes TEXT,
    stock_updated BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2.5 Nota Fiscal
CREATE TABLE public.purchase_invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    purchase_order_id UUID NOT NULL REFERENCES public.purchase_orders(id),
    receiving_id UUID REFERENCES public.purchase_receivings(id),
    invoice_number TEXT NOT NULL,
    invoice_date DATE NOT NULL,
    invoice_value NUMERIC NOT NULL DEFAULT 0,
    file_url TEXT,
    oc_match BOOLEAN DEFAULT false,
    receiving_match BOOLEAN DEFAULT false,
    value_match BOOLEAN DEFAULT false,
    verified_by UUID,
    verified_at TIMESTAMPTZ,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2.6 Contas a Pagar
CREATE TABLE public.purchase_payables (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id UUID REFERENCES public.purchase_invoices(id),
    purchase_order_id UUID NOT NULL REFERENCES public.purchase_orders(id),
    service_order_id UUID REFERENCES public.service_orders(id),
    supplier_name TEXT NOT NULL,
    amount NUMERIC NOT NULL DEFAULT 0,
    due_date DATE NOT NULL,
    paid_at TIMESTAMPTZ,
    paid_by UUID,
    payment_proof_url TEXT,
    status public.payable_status NOT NULL DEFAULT 'programado',
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. TRIGGERS DE AUTO-NUMERAÇÃO

CREATE OR REPLACE FUNCTION public.generate_rc_number()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    year_prefix TEXT;
    next_seq INTEGER;
BEGIN
    year_prefix := to_char(now(), 'YYYY');
    SELECT COALESCE(MAX(
        CAST(SUBSTRING(rc_number FROM 'RC-\d{4}-(\d+)') AS INTEGER)
    ), 0) + 1
    INTO next_seq
    FROM public.purchase_requests
    WHERE rc_number LIKE 'RC-' || year_prefix || '-%';
    NEW.rc_number := 'RC-' || year_prefix || '-' || LPAD(next_seq::TEXT, 5, '0');
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_generate_rc_number
BEFORE INSERT ON public.purchase_requests
FOR EACH ROW EXECUTE FUNCTION public.generate_rc_number();

CREATE OR REPLACE FUNCTION public.generate_oc_number()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    year_prefix TEXT;
    next_seq INTEGER;
BEGIN
    year_prefix := to_char(now(), 'YYYY');
    SELECT COALESCE(MAX(
        CAST(SUBSTRING(oc_number FROM 'OC-\d{4}-(\d+)') AS INTEGER)
    ), 0) + 1
    INTO next_seq
    FROM public.purchase_orders
    WHERE oc_number LIKE 'OC-' || year_prefix || '-%';
    NEW.oc_number := 'OC-' || year_prefix || '-' || LPAD(next_seq::TEXT, 5, '0');
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_generate_oc_number
BEFORE INSERT ON public.purchase_orders
FOR EACH ROW EXECUTE FUNCTION public.generate_oc_number();

-- Triggers de updated_at
CREATE TRIGGER update_purchase_requests_updated_at BEFORE UPDATE ON public.purchase_requests FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_purchase_orders_updated_at BEFORE UPDATE ON public.purchase_orders FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_purchase_receivings_updated_at BEFORE UPDATE ON public.purchase_receivings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_purchase_invoices_updated_at BEFORE UPDATE ON public.purchase_invoices FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_purchase_payables_updated_at BEFORE UPDATE ON public.purchase_payables FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_purchase_approval_config_updated_at BEFORE UPDATE ON public.purchase_approval_config FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4. RLS

ALTER TABLE public.purchase_approval_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_receivings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_payables ENABLE ROW LEVEL SECURITY;

-- purchase_approval_config: leitura para autenticados, gestão para CEO
CREATE POLICY "Config readable by authenticated" ON public.purchase_approval_config FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Config managed by CEO" ON public.purchase_approval_config FOR ALL USING (is_ceo(auth.uid()));

-- purchase_requests
CREATE POLICY "RC viewable by authorized" ON public.purchase_requests FOR SELECT USING (
    auth.uid() IS NOT NULL AND (
        is_ceo(auth.uid()) OR is_gestor(auth.uid()) OR requested_by = auth.uid()
    )
);
CREATE POLICY "RC insertable by authenticated" ON public.purchase_requests FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL AND auth.uid() = requested_by
);
CREATE POLICY "RC updatable by authorized" ON public.purchase_requests FOR UPDATE USING (
    auth.uid() IS NOT NULL AND (
        is_ceo(auth.uid()) OR is_gestor(auth.uid()) OR (requested_by = auth.uid() AND status = 'rascunho')
    )
);
CREATE POLICY "RC deletable by admin" ON public.purchase_requests FOR DELETE USING (
    is_ceo(auth.uid()) OR has_role(auth.uid(), 'admin'::app_role)
);

-- purchase_orders
CREATE POLICY "OC viewable by authorized" ON public.purchase_orders FOR SELECT USING (
    auth.uid() IS NOT NULL AND (is_ceo(auth.uid()) OR is_gestor(auth.uid()))
);
CREATE POLICY "OC insertable by gestors" ON public.purchase_orders FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL AND (is_ceo(auth.uid()) OR is_gestor(auth.uid()))
);
CREATE POLICY "OC updatable by gestors" ON public.purchase_orders FOR UPDATE USING (
    auth.uid() IS NOT NULL AND (is_ceo(auth.uid()) OR is_gestor(auth.uid()))
);
CREATE POLICY "OC deletable by admin" ON public.purchase_orders FOR DELETE USING (
    is_ceo(auth.uid()) OR has_role(auth.uid(), 'admin'::app_role)
);

-- purchase_receivings
CREATE POLICY "Receiving viewable by authorized" ON public.purchase_receivings FOR SELECT USING (
    auth.uid() IS NOT NULL AND (is_ceo(auth.uid()) OR is_gestor(auth.uid()))
);
CREATE POLICY "Receiving insertable by gestors" ON public.purchase_receivings FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL AND (is_ceo(auth.uid()) OR is_gestor(auth.uid()))
);
CREATE POLICY "Receiving updatable by gestors" ON public.purchase_receivings FOR UPDATE USING (
    auth.uid() IS NOT NULL AND (is_ceo(auth.uid()) OR is_gestor(auth.uid()))
);
CREATE POLICY "Receiving deletable by admin" ON public.purchase_receivings FOR DELETE USING (
    is_ceo(auth.uid()) OR has_role(auth.uid(), 'admin'::app_role)
);

-- purchase_invoices
CREATE POLICY "Invoice viewable by authorized" ON public.purchase_invoices FOR SELECT USING (
    auth.uid() IS NOT NULL AND (is_ceo(auth.uid()) OR is_gestor(auth.uid()))
);
CREATE POLICY "Invoice insertable by gestors" ON public.purchase_invoices FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL AND (is_ceo(auth.uid()) OR is_gestor(auth.uid()))
);
CREATE POLICY "Invoice updatable by gestors" ON public.purchase_invoices FOR UPDATE USING (
    auth.uid() IS NOT NULL AND (is_ceo(auth.uid()) OR is_gestor(auth.uid()))
);
CREATE POLICY "Invoice deletable by admin" ON public.purchase_invoices FOR DELETE USING (
    is_ceo(auth.uid()) OR has_role(auth.uid(), 'admin'::app_role)
);

-- purchase_payables
CREATE POLICY "Payable viewable by authorized" ON public.purchase_payables FOR SELECT USING (
    auth.uid() IS NOT NULL AND (is_ceo(auth.uid()) OR is_gestor(auth.uid()))
);
CREATE POLICY "Payable insertable by gestors" ON public.purchase_payables FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL AND (is_ceo(auth.uid()) OR is_gestor(auth.uid()))
);
CREATE POLICY "Payable updatable by gestors" ON public.purchase_payables FOR UPDATE USING (
    auth.uid() IS NOT NULL AND (is_ceo(auth.uid()) OR is_gestor(auth.uid()))
);
CREATE POLICY "Payable deletable by admin" ON public.purchase_payables FOR DELETE USING (
    is_ceo(auth.uid()) OR has_role(auth.uid(), 'admin'::app_role)
);

-- 5. STORAGE BUCKET
INSERT INTO storage.buckets (id, name, public) VALUES ('purchase-documents', 'purchase-documents', false);

CREATE POLICY "Purchase docs viewable by authorized" ON storage.objects FOR SELECT USING (
    bucket_id = 'purchase-documents' AND auth.uid() IS NOT NULL AND (is_ceo(auth.uid()) OR is_gestor(auth.uid()))
);
CREATE POLICY "Purchase docs uploadable by gestors" ON storage.objects FOR INSERT WITH CHECK (
    bucket_id = 'purchase-documents' AND auth.uid() IS NOT NULL AND (is_ceo(auth.uid()) OR is_gestor(auth.uid()))
);
CREATE POLICY "Purchase docs updatable by gestors" ON storage.objects FOR UPDATE USING (
    bucket_id = 'purchase-documents' AND auth.uid() IS NOT NULL AND (is_ceo(auth.uid()) OR is_gestor(auth.uid()))
);

-- 6. REALTIME
ALTER PUBLICATION supabase_realtime ADD TABLE public.purchase_requests;
ALTER PUBLICATION supabase_realtime ADD TABLE public.purchase_payables;

-- 7. DADOS INICIAIS - Configuração de aprovação
INSERT INTO public.purchase_approval_config (max_value, approver_role, requires_ceo) VALUES
    (1000, 'gestor_compras', false),
    (5000, 'gestor_fin', false),
    (999999999, 'ceo', true);
