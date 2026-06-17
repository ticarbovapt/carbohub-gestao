-- ─────────────────────────────────────────────────────────────────────────────
-- Carbo Ops — RLS de escrita de estoque pelo MODELO NOVO (gestor/membro),
-- controlado pelo Admin (carbo_functions). SEM is_admin / is_ceo / Role Matrix
-- do controle.
--
-- Fonte da verdade do nível = app Admin:
--   • carbo_functions.access_level ('gestor' | 'colaborador') por
--     department:function_key (o Admin edita isso).
--   • bootstrap command/ti_suporte/head/ceo via public.is_carbo_command().
--
-- Espelha apps/admin/src/lib/access.ts: é GESTOR quem é command/ti_suporte/
-- head/ceo OU cujo papel (primário OU secundário) tem access_level='gestor'.
--
-- ADITIVO e seguro: NÃO removemos as policies antigas (o controle continua vivo
-- usando is_admin/is_ceo/is_gestor). Quando o controle for desativado, derrubar
-- as policies legadas de warehouse_stock/stock_movements.
--
-- Modelo: GESTOR edita (Nova Entrada / Ajuste); MEMBRO só lê (SELECT já é aberto).
-- ─────────────────────────────────────────────────────────────────────────────

-- "É gestor no novo ecossistema?" — espelha o Admin (carbo_functions) + bootstrap.
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
            (f.department = p.department           AND f.function_key = p.funcao)
         OR (f.department = p.secondary_department AND f.function_key = p.secondary_funcao)
       )
      WHERE p.id = _uid
    );
$$;

-- warehouse_stock: gestor (modelo novo) insere/atualiza/apaga saldo; membro só lê.
DROP POLICY IF EXISTS warehouse_stock_ops_gestor_write ON public.warehouse_stock;
CREATE POLICY warehouse_stock_ops_gestor_write ON public.warehouse_stock
  FOR ALL TO authenticated
  USING (public.carbo_is_gestor(auth.uid()))
  WITH CHECK (public.carbo_is_gestor(auth.uid()));

-- stock_movements: gestor (modelo novo) registra e lê movimentos (auditoria).
DROP POLICY IF EXISTS stock_movements_ops_gestor_insert ON public.stock_movements;
CREATE POLICY stock_movements_ops_gestor_insert ON public.stock_movements
  FOR INSERT TO authenticated
  WITH CHECK (public.carbo_is_gestor(auth.uid()));

DROP POLICY IF EXISTS stock_movements_ops_gestor_select ON public.stock_movements;
CREATE POLICY stock_movements_ops_gestor_select ON public.stock_movements
  FOR SELECT TO authenticated
  USING (public.carbo_is_gestor(auth.uid()));
