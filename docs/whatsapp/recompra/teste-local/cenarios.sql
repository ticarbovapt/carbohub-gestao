-- Cenários da régua de 7 dias. Telefones e nomes FICTÍCIOS (DDD 00).
\set ON_ERROR_STOP 1
create or replace function pg_temp.ok(cond boolean, msg text) returns void language plpgsql as $$
begin if not coalesce(cond, false) then raise exception 'FALHOU: %', msg; end if; raise notice 'ok: %', msg; end $$;

-- itens no Bling
insert into bling2_orders values
 (1,  '[{"codigo":"KIT-CARB-SACH-10ML","descricao":"CarboZé Kit 10 Sachês Moto"}]', 1),
 (2,  '[{"codigo":"CZ100","descricao":"CarboZé Kit 5 Frascos 100ml"}]', 2),
 (3,  '[{"codigo":"CZ100","descricao":"CarboZé Kit 5 Frascos 100ml"}]', 3),
 (4,  '[{"codigo":"KIT-CARB-SACH-10ML","descricao":"Kit 10 Sachês"}]', 4),
 (5,  '[{"descricao":"Kit 10 Sachês"}]', 5),
 (6,  '[{"descricao":"Kit 10 Sachês"}]', 6),
 (7,  '[{"descricao":"Kit 10 Sachês"}]', 7),
 (8,  '[{"descricao":"Kit 10 Sachês"}]', 8),
 (9,  '[{"descricao":"Kit 10 Sachês"}]', 9),
 (10, '[{"descricao":"Kit 10 Sachês"}]', 10),
 (11, '[{"descricao":"Kit 10 Sachês"}]', 11),
 (12, '[{"descricao":"Kit 10 Sachês"}]', 12),
 (13, '[{"descricao":"Kit 10 Sachês"},{"codigo":"CZ100","descricao":"Frascos"}]', 13),
 (14, '[{"descricao":"CarboZé 1 Litro"}]', 14),
 (15, '[{"descricao":"Kit 10 Sachês"}]', 15),
 (16, null, 16);

-- a base (o gatilho preenche o fluxo)
insert into carbo_recompra_base (bling_id, cliente, cliente_fone, total, entregue_em, origem, ofertado_em, recomprou) values
 (1,  'Ana Teste',     '(00) 90000-0001', 59.9,  now() - interval '31 days', 'rastreio', null, false),  -- sachê na hora
 (2,  'Bruno Teste',   '(00) 90000-0002', 149.5, now() - interval '31 days', 'rastreio', null, false),  -- frasco descansando
 (3,  'Carla Teste',   '(00) 90000-0003', 149.5, now() - interval '46 days', 'rastreio', null, false),  -- frasco na hora
 (4,  'Davi Teste',    '(00) 90000-0004', 59.9,  now() - interval '33 days', 'rastreio', null, false),  -- Dia 1 há 2 dias
 (5,  'Elsa Teste',    '(00) 90000-0005', 59.9,  now() - interval '36 days', 'rastreio', null, false),  -- N=5 → Dia 6
 (6,  'Fabio Teste',   '(00) 90000-0006', 59.9,  now() - interval '37 days', 'rastreio', null, false),  -- N=6 → Dia 7
 (7,  'Gina Teste',    '(00) 90000-0007', 59.9,  now() - interval '38 days', 'rastreio', null, false),  -- N=7 → acabou
 (8,  'Hugo Teste',    '(00) 90000-0008', 59.9,  now() - interval '33 days', 'rastreio', null, false),  -- tentou hoje
 (9,  'Iris Teste',    '(00) 90000-0009', 59.9,  now() - interval '33 days', 'rastreio', null, false),  -- 131049 ontem
 (10, 'Joao Teste',    '(00) 90000-0010', 59.9,  now() - interval '31 days', 'rastreio', null, false),  -- carrinho aberto
 (11, 'Kai Teste',     '(00) 90000-0011', 59.9,  now() - interval '31 days', 'rastreio', null, false),  -- não contatar
 (12, 'Lia Teste',     '(00) 90000-0012', 59.9,  now() - interval '33 days', 'rastreio', null, false),  -- comprou na loja
 (13, 'Mia Teste',     '(00) 90000-0013', 99,    now() - interval '10 days', 'rastreio', null, false),  -- misto → frasco
 (14, 'Nilo Teste',    '(00) 90000-0014', 99,    now() - interval '10 days', 'rastreio', null, false),  -- sem casamento → frasco
 (15, 'Olga Teste',    '(00) 90000-0015', 59.9,  now() - interval '40 days', 'rastreio', null, false),  -- antes do marco
 (16, 'Paulo Teste',   '(00) 90000-0016', 59.9,  now() - interval '50 days', 'rastreio', now() - interval '20 days', false); -- oferta antiga

