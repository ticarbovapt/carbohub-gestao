-- ═══════════════════════════════════════════════════════════════════════════
-- PDVs — mix de produto, preço de revenda, vendedor dono e data de abertura
--
-- Completa o cadastro dos 69 PDVs com o que faltava da planilha do comercial:
--   • Abertura         → quando o ponto começou
--   • Vendedor dono    → de quem é a carteira
--   • Mix por produto  → Carbozé 10ml (sachê), 100ml e 1L, com preço de revenda
--   • Status "Cadastrado" → existe na planilha e não existia no banco
--
-- ⚠️ VENDEDOR DONO NÃO É O VENDEDOR DA VENDA.
-- Quem fecha o pedido frequentemente não é o dono do ponto. Este campo é
-- atribuição de carteira e NADA mais: não entra em comissão, não entra em
-- meta, não é lido por carboze_orders. O vendedor da venda continua sendo
-- carboze_orders.vendedor_id, escrito por quem faturou. Se algum dia alguém
-- for tentado a "corrigir" a venda pelo dono do PDV, é aqui que quebra.
--
-- ⚠️ TUDO É CHAVEADO POR CNPJ, nunca por nome.
-- Cada CNPJ é uma filial independente, mesmo dentro da mesma rede: Posto
-- Amigo tem 6 e Via Diesel tem 2. Casar por nome juntaria filial que tem
-- preço e mix diferentes. Os 2 PDVs sem documento (Gilberto Ferreira da
-- Costa e Posto São Francisco) são os únicos casados por nome, porque não
-- há outra chave — quando o CPF chegar, viram CNPJ como o resto.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Colunas novas em pdvs ──────────────────────────────────────────────
alter table public.pdvs add column if not exists opened_at date;
alter table public.pdvs add column if not exists owner_seller_id uuid references public.profiles(id) on delete set null;
alter table public.pdvs add column if not exists owner_seller_name text;

comment on column public.pdvs.opened_at is
  'Abertura do ponto. A planilha traz mês/ano; guardamos no dia 1.';
comment on column public.pdvs.owner_seller_id is
  'Vendedor DONO da carteira. NÃO é o vendedor da venda (esse é carboze_orders.vendedor_id). Não afeta comissão nem meta.';
comment on column public.pdvs.owner_seller_name is
  'Nome do dono como veio da planilha. Fica gravado mesmo quando owner_seller_id não casa com nenhum profile.';

create index if not exists idx_pdvs_owner_seller on public.pdvs (owner_seller_id)
  where owner_seller_id is not null;

-- ── 2. Status "Cadastrado" ────────────────────────────────────────────────
-- Ponto que já foi cadastrado mas ainda não começou a vender (RC Techcar).
-- Sem isto ele teria que entrar como 'active' e inflaria a contagem de PDVs
-- ativos, que é justamente o número que a diretoria olha.
alter table public.pdvs drop constraint if exists pdvs_status_check;
alter table public.pdvs add constraint pdvs_status_check
  check (status in ('active', 'inactive', 'suspended', 'registered'));

-- ── 3. Mix de produto por PDV ─────────────────────────────────────────────
-- Tabela separada, uma linha por (PDV, produto). Não são 6 colunas em `pdvs`
-- porque o catálogo cresce: no dia que entrar um 500ml, coluna nova exigiria
-- migração + mexer em toda tela. Aqui é INSERT.
--
-- `oferece` tem TRÊS estados, não é booleano: a planilha distingue "Não"
-- (decidido que não vende) de "A confirmar" (ninguém checou ainda). Virar
-- booleano perderia essa diferença, e é ela que diz onde falta trabalho.
create table if not exists public.pdv_produto_mix (
  id uuid primary key default gen_random_uuid(),
  pdv_id uuid not null references public.pdvs(id) on delete cascade,
  produto text not null check (produto in ('10ml', '100ml', '1l')),
  oferece text not null default 'a_confirmar'
    check (oferece in ('sim', 'nao', 'a_confirmar')),
  -- Preço que o PDV cobra do consumidor final, não o que ele paga para nós.
  -- Nulo com oferece='sim' é normal: vende, mas o preço não foi registrado.
  preco_revenda numeric(10, 2),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (pdv_id, produto)
);

