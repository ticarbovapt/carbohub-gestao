-- ─────────────────────────────────────────────────────────────────────────────
-- Consolidação do CRM — libera o funil f13 "Comercial Expansão".
--
-- Decisão: em vez de despejar as 9 pipelines dentro do Outbound (que é SDR e
-- tem lógica própria de repasse ao closer), elas viram uma pipeline NOVA, com
-- colunas desenhadas pro que essas vendas realmente são: fechamento de
-- expansão. O Outbound fica intocado.
--
-- Só amplia o CHECK — nenhum lead é movido aqui. A virada é a fase 3.
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.crm_sales_leads drop constraint if exists crm_sales_leads_funnel_type_check;
alter table public.crm_sales_leads
  add constraint crm_sales_leads_funnel_type_check
  check (funnel_type in ('f1','f2','f3','f4','f5','f6','f7','f8','f9','f10','f11','f12','f13'));