select pg_temp.ok((select fluxo from carbo_recompra_base where bling_id = 1)  = 'sache',  'sachê vira fluxo sache');
select pg_temp.ok((select fluxo from carbo_recompra_base where bling_id = 2)  = 'frasco', 'frasco vira fluxo frasco');
select pg_temp.ok((select fluxo from carbo_recompra_base where bling_id = 13) = 'frasco', 'pedido misto vai para frasco');
select pg_temp.ok((select fluxo from carbo_recompra_base where bling_id = 14) = 'frasco', 'sem casamento vai para o padrão');
select pg_temp.ok((select fluxo from carbo_recompra_base where bling_id = 16) = 'frasco', 'sem itens vai para o padrão');

-- envios da régua nova (horário = a hora cheia de agora, N dias atrás)
insert into carbo_msg_envios (bling_id, etapa, status, enviado_em) values
 (4, 'recompra_sache_d1', 'lido',     date_trunc('hour', now()) - interval '2 days'),
 (5, 'recompra_sache_d1', 'entregue', date_trunc('hour', now()) - interval '5 days'),
 (5, 'recompra_sache_d2', 'entregue', date_trunc('hour', now()) - interval '4 days'),
 (6, 'recompra_sache_d1', 'entregue', date_trunc('hour', now()) - interval '6 days'),
 (6, 'recompra_sache_d2', 'entregue', date_trunc('hour', now()) - interval '5 days'),
 (6, 'recompra_sache_d3', 'entregue', date_trunc('hour', now()) - interval '4 days'),
 (6, 'recompra_sache_d4', 'entregue', date_trunc('hour', now()) - interval '3 days'),
 (6, 'recompra_sache_d5', 'entregue', date_trunc('hour', now()) - interval '2 days'),
 (6, 'recompra_sache_d6', 'entregue', date_trunc('hour', now()) - interval '1 days'),
 (7, 'recompra_sache_d1', 'entregue', date_trunc('hour', now()) - interval '7 days'),
 (8, 'recompra_sache_d1', 'entregue', date_trunc('hour', now()) - interval '2 days'),
 (8, 'recompra_sache_d2', 'enviado',  now() - interval '1 minute'),
 (9, 'recompra_sache_d1', 'entregue', date_trunc('hour', now()) - interval '2 days'),
 (12,'recompra_sache_d1', 'entregue', date_trunc('hour', now()) - interval '2 days');
insert into carbo_msg_envios (bling_id, etapa, status, enviado_em, erro_codigo) values
 (9, 'recompra_sache_d2', 'falhou', date_trunc('hour', now()) - interval '1 days', 131049);

-- carrinho aberto, não contatar, compra na loja
insert into nuvemshop_carrinhos values (900, now() - interval '1 day', null, 'Joao Teste', '+55 00 90000-0010', null, 59.9, 'Kit', 'https://x');
insert into carbo_wa_nao_contatar (chave, motivo) values (carbo_fone_chave('00900000011'), 'teste');
insert into ecommerce_orders values ('payt', 'X1', now() - interval '1 day', 'paid', '5500900000012');

