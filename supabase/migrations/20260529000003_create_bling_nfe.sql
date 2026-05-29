-- Tabela central de Notas Fiscais importadas do Bling
-- Robusta: cria se não existir, e adiciona colunas faltantes se a tabela já
-- existir numa versão anterior (ex: criada manualmente sem match_status).

CREATE TABLE IF NOT EXISTS public.bling_nfe (
  id        uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  bling_id  bigint NOT NULL
);

-- Garante todas as colunas (idempotente — cobre tabela pré-existente parcial)
ALTER TABLE public.bling_nfe
  ADD COLUMN IF NOT EXISTS numero                 text,
  ADD COLUMN IF NOT EXISTS serie                  text,
  ADD COLUMN IF NOT EXISTS chave_acesso           text,
  ADD COLUMN IF NOT EXISTS data_emissao           date,
  ADD COLUMN IF NOT EXISTS contato_nome           text,
  ADD COLUMN IF NOT EXISTS contato_cnpj           text,
  ADD COLUMN IF NOT EXISTS valor_total            numeric(12, 2),
  ADD COLUMN IF NOT EXISTS situacao               text,
  ADD COLUMN IF NOT EXISTS informacoes_adicionais text,
  ADD COLUMN IF NOT EXISTS xml_url                text,
  ADD COLUMN IF NOT EXISTS pdf_url                text,
  ADD COLUMN IF NOT EXISTS order_id               uuid REFERENCES public.carboze_orders(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS matched_order_number   text,
  ADD COLUMN IF NOT EXISTS match_status           text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS match_error            text,
  ADD COLUMN IF NOT EXISTS raw_data               jsonb,
  ADD COLUMN IF NOT EXISTS synced_at              timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS created_at             timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at             timestamptz DEFAULT now();

-- Constraint de valores válidos para match_status (guardada para não duplicar)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'bling_nfe_match_status_check'
  ) THEN
    ALTER TABLE public.bling_nfe
      ADD CONSTRAINT bling_nfe_match_status_check
      CHECK (match_status IN ('pending', 'matched', 'no_code', 'invalid_code', 'manual'));
  END IF;
END $$;

-- Unicidade do bling_id (guardada)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'bling_nfe_bling_id_unique'
  ) THEN
    ALTER TABLE public.bling_nfe
      ADD CONSTRAINT bling_nfe_bling_id_unique UNIQUE (bling_id);
  END IF;
END $$;

-- Índices para filtros comuns na tela
CREATE INDEX IF NOT EXISTS bling_nfe_data_emissao_idx ON public.bling_nfe (data_emissao DESC);
CREATE INDEX IF NOT EXISTS bling_nfe_match_status_idx ON public.bling_nfe (match_status);
CREATE INDEX IF NOT EXISTS bling_nfe_order_id_idx     ON public.bling_nfe (order_id);

-- RLS
ALTER TABLE public.bling_nfe ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read bling_nfe" ON public.bling_nfe;
CREATE POLICY "Authenticated users can read bling_nfe"
  ON public.bling_nfe FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Service role full access to bling_nfe" ON public.bling_nfe;
CREATE POLICY "Service role full access to bling_nfe"
  ON public.bling_nfe FOR ALL TO service_role USING (true);

COMMENT ON TABLE  public.bling_nfe IS 'Notas Fiscais importadas do Bling via API /nfe. Inclui histórico anterior ao sistema.';
COMMENT ON COLUMN public.bling_nfe.informacoes_adicionais IS 'Campo "informacoesAdicionais" da NF no Bling — contém a observação do financeiro com o código do pedido.';
COMMENT ON COLUMN public.bling_nfe.match_status IS 'Status do vínculo automático: pending=sem detalhe; matched=vinculada; no_code=sem PED-AAAA-NNNNN; invalid_code=código não encontrado; manual=vínculo manual.';
