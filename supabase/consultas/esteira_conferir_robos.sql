-- Esteira: o que os robôs REALMENTE devolveram depois do deploy de 16/11 (só leitura).
-- ⚠️ O `pg_cron` marca `succeeded` quando o POST SAIU; o desfecho de verdade está em
-- `net._http_response`. Rode UM bloco por vez (o editor mostra só o último resultado).

-- BLOCO 1 — rastreio-sync: o retrato da fila e se a rodada fechou.
-- ESPERADO: status 200; `fila_aberta.mais_antigo` de minutos/poucas horas; `nunca_consultados` perto de 0;
--   `parou_por_tempo` false na maioria das linhas. Se `mais_antigo` for de HORAS e `parou_por_tempo`
--   vier true em várias: falta capacidade (aumentar o orçamento de tempo / dividir a rodada).
select created, status_code,
       content::jsonb -> 'fila_aberta'    as fila_aberta,
       content::jsonb ->> 'rodadas'       as rodadas,
       content::jsonb ->> 'gravados'      as gravados,
       content::jsonb ->> 'parou_por_tempo' as parou_por_tempo,
       left(content, 200) as inicio_do_corpo
  from net._http_response
 where content like '%fila_aberta%'
 order by created desc limit 12;

-- BLOCO 2 — melhor-envio-envios: a reconferência por tempo.
-- ESPERADO: status 200 e a chave `reconferencia` presente. Anote o que ela diz (reconferidos / preenchidos).
select created, status_code, left(content, 500) as corpo
  from net._http_response
 where content like '%reconferencia%'
 order by created desc limit 6;

-- BLOCO 3 — bling2-sync: a fila de detalhes (order_details) está drenando?
-- ESPERADO: `sem_detalhe` pequeno e CAINDO entre as medições (é a fila que dá `raw_detalhe`, que dá a NF).
select count(*) filter (where items is null or raw_detalhe is null) as sem_detalhe,
       count(*) filter (where data > current_date - 7 and (items is null or raw_detalhe is null)) as sem_detalhe_7d,
       count(*) as total
  from public.bling2_orders;

-- BLOCO 4 — ecommerce-sync (ML): respostas de hoje. (Já vistas: 200 com `synced` — aqui procuro o que NÃO é 200.)
-- ESPERADO: ZERO linhas. Qualquer 429/500 aqui é o limite do ML ou erro nosso.
select created, status_code, left(content, 300) as corpo
  from net._http_response
 where created > now() - interval '24 hours'
   and (content like '%mercadolivre%' or content like '%synced%')
   and (status_code <> 200 or content ilike '%429%' or content ilike '%rate_limit%' or content ilike '%error%')
 order by created desc limit 15;

-- BLOCO 5 — o placar geral das respostas HTTP das últimas 24 h (todas as funções).
-- ESPERADO: quase tudo 200. Timeout/erro concentrado numa função mostra quem está doente.
select status_code, count(*) as n,
       count(*) filter (where content ilike '%statement timeout%') as timeouts
  from net._http_response
 where created > now() - interval '24 hours'
 group by 1 order by n desc;

-- BLOCO 6 — os robôs da esteira em tabela: estão em dia?
-- ESPERADO: `ultima_leitura` de menos de 2 min atrás.
select * from public.carbo_esteira_estado;

-- BLOCO 7 — os alarmes do TI das últimas 24 h (o que o vigia já viu).
-- ESPERADO: vazio, ou só avisos já resolvidos ("normalizada").
select created_at, type, title, left(coalesce(body, ''), 140) as mensagem
  from public.notifications
 where created_at > now() - interval '24 hours'
   and (type like 'esteira%' or type like 'ddl%' or title ilike '%esteira%' or title ilike '%DDL%' or title ilike '%fila%')
 order by created_at desc limit 20;
