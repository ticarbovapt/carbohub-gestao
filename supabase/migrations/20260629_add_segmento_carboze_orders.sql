-- Segmentação de venda: consumo (B2B) vs revenda (Ponto de Venda/PDV).
-- NULL = não classificado (padrão; usuário define manualmente no modal de edição).

ALTER TABLE public.carboze_orders
  ADD COLUMN IF NOT EXISTS segmento TEXT
  CHECK (segmento IN ('consumo', 'revenda'));

COMMENT ON COLUMN public.carboze_orders.segmento IS
  'Segmentação da venda: consumo = B2B, revenda = Ponto de Venda (PDV). NULL = não classificado.';

CREATE INDEX IF NOT EXISTS idx_carboze_orders_segmento
  ON public.carboze_orders (segmento);

-- Expor a coluna na view mascarada usada pela página /orders (CREATE OR REPLACE
-- permite acrescentar colunas no fim sem alterar as existentes).
CREATE OR REPLACE VIEW public.carboze_orders_secure AS
 SELECT id,
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
            ELSE regexp_replace(customer_name, '^(.{2}).*(.{2})$'::text, '\1***\2'::text)
        END AS customer_name,
        CASE
            WHEN is_admin(auth.uid()) OR is_ceo(auth.uid()) THEN customer_email
            ELSE regexp_replace(customer_email, '^(.{2}).*(@.*)$'::text, '\1***\2'::text)
        END AS customer_email,
        CASE
            WHEN is_admin(auth.uid()) OR is_ceo(auth.uid()) THEN customer_phone
            ELSE
            CASE
                WHEN customer_phone IS NOT NULL THEN '****-****'::text
                ELSE NULL::text
            END
        END AS customer_phone,
        CASE
            WHEN is_admin(auth.uid()) OR is_ceo(auth.uid()) THEN delivery_address
            ELSE
            CASE
                WHEN delivery_address IS NOT NULL THEN '****'::text
                ELSE NULL::text
            END
        END AS delivery_address,
    delivery_city,
    delivery_state,
        CASE
            WHEN is_admin(auth.uid()) OR is_ceo(auth.uid()) THEN delivery_zip
            ELSE
            CASE
                WHEN delivery_zip IS NOT NULL THEN '*****-***'::text
                ELSE NULL::text
            END
        END AS delivery_zip,
    segmento
   FROM carboze_orders;
