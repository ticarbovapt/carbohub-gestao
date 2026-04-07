-- ============================================================
-- CarboHub — Freight Quotes (Melhor Envio)
-- Migration: 20260407_freight_quotes.sql
-- ============================================================

CREATE TABLE IF NOT EXISTS public.freight_quotes (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_cep         text NOT NULL DEFAULT '07100010', -- Guarulhos/SP fixo
  to_cep           text NOT NULL,
  to_city          text,
  to_state         text,
  product_ref      text,    -- nome do produto (do catálogo ou "Manual")
  quantity         integer  DEFAULT 1,
  weight_kg        numeric(8,3),
  dimensions_cm    jsonb,   -- { height, width, length }
  insurance_value  numeric(10,2) DEFAULT 0,
  carriers         jsonb NOT NULL, -- resposta completa da API Melhor Envio
  selected_carrier text,   -- transportadora escolhida pelo usuário
  selected_price   numeric(10,2),
  selected_days    integer,
  notes            text,
  created_by       uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at       timestamptz DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_freight_quotes_created_at  ON public.freight_quotes (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_freight_quotes_to_cep      ON public.freight_quotes (to_cep);
CREATE INDEX IF NOT EXISTS idx_freight_quotes_created_by  ON public.freight_quotes (created_by);

-- RLS
ALTER TABLE public.freight_quotes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated_can_select_freight_quotes"
  ON public.freight_quotes FOR SELECT TO authenticated USING (true);

CREATE POLICY "authenticated_can_insert_freight_quotes"
  ON public.freight_quotes FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "owner_can_update_freight_quotes"
  ON public.freight_quotes FOR UPDATE TO authenticated
  USING (created_by = auth.uid());
