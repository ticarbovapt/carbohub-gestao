-- ═══════════════════════════════════════════════════════════════════════════
-- FAIXA DE PREÇO por tipo de cliente — CarboZé 100ml · PDV · Microdistribuidor
--
-- Pedido do dono do processo em 29/09/2026. O mesmo produto tem três preços,
-- conforme quem compra:
--
--   compra esporádica     R$ 15,60   o preço de hoje, que já está na tabela
--   ponto de venda (PDV)  R$ 13,00   revende o nosso produto
--   microdistribuidor     R$ 11,50   compra mais, revende ao preço que quiser
--
-- ⚠️ A EXIGÊNCIA QUE DEFINE O DESENHO É FISCAL, e ela está nas palavras dele:
-- *"a NF vai receber o valor de 11,50 e não 15,60 − 4,10 = 11,50, que vai dar
-- muito desconto na NF, e o imposto é no momento da NF; logo eu tô vendendo por
-- 11,50 e sendo cobrado por 15,60"*. Ou seja: NÃO é desconto. O preço unitário
-- que sai na nota tem de ser o da faixa.
--
-- ⚠️ E O PRODUTO FÍSICO CONTINUA SENDO UM SÓ: *"o produto em si ainda é
-- CarboZé; quando for vendido e precisar produzir, ainda vão produzir o CarboZé
-- sachê ou o CarboZé 100ml"*. Logo estoque, produção e MRP têm de olhar o PAI.
--
-- ══ Isto é o MESMO mecanismo do gêmeo de bonificação (`20260900`) ══
--
-- Lá: um produto irmão que aponta para o pai, entregue a 100% de desconto, e o
-- estoque baixa do pai. Aqui: um produto irmão que aponta para o pai, vendido a
-- outro preço, e o estoque baixa do pai. A única diferença é o preço.
--
-- Reusar a estrutura (coluna que aponta para o pai + resolução no
-- `carbo_itens_para_estoque` + exclusão das telas de estoque) é o que faz o
-- fluxo já vir pronto — a mesma decisão das caixas de vendedor, que reusaram
-- `warehouses` em vez de criar tabela nova.
--
-- ⚠️ MAS SÃO DUAS COLUNAS, NÃO UMA. Colocar a faixa em `bonificacao_de` faria
-- a tela travar 100% de desconto na linha, que é exatamente o que NÃO pode
-- acontecer — o valor precisa chegar cheio na nota.
-- ═══════════════════════════════════════════════════════════════════════════


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 0 — MEDIR. Rode UMA DE CADA VEZ e leia antes de seguir.         ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
-- ⚠️ O SQL Editor mostra só o resultado da ÚLTIMA consulta do bloco. Consulta
-- de medição junto com outras é consulta que ninguém lê (lição da `20261009`).

-- (0.a) Quantos produtos o catálogo tem HOJE, e quantos já são gêmeos?
--       Isto dimensiona o dropdown do /vender: ele já mostra pai + gêmeo de
--       bonificação intercalados. Cada faixa criada acrescenta UMA linha.
-- select
--   count(*) filter (where bonificacao_de is null)     as produtos_reais,
--   count(*) filter (where bonificacao_de is not null) as gemeos_bonificacao,
--   count(*)                                           as linhas_no_dropdown
-- from public.mrp_products
-- where is_active and category = 'Produto Final';

-- (0.b) Existe alguma coluna `preco_de`/`faixa_preco` já? ESPERADO: zero linhas.
--       ⚠️ Pergunte ao BANCO, não à migração que criou a tabela — a lição do
--       CHECK da `20260918`, em que eu afirmei uma ausência que não existia.
-- select column_name, data_type
-- from information_schema.columns
-- where table_schema = 'public' and table_name = 'mrp_products'
--   and column_name in ('preco_de', 'faixa_preco');

