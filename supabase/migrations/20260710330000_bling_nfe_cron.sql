-- ─────────────────────────────────────────────────────────────────────────────
-- Sync AUTOMÁTICO de NF-e — sem botão, sem humano.
--
-- A bling-auto-sync (crons das 07:00/13:00) NÃO roda `nfe` de propósito: NF-e
-- faz 1 chamada por nota (lento) e travaria o pipeline dela. Por isso o NF-e
-- nunca sincronizava sozinho, e as notas ficavam "Sem NF" nos pedidos.
--
-- Aqui damos a "rotina própria" que o comentário da função pedia: um cron
-- dedicado que chama a bling-sync com entity=nfe direto (bypass de JWT via
-- X-Cron-Secret). Ele faz lista + detalhe (informacoesAdicionais) + o CASAMENTO
-- pedido↔NF (matchNFesToOrders) — então as vendas do sistema (V…) passam a
-- mostrar a NF vinculada sozinhas. O financeiro não clica em nada.
--
-- Frequência: a cada 2 horas. Em regime, cada run é leve (só notas novas +
-- casamento); o detalhe é capado em 150/execução, então o histórico é
-- enriquecido em rodadas sem estourar tempo.
--
-- OBS: pg_cron/pg_net JÁ estão instalados (os crons existentes usam). NÃO usar
-- CREATE EXTENSION aqui — re-criar dispara o after-create com grants que
-- conflitam no Supabase ("dependent privileges exist").
--
-- ⚠️ X-Cron-Secret DEVE ser igual ao env CRON_SECRET da function bling-sync
-- (mesmo segredo já usado pelos crons existentes). Se rotacionar, atualize aqui.
-- ─────────────────────────────────────────────────────────────────────────────

-- Remove versão anterior (por nome) para não duplicar ao reaplicar.
DO $$
DECLARE j record;
BEGIN
  FOR j IN SELECT jobid FROM cron.job WHERE jobname = 'bling-nfe-sync' LOOP
    PERFORM cron.unschedule(j.jobid);
  END LOOP;
END $$;

-- A cada 2 horas: sincroniza NF-e + casa com os pedidos.
SELECT cron.schedule(
  'bling-nfe-sync',
  '0 */2 * * *',
  $cmd$
  SELECT net.http_post(
    url     := 'https://wpkfirmapxevzpxjovjr.supabase.co/functions/v1/bling-sync',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'X-Cron-Secret', '73d61bd6-d915-4fda-bc25-5dba124d593d'
    ),
    body    := '{"entity":"nfe","source":"cron"}'::jsonb
  ) AS request_id;
  $cmd$
);

-- Dispara UMA vez agora (pra não esperar o próximo slot de 2h e já vincular tudo).
SELECT net.http_post(
  url     := 'https://wpkfirmapxevzpxjovjr.supabase.co/functions/v1/bling-sync',
  headers := jsonb_build_object(
    'Content-Type',  'application/json',
    'X-Cron-Secret', '73d61bd6-d915-4fda-bc25-5dba124d593d'
  ),
  body    := '{"entity":"nfe","source":"cron"}'::jsonb
);
