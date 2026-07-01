-- ─────────────────────────────────────────────────────────────────────────────
-- Fonte única de verdade da venda = carboze_orders.
-- A tela /vender (Carbo Sales) passa a gravar o PEDIDO aqui (em vez da ilha
-- isolada crm_vendas). Estas colunas cobrem os campos do /vender que a tabela
-- ainda não tinha. Todas NULLABLE — nenhum backfill necessário.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.carboze_orders
  add column if not exists customer_ie      text,   -- Inscrição Estadual do cliente
  add column if not exists billing_address  jsonb,  -- Endereço de FATURAMENTO (NF); NULL = mesmo da entrega
  add column if not exists payment_terms    text,   -- Condição de pagamento (à vista, 30d, etc.)
  add column if not exists freight_type     text;   -- Tipo de frete (CIF/FOB/…)
