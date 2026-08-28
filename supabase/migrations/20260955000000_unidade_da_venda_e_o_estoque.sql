-- ═══════════════════════════════════════════════════════════════════════════
-- A venda sabe quantas unidades ela vale, e de qual prateleira sai
--
-- Pedido do dono do processo:
--   "lá embaixo no produto, ter como dizer quantas unidades a venda dele
--    equivale e escolher qual item ele vai deduzir no estoque da LogHouse,
--    setado manual, menos risco de erro, e quando surgirem novos produtos não
--    precisa fazer a conexão por código, pq já vai meio que existir. Aí o banco
--    tem que entender que a venda equivale a 5 itens, logo no estoque
--    deduziria 5."
--
-- ── O que existe hoje, e por que não basta ────────────────────────────────
--
-- `sku_product_mappings` já liga SKU da plataforma → produto do MRP, com
-- `units_per_kit`. Mas o número está partido em DOIS campos com donos
-- diferentes (`20260608000001`): `units_per_kit` alimentava o estoque e
-- `display_units_per_pack` a tela. Duas colunas para a mesma pergunta é uma
-- garantia de que elas vão divergir — e divergiram: a aba "Produtos Vendidos"
-- mostra ×5 e ×10, o Comparativo mostra 1×, e o Histórico soma uma terceira
-- coisa.
--
-- Esta migração faz `unidades_por_venda` ser O número, com um significado só:
-- quantas unidades FÍSICAS saem da prateleira quando uma unidade daquele SKU é
-- vendida. Kit de 5 frascos = 5. Kit de 10 sachês = 10. Frasco avulso = 1.
--
-- ⚠️ E isso obriga `product_id` a apontar para o PRODUTO UNITÁRIO (o frasco),
-- não para o kit. É a mudança de modelo, e é ela que faz a conta fechar: 1
-- venda × 5 unidades = 5 frascos baixados do frasco.
--
-- ── ⚠️ POR QUE ISTO NÃO LIGA A DEDUÇÃO AINDA ─────────────────────────────
--
-- A dedução de e-commerce JÁ EXISTIU, deduzia deste mesmo galpão, e foi
-- DESLIGADA em 06/2026 por decisão do dono do processo
-- (`20260834000000_ecommerce_para_de_deduzir_estoque.sql`). O arquivo não
-- registra o motivo. Religar o mesmo mecanismo sem saber por que ele foi
-- desligado é repetir um erro que já custou uma reversão.
--
-- Três coisas precisam de resposta ANTES, e as três estão medidas nos BLOCOS
-- 0 e 6 abaixo:
--
--   1. Quais canais realmente despacham da LogHouse. "Venda online ⇒ saiu do
--      HUB-SP" é uma APOSTA, não um dado: em Full/FBA a mercadoria já está no
--      galpão da plataforma e nada sai daqui. Deduzir esses seria subtrair o
--      que não saiu — com ledger bonito, e errado.
--   2. Se algum pedido é deduzido pelos DOIS caminhos. Hoje três coincidências
--      evitam isso (HUB-RN no código do `pos_venda_deduct_stock`, ausência de
--      `product_id` nos itens da ponte, e o pedido da ponte nascendo em
--      'entregue'). Nenhuma é trava; cada uma é candidata a ser "consertada"
--      por uma tarefa que não sabe que mexe em estoque.
--   3. Quanto do que se vende tem mapeamento. SKU sem mapa não erra: some.
--
-- Por isso esta migração cria a ESTRUTURA e a MEDIÇÃO, e a dedução entra num
-- passo separado, depois que os números destes blocos forem lidos.
--
-- ⚠️ RODE EM BLOCOS.
-- ═══════════════════════════════════════════════════════════════════════════


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 0 — o estado REAL do banco (arquivo não é prova)                ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
--
-- ⚠️ A 20260834 registra que a 20260605000005 nunca foi aplicada neste banco,
-- embora o arquivo esteja no repositório desde junho. Pergunte ao banco.

-- (a) A dedução está mesmo inerte? `true` = desligada.
select pg_get_functiondef('public.handle_ecommerce_order_sp_stock()'::regprocedure)
         !~ 'warehouse_stock'                                   as deducao_desligada,
       exists (select 1 from pg_trigger t join pg_class c on c.oid = t.tgrelid
                where c.relname = 'ecommerce_orders'
                  and t.tgname = 'ecommerce_order_sp_stock_trigger'
                  and not t.tgisinternal)                        as trigger_ainda_existe;

