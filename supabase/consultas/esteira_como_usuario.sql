-- Esteira: o tempo de CADA leitura da tela, COMO O USUÁRIO LOGADO (só leitura).
-- Motivo: o quadro de carrinho zerou porque a view levava 18 s sob RLS e o limite da
-- API é 8 s — e eu só tinha medido como dono. Aqui cada leitura roda no papel
-- `authenticated`, com o limite de 8 s da API; estourou = a tela mostra vazio/erro.
--
-- COMO RODAR: cole TUDO de uma vez (um único clique em Run). Troque SEU_EMAIL.
-- RESULTADO: a tabela final, da mais lenta para a mais rápida.
--   veredito 'ok'              < 3 s    folga
--   veredito 'LENTA'           3–8 s    passa hoje e estoura com o crescimento
--   veredito 'ESTOURA (8 s)'   > 8 s    a tela já está quebrada nesta leitura
--   veredito 'erro: …'         a consulta falhou (permissão, coluna ausente…)
-- Nada é gravado: o `rollback` do fim desfaz tudo.
begin;

create temp table _sonda (ordem int, leitura text, ms numeric, linhas bigint, kb numeric, veredito text);
grant all on _sonda to authenticated;

select set_config('request.jwt.claims',
  json_build_object('sub', (select id from auth.users where email = 'SEU_EMAIL'),
                    'role', 'authenticated')::text, true);
set local role authenticated;


set local statement_timeout = '8s';
do $$
declare t0 timestamptz := clock_timestamp(); v_n bigint; v_kb numeric; v_ms numeric;
begin
  begin
    execute 'select count(*), coalesce(sum(length(q::text)), 0) / 1024.0 from (select * from public.bling2_esteira where data_pedido >= current_date - 30 and data_pedido <= current_date order by data_pedido desc, bling_id desc limit 1000) q' into v_n, v_kb;
    v_ms := round(extract(epoch from clock_timestamp() - t0) * 1000);
    insert into _sonda values (1, 'esteira 30 dias · pág. 1', v_ms, v_n, round(v_kb, 0),
      case when v_ms < 3000 then 'ok' when v_ms < 8000 then 'LENTA' else 'ESTOURA (8 s)' end);
  exception when query_canceled then
    insert into _sonda values (1, 'esteira 30 dias · pág. 1', round(extract(epoch from clock_timestamp() - t0) * 1000), null, null, 'ESTOURA (8 s)');
  when others then
    insert into _sonda values (1, 'esteira 30 dias · pág. 1', round(extract(epoch from clock_timestamp() - t0) * 1000), null, null, 'erro: ' || left(sqlerrm, 90));
  end;
end $$;

set local statement_timeout = '8s';
do $$
declare t0 timestamptz := clock_timestamp(); v_n bigint; v_kb numeric; v_ms numeric;
begin
  begin
    execute 'select count(*), coalesce(sum(length(q::text)), 0) / 1024.0 from (select * from public.bling2_esteira where data_pedido >= current_date - 30 and data_pedido <= current_date order by data_pedido desc, bling_id desc limit 1000 offset 1000) q' into v_n, v_kb;
    v_ms := round(extract(epoch from clock_timestamp() - t0) * 1000);
    insert into _sonda values (2, 'esteira 30 dias · pág. 2', v_ms, v_n, round(v_kb, 0),
      case when v_ms < 3000 then 'ok' when v_ms < 8000 then 'LENTA' else 'ESTOURA (8 s)' end);
  exception when query_canceled then
    insert into _sonda values (2, 'esteira 30 dias · pág. 2', round(extract(epoch from clock_timestamp() - t0) * 1000), null, null, 'ESTOURA (8 s)');
  when others then
    insert into _sonda values (2, 'esteira 30 dias · pág. 2', round(extract(epoch from clock_timestamp() - t0) * 1000), null, null, 'erro: ' || left(sqlerrm, 90));
  end;
end $$;

