-- ─────────────────────────────────────────────────────────────────────────────
-- App do TI (ti.carbohub.com.br): concentra e organiza a EXECUÇÃO das demandas
-- que chegam (bugs + sugestões) na tabela existente carbo_bug_reports.
--
-- Acrescenta os campos que faltavam pra "organizar a execução":
--   • assignee_id / assignee_name → quem está resolvendo
--   • priority                    → baixa | media | alta | critica
--   • status ganha 'in_progress'  → em andamento (entre aberto e resolvido)
--
-- Não altera nada do fluxo atual (report/mural/notificações continuam iguais).
-- Acesso ao app é pela interface 'carbo_ti' (profiles.allowed_interfaces), no
-- mesmo padrão do carbo_admin — liberada pelo Admin.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.carbo_bug_reports
  add column if not exists assignee_id   uuid,
  add column if not exists assignee_name text,
  add column if not exists priority      text not null default 'media';

comment on column public.carbo_bug_reports.assignee_id   is 'Responsável pela resolução (auth.users id), definido no app do TI.';
comment on column public.carbo_bug_reports.priority      is 'Prioridade da demanda: baixa | media | alta | critica.';

-- Prioridade válida
alter table public.carbo_bug_reports drop constraint if exists carbo_bug_reports_priority_check;
alter table public.carbo_bug_reports
  add constraint carbo_bug_reports_priority_check check (priority in ('baixa','media','alta','critica'));

-- Status passa a aceitar 'in_progress' (em andamento)
alter table public.carbo_bug_reports drop constraint if exists carbo_bug_reports_status_check;
alter table public.carbo_bug_reports
  add constraint carbo_bug_reports_status_check check (status in ('open','in_progress','resolved','declined'));

create index if not exists idx_carbo_bug_reports_assignee
  on public.carbo_bug_reports (assignee_id, status);
