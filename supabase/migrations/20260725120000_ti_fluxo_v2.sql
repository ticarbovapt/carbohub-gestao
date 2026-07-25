-- ─────────────────────────────────────────────────────────────────────────────
-- App do TI — v2: corrige o fluxo e a base das métricas.
--
--  1) Etapa "Aguardando solicitante" (a espera de terceiro para de acusar o TI)
--  2) stage_since  → tempo REAL em etapa (updated_at era tocado por qualquer edição)
--  3) Intake com impacto: bloqueio + pessoas_afetadas → prioridade CALCULADA
--  4) Arquivar em vez de excluir (chamado não se apaga; a timeline é auditoria)
--  5) status_change vira TRIGGER (registra venha de onde vier, sem duplicar)
--  6) Notificações não repetem em vaivém entre etapas terminais
--  7) Autoria da timeline amarrada ao auth.uid()
--  8) Escrita restrita a quem é do TI (a policy antiga deixava qualquer 'head')
-- ─────────────────────────────────────────────────────────────────────────────

-- 1) Etapa "aguardando" ------------------------------------------------------
alter table public.carbo_bug_reports drop constraint if exists carbo_bug_reports_status_check;
alter table public.carbo_bug_reports
  add constraint carbo_bug_reports_status_check
  check (status in ('open','priorizada','in_progress','aguardando','em_teste','resolved','declined'));

-- 2) Tempo em etapa ----------------------------------------------------------
alter table public.carbo_bug_reports
  add column if not exists stage_since timestamptz not null default now();
comment on column public.carbo_bug_reports.stage_since is
  'Quando entrou na etapa atual. Base do "parada há Xd" e das métricas de fluxo.';

-- Backfill: sem histórico, o melhor palpite é a última alteração conhecida.
update public.carbo_bug_reports set stage_since = coalesce(updated_at, created_at)
where stage_since is null or stage_since = now();

-- 3) Intake com impacto ------------------------------------------------------
alter table public.carbo_bug_reports
  add column if not exists bloqueio         text,
  add column if not exists pessoas_afetadas text,
  add column if not exists archived_at      timestamptz,
  add column if not exists reopen_count     integer not null default 0;

comment on column public.carbo_bug_reports.bloqueio is
  'Resposta do solicitante: travado | contorno | incomoda.';
comment on column public.carbo_bug_reports.pessoas_afetadas is
  'Alcance informado: so_eu | meu_time | todo_mundo.';
comment on column public.carbo_bug_reports.archived_at is
  'Arquivada (some do quadro sem perder o histórico). Substitui o delete.';
comment on column public.carbo_bug_reports.reopen_count is
  'Quantas vezes voltou de um estado terminal — sinal de qualidade da correção.';

alter table public.carbo_bug_reports drop constraint if exists carbo_bug_reports_bloqueio_check;
alter table public.carbo_bug_reports
  add constraint carbo_bug_reports_bloqueio_check
  check (bloqueio is null or bloqueio in ('travado','contorno','incomoda'));

alter table public.carbo_bug_reports drop constraint if exists carbo_bug_reports_afetadas_check;
alter table public.carbo_bug_reports
  add constraint carbo_bug_reports_afetadas_check
  check (pessoas_afetadas is null or pessoas_afetadas in ('so_eu','meu_time','todo_mundo'));

-- Prioridade passa a aceitar NULL = "a triar" (antes, tudo nascia 'media' e a
-- coluna Entrada virava um mar de "Média", sem sinal nenhum pra decidir).
alter table public.carbo_bug_reports alter column priority drop not null;
alter table public.carbo_bug_reports alter column priority drop default;
alter table public.carbo_bug_reports drop constraint if exists carbo_bug_reports_priority_check;
alter table public.carbo_bug_reports
  add constraint carbo_bug_reports_priority_check
  check (priority is null or priority in ('baixa','media','alta','critica'));

-- Urgência × alcance → prioridade sugerida.
create or replace function public.carbo_bug_calc_priority(p_bloqueio text, p_afetadas text)
returns text language sql immutable as $$
  select case
    when p_bloqueio is null then null
    when p_bloqueio = 'travado'  and p_afetadas in ('todo_mundo','meu_time') then 'critica'
    when p_bloqueio = 'travado'  then 'alta'
    when p_bloqueio = 'contorno' and p_afetadas = 'todo_mundo' then 'alta'
    when p_bloqueio = 'contorno' then 'media'
    when p_bloqueio = 'incomoda' and p_afetadas = 'todo_mundo' then 'media'
    else 'baixa'
  end;
$$;

