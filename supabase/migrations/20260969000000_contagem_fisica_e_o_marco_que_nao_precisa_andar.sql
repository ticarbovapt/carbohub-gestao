-- ═══════════════════════════════════════════════════════════════════════════
-- A contagem física vira MARCO, e o marco por DATA não precisa andar
--
-- ── O que aconteceu ──────────────────────────────────────────────────────
--
-- A `20260965` corrigiu o gatilho (BLOCO 1) e o BLOCO 3 avançaria o marco. Só o
-- BLOCO 1 foi rodado. Na rodada seguinte a dedução baixou os 3 dias acumulados
-- EM CIMA de um saldo que tinha acabado de ser contado à mão na LogHouse — a
-- mesma saída contada duas vezes.
--
-- ── ⚠️ Por que eu NÃO vou mandar avançar o marco desta vez ───────────────
--
-- Marco zero é filtro por DATA: `e.ordered_at > c.deduz_a_partir_de`. Ele não
-- pergunta se aquela venda já foi contabilizada — pergunta se ela é ANTIGA. As
-- duas coisas coincidem no primeiro dia e divergem depois:
--
--   Pedido feito ANTES da contagem, ainda `pending` naquele momento.
--   A mercadoria estava na prateleira e ENTROU na contagem.
--   Amanhã ele vira `paid`, sai da prateleira de verdade...
--   ...e o marco por data o considera "velho" e NUNCA o deduz.
--
-- O saldo fica alto para sempre, em silêncio. A `20260965` já tinha notado isso
-- e chamou de "resíduo pequeno, limitado e conhecido" — era verdade naquele dia,
-- quando a alternativa era um erro de tamanho desconhecido. Hoje a alternativa é
-- melhor, porque o LEDGER existe e faz a pergunta certa.
--
-- `carbo_estoque_consumo` significa exatamente "esta saída já está
-- contabilizada". A contagem física da LogHouse contabilizou tudo que estava
-- vendido até o momento dela. Então o que essas vendas precisam é de uma LINHA
-- NO LEDGER — não de uma data que as declare velhas.
--
--   marco por data   →  bloqueia por IDADE      →  pega o pending por engano
--   linha no ledger  →  bloqueia por CONTAGEM   →  o pending deduz na hora certa
--
-- O índice único já é a trava; esta migração só o alimenta com a verdade.
--
-- ⚠️ O marco fica onde está. Ele continua sendo a rede contra "religar e baixar
-- 90 dias" — mas quem impede a dupla contagem de HOJE é o ledger.
--
-- ⚠️ RODE EM BLOCOS, e o BLOCO 2 é uma transação só: não quebre no meio.
-- ═══════════════════════════════════════════════════════════════════════════


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 0 — o estado de agora (medir antes de escrever)                 ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

-- (0.a) ⭐ O saldo que o sistema acha que tem no HUB-SP. É este número que você
--       vai comparar com a contagem da LogHouse.
select p.product_code, p.name, ws.quantity as saldo_no_sistema, ws.updated_at
from public.warehouse_stock ws
join public.mrp_products p on p.id = ws.product_id
join public.warehouses  w on w.id = ws.warehouse_id
where w.code = 'HUB-SP'
order by p.product_code;

-- (0.b) ⭐ O que a PRÓXIMA rodada do cron deduziria se você não fizesse nada.
--       Estas são as linhas em risco de dupla contagem: se elas já estão
--       refletidas na contagem física, precisam de linha no ledger.
select produto, count(*) as pedidos, sum(unidades) as unidades,
       min(order_id) as exemplo
from public.carbo_ecommerce_deduzir_estoque()
group by 1 order by 3 desc;

-- (0.c) O marco atual de cada canal, para o registro.
select platform, warehouse_code, ativo, deduz_a_partir_de
from public.carbo_canal_estoque order by platform;

-- (0.d) ⚠️ O resíduo que o marco por data teria criado, e que o ledger evita:
--       pedidos ANTERIORES a agora que ainda NÃO são venda. Cada um destes é
--       uma unidade que sairia da prateleira sem nunca ser descontada.
select o.platform, count(*) as pedidos_pendentes, sum(o.quantity) as itens
from public.ecommerce_orders o
join public.carbo_canal_estoque c on c.platform = o.platform and c.ativo
where not public.ecommerce_status_e_venda(o.status)
  and o.ordered_at > now() - interval '30 days'
