-- Raio-x da esteira de RECUPERAÇÃO DE CARRINHO (só leitura). Rode UM bloco por vez.
-- ⚠️ O SQL Editor mostra só o resultado da ÚLTIMA consulta: um SELECT por execução.

-- BLOCO 1 — a view responde? (SQL Editor roda como dono; a tela roda como o usuário)
-- ESPERADO: uma linha por coluna, com contagem. Erro aqui = a view está quebrada.
select coluna, count(*) as n, min(abandonado_em) as mais_antigo, max(abandonado_em) as mais_novo
  from public.carbo_carrinho_pipeline group by 1 order by 2 desc;

-- BLOCO 2 — o espelho tem carrinho, e de quando?
-- ESPERADO: mais_novo de minutos atrás. Se for de dias: o sync parou.
select count(*) as total,
       count(*) filter (where abandonado_em > now() - interval '24 hours') as ult_24h,
       count(*) filter (where telefone is not null and telefone <> '') as com_telefone,
       count(*) filter (where checkout_id < 0) as da_payt,
       max(abandonado_em) as mais_novo, max(atualizado_em) as ultima_gravacao
  from public.nuvemshop_carrinhos;

-- BLOCO 3 — marco zero e janelas
select * from public.carbo_carrinho_config;

-- BLOCO 4 — os três templates: ligados? aprovados? por qual número?
select etapa, ativo, canal_envio, meta_status, meta_template_nome, numero_id,
       hora_inicio, hora_fim, dias_uteis, teto_diario
  from public.carbo_msg_templates where etapa like 'carrinho%' order by etapa;

-- BLOCO 5 — o número da loja está ativo e registrado?
select * from public.carbo_wa_numeros order by 1;

-- BLOCO 6 — já saiu alguma mensagem de carrinho? (por dia/status)
select etapa, status, date_trunc('day', coalesce(enviado_em, detectado_em)) as dia, count(*)
  from public.carbo_msg_envios where etapa like 'carrinho%' group by 1,2,3 order by 3 desc, 1 limit 40;

-- BLOCO 7 — os crons vivos
select jobname, schedule, active from cron.job
 where jobname ilike '%carrinho%' or jobname ilike '%payt%' or jobname ilike '%whatsapp-meta%' order by 1;

-- BLOCO 8 — o desfecho REAL das últimas chamadas (não o `succeeded` do cron)
select r.created, r.status_code, left(r.content, 300) as corpo
  from net._http_response r
 where r.content ilike '%carrinho%' or r.content ilike '%checkouts%' or r.content ilike '%Nuvemshop%'
 order by r.created desc limit 10;

-- BLOCO 9 — a Nuvemshop está conectada?
select id, (access_token is not null) as tem_token, left(coalesce(updated_at::text,''),19) as atualizado from public.system_tokens where id = 'nuvemshop';
