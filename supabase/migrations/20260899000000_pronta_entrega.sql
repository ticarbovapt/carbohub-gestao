-- ═══════════════════════════════════════════════════════════════════════════
-- Pronta entrega — PASSO 4 de 7
--
-- A venda ganha modalidade. "Pronta entrega" deduz da caixa do vendedor na
-- hora e nasce em "Gerar Nota Fiscal"; "produção" segue a esteira de sempre.
--
-- ⚠️ RODE EM BLOCOS. Mesma razão do passo 1: `carboze_orders` é lida o tempo
-- todo pelos sete apps, e ALTER TABLE nela pede AccessExclusiveLock.
--
-- ── Este passo é INERTE até o passo 5 ─────────────────────────────────────
--
-- Nenhuma tela grava `entrega_modalidade` ainda. Enquanto ela for nula em toda
-- linha, o gatilho abaixo não faz nada e o comportamento do sistema é
-- exatamente o de hoje. Isso é de propósito: sobe agora, é testado no banco, e
-- só liga quando o dropdown existir.
--
-- ── Por que os TRÊS pedaços vêm juntos ────────────────────────────────────
--
-- Dedução, bloqueio e correção do estorno são um passo só, não três. Se a
-- pronta entrega passasse a deduzir da caixa do vendedor enquanto
-- `pos_venda_restore_stock` ainda tem 'HUB-RN' escrito no código, cancelar
-- essa venda creditaria NATAL com produto que está na van do vendedor. É o
-- mesmo furo do cancelamento que motivou este projeto, só que mudado de lugar.
--
-- ── A bonificação sai daqui desde o primeiro dia ──────────────────────────
--
-- `pos_venda_deduct_stock` lê só `quantity` e ignora `bonificacao` — o produto
-- bonificado sai do galpão e o saldo não cai. Isso é um furo que já existe no
-- HUB-RN e será corrigido separadamente (passo 7), porque mexe no saldo de
-- todas as vendas normais e merece ser anunciado sozinho.
--
-- Mas o caminho NOVO nasce certo: a caixa do vendedor é pequena e o furo
-- apareceria toda semana. Aqui deduz quantidade + bonificação.
-- ═══════════════════════════════════════════════════════════════════════════


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 1 — as colunas em `carboze_orders`                              ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
-- Nulo é o normal e continua sendo: pedido do Bling, do e-commerce e todo o
-- histórico não têm modalidade. Nulo = trata como produção, que é o de sempre.

set lock_timeout = '5s';

alter table public.carboze_orders
  add column if not exists entrega_modalidade text,
  add column if not exists estoque_warehouse_id uuid references public.warehouses(id);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'carboze_orders_modalidade_check') then
    alter table public.carboze_orders
      add constraint carboze_orders_modalidade_check
      check (entrega_modalidade is null or entrega_modalidade in ('pronta_entrega', 'producao'));
  end if;
end $$;

reset lock_timeout;

comment on column public.carboze_orders.entrega_modalidade is
  'pronta_entrega = sai da caixa do vendedor agora. producao = segue a esteira. NULL = produção (histórico, Bling, e-commerce).';
comment on column public.carboze_orders.estoque_warehouse_id is
  'De qual estoque este pedido foi deduzido. É o que o estorno consulta — sem ele, cancelar uma venda de pronta entrega devolveria o produto ao HUB-RN em vez da caixa do vendedor.';


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 2 — quanto sai de cada produto                                  ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
-- Função separada porque a mesma conta é usada pela dedução e pelo estorno.
-- Duas cópias divergiriam, e divergir AQUI significa estornar quantidade
-- diferente da que saiu — furo que só aparece na contagem física.
--
-- ⚠️ Soma `bonificacao`: produto bonificado é produto que saiu da prateleira.