-- (b) ⭐ O PASSIVO: unidades que a dedução antiga já tirou e nunca estornou.
--     Elas JÁ estão descontadas do saldo que a tela mostra hoje.
select platform, count(*) as pedidos, sum(stock_deducted_units) as unidades_descontadas,
       min(ordered_at)::date as de, max(ordered_at)::date as ate
from public.ecommerce_orders
where coalesce(stock_deducted_units, 0) > 0
group by 1 order by 3 desc;

-- (c) O mapa de hoje: quantos SKUs, e os dois campos lado a lado.
select platform_sku, coalesce(platform,'(todas)') as plataforma,
       units_per_kit, display_units_per_pack, is_active,
       (select product_code from public.mrp_products p where p.id = m.product_id) as produto,
       (select name from public.mrp_products p where p.id = m.product_id)         as nome_produto,
       (select bonificacao_de is not null from public.mrp_products p where p.id = m.product_id)
                                                                                  as aponta_para_gemeo
from public.sku_product_mappings m
order by is_active desc, platform_sku;

-- (d) Duplicatas e plataformas inválidas — o BLOCO 2 vai recusar as duas.
select platform_sku, coalesce(platform,'(todas)') as plataforma, count(*) as linhas
from public.sku_product_mappings where is_active
group by 1,2 having count(*) > 1;

select distinct platform from public.sku_product_mappings
where platform is not null
  and platform not in ('mercadolivre','amazon','tiktok','shopee','nuvemshop');


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 1 — UM número, com um significado só                            ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
--
-- `unidades_por_venda` nasce preenchida a partir do que já existe, preferindo
-- `display_units_per_pack` — que é onde o ×5 e o ×10 do CarboZé já estão.

alter table public.sku_product_mappings
  add column if not exists unidades_por_venda numeric;

update public.sku_product_mappings
set unidades_por_venda = coalesce(display_units_per_pack, units_per_kit, 1)
where unidades_por_venda is null;

alter table public.sku_product_mappings
  alter column unidades_por_venda set default 1,
  alter column unidades_por_venda set not null;

-- ⚠️ Fracionário não cabe: `warehouse_stock.quantity` e `units_real` são
-- INTEGER. Um fator 0,5 arredondaria em silêncio e o total deixaria de fechar.
alter table public.sku_product_mappings
  drop constraint if exists sku_unidades_por_venda_check;
alter table public.sku_product_mappings
  add constraint sku_unidades_por_venda_check
  check (unidades_por_venda > 0 and unidades_por_venda = round(unidades_por_venda));

comment on column public.sku_product_mappings.unidades_por_venda is
  'Quantas unidades FÍSICAS saem da prateleira por unidade vendida deste SKU. Kit de 5 frascos = 5. ⚠️ É O número — vale para a tela E para o estoque. `units_per_kit` e `display_units_per_pack` ficam como legado: dois campos para a mesma pergunta é garantia de divergirem, e divergiram (a tela mostrava ×5 numa aba e 1× em outra).';

comment on column public.sku_product_mappings.product_id is
  'O produto do MRP de onde a unidade sai. ⚠️ Tem de ser o produto UNITÁRIO (o frasco), não o kit — é o que faz 1 venda × 5 unidades baixar 5 frascos. Apontar para o kit com fator 5 baixaria 5 KITS.';


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 2 — as travas que faltavam na tabela                            ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
--
-- ⚠️ Se o BLOCO 0(d) trouxe linhas, resolva-as ANTES: o índice único abaixo
-- vai falhar, e falhar aqui é melhor que escolher a duplicata errada em
-- silêncio na hora de deduzir.

-- Um mapa por (SKU, plataforma). `coalesce` porque NULL != NULL no Postgres —
-- sem ele, N linhas "para todas as plataformas" seriam aceitas, e o desempate
-- entre elas é arbitrário e pode mudar entre execuções.
create unique index if not exists sku_product_mappings_unico
  on public.sku_product_mappings (platform_sku, coalesce(platform, '__todas__'))
  where is_active;

-- ⚠️ Plataforma tem de ser uma das que existem em `ecommerce_orders`. O
-- comentário de nascimento da tabela cita 'lp', que não existe naquele CHECK:
-- um mapa cadastrado assim nunca casa e nunca dá erro — fica invisível, como o
-- PDV que não casava por causa do acento.
alter table public.sku_product_mappings
  drop constraint if exists sku_platform_valida;
