-- View segura para o frontend verificar status de conexão
-- Expõe apenas se está conectado — nunca os tokens em si
CREATE OR REPLACE VIEW platform_connection_status AS
SELECT
  id          AS platform,
  seller_id,
  CASE
    WHEN access_token IS NOT NULL
     AND (expires_at IS NULL OR expires_at > now())
    THEN true
    ELSE false
  END         AS is_connected,
  updated_at
FROM system_tokens;

GRANT SELECT ON platform_connection_status TO authenticated;
