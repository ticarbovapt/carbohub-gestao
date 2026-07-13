-- Novo funil f9 = Subdistribuidor (mesma lógica/etapas do PDV CarboZé).
-- A coluna crm_leads.funnel_type tem um CHECK que só aceitava f1..f8; sem
-- ampliar, criar/mover lead pro funil Subdistribuidor falharia no banco.

DO $$
DECLARE cname text;
BEGIN
  -- Descobre o nome do CHECK atual da coluna (foi criado inline, sem nome fixo).
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
  CHECK (funnel_type IN ('f1', 'f2', 'f3', 'f4', 'f5', 'f6', 'f7', 'f8', 'f9'));
