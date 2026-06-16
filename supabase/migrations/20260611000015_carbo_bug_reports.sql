-- ─────────────────────────────────────────────────────────────────────────────
-- Sistema de REPORT DE BUGS do novo ecossistema (Sales/Admin/Ops/Lojas).
-- Tabela PRÓPRIA — NÃO é a bug_reports do Controle (que será desativado).
-- Mesma lógica do Controle: a pessoa reporta assunto + descrição e o sistema
-- registra automaticamente a tela (url/rota) e quem reportou. Coluna `app`
-- identifica de qual sistema veio o report.
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.carbo_bug_reports (
  id              uuid primary key default gen_random_uuid(),
  app             text not null default 'sales',   -- sales | admin | ops | lojas | ...
  title           text not null,
  description     text not null,
  url             text,                            -- tela/rota onde a pessoa estava
  reporter_id     uuid,                            -- auth.users(id) (sem FK p/ isolamento)
  reporter_name   text,
  reporter_email  text,
  department      text,
  status          text not null default 'open' check (status in ('open','resolved')),
  admin_notes     text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists idx_carbo_bug_reports_status
  on public.carbo_bug_reports (status, created_at desc);

drop trigger if exists trg_carbo_bug_reports_touch on public.carbo_bug_reports;
create trigger trg_carbo_bug_reports_touch
  before update on public.carbo_bug_reports
  for each row execute function public.crm_vendas_touch();

alter table public.carbo_bug_reports enable row level security;

-- INSERT: qualquer autenticado reporta (botão em todos os apps)
drop policy if exists carbo_bug_insert on public.carbo_bug_reports;
create policy carbo_bug_insert on public.carbo_bug_reports
  for insert with check (auth.uid() is not null);

-- SELECT: o próprio reporter vê os seus; gestor (head/command/ti_suporte) vê todos
drop policy if exists carbo_bug_select on public.carbo_bug_reports;
create policy carbo_bug_select on public.carbo_bug_reports
  for select using (reporter_id = auth.uid() or public.crm_is_gestor());

-- UPDATE / DELETE: só gestor (marcar resolvido, notas, apagar)
drop policy if exists carbo_bug_update on public.carbo_bug_reports;
create policy carbo_bug_update on public.carbo_bug_reports
  for update using (public.crm_is_gestor()) with check (public.crm_is_gestor());

drop policy if exists carbo_bug_delete on public.carbo_bug_reports;
create policy carbo_bug_delete on public.carbo_bug_reports
  for delete using (public.crm_is_gestor());