-- (0.c) ⚠️ Quem já tem preço definido, por produto. É a base do "antes" —
--       nenhuma faixa deve nascer herdando preço nenhum.
-- select product_code, name, sale_price
-- from public.mrp_products
-- where is_active and category = 'Produto Final' and bonificacao_de is null
-- order by name;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 1 — as faixas são CADASTRO, não CHECK                           ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
-- ⚠️ Tabela, e não um `check (faixa in ('pdv','micro'))`, pela lição já paga em
-- "Plataforma nova entra em TRÊS CHECKs": valor novo num CHECK é INSERT que
-- falha, e quando o CHECK mora em mais de uma tabela ele falha em momentos
-- diferentes — um deles meses depois. Faixa nova aqui é um INSERT, sem deploy.
--
-- `sufixo` é o que entra no `product_code` (CZ100 → CZ100-PDV) e `rotulo` o que
-- entra no nome. Os dois são CADASTRO pelo mesmo motivo: mudar "PDV" para
-- "Ponto de Venda" não pode exigir migração.

create table if not exists public.carbo_faixa_preco (
  codigo        text primary key,
  rotulo        text        not null,
  sufixo        text        not null,
  -- Para quem é, em uma linha. Aparece no /vender ao lado da opção — é o que
  -- evita vender a 11,50 para quem compra uma vez.
  hint          text,
  ordem         integer     not null default 0,
  ativo         boolean     not null default true,
  atualizado_em timestamptz not null default now(),
  constraint carbo_faixa_preco_sufixo_uniq unique (sufixo)
);

comment on table public.carbo_faixa_preco is
  'Faixas de preco por tipo de cliente. CADASTRO, nunca CHECK: faixa nova e um INSERT, sem deploy — a licao de "plataforma nova entra em TRES CHECKs". O sufixo entra no product_code (CZ100 -> CZ100-PDV) e o rotulo no nome.';

insert into public.carbo_faixa_preco (codigo, rotulo, sufixo, hint, ordem) values
  ('pdv',   'PDV',              'PDV', 'Ponto de venda que revende o nosso produto', 1),
  ('micro', 'Microdistribuidor', 'MD',  'Compra em volume e revende ao preço que quiser', 2)
on conflict (codigo) do nothing;

alter table public.carbo_faixa_preco enable row level security;
drop policy if exists carbo_faixa_preco_read on public.carbo_faixa_preco;
create policy carbo_faixa_preco_read on public.carbo_faixa_preco
  for select to authenticated using (public.carbo_e_time_interno());
grant select on public.carbo_faixa_preco to authenticated;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 2 — as duas colunas em mrp_products                             ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

alter table public.mrp_products
  add column if not exists preco_de    uuid references public.mrp_products(id) on delete cascade,
  add column if not exists faixa_preco text references public.carbo_faixa_preco(codigo);

comment on column public.mrp_products.preco_de is
  'Quando preenchido, esta linha e o mesmo produto FISICO do id apontado, vendido a outro preco (faixa de cliente). Estoque, producao e MRP olham o PAI — e por isso ela nao aparece nas telas de estoque. Molde de bonificacao_de; a diferenca e que o preco e CHEIO, nao zero, porque o valor precisa chegar cheio na NF.';

comment on column public.mrp_products.faixa_preco is
  'Qual faixa esta linha representa (carbo_faixa_preco.codigo). Anda SEMPRE junto com preco_de.';

create index if not exists idx_mrp_products_preco_de
  on public.mrp_products (preco_de) where preco_de is not null;

-- ⚠️ Um produto tem NO MÁXIMO uma linha por faixa. Sem isto, dois cliques no
-- botão criariam dois "CarboZé 100ml - PDV" com preços que divergem — e o
-- vendedor escolheria o errado sem ter como saber.
create unique index if not exists uq_mrp_preco_de_faixa
  on public.mrp_products (preco_de, faixa_preco) where preco_de is not null;

