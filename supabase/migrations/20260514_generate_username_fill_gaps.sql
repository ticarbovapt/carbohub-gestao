-- Atualiza generate_username para:
-- 1. Preencher lacunas na sequência (OPS0001 + OPS0008 existem → próximo é OPS0002)
-- 2. Detectar o formato de dígitos já usado pelo departamento (3 ou 4) e manter consistência
--    Ex: OPS usa 4 dígitos (OPS0003, OPS0005...) → continua com 4 (OPS0001, OPS0002...)
--        EXP usa 3 dígitos (EXP001, EXP002...) → continua com 3 (EXP003, EXP004...)
--        Novos departamentos sem histórico → default 3 dígitos

CREATE OR REPLACE FUNCTION public.generate_username(dept_prefix TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  next_seq    INTEGER;
  new_username TEXT;
  prefix_upper TEXT;
  max_seq     INTEGER;
  digit_len   INTEGER;
BEGIN
  prefix_upper := UPPER(dept_prefix);

  -- Detecta quantos dígitos o departamento já usa (3 ou 4)
  -- Se existem usernames com 4 dígitos para esse prefixo → usa 4; caso contrário → usa 3
  SELECT
    CASE
      WHEN MAX(LENGTH(username) - LENGTH(prefix_upper)) = 4 THEN 4
      ELSE 3
    END
  INTO digit_len
  FROM public.profiles
  WHERE LOWER(username) LIKE LOWER(prefix_upper) || '%'
    AND username ~ ('(?i)^' || prefix_upper || '\d{3,4}$');

  IF digit_len IS NULL THEN
    digit_len := 3; -- default para departamentos novos sem histórico
  END IF;

  -- Maior número já usado (aceita 3 ou 4 dígitos para cobrir legado misto)
  SELECT COALESCE(MAX(
    CAST(SUBSTRING(username FROM '\d+$') AS INTEGER)
  ), 0)
  INTO max_seq
  FROM public.profiles
  WHERE LOWER(username) LIKE LOWER(prefix_upper) || '%'
    AND username ~ ('(?i)^' || prefix_upper || '\d{3,4}$');

  -- Encontra o menor número disponível na faixa 1..(max+1)
  -- Verifica tanto formato 3 quanto 4 dígitos para evitar colisão com legado misto
  SELECT MIN(s.n) INTO next_seq
  FROM generate_series(1, max_seq + 1) AS s(n)
  WHERE NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE LOWER(username) = LOWER(prefix_upper) || LPAD(s.n::TEXT, 3, '0')
       OR LOWER(username) = LOWER(prefix_upper) || LPAD(s.n::TEXT, 4, '0')
  );

  IF next_seq IS NULL THEN
    next_seq := 1;
  END IF;

  -- Gera com o número de dígitos correto para este departamento
  new_username := prefix_upper || LPAD(next_seq::TEXT, digit_len, '0');

  -- Mantém a tabela de sequências atualizada (para referência/monitoramento)
  INSERT INTO public.department_username_sequences (department_prefix, last_sequence)
  VALUES (dept_prefix, next_seq)
  ON CONFLICT (department_prefix) DO UPDATE
    SET last_sequence = GREATEST(department_username_sequences.last_sequence, EXCLUDED.last_sequence),
        updated_at    = now();

  RETURN new_username;
END;
$$;
