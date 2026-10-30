-- ═══════════════════════════════════════════════════════════════════════════
-- O fator de unidade para o que SÓ a equipe vende
--
-- ── O buraco ─────────────────────────────────────────────────────────────
--
-- "Quantas unidades vale UM item do catálogo" é a razão
-- `display_units_per_pack / unidades_por_venda`, e ela só existe em
-- `sku_product_mappings` — uma tabela de MARKETPLACE. Produto que a equipe
-- vende e o marketplace não (CarboZé 1 L, CarboPRO, sachê avulso, as linhas
-- -MD e -PDV) não tem linha ali, logo não tem fator.
--
-- E o `useUnidadesVendidas` não inventa `1` quando não sabe: devolve `null`,
-- de propósito, e um único produto sem fator anula o TOTAL de unidades da
-- Comercial Expansão. Hoje são seis produtos assim, 63.147 itens vendidos —
-- o total some por causa deles.
--
-- ⚠️ O remédio NÃO é fazer o código assumir 1 quando falta cadastro. Seria
-- exatamente a doença que o `null` existe para evitar: no kit de sachês o
-- fator é 10, e um `1` presumido faria 10 sachês virarem 1 unidade sem
-- ninguém notar. O remédio é CADASTRAR o que se sabe.
--
-- ── Por que o código do próprio catálogo como `platform_sku` ─────────────
--
-- `platform = null` ("vale para todas") com o nosso `product_code` no lugar
-- do SKU. Não é SKU inventado: é a afirmação "se um pedido chegar trazendo o
-- NOSSO código, é este produto" — que já era verdade e não estava escrita.
--
-- ⚠️ Conferido antes de inserir: NENHUM pedido de `ecommerce_orders` usa
-- qualquer um destes códigos como `product_sku` (consulta no fim). Portanto
-- nenhum número on-line existente muda — estas linhas só passam a responder
-- a pergunta do fator, que hoje fica sem resposta.
--
-- ⚠️ `unidades_por_venda = 1` é o que a baixa de estoque lê
-- (`carbo_ecommerce_sku_resolve`), e é o valor certo: um item de catálogo
-- vendido tira UM item da prateleira. Para o KIT 5un isso também é 1 — o
-- galpão guarda kit fechado, como já guarda o kit de sachês (SKU 120, que há
-- meses está cadastrado assim).
--
-- ── O que FICA DE FORA, e por quê ────────────────────────────────────────
--
--   BOM-80-SAC      "Bomboniere com 80 sachês"
--   CAR-100-BOC-28  "CarboZé 100ml Boca 28"
--
-- Do primeiro dá para LER 80 no nome, mas ler número em nome de produto é
-- palpite, não cadastro — e os dois também são os únicos sem lista de
-- materiais, ou seja, já são decisão humana pendente. Nenhum dos dois tem
-- venda registrada até hoje; no dia em que tiver, o total volta a sumir e a
-- tela vai dizer o nome deles. É o aviso funcionando, não uma falha.
-- ═══════════════════════════════════════════════════════════════════════════

insert into public.sku_product_mappings
  (platform, platform_sku, product_id, unidades_por_venda, display_units_per_pack, units_per_kit, description)
select null, v.codigo, p.id, v.prateleira, v.display, v.prateleira,
       'Venda direta: o produto E a unidade. Codigo do proprio catalogo, sem SKU de marketplace.'
from (values
  -- Um frasco, um sachê, uma garrafa: o item do catálogo É a unidade.
  ('CARB-SACH-10ML',     1, 1),
  ('CARB-SACH-10ML-MD',  1, 1),
  ('CARB-SACH-10ML-PDV', 1, 1),
  ('CP100',              1, 1),
  ('CZ-500',             1, 1),
  ('CZ-500-MD',          1, 1),
  ('CZ-500-PDV',         1, 1),
  ('CZ100-MD',           1, 1),
  ('CZ100-PDV',          1, 1),
  ('CZ1L',               1, 1),
  ('VAPT70',             1, 1),
  ('VID-REP-1L',         1, 1),
  -- ⭐ O KIT é o único com razão diferente de 1, e o número NÃO vem do nome:
  --    vem da `mrp_bom`, onde KIT-5UN-CARB-100ML leva 5 × CZ100. Um kit sai da
  --    prateleira, cinco frascos chegam ao cliente.
  ('KIT-5UN-CARB-100ML', 1, 5)
) as v(codigo, prateleira, display)
join public.mrp_products p on upper(btrim(p.product_code)) = v.codigo
-- Re-rodar é seguro: quem já tem mapa ativo não entra de novo (e o índice
-- `sku_product_mappings_unico` recusaria mesmo que passasse daqui).
where not exists (
  select 1 from public.sku_product_mappings m
  where m.is_active and m.platform_sku = v.codigo and m.platform is null
);


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ Conferência                                                           ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

-- 1. Nenhum produto pode ter razões CONFLITANTES — tem de vir só 'ok'.
--    (Era este o defeito do SKU 035, corrigido logo antes desta migração.)
with fator as (
  select p.product_code,
         array_agg(distinct (m.display_units_per_pack / nullif(m.unidades_por_venda, 0))) as razoes
  from public.sku_product_mappings m
  join public.mrp_products p on p.id = m.product_id
  where m.is_active
  group by 1
)
select product_code, razoes,
       case when array_length(razoes, 1) = 1 then 'ok' else 'CONFLITO' end as situacao
from fator order by 1;

-- 2. Produto Final ainda SEM fator — a lista de trabalho que sobra.
select p.product_code, p.name
from public.mrp_products p
where p.category = 'Produto Final'
  and p.bonificacao_de is null   -- o gêmeo resolve para o pai, não precisa de mapa
  and not exists (select 1 from public.sku_product_mappings m
                   where m.product_id = p.id and m.is_active)
order by 1;

-- 3. Nenhum pedido on-line usa estes códigos como SKU (tem de vir ZERO).
select count(*) as pedidos_afetados
from public.ecommerce_orders o
join public.sku_product_mappings m
  on m.platform_sku = o.product_sku and m.platform is null and m.is_active
join public.mrp_products p on p.id = m.product_id
where upper(btrim(p.product_code)) = m.platform_sku;