alter table public.sku_product_mappings
  add constraint sku_platform_valida
  check (platform is null
         or platform in ('mercadolivre','amazon','tiktok','shopee','nuvemshop'));

-- ⚠️ A RLS era `FOR ALL TO authenticated USING(true)` — escrita ABERTA.
-- `authenticated` inclui o portal de lojas e o de licenciados, que usam a MESMA
-- tabela `profiles`. Hoje um lojista pode alterar o número que vai dirigir a
-- baixa de estoque. Leitura continua ampla (a tela do Ops precisa); escrita
-- passa a exigir time interno.
drop policy if exists "auth users manage sku mappings" on public.sku_product_mappings;

drop policy if exists sku_map_leitura on public.sku_product_mappings;
create policy sku_map_leitura on public.sku_product_mappings
  for select to authenticated using (public.carbo_e_time_interno());

drop policy if exists sku_map_escrita on public.sku_product_mappings;
create policy sku_map_escrita on public.sku_product_mappings
  for all to authenticated
  using (public.carbo_e_time_interno())
  with check (public.carbo_e_time_interno());


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 3 — a regra, em UMA função                                      ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
--
-- ⚠️ Uma função, e não a consulta repetida em cada lugar. Hoje a mesma
-- resolução está escrita em cinco lugares (trigger de estoque, enrichUnitsReal
-- da Nuvemshop, e três cópias do hook do front) — e a do front resolve ERRADO:
-- ela indexa o mapa só por SKU, sem a plataforma, então o fator da Amazon pode
-- ser aplicado a uma linha da Shopee dependendo da ordem que o banco devolver.

create or replace function public.carbo_ecommerce_sku_resolve(
  p_platform text, p_sku text
) returns table (product_id uuid, unidades_por_venda numeric, via text)
language sql stable security definer set search_path = public as $$
  -- Específico da plataforma vence o genérico; o fallback por product_code
  -- cobre o SKU que é igual ao código do MRP e nunca foi cadastrado.
  select m.product_id, m.unidades_por_venda,
         case when m.platform is null then 'mapa generico' else 'mapa da plataforma' end
  from public.sku_product_mappings m
  where m.platform_sku = p_sku
    and m.is_active
    and (m.platform = p_platform or m.platform is null)
  order by (m.platform = p_platform) desc nulls last
  limit 1
$$;

comment on function public.carbo_ecommerce_sku_resolve is
  'De qual produto e quantas unidades sai uma venda daquele SKU. ⚠️ Fonte ÚNICA: tela, faturamento e estoque leem daqui. Específico da plataforma vence o genérico.';

grant execute on function public.carbo_ecommerce_sku_resolve(text, text) to authenticated;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 4 — de qual galpão cada canal despacha                          ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
--
-- ⚠️ ESTA TABELA EXISTE PARA NÃO ADIVINHAR.
--
-- "Venda online ⇒ saiu da LogHouse" é uma aposta. Em Mercado Livre Full e
-- Amazon FBA a mercadoria já está no galpão da plataforma há semanas: a venda
-- acontece e NADA sai do HUB-SP. Deduzir esses canais subtrai o que não saiu, e
-- o saldo cai de forma convincente.
--
-- Canal sem linha aqui NÃO deduz. O padrão é não mexer no estoque — a mesma
-- lógica do "ausência FECHA" dos segredos: o modo seguro é o que não age.

create table if not exists public.carbo_canal_estoque (
  platform      text primary key
                  check (platform in ('mercadolivre','amazon','tiktok','shopee','nuvemshop')),
  warehouse_code text not null references public.warehouses(code),
  ativo         boolean not null default false,
  observacao    text,
  atualizado_em timestamptz not null default now()
);

comment on table public.carbo_canal_estoque is
  'De qual galpão cada canal de e-commerce despacha. ⚠️ Canal SEM linha, ou com ativo=false, NÃO deduz nada — o padrão é não mexer no estoque. Existe porque "venda online ⇒ saiu da LogHouse" é premissa, não dado: em ML Full e Amazon FBA a mercadoria já está no galpão da plataforma.';

alter table public.carbo_canal_estoque enable row level security;
drop policy if exists carbo_canal_estoque_leitura on public.carbo_canal_estoque;
create policy carbo_canal_estoque_leitura on public.carbo_canal_estoque
  for select to authenticated using (public.carbo_e_time_interno());

