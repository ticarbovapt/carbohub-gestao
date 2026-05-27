-- Tabela de metas mensais de faturamento ecommerce por plataforma
-- platform = NULL significa meta total consolidada
-- platform = 'vindi' cobre LPs / Assinaturas
CREATE TABLE IF NOT EXISTS public.meta_ecommerce (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  month          DATE        NOT NULL, -- primeiro dia do mês (ex: 2026-06-01)
  platform       TEXT,                 -- NULL = total | 'mercadolivre' | 'amazon' | 'tiktok' | 'shopee' | 'vindi'
  target_amount  NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_by     UUID REFERENCES auth.users(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (month, platform)
);

ALTER TABLE public.meta_ecommerce ENABLE ROW LEVEL SECURITY;

-- Qualquer usuário autenticado pode ler; apenas admin pode escrever
CREATE POLICY "meta_ecommerce_read"  ON public.meta_ecommerce FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "meta_ecommerce_write" ON public.meta_ecommerce FOR ALL    USING (auth.uid() IS NOT NULL);
