-- ═══════════════════════════════════════════════════════════════════════════
-- Estoque do vendedor — PASSO 1 de 7
--
-- Cada vendedor passa a ter um estoque físico próprio: produzido em Natal,
-- transferido para ele, vendido a pronta entrega.
--
-- ── Por que a caixa do vendedor é um `warehouse` ──────────────────────────
--
-- A tentação é uma tabela nova (`vendedor_estoque`). Custaria caro: saldo,
-- histórico, transferência e estoque mínimo já são quatro tabelas que giram
-- em torno de `warehouse_id` — `warehouse_stock`, `stock_movements`,
-- `stock_transfers` e `ops_stock_min`. Uma tabela paralela obrigaria a
-- duplicar as quatro, e aí "transferir para hub" e "transferir para vendedor"
-- viram dois códigos que um dia divergem.
--
-- Sendo warehouse, "produzido em Natal e transferido para ele" já está pronto:
-- `ops_transfer_register` sai do HUB-RN, confere saldo, debita e registra o
-- movimento; `ops_transfer_confirm` credita o destino. Nenhuma linha de SQL
-- nova para o fluxo principal.
--
-- ⚠️ E as caixas ficam FORA da lista `HUBS` do front, de propósito. Ela tem
-- cinco entradas e vira uma coluna cada na grade de Suprimentos; quinze
-- vendedores ali dentro tornariam a tela ilegível. Já foi verificado que o
-- `useStock.ts` ignora código desconhecido (`if (!hubId) continue`) nas três
-- passagens — saldo, mínimos e exceções —, então criar estas linhas NÃO mexe
-- na tela que está no ar.
--
-- ── Uma caixa por vendedor ────────────────────────────────────────────────
--
-- Não duas (carro e depósito). Ninguém pediu a separação, e ela custa uma
-- decisão em toda venda: "saiu de qual?". Se um dia precisar, basta remover o
-- índice único abaixo — o resto do desenho aguenta.
-- ═══════════════════════════════════════════════════════════════════════════


-- ── 1. As colunas ──────────────────────────────────────────────────────────

alter table public.warehouses
  add column if not exists kind text not null default 'hub',
  add column if not exists owner_id uuid references public.profiles(id) on delete restrict;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'warehouses_kind_check'
  ) then
    alter table public.warehouses
      add constraint warehouses_kind_check check (kind in ('hub', 'vendedor'));
  end if;
end $$;

comment on column public.warehouses.kind is
  'hub = galpão da empresa (aparece na grade de Suprimentos). vendedor = caixa física de um vendedor, fora da grade de propósito.';
comment on column public.warehouses.owner_id is
  'Dono da caixa, quando kind = vendedor. Null nos hubs.';

-- ⚠️ ON DELETE RESTRICT, não CASCADE. Apagar o perfil não pode levar junto a
-- caixa: ela tem saldo, histórico de movimento e transferências apontando para
-- ela. Vendedor que sai da empresa tem a caixa ZERADA e desativada — o
-- histórico dele continua explicável.

-- Coerência entre os dois campos: hub não tem dono, caixa de vendedor tem.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'warehouses_owner_coerente'
  ) then
    alter table public.warehouses
      add constraint warehouses_owner_coerente check (
        (kind = 'vendedor' and owner_id is not null)
        or (kind = 'hub' and owner_id is null)
      );
  end if;
end $$;

-- Uma caixa por vendedor. Índice parcial porque os hubs têm owner_id nulo e
-- um unique comum deixaria passar só um deles.
create unique index if not exists uq_warehouse_owner
  on public.warehouses (owner_id) where kind = 'vendedor';

create index if not exists idx_warehouses_kind on public.warehouses (kind);


-- ── 2. Criar a caixa ───────────────────────────────────────────────────────
--
-- Em função, e não num INSERT solto, porque isto roda em três momentos: agora
-- (carga), quando alguém vira vendedor (trigger) e quando o Ops criar pela
-- tela. Três cópias da mesma regra divergiriam no formato do código.
--
-- O `code` é derivado do id e não do nome: nome muda (casamento, correção de
-- digitação) e o código é o que `ops_transfer_register` usa para achar o
-- destino. Código que muda é transferência que quebra.
-- O NOME é que carrega a legibilidade, e esse pode mudar à vontade.

