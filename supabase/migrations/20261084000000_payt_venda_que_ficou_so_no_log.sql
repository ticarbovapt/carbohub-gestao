-- =====================================================================
-- PayT: a venda que ficou só no LOG CRU volta sozinha (15/10/2026).
--
-- Medido: compra EYEZ2VV (R$ 59,90, Kit 10 Sachês Moto, carrinho 78BZDWW) —
-- a principal de um upsell (ZY2OB8M, R$ 119,60, mesmo carrinho). O postback
-- chegou PAGO, está em `payt_eventos` com resultado "1 linha(s)" e a linha em
-- `ecommerce_orders` NÃO EXISTE. Regravá-la à mão passa sem erro: a recusa foi
-- passageira, e a PayT não reenviou.
--
-- Efeitos: o card "Pedido 78BZDWW" no Pago mostrava R$ 119,60 em vez de
-- R$ 179,50, e o aviso interno de venda saiu só para o upsell.
--
-- Como a PayT manda upsell (é a pergunta do dono do processo): TRANSAÇÃO
-- SEPARADA, postback separado, MESMO `cart_id`. O sistema já junta pelo
-- carrinho — o desenho está certo; o que faltou foi a linha da principal.
--
-- O conserto, em duas partes:
--   1. O webhook passa a marcar no log se a gravação DEU CERTO (`gravado_em`)
--      ou o erro (`erro`). Antes o "1 linha(s)" era escrito ANTES de gravar, e
--      dizia sucesso sobre o que não aconteceu.
--   2. `ecommerce-webhook/payt-reprocessar` (cron 10 min) relê os eventos dos
--      últimos 7 dias pelo MESMO parser do webhook e insere SÓ as linhas que
--      faltam — nunca atualiza (evento velho rebaixaria uma venda paga).
--
-- ⚠️ ORDEM: o push em main deploya o webhook. Rode os BLOCOS 0, 1 e 2 já; o 3
-- só depois de o Actions "Deploy Edge Functions" terminar (senão a função no
-- ar ainda não conhece a rota e devolve 400 "Unknown platform").
-- =====================================================================

-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 0 — vendas PayT que estão no log e não viraram pedido        ║
-- ║           (só leitura, TODO o histórico)                            ║
-- ╚═══════════════════════════════════════════════════════════════════╝
-- ESPERADO: a EYEZ2VV. Linha a mais = outra venda perdida — me mande; se for
-- de mais de 7 dias atrás, o reprocessamento não a alcança e eu alargo.
with ultimo as (
  select distinct on (transaction_id)
         transaction_id, cart_id, status, recebido_em, resultado,
         corpo->'product'->>'name'          as produto,
         corpo->'transaction'->>'total_price' as total_centavos
    from public.payt_eventos
   where not eh_teste and transaction_id is not null
   order by transaction_id, recebido_em desc
)
select u.*
  from ultimo u
 where u.resultado like '%linha(s)%'
   and not exists (select 1 from public.ecommerce_orders o
                    where o.platform = 'payt'
                      and split_part(o.order_id, '-', 1) = u.transaction_id)
 order by u.recebido_em;

-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 1 — o log passa a dizer se GRAVOU                            ║
-- ╚═══════════════════════════════════════════════════════════════════╝
alter table public.payt_eventos add column if not exists gravado_em timestamptz;
comment on column public.payt_eventos.gravado_em is
  'Quando as linhas deste evento entraram em ecommerce_orders (webhook ou reprocessamento). Nulo com resultado "N linha(s)" = o parser montou e a gravação NÃO aconteceu — é a lista de trabalho.';

-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 2 — o reprocessamento a cada 10 min                          ║
-- ╚═══════════════════════════════════════════════════════════════════╝
-- O segredo é COPIADO do job que comprovadamente funciona, nunca digitado
-- (molde da 20261036). Aborta se não conseguir ler.
do $fix$
declare
  v_secret text;
  v_cmd    text;
  j        bigint;
begin
  select (regexp_match(command, 'X-Cron-Secret''\s*,\s*''([^'']+)'''))[1]
    into v_secret
    from cron.job where jobname = 'bling2-sync-incremental' limit 1;

  if v_secret is null or btrim(v_secret) = '' then
    raise exception 'Nao consegui ler o X-Cron-Secret do job bling2-sync-incremental. Nada foi agendado.';
  end if;

  for j in select jobid from cron.job where jobname = 'payt-reprocessar-10min' loop
    perform cron.unschedule(j);
  end loop;

  v_cmd := format(
    'select net.http_post(url := %L, headers := jsonb_build_object(%L, %L, %L, %L), body := %L::jsonb) as request_id;',
    'https://wpkfirmapxevzpxjovjr.supabase.co/functions/v1/ecommerce-webhook/payt-reprocessar',
    'Content-Type',  'application/json',
    'X-Cron-Secret', v_secret,
    '{"source":"cron-payt-reprocessar"}'
  );

  -- Minuto :19 (e 29, 39…): ímpar e fora da grade cheia.
  perform cron.schedule('payt-reprocessar-10min', '19-59/10 * * * *', v_cmd);
  raise notice 'payt-reprocessar-10min agendado.';
end $fix$;

-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 3 — roda UMA vez agora (depois do deploy!)                   ║
-- ╚═══════════════════════════════════════════════════════════════════╝
-- select net.http_post(
--   url     := 'https://wpkfirmapxevzpxjovjr.supabase.co/functions/v1/ecommerce-webhook/payt-reprocessar',
--   headers := jsonb_build_object('Content-Type', 'application/json', 'X-Cron-Secret',
--                (select (regexp_match(command, 'X-Cron-Secret''\s*,\s*''([^'']+)'''))[1]
--                   from cron.job where jobname = 'bling2-sync-incremental' limit 1)),
--   body    := '{"source":"manual"}'::jsonb) as request_id;

-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 4 — a resposta (uns segundos depois do 3)                    ║
-- ╚═══════════════════════════════════════════════════════════════════╝
-- ESPERADO: 200 com "gravados":["EYEZ2VV-RWE8JW"]. ⚠️ Olhe AQUI, nunca em
-- cron.job_run_details: aquele diz `succeeded` só por ter postado.
-- select status_code, left(content, 400) as resposta, created
--   from net._http_response
--  where content like '%"transacoes"%'
--  order by created desc limit 3;
