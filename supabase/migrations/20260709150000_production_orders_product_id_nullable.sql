-- ─────────────────────────────────────────────────────────────────────────────
-- production_orders.product_id era NOT NULL (schema antigo, ligado a mrp_products).
-- As OPs modernas usam sku_id, e as nascidas do pós-venda não têm produto mapeado
-- (o item da venda é texto livre). Torna product_id opcional para permitir criar a
-- OP sem produto legado. (Idempotente: se já for nullable, é no-op.)
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.production_orders
  ALTER COLUMN product_id DROP NOT NULL;
