-- Tabela para sobrescrever labels e siglas de departamentos sem alterar o enum/key
CREATE TABLE IF NOT EXISTS public.department_labels (
  dept_key   text        PRIMARY KEY,
  label      text        NOT NULL,
  sigla      text        NULL,        -- sigla/prefixo do username (ex: OPS, FIN). NULL = usa default do código
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Adiciona coluna sigla se a tabela já existia sem ela
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'department_labels' AND column_name = 'sigla'
  ) THEN
    ALTER TABLE public.department_labels ADD COLUMN sigla text NULL;
  END IF;
END $$;

ALTER TABLE public.department_labels ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'department_labels' AND policyname = 'Admins manage department labels'
  ) THEN
    CREATE POLICY "Admins manage department labels" ON public.department_labels
      FOR ALL USING (public.is_admin(auth.uid()));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'department_labels' AND policyname = 'Anyone reads department labels'
  ) THEN
    CREATE POLICY "Anyone reads department labels" ON public.department_labels
      FOR SELECT USING (true);
  END IF;
END $$;
