-- =============================================================
--  SEED: 12 meses de vendas (Mai/2025 → Mai/2026)
--  ~1.100 pedidos/mês  →  ~13.200 pedidos no total
--  Plataformas: mercadolivre (60 %) + amazon (40 %)
--  Para limpar: DELETE FROM ecommerce_orders WHERE sync_source = 'test_12m';
-- =============================================================

-- Apaga apenas os dados deste seed (não afeta dados reais)
DELETE FROM ecommerce_orders WHERE sync_source = 'test_12m';

DO $$
DECLARE
  -- --------------------------------------------------------
  -- Catálogo de produtos
  -- --------------------------------------------------------
  ml_skus   text[] := ARRAY[
    'MLB-001','MLB-002','MLB-003','MLB-004','MLB-005',
    'MLB-006','MLB-007','MLB-008','MLB-009','MLB-010'
  ];
  ml_names  text[] := ARRAY[
    'Suplemento Whey Protein 900g',
    'Creatina Monohidratada 300g',
    'BCAA 2:1:1 Powder 200g',
    'Pré-Treino Energy Blast 300g',
    'Glutamina Pura 500g',
    'Colágeno Hidrolisado 300g',
    'Termogênico Black 60 caps',
    'Hipercalórico Mass 3kg',
    'Multivitamínico Sport 60 caps',
    'Albumina Pura 500g'
  ];
  ml_prices numeric[] := ARRAY[
    129.90, 79.90, 89.90, 119.90, 99.90,
    69.90, 109.90, 189.90, 59.90, 64.90
  ];

  amz_skus  text[] := ARRAY[
    'AMZ-001','AMZ-002','AMZ-003','AMZ-004','AMZ-005',
    'AMZ-006','AMZ-007','AMZ-008'
  ];
  amz_names text[] := ARRAY[
    'Whey Isolado Premium 1kg',
    'Creatina Ultra 400g',
    'BCAA Instantâneo 300g',
    'Pré-Treino Extreme 250g',
    'Cafeína 200mg 60 caps',
    'Ômega 3 Fish Oil 120 caps',
    'Vitamina D3 2000UI 60 caps',
    'ZMA Recovery 60 caps'
  ];
  amz_prices numeric[] := ARRAY[
    159.90, 89.90, 99.90, 134.90, 49.90,
    74.90, 44.90, 54.90
  ];

  -- --------------------------------------------------------
  -- Distribuição de status por mês
  --   meses antigos: mais delivered, menos pending
  --   mês atual (mai/26): mais pending/shipped
  -- --------------------------------------------------------
  statuses       text[]   := ARRAY['delivered','delivered','delivered','shipped','pending','cancelled'];
  statuses_atual text[]   := ARRAY['delivered','shipped','shipped','pending','pending','cancelled'];

  -- --------------------------------------------------------
  -- Variáveis de loop
  -- --------------------------------------------------------
  m_start   date := '2025-05-01';
  m_end     date := '2026-05-31';
  cur_month date;
  cur_day   date;
  days_in_m int;
  is_current_month boolean;

  -- Por mês: 660 ML + 440 Amazon = 1100 total
  ml_per_month  int := 660;
  amz_per_month int := 440;

  -- Distribuição diária: base + ruído
  base_per_day_ml  numeric;
  base_per_day_amz numeric;
  orders_today_ml  int;
  orders_today_amz int;

  sku_idx   int;
  price     numeric;
  qty       int;
  units     int;
  stat      text;
  ord_at    timestamptz;
  o_id      text;
  i         int;
  day_iter  int;
  total_ml_placed int;
  total_amz_placed int;
  remaining_ml int;
  remaining_amz int;
