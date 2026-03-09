-- Corrigir políticas RLS permissivas
-- Remover políticas antigas e criar novas mais restritivas

-- =============================================
-- OS_STAGE_HISTORY: Restringir acesso
-- =============================================
DROP POLICY IF EXISTS "Operators can update stages" ON public.os_stage_history;

-- Operadores podem atualizar stages apenas se:
-- 1. São do departamento atual da OS
-- 2. São managers/admins
CREATE POLICY "Operators can manage stages"
ON public.os_stage_history FOR INSERT
TO authenticated
WITH CHECK (
    public.is_manager_or_admin(auth.uid()) OR 
    EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE id = auth.uid() 
        AND department = os_stage_history.department
    )
);

CREATE POLICY "Operators can update own stages"
ON public.os_stage_history FOR UPDATE
TO authenticated
USING (
    public.is_manager_or_admin(auth.uid()) OR 
    completed_by = auth.uid() OR
    EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE id = auth.uid() 
        AND department = os_stage_history.department
    )
);

CREATE POLICY "Admins can delete stages"
ON public.os_stage_history FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- =============================================
-- OS_CHECKLISTS: Restringir acesso
-- =============================================
DROP POLICY IF EXISTS "Operators can manage checklists" ON public.os_checklists;

-- Operadores podem criar checklists para seu departamento
CREATE POLICY "Operators can create checklists"
ON public.os_checklists FOR INSERT
TO authenticated
WITH CHECK (
    public.is_manager_or_admin(auth.uid()) OR 
    EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE id = auth.uid() 
        AND department = os_checklists.department
    )
);

-- Operadores podem atualizar checklists do seu departamento
CREATE POLICY "Operators can update checklists"
ON public.os_checklists FOR UPDATE
TO authenticated
USING (
    public.is_manager_or_admin(auth.uid()) OR 
    completed_by = auth.uid() OR
    EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE id = auth.uid() 
        AND department = os_checklists.department
    )
);

-- Apenas admins podem deletar checklists
CREATE POLICY "Admins can delete checklists"
ON public.os_checklists FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));