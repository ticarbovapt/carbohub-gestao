-- ─────────────────────────────────────────────────────────────────────────────
-- SEGURANÇA (RLS) da carboze_orders — proteção REAL no banco.
--
-- Antes: SELECT `USING (true)` → qualquer autenticado lia TODOS os pedidos
-- (o "colaborador vê só o dele" existia só no front = UX, não segurança).
--
-- Regra nova (fonte da verdade = flag do Admin, via carbo_is_gestor):
--   • Gestor (command/TI ou access_level='gestor') .......... vê TUDO
--   • Interno com interface de gestão/portal ................ vê TUDO
--       (carbo_ops, carbo_financas, carbo_ops_app, portal_licenciado, portal_pdv)
--   • Colaborador de vendas ................................. vê só as PRÓPRIAS
--       (vendedor_id = auth.uid())
--   • Licenciado EXTERNO (tenant SaaS) ..................... vê só do PRÓPRIO
--       licensee_id (get_user_licensee_id) — isolação de tenant preservada.
--   • PDV usa tabelas próprias (não lê carboze_orders) → não afetado.
--
-- ROLLBACK:
--   DROP POLICY "carboze_orders_select_scoped" ON public.carboze_orders;
--   DROP POLICY "carboze_orders_update_scoped" ON public.carboze_orders;
--   CREATE POLICY "carboze_orders_select_authenticated" ON public.carboze_orders
--     FOR SELECT TO authenticated USING (true);
--   CREATE POLICY "Employees can update orders" ON public.carboze_orders
--     FOR UPDATE USING (public.is_employee(auth.uid()));
-- ─────────────────────────────────────────────────────────────────────────────

-- Quem enxerga TODOS os pedidos (gestor pela flag do Admin OU interno de gestão/portal).
CREATE OR REPLACE FUNCTION public.can_view_all_orders(_uid uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    public.carbo_is_gestor(_uid)
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = _uid
        AND p.allowed_interfaces && ARRAY[
          'carbo_ops','carbo_financas','carbo_ops_app','portal_licenciado','portal_pdv'
        ]::text[]
    );
$$;

GRANT EXECUTE ON FUNCTION public.can_view_all_orders(uuid) TO authenticated;

-- SELECT escopado (gestão vê tudo · vendedor vê o próprio · licenciado vê o do tenant).
DROP POLICY IF EXISTS "carboze_orders_select_authenticated" ON public.carboze_orders;
DROP POLICY IF EXISTS "carboze_orders_select_scoped"        ON public.carboze_orders;
CREATE POLICY "carboze_orders_select_scoped"
  ON public.carboze_orders FOR SELECT TO authenticated
  USING (
    public.can_view_all_orders(auth.uid())
    OR vendedor_id = auth.uid()
    OR licensee_id = public.get_user_licensee_id(auth.uid())
  );

-- UPDATE (atribuir vendedor / editar): gestão OU o próprio vendedor da venda.
-- (INSERT segue liberado p/ funcionário; Bling/NF usam service_role, fora do RLS.)
DROP POLICY IF EXISTS "Employees can update orders" ON public.carboze_orders;
DROP POLICY IF EXISTS "carboze_orders_update_scoped" ON public.carboze_orders;
CREATE POLICY "carboze_orders_update_scoped"
  ON public.carboze_orders FOR UPDATE TO authenticated
  USING (
    public.can_view_all_orders(auth.uid())
    OR vendedor_id = auth.uid()
  );