BEGIN
  cur_month := m_start;

  WHILE cur_month <= m_end LOOP
    days_in_m := EXTRACT(DAY FROM (cur_month + interval '1 month - 1 day'))::int;
    is_current_month := (cur_month = '2026-05-01');

    base_per_day_ml  := ml_per_month::numeric  / days_in_m;
    base_per_day_amz := amz_per_month::numeric / days_in_m;

    total_ml_placed  := 0;
    total_amz_placed := 0;

    -- Loop por dia do mês
    FOR day_iter IN 1..days_in_m LOOP
      cur_day := cur_month + (day_iter - 1) * interval '1 day';

      -- Quantidade do dia com variação aleatória ±30%
      remaining_ml  := ml_per_month  - total_ml_placed;
      remaining_amz := amz_per_month - total_amz_placed;

      -- ML: distribui o restante pelo restante dos dias
      orders_today_ml  := GREATEST(0,
        LEAST(remaining_ml,
          ROUND((base_per_day_ml * (0.7 + random() * 0.6)))::int
        )
      );
      -- No último dia, coloca o que sobrou
      IF day_iter = days_in_m THEN
        orders_today_ml := remaining_ml;
      END IF;

      -- Amazon
      orders_today_amz := GREATEST(0,
        LEAST(remaining_amz,
          ROUND((base_per_day_amz * (0.7 + random() * 0.6)))::int
        )
      );
      IF day_iter = days_in_m THEN
        orders_today_amz := remaining_amz;
      END IF;

      total_ml_placed  := total_ml_placed  + orders_today_ml;
      total_amz_placed := total_amz_placed + orders_today_amz;

      -- Inserir pedidos ML do dia
      FOR i IN 1..orders_today_ml LOOP
        sku_idx  := 1 + (floor(random() * array_length(ml_skus,  1)))::int;
        price    := ml_prices[sku_idx] * (0.88 + random() * 0.24);  -- ±12%
        qty      := 1 + (CASE WHEN random() < 0.15 THEN floor(random()*3)::int ELSE 0 END);
        units    := qty * (1 + (CASE WHEN random() < 0.2 THEN 1 ELSE 0 END));
        ord_at   := cur_day + (random() * interval '23 hours 59 minutes');

        IF is_current_month THEN
          stat := statuses_atual[1 + (floor(random() * 6))::int];
        ELSE
          stat := statuses[1 + (floor(random() * 6))::int];
        END IF;

        o_id := 'ML-' || to_char(cur_day, 'YYYYMMDD') || '-' ||
                lpad((floor(random()*99999 + i*13 + day_iter*7))::text, 8, '0');

        INSERT INTO ecommerce_orders
          (platform, order_id, product_sku, product_name, quantity, units_real,
           unit_price, total, status, ordered_at, sync_source)
        VALUES
          ('mercadolivre', o_id,
           ml_skus[sku_idx], ml_names[sku_idx],
           qty, units,
           ROUND(price::numeric, 2),
           ROUND((price * qty)::numeric, 2),
           stat, ord_at, 'test_12m')
        ON CONFLICT (platform, order_id) DO NOTHING;
      END LOOP;

      -- Inserir pedidos Amazon do dia
      FOR i IN 1..orders_today_amz LOOP
        sku_idx  := 1 + (floor(random() * array_length(amz_skus, 1)))::int;
        price    := amz_prices[sku_idx] * (0.88 + random() * 0.24);
        qty      := 1 + (CASE WHEN random() < 0.12 THEN floor(random()*2)::int ELSE 0 END);
        units    := qty * (1 + (CASE WHEN random() < 0.18 THEN 1 ELSE 0 END));
        ord_at   := cur_day + (random() * interval '23 hours 59 minutes');

        IF is_current_month THEN
          stat := statuses_atual[1 + (floor(random() * 6))::int];
        ELSE
          stat := statuses[1 + (floor(random() * 6))::int];
        END IF;

        o_id := 'AMZ-' || to_char(cur_day, 'YYYYMMDD') || '-' ||
                lpad((floor(random()*99999 + i*17 + day_iter*11))::text, 9, '0');

        INSERT INTO ecommerce_orders
          (platform, order_id, product_sku, product_name, quantity, units_real,
           unit_price, total, status, ordered_at, sync_source)
        VALUES
          ('amazon', o_id,
           amz_skus[sku_idx], amz_names[sku_idx],
           qty, units,
           ROUND(price::numeric, 2),
           ROUND((price * qty)::numeric, 2),
           stat, ord_at, 'test_12m')
        ON CONFLICT (platform, order_id) DO NOTHING;
      END LOOP;

    END LOOP; -- dias

    cur_month := cur_month + interval '1 month';
  END LOOP; -- meses

END $$;

-- Conferência: totais por mês e plataforma
SELECT
  to_char(date_trunc('month', ordered_at), 'Mon/YY') AS mes,
  platform,
  COUNT(*)                             AS pedidos,
  SUM(units_real)                      AS unidades,
  ROUND(SUM(total)::numeric, 2)        AS receita
FROM ecommerce_orders
WHERE sync_source = 'test_12m'
GROUP BY date_trunc('month', ordered_at), platform
ORDER BY date_trunc('month', ordered_at), platform;
