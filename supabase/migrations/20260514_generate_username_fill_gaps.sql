-- Atualiza generate_username para preencher lacunas na sequência
-- Em vez de apenas incrementar, busca o menor número disponível para o prefixo
-- Ex: se existem OPS0001 e OPS0008, o próximo será OPS0002 (preenche lacuna)

CREATE OR REPLACE FUNCTION public.generate_username(dept_prefix TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  next_seq  INTEGER;
  new_username TEXT;
  prefix_upper TEXT;
  max_seq   INTEGER;
BEGIN
  prefix_upper := UPPER(dept_prefix);

  -- Descobre o maior número já usado (para limitar o generate_series)
  SELECT COALESCE(MAX(
    CAST(SUBSTRING(username FROM '\d+$') AS INTEGER)
  ), 0)
  INTO max_seq
  FROM public.profiles
  WHERE LOWER(username) LIKE LOWER(prefix_upper) || '%'
    AND username ~ ('(?i)^' || prefix_upper || '\d{4}$');

  -- Encontra o menor número disponível na faixa 1..(max+1)
  SELECT MIN(s.n) INTO next_seq
  FROM generate_series(1, max_seq + 1) AS s(n)
  WHERE NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE LOWER(username) = LOWER(prefix_upper) || LPAD(s.n::TEXT, 4, '0')
  );

  IF next_seq IS NULL THEN
    next_seq := 1;
  END IF;

  new_username := prefix_upper || LPAD(next_seq::TEXT, 4, '0');

  -- Mantém a tabela de sequências atualizada (para referência/monitoramento)
  INSERT INTO public.department_username_sequences (department_prefix, last_sequence)
  VALUES (dept_prefix, next_seq)
  ON CONFLICT (department_prefix) DO UPDATE
    SET last_sequence = GREATEST(department_username_sequences.last_sequence, EXCLUDED.last_sequence),
        updated_at    = now();

  RETURN new_username;
END;
$$;
