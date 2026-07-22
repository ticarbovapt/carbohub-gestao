-- ─────────────────────────────────────────────────────────────────────────────
-- Suprimentos — histórico diário (snapshot) do estoque para tendência no Admin.
--
-- A tela /dashboards/suprimentos (Carbo Admin) mostra tudo como foto do momento.
-- Sem histórico, a pergunta nº1 do CEO — "o capital em estoque está subindo ou
-- caindo?" — fica sem resposta. Esta migration cria:
--   • suprimentos_snapshots: 1 linha por dia com os números-chave já valorizados;
--   • capture_suprimentos_snapshot(): calcula e faz upsert do snapshot de HOJE,
--     com a MESMA semântica do hook useSuprimentosCockpit (produtos/hubs ativos,
--     dead stock = sem movimento em 90d, mínimo por hub com fallback
--     safety_stock_qty, em trânsito = não entregue/cancelado em 180d);
--   • cron diário (pg_cron) que roda a captura;
--   • uma captura inicial p/ já semear o primeiro ponto.
--
-- Só leitura no Admin; nada aqui altera produção/estoque.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

-- ── Tabela ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.suprimentos_snapshots (
  snapshot_date       date PRIMARY KEY,
  valor_total         numeric(14,2) NOT NULL DEFAULT 0,
  valor_parado        numeric(14,2) NOT NULL DEFAULT 0,
  risco_valor         numeric(14,2) NOT NULL DEFAULT 0,
  risco_qtd           integer       NOT NULL DEFAULT 0,
  risco_critico       integer       NOT NULL DEFAULT 0,
  valor_em_transito   numeric(14,2) NOT NULL DEFAULT 0,
  produtos_ativos     integer       NOT NULL DEFAULT 0,
  produtos_com_custo  integer       NOT NULL DEFAULT 0,
  created_at          timestamptz   NOT NULL DEFAULT now()
);

ALTER TABLE public.suprimentos_snapshots ENABLE ROW LEVEL SECURITY;

-- Leitura liberada a autenticado (mesma regra do resto do domínio de suprimentos).
DROP POLICY IF EXISTS suprimentos_snapshots_select ON public.suprimentos_snapshots;
CREATE POLICY suprimentos_snapshots_select
  ON public.suprimentos_snapshots FOR SELECT
  USING (auth.role() = 'authenticated');

-- ── Função de captura ────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.capture_suprimentos_snapshot()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_valor_total   numeric := 0;
  v_valor_parado  numeric := 0;
  v_risco_valor   numeric := 0;
  v_risco_qtd     integer := 0;
  v_risco_critico integer := 0;
  v_transito      numeric := 0;
  v_ativos        integer := 0;
  v_com_custo     integer := 0;
  v_cut90  timestamptz := now() - interval '90 days';
  v_cut180 timestamptz := now() - interval '180 days';
BEGIN
  -- Valor total mobilizado (produtos e hubs ativos).
  SELECT COALESCE(SUM(ws.quantity * p.unit_cost), 0)
    INTO v_valor_total
  FROM public.warehouse_stock ws
  JOIN public.mrp_products p ON p.id = ws.product_id AND p.is_active
  JOIN public.warehouses  w ON w.id = ws.warehouse_id AND w.is_active;

  -- Cobertura de custo.
  SELECT COUNT(*), COUNT(*) FILTER (WHERE unit_cost > 0)
    INTO v_ativos, v_com_custo
  FROM public.mrp_products WHERE is_active;

  -- Capital parado (dead stock): estoque > 0 e SEM nenhuma movimentação em 90d.
  WITH stock_by_prod AS (
    SELECT ws.product_id, SUM(ws.quantity) AS qty
    FROM public.warehouse_stock ws
    JOIN public.warehouses w ON w.id = ws.warehouse_id AND w.is_active
    GROUP BY ws.product_id
    HAVING SUM(ws.quantity) > 0
  )
  SELECT COALESCE(SUM(sbp.qty * p.unit_cost), 0)
    INTO v_valor_parado
  FROM stock_by_prod sbp
  JOIN public.mrp_products p ON p.id = sbp.product_id AND p.is_active
  WHERE NOT EXISTS (
    SELECT 1 FROM public.stock_movements m
    WHERE m.product_id = sbp.product_id AND m.created_at >= v_cut90
  );

  -- Risco de ruptura: produto × hub ativo; mínimo efetivo = ops_stock_min do par,
  -- com fallback p/ safety_stock_qty; conta e valoriza o gap (qtd < mínimo).
  WITH hubs AS (
    SELECT id FROM public.warehouses WHERE is_active
  ),
  eff AS (
    SELECT
      p.unit_cost,
      COALESCE(sm.min_qty, p.safety_stock_qty) AS emin,
      COALESCE(ws.quantity, 0)                 AS qty
    FROM public.mrp_products p
    CROSS JOIN hubs h
    LEFT JOIN public.ops_stock_min  sm ON sm.product_id = p.id AND sm.warehouse_id = h.id
    LEFT JOIN public.warehouse_stock ws ON ws.product_id = p.id AND ws.warehouse_id = h.id
    WHERE p.is_active
  )
  SELECT
    COALESCE(SUM((emin - qty) * unit_cost) FILTER (WHERE emin > 0 AND qty < emin), 0),
    COUNT(*) FILTER (WHERE emin > 0 AND qty < emin),
    COUNT(*) FILTER (WHERE emin > 0 AND qty = 0)
    INTO v_risco_valor, v_risco_qtd, v_risco_critico
  FROM eff;

  -- Valor em trânsito (mesma semântica do front: não entregue/cancelado/
  -- rejeitado, dentro de 180d).
  SELECT COALESCE(SUM(t.quantity * p.unit_cost), 0)
    INTO v_transito
  FROM public.stock_transfers t
  JOIN public.mrp_products p ON p.id = t.product_id AND p.is_active
  WHERE t.created_at >= v_cut180
    AND t.status NOT IN ('executed', 'cancelled', 'rejected');

  INSERT INTO public.suprimentos_snapshots (
    snapshot_date, valor_total, valor_parado, risco_valor, risco_qtd,
    risco_critico, valor_em_transito, produtos_ativos, produtos_com_custo
  ) VALUES (
    current_date, v_valor_total, v_valor_parado, v_risco_valor, v_risco_qtd,
    v_risco_critico, v_transito, v_ativos, v_com_custo
  )
  ON CONFLICT (snapshot_date) DO UPDATE SET
    valor_total        = EXCLUDED.valor_total,
    valor_parado       = EXCLUDED.valor_parado,
    risco_valor        = EXCLUDED.risco_valor,
    risco_qtd          = EXCLUDED.risco_qtd,
    risco_critico      = EXCLUDED.risco_critico,
    valor_em_transito  = EXCLUDED.valor_em_transito,
    produtos_ativos    = EXCLUDED.produtos_ativos,
    produtos_com_custo = EXCLUDED.produtos_com_custo,
    created_at         = now();
END;
$$;

-- ── Agendamento diário (08:00 UTC = 05:00 BRT) ───────────────────────────────
DO $$
DECLARE j record;
BEGIN
  FOR j IN SELECT jobid FROM cron.job WHERE jobname = 'suprimentos-daily-snapshot' LOOP
    PERFORM cron.unschedule(j.jobid);
  END LOOP;
END $$;

SELECT cron.schedule(
  'suprimentos-daily-snapshot',
  '0 8 * * *',
  $cmd$ SELECT public.capture_suprimentos_snapshot(); $cmd$
);

-- Semeia o primeiro ponto agora (idempotente: upsert no dia de hoje).
SELECT public.capture_suprimentos_snapshot();
