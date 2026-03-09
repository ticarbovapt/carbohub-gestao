-- Enable realtime for remaining tables (skip carboze_orders as it's already added)
DO $$
BEGIN
    -- Try to add each table, ignore if already exists
    BEGIN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.licensee_requests;
    EXCEPTION WHEN duplicate_object THEN
        NULL;
    END;
    
    BEGIN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.licensee_wallets;
    EXCEPTION WHEN duplicate_object THEN
        NULL;
    END;
    
    BEGIN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.licensee_commissions;
    EXCEPTION WHEN duplicate_object THEN
        NULL;
    END;
END $$;