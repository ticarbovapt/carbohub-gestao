-- ─────────────────────────────────────────────────────────────────────────────
-- Versiona os crons de sincronização automática do Bling.
--
-- Estes dois jobs JÁ existiam no Supabase (criados pelo painel), mas não estavam
-- no repositório. Esta migration os define de forma idempotente para que:
--   • sobrevivam a um recreate do banco / novo ambiente;
--   • fiquem documentados e reproduzíveis;
--   • continuem rodando INDEPENDENTE do Carbo Controle (que será desativado).
--
-- O que fazem: chamam a edge function `bling-auto-sync`, que valida o
-- X-Cron-Secret e dispara `bling-sync` com entity=all (puxa TODAS as entidades:
-- produtos, variações, estoque, contatos, pedidos, detalhes, vendedores, NFe,
-- contas a pagar e pedidos de compra).
--
-- Horários (UTC → Brasília, UTC-3):
--   bling-sync-morning    0 10 * * *  → 07:00 BRT
--   bling-sync-afternoon  0 16 * * *  → 13:00 BRT
--
-- ⚠️ SEGREDO: o X-Cron-Secret abaixo DEVE ser igual ao env BLING_CRON_SECRET da
-- function `bling-auto-sync`. Se rotacionar o segredo, atualize NOS DOIS lugares
-- (env da function + este arquivo) e rode a migration novamente.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Remove versões anteriores (por nome) para evitar duplicação ao reaplicar.
DO $$
DECLARE
  j record;
BEGIN
  FOR j IN
    SELECT jobid FROM cron.job
    WHERE jobname IN ('bling-sync-morning', 'bling-sync-afternoon')
  LOOP
    PERFORM cron.unschedule(j.jobid);
  END LOOP;
END $$;

-- 07:00 BRT (10:00 UTC)
SELECT cron.schedule(
  'bling-sync-morning',
  '0 10 * * *',
  $cmd$
  SELECT net.http_post(
    url     := 'https://wpkfirmapxevzpxjovjr.supabase.co/functions/v1/bling-auto-sync',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'X-Cron-Secret', '73d61bd6-d915-4fda-bc25-5dba124d593d'
    ),
    body    := '{"entity":"all","source":"cron"}'::jsonb
  ) AS request_id;
  $cmd$
);

-- 13:00 BRT (16:00 UTC)
SELECT cron.schedule(
  'bling-sync-afternoon',
  '0 16 * * *',
  $cmd$
  SELECT net.http_post(
    url     := 'https://wpkfirmapxevzpxjovjr.supabase.co/functions/v1/bling-auto-sync',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'X-Cron-Secret', '73d61bd6-d915-4fda-bc25-5dba124d593d'
    ),
    body    := '{"entity":"all","source":"cron"}'::jsonb
  ) AS request_id;
  $cmd$
);
