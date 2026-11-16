-- Expor vendedor/linha/sku/sale_date na view usada por /orders (campos internos, sem PII de cliente).
-- Sem isso, as colunas Vendedor e Produto ficam sempre em "—" e a edição (inclusive em massa) não "aparece".
CREATE OR REPLACE VIEW public.carboze_orders_secure AS
 SELECT id, order_number, licensee_id, status, items, subtotal, discount, shipping_cost, total,
    has_commission, commission_rate, commission_amount, commission_paid_at, notes, internal_notes,
    invoice_number, invoiced_at, confirmed_at, shipped_at, delivered_at, cancelled_at, cancellation_reason,
    tracking_code, tracking_url, created_at, updated_at, created_by, order_type, is_recurring,
    recurrence_interval_days, next_delivery_date, parent_order_id, last_recurrence_order_id,
        CASE WHEN is_admin(auth.uid()) OR is_ceo(auth.uid()) THEN customer_name
             ELSE regexp_replace(customer_name, '^(.{2}).*(.{2})$'::text, '\1***\2'::text) END AS customer_name,
        CASE WHEN is_admin(auth.uid()) OR is_ceo(auth.uid()) THEN customer_email
             ELSE regexp_replace(customer_email, '^(.{2}).*(@.*)$'::text, '\1***\2'::text) END AS customer_email,
        CASE WHEN is_admin(auth.uid()) OR is_ceo(auth.uid()) THEN customer_phone
             ELSE CASE WHEN customer_phone IS NOT NULL THEN '****-****'::text ELSE NULL::text END END AS customer_phone,
        CASE WHEN is_admin(auth.uid()) OR is_ceo(auth.uid()) THEN delivery_address
             ELSE CASE WHEN delivery_address IS NOT NULL THEN '****'::text ELSE NULL::text END END AS delivery_address,
    delivery_city, delivery_state,
        CASE WHEN is_admin(auth.uid()) OR is_ceo(auth.uid()) THEN delivery_zip
             ELSE CASE WHEN delivery_zip IS NOT NULL THEN '*****-***'::text ELSE NULL::text END END AS delivery_zip,
    segmento, excluir_metricas, vendedor_id, vendedor_name, linha, sku_id, sale_date
   FROM carboze_orders;