-- ── a pipeline ──
select pg_temp.ok((select coluna from carbo_recompra_pipeline where bling_id = 1) = 'ofertar', 'sachê com 31 dias: ofertar');
select pg_temp.ok((select coluna from carbo_recompra_pipeline where bling_id = 2) = 'entregue', 'frasco com 31 dias: descansando (45)');
select pg_temp.ok((select coluna from carbo_recompra_pipeline where bling_id = 3) = 'ofertar', 'frasco com 46 dias: ofertar');
select pg_temp.ok((select coluna||'/'||dia_da_regua from carbo_recompra_pipeline where bling_id = 4) = 'dia_1/3', 'Dia 1 há 2 dias: dia_1, 3º dia da régua');
select pg_temp.ok((select coluna from carbo_recompra_pipeline where bling_id = 6) = 'dia_6', 'Fabio no dia_6');
select pg_temp.ok((select coluna from carbo_recompra_pipeline where bling_id = 7) = 'sem_retorno', 'depois do 7º dia: sem_retorno');
select pg_temp.ok((select coluna from carbo_recompra_pipeline where bling_id = 15) = 'sem_retorno', 'entrou antes do marco: não entra');
select pg_temp.ok((select coluna from carbo_recompra_pipeline where bling_id = 16) = 'sem_retorno', 'oferta antiga passou do prazo: sem_retorno');

-- ── o que sai hoje (D1 novo ainda NÃO pronto → passo 1 sai como a antiga) ──
select pg_temp.ok((select etapa from carbo_recompra_devido where bling_id = 1) = 'recompra', 'sem o D1 novo ligado, sai a oferta antiga');
select pg_temp.ok((select etapa from carbo_recompra_devido where bling_id = 4) = 'recompra_sache_d2', 'Davi: Dia 2');
select pg_temp.ok((select etapa from carbo_recompra_devido where bling_id = 5) = 'recompra_sache_d6', 'Elsa: N=5 pula para o Dia 6 (fixo)');
select pg_temp.ok((select etapa from carbo_recompra_devido where bling_id = 6) = 'recompra_sache_d7', 'Fabio: Dia 7 no último dia');
select pg_temp.ok(not exists (select 1 from carbo_recompra_devido where bling_id = 7),  'Gina: acabou, nada sai');
select pg_temp.ok(not exists (select 1 from carbo_recompra_devido where bling_id = 8),  'Hugo: já tentou hoje, só amanhã');
select pg_temp.ok((select etapa from carbo_recompra_devido where bling_id = 9) = 'recompra_sache_d2', 'Iris: 131049 ontem → reenvia o Dia 2');
select pg_temp.ok(not exists (select 1 from carbo_recompra_devido where bling_id = 10), 'Joao: carrinho aberto pausa');
select pg_temp.ok(not exists (select 1 from carbo_recompra_devido where bling_id = 11), 'Kai: não contatar');
select pg_temp.ok(not exists (select 1 from carbo_recompra_devido where bling_id = 12), 'Lia: comprou na loja depois do Dia 1');
select pg_temp.ok(not exists (select 1 from carbo_recompra_devido where bling_id in (2, 13, 14, 15, 16)), 'quem não está na hora não sai');

-- ── liga os templates novos (aprovados) e confere a fila ──
update carbo_msg_templates set ativo = true, meta_status = 'APPROVED', hora_inicio = 0, hora_fim = 24
 where etapa ~ '^recompra_[a-z]+_d[1-7]$';
select pg_temp.ok((select etapa from carbo_recompra_devido where bling_id = 1) = 'recompra_sache_d1', 'D1 ligado: sai o Dia 1 novo');
select pg_temp.ok((select etapa from carbo_recompra_devido where bling_id = 3) = 'recompra_frasco_d1', 'frasco: Dia 1 de frasco');
select pg_temp.ok((select string_agg(bling_id || ':' || etapa || ':' || prioridade, ',' order by bling_id)
                     from carbo_msg_fila where etapa like 'recompra%')
                  = '1:recompra_sache_d1:1,3:recompra_frasco_d1:1,4:recompra_sache_d2:1,5:recompra_sache_d6:1,6:recompra_sache_d7:1,9:recompra_sache_d2:1',
                  'a fila traz os passos certos, como comercial');
