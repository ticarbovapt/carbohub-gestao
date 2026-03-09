-- =====================================================
-- CHECKLIST FLOW RESTRUCTURING MIGRATION
-- Transforms checklists into stage-based validation flow
-- =====================================================

-- 1. Create new enum for OS workflow stages (aligned with responsibility map)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'os_workflow_stage') THEN
        CREATE TYPE public.os_workflow_stage AS ENUM (
            'comercial',
            'operacoes', 
            'logistica',
            'administrativo',
            'fiscal',
            'financeiro',
            'pos_venda'
        );
    END IF;
END$$;

-- 2. Create stage configuration table (maps stages to roles and requirements)
CREATE TABLE IF NOT EXISTS public.checklist_stage_config (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    stage os_workflow_stage NOT NULL UNIQUE,
    stage_label TEXT NOT NULL,
    status_label TEXT NOT NULL,
    responsible_role carbo_role NOT NULL,
    display_order INTEGER NOT NULL DEFAULT 0,
    is_optional BOOLEAN DEFAULT false,
    description TEXT,
    default_items JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.checklist_stage_config ENABLE ROW LEVEL SECURITY;

-- RLS: Anyone authenticated can read config
CREATE POLICY "Stage config readable by authenticated" 
ON public.checklist_stage_config FOR SELECT 
USING (auth.uid() IS NOT NULL);

-- RLS: Only CEO can manage config
CREATE POLICY "Stage config managed by CEO" 
ON public.checklist_stage_config FOR ALL 
USING (is_ceo(auth.uid()));

-- 3. Create OS stage validations table (tracks each stage completion)
CREATE TABLE IF NOT EXISTS public.os_stage_validations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    service_order_id UUID NOT NULL REFERENCES public.service_orders(id) ON DELETE CASCADE,
    stage os_workflow_stage NOT NULL,
    checklist_responses JSONB NOT NULL DEFAULT '[]'::jsonb,
    is_complete BOOLEAN DEFAULT false,
    validated_by UUID REFERENCES auth.users(id),
    validated_at TIMESTAMPTZ,
    validation_notes TEXT,
    skipped BOOLEAN DEFAULT false,
    skip_reason TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(service_order_id, stage)
);

-- Enable RLS
ALTER TABLE public.os_stage_validations ENABLE ROW LEVEL SECURITY;

-- RLS: View validations if can access OS or is gestor/ceo
CREATE POLICY "Validations viewable by authorized users" 
ON public.os_stage_validations FOR SELECT 
USING (
    auth.uid() IS NOT NULL AND (
        is_ceo(auth.uid()) OR 
        is_gestor(auth.uid()) OR 
        can_access_os(auth.uid(), service_order_id)
    )
);

-- RLS: Create validations if can execute stage
CREATE POLICY "Validations creatable by stage executors" 
ON public.os_stage_validations FOR INSERT 
WITH CHECK (
    auth.uid() IS NOT NULL AND (
        is_ceo(auth.uid()) OR 
        is_gestor(auth.uid()) OR 
        can_execute_os_stage(auth.uid(), service_order_id)
    )
);

-- RLS: Update validations if can execute or is validator
CREATE POLICY "Validations updatable by authorized users" 
ON public.os_stage_validations FOR UPDATE 
USING (
    auth.uid() IS NOT NULL AND (
        is_ceo(auth.uid()) OR 
        is_gestor(auth.uid()) OR 
        can_execute_os_stage(auth.uid(), service_order_id) OR
        validated_by = auth.uid()
    )
);

