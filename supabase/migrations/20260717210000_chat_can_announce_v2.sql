-- ─────────────────────────────────────────────────────────────────────────────
-- Carbo Chat — quem pode criar/publicar Comunicado Oficial (v2).
-- Fonte de verdade do "gestor" = public.carbo_is_gestor (a flag que o Carbo Admin
-- controla por usuário, access_level='gestor', independente de cargo/depto).
-- + RH: departamento RH também publica (o "RH" do "admin/RH").
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.chat_can_announce()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.carbo_is_gestor(auth.uid())
      OR EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid()
          AND (upper(btrim(coalesce(p.department, ''))) = 'RH'
            OR upper(btrim(coalesce(p.secondary_department, ''))) = 'RH')
      );
$$;
GRANT EXECUTE ON FUNCTION public.chat_can_announce() TO authenticated;
NOTIFY pgrst, 'reload schema';
