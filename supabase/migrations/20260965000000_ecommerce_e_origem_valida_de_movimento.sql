-- ═══════════════════════════════════════════════════════════════════════════
-- 'ecommerce' é origem VÁLIDA de movimento — e o marco zero anda junto
--
-- ── O que quebrou, e por quanto tempo ────────────────────────────────────
--
-- A dedução do e-commerce foi ligada em 28/08 e NUNCA gravou uma linha. Desde
-- então, de 10 em 10 minutos:
--
--     ERROR: Origem de movimento inválida: ecommerce
--     CONTEXT: PL/pgSQL function validate_stock_movement() line 7 at RAISE
--
-- `stock_movements` tem um GATILHO de validação com lista branca de `origem`, e
-- ela ainda era `('PC','OP','ajuste','transferencia','venda','producao')`. O
-- insert estoura, a rodada inteira aborta, e `carbo_estoque_consumo` ficou com
-- ZERO linhas por três dias.
--
-- ⚠️ É a mesma armadilha que este repositório documenta há semanas — valor novo
-- numa lista fechada é escrita falhando —, com uma diferença que a torna pior:
-- eu procurei um CHECK na coluna `origem`, não achei nenhum, e concluí que não
-- havia restrição. A restrição existia como TRIGGER. Cheguei a ler essa mesma
-- função e vi que ela validava `tipo`; presumi que era só isso.
--
-- **Procurar CHECK não é procurar restrição.** Trigger, RULE e domínio fazem o
-- mesmo trabalho por outros meios. A pergunta certa é sempre ao banco:
-- `pg_get_functiondef` nos gatilhos da tabela, não `pg_constraint` sozinho.
--
-- E o sintoma foi silencioso do jeito conhecido: `cron.job_run_details` marcava
-- `failed` a cada 10 min e ninguém olha aquilo — a tela de Movimentações
-- simplesmente não ganhava linha nenhuma.
--
-- ⚠️ RODE EM BLOCOS. E LEIA O BLOCO 2 ANTES DE RODAR O BLOCO 3.
-- ═══════════════════════════════════════════════════════════════════════════


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 0 — a lista que está RODANDO (não a do arquivo)                 ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

select pg_get_functiondef('public.validate_stock_movement()'::regprocedure) as definicao_hoje;

-- E quais origens já existem em uso, para não excluir nenhuma sem querer.
select origem, count(*) as movimentos, max(created_at)::date as ultimo
from public.stock_movements group by 1 order by 2 desc;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 1 — 'ecommerce' entra na lista                                  ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
--
-- ⚠️ A lista inteira é reescrita, com os valores que já estavam lá. Conferir
-- contra o BLOCO 0 antes de rodar: se aparecer uma origem que não está aqui,
-- ACRESCENTE — senão o próximo insert daquele fluxo passa a falhar.

create or replace function public.validate_stock_movement()
returns trigger as $$
begin
  if NEW.tipo not in ('entrada', 'saida') then
    raise exception 'Tipo de movimento inválido: %', NEW.tipo;
  end if;
  -- 'ecommerce' (20260965): a baixa automática da venda on-line. Sem ela na
  -- lista, a dedução ligada em 28/08 abortou a cada 10 min por três dias.
  if NEW.origem not in ('PC', 'OP', 'ajuste', 'transferencia',
                        'venda', 'producao', 'ecommerce') then
    raise exception 'Origem de movimento inválida: %', NEW.origem;
  end if;
  return NEW;
end;
$$ language plpgsql set search_path = public;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 2 — ⚠️ O ATRASO ACUMULADO: LEIA ANTES DE DEDUZIR               ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
--
-- Com o gatilho corrigido, a próxima rodada tentaria deduzir TODAS as vendas
-- desde 28/08 de uma vez — 31 linhas no último ensaio.
--
-- ⚠️ Isso contaria a mesma saída DUAS VEZES. O dono do processo acabou de
-- ajustar o saldo à mão para bater com o que a LogHouse mostra HOJE, e o número
-- da LogHouse é físico: ele já desconta o que foi empacotado e enviado. Deduzir
-- o histórico por cima subtrairia de novo o que aquele ajuste já subtraiu.
--
-- É exatamente a lição do `deduz_a_partir_de` — só que agora o marco precisa
-- ANDAR, porque o ponto de partida confiável mudou de lugar.

-- (2.a) ⭐ O tamanho do atraso, por produto. Estas unidades NÃO serão deduzidas.
select produto, count(*) as pedidos, sum(unidades) as unidades
from public.carbo_ecommerce_deduzir_estoque()
group by 1 order by 3 desc;

-- (2.b) ⚠️ Destes, quantos ainda NÃO foram enviados? São o resíduo real: já
--       foram vendidos, ainda estão na prateleira, e ao avançar o marco eles
--       nunca serão descontados. O saldo fica ALTO nessa medida — pequeno,
--       limitado e conhecido, contra um erro de tamanho desconhecido no outro
--       caminho.
select o.status, count(*) as linhas, sum(e.unidades_a_deduzir) as unidades
from public.carbo_estoque_ensaio e
join public.ecommerce_orders o
  on o.platform = e.platform and o.order_id = e.order_id
join public.carbo_canal_estoque c on c.platform = e.platform
where c.ativo and e.ordered_at > c.deduz_a_partir_de
group by 1 order by 3 desc;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 3 — o marco anda para AGORA (só depois de ler o BLOCO 2)        ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
--
-- O ajuste manual de hoje passa a ser o ponto de partida. Daqui pra frente o
-- espelho anda sozinho.

update public.carbo_canal_estoque
set deduz_a_partir_de = now(),
    observacao = coalesce(observacao, '')
                 || ' · Marco reposicionado em 31/08/2026: a dedução ficou 3 dias'
                 || ' abortando por origem inválida no gatilho, e o saldo foi'
                 || ' corrigido à mão pela contagem da LogHouse — deduzir o'
                 || ' atraso contaria a mesma saída duas vezes.',
    atualizado_em = now()
where ativo;

-- Agora o ensaio tem de vir VAZIO: nada anterior ao novo marco entra.
select * from public.carbo_ecommerce_deduzir_estoque();


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 4 — conferência (rode na próxima venda, não agora)              ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

-- (a) ⭐ O cron parou de falhar. `failed` aqui era o sintoma de três dias.
select r.status, r.start_time, left(coalesce(r.return_message, ''), 120) as msg
from cron.job_run_details r join cron.job j on j.jobid = r.jobid
where j.jobname = 'ecommerce-deduz-estoque-10min'
order by r.start_time desc limit 5;

-- (b) A primeira baixa real, com o cálculo e o pedido na linha.
select m.created_at, p.product_code, m.tipo, m.quantidade,
       m.observacoes, m.ref_externa, m.executor
from public.stock_movements m
join public.mrp_products p on p.id = m.product_id
join public.warehouses w on w.id = m.warehouse_id and w.code = 'HUB-SP'
where m.origem = 'ecommerce'
order by m.created_at desc limit 20;

-- (c) O ledger, que é a trava contra dedução dupla.
select platform, count(*) as pedidos, sum(unidades) as unidades, max(criado_em) as ultimo
from public.carbo_estoque_consumo group by 1 order by 3 desc;
