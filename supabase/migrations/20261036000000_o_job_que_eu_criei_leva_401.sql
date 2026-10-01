-- ═══════════════════════════════════════════════════════════════════════════
-- O job que EU criei leva 401 de 10 em 10 minutos — e o `pg_cron` diz succeeded
--
-- Medido em 01/10/2026, em `net._http_response`:
--
--   14:39:01  401  {"error":"Unauthorized"}
--   14:29:00  401  {"error":"Unauthorized"}
--
-- Minutos :29 e :39 — exatamente o `9-59/10` do `bling2-nfe-detalhe-10min`,
-- criado por mim ontem na `20261024`. Os vizinhos passam (`cron-incremental`
-- 202, `cron-detalhe` 202). Só o meu não.
--
-- E o censo fecha sem ambiguidade:
--
--   notas 1029 · nunca_detalhadas 934 · detalhada_sem_natureza 0 · com_natureza 95
--
-- `detalhada_sem_natureza = 0` mata a hipótese "rodou e não conseguiu": a fila
-- **não drenou uma linha**. A função está sendo chamada e recusada.
--
-- ⚠️ É a QUARTA vez que esta mesma cegueira custa dias neste repo — o
-- `CRON_SECRET` sumido (25 h), os 401 do `ecommerce-sync` (20 h), o timeout da
-- `carbo_msg_fila` (18 dias) e agora este. O `pg_cron` marca `succeeded` porque
-- `net.http_post` é assíncrono e o sucesso dele é ter POSTADO. **Fonte que
-- importa, confira em `net._http_response`.**
--
-- ⚠️ E o custo aqui não é só atraso: a natureza é o que separa nota de VENDA de
-- nota de BONIFICAÇÃO na filial (`20261026`). Com 934 notas sem ela, o
-- casamento automático não consegue decidir a coluna — foi exatamente o que se
-- viu no `000939`/`000940` do `V2026090001`, as duas com `e_bonificacao = false`
-- por falta de natureza.
--
-- ── O conserto NÃO imprime o segredo ─────────────────────────────────────
--
-- O header está certo (`X-Cron-Secret`); o que não bate é o VALOR. A `20260876`
-- já registra que ele foi rotacionado uma vez e os jobs ficaram dessincronizados
-- — e eu repeti o erro escrevendo o valor à mão na `20261024`.
--
-- ⚠️ Então o valor é COPIADO de um job que provadamente funciona, dentro do
-- próprio banco. Nunca digitado, nunca colado no chat, nunca impresso em
-- resultado de consulta. Segredo que atravessa uma conversa é segredo que
-- precisa ser rotacionado depois.
--
-- ⚠️ RODE EM BLOCOS.
-- ═══════════════════════════════════════════════════════════════════════════


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 0 — MEDIR. Quais jobs batem com o que funciona.                 ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
-- ⚠️ Devolve BOOLEANO, nunca o segredo. ESPERADO: todos `true` menos o
-- `bling2-nfe-detalhe-10min`. Se vier mais de um `false`, são mais jobs mudos
-- levando 401 — e cada um deles é uma fonte parada que ninguém está vendo.
-- select jobname, schedule, active,
--        (regexp_match(command, 'X-Cron-Secret''\s*,\s*''([^'']+)'''))[1]
--        = (select (regexp_match(command, 'X-Cron-Secret''\s*,\s*''([^'']+)'''))[1]
--             from cron.job where jobname = 'bling2-sync-incremental' limit 1)
--        as segredo_igual_ao_que_funciona
-- from cron.job
-- where command ilike '%bling2-auto-sync%'
-- order by jobname;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 1 — reagendar copiando o segredo de quem funciona               ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
-- ⚠️ `bling2-sync-incremental` é a referência porque ele devolve **202** a cada
-- minuto, medido em `net._http_response`. Não é "o mais antigo" nem "o que eu
-- acho que está certo" — é o que o dado mostra funcionando agora.
--
-- ⚠️ E ABORTA se não conseguir ler. Reagendar com segredo nulo trocaria um job
-- que falha ALTO (401, visível) por um que falha calado — e falhar calado é o
-- modo que já custou 25 h, 20 h e 18 dias neste repo.