group by 1 order by 2 desc;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 1 — a coluna que distingue as duas formas de contabilizar       ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
--
-- Sem ela, a linha semeada aqui fica idêntica a uma dedução de verdade, e daqui
-- a três meses ninguém sabe por que o movimento não aparece em Movimentações.
-- Auditoria que não distingue as duas coisas é auditoria que engana.

alter table public.carbo_estoque_consumo
  add column if not exists contabilizado_por text not null default 'deducao';

comment on column public.carbo_estoque_consumo.contabilizado_por is
  '`deducao` = a linha baixou o saldo e gerou movimento em stock_movements. `contagem_fisica` = a saída já estava refletida numa contagem de galpão, então a linha existe só para IMPEDIR que a dedução automática a conte de novo — ela não mexeu em saldo nenhum e por isso não tem movimento correspondente.';


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 2 — a contagem física, numa transação só                        ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
--
-- ⚠️ EDITE A TABELA `contagem` ABAIXO antes de rodar, e rode o bloco INTEIRO.
--
-- ⚠️ O número que entra é o SALDO FINAL CONTADO na prateleira, NUNCA o que
-- chegou de reposição. Com saldo em −200, digitar "800" porque chegaram 800
-- gera entrada de 1.000 e conta a dívida duas vezes — o sistema calcula a
-- diferença sozinho.
--
-- ⚠️ É uma transação porque o cron roda a cada 10 min: semear o ledger e
-- ajustar o saldo em execuções separadas deixa uma janela em que a rodada
-- entra no meio e deduz o que a contagem já tinha descontado.

begin;

-- Trava o canal enquanto mexemos. Se o cron disparar agora, ele espera.
select 1 from public.carbo_canal_estoque where ativo for update;

with contagem(product_code, saldo_contado) as (
  values
    -- ┌──────────────────────────┬─────────┐
    -- │ código do produto        │ contado │
    ('CZ100'                      , 0),
    ('KIT-CARB-SACH-10ML'         , 0)
    -- Acrescente linhas se contou mais produtos. Produto fora desta lista NÃO
    -- é tocado — ausência aqui significa "não contei", nunca "está zerado".
),
alvo as (
  select w.id as warehouse_id, p.id as product_id, p.product_code,
         c.saldo_contado::integer                     as contado,
         coalesce(ws.quantity, 0)::integer            as antes
  from contagem c
  join public.mrp_products p on p.product_code = c.product_code
  cross join (select id from public.warehouses where code = 'HUB-SP') w
  left join public.warehouse_stock ws
         on ws.warehouse_id = w.id and ws.product_id = p.id
),

-- ── (2.1) O LEDGER PRIMEIRO ──────────────────────────────────────────────
--
-- Toda venda elegível que ainda não tem linha ganha uma agora, marcada como
-- `contagem_fisica`. Elas param de ser candidatas à dedução — não por serem
-- antigas, mas por já estarem contadas.
--
-- ⚠️ Isto NÃO mexe em warehouse_stock e NÃO gera stock_movements, de propósito:
-- o saldo já reflete estas saídas. Um movimento aqui seria a dupla contagem que
-- viemos evitar.
semeadas as (
  insert into public.carbo_estoque_consumo
    (origem_tipo, origem_chave, warehouse_id, product_id, unidades,
     ocorreu_em, platform, platform_sku, quantidade, fator, contabilizado_por)
  select 'ecommerce',
         e.platform || ':' || e.order_id,
         w.id,
         e.product_id_alvo,
         e.unidades_a_deduzir::integer,
         e.ordered_at,
         e.platform,
         e.product_sku,
         e.qtd_vendida,
         e.fator,
         'contagem_fisica'
  from public.carbo_estoque_ensaio e
  join public.carbo_canal_estoque c on c.platform = e.platform
  join public.warehouses w on w.code = c.warehouse_code
  where c.ativo
    and c.deduz_a_partir_de is not null
    and e.ordered_at > c.deduz_a_partir_de
    -- ⭐ O CORTE: só o que já estava vendido quando a prateleira foi contada.
    --    Venda que chegar depois deste instante deduz normalmente.
    and e.ordered_at <= now()
    and e.product_id_alvo is not null
    and e.unidades_a_deduzir > 0
  on conflict (origem_tipo, origem_chave, product_id) do nothing
  returning 1
),

