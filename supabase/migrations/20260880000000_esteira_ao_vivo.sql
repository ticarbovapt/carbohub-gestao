-- ═══════════════════════════════════════════════════════════════════════════
-- A esteira ao vivo — porque agora ela dispara mensagem para cliente
--
-- ── O que muda o cálculo ──────────────────────────────────────────────────
--
-- Enquanto a esteira era um painel para olhar, meia hora de atraso era
-- irrelevante: ninguém fica encarando a tela esperando um card mudar de
-- coluna. A partir do momento em que cada mudança de etapa MANDA UMA MENSAGEM,
-- o atraso deixa de ser estético. "Seu pedido saiu para entrega" chegando
-- quarenta minutos depois do fato é pior do que não chegar — o cliente já
-- recebeu o pacote quando o WhatsApp toca.
--
-- E o atraso não era de um lugar só; era a SOMA de quatro filas em série:
--
--   bling2-sync-incremental   */30      0–30 min
--   bling2-bridge             :25,:55  +0–30 min (dez min depois do sync)
--   rastreio-sync-hora        :05       0–60 min
--   kanban-n8n-10min          */10     +0–10 min
--
-- Pior caso somado: mais de uma hora. Cada um parecia razoável sozinho, e é
-- assim que uma latência dessas se esconde — ninguém mede a série.
--
-- ── Por que isto não vai derrubar nada ────────────────────────────────────
--
-- A rodada incremental do Bling 2 é barata POR CONSTRUÇÃO: listagem filtrada
-- por data, teto de 5 páginas e no máximo 40 detalhes. Em minuto sem venda ela
-- lista uma página vazia e sai. O limite do Bling é 3 req/s e 120 mil/dia;
-- 1440 rodadas de meia dúzia de chamadas ficam uma ordem de grandeza abaixo.
--
-- ⚠️ A escolha original de :15/:45 existia para NÃO colidir com o
-- `bling-nfe-sync` do Bling 1, que roda no minuto :00 e é o job pesado. Rodando
-- a cada minuto a colisão volta — uma vez por hora, entre um job pesado e um
-- leve. É um preço consciente, não um esquecimento.
--
-- ── O `timeout_milliseconds` não é detalhe ────────────────────────────────
--
-- O padrão do `net.http_post` é 5 segundos, e foi ele que fez o cron do Bling 1
-- reportar "Timeout of 5000 ms" para sempre — a função demora mais que isso
-- para responder. Todos os disparos daqui saem com prazo explícito.
--
-- ── E os nomes deixam de mentir ───────────────────────────────────────────
--
-- `kanban-n8n-10min` rodando a cada minuto e `rastreio-sync-hora` a cada cinco
-- seriam duas armadilhas plantadas para quem for depurar isto daqui a seis
-- meses. Os jobs são recriados com nome novo e os antigos, removidos.
-- ═══════════════════════════════════════════════════════════════════════════

do $$
declare
  v_seg text;
  r     record;
begin
  select valor into v_seg
  from private.cron_config where chave = 'rastreio_cron_secret';

  if v_seg is null then
    raise exception 'Falta o segredo em private.cron_config (chave rastreio_cron_secret).';
  end if;

  -- Fora os que mudam de nome, para não sobrar job duplicado disparando junto.
  for r in
    select jobname from cron.job
    where jobname in ('rastreio-sync-hora', 'kanban-n8n-10min')
  loop
    perform cron.unschedule(r.jobname);
    raise notice 'removido: %', r.jobname;
  end loop;

  -- ── 1. Espelho do Bling 2: a cada minuto ───────────────────────────────
  perform cron.schedule(
    'bling2-sync-incremental', '* * * * *',
    format($cmd$
      select net.http_post(
        url     := 'https://wpkfirmapxevzpxjovjr.supabase.co/functions/v1/bling2-auto-sync',
        headers := jsonb_build_object('Content-Type','application/json','X-Cron-Secret', %L),
        body    := '{"source":"cron-incremental","fases":["orders_recente","nfe_recente"]}'::jsonb,
        timeout_milliseconds := 30000
      );
    $cmd$, v_seg)
  );

  -- ── 2. Ponte para o faturamento: a cada 2 minutos ──────────────────────
  --
  -- É SQL puro (banco→banco), então não tem custo de rede nem de API. O que
  -- ela precisa é rodar DEPOIS do sync, e a cada 2 minutos isso é garantido
  -- por frequência, sem depender do desencontro de horário que a versão
  -- ":25/:55, dez minutos depois" usava.
  perform cron.schedule(
    'bling2-bridge', '*/2 * * * *',
    $cmd$
    select public.bling2_bridge_pedidos_faturados();
    select public.bling2_bridge_completar_entrega();
    select public.bling2_bridge_cancelar_sem_nota();
    $cmd$
  );

  -- ── 3. Rastreio: a cada 5 minutos ──────────────────────────────────────
  --
  -- Não vai a 1 minuto de propósito. Aqui quem responde é a API do Melhor
  -- Envio, que é de terceiro e tem limite próprio — e o webhook dele já cobre
  -- o tempo real. Este job é a rede de segurança para quando o webhook falha,
  -- e rede de segurança não precisa de frequência de sensor.
  perform cron.schedule(
    'rastreio-sync-5min', '*/5 * * * *',
    format($cmd$
      select net.http_post(
        url     := 'https://wpkfirmapxevzpxjovjr.supabase.co/functions/v1/rastreio-sync',
        headers := jsonb_build_object('Content-Type','application/json','X-Cron-Secret', %L),
        body    := '{"source":"cron"}'::jsonb,
        timeout_milliseconds := 60000
      );
    $cmd$, v_seg)
  );

  -- ── 4. Disparo das mensagens: a cada minuto ────────────────────────────
  --
  -- Este é o que o cliente sente. Os três acima só existem para que este tenha
  -- o que mandar.
  perform cron.schedule(
    'kanban-n8n-1min', '* * * * *',
    format($cmd$
      select net.http_post(
        url     := 'https://wpkfirmapxevzpxjovjr.supabase.co/functions/v1/kanban-n8n',
        headers := jsonb_build_object('Content-Type','application/json','X-Cron-Secret', %L),
        body    := '{"source":"cron"}'::jsonb,
        timeout_milliseconds := 60000
      );
    $cmd$, v_seg)
  );

  -- ── 5. Plataformas (envio/entrega): o que existir, a cada 5 minutos ────
  --
  -- O `ecommerce-sync` não foi criado por migração — está agendado no painel.
  -- Em vez de recriá-lo às cegas (e arriscar perder um parâmetro que só existe
  -- lá), a frequência dele é ajustada preservando o comando como está.
  for r in
    select jobname, command from cron.job where command like '%/ecommerce-sync%'
  loop
    perform cron.schedule(r.jobname, '*/5 * * * *', r.command);
    raise notice 'ecommerce-sync (%) agora a cada 5 min', r.jobname;
  end loop;
end $$;


-- ═══════════════════════════════════════════════════════════════════════════
-- Conferência
-- ═══════════════════════════════════════════════════════════════════════════

-- (a) A grade nova. Nenhum job velho pode ter sobrado.
select jobname, schedule, active
from cron.job
where jobname like 'bling%' or jobname like 'rastreio%'
   or jobname like 'kanban%' or command like '%ecommerce-sync%'
order by jobname;

-- (b) Depois de uns 5 minutos: as chamadas estão voltando 200/202?
--     Timeout aqui significa que o prazo ainda está curto para alguma função.
select status_code, count(*), max(created) as ultima
from net._http_response
where created > now() - interval '10 minutes'
group by 1
order by 2 desc;
