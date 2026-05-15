-- Add new department values to enum
ALTER TYPE public.department_type ADD VALUE IF NOT EXISTS 'vendas';
ALTER TYPE public.department_type ADD VALUE IF NOT EXISTS 'ti_suporte';

-- Table for dynamic functions per department
CREATE TABLE IF NOT EXISTS public.department_functions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  department text NOT NULL,
  function_key text NOT NULL,
  label text NOT NULL,
  hierarchy_order int NOT NULL DEFAULT 99,
  reports_to_key text,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  created_by uuid,
  CONSTRAINT dept_func_unique UNIQUE (department, function_key)
);

ALTER TABLE public.department_functions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read department functions" ON public.department_functions FOR SELECT USING (true);
CREATE POLICY "Admins can manage department functions" ON public.department_functions FOR ALL USING (true) WITH CHECK (true);

-- Seed default functions
INSERT INTO public.department_functions (department, function_key, label, hierarchy_order, reports_to_key) VALUES
  -- Command
  ('command', 'ceo', 'CEO', 1, null),
  ('command', 'assistente_executiva', 'Assistente Executiva', 2, 'ceo'),
  -- Operações (ops)
  ('ops', 'head', 'Head', 1, null),
  ('ops', 'gerente', 'Gerente', 2, 'head'),
  ('ops', 'coordenador', 'Coordenador(a)', 3, 'gerente'),
  ('ops', 'supervisor', 'Supervisor(a)', 4, 'coordenador'),
  ('ops', 'staff', 'Colaborador', 5, 'supervisor'),
  -- Vendas (b2b → vendas)
  ('b2b', 'head', 'Head', 1, null),
  ('b2b', 'supervisor', 'Supervisor(a)', 2, 'head'),
  ('b2b', 'vendedor_b2b', 'Vendedor B2B', 3, 'supervisor'),
  ('b2b', 'vendedor_b2c', 'Vendedor B2C', 3, 'supervisor'),
  -- Finance
  ('finance', 'head', 'Head', 1, null),
  ('finance', 'gerente', 'Gerente', 2, 'head'),
  ('finance', 'coordenador', 'Coordenador(a)', 3, 'gerente'),
  ('finance', 'analista', 'Analista', 4, 'coordenador'),
  -- TI/Suporte
  ('ti_suporte', 'head', 'Head', 1, null),
  ('ti_suporte', 'staff', 'Colaborador', 2, 'head'),
  -- Growth
  ('growth', 'head', 'Head', 1, null),
  ('growth', 'staff', 'Colaborador', 2, 'head'),
  -- Expansão
  ('expansao', 'head', 'Head', 1, null),
  ('expansao', 'staff', 'Colaborador', 2, 'head')
ON CONFLICT (department, function_key) DO NOTHING;