create or replace function public.carbo_estoque_vendedor_criar(p_profile uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_nome text;
begin
  select id into v_id from public.warehouses where owner_id = p_profile and kind = 'vendedor';
  if v_id is not null then
    return v_id;                       -- idempotente: já tem caixa
  end if;

  select coalesce(nullif(trim(full_name), ''), 'Vendedor')
    into v_nome from public.profiles where id = p_profile;
  if v_nome is null then
    raise exception 'Perfil % não existe.', p_profile using errcode = 'no_data_found';
  end if;

  insert into public.warehouses (code, name, kind, owner_id, is_active)
  values (
    'VEND-' || upper(left(replace(p_profile::text, '-', ''), 8)),
    'Estoque · ' || v_nome,
    'vendedor', p_profile, true
  )
  returning id into v_id;

  return v_id;
end;
$$;

comment on function public.carbo_estoque_vendedor_criar is
  'Cria (ou devolve) a caixa de estoque do vendedor. Idempotente. O code deriva do id, nunca do nome: nome muda e o code é o que ops_transfer_register usa para achar o destino.';

revoke all on function public.carbo_estoque_vendedor_criar(uuid) from public;
grant execute on function public.carbo_estoque_vendedor_criar(uuid) to authenticated;


-- ── 3. Virou vendedor, ganha caixa ─────────────────────────────────────────
--
-- Sem isto a caixa só existe para quem era vendedor no dia desta migração, e
-- o vendedor novo descobre o problema tentando vender a pronta entrega — que
-- é o pior momento possível para descobrir.
--
-- ⚠️ Só CRIA. Desmarcar `is_vendedor` não apaga nem desativa a caixa: ela pode
-- ter saldo, e some com o saldo seria destruir estoque físico por causa de um
-- checkbox. Quem desativa é gente, olhando o que tem dentro.

create or replace function public.carbo_profile_vendedor_estoque()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(new.is_vendedor, false) and not coalesce(old.is_vendedor, false) then
    perform public.carbo_estoque_vendedor_criar(new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_profile_vendedor_estoque on public.profiles;
create trigger trg_profile_vendedor_estoque
  after insert or update of is_vendedor on public.profiles
  for each row execute function public.carbo_profile_vendedor_estoque();


-- ── 4. Carga: uma caixa para cada vendedor de hoje ─────────────────────────
--
-- Caixa vazia não custa nada — é uma linha em `warehouses` com zero saldo.
-- Adivinhar quem trabalha pronta entrega custaria uma reunião, e errar para
-- menos deixa alguém sem conseguir vender.

do $$
declare r record;
begin
  for r in select id from public.profiles where coalesce(is_vendedor, false) loop
    perform public.carbo_estoque_vendedor_criar(r.id);
  end loop;
end $$;


-- ── 5. Leitura ─────────────────────────────────────────────────────────────
--
-- `security_invoker` para a RLS de quem consulta continuar valendo dentro da
-- view — sem isso ela viraria um furo por onde qualquer autenticado leria o
-- que a policy da tabela nega.

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
-- ⚠️ CROSS JOIN com o catálogo, não join no saldo: a linha precisa existir com
-- ZERO. Produto que o vendedor não tem é justamente o que ele precisa pedir, e
-- um join comum o esconderia exatamente quando ele importa mais.
cross join public.mrp_products pr
left join public.warehouse_stock ws
       on ws.warehouse_id = w.id and ws.product_id = pr.id
where w.kind = 'vendedor'
  and pr.is_active
  and pr.category = 'Produto Final';

comment on view public.vendedor_estoque is
  'Saldo por vendedor e produto. Traz linha ZERADA para produto sem saldo de propósito: é o que falta na caixa, e um join comum esconderia justamente isso.';

grant select on public.vendedor_estoque to authenticated;


-- ── 6. Conferência ─────────────────────────────────────────────────────────

-- (a) As caixas nasceram? Uma por vendedor, com nome legível.
select w.code, w.name, p.full_name, w.is_active
from public.warehouses w
join public.profiles p on p.id = w.owner_id
where w.kind = 'vendedor'
order by p.full_name;

-- (b) Sobrou vendedor sem caixa? Tem de vir VAZIO.
select p.id, p.full_name
from public.profiles p
where coalesce(p.is_vendedor, false)
  and not exists (
    select 1 from public.warehouses w where w.owner_id = p.id and w.kind = 'vendedor'
  );

-- (c) Os hubs continuam intactos? Os cinco de sempre, kind = 'hub'.
select code, name, kind, is_active from public.warehouses where kind = 'hub' order by code;
