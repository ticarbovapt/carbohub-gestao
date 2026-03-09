
-- =============================================
-- PARTE 5 & 6: Tabelas para IA Preditiva e Alertas Inteligentes
-- =============================================

-- Severidade de insights
CREATE TYPE public.insight_severity AS ENUM ('critical', 'warning', 'stable');

-- Tabela de forecast snapshots (previsões de IA)
CREATE TABLE public.forecast_snapshots (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  entity TEXT NOT NULL,
  entity_id UUID,
  product_code TEXT,
  period_days INTEGER NOT NULL DEFAULT 30,
  projected_volume NUMERIC,
  projected_revenue NUMERIC,
  risk_level public.insight_severity NOT NULL DEFAULT 'stable',
  confidence NUMERIC,
  details JSONB,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.forecast_snapshots ENABLE ROW LEVEL SECURITY;

-- Somente Admin/CEO podem ler forecasts
CREATE POLICY "Admin/CEO can read forecasts"
  ON public.forecast_snapshots FOR SELECT TO authenticated
  USING (
    public.is_admin(auth.uid()) OR public.is_ceo(auth.uid())
  );

-- Service role insere via edge function
CREATE POLICY "Service inserts forecasts"
  ON public.forecast_snapshots FOR INSERT TO authenticated
  WITH CHECK (
    public.is_admin(auth.uid()) OR public.is_ceo(auth.uid())
  );

-- Tabela de alertas/insights inteligentes
CREATE TABLE public.ai_insights (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  type TEXT NOT NULL,
  entity_id UUID,
  entity_type TEXT,
  severity public.insight_severity NOT NULL DEFAULT 'warning',
  message TEXT NOT NULL,
  recommendation TEXT,
  is_dismissed BOOLEAN NOT NULL DEFAULT false,
  dismissed_by UUID,
  dismissed_at TIMESTAMPTZ,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.ai_insights ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin/CEO can read insights"
  ON public.ai_insights FOR SELECT TO authenticated
  USING (
    public.is_admin(auth.uid()) OR public.is_ceo(auth.uid())
  );

CREATE POLICY "Admin/CEO can update insights"
  ON public.ai_insights FOR UPDATE TO authenticated
  USING (
    public.is_admin(auth.uid()) OR public.is_ceo(auth.uid())
  );

CREATE POLICY "Service inserts insights"
  ON public.ai_insights FOR INSERT TO authenticated
  WITH CHECK (
    public.is_admin(auth.uid()) OR public.is_ceo(auth.uid())
  );

-- Índices para performance
CREATE INDEX idx_forecast_entity ON public.forecast_snapshots (entity, entity_id);
CREATE INDEX idx_forecast_generated ON public.forecast_snapshots (generated_at DESC);
CREATE INDEX idx_insights_severity ON public.ai_insights (severity, is_dismissed);
CREATE INDEX idx_insights_type ON public.ai_insights (type, created_at DESC);
