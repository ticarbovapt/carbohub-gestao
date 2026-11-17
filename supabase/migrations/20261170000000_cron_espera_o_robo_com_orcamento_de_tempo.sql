-- 20261170 — o cron desistia de esperar o robô (17/11/2026)
--
-- Medido em 17/11 (68 respostas do pg_net SEM código HTTP em 24 h): metade tinha
--   "Timeout of 60000 ms reached … HTTP Request/Response time: 60001"
-- nos minutos de `rastreio-sync-5min` (:05, :10, :20…) e `melhor-envio-envios-15min`
-- (:06, :21, :36). Foi a 20261164–66: os dois robôs deixaram de ter cota e passaram a
-- rodar até 100 s (`ORCAMENTO_MS`), mas os crons continuaram esperando 60 s.
--
-- Consequências (as duas verificadas no código):
--   · a resposta é PERDIDA — e é nela que vêm `fila_aberta` (o retrato da fila do
--     rastreio) e `reconferencia` (o que o Melhor Envio reconferiu). Rodada longa
--     justamente quando a fila é grande, ou seja, quando mais interessa ver;
--   · o vigia das fontes (`20261168`) conta com a resposta do rastreio: rodada que
--     sempre passa de 60 s = "rastreio mudo" de mentira para o TI.
-- (`bling2-order-details-10min` NÃO entra: chama o `bling2-auto-sync`, que devolve
-- 202 na hora e trabalha em segundo plano — `EdgeRuntime.waitUntil`.)
--
-- A regra: o timeout do cron tem de ser MAIOR que o orçamento do robô. 150 s =
-- 100 s de orçamento + a rodada em curso + folga, e é o teto de vida da função.
--
-- ⚠️ `cron.alter_job` com `replace` no TEXTO VIVO do comando: o comando leva o
-- `CRON_SECRET`, e reescrevê-lo à mão arriscaria trocar o segredo. Só o número
-- muda. Job que não existe, ou comando sem EXATAMENTE um `timeout_milliseconds`,
-- NÃO é tocado e vira WARNING (não aborta: é ajuste de tempo, não de dado, e uma migração
-- que aborta TRAVA as seguintes) — a conferência é a consulta no fim do arquivo.
-- ⚠️ Só os DOIS jobs que este robô de orçamento de tempo alcança. Os outros (ecommerce-sync,
-- 60 s) respondem em menos disso: medido, 200 de 5 em 5 min.

do $$
declare
  v_job record;
  v_n   int;
  v_novo text;
  v_nome text;
begin
  foreach v_nome in array array['rastreio-sync-5min', 'melhor-envio-envios-15min'] loop
    select jobid, command into v_job from cron.job where jobname = v_nome;
    if not found then
      raise warning 'o job % não existe — nada alterado (confira cron.job)', v_nome;
      continue;
    end if;

    select count(*) into v_n from regexp_matches(v_job.command, 'timeout_milliseconds\s*:=\s*[0-9]+', 'g');
    if v_n <> 1 then
      raise warning 'o comando de % tem % "timeout_milliseconds" (esperava 1) — nada alterado', v_nome, v_n;
      continue;
    end if;

    -- Já em 150 s ou mais: nada a fazer (idempotente; e nunca DIMINUI um timeout maior).
    if coalesce((regexp_match(v_job.command, 'timeout_milliseconds\s*:=\s*([0-9]+)'))[1]::bigint, 0) >= 150000 then
      raise notice '% já espera 150 s ou mais — nada a fazer', v_nome;
      continue;
    end if;

    v_novo := regexp_replace(v_job.command, 'timeout_milliseconds\s*:=\s*[0-9]+', 'timeout_milliseconds := 150000');
    perform cron.alter_job(v_job.jobid, command := v_novo);
  end loop;

  -- Conferência: os dois agora esperam 150 s, e o resto do comando (URL e segredo) é o mesmo.
  for v_job in select jobname, command from cron.job
                where jobname in ('rastreio-sync-5min', 'melhor-envio-envios-15min') loop
    -- Esta SIM aborta: se o comando que acabou de ser reescrito perdeu o segredo ou a URL,
    -- o robô pararia de autenticar — pior que o timeout curto.
    if (regexp_match(v_job.command, 'timeout_milliseconds\s*:=\s*([0-9]+)'))[1]::bigint >= 150000
       and (v_job.command !~ 'X-Cron-Secret' or v_job.command !~ '/functions/v1/') then
      raise exception 'ABORTADO: o comando de % perdeu o segredo ou a URL', v_job.jobname;
    end if;
  end loop;
end
$$;

-- Conferência (SQL Editor, depois do deploy): os dois com 150000.
-- select jobname, (regexp_match(command, 'timeout_milliseconds\s*:=\s*([0-9]+)'))[1] as timeout_ms
--   from cron.job where jobname in ('rastreio-sync-5min', 'melhor-envio-envios-15min');
