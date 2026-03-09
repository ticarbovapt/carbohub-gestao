-- Fix Security Definer views by enabling security_invoker
-- This ensures views respect the querying user's RLS policies

ALTER VIEW public.licensees_summary SET (security_invoker = true);
ALTER VIEW public.carboze_orders_secure SET (security_invoker = true);