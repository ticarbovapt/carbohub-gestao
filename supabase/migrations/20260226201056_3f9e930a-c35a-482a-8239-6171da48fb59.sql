
-- Update the validate_order_point_type function to accept new point types
CREATE OR REPLACE FUNCTION public.validate_order_point_type()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.point_type IS NOT NULL AND NEW.point_type NOT IN ('posto', 'oficina', 'frota', 'pdv', 'licenciado', 'pap', 'consultor_tecnico') THEN
    RAISE EXCEPTION 'Tipo de ponto inválido: %', NEW.point_type;
  END IF;
  IF NEW.internal_classification IS NOT NULL AND NEW.internal_classification NOT IN ('lead', 'pdv', 'licenciado') THEN
    RAISE EXCEPTION 'Classificação interna inválida: %', NEW.internal_classification;
  END IF;
  RETURN NEW;
END;
$function$;