-- Na entrada, se o solicitante informou o impacto e o TI ainda não definiu nada,
-- a prioridade nasce calculada (o TI pode sobrescrever depois, à mão).
create or replace function public.carbo_bug_set_priority()
returns trigger language plpgsql set search_path = public as $$
begin
  if NEW.priority is null then
    NEW.priority := public.carbo_bug_calc_priority(NEW.bloqueio, NEW.pessoas_afetadas);
  end if;
  return NEW;
end $$;

drop trigger if exists trg_carbo_bug_set_priority on public.carbo_bug_reports;
create trigger trg_carbo_bug_set_priority
  before insert on public.carbo_bug_reports
  for each row execute function public.carbo_bug_set_priority();

-- 4/5) Mudança de etapa: carimba stage_since, conta reaberturas e REGISTRA a
-- atividade — venha do quadro, do mural de qualquer app ou de SQL manual.
create or replace function public.carbo_bug_on_status_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_nome text;
begin
  if NEW.status is distinct from OLD.status then
    NEW.stage_since := now();

    if OLD.status in ('resolved','declined') and NEW.status not in ('resolved','declined') then
      NEW.reopen_count := coalesce(OLD.reopen_count, 0) + 1;
    end if;

    select full_name into v_nome from public.profiles where id = auth.uid();

    insert into public.carbo_demanda_activities
      (demanda_id, activity_type, body, status_from, status_to, created_by, created_by_name)
    values (NEW.id, 'status_change', null, OLD.status, NEW.status, auth.uid(), v_nome);
  end if;
  return NEW;
end $$;

drop trigger if exists trg_carbo_bug_on_status_change on public.carbo_bug_reports;
create trigger trg_carbo_bug_on_status_change
  before update on public.carbo_bug_reports
  for each row execute function public.carbo_bug_on_status_change();

-- 6) Notificações e post no chat só na PRIMEIRA vez que fecha ----------------
-- (arrastar entre Concluída e Recusada, ou reabrir e fechar de novo, não
--  deve bombardear quem reportou nem o canal Suporte TI.)
create or replace function public.carbo_bug_notify_reporter()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if NEW.status is distinct from OLD.status
     and NEW.status in ('resolved','declined')
     and OLD.status not in ('resolved','declined')   -- ← só na virada pra terminal
     and NEW.reporter_id is not null
     and NEW.reporter_id is distinct from auth.uid()
  then
    insert into public.notifications (user_id, type, title, body, reference_type, reference_id)
    values (NEW.reporter_id, 'bug_report',
            case when NEW.status = 'resolved' then '✅ Seu report foi resolvido'
                 else '🚫 Seu report foi recusado' end,
            NEW.title || coalesce(' — ' || NEW.admin_notes, ''),
            'carbo_bug_report', NEW.id::text);
  end if;
  return NEW;
end $$;

-- 7) Autoria da timeline amarrada ao usuário logado --------------------------
alter table public.carbo_demanda_activities
  alter column created_by set default auth.uid();

drop policy if exists carbo_demanda_act_insert on public.carbo_demanda_activities;
create policy carbo_demanda_act_insert on public.carbo_demanda_activities
  for insert with check (created_by = auth.uid());

-- 8) Quem pode ESCREVER na demanda ------------------------------------------
-- Antes: crm_is_gestor() — que inclui qualquer funcao='head' (o head de
-- Marketing podia apagar demanda do TI). Agora: TI, command, ou o próprio
-- responsável pela demanda.
create or replace function public.carbo_is_ti()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and ( p.department in ('command','ti_suporte')
         or p.secondary_department in ('command','ti_suporte') )
  );
$$;
grant execute on function public.carbo_is_ti() to authenticated;

drop policy if exists carbo_bug_update on public.carbo_bug_reports;
create policy carbo_bug_update on public.carbo_bug_reports
  for update using (public.carbo_is_ti() or assignee_id = auth.uid())
  with check (public.carbo_is_ti() or assignee_id = auth.uid());

-- Excluir deixa de existir na prática: só command/TI, e a UI usa arquivar.
drop policy if exists carbo_bug_delete on public.carbo_bug_reports;
create policy carbo_bug_delete on public.carbo_bug_reports
  for delete using (public.carbo_is_ti());

create index if not exists idx_carbo_bug_reports_ativas
  on public.carbo_bug_reports (status, stage_since desc)
  where archived_at is null;

-- 9) Contadores da timeline agregados no banco (a tela puxava a tabela toda) --
create or replace function public.carbo_demanda_counts()
returns table (demanda_id uuid, notes bigint, tasks_pendentes bigint)
language sql stable security definer set search_path = public as $$
  select a.demanda_id,
         count(*) filter (where a.activity_type = 'note') as notes,
         count(*) filter (where a.activity_type = 'task'
                            and a.status is distinct from 'done') as tasks_pendentes
  from public.carbo_demanda_activities a
  group by a.demanda_id;
$$;
grant execute on function public.carbo_demanda_counts() to authenticated;
