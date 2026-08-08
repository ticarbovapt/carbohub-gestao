-- ═══════════════════════════════════════════════════════════════════════════
-- Conserto: os crons do Bling 2 pararam por causa de um segredo reaproveitado
--
-- ── O que aconteceu ───────────────────────────────────────────────────────
--
-- O `bling2-auto-sync` valida o header `X-Cron-Secret` contra o secret
-- `CRON_SECRET` das Edge Functions. Esse secret NÃO existia — e a função,
-- sem valor para comparar, aceitava tudo.
--
-- Ao criar a `rastreio-sync`, eu reaproveitei o nome `CRON_SECRET` para um
-- valor novo, sem verificar quem mais o usava. A partir daí o `bling2-auto-sync`
-- passou a comparar de verdade: o cron dele manda o valor antigo (fixo dentro
-- da migração 20260838) e a função responde 401.
--
-- Efeito: o espelho do Bling 2 parou de gravar em 07/08 10:45. Nada de venda
-- on-line entrou depois — nem na esteira, nem na ponte para `carboze_orders`
-- (faturamento), nem no rastreio. O `pg_cron` marcava `succeeded` o tempo todo,
-- porque `net.http_post` é assíncrono e o sucesso dele é ter POSTADO, não a
-- resposta ter sido 200. O 401 só aparecia em `net._http_response`.
--
-- ── O conserto ────────────────────────────────────────────────────────────
--
-- Um segredo só, guardado em `private.cron_config`, para TODOS os crons que
-- mandam `X-Cron-Secret`. Isto resolve as duas coisas de uma vez:
--
--   1. Os crons do Bling 2 voltam a ser aceitos.
--   2. O segredo sai do texto puro da migração 20260838, que está versionada
--      no GitHub — item que já estava na fila.
--
-- A substituição é cirúrgica: troca apenas o VALOR que vem depois de
-- 'X-Cron-Secret' no comando, preservando URL, corpo e agendamento. Nada é
-- reescrito à mão, então nenhum cron corre risco de voltar diferente.
-- ═══════════════════════════════════════════════════════════════════════════

do $$
declare
  v_segredo text;
  r         record;
  v_novo    text;
  v_qtd     integer := 0;
begin
  select valor into v_segredo
  from private.cron_config where chave = 'rastreio_cron_secret';

  if v_segredo is null then
    raise exception
      'Falta o segredo. Rode: insert into private.cron_config (chave, valor) values (''rastreio_cron_secret'', ''<o valor do secret CRON_SECRET>'');';
  end if;

  for r in
    select jobid, jobname, schedule, command
    from cron.job
    where command like '%X-Cron-Secret%'
      and command not like '%' || v_segredo || '%'
  loop
    v_novo := regexp_replace(
      r.command,
      $re$('X-Cron-Secret'\s*,\s*)'[^']*'$re$,
      '\1' || quote_literal(v_segredo),
      'g'
    );
    perform cron.schedule(r.jobname, r.schedule, v_novo);
    v_qtd := v_qtd + 1;
    raise notice 'cron % atualizado', r.jobname;
  end loop;

  raise notice '% cron(s) passaram a usar o segredo unificado.', v_qtd;
end $$;


-- ═══════════════════════════════════════════════════════════════════════════
-- Conferência
-- ═══════════════════════════════════════════════════════════════════════════

-- (a) Nenhum cron pode ter ficado com um segredo diferente do atual.
select jobname, schedule, active,
       (command like '%' || (select valor from private.cron_config where chave = 'rastreio_cron_secret') || '%')
         as usa_segredo_certo
from cron.job
where command like '%X-Cron-Secret%'
order by jobname;

-- (b) Depois da próxima rodada (:15 ou :45), o 401 tem de sumir daqui.
select status_code, count(*), max(created) as ultima
from net._http_response
where content::text ilike '%unauthorized%'
group by status_code;

-- (c) E o espelho tem de voltar a gravar. `ultima_gravacao` deve andar.
select max(data)      as pedido_mais_novo,
       max(synced_at) as ultima_gravacao,
       count(*)       as total
from public.bling2_orders;