-- ── (2.2) O SALDO, com movimento auditável ───────────────────────────────
--
-- A diferença vira UMA linha em Movimentações, com o cálculo escrito. Ajuste
-- sem rastro é saldo que ninguém consegue explicar depois.
mov as (
  insert into public.stock_movements
    (product_id, warehouse_id, tipo, quantidade, origem, observacoes, executor)
  select a.product_id, a.warehouse_id,
         case when a.contado >= a.antes then 'entrada' else 'saida' end,
         abs(a.contado - a.antes),
         'ajuste',
         'Contagem física LogHouse · sistema ' || a.antes
           || ' → contado ' || a.contado
           || ' (' || case when a.contado >= a.antes then '+' else '' end
           || (a.contado - a.antes) || ')',
         'contagem:loghouse'
  from alvo a
  where a.contado <> a.antes          -- sem diferença, sem movimento
  returning 1
)
insert into public.warehouse_stock (warehouse_id, product_id, quantity)
select a.warehouse_id, a.product_id, a.contado from alvo a
on conflict (warehouse_id, product_id)
do update set quantity = excluded.quantity, updated_at = now();

commit;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 3 — conferência (rode logo depois, na mesma sessão)             ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

-- (3.a) ⭐ O TESTE QUE IMPORTA: o ensaio tem de vir VAZIO.
--       Qualquer linha aqui é uma venda que ainda deduziria por cima da
--       contagem — ou seja, dupla contagem que sobrou.
select * from public.carbo_ecommerce_deduzir_estoque();

-- (3.b) O saldo ficou igual ao contado.
select p.product_code, ws.quantity as saldo_agora, ws.updated_at
from public.warehouse_stock ws
join public.mrp_products p on p.id = ws.product_id
join public.warehouses  w on w.id = ws.warehouse_id
where w.code = 'HUB-SP'
order by p.product_code;

-- (3.c) Quantas linhas foram semeadas, e a separação continua legível.
select contabilizado_por, count(*) as linhas, sum(unidades) as unidades,
       min(ocorreu_em)::date as de, max(ocorreu_em)::date as ate
from public.carbo_estoque_consumo
where origem_tipo = 'ecommerce'
group by 1 order by 2 desc;

-- (3.d) O ajuste aparece em Movimentações, com o cálculo na observação.
select m.created_at, p.product_code, m.tipo, m.quantidade, m.origem,
       m.executor, m.observacoes
from public.stock_movements m
join public.mrp_products p on p.id = m.product_id
where m.origem = 'ajuste' and m.executor = 'contagem:loghouse'
order by m.created_at desc limit 10;

-- (3.e) ⚠️ A garantia permanente, a mesma da 20260967: nada fora da lista
--       branca pode ter linha no ledger. Tem de vir ZERO.
select count(*) as consumos_indevidos
from public.carbo_estoque_consumo k
join public.ecommerce_orders o on o.platform || ':' || o.order_id = k.origem_chave
where k.origem_tipo = 'ecommerce'
  and not public.ecommerce_status_e_venda(o.status);


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 4 — a próxima venda (rode amanhã, não agora)                    ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

-- (4.a) Vendas novas deduzindo de verdade: `deducao`, com movimento.
select k.contabilizado_por, k.platform, k.origem_chave, k.unidades, k.ocorreu_em
from public.carbo_estoque_consumo k
where k.origem_tipo = 'ecommerce' and k.ocorreu_em > now() - interval '1 day'
order by k.ocorreu_em desc;

-- (4.b) O cron continua limpo. `failed` aqui foi o sintoma de três dias.
select status, count(*), max(end_time) as ultimo
from cron.job_run_details
where end_time > now() - interval '2 hours'
group by 1;
