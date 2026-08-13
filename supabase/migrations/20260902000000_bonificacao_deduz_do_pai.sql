-- ═══════════════════════════════════════════════════════════════════════════
-- ⚠️ CORREÇÃO URGENTE — a esteira normal deduz do SKU errado
--
-- Desde que o gêmeo de bonificação entrou no catálogo (20260900), existem DOIS
-- caminhos de dedução e só UM está certo:
--
--   carbo_pronta_entrega_deduzir  → usa carbo_itens_para_estoque, resolve o
--                                    gêmeo para o pai.            ✅ certo
--   pos_venda_deduct_stock        → lê it->>'product_id' CRU.     ❌ errado
--
-- O segundo é o da esteira normal (arrastar para "Separado" no Rastreio de
-- venda). Com bonificação no pedido ele baixa do SKU `CZ100-BON`, que nunca
-- teve saldo: a linha vai a NEGATIVO e o `CarboZé 100ml` real não cai.
--
-- E o negativo é INVISÍVEL: o gêmeo está filtrado das telas de estoque
-- (`bonificacao_de is null` no useStock e no useMrpProducts), justamente porque
-- ele não deveria ter saldo. Um erro que não aparece em tela nenhuma é o que
-- vira diferença de inventário três meses depois, sem ninguém saber a origem.
--
-- Este era o "passo 7", planejado para o fim. Ele deixou de ser opcional no
-- momento em que o gêmeo entrou no catálogo — a ordem estava errada e isto
-- corrige.
--
-- ── De quebra, fecha o furo antigo da bonificação ─────────────────────────
--
-- A versão antiga lia só `quantity` e ignorava o campo `bonificacao` das linhas
-- do modelo velho: produto bonificado saía do galpão e o saldo não caía.
-- Medido antes de corrigir: 1 pedido, 40 unidades. `carbo_itens_para_estoque`
-- soma os dois, então a partir daqui os dois modelos deduzem certo.
--
-- ⚠️ Isto MUDA o saldo de vendas normais daqui para a frente (a bonificação
-- passa a sair do estoque, como sempre deveria). O passivo dos 40 não é
-- corrigido automaticamente — ver o BLOCO 3.
-- ═══════════════════════════════════════════════════════════════════════════


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 1 — a dedução da esteira passa a usar a MESMA conta             ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
-- Uma conta só (`carbo_itens_para_estoque`) para os dois caminhos e para o
-- estorno. Enquanto eram duas, elas divergiram — e divergir aqui significa
-- estornar quantidade diferente da que saiu.

create or replace function public.pos_venda_deduct_stock(p_order_id uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  wh uuid;
  r record;
  n int := 0;
begin
  update public.carboze_orders
     set stock_deducted = true, updated_at = now()
   where id = p_order_id and stock_deducted = false;
  if not found then return 0; end if;      -- já deduzido (idempotente)

  select id into wh from public.warehouses where code = 'HUB-RN' limit 1;
  if wh is null then return 0; end if;

  for r in
    select * from public.carbo_itens_para_estoque(
      (select items from public.carboze_orders where id = p_order_id))
  loop
    insert into public.warehouse_stock (warehouse_id, product_id, quantity)
    values (wh, r.product_id, -r.qty)
    on conflict (warehouse_id, product_id)
    do update set quantity = public.warehouse_stock.quantity - r.qty, updated_at = now();

    perform public.carbo_reg_mov_venda(p_order_id, wh, r.product_id, r.qty::int, 'saida', 'Separação');
    n := n + 1;
  end loop;

  -- Registra de ONDE saiu, como o caminho da pronta entrega já faz. Sem isto o
  -- estorno cai no fallback do HUB-RN — que aqui até acerta, mas por sorte, e
  -- sorte não é regra.
  update public.carboze_orders
     set estoque_warehouse_id = wh
   where id = p_order_id and estoque_warehouse_id is null;

  return n;
end $$;

comment on function public.pos_venda_deduct_stock is
  'Dedução da esteira normal (Separado), do HUB-RN. Usa carbo_itens_para_estoque: resolve o gêmeo de bonificação para o produto PAI e soma o campo bonificacao legado. Antes lia product_id cru e baixava do SKU do gêmeo, que ia a negativo invisível.';


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 2 — o estrago já feito                                          ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
-- Quanto saiu do SKU errado desde que o gêmeo existe. Tem de vir VAZIO se
-- nenhum pedido com bonificação passou por "Separado" nesse meio-tempo.

select w.code as galpao, pr.product_code as sku_do_gemeo, pai.product_code as deveria_ser,
       ws.quantity as saldo_errado
from public.warehouse_stock ws
join public.mrp_products pr  on pr.id = ws.product_id
join public.mrp_products pai on pai.id = pr.bonificacao_de
join public.warehouses   w   on w.id  = ws.warehouse_id
where pr.bonificacao_de is not null and ws.quantity <> 0;

-- Se a consulta acima trouxer linhas, rode este bloco para mover o saldo para
-- o produto certo. É UPDATE de correção, não rotina — por isso está solto e
-- não numa função.
--
-- do $$
-- declare r record; begin
--   for r in
--     select ws.warehouse_id, ws.product_id as gemeo, pr.bonificacao_de as pai, ws.quantity
--     from public.warehouse_stock ws
--     join public.mrp_products pr on pr.id = ws.product_id
--     where pr.bonificacao_de is not null and ws.quantity <> 0
--   loop
--     insert into public.warehouse_stock (warehouse_id, product_id, quantity)
--     values (r.warehouse_id, r.pai, r.quantity)
--     on conflict (warehouse_id, product_id)
--     do update set quantity = public.warehouse_stock.quantity + r.quantity, updated_at = now();
--     update public.warehouse_stock set quantity = 0, updated_at = now()
--      where warehouse_id = r.warehouse_id and product_id = r.gemeo;
--   end loop;
-- end $$;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 3 — o passivo antigo (40 unidades)                              ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
-- Pedidos do modelo ANTIGO que já foram deduzidos sem contar a bonificação.
-- O saldo do HUB-RN está alto nesse tanto.
--
-- ⚠️ NÃO corrijo automaticamente. Mexer no saldo de pedido já fechado é
-- reescrever histórico de estoque sem que ninguém tenha contado a prateleira —
-- e se a diferença já foi absorvida num inventário anterior, o "conserto"
-- criaria uma segunda diferença. Isto é ajuste de inventário, decisão de quem
-- conta o galpão.

select o.order_number, o.created_at::date as data, pr.name as produto,
       (it->>'bonificacao')::numeric as nunca_deduzido
from public.carboze_orders o
cross join lateral jsonb_array_elements(coalesce(o.items, '[]'::jsonb)) it
join public.mrp_products pr on pr.id = nullif(it->>'product_id','')::uuid
where o.stock_deducted
  and coalesce((it->>'bonificacao')::numeric, 0) > 0
order by o.created_at desc;
