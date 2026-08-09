-- ═══════════════════════════════════════════════════════════════════════════
-- Rotação do CRON_SECRET
--
-- ── Por que ─────────────────────────────────────────────────────────────────
--
-- O valor em uso passou por uma conversa em texto puro. Isso basta: segredo
-- que foi visto por um canal que não controla o histórico é segredo queimado,
-- independente de haver indício de uso indevido.
--
-- ⚠️ O valor ANTIGO das migrações 20260625/20260710/20260711/20260837/20260838
-- (`73d61bd6-…`) NÃO é o alvo aqui — ele já está morto desde que o
-- `CRON_SECRET` passou a existir com outro valor. Foi exatamente ele deixar de
-- valer que causou as 25 horas de sincronismo parado. As três funções do Bling
-- leem `Deno.env.get("CRON_SECRET")`, a mesma variável de todo o resto; não há
-- `BLING_CRON_SECRET` separado.
--
-- ── O valor vive em TRÊS lugares, e os três têm de bater ────────────────────
--
--   1. secret `CRON_SECRET` das Edge Functions  (painel do Supabase)
--   2. `private.cron_config` + o comando de cada `cron.job`   (este arquivo)
--   3. a URL do webhook cadastrada no painel do MELHOR ENVIO, que carrega
--      `?secret=<valor>` embutido na query
--
-- O terceiro é o que se esquece. Até hoje, esquecer significava o webhook parar
-- de entrar em silêncio — porque a função aceitava qualquer chamada quando o
-- segredo não batia por ausência. Agora ela recusa e REGISTRA:
--
--   select recebido_em, acao from public.rastreio_webhook_log
--   where acao like 'RECUSADO%' order by recebido_em desc;
--
-- ── A janela de 401 é esperada, e é curta ───────────────────────────────────
--
-- Não existe troca atômica entre banco e painel. Este script muda o lado do
-- banco; enquanto o painel não for atualizado, os crons mandam o valor novo e
-- as funções esperam o antigo — 401 por um ou dois ciclos. Nada se perde: a
-- rodada seguinte pega o que ficou para trás, porque todas elas trabalham por
-- diferença (`orders_recente` filtra por data, a fila de avisos por ausência de
-- registro), não por gatilho de momento.
--
-- O que NÃO se pode fazer é parar no meio. Por isso o valor novo é impresso no
-- fim: leve-o para os passos 2 e 3 imediatamente.
-- ═══════════════════════════════════════════════════════════════════════════

do $$
declare
  v_novo_segredo text := gen_random_uuid()::text;
  r              record;
  v_cmd          text;
  v_qtd          integer := 0;
begin
  -- Guarda o valor novo. `private` não tem grant para anon/authenticated —
  -- é por isso que o segredo mora ali e não numa tabela do schema public.
  insert into private.cron_config (chave, valor)
  values ('rastreio_cron_secret', v_novo_segredo)
  on conflict (chave) do update set valor = excluded.valor;

  -- Substituição cirúrgica: troca só o VALOR depois de 'X-Cron-Secret',
  -- preservando URL, corpo, agendamento e timeout de cada job. Nada é
  -- reescrito à mão, então nenhum cron volta diferente do que era.
  for r in
    select jobid, jobname, schedule, command
    from cron.job
    where command like '%X-Cron-Secret%'
  loop
    v_cmd := regexp_replace(
      r.command,
      $re$('X-Cron-Secret'\s*,\s*)'[^']*'$re$,
      '\1' || quote_literal(v_novo_segredo),
      'g'
    );
    perform cron.schedule(r.jobname, r.schedule, v_cmd);
    v_qtd := v_qtd + 1;
  end loop;

  raise notice '% cron(s) atualizados.', v_qtd;
  raise notice '────────────────────────────────────────────────────────';
  raise notice 'NOVO CRON_SECRET: %', v_novo_segredo;
  raise notice '────────────────────────────────────────────────────────';
  raise notice 'Agora, SEM PARAR:';
  raise notice '  1) Supabase > Edge Functions > Secrets: CRON_SECRET = o valor acima';
  raise notice '  2) Painel do Melhor Envio: trocar o ?secret= da URL do webhook';
end $$;

-- O valor, também como linha de resultado — `raise notice` nem sempre aparece
-- no editor, e um segredo que não se consegue ler é uma rotação pela metade.
select valor as novo_cron_secret
from private.cron_config
where chave = 'rastreio_cron_secret';


-- ═══════════════════════════════════════════════════════════════════════════
-- Conferência
-- ═══════════════════════════════════════════════════════════════════════════

-- (a) Todos os crons com o valor novo. `usa_segredo_certo` tem de ser true
--     em todas as linhas.
select jobname, schedule, active,
       (command like '%' || (select valor from private.cron_config
                             where chave = 'rastreio_cron_secret') || '%') as usa_segredo_certo
from cron.job
where command like '%X-Cron-Secret%'
order by jobname;

-- (b) Depois de atualizar o painel: os 401 têm de sumir. Rode uns 5 minutos
--     depois — antes disso é esperado ver 401, é a janela.
select status_code, count(*), max(created) as ultima
from net._http_response
where created > now() - interval '10 minutes'
group by 1
order by 2 desc;

-- (c) O webhook do Melhor Envio continua entrando? Linha aqui = a URL do
--     painel dele ficou com o segredo velho.
select recebido_em, acao
from public.rastreio_webhook_log
where acao like 'RECUSADO%'
order by recebido_em desc
limit 10;
