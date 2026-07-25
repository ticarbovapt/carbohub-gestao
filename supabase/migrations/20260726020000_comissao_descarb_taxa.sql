-- ─────────────────────────────────────────────────────────────────────────────
-- Comissão de DESCARBONIZAÇÃO com percentual PRÓPRIO.
--
-- Antes: um % único aplicado sobre (produto + descarbonização). Só funcionaria
-- se a comissão fosse igual nos dois — e não é: produto comissiona sobre o
-- faturamento (depois da NF) e descarbonização sobre a venda (sem NF), com
-- percentual diferente.
--
-- Agora: duas taxas independentes, e o fechamento guarda o detalhamento pra
-- ficar auditável (quanto veio de cada base, com qual %).
-- ─────────────────────────────────────────────────────────────────────────────

-- 1) Regra: cada vendedor (e o padrão) ganha um % de descarbonização ----------
alter table public.commission_rules
  add column if not exists rate_descarb_pct numeric(7,3) not null default 0;

comment on column public.commission_rules.rate_descarb_pct is
  '% de comissão sobre DESCARBONIZAÇÃO (serviço, sem NF). Independente de rate_pct.';
comment on column public.commission_rules.rate_pct is
  '% de comissão sobre PRODUTO faturado (carbozé/carbopró, com NF).';

-- 2) Fechamento: guarda a composição, não só o total ------------------------
alter table public.commission_statements
  add column if not exists base_produto      numeric(14,2) not null default 0,
  add column if not exists base_descarb      numeric(14,2) not null default 0,
  add column if not exists rate_descarb_pct  numeric(7,3)  not null default 0,
  add column if not exists amount_produto    numeric(14,2) not null default 0,
  add column if not exists amount_descarb    numeric(14,2) not null default 0;

comment on column public.commission_statements.base_produto is
  'Parte da base vinda de venda faturada (com NF).';
comment on column public.commission_statements.base_descarb is
  'Parte da base vinda de descarbonização (serviço, sem NF).';
comment on column public.commission_statements.rate_descarb_pct is
  '% aplicado sobre a base de descarbonização.';
comment on column public.commission_statements.base_sales is
  'Base TOTAL (produto + descarbonização). Mantida para compatibilidade.';

-- Fechamentos antigos: tudo que existe hoje veio de produto faturado.
update public.commission_statements
   set base_produto   = base_sales,
       amount_produto = amount_due
 where base_produto = 0
   and base_sales   > 0;
