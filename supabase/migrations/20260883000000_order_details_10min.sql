-- ═══════════════════════════════════════════════════════════════════════════
-- O elo que faltava: `order_details` rodava 1× por dia
--
-- ── O sintoma ─────────────────────────────────────────────────────────────
--
-- Pedidos parados em "Confirmado" com a nota já emitida no Bling. O degrau era
-- exato, e denunciava a causa sozinho:
--
--   09/08   14 pedidos   14 sem detalhe   ← nenhum viu o job pesado ainda
--   08/08   15 pedidos    3 sem detalhe   ← os que caíram depois das 14:30
--   07/08 e antes        0 sem detalhe
--
-- ── A cadeia ──────────────────────────────────────────────────────────────
--
--   order_details → raw_detalhe → nf_bling_id (coluna GERADA de
--                                 raw_detalhe->notaFiscal->id)
--                               → join com bling2_nfe → etapa 'nf_emitida'
--
-- A LISTAGEM não traz o detalhe: `upsertPedidoDaLista` grava `raw_data` e
-- deliberadamente não toca em `items`/`raw_detalhe`, para não apagar o que o
-- detalhe preencheu. Então sem `order_details` não existe `nf_bling_id`, e a
-- nota chega ao espelho ÓRFÃ — sem pedido a que se ligar.
--
-- Quando os crons foram apertados para um minuto, as fases foram replicadas
-- como estavam (`orders_recente`, `nfe_recente`) sem conferir se fechavam a
-- cadeia. Não fechavam. Todo o resto ficou ao vivo e esta etapa continuou
-- rodando uma vez por dia, às 14:30 — um pedido das 15h esperava 23 horas.
--
-- ── Por que um job separado, e não mais uma fase no de um minuto ──────────
--
-- `order_details` é UMA CHAMADA À API POR PEDIDO, com teto de 60 e ~70s de
-- duração. Num cron de um minuto as rodadas se atropelariam: duas execuções
-- simultâneas pegariam os mesmos 60 pedidos e dobrariam as chamadas ao Bling.
-- Dez minutos deixa margem de sobra até para o dia em que a API estiver lenta.
--
-- ── Por que isto não atropela o job de um minuto ──────────────────────────
--
-- Conferido coluna a coluna, e é o ponto que torna a mudança segura:
--
--   orders_recente (1 min)   upsert SEM items, observacoes, raw_detalhe
--   order_details  (10 min)  update SÓ de items, observacoes, raw_detalhe
--
-- Conjuntos disjuntos. Rodam ao mesmo tempo sem se sobrescrever.
--
-- ── E o custo é proporcional ao trabalho ──────────────────────────────────
--
-- A fila (`items is null or raw_detalhe is null`) hoje tem 17 pedidos, todos
-- dos últimos dias. A primeira rodada limpa tudo; depois disso, rodada sem
-- pendência é uma consulta ao banco e sai — zero chamada de API.
--
-- ⚠️ Minuto 3, não 0. O `bling-nfe-sync` do Bling 1 roda no minuto :00 e é o
-- job pesado da casa. Deslocar em três minutos custa nada e evita que os dois
-- pesados disputem o mesmo instante seis vezes por hora.
-- ═══════════════════════════════════════════════════════════════════════════

do $$
declare v_seg text;
begin
  select valor into v_seg
  from private.cron_config where chave = 'rastreio_cron_secret';

  if v_seg is null then
    raise exception 'Falta o segredo em private.cron_config (chave rastreio_cron_secret).';
  end if;

  perform cron.schedule(
    'bling2-order-details-10min', '3-59/10 * * * *',
    format($cmd$
      select net.http_post(
        url     := 'https://wpkfirmapxevzpxjovjr.supabase.co/functions/v1/bling2-auto-sync',
        headers := jsonb_build_object('Content-Type','application/json','X-Cron-Secret', %L),
        body    := '{"source":"cron-detalhe","fases":["order_details"]}'::jsonb,
        timeout_milliseconds := 30000
      );
    $cmd$, v_seg)
  );
end $$;


-- ═══════════════════════════════════════════════════════════════════════════
-- Conferência
-- ═══════════════════════════════════════════════════════════════════════════

-- (a) O job entrou, e o pesado das 14:30 continua de pé (ele cuida do
--     histórico antigo e da fase `nfe`, que esta aqui não cobre).
select jobname, schedule, active
from cron.job
where jobname like 'bling2%'
order by jobname;

-- (b) Em ~10 minutos: a fila tem de ir a zero.
select count(*) as fila_order_details
from public.bling2_orders
where items is null or raw_detalhe is null;

-- (c) E os 17 têm de sair de "Confirmado". Espere também um ciclo do
--     `nfe_recente` (1 min) para a nota estar no espelho.
select etapa, count(*) as pedidos
from public.bling2_esteira
where data_pedido > current_date - 7
group by 1
order by 2 desc;

-- (d) A rodada nova aparece no log com nome próprio.
select entity_type, status, records_synced, records_failed, started_at, finished_at
from public.bling2_sync_log
where entity_type = 'order_details'
order by started_at desc
limit 5;