comment on table public.pdv_produto_mix is
  'Mix de produto por PDV: se oferece Carbozé 10ml/100ml/1L e por quanto revende. preco_revenda é o preço ao consumidor final.';

create index if not exists idx_pdv_mix_pdv on public.pdv_produto_mix (pdv_id);

alter table public.pdv_produto_mix enable row level security;

drop policy if exists "pdv_mix_select_authenticated" on public.pdv_produto_mix;
create policy "pdv_mix_select_authenticated"
  on public.pdv_produto_mix for select to authenticated using (true);

drop policy if exists "pdv_mix_write_manager" on public.pdv_produto_mix;
create policy "pdv_mix_write_manager"
  on public.pdv_produto_mix for all to authenticated
  using (public.is_manager_or_admin(auth.uid()))
  with check (public.is_manager_or_admin(auth.uid()));

-- ── 4. Carga: abertura, dono e status ─────────────────────────────────────
-- Green Lub está com "out./2026" na planilha — OUTUBRO de 2026, três meses
-- no FUTURO. Carrego como veio em vez de adivinhar 2025; a conferência no
-- fim desta migração aponta a linha para você decidir.
with planilha(cnpj, abertura, vendedor, situacao) as (values
  ('56034248000128', date '2026-06-01', 'Thelis',  'active'),
  ('55756460000136', date '2026-06-01', 'Thelis',  'active'),
  ('49695909000109', date '2026-06-01', 'Thelis',  'active'),
  ('46093929000103', date '2026-06-01', 'Thelis',  'active'),
  ('36885469000100', date '2026-06-01', 'Thelis',  'active'),
  ('36919772000179', date '2026-06-01', 'Thelis',  'active'),
  ('63636712000111', date '2026-06-01', 'Thelis',  'active'),
  ('41127084000106', date '2026-06-01', 'Thelis',  'active'),
  ('05114232000194', date '2026-06-01', 'Thelis',  'active'),
  ('41346459000129', date '2026-06-01', 'Thelis',  'active'),
  ('23681584000103', date '2026-06-01', 'Thelis',  'active'),
  ('55380115000140', date '2026-06-01', 'Thelis',  'active'),
  ('36010401000170', date '2026-06-01', 'Thelis',  'active'),
  ('58025861000104', date '2026-06-01', 'Thelis',  'active'),
  ('46850953000140', date '2026-06-01', 'Thelis',  'active'),
  ('40797112000130', date '2026-06-01', 'Thelis',  'active'),
  ('31196786000198', date '2026-06-01', 'Thelis',  'active'),
  ('56004670000130', date '2026-06-01', 'Thelis',  'active'),
  ('42879738000110', date '2026-06-01', 'Thelis',  'active'),
  ('23099667000199', date '2026-05-01', 'Weider',  'active'),
  ('27246573000156', date '2026-05-01', 'Weider',  'active'),
  ('09111857000153', date '2026-05-01', 'Weider',  'active'),
  ('30988332000197', date '2026-05-01', 'Weider',  'active'),
  ('58170370000157', date '2026-05-01', 'Weider',  'active'),
  ('61555340000173', date '2026-05-01', 'Weider',  'active'),
  ('19886707000175', date '2026-04-01', 'Erick',   'active'),
  ('48396144000135', date '2026-03-01', 'Thelis',  'active'),
  ('08562870000328', date '2026-03-01', 'Thelis',  'active'),
  ('60957784002973', date '2026-03-01', 'Erick',   'active'),
  ('58214452000156', date '2026-03-01', 'Rodrigo', 'active'),
  ('07346019000133', date '2026-02-01', 'Erick',   'active'),
  ('10820614000173', date '2026-02-01', 'Erick',   'active'),
  ('00251951000133', date '2026-02-01', 'Thiago',  'active'),
  ('47264537000122', date '2026-02-01', 'Rodrigo', 'active'),
  ('22626556000120', date '2026-02-01', 'França',  'active'),
  ('17462911000133', date '2026-02-01', 'Ivo',     'active'),
  ('09153852000193', date '2026-02-01', 'Thelis',  'active'),
  ('34440324000162', date '2026-02-01', 'Rodrigo', 'active'),
  ('53425780000188', date '2026-02-01', 'Thelis',  'active'),
  ('23994116000199', date '2026-01-01', 'Rodrigo', 'active'),
  ('03797507000106', date '2026-01-01', 'Erick',   'active'),
  ('42431461000169', date '2026-01-01', 'Erick',   'active'),
  ('04233645000397', date '2026-01-01', 'Márcio',  'active'),
  ('00993944000107', date '2026-01-01', 'Thelis',  'active'),
  ('63989994000130', date '2026-01-01', 'Márcio',  'active'),
  ('52345676000110', date '2026-01-01', 'Márcio',  'active'),
  -- RC Techcar: único "Cadastrado" da planilha — existe, ainda não vende.
  ('46405401000122', date '2026-01-01', 'Márcio',  'registered'),
  ('12689295000568', date '2025-12-01', 'Thelis',  'active'),
  ('12689295000304', date '2025-12-01', 'Thelis',  'active'),
  ('35751096000104', date '2025-12-01', 'Thelis',  'active'),
  ('12689295000134', date '2025-12-01', 'Thelis',  'active'),
  ('12689295000215', date '2025-12-01', 'Thelis',  'active'),
  ('12689295000720', date '2025-12-01', 'Thelis',  'active'),
  ('37647991000109', date '2025-12-01', 'Thelis',  'active'),
  ('08693517000115', date '2025-09-01', 'Thelis',  'active'),
  ('24363368000182', date '2025-09-01', 'Thelis',  'active'),
  ('11427399000108', date '2026-04-01', 'Rodrigo', 'active'),
  ('27112266000182', date '2026-05-01', 'Erick',   'active'),
  ('26730240000135', date '2026-05-01', 'Márcio',  'active'),
  ('26728025000108', date '2026-04-01', 'Márcio',  'active'),
  ('24708130000141', date '2026-05-01', 'Márcio',  'active'),
  ('01937258000262', date '2026-04-01', 'Márcio',  'active'),
  ('01937258000181', date '2026-04-01', 'Márcio',  'active'),
  ('57653140000186', date '2026-10-01', 'Márcio',  'active'),  -- ⚠️ futuro
  ('05620241000157', date '2026-06-01', 'Rodrigo', 'active'),
  ('16607328000100', date '2026-07-01', 'Thelis',  'active'),
  ('08533625000120', date '2026-07-01', 'Thelis',  'active')
)
update public.pdvs p
set opened_at         = pl.abertura,
    owner_seller_name = pl.vendedor,
    status            = pl.situacao,
    updated_at        = now()
