-- ════════════════════════════════════════════════════════════════════════════
-- Namespace separado para pedidos nascidos no Bling
-- ════════════════════════════════════════════════════════════════════════════
-- Pedidos importados do Bling estavam consumindo a sequência PED-2026-XXXXX,
-- ficando indistinguíveis de vendas nativas do sistema. A partir de agora eles
-- usam BLING-{nº do Bling}. Esta migration renumera os já importados.
--
-- Segurança: só toca pedidos com external_ref 'bling-%' que ainda estão como PED-%.
-- A FK real (order_id uuid) não muda; só o número exibido e o denormalizado em bling_nfe.

-- 1. Renumera usando o número do pedido no Bling (bling_orders.numero)
UPDATE public.carboze_orders co
SET order_number = 'BLING-' || bo.numero,
    updated_at   = now()
FROM public.bling_orders bo
WHERE co.external_ref = 'bling-' || bo.bling_id::text
  AND co.order_number LIKE 'PED-%'
  AND bo.numero IS NOT NULL
  AND NOT EXISTS (  -- evita colisão de unicidade
    SELECT 1 FROM public.carboze_orders x
    WHERE x.order_number = 'BLING-' || bo.numero
  );

-- 2. Fallback: pedidos bling sem numero correspondente usam o id do external_ref
UPDATE public.carboze_orders
SET order_number = 'BLING-' || split_part(external_ref, '-', 2),
    updated_at   = now()
WHERE external_ref LIKE 'bling-%'
  AND order_number LIKE 'PED-%'
  AND NOT EXISTS (
    SELECT 1 FROM public.carboze_orders x
    WHERE x.order_number = 'BLING-' || split_part(carboze_orders.external_ref, '-', 2)
  );

-- 3. Atualiza o número denormalizado nas NFs já vinculadas a esses pedidos
UPDATE public.bling_nfe nf
SET matched_order_number = co.order_number,
    updated_at           = now()
FROM public.carboze_orders co
WHERE nf.order_id = co.id
  AND co.order_number LIKE 'BLING-%'
  AND nf.matched_order_number IS DISTINCT FROM co.order_number;