-- Nasce tudo DESLIGADO, de propósito. Ligar canal é decisão de quem sabe se
-- ele despacha daqui — e essa pergunta ainda não tem resposta no repositório.
insert into public.carbo_canal_estoque (platform, warehouse_code, ativo, observacao) values
  ('nuvemshop',    'HUB-SP', false, 'Loja própria — confirmar se todo pedido sai da LogHouse'),
  ('mercadolivre', 'HUB-SP', false, '⚠️ CONFERIR FULL: no Full a mercadoria já está com o ML'),
  ('amazon',       'HUB-SP', false, '⚠️ CONFERIR FBA: no FBA a mercadoria já está com a Amazon'),
  ('shopee',       'HUB-SP', false, '⚠️ Shopee não tem ecommerce_orders — ver BLOCO 6(c)')
on conflict (platform) do nothing;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 5 — o ledger, e a trava contra dedução dupla                    ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
--
-- ⚠️ A CHAVE ÚNICA É A TRAVA, e ela mora no BANCO.
--
-- O mesmo pedido está em `ecommerce_orders` e, pela ponte do Bling 2, em
-- `carboze_orders`. Hoje nenhum dos dois lados olha para o outro. Com esta
-- tabela, os dois caminhos inserem com a MESMA chave de origem e o segundo bate
-- no `on conflict do nothing` — não importa qual chegue primeiro.
--
-- É o mesmo padrão de `carbo_msg_envios` (chave `bling_id, etapa`), e o oposto
-- do erro do `bling_nf_id`, onde duas coisas disputavam a mesma coluna com o
-- mesmo significado.

create table if not exists public.carbo_estoque_consumo (
  id             bigint generated always as identity primary key,
  -- A ORIGEM, e é ela que impede contar duas vezes.
  origem_tipo    text not null check (origem_tipo in ('ecommerce','bling')),
  origem_chave   text not null,          -- platform:order_id  ou  bling:<bling_id>:<sku>
  warehouse_id   uuid not null references public.warehouses(id),
  product_id     uuid not null references public.mrp_products(id),
  unidades       integer not null check (unidades > 0),
  ocorreu_em     timestamptz not null,
  -- Rastro do cálculo: sem isto, conferir uma linha exige refazer a conta de
  -- cabeça meses depois.
  platform       text,
  platform_sku   text,
  quantidade     numeric,
  fator          numeric,
  criado_em      timestamptz not null default now()
);

create unique index if not exists carbo_estoque_consumo_origem
  on public.carbo_estoque_consumo (origem_tipo, origem_chave, product_id);

create index if not exists carbo_estoque_consumo_wh_idx
  on public.carbo_estoque_consumo (warehouse_id, product_id, ocorreu_em);

comment on table public.carbo_estoque_consumo is
  'Cada saída de estoque já atribuída a uma venda de e-commerce. ⚠️ O índice único (origem_tipo, origem_chave, product_id) é a TRAVA contra dedução dupla: o mesmo pedido chegando pelos dois caminhos insere uma vez só. Guarda quantidade e fator para a linha ser conferível sem refazer a conta.';

alter table public.carbo_estoque_consumo enable row level security;
drop policy if exists carbo_estoque_consumo_leitura on public.carbo_estoque_consumo;
create policy carbo_estoque_consumo_leitura on public.carbo_estoque_consumo
  for select to authenticated using (public.carbo_e_time_interno());


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 6 — O ENSAIO: o que a dedução FARIA, sem fazer                  ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
--
-- ⚠️ Esta view NÃO escreve em estoque nenhum. Ela mostra, pedido a pedido, o
-- que a dedução tiraria se fosse ligada. É o que permite ver o número antes de
-- ele virar saldo — e é o passo que faltou quando isto foi ligado da primeira
-- vez e teve de ser desligado.