from planilha pl
where regexp_replace(coalesce(p.cnpj, ''), '\D', '', 'g') = pl.cnpj;

-- Os 2 sem documento: única chave possível é o nome.
update public.pdvs set opened_at = date '2026-01-01', owner_seller_name = 'Thelis', updated_at = now()
where name = 'Gilberto Ferreira da Costa' and cnpj is null;
update public.pdvs set opened_at = date '2026-06-01', owner_seller_name = 'Rodrigo', updated_at = now()
where name = 'Posto São Francisco' and cnpj is null;

-- ── 5. Resolver o dono para um profile de verdade ─────────────────────────
-- A planilha traz só o primeiro nome ("Thelis", "Márcio"), o sistema guarda
-- o nome completo ("Thelis Botelho", "Marcio Vannucci"). Note que "Márcio"
-- tem acento na planilha e "Marcio" não tem no banco — por isso a busca é
-- por prefixo do primeiro nome sem o acento, não por igualdade.
--
-- O `= 1` é a guarda que importa: se dois profiles casarem com o mesmo
-- primeiro nome, NENHUM é escolhido. Atribuir carteira à pessoa errada é
-- pior do que deixar em branco — o nome da planilha continua em
-- owner_seller_name de qualquer jeito, então nada se perde.
update public.pdvs p
set owner_seller_id = (
  select pr.id from public.profiles pr
  where translate(lower(pr.full_name), 'áàâãéêíóôõúüç', 'aaaaeeiooouuc')
        like translate(lower(p.owner_seller_name), 'áàâãéêíóôõúüç', 'aaaaeeiooouuc') || '%'
  limit 1
)
where p.owner_seller_name is not null
  and p.owner_seller_id is null
  and (
    select count(*) from public.profiles pr
    where translate(lower(pr.full_name), 'áàâãéêíóôõúüç', 'aaaaeeiooouuc')
          like translate(lower(p.owner_seller_name), 'áàâãéêíóôõúüç', 'aaaaeeiooouuc') || '%'
  ) = 1;

