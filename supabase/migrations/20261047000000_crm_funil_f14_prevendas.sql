-- =====================================================================
-- Pré-Vendas (f14) — a pipeline dos SDRs, no app prevendas.carbohub.com.br
--
-- A tabela é a MESMA do Sales (`crm_sales_leads`), de propósito: é o que faz o
-- repasse da coluna "Oportunidade Qualificada" funcionar sem código novo — a
-- RPC `crm_sales_lead_repassar` copia o card para o Inbound (f11) do closer
-- com toda a timeline, e grava `origin_funnel_type = 'f14'`.
--
-- Só falta o CHECK de `funnel_type` aceitar o f14. Sem isto, criar lead no
-- Pré-Vendas falha com 23514 — a mesma lição da `20260715180000`, quando o
-- CHECK parou no f8 e criar lead em f9..f12 falhava.
--
-- ⚠️ NÃO entram linhas em `crm_stage_sla`: prazo por etapa é decisão do
-- gerente comercial, não do código. Sem linha, a etapa não tem prazo.
-- =====================================================================

-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 0 — todo CHECK que lista funis (pergunte ao banco)           ║
-- ╚═══════════════════════════════════════════════════════════════════╝
-- ESPERADO: UMA linha, crm_sales_leads_funnel_type_check, com f1..f13.
-- Se vier valor a mais (f14 já existe, ou outro funil), NÃO rode o bloco 1:
-- ele reescreveria a lista e apagaria a diferença.
select c.relname, con.conname, pg_get_constraintdef(con.oid)
from pg_constraint con
join pg_class c on c.oid = con.conrelid
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and con.contype = 'c'
  and pg_get_constraintdef(con.oid) ilike '%f13%'
order by 1;

-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 1 — o CHECK aceita o f14                                     ║
-- ╚═══════════════════════════════════════════════════════════════════╝
set lock_timeout = '5s';
alter table public.crm_sales_leads drop constraint if exists crm_sales_leads_funnel_type_check;
alter table public.crm_sales_leads
  add constraint crm_sales_leads_funnel_type_check
  check (funnel_type in ('f1','f2','f3','f4','f5','f6','f7','f8','f9','f10','f11','f12','f13','f14'));
reset lock_timeout;

-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║ CONFERÊNCIA                                                        ║
-- ╚═══════════════════════════════════════════════════════════════════╝
-- ESPERADO: a definição terminando em 'f13'::text, 'f14'::text.
select pg_get_constraintdef(oid)
from pg_constraint where conname = 'crm_sales_leads_funnel_type_check';
