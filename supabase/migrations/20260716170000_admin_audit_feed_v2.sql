-- ─────────────────────────────────────────────────────────────────────────────
-- Central de Auditoria v2: eventos genéricos (order_audit) mais legíveis.
-- • UPDATE mostra QUAIS campos mudaram (ignorando ruído), em vez de só
--   "UPDATE em <tabela>".
-- • Ações traduzidas (Criou/Alterou/Excluiu registro).
-- • Quando não há usuário (auth.uid() nulo — ex.: sync do Bling via service role)
--   o autor vira "Sistema (automático)" no feed.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.admin_audit_feed(
  p_sources text[]     DEFAULT NULL,
  p_search  text       DEFAULT NULL,
  p_from    timestamptz DEFAULT NULL,
  p_to      timestamptz DEFAULT NULL,
  p_limit   int         DEFAULT 100,
  p_offset  int         DEFAULT 0
)
RETURNS TABLE (
  source text, category text, event_at timestamptz, actor_id uuid,
  actor_name text, action text, entity text, summary text, details jsonb
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.is_gestor(auth.uid()) THEN
    RAISE EXCEPTION 'Acesso restrito: somente gestores.' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH feed AS (
    SELECT 'crm_lead_deletion'::text, 'CRM'::text, d.deleted_at, d.deleted_by, d.deleted_by_name::text AS actor_raw,
           'Excluiu card'::text,
           COALESCE(d.legal_name, d.trade_name, d.cnpj, d.lead_id::text),
           'Excluiu card ' || COALESCE(d.legal_name, d.trade_name, d.cnpj, '—') ||
             ' (' || COALESCE(d.funnel_type, '?') || ' / ' || COALESCE(d.stage, '?') || ')',
           jsonb_build_object('cnpj', d.cnpj, 'valor', d.estimated_revenue, 'funil', d.funnel_type,
                              'etapa', d.stage, 'dono_original', d.lead_created_by)
    FROM public.crm_sales_lead_deletion_log d
    UNION ALL
    SELECT 'order_deletion', 'Vendas', o.deleted_at, o.deleted_by, o.deleted_by_name,
           'Excluiu venda',
           COALESCE(o.order_number, o.customer_name, o.order_id::text),
           'Excluiu venda ' || COALESCE(o.order_number, '—') || ' — ' || COALESCE(o.customer_name, '—'),
           jsonb_build_object('total', o.total, 'status', o.status, 'vendedor', o.vendedor_name, 'motivo', o.reason)
    FROM public.carboze_order_deletions o
    UNION ALL
    SELECT 'crm_lead_transfer', 'CRM', t.changed_at, t.changed_by, NULL::text,
           'Transferiu card',
           t.lead_id::text,
           'Transferiu card — de ' || COALESCE(pf.full_name, pf.username, '—') ||
             ' para ' || COALESCE(pt.full_name, pt.username, '—'),
           jsonb_build_object('lead_id', t.lead_id, 'de', t.from_user, 'para', t.to_user)
    FROM public.crm_sales_lead_owner_log t
      LEFT JOIN public.profiles pf ON pf.id = t.from_user
      LEFT JOIN public.profiles pt ON pt.id = t.to_user
    UNION ALL
    SELECT 'stock_movement', 'Estoque', s.created_at, s.created_by, NULL::text,
           CASE s.tipo WHEN 'entrada' THEN 'Entrada de estoque' WHEN 'saida' THEN 'Saída de estoque' ELSE s.tipo END,
           COALESCE(mp.name, s.product_id::text),
           INITCAP(COALESCE(s.tipo, 'mov.')) || ' ' || TRIM(TO_CHAR(s.quantidade, 'FM999G999G990D00')) ||
             ' un — ' || COALESCE(mp.name, 'produto') || ' (origem ' || COALESCE(s.origem, '?') || ')',
           jsonb_build_object('quantidade', s.quantidade, 'origem', s.origem, 'origem_id', s.origem_id,
                              'custo_medio_novo', s.custo_medio_novo, 'obs', s.observacoes)
    FROM public.stock_movements s
      LEFT JOIN public.mrp_products mp ON mp.id = s.product_id
    UNION ALL
    SELECT 'order_status', 'Vendas', h.created_at, h.changed_by, NULL::text,
           'Status da venda: ' || h.status::text,
           COALESCE(co.order_number, h.order_id::text),
           'Venda ' || COALESCE(co.order_number, '—') || ' → status ' || h.status::text,
           jsonb_build_object('order_id', h.order_id, 'status', h.status::text, 'notas', h.notes)
    FROM public.order_status_history h
      LEFT JOIN public.carboze_orders co ON co.id = h.order_id
    UNION ALL
    -- Auditoria genérica (order_audit_logs): mostra os campos que mudaram.
    SELECT 'order_audit',
           CASE WHEN a.table_name IN ('carboze_orders', 'carboze_order_items') THEN 'Vendas' ELSE 'Sistema' END,
           a.created_at, a.user_id, NULL::text,
           CASE a.action WHEN 'INSERT' THEN 'Criou registro' WHEN 'UPDATE' THEN 'Alterou registro'
                         WHEN 'DELETE' THEN 'Excluiu registro' ELSE a.action END,
           a.table_name || COALESCE(' #' || LEFT(a.record_id::text, 8), ''),
           CASE
             WHEN a.action = 'UPDATE' THEN
               'Alterou ' || a.table_name ||
               COALESCE(' — campos: ' || (
                 SELECT string_agg(o.key, ', ' ORDER BY o.key)
                 FROM jsonb_each(COALESCE(a.before_data, '{}'::jsonb)) o
                 JOIN jsonb_each(COALESCE(a.after_data, '{}'::jsonb)) n ON n.key = o.key
                 WHERE o.value IS DISTINCT FROM n.value
                   AND o.key <> ALL (ARRAY['last_login_at','updated_at','last_seen_at','last_active_at',
                                           'synced_at','last_synced_at','search_vector','last_app','last_app_at'])
               ), '')
             WHEN a.action = 'INSERT' THEN 'Criou ' || a.table_name
             WHEN a.action = 'DELETE' THEN 'Excluiu ' || a.table_name
             ELSE COALESCE(a.action, 'ação') || ' em ' || a.table_name
           END,
           jsonb_build_object('funcao', a.role, 'record_id', a.record_id, 'antes', a.before_data, 'depois', a.after_data)
    FROM public.order_audit_logs a
    UNION ALL
    SELECT 'os_stage', 'Produção', COALESCE(h.completed_at, h.created_at), h.completed_by, NULL::text,
           'Etapa OP: ' || h.status::text,
           COALESCE(so.os_number, h.service_order_id::text),
           'OP ' || COALESCE(so.os_number, '—') || ' — ' || h.department::text || ' → ' || h.status::text,
           jsonb_build_object('service_order_id', h.service_order_id, 'departamento', h.department::text,
                              'status', h.status::text, 'notas', h.notes)
    FROM public.os_stage_history h
      LEFT JOIN public.service_orders so ON so.id = h.service_order_id
    UNION ALL
    SELECT 'pdv_replenishment', 'PDV', r.created_at, r.replenished_by, NULL::text,
           'Reabastecimento PDV',
           r.pdv_id::text,
           'Reabasteceu PDV +' || r.quantity || ' un (' || r.previous_stock || ' → ' || r.new_stock || ')',
           jsonb_build_object('pdv_id', r.pdv_id, 'quantidade', r.quantity, 'antes', r.previous_stock,
                              'depois', r.new_stock, 'notas', r.notes)
    FROM public.pdv_replenishment_history r
    UNION ALL
    SELECT 'rc_approval', 'Compras', l.created_at, l.approver_id, NULL::text,
           CASE l.action WHEN 'approved' THEN 'Aprovou RC' WHEN 'rejected' THEN 'Rejeitou RC' ELSE l.action END,
           l.rc_id::text,
           'RC ' || LEFT(l.rc_id::text, 8) || ' — ' || l.action || ' (nível ' || l.nivel || ')',
           jsonb_build_object('rc_id', l.rc_id, 'acao', l.action, 'nivel', l.nivel, 'justificativa', l.justificativa)
    FROM public.rc_approval_logs l
    UNION ALL
    SELECT 'bling_sync', 'Bling', b.started_at, b.triggered_by, NULL::text,
           'Sync Bling: ' || b.status,
           b.entity_type,
           'Sincronização ' || b.entity_type || ' — ' || b.status ||
             ' (' || COALESCE(b.records_synced, 0) || ' ok / ' || COALESCE(b.records_failed, 0) || ' falhas)',
           jsonb_build_object('entidade', b.entity_type, 'status', b.status, 'sincronizados', b.records_synced,
                              'falhas', b.records_failed, 'erro', b.error_message)
    FROM public.bling_sync_log b
    UNION ALL
    SELECT 'employee_finance', 'Financeiro', e.changed_at, e.changed_by, NULL::text,
           'Dados financeiros RH: ' || e.action,
           e.employee_id::text,
           'Alteração financeira de funcionário (' || e.action || ')',
           jsonb_build_object('employee_id', e.employee_id, 'acao', e.action, 'antes', e.old_data, 'depois', e.new_data)
    FROM public.employee_finance_audit e
    UNION ALL
    SELECT 'flow_audit', 'Governança', fl.created_at, fl.user_id, NULL::text,
           'Fluxo: ' || fl.action_type,
           fl.resource_type || COALESCE(' #' || LEFT(fl.resource_id::text, 8), ''),
           COALESCE(fl.reason, fl.action_type),
           jsonb_build_object('acao', fl.action_type, 'recurso', fl.resource_type, 'recurso_id', fl.resource_id,
                              'severidade', fl.severity, 'departamento', fl.department, 'detalhes', fl.details)
    FROM public.flow_audit_logs fl
    UNION ALL
    SELECT 'governance', 'Governança', g.created_at, g.user_id, NULL::text,
           'Governança: ' || g.action_type,
           g.resource_type || COALESCE(' #' || LEFT(g.resource_id::text, 8), ''),
           g.action_type || ' em ' || g.resource_type,
           jsonb_build_object('acao', g.action_type, 'recurso', g.resource_type, 'recurso_id', g.resource_id,
                              'departamento', g.department, 'detalhes', g.details)
    FROM public.governance_audit_log g
    UNION ALL
    SELECT 'system_audit', 'Sistema', al.executed_at, al.executed_by, NULL::text,
           al.action_name,
           al.action_type,
           al.action_name || CASE WHEN al.success THEN '' ELSE ' (falhou)' END,
           COALESCE(al.details, '{}'::jsonb) ||
             jsonb_build_object('sucesso', al.success, 'erro', al.error_message, 'ip', al.ip_address)
    FROM public.audit_logs al
  ),
  resolved AS (
    SELECT f.source, f.category, f.event_at, f.actor_id,
           COALESCE(NULLIF(f.actor_raw, ''), pr.full_name, pr.username,
                    CASE WHEN f.actor_id IS NULL THEN 'Sistema (automático)' ELSE '—' END) AS actor_name,
           f.action, f.entity, f.summary, f.details
    FROM feed AS f (source, category, event_at, actor_id, actor_raw, action, entity, summary, details)
      LEFT JOIN public.profiles pr ON pr.id = f.actor_id
  )
  SELECT r.source, r.category, r.event_at, r.actor_id, r.actor_name, r.action, r.entity, r.summary, r.details
  FROM resolved r
  WHERE (p_from IS NULL OR r.event_at >= p_from)
    AND (p_to   IS NULL OR r.event_at <= p_to)
    AND (p_sources IS NULL OR r.source = ANY(p_sources))
    AND (
      p_search IS NULL OR p_search = '' OR
      r.summary ILIKE '%' || p_search || '%' OR
      COALESCE(r.entity, '')     ILIKE '%' || p_search || '%' OR
      COALESCE(r.actor_name, '') ILIKE '%' || p_search || '%'
    )
  ORDER BY r.event_at DESC
  LIMIT  GREATEST(1, LEAST(COALESCE(p_limit, 100), 500))
  OFFSET GREATEST(0, COALESCE(p_offset, 0));
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_audit_feed(text[], text, timestamptz, timestamptz, int, int) TO authenticated;

NOTIFY pgrst, 'reload schema';