set local statement_timeout = '8s';
do $$
declare t0 timestamptz := clock_timestamp(); v_n bigint; v_kb numeric; v_ms numeric;
begin
  begin
    execute 'select count(*), coalesce(sum(length(q::text)), 0) / 1024.0 from (select * from public.bling2_esteira where data_pedido < current_date - 30 and etapa not in (''entregue'',''cancelado'') order by data_pedido, bling_id limit 1000) q' into v_n, v_kb;
    v_ms := round(extract(epoch from clock_timestamp() - t0) * 1000);
    insert into _sonda values (3, 'esteira · travados antigos', v_ms, v_n, round(v_kb, 0),
      case when v_ms < 3000 then 'ok' when v_ms < 8000 then 'LENTA' else 'ESTOURA (8 s)' end);
  exception when query_canceled then
    insert into _sonda values (3, 'esteira · travados antigos', round(extract(epoch from clock_timestamp() - t0) * 1000), null, null, 'ESTOURA (8 s)');
  when others then
    insert into _sonda values (3, 'esteira · travados antigos', round(extract(epoch from clock_timestamp() - t0) * 1000), null, null, 'erro: ' || left(sqlerrm, 90));
  end;
end $$;

set local statement_timeout = '8s';
do $$
declare t0 timestamptz := clock_timestamp(); v_n bigint; v_kb numeric; v_ms numeric;
begin
  begin
    execute 'select count(*), coalesce(sum(length(q::text)), 0) / 1024.0 from (select bling_id,etapa,dias_parado,limite_dias,etiqueta_morta,diagnostico from public.carbo_esteira_parados order by bling_id limit 1000) q' into v_n, v_kb;
    v_ms := round(extract(epoch from clock_timestamp() - t0) * 1000);
    insert into _sonda values (4, 'esteira · parados', v_ms, v_n, round(v_kb, 0),
      case when v_ms < 3000 then 'ok' when v_ms < 8000 then 'LENTA' else 'ESTOURA (8 s)' end);
  exception when query_canceled then
    insert into _sonda values (4, 'esteira · parados', round(extract(epoch from clock_timestamp() - t0) * 1000), null, null, 'ESTOURA (8 s)');
  when others then
    insert into _sonda values (4, 'esteira · parados', round(extract(epoch from clock_timestamp() - t0) * 1000), null, null, 'erro: ' || left(sqlerrm, 90));
  end;
end $$;

set local statement_timeout = '8s';
do $$
declare t0 timestamptz := clock_timestamp(); v_n bigint; v_kb numeric; v_ms numeric;
begin
  begin
    execute 'select count(*), coalesce(sum(length(q::text)), 0) / 1024.0 from (select * from public.ecommerce_aguardando_bling order by minutos_parado desc, ordered_at, platform, pedido_loja) q' into v_n, v_kb;
    v_ms := round(extract(epoch from clock_timestamp() - t0) * 1000);
    insert into _sonda values (5, 'esteira · coluna Pago', v_ms, v_n, round(v_kb, 0),
      case when v_ms < 3000 then 'ok' when v_ms < 8000 then 'LENTA' else 'ESTOURA (8 s)' end);
  exception when query_canceled then
    insert into _sonda values (5, 'esteira · coluna Pago', round(extract(epoch from clock_timestamp() - t0) * 1000), null, null, 'ESTOURA (8 s)');
  when others then
    insert into _sonda values (5, 'esteira · coluna Pago', round(extract(epoch from clock_timestamp() - t0) * 1000), null, null, 'erro: ' || left(sqlerrm, 90));
  end;
end $$;

