-- T1/T2: Distinguir transferências operacionais (CDSPRegistrarEnvio, que já
-- debitam from_hub ao criar) de transferências de planejamento (criadas como
-- "suggested" pelo engine MRP, que debitam from_hub só ao executar).
-- Sem essa coluna, PendingSuggestions debitava from_hub de novo em transferências
-- já criadas com saldo debitado, gerando estoque negativo.

ALTER TABLE public.stock_transfers
  ADD COLUMN IF NOT EXISTS pre_debited boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.stock_transfers.pre_debited IS
  'true quando from_hub já foi debitado na criação (CDSPRegistrarEnvio). '
  'PendingSuggestions pula o débito nesses casos e só credita to_hub.';