-- ── 6. Carga do mix ───────────────────────────────────────────────────────
-- Preço em branco na planilha entra NULO, não zero: zero significaria
-- "revende de graça". Nulo significa "não sabemos", que é a verdade.
with mix(cnpj, p10, v10, p100, v100, p1l, v1l) as (values
  ('56034248000128','sim',5.00,'sim',30.00,'nao',null::numeric),
  ('55756460000136','sim',5.00,'sim',30.00,'sim',200.00),
  ('49695909000109','sim',5.00,'sim',30.00,'sim',200.00),
  ('46093929000103','sim',5.00,'sim',30.00,'nao',null),
  ('36885469000100','sim',5.00,'sim',30.00,'nao',null),
  ('36919772000179','sim',5.00,'sim',30.00,'nao',null),
  ('63636712000111','sim',5.00,'sim',30.00,'nao',null),
  ('41127084000106','sim',5.00,'sim',30.00,'nao',null),
  ('05114232000194','sim',5.00,'sim',30.00,'nao',null),
  ('41346459000129','sim',5.00,'sim',30.00,'sim',200.00),
  ('23681584000103','sim',5.00,'sim',30.00,'nao',null),
  ('55380115000140','sim',5.00,'sim',30.00,'sim',200.00),
  ('36010401000170','sim',5.00,'sim',30.00,'sim',200.00),
  ('58025861000104','sim',5.00,'sim',30.00,'sim',200.00),
  ('46850953000140','sim',5.00,'sim',30.00,'nao',null),
  ('40797112000130','sim',5.00,'sim',30.00,'nao',null),
  ('31196786000198','sim',5.00,'sim',30.00,'nao',null),
  ('56004670000130','sim',5.00,'sim',30.00,'nao',null),
  ('42879738000110','sim',5.00,'sim',30.00,'sim',200.00),
  ('23099667000199','nao',null,'sim',30.00,'nao',null),
  ('27246573000156','nao',null,'sim',30.00,'nao',null),
  ('09111857000153','nao',null,'sim',30.00,'nao',null),
  ('30988332000197','nao',null,'sim',30.00,'nao',null),
  ('58170370000157','nao',null,'sim',30.00,'nao',null),
  ('61555340000173','nao',null,'sim',30.00,'nao',null),
  ('19886707000175','nao',null,'sim',null,'nao',null),
  ('48396144000135','nao',null,'sim',null,'nao',null),
  ('08562870000328','a_confirmar',null,'sim',null,'a_confirmar',null),
  ('60957784002973','nao',null,'sim',null,'nao',null),
  ('58214452000156','nao',null,'sim',null,'nao',null),
  ('07346019000133','nao',null,'sim',null,'nao',null),
  ('10820614000173','nao',null,'sim',null,'nao',null),
  ('00251951000133','a_confirmar',null,'sim',null,'a_confirmar',null),
  ('47264537000122','nao',null,'sim',null,'nao',null),
  ('22626556000120','a_confirmar',null,'sim',null,'a_confirmar',null),
  ('17462911000133','a_confirmar',null,'sim',null,'a_confirmar',null),
  ('09153852000193','a_confirmar',null,'sim',null,'a_confirmar',null),
  ('34440324000162','nao',null,'sim',null,'nao',null),
  ('53425780000188','a_confirmar',null,'sim',null,'a_confirmar',null),
  ('23994116000199','nao',null,'sim',null,'nao',null),
  ('03797507000106','nao',null,'sim',null,'nao',null),
  ('42431461000169','nao',null,'sim',null,'nao',null),
  ('04233645000397','nao',null,'sim',null,'sim',null),
  ('00993944000107','a_confirmar',null,'sim',null,'a_confirmar',null),
  ('63989994000130','nao',null,'sim',null,'nao',null),
  ('52345676000110','nao',null,'sim',null,'nao',null),
  ('46405401000122','a_confirmar',null,'a_confirmar',null,'a_confirmar',null),
  ('12689295000568','nao',null,'sim',null,'nao',null),
  ('12689295000304','nao',null,'sim',null,'nao',null),
  ('35751096000104','nao',null,'sim',null,'nao',null),
  ('12689295000134','nao',null,'sim',null,'nao',null),
  ('12689295000215','nao',null,'sim',null,'nao',null),
  ('12689295000720','nao',null,'sim',null,'nao',null),
  ('37647991000109','nao',null,'sim',null,'a_confirmar',null),
  ('08693517000115','sim',null,'sim',null,'nao',null),
  ('24363368000182','sim',null,'sim',null,'nao',null),
  ('11427399000108','nao',null,'sim',null,'nao',null),
  ('27112266000182','nao',null,'sim',null,'nao',null),
  ('26730240000135','nao',null,'sim',null,'nao',null),
  ('26728025000108','nao',null,'sim',null,'nao',null),
  ('24708130000141','nao',null,'sim',null,'nao',null),
  ('01937258000262','nao',null,'sim',null,'nao',null),
  ('01937258000181','nao',null,'sim',null,'nao',null),
  ('57653140000186','nao',null,'sim',null,'nao',null),
  ('05620241000157','sim',null,'sim',null,'nao',null),
  ('16607328000100','sim',null,'sim',null,'nao',null),
  ('08533625000120','sim',null,'sim',null,'nao',null)
),
-- Uma linha por produto a partir das 6 colunas da planilha.
achatado as (
  select p.id as pdv_id, x.produto, x.oferece, x.preco
  from mix
  join public.pdvs p
    on regexp_replace(coalesce(p.cnpj, ''), '\D', '', 'g') = mix.cnpj
  cross join lateral (values
    ('10ml',  mix.p10,  mix.v10),
    ('100ml', mix.p100, mix.v100),
    ('1l',    mix.p1l,  mix.v1l)
  ) as x(produto, oferece, preco)
)
insert into public.pdv_produto_mix (pdv_id, produto, oferece, preco_revenda)
select pdv_id, produto, oferece, preco from achatado
on conflict (pdv_id, produto) do update
  set oferece       = excluded.oferece,
      preco_revenda = excluded.preco_revenda,
      updated_at    = now();

