-- =====================================================================
-- Closer do Pré-Vendas (f15) — as MESMAS etapas do Inbound do Sales (f11),
-- numa pipeline independente, só no app prevendas.carbohub.com.br.
--
-- Três coisas:
--   1) o CHECK de funnel_type aceita o f15;
--   2) o repasse do SDR do Pré-Vendas (f14) passa a criar o card no f15, e
--      NÃO no Inbound do Sales. O Outbound (f12) continua indo para o f11;
--   3) os prazos por etapa do f15 nascem iguais aos do f11 ("a exata mesma
--      pipeline") — e o gestor os edita no Admin, separados.
--
-- ⚠️ A RPC NÃO é reescrita de memória. O bloco 2 pega a definição VIVA
-- (`pg_get_functiondef`), troca o único `'f11'` pelo CASE e reexecuta — dono
-- e grants ficam onde estão. Se o texto vivo não tiver EXATAMENTE uma
-- ocorrência, ele aborta sem mudar nada: a função de produção não é a que
-- este arquivo conhece, e aí a troca tem de ser revista, não forçada.
--
-- ⚠️ O CASE espelha `funilDoCloser()` em apps/*/src/types/crm.ts. Mudou um,
-- mude o outro: senão a tela diz "nasce no Closer" e o card aparece no Inbound.
-- =====================================================================

-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 0 — medir antes de mexer                                    ║
-- ╚═══════════════════════════════════════════════════════════════════╝
-- ESPERADO: ocorrencias_f11 = 1 · ja_tem_f15 = false · check_tem_f14 = true
select
  (length(d) - length(replace(d, '''f11''', ''))) / 5          as ocorrencias_f11,
  position('''f15''' in d) > 0                                   as ja_tem_f15,
  (select pg_get_constraintdef(oid) like '%''f14''%'
     from pg_constraint where conname = 'crm_sales_leads_funnel_type_check') as check_tem_f14
from (select pg_get_functiondef('public.crm_sales_lead_repassar(uuid,text)'::regprocedure) as d) x;

-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 1 — o CHECK aceita o f15                                     ║
-- ╚═══════════════════════════════════════════════════════════════════╝
set lock_timeout = '5s';
alter table public.crm_sales_leads drop constraint if exists crm_sales_leads_funnel_type_check;
alter table public.crm_sales_leads
  add constraint crm_sales_leads_funnel_type_check
  check (funnel_type in ('f1','f2','f3','f4','f5','f6','f7','f8','f9','f10','f11','f12','f13','f14','f15'));
reset lock_timeout;

-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 2 — o repasse do f14 cai no f15                              ║
-- ╚═══════════════════════════════════════════════════════════════════╝
do $$
declare
  d text := pg_get_functiondef('public.crm_sales_lead_repassar(uuid,text)'::regprocedure);
  n int  := (length(d) - length(replace(d, '''f11''', ''))) / 5;
begin
  if n <> 1 then
    raise exception 'Esperava UMA ocorrência de ''f11'' na RPC de repasse, achei %. Nada foi alterado.', n;
  end if;
  execute replace(d, '''f11''',
    'case when v_lead.funnel_type = ''f14'' then ''f15'' else ''f11'' end');
end $$;

-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 3 — prazos por etapa do f15 = os do f11                      ║
-- ╚═══════════════════════════════════════════════════════════════════╝
insert into public.crm_stage_sla (funnel_type, stage, prazo_dias)
select 'f15', stage, prazo_dias from public.crm_stage_sla where funnel_type = 'f11'
on conflict (funnel_type, stage) do nothing;

-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║ CONFERÊNCIA                                                        ║
-- ╚═══════════════════════════════════════════════════════════════════╝
-- ESPERADO: repasse_conhece_f15 = true · check_tem_f15 = true ·
--           prazos_f15 = prazos_f11 (o mesmo número)
select
  position('''f15''' in pg_get_functiondef('public.crm_sales_lead_repassar(uuid,text)'::regprocedure)) > 0 as repasse_conhece_f15,
  (select pg_get_constraintdef(oid) like '%''f15''%'
     from pg_constraint where conname = 'crm_sales_leads_funnel_type_check') as check_tem_f15,
  (select count(*) from public.crm_stage_sla where funnel_type = 'f15') as prazos_f15,
  (select count(*) from public.crm_stage_sla where funnel_type = 'f11') as prazos_f11;
