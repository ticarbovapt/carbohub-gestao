-- Correções da re-auditoria do Ops:
--  #2 Dashboard Comercial contava orçamentos (status='quote') como venda.
--  #5 KPI "OPs ativas" do Dashboard de Produção não batia com o kanban.
--  #3/#4 production_done multi-item: OP cancelada marcava pedido como produzido,
--       e op_reverse_all prendia o flag. Agora um TRIGGER recalcula sozinho:
--       "produzido" só quando há OP e TODAS estão concluídas (cancelada bloqueia).

-- ── #2 Comercial: exclui orçamento e trata status nulo ──────────────────────
CREATE OR REPLACE FUNCTION public.ops_comercial_dashboard(p_vendedor text DEFAULT 'all')
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH base AS (
    SELECT total, customer_name, vendedor_name,
           coalesce(sale_date, created_at::date) AS d
    FROM public.carboze_orders
    WHERE coalesce(status, '') NOT IN ('quote', 'cancelled')
  ),
  filt AS (
    SELECT * FROM base WHERE p_vendedor = 'all' OR coalesce(vendedor_name, '') = p_vendedor
  ),
  monthly AS (
    SELECT extract(year FROM d)::int AS y, extract(month FROM d)::int AS m,
           coalesce(sum(total), 0) AS faturado, count(*)::int AS pedidos
    FROM filt GROUP BY 1, 2
  ),
  cliente_cnt AS (
    SELECT coalesce(customer_name, '—') AS c, count(*)::int AS q
    FROM filt GROUP BY 1 ORDER BY q DESC LIMIT 1
  ),
  maior AS (
    SELECT coalesce(total, 0) AS t, coalesce(customer_name, '—') AS c
    FROM filt ORDER BY coalesce(total, 0) DESC LIMIT 1
  )
  SELECT jsonb_build_object(
    'vendedores', (SELECT coalesce(jsonb_agg(v ORDER BY v), '[]'::jsonb)
                   FROM (SELECT DISTINCT vendedor_name AS v FROM base WHERE vendedor_name IS NOT NULL) s),
    'monthly', (SELECT coalesce(jsonb_agg(jsonb_build_object('y', y, 'm', m, 'faturado', round(faturado), 'pedidos', pedidos) ORDER BY y, m), '[]'::jsonb) FROM monthly),
    'totalVendas',  (SELECT count(*) FROM filt),
    'totalBRL',     (SELECT coalesce(sum(total), 0) FROM filt),
    'maiorVenda',   (SELECT t FROM maior),
    'maiorCliente', (SELECT c FROM maior),
    'topCliente',   (SELECT c FROM cliente_cnt),
    'topQtd',       (SELECT q FROM cliente_cnt)
  );
$$;

-- ── #5 Produção: opAtivas = tudo que NÃO é terminal (bate com o kanban) ─────
CREATE OR REPLACE FUNCTION public.ops_production_dashboard()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH op AS (
    SELECT op_status, created_at, finished_at FROM public.production_orders
  ),
  status_counts AS (
    SELECT op_status AS s, count(*) AS c FROM op GROUP BY op_status
  ),
  trend AS (
    SELECT gs::date AS d,
      (SELECT count(*) FROM op WHERE op.created_at::date = gs::date)  AS criadas,
      (SELECT count(*) FROM op WHERE op.finished_at::date = gs::date) AS concluidas
    FROM generate_series(current_date - 6, current_date, interval '1 day') gs
  ),
  cl AS (
    SELECT id, nome, departamento, etapas, updated_at FROM public.ops_checklists
  ),
  cl_stats AS (
    SELECT
      count(*) AS total,
      coalesce(sum((
        SELECT count(*) FROM jsonb_array_elements(coalesce(cl.etapas, '[]'::jsonb)) e
        WHERE (e->>'concluida')::boolean IS NOT TRUE
      )), 0) AS etapas_pendentes,
      count(*) FILTER (
        WHERE jsonb_typeof(cl.etapas) = 'array' AND jsonb_array_length(cl.etapas) > 0
          AND NOT EXISTS (
            SELECT 1 FROM jsonb_array_elements(cl.etapas) e
            WHERE (e->>'concluida')::boolean IS NOT TRUE
          )
      ) AS completos
    FROM cl
  ),
  recent AS (
    SELECT id, nome, departamento,
      (SELECT count(*) FROM jsonb_array_elements(coalesce(cl.etapas, '[]'::jsonb)) e WHERE (e->>'concluida')::boolean IS TRUE) AS done,
      (SELECT count(*) FROM jsonb_array_elements(coalesce(cl.etapas, '[]'::jsonb))) AS total
    FROM cl ORDER BY updated_at DESC NULLS LAST LIMIT 8
  )
  SELECT jsonb_build_object(
    'opTotal',      (SELECT count(*) FROM op),
    'opAtivas',     (SELECT count(*) FROM op WHERE op_status NOT IN ('concluida', 'cancelada')),
    'opConcluidas', (SELECT count(*) FROM op WHERE op_status = 'concluida'),
    'statusCounts', (SELECT coalesce(jsonb_object_agg(s, c), '{}'::jsonb) FROM status_counts),
    'trend',        (SELECT coalesce(jsonb_agg(jsonb_build_object('d', d, 'criadas', criadas, 'concluidas', concluidas) ORDER BY d), '[]'::jsonb) FROM trend),
    'checklistsTotal',     (SELECT total FROM cl_stats),
    'etapasPendentes',     (SELECT etapas_pendentes FROM cl_stats),
    'checklistsCompletos', (SELECT completos FROM cl_stats),
    'recentChecklists',    (SELECT coalesce(jsonb_agg(jsonb_build_object('id', id, 'nome', nome, 'departamento', departamento, 'done', done, 'total', total)), '[]'::jsonb) FROM recent)
  );
