-- Central de Metas & Comissões.
-- Dimensão de canal nas metas de vendedor (cascata Canal → Vendedor). Nullable, não mexe nos índices únicos.
ALTER TABLE public.sales_targets
  ADD COLUMN IF NOT EXISTS canal TEXT CHECK (canal IN ('consumo','revenda','online'));
ALTER TABLE public.sales_target_defaults
  ADD COLUMN IF NOT EXISTS canal TEXT CHECK (canal IN ('consumo','revenda','online'));

-- Indicador "vendedor tem comissão?" (progressão de faixas definida depois)
CREATE TABLE IF NOT EXISTS public.vendedor_comissao (
  vendedor_id  UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  tem_comissao BOOLEAN NOT NULL DEFAULT false,
  updated_by   UUID REFERENCES auth.users(id),
  updated_at   TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.vendedor_comissao ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read vend_comissao"  ON public.vendedor_comissao FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "admin write vend_comissao" ON public.vendedor_comissao FOR ALL
  USING (is_admin(auth.uid()) OR is_ceo(auth.uid())) WITH CHECK (is_admin(auth.uid()) OR is_ceo(auth.uid()));

-- Faixas de progressão de comissão (gestão define os números depois)
CREATE TABLE IF NOT EXISTS public.comissao_faixas (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ordem     INTEGER NOT NULL DEFAULT 0,
  min_pct   NUMERIC(6,2) NOT NULL DEFAULT 0,
  max_pct   NUMERIC(6,2),
  taxa      NUMERIC(6,3) NOT NULL DEFAULT 0,
  ativo     BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.comissao_faixas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read comissao_faixas"  ON public.comissao_faixas FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "admin write comissao_faixas" ON public.comissao_faixas FOR ALL
  USING (is_admin(auth.uid()) OR is_ceo(auth.uid())) WITH CHECK (is_admin(auth.uid()) OR is_ceo(auth.uid()));

-- Bonificação do PAP indicador para descarbonização (Carbovapt)
CREATE TABLE IF NOT EXISTS public.bonificacao_pap (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  descricao   TEXT NOT NULL DEFAULT 'PAP indicador — Descarbonização',
  percentual  NUMERIC(6,3) NOT NULL DEFAULT 0,
  ativo       BOOLEAN NOT NULL DEFAULT true,
  updated_by  UUID REFERENCES auth.users(id),
  updated_at  TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.bonificacao_pap ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read bonif_pap"  ON public.bonificacao_pap FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "admin write bonif_pap" ON public.bonificacao_pap FOR ALL
  USING (is_admin(auth.uid()) OR is_ceo(auth.uid())) WITH CHECK (is_admin(auth.uid()) OR is_ceo(auth.uid()));

INSERT INTO public.bonificacao_pap (descricao, percentual, ativo)
SELECT 'PAP indicador — Descarbonização', 0, true
WHERE NOT EXISTS (SELECT 1 FROM public.bonificacao_pap);
