-- =============================================================
-- Migration: Security Fixes
-- 1. Mask internal_notes in carboze_orders_secure (non-admins)
-- 2. Tighten carboze_orders SELECT policy
-- =============================================================

-- 1. Recreate the secure view with internal_notes masking
-- (Only admin/ceo/creator can see internal notes)
CREATE OR REPLACE VIEW carboze_orders_secure
WITH (security_invoker = true)
AS
SELECT
  id,
  order_number,
  licensee_id,
  -- PII masking
  CASE
    WHEN is_admin(auth.uid()) OR is_ceo(auth.uid())
    THEN customer_name
    ELSE regexp_replace(customer_name, '^(.{2}).*(.{2})$', '\1***\2')
  END AS customer_name,
  CASE
    WHEN is_admin(auth.uid()) OR is_ceo(auth.uid())
    THEN customer_email
    ELSE regexp_replace(customer_email, '^(.{2}).*(@.*)$', '\1***\2')
  END AS customer_email,
  CASE
    WHEN is_admin(auth.uid()) OR is_ceo(auth.uid())
    THEN customer_phone
    ELSE CASE WHEN customer_phone IS NOT NULL THEN '****-****' ELSE NULL END
  END AS customer_phone,
  CASE
    WHEN is_admin(auth.uid()) OR is_ceo(auth.uid())
    THEN delivery_address
    ELSE CASE WHEN delivery_address IS NOT NULL THEN '****' ELSE NULL END
  END AS delivery_address,
  delivery_city,
  delivery_state,
  CASE
    WHEN is_admin(auth.uid()) OR is_ceo(auth.uid())
    THEN delivery_zip
    ELSE CASE WHEN delivery_zip IS NOT NULL THEN '*****-***' ELSE NULL END
  END AS delivery_zip,
  -- Financial
  items,
  subtotal,
  shipping_cost,
  discount,
  total,
  -- Status
  status,
  confirmed_at,
  invoiced_at,
  invoice_number,
  shipped_at,
  tracking_code,
  tracking_url,
  delivered_at,
  cancelled_at,
  cancellation_reason,
  -- Commission (admins/ceo only)
  has_commission,
  CASE WHEN is_admin(auth.uid()) OR is_ceo(auth.uid()) THEN commission_rate ELSE NULL END AS commission_rate,
  CASE WHEN is_admin(auth.uid()) OR is_ceo(auth.uid()) THEN commission_amount ELSE NULL END AS commission_amount,
  CASE WHEN is_admin(auth.uid()) OR is_ceo(auth.uid()) THEN commission_paid_at ELSE NULL END AS commission_paid_at,
  -- Notes: public notes visible to all, internal notes only to admin/ceo/creator
  notes,
  CASE
    WHEN is_admin(auth.uid()) OR is_ceo(auth.uid()) OR created_by = auth.uid()
    THEN internal_notes
    ELSE NULL
  END AS internal_notes,
  -- RV fields
  vendedor_id,
  vendedor_name,
  rv_flow_type,
  linha,
  modalidade,
  created_op_id,
  created_os_id,
  sku_id,
  -- Recurrence
  order_type,
  is_recurring,
  recurrence_interval_days,
  next_delivery_date,
  parent_order_id,
  last_recurrence_order_id,
  -- Governance
  is_test,
  source_file,
  external_ref,
  -- Audit
  created_by,
  created_at,
  updated_at
FROM carboze_orders;

-- 2. Tighten carboze_orders SELECT RLS
-- Keep current broad policy for now (view handles masking)
-- but add a tighter policy for INSERT/UPDATE/DELETE
DROP POLICY IF EXISTS "Managers can manage orders" ON carboze_orders;

CREATE POLICY "Managers can insert orders" ON carboze_orders
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM carbo_user_roles
      WHERE user_id = auth.uid()
      AND role IN ('master_admin', 'ceo', 'gestor_adm', 'gestor_ops', 'vendedor', 'operador_logistica')
    )
  );

CREATE POLICY "Admins can update orders" ON carboze_orders
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM carbo_user_roles
      WHERE user_id = auth.uid()
      AND role IN ('master_admin', 'ceo', 'gestor_adm', 'gestor_ops')
    )
    OR created_by = auth.uid()
  );

CREATE POLICY "Admins can delete orders" ON carboze_orders
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM carbo_user_roles
      WHERE user_id = auth.uid()
      AND role IN ('master_admin', 'ceo')
    )
  );
