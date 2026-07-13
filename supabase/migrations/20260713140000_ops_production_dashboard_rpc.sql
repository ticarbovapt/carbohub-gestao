-- Dashboard de Produção server-side: antes o cliente puxava TODAS as
-- production_orders + ops_checklists e agregava em JS (cresce com o histórico).
-- Agora uma RPC STABLE devolve só os números prontos (jsonb).

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
    'opAtivas',     (SELECT count(*) FROM op WHERE op_status IN (
                      'rascunho','planejada','aguardando_separacao','separada','aguardando_liberacao',
                      'liberada_producao','em_producao','aguardando_confirmacao','aguardando_qualidade','bloqueada')),
    'opConcluidas', (SELECT count(*) FROM op WHERE op_status IN ('confirmada','concluida')),
    'statusCounts', (SELECT coalesce(jsonb_object_agg(s, c), '{}'::jsonb) FROM status_counts),
    'trend',        (SELECT coalesce(jsonb_agg(jsonb_build_object('d', d, 'criadas', criadas, 'concluidas', concluidas) ORDER BY d), '[]'::jsonb) FROM trend),
    'checklistsTotal',     (SELECT total FROM cl_stats),
    'etapasPendentes',     (SELECT etapas_pendentes FROM cl_stats),
    'checklistsCompletos', (SELECT completos FROM cl_stats),
    'recentChecklists',    (SELECT coalesce(jsonb_agg(jsonb_build_object('id', id, 'nome', nome, 'departamento', departamento, 'done', done, 'total', total)), '[]'::jsonb) FROM recent)
  );
$$;

GRANT EXECUTE ON FUNCTION public.ops_production_dashboard() TO authenticated;
