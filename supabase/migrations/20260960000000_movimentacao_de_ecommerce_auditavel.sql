-- ═══════════════════════════════════════════════════════════════════════════
-- A dedução do e-commerce vira linha AUDITÁVEL em Movimentações
--
-- Pedido do dono do processo, olhando o Hub Natal:
--   "similar ao hub natal, eu quero nas movimentações gravando as vendas
--    certinho para auditar a dedução do estoque, e ver alterações manuais."
--
-- ── O que já funcionava, e o que faltava ─────────────────────────────────
--
-- A `carbo_ecommerce_deduzir_estoque` (20260956) JÁ escreve em
-- `stock_movements`, então a linha aparece. O que falta é ela ser CONFERÍVEL:
--
--   1. A coluna "Card" da tela lê `order_id`, que é UUID e aponta para
--      `carboze_orders`. Pedido de e-commerce tem id de TEXTO
--      (`nuvemshop:1234-5678`) e não cabe ali — a linha sai com "—" e o número
--      do pedido fica enterrado no meio da frase da observação. A tela já diz
--      isso em comentário: número dentro de texto não dá para filtrar, ordenar
--      nem copiar.
--
--   2. `created_by` é `auth.uid()`, e quem roda é o `pg_cron` — sem sessão,
--      sem usuário. A coluna "Por" mostra "—", igual a movimento antigo sem
--      autor. Duas coisas diferentes com a mesma cara: "o sistema fez" e "não
--      se sabe quem fez".
--
-- ── A coluna nova, e por que não reusar o que existe ─────────────────────
--
-- `ref_externa` é TEXTO e nasce nula. Não reusei `origem_id` (uuid, e já
-- significa "id da OP / do PC") nem `order_id` (FK para `carboze_orders`):
-- duas coisas disputando a MESMA coluna com significados diferentes é o erro
-- do `bling_nf_id`, que fez nota de uma empresa derrubar venda de outra.
--
-- ⚠️ RODE EM BLOCOS.
-- ═══════════════════════════════════════════════════════════════════════════


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 1 — a referência externa, e quem executou                       ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

alter table public.stock_movements
  add column if not exists ref_externa text,
  add column if not exists executor    text;

comment on column public.stock_movements.ref_externa is
  'Identificador do documento de ORIGEM quando ele não é um id do nosso banco — hoje o pedido de e-commerce (`nuvemshop:1234-5678`). ⚠️ Coluna própria de propósito: `order_id` é FK para carboze_orders e `origem_id` é o id da OP/PC. Duas coisas na mesma coluna com significados diferentes é o erro do bling_nf_id.';

comment on column public.stock_movements.executor is
  'Quem executou, quando não foi uma pessoa logada — ex.: `cron:ecommerce`. ⚠️ Existe para a tela não mostrar "—" tanto para "o sistema fez" quanto para "não se sabe quem fez". `created_by` continua sendo a pessoa, e os dois nunca são preenchidos juntos.';

create index if not exists stock_movements_ref_externa_idx
  on public.stock_movements (ref_externa) where ref_externa is not null;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 2 — a dedução passa a preencher os dois                         ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

create or replace function public.carbo_ecommerce_deduzir_estoque(
  p_ensaio boolean default true,
  p_limite integer default 500
)
returns table (
  acao          text,
  platform      text,
  order_id      text,
  produto       text,
  unidades      integer,
  saldo_antes   integer,
  saldo_depois  integer,
  aviso         text
)
language plpgsql security definer set search_path = public as $$
declare
  r       record;
  v_wh    uuid;
  v_saldo integer;
