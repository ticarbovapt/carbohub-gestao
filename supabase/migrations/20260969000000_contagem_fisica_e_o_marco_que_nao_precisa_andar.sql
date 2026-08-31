-- ═══════════════════════════════════════════════════════════════════════════
-- Contagem física do HUB-SP — e por que NÃO se avança o marco
--
-- ── ⭐ O que a medição de 31/08 16:30 mostrou ────────────────────────────
--
-- `carbo_ecommerce_deduzir_estoque()` voltou **VAZIO**. Não há atraso: o cron
-- está em dia e tudo que era elegível já tem linha no ledger. Os saldos foram
-- escritos hoje (CZ100 às 16:08, o kit às 16:18) pela própria dedução.
--
-- Isso apaga metade do problema previsto. **Não existe nada para semear no
-- ledger** — a versão anterior desta migração criava uma coluna e um INSERT que
-- hoje não inseririam uma linha sequer. Mecanismo que não é usado é mecanismo
-- que ninguém mantém, então ele saiu.
--
-- Sobra UMA coisa a fazer: ajustar o saldo para o que foi contado na prateleira.
--
-- ── ⚠️ E sobra um perigo NOVO, que o ajuste ingênuo cria ────────────────
--
-- `quantity = <contado>` sobrescreve o saldo com um número absoluto. Mas a
-- contagem descreve a prateleira num INSTANTE, e o cron deduz a cada 10 min:
--
--     16:30  você conta 800 na prateleira
--     16:38  o cron deduz 5 de uma venda nova   → saldo vai a 795 (certo)
--     17:10  você roda `quantity = 800`         → a venda das 16:38 SUMIU
--
-- O erro é silencioso e do tamanho do tempo que você levou entre contar e
-- rodar. É o mesmo defeito da dupla contagem, ao contrário: lá a saída era
-- contada duas vezes, aqui ela deixa de ser contada.
--
-- Por isso o bloco pede o INSTANTE da contagem e desconta sozinho o que a
-- dedução automática já tirou depois dele. Contar às 16:30 e rodar às 23:00
-- continua dando o número certo.
--
-- ── Por que o marco zero fica ONDE ESTÁ ──────────────────────────────────
--
-- Marco zero é filtro por DATA (`ordered_at > deduz_a_partir_de`): ele pergunta
-- se a venda é ANTIGA, não se ela já foi contabilizada. Avançá-lo para agora
-- pegaria por engano todo pedido feito antes da contagem que ainda não é venda
-- — a mercadoria estava na prateleira, ENTROU na contagem, e quando ele for
-- pago vai sair de verdade sem nunca ser descontado.
--
-- ⭐ Medido agora, e não é pequeno: **50 pedidos pendentes, 68 itens**
-- (nuvemshop 44, mercadolivre 5, shopee 1). Cada um é uma saída futura que o
-- marco avançado tornaria invisível para sempre.
--
-- Como o ledger já cobre tudo que foi deduzido, avançar o marco não protegeria
-- de nada hoje — só criaria esse vazamento. Ele fica como está, cumprindo o
-- papel para o qual foi feito: impedir que religar um canal baixe 90 dias.
--
-- ⚠️ RODE EM BLOCOS. O BLOCO 1 é uma transação só — não quebre no meio.
-- ═══════════════════════════════════════════════════════════════════════════


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 0 — reconferir na hora de rodar (o estado muda a cada 10 min)   ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

-- (0.a) ⭐ TEM DE VIR VAZIO. Se vier com linhas, o cron atrasou de novo e
--       elas deduziriam POR CIMA da contagem — pare e me chame.
select * from public.carbo_ecommerce_deduzir_estoque();

-- (0.b) O saldo de agora, para comparar com o que você contou.
select p.product_code, p.name, ws.quantity as saldo_no_sistema, ws.updated_at
from public.warehouse_stock ws
join public.mrp_products p on p.id = ws.product_id
join public.warehouses  w on w.id = ws.warehouse_id
where w.code = 'HUB-SP'
order by p.product_code;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 1 — o ajuste, numa transação só                                 ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
--
-- ⚠️ EDITE AS DUAS COISAS ABAIXO e rode o bloco INTEIRO:
--   1. `contado_em` — o instante em que a prateleira foi contada;
--   2. a tabela `contagem` — o SALDO FINAL contado de cada produto.
--
-- ⚠️ É o saldo final na prateleira, NUNCA o que chegou de reposição. Com saldo
-- em −200, digitar "800" porque chegaram 800 gera entrada de 1.000 e conta a
-- dívida duas vezes. O sistema calcula a diferença sozinho.
--
-- ⚠️ Produto fora da lista NÃO é tocado. Ausência aqui significa "não contei",
-- nunca "está zerado" — e `CARB-SACH-10ML` (sachê avulso) tem saldo 0 legítimo,
-- porque a LogHouse guarda kits fechados, não sachês soltos.

begin;

