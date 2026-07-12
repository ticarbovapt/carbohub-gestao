-- Backfill do nome do fornecedor nas contas a pagar importadas do Bling que
-- ficaram como "Fornecedor não identificado". A listagem /contas/pagar do Bling
-- traz o contato só com id; o nome resolvemos por bling_contacts (tipoContato=F,
-- já sincronizado). O bling_raw guardou o objeto conta, então dá pra pegar o
-- contato.id de lá. Idempotente — só toca no que está sem nome.

-- 1) Nome que porventura veio direto no bling_raw.
UPDATE public.purchase_payables p
SET supplier_name = COALESCE(
      NULLIF(btrim(p.bling_raw->'contato'->>'nome'), ''),
      NULLIF(btrim(p.bling_raw->'contato'->>'fantasia'), '')
    )
WHERE p.source = 'bling'
  AND (p.supplier_name IS NULL OR p.supplier_name = 'Fornecedor não identificado')
  AND COALESCE(
        NULLIF(btrim(p.bling_raw->'contato'->>'nome'), ''),
        NULLIF(btrim(p.bling_raw->'contato'->>'fantasia'), '')
      ) IS NOT NULL;

-- 2) Resolve pelo id do contato → bling_contacts.
UPDATE public.purchase_payables p
SET supplier_name = c.nome
FROM public.bling_contacts c
WHERE p.source = 'bling'
  AND (p.supplier_name IS NULL OR p.supplier_name = 'Fornecedor não identificado')
  AND (p.bling_raw->'contato'->>'id') ~ '^[0-9]+$'
  AND c.bling_id = (p.bling_raw->'contato'->>'id')::bigint
  AND NULLIF(btrim(c.nome), '') IS NOT NULL;

-- 3) Alguns lançamentos trazem o contato sob "fornecedor".
UPDATE public.purchase_payables p
SET supplier_name = c.nome
FROM public.bling_contacts c
WHERE p.source = 'bling'
  AND (p.supplier_name IS NULL OR p.supplier_name = 'Fornecedor não identificado')
  AND (p.bling_raw->'fornecedor'->>'id') ~ '^[0-9]+$'
  AND c.bling_id = (p.bling_raw->'fornecedor'->>'id')::bigint
  AND NULLIF(btrim(c.nome), '') IS NOT NULL;

-- Também vincula ao cadastro-mestre de fornecedores (suppliers) por nome, pra o
-- supplier_id e os relatórios agruparem certo.
UPDATE public.purchase_payables p
SET supplier_id = s.id
FROM public.suppliers s
WHERE p.supplier_id IS NULL
  AND p.supplier_name IS NOT NULL
  AND p.supplier_name <> 'Fornecedor não identificado'
  AND lower(btrim(p.supplier_name)) = lower(btrim(s.name));
