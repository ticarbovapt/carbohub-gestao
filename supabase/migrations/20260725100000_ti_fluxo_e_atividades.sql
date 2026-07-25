-- ─────────────────────────────────────────────────────────────────────────────
-- App do TI — fase 2: fluxo de 6 etapas, timeline de anotações e notificação
-- de responsável.
--
-- ⚠️ SEM MIGRAÇÃO DE DADOS: os 4 status atuais continuam valendo e ganham o
-- significado da etapa do fluxo; só entram 2 status novos. Assim nada quebra
-- (inclusive os triggers que avisam o reporter em resolved/declined).
--
--   open        → Entrada (triagem)
--   priorizada  → Priorizada            (NOVO)
--   in_progress → Em andamento
--   em_teste    → Em teste / validação  (NOVO)
--   resolved    → Concluída
--   declined    → Recusada
-- ─────────────────────────────────────────────────────────────────────────────

-- 1) Fluxo de 6 etapas -------------------------------------------------------
alter table public.carbo_bug_reports drop constraint if exists carbo_bug_reports_status_check;
alter table public.carbo_bug_reports
  add constraint carbo_bug_reports_status_check
  check (status in ('open','priorizada','in_progress','em_teste','resolved','declined'));

-- 2) Timeline da demanda (anotações, andamento, troca de etapa) ---------------
-- Espelha o padrão do CRM (crm_sales_lead_activities): tudo numa tabela só.
create table if not exists public.carbo_demanda_activities (
  id              uuid primary key default gen_random_uuid(),
  demanda_id      uuid not null references public.carbo_bug_reports(id) on delete cascade,
  activity_type   text not null default 'note'
                  check (activity_type in ('note','status_change','assign')),
  body            text,
  status_from     text,
  status_to       text,
  created_by      uuid,
  created_by_name text,
  created_at      timestamptz not null default now()
);
create index if not exists idx_carbo_demanda_activities_demanda
  on public.carbo_demanda_activities (demanda_id, created_at desc);

alter table public.carbo_demanda_activities enable row level security;

-- Leitura: qualquer autenticado (mesmo critério do mural de demandas).
drop policy if exists carbo_demanda_act_select on public.carbo_demanda_activities;
create policy carbo_demanda_act_select on public.carbo_demanda_activities
  for select using (auth.uid() is not null);

-- Escrita: qualquer autenticado registra (o autor fica gravado em created_by).
drop policy if exists carbo_demanda_act_insert on public.carbo_demanda_activities;
create policy carbo_demanda_act_insert on public.carbo_demanda_activities
  for insert with check (auth.uid() is not null);

-- Editar/apagar: só o próprio autor ou gestor.
drop policy if exists carbo_demanda_act_update on public.carbo_demanda_activities;
create policy carbo_demanda_act_update on public.carbo_demanda_activities
  for update using (created_by = auth.uid() or public.crm_is_gestor());

drop policy if exists carbo_demanda_act_delete on public.carbo_demanda_activities;
create policy carbo_demanda_act_delete on public.carbo_demanda_activities
  for delete using (created_by = auth.uid() or public.crm_is_gestor());

-- 3) Notifica quem assumiu / foi atribuído -----------------------------------
-- Usa a tabela COMPARTILHADA public.notifications (a que o sininho lê hoje),
-- mesma convenção de reference_type/reference_id dos avisos de bug.
create or replace function public.carbo_bug_notify_assignee()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if NEW.assignee_id is distinct from OLD.assignee_id
     and NEW.assignee_id is not null
     and NEW.assignee_id is distinct from auth.uid()   -- quem assume pra si não se notifica
  then
    insert into public.notifications (user_id, type, title, body, reference_type, reference_id)
    values (NEW.assignee_id, 'bug_assigned', '👤 Demanda atribuída a você',
            NEW.title, 'carbo_bug_report', NEW.id::text);
  end if;
  return NEW;
end $$;

drop trigger if exists trg_carbo_bug_notify_assignee on public.carbo_bug_reports;
create trigger trg_carbo_bug_notify_assignee
  after update on public.carbo_bug_reports
  for each row execute function public.carbo_bug_notify_assignee();
