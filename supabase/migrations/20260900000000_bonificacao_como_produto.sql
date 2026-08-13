-- ═══════════════════════════════════════════════════════════════════════════
-- Bonificação vira PRODUTO — parte 1 (banco)
--
-- Hoje a bonificação é um campo na linha do pedido (`bonificacao`), e o
-- vendedor tem de somar a quantidade e depois descontar o valor. Dois passos,
-- dois lugares de errar.
--
-- Passa a ser um produto do catálogo: "Carbozé 100ml - bonificação". O
-- vendedor escolhe, põe a quantidade, e o desconto de 100% é automático.
--
-- ⚠️ RODE EM BLOCOS.
--
-- ── O bloqueador que esta migração resolve ────────────────────────────────
--
-- Produto novo = `product_id` novo. Mas a bonificação é a MESMA garrafa, da
-- mesma prateleira: se o estoque olhasse o id do gêmeo, a caixa do vendedor
-- precisaria ter saldo de um SKU que nunca é produzido nem transferido, e toda
-- venda de pronta entrega com bonificação seria recusada por falta de saldo de
-- um produto que não existe fisicamente.
--
-- Por isso o gêmeo APONTA para o real (`bonificacao_de`), e é o pai que sofre
-- a baixa. O vendedor vê dois itens; o estoque vê um produto só.
--
-- ── E o gêmeo não é um produto de verdade para o resto do sistema ─────────
--
-- Ele não tem estoque, não é produzido, não entra no MRP e não tem preço. É um
-- rótulo comercial que existe para a tela de venda e para a nota. Toda leitura
-- que trata de estoque ou produção precisa filtrá-lo — senão a grade do Ops
-- ganha uma linha zerada para cada produto e o MRP planeja um fantasma.
-- ═══════════════════════════════════════════════════════════════════════════


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 1 — a coluna de vínculo                                         ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

set lock_timeout = '5s';

alter table public.mrp_products
  add column if not exists bonificacao_de uuid references public.mrp_products(id) on delete cascade;

reset lock_timeout;

comment on column public.mrp_products.bonificacao_de is
  'Quando preenchido, esta linha é o "gêmeo de bonificação" do produto apontado: mesmo item físico, preço zero. O ESTOQUE sempre baixa do pai — o gêmeo não tem saldo próprio, não é produzido e não entra no MRP.';

-- ⚠️ ON DELETE CASCADE aqui é o certo, ao contrário do resto do projeto: o
-- gêmeo não tem existência própria. Sumindo o pai, ele não significa nada.

create index if not exists idx_mrp_products_bonificacao_de
  on public.mrp_products (bonificacao_de) where bonificacao_de is not null;

-- Um gêmeo por produto. Sem isto, rodar a carga duas vezes cria duplicata e o
-- vendedor passa a ver dois "- bonificação" idênticos na lista.
create unique index if not exists uq_mrp_bonificacao_de
  on public.mrp_products (bonificacao_de) where bonificacao_de is not null;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 2 — criar o gêmeo                                               ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
-- Em função porque roda em dois momentos: a carga do BLOCO 3 e o dia em que
-- alguém cadastrar um Produto Final novo (gatilho do BLOCO 4).
--
-- `sale_price = 0` e não nulo: nulo significa NÃO PRECIFICADO e o /vender
-- recusa vender. Aqui zero é o preço certo, não uma lacuna de configuração.

