-- ═══════════════════════════════════════════════════════════════════════════
-- Estoque do ML Full — ESPELHO, e só isso
--
-- O Mercado Livre já sabe quanto tem no galpão dele. Aqui a gente só mostra,
-- para não precisar abrir o painel do ML para saber se vai faltar.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- ⚠️ POR QUE NÃO É UM `warehouse` E NÃO ENTRA EM `warehouse_stock`
--
-- Seria o caminho óbvio: o repo já tem `warehouses` + `warehouse_stock`, e foi
-- reusá-los que fez o estoque do vendedor "vir pronto".
--
-- Aqui NÃO serve, e a diferença é de natureza:
--
--   warehouse_stock  é a NOSSA contagem — alguém dá entrada, alguém ajusta,
--                    alguém transfere, e cada mexida vira `stock_movements`.
--   ML Full          é a contagem DELES. Não há entrada para dar, não há
--                    ajuste para fazer, e "transferir" é despachar um lote
--                    físico para o galpão do ML.
--
-- Misturar os dois criaria um saldo editável que o próximo sync sobrescreve —
-- a pessoa ajusta, o número volta sozinho, e ninguém entende por quê. É o
-- mesmo mecanismo que fez o SKU da Shopee "sumir" depois de corrigido no
-- banco: campo que vem da plataforma não se corrige aqui.
--
-- ⚠️ E entrar em `HUBS` no front traria junto os botões de Nova Entrada,
-- mínimo e movimentação. Espelho que oferece caneta convida a escrever.
-- Mesma razão pela qual as caixas dos vendedores ficaram FORA de `HUBS`.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- ⚠️ O QUE ESTA TABELA **NÃO** ALIMENTA
--
-- Nada de dedução. `carbo_canal_estoque` continua com `mercadolivre_full`
-- `ativo = false`: a venda no Full não tira da LogHouse, quem tira é a REMESSA
-- de reposição. Este espelho é para OLHAR — se um dia ele virar base de
-- cálculo, releia a lição de 31/08 antes.
--
-- ⚠️ RODE EM BLOCOS.
-- ═══════════════════════════════════════════════════════════════════════════


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 1 — o espelho                                                   ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

create table if not exists public.ml_estoque_full (
  -- A chave é o ANÚNCIO (+ variação, quando há). Um SKU nosso pode estar em
  -- mais de um anúncio, e somar os dois cedo demais esconderia isso.
  item_id          text not null,
  variation_id     text not null default '',
  seller_id        bigint not null,

  title            text,
  seller_sku       text,
  status           text,          -- active | paused | closed …
  -- ⚠️ `fulfillment` é o que interessa. Anúncio da MESMA conta pode ser
  -- `cross_docking` ou `self_service` — esses NÃO estão no galpão do ML, e
  -- contá-los como Full inflaria o saldo que a tela mostra.
  logistic_type    text,
  inventory_id     text,

  -- O número que a tela mostra. Vem de `available_quantity` do anúncio, que é
  -- o saldo disponível para venda no ML.
  disponivel       integer,

  -- ⚠️ Enriquecimento OPCIONAL, do endpoint de fulfillment. Fica NULO quando
  -- não vier, e nulo aqui significa "não perguntei / não respondeu", nunca
  -- zero. Zero é um saldo válido — confundir os dois é a doença do
  -- `Math.round` inventando `×1`.
  nao_disponivel   integer,
  detalhe_full     jsonb,

  raw              jsonb,
  sincronizado_em  timestamptz not null default now(),
  primary key (item_id, variation_id)
);

comment on table public.ml_estoque_full is
  'ESPELHO do estoque no Fulfillment do Mercado Livre. Nao e warehouse_stock e nao deve virar: aquele e a NOSSA contagem (com entrada, ajuste e movimentacao); este e a contagem DELES, so leitura. Saldo editavel que o sync sobrescreve faz a pessoa ajustar e o numero voltar sozinho — o mesmo mecanismo do SKU da Shopee que sumia depois de corrigido no banco.';

comment on column public.ml_estoque_full.nao_disponivel is
  'Do endpoint de fulfillment, quando ele responde. NULO = nao perguntei ou nao respondeu — NUNCA zero. Zero e um saldo valido.';

comment on column public.ml_estoque_full.logistic_type is
  'fulfillment = no galpao do ML. cross_docking/self_service/drop_off NAO estao la, e conta-los como Full inflaria o saldo da tela.';

create index if not exists idx_ml_estoque_full_sku
  on public.ml_estoque_full (seller_sku);
create index if not exists idx_ml_estoque_full_logistica
  on public.ml_estoque_full (logistic_type);

alter table public.ml_estoque_full enable row level security;

