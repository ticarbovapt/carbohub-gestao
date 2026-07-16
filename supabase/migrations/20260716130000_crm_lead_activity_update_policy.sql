-- ─────────────────────────────────────────────────────────────────────────────
-- A tabela crm_sales_lead_activities só tinha policies de SELECT e INSERT.
-- Sem policy de UPDATE, fixar/desafixar (coluna pinned) era bloqueado pelo RLS
-- silenciosamente (0 linhas, sem erro). Adiciona UPDATE com o mesmo escopo de
-- acesso do lead-pai (dono, responsável ou gestor).
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS crm_sales_lead_act_update ON public.crm_sales_lead_activities;
CREATE POLICY crm_sales_lead_act_update ON public.crm_sales_lead_activities
  FOR UPDATE USING (EXISTS (
    SELECT 1 FROM public.crm_sales_leads l
    WHERE l.id = lead_id
      AND (l.created_by = auth.uid() OR l.assigned_to = auth.uid() OR public.crm_is_gestor())
  ));

NOTIFY pgrst, 'reload schema';
