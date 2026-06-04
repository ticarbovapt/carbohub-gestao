-- ============================================================================
-- Integração Bling ↔ Compras/Financeiro (mão dupla) — FASE 1: estrutura
--
-- Permite que Pedidos de Compra e Contas a Pagar venham do Bling (e, depois,
-- sejam enviados para o Bling). Os registros do Bling convivem com os criados
-- internamente nas MESMAS tabelas, diferenciados por `source`.
--
-- Colunas novas em purchase_orders e purchase_payables:
--   source       'interno' (criado aqui) | 'bling' (veio do Bling)
--   bling_id     id do registro no Bling (NULL enquanto não sincronizado)
--   bling_numero número/documento amigável do Bling
--   sync_status  'ok' | 'possivel_duplicado' | 'pendente_envio'
--   bling_raw    payload bruto do Bling (para reprocessar sem refazer fetch)
--   duplicate_of registro interno que este possivelmente duplica (Fase 2)
-- ============================================================================

-- 1) O número de OC/RC só deve ser gerado automaticamente para lançamentos
--    internos (que enviam 'TEMP'). Registros vindos do Bling trazem o próprio
--    número e não devem ser sobrescritos.
CREATE OR REPLACE FUNCTION public.generate_oc_number()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    year_prefix TEXT;
    next_seq INTEGER;
BEGIN
    -- Preserva números fornecidos (ex.: vindos do Bling). Só gera quando 'TEMP'.
    IF NEW.oc_number IS NOT NULL AND NEW.oc_number <> 'TEMP' THEN
        RETURN NEW;
    END IF;
    year_prefix := to_char(now(), 'YYYY');
    SELECT COALESCE(MAX(
        CAST(SUBSTRING(oc_number FROM 'OC-\d{4}-(\d+)') AS INTEGER)
    ), 0) + 1
    INTO next_seq
    FROM public.purchase_orders
    WHERE oc_number LIKE 'OC-' || year_prefix || '-%';
    NEW.oc_number := 'OC-' || year_prefix || '-' || LPAD(next_seq::TEXT, 5, '0');
    RETURN NEW;
END;
$$;

-- 2) purchase_orders: aceitar registros sem RC interna nem usuário gerador
ALTER TABLE public.purchase_orders ALTER COLUMN purchase_request_id DROP NOT NULL;
ALTER TABLE public.purchase_orders ALTER COLUMN generated_by DROP NOT NULL;

ALTER TABLE public.purchase_orders
    ADD COLUMN IF NOT EXISTS source       TEXT NOT NULL DEFAULT 'interno',
    ADD COLUMN IF NOT EXISTS bling_id      BIGINT,
    ADD COLUMN IF NOT EXISTS bling_numero  TEXT,
    ADD COLUMN IF NOT EXISTS sync_status   TEXT NOT NULL DEFAULT 'ok',
    ADD COLUMN IF NOT EXISTS bling_raw     JSONB,
    ADD COLUMN IF NOT EXISTS duplicate_of  UUID REFERENCES public.purchase_orders(id);

-- 3) purchase_payables: aceitar contas sem OC interna vinculada
ALTER TABLE public.purchase_payables ALTER COLUMN purchase_order_id DROP NOT NULL;

ALTER TABLE public.purchase_payables
    ADD COLUMN IF NOT EXISTS source       TEXT NOT NULL DEFAULT 'interno',
    ADD COLUMN IF NOT EXISTS bling_id      BIGINT,
    ADD COLUMN IF NOT EXISTS bling_numero  TEXT,
    ADD COLUMN IF NOT EXISTS sync_status   TEXT NOT NULL DEFAULT 'ok',
    ADD COLUMN IF NOT EXISTS bling_raw     JSONB,
    ADD COLUMN IF NOT EXISTS duplicate_of  UUID REFERENCES public.purchase_payables(id);

-- 4) Unicidade por bling_id (NULLs múltiplos são permitidos no Postgres, então
--    os lançamentos internos não conflitam). Permite upsert por bling_id.
CREATE UNIQUE INDEX IF NOT EXISTS idx_purchase_orders_bling_id
    ON public.purchase_orders (bling_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_purchase_payables_bling_id
    ON public.purchase_payables (bling_id);

-- Índices de apoio para filtros do dashboard / dedup
CREATE INDEX IF NOT EXISTS idx_purchase_orders_source ON public.purchase_orders (source);
CREATE INDEX IF NOT EXISTS idx_purchase_payables_source ON public.purchase_payables (source);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_sync_status ON public.purchase_orders (sync_status);
CREATE INDEX IF NOT EXISTS idx_purchase_payables_sync_status ON public.purchase_payables (sync_status);
