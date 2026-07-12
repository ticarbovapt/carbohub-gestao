-- Cotações (RFQ) POR ITEM da requisição: cada item pode ter N cotações de
-- fornecedores diferentes; o comprador marca a vencedora (selected) por item.
-- Pode ser preenchida tanto na requisição (Ops/Sales) quanto no Finanças.
CREATE TABLE IF NOT EXISTS public.purchase_quotes (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id     UUID NOT NULL REFERENCES public.purchase_requests(id) ON DELETE CASCADE,
  item_index     INTEGER NOT NULL,          -- índice do item no JSON items da requisição
  item_descricao TEXT,                       -- snapshot da descrição do item
  supplier_name  TEXT NOT NULL,
  unit_price     NUMERIC(14,2) NOT NULL DEFAULT 0,
  quantidade     NUMERIC(14,3) NOT NULL DEFAULT 1,
  notes          TEXT,
  link           TEXT,
  selected       BOOLEAN NOT NULL DEFAULT false,   -- cotação escolhida para este item
  created_by     UUID,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_purchase_quotes_request ON public.purchase_quotes(request_id);

-- RLS aberto a autenticado (igual purchase_requests: ops/sales/financas veem tudo).
ALTER TABLE public.purchase_quotes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS purchase_quotes_all ON public.purchase_quotes;
CREATE POLICY purchase_quotes_all ON public.purchase_quotes
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
