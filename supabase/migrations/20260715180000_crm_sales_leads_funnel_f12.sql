-- ─────────────────────────────────────────────────────────────────────────────
-- CORREÇÃO: o pipeline do Carbo Sales usa `crm_sales_leads` (NÃO `crm_leads`).
-- Essa tabela foi criada com `like public.crm_leads including all`, então copiou
-- o CHECK de funnel_type vigente na época (f1..f8) — e nunca foi ampliado. Logo
-- criar lead em f9/f10/f11/f12 no Sales falhava. Amplia o CHECK para f1..f12.
-- (A migração 20260715170000 ampliou por engano o `crm_leads`; esta corrige o alvo.)
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE cname text;
BEGIN
  SELECT conname INTO cname
  FROM pg_constraint
  WHERE conrelid = 'public.crm_sales_leads'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%funnel_type%';
  IF cname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.crm_sales_leads DROP CONSTRAINT %I', cname);
  END IF;
END $$;

ALTER TABLE public.crm_sales_leads
  ADD CONSTRAINT crm_sales_leads_funnel_type_check
  CHECK (funnel_type IN ('f1','f2','f3','f4','f5','f6','f7','f8','f9','f10','f11','f12'));

NOTIFY pgrst, 'reload schema';
