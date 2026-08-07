-- ═══════════════════════════════════════════════════════════════════════════
-- Agendamento da coleta de rastreio
--
-- De hora em hora, no minuto 5. Transportadora não bipa de dez em dez minutos:
-- um envio muda de estado duas ou três vezes por DIA. Consultar de hora em hora
-- já mostra a movimentação no mesmo turno em que ela acontece, e a fila tem teto
-- de 60 códigos por rodada — 60 por hora contra ~130 envios abertos é folga
-- larga, porque quem já chegou sai da fila para sempre.
--
-- O Mercado Envios NÃO entra aqui: o `ecommerce-sync` roda a cada 15 minutos,
-- já chama `/shipments/{id}` e agora grava o rastreio junto. Uma segunda
-- chamada seria token gasto duas vezes para o mesmo dado.
--
-- ── O segredo ─────────────────────────────────────────────────────────────
--
-- O cron do Bling 2 (`20260838000000`) carrega o `X-Cron-Secret` em texto puro
-- dentro do arquivo, versionado no GitHub. Aqui não: o valor sai de
-- `private.cron_config`, que a migração anterior criou sem grant para ninguém.
-- Quem insere é você, no SQL Editor, e ele nunca passa pelo repositório.
--
-- ANTES de rodar este arquivo, rode uma vez (trocando pelo seu valor, o mesmo
-- que você vai pôr no secret CRON_SECRET da edge function):
--
--   insert into private.cron_config (chave, valor)
--   values ('rastreio_cron_secret', 'COLE-AQUI-UM-VALOR-ALEATORIO')
--   on conflict (chave) do update set valor = excluded.valor;
--
-- Sem isso o agendamento entra, mas a função responde 401 — e responde ALTO,
-- com mensagem no corpo, em vez de falhar em silêncio.
-- ═══════════════════════════════════════════════════════════════════════════

do $$
declare
  v_segredo text;
begin
  select valor into v_segredo
  from private.cron_config
  where chave = 'rastreio_cron_secret';

  if v_segredo is null then
    raise exception
      'Falta o segredo. Rode primeiro: insert into private.cron_config (chave, valor) values (''rastreio_cron_secret'', ''<seu-valor>'');';
  end if;

  perform cron.unschedule(jobid)
  from cron.job where jobname = 'rastreio-sync-hora';

  perform cron.schedule(
    'rastreio-sync-hora',
    '5 * * * *',
    format($cmd$
      select net.http_post(
        url     := 'https://wpkfirmapxevzpxjovjr.supabase.co/functions/v1/rastreio-sync',
        headers := jsonb_build_object(
          'Content-Type',  'application/json',
          'X-Cron-Secret', %L
        ),
        body    := '{"source":"cron"}'::jsonb
      ) as request_id;
    $cmd$, v_segredo)
  );
end $$;


-- ═══════════════════════════════════════════════════════════════════════════
-- Conferência
-- ═══════════════════════════════════════════════════════════════════════════

-- O job tem de existir e estar ativo.
select jobid, jobname, schedule, active from cron.job where jobname = 'rastreio-sync-hora';

-- Depois da primeira rodada (minuto 5 da próxima hora): quantos códigos
-- entraram, por fonte, e quantos ficaram com erro escrito.
select fonte,
       count(*)                                   as envios,
       count(*) filter (where erro is not null)   as com_erro,
       count(*) filter (where status = 'entregue') as entregues,
       sum((select count(*) from public.rastreio_eventos v where v.codigo = e.codigo)) as eventos
from public.rastreio_envios e
group by fonte;

-- Se algo deu errado, o motivo está escrito — não é preciso ler log.
select codigo, transportadora, erro, consultado_em
from public.rastreio_envios
where erro is not null
order by consultado_em desc
limit 20;
