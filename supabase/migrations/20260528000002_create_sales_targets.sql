-- Tabela de metas mensais por vendedor
CREATE TABLE IF NOT EXISTS public.sales_targets (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendedor_id   uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  month         date NOT NULL,         -- primeiro dia do mês: 2026-05-01
  target_amount numeric(12,2) NOT NULL DEFAULT 0,
  target_qty    integer NOT NULL DEFAULT 0,
  linha         text,                  -- linha de produto (null = geral)
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),

  -- Unicidade: um vendedor pode ter uma meta por mês por linha
  CONSTRAINT sales_targets_vendedor_month_linha_key
    UNIQUE (vendedor_id, month, linha)
);

-- RLS
ALTER TABLE public.sales_targets ENABLE ROW LEVEL SECURITY;

-- Heads, command e admin lêem tudo
CREATE POLICY "sales_targets_select" ON public.sales_targets
  FOR SELECT TO authenticated
  USING (true);

-- Apenas usuários autenticados com permissão de head/command podem inserir/atualizar
-- (controle feito no app via screenId + useCanSetTargets)
CREATE POLICY "sales_targets_insert" ON public.sales_targets
  FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "sales_targets_update" ON public.sales_targets
  FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "sales_targets_delete" ON public.sales_targets
  FOR DELETE TO authenticated
  USING (true);
