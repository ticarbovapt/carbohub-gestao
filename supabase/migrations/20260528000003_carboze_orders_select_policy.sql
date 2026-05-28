-- A carboze_orders_secure view usa security_invoker = true,
-- então herda o RLS do usuário autenticado.
-- Sem política de SELECT, nenhuma leitura funciona via app.
-- A view já trata mascaramento de PII para não-admins.

CREATE POLICY "carboze_orders_select_authenticated"
  ON public.carboze_orders
  FOR SELECT
  TO authenticated
  USING (true);
