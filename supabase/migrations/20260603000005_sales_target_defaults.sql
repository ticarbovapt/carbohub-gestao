-- Meta padrão (recorrente) por vendedor — vale para TODOS os meses.
-- A meta efetiva de um mês = exceção daquele mês (sales_targets) ?? meta padrão.
-- Assim não é preciso recadastrar todo mês; só se cria exceção quando o mês difere.

CREATE TABLE IF NOT EXISTS public.sales_target_defaults (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendedor_id   uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  target_amount numeric(12,2) NOT NULL DEFAULT 0,
  target_qty    integer NOT NULL DEFAULT 0,
  linha         text,                  -- linha de produto (null = geral)
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sales_target_defaults_vendedor_linha_key
    UNIQUE (vendedor_id, linha)
);

ALTER TABLE public.sales_target_defaults ENABLE ROW LEVEL SECURITY;

-- Mesma política das metas mensais: leitura para autenticados; escrita controlada
-- no app (screenId + useCanSetTargets restringe a head/command).
CREATE POLICY "sales_target_defaults_select" ON public.sales_target_defaults
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "sales_target_defaults_insert" ON public.sales_target_defaults
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "sales_target_defaults_update" ON public.sales_target_defaults
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "sales_target_defaults_delete" ON public.sales_target_defaults
  FOR DELETE TO authenticated USING (true);
