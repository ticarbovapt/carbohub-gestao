
-- Fix remaining functions without search_path

CREATE OR REPLACE FUNCTION public.validate_rc_status()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = 'public'
AS $$
BEGIN
  IF NEW.status NOT IN ('rascunho','em_cotacao','em_analise_ia','aguardando_aprovacao','aprovada','rejeitada','convertida_pc') THEN
    RAISE EXCEPTION 'Status RC inválido: %', NEW.status;
  END IF;
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_carbovapt_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = 'public'
AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE OR REPLACE FUNCTION public.calculate_licensee_level(_score numeric)
RETURNS public.licensee_level
LANGUAGE sql
IMMUTABLE
SET search_path = 'public'
AS $$
    SELECT CASE
        WHEN _score >= 90 THEN 'diamante'::public.licensee_level
        WHEN _score >= 70 THEN 'ouro'::public.licensee_level
        WHEN _score >= 50 THEN 'prata'::public.licensee_level
        ELSE 'bronze'::public.licensee_level
    END
$$;
