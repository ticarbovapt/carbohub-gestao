-- ============================================
-- HARDENING OPERACIONAL - CARBO OPS
-- SLA por etapa, Capacidade operacional, Logs de auditoria silenciosos
-- ============================================

-- 1. Adicionar SLA por etapa às ordens de serviço
ALTER TABLE public.service_orders
ADD COLUMN IF NOT EXISTS stage_sla_deadline TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS stage_started_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
ADD COLUMN IF NOT EXISTS checklist_completed BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS stage_validated_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS stage_validated_by UUID;

-- 2. Adicionar SLA tracking no histórico de etapas
ALTER TABLE public.os_stage_history
ADD COLUMN IF NOT EXISTS sla_deadline TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS sla_breached BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS checklist_completed BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS validation_notes TEXT;

-- 3. Criar tabela de configuração de SLA por departamento
CREATE TABLE IF NOT EXISTS public.department_sla_config (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    department_type department_type NOT NULL UNIQUE,
    default_sla_hours INTEGER NOT NULL DEFAULT 24,
    warning_threshold_percent INTEGER NOT NULL DEFAULT 75,
    requires_checklist BOOLEAN DEFAULT true,
    requires_validation BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Inserir configurações padrão de SLA
INSERT INTO public.department_sla_config (department_type, default_sla_hours, warning_threshold_percent) VALUES
    ('venda', 24, 75),
    ('preparacao', 12, 75),
    ('expedicao', 8, 75),
    ('operacao', 48, 75),
    ('pos_venda', 72, 75)
ON CONFLICT (department_type) DO NOTHING;

-- 4. Criar tabela de capacidade operacional
CREATE TABLE IF NOT EXISTS public.operational_capacity (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    department_type department_type NOT NULL,
    date DATE NOT NULL,
    max_orders INTEGER NOT NULL DEFAULT 10,
    scheduled_orders INTEGER NOT NULL DEFAULT 0,
    available_slots INTEGER GENERATED ALWAYS AS (max_orders - scheduled_orders) STORED,
    team_count INTEGER DEFAULT 1,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    UNIQUE(department_type, date)
);

-- 5. Criar tabela de logs de auditoria silenciosos (governance)
CREATE TABLE IF NOT EXISTS public.flow_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID,
    action_type TEXT NOT NULL, -- 'advance_blocked', 'sla_breach', 'validation_override', 'capacity_blocked', 'checkout_blocked'
    resource_type TEXT NOT NULL, -- 'service_order', 'licensee_request', 'checklist'
    resource_id UUID,
    reason TEXT NOT NULL,
    details JSONB DEFAULT '{}'::jsonb,
    department department_type,
    severity TEXT DEFAULT 'info', -- 'info', 'warning', 'error', 'critical'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS on new tables
ALTER TABLE public.department_sla_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.operational_capacity ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.flow_audit_logs ENABLE ROW LEVEL SECURITY;

-- 6. RLS Policies

-- department_sla_config - read by all, manage by admins
CREATE POLICY "SLA config readable by all authenticated"
ON public.department_sla_config FOR SELECT
USING (auth.uid() IS NOT NULL);

CREATE POLICY "SLA config managed by CEO"
ON public.department_sla_config FOR ALL
USING (is_ceo(auth.uid()));

-- operational_capacity - readable by authenticated, managed by gestors
CREATE POLICY "Capacity readable by authenticated"
ON public.operational_capacity FOR SELECT
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Capacity managed by gestors"
ON public.operational_capacity FOR ALL
USING (is_ceo(auth.uid()) OR is_gestor(auth.uid()));

-- flow_audit_logs - only CEO and Admin can view
CREATE POLICY "Audit logs viewable by CEO"
ON public.flow_audit_logs FOR SELECT
USING (is_ceo(auth.uid()) OR has_role(auth.uid(), 'admin'::app_role));

-- Allow inserts from authenticated users (for logging their own blocks)
CREATE POLICY "Audit logs insertable by authenticated"
ON public.flow_audit_logs FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL);

