-- Escopo da requisição de compra: do SETOR (insumo/operação) vs INDIVIDUAL (uso
-- pessoal / material de trabalho). No Ops dá pra pedir os dois (insumo = setor);
-- no Sales é sempre individual (ninguém pede insumo lá). Ajuda o financeiro a
-- separar compra operacional de compra pessoal.
ALTER TABLE public.purchase_requests
  ADD COLUMN IF NOT EXISTS escopo TEXT NOT NULL DEFAULT 'individual';

DO $$ BEGIN
  ALTER TABLE public.purchase_requests
    ADD CONSTRAINT purchase_requests_escopo_chk CHECK (escopo IN ('setor', 'individual'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
