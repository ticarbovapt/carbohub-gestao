-- ═══════════════════════════════════════════════════════════════════════════
-- Shopee: as três vendas de 29/09 que chegaram DEPOIS da limpeza da 20261014
--
-- ⚠️ E a medição que corrigiu o que estava escrito no CLAUDE.md.
--
-- A `20261014` preencheu `product_sku = '124'` nas vendas do anúncio
-- 58264919957 ("CarboZé Kit 5 Frascos 100ml"), e o registro dizia que a
-- correção duradoura era preencher o SKU no painel da Shopee. Em 29/09 o
-- anúncio voltou a aparecer na aba "SKUs vendidos sem mapa" do Ops, e a
-- consulta ao payload CRU mostrou uma coisa diferente do que eu supunha:
--
--     item_sku_cru = '—' nas DEZESSEIS linhas do anúncio,
--     inclusive nas treze que têm 124 na coluna.
--
-- Ou seja: **a Shopee nunca mandou o SKU nesse anúncio**. Os treze `124` são
-- NOSSOS, da limpeza de ontem; as três de 29/09 entraram depois dela e por
-- isso estão vazias. Não houve regressão, não houve defeito no caminho de
-- escrita — o campo sempre veio vazio da origem, e a leitura "13 de 16 vieram
-- com SKU" era minha, não do dado.
--
-- ⚠️ A lição de método: `product_sku` é o que NÓS gravamos; `raw->'_item'` é o
-- que a plataforma MANDOU. Conferir a coluna e chamar aquilo de "o que a
-- Shopee enviou" é a doença conhecida daqui — o relatório que só sabe
-- concordar consigo mesmo. Quem responde "a origem mandou?" é o payload cru.
--
-- O SKU principal foi preenchido no painel da Shopee em 29/09/2026 (os dois
-- anúncios, seção "Outros", produto sem variação). Se isso basta, descobre-se
-- na PRÓXIMA venda — ver a conferência (c). Este arquivo só limpa o passado.
-- ═══════════════════════════════════════════════════════════════════════════

-- ⚠️ Recortado por `item_id`, não por nome nem por plataforma inteira. O nome
-- é texto livre do anunciante e muda com SEO; o `item_id` é o anúncio, e é
-- estável. Casar por nome aqui seria a mesma lição já paga no cadastro de PDV.
update public.ecommerce_orders
set product_sku = '124'
where platform = 'shopee'
  and raw -> '_item' ->> 'item_id' = '58264919957'
  and coalesce(product_sku, '') = '';

-- ⚠️ O update só DURA por causa do `trg_ecommerce_nao_apaga_com_vazio`: sem
-- ele o `ecommerce-sync` regravaria o vazio por cima na rodada seguinte, que
-- foi exatamente o que aconteceu em agosto (as linhas de 21/08 mantiveram o
-- valor por estarem fora da janela relida, e as de 26 e 27 voltaram a nulo —
-- o padrão provou o mecanismo).


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ CONFERÊNCIA — rode UMA DE CADA VEZ                                    ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

-- (a) Sobrou alguma venda da Shopee sem SKU? ESPERADO: ZERO linhas.
-- select o.ordered_at::date, o.status, o.order_id,
--        o.raw -> '_item' ->> 'item_id' as item_id, o.product_name
-- from public.ecommerce_orders o
-- where o.platform = 'shopee' and coalesce(o.product_sku, '') = ''
-- order by o.ordered_at desc;

-- (b) ⚠️ O ESTOQUE VAI MEXER, e é correto. As duas vendas `paid` de 29/09 não
--     deduziam nada; com o SKU elas passam a deduzir 5 unidades cada do
--     HUB-SP na próxima rodada do cron (8-59/10). A `cancelled` não deduz.
--     Rode ANTES e DEPOIS de uma rodada e confira a diferença de 10.
-- select w.quantity as saldo_cz100_hub_sp
-- from public.warehouse_stock w
-- join public.warehouses wh on wh.id = w.warehouse_id
-- join public.mrp_products p on p.id = w.product_id
-- where wh.code = 'HUB-SP' and p.product_code = 'CZ100';

-- (c) ⚠️ A PERGUNTA QUE ESTE ARQUIVO NÃO RESPONDE, e que a próxima venda
--     responde: o painel pegou? Rode depois da primeira venda nova da Shopee.
--     `item_sku_cru = 124`  → o painel resolveu, e o problema acabou.
--     `item_sku_cru = —`    → a Shopee segue mandando vazio mesmo com o painel
--                             preenchido, e aí o caminho é mapear por ANÚNCIO
--                             (`item_id`), que já está gravado em `raw`.
-- select o.ordered_at, o.order_id,
--        o.raw -> '_item' ->> 'item_id' as item_id,
--        coalesce(nullif(o.product_sku, ''), '⚠️ VAZIO')                     as sku_na_coluna,
--        coalesce(nullif(o.raw -> '_item' ->> 'item_sku',  ''), '—')         as item_sku_cru,
--        coalesce(nullif(o.raw -> '_item' ->> 'model_sku', ''), '—')         as model_sku_cru
-- from public.ecommerce_orders o
-- where o.platform = 'shopee'
-- order by o.ordered_at desc
-- limit 5;