select pg_temp.ok((select primeiro_nome from carbo_msg_fila where bling_id = 1) = 'Ana', 'primeiro_nome na fila');
select pg_temp.ok((select meta_template_nome from carbo_msg_fila where bling_id = 4) = 'carboze_recompra_sache_d2', 'template certo');
-- o 131049 de HOJE não volta à fila
update carbo_msg_envios set enviado_em = now() - interval '1 minute' where bling_id = 9 and etapa = 'recompra_sache_d2';
select pg_temp.ok(not exists (select 1 from carbo_msg_fila where bling_id = 9), '131049 de hoje: só amanhã');
-- falha que NÃO é 131049 não volta nunca
update carbo_msg_envios set enviado_em = now() - interval '1 day', erro_codigo = 131026 where bling_id = 9 and etapa = 'recompra_sache_d2';
select pg_temp.ok(not exists (select 1 from carbo_msg_fila where bling_id = 9), 'falha definitiva não volta');
-- o serviço não mudou
insert into bling2_esteira (bling_id, etapa, cliente_fone, cliente, data_pedido) values (500, 'entregue', '00900000500', 'Serviço Teste', current_date);
select pg_temp.ok((select prioridade from carbo_msg_fila where bling_id = 500 and etapa = 'entregue') = 0, 'aviso de entrega segue prioridade 0');

-- ── o link ──
select pg_temp.ok(carbo_recompra_definir_link('sache', 'https://checkout.exemplo/sache') = 7, 'link nos 7 de sachê');
select pg_temp.ok((select meta_variaveis->1->>'fallback' from carbo_msg_templates where etapa = 'recompra_sache_d4') = 'https://checkout.exemplo/sache', 'fallback gravado');
select pg_temp.ok((select meta_variaveis->1->>'fallback' from carbo_msg_templates where etapa = 'recompra_frasco_d4') is null, 'frasco sem link continua segurando');
do $$ begin perform carbo_recompra_definir_link('sache', 'http://inseguro'); raise exception 'devia recusar'; exception when others then
  if sqlerrm = 'devia recusar' then raise; end if; raise notice 'ok: link sem https recusado'; end $$;

-- ── pediu para parar ──
insert into carbo_wa_mensagens values
 ('w1', '5500900000020', '1274076859132981', 'entrada', 'text', 'Parar', now()),
 ('w2', '5500900000021', '1274076859132981', 'entrada', 'text', 'pode parar de mandar o boleto?', now()),
 ('w3', '5500900000022', '1274076859132981', 'entrada', 'text', 'Não quero mais receber mensagens, por favor', now()),
 ('w4', '5500900000023', '1274076859132981', 'entrada', 'text', 'me tira dessa lista', now()),
 ('w5', '5500900000024', '1274076859132981', 'saida',   'text', 'parar', now());
insert into carbo_msg_envios (bling_id, etapa, status, enviado_em, erro_codigo, wa_id) values (777, 'recompra_sache_d1', 'falhou', now(), 131050, '5500900000025');
select carbo_wa_optout_automatico();
select pg_temp.ok((select count(*) from carbo_wa_nao_contatar where chave in (carbo_fone_chave('5500900000020'), carbo_fone_chave('5500900000022'), carbo_fone_chave('5500900000023'), carbo_fone_chave('5500900000025'))) = 4, 'parar, não quero mais, me tira da lista e 131050 viram não contatar');
select pg_temp.ok(not exists (select 1 from carbo_wa_nao_contatar where chave in (carbo_fone_chave('5500900000021'), carbo_fone_chave('5500900000024'))), 'frase com "parar" no meio e mensagem NOSSA não contam');
-- desmarcado à mão não volta pela mensagem antiga
update carbo_wa_nao_contatar set removido_em = now() + interval '1 second' where chave = carbo_fone_chave('5500900000020');
update carbo_wa_optout_estado set ultima_leitura = null;
select carbo_wa_optout_automatico();
select pg_temp.ok((select removido_em is not null from carbo_wa_nao_contatar where chave = carbo_fone_chave('5500900000020')), 'desmarcar à mão vale contra a mensagem antiga');

-- ── mesmo horário: o Dia 2 espera a HORA em que o Dia 1 saiu ──
insert into bling2_orders values (40, '[{"descricao":"Kit 10 Sachês"}]', 40);
insert into carbo_recompra_base (bling_id, cliente, cliente_fone, total, entregue_em, origem, recomprou) values (40, 'Rita Teste', '(00) 90000-0040', 59.9, now() - interval '33 days', 'rastreio', false);
insert into carbo_msg_envios (bling_id, etapa, status, enviado_em) values (40, 'recompra_sache_d1', 'lido', date_trunc('hour', now()) + interval '1 hour' - interval '2 days');
select pg_temp.ok(not exists (select 1 from carbo_recompra_devido where bling_id = 40), 'Dia 2 espera a hora em que o Dia 1 saiu');
