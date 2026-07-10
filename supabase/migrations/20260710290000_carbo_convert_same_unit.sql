-- carbo_convert_unit: mesma unidade (inclusive desconhecida, ex.: cx→cx) = 1:1.
-- Antes retornava NULL para unidades fora da tabela, e o fallback das funções de
-- estoque deduzia o número cru — ok para cx→cx (1:1) mas mascarava dimensão
-- incompatível. Agora só retorna NULL quando as dimensões realmente divergem.
CREATE OR REPLACE FUNCTION public.carbo_convert_unit(p_qty numeric, p_from text, p_to text)
RETURNS numeric LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  f text := lower(trim(coalesce(p_from, '')));
  t text := lower(trim(coalesce(p_to, '')));
  fb numeric; tb numeric; fd text; td text;
BEGIN
  IF f = t THEN RETURN p_qty; END IF;   -- mesma unidade → 1:1
  CASE f
    WHEN 'ml' THEN fb := 0.001; fd := 'vol';
    WHEN 'l'  THEN fb := 1;     fd := 'vol';
    WHEN 'g'  THEN fb := 0.001; fd := 'mass';
    WHEN 'kg' THEN fb := 1;     fd := 'mass';
    WHEN 'un' THEN fb := 1;     fd := 'count';
    ELSE fb := NULL; fd := NULL;
  END CASE;
  CASE t
    WHEN 'ml' THEN tb := 0.001; td := 'vol';
    WHEN 'l'  THEN tb := 1;     td := 'vol';
    WHEN 'g'  THEN tb := 0.001; td := 'mass';
    WHEN 'kg' THEN tb := 1;     td := 'mass';
    WHEN 'un' THEN tb := 1;     td := 'count';
    ELSE tb := NULL; td := NULL;
  END CASE;
  IF fb IS NULL OR tb IS NULL OR fd <> td THEN RETURN NULL; END IF;
  RETURN (p_qty * fb) / tb;
END $$;