do $fix$
declare
  v_secret text;
  v_cmd    text;
  j        bigint;
begin
  select (regexp_match(command, 'X-Cron-Secret''\s*,\s*''([^'']+)'''))[1]
    into v_secret
    from cron.job
   where jobname = 'bling2-sync-incremental'
   limit 1;

  if v_secret is null or btrim(v_secret) = '' then
    raise exception
      'Nao consegui ler o X-Cron-Secret do job bling2-sync-incremental. '
      'Confira se ele existe (select jobname from cron.job) ANTES de seguir — '
      'reagendar sem segredo troca um 401 visivel por uma falha calada.';
  end if;

  for j in select jobid from cron.job where jobname = 'bling2-nfe-detalhe-10min' loop
    perform cron.unschedule(j);
  end loop;

  -- ⚠️ `%L` em tudo: o segredo nunca é concatenado à mão, e assim ele não
  -- aparece em plano, em erro de sintaxe nem em log de statement.
  v_cmd := format(
    'select net.http_post(url := %L, headers := jsonb_build_object(%L, %L, %L, %L), body := %L::jsonb) as request_id;',
    'https://wpkfirmapxevzpxjovjr.supabase.co/functions/v1/bling2-auto-sync',
    'Content-Type',  'application/json',
    'X-Cron-Secret', v_secret,
    '{"source":"cron-nfe-detalhe","fases":["nfe_detalhe"]}'
  );

  -- Minuto :09, ímpar e fora da grade cheia — o mesmo raciocínio da `20261024`.
  perform cron.schedule('bling2-nfe-detalhe-10min', '9-59/10 * * * *', v_cmd);

  raise notice 'bling2-nfe-detalhe-10min reagendado com o segredo do job que funciona.';
end $fix$;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 2 — CONFERÊNCIA. Rode UMA DE CADA VEZ, e a (b) só após 10 min.  ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

-- (a) ESPERADO: AGORA todos `true`.
-- select jobname, schedule, active,
--        (regexp_match(command, 'X-Cron-Secret''\s*,\s*''([^'']+)'''))[1]
--        = (select (regexp_match(command, 'X-Cron-Secret''\s*,\s*''([^'']+)'''))[1]
--             from cron.job where jobname = 'bling2-sync-incremental' limit 1)
--        as segredo_igual_ao_que_funciona
-- from cron.job
-- where command ilike '%bling2-auto-sync%'
-- order by jobname;

-- (b) ⚠️ ESPERE o próximo minuto terminado em 9. ESPERADO: 202, não 401.
--     ⚠️ E NÃO olhe `cron.job_run_details` — ele diz `succeeded` nos dois casos,
--     porque o sucesso dele é ter POSTADO.
-- select r.id, r.status_code, left(r.content, 200) as corpo, r.created
-- from net._http_response r
-- where extract(minute from r.created)::int % 10 = 9
-- order by r.created desc
-- limit 10;

-- (c) A fila drenando. 40 por rodada × 6 rodadas/h = 240/h, então as 934 levam
--     ~4 h. ⚠️ Rode de hora em hora: `nunca_detalhadas` tem de CAIR. Se ficar
--     parada com o 202 voltando, o problema é outro e a fase `nfe_detalhe`
--     precisa ser olhada por dentro.
-- select count(*) as notas,
--        count(*) filter (where raw_detalhe is null)        as nunca_detalhadas,
--        count(*) filter (where natureza_operacao is not null) as com_natureza
-- from public.bling2_nfe;

-- (d) ⚠️ O que isto DESTRAVA, e é a razão de a fila importar: com natureza, a
--     filial volta a separar venda de bonificação sozinha.
-- select count(*) filter (where public.carbo_natureza_e_bonificacao(natureza_operacao)) as bonificacao,
--        count(*) filter (where natureza_operacao is not null
--                          and not public.carbo_natureza_e_bonificacao(natureza_operacao)) as venda,
--        count(*) filter (where natureza_operacao is null) as indecidivel
-- from public.bling2_nfe;
