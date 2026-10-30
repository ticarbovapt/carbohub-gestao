-- ═══════════════════════════════════════════════════════════════════════════
-- Bomboniere e Boca 28 entram na conta
--
-- Eram os dois últimos Produto Final sem fator de unidade E sem lista de
-- materiais — ficavam fora tanto do total de unidades quanto do consumo de
-- estabilizador. A 20261142 deixou os dois de fora de propósito: o número não
-- estava em cadastro nenhum, e lê-lo no nome do produto é palpite.
--
-- Agora está dito, pela operação:
--
--   BOM-80-SAC      "entrega 80 sachês"
--   CAR-100-BOC-28  "é apenas o modelo de garrafa diferente, mas o consumo é
--                    igual ao 100ml"
--
-- ── Duas coisas, não uma ─────────────────────────────────────────────────
--
-- Faltava cadastro em DOIS lugares, e eles respondem perguntas diferentes:
--
--   sku_product_mappings → quantas UNIDADES o cliente levou  (tela de vendas)
--   mrp_bom              → quanto INSUMO saiu                (tela de insumo)
--
-- Cadastrar só o primeiro faria o produto aparecer nas unidades e continuar
-- fora dos litros, sem ninguém entender por quê.
--
-- ⚠️ A `mrp_bom` NÃO é lida pela venda — quem a explode é o
-- `op_deduct_materials`, na ordem de produção. Nenhum dos dois produtos tem
-- OP registrada (conferido), então nada muda para trás; isto vale daqui para
-- frente.
--
-- ⚠️ E as listas abaixo são PARCIAIS, de propósito: declaram o que foi dito
-- (sachê e líquido) e NÃO declaram a embalagem. O pote da bomboniere e a
-- garrafa/tampa/rótulo da boca 28 não têm código que eu possa afirmar, e
-- inventar insumo é pior que não declarar. Consequência prática: uma OP
-- desses dois vai deduzir o conteúdo e não a embalagem — a fábrica precisa
-- completar. Lista parcial é melhor que lista ausente (que vale ZERO e não
-- parece erro), mas não é lista pronta.
-- ═══════════════════════════════════════════════════════════════════════════


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 1 — o fator de unidade                                          ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
--
-- ⚠️ `unidades_por_venda = 1` nos dois: é o que a baixa de estoque lê, e um
-- item vendido tira UM item da prateleira. O 80 é quantas unidades o CLIENTE
-- leva, e isso é o `display_units_per_pack` — os dois campos respondem
-- perguntas diferentes, e trocá-los faria o galpão perder 80 bomboniere onde
-- saiu uma.

insert into public.sku_product_mappings
  (platform, platform_sku, product_id, unidades_por_venda, display_units_per_pack, units_per_kit, description)
select null, v.codigo, p.id, 1, v.display, 1, v.nota
from (values
  ('BOM-80-SAC',     80, 'Bomboniere: um pote sai da prateleira, 80 saches chegam ao cliente.'),
  ('CAR-100-BOC-28',  1, 'Boca 28: outro modelo de garrafa, mesmo conteudo do 100ml. Um frasco, uma unidade.')
) as v(codigo, display, nota)
join public.mrp_products p on upper(btrim(p.product_code)) = v.codigo
where not exists (
  select 1 from public.sku_product_mappings m
  where m.is_active and m.platform_sku = v.codigo and m.platform is null
);


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 2 — a lista de materiais                                        ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
--
-- ⚠️ A bomboniere aponta para o SACHÊ, não para o líquido direto. Dizer
-- "0,96 L" aqui seria a conta já feita, congelada: no dia em que o sachê
-- mudar de 12 ml, a bomboniere continuaria dizendo 0,96. Apontando para o
-- componente, a árvore recalcula sozinha — é o mesmo motivo de o CZ100
-- apontar para a EMB-LIQ100ML em vez de para os 100 ml.
--
-- ⚠️ Já a boca 28 aponta para o LÍQUIDO direto, e não para a EMB-LIQ100ML:
-- aquela embalagem é a garrafa boca 24, e reusá-la aqui afirmaria a garrafa
-- errada. O que foi dito é o conteúdo; é só o conteúdo que vai declarado.

insert into public.mrp_bom (product_id, insumo_id, quantity_per_unit, unit, notes)
select pai.id, comp.id, v.qtd, v.unidade, v.nota
from (values
  ('BOM-80-SAC',     'CARB-SACH-10ML', 80,  'un', 'Bomboniere com 80 saches. Lista PARCIAL: falta o pote.'),
  ('CAR-100-BOC-28', 'INS-LIQ-CARBO',  100, 'ml', 'Mesmo conteudo do 100ml. Lista PARCIAL: falta garrafa boca 28, tampa e rotulo.')
) as v(cod_pai, cod_comp, qtd, unidade, nota)
join public.mrp_products pai  on upper(btrim(pai.product_code))  = v.cod_pai
join public.mrp_products comp on upper(btrim(comp.product_code)) = v.cod_comp
where not exists (
  select 1 from public.mrp_bom b where b.product_id = pai.id and b.insumo_id = comp.id
);


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 3 — conferência                                                 ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

-- 1. Nenhum Produto Final pode sobrar sem fator — tem de vir ZERO linhas.
select p.product_code, p.name
from public.mrp_products p
where p.category = 'Produto Final' and p.bonificacao_de is null
  and not exists (select 1 from public.sku_product_mappings m
                   where m.product_id = p.id and m.is_active)
order by 1;

-- 2. Litros por item dos dois recém-cadastrados.
--    Esperado: BOM-80-SAC = 0,96 L (80 × 12 ml) · CAR-100-BOC-28 = 0,1 L.
with recursive exp as (
  select p.id raiz, b.insumo_id, b.quantity_per_unit::numeric fator, b.unit, 1 nivel
  from public.mrp_products p join public.mrp_bom b on b.product_id = p.id
  where p.product_code in ('BOM-80-SAC', 'CAR-100-BOC-28')
  union all
  select e.raiz, b.insumo_id, e.fator * b.quantity_per_unit::numeric, b.unit, e.nivel + 1
  from exp e join public.mrp_bom b on b.product_id = e.insumo_id
  where e.nivel < 6
)
select p.product_code,
       round(sum(e.fator * case lower(e.unit) when 'ml' then 0.001 else 1 end), 4) as litros_por_item
from exp e
join public.mrp_products i on i.id = e.insumo_id and i.product_code = 'INS-LIQ-CARBO'
join public.mrp_products p on p.id = e.raiz
group by 1 order by 1;