set local statement_timeout = '8s';
do $$
declare t0 timestamptz := clock_timestamp(); v_n bigint; v_kb numeric; v_ms numeric;
begin
  begin
    execute 'select count(*), coalesce(sum(length(q::text)), 0) / 1024.0 from (select * from public.carbo_msg_envios where etapa in (''confirmado'',''nf_emitida'',''etiqueta'',''em_transito'',''saiu_entrega'',''entregue'') order by bling_id, etapa limit 1000) q' into v_n, v_kb;
    v_ms := round(extract(epoch from clock_timestamp() - t0) * 1000);
    insert into _sonda values (6, 'esteira · avisos enviados', v_ms, v_n, round(v_kb, 0),
      case when v_ms < 3000 then 'ok' when v_ms < 8000 then 'LENTA' else 'ESTOURA (8 s)' end);
  exception when query_canceled then
    insert into _sonda values (6, 'esteira · avisos enviados', round(extract(epoch from clock_timestamp() - t0) * 1000), null, null, 'ESTOURA (8 s)');
  when others then
    insert into _sonda values (6, 'esteira · avisos enviados', round(extract(epoch from clock_timestamp() - t0) * 1000), null, null, 'erro: ' || left(sqlerrm, 90));
  end;
end $$;

set local statement_timeout = '8s';
do $$
declare t0 timestamptz := clock_timestamp(); v_n bigint; v_kb numeric; v_ms numeric;
begin
  begin
    execute 'select count(*), coalesce(sum(length(q::text)), 0) / 1024.0 from (select * from public.carbo_recompra_pipeline order by dias_desde_entrega desc, bling_id limit 1000) q' into v_n, v_kb;
    v_ms := round(extract(epoch from clock_timestamp() - t0) * 1000);
    insert into _sonda values (7, 'recompra · quadro', v_ms, v_n, round(v_kb, 0),
      case when v_ms < 3000 then 'ok' when v_ms < 8000 then 'LENTA' else 'ESTOURA (8 s)' end);
  exception when query_canceled then
    insert into _sonda values (7, 'recompra · quadro', round(extract(epoch from clock_timestamp() - t0) * 1000), null, null, 'ESTOURA (8 s)');
  when others then
    insert into _sonda values (7, 'recompra · quadro', round(extract(epoch from clock_timestamp() - t0) * 1000), null, null, 'erro: ' || left(sqlerrm, 90));
  end;
end $$;

set local statement_timeout = '8s';
do $$
declare t0 timestamptz := clock_timestamp(); v_n bigint; v_kb numeric; v_ms numeric;
begin
  begin
    execute 'select count(*), coalesce(sum(length(q::text)), 0) / 1024.0 from (select public.carbo_carrinho_quadro(0, 999)) q' into v_n, v_kb;
    v_ms := round(extract(epoch from clock_timestamp() - t0) * 1000);
    insert into _sonda values (8, 'carrinho · quadro (função)', v_ms, v_n, round(v_kb, 0),
      case when v_ms < 3000 then 'ok' when v_ms < 8000 then 'LENTA' else 'ESTOURA (8 s)' end);
  exception when query_canceled then
    insert into _sonda values (8, 'carrinho · quadro (função)', round(extract(epoch from clock_timestamp() - t0) * 1000), null, null, 'ESTOURA (8 s)');
  when others then
    insert into _sonda values (8, 'carrinho · quadro (função)', round(extract(epoch from clock_timestamp() - t0) * 1000), null, null, 'erro: ' || left(sqlerrm, 90));
  end;
end $$;

set local statement_timeout = '8s';
do $$
declare t0 timestamptz := clock_timestamp(); v_n bigint; v_kb numeric; v_ms numeric;
begin
  begin
    execute 'select count(*), coalesce(sum(length(q::text)), 0) / 1024.0 from (select checkout_id, wa_id, numero_id, respondeu_em from public.carbo_carrinho_respostas order by checkout_id limit 1000) q' into v_n, v_kb;
    v_ms := round(extract(epoch from clock_timestamp() - t0) * 1000);
    insert into _sonda values (9, 'carrinho · respostas', v_ms, v_n, round(v_kb, 0),
      case when v_ms < 3000 then 'ok' when v_ms < 8000 then 'LENTA' else 'ESTOURA (8 s)' end);
  exception when query_canceled then
    insert into _sonda values (9, 'carrinho · respostas', round(extract(epoch from clock_timestamp() - t0) * 1000), null, null, 'ESTOURA (8 s)');
  when others then
    insert into _sonda values (9, 'carrinho · respostas', round(extract(epoch from clock_timestamp() - t0) * 1000), null, null, 'erro: ' || left(sqlerrm, 90));
  end;
