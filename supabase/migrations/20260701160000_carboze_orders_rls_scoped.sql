-- ─────────────────────────────────────────────────────────────────────────────
-- SEGURANÇA (RLS) da carboze_orders — proteção REAL no banco.
--
-- Hoje o SELECT é `USING (true)`: qualquer funcionário lê TODOS os pedidos.
-- O "colaborador vê só o dele" existe só no front (UX, não segurança).
--
-- Nova regra (fonte da verdade = flag do Admin, via carbo_is_gestor):
--   • Gestor (command/TI ou access_level='gestor') → vê TUDO.
--   • Quem tem interface de gestão de pedidos (Controle/Finanças/Ops) → vê TUDO.
--   • Colaborador de vendas → vê só as vendas onde é o vendedor.
--
-- ⚠️ ANTES DE RODAR: confirmar que os PORTAIS (licenciado/PDV) NÃO leem
--    carboze_orders cru (se lerem, precisam entrar no can_view_all_orders ou
--    ter cláusula própria por licensee_id). Rodar sem isso pode cegar os portais.
--
-- ROLLBACK: recriar a policy permissiva:
--   DROP POLICY "carboze_orders_select_scoped" ON public.carboze_orders;
--   CREATE POLICY "carboze_orders_select_authenticated" ON public.carboze_orders
--     FOR SELECT TO authenticated USING (true);
-- ─────────────────────────────────────────────────────────────────────────────

-- Quem enxerga TODOS os pedidos.
CREATE OR REPLACE FUNCTION public.can_view_all_orders(_uid uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    public.carbo_is_gestor(_uid)                       -- gestor (flag do Admin)
    OR EXISTS (                                        -- ou interface de gestão de pedidos
      SELECT 1 FROM public.profiles p
      WHERE p.id = _uid
        AND p.allowed_interfaces && ARRAY['carbo_ops','carbo_financas','carbo_ops_app']::text[]
    );
$$;

GRANT EXECUTE ON FUNCTION public.can_view_all_orders(uuid) TO authenticated;

-- SELECT escopado.
DROP POLICY IF EXISTS "carboze_orders_select_authenticated" ON public.carboze_orders;
DROP POLICY IF EXISTS "carboze_orders_select_scoped"        ON public.carboze_orders;
CREATE POLICY "carboze_orders_select_scoped"
  ON public.carboze_orders FOR SELECT TO authenticated
  USING (
    public.can_view_all_orders(auth.uid())
    OR vendedor_id = auth.uid()
  );

-- Atribuir vendedor / editar pedido: só quem "vê tudo" (gestão) ou o próprio
-- vendedor da venda. (INSERT continua liberado p/ funcionário; Bling/NF usam
-- service_role e não passam por RLS.)
DROP POLICY IF EXISTS "Employees can update orders" ON public.carboze_orders;
DROP POLICY IF EXISTS "carboze_orders_update_scoped" ON public.carboze_orders;
CREATE POLICY "carboze_orders_update_scoped"
  ON public.carboze_orders FOR UPDATE TO authenticated
  USING (
    public.can_view_all_orders(auth.uid())
    OR vendedor_id = auth.uid()
  );
