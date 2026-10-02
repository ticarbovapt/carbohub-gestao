-- ═══════════════════════════════════════════════════════════════════════════
-- Chamar a sonda do DPS pelo SQL EDITOR — sem terminal e sem imprimir segredo
--
-- Isto NÃO altera nada. É o jeito de disparar a `nfse-dps-teste` a partir do
-- único lugar que o dono do processo usa: o SQL Editor do Supabase.
--
-- ⚠️ POR QUE NÃO UM `select` QUE MOSTRA O `CRON_SECRET`: ele foi pedido, e a
-- resposta certa é não. Resultado de consulta é colado no chat, e segredo que
-- atravessa uma conversa precisa ser rotacionado depois. O valor é COPIADO de
-- um job que provadamente devolve 202, com `%L`, dentro do próprio banco —
-- mesma disciplina da `20261036`, que nasceu justamente de eu ter digitado o
-- valor à mão e ganhado um 401 de 10 em 10 minutos.
--
-- ⚠️ E O MOTIVO É MAIOR QUE HIGIENE: o `CRON_SECRET` é a portaria de TODAS as
-- edge functions chamadas por máquina deste projeto — `kanban-n8n` inclusive,
-- que dispara WhatsApp para a base inteira. Não é a senha de uma sonda de
-- teste.
--
-- ── Por que DUAS consultas, e não uma ────────────────────────────────────
--
-- `net.http_post` é ASSÍNCRONO: ele enfileira e devolve um `request_id` na
-- hora. A requisição só sai no COMMIT, e a resposta chega depois, numa linha de
-- `net._http_response`. Tentar ler na mesma consulta devolve "nada" — que é
-- indistinguível de "falhou", e é exatamente a cegueira que fez o `pg_cron`
-- marcar `succeeded` enquanto a fila apanhava 401 por 24 h.
--
-- ⚠️ RODE EM BLOCOS, UMA CONSULTA DE CADA VEZ.
-- ═══════════════════════════════════════════════════════════════════════════


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 0 — o segredo é LEGÍVEL daqui? Devolve BOOLEANO, nunca o valor. ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
-- ESPERADO: uma linha, `true`. `false` significa que o job de referência mudou
-- de forma e os blocos seguintes vão abortar — o que está certo, mas é melhor
-- descobrir aqui.
--
-- select (regexp_match(command, 'X-Cron-Secret''\s*,\s*''([^'']+)'''))[1] is not null
--          as consigo_ler_o_segredo
-- from cron.job
-- where jobname = 'bling2-sync-incremental'
-- limit 1;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 1 — PASSO 1: MONTAGEM. Não envia nada a serviço fiscal nenhum.  ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
-- ⚠️ Este é o passo que responde "a chave abre e a assinatura fica de pé?"
-- sem tocar no gov.br. É o primeiro, SEMPRE.
--
-- Devolve o `request_id`. Guarde-o: é por ele que o BLOCO 3 lê a resposta.

do $sonda$
declare
  v_secret text;
  v_req    bigint;
begin
  select (regexp_match(command, 'X-Cron-Secret''\s*,\s*''([^'']+)'''))[1]
    into v_secret
    from cron.job
   where jobname = 'bling2-sync-incremental'
   limit 1;

  -- ⚠️ ABORTA em vez de mandar sem segredo. Chamada sem o header volta 401, e
  -- 401 aqui se leria como "a função está errada" — um sintoma tapando outro,
  -- que é o que custou o dia de diagnóstico da `20261036`.
  if v_secret is null or btrim(v_secret) = '' then
    raise exception
      'Nao consegui ler o X-Cron-Secret do job bling2-sync-incremental. '
      'Rode o BLOCO 0 antes de seguir.';
  end if;

  select net.http_post(
    url := 'https://wpkfirmapxevzpxjovjr.supabase.co/functions/v1/nfse-dps-teste',
    body := '{}'::jsonb,
    headers := jsonb_build_object('Content-Type', 'application/json',
                                  'X-Cron-Secret', v_secret),
    -- ⚠️ O padrão do pg_net é 5 s, e a importacao da chave + assinatura pode
    -- passar disso numa instancia fria. `timed_out = true` com status nulo e
    -- indistinguivel de "nao disparou" — a ambiguidade que travou o
    -- diagnostico do `bling2-auto-sync`.
    timeout_milliseconds := 50000
  ) into v_req;

  raise notice 'MONTAGEM disparada. request_id = %. Espere ~5s e rode o BLOCO 3.', v_req;
