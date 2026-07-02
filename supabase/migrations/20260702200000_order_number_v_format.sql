-- ─────────────────────────────────────────────────────────────────────────────
-- Número da venda nativa: V + AAAA + MM + XXXX (sequência que reinicia por mês).
-- Ex.: V2026070001, V2026070002 ... V2026080001 (agosto reinicia).
-- É o ID que vai na OBSERVAÇÃO da NF e casa com a NF do Bling (bling-sync).
--
-- • Só afeta pedidos NOVOS (trigger dispara quando order_number vem vazio).
-- • Pedidos antigos PED-AAAA-NNNNN continuam válidos (o casamento aceita os dois).
-- • Pedidos vindos do Bling usam BLING-<numero> (namespace próprio, intocado).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.generate_order_number()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  ym text;
  next_seq integer;
BEGIN
  ym := to_char(now(), 'YYYYMM');   -- ex.: 202607
  SELECT COALESCE(MAX(
    CAST(SUBSTRING(order_number FROM '^V' || ym || '(\d{4})$') AS INTEGER)
  ), 0) + 1
  INTO next_seq
  FROM public.carboze_orders
  WHERE order_number LIKE 'V' || ym || '%';

  NEW.order_number := 'V' || ym || LPAD(next_seq::text, 4, '0');
  RETURN NEW;
END; $$;

-- O trigger já existe (BEFORE INSERT WHEN order_number vazio) — só troca a função.
