-- Adiciona last_synced_at para rastrear ponto de sincronização por plataforma
ALTER TABLE system_tokens ADD COLUMN IF NOT EXISTS last_synced_at timestamptz;
