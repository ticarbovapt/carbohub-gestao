-- ─────────────────────────────────────────────────────────────────────────────
-- Reporte de Bugs E Sugestões (mural compartilhado nos 3 apps) + notificações.
--   • kind: 'bug' | 'sugestao'
--   • status: 'open' | 'resolved' | 'declined'  (recusado = sugestão descartada / bug wontfix)
--   • Mural público: qualquer autenticado VÊ todos os reports (abertos e resolvidos).
--   • Notificações (sininho):
--       - novo report  → avisa os gestores (head/command/TI)
--       - resolvido/recusado → avisa quem reportou
-- ─────────────────────────────────────────────────────────────────────────────

-- 1) Coluna kind (bug | sugestao)
alter table public.carbo_bug_reports
  add column if not exists kind text not null default 'bug';
alter table public.carbo_bug_reports drop constraint if exists carbo_bug_reports_kind_check;
alter table public.carbo_bug_reports
  add constraint carbo_bug_reports_kind_check check (kind in ('bug','sugestao'));

-- 2) Status passa a aceitar 'declined'
alter table public.carbo_bug_reports drop constraint if exists carbo_bug_reports_status_check;
alter table public.carbo_bug_reports
  add constraint carbo_bug_reports_status_check check (status in ('open','resolved','declined'));

-- 3) Leitura pública do mural — qualquer autenticado vê todos
drop policy if exists carbo_bug_select on public.carbo_bug_reports;
create policy carbo_bug_select on public.carbo_bug_reports
  for select using (auth.uid() is not null);

-- 4) Notifica os gestores quando chega um novo report
create or replace function public.carbo_bug_notify_gestores()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.carbo_notifications (user_id, type, title, body, reference_type, reference_id)
  select p.id,
         'bug_report',
         case when NEW.kind = 'sugestao' then '💡 Nova sugestão' else '🐞 Novo bug reportado' end,
         coalesce(NEW.reporter_name, 'Alguém') || ' · ' || NEW.title,
         'carbo_bug_report',
         NEW.id::text
  from public.profiles p
  where (p.department in ('command','ti_suporte')
      or p.secondary_department in ('command','ti_suporte')
      or p.funcao in ('head','ceo','command')
      or p.secondary_funcao in ('head','ceo','command'))
    and p.id is distinct from NEW.reporter_id;   -- não notifica quem reportou
  return NEW;
end $$;

drop trigger if exists trg_carbo_bug_notify_gestores on public.carbo_bug_reports;
create trigger trg_carbo_bug_notify_gestores
  after insert on public.carbo_bug_reports
  for each row execute function public.carbo_bug_notify_gestores();

-- 5) Notifica quem reportou quando vira resolvido / recusado
create or replace function public.carbo_bug_notify_reporter()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if NEW.status is distinct from OLD.status
     and NEW.status in ('resolved','declined')
     and NEW.reporter_id is not null then
    insert into public.carbo_notifications (user_id, type, title, body, reference_type, reference_id)
    values (
      NEW.reporter_id,
      'bug_update',
      case
        when NEW.status = 'resolved' and NEW.kind = 'sugestao' then '✅ Sugestão implementada'
        when NEW.status = 'resolved'                           then '✅ Bug resolvido'
        when NEW.kind = 'sugestao'                             then '🛈 Sugestão avaliada'
        else '🛈 Report avaliado'
      end,
      NEW.title || coalesce(' — ' || NEW.admin_notes, ''),
      'carbo_bug_report',
      NEW.id::text
    );
  end if;
  return NEW;
end $$;

drop trigger if exists trg_carbo_bug_notify_reporter on public.carbo_bug_reports;
create trigger trg_carbo_bug_notify_reporter
  after update on public.carbo_bug_reports
  for each row execute function public.carbo_bug_notify_reporter();
