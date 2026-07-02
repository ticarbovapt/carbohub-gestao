-- ─────────────────────────────────────────────────────────────────────────────
-- Mapa vendedor do Bling ↔ perfil interno (profiles).
-- Objetivo: atribuir vendedor_id (perfil) às vendas que vêm do Bling.
--   • profile_id em bling_vendedores = o perfil interno daquele vendedor Bling.
--   • Match automático por e-mail; o que não bater fica NULL (resolve no De-Para).
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.bling_vendedores
  ADD COLUMN IF NOT EXISTS profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

-- Match automático por e-mail (case-insensitive).
UPDATE public.bling_vendedores bv
SET profile_id = p.id
FROM public.profiles p
WHERE bv.profile_id IS NULL
  AND bv.email IS NOT NULL AND bv.email <> ''
  AND lower(bv.email) = lower(p.email);

-- RPC pro Admin salvar o De-Para (liga um vendedor Bling a um perfil). Só gestor.
CREATE OR REPLACE FUNCTION public.set_bling_vendedor_profile(_bling_id text, _profile_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.carbo_is_gestor(auth.uid()) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;
  UPDATE public.bling_vendedores SET profile_id = _profile_id, updated_at = now()
  WHERE bling_id::text = _bling_id;
END; $$;
GRANT EXECUTE ON FUNCTION public.set_bling_vendedor_profile(text, uuid) TO authenticated;
