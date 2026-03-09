-- Criar view segura para pedidos que mascara dados sensíveis para não-admins
-- Esta view permite que managers vejam pedidos sem expor todos os dados do cliente

CREATE OR REPLACE VIEW public.carboze_orders_secure 
WITH (security_invoker=on) AS
SELECT 
  id,
  order_number,
  licensee_id,
  -- Dados do cliente mascarados para não-admins
  CASE 
    WHEN public.is_admin(auth.uid()) THEN customer_name
    ELSE CONCAT(LEFT(customer_name, 3), '***')
  END as customer_name,
  CASE 
    WHEN public.is_admin(auth.uid()) THEN customer_email
    ELSE CASE WHEN customer_email IS NOT NULL THEN '***@***' ELSE NULL END
  END as customer_email,
  CASE 
    WHEN public.is_admin(auth.uid()) THEN customer_phone
    ELSE CASE WHEN customer_phone IS NOT NULL THEN '(***)***-****' ELSE NULL END
  END as customer_phone,
  CASE 
    WHEN public.is_admin(auth.uid()) THEN delivery_address
    ELSE CASE WHEN delivery_address IS NOT NULL THEN '*** (endereço oculto)' ELSE NULL END
  END as delivery_address,
  -- Cidade e estado visíveis (menos sensível)
  delivery_city,
  delivery_state,
  CASE 
    WHEN public.is_admin(auth.uid()) THEN delivery_zip
    ELSE CASE WHEN delivery_zip IS NOT NULL THEN '*****-***' ELSE NULL END
  END as delivery_zip,
  -- Dados financeiros e de status (managers precisam ver)
  items,
  subtotal,
  shipping_cost,
  discount,
  total,
  status,
  notes,
  internal_notes,
  tracking_code,
  tracking_url,
  invoice_number,
  has_commission,
  commission_rate,
  commission_amount,
  commission_paid_at,
  created_at,
  updated_at,
  created_by,
  confirmed_at,
  invoiced_at,
  shipped_at,
  delivered_at,
  cancelled_at,
  cancellation_reason
FROM public.carboze_orders;

-- Adicionar comentário explicativo
COMMENT ON VIEW public.carboze_orders_secure IS 'View segura de pedidos que mascara dados sensíveis do cliente para usuários não-admin';

-- Melhorar a função can_access_profile adicionando verificação de autenticação
CREATE OR REPLACE FUNCTION public.can_access_profile(_viewer_id uuid, _profile_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    -- Verificar se o viewer está autenticado
    _viewer_id IS NOT NULL
    AND _profile_id IS NOT NULL
    AND (
      -- User can always see their own profile
      _viewer_id = _profile_id
      OR
      -- Admins can see all profiles
      EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _viewer_id AND role = 'admin')
      OR
      -- Managers can see profiles in their department or profiles they created
      (
        EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _viewer_id AND role = 'manager')
        AND (
          -- Same department (only if both have departments)
          EXISTS (
            SELECT 1 FROM public.profiles viewer, public.profiles target
            WHERE viewer.id = _viewer_id 
              AND target.id = _profile_id
              AND viewer.department = target.department
              AND viewer.department IS NOT NULL
              AND target.department IS NOT NULL
          )
          OR
          -- Created by this manager
          EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE id = _profile_id AND created_by_manager = _viewer_id
          )
        )
      )
      OR
      -- Operators can only see profiles in their own department
      (
        EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _viewer_id AND role = 'operator')
        AND EXISTS (
          SELECT 1 FROM public.profiles viewer, public.profiles target
          WHERE viewer.id = _viewer_id 
            AND target.id = _profile_id
            AND viewer.department = target.department
            AND viewer.department IS NOT NULL
            AND target.department IS NOT NULL
        )
      )
    )
$$;