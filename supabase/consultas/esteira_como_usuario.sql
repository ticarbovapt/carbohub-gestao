-- Esteira: o tempo de CADA leitura da tela como o USUÁRIO LOGADO, com o limite de 8 s da API.
-- Cole TUDO e rode uma vez. Nada é gravado (o rollback desfaz). Resultado: tabela final, da mais lenta.
--   ok < 3 s · LENTA 3–8 s (estoura com o crescimento) · ESTOURA (8 s) = a tela já quebra · erro: … = falhou
begin;
create temp table _sonda (ordem int, leitura text, ms numeric, linhas bigint, kb numeric, veredito text);
grant all on _sonda to authenticated;
create function public._sonda_tmp(p_ordem int, p_nome text, p_sql text) returns void language plpgsql as $f$
declare t0 timestamptz := clock_timestamp(); n bigint; kb numeric; ms numeric;
begin
  begin
    execute 'select count(*), coalesce(sum(length(q::text)),0)/1024.0 from (' || p_sql || ') q' into n, kb;
    ms := round(extract(epoch from clock_timestamp() - t0) * 1000);
    insert into _sonda values (p_ordem, p_nome, ms, n, round(kb,0), case when ms < 3000 then 'ok' when ms < 8000 then 'LENTA' else 'ESTOURA (8 s)' end);
  exception when query_canceled then
    insert into _sonda values (p_ordem, p_nome, round(extract(epoch from clock_timestamp() - t0) * 1000), null, null, 'ESTOURA (8 s)');
  when others then
    insert into _sonda values (p_ordem, p_nome, round(extract(epoch from clock_timestamp() - t0) * 1000), null, null, 'erro: ' || left(sqlerrm, 90));
  end;
end $f$;
select set_config('request.jwt.claims', json_build_object('sub', (select id from auth.users where email = 'padilha.grupocarbo@gmail.com'), 'role', 'authenticated')::text, true);
set local role authenticated;
set local statement_timeout = '8s'; select public._sonda_tmp(1, 'esteira 30 dias · pág. 1', 'select * from public.bling2_esteira where data_pedido >= current_date - 30 and data_pedido <= current_date order by data_pedido desc, bling_id desc limit 1000');
set local statement_timeout = '8s'; select public._sonda_tmp(2, 'esteira 30 dias · pág. 2', 'select * from public.bling2_esteira where data_pedido >= current_date - 30 and data_pedido <= current_date order by data_pedido desc, bling_id desc limit 1000 offset 1000');
set local statement_timeout = '8s'; select public._sonda_tmp(3, 'esteira · travados antigos', 'select * from public.bling2_esteira where data_pedido < current_date - 30 and etapa not in (''entregue'',''cancelado'') order by data_pedido, bling_id limit 1000');
set local statement_timeout = '8s'; select public._sonda_tmp(4, 'esteira · parados', 'select bling_id,etapa,dias_parado,limite_dias,etiqueta_morta,diagnostico from public.carbo_esteira_parados order by bling_id limit 1000');
set local statement_timeout = '8s'; select public._sonda_tmp(5, 'esteira · coluna Pago', 'select * from public.ecommerce_aguardando_bling order by minutos_parado desc, ordered_at, platform, pedido_loja');
set local statement_timeout = '8s'; select public._sonda_tmp(6, 'esteira · avisos enviados', 'select * from public.carbo_msg_envios where etapa in (''confirmado'',''nf_emitida'',''etiqueta'',''em_transito'',''saiu_entrega'',''entregue'') order by bling_id, etapa limit 1000');
set local statement_timeout = '8s'; select public._sonda_tmp(7, 'recompra · quadro', 'select * from public.carbo_recompra_pipeline order by dias_desde_entrega desc, bling_id limit 1000');
set local statement_timeout = '8s'; select public._sonda_tmp(8, 'carrinho · quadro (função)', 'select public.carbo_carrinho_quadro(0, 999)');
set local statement_timeout = '8s'; select public._sonda_tmp(9, 'carrinho · respostas', 'select checkout_id, wa_id, numero_id, respondeu_em from public.carbo_carrinho_respostas order by checkout_id limit 1000');
set local statement_timeout = '8s'; select public._sonda_tmp(10, 'mensagens · na fila (função)', 'select public.carbo_msg_fila_contar()');
set local statement_timeout = '8s'; select public._sonda_tmp(11, 'mensagens · templates', 'select * from public.carbo_msg_templates');
set local statement_timeout = '8s'; select public._sonda_tmp(12, 'fontes de saúde', 'select * from public.fontes_saude');
set local statement_timeout = '8s'; select public._sonda_tmp(13, 'pós-venda · semana', 'select public.carbo_posvenda(current_date - extract(dow from current_date)::int, current_date)');
set local statement_timeout = '8s'; select public._sonda_tmp(14, 'conversas · caixa 30 dias', 'select public.carbo_wa_caixa((select phone_number_id from public.carbo_wa_numeros where funcao = ''servico'' limit 1), 30)');
set local statement_timeout = '8s'; select public._sonda_tmp(15, 'painel do atendimento 30 d', 'select public.carbo_atendimento_painel(current_date - 30, current_date, null)');
set local statement_timeout = '8s'; select public._sonda_tmp(16, 'assuntos do atendimento 30 d', 'select public.carbo_atendimento_assuntos(current_date - 30, current_date, null)');
reset role; set local statement_timeout = 0;
select ordem, leitura, ms, linhas, kb as kb_resposta, veredito from _sonda order by ms desc;
rollback;