-- ⚠️ As duas andam juntas ou nenhuma. `preco_de` sem faixa é uma linha que não
-- sabe dizer o que é; faixa sem `preco_de` é uma faixa que não aponta produto.
alter table public.mrp_products drop constraint if exists mrp_products_faixa_coerente;
alter table public.mrp_products add constraint mrp_products_faixa_coerente
  check ((preco_de is null and faixa_preco is null)
      or (preco_de is not null and faixa_preco is not null));

-- ⚠️ Faixa E bonificação na MESMA linha não existe, e o CHECK é o que impede.
-- Seriam dois donos para o mesmo campo "quem é o meu pai", e a resolução do
-- estoque teria de escolher um — o erro do `bling_nf_id`, onde duas coisas
-- disputavam a mesma coluna com o mesmo significado.
alter table public.mrp_products drop constraint if exists mrp_products_faixa_nao_e_bonificacao;
alter table public.mrp_products add constraint mrp_products_faixa_nao_e_bonificacao
  check (preco_de is null or bonificacao_de is null);


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 3 — criar a linha da faixa (idempotente)                        ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
-- ⚠️ `sale_price` nasce NULO, e isto é o oposto do gêmeo de bonificação (que
-- nasce 0). Lá zero é o preço CERTO; aqui zero seria uma resposta inventada, e
-- o /vender venderia de graça sem reclamar. Nulo significa NÃO PRECIFICADO: a
-- tela mostra "sem preço" em vermelho e RECUSA a venda até alguém digitar o
-- valor em /comercial/precos. É a mesma lição do `('CZ100', 0)` da `20260969`,
-- em que um valor de exemplo indistinguível de resposta zerou 275 unidades.

