-- =====================================================
-- SECURITY IMPROVEMENTS FOR CARBO OPS 2.0
-- =====================================================

-- 1. Restrict carboze_orders access to managers only (contains customer PII)
DROP POLICY IF EXISTS "Authenticated users can view orders" ON public.carboze_orders;
CREATE POLICY "Managers can view orders" 
ON public.carboze_orders 
FOR SELECT 
USING (
  auth.uid() IS NOT NULL 
  AND is_manager_or_admin(auth.uid())
);

-- 2. Restrict licensees access to managers only (contains business sensitive info)
DROP POLICY IF EXISTS "Authenticated users can view licensees" ON public.licensees;
CREATE POLICY "Managers can view licensees" 
ON public.licensees 
FOR SELECT 
USING (
  auth.uid() IS NOT NULL 
  AND is_manager_or_admin(auth.uid())
);

-- 3. Restrict machines access to managers only (contains location and revenue data)
DROP POLICY IF EXISTS "Authenticated users can view machines" ON public.machines;
CREATE POLICY "Managers can view machines" 
ON public.machines 
FOR SELECT 
USING (
  auth.uid() IS NOT NULL 
  AND is_manager_or_admin(auth.uid())
);

-- 4. Restrict machine_consumption_history to managers
DROP POLICY IF EXISTS "Authenticated users can view consumption" ON public.machine_consumption_history;
CREATE POLICY "Managers can view consumption history" 
ON public.machine_consumption_history 
FOR SELECT 
USING (
  auth.uid() IS NOT NULL 
  AND is_manager_or_admin(auth.uid())
);

-- 5. Restrict order_status_history to managers
DROP POLICY IF EXISTS "Authenticated users can view order history" ON public.order_status_history;
CREATE POLICY "Managers can view order history" 
ON public.order_status_history 
FOR SELECT 
USING (
  auth.uid() IS NOT NULL 
  AND is_manager_or_admin(auth.uid())
);

-- 6. Improve service_orders SELECT policy - restrict to department members or assigned users
DROP POLICY IF EXISTS "OS viewable by authenticated" ON public.service_orders;
CREATE POLICY "OS viewable by authorized users" 
ON public.service_orders 
FOR SELECT 
USING (
  auth.uid() IS NOT NULL
  AND (
    -- Managers/Admins can see all
    is_manager_or_admin(auth.uid())
    -- Users can see their own created or assigned orders
    OR created_by = auth.uid()
    OR assigned_to = auth.uid()
    -- Users in the same department can see orders in their department
    OR EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE profiles.id = auth.uid() 
      AND profiles.department = service_orders.current_department
    )
  )
);

-- 7. Improve os_messages SELECT policy
DROP POLICY IF EXISTS "Messages viewable by authenticated" ON public.os_messages;
CREATE POLICY "Messages viewable by authorized users" 
ON public.os_messages 
FOR SELECT 
USING (
  auth.uid() IS NOT NULL
  AND (
    is_manager_or_admin(auth.uid())
    OR user_id = auth.uid()
    OR auth.uid() = ANY(mentions)
    OR EXISTS (
      SELECT 1 FROM public.service_orders so
      WHERE so.id = os_messages.service_order_id
      AND (
        so.created_by = auth.uid()
        OR so.assigned_to = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.profiles 
          WHERE profiles.id = auth.uid() 
          AND profiles.department = so.current_department
        )
      )
    )
  )
);

-- 8. Improve os_actions SELECT policy
DROP POLICY IF EXISTS "Actions viewable by authenticated" ON public.os_actions;
CREATE POLICY "Actions viewable by authorized users" 
ON public.os_actions 
FOR SELECT 
USING (
  auth.uid() IS NOT NULL
  AND (
    is_manager_or_admin(auth.uid())
    OR assigned_to = auth.uid()
    OR assigned_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.service_orders so
      WHERE so.id = os_actions.service_order_id
      AND (
        so.created_by = auth.uid()
        OR so.assigned_to = auth.uid()
      )
    )
  )
);

-- 9. Improve os_stage_history SELECT policy
DROP POLICY IF EXISTS "Stage history viewable by authenticated" ON public.os_stage_history;
CREATE POLICY "Stage history viewable by authorized users" 
ON public.os_stage_history 
FOR SELECT 
USING (
  auth.uid() IS NOT NULL
  AND (
    is_manager_or_admin(auth.uid())
    OR completed_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE profiles.id = auth.uid() 
      AND profiles.department = os_stage_history.department
    )
    OR EXISTS (
      SELECT 1 FROM public.service_orders so
      WHERE so.id = os_stage_history.service_order_id
      AND (so.created_by = auth.uid() OR so.assigned_to = auth.uid())
    )
  )
);

-- 10. Improve os_checklists SELECT policy
DROP POLICY IF EXISTS "Checklists viewable by authenticated" ON public.os_checklists;
CREATE POLICY "Checklists viewable by authorized users" 
ON public.os_checklists 
FOR SELECT 
USING (
  auth.uid() IS NOT NULL
  AND (
    is_manager_or_admin(auth.uid())
    OR completed_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE profiles.id = auth.uid() 
      AND profiles.department = os_checklists.department
    )
  )
);

-- 11. Improve scheduled_events SELECT policy
DROP POLICY IF EXISTS "Events viewable by authenticated users" ON public.scheduled_events;
CREATE POLICY "Events viewable by authorized users" 
ON public.scheduled_events 
FOR SELECT 
USING (
  auth.uid() IS NOT NULL
  AND (
    is_manager_or_admin(auth.uid())
    OR created_by = auth.uid()
    OR assigned_to = auth.uid()
  )
);