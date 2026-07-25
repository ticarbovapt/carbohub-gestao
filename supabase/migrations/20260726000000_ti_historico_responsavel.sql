-- ─────────────────────────────────────────────────────────────────────────────
-- Histórico de RESPONSÁVEL — pré-requisito do ranking do TI.
--
-- Problema: "quem pega mais demanda" não era rastreável. O botão "Assumir"
-- (useAssumirDemanda) não gravava atividade nenhuma, e o dropdown de atribuir
-- gravava só texto livre ("Responsável: Fulano"), sem o id de quem recebeu.
-- Resultado: assignee_id era um ponteiro mutável sem histórico — reatribuiu,
-- perdeu.
--
-- Solução: trigger no banco (mesmo padrão do carbo_bug_on_status_change), que
-- registra TODA troca de responsável venha de onde vier — botão, dropdown,
-- mural de outro app ou SQL manual — com o id em coluna própria.
-- ─────────────────────────────────────────────────────────────────────────────

-- Coluna estruturada (antes o "quem" só existia dentro do texto de `body`).
alter table public.carbo_demanda_activities
  add column if not exists assignee_id uuid;

comment on column public.carbo_demanda_activities.assignee_id is
  'Em atividades assign: quem PASSOU A SER o responsável (null = ficou sem dono).';

create index if not exists idx_carbo_demanda_act_assign
  on public.carbo_demanda_activities (assignee_id, created_at desc)
  where activity_type = 'assign';

-- O cliente já não grava status_change (virou trigger); agora também não
-- precisa gravar assign. Este trigger cobre todos os caminhos.
create or replace function public.carbo_bug_on_assignee_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_ator  text;
  v_novo  text;
begin
  if NEW.assignee_id is distinct from OLD.assignee_id then
    select full_name into v_ator from public.profiles where id = auth.uid();
    select full_name into v_novo from public.profiles where id = NEW.assignee_id;

    insert into public.carbo_demanda_activities
      (demanda_id, activity_type, body, assignee_id, created_by, created_by_name)
    values (
      NEW.id, 'assign',
      case
        when NEW.assignee_id is null then 'Responsável removido'
        when NEW.assignee_id = auth.uid() then 'Assumiu a demanda'
        else 'Responsável: ' || coalesce(v_novo, '—')
      end,
      NEW.assignee_id, auth.uid(), v_ator
    );
  end if;
  return NEW;
end $$;

drop trigger if exists trg_carbo_bug_on_assignee_change on public.carbo_bug_reports;
create trigger trg_carbo_bug_on_assignee_change
  before update on public.carbo_bug_reports
  for each row execute function public.carbo_bug_on_assignee_change();