create or replace function public.carbo_preco_faixa_criar(p_produto uuid, p_faixa text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  p    record;
  f    record;
begin
  if not public.carbo_e_time_interno() then
    raise exception 'Sem permissão para criar faixa de preço.' using errcode = 'insufficient_privilege';
  end if;

  select * into f from public.carbo_faixa_preco where codigo = p_faixa and ativo;
  if not found then
    raise exception 'Faixa % não existe ou está inativa.', p_faixa using errcode = 'no_data_found';
  end if;

  -- Idempotente: dois cliques devolvem a mesma linha.
  select id into v_id from public.mrp_products
   where preco_de = p_produto and faixa_preco = p_faixa;
  if v_id is not null then
    return v_id;
  end if;

  select * into p from public.mrp_products where id = p_produto;
  if not found then
    raise exception 'Produto % não existe.', p_produto using errcode = 'no_data_found';
  end if;

  -- ⚠️ Faixa de faixa e faixa de gêmeo não existem. Sem esta guarda nasceria
  -- "CarboZé 100ml - PDV - MD", que não é produto de nada.
  if p.preco_de is not null or p.bonificacao_de is not null then
    raise exception 'Só Produto Final de verdade tem faixa — % já é derivado.', p.name
      using errcode = 'check_violation';
  end if;
  if p.category is distinct from 'Produto Final' then
    raise exception 'Faixa de preço só existe para Produto Final (% é %).', p.name, p.category
      using errcode = 'check_violation';
  end if;

  insert into public.mrp_products
    (product_code, name, category, stock_unit, sale_price, is_active, preco_de, faixa_preco)
  values
    (p.product_code || '-' || f.sufixo, p.name || ' - ' || f.rotulo, p.category, p.stock_unit,
     null, p.is_active, p.id, f.codigo)
  returning id into v_id;

  return v_id;
end;
$$;

comment on function public.carbo_preco_faixa_criar is
  'Cria (ou devolve) a linha de uma faixa de preco de um produto. Idempotente. sale_price NASCE NULO de proposito: zero seria uma resposta inventada e o /vender venderia de graca; nulo significa NAO PRECIFICADO e a tela recusa a venda ate alguem digitar o valor.';

revoke all on function public.carbo_preco_faixa_criar(uuid, text) from public;
grant execute on function public.carbo_preco_faixa_criar(uuid, text) to authenticated;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 4 — a linha de faixa NÃO ganha gêmeo de bonificação             ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
-- ⚠️ ESTE BLOCO É OBRIGATÓRIO, e sem ele a migração cria lixo sozinha.
-- `carbo_bonificacao_auto` dispara em todo Produto Final novo com
-- `bonificacao_de is null` — e a linha de faixa é exatamente isso. Sem a
-- guarda, criar "CarboZé 100ml - PDV" criaria junto "CarboZé 100ml - PDV -
-- bonificação", e o dropdown ganharia DUAS linhas por faixa em vez de uma.
--
-- Bonificação não tem faixa: ela é de graça nas três. Um gêmeo por produto
-- real continua sendo o certo.

create or replace function public.carbo_bonificacao_auto()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.bonificacao_de is null
     and new.preco_de is null          -- ⬅ linha de faixa não ganha gêmeo
     and new.is_active
     and new.category = 'Produto Final' then
    perform public.carbo_bonificacao_gemeo(new.id);
  end if;
  return new;
end;
$$;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 5 — o estoque baixa do PAI                                      ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
-- É a mesma garrafa da mesma prateleira: quem vende CZ100-MD tira CZ100 do
-- galpão. Olhar o id da linha de faixa exigiria saldo de um SKU que nunca é
-- produzido — e toda venda de pronta entrega a microdistribuidor seria
-- recusada por "sem saldo" de um produto que não existe no galpão.
--
-- ⚠️ `bonificacao_de` vem PRIMEIRO no coalesce só por clareza: o CHECK do
-- BLOCO 2 garante que as duas nunca estão preenchidas na mesma linha, então a
-- ordem não muda resultado nenhum. Ela existe para quem lê.

create or replace function public.carbo_itens_para_estoque(p_items jsonb)
returns table (product_id uuid, qty numeric)
language sql stable parallel safe as $$
  select coalesce(pr.bonificacao_de, pr.preco_de, pr.id) as product_id,
         sum(coalesce((it->>'quantity')::numeric, 0)
             + coalesce((it->>'bonificacao')::numeric, 0))
  from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) it
  join public.mrp_products pr on pr.id = (it->>'product_id')::uuid
  where nullif(it->>'product_id', '') is not null
    and coalesce(it->>'kind', '') <> 'service'
  group by 1
  having sum(coalesce((it->>'quantity')::numeric, 0)
             + coalesce((it->>'bonificacao')::numeric, 0)) > 0;
$$;

comment on function public.carbo_itens_para_estoque is
  'Itens do pedido -> quantidade que sai do estoque. Resolve o gemeo de bonificacao E a linha de faixa de preco para o produto PAI: e a mesma garrafa da mesma prateleira, e olhar o id do derivado exigiria saldo de um SKU que nunca e produzido. Soma o campo bonificacao legado (historico gravado no modelo antigo).';


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 6 — a linha de faixa fica FORA das telas de estoque             ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
-- Mesmo motivo do gêmeo: ela não tem saldo próprio. Aparecer aqui daria uma
-- linha zerada por produto POR FAIXA.
--
-- ⚠️⚠️ A PRIMEIRA VERSÃO DESTE BLOCO FOI ESCRITA A PARTIR DA MIGRAÇÃO
-- `20260900` E ESTAVA ERRADA. Ela levou `42P16: cannot drop columns from view`
-- porque a definição VIVA é a da `20260915` e tem duas colunas a mais
-- (`is_active`, `vendedor_avatar`).
--
-- ⚠️ E O ERRO FOI SORTE, NÃO CUIDADO. Se as colunas tivessem batido, o
-- `create or replace` teria PASSADO — e teria removido, calado, as DUAS coisas
-- que a `20260915` acrescentou e que eu não sabia que existiam:
--
--   `carbo_pode_ver_caixa(w.owner_id)`   o gate de quem enxerga qual caixa
--   `with (security_invoker = false)`    a reloption
--
-- Sem o gate, qualquer autenticado passaria a ver a caixa de todo vendedor.
-- É a lição que o próprio repositório já registrou duas vezes e que eu não
-- segui: **pergunte ao BANCO (`pg_get_viewdef`), não à migração que criou a
-- tabela** — a mesma falha do CHECK da `20260918`. E "CREATE OR REPLACE VIEW
-- sem WITH apaga as reloptions" é a lição da `20260919`, que também teria sido
-- repetida aqui.
--
-- A versão abaixo é a da `20260915` com UMA linha a mais no WHERE.

