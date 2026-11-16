-- Metas mensais por canal de venda (definidas mês a mês pela gestão).
-- canal: 'consumo' (B2B) | 'revenda' (PDV) | 'online'.
-- Consumo normalmente segue regra rolante (real mês anterior +15%); um valor aqui SOBRESCREVE.
CREATE TABLE IF NOT EXISTS public.canal_metas (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ano         INTEGER NOT NULL,
  mes         INTEGER NOT NULL CHECK (mes BETWEEN 1 AND 12),
  canal       TEXT NOT NULL CHECK (canal IN ('consumo','revenda','online')),
  valor       NUMERIC(14,2) NOT NULL DEFAULT 0,
  updated_by  UUID REFERENCES auth.users(id),
  updated_at  TIMESTAMPTZ DEFAULT now(),
  UNIQUE (ano, mes, canal)
);

ALTER TABLE public.canal_metas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth read canal_metas"  ON public.canal_metas
  FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "admin write canal_metas" ON public.canal_metas
  FOR ALL USING (is_admin(auth.uid()) OR is_ceo(auth.uid()))
  WITH CHECK (is_admin(auth.uid()) OR is_ceo(auth.uid()));

-- Seed 2026: Revenda 75k/mês (NE 25k + SE 50k); On-line 27k de jul a dez.
INSERT INTO public.canal_metas (ano, mes, canal, valor)
SELECT 2026, g.mes, 'revenda', 75000
FROM generate_series(1,12) AS g(mes)
ON CONFLICT (ano, mes, canal) DO NOTHING;

INSERT INTO public.canal_metas (ano, mes, canal, valor)
SELECT 2026, g.mes, 'online', 27000
FROM generate_series(7,12) AS g(mes)
ON CONFLICT (ano, mes, canal) DO NOTHING;
