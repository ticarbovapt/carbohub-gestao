-- ═══════════════════════════════════════════════════════════════════════════
-- Bling 2: o frete existe, mas estava zerado no sistema
--
-- A ponte grava `shipping_cost = bling2_orders.total_frete`. Só que a LISTAGEM
-- do Bling não devolve `totalFrete` — o campo simplesmente não vem —, então os
-- 160 pedidos importados ficaram com frete R$ 0,00 enquanto o cliente pagou.
--
-- O valor está embutido no `total`, e a própria aritmética do pedido o entrega:
--
--     total = total_produtos − desconto + frete
--     frete = total − total_produtos + desconto
--
-- Conferido contra o dado real: a diferença bateu R$ 1.807,43 em julho e
-- R$ 657,97 em agosto — que é exatamente o que separava o faturamento do
-- Comercial (produto + frete) do da tela de e-commerce (só produto).
--
-- ⚠️ `greatest(..., 0)`: se um pedido tiver desconto que a listagem também não
-- traz, a conta pode dar negativo. Frete negativo é ruído com cara de dado;
-- zero é honesto.
-- ═══════════════════════════════════════════════════════════════════════════

update public.carboze_orders
set shipping_cost = greatest(round(total - subtotal + coalesce(discount, 0), 2), 0),
    updated_at    = now()
where source_file = 'bling2_bridge'
  and coalesce(shipping_cost, 0) = 0
  and total > subtotal;


-- ── A ponte passa a calcular assim ────────────────────────────────────────
-- Só o trecho do frete muda; o resto da função fica como está.
create or replace function public.bling2_frete_do_pedido(
  p_total numeric, p_produtos numeric, p_desconto numeric, p_frete numeric
) returns numeric language sql immutable set search_path = public as $$
  -- O `total_frete` da listagem vence quando existe; senão, deduz do total.
  select case
    when coalesce(p_frete, 0) > 0 then p_frete
    else greatest(round(coalesce(p_total,0) - coalesce(p_produtos,0) + coalesce(p_desconto,0), 2), 0)
  end
$$;

comment on function public.bling2_frete_do_pedido is
  'Frete do pedido do Bling 2. A listagem não devolve totalFrete, então deduz de total − produtos + desconto quando o campo vem vazio.';


-- ═══════════════════════════════════════════════════════════════════════════
-- Conferência
-- ═══════════════════════════════════════════════════════════════════════════

select date_trunc('month', sale_date)::date as mes,
       sum(total)                            as total,
       sum(subtotal)                         as produtos,
       sum(shipping_cost)                    as frete,
       count(*) filter (where coalesce(shipping_cost,0) = 0) as ainda_sem_frete
from public.carboze_orders
where source_file = 'bling2_bridge' and status <> 'cancelled'
group by 1 order by 1 desc;
