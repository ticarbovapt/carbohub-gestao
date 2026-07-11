-- ─────────────────────────────────────────────────────────────────────────────
-- Reagenda o sync automático de NF-e: de 2 em 2 horas → DE HORA EM HORA.
--
-- Motivo: o sistema passou a ter uso ao vivo (vendas + faturamento acontecendo
-- durante o dia). A cada 2h a NF podia demorar até 2 horas pra aparecer vinculada
-- ao pedido. De hora em hora deixa a visualização quase ao vivo — e, como o
-- backfill do histórico já foi feito, cada rodada em regime é leve (só NFs novas
-- + casamento), então aumentar a frequência não pesa na API do Bling.
--
-- Para latência ZERO num caso específico, abrir/baixar a NF no Finanças/Sales já
-- dispara o vínculo na hora (edge function bling-sync, entity nfe_links).
--
-- ⚠️ X-Cron-Secret DEVE ser igual ao env CRON_SECRET da function bling-sync.
-- ─────────────────────────────────────────────────────────────────────────────

-- Remove o agendamento anterior (por nome) para não duplicar.
DO $$
DECLARE j record;
BEGIN
  FOR j IN SELECT jobid FROM cron.job WHERE jobname = 'bling-nfe-sync' LOOP
    PERFORM cron.unschedule(j.jobid);
  END LOOP;
END $$;

-- De hora em hora: sincroniza NF-e + casa com os pedidos.
SELECT cron.schedule(
  'bling-nfe-sync',
  '0 * * * *',
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