$$;

-- ── #3/#4 production_done recalculado por TRIGGER (fonte única da verdade) ───
-- "produzido" = existe OP do pedido E todas estão 'concluida'. Cancelada NÃO
-- conta como produzida (bloqueia o selo), evitando separar item inexistente.
-- Só grava (e mexe em updated_at) quando o valor realmente muda.
CREATE OR REPLACE FUNCTION public.op_sync_production_done(p_order_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_done boolean;
BEGIN
  IF p_order_id IS NULL THEN RETURN; END IF;
  SELECT EXISTS (SELECT 1 FROM public.production_orders WHERE source_order_id = p_order_id)
     AND NOT EXISTS (SELECT 1 FROM public.production_orders WHERE source_order_id = p_order_id AND op_status <> 'concluida')
    INTO v_done;
  UPDATE public.carboze_orders
    SET production_done = v_done, updated_at = now()
    WHERE id = p_order_id AND production_done IS DISTINCT FROM v_done;
END $$;

CREATE OR REPLACE FUNCTION public.trg_sync_production_done()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.op_sync_production_done(coalesce(NEW.source_order_id, OLD.source_order_id));
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS trg_sync_production_done ON public.production_orders;
CREATE TRIGGER trg_sync_production_done
AFTER INSERT OR DELETE OR UPDATE OF op_status ON public.production_orders
FOR EACH ROW EXECUTE FUNCTION public.trg_sync_production_done();

-- op_conclude: remove o cálculo inline de production_done (o trigger cuida).
-- Mantém só o crédito do produto + stock_credited no pedido.
CREATE OR REPLACE FUNCTION public.op_conclude(
  p_op_id uuid, p_good numeric, p_rejected numeric, p_consumption jsonb
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_pid uuid; v_src uuid;
  it jsonb; ins uuid; actual numeric; deducted numeric; theo numeric; un text; loss numeric; adj numeric;
BEGIN
  UPDATE public.production_orders
    SET good_quantity = p_good, rejected_quantity = p_rejected,
        op_status = 'concluida', finished_at = now(), product_credited = true
    WHERE id = p_op_id AND op_status <> 'concluida'
    RETURNING product_id, source_order_id INTO v_pid, v_src;
  IF NOT FOUND THEN RETURN; END IF;

  IF p_consumption IS NOT NULL THEN
    FOR it IN SELECT jsonb_array_elements(p_consumption) LOOP
      ins := nullif(it->>'insumo_id', '')::uuid;
      IF ins IS NULL THEN CONTINUE; END IF;
      actual := coalesce((it->>'actual_qty')::numeric, 0);
      theo   := coalesce((it->>'theoretical_qty')::numeric, 0);
      un     := it->>'unit';
      loss   := greatest(0, actual - theo);
      SELECT -coalesce(sum(delta), 0) INTO deducted
        FROM public.op_stock_ledger WHERE op_id = p_op_id AND product_id = ins;
      INSERT INTO public.op_material_loss (op_id, insumo_id, theoretical_qty, actual_qty, loss_qty, unit)
        VALUES (p_op_id, ins, theo, actual, loss, un);
      adj := deducted - actual;
      PERFORM public.op_apply_delta(p_op_id, ins, adj, 'conclusao_ajuste');
    END LOOP;
  END IF;

  IF v_pid IS NOT NULL AND p_good > 0 THEN
    PERFORM public.op_apply_delta(p_op_id, v_pid, p_good, 'conclusao_produto');
  END IF;

  -- production_done é recalculado pelo trigger no UPDATE de op_status acima.
  IF v_src IS NOT NULL THEN
    UPDATE public.carboze_orders SET stock_credited = true, updated_at = now() WHERE id = v_src;
  END IF;
END $$;

-- op_reverse_all: remove o reset manual de production_done (o trigger cuida ao
-- mudar o status / excluir a OP). Mantém o estorno de estoque intacto.
CREATE OR REPLACE FUNCTION public.op_reverse_all(p_op_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT product_id, warehouse_id, sum(delta) AS d
      FROM public.op_stock_ledger WHERE op_id = p_op_id
      GROUP BY product_id, warehouse_id HAVING sum(delta) <> 0
  LOOP
    UPDATE public.warehouse_stock
      SET quantity = quantity - r.d, updated_at = now()
      WHERE warehouse_id = r.warehouse_id AND product_id = r.product_id;
  END LOOP;
  DELETE FROM public.op_stock_ledger WHERE op_id = p_op_id;
  DELETE FROM public.op_material_loss WHERE op_id = p_op_id;
  UPDATE public.production_orders
    SET materials_deducted = false, product_credited = false, production_route = NULL
    WHERE id = p_op_id;
END $$;

GRANT EXECUTE ON FUNCTION public.op_sync_production_done(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.op_conclude(uuid, numeric, numeric, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.op_reverse_all(uuid) TO authenticated;
