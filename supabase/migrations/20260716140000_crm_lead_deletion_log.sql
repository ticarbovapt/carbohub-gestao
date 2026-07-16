-- ─────────────────────────────────────────────────────────────────────────────
-- Log de exclusão de leads do Carbo Sales.
-- O dono do card (created_by) já pode excluir pela policy de DELETE existente;
-- agora toda exclusão é registrada por um trigger BEFORE DELETE, de forma que
-- nenhuma exclusão passe sem rastro (independe do caminho: UI, SQL, etc.).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.crm_sales_lead_deletion_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid,
  funnel_type text,
  stage text,
  legal_name text,
  trade_name text,
  cnpj text,
  estimated_revenue numeric,
  assigned_to uuid,
  lead_created_by uuid,
  lead_created_at timestamptz,
  deleted_by uuid,
  deleted_by_name text,
  deleted_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.crm_sales_lead_deletion_log ENABLE ROW LEVEL SECURITY;

-- Só gestor lê o log (auditoria). Ninguém insere direto: quem grava é o trigger
-- (security definer), que roda com privilégios do owner e ignora o RLS.
DROP POLICY IF EXISTS crm_lead_del_log_select ON public.crm_sales_lead_deletion_log;
CREATE POLICY crm_lead_del_log_select ON public.crm_sales_lead_deletion_log
  FOR SELECT USING (public.crm_is_gestor());

CREATE OR REPLACE FUNCTION public.log_crm_sales_lead_deletion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.crm_sales_lead_deletion_log(
    lead_id, funnel_type, stage, legal_name, trade_name, cnpj,
    estimated_revenue, assigned_to, lead_created_by, lead_created_at,
    deleted_by, deleted_by_name
  ) VALUES (
    OLD.id, OLD.funnel_type, OLD.stage, OLD.legal_name, OLD.trade_name, OLD.cnpj,
    OLD.estimated_revenue, OLD.assigned_to, OLD.created_by, OLD.created_at,
    auth.uid(),
    (SELECT COALESCE(full_name, username) FROM public.profiles WHERE id = auth.uid())
  );
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_crm_sales_lead_deletion ON public.crm_sales_leads;
CREATE TRIGGER trg_log_crm_sales_lead_deletion
  BEFORE DELETE ON public.crm_sales_leads
  FOR EACH ROW EXECUTE FUNCTION public.log_crm_sales_lead_deletion();

NOTIFY pgrst, 'reload schema';