create or replace function public.carbo_itens_para_estoque(p_items jsonb)
returns table (product_id uuid, qty numeric)
language sql immutable parallel safe as $$
  select (it->>'product_id')::uuid,
         sum(coalesce((it->>'quantity')::numeric, 0) + coalesce((it->>'bonificacao')::numeric, 0))
  from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) it
  where nullif(it->>'product_id', '') is not null
    and coalesce(it->>'kind', '') <> 'service'
  group by 1
  having sum(coalesce((it->>'quantity')::numeric, 0) + coalesce((it->>'bonificacao')::numeric, 0)) > 0;
$$;

comment on function public.carbo_itens_para_estoque is
  'Itens do pedido → quantidade que sai do estoque, somando bonificação. Serviço não move estoque. Agrupa por produto: o mesmo SKU repetido em duas linhas é uma saída só.';


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 3 — deduzir da caixa do vendedor                                ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
-- Bloqueia quando não tem saldo. A caixa é do próprio vendedor e ele acabou de
-- olhar dentro dela: saldo insuficiente quase sempre significa que a CONTAGEM
-- está errada, e deixar vender por cima esconde exatamente o que precisa
-- aparecer.
--
-- ⚠️ FOR UPDATE em cada linha antes de conferir. Sem a trava, duas vendas
-- simultâneas do mesmo vendedor (celular e desktop, ou dois cliques rápidos)
-- leriam o mesmo saldo e as duas passariam — o clássico lost update, que aqui
-- vira estoque negativo sem nenhum erro.

