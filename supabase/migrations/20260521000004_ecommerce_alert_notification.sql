-- RPC seguro para inserir alertas de desconexão de e-commerce
-- SECURITY DEFINER bypassa RLS — qualquer usuário autenticado pode chamar
CREATE OR REPLACE FUNCTION public.notify_ecommerce_disconnected(
  p_user_id   uuid,
  p_platform  text,
  p_title     text,
  p_body      text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO notifications (user_id, type, title, body, reference_type, reference_id)
  VALUES (p_user_id, 'ecommerce_disconnected', p_title, p_body, 'ecommerce_platform', p_platform)
  ON CONFLICT DO NOTHING;
END;
$$;

GRANT EXECUTE ON FUNCTION public.notify_ecommerce_disconnected TO authenticated;
