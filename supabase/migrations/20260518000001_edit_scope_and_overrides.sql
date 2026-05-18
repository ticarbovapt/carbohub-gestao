-- ── edit_scope em department_functions ──────────────────────────────────────
ALTER TABLE public.department_functions
  ADD COLUMN IF NOT EXISTS edit_scope text NOT NULL DEFAULT 'proprio'
  CHECK (edit_scope IN ('proprio', 'equipe', 'departamento', 'global'));

-- Backfill: edit_scope = view_scope (data_scope) como ponto de partida
UPDATE public.department_functions SET edit_scope = data_scope;

-- ── Tabela de overrides individuais de acesso ────────────────────────────────
CREATE TABLE IF NOT EXISTS public.user_access_overrides (
  user_id          uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  view_scope       text CHECK (view_scope IN ('proprio', 'equipe', 'departamento', 'global')),
  edit_scope       text CHECK (edit_scope IN ('proprio', 'equipe', 'departamento', 'global')),
  extra_screen_ids text[] NOT NULL DEFAULT '{}',
  granted_by       uuid REFERENCES auth.users(id),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_access_overrides ENABLE ROW LEVEL SECURITY;

-- Função auxiliar: verifica se o concedente pode dar override ao alvo
-- Admin pode dar a qualquer pessoa. Head pode dar apenas ao seu departamento.
CREATE OR REPLACE FUNCTION public.can_grant_access_override(
  granter_id     uuid,
  target_user_id uuid
)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles granter
    JOIN  public.profiles target ON target.id = target_user_id
    WHERE granter.id = granter_id
    AND (
      EXISTS (
        SELECT 1 FROM public.user_roles
        WHERE user_id = granter_id AND role = 'admin'
      )
      OR (granter.funcao = 'head' AND granter.department IS NOT NULL
          AND granter.department = target.department)
    )
  );
$$;

-- RLS: usuário lê o próprio; admin e heads (via função) gerenciam
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'user_access_overrides' AND policyname = 'Users read own override'
  ) THEN
    CREATE POLICY "Users read own override"
      ON public.user_access_overrides FOR SELECT
      USING (auth.uid() = user_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'user_access_overrides' AND policyname = 'Authorized grant access overrides'
  ) THEN
    CREATE POLICY "Authorized grant access overrides"
      ON public.user_access_overrides FOR ALL
      USING (public.can_grant_access_override(auth.uid(), user_id));
  END IF;
END $$;
