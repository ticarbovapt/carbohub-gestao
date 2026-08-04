-- Receita realizada na view do Caminho 1 (Raw DB)
--
-- Contexto: o dashboard de e-commerce compara dois caminhos independentes —
-- Caminho 1 lê esta view, Caminho 2 agrega no front (useDashEcommerce.ts). A
-- "Verificação de Integridade" só tem valor se os dois medirem A MESMA COISA.
--
-- O front passou a somar receita pela lista BRANCA (ecommerce_status_e_venda:
-- paid | shipped | delivered), porque `total_revenue` aqui soma TUDO — inclusive
-- pedido cancelado e pedido que ainda não foi pago. Sem esta migração o check
-- passaria a acusar divergência permanente, treinando todo mundo a ignorá-lo.
--
-- `total_revenue` fica como está (bruto) para não quebrar quem já lê a coluna;
-- as quatro colunas novas separam o que entrou do que não entrou.
--
-- ⚠️ ORDEM DAS COLUNAS: CREATE OR REPLACE VIEW só aceita colunas NOVAS no FIM.
-- As dez primeiras têm de ficar exatamente como estavam — inserir no meio dá
-- "cannot change name of view column". Coluna nova entra depois de sale_orders.

CREATE OR REPLACE VIEW ecommerce_raw_summary AS
SELECT
  -- ── colunas originais, ordem preservada ──────────────────────────────────
  platform,
  ordered_at::date                                          AS day,
  COUNT(*)                                                  AS total_orders,
  COALESCE(SUM(quantity),    0)::int                        AS total_quantity,
  COALESCE(SUM(units_real),  0)::int                        AS total_units_real,
  COALESCE(SUM(total),       0)::numeric                    AS total_revenue,
  COUNT(*) FILTER (WHERE status = 'cancelled')::int         AS cancelled_orders,
  COUNT(*) FILTER (WHERE status = 'pending')::int           AS pending_orders,
  COUNT(*) FILTER (WHERE status = 'shipped')::int           AS shipped_orders,
  COUNT(*) FILTER (WHERE status = 'delivered')::int         AS delivered_orders,
  -- ── novas, sempre no fim ─────────────────────────────────────────────────
  -- Receita que de fato entrou. Mesma regra do Caminho 2.
  COALESCE(SUM(total) FILTER (WHERE public.ecommerce_status_e_venda(status)), 0)::numeric
                                                            AS sale_revenue,
  COALESCE(SUM(total) FILTER (WHERE status = 'cancelled'), 0)::numeric
                                                            AS cancelled_revenue,
  -- Tudo que não é venda nem cancelamento: pendente e status ainda não mapeado.
  COALESCE(SUM(total) FILTER (
    WHERE NOT public.ecommerce_status_e_venda(status) AND status IS DISTINCT FROM 'cancelled'
  ), 0)::numeric                                            AS pending_revenue,
  COUNT(*) FILTER (WHERE public.ecommerce_status_e_venda(status))::int
                                                            AS sale_orders
FROM ecommerce_orders
GROUP BY platform, ordered_at::date;

GRANT SELECT ON ecommerce_raw_summary TO authenticated;

COMMENT ON VIEW ecommerce_raw_summary IS
  'Caminho 1 do dashboard de e-commerce. total_revenue = bruto (tudo); '
  'sale_revenue = só o que a lista branca ecommerce_status_e_venda() aceita.';
