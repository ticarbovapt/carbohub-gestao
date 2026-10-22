-- ═══════════════════════════════════════════════════════════════════════════
-- RAIO-X da baixa nos dois Blings — pelo SQL Editor, SEM escrever em lugar nenhum
--
-- Pergunta (22/10/2026): "está refletindo tudo no Bling?" antes de o time testar.
-- O que NÃO dá para provar sem enviar de verdade: o Bling ACEITAR juros/multa/
-- desconto/tarifa e o valor parcial com os nomes que a baixa manda — eles vieram
-- da doc, e o Bling ignora calado campo desconhecido.
-- O que DÁ: ler os borderôs que o time JÁ fez no próprio Bling. Todo campo que
-- vem com valor ali é um nome que o Bling usa de verdade.
--
-- ⚠️ O segredo é COPIADO de um job que funciona, nunca impresso.
-- ⚠️ Um bloco de cada vez: o pedido só sai no fim do bloco (COMMIT).
-- ═══════════════════════════════════════════════════════════════════════════

-- BLOCO 0 — o que já foi de verdade ao Bling pelo Finanças (só lê o nosso banco).
select 'matriz receber' as onde, count(*) filter (where bling_baixa_bordero is not null) as baixas_com_bordero,
       count(*) filter (where bling_baixa_erro is not null) as com_erro, max(bling_baixa_em) as ultima
  from public.receivables
union all
select 'matriz pagar', count(*) filter (where bling_baixa_bordero is not null),
       count(*) filter (where bling_baixa_erro is not null), max(bling_baixa_em)
  from public.purchase_payables
union all
select 'filial (log) ' || acao || case when ok then ' ok' else ' recusada' end, count(*), 0, max(em)
  from public.fin_bling2_baixa_log group by acao, ok;


-- BLOCO 1 — dispara o raio-x da MATRIZ (Bling 1): 30 borderôs de receber e 30 de pagar.
do $raio$
declare v_secret text; v_req bigint;
begin
  select (regexp_match(command, 'X-Cron-Secret''\s*,\s*''([^'']+)'''))[1] into v_secret
    from cron.job where jobname = 'bling2-sync-incremental' limit 1;
  if v_secret is null or btrim(v_secret) = '' then
    raise exception 'Nao consegui ler o X-Cron-Secret do job bling2-sync-incremental. Nada foi enviado.';
  end if;
  select net.http_post(
    url := 'https://wpkfirmapxevzpxjovjr.supabase.co/functions/v1/bling-contas-baixar',
    body := '{"ensaio": true, "limite": 1, "borderos": 30}'::jsonb,
    headers := jsonb_build_object('Content-Type', 'application/json', 'X-Cron-Secret', v_secret),
    timeout_milliseconds := 140000
  ) into v_req;
  raise notice 'Raio-x da matriz disparado (request_id %). Espere ~60 s e rode o BLOCO 2.', v_req;
end $raio$;


-- BLOCO 2 — a resposta da MATRIZ.
select r.status_code, r.timed_out, r.error_msg,
       r.content::jsonb -> 'receber' -> 'raio_x' -> 'campos_com_valor'       as receber_campos_com_valor,
       r.content::jsonb -> 'pagar'   -> 'raio_x' -> 'campos_com_valor'       as pagar_campos_com_valor,
       r.content::jsonb -> 'receber' -> 'raio_x' -> 'chaves_dos_pagamentos'  as receber_chaves,
       r.content::jsonb -> 'receber' -> 'raio_x' -> 'historicos_exemplo'     as receber_historicos,
       r.content::jsonb -> 'receber' -> 'raio_x' -> 'historicos_do_carbohub' as receber_do_carbohub,
       r.content::jsonb -> 'pagar'   -> 'raio_x' -> 'historicos_do_carbohub' as pagar_do_carbohub,
       r.content::jsonb -> 'receber' -> 'raio_x' -> 'exemplos_com_ajuste'    as receber_com_ajuste,
       r.content::jsonb -> 'pagar'   -> 'raio_x' -> 'exemplos_com_ajuste'    as pagar_com_ajuste,
       r.content::jsonb -> 'receber' -> 'raio_x' -> 'exemplos_parcial'       as receber_parcial,
       r.content::jsonb -> 'receber' -> 'raio_x' -> 'exemplo_simples'        as receber_simples,
       r.content::jsonb ->> 'mensagem'                                       as mensagem
  from net._http_response r
 where r.content like '%bling-contas-baixar-ensaio%'
 order by r.created desc
 limit 1;


-- BLOCO 3 — dispara o raio-x da FILIAL (Bling 2).
do $raio2$
declare v_secret text; v_req bigint;
begin
  select (regexp_match(command, 'X-Cron-Secret''\s*,\s*''([^'']+)'''))[1] into v_secret
    from cron.job where jobname = 'bling2-sync-incremental' limit 1;
  if v_secret is null or btrim(v_secret) = '' then
    raise exception 'Nao consegui ler o X-Cron-Secret do job bling2-sync-incremental. Nada foi enviado.';
  end if;
  select net.http_post(
    url := 'https://wpkfirmapxevzpxjovjr.supabase.co/functions/v1/bling2-contas',
    body := '{"ensaio": true, "limite": 1, "borderos": 30}'::jsonb,
    headers := jsonb_build_object('Content-Type', 'application/json', 'X-Cron-Secret', v_secret),
    timeout_milliseconds := 140000
  ) into v_req;
  raise notice 'Raio-x da filial disparado (request_id %). Espere ~60 s e rode o BLOCO 4.', v_req;
end $raio2$;


-- BLOCO 4 — a resposta da FILIAL.
select r.status_code, r.timed_out, r.error_msg,
       r.content::jsonb -> 'receber' -> 'raio_x' -> 'campos_com_valor'       as receber_campos_com_valor,
       r.content::jsonb -> 'pagar'   -> 'raio_x' -> 'campos_com_valor'       as pagar_campos_com_valor,
       r.content::jsonb -> 'receber' -> 'raio_x' -> 'chaves_dos_pagamentos'  as receber_chaves,
       r.content::jsonb -> 'receber' -> 'raio_x' -> 'historicos_exemplo'     as receber_historicos,
       r.content::jsonb -> 'receber' -> 'raio_x' -> 'historicos_do_carbohub' as receber_do_carbohub,
       r.content::jsonb -> 'pagar'   -> 'raio_x' -> 'historicos_do_carbohub' as pagar_do_carbohub,
       r.content::jsonb -> 'receber' -> 'raio_x' -> 'exemplos_com_ajuste'    as receber_com_ajuste,
       r.content::jsonb -> 'pagar'   -> 'raio_x' -> 'exemplos_com_ajuste'    as pagar_com_ajuste,
       r.content::jsonb -> 'receber' -> 'raio_x' -> 'exemplos_parcial'       as receber_parcial,
       r.content::jsonb -> 'receber' -> 'raio_x' -> 'exemplo_simples'        as receber_simples,
       r.content::jsonb ->> 'mensagem'                                       as mensagem
  from net._http_response r
 where r.content like '%bling2-contas-ensaio%'
 order by r.created desc
 limit 1;