create or replace view public.vendedor_estoque
with (security_invoker = false) as
select
  w.id            as warehouse_id,
  w.code          as warehouse_code,
  w.name          as warehouse_name,
  w.is_active,
  w.owner_id      as vendedor_id,
  coalesce(p.full_name, 'Vendedor sem cadastro') as vendedor_nome,
  p.avatar_url    as vendedor_avatar,
  pr.id           as product_id,
  pr.product_code,
  pr.name         as product_name,
  pr.stock_unit,
  coalesce(ws.quantity, 0)::numeric as quantidade,
  ws.updated_at   as saldo_em
from public.warehouses w
left join public.profiles p on p.id = w.owner_id
cross join public.mrp_products pr
left join public.warehouse_stock ws
       on ws.warehouse_id = w.id and ws.product_id = pr.id
where w.kind = 'vendedor'
  and pr.is_active
  and pr.category = 'Produto Final'
  and pr.bonificacao_de is null          -- o gêmeo de bonificação não é produto de prateleira
  and pr.preco_de is null                -- ⬅ nem a linha de faixa de preço
  and public.carbo_pode_ver_caixa(w.owner_id);

comment on view public.vendedor_estoque is
  'Saldo por vendedor e produto. Traz linha ZERADA para produto sem saldo de proposito: e o que falta na caixa. Exclui o gemeo de bonificacao E a linha de faixa de preco — nenhum dos dois tem saldo proprio. ⚠️ SECURITY DEFINER com gate explicito (carbo_pode_ver_caixa): com security_invoker o inner join em profiles fazia a policy de departamento esconder TODAS as caixas de quem trabalha em Suprimentos — tela vazia, sem erro.';

grant select on public.vendedor_estoque to authenticated;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 7 — CONFERÊNCIA. Rode UMA DE CADA VEZ.                          ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

-- (a) As duas faixas nasceram? ESPERADO: 2 linhas.
-- select codigo, rotulo, sufixo, hint, ativo from public.carbo_faixa_preco order by ordem;

-- (b) ⚠️ NENHUMA linha de faixa foi criada ainda, e isso é o certo. Esta
--     migração entrega o MECANISMO; quem decide quais produtos têm faixa é o
--     Admin, na tela, produto a produto. Criar as duas faixas para os 22
--     produtos de uma vez encheria o dropdown do /vender com 44 linhas que
--     ninguém pediu — e a maioria sem preço, portanto invendáveis.
--     ESPERADO: zero linhas.
-- select product_code, name, faixa_preco, sale_price
-- from public.mrp_products where preco_de is not null order by name;

-- (c) ⚠️ O gêmeo de bonificação NÃO deve ter nascido para faixa nenhuma.
--     Rode DEPOIS de criar a primeira faixa pela tela. ESPERADO: zero linhas.
-- select b.product_code, b.name
-- from public.mrp_products b
-- join public.mrp_products f on f.id = b.bonificacao_de
-- where f.preco_de is not null;

-- (d) A resolução do estoque aponta para o pai? Rode com um id de faixa real.
--     ESPERADO: o product_id devolvido é o do PAI, não o da faixa.
-- select * from public.carbo_itens_para_estoque(
--   jsonb_build_array(jsonb_build_object(
--     'product_id', (select id::text from public.mrp_products where preco_de is not null limit 1),
--     'quantity', 3)));
