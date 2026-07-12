-- Fornecedor como referência ao cadastro (suppliers) no fluxo de compras.
-- supplier_id é OPCIONAL (não força), mas quando presente elimina a duplicação
-- por nome ("Acme" vs "Acme LTDA") nos relatórios. supplier_name continua pra
-- exibição/histórico. Backfill best-effort casa pelo nome normalizado.
ALTER TABLE public.purchase_quotes   ADD COLUMN IF NOT EXISTS supplier_id UUID REFERENCES public.suppliers(id);
ALTER TABLE public.purchase_orders   ADD COLUMN IF NOT EXISTS supplier_id UUID REFERENCES public.suppliers(id);
ALTER TABLE public.purchase_payables ADD COLUMN IF NOT EXISTS supplier_id UUID REFERENCES public.suppliers(id);

UPDATE public.purchase_orders o SET supplier_id = s.id
  FROM public.suppliers s
  WHERE o.supplier_id IS NULL AND o.supplier_name IS NOT NULL
    AND lower(btrim(o.supplier_name)) = lower(btrim(s.name));

UPDATE public.purchase_payables p SET supplier_id = s.id
  FROM public.suppliers s
  WHERE p.supplier_id IS NULL AND p.supplier_name IS NOT NULL
    AND lower(btrim(p.supplier_name)) = lower(btrim(s.name));

UPDATE public.purchase_quotes q SET supplier_id = s.id
  FROM public.suppliers s
  WHERE q.supplier_id IS NULL AND q.supplier_name IS NOT NULL
    AND lower(btrim(q.supplier_name)) = lower(btrim(s.name));