end $$;

set local statement_timeout = '8s';
do $$
declare t0 timestamptz := clock_timestamp(); v_n bigint; v_kb numeric; v_ms numeric;
begin
  begin
    execute 'select count(*), coalesce(sum(length(q::text)), 0) / 1024.0 from (select public.carbo_msg_fila_contar()) q' into v_n, v_kb;
    v_ms := round(extract(epoch from clock_timestamp() - t0) * 1000);
    insert into _sonda values (10, 'mensagens · na fila (função)', v_ms, v_n, round(v_kb, 0),
      case when v_ms < 3000 then 'ok' when v_ms < 8000 then 'LENTA' else 'ESTOURA (8 s)' end);
  exception when query_canceled then
    insert into _sonda values (10, 'mensagens · na fila (função)', round(extract(epoch from clock_timestamp() - t0) * 1000), null, null, 'ESTOURA (8 s)');
  when others then
    insert into _sonda values (10, 'mensagens · na fila (função)', round(extract(epoch from clock_timestamp() - t0) * 1000), null, null, 'erro: ' || left(sqlerrm, 90));
  end;
end $$;

set local statement_timeout = '8s';
do $$
declare t0 timestamptz := clock_timestamp(); v_n bigint; v_kb numeric; v_ms numeric;
begin
  begin
    execute 'select count(*), coalesce(sum(length(q::text)), 0) / 1024.0 from (select * from public.carbo_msg_templates) q' into v_n, v_kb;
    v_ms := round(extract(epoch from clock_timestamp() - t0) * 1000);
    insert into _sonda values (11, 'mensagens · templates', v_ms, v_n, round(v_kb, 0),
      case when v_ms < 3000 then 'ok' when v_ms < 8000 then 'LENTA' else 'ESTOURA (8 s)' end);
  exception when query_canceled then
    insert into _sonda values (11, 'mensagens · templates', round(extract(epoch from clock_timestamp() - t0) * 1000), null, null, 'ESTOURA (8 s)');
  when others then
    insert into _sonda values (11, 'mensagens · templates', round(extract(epoch from clock_timestamp() - t0) * 1000), null, null, 'erro: ' || left(sqlerrm, 90));
  end;
end $$;

set local statement_timeout = '8s';
do $$
declare t0 timestamptz := clock_timestamp(); v_n bigint; v_kb numeric; v_ms numeric;
begin
  begin
    execute 'select count(*), coalesce(sum(length(q::text)), 0) / 1024.0 from (select * from public.fontes_saude) q' into v_n, v_kb;
    v_ms := round(extract(epoch from clock_timestamp() - t0) * 1000);
    insert into _sonda values (12, 'fontes de saúde', v_ms, v_n, round(v_kb, 0),
      case when v_ms < 3000 then 'ok' when v_ms < 8000 then 'LENTA' else 'ESTOURA (8 s)' end);
  exception when query_canceled then
    insert into _sonda values (12, 'fontes de saúde', round(extract(epoch from clock_timestamp() - t0) * 1000), null, null, 'ESTOURA (8 s)');
  when others then
    insert into _sonda values (12, 'fontes de saúde', round(extract(epoch from clock_timestamp() - t0) * 1000), null, null, 'erro: ' || left(sqlerrm, 90));
  end;
end $$;

set local statement_timeout = '8s';
do $$
declare t0 timestamptz := clock_timestamp(); v_n bigint; v_kb numeric; v_ms numeric;
begin
  begin
    execute 'select count(*), coalesce(sum(length(q::text)), 0) / 1024.0 from (select public.carbo_entrega_pendencias()) q' into v_n, v_kb;
    v_ms := round(extract(epoch from clock_timestamp() - t0) * 1000);
    insert into _sonda values (13, 'pendências de entrega', v_ms, v_n, round(v_kb, 0),
      case when v_ms < 3000 then 'ok' when v_ms < 8000 then 'LENTA' else 'ESTOURA (8 s)' end);
  exception when query_canceled then
    insert into _sonda values (13, 'pendências de entrega', round(extract(epoch from clock_timestamp() - t0) * 1000), null, null, 'ESTOURA (8 s)');
  when others then
    insert into _sonda values (13, 'pendências de entrega', round(extract(epoch from clock_timestamp() - t0) * 1000), null, null, 'erro: ' || left(sqlerrm, 90));
  end;
