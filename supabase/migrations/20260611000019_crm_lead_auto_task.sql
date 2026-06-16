-- ─────────────────────────────────────────────────────────────────────────────
-- Automação do funil de Vendas: ao MOVER o lead de etapa, o sistema cria
-- automaticamente a TAREFA do próximo passo (estilo "robot" do Bitrix).
-- A tarefa cai na timeline do lead (crm_sales_lead_activities) com prazo.
-- Não dispara em criação (só em mudança de etapa) e ignora ganho/perdido.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.crm_sales_lead_auto_task()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_subject text;
  v_days    int;
begin
  if new.stage is not distinct from old.stage then
    return new;
  end if;

  v_subject := case new.stage
    when 'novo'        then 'Fazer primeiro contato'
    when 'contato'     then 'Qualificar o lead'
    when 'qualificado' then 'Enviar proposta'
    when 'proposta'    then 'Follow-up da proposta'
    when 'negociacao'  then 'Avançar a negociação / fechar'
    else null end;
  v_days := case new.stage when 'novo' then 1 when 'proposta' then 3 when 'negociacao' then 3 else 2 end;

  if v_subject is not null then
    insert into public.crm_sales_lead_activities
      (lead_id, activity_type, subject, status, due_at, created_by, created_by_name, meta)
    values
      (new.id, 'task', v_subject, 'pending', now() + (v_days || ' days')::interval,
       auth.uid(), 'Automação', jsonb_build_object('auto', true, 'stage', new.stage));
  end if;

  return new;
end;
$$;

drop trigger if exists crm_sales_lead_auto_task_trg on public.crm_sales_leads;
create trigger crm_sales_lead_auto_task_trg
  after update of stage on public.crm_sales_leads
  for each row execute function public.crm_sales_lead_auto_task();
