-- Fase 3 (timestamps que faltavam): carimbo de quando a RC foi ENVIADA pra
-- aprovação. Sem isso, o "tempo em fila de aprovação" e o ciclo "RC → aprovação"
-- usavam created_at (data de criação), que não é o mesmo que envio.
ALTER TABLE public.purchase_requests
  ADD COLUMN IF NOT EXISTS submitted_at timestamptz;

-- Backfill: pras RCs que já saíram de rascunho, aproxima o envio pela criação.
UPDATE public.purchase_requests
SET submitted_at = created_at
WHERE submitted_at IS NULL AND status <> 'rascunho';

-- Ciclo "RC → aprovação" passa a medir do ENVIO (submitted_at) até approved_at.
CREATE OR REPLACE FUNCTION public.fin_purchase_cycle_times()
RETURNS TABLE (etapa text, ordem int, media_dias numeric, p50_dias numeric, n bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH c AS (
    SELECT 'RC enviada → aprovação' AS etapa, 1 AS ordem,
           extract(epoch FROM (approved_at - coalesce(submitted_at, created_at))) / 86400.0 AS dias
    FROM public.purchase_requests WHERE approved_at IS NOT NULL
    UNION ALL
    SELECT 'OC → compra', 2, extract(epoch FROM (purchased_at - created_at)) / 86400.0
    FROM public.purchase_orders WHERE purchased_at IS NOT NULL
    UNION ALL
    SELECT 'OC → recebimento', 3, extract(epoch FROM (r.received_at - o.created_at)) / 86400.0
    FROM public.purchase_receivings r JOIN public.purchase_orders o ON o.id = r.purchase_order_id
    UNION ALL
    SELECT 'Recebimento → NF', 4, extract(epoch FROM (i.verified_at - r.received_at)) / 86400.0
    FROM public.purchase_invoices i JOIN public.purchase_receivings r ON r.id = i.receiving_id
    WHERE i.verified_at IS NOT NULL
  )
  SELECT etapa, ordem,
         round(avg(dias)::numeric, 1),
         round((percentile_cont(0.5) WITHIN GROUP (ORDER BY dias))::numeric, 1),
         count(*)::bigint
  FROM c WHERE dias >= 0 GROUP BY etapa, ordem ORDER BY ordem;
$$;
