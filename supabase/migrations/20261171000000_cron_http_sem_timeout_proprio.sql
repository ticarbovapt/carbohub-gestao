-- 20261171 — jobs HTTP do cron que valiam o timeout PADRÃO de 5 s (17/11/2026)
--
-- Medido em 17/11 (68 respostas do pg_net sem código HTTP em 24 h): ~50 eram
--   "Timeout of 5000 ms reached"
-- nos minutos :00/:15/:30/:45. A `20261170` tratou os ~14 de 60 s; estes são os de 5 s.
-- Em `cron.job` (consulta de 17/11) dois jobs HTTP têm `timeout_milliseconds` AUSENTE do
-- comando — o `net.http_post` usa o padrão (5000 ms):
--   bling-nfe-sync    0 * * * *    → bling-sync {"entity":"nfe"}  (lê notas do Bling, passa de 5 s)
--   vindi-sync-15min  */15 * * * * → vindi-sync                    (:00, :15, :30, :45)
-- (`carbo-chat-ack-remind` e `chat-dispatch-scheduled` não têm URL: são SQL puro, não entram.)
-- Casa com o padrão medido: 1 por quarto de hora (vindi) + 1 a mais às :00 (bling-nfe).
--
-- ⚠️ O que isto conserta e o que NÃO conserta: o timeout do pg_net só decide até quando o
-- CRON espera a RESPOSTA — a função continua rodando no servidor. Com 5 s, a rodada ia ao ar e
-- a resposta (e o erro, se houver) se perdia; o `net._http_response` ficava com `status_code`
-- nulo e o vigia das fontes não sabia distinguir "rodou" de "não respondeu". Não muda o que a
-- função faz, só passa a registrar o desfecho.
-- ⚠️ `vindi-sync` NÃO está na lista `dep` do deploy-functions.yml (nunca sobe pelo push):
-- se o 200/401/404 de agora em diante mostrar que ela não existe ou recusa, é outra conversa
-- (desagendar o job) — o timeout só dá a resposta para essa conversa existir.
--
-- Como em `20261170`: `cron.alter_job` no TEXTO VIVO (o comando do bling-nfe-sync leva o
-- `CRON_SECRET`); só ACRESCENTA `, timeout_milliseconds := N` depois do `body := …`. Job
-- ausente, comando que já tem timeout, ou sem EXATAMENTE um `body :=` → WARNING e segue
-- (ajuste de tempo não pode abortar e travar as migrações seguintes).

do $$
declare
  v_job   record;
  v_novo  text;
  v_item  record;
  v_corpo text := $re$(body\s*:=\s*(?:'[^']*'|\$\$[^$]*\$\$)(?:::jsonb)?)$re$;
begin
  for v_item in
    select * from (values ('bling-nfe-sync', 150000), ('vindi-sync-15min', 60000)) t(nome, ms)
  loop
    select jobid, command into v_job from cron.job where jobname = v_item.nome;
    if not found then
      raise warning 'o job % não existe — nada alterado', v_item.nome;
      continue;
    end if;

    if v_job.command ~* 'timeout_milliseconds' then
      raise notice '% já define timeout_milliseconds — nada a fazer', v_item.nome;
      continue;
    end if;

    if (select count(*) from regexp_matches(v_job.command, v_corpo, 'gi')) <> 1 then
      raise warning 'o comando de % não tem exatamente um "body :=" reconhecível — nada alterado', v_item.nome;
      continue;
    end if;

    v_novo := regexp_replace(v_job.command, v_corpo, '\1, timeout_milliseconds := ' || v_item.ms, 'i');
    perform cron.alter_job(v_job.jobid, command := v_novo);
  end loop;

  -- Esta SIM aborta: comando reescrito que perdeu URL ou segredo (bling) quebraria o job.
  for v_job in select jobname, command from cron.job
                where jobname in ('bling-nfe-sync', 'vindi-sync-15min')
                  and command ~* 'timeout_milliseconds' loop
    if v_job.command !~ '/functions/v1/'
       or (v_job.jobname = 'bling-nfe-sync' and v_job.command !~ 'X-Cron-Secret') then
      raise exception 'ABORTADO: o comando de % perdeu a URL ou o segredo', v_job.jobname;
    end if;
  end loop;
end
$$;

-- Conferência (SQL Editor, depois do merge): os dois com timeout.
-- select jobname, (regexp_match(command, 'timeout_milliseconds\s*:=\s*([0-9]+)'))[1] as timeout_ms
--   from cron.job where jobname in ('bling-nfe-sync', 'vindi-sync-15min');
-- E depois de uma hora, as respostas deles em `net._http_response` devem ter status_code.
