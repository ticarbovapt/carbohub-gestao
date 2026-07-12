-- Novo status pra requisição: "convertida" (virou Ordem de Compra).
-- Ao gerar a OC, a RC passa de "aprovada" → "convertida", saindo da fila de
-- pendências e ficando rastreável (antes ela ficava "aprovada" pra sempre).
ALTER TYPE public.purchase_request_status ADD VALUE IF NOT EXISTS 'convertida';