end $sonda$;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 2 — PASSO 2: ENVIO à PRODUÇÃO RESTRITA, os dois algoritmos      ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
-- ⚠️ SÓ depois de o BLOCO 3 mostrar a montagem OK. Mandar antes troca uma
-- pergunta por duas: "a assinatura esta errada" e "a chave nem abriu" voltam
-- rejeicoes parecidas.
--
-- ⚠️ `nDPS` DIFERENTE nos dois: ele e sequencial POR SERIE, e repetir o numero
-- faz o ADN recusar por DUPLICIDADE em vez de por assinatura — ou seja,
-- responderia a pergunta errada com cara de resposta.
--
-- ⚠️ Isto NAO emite nota: `tpAmb = 2` no XML e a URL e a de homologacao do
-- gov.br. A de producao esta COMENTADA no codigo da funcao, e `producao: true`
-- e recusado com mensagem explicita.
--
-- do $envio$
-- declare
--   v_secret text;
--   v_a bigint;
--   v_b bigint;
-- begin
--   select (regexp_match(command, 'X-Cron-Secret''\s*,\s*''([^'']+)'''))[1]
--     into v_secret
--     from cron.job where jobname = 'bling2-sync-incremental' limit 1;
--
--   if v_secret is null or btrim(v_secret) = '' then
--     raise exception 'Nao consegui ler o X-Cron-Secret. Rode o BLOCO 0.';
--   end if;
--
--   select net.http_post(
--     url := 'https://wpkfirmapxevzpxjovjr.supabase.co/functions/v1/nfse-dps-teste',
--     body := '{"enviar": true, "algo": "sha256", "nDPS": "1"}'::jsonb,
--     headers := jsonb_build_object('Content-Type', 'application/json',
--                                   'X-Cron-Secret', v_secret),
--     timeout_milliseconds := 50000
--   ) into v_a;
--
--   select net.http_post(
--     url := 'https://wpkfirmapxevzpxjovjr.supabase.co/functions/v1/nfse-dps-teste',
--     body := '{"enviar": true, "algo": "sha1", "nDPS": "2"}'::jsonb,
--     headers := jsonb_build_object('Content-Type', 'application/json',
--                                   'X-Cron-Secret', v_secret),
--     timeout_milliseconds := 50000
--   ) into v_b;
--
--   raise notice 'ENVIO disparado. sha256 = %, sha1 = %. Espere ~20s e rode o BLOCO 3.', v_a, v_b;
-- end $envio$;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 3 — LER A RESPOSTA                                              ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
-- ⚠️ `net._http_response`, NUNCA `cron.job_run_details`. O segundo diz
-- `succeeded` por ter POSTADO — e foi essa confusao que escondeu o
-- `CRON_SECRET` sumido por 25 h, os 401 do `ecommerce-sync` por 20 h e o
-- timeout da `carbo_msg_fila` por 18 dias.
--
-- ⚠️ `timed_out = true` com `status_code` nulo NAO e erro da funcao: e o pg_net
-- tendo desistido. Ela pode ter rodado inteira do outro lado.
--
-- select r.id, r.status_code, r.timed_out, r.error_msg,
--        r.created at time zone 'America/Sao_Paulo' as quando_brasilia,
--        r.content
-- from net._http_response r
-- order by r.created desc
-- limit 4;
