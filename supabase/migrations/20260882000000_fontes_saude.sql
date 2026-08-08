-- ═══════════════════════════════════════════════════════════════════════════
-- Alarme de fonte parada — o buraco que custou 25 horas
--
-- ── O que aconteceu ───────────────────────────────────────────────────────
--
-- Os dois espelhos do Bling ficaram 25 horas sem gravar nada. Oito jobs no
-- `pg_cron` marcados `succeeded` o tempo todo, porque `net.http_post` é
-- assíncrono: o sucesso dele é ter POSTADO, não a resposta ter sido 200. Os
-- 401 só existiam em `net._http_response`, que ninguém abre.
--
-- Ninguém percebeu. A descoberta foi por acaso, ao estranhar cinco pedidos que
-- não apareciam na esteira. Agora que cada etapa dispara mensagem para cliente,
-- silêncio de 25 horas não é atraso de painel: é um dia inteiro de gente sem
-- receber "seu pedido saiu para entrega".
--
-- ── Por que NÃO medir pelo cron ───────────────────────────────────────────
--
-- A tentação é olhar `cron.job_run_details`. Foi exatamente ele que mentiu
-- durante um dia inteiro. Um alarme construído sobre a mesma fonte que falhou
-- em silêncio herda o silêncio.
--
-- ── Por que NÃO medir pelo dado ───────────────────────────────────────────
--
-- A segunda tentação é olhar a última venda gravada. Também erra, só que para
-- o outro lado: às três da manhã não há venda nenhuma, e um alarme que grita
-- toda madrugada é um alarme que a equipe aprende a ignorar — e aí ele não
-- serve nem no dia em que estiver certo.
--
-- ── O que medir, então ────────────────────────────────────────────────────
--
-- A RODADA, não o resultado dela. As duas contas do Bling gravam em
-- `bling_sync_log` / `bling2_sync_log` a cada execução, com ou sem novidade. O
-- `ecommerce-sync` carimba `system_tokens.last_synced_at` no fim de toda
-- passagem, mesmo sem pedido novo. Esses três dizem "eu rodei" — que é a
-- pergunta.
--
-- ⚠️ O rastreio é o único que fica de fora dessa garantia: ele só carimba
-- `consultado_em` nos envios que consultou, e sem envio em trânsito não
-- carimba nada. Por isso a tolerância dele é folgada e a observação diz isso
-- em voz alta, em vez de fingir uma precisão que não existe.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace view public.fontes_saude
with (security_invoker = true) as
with medidas as (
  select
    'Bling 2 (espelho do on-line)'::text as fonte,
    (select max(started_at) from public.bling2_sync_log
      where entity_type in ('orders_recente', 'nfe_recente'))   as ultima,
    10                                                          as limite_min,
    'roda a cada minuto; grava log mesmo sem pedido novo'::text as observacao

  union all
  select
    'Bling 1 (espelho do interno)',
    (select max(started_at) from public.bling_sync_log),
    -- Duas rodadas por dia (07h e 13h) + a de NF de hora em hora. 26 horas dá
    -- folga para uma rodada perdida sem gritar por causa de fuso ou feriado.
    26 * 60,
    'duas rodadas por dia — 26h é uma rodada perdida, não um soluço'

  union all
  select
    'Plataformas (envio e entrega)',
    (select max(last_synced_at) from public.system_tokens where id = 'nuvemshop'),
    20,
    'carimbado no fim de toda passagem, mesmo sem pedido novo'

  union all
  select
    'Rastreio (transportadoras)',
    (select max(consultado_em) from public.rastreio_envios),
    -- ⚠️ Folgado de propósito: só anda quando existe envio para consultar.
    -- Fim de semana sem despacho deixa este relógio parado sem nada de errado.
    24 * 60,
    'só carimba quando há envio em trânsito — pode parar sem defeito'
)
select
  fonte,
  ultima                                                    as ultima_rodada,
  case when ultima is null then null
       else (extract(epoch from (now() - ultima))::bigint / 60) end as minutos,
  limite_min,
  -- Nulo NÃO é atraso: fonte que nunca rodou é fonte nova, não fonte quebrada.
  -- Tratar os dois como o mesmo alarme faria a tela nascer vermelha.
  coalesce(ultima < now() - make_interval(mins => limite_min), false) as atrasada,
  observacao
from medidas;

comment on view public.fontes_saude is
  'Uma linha por fonte que alimenta a esteira, com a última RODADA (não a última venda) e se ela passou do limite. Mede execução, não resultado: cron.job_run_details mente (net.http_post é assíncrono) e "última venda" dá falso alarme de madrugada.';


-- ═══════════════════════════════════════════════════════════════════════════
-- Conferência
-- ═══════════════════════════════════════════════════════════════════════════

select fonte, ultima_rodada, minutos, limite_min, atrasada, observacao
from public.fontes_saude
order by atrasada desc, minutos desc nulls last;
