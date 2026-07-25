-- ─────────────────────────────────────────────────────────────────────────────
-- App do TI — timeline da demanda no mesmo nível da do Sales (DealDetail):
-- além de comentário, permite TAREFA (com prazo e conclusão) e FIXAR registros
-- importantes no topo.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.carbo_demanda_activities
  add column if not exists due_at timestamptz,
  add column if not exists status text,
  add column if not exists pinned boolean not null default false;

comment on column public.carbo_demanda_activities.due_at is 'Prazo da tarefa (activity_type = task).';
comment on column public.carbo_demanda_activities.status is 'Estado da tarefa: pending | done.';
comment on column public.carbo_demanda_activities.pinned is 'Fixado no topo da timeline.';

-- Passa a aceitar tarefas
alter table public.carbo_demanda_activities drop constraint if exists carbo_demanda_activities_activity_type_check;
alter table public.carbo_demanda_activities
  add constraint carbo_demanda_activities_activity_type_check
  check (activity_type in ('note','task','status_change','assign'));

create index if not exists idx_carbo_demanda_activities_pending
  on public.carbo_demanda_activities (demanda_id, status)
  where activity_type = 'task';