with parametros as (
  select
    -- ┌─ INSTANTE DA CONTAGEM ─────────────────────────────────────────────┐
    timestamptz '2026-08-31 16:30:00-03'   as contado_em
    -- └────────────────────────────────────────────────────────────────────┘
),
contagem(product_code, saldo_contado) as (
  values
    -- ┌──────────────────────────┬─────────┐
    -- │ código do produto        │ contado │
    ('CZ100'                      , 0),
    ('KIT-CARB-SACH-10ML'         , 0)
    -- └──────────────────────────┴─────────┘
),
alvo as (
  select w.id            as warehouse_id,
         p.id            as product_id,
         p.product_code,
         c.saldo_contado::integer          as contado,
         coalesce(ws.quantity, 0)::integer as antes
  from contagem c
  join public.mrp_products p on p.product_code = c.product_code
  cross join (select id from public.warehouses where code = 'HUB-SP') w
  left join public.warehouse_stock ws
         on ws.warehouse_id = w.id and ws.product_id = p.id
),
-- ⭐ O que a dedução automática mexeu DEPOIS da contagem. Sem isto, o ajuste
--    apagaria essas vendas — o erro do cabeçalho, do tamanho do tempo entre
--    contar e rodar. Saída conta negativo, estorno conta positivo.
depois_da_contagem as (
  select a.product_id,
         coalesce(sum(case when m.tipo = 'saida' then -m.quantidade
                                                 else  m.quantidade end), 0)::integer as delta
  from alvo a
  left join public.stock_movements m
         on m.product_id   = a.product_id
        and m.warehouse_id = a.warehouse_id
        and m.origem       = 'ecommerce'
        and m.created_at   > (select contado_em from parametros)
  group by a.product_id
),
final as (
  select a.*, d.delta, (a.contado + d.delta) as saldo_alvo
  from alvo a join depois_da_contagem d on d.product_id = a.product_id
),
-- O ajuste vira UMA linha em Movimentações, com a conta escrita. Ajuste sem
-- rastro é saldo que ninguém consegue explicar três meses depois.
mov as (
  insert into public.stock_movements
    (product_id, warehouse_id, tipo, quantidade, origem, observacoes, executor)
  select f.product_id, f.warehouse_id,
         case when f.saldo_alvo >= f.antes then 'entrada' else 'saida' end,
         abs(f.saldo_alvo - f.antes),
         'ajuste',
         'Contagem física LogHouse · contado ' || f.contado
           || ' em ' || to_char((select contado_em from parametros)
                                at time zone 'America/Sao_Paulo', 'DD/MM HH24:MI')
           || case when f.delta <> 0
                   then ' · ' || f.delta || ' de venda on-line depois da contagem'
                   else '' end
           || ' · sistema ' || f.antes || ' → ' || f.saldo_alvo,
         'contagem:loghouse'
  from final f
  where f.saldo_alvo <> f.antes        -- sem diferença, sem movimento
  returning 1
)
insert into public.warehouse_stock (warehouse_id, product_id, quantity)
select f.warehouse_id, f.product_id, f.saldo_alvo from final f
on conflict (warehouse_id, product_id)
do update set quantity = excluded.quantity, updated_at = now();

commit;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 2 — conferência                                                 ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

-- (2.a) O saldo ficou no valor esperado (contado, menos o que saiu depois).
select p.product_code, ws.quantity as saldo_agora, ws.updated_at
from public.warehouse_stock ws
join public.mrp_products p on p.id = ws.product_id
join public.warehouses  w on w.id = ws.warehouse_id
where w.code = 'HUB-SP'
order by p.product_code;

-- (2.b) O ajuste aparece em Movimentações com a conta na observação.
select m.created_at, p.product_code, m.tipo, m.quantidade, m.origem,
       m.executor, m.observacoes
from public.stock_movements m
join public.mrp_products p on p.id = m.product_id
where m.origem = 'ajuste' and m.executor = 'contagem:loghouse'
order by m.created_at desc limit 10;

-- (2.c) ⭐ Continua VAZIO: o ajuste não reabriu nada para deduzir.
select * from public.carbo_ecommerce_deduzir_estoque();

-- (2.d) ⚠️ A garantia permanente (a mesma da 20260967): nada fora da lista
--       branca pode ter linha no ledger. Tem de vir ZERO.
select count(*) as consumos_indevidos
from public.carbo_estoque_consumo k
join public.ecommerce_orders o on o.platform || ':' || o.order_id = k.origem_chave
where k.origem_tipo = 'ecommerce'
  and not public.ecommerce_status_e_venda(o.status);


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 3 — amanhã, não agora                                           ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

-- (3.a) As vendas novas continuam deduzindo, agora sobre um saldo confiável.
select k.platform, k.origem_chave, k.unidades, k.ocorreu_em
from public.carbo_estoque_consumo k
where k.origem_tipo = 'ecommerce' and k.ocorreu_em > now() - interval '1 day'
order by k.ocorreu_em desc;

-- (3.b) ⚠️ Os 50 pedidos pendentes de hoje vão virando venda e deduzindo. Esta
--       consulta mostra o funil encolhendo — é a prova de que NÃO avançar o
--       marco foi o certo: com o marco avançado, nenhum deles apareceria aqui.
select o.platform, count(*) as pendentes, sum(o.quantity) as itens
from public.ecommerce_orders o
join public.carbo_canal_estoque c on c.platform = o.platform and c.ativo
where not public.ecommerce_status_e_venda(o.status)
  and o.ordered_at > now() - interval '30 days'
group by 1 order by 2 desc;
