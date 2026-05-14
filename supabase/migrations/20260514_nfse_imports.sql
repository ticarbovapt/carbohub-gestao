-- ─────────────────────────────────────────────────────────────────────────────
-- NFS-e Imports — tabela consolidada de Notas Fiscais de Serviço (ABRASF 2.01)
-- Emitidas pela CARBO SOLUCOES LTDA para serviços CarboVapt
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS nfse_imports (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identificação da NF-e
  numero              INTEGER NOT NULL,
  codigo_verificacao  TEXT,
  data_emissao        TIMESTAMPTZ,
  competencia         DATE,

  -- Serviço
  item_lista_servico  TEXT,                          -- ex: 140101
  discriminacao       TEXT,                          -- texto livre do campo Discriminacao
  outras_informacoes  TEXT,

  -- Valores
  valor_servicos      NUMERIC(12,2),
  valor_pis           NUMERIC(12,2) DEFAULT 0,
  valor_cofins        NUMERIC(12,2) DEFAULT 0,
  valor_inss          NUMERIC(12,2) DEFAULT 0,
  valor_ir            NUMERIC(12,2) DEFAULT 0,
  valor_csll          NUMERIC(12,2) DEFAULT 0,
  outras_retencoes    NUMERIC(12,2) DEFAULT 0,
  base_calculo        NUMERIC(12,2) DEFAULT 0,
  iss_retido          BOOLEAN DEFAULT false,

  -- Tomador (cliente)
  tomador_cpf_cnpj    TEXT,
  tomador_tipo        TEXT CHECK (tomador_tipo IN ('cpf','cnpj')),
  tomador_razao_social TEXT,
  tomador_uf          CHAR(2),
  tomador_municipio   TEXT,
  tomador_cep         TEXT,
  tomador_telefone    TEXT,

  -- Campos extraídos / calculados
  pedido_refs         TEXT[],        -- pedidos internos mencionados em OutrasInformacoes
  veiculo_descricao   TEXT,          -- veículo extraído da Discriminacao
  qtd_veiculos        INTEGER,       -- quantidade extraída do padrão |qtd|

  -- Metadados do import
  filename            TEXT,
  batch_id            UUID,          -- agrupa NFs importadas juntas
  imported_at         TIMESTAMPTZ DEFAULT now(),
  imported_by         UUID REFERENCES auth.users(id),

  UNIQUE(numero)
);

ALTER TABLE nfse_imports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth read nfse"
  ON nfse_imports FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "admin write nfse"
  ON nfse_imports FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = auth.uid()
        AND role IN ('admin','manager')
    )
  );
