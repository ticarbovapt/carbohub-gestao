-- ─────────────────────────────────────────────────────────────────────────────
-- Consolidação do CRM — FASE 3: A VIRADA.
--
-- Move as 9 pipelines (f1..f9) para a nova "Comercial Expansão" (f13) e remapeia
-- as etapas para o vocabulário único. Outbound (f12), Follow up (f10) e Inbound
-- (f11) NÃO são tocados.
--
-- ⚠️ RODE TUDO DE UMA VEZ. É uma transação só: ou vira inteiro, ou não vira.
--
-- Por que os triggers são desligados (isto NÃO é otimização, é correção):
--   • trg_crm_sales_leads_touch reescreve updated_at = now() em toda linha
--     tocada. Sem desligar, TODOS os leads passariam a marcar "0 dias sem
--     atividade" — morre o alerta ">3d", a borda vermelha do card e o KPI.
--   • crm_sales_lead_auto_task_trg dispara a cada troca de stage e criaria ~60
--     tarefas "Automação" fantasma, sem dono (auth.uid() é nulo no SQL Editor).
--
-- Rollback: os valores antigos estão em legacy_funnel_type / legacy_stage
-- (gravados na fase 0) e o diário linha a linha em crm_lead_migracao_funil.
-- O script de reversão está no rodapé, comentado.
-- ─────────────────────────────────────────────────────────────────────────────

begin;

-- 1) Desliga os gatilhos que corromperiam o dado durante o UPDATE em massa.
--    USER (em vez do nome) porque o schema real derivou do repositório.
alter table public.crm_sales_leads disable trigger user;

-- 2) Garante o snapshot mesmo em linha criada depois da fase 0.
update public.crm_sales_leads
   set legacy_funnel_type = coalesce(legacy_funnel_type, funnel_type),
       legacy_stage       = coalesce(legacy_stage, stage)
 where funnel_type in ('f1','f2','f3','f4','f5','f6','f7','f8','f9');

-- 3) O de-para de etapas, numa CTE só ---------------------------------------
--    Os ids do f13 foram escolhidos entre os mais usados nas 9 origens, então a
--    maioria das linhas cai em "no-op" e nem entra no UPDATE.
create temporary table _remap on commit drop as
select l.id                                            as lead_id,
       l.funnel_type                                   as old_funnel,
       l.stage                                         as old_stage,
       case
         -- Entrada
         when l.stage in ('a_contatar','novo')                              then 'a_contatar'
         -- Em contato (tentativas, reagendar e contatado convergem aqui)
         when l.stage in ('contato','contatado','tentativa_1','tentativa_2',
                          'reagendar')                                      then 'contato'
         -- Qualificado (diagnóstico e POC das contas enterprise)
         when l.stage in ('qualificado','diagnostico','poc')                then 'qualificado'
         -- Reunião / visita
         when l.stage in ('visita_agendada','apresentacao')                 then 'visita_agendada'
         -- Proposta / negociação (proposta e negociação foram fundidas)
         when l.stage in ('em_negociacao','negociacao','proposta',
                          'proposta_tecnica')                               then 'em_negociacao'
         -- Ganho — decisão do dono: Contrato e Pedido Inicial contam como venda
         when l.stage in ('convertido','parceiro','fechamento','ganho',
                          'contrato','pedido_inicial')                      then 'convertido'
         -- Perdido
         when l.stage in ('sem_interesse','descartado','perdido')           then 'sem_interesse'
         -- Rede: etapa desconhecida vai pro meio do quadro, nunca pro início
         -- (mandar um lead trabalhado de volta pra "A Contatar" diz ao vendedor
         --  que o trabalho dele foi apagado).
         else 'contato'
       end                                             as new_stage
  from public.crm_sales_leads l
 where l.funnel_type in ('f1','f2','f3','f4','f5','f6','f7','f8','f9');

-- 4) Diário da migração (auditoria + rollback seletivo) ----------------------
insert into public.crm_lead_migracao_funil
  (lead_id, old_funnel, old_stage, new_funnel, new_stage, segmento)
select r.lead_id, r.old_funnel, r.old_stage, 'f13', r.new_stage, l.lead_segment
  from _remap r
  join public.crm_sales_leads l on l.id = r.lead_id;

-- 5) Atividade na timeline de quem MUDOU de etapa ---------------------------
--    Na segunda-feira o vendedor abre o card e vê por que ele se moveu.
insert into public.crm_sales_lead_activities
  (lead_id, activity_type, subject, status, done_at, stage_from, stage_to, created_by_name)
select r.lead_id, 'stage_change',
       'Reorganização das pipelines: ' || r.old_stage || ' → ' || r.new_stage,
       'done', now(), r.old_stage, r.new_stage, 'Sistema'
  from _remap r
 where r.old_stage is distinct from r.new_stage;

-- 6) A virada ---------------------------------------------------------------
update public.crm_sales_leads l
   set funnel_type = 'f13',
       stage       = r.new_stage,
       -- POC vira Qualificado, mas a informação de que teve POC não se perde.
       poc_done    = case when r.old_stage = 'poc' then true else l.poc_done end,
       -- "Reagendar" some como coluna: reaparece como follow-up em 7 dias.
       next_follow_up_at = case
         when r.old_stage = 'reagendar' and l.next_follow_up_at is null
           then now() + interval '7 days'
         else l.next_follow_up_at end,
       -- Contrato/Pedido Inicial passam a contar como venda: carimba a data
       -- (usa updated_at porque o trigger de touch está desligado — o valor
       --  ainda é o real, não o de agora).
       won_at = case
         when r.new_stage = 'convertido' and l.won_at is null then l.updated_at
         else l.won_at end
  from _remap r
 where l.id = r.lead_id;

-- 7) Religa os gatilhos.
alter table public.crm_sales_leads enable trigger user;

commit;

-- ── Conferência (rode depois) ───────────────────────────────────────────────
-- select funnel_type, count(*) from public.crm_sales_leads group by 1 order by 1;
--   → f10, f11, f12 inalterados; f13 com a soma das 9; f1..f9 com zero.
-- select stage, count(*) from public.crm_sales_leads where funnel_type='f13' group by 1;
--   → só: a_contatar, contato, qualificado, visita_agendada, em_negociacao,
--     convertido, sem_interesse. Qualquer outro valor é bug.
-- select count(*) from public.crm_lead_migracao_funil;  → nº de leads movidos.

-- ── ROLLBACK (só se precisar; descomente e rode) ────────────────────────────
-- begin;
-- alter table public.crm_sales_leads disable trigger user;
-- update public.crm_sales_leads l
--    set funnel_type = m.old_funnel, stage = m.old_stage
--   from public.crm_lead_migracao_funil m
--  where l.id = m.lead_id;
-- alter table public.crm_sales_leads enable trigger user;
-- commit;
