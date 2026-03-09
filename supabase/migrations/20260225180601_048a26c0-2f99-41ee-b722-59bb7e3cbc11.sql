
-- ============================================================
-- 1) Trigger: auto-update PDV stock when order is confirmed
-- ============================================================
CREATE OR REPLACE FUNCTION public.update_pdv_stock_on_order_confirm()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total_qty integer := 0;
  v_item jsonb;
BEGIN
  -- Only fire when status changes TO 'confirmed'
  IF NEW.status = 'confirmed' AND (OLD.status IS DISTINCT FROM 'confirmed') AND NEW.licensee_id IS NOT NULL THEN
    -- Sum quantities from items JSONB array
    FOR v_item IN SELECT jsonb_array_elements(NEW.items)
    LOOP
      v_total_qty := v_total_qty + COALESCE((v_item->>'quantity')::integer, 0);
    END LOOP;

    -- Update all PDVs assigned to this licensee
    IF v_total_qty > 0 THEN
      UPDATE pdvs
      SET
        current_stock = GREATEST(current_stock - v_total_qty, 0),
        has_stock_alert = CASE WHEN (current_stock - v_total_qty) <= min_stock_threshold THEN true ELSE false END,
        last_alert_at = CASE WHEN (current_stock - v_total_qty) <= min_stock_threshold THEN now() ELSE last_alert_at END,
        updated_at = now()
      WHERE assigned_licensee_id = NEW.licensee_id
        AND status = 'active';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_update_pdv_stock_on_order_confirm
  AFTER UPDATE ON public.carboze_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.update_pdv_stock_on_order_confirm();

-- ============================================================
-- 2) RLS: PDV users can view orders linked to their unit's licensee
-- ============================================================
CREATE POLICY "PDV users can view related orders"
  ON public.carboze_orders
  FOR SELECT
  USING (
    licensee_id IN (
      SELECT p.assigned_licensee_id
      FROM pdv_users pu
      JOIN pdvs p ON p.id = pu.pdv_id
      WHERE pu.user_id = auth.uid()
        AND p.assigned_licensee_id IS NOT NULL
    )
  );
