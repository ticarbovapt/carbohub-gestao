CREATE OR REPLACE FUNCTION public.get_user_email_by_username(p_username text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid;
  v_email text;
BEGIN
  -- Get user_id from profiles
  SELECT id INTO v_user_id
  FROM public.profiles
  WHERE LOWER(username) = LOWER(p_username)
  LIMIT 1;
  
  IF v_user_id IS NULL THEN
    RETURN NULL;
  END IF;
  
  -- Get email from auth.users
  SELECT au.email INTO v_email
  FROM auth.users au
  WHERE au.id = v_user_id;
  
  RETURN v_email;
END;
$function$;