create or replace view public.carbo_estoque_ensaio
with (security_invoker = true) as
select
  o.platform,
  o.order_id,
  o.platform_order_number,
  o.product_sku,
  o.product_name,
  o.quantity                                          as qtd_vendida,
  o.units_real,
  o.status,
  o.ordered_at,
  r.unidades_por_venda                                as fator,
  (o.quantity * r.unidades_por_venda)::numeric        as unidades_a_deduzir,
  -- ⚠️ Resolve o gêmeo de bonificação para o PAI, como carbo_itens_para_estoque
  -- faz. Sem isto o consumo cairia num SKU que nunca tem saldo — e o gêmeo é
  -- filtrado de todas as telas de estoque, então a linha some.
  coalesce(pr.bonificacao_de, r.product_id)           as product_id_alvo,
  coalesce(pai.product_code, pr.product_code)         as produto_alvo,
  coalesce(pai.name, pr.name)                         as nome_alvo,
  c.warehouse_code,
  c.ativo                                             as canal_deduz,
  case
    when r.product_id is null           then '⚠️ SKU SEM MAPEAMENTO — não deduziria nada'
    when c.platform is null             then '⚠️ canal sem configuração de galpão'
    when not c.ativo                    then 'canal desligado — não deduz'
    when pr.bonificacao_de is not null  then 'gêmeo de bonificação — baixa do produto pai'
    else                                     'deduziria'
  end                                                 as veredito
from public.ecommerce_orders o
left join lateral public.carbo_ecommerce_sku_resolve(o.platform, o.product_sku) r on true
left join public.mrp_products pr  on pr.id = r.product_id
left join public.mrp_products pai on pai.id = pr.bonificacao_de
left join public.carbo_canal_estoque c on c.platform = o.platform
where o.status in ('paid','shipped','delivered');

comment on view public.carbo_estoque_ensaio is
  'O que a dedução de estoque FARIA, pedido a pedido, sem fazer nada. ⚠️ security_invoker = true — repita a cláusula em toda republicação.';

grant select on public.carbo_estoque_ensaio to authenticated;


-- ── As três medições que decidem se dá para ligar ──────────────────────────

-- (a) ⭐ O RESUMO. `sem_mapeamento` alto significa que o espelho não veria essa
--     saída — e o saldo ficaria alto de forma crescente e invisível.
select platform, veredito, count(*) as linhas,
       sum(qtd_vendida) as packs, sum(unidades_a_deduzir) as unidades
from public.carbo_estoque_ensaio
where ordered_at > now() - interval '90 days'
group by 1, 2 order by 1, 5 desc nulls last;

-- (b) ⭐ A LISTA DE TRABALHO: SKU vendido e sem mapa, por volume.
select platform, product_sku, max(product_name) as nome,
       count(*) as linhas, sum(qtd_vendida) as packs,
       max(ordered_at)::date as ultima_venda
from public.carbo_estoque_ensaio
where veredito like '%SEM MAPEAMENTO%'
group by 1, 2 order by packs desc;

-- (c) ⚠️ O RISCO DE DEDUÇÃO DUPLA, medido. Pedido que está nos DOIS caminhos.
--     `ja_deduzido_pelo_outro` > 0 é o alarme.
select bo.bling_id, bo.numero_loja,
       coalesce(nullif(l.nome,''), 'Canal ' || bo.loja_id::text) as canal,
       bo.data::date as data_pedido,
       o.order_number as carboze, o.stock_deducted as caminho_bling_deduziu,
       count(eo.id)   as linhas_no_ecommerce,
       sum(coalesce(eo.stock_deducted_units,0)) as ja_deduzido_pelo_outro
from public.bling2_orders bo
left join public.bling2_lojas   l on l.bling_id = bo.loja_id
left join public.carboze_orders o on o.external_ref = 'bling2-' || bo.bling_id
join public.ecommerce_orders   eo on eo.platform_order_number = bo.numero_loja
where bo.situacao_id in (9, 12)
group by 1,2,3,4,5,6
order by bo.data::date desc
limit 100;

-- (d) A premissa do galpão: saídas estimadas × entradas registradas em 90 dias.
--     Saída muito maior que qualquer entrada plausível significa que a premissa
--     "sai da LogHouse" está errada para algum canal (Full/FBA).
select 'saida estimada (ensaio)' as fonte, sum(unidades_a_deduzir)::numeric as unidades
from public.carbo_estoque_ensaio
where ordered_at > now() - interval '90 days' and veredito = 'deduziria'
union all
select 'entrada por transferencia', coalesce(sum(t.quantity), 0)
from public.stock_transfers t
join public.warehouses w on w.id = t.to_hub and w.code = 'HUB-SP'
where t.executed_at > now() - interval '90 days'
union all
select 'entrada em stock_movements', coalesce(sum(sm.quantidade), 0)
from public.stock_movements sm
join public.warehouses w on w.id = sm.warehouse_id and w.code = 'HUB-SP'
where sm.tipo = 'entrada' and sm.created_at > now() - interval '90 days';
