-- Campos de procurement pra requisição de compra:
--  • motivo        — motivo estruturado (setor: reposição/ruptura/...; individual: categoria)
--  • priority      — normal | alta | critica (urgência, principalmente compra de setor)
--  • needed_by     — data necessária (precisa até)
--  • reference_url — link de referência do produto (compra individual)
-- E a justificativa deixa de ser obrigatória (compra individual não precisa de
-- justificativa longa nem de impacto operacional).
ALTER TABLE public.purchase_requests
  ADD COLUMN IF NOT EXISTS motivo        TEXT,
  ADD COLUMN IF NOT EXISTS priority      TEXT,
  ADD COLUMN IF NOT EXISTS needed_by     DATE,
  ADD COLUMN IF NOT EXISTS reference_url TEXT;

ALTER TABLE public.purchase_requests ALTER COLUMN justification DROP NOT NULL;
