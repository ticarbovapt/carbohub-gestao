-- ─────────────────────────────────────────────────────────────────────────────
-- Preço fixo por PRODUTO FINAL (rastreabilidade de preço de venda).
-- Hoje a tela /vender pede o preço unitário "na mão" (arbitrário). Passo 1: o
-- Admin define um preço fixo por produto. Passo 2 (futuro): a /vender usa esse
-- valor como padrão, tirando a digitação arbitrária → todo mundo vende no mesmo
-- preço e fica rastreável quem/quando mudou.
--
-- Colunas aditivas em mrp_products; a gravação passa por RPC gestor-gated que
-- estampa quem e quando (mesmo padrão do decide_discount).
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.mrp_products
  ADD COLUMN IF NOT EXISTS sale_price            numeric(12,2),
  ADD COLUMN IF NOT EXISTS sale_price_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS sale_price_updated_by uuid REFERENCES public.profiles(id);

-- Define o preço fixo de um produto (gestor-gated; estampa autor/data).
CREATE OR REPLACE FUNCTION public.carbo_set_product_price(p_product_id uuid, p_price numeric)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.carbo_is_gestor(auth.uid()) THEN
    RAISE EXCEPTION 'Sem permissão para definir preço';
  END IF;
  IF p_price IS NOT NULL AND p_price < 0 THEN
    RAISE EXCEPTION 'Preço não pode ser negativo';
  END IF;
  UPDATE public.mrp_products
    SET sale_price            = p_price,
        sale_price_updated_at = now(),
        sale_price_updated_by = auth.uid()
    WHERE id = p_product_id;
END $$;

GRANT EXECUTE ON FUNCTION public.carbo_set_product_price(uuid, numeric) TO authenticated;

NOTIFY pgrst, 'reload schema';