drop policy if exists "interno le ml_estoque_full" on public.ml_estoque_full;
create policy "interno le ml_estoque_full"
  on public.ml_estoque_full for select
  using (public.carbo_e_time_interno());

drop policy if exists "service escreve ml_estoque_full" on public.ml_estoque_full;
create policy "service escreve ml_estoque_full"
  on public.ml_estoque_full for all to service_role using (true) with check (true);


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 2 — a view da tela                                              ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
-- Junta o anúncio ao NOSSO produto pelo `seller_sku`, usando o mesmo cadastro
-- que o resto do sistema usa (`sku_product_mappings`). Assim o nome que
-- aparece é o nosso, e não o título do anúncio — que muda por marketing.
--
-- ⚠️ `left join`: anúncio SEM mapa continua aparecendo, com o produto nulo.
-- Esconder o que não casa faria a tela concordar consigo mesma e o SKU novo
-- sumiria em silêncio — a doença da `20260941`. Sem mapa é trabalho a fazer,
-- não linha a ocultar.
--
-- ⚠️ E filtra `logistic_type = 'fulfillment'`: anúncio da mesma conta que não
-- está no galpão do ML não é estoque Full.

create or replace view public.ml_estoque_full_tela
with (security_invoker = true) as
select
  e.item_id,
  nullif(e.variation_id, '')          as variation_id,
  e.seller_sku,
  e.title                             as titulo_anuncio,
  e.status,
  e.inventory_id,
  e.disponivel,
  e.nao_disponivel,
  m.product_id,
  p.product_code,
  p.name                              as produto,
  -- O saldo do MESMO produto na LogHouse, para a comparação que interessa:
  -- "tem no ML, tem aqui?". ⚠️ Vem de `warehouse_stock`, que é a nossa
  -- contagem — os dois números são de galpões DIFERENTES e não se somam.
  ws.quantity                         as saldo_loghouse,
  e.sincronizado_em
from public.ml_estoque_full e
left join public.sku_product_mappings m
       on m.platform_sku = e.seller_sku
      and (m.platform is null or m.platform = 'mercadolivre_full')
left join public.mrp_products p on p.id = m.product_id
left join public.warehouses w on w.code = 'HUB-SP'
left join public.warehouse_stock ws
       on ws.product_id = m.product_id and ws.warehouse_id = w.id
where e.logistic_type = 'fulfillment'
   or e.logistic_type is null;

comment on view public.ml_estoque_full_tela is
  'Estoque no Fulfillment do ML, ja ligado ao nosso produto pelo seller_sku via sku_product_mappings. left join de proposito: anuncio SEM mapa continua aparecendo com produto nulo, porque sem mapa e trabalho a fazer, nao linha a ocultar. saldo_loghouse vem de warehouse_stock e e de OUTRO galpao — os dois numeros nao se somam.';

grant select on public.ml_estoque_full_tela to authenticated;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 3 — CONFERÊNCIA (rode depois do primeiro sync)                  ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

-- (a) A tabela existe e a RLS está ligada? Esperado: 1 linha, rls = true.
select c.relname, c.relrowsecurity as rls
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname = 'ml_estoque_full';

-- (b) A view mantém security_invoker? Esperado: {security_invoker=true}.
--     CREATE VIEW sem WITH apaga as reloptions — foi assim que a
--     bling2_esteira vazou a esteira inteira para lojista e licenciado.
select relname, reloptions from pg_class where relname = 'ml_estoque_full_tela';

-- (c) O que veio do ML, por tipo de logística.
--     ⚠️ `fulfillment` é o que a tela mostra. Se vier MUITO anuncio em
--     cross_docking/self_service, eles NAO estao no galpao do ML.
select coalesce(logistic_type, '(sem tipo)') as logistica,
       count(*)                              as anuncios,
       sum(coalesce(disponivel, 0))          as disponivel_total
from public.ml_estoque_full
group by 1
order by anuncios desc;

-- (d) ⚠️ Anúncio SEM mapa de SKU — a lista de trabalho. Aparece na tela com
--     produto vazio de propósito. Mapa entra em Ops → Suprimentos → CD SP →
--     Mapeamento SKU, sem deploy.
select item_id, seller_sku, titulo_anuncio, disponivel
from public.ml_estoque_full_tela
where product_id is null
order by disponivel desc nulls last;

-- (e) O espelho está fresco? `sincronizado_em` de horas atrás significa que o
--     cron parou — e o sintoma de um espelho parado é mostrar número velho
--     com cara de atual, que é pior que tela vazia.
select max(sincronizado_em) as ultima_sync,
       round(extract(epoch from (now() - max(sincronizado_em))) / 60) as minutos_atras,
       count(*) as anuncios
from public.ml_estoque_full;
