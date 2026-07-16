-- ─────────────────────────────────────────────────────────────────────────────
-- Novos funis do CRM: f10 Follow up, f11 Inbound, f12 Outbound.
-- A coluna crm_leads.funnel_type tem um CHECK (f1..f9); amplia para f1..f12.
-- (stage é texto livre, sem CHECK — os estágios novos não precisam de migração.)
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE cname text;
BEGIN
  SELECT conname INTO cname
  FROM pg_constraint
  WHERE conrelid = 'public.crm_leads'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%funnel_type%';
  IF cname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.crm_leads DROP CONSTRAINT %I', cname);
  END IF;
END $$;

ALTER TABLE public.crm_leads
  ADD CONSTRAINT crm_leads_funnel_type_check
  CHECK (funnel_type IN ('f1','f2','f3','f4','f5','f6','f7','f8','f9','f10','f11','f12'));

NOTIFY pgrst, 'reload schema';
