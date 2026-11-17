-- Esteira: conferência dos robôs num resultado só (só leitura; roda também o vigia, como o cron faz).
-- ESPERADO, campo a campo:
--   rastreio_ultima.http = 200 · quando = de minutos atrás · fila_aberta.mais_antigo de minutos/poucas horas
--   rastreio_ultimas3_pararam_por_tempo < 3          (3 = falta capacidade)
--   erros_24h = só 200 e poucos 4xx/5xx · timeouts_24h = 0
--   sem_detalhe_bling2 pequeno e caindo · esteira_estado.ultima_leitura de < 2 min atrás
--   vigia_agora.problemas = {}  (qualquer chave aí é o que o TI vai receber)
select jsonb_pretty(jsonb_build_object(
  'rastreio_ultima', (select jsonb_build_object('quando', created, 'http', status_code,
        'rodadas', c->'rodadas', 'parou_por_tempo', c->'parou_por_tempo', 'fila_aberta', c->'fila_aberta')
      from (select created, status_code, case when content like '{%' then content::jsonb end as c
              from net._http_response where content like '%fila_aberta%' order by created desc limit 1) t),
  'rastreio_ultimas3_pararam_por_tempo', (select count(*) from (
      select case when content like '{%' then (content::jsonb ->> 'parou_por_tempo') end as p
        from net._http_response where content like '%fila_aberta%' order by created desc limit 3) t where p = 'true'),
  'melhor_envio_ultima', (select jsonb_build_object('quando', created, 'http', status_code, 'corpo', left(content, 300))
      from net._http_response where content like '%reconferencia%' order by created desc limit 1),
  'erros_24h', (select coalesce(jsonb_object_agg(coalesce(status_code::text, 'sem_resposta'), n), '{}'::jsonb) from (
      select status_code, count(*) n from net._http_response
       where created > now() - interval '24 hours' group by 1) t),
  'timeouts_24h', (select count(*) from net._http_response
      where created > now() - interval '24 hours' and content like '%statement timeout%'),
  'sem_detalhe_bling2', (select count(*) from public.bling2_orders where items is null or raw_detalhe is null),
  'esteira_estado', (select to_jsonb(e) from public.carbo_esteira_estado e limit 1),
  'vigia_agora', public.carbo_esteira_vigiar_fontes()
)) as conferencia;
