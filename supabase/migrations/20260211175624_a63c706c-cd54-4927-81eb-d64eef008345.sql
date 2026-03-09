
-- Drop and recreate the secure view with recurrence fields
DROP VIEW IF EXISTS public.carboze_orders_secure;

CREATE VIEW public.carboze_orders_secure AS
SELECT 
    id,
    order_number,
    licensee_id,
    status,
    items,
    subtotal,
    discount,
    shipping_cost,
    total,
    has_commission,
    commission_rate,
    commission_amount,
    commission_paid_at,
    notes,
    internal_notes,
    invoice_number,
    invoiced_at,
    confirmed_at,
    shipped_at,
    delivered_at,
    cancelled_at,
    cancellation_reason,
    tracking_code,
    tracking_url,
    created_at,
    updated_at,
    created_by,
    order_type,
    is_recurring,
    recurrence_interval_days,
    next_delivery_date,
    parent_order_id,
    last_recurrence_order_id,
    CASE
        WHEN is_admin(auth.uid()) OR is_ceo(auth.uid()) THEN customer_name
        ELSE regexp_replace(customer_name, '^(.{2}).*(.{2})$', '\1***\2')
    END AS customer_name,
    CASE
        WHEN is_admin(auth.uid()) OR is_ceo(auth.uid()) THEN customer_email
        ELSE regexp_replace(customer_email, '^(.{2}).*(@.*)$', '\1***\2')
    END AS customer_email,
    CASE
        WHEN is_admin(auth.uid()) OR is_ceo(auth.uid()) THEN customer_phone
        ELSE CASE WHEN customer_phone IS NOT NULL THEN '****-****' ELSE NULL END
    END AS customer_phone,
    CASE
        WHEN is_admin(auth.uid()) OR is_ceo(auth.uid()) THEN delivery_address
        ELSE CASE WHEN delivery_address IS NOT NULL THEN '****' ELSE NULL END
    END AS delivery_address,
    delivery_city,
    delivery_state,
    CASE
        WHEN is_admin(auth.uid()) OR is_ceo(auth.uid()) THEN delivery_zip
        ELSE CASE WHEN delivery_zip IS NOT NULL THEN '*****-***' ELSE NULL END
    END AS delivery_zip
FROM carboze_orders;