-- Os 2 sem documento entram com o mix deles, casados por nome.
insert into public.pdv_produto_mix (pdv_id, produto, oferece, preco_revenda)
select p.id, x.produto, x.oferece, null
from public.pdvs p
cross join lateral (values ('10ml','a_confirmar'),('100ml','sim'),('1l','a_confirmar')) as x(produto, oferece)
where p.name = 'Gilberto Ferreira da Costa' and p.cnpj is null
on conflict (pdv_id, produto) do nothing;

insert into public.pdv_produto_mix (pdv_id, produto, oferece, preco_revenda)
select p.id, x.produto, x.oferece, null
from public.pdvs p
cross join lateral (values ('10ml','sim'),('100ml','sim'),('1l','nao')) as x(produto, oferece)
where p.name = 'Posto São Francisco' and p.cnpj is null
on conflict (pdv_id, produto) do nothing;

-- ── 7. A view enxergando os campos novos ──────────────────────────────────
-- Sem isto a tela continua cega: ela lê carbo_pdvs_painel, não a `pdvs`.
-- O mix vem agregado em JSON numa coluna só — três linhas por PDV viradas
-- em objeto — para a tela não precisar de uma segunda consulta por linha.
create or replace view public.carbo_pdvs_painel
with (security_invoker = true) as
select
  p.id, p.pdv_code, p.name, p.legal_name, p.cnpj,
  regexp_replace(coalesce(p.cnpj, ''), '\D', '', 'g') as cnpj_digits,
  p.address_city, p.address_state, p.address_street, p.address_zip,
  p.contact_name, p.contact_phone, p.email,
  p.status, p.notes, p.created_at, p.updated_at,
  p.opened_at,
  p.owner_seller_id,
  -- O nome da planilha ganha do profile só quando o profile não casou.
  coalesce(pr.full_name, p.owner_seller_name) as owner_seller_name,
  coalesce(mx.mix, '{}'::jsonb) as mix,
  coalesce(m.pedidos, 0)        as pedidos,
  coalesce(m.total_comprado, 0) as total_comprado,
  m.ultima_compra,
  m.primeira_compra,
  (p.cnpj is null or btrim(p.cnpj) = '') as sem_documento
