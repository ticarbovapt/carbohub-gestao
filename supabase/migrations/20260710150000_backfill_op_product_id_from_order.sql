-- Vincula product_id nas OPs geradas do pós-venda que nasceram sem ele (antes do
-- fix). Só quando o pedido tem UM item com product_id (Produto Final do MRP) —
-- assim o check de materiais consegue ler a ficha (mrp_bom) da OP.
UPDATE public.production_orders po
SET product_id = (co.items->0->>'product_id')::uuid
FROM public.carboze_orders co
WHERE po.source_order_id = co.id
  AND po.product_id IS NULL
  AND jsonb_typeof(co.items) = 'array'
  AND jsonb_array_length(co.items) = 1
  AND nullif(co.items->0->>'product_id', '') IS NOT NULL;
