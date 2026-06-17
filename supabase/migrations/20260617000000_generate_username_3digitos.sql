-- Padroniza generate_username em 3 dígitos SEMPRE + sempre o primeiro número livre.
--
-- Contexto: o OPS tinha usernames legados com 4 dígitos (OPS0002…), o que fazia a
-- detecção automática de "digit_len" continuar gerando 4 dígitos. Após padronizar
-- todos os OPS para 3 dígitos, fixamos 3 dígitos como padrão único.
--
-- Comportamento:
--   • Sempre retorna o MENOR número livre do prefixo (preenche lacunas).
--     Ex.: existe OPS001, OPS006, OPS008 → próximo = OPS002.
--   • Apagar um usuário libera o número (vira lacuna e é reaproveitado).
--   • Formato 3 dígitos (OPS001). Se um dia passar de 999, cresce sozinho (OPS1000)
--     sem truncar — graças ao GREATEST(3, …).

CREATE OR REPLACE FUNCTION public.generate_username(dept_prefix TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  next_seq     INTEGER;
  new_username TEXT;
  prefix_upper TEXT;
  max_seq      INTEGER;
BEGIN
  prefix_upper := UPPER(dept_prefix);

  -- Maior número já usado para o prefixo (aceita 3 ou 4 dígitos por causa de legado misto)
  SELECT COALESCE(MAX(CAST(SUBSTRING(username FROM '\d+$') AS INTEGER)), 0)
  INTO max_seq
  FROM public.profiles
  WHERE LOWER(username) LIKE LOWER(prefix_upper) || '%'
    AND username ~ ('(?i)^' || prefix_upper || '\d{3,4}$');

  -- Menor número livre na faixa 1..(max+1). Checa formato 3 E 4 dígitos
  -- para não colidir com qualquer username legado que ainda exista.
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

  -- Sempre 3 dígitos; cresce sem truncar se algum dia passar de 999.
  new_username := prefix_upper || LPAD(next_seq::TEXT, GREATEST(3, LENGTH(next_seq::TEXT)), '0');

  -- Mantém a tabela de sequências atualizada (só referência/monitoramento;
  -- a escolha do número vem da lacuna acima, não daqui).
  INSERT INTO public.department_username_sequences (department_prefix, last_sequence)
  VALUES (dept_prefix, next_seq)
  ON CONFLICT (department_prefix) DO UPDATE
    SET last_sequence = GREATEST(department_username_sequences.last_sequence, EXCLUDED.last_sequence),
        updated_at    = now();

  RETURN new_username;
END;
$$;