-- 7. Função para registrar bloqueio de fluxo
CREATE OR REPLACE FUNCTION public.log_flow_block(
    _user_id UUID,
    _action_type TEXT,
    _resource_type TEXT,
    _resource_id UUID,
    _reason TEXT,
    _department department_type DEFAULT NULL,
    _details JSONB DEFAULT '{}'::jsonb,
    _severity TEXT DEFAULT 'warning'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    new_id UUID;
BEGIN
    INSERT INTO public.flow_audit_logs (
        user_id, action_type, resource_type, resource_id, 
        reason, department, details, severity
    )
    VALUES (
        _user_id, _action_type, _resource_type, _resource_id,
        _reason, _department, _details, _severity
    )
    RETURNING id INTO new_id;
    
    RETURN new_id;
END;
$$;

-- 8. Função para verificar se uma OS pode avançar
CREATE OR REPLACE FUNCTION public.can_os_advance(_os_id UUID)
RETURNS TABLE (
    can_advance BOOLEAN,
    block_reason TEXT,
    checklist_complete BOOLEAN,
    sla_status TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_os RECORD;
    v_checklist RECORD;
    v_sla_config RECORD;
    v_can_advance BOOLEAN := true;
    v_block_reason TEXT := NULL;
    v_checklist_complete BOOLEAN := false;
    v_sla_status TEXT := 'ok';
BEGIN
    -- Get OS data
    SELECT * INTO v_os FROM public.service_orders WHERE id = _os_id;
    
    IF NOT FOUND THEN
        RETURN QUERY SELECT false, 'OS não encontrada'::TEXT, false, 'unknown'::TEXT;
        RETURN;
    END IF;
    
    -- Get SLA config for current department
    SELECT * INTO v_sla_config FROM public.department_sla_config 
    WHERE department_type = v_os.current_department;
    
    -- Check checklist completion if required
    IF v_sla_config.requires_checklist THEN
        SELECT * INTO v_checklist FROM public.os_checklists 
        WHERE service_order_id = _os_id 
        AND department = v_os.current_department
        AND is_completed = true;
        
        IF FOUND THEN
            v_checklist_complete := true;
        ELSE
            v_can_advance := false;
            v_block_reason := 'Checklist da etapa não está 100% completo';
        END IF;
    ELSE
        v_checklist_complete := true;
    END IF;
    
    -- Check validation if required (and checklist is complete)
    IF v_can_advance AND v_sla_config.requires_validation THEN
        IF v_os.stage_validated_at IS NULL THEN
            v_can_advance := false;
            v_block_reason := 'Etapa requer validação explícita antes de avançar';
        END IF;
    END IF;
    
    -- Check SLA status
    IF v_os.stage_sla_deadline IS NOT NULL THEN
        IF v_os.stage_sla_deadline < now() THEN
            v_sla_status := 'breached';
        ELSIF v_os.stage_sla_deadline < now() + interval '2 hours' THEN
            v_sla_status := 'critical';
        ELSIF v_os.stage_sla_deadline < now() + interval '6 hours' THEN
            v_sla_status := 'warning';
        END IF;
    END IF;
    
    RETURN QUERY SELECT v_can_advance, v_block_reason, v_checklist_complete, v_sla_status;
END;
$$;

-- 9. Função para verificar capacidade operacional
CREATE OR REPLACE FUNCTION public.check_operational_capacity(
    _department department_type,
    _date DATE DEFAULT CURRENT_DATE
)
RETURNS TABLE (
    has_capacity BOOLEAN,
    available_slots INTEGER,
    max_orders INTEGER,
    scheduled_orders INTEGER
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_capacity RECORD;
BEGIN
    -- Get or create capacity record
    SELECT * INTO v_capacity FROM public.operational_capacity 
    WHERE department_type = _department AND date = _date;
    
    IF NOT FOUND THEN
        -- Return default capacity if no record exists
        RETURN QUERY SELECT true, 10, 10, 0;
        RETURN;
    END IF;
    
    RETURN QUERY SELECT 
        v_capacity.available_slots > 0,
        v_capacity.available_slots,
        v_capacity.max_orders,
        v_capacity.scheduled_orders;
END;
$$;

-- 10. Trigger para atualizar contador de capacidade ao criar OS
CREATE OR REPLACE FUNCTION public.update_capacity_on_os_create()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_date DATE;
BEGIN
    v_date := COALESCE(NEW.due_date::date, CURRENT_DATE);
    
    -- Upsert capacity record
    INSERT INTO public.operational_capacity (department_type, date, scheduled_orders, max_orders)
    VALUES (NEW.current_department, v_date, 1, 10)
    ON CONFLICT (department_type, date) 
    DO UPDATE SET 
        scheduled_orders = operational_capacity.scheduled_orders + 1,
        updated_at = now();
    
    RETURN NEW;
END;
$$;

-- Create trigger (drop first if exists)
DROP TRIGGER IF EXISTS tr_update_capacity_on_os_create ON public.service_orders;
CREATE TRIGGER tr_update_capacity_on_os_create
AFTER INSERT ON public.service_orders
FOR EACH ROW
EXECUTE FUNCTION public.update_capacity_on_os_create();

-- 11. Enable realtime for audit logs (for admin monitoring)
ALTER PUBLICATION supabase_realtime ADD TABLE public.flow_audit_logs;