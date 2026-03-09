-- Add order type and recurrence fields to carboze_orders
ALTER TABLE public.carboze_orders
ADD COLUMN IF NOT EXISTS order_type text NOT NULL DEFAULT 'spot' CHECK (order_type IN ('spot', 'recorrente')),
ADD COLUMN IF NOT EXISTS is_recurring boolean NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS recurrence_interval_days integer DEFAULT NULL,
ADD COLUMN IF NOT EXISTS next_delivery_date date DEFAULT NULL,
ADD COLUMN IF NOT EXISTS last_recurrence_order_id uuid DEFAULT NULL,
ADD COLUMN IF NOT EXISTS parent_order_id uuid DEFAULT NULL;

-- Add index for recurring orders
CREATE INDEX IF NOT EXISTS idx_carboze_orders_recurring ON public.carboze_orders (is_recurring, next_delivery_date) WHERE is_recurring = true;

-- Add index for order type
CREATE INDEX IF NOT EXISTS idx_carboze_orders_order_type ON public.carboze_orders (order_type);

-- Add foreign key for parent order (self-referencing for recurrence chain)
ALTER TABLE public.carboze_orders
ADD CONSTRAINT fk_carboze_orders_parent_order
FOREIGN KEY (parent_order_id) REFERENCES public.carboze_orders(id) ON DELETE SET NULL;

-- Comment for documentation
COMMENT ON COLUMN public.carboze_orders.order_type IS 'Type of order: spot (one-time) or recorrente (recurring)';
COMMENT ON COLUMN public.carboze_orders.is_recurring IS 'Whether this order has active recurrence';
COMMENT ON COLUMN public.carboze_orders.recurrence_interval_days IS 'Days between recurring deliveries';
COMMENT ON COLUMN public.carboze_orders.next_delivery_date IS 'Scheduled date for next recurring order';
COMMENT ON COLUMN public.carboze_orders.parent_order_id IS 'Reference to original order for recurrence chain';