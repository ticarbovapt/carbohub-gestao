-- ─────────────────────────────────────────────────────────────────────────────
-- Carbo Ops — RLS de escrita de estoque.
--
-- POR ORA: o Ops está ABERTO a qualquer usuário autenticado (a UI já mostra
-- todos os botões pra todo mundo). As tabelas warehouse_stock/stock_movements
-- têm RLS ligada e a única policy de escrita existente era a do controle
-- (is_admin/is_ceo/is_gestor) — por isso a edição era barrada. Aqui adicionamos
-- uma policy de escrita ABERTA (authenticated), ADITIVA (não remove as legadas;
-- o controle segue vivo).
--
-- QUANDO for restringir telas/botões a gestor: basta trocar o USING/WITH CHECK
-- destas policies para public.carbo_is_gestor(auth.uid()). A função já fica
-- criada abaixo, espelhando o Admin (carbo_functions), pronta pra uso.
-- ─────────────────────────────────────────────────────────────────────────────

-- Helper pronto pra quando formos restringir a gestor (espelha apps/admin
-- /src/lib/access.ts: command/ti_suporte/head/ceo OU access_level='gestor' em
-- carbo_functions no papel primário/secundário). NÃO usado nas policies ainda.
CREATE OR REPLACE FUNCTION public.carbo_is_gestor(_uid uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    public.is_carbo_command(_uid)
    OR EXISTS (
      SELECT 1
      FROM public.profiles p
      JOIN public.carbo_functions f
        ON f.is_active
       AND f.access_level = 'gestor'
       AND (
            (f.department = p.department::text           AND f.function_key = p.funcao::text)
         OR (f.department = p.secondary_department::text AND f.function_key = p.secondary_funcao::text)
       )
      WHERE p.id = _uid
    );
$$;

-- warehouse_stock: escrita aberta a autenticados (por ora).
DROP POLICY IF EXISTS warehouse_stock_ops_gestor_write ON public.warehouse_stock;
DROP POLICY IF EXISTS warehouse_stock_ops_write ON public.warehouse_stock;
CREATE POLICY warehouse_stock_ops_write ON public.warehouse_stock
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

-- stock_movements: registrar/ler movimentos, aberto a autenticados (por ora).
DROP POLICY IF EXISTS stock_movements_ops_gestor_insert ON public.stock_movements;
DROP POLICY IF EXISTS stock_movements_ops_insert ON public.stock_movements;
CREATE POLICY stock_movements_ops_insert ON public.stock_movements
  FOR INSERT TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS stock_movements_ops_gestor_select ON public.stock_movements;
DROP POLICY IF EXISTS stock_movements_ops_select ON public.stock_movements;
CREATE POLICY stock_movements_ops_select ON public.stock_movements
  FOR SELECT TO authenticated
  USING (true);
