-- Tabela central de Notas Fiscais importadas do Bling
CREATE TABLE IF NOT EXISTS public.bling_nfe (
  id                      uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  bling_id                bigint NOT NULL,
  numero                  text,
  serie                   text,
  chave_acesso            text,
  data_emissao            date,
  contato_nome            text,
  contato_cnpj            text,
  valor_total             numeric(12, 2),
  situacao                text,
  -- Campo de observação da NF — vem do detalhe GET /nfe/{id}
  informacoes_adicionais  text,
  xml_url                 text,
  pdf_url                 text,

  -- Vínculo com pedido Carbohub
  order_id                uuid REFERENCES public.carboze_orders(id) ON DELETE SET NULL,
  matched_order_number    text,          -- denormalizado para exibição rápida
  match_status            text NOT NULL DEFAULT 'pending'
                            CHECK (match_status IN (
                              'pending',      -- ainda não processada (sem detalhe)
                              'matched',      -- vinculada automaticamente por código
                              'no_code',      -- sem código PED-AAAA-NNNNN na observação
                              'invalid_code', -- código encontrado mas pedido não existe
                              'manual'        -- vinculada manualmente na tela
                            )),
  match_error             text,          -- mensagem de erro quando match falhou

  -- Sync metadata
  raw_data                jsonb,
  synced_at               timestamptz DEFAULT now(),
  created_at              timestamptz DEFAULT now(),
  updated_at              timestamptz DEFAULT now(),

  CONSTRAINT bling_nfe_bling_id_unique UNIQUE (bling_id)
);

-- Índices para filtros comuns na tela
CREATE INDEX IF NOT EXISTS bling_nfe_data_emissao_idx  ON public.bling_nfe (data_emissao DESC);
CREATE INDEX IF NOT EXISTS bling_nfe_match_status_idx  ON public.bling_nfe (match_status);
CREATE INDEX IF NOT EXISTS bling_nfe_order_id_idx      ON public.bling_nfe (order_id);

-- RLS
ALTER TABLE public.bling_nfe ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read bling_nfe"
  ON public.bling_nfe FOR SELECT TO authenticated USING (true);

CREATE POLICY "Service role full access to bling_nfe"
  ON public.bling_nfe FOR ALL TO service_role USING (true);

COMMENT ON TABLE  public.bling_nfe IS 'Notas Fiscais importadas do Bling via API /nfe. Inclui histórico anterior ao sistema.';
COMMENT ON COLUMN public.bling_nfe.informacoes_adicionais IS 'Campo "informacoesAdicionais" da NF no Bling — contém a observação do financeiro com o código do pedido.';
COMMENT ON COLUMN public.bling_nfe.match_status IS 'Status do vínculo automático: pending=sem detalhe; matched=vinculada; no_code=sem PED-AAAA-NNNNN; invalid_code=código não encontrado; manual=vínculo manual.';
