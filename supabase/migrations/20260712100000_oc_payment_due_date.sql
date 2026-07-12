-- Previsão de vencimento quando a compra é registrada como "A pagar" (sem
-- pagamento na hora). Usada pra pré-preencher o vencimento da conta a pagar
-- na etapa de lançar a NF, em vez de cair em "hoje".
ALTER TABLE public.purchase_orders
  ADD COLUMN IF NOT EXISTS payment_due_date date;
