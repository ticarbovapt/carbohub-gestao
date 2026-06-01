-- Colunas de estoque espelhado do Bling em bling_products.
-- A função syncStock (supabase/functions/bling-sync) já tenta gravar estes
-- campos a partir do endpoint /estoques do Bling, mas as colunas nunca foram
-- criadas — então o espelho de estoque não funcionava. Esta migração as cria.
--
-- O CD virtual "CD Bling" em Suprimentos é SOMENTE LEITURA: reflete estes
-- valores (atualizados pelo sync), sem permitir edição manual.
ALTER TABLE public.bling_products
  ADD COLUMN IF NOT EXISTS estoque_atual     numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS estoque_reservado numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS estoque_synced_at timestamptz;

-- Índice para casar com mrp_products.product_code (espelho por código).
CREATE INDEX IF NOT EXISTS idx_bling_products_codigo ON public.bling_products (codigo);
