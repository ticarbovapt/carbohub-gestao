-- Primeiro acesso: substitui o e-mail FALSO (@carbo.internal) pelo e-mail REAL
-- que a pessoa informa no primeiro login, direto em auth.users — assim ela passa
-- a conseguir logar tanto por usuário quanto pelo e-mail real, e o reset de senha
-- por e-mail funciona.
--
-- Por que uma RPC SECURITY DEFINER (e não auth.updateUser({email}) no client):
-- o updateUser dispara o fluxo de "secure email change" do Supabase, que manda
-- link de confirmação para o e-mail ANTIGO (@carbo.internal, inexistente) — então
-- a troca nunca se confirma. Aqui escrevemos direto em auth.users, já confirmado.
--
-- Segurança: a função só altera a linha do PRÓPRIO usuário (auth.uid()); ninguém
-- consegue mexer no e-mail de outra conta.

CREATE OR REPLACE FUNCTION public.set_first_access_email(p_email text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid   uuid := auth.uid();
  v_email text := lower(trim(p_email));
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Não autenticado.';
  END IF;

  -- Validações básicas (espelham o front).
  IF v_email IS NULL OR v_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' THEN
    RAISE EXCEPTION 'E-mail inválido.';
  END IF;
  IF v_email LIKE '%@carbo.internal' THEN
    RAISE EXCEPTION 'Informe um e-mail real (não o interno).';
  END IF;

  -- E-mail já usado por OUTRA conta? (case-insensitive)
  IF EXISTS (
    SELECT 1 FROM auth.users
    WHERE lower(email) = v_email AND id <> v_uid
  ) THEN
    RAISE EXCEPTION 'Este e-mail já está em uso por outra conta.';
  END IF;

  -- Troca o e-mail no Auth, já confirmado, e limpa qualquer troca pendente.
  UPDATE auth.users
  SET email                 = v_email,
      email_confirmed_at    = COALESCE(email_confirmed_at, now()),
      email_change          = '',
      email_change_token_new = '',
      updated_at            = now()
  WHERE id = v_uid;

  -- Reflete no perfil e baixa a flag de primeiro acesso.
  UPDATE public.profiles
  SET email                = v_email,
      password_must_change = false,
      last_access          = now()
  WHERE id = v_uid;
END;
$$;

REVOKE ALL ON FUNCTION public.set_first_access_email(text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.set_first_access_email(text) TO authenticated;
