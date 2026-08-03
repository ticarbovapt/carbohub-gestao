-- ═══════════════════════════════════════════════════════════════════════════
-- Bling 2 — sincronização automática
--
-- ⚠️ RODE ESTE ARQUIVO SÓ DEPOIS DE CONECTAR a segunda conta em
-- /integracoes/bling2. Antes disso, cada disparo só grava
-- "Bling 2 não conectado" no `bling2_sync_log` — não quebra nada, mas polui.
--
-- Horários escolhidos para NÃO colidir com os crons do Bling 1 (10:00 e 16:00
-- UTC) nem com o de NF-e. Duas contas puxando ao mesmo tempo competem pelo
-- mesmo teto de 3 req/s? Não — o limite do Bling é por aplicativo, e são apps
-- diferentes. O motivo de separar é outro: função concorrente disputando CPU
-- do mesmo projeto Supabase, e log misturado quando algo dá errado.
--
-- Divisão em dois jobs, por peso:
--   • rápido (11:30 UTC / 08:30 BRT): listagens paginadas.
--   • pesado (17:30 UTC / 14:30 BRT): `order_details` e `nfe` fazem UMA
--     chamada à API POR REGISTRO. Rodar junto com o resto estoura o tempo da
--     função e mata as fases seguintes no meio — foi o que aconteceu no
--     Bling 1, e é por isso que lá o `nfe` também ficou de fora do "all".
--
-- ⚠️ O X-Cron-Secret abaixo é o MESMO já usado pelos crons do Bling 1 e tem
-- de bater com o env CRON_SECRET da function `bling2-auto-sync`. Se rotacionar,
-- atualize nos dois lugares.
-- ═══════════════════════════════════════════════════════════════════════════

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net  with schema extensions;

-- Idempotente: remove versões anteriores pelo nome antes de reagendar.
do $$
declare j record;
begin
  for j in
    select jobid from cron.job
    where jobname in ('bling2-sync-rapido', 'bling2-sync-pesado')
  loop
    perform cron.unschedule(j.jobid);
  end loop;
end $$;

-- 08:30 BRT — listagens (rápidas)
select cron.schedule(
  'bling2-sync-rapido',
  '30 11 * * *',
  $cmd$
  select net.http_post(
    url     := 'https://wpkfirmapxevzpxjovjr.supabase.co/functions/v1/bling2-auto-sync',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'X-Cron-Secret', '73d61bd6-d915-4fda-bc25-5dba124d593d'
    ),
    body    := '{"source":"cron","fases":["products","variacoes","stock","contacts","vendedores","orders","contas_pagar","contas_receber","pedidos_compra"]}'::jsonb
  ) as request_id;
  $cmd$
);

-- 14:30 BRT — detalhe item a item (lentas, com teto por execução)
select cron.schedule(
  'bling2-sync-pesado',
  '30 17 * * *',
  $cmd$
  select net.http_post(
    url     := 'https://wpkfirmapxevzpxjovjr.supabase.co/functions/v1/bling2-auto-sync',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'X-Cron-Secret', '73d61bd6-d915-4fda-bc25-5dba124d593d'
    ),
    body    := '{"source":"cron","fases":["order_details","nfe"]}'::jsonb
  ) as request_id;
  $cmd$
);


-- ── Conferência ───────────────────────────────────────────────────────────

-- (a) Os dois jobs entraram, e os do Bling 1 continuam de pé?
select jobname, schedule, active
from cron.job
where jobname like 'bling%'
order by jobname;

-- (b) Depois do primeiro disparo: como foi cada fase.
select entity_type, status, records_synced, records_failed,
       error_message, started_at
from public.bling2_sync_log
order by started_at desc
limit 20;