-- 4. Insert default stage configurations
INSERT INTO public.checklist_stage_config (stage, stage_label, status_label, responsible_role, display_order, is_optional, description, default_items)
VALUES 
    ('comercial', 'Comercial', 'Iniciada – Comercial', 'operador', 1, false, 
     'Cadastro inicial e definição do escopo',
     '[
        {"id": "cliente_cadastrado", "label": "Cadastro inicial do cliente ou licenciado", "type": "checkbox", "required": true},
        {"id": "tipo_operacao", "label": "Identificação do tipo de operação (VAPT / ZÉ)", "type": "select", "options": ["VAPT", "ZÉ"], "required": true},
        {"id": "demanda_mapeada", "label": "Mapeamento da demanda", "type": "checkbox", "required": true},
        {"id": "escopo_definido", "label": "Definição do escopo do serviço/produto", "type": "textarea", "required": true},
        {"id": "agendamento_sugerido", "label": "Agendamento inicial sugerido", "type": "date", "required": false}
     ]'::jsonb),
    
    ('operacoes', 'Operações', 'Em Execução', 'operador', 2, false,
     'Execução técnica do serviço',
     '[
        {"id": "agenda_confirmada", "label": "Confirmação da agenda", "type": "checkbox", "required": true},
        {"id": "execucao_tecnica", "label": "Execução técnica do serviço", "type": "checkbox", "required": true},
        {"id": "dados_operacionais", "label": "Coleta de dados operacionais", "type": "textarea", "required": true},
        {"id": "evidencias_antes", "label": "Upload de evidências (antes)", "type": "file", "required": true},
        {"id": "evidencias_depois", "label": "Upload de evidências (depois)", "type": "file", "required": true},
        {"id": "observacoes_tecnicas", "label": "Registro de observações técnicas", "type": "textarea", "required": false}
     ]'::jsonb),
    
    ('logistica', 'Compras / Logística', 'Logística Validada', 'gestor_compras', 3, true,
     'Separação e envio de insumos',
     '[
        {"id": "insumos_separados", "label": "Separação de insumos", "type": "checkbox", "required": true},
        {"id": "envio_confirmado", "label": "Confirmação de envio ou disponibilidade", "type": "checkbox", "required": true},
        {"id": "consumo_registrado", "label": "Registro de consumo ou entrega", "type": "textarea", "required": true},
        {"id": "validacao_logistica", "label": "Validação logística da OS", "type": "checkbox", "required": true}
     ]'::jsonb),
    
    ('administrativo', 'Administrativo', 'Em Formalização', 'gestor_adm', 4, false,
     'Conferência e aprovação administrativa',
     '[
        {"id": "dados_cadastrais_ok", "label": "Conferência de dados cadastrais", "type": "checkbox", "required": true},
        {"id": "validacao_contratual", "label": "Validação contratual", "type": "checkbox", "required": true},
        {"id": "documentos_obrigatorios", "label": "Conferência de documentos obrigatórios", "type": "checkbox", "required": true},
        {"id": "aprovacao_administrativa", "label": "Aprovação administrativa", "type": "checkbox", "required": true}
     ]'::jsonb),
    
    ('fiscal', 'Fiscal', 'Fiscal Validado', 'operador_fiscal', 5, false,
     'Validação e emissão fiscal',
     '[
        {"id": "dados_fiscais_ok", "label": "Conferência de dados fiscais", "type": "checkbox", "required": true},
        {"id": "nf_emitida", "label": "Emissão ou validação de NF", "type": "text", "required": true},
        {"id": "registro_fiscal", "label": "Registro fiscal da operação", "type": "checkbox", "required": true}
     ]'::jsonb),
    
    ('financeiro', 'Financeiro', 'Financeiro Validado', 'gestor_fin', 6, false,
     'Validação financeira e cobrança',
     '[
        {"id": "cobranca_validada", "label": "Validação de cobrança", "type": "checkbox", "required": true},
        {"id": "pagamento_registrado", "label": "Registro de pagamento ou faturamento", "type": "checkbox", "required": true},
        {"id": "status_financeiro", "label": "Atualização de status financeiro", "type": "select", "options": ["Pago", "Pendente", "Faturado"], "required": true},
        {"id": "liberacao_encerramento", "label": "Liberação para encerramento", "type": "checkbox", "required": true}
     ]'::jsonb),
    
    ('pos_venda', 'Pós-Venda', 'Pós-Operação', 'operador', 7, false,
     'Relacionamento e feedback do cliente',
     '[
        {"id": "contato_realizado", "label": "Contato com cliente realizado", "type": "checkbox", "required": true},
        {"id": "feedback_registrado", "label": "Feedback registrado", "type": "textarea", "required": true},
        {"id": "nps_coletado", "label": "NPS ou avaliação coletada", "type": "number", "required": false},
        {"id": "oportunidades_mapeadas", "label": "Oportunidades futuras mapeadas", "type": "textarea", "required": false}
     ]'::jsonb)
ON CONFLICT (stage) DO NOTHING;

-- 5. Create function to check if user can validate a specific stage
CREATE OR REPLACE FUNCTION public.can_validate_stage(_user_id UUID, _stage os_workflow_stage)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT 
        is_ceo(_user_id) OR
        EXISTS (
            SELECT 1 
            FROM public.checklist_stage_config csc
            JOIN public.carbo_user_roles cur ON cur.role = csc.responsible_role
            WHERE csc.stage = _stage AND cur.user_id = _user_id
        )
$$;

