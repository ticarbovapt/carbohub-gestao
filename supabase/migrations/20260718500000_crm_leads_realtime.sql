-- CRM Kanban ao vivo: publica crm_sales_leads no Realtime para que a
-- movimentação de cards (mudança de stage) apareça em tempo real para todos.
-- (A RLS de crm_sales_leads continua valendo; o Realtime a respeita.)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'crm_sales_leads'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.crm_sales_leads;
  END IF;
END $$;