from public.pdvs p
left join public.profiles pr on pr.id = p.owner_seller_id
left join lateral (
  select jsonb_object_agg(
           x.produto,
           jsonb_build_object('oferece', x.oferece, 'preco', x.preco_revenda)
         ) as mix
  from public.pdv_produto_mix x
  where x.pdv_id = p.id
) mx on true
left join lateral (
  select
    count(*)                                       as pedidos,
    sum(o.total)                                   as total_comprado,
    max(coalesce(o.sale_date, o.created_at::date)) as ultima_compra,
    min(coalesce(o.sale_date, o.created_at::date)) as primeira_compra
  from public.carboze_orders o
  where coalesce(p.cnpj, '') <> ''
    and regexp_replace(coalesce(o.cnpj, ''), '\D', '', 'g')
      = regexp_replace(p.cnpj, '\D', '', 'g')
    and o.status not in ('quote', 'cancelled')
) m on true;

comment on view public.carbo_pdvs_painel is
  'PDVs com agregado de compras, dono da carteira, abertura e mix de produto (JSON). Casa por CNPJ só-dígitos. security_invoker: respeita a RLS.';

grant select on public.carbo_pdvs_painel to authenticated;

-- ── 8. Conferência ────────────────────────────────────────────────────────

-- (a) Cobertura: 69 PDVs da planilha devem ter abertura e dono. Os 4 PDVs
--     criados a partir de pedido (Auto Diesel, Bravo, ARTCAR, Sound Mix)
--     ficam SEM dono de propósito — não estão na planilha do comercial.
select count(*) as total_pdvs,
       count(opened_at)         as com_abertura,
       count(owner_seller_name) as com_dono_nome,
       count(owner_seller_id)   as dono_casou_no_sistema,
       count(*) filter (where status = 'registered') as cadastrados
from public.pdvs;

-- (b) Donos que NÃO casaram com nenhum profile (ou casaram com mais de um).
--     Cada linha aqui é uma carteira sem responsável no sistema.
select owner_seller_name, count(*) as pdvs
from public.pdvs
where owner_seller_name is not null and owner_seller_id is null
group by 1 order by 2 desc;

-- (c) Mix: devem ser 69 × 3 = 207 linhas.
select produto, oferece, count(*) as pdvs,
       count(preco_revenda) as com_preco,
       min(preco_revenda) as menor, max(preco_revenda) as maior
from public.pdv_produto_mix
group by 1, 2 order by 1, 2;

-- (d) ⚠️ Aberturas no futuro. Green Lub veio "out./2026" na planilha.
select name, cnpj, opened_at
from public.pdvs
where opened_at > current_date
order by opened_at;