-- 6. Create function to get current OS stage
CREATE OR REPLACE FUNCTION public.get_os_current_stage(_os_id UUID)
RETURNS os_workflow_stage
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_last_validated os_workflow_stage;
    v_next_stage os_workflow_stage;
BEGIN
    -- Get the last validated stage
    SELECT osv.stage INTO v_last_validated
    FROM public.os_stage_validations osv
    JOIN public.checklist_stage_config csc ON csc.stage = osv.stage
    WHERE osv.service_order_id = _os_id 
      AND (osv.is_complete = true OR osv.skipped = true)
    ORDER BY csc.display_order DESC
    LIMIT 1;
    
    -- If no stage validated, return first stage
    IF v_last_validated IS NULL THEN
        RETURN 'comercial'::os_workflow_stage;
    END IF;
    
    -- Get next stage
    SELECT csc.stage INTO v_next_stage
    FROM public.checklist_stage_config csc
    WHERE csc.display_order > (
        SELECT display_order FROM public.checklist_stage_config WHERE stage = v_last_validated
    )
    ORDER BY csc.display_order ASC
    LIMIT 1;
    
    RETURN COALESCE(v_next_stage, v_last_validated);
END;
$$;

-- 7. Create function to validate stage advancement
CREATE OR REPLACE FUNCTION public.can_os_advance_to_stage(_os_id UUID, _target_stage os_workflow_stage)
RETURNS TABLE(can_advance BOOLEAN, block_reason TEXT)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_current_stage os_workflow_stage;
    v_target_order INTEGER;
    v_current_order INTEGER;
    v_prev_stage os_workflow_stage;
    v_prev_complete BOOLEAN;
BEGIN
    v_current_stage := get_os_current_stage(_os_id);
    
    SELECT display_order INTO v_target_order FROM public.checklist_stage_config WHERE stage = _target_stage;
    SELECT display_order INTO v_current_order FROM public.checklist_stage_config WHERE stage = v_current_stage;
    
    -- Check if trying to skip stages
    IF v_target_order > v_current_order + 1 THEN
        RETURN QUERY SELECT false, 'Não é permitido pular etapas'::TEXT;
        RETURN;
    END IF;
    
    -- Check if previous stage is complete (except for first stage)
    IF v_target_order > 1 THEN
        SELECT csc.stage INTO v_prev_stage
        FROM public.checklist_stage_config csc
        WHERE csc.display_order = v_target_order - 1;
        
        SELECT (osv.is_complete OR osv.skipped) INTO v_prev_complete
        FROM public.os_stage_validations osv
        WHERE osv.service_order_id = _os_id AND osv.stage = v_prev_stage;
        
        IF v_prev_complete IS NOT TRUE THEN
            RETURN QUERY SELECT false, format('Etapa anterior (%s) não foi validada', v_prev_stage)::TEXT;
            RETURN;
        END IF;
    END IF;
    
    RETURN QUERY SELECT true, NULL::TEXT;
END;
$$;

-- 8. Create audit log for stage validations
CREATE OR REPLACE FUNCTION public.log_stage_validation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NEW.is_complete = true AND (OLD.is_complete IS NULL OR OLD.is_complete = false) THEN
        INSERT INTO public.flow_audit_logs (
            user_id, action_type, resource_type, resource_id, 
            reason, severity, details
        )
        VALUES (
            auth.uid(), 
            'stage_validated', 
            'os_stage_validation', 
            NEW.id,
            format('Etapa %s validada para OS', NEW.stage),
            'info',
            jsonb_build_object(
                'stage', NEW.stage,
                'os_id', NEW.service_order_id,
                'validated_at', NEW.validated_at,
                'checklist_items_count', jsonb_array_length(NEW.checklist_responses)
            )
        );
    END IF;
    RETURN NEW;
END;
$$;

-- Create trigger for audit logging
DROP TRIGGER IF EXISTS trigger_log_stage_validation ON public.os_stage_validations;
CREATE TRIGGER trigger_log_stage_validation
    AFTER INSERT OR UPDATE ON public.os_stage_validations
    FOR EACH ROW
    EXECUTE FUNCTION public.log_stage_validation();

-- 9. Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_os_stage_validations_os_id ON public.os_stage_validations(service_order_id);
CREATE INDEX IF NOT EXISTS idx_os_stage_validations_stage ON public.os_stage_validations(stage);
CREATE INDEX IF NOT EXISTS idx_os_stage_validations_validated_by ON public.os_stage_validations(validated_by);

-- 10. Enable realtime for stage validations
ALTER PUBLICATION supabase_realtime ADD TABLE public.os_stage_validations;