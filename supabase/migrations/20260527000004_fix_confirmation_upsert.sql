-- Fix production_orders stuck in 'aguardando_qualidade' that already have a
-- production_confirmation row (partial-failure state).
-- These OPs had their confirmation inserted but the OP status update failed.
-- Align their status to 'confirmada' so the QA step can complete cleanly.
UPDATE production_orders po
SET op_status = 'confirmada',
    updated_at = NOW()
WHERE po.op_status = 'aguardando_qualidade'
  AND EXISTS (
    SELECT 1 FROM production_confirmation pc
    WHERE pc.production_order_id = po.id
  );
