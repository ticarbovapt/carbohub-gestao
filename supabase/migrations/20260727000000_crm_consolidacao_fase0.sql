-- ─────────────────────────────────────────────────────────────────────────────
-- Consolidação das pipelines do CRM — FASE 0 (invisível, reversível).
--
-- Objetivo: preparar terreno SEM mudar nada na tela. Só acrescenta colunas e
-- preenche a partir do que já existe. Desfazer = dropar as colunas.
--
-- Contexto: 12 pipelines viram 3 (Outbound, Follow up, Inbound). O que o lead É
-- (PDV CarboZé, frotista, licenciado…) deixa de ser pipeline e vira SEGMENTO,
-- visível como etiqueta no card.
--
-- ⚠️ Nada aqui altera funnel_type ou stage. A virada é a Fase 3.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1) Rede de segurança: de onde o lead veio (o que permite desfazer) ---------
alter table public.crm_sales_leads
  add column if not exists legacy_funnel_type text,
  add column if not exists legacy_stage       text,
  add column if not exists lead_segment       text;

comment on column public.crm_sales_leads.legacy_funnel_type is
  'Funil de origem antes da consolidação. NÃO sobrescrever — é o rollback e a base dos relatórios históricos.';
comment on column public.crm_sales_leads.legacy_stage is
  'Etapa antes da consolidação. O remap é muitos-para-um, então sem isso não há como reverter.';
comment on column public.crm_sales_leads.lead_segment is
  'O que o lead É (pdv_carboze, frotista, licenciado…). Substitui o funil como recorte.';

-- Segmentos válidos — um por lead (é o tipo da entidade, mutuamente exclusivo).
alter table public.crm_sales_leads drop constraint if exists crm_sales_leads_lead_segment_check;
alter table public.crm_sales_leads
  add constraint crm_sales_leads_lead_segment_check
  check (lead_segment is null or lead_segment in (
    'venda_direta','licenciado','frotista','pdv_carboze','pdv_carbopro',
    'frotista_lic','motores','estoque_comb','subdistribuidor','a_definir'
  ));

create index if not exists idx_crm_sales_leads_segment
  on public.crm_sales_leads (lead_segment);

-- 2) Backfill: o segmento sai do funil atual — ninguém precisa etiquetar à mão
update public.crm_sales_leads
   set legacy_funnel_type = coalesce(legacy_funnel_type, funnel_type),
       legacy_stage       = coalesce(legacy_stage, stage),
       lead_segment       = coalesce(lead_segment, case funnel_type
         when 'f1' then 'venda_direta'
         when 'f2' then 'licenciado'
         when 'f3' then 'frotista'
         when 'f4' then 'pdv_carboze'
         when 'f5' then 'pdv_carbopro'
         when 'f6' then 'frotista_lic'
         when 'f7' then 'motores'
         when 'f8' then 'estoque_comb'
         when 'f9' then 'subdistribuidor'
         -- Outbound/Follow up/Inbound não tinham esse recorte: entram como
         -- "A definir" (nunca NULL — NULL some da tela e apodrece; "A definir"
         -- é um chip com contador que o gestor consegue zerar).
         else 'a_definir'
       end)
 where legacy_funnel_type is null
    or legacy_stage is null
    or lead_segment is null;

-- 3) Diário da migração — auditoria linha a linha e rollback seletivo --------
create table if not exists public.crm_lead_migracao_funil (
  id           uuid primary key default gen_random_uuid(),
  lead_id      uuid not null,
  old_funnel   text,
  old_stage    text,
  new_funnel   text,
  new_stage    text,
  segmento     text,
  migrated_at  timestamptz not null default now()
);
create index if not exists idx_crm_lead_migracao_lead
  on public.crm_lead_migracao_funil (lead_id);

alter table public.crm_lead_migracao_funil enable row level security;

drop policy if exists crm_migracao_select on public.crm_lead_migracao_funil;
create policy crm_migracao_select on public.crm_lead_migracao_funil
  for select to authenticated using (true);

-- 4) Conferência ------------------------------------------------------------
-- select lead_segment, count(*) from public.crm_sales_leads group by 1 order by 2 desc;
-- Esperado: nenhum NULL, e a soma = total de leads.
