CREATE OR REPLACE FUNCTION public.get_user_email_by_username(p_username text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email text;
BEGIN
  SELECT email INTO v_email
  FROM public.profiles
  WHERE LOWER(username) = LOWER(p_username)
  LIMIT 1;
  
  RETURN v_email;
END;
$$;