-- Campos de Pedido de Compra (PO) padrão SAP
-- Compatível com OutBuyCenter / Brisanet
-- Migration: 20260511_carboze_orders_po_fields

ALTER TABLE carboze_orders
  -- Dados do PO do cliente
  ADD COLUMN IF NOT EXISTS po_number            TEXT,          -- ex: 4500787362
  ADD COLUMN IF NOT EXISTS po_date              DATE,          -- ex: 2026-05-06

  -- Faturamento (FATURAR PARA) — separado do endereço de entrega
  ADD COLUMN IF NOT EXISTS ie                   TEXT,          -- Inscrição Estadual
  ADD COLUMN IF NOT EXISTS billing_address      TEXT,
  ADD COLUMN IF NOT EXISTS billing_city         TEXT,
  ADD COLUMN IF NOT EXISTS billing_state        CHAR(2),
  ADD COLUMN IF NOT EXISTS billing_zip          TEXT,
  ADD COLUMN IF NOT EXISTS billing_contact_name  TEXT,         -- Responsável pelo comprador
  ADD COLUMN IF NOT EXISTS billing_contact_email TEXT,

  -- Logística / Fiscal
  ADD COLUMN IF NOT EXISTS payment_terms        TEXT,          -- "30/60/90/120/150 DIAS - BOLETO"
  ADD COLUMN IF NOT EXISTS freight_type         TEXT CHECK (freight_type IN ('CIF','FOB') OR freight_type IS NULL),

  -- Observações separadas
  ADD COLUMN IF NOT EXISTS buyer_notes          TEXT,          -- OBSERVAÇÕES DO COMPRADOR
  ADD COLUMN IF NOT EXISTS general_notes        TEXT;          -- OBSERVAÇÕES GERAIS (horários, prazo NF etc.)

COMMENT ON COLUMN carboze_orders.po_number            IS 'Número do pedido de compra no sistema do cliente (ex: SAP PO 4500787362)';
COMMENT ON COLUMN carboze_orders.po_date              IS 'Data de emissão do PO pelo cliente';
COMMENT ON COLUMN carboze_orders.ie                   IS 'Inscrição Estadual do cliente (FATURAR PARA)';
COMMENT ON COLUMN carboze_orders.billing_address      IS 'Endereço de faturamento (pode diferir do endereço de entrega)';
COMMENT ON COLUMN carboze_orders.billing_contact_name IS 'Nome do responsável pelo PO no cliente';
COMMENT ON COLUMN carboze_orders.payment_terms        IS 'Condição de pagamento, ex: 30/60/90 DIAS - BOLETO';
COMMENT ON COLUMN carboze_orders.freight_type         IS 'CIF = frete por conta do vendedor; FOB = frete por conta do comprador';
COMMENT ON COLUMN carboze_orders.buyer_notes          IS 'Observações do comprador incluídas no PO';
COMMENT ON COLUMN carboze_orders.general_notes        IS 'Observações gerais (horários de recebimento, prazo emissão NF, etc.)';