begin
  for r in
    select e.platform, e.order_id, e.product_id_alvo, e.produto_alvo,
           e.ordered_at, e.product_sku, e.qtd_vendida, e.fator,
           e.unidades_a_deduzir::integer as unidades, c.warehouse_code
    from public.carbo_estoque_ensaio e
    join public.carbo_canal_estoque c on c.platform = e.platform
    where c.ativo
      and c.deduz_a_partir_de is not null
      and e.ordered_at > c.deduz_a_partir_de
      and e.product_id_alvo is not null
      and e.unidades_a_deduzir > 0
      and not exists (
        select 1 from public.carbo_estoque_consumo k
        where k.origem_tipo  = 'ecommerce'
          and k.origem_chave = e.platform || ':' || e.order_id
          and k.product_id   = e.product_id_alvo
      )
    order by e.ordered_at
    limit p_limite
  loop
    select w.id into v_wh from public.warehouses w where w.code = r.warehouse_code;
    if v_wh is null then
      acao := 'ERRO'; platform := r.platform; order_id := r.order_id;
      produto := r.produto_alvo; unidades := r.unidades;
      saldo_antes := null; saldo_depois := null;
      aviso := 'galpão ' || r.warehouse_code || ' não existe em warehouses';
      return next; continue;
    end if;

    -- ⚠️ FOR UPDATE antes de ler o saldo: sem isso duas rodadas leem o mesmo
    -- número e as duas escrevem.
    select ws.quantity into v_saldo
    from public.warehouse_stock ws
    where ws.warehouse_id = v_wh and ws.product_id = r.product_id_alvo
    for update;
    v_saldo := coalesce(v_saldo, 0);

    acao         := case when p_ensaio then 'ENSAIO' else 'DEDUZIDO' end;
    platform     := r.platform;    order_id := r.order_id;
    produto      := r.produto_alvo; unidades := r.unidades;
    saldo_antes  := v_saldo;
    saldo_depois := v_saldo - r.unidades;
    aviso := case when v_saldo - r.unidades < 0
                  then '⚠️ saldo fica NEGATIVO — contagem do galpão está atrás'
             end;

    if not p_ensaio then
      insert into public.carbo_estoque_consumo
        (origem_tipo, origem_chave, warehouse_id, product_id, unidades,
         ocorreu_em, platform, platform_sku, quantidade, fator)
      values
        ('ecommerce', r.platform || ':' || r.order_id, v_wh, r.product_id_alvo,
         r.unidades, r.ordered_at, r.platform, r.product_sku, r.qtd_vendida, r.fator)
      on conflict (origem_tipo, origem_chave, product_id) do nothing;

      if not found then
        acao := 'JA_CONTABILIZADO'; aviso := null;
        return next; continue;
      end if;

      insert into public.warehouse_stock (warehouse_id, product_id, quantity)
      values (v_wh, r.product_id_alvo, -r.unidades)
      on conflict (warehouse_id, product_id)
      do update set quantity = public.warehouse_stock.quantity - r.unidades,
                    updated_at = now();

      -- ⚠️ A observação diz o CÁLCULO, não o identificador: quem confere quer
      -- ver "3 packs × 5 un = 15" e decidir se fecha. O número do pedido vai
      -- em `ref_externa`, que é coluna — dá para filtrar, ordenar e copiar.
      insert into public.stock_movements
        (product_id, warehouse_id, tipo, quantidade, origem, observacoes,
         ref_externa, executor)
      values
        (r.product_id_alvo, v_wh, 'saida', r.unidades, 'ecommerce',
         'Venda on-line · ' || initcap(r.platform) || ' · '
           || r.qtd_vendida || ' × ' || r.fator || ' un'
           || coalesce(' · SKU ' || r.product_sku, ' · sem SKU'),
         r.platform || ':' || r.order_id,
         'cron:ecommerce');
    end if;

    return next;
  end loop;
end;
$$;


create or replace function public.carbo_ecommerce_estornar_estoque(
  p_ensaio boolean default true
)
returns table (acao text, platform text, order_id text, produto text, unidades integer)
language plpgsql security definer set search_path = public as $$
declare r record;
begin
  for r in
    select k.id, k.warehouse_id, k.product_id, k.unidades, k.platform,
           k.origem_chave, k.quantidade, k.fator, p.product_code
    from public.carbo_estoque_consumo k
    join public.mrp_products p on p.id = k.product_id
    where k.origem_tipo = 'ecommerce'
      and not exists (
        select 1 from public.ecommerce_orders o
        where o.platform || ':' || o.order_id = k.origem_chave
          and o.status in ('paid','shipped','delivered')
      )
  loop
    acao := case when p_ensaio then 'ENSAIO' else 'ESTORNADO' end;
    platform := r.platform; order_id := r.origem_chave;
    produto := r.product_code; unidades := r.unidades;

    if not p_ensaio then
      update public.warehouse_stock
         set quantity = quantity + r.unidades, updated_at = now()
       where warehouse_id = r.warehouse_id and product_id = r.product_id;

      insert into public.stock_movements
        (product_id, warehouse_id, tipo, quantidade, origem, observacoes,
         ref_externa, executor)
      values
        (r.product_id, r.warehouse_id, 'entrada', r.unidades, 'ecommerce',
         'Estorno de venda on-line · ' || initcap(r.platform)
           || ' — o pedido deixou de estar pago',
         r.origem_chave,
         'cron:ecommerce');

      -- A linha SAI: é ela que significa "já contabilizado".
      delete from public.carbo_estoque_consumo where id = r.id;
    end if;

    return next;
  end loop;
end;
$$;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 3 — conferência                                                 ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

-- (a) ⭐ A auditoria que o dono do processo pediu: cada venda on-line, o que
--     ela tirou, e a conta que produziu o número.
select m.created_at::date as data, p.product_code, p.name as produto,
       m.tipo, m.quantidade, m.observacoes,
       m.ref_externa, coalesce(m.executor, 'pessoa logada') as por
from public.stock_movements m
join public.mrp_products p on p.id = m.product_id
join public.warehouses w on w.id = m.warehouse_id and w.code = 'HUB-SP'
where m.origem = 'ecommerce'
order by m.created_at desc
limit 50;

-- (b) O saldo hoje, e ⚠️ se ele aguenta o que vai ser deduzido. Ajuste manual
--     recente que zerou a linha faz a primeira dedução ir a NEGATIVO — o que
--     não é bug, é o espelho dizendo que a contagem está atrás.
select p.product_code, p.name, ws.quantity as saldo_agora
from public.warehouse_stock ws
join public.warehouses w on w.id = ws.warehouse_id and w.code = 'HUB-SP'
join public.mrp_products p on p.id = ws.product_id
order by ws.quantity;

-- (c) As alterações MANUAIS do galpão, que é a outra metade do pedido.
select m.created_at::date as data, p.product_code, m.tipo, m.quantidade,
       m.observacoes, coalesce(pr.full_name, m.executor, '—') as por
from public.stock_movements m
join public.mrp_products p on p.id = m.product_id
join public.warehouses w on w.id = m.warehouse_id and w.code = 'HUB-SP'
left join public.profiles pr on pr.id = m.created_by
where m.origem = 'ajuste'
order by m.created_at desc
limit 50;
