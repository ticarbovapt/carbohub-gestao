-- =============================================================
--  SEED: 13 meses (Mai/2025 → Mai/2026)
--  660 ML + 440 Amazon = 1.100 pedidos/mês → ~14.300 total
--  Limpar: DELETE FROM ecommerce_orders WHERE sync_source = 'test_12m';
-- =============================================================

DELETE FROM ecommerce_orders WHERE sync_source = 'test_12m';
DELETE FROM ecommerce_orders WHERE sync_source = 'test';

DO $$
DECLARE
  ml_skus   text[]    := ARRAY['MLB-001','MLB-002','MLB-003','MLB-004','MLB-005','MLB-006','MLB-007','MLB-008'];
  ml_names  text[]    := ARRAY[
    'Whey Protein 900g','Creatina Monohidratada 300g','BCAA 2:1:1 200g',
    'Pré-Treino Energy 300g','Glutamina Pura 500g','Colágeno Hidrolisado 300g',
    'Termogênico Black 60 caps','Hipercalórico Mass 3kg'
  ];
  ml_prices numeric[] := ARRAY[129.90,79.90,89.90,119.90,99.90,69.90,109.90,189.90];

  amz_skus   text[]    := ARRAY['AMZ-001','AMZ-002','AMZ-003','AMZ-004','AMZ-005','AMZ-006'];
  amz_names  text[]    := ARRAY[
    'Whey Isolado Premium 1kg','Creatina Ultra 400g','BCAA Instantâneo 300g',
    'Pré-Treino Extreme 250g','Cafeína 200mg 60 caps','Ômega 3 Fish Oil 120 caps'
  ];
  amz_prices numeric[] := ARRAY[159.90,89.90,99.90,134.90,49.90,74.90];

  month_start date;
  month_num   int;
  i           int;
  si          int;        -- sku index
  price       numeric;
  qty         int;
  units       int;
  stat        text;
  ord_at      timestamptz;
  o_id        text;
  seq         bigint := 0;
  is_current  boolean;
BEGIN
  -- month_num 0 = Mai/2025, month_num 12 = Mai/2026
  FOR month_num IN 0..12 LOOP
    month_start := ('2025-05-01'::date + (month_num || ' months')::interval)::date;
    is_current  := (month_num = 12);

    -- ── Mercado Livre: 660 pedidos ──
    FOR i IN 1..660 LOOP
      seq   := seq + 1;
      si    := 1 + (floor(random() * 8))::int;
      price := ml_prices[si] * (0.85 + random() * 0.30);
      qty   := CASE WHEN random() < 0.12 THEN 2 ELSE 1 END;
      units := qty * CASE WHEN random() < 0.20 THEN 2 ELSE 1 END;
      ord_at := (month_start
        + (floor(random() * 27) || ' days')::interval
        + (floor(random() * 86400) || ' seconds')::interval
      )::timestamptz AT TIME ZONE 'America/Sao_Paulo';

      IF is_current THEN
        stat := CASE
          WHEN random() < 0.05 THEN 'cancelled'
          WHEN random() < 0.40 THEN 'pending'
          WHEN random() < 0.65 THEN 'shipped'
          ELSE 'delivered' END;
      ELSE
        stat := CASE
          WHEN random() < 0.05 THEN 'cancelled'
          WHEN random() < 0.09 THEN 'pending'
          WHEN random() < 0.22 THEN 'shipped'
          ELSE 'delivered' END;
      END IF;

      o_id := 'ML-' || to_char(month_start, 'YYYYMM') || '-' || lpad(seq::text, 10, '0');

      INSERT INTO ecommerce_orders
        (platform, order_id, product_sku, product_name, quantity, units_real,
         unit_price, total, status, ordered_at, sync_source)
      VALUES
        ('mercadolivre', o_id, ml_skus[si], ml_names[si], qty, units,
         ROUND(price::numeric, 2), ROUND((price * qty)::numeric, 2),
         stat, ord_at, 'test_12m')
      ON CONFLICT (platform, order_id) DO NOTHING;
    END LOOP;

    -- ── Amazon: 440 pedidos ──
    FOR i IN 1..440 LOOP
      seq   := seq + 1;
      si    := 1 + (floor(random() * 6))::int;
      price := amz_prices[si] * (0.85 + random() * 0.30);
      qty   := CASE WHEN random() < 0.10 THEN 2 ELSE 1 END;
      units := qty * CASE WHEN random() < 0.18 THEN 2 ELSE 1 END;
      ord_at := (month_start
        + (floor(random() * 27) || ' days')::interval
        + (floor(random() * 86400) || ' seconds')::interval
      )::timestamptz AT TIME ZONE 'America/Sao_Paulo';

      IF is_current THEN
        stat := CASE
          WHEN random() < 0.05 THEN 'cancelled'
          WHEN random() < 0.40 THEN 'pending'
          WHEN random() < 0.65 THEN 'shipped'
          ELSE 'delivered' END;
      ELSE
        stat := CASE
          WHEN random() < 0.05 THEN 'cancelled'
          WHEN random() < 0.09 THEN 'pending'
          WHEN random() < 0.22 THEN 'shipped'
          ELSE 'delivered' END;
      END IF;

      o_id := 'AMZ-' || to_char(month_start, 'YYYYMM') || '-' || lpad(seq::text, 10, '0');

      INSERT INTO ecommerce_orders
        (platform, order_id, product_sku, product_name, quantity, units_real,
         unit_price, total, status, ordered_at, sync_source)
      VALUES
        ('amazon', o_id, amz_skus[si], amz_names[si], qty, units,
         ROUND(price::numeric, 2), ROUND((price * qty)::numeric, 2),
         stat, ord_at, 'test_12m')
      ON CONFLICT (platform, order_id) DO NOTHING;
    END LOOP;

  END LOOP;

  RAISE NOTICE 'Seed concluído. Total de pedidos gerados: %', seq;
END $$;

-- ── Verificação final ──
SELECT
  to_char(date_trunc('month', ordered_at), 'Mon/YY') AS mes,
  platform,
  COUNT(*)                             AS pedidos,
  SUM(units_real)                      AS unidades,
  ROUND(SUM(total)::numeric, 2)        AS receita,
  COUNT(*) FILTER (WHERE status = 'cancelled') AS cancelados
FROM ecommerce_orders
WHERE sync_source = 'test_12m'
GROUP BY date_trunc('month', ordered_at), platform
ORDER BY date_trunc('month', ordered_at), platform;
