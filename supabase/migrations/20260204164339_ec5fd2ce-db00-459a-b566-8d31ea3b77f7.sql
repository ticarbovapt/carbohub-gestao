-- =====================================================
-- ATUALIZAÇÃO DAS POLÍTICAS RLS PARA USAR NOVAS FUNÇÕES
-- =====================================================

-- 1. Remover políticas antigas da service_orders
DROP POLICY IF EXISTS "OS viewable by authorized users" ON public.service_orders;
DROP POLICY IF EXISTS "Managers can create OS" ON public.service_orders;
DROP POLICY IF EXISTS "Managers can update OS" ON public.service_orders;

-- 2. Criar novas políticas usando can_access_os e can_execute_os_stage
CREATE POLICY "OS viewable by Carbo governance" 
ON public.service_orders 
FOR SELECT 
USING (
  auth.uid() IS NOT NULL 
  AND (
    is_ceo(auth.uid()) 
    OR is_gestor(auth.uid())
    OR can_access_os(auth.uid(), id)
    OR created_by = auth.uid()
    OR assigned_to = auth.uid()
  )
);

CREATE POLICY "OS can be created by gestors" 
ON public.service_orders 
FOR INSERT 
WITH CHECK (
  auth.uid() IS NOT NULL 
  AND (is_ceo(auth.uid()) OR is_gestor(auth.uid()))
);

CREATE POLICY "OS can be updated by authorized users" 
ON public.service_orders 
FOR UPDATE 
USING (
  auth.uid() IS NOT NULL 
  AND (
    is_ceo(auth.uid())
    OR is_gestor(auth.uid())
    OR can_execute_os_stage(auth.uid(), id)
    OR created_by = auth.uid()
    OR assigned_to = auth.uid()
  )
);

-- 3. Atualizar políticas do os_stage_history
DROP POLICY IF EXISTS "Stage history viewable by authorized users" ON public.os_stage_history;
DROP POLICY IF EXISTS "Operators can manage stages" ON public.os_stage_history;
DROP POLICY IF EXISTS "Operators can update own stages" ON public.os_stage_history;

CREATE POLICY "Stage history viewable by governance" 
ON public.os_stage_history 
FOR SELECT 
USING (
  auth.uid() IS NOT NULL 
  AND (
    is_ceo(auth.uid())
    OR is_gestor(auth.uid())
    OR can_access_os(auth.uid(), service_order_id)
    OR completed_by = auth.uid()
  )
);

CREATE POLICY "Stages can be created by authorized users" 
ON public.os_stage_history 
FOR INSERT 
WITH CHECK (
  auth.uid() IS NOT NULL 
  AND (
    is_ceo(auth.uid())
    OR is_gestor(auth.uid())
    OR can_execute_os_stage(auth.uid(), service_order_id)
  )
);

CREATE POLICY "Stages can be updated by authorized users" 
ON public.os_stage_history 
FOR UPDATE 
USING (
  auth.uid() IS NOT NULL 
  AND (
    is_ceo(auth.uid())
    OR is_gestor(auth.uid())
    OR can_execute_os_stage(auth.uid(), service_order_id)
    OR completed_by = auth.uid()
  )
);

-- 4. Atualizar políticas do os_checklists
DROP POLICY IF EXISTS "Checklists viewable by authorized users" ON public.os_checklists;
DROP POLICY IF EXISTS "Operators can create checklists" ON public.os_checklists;
DROP POLICY IF EXISTS "Operators can update checklists" ON public.os_checklists;

CREATE POLICY "Checklists viewable by governance" 
ON public.os_checklists 
FOR SELECT 
USING (
  auth.uid() IS NOT NULL 
  AND (
    is_ceo(auth.uid())
    OR is_gestor(auth.uid())
    OR can_access_os(auth.uid(), service_order_id)
    OR completed_by = auth.uid()
  )
);

CREATE POLICY "Checklists can be created by authorized users" 
ON public.os_checklists 
FOR INSERT 
WITH CHECK (
  auth.uid() IS NOT NULL 
  AND (
    is_ceo(auth.uid())
    OR is_gestor(auth.uid())
    OR can_execute_os_stage(auth.uid(), service_order_id)
  )
);

CREATE POLICY "Checklists can be updated by authorized users" 
ON public.os_checklists 
FOR UPDATE 
USING (
  auth.uid() IS NOT NULL 
  AND (
    is_ceo(auth.uid())
    OR is_gestor(auth.uid())
    OR can_execute_os_stage(auth.uid(), service_order_id)
    OR completed_by = auth.uid()
  )
);

-- 5. Atualizar políticas do os_messages
DROP POLICY IF EXISTS "Messages viewable by authorized users" ON public.os_messages;

CREATE POLICY "Messages viewable by governance" 
ON public.os_messages 
FOR SELECT 
USING (
  auth.uid() IS NOT NULL 
  AND (
    is_ceo(auth.uid())
    OR is_gestor(auth.uid())
    OR can_access_os(auth.uid(), service_order_id)
    OR user_id = auth.uid()
    OR auth.uid() = ANY(mentions)
  )
);

-- 6. Atualizar políticas do os_actions
DROP POLICY IF EXISTS "Actions viewable by authorized users" ON public.os_actions;

CREATE POLICY "Actions viewable by governance" 
ON public.os_actions 
FOR SELECT 
USING (
  auth.uid() IS NOT NULL 
  AND (
    is_ceo(auth.uid())
    OR is_gestor(auth.uid())
    OR can_access_os(auth.uid(), service_order_id)
    OR assigned_to = auth.uid()
    OR assigned_by = auth.uid()
  )
);

-- 7. ATRIBUIR ROLE CEO AO USUÁRIO PETERSON
INSERT INTO public.carbo_user_roles (user_id, role, scope_macro_flows, scope_departments)
VALUES (
  '7a6356c4-a69a-4279-bdc1-7eabff8bbf08',
  'ceo',
  ARRAY['comercial', 'operacional', 'adm_financeiro']::macro_flow[],
  ARRAY['venda', 'preparacao', 'expedicao', 'operacao', 'pos_venda']::department_type[]
)
ON CONFLICT DO NOTHING;