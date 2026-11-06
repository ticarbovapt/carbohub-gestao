-- ═══════════════════════════════════════════════════════════════════════════
-- Teste de conexão com o Bradesco (SANDBOX) — chamar a `bradesco-teste` pelo SQL Editor
--
-- Não altera nada no banco. O X-Cron-Secret é COPIADO de um job que funciona,
-- dentro do próprio banco, e nunca aparece no resultado (regra da `20261040`).
-- ⚠️ RODE EM BLOCOS, UMA CONSULTA DE CADA VEZ.
-- ═══════════════════════════════════════════════════════════════════════════


-- ── BLOCO 1 — dispara o teste (token + registro comum + registro híbrido) ──
-- Devolve uma NOTICE com o request_id. Espere ~15 s e rode o BLOCO 2.
do $teste$
declare
  v_secret text;
  v_req    bigint;
begin
  select (regexp_match(command, 'X-Cron-Secret''\s*,\s*''([^'']+)'''))[1]
    into v_secret
    from cron.job where jobname = 'bling2-sync-incremental' limit 1;
  if v_secret is null or btrim(v_secret) = '' then
    raise exception 'Nao consegui ler o X-Cron-Secret do job bling2-sync-incremental.';
  end if;

  select net.http_post(
    url := 'https://wpkfirmapxevzpxjovjr.supabase.co/functions/v1/bradesco-teste',
    body := '{"passo": "tudo"}'::jsonb,
    headers := jsonb_build_object('Content-Type', 'application/json', 'X-Cron-Secret', v_secret),
    timeout_milliseconds := 60000
  ) into v_req;

  raise notice 'Teste disparado. request_id = %. Espere ~15s e rode o BLOCO 2.', v_req;
end $teste$;


-- ── BLOCO 2 — lê a resposta ────────────────────────────────────────────────
-- ⚠️ `net._http_response`, nunca `cron.job_run_details`. Filtra pela marca que a
-- função põe em toda resposta (`"funcao": "bradesco-teste"`).
-- `timed_out = true` com status nulo = o pg_net desistiu; rode o BLOCO 1 de novo.
--
-- select r.id, r.status_code, r.timed_out, r.error_msg,
--        r.created at time zone 'America/Sao_Paulo' as quando,
--        r.content
--   from net._http_response r
--  where r.content like '%"funcao": "bradesco-teste"%'
--     or r.id in (select id from net.http_request_queue where url like '%bradesco-teste%')
--  order by r.created desc
--  limit 3;
