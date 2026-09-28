-- ═══════════════════════════════════════════════════════════════════════════
-- Shopee sem SKU na origem · PayT entra na dedução
--
-- ⚠️ RECONSTITUIÇÃO. Estes blocos foram aplicados pelo SQL Editor em
-- 28/09/2026, durante a auditoria de dedução dos cinco canais. Viram arquivo
-- aqui pela regra do repo: repositório que não descreve a produção é a mesma
-- doença do arquivo replicado que ninguém sabe que precisa ser copiado.
--
-- ── O problema ────────────────────────────────────────────────────────────
--
-- O anúncio 58264919957 da Shopee ("CarboZé Kit 5 Frascos 100ml") estava SEM
-- SKU no painel. Sem SKU não há chave para `sku_product_mappings`, então:
--   • a dedução nunca resolvia (9 linhas, uma delas cancelada);
--   • os painéis contavam 1 unidade onde o cliente levou 5.
--
-- ⚠️ A correção que DURA é preencher `124` no painel da Shopee, não aqui.
-- Anúncio NOVO sem SKU volta ao mesmo buraco, calado. Este arquivo só limpa
-- o passado.
-- ═══════════════════════════════════════════════════════════════════════════


-- ── BLOCO 1 · o SKU nas linhas que já entraram ────────────────────────────
--
-- ⚠️ O corte é o `item_id` do anúncio, NUNCA o nome. Nome não identifica
-- produto (a lição do cadastro de PDV), e casar por nome pegaria um anúncio
-- futuro parecido.
--
-- ⚠️ Isto SOBREVIVE ao `pullShopee`, que roda a cada 5 min, por causa do
-- `trg_ecommerce_nao_apaga_com_vazio`: ele impede que vazio apague dado bom em
-- `product_sku`. Sem esse gatilho o valor voltava a nulo na rodada seguinte —
-- foi o que aconteceu em agosto, antes de ele existir.
update public.ecommerce_orders
set product_sku = '124'
where platform = 'shopee'
  and coalesce(btrim(product_sku), '') = ''
  and split_part(order_id, '-', 2) = '58264919957';


-- ── BLOCO 2 · o que a CONTAGEM FÍSICA já absorveu ─────────────────────────
--
-- ⚠️ Houve ajuste manual de saldo no HUB-SP em 24/09/2026 16:19:35 (saida 690)
-- — a prateleira contada naquele instante. As vendas da Shopee ANTERIORES a
-- ele já tinham saído fisicamente, logo já estão dentro daquele número.
-- Deduzi-las agora contaria a mesma saída duas vezes (o erro de 31/08).
--
-- Quem responde "esta saída já foi contabilizada?" é o LEDGER, não o marco
-- zero — o marco pergunta se a venda é ANTIGA, que é outra pergunta. Por isso
-- a proteção é uma linha em `carbo_estoque_consumo`, e NÃO mexer no marco.
--
-- ⚠️ Ele NÃO toca em `warehouse_stock`, de propósito: o saldo já reflete essas
-- saídas. Escrever no ledger é dizer "já contado", não contar de novo.
--
-- ⚠️ E tem PISO no marco zero (`> deduz_a_partir_de`). A primeira versão não
-- tinha, e pegou junto as 3 vendas de agosto — fundindo os vereditos
-- `anterior ao marco zero` e `já deduzido`, que o CLAUDE.md manda manter
-- separados. Não mudava saldo (aquelas nunca deduziriam), mas o ledger passava
-- a afirmar 15 unidades contabilizadas que o sistema nunca deduziu.
insert into public.carbo_estoque_consumo
  (origem_tipo, origem_chave, warehouse_id, product_id, unidades, ocorreu_em,
   platform, platform_sku, quantidade, fator)
select 'ecommerce',
       o.platform || ':' || o.order_id,
       w.id, p.id,
       (o.quantity * 5)::int,
       o.ordered_at,
       o.platform, '124', o.quantity, 5
from public.ecommerce_orders o
cross join lateral (select id from public.warehouses where code = 'HUB-SP') w
cross join lateral (select id from public.mrp_products where product_code = 'CZ100') p
cross join lateral (select deduz_a_partir_de from public.carbo_canal_estoque
                     where platform = 'shopee') c
where o.platform = 'shopee'
  and o.product_sku = '124'
  and public.ecommerce_status_e_venda(o.status)
  and o.ordered_at > c.deduz_a_partir_de                       -- piso
  and o.ordered_at < '2026-09-24 16:19:35.917185+00'           -- a contagem
on conflict (origem_tipo, origem_chave, product_id) do nothing;


-- ── BLOCO 3 · a PayT passa a deduzir ──────────────────────────────────────
--
-- Ela vendia desde 28/08 sem linha nenhuma em `carbo_canal_estoque` — o ensaio
-- a marcava como `canal sem configuração de galpão`, que é o veredito honesto
-- e diferente de "desligada". Medido: 3 vendas, 3 packs, 15 frascos que nunca
-- baixaram. Decisão do dono do processo em 28/09/2026.
--
-- ⚠️ `now()` no marco zero, NUNCA retroativo: as 3 vendas antigas são
-- anteriores à contagem de 24/09 e já estão no saldo. Marco retroativo as
-- baixaria de novo.
insert into public.carbo_canal_estoque (platform, warehouse_code, ativo, deduz_a_partir_de)
values ('payt', 'HUB-SP', true, now())
on conflict do nothing;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ CONFERÊNCIA — rode UMA DE CADA VEZ                                    ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

-- (a) Shopee. ESPERADO: 3 `anterior ao marco zero`, 6 `já deduzido`,
--     e as posteriores à contagem deduzindo normalmente.
select order_id, ordered_at, veredito
from public.carbo_estoque_ensaio
where platform = 'shopee' order by ordered_at desc;

-- (b) PayT. ESPERADO: as 3 antigas em `anterior ao marco zero`, nenhuma
--     `deduziria` — venda NOVA é que passa a baixar.
select order_id, ordered_at, veredito
from public.carbo_estoque_ensaio
where platform = 'payt' order by ordered_at desc;

-- (c) A garantia canônica. ESPERADO: 0.
select count(*) as consumos_indevidos
from public.carbo_estoque_consumo k
join public.ecommerce_orders o on o.platform || ':' || o.order_id = k.origem_chave
where k.origem_tipo = 'ecommerce'
  and not public.ecommerce_status_e_venda(o.status);

-- (d) Nenhum canal vendendo sem configuração. ESPERADO: `config` preenchido
--     em todas as linhas.
select o.platform, count(*) as linhas, c.platform as config, c.ativo
from public.ecommerce_orders o
left join public.carbo_canal_estoque c on c.platform = o.platform
group by o.platform, c.platform, c.ativo order by 1;
