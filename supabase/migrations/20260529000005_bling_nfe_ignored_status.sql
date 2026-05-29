-- Adiciona o estado "ignored" (arquivada) ao match_status das NFs.
-- Permite dar baixa explícita em NFs que não precisam de vínculo, tirando-as
-- das visões de atenção.

ALTER TABLE public.bling_nfe DROP CONSTRAINT IF EXISTS bling_nfe_match_status_check;

ALTER TABLE public.bling_nfe
  ADD CONSTRAINT bling_nfe_match_status_check
  CHECK (match_status IN ('pending', 'matched', 'no_code', 'invalid_code', 'manual', 'ignored'));

COMMENT ON COLUMN public.bling_nfe.match_status IS 'Status do vínculo: pending=sem detalhe; matched=vinculada; no_code=sem pedido vinculável; invalid_code=código não encontrado; manual=vínculo manual; ignored=arquivada (sem ação necessária).';
