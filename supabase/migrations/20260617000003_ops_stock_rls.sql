-- ─────────────────────────────────────────────────────────────────────────────
-- Carbo Ops — limpeza das travas do CONTROLE nas tabelas de estoque + RLS nova.
--
-- Por que: o estoque (warehouse_stock / stock_movements) estava preso à lógica
-- legada do controle — primeiro is_admin/is_ceo/is_gestor, depois trocada pela
-- Role Matrix (public.is_employee). É essa amarra que a gente está tirando.
--
-- O que fazemos:
--   1) REMOVEMOS todas as policies legadas dessas tabelas (is_gestor+/admin e as
--      is_employee da Role Matrix).
--   2) Criamos policies NOVAS e LIMPAS. POR ORA abertas a qualquer autenticado
--      (a UI do Ops já mostra tudo pra todo mundo). O controle, sendo gente
--      logada, continua lendo/gravando normalmente.
--
-- Quando você definir telas/botões só de gestor: trocar USING/WITH CHECK destas
-- policies para public.carbo_is_gestor(auth.uid()). A função já fica criada
-- abaixo (modelo novo, espelha o Admin/carbo_functions) — DORMENTE por enquanto.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Helper do modelo NOVO (dormente; não usado nas policies ainda) ───────────
-- Espelha apps/admin/src/lib/access.ts: gestor = command/ti_suporte/head/ceo OU
-- access_level='gestor' em carbo_functions (papel primário/secundário).
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

-- ── warehouse_stock: tira o legado, deixa só a policy nova (aberta por ora) ──
DROP POLICY IF EXISTS "Stock viewable by authenticated" ON public.warehouse_stock;
DROP POLICY IF EXISTS "Stock manageable by gestor+"     ON public.warehouse_stock;
DROP POLICY IF EXISTS "Stock manageable by employee"    ON public.warehouse_stock;
DROP POLICY IF EXISTS warehouse_stock_ops_gestor_write  ON public.warehouse_stock;
DROP POLICY IF EXISTS warehouse_stock_ops_write         ON public.warehouse_stock;

CREATE POLICY warehouse_stock_ops_write ON public.warehouse_stock
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

-- ── stock_movements: idem ────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Stock movements viewable by authorized" ON public.stock_movements;
DROP POLICY IF EXISTS "Stock movements insertable by gestors"  ON public.stock_movements;
DROP POLICY IF EXISTS "Employees can view stock_movements"     ON public.stock_movements;
DROP POLICY IF EXISTS "Employees can insert stock_movements"   ON public.stock_movements;
DROP POLICY IF EXISTS stock_movements_ops_gestor_insert        ON public.stock_movements;
DROP POLICY IF EXISTS stock_movements_ops_gestor_select        ON public.stock_movements;
DROP POLICY IF EXISTS stock_movements_ops_insert               ON public.stock_movements;
DROP POLICY IF EXISTS stock_movements_ops_select               ON public.stock_movements;

CREATE POLICY stock_movements_ops_insert ON public.stock_movements
  FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY stock_movements_ops_select ON public.stock_movements
  FOR SELECT TO authenticated
  USING (true);
