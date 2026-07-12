-- Campos da "Registrar compra" na OC: forma de pagamento usada, quando foi
-- comprada e se já foi paga. payment_method_id referencia o cadastro de cartões;
-- payment_type guarda um snapshot do tipo (credito/pix/boleto/manual) pra casos
-- sem cartão vinculado.
ALTER TABLE public.purchase_orders
  ADD COLUMN IF NOT EXISTS payment_method_id uuid REFERENCES public.payment_methods(id),
  ADD COLUMN IF NOT EXISTS payment_type text,
  ADD COLUMN IF NOT EXISTS purchased_at timestamptz,
  ADD COLUMN IF NOT EXISTS is_paid boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS paid_at timestamptz;
