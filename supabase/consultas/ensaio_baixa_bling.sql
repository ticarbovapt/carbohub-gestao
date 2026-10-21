-- ═══════════════════════════════════════════════════════════════════════════
-- ENSAIO da baixa no Bling 1 — pelo SQL Editor, SEM escrever em lugar nenhum
--
-- Pedido do dono do processo (21/10/2026): testar sem depender de o financeiro
-- receber um boleto de verdade. A `bling-contas-baixar` responde, para alguns
-- títulos em aberto, o que FARIA: lê cada um no Bling AGORA e devolve o corpo
-- EXATO do POST (mesma regra do envio de verdade). E lê um borderô de título já
-- quitado — é de lá que vem a data de pagamento no sentido Bling → sistema.
--
-- ⚠️ O que ele NÃO prova: o Bling ACEITAR o POST. Isso só um envio de verdade.
-- ⚠️ O segredo é COPIADO de um job que funciona (molde da 20261040), nunca
-- impresso. Rode um bloco de cada vez: o pedido só sai no COMMIT.
-- ═══════════════════════════════════════════════════════════════════════════

-- BLOCO 1 — dispara o ensaio (5 títulos de receber + 5 de pagar).
do $ensaio$
declare v_secret text; v_req bigint;
begin
  select (regexp_match(command, 'X-Cron-Secret''\s*,\s*''([^'']+)'''))[1] into v_secret
    from cron.job where jobname = 'bling2-sync-incremental' limit 1;
  if v_secret is null or btrim(v_secret) = '' then
    raise exception 'Nao consegui ler o X-Cron-Secret do job bling2-sync-incremental. Nada foi enviado.';
  end if;
  select net.http_post(
    url := 'https://wpkfirmapxevzpxjovjr.supabase.co/functions/v1/bling-contas-baixar',
    body := '{"ensaio": true, "limite": 5}'::jsonb,
    headers := jsonb_build_object('Content-Type', 'application/json', 'X-Cron-Secret', v_secret),
    timeout_milliseconds := 60000
  ) into v_req;
  raise notice 'Ensaio disparado (request_id %). Espere ~20 s e rode o BLOCO 2.', v_req;
end $ensaio$;

-- BLOCO 2 — a resposta.
select r.status_code, r.timed_out, r.error_msg,
       r.created at time zone 'America/Sao_Paulo' as quando,
       r.content::jsonb -> 'receber' -> 'contagem'        as receber_contagem,
       r.content::jsonb -> 'pagar'   -> 'contagem'        as pagar_contagem,
       r.content::jsonb -> 'receber' -> 'bordero_amostra' as receber_bordero,
       r.content::jsonb -> 'pagar'   -> 'bordero_amostra' as pagar_bordero,
       r.content::jsonb -> 'receber' -> 'titulos' -> 0    as exemplo_receber,
       r.content::jsonb -> 'pagar'   -> 'titulos' -> 0    as exemplo_pagar,
       r.content::jsonb ->> 'mensagem'                    as mensagem
  from net._http_response r
 where r.content like '%bling-contas-baixar-ensaio%'
 order by r.created desc
 limit 1;