create or replace function public.carbo_pronta_entrega_deduzir(p_order_id uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ord public.carboze_orders;
  v_wh uuid;
  v_nome text;
  r record;
  cur numeric;
  n int := 0;
begin
  select * into v_ord from public.carboze_orders where id = p_order_id for update;
  if not found then
    raise exception 'Pedido % não encontrado.', p_order_id using errcode = 'no_data_found';
  end if;

  -- Idempotente: já deduzido não deduz de novo. É o mesmo portão que impede a
  -- dedução dupla se alguém arrastar o card até "Separado" depois.
  if v_ord.stock_deducted then
    return 0;
  end if;

  if v_ord.vendedor_id is null then
    raise exception 'Pedido sem vendedor: não dá para saber de qual estoque sai.'
      using errcode = 'check_violation';
  end if;

  select id into v_wh from public.warehouses
   where owner_id = v_ord.vendedor_id and kind = 'vendedor' and is_active;
  if v_wh is null then
    select full_name into v_nome from public.profiles where id = v_ord.vendedor_id;
    raise exception 'O vendedor % não tem caixa de estoque ativa.', coalesce(v_nome, 'sem nome')
      using errcode = 'check_violation';
  end if;

  for r in select * from public.carbo_itens_para_estoque(v_ord.items) loop
    select quantity into cur from public.warehouse_stock
      where warehouse_id = v_wh and product_id = r.product_id
      for update;
    cur := coalesce(cur, 0);

    if r.qty > cur then
      select name into v_nome from public.mrp_products where id = r.product_id;
      raise exception
        'Sem saldo de "%" na sua caixa: você tem %, o pedido pede %.',
        coalesce(v_nome, 'produto'), cur, r.qty
        using errcode = 'check_violation';
    end if;

    insert into public.warehouse_stock (warehouse_id, product_id, quantity)
    values (v_wh, r.product_id, -r.qty)
    on conflict (warehouse_id, product_id)
    do update set quantity = public.warehouse_stock.quantity - r.qty, updated_at = now();

    insert into public.stock_movements
      (product_id, warehouse_id, tipo, quantidade, origem, origem_id, order_id, observacoes, created_by)
    values
      (r.product_id, v_wh, 'saida', r.qty, 'venda', p_order_id, p_order_id,
       'Pronta entrega · pedido ' || coalesce(v_ord.order_number, ''), auth.uid());

    n := n + 1;
  end loop;

  update public.carboze_orders
    set stock_deducted = true,
        estoque_warehouse_id = v_wh,
        updated_at = now()
    where id = p_order_id;

  return n;
end;
$$;

comment on function public.carbo_pronta_entrega_deduzir is
  'Deduz o pedido da caixa do vendedor, com trava por linha. Recusa quando falta saldo: a caixa é dele e ele acabou de olhar dentro — saldo insuficiente quase sempre é contagem errada, e vender por cima esconderia isso.';

revoke all on function public.carbo_pronta_entrega_deduzir(uuid) from public;
grant execute on function public.carbo_pronta_entrega_deduzir(uuid) to authenticated;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 4 — o estorno passa a saber de onde saiu                        ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
-- ⚠️ ESTE é o bloco que não pode ficar para depois.
--
-- `pos_venda_restore_stock` tinha 'HUB-RN' escrito no código. Cancelar uma
-- venda de pronta entrega devolveria a Natal um produto que está na van do
-- vendedor: Natal ganharia estoque que não existe e a caixa continuaria vazia.
--
-- Agora ele lê `estoque_warehouse_id`. Para todo pedido antigo essa coluna é
-- NULA e o fallback é o HUB-RN — ou seja, o comportamento de hoje, intacto.
--
-- Também passa a registrar o movimento de entrada com a MESMA conta da saída
-- (`carbo_itens_para_estoque`, com bonificação). Antes ele usava `quantity`
-- puro; para pedidos deduzidos pelo caminho antigo isso devolveria a mesma
-- quantidade que saiu, então nada muda no passivo.

create or replace function public.pos_venda_restore_stock(p_order_id uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ord public.carboze_orders;
  v_wh uuid;
  r record;
  n int := 0;
begin
  update public.carboze_orders
    set stock_deducted = false, updated_at = now()
    where id = p_order_id and stock_deducted = true;
  if not found then
    return 0;                          -- não estava deduzido → nada a estornar
  end if;

  select * into v_ord from public.carboze_orders where id = p_order_id;

  -- De onde saiu. Nulo (todo o histórico) → HUB-RN, como sempre foi.
  v_wh := v_ord.estoque_warehouse_id;
  if v_wh is null then
    select id into v_wh from public.warehouses where code = 'HUB-RN' limit 1;
  end if;
  if v_wh is null then return 0; end if;

  for r in select * from public.carbo_itens_para_estoque(v_ord.items) loop
    insert into public.warehouse_stock (warehouse_id, product_id, quantity)
    values (v_wh, r.product_id, r.qty)
    on conflict (warehouse_id, product_id)
    do update set quantity = public.warehouse_stock.quantity + r.qty, updated_at = now();

    insert into public.stock_movements
      (product_id, warehouse_id, tipo, quantidade, origem, origem_id, order_id, observacoes, created_by)
    values
      (r.product_id, v_wh, 'entrada', r.qty, 'venda', p_order_id, p_order_id,
       'Estorno · pedido ' || coalesce(v_ord.order_number, ''), auth.uid());

    n := n + 1;
  end loop;

  -- A caixa de origem é limpa junto: pedido não deduzido não tem origem, e
  -- deixar o id pendurado faria um estorno futuro devolver para o lugar errado.
  update public.carboze_orders set estoque_warehouse_id = null where id = p_order_id;

  return n;
end;
$$;

comment on function public.pos_venda_restore_stock is
  'Estorna a dedução para o estoque de ONDE SAIU (estoque_warehouse_id), com fallback no HUB-RN para todo o histórico. Antes devolvia sempre a Natal — o que, na pronta entrega, criaria estoque em Natal que está na van do vendedor.';


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 5 — a venda de pronta entrega nasce em "Gerar NF"              ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
-- No BANCO e não na tela, porque o `/vender` existe em seis apps: a regra na
-- tela seria seis cópias para divergir. Aqui é uma.
--
-- ⚠️ A dedução acontece DENTRO da transação do insert. Se faltar saldo, o
-- `raise` derruba o insert inteiro — não fica pedido órfão marcado como pronta
-- entrega e sem baixa. É esse acoplamento que torna o bloqueio confiável.
--
-- Orçamento (status 'quote') não deduz: ainda não é venda. A dedução acontece
-- na conversão, que é um UPDATE de status — por isso o gatilho ouve os dois.

-- AFTER, não BEFORE: a dedução grava `stock_movements.order_id` apontando para
-- o pedido, e num BEFORE INSERT esse id ainda não existe na tabela — a FK
-- falharia. Por isso o estágio é ajustado com um UPDATE logo em seguida, em
-- vez de um `new.fulfillment_stage := ...`.
create or replace function public.carbo_pronta_entrega_after_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(new.entrega_modalidade, 'producao') <> 'pronta_entrega' then return new; end if;
  if new.status = 'quote' then return new; end if;

  perform public.carbo_pronta_entrega_deduzir(new.id);

  update public.carboze_orders
    set fulfillment_stage = 'gerar_nf'
    where id = new.id and fulfillment_stage <> 'gerar_nf';

  return new;
end;
$$;

drop trigger if exists trg_pronta_entrega_insert on public.carboze_orders;
create trigger trg_pronta_entrega_insert
  after insert on public.carboze_orders
  for each row execute function public.carbo_pronta_entrega_after_insert();

-- Conversão de orçamento em pedido: o estoque só sai agora.
drop trigger if exists trg_pronta_entrega_converte on public.carboze_orders;
create trigger trg_pronta_entrega_converte
  after update of status on public.carboze_orders
  for each row
  when (old.status = 'quote' and new.status <> 'quote')
  execute function public.carbo_pronta_entrega_after_insert();


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 6 — pronta entrega: NF finalizada → entregue                    ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
-- O vendedor já entregou em mãos. Etiqueta e transporte existem para o que sai
-- de Natal por transportadora; fazer o card passar por elas obrigaria alguém a
-- arrastar duas colunas que não descrevem nada que aconteceu.

create or replace function public.carbo_pronta_entrega_encerra()
returns trigger
language plpgsql
as $$
begin
  if coalesce(new.entrega_modalidade, '') = 'pronta_entrega'
     and new.fulfillment_stage = 'nf_finalizada' then
    new.fulfillment_stage := 'entregue';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_pronta_entrega_encerra on public.carboze_orders;
create trigger trg_pronta_entrega_encerra
  before update of fulfillment_stage on public.carboze_orders
  for each row execute function public.carbo_pronta_entrega_encerra();


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 7 — conferência                                                 ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

-- (a) As colunas existem?
select column_name, data_type
from information_schema.columns
where table_schema = 'public' and table_name = 'carboze_orders'
  and column_name in ('entrega_modalidade', 'estoque_warehouse_id');

-- (b) ⚠️ Tem de vir ZERO. Nenhum pedido é pronta entrega ainda — o dropdown
--     só existe no passo 5. Se vier qualquer linha, algo gravou sem tela.
select count(*) as pronta_entrega_hoje
from public.carboze_orders where entrega_modalidade = 'pronta_entrega';

-- (c) A conta de itens bate? Compara o que o pedido pede com o que sairia do
--     estoque — a diferença é exatamente a bonificação que hoje NÃO é
--     deduzida no caminho antigo (HUB-RN). Mede o furo do passo 7.
select
  count(*) filter (where pedido <> estoque) as pedidos_com_bonificacao,
  sum(estoque - pedido)                     as unidades_nunca_deduzidas
from (
  select o.id,
         (select coalesce(sum(coalesce((it->>'quantity')::numeric, 0)), 0)
            from jsonb_array_elements(coalesce(o.items, '[]'::jsonb)) it
           where nullif(it->>'product_id', '') is not null) as pedido,
         (select coalesce(sum(qty), 0) from public.carbo_itens_para_estoque(o.items)) as estoque
  from public.carboze_orders o
  where o.stock_deducted
) x;