create or replace function public.carbo_bonificacao_gemeo(p_produto uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  p record;
begin
  select id into v_id from public.mrp_products where bonificacao_de = p_produto;
  if v_id is not null then
    return v_id;                       -- idempotente
  end if;

  select * into p from public.mrp_products where id = p_produto;
  if not found then
    raise exception 'Produto % não existe.', p_produto using errcode = 'no_data_found';
  end if;

  -- Gêmeo de gêmeo não existe.
  if p.bonificacao_de is not null then
    return p.id;
  end if;

  insert into public.mrp_products
    (product_code, name, category, stock_unit, sale_price, is_active, bonificacao_de)
  values
    (p.product_code || '-BON', p.name || ' - bonificação', p.category, p.stock_unit,
     0, p.is_active, p.id)
  returning id into v_id;

  return v_id;
end;
$$;

comment on function public.carbo_bonificacao_gemeo is
  'Cria (ou devolve) o produto de bonificação de um produto. Idempotente. sale_price = 0 de propósito: nulo significaria NÃO PRECIFICADO e o /vender recusaria a venda.';

revoke all on function public.carbo_bonificacao_gemeo(uuid) from public;
grant execute on function public.carbo_bonificacao_gemeo(uuid) to authenticated;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 3 — carga: um gêmeo para cada Produto Final                     ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
-- Só "Produto Final": insumo e embalagem não são vendidos, logo não são
-- bonificados.

do $$
declare r record;
begin
  for r in
    select id from public.mrp_products
    where is_active and category = 'Produto Final' and bonificacao_de is null
  loop
    perform public.carbo_bonificacao_gemeo(r.id);
  end loop;
end $$;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 4 — produto novo já nasce com gêmeo                             ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
-- Sem isto, o produto cadastrado amanhã não tem como ser bonificado e ninguém
-- descobre até um vendedor procurar na lista e não achar.

create or replace function public.carbo_bonificacao_auto()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.bonificacao_de is null
     and new.is_active
     and new.category = 'Produto Final' then
    perform public.carbo_bonificacao_gemeo(new.id);
  end if;
  return new;
end;
$$;

set lock_timeout = '5s';

drop trigger if exists trg_bonificacao_auto on public.mrp_products;
create trigger trg_bonificacao_auto
  after insert on public.mrp_products
  for each row execute function public.carbo_bonificacao_auto();

reset lock_timeout;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 5 — o estoque baixa do PAI                                      ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
-- ⚠️ ESTE é o bloco que impede o bloqueio. Sem ele, vender bonificação a
-- pronta entrega falharia com "sem saldo" de um produto que não existe no
-- galpão.
--
-- Continua somando o campo `bonificacao` das linhas antigas: o histórico foi
-- gravado no modelo velho e um estorno de pedido de ontem tem de devolver a
-- mesma quantidade que saiu.

create or replace function public.carbo_itens_para_estoque(p_items jsonb)
returns table (product_id uuid, qty numeric)
language sql stable parallel safe as $$
  select coalesce(pr.bonificacao_de, pr.id) as product_id,
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
  'Itens do pedido → quantidade que sai do estoque. Resolve o gêmeo de bonificação para o produto PAI: é a mesma garrafa da mesma prateleira, e olhar o id do gêmeo exigiria saldo de um SKU que nunca é produzido. Soma o campo bonificacao legado (histórico gravado no modelo antigo).';

-- ⚠️ Deixou de ser `immutable`: agora lê `mrp_products`. Marcar como immutable
-- uma função que consulta tabela é o tipo de erro que o Postgres não acusa e
-- que aparece como resultado cacheado errado.


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 6 — o gêmeo fica fora das telas de estoque                      ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
-- Ele não tem saldo próprio. Aparecer aqui daria uma linha zerada para cada
-- produto do catálogo — e alguém, um dia, tentaria transferir bonificação.

create or replace view public.vendedor_estoque
with (security_invoker = true) as
select
  w.id            as warehouse_id,
  w.code          as warehouse_code,
  w.name          as warehouse_name,
  w.is_active,
  w.owner_id      as vendedor_id,
  p.full_name     as vendedor_nome,
  p.avatar_url    as vendedor_avatar,
  pr.id           as product_id,
  pr.product_code,
  pr.name         as product_name,
  pr.stock_unit,
  coalesce(ws.quantity, 0)::numeric as quantidade,
  ws.updated_at   as saldo_em
from public.warehouses w
join public.profiles p on p.id = w.owner_id
cross join public.mrp_products pr
left join public.warehouse_stock ws
       on ws.warehouse_id = w.id and ws.product_id = pr.id
where w.kind = 'vendedor'
  and pr.is_active
  and pr.category = 'Produto Final'
  and pr.bonificacao_de is null;      -- ⬅ o gêmeo não tem saldo próprio

grant select on public.vendedor_estoque to authenticated;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 7 — conferência                                                 ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

-- (a) Quantos gêmeos nasceram? Tem de bater com o nº de Produtos Finais ativos.
select
  (select count(*) from public.mrp_products
    where is_active and category = 'Produto Final' and bonificacao_de is null) as produtos,
  (select count(*) from public.mrp_products where bonificacao_de is not null)  as gemeos;

-- (b) Como ficaram (amostra).
select b.product_code, b.name, b.sale_price, p.name as pai
from public.mrp_products b
join public.mrp_products p on p.id = b.bonificacao_de
order by p.name
limit 20;

-- (c) ⚠️ Algum gêmeo tem saldo? Tem de vir VAZIO — se vier linha, alguém
--     transferiu ou ajustou estoque no produto errado.
select w.name as caixa, pr.name as produto, ws.quantity
from public.warehouse_stock ws
join public.mrp_products pr on pr.id = ws.product_id
join public.warehouses  w  on w.id  = ws.warehouse_id
where pr.bonificacao_de is not null and ws.quantity <> 0;
