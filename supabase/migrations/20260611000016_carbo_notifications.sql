-- ─────────────────────────────────────────────────────────────────────────────
-- Notificações PRÓPRIAS do novo ecossistema (sininho) — isoladas do Controle.
-- O Sales lia a tabela `notifications` do Controle. Aqui criamos `carbo_notifications`
-- com a MESMA estrutura (LIKE ... INCLUDING ALL). Cada usuário vê só as suas.
-- Começa vazia — a geração de notificações no novo ecossistema entra depois
-- (ex.: novo bug avisa o TI), via funções SECURITY DEFINER.
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.carbo_notifications
  (like public.notifications including all);

alter table public.carbo_notifications enable row level security;

-- Cada um vê / marca como lida / apaga as PRÓPRIAS notificações.
drop policy if exists carbo_notif_select on public.carbo_notifications;
create policy carbo_notif_select on public.carbo_notifications
  for select using (user_id = auth.uid());

drop policy if exists carbo_notif_update on public.carbo_notifications;
create policy carbo_notif_update on public.carbo_notifications
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists carbo_notif_delete on public.carbo_notifications;
create policy carbo_notif_delete on public.carbo_notifications
  for delete using (user_id = auth.uid());

-- INSERT fica para funções SECURITY DEFINER (geradores de notificação) — sem
-- policy de insert para os papéis normais.
