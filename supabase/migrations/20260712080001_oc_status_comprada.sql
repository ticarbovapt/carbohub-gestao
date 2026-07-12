-- Novo status da OC: 'comprada' (a compra foi efetivada, com forma de pagamento
-- registrada) — entra entre 'gerada' e 'recebida'.
-- ATENÇÃO: ALTER TYPE ... ADD VALUE não roda dentro de bloco de transação.
-- No SQL Editor do Supabase, rode ESTA migração SOZINHA (antes da 080002).
ALTER TYPE public.purchase_order_status ADD VALUE IF NOT EXISTS 'comprada';