end $$;

set local statement_timeout = '8s';
do $$
declare t0 timestamptz := clock_timestamp(); v_n bigint; v_kb numeric; v_ms numeric;
begin
  begin
    execute 'select count(*), coalesce(sum(length(q::text)), 0) / 1024.0 from (select public.carbo_wa_caixa((select phone_number_id from public.carbo_wa_numeros where funcao = ''servico'' limit 1), 30)) q' into v_n, v_kb;
    v_ms := round(extract(epoch from clock_timestamp() - t0) * 1000);
    insert into _sonda values (14, 'conversas · caixa 30 dias', v_ms, v_n, round(v_kb, 0),
      case when v_ms < 3000 then 'ok' when v_ms < 8000 then 'LENTA' else 'ESTOURA (8 s)' end);
  exception when query_canceled then
    insert into _sonda values (14, 'conversas · caixa 30 dias', round(extract(epoch from clock_timestamp() - t0) * 1000), null, null, 'ESTOURA (8 s)');
  when others then
    insert into _sonda values (14, 'conversas · caixa 30 dias', round(extract(epoch from clock_timestamp() - t0) * 1000), null, null, 'erro: ' || left(sqlerrm, 90));
  end;
end $$;

set local statement_timeout = '8s';
do $$
declare t0 timestamptz := clock_timestamp(); v_n bigint; v_kb numeric; v_ms numeric;
begin
  begin
    execute 'select count(*), coalesce(sum(length(q::text)), 0) / 1024.0 from (select public.carbo_atendimento_painel(current_date - 30, current_date, null)) q' into v_n, v_kb;
    v_ms := round(extract(epoch from clock_timestamp() - t0) * 1000);
    insert into _sonda values (15, 'painel do atendimento 30 d', v_ms, v_n, round(v_kb, 0),
      case when v_ms < 3000 then 'ok' when v_ms < 8000 then 'LENTA' else 'ESTOURA (8 s)' end);
  exception when query_canceled then
    insert into _sonda values (15, 'painel do atendimento 30 d', round(extract(epoch from clock_timestamp() - t0) * 1000), null, null, 'ESTOURA (8 s)');
  when others then
    insert into _sonda values (15, 'painel do atendimento 30 d', round(extract(epoch from clock_timestamp() - t0) * 1000), null, null, 'erro: ' || left(sqlerrm, 90));
  end;
end $$;

set local statement_timeout = '8s';
do $$
declare t0 timestamptz := clock_timestamp(); v_n bigint; v_kb numeric; v_ms numeric;
begin
  begin
    execute 'select count(*), coalesce(sum(length(q::text)), 0) / 1024.0 from (select public.carbo_atendimento_assuntos(current_date - 30, current_date, null)) q' into v_n, v_kb;
    v_ms := round(extract(epoch from clock_timestamp() - t0) * 1000);
    insert into _sonda values (16, 'assuntos do atendimento 30 d', v_ms, v_n, round(v_kb, 0),
      case when v_ms < 3000 then 'ok' when v_ms < 8000 then 'LENTA' else 'ESTOURA (8 s)' end);
  exception when query_canceled then
    insert into _sonda values (16, 'assuntos do atendimento 30 d', round(extract(epoch from clock_timestamp() - t0) * 1000), null, null, 'ESTOURA (8 s)');
  when others then
    insert into _sonda values (16, 'assuntos do atendimento 30 d', round(extract(epoch from clock_timestamp() - t0) * 1000), null, null, 'erro: ' || left(sqlerrm, 90));
  end;
end $$;

reset role;
set local statement_timeout = 0;
select ordem, leitura, ms, linhas, kb as kb_resposta, veredito from _sonda order by ms desc;
rollback;

