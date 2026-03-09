
-- Function to look up user email by username (for login)
CREATE OR REPLACE FUNCTION public.get_user_email_by_username(p_username TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_email TEXT;
BEGIN
  -- Find user_id from profiles by username
  SELECT id INTO v_user_id
  FROM public.profiles
  WHERE UPPER(username) = UPPER(p_username)
  LIMIT 1;

  IF v_user_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- Get email from auth.users
  SELECT email INTO v_email
  FROM auth.users
  WHERE id = v_user_id;

  RETURN v_email;
END;
$$;
