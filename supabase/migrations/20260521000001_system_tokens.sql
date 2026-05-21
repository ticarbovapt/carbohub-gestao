-- system_tokens: stores OAuth tokens for external platform integrations
CREATE TABLE IF NOT EXISTS system_tokens (
  id            text PRIMARY KEY,   -- e.g. 'mercadolivre', 'amazon'
  access_token  text,
  refresh_token text,
  expires_at    timestamptz,
  seller_id     text,               -- platform seller/user ID
  updated_at    timestamptz DEFAULT now()
);

ALTER TABLE system_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_only" ON system_tokens FOR ALL TO service_role USING (true);
