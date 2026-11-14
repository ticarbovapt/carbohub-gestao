-- ═══════════════════════════════════════════════════════════════════════════
-- Raio-x da Esteira do On-line — SÓ LEITURA. Rode UMA consulta por vez: o SQL
-- Editor mostra só o resultado da última de um bloco.
-- O que cada número significa e o que fazer com ele: docs/esteira/README.md.
-- ═══════════════════════════════════════════════════════════════════════════


-- (a) Tamanho da esteira e quanto é peso morto (P1).
--     Quem decide o corte é "entregue há mais de N dias": a régua de recompra
--     precisa dos entregues até ~75 dias (45 para ofertar + 30 para desistir).
select etapa, count(*) as cards,
       count(*) filter (where data_pedido < current_date - 60)  as mais_de_60_dias,
       count(*) filter (where data_pedido < current_date - 120) as mais_de_120_dias
  from public.bling2_esteira
 group by 1 order by 2 desc;


-- (b) Quanto a fila do WhatsApp leva hoje (P1). Olhe "Execution Time" na
--     última linha. Abaixo de ~3.000 ms está bem; acima de ~5.000 ms é perigo
--     (o limite do whatsapp-meta é 8 s, e estourou duas vezes).
explain (analyze, buffers off) select count(*) from public.carbo_msg_fila;


-- (c) Timeouts nas últimas 24 h, em qualquer função chamada por cron.
--     Esperado: timeouts = 0.
select count(*) filter (where content like '%statement timeout%') as timeouts,
       count(*) as respostas
  from net._http_response
 where created > now() - interval '24 hours';


-- (d) Etiquetas abertas dos últimos 30 dias por situação do VÍNCULO (P3).
--     Tudo deveria estar vinculado; "sem_match"/"ambiguo" é card que não anda.
select coalesce(vinculo_status, '(nulo)') as vinculo, count(*) as envios
  from public.melhorenvio_envios
 where gerado_em > now() - interval '30 days'
   and cancelado_em is null and expirado_em is null and entregue_em is null
 group by 1 order by 2 desc;


-- (e) As duas contas do Mercado Livre (P4). Erro recente = o 429 voltando.
select platform_key, status, last_synced_at, left(last_error, 120) as ultimo_erro
  from public.ml_accounts;


-- (f) A reconferência do Melhor Envio está girando? (P5)
--     Esperado depois do deploy de 13/11: sem_conferir_ha_2h perto de zero.
select count(*) filter (where atualizado_em < now() - interval '2 hours') as sem_conferir_ha_2h,
       count(*) as abertos_no_espelho,
       min(atualizado_em) as conferido_ha_mais_tempo
  from public.melhorenvio_envios
 where gerado_em is not null and entregue_em is null
   and cancelado_em is null and expirado_em is null;


-- (g) Cards cujo rastreio veio SÓ do Melhor Envio (P9): para eles a view não
--     lê `rastreio_envios` (previsão, devolução, problema).
select rastreio_origem, count(*) as cards
  from public.bling2_esteira
 where etapa in ('etiqueta', 'em_transito')
 group by 1 order by 2 desc;